// Run creation — `POST /projects/:id/runs` (§12.4 step 2; REQ-SPEC-16; REQ-BILL-6; AC5/AC6).
//
// Estimation is stateless (PRB.3) and creates no row; a `runs` row is created ONLY here, on the sheet's Run
// click, with a client-minted idempotency key. This module:
//   • validates the model profile against the §12.3 capability table (REQ-ARCH-9) — rejected at creation;
//   • enforces the 24-h `(billing_account, key) → run_id` idempotency memo (duplicate POST → one row, AC5);
//   • freezes the input snapshot (estimate, cap, rigor, model profile, phase set, rate_table_version, counts —
//     the REQ-BILL-6 row shape) immutably on the run;
//   • places the hold(cap) via the injected HoldLedger (P0.11 owns the real ledger) — never a ledger write here;
//   • sends a sheet-launched run to `queued` (hold placed), a sheet-less run to `awaiting_consent` (confirm_cost).

import type { WorkflowKey, ModelTier, Rigor } from "@rhema/contracts";
import type { Clock } from "./clock.js";
import type { IdFactory } from "./ids.js";
import type { EventWriter } from "./event-writer.js";
import type { HoldLedger } from "./ledger.js";
import { InsufficientBalanceError, AccountSuspendedError } from "./ledger.js";
import type { SqlClient, TxRunner } from "./tx.js";
import { applyTransition } from "./transition.js";
import { validateModelProfile, ModelProfileRejectedError, type ModelProfile, type PhaseClass } from "./capabilities.js";
import { computeLockSet, type LockSetSpec } from "./locks.js";
import { openGate } from "./internal-api.js";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24-h memo (§5.6; review 13 F34)

export interface CreateRunInput {
  readonly idempotencyKey: string;
  readonly workflow: WorkflowKey;
  readonly workspaceId: string;
  readonly billingAccountId: string;
  readonly requestedBy?: string;
  readonly projectId?: string;
  readonly personaId?: string;
  readonly agentInstanceId?: string;
  readonly seat: string;
  readonly modelProfile: ModelProfile;
  readonly modelTier: ModelTier;
  readonly rigor: Rigor;
  readonly estimateCredits: number;
  /** cap = ceil(1.5 × estimate); enforced at the proxy. */
  readonly capCredits: number;
  readonly rateTableVersion: number;
  /** the phase classes this run will execute (from the manifest × enabled phases) — validated (REQ-ARCH-9). */
  readonly phaseClassesUsed: readonly PhaseClass[];
  /** the frozen run inputs (draftId, phases, protocol, sources, sidecar, …). */
  readonly inputs: Record<string, unknown>;
  /** the frozen snapshot (draftSha256, wordCount, claimCount, …) — REQ-BILL-6. */
  readonly inputSnapshot: Record<string, unknown>;
  /** true = the sheet was in front of the user (consent given client-side) → queued; false → awaiting_consent. */
  readonly sheetLaunched: boolean;
  readonly entitlementId?: string;
  readonly imageDigest?: string;
  readonly protocolsVersion?: string;
  /** how to compute the run's lock set (writer/reader/persona). */
  readonly lockSetSpec: Omit<LockSetSpec, "workflow" | "seat">;
}

export interface CreateRunDeps {
  readonly txRunner: TxRunner;
  readonly eventWriter: EventWriter;
  readonly clock: Clock;
  readonly ids: IdFactory;
  readonly ledger: HoldLedger;
}

export type CreateRunResult =
  | { readonly ok: true; readonly runId: string; readonly state: "queued" | "awaiting_consent"; readonly deduped: boolean }
  | { readonly ok: false; readonly reason: "insufficient_balance"; readonly required: number }
  | { readonly ok: false; readonly reason: "account_suspended" }
  | { readonly ok: false; readonly reason: "model_profile_rejected"; readonly error: ModelProfileRejectedError };

/**
 * Create a run (or return the existing run for a duplicate idempotency key). Validates the model profile,
 * freezes the snapshot, places the hold, and lands the run in `queued` (sheet) or `awaiting_consent` (sheet-less).
 */
export async function createRun(deps: CreateRunDeps, input: CreateRunInput): Promise<CreateRunResult> {
  // Capability validation happens before any row is written (REQ-ARCH-9; AC6).
  const validation = validateModelProfile(input.modelProfile, input.phaseClassesUsed);
  if (!validation.ok) {
    return { ok: false, reason: "model_profile_rejected", error: new ModelProfileRejectedError(validation.rejections) };
  }

  return deps.txRunner.run<CreateRunResult>(input.workspaceId, async (tx): Promise<CreateRunResult> => {
    const now = deps.clock.now();
    const runId = deps.ids("run");
    const lockSet = computeLockSet({ workflow: input.workflow, seat: input.seat, ...input.lockSetSpec });

    // Insert the frozen run row in `created`; transitions below pair state with events.
    await tx.query(
      `insert into runs(
         id, workspace_id, project_id, persona_id, workflow, agent_instance_id, state, state_since,
         current_attempt, inputs, input_snapshot, model_profile, model_tier, rigor,
         estimate_credits, cap_credits, spent_credits, rate_table_version, entitlement_id,
         lock_set, requested_by, image_digest, protocols_version, created_at)
       values ($1,$2,$3,$4,$5,$6,'created',$7,1,$8,$9,$10,$11,$12,$13,$14,0,$15,$16,$17,$18,$19,$20,$7)`,
      [
        runId,
        input.workspaceId,
        input.projectId ?? null,
        input.personaId ?? null,
        input.workflow,
        input.agentInstanceId ?? null,
        now,
        JSON.stringify({ ...input.inputs, modelProfile: input.modelProfile }),
        JSON.stringify(input.inputSnapshot),
        JSON.stringify(input.modelProfile),
        input.modelTier,
        input.rigor,
        input.estimateCredits,
        input.capCredits,
        input.rateTableVersion,
        input.entitlementId ?? null,
        lockSet,
        input.requestedBy ?? null,
        input.imageDigest ?? null,
        input.protocolsVersion ?? null,
      ],
    );

    // Claim the idempotency memo. The unique PK is the race guard: if a memo for this key already exists
    // (concurrent or prior duplicate), we lose — roll our transient run insert back and return the winner's
    // run (AC5 — one row). A stale (≥24 h) memo is reclaimed. Winning inserts/updates the memo to our run.
    const won = await claimMemo(tx, input.billingAccountId, input.idempotencyKey, runId, now);
    if (!won) {
      const existing = (await findFreshMemo(tx, input.billingAccountId, input.idempotencyKey, now))!;
      const state = (await runStateOf(tx, existing)) as "queued" | "awaiting_consent";
      throw new CreationRollback({ ok: true, runId: existing, state, deduped: true });
    }

    if (input.sheetLaunched) {
      // Place the hold(cap) before queuing (§12.4 step 2). Insufficient balance never bills — surface options.
      try {
        const hold = await deps.ledger.hold(tx, {
          billingAccountId: input.billingAccountId,
          workspaceId: input.workspaceId,
          runId,
          credits: input.capCredits,
          idempotencyKey: `hold:${runId}`,
          entitlementId: input.entitlementId,
        });
        await tx.query("update runs set hold_ledger_id = $2, hold_bucket = $3 where id = $1", [
          runId,
          hold.ledgerId,
          hold.bucket,
        ]);
      } catch (e) {
        if (e instanceof InsufficientBalanceError) {
          // roll the whole creation back — no run row, no memo, never billed.
          throw new CreationRollback({ ok: false, reason: "insufficient_balance", required: e.required });
        }
        if (e instanceof AccountSuspendedError) {
          // REQ-SPEC-24.7: a chargeback-suspended account takes no new holds — the run is never created
          // (rolled back like an insufficient balance); the api surfaces 403 account_suspended.
          throw new CreationRollback({ ok: false, reason: "account_suspended" });
        }
        throw e;
      }
      await applyTransition(tx, deps, { runId, from: "created", to: "queued" });
      return { ok: true, runId, state: "queued", deduped: false };
    }

    // Sheet-less run: land in awaiting_consent behind a confirm_cost gate (hold placed at confirm).
    await applyTransition(tx, deps, { runId, from: "created", to: "awaiting_consent" });
    await openGate(tx, deps, {
      runId,
      kind: "confirm_cost",
      blocking: true,
      onExpiry: "cancel",
      // confirm_cost expires in 7 days → cancel (§6.4); deadline computed here, expiry job owned by P0.10.
      deadlineAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    });
    return { ok: true, runId, state: "awaiting_consent", deduped: false };
  }).catch((e: unknown) => {
    if (e instanceof CreationRollback) return e.result;
    throw e;
  });
}

/** Thrown to roll back the creation transaction while still returning a typed result (dedup / insufficient). */
class CreationRollback extends Error {
  constructor(readonly result: CreateRunResult) {
    super("creation rolled back");
    this.name = "CreationRollback";
  }
}

/**
 * Claim the memo for this key → this run. Returns true when we won (inserted, or reclaimed a stale memo),
 * false when a fresh memo already holds another run. The unique PK makes concurrent claims mutually exclusive.
 */
async function claimMemo(
  tx: SqlClient,
  billingAccountId: string,
  key: string,
  runId: string,
  now: Date,
): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - IDEMPOTENCY_TTL_MS);
  const res = await tx.query(
    `insert into run_idempotency(billing_account_id, idempotency_key, run_id, created_at)
       values ($1,$2,$3,$4)
     on conflict (billing_account_id, idempotency_key)
       do update set run_id = excluded.run_id, created_at = excluded.created_at
       where run_idempotency.created_at < $5
     returning run_id`,
    [billingAccountId, key, runId, now, staleBefore],
  );
  // a row is returned iff we inserted (no conflict) or reclaimed a stale memo (the WHERE matched).
  return res.rows.length > 0;
}

async function findFreshMemo(
  tx: SqlClient,
  billingAccountId: string,
  key: string,
  now: Date,
): Promise<string | null> {
  const res = await tx.query(
    "select run_id, created_at from run_idempotency where billing_account_id = $1 and idempotency_key = $2",
    [billingAccountId, key],
  );
  const row = res.rows[0] as { run_id: string; created_at: string | Date } | undefined;
  if (!row) return null;
  const age = now.getTime() - new Date(row.created_at).getTime();
  return age <= IDEMPOTENCY_TTL_MS ? row.run_id : null; // a stale memo is treated as absent (a new run may be created)
}

async function runStateOf(tx: SqlClient, runId: string): Promise<string> {
  const res = await tx.query("select state from runs where id = $1", [runId]);
  return (res.rows[0] as { state: string }).state;
}

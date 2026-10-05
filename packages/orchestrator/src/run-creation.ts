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
import { NON_TERMINAL_RUN_STATES } from "./state-machine.js";
import { validateModelProfile, ModelProfileRejectedError, type ModelProfile, type PhaseClass } from "./capabilities.js";
import { computeLockSet, firstConflict, type LockSetSpec } from "./locks.js";
import { openGate } from "./internal-api.js";
import { scheduleGateNotifications } from "./notifications.js";
import type { Queue } from "./queue.js";

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
  /**
   * P1.06 (§7.2; REQ-CHAT-23; ledger G22) — the run's scope as the canonical parsed ref list
   * (`[{kind:"section", ref:"III"}]` — @rhema/commands ScopeRef shape; the api parses the wire string,
   * this module stays grammar-free). Persisted verbatim to `runs.scope` jsonb + `input_snapshot.scope`.
   */
  readonly scope?: readonly unknown[];
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
  // PRB.21 / D-PRB.20-1 — the beta concurrency ruling: at most ONE non-terminal run per project; a
  // second create 409s carrying the active run's id (the sheet re-renders its in-progress state).
  | { readonly ok: false; readonly reason: "run_in_progress"; readonly activeRunId: string }
  // P1.16 (§14.3): a trial-entitlement refusal (locked/consumed/revoked/killed/daily-ceiling).
  | { readonly ok: false; readonly reason: "entitlement_unavailable"; readonly detail?: string }
  | { readonly ok: false; readonly reason: "model_profile_rejected"; readonly error: ModelProfileRejectedError };

/**
 * Create a run (or return the existing run for a duplicate idempotency key). Validates the model profile,
 * freezes the snapshot, places the hold, and lands the run in `queued` (sheet) or `awaiting_consent` (sheet-less).
 */
export async function createRun(
  deps: CreateRunDeps & { queue?: Queue },
  input: CreateRunInput,
): Promise<CreateRunResult> {
  // Capability validation happens before any row is written (REQ-ARCH-9; AC6).
  const validation = validateModelProfile(input.modelProfile, input.phaseClassesUsed);
  if (!validation.ok) {
    return { ok: false, reason: "model_profile_rejected", error: new ModelProfileRejectedError(validation.rejections) };
  }

  // PRB.09 — the consent gate's spend notification is scheduled post-commit (queue sends aren't transactional).
  const box: { consentGate: { gateId: string; deadlineAt: Date } | null } = { consentGate: null };

  const result = await deps.txRunner.run<CreateRunResult>(input.workspaceId, async (tx): Promise<CreateRunResult> => {
    const now = deps.clock.now();
    const runId = deps.ids("run");
    const lockSet = computeLockSet({ workflow: input.workflow, seat: input.seat, ...input.lockSetSpec });

    // P1.06 — the concurrency ruling (the PRB.21 guard relaxed, per the ticket's recorded ruling):
    // the guard moves from per-PROJECT to per-WRITE-LOCK. The `for update` on the projects row still
    // serializes same-project creates (check-then-insert cannot race under READ COMMITTED). A new run
    // conflicts iff its computed lock set shares an EXCLUSIVE key with a non-terminal run's frozen
    // lock_set — `draft:read:*` keys are shared, so readers (review, fact-check, research) run
    // concurrently including scoped ones (the scope key discriminates their corr locks); writers still
    // exclude one another on `ns:write`/`draft:write` (§6.3 "never two writers of one draft", §12.4).
    // A project-less run skips the guard entirely.
    if (input.projectId) {
      await tx.query("select id from projects where id = $1 for update", [input.projectId]);
      // A retry of THIS submission dedupes to its live run — the memo check precedes the guard so an
      // idempotent replay of an in-flight run returns it (200) instead of 409ing.
      const memoRun = await findFreshMemo(tx, input.billingAccountId, input.idempotencyKey, now);
      if (memoRun) {
        const state = (await runStateOf(tx, memoRun)) as "queued" | "awaiting_consent";
        throw new CreationRollback({ ok: true, runId: memoRun, state, deduped: true });
      }
      const active = await tx.query(
        `select id, lock_set from runs where project_id = $1 and state = any($2::text[])
           order by created_at`,
        [input.projectId, [...NON_TERMINAL_RUN_STATES]],
      );
      for (const row of active.rows as { id: string; lock_set: string[] | null }[]) {
        const held = row.lock_set ?? [];
        const hit = firstConflict(lockSet, held);
        if (hit != null) {
          // roll the whole creation back — no run row, no memo, and never a second hold.
          throw new CreationRollback({ ok: false, reason: "run_in_progress", activeRunId: row.id });
        }
      }
    }

    // P1.06 — promote-on-launch (§5.6 item 7): a run whose read set names a WORKING head promotes it —
    // freeze to its promoted version atomically with the run row (the sheet's "will be promoted to vN"
    // line made the promise; freeze is one-way and guarded on state='working' so it is idempotent).
    // A head never promoted (promoted_version_id NULL — nothing saved yet) cannot freeze; the run then
    // reads whatever the draft's current version pointer is, unchanged from before.
    if (input.lockSetSpec.draftId) {
      const head = (
        await tx.query(`select state, promoted_version_id from drafts where id = $1 for update`, [
          input.lockSetSpec.draftId,
        ])
      ).rows[0] as { state: string; promoted_version_id: string | null } | undefined;
      if (head?.state === "working" && head.promoted_version_id != null) {
        await tx.query(`update drafts set state = 'frozen', frozen_at = $2, frozen_by = $3 where id = $1`, [
          input.lockSetSpec.draftId,
          now,
          JSON.stringify({ cause: "run_read", runId }),
        ]);
      }
    }

    // Insert the frozen run row in `created`; transitions below pair state with events. `scope` (P1.06)
    // is the parsed §7.2 scope ref list — first-class on the row (§11.4 `runs.scope`) and frozen into
    // `inputs`/`input_snapshot` so the dossier keying and the audit trail carry it (REQ-CHAT-23).
    const scopeJson = input.scope && input.scope.length > 0 ? JSON.stringify(input.scope) : null;
    await tx.query(
      `insert into runs(
         id, workspace_id, project_id, persona_id, workflow, agent_instance_id, state, state_since,
         current_attempt, inputs, input_snapshot, model_profile, model_tier, rigor,
         estimate_credits, cap_credits, spent_credits, rate_table_version, entitlement_id,
         lock_set, requested_by, image_digest, protocols_version, scope, created_at)
       values ($1,$2,$3,$4,$5,$6,'created',$7,1,$8,$9,$10,$11,$12,$13,$14,0,$15,$16,$17,$18,$19,$20,$21,$7)`,
      [
        runId,
        input.workspaceId,
        input.projectId ?? null,
        input.personaId ?? null,
        input.workflow,
        input.agentInstanceId ?? null,
        now,
        JSON.stringify({ ...input.inputs, ...(input.scope?.length ? { scope: input.scope } : {}), modelProfile: input.modelProfile }),
        JSON.stringify({ ...input.inputSnapshot, ...(input.scope?.length ? { scope: input.scope } : {}) }),
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
        scopeJson,
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
        // P1.16 (§14.3): a trial-entitlement refusal — consumed/locked entitlement, the kill switch, or
        // the global daily trial-spend ceiling — must never let the run proceed free (REQ-SPEC-24.2).
        // Matched by name: the ledger's error classes live downstream of this package.
        if (
          e instanceof Error &&
          (e.name === "EntitlementUnavailableError" ||
            e.name === "TrialKilledError" ||
            e.name === "TrialCeilingExhaustedError")
        ) {
          throw new CreationRollback({ ok: false, reason: "entitlement_unavailable", detail: e.name });
        }
        throw e;
      }
      await applyTransition(tx, deps, { runId, from: "created", to: "queued" });
      return { ok: true, runId, state: "queued", deduped: false };
    }

    // Sheet-less run: land in awaiting_consent behind a confirm_cost gate (hold placed at confirm).
    await applyTransition(tx, deps, { runId, from: "created", to: "awaiting_consent" });
    const deadlineAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const gateId = await openGate(tx, deps, {
      runId,
      kind: "confirm_cost",
      blocking: true,
      onExpiry: "cancel",
      // confirm_cost expires in 7 days → cancel (§6.4); deadline computed here, expiry job owned by P0.10.
      deadlineAt,
    });
    box.consentGate = { gateId, deadlineAt };
    return { ok: true, runId, state: "awaiting_consent", deduped: false };
  }).catch((e: unknown) => {
    if (e instanceof CreationRollback) return e.result;
    throw e;
  });

  // PRB.09 — the confirm_cost spend notice + expiry reminders go out after the commit lands.
  if (result.ok && box.consentGate && deps.queue) {
    await scheduleGateNotifications(deps as CreateRunDeps & { queue: Queue }, {
      gateId: box.consentGate.gateId,
      workspaceId: input.workspaceId,
      kind: "confirm_cost",
      onExpiry: "cancel",
      deadlineAt: box.consentGate.deadlineAt,
      now: deps.clock.now(),
    });
  }
  return result;
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

// Gate resolution (§6.4; §12.4 step 7; REQ-GATE-5; REQ-DATA-35/36; REQ-SPEC-9). The user-facing resolution
// path `POST /runs/:id/gates/:gid {decision}` and the policy-skip path. Every resolution is a CONDITIONAL
// UPDATE (`WHERE resolved_at IS NULL`) so exactly one mechanism wins a race, and every path writes a `Decision`
// row naming its mechanism (REQ-SPEC-1). On approval the structured edits serialize into write-back overlays
// (REQ-SPEC-9), guidance is captured, the run leaves `waiting_gate` for `queued`, and `run.resume` is enqueued
// as a fresh attempt. A `confirm_cost` consent resolves from `awaiting_consent`, placing the hold + `run.start`.

import type { DecisionAction, GateResolutionBy, WorkflowKey } from "@rhema/contracts";
import { WORKFLOW_MANIFESTS } from "@rhema/protocols";
import type { ContentStore } from "@rhema/mirror";
export type { ContentStore } from "@rhema/mirror"; // re-exported so adapters can type `deps.store` without a direct mirror dep
import type { OrchestratorDeps } from "./internal-api.js";
import { applyTransition } from "./transition.js";
import { revokeRunCredentials } from "./credentials.js";
import { reconcileRunSpend } from "./spend.js";
import { InsufficientBalanceError, AccountSuspendedError } from "./ledger.js";
import { RUN_JOBS } from "./queue.js";
import { serializeGateOverlay } from "./gate-overlay.js";
import { captureGuidanceTx } from "./guidance.js";
import { canTransition, isTerminal, type RunState } from "./state-machine.js";
import { publishCommittedEventHighWater } from "./event-store.js";
import type { SqlClient } from "./tx.js";

/** Conditional-update resolve (REQ-DATA-35): flip `resolved_at` only if still unresolved. Returns the winner. */
export async function conditionalResolve(tx: SqlClient, gateId: string, now: Date): Promise<boolean> {
  const res = await tx.query(
    "update gates set resolved_at = $2, held = false where id = $1 and resolved_at is null returning id",
    [gateId, now],
  );
  return (res.rows as unknown[]).length === 1;
}

export interface DecisionRecord {
  readonly gateId: string;
  readonly by: GateResolutionBy;
  readonly action: DecisionAction;
  readonly presence?: boolean;
  readonly guidance?: string;
  readonly standingRule?: boolean;
  readonly changes?: number;
  readonly overlayVersionIds?: readonly string[];
}

/** Write the `Decision` row (§6.4 item 6). PK is `gate_id`; a duplicate is a no-op (the CAS already gated it). */
export async function writeDecision(tx: SqlClient, now: Date, d: DecisionRecord): Promise<void> {
  await tx.query(
    `insert into decisions(gate_id, by_actor, presence, action, guidance, standing_rule, changes,
       overlay_version_ids, at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (gate_id) do nothing`,
    [
      d.gateId,
      d.by,
      d.presence ?? null,
      d.action,
      d.guidance ?? null,
      d.standingRule ?? null,
      d.changes ?? null,
      d.overlayVersionIds && d.overlayVersionIds.length > 0 ? (d.overlayVersionIds as string[]) : null,
      now,
    ],
  );
}

/**
 * P1.12 — has the run committed every ACTIVE manifest phase? A `gateAfter` on the run's LAST phase
 * (the Outline manifest's `gaps`) resolves into nothing to resume: the pod would fetch a run spec
 * with no uncommitted phase and die. Such a gate resolves `waiting_gate → finalizing` and the
 * `run.finalize` worker job completes the run server-side (delivery consequences + `completed`),
 * never `run.resume`. Opt-outs follow the runspec's rule exactly (frozen `inputs[optOutFlag] ===
 * false`, or `inputs.tier === phase.optional`), so the count here is the same `committedPhases`
 * position the spec builder uses.
 */
async function allActivePhasesCommitted(
  tx: SqlClient,
  runId: string,
  workflow: string,
  inputs: Record<string, unknown> | null,
): Promise<boolean> {
  const manifest = WORKFLOW_MANIFESTS[workflow as WorkflowKey];
  if (!manifest) return false;
  const ordinals = manifest.phases
    .filter(
      (p) =>
        !(p.optOutFlag != null && inputs?.[p.optOutFlag] === false) &&
        !(p.optional != null && inputs?.["tier"] === p.optional),
    )
    .map((p) => p.index);
  const n = (
    await tx.query(
      `select count(distinct ordinal)::int as n from steps
        where run_id = $1 and state in ('done','skipped') and ordinal = any($2::int[])`,
      [runId, ordinals],
    )
  ).rows[0] as { n: number };
  return n.n >= ordinals.length;
}

export async function emitGateResolved(
  tx: SqlClient,
  deps: Pick<OrchestratorDeps, "eventWriter">,
  runId: string,
  action: string,
  by: string,
  now: Date,
): Promise<void> {
  await deps.eventWriter.append(tx, { runId, type: "gate.resolved", payload: { action, by }, at: now });
}

/**
 * RUN.1 (ADR-050) — resolve every still-open INFORMATIONAL gate (`blocking:false`) on the run inside `tx`.
 * An informational gate never parked the run — the card rides the run until the letter phase — so at the
 * final boundary (the letter phase's begin, or any `→ finalizing` transition) the sweep writes each gate's
 * `Decision{by:'policy', action:'proceed_as_proposed'}` + `gate.resolved` event and closes the row. Never a
 * state transition: the run is already moving. Idempotent — the conditional resolve makes a replay a no-op.
 */
export async function autoResolveOpenInformationalGates(
  tx: SqlClient,
  deps: Pick<OrchestratorDeps, "eventWriter">,
  runId: string,
  now: Date,
): Promise<void> {
  const open = (
    await tx.query(
      "select id from gates where run_id = $1 and resolved_at is null and blocking = false for update",
      [runId],
    )
  ).rows as { id: string }[];
  for (const g of open) {
    if (!(await conditionalResolve(tx, g.id, now))) continue;
    await writeDecision(tx, now, { gateId: g.id, by: "policy", action: "proceed_as_proposed" });
    await emitGateResolved(tx, deps, runId, "proceed_as_proposed", "policy", now);
  }
}

// ---------------------------------------------------------------------------- user resolution

export interface GateEdit {
  /** the committed structured artifact under decision (the gate's `.md`); its path + kind drive serialization. */
  readonly artifactVersionId: string;
  /** the post-decision sidecar rows (validated by the serializer). */
  readonly rows: unknown;
  readonly changes?: number;
}

export interface ResolveGateArgs {
  readonly runId: string;
  readonly gateId: string;
  readonly workspaceId: string;
  readonly userId: string;
  /** approve | approve_autonomous | edit | keep_planning | stop (§6.4 item 1 actions). */
  readonly action: DecisionAction;
  /** true iff resolved against the shortened presence-timer deadline (recorded on the decision, §6.4 item 2). */
  readonly presence?: boolean;
  /** gate note / edit guidance text (captured as a Guidance record). */
  readonly guidance?: string;
  /** "…and remember this for this project" → standing (project-scope) guidance (REQ-GATE-10). */
  readonly standingRule?: boolean;
  /** structured edits to serialize into a write-back overlay (REQ-SPEC-9); only with action `edit`. */
  readonly edits?: GateEdit;
}

export interface ResolveGateDeps extends OrchestratorDeps {
  /** content store for serializing write-back overlays (REQ-SPEC-9); required when `edits` are present. */
  readonly store?: ContentStore;
}

export type ResolveGateResult =
  | { readonly ok: true; readonly resolved: true; readonly state: RunState; readonly overlayVersionIds: string[]; readonly guidanceId?: string }
  | { readonly ok: true; readonly resolved: false; readonly reason: "already_resolved" | "not_waiting" }
  | { readonly ok: false; readonly reason: "not_found" | "insufficient_balance" | "account_suspended"; readonly required?: number };

interface GateRunRow {
  kind: string;
  blocking: boolean;
  resolved_at: Date | null;
  artifact_version_id: string | null;
  step_id: string | null;
  state: RunState;
  workflow: string;
  project_id: string | null;
  current_attempt: number;
  current_step_id: string | null;
  cap_credits: number;
  entitlement_id: string | null;
  hold_ledger_id: string | null;
  billing_account_id: string;
  inputs: Record<string, unknown> | null;
}

/** Thrown to roll a failed consent back inside the tx while still returning a typed result (like run-creation). */
class ConsentRollback extends Error {
  constructor(readonly result: ResolveGateResult) {
    super("consent rolled back");
    this.name = "ConsentRollback";
  }
}

/**
 * Resolve a gate on the user's decision (§12.4 step 7). One tenant transaction: conditional-resolve (one
 * winner), write the `Decision`, serialize any structured edits into write-back overlays, capture guidance,
 * set the autonomous flag, and take the run out of `waiting_gate`/`awaiting_consent` → `queued`. Enqueues
 * `run.resume` (or `run.start` for consent) AFTER commit. Idempotent: a second call finds the gate resolved.
 */
export async function resolveGate(deps: ResolveGateDeps, args: ResolveGateArgs): Promise<ResolveGateResult> {
  const now = deps.clock.now();
  // A box (not a bare `let`) so TS keeps the type across the tx closure that assigns it.
  const box: { job: { name: string; payload: Record<string, unknown> } | null; requestCancel: boolean } = {
    job: null,
    requestCancel: false,
  };

  const result = await deps.txRunner
    .run(args.workspaceId, async (tx): Promise<ResolveGateResult> => {
      const gr = (
        await tx.query(
          `select g.kind, g.blocking, g.resolved_at, g.artifact_version_id, g.step_id,
                  r.state, r.workflow, r.project_id, r.current_attempt, r.current_step_id, r.cap_credits,
                  r.entitlement_id, r.hold_ledger_id, r.inputs, w.billing_account_id
             from gates g join runs r on r.id = g.run_id join workspaces w on w.id = r.workspace_id
            where g.id = $1 and g.run_id = $2 for update`,
          [args.gateId, args.runId],
        )
      ).rows[0] as GateRunRow | undefined;
      if (!gr) return { ok: false, reason: "not_found" };
      if (gr.resolved_at != null) return { ok: true, resolved: false, reason: "already_resolved" };

      // RUN.1 (ADR-050) — an INFORMATIONAL gate (`blocking:false`) never parked this run: it is still
      // `running` (or parked at ANOTHER — blocking — gate, or finalizing). Resolving records the
      // decision and its side effects but performs NO resume — the run is already moving. A
      // `waiting_gate`/`awaiting_consent` run parked at THIS gate falls through to the legacy resume
      // path, so a pre-RUN.1 parked informational gate self-heals on its first resolution.
      const parkedAtGate = gr.state === "waiting_gate" || gr.state === "awaiting_consent";
      const informational = gr.blocking === false && !parkedAtGate;
      if (!informational && !parkedAtGate) return { ok: true, resolved: false, reason: "not_waiting" };

      if (!(await conditionalResolve(tx, args.gateId, now))) return { ok: true, resolved: false, reason: "already_resolved" };

      // Stop → cancel + settle (release hold, revoke credential). The writer lock clears at the terminal edge.
      if (args.action === "stop") {
        await writeDecision(tx, now, { gateId: args.gateId, by: "user", action: "stop", presence: args.presence });
        await emitGateResolved(tx, deps, args.runId, "stop", "user", now);
        if (isTerminal(gr.state)) {
          // the run already ended — the stop decision stands for the record only.
          return { ok: true, resolved: true, state: gr.state, overlayVersionIds: [] };
        }
        if (gr.state === "running") {
          // §12.4: a live run steps through `cancelling` so the pod quiesces at a tool-batch boundary
          // (the heartbeat cancel flag goes out post-commit; the reaper completes the settle).
          await applyTransition(tx, deps, { runId: args.runId, from: "running", to: "cancelling", reason: "stop" });
          box.requestCancel = true;
          return { ok: true, resolved: true, state: "cancelling", overlayVersionIds: [] };
        }
        if (!canTransition(gr.state, "cancelled")) {
          // orphaned / finalizing — no legal cancel edge; the decision stands, the run's owner settles.
          return { ok: true, resolved: true, state: gr.state, overlayVersionIds: [] };
        }
        await applyTransition(tx, deps, { runId: args.runId, from: gr.state, to: "cancelled", reason: "stop" });
        if (gr.hold_ledger_id) {
          await deps.ledger.release(tx, {
            billingAccountId: gr.billing_account_id,
            workspaceId: args.workspaceId,
            runId: args.runId,
            holdLedgerId: gr.hold_ledger_id,
            idempotencyKey: `release:${args.runId}`,
          });
        }
        await reconcileRunSpend(tx, args.runId); // PRB.16b — the terminal settle owns the spend figure
        await revokeRunCredentials(tx, args.runId, now);
        return { ok: true, resolved: true, state: "cancelled", overlayVersionIds: [] };
      }

      // Approvals: serialize edits → overlays, capture guidance, set the autonomous flag.
      let overlayVersionIds: string[] = [];
      if (args.edits) {
        if (!deps.store) throw new Error("resolveGate: structured edits require a ContentStore (REQ-SPEC-9)");
        overlayVersionIds = await serializeGateOverlay(tx, deps, deps.store, {
          workspaceId: args.workspaceId,
          projectId: gr.project_id!,
          userId: args.userId,
          artifactVersionId: args.edits.artifactVersionId,
          rows: args.edits.rows,
        });
      }

      let guidanceId: string | undefined;
      if (args.guidance && args.guidance.trim() !== "") {
        guidanceId = await captureGuidanceTx(tx, deps, {
          workspaceId: args.workspaceId,
          projectId: gr.project_id!,
          userId: args.userId,
          source: args.edits ? "gate_edit" : "gate_text",
          text: args.guidance,
          scope: args.standingRule ? "project" : "run",
          runId: args.standingRule ? undefined : args.runId,
          workflows: args.standingRule ? [gr.workflow] : undefined,
        });
      }

      if (args.action === "approve_autonomous") {
        await tx.query("update runs set gates_off = true where id = $1", [args.runId]);
      }

      // P1.10 / REQ-GATE-6 — **Keep planning** re-runs the plan step ONCE (a bounded re-plan ≤1,
      // counted on `runs.replans`). Resetting the gate's step row out of 'done' makes the
      // committed-phase count serve that phase again on resume; a SECOND keep_planning (the gate
      // re-opened after the re-run) finds a prior decision and resolves without a reset — the run
      // proceeds from the next phase. Counted BEFORE this decision lands so the row being written
      // below never counts itself.
      const priorKeepPlanning =
        args.action === "keep_planning"
          ? ((
              await tx.query(
                `select count(*)::int as n
                   from decisions d join gates g on g.id = d.gate_id
                  where g.run_id = $1 and d.action = 'keep_planning'`,
                [args.runId],
              )
            ).rows[0] as { n: number }).n
          : 0;

      await writeDecision(tx, now, {
        gateId: args.gateId,
        by: "user",
        action: args.action,
        presence: args.presence,
        guidance: args.guidance,
        standingRule: args.standingRule,
        changes: args.edits?.changes,
        overlayVersionIds,
      });
      await emitGateResolved(tx, deps, args.runId, args.action, "user", now);

      // RUN.1 — the informational-gate resolution ends here: the decision + overlays + guidance +
      // autonomous flag land; the run is already moving, so there is nothing to resume.
      if (informational) {
        return { ok: true, resolved: true, state: gr.state, overlayVersionIds, guidanceId };
      }

      // confirm_cost consent → place the hold + first launch (run.start), attempt unchanged.
      if (gr.state === "awaiting_consent") {
        try {
          const hold = await deps.ledger.hold(tx, {
            billingAccountId: gr.billing_account_id,
            workspaceId: args.workspaceId,
            runId: args.runId,
            credits: gr.cap_credits,
            idempotencyKey: `hold:${args.runId}`,
            entitlementId: gr.entitlement_id ?? undefined,
          });
          await tx.query("update runs set hold_ledger_id = $2, hold_bucket = $3 where id = $1", [args.runId, hold.ledgerId, hold.bucket]);
        } catch (e) {
          if (e instanceof InsufficientBalanceError) throw new ConsentRollback({ ok: false, reason: "insufficient_balance", required: e.required });
          // REQ-SPEC-24.7: a suspended account's consent cannot place the hold — roll the decision back
          // (the gate stays open) and surface account_suspended → 403.
          if (e instanceof AccountSuspendedError) throw new ConsentRollback({ ok: false, reason: "account_suspended" });
          throw e;
        }
        await applyTransition(tx, deps, { runId: args.runId, from: "awaiting_consent", to: "queued" });
        box.job = { name: RUN_JOBS.start, payload: { runId: args.runId, workspaceId: args.workspaceId } };
        return { ok: true, resolved: true, state: "queued", overlayVersionIds, guidanceId };
      }

      // P1.16 §14.6 — a `confirm_cost` gate on a waiting_gate run is the parked-resume re-price: the
      // run kept its original hold, so consenting places an ADDITIONAL hold for the delta
      // (new cap − still-held), keyed on the gate id so a consent replay is idempotent. A refused
      // hold rolls the decision back (the gate stays open) like the awaiting_consent path.
      if (gr.kind === "confirm_cost") {
        const stillHeld = Number(
          (
            (
              await tx.query(
                `select coalesce(sum(case kind when 'hold' then credits when 'debit' then -credits
                                       when 'release' then -credits else 0 end), 0)::int as h
                   from credit_ledger where run_id = $1 and kind in ('hold','debit','release')`,
                [args.runId],
              )
            ).rows[0] as { h: number } | undefined
          )?.h ?? 0,
        );
        const delta = Number(gr.cap_credits) - stillHeld;
        if (delta > 0) {
          try {
            await deps.ledger.hold(tx, {
              billingAccountId: gr.billing_account_id,
              workspaceId: args.workspaceId,
              runId: args.runId,
              credits: delta,
              idempotencyKey: `hold-delta:${args.runId}:${args.gateId}`,
              ...(gr.entitlement_id ? { entitlementId: gr.entitlement_id } : {}),
            });
          } catch (e) {
            if (e instanceof InsufficientBalanceError) throw new ConsentRollback({ ok: false, reason: "insufficient_balance", required: e.required });
            if (e instanceof AccountSuspendedError) throw new ConsentRollback({ ok: false, reason: "account_suspended" });
            throw e;
          }
        }
      }

      // waiting_gate → queued as a FRESH attempt (§12.4 step 7). A first keep_planning resets the
      // gate's step so the resume re-runs it; a refusal gate opened on the re-plan cap marks its
      // FAILED step done so any non-stop resolution proceeds past it (proceed-with-[unverified] /
      // cut-the-claim both advance the run — grounding's ledger may legitimately carry unverified rows).
      const nextAttempt = gr.current_attempt + 1;
      let fromStep: "current" | "next" = "next";
      if (args.action === "keep_planning" && priorKeepPlanning === 0 && gr.step_id) {
        await tx.query(
          `update steps set state = 'reset', result = $2 where id = $1`,
          [gr.step_id, JSON.stringify({ reset: "keep_planning" })],
        );
        await tx.query("update runs set replans = replans + 1 where id = $1", [args.runId]);
        fromStep = "current";
      } else if (gr.kind === "refusal" && gr.step_id) {
        // REQ-WF-5 — resolving the re-plan-cap refusal (any non-stop action) lets the run advance:
        // the failed grounding step is completed-with-marks so the committed-phase count serves the
        // NEXT phase, not a fourth grounding attempt.
        await tx.query(
          `update steps set state = 'done',
             result = coalesce(result, '{}'::jsonb) || '{"refusalResolved":true}'::jsonb
           where id = $1 and state = 'failed'`,
          [gr.step_id],
        );
      }
      // P1.12 — a gate that follows the run's LAST active phase (Outline's approve_outline) has no
      // next phase to resume into: resolve `waiting_gate → finalizing` and let the `run.finalize`
      // worker job complete the run (outline approval consequences + `completed`), never a pod
      // resume that would find no uncommitted phase.
      const allCommitted = await allActivePhasesCommitted(tx, args.runId, gr.workflow, gr.inputs);
      const to: RunState = allCommitted ? "finalizing" : "queued";
      if (allCommitted) {
        // RUN.1 — the last-phase gate resolved into finalizing: close any still-open informational
        // gates alongside it (their card's ride ends with the run).
        await autoResolveOpenInformationalGates(tx, deps, args.runId, now);
      }
      await applyTransition(tx, deps, {
        runId: args.runId,
        from: "waiting_gate",
        to,
        reason: args.action,
        fields: { currentAttempt: nextAttempt },
      });
      box.job = allCommitted
        ? { name: RUN_JOBS.finalize, payload: { runId: args.runId, workspaceId: args.workspaceId } }
        : { name: RUN_JOBS.resume, payload: { runId: args.runId, workspaceId: args.workspaceId, attempt: nextAttempt, fromStep } };
      return { ok: true, resolved: true, state: to, overlayVersionIds, guidanceId };
    })
    .catch((e: unknown) => {
      if (e instanceof ConsentRollback) return e.result;
      throw e;
    });

  // enqueue AFTER commit (pg-boss send is not transactional; a lost/early send is a no-op — singleton-keyed).
  if (result.ok && result.resolved && box.job) {
    await deps.queue.send(box.job.name, box.job.payload, { singletonKey: args.runId });
  }
  // RUN.1 — a `stop` on an informational gate moved `running → cancelling`: flag the live task so the
  // pod quiesces at the next tool-batch boundary (the reaper then completes the settle).
  if (result.ok && result.resolved && box.requestCancel) {
    await deps.heartbeats.requestCancel(args.runId).catch(() => undefined);
  }
  // REQ-ENG-2 — a `stop` that ended the run committed its terminal batch (decision + state_changed +
  // settle) in this tx; republish the committed high-water so the SSE tail wakes instead of riding
  // the safety poll.
  if (result.ok && result.resolved && isTerminal(result.state)) {
    await publishCommittedEventHighWater(deps, args.workspaceId, args.runId);
  }
  return result;
}

// ---------------------------------------------------------------------------- policy skip (REQ-DATA-36)

export type AutoResolveResult =
  | { readonly ok: true; readonly resolved: true; readonly state: RunState }
  | { readonly ok: true; readonly resolved: false; readonly reason: "already_resolved" | "not_found" };

/**
 * Auto-resolve an open gate without a human (the non-human mechanisms of REQ-SPEC-1): a conditional resolve + a
 * `Decision{by}` row + (if the run parked) proceed (`waiting_gate → queued`, `run.resume`). Shared by the
 * policy-skip and trial-preapproval paths. Spend/refusal kinds are never auto-resolved this way (callers gate on
 * `resolveGatePolicy`, which never returns `skip` for them, and trial only pre-approves Approve plan).
 */
async function autoResolveGate(
  deps: OrchestratorDeps,
  args: { runId: string; gateId: string; workspaceId: string; by: "policy" | "trial"; action: DecisionAction; reason: string },
): Promise<AutoResolveResult> {
  const now = deps.clock.now();
  const box: { job: Record<string, unknown> | null; name?: string } = { job: null };

  const result = await deps.txRunner.run(args.workspaceId, async (tx): Promise<AutoResolveResult> => {
    const gr = (
      await tx.query(
        "select g.resolved_at, r.state, r.current_attempt, r.workflow, r.inputs from gates g join runs r on r.id = g.run_id where g.id = $1 and g.run_id = $2 for update",
        [args.gateId, args.runId],
      )
    ).rows[0] as
      | { resolved_at: Date | null; state: RunState; current_attempt: number; workflow: string; inputs: Record<string, unknown> | null }
      | undefined;
    if (!gr) return { ok: true, resolved: false, reason: "not_found" };
    if (gr.resolved_at != null) return { ok: true, resolved: false, reason: "already_resolved" };
    if (!(await conditionalResolve(tx, args.gateId, now))) return { ok: true, resolved: false, reason: "already_resolved" };

    await writeDecision(tx, now, { gateId: args.gateId, by: args.by, action: args.action });
    await emitGateResolved(tx, deps, args.runId, args.action, args.by, now);

    if (gr.state === "waiting_gate") {
      const nextAttempt = gr.current_attempt + 1;
      // P1.12 — same last-phase rule as the user-resolution path: a policy-skip on the final
      // phase's gate finalizes the run rather than resuming into no uncommitted phase.
      const allCommitted = await allActivePhasesCommitted(tx, args.runId, gr.workflow, gr.inputs);
      const to: RunState = allCommitted ? "finalizing" : "queued";
      if (allCommitted) {
        // RUN.1 — close still-open informational gates as the run heads to finalizing.
        await autoResolveOpenInformationalGates(tx, deps, args.runId, now);
      }
      await applyTransition(tx, deps, { runId: args.runId, from: "waiting_gate", to, reason: args.reason, fields: { currentAttempt: nextAttempt } });
      if (allCommitted) {
        box.name = RUN_JOBS.finalize;
        box.job = { runId: args.runId, workspaceId: args.workspaceId };
      } else {
        box.name = RUN_JOBS.resume;
        box.job = { runId: args.runId, workspaceId: args.workspaceId, attempt: nextAttempt, fromStep: "next" };
      }
      return { ok: true, resolved: true, state: to };
    }
    return { ok: true, resolved: true, state: gr.state };
  });

  if (result.ok && result.resolved && box.job && box.name) {
    await deps.queue.send(box.name, box.job, { singletonKey: args.runId });
  }
  return result;
}

export interface SkipGateArgs {
  readonly runId: string;
  readonly gateId: string;
  readonly workspaceId: string;
  /** which policy skipped it, for the record ('run_to_completion' or 'autonomous'). */
  readonly reason?: "run_to_completion" | "autonomous";
}

export type SkipGateResult = AutoResolveResult;

/**
 * Skip a named gate by policy (REQ-DATA-36): Run-to-completion / the autonomous flag resolves the gate with a
 * `Decision{by:'policy', action:'skipped'}` row (so a skipped gate STILL has a decision — reconciling REQ-RUN-5
 * with REQ-DATA-36). If the run parked at the gate it proceeds (`waiting_gate → queued`, `run.resume`).
 */
export function skipGateByPolicy(deps: OrchestratorDeps, args: SkipGateArgs): Promise<SkipGateResult> {
  return autoResolveGate(deps, { ...args, by: "policy", action: "skipped", reason: args.reason ?? "policy" });
}

/**
 * Pre-approve Approve plan for a trial preview run (§6.4 item 3; §14.3; REQ-SPEC-1's fourth mechanism): a
 * `Decision{by:'trial', action:'proceed_as_proposed'}`. Trial preview drafts pre-approve Approve plan so the
 * preview runs unattended; only ever used for `approve_plan`.
 */
export function preApproveGateByTrial(
  deps: OrchestratorDeps,
  args: { runId: string; gateId: string; workspaceId: string },
): Promise<AutoResolveResult> {
  return autoResolveGate(deps, { ...args, by: "trial", action: "proceed_as_proposed", reason: "trial" });
}

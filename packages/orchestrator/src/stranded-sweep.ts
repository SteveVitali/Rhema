// The stranded-run sweep (§12.4 resumability; D-P0.08-4 / D-P0.10-2; REQ-RUN-14). The heartbeat reaper
// (reaper.ts) only sees a run once its task has emitted a first heartbeat, and every enqueue is a
// post-commit send (pg-boss is not transactional with the DB) — so two crash windows leave a run silently
// stranded with no heartbeat to reap:
//
//   • `provisioning` — the worker claimed `run.start`, transitioned `queued → provisioning`, then died
//     before the Job launched / before the pod's first heartbeat (or the launched pod never heartbeats).
//     Past the launch SLO the sweep fails the run through the ordinary `provisioning → failed` terminal
//     edge, which releases the writer lock; the hold + credential settle in the same transaction.
//   • `queued` — the commit→enqueue window: `resolveGate` / `handleGateExpiry` / `createRun` /
//     `skipGateByPolicy` transition to `queued` inside the tx and `queue.send` AFTER commit. A crash in
//     between leaves the row `queued` with no job. Past the threshold the sweep re-sends the launch job —
//     singleton-keyed on the run id, so a still-active job makes the re-send a no-op (the "no active
//     pg-boss job" test is the singleton itself; this also re-drives a run whose earlier `run.start` was
//     consumed but admission denied — the queue-drain retry the lifecycle otherwise lacks).
//   • parked gates — a gate deadline is armed the same post-commit way (commitStep), and the
//     `confirm_cost` consent's 7-day expiry is armed only here: an unresolved gate on a parked
//     (`waiting_gate`/`awaiting_consent`) run whose effective deadline exists is re-armed each pass.
//     `scheduleGateExpiry`'s deadline-keyed singleton dedupes a healthy arming; an overdue confirm_cost
//     then fires `cancel` and releases any hold — a stranded consent never holds credits forever.
//
// The scan is a SYSTEM-scoped read (a cross-tenant `runs`/`gates` query, like the parked sweep and the
// Team concurrency count); every mutation goes through the existing transitions + queue seams inside the
// run's own tenant transaction — no bypass writes. Deterministic: clock, queue, and the system client are
// injected; PGlite + InMemoryQueue drive it in tests.
//
// The better long-term fix is a transactional outbox (a job row committed with the transition, relayed
// post-commit); this sweep is the small honest recovery the deferral rows name (see the PRB.14 ticket).

import { WORKFLOW_MANIFESTS } from "@rhema/protocols";
import type { WorkflowKey } from "@rhema/contracts";
import { applyTransition } from "./transition.js";
import { revokeRunCredentials } from "./credentials.js";
import { reconcileRunSpend } from "./spend.js";
import { RUN_JOBS, scheduleGateExpiry } from "./queue.js";
import type { OrchestratorDeps } from "./internal-api.js";
import type { SqlClient } from "./tx.js";

/**
 * The launch SLO: `queued → provisioning` admits, mints, and launches inside one `run.start` job; the pod's
 * first heartbeat flips `provisioning → running`. A run still provisioning this long has a dead launch —
 * the §12.4 launch path (≤3 attempts with backoff, plus a cold launcher build) fits comfortably inside it.
 */
export const STUCK_PROVISIONING_MS = 15 * 60 * 1000;
/** A `queued` row this old has missed its post-commit send (pg-boss picks a queued job up in seconds). */
export const STRANDED_QUEUED_MS = 60 * 1000;

export interface StrandedSweepDeps extends OrchestratorDeps {
  /**
   * A system-scoped SqlClient for the cross-tenant scan (the worker's BYPASSRLS role — same seam the
   * parked sweep uses). Tenant scoping is re-established per mutation via `txRunner`.
   */
  readonly systemExec: SqlClient;
}

export interface StrandedSweepOpts {
  readonly provisioningSloMs?: number;
  readonly strandedQueuedMs?: number;
}

export type StrandedSweepOutcome =
  | { readonly kind: "provisioning_failed"; readonly runId: string; readonly workspaceId: string }
  | { readonly kind: "queued_reenqueued"; readonly runId: string; readonly workspaceId: string; readonly attempt: number }
  | { readonly kind: "gate_rearmed"; readonly gateId: string; readonly runId: string; readonly workspaceId: string }
  | { readonly kind: "preflight_alerted"; readonly runId: string; readonly workspaceId: string }
  | { readonly kind: "unverified_settled"; readonly runId: string; readonly workspaceId: string };

interface StuckRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly hold_ledger_id: string | null;
  readonly billing_account_id: string;
  readonly state_since: Date;
}

interface QueuedRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly current_attempt: number;
}

interface ParkedGateRow {
  readonly id: string;
  readonly run_id: string;
  readonly workspace_id: string;
  readonly deadline_at: Date;
}

/**
 * Run one stranded-run sweep pass. Returns one outcome per recovery action so the caller (the `run.reap`
 * cron handler) can log and tests can assert. Safe against races: each leg re-reads under `for update`
 * (leg A) or relies on the singleton/CAS semantics of the target mechanism (legs B, C).
 */
export async function sweepStrandedRuns(
  deps: StrandedSweepDeps,
  opts: StrandedSweepOpts = {},
): Promise<StrandedSweepOutcome[]> {
  const now = deps.clock.now();
  const outcomes: StrandedSweepOutcome[] = [];

  // ---- Leg A (D-P0.08-4): stuck `provisioning` → failed + settle. ----
  const provisioningCutoff = new Date(now.getTime() - (opts.provisioningSloMs ?? STUCK_PROVISIONING_MS));
  const stuck = (
    await deps.systemExec.query(
      `select r.id, r.workspace_id, r.hold_ledger_id, w.billing_account_id, r.state_since
         from runs r join workspaces w on w.id = r.workspace_id
        where r.state = 'provisioning' and r.state_since < $1
        order by r.state_since`,
      [provisioningCutoff],
    )
  ).rows as StuckRow[];

  for (const row of stuck) {
    const settled = await deps.txRunner.run(row.workspace_id, async (tx): Promise<boolean> => {
      // Re-read under lock: a first heartbeat may have landed `provisioning → running` between the
      // system scan and this tx — never fail a run that is actually alive.
      const cur = (
        await tx.query("select state, state_since from runs where id = $1 for update", [row.id])
      ).rows[0] as { state: string; state_since: Date } | undefined;
      if (!cur || cur.state !== "provisioning") return false;
      if (new Date(cur.state_since).getTime() >= provisioningCutoff.getTime()) return false;
      await applyTransition(tx, deps, {
        runId: row.id,
        from: "provisioning",
        to: "failed",
        reason: "provisioning_timeout",
        fields: {
          failure: {
            code: "provisioning_timeout",
            message: `no first heartbeat within the ${Math.round((opts.provisioningSloMs ?? STUCK_PROVISIONING_MS) / 60_000)}-min launch SLO`,
            retryable: false,
          },
        },
      });
      // The terminal edge cleared the writer lock; settle the hold + credential here (a stuck
      // provisioning run can hold both — the credential mints before the launch it died inside).
      if (row.hold_ledger_id) {
        await deps.ledger.release(tx, {
          billingAccountId: row.billing_account_id,
          workspaceId: row.workspace_id,
          runId: row.id,
          holdLedgerId: row.hold_ledger_id,
          idempotencyKey: `release:${row.id}`,
        });
      }
      await reconcileRunSpend(tx, row.id); // PRB.16b — the terminal settle owns the spend figure
      await revokeRunCredentials(tx, row.id, now);
      return true;
    });
    if (settled) outcomes.push({ kind: "provisioning_failed", runId: row.id, workspaceId: row.workspace_id });
  }

  // ---- Leg B (D-P0.10-2): stranded `queued` → re-send the launch job. ----
  const queuedCutoff = new Date(now.getTime() - (opts.strandedQueuedMs ?? STRANDED_QUEUED_MS));
  const stranded = (
    await deps.systemExec.query(
      `select id, workspace_id, current_attempt
         from runs
        where state = 'queued' and state_since < $1
        order by state_since`,
      [queuedCutoff],
    )
  ).rows as QueuedRow[];

  for (const row of stranded) {
    // A stranded consent resolved awaiting_consent → queued (hold placed in the same tx) lands here too:
    // the re-enqueued launch consumes that hold. attempt > 1 ⇒ the run parked and resumed — send
    // `run.resume` so the worker's reDebitOnResume call-site still fires for a refunded phase.
    const attempt = row.current_attempt;
    await deps.queue.send(attempt > 1 ? RUN_JOBS.resume : RUN_JOBS.start, { runId: row.id, workspaceId: row.workspace_id }, {
      singletonKey: row.id,
    });
    outcomes.push({ kind: "queued_reenqueued", runId: row.id, workspaceId: row.workspace_id, attempt });
  }

  // ---- Leg C (D-P0.10-2, consent half): re-arm the expiry job for a parked run's unresolved gate. ----
  // `scheduleGateExpiry` singleton-keys on `gate.expiry:<id>:<deadlineMs>` — a gate whose job is still active
  // dedupes; a gate whose post-commit send was lost (or never armed — confirm_cost's 7-day expiry has no
  // other arming site) gets a job that fires at the deadline (immediately when already overdue → the
  // expiry handler's conditional resolve cancels + releases the hold).
  const parkedGates = (
    await deps.systemExec.query(
      `select g.id, g.run_id, r.workspace_id, coalesce(g.presence_deadline_at, g.deadline_at) as deadline_at
         from gates g join runs r on r.id = g.run_id
        where g.resolved_at is null and g.held = false
          and coalesce(g.presence_deadline_at, g.deadline_at) is not null
          and r.state in ('waiting_gate', 'awaiting_consent')
        order by deadline_at`,
      [],
    )
  ).rows as ParkedGateRow[];

  for (const g of parkedGates) {
    const deadlineAt = new Date(g.deadline_at);
    await scheduleGateExpiry(deps, { gateId: g.id, workspaceId: g.workspace_id, deadlineAt, now });
    outcomes.push({ kind: "gate_rearmed", gateId: g.id, runId: g.run_id, workspaceId: g.workspace_id });
  }

  // ---- Leg D (RES.1; REQ-SPEC-31(3)): a `research_preflight_failed` run pages the ops sink ONCE. ----
  // The pod terminalizes via the ordinary failStep path (zero user debit + hold release + probe burn
  // absorbed), but the alert must reach a HUMAN — a run that can never research is a platform regression,
  // not user error. `runs.failure.alerted` is the durable dedupe marker: the sweep sends the alert first
  // and flips the flag only after the sink accepted (send-then-mark — a sink failure retries next pass;
  // exactly one alert lands per run, never a re-page on resume). ID-only payload — no prompt/draft text.
  const unalerted = (
    await deps.systemExec.query(
      `select id, workspace_id from runs
        where state = 'failed'
          and failure->>'code' = 'research_preflight_failed'
          and failure->>'alerted' is null
        order by state_since`,
      [],
    )
  ).rows as { id: string; workspace_id: string }[];
  for (const row of unalerted) {
    await deps.alert?.({
      kind: "research_preflight_failed",
      runId: row.id,
      workspaceId: row.workspace_id,
    });
    await deps.txRunner.run(row.workspace_id, (tx) =>
      tx.query(
        `update runs set failure = jsonb_set(failure, '{alerted}', 'true'::jsonb)
          where id = $1 and failure->>'code' = 'research_preflight_failed'`,
        [row.id],
      ),
    );
    outcomes.push({ kind: "preflight_alerted", runId: row.id, workspaceId: row.workspace_id });
  }

  // ---- Leg E (RES.2; REQ-SPEC-31(3)): an Unverified run whose platform-fault settlement did not ----
  // land (deliverRun calls it best-effort post-commit; a crash/failure between commit and settle leaves
  // `delivery.platformFaultSettledAt`/`delivery.alerted` unset) retries HERE. `settleUnverified` is
  // idempotent per leg — refund keys, the entitlement's `consumed_by_run_id` guard, and the audit row's
  // unique constraint all dedupe — so re-driving a half-settled run is safe. The alert leg itself is
  // send-then-mark inside the settle, so a sink failure surfaces as an unset `alerted` marker and
  // retries next pass — exactly one page per Unverified delivery.
  const unsettledUnverified = (
    await deps.systemExec.query(
      `select r.id, r.workspace_id, r.workflow, w.billing_account_id,
              r.delivery ->> 'checkableClaims' as checkable_claims,
              r.delivery ->> 'coveredClaims' as covered_claims
         from runs r join workspaces w on w.id = r.workspace_id
        where r.state = 'completed'
          and r.delivery ->> 'label' = 'unverified'
          and (r.delivery ->> 'platformFaultSettledAt' is null or r.delivery ->> 'alerted' is null)
        order by r.ended_at`,
      [],
    )
  ).rows as {
    id: string; workspace_id: string; workflow: WorkflowKey; billing_account_id: string;
    checkable_claims: string | null; covered_claims: string | null;
  }[];
  for (const row of unsettledUnverified) {
    const phaseKeys = (WORKFLOW_MANIFESTS[row.workflow]?.phases ?? [])
      .filter((p) => p.phaseClass === "research")
      .map((p) => p.key);
    if (!deps.settleUnverified) break; // unbound deploy (no ledger) — nothing to retry
    try {
      await deps.settleUnverified({
        runId: row.id,
        workspaceId: row.workspace_id,
        billingAccountId: row.billing_account_id,
        phaseKeys,
        checkableClaims: Number(row.checkable_claims ?? 0),
        coveredClaims: Number(row.covered_claims ?? 0),
      });
      outcomes.push({ kind: "unverified_settled", runId: row.id, workspaceId: row.workspace_id });
    } catch {
      // a settlement leg failed — the markers stay unset and the next pass retries. One bad run must
      // never wedge the rest of the sweep.
    }
  }

  return outcomes;
}

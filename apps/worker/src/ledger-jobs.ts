// Live ledger call-sites the worker owns (D-P0.11-1). Two flows the @rhema/ledger logic implements but nothing
// invoked in the build env:
//  • `run.sweep_parked` (cron) — auto-cancel + release runs whose 30-day park elapsed (REQ-SPEC-24.4).
//  • resume re-debit — at `run.resume`, re-debit the refunded phases FIRST (REQ-SPEC-24.6) with a per-EPISODE
//    idempotency key (`resume:<runId>:<attempt>`) so a refund→resume→refund cycle stays correct.
// The LOGIC + its semantics are unit-tested in @rhema/ledger over PGlite; this is the deploy wiring (validated
// live in Stage B).

import {
  applyTransition,
  reconcileRunSpend,
  type OrchestratorDeps,
  type SqlClient,
  type RunState,
} from "@rhema/orchestrator";
import {
  sweepExpiredParkedRuns,
  reDebitRefundedPhases,
  type ParkedRunRef,
  type ParkedSweepResult,
  type SqlHoldLedger,
} from "@rhema/ledger";

/** Worker deps for the ledger call-sites — the CONCRETE `SqlHoldLedger` (re-debit needs `writeDebit`). */
export interface WorkerLedgerDeps extends OrchestratorDeps {
  readonly ledger: SqlHoldLedger;
  /**
   * A system-scoped SqlClient for the cross-tenant parked scan (like the reaper's cross-tenant reads). The
   * deploy binds this to a connection whose role can read `runs` across tenants (BYPASSRLS worker role).
   */
  readonly systemExec: SqlClient;
}

/**
 * `run.sweep_parked` (cron, hourly): cancel every parked run whose 30-day park elapsed, releasing its hold in
 * the same transaction as the cancel (the writer lock clears at the terminal transition). Idempotent.
 */
export function handleParkedSweep(deps: WorkerLedgerDeps): Promise<ParkedSweepResult> {
  return sweepExpiredParkedRuns(
    deps.systemExec,
    {
      ledger: deps.ledger,
      runTx: (workspaceId, fn) => deps.txRunner.run(workspaceId, fn),
      cancel: async (tx: SqlClient, ref: ParkedRunRef) => {
        // read the current parked state under lock, then transition it to cancelled (partials kept).
        const res = await tx.query("select state from runs where id = $1 for update", [ref.runId]);
        const row = res.rows[0] as { state: RunState } | undefined;
        if (!row) return;
        if (row.state !== "waiting_gate" && row.state !== "awaiting_consent") return; // moved on — skip
        await applyTransition(tx, deps, { runId: ref.runId, from: row.state, to: "cancelled", reason: "stop" });
        await reconcileRunSpend(tx, ref.runId); // PRB.16b — the terminal settle owns the spend figure
      },
    },
    deps.clock.now(),
  );
}

export interface ResumeReDebitArgs {
  readonly runId: string;
  readonly workspaceId: string;
  readonly attempt: number;
}

/**
 * At `run.resume`, re-debit the run's previously-refunded phases FIRST (REQ-SPEC-24.6), inside one tenant
 * transaction, keyed per resume EPISODE so a repeatedly refunded→resumed phase re-debits each time. A no-op when
 * the run carries no refund (the common case). Reads the billing account under the same tx.
 */
export function reDebitOnResume(deps: WorkerLedgerDeps, args: ResumeReDebitArgs): Promise<unknown> {
  return deps.txRunner.run(args.workspaceId, async (tx) => {
    const res = await tx.query(
      "select w.billing_account_id from runs r join workspaces w on w.id = r.workspace_id where r.id = $1",
      [args.runId],
    );
    const row = res.rows[0] as { billing_account_id: string } | undefined;
    if (!row) return [];
    return reDebitRefundedPhases(tx, deps.ledger, {
      workspaceId: args.workspaceId,
      billingAccountId: row.billing_account_id,
      runId: args.runId,
      idempotencyKey: `resume:${args.runId}:${args.attempt}`,
    });
  });
}

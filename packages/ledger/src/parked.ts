// 30-day parked-run auto-cancel with release (REQ-SPEC-24.4; §12.4). P0.08 sets `runs.parked_until = now + 30d`
// whenever a run parks at a gate (`reaper`, `internal-api`); nothing swept it. This sweep finds runs whose park
// has expired and, per run, cancels it (partials kept) AND releases its hold — the money side P0.11 owns. The
// state transition itself is the orchestrator's cancel path, injected as `cancel` so this stays decoupled and
// deterministically testable (a fake `cancel` + a real `SqlHoldLedger`).

import type { SqlClient, HoldLedger } from "@rhema/orchestrator";

export interface ParkedRunRef {
  readonly runId: string;
  readonly workspaceId: string;
  readonly billingAccountId: string;
  readonly holdLedgerId: string | null;
}

/**
 * System-scoped scan (like the reaper's cross-tenant reads) for parked runs whose 30-day park has elapsed. A
 * parked run sits in `waiting_gate` (a gate) or `awaiting_consent` (an unconfirmed sheet-less run) with a
 * `parked_until` in the past.
 */
export async function findExpiredParkedRuns(exec: SqlClient, now: Date): Promise<ParkedRunRef[]> {
  return (
    await exec.query(
      `select r.id as run_id, r.workspace_id, w.billing_account_id, r.hold_ledger_id
         from runs r join workspaces w on w.id = r.workspace_id
        where r.state in ('waiting_gate', 'awaiting_consent')
          and r.parked_until is not null and r.parked_until < $1
        order by r.parked_until`,
      [now],
    )
  ).rows.map((row) => {
    const r = row as { run_id: string; workspace_id: string; billing_account_id: string; hold_ledger_id: string | null };
    return {
      runId: r.run_id,
      workspaceId: r.workspace_id,
      billingAccountId: r.billing_account_id,
      holdLedgerId: r.hold_ledger_id,
    };
  });
}

export interface ParkedSweepDeps {
  readonly ledger: HoldLedger;
  /** Open one tenant-scoped transaction for a run (the orchestrator's `TxRunner.run` in prod). */
  readonly runTx: (workspaceId: string, fn: (tx: SqlClient) => Promise<void>) => Promise<void>;
  /** Transition the run to `cancelled` with partials kept (the orchestrator's cancel path). */
  readonly cancel: (tx: SqlClient, ref: ParkedRunRef) => Promise<void>;
}

export interface ParkedSweepResult {
  readonly swept: number;
  readonly runIds: readonly string[];
}

/**
 * Auto-cancel every parked run whose 30-day park has elapsed, releasing its hold in the SAME transaction as the
 * cancel so a swept run never leaks a reservation (REQ-SPEC-24.4; the writer lock is cleared by the terminal
 * transition, P0.08). Idempotent: `release` is a no-op when the hold is already gone.
 */
export async function sweepExpiredParkedRuns(
  exec: SqlClient,
  deps: ParkedSweepDeps,
  now: Date,
): Promise<ParkedSweepResult> {
  const expired = await findExpiredParkedRuns(exec, now);
  const runIds: string[] = [];
  for (const ref of expired) {
    await deps.runTx(ref.workspaceId, async (tx) => {
      await deps.cancel(tx, ref);
      if (ref.holdLedgerId) {
        await deps.ledger.release(tx, {
          billingAccountId: ref.billingAccountId,
          workspaceId: ref.workspaceId,
          runId: ref.runId,
          holdLedgerId: ref.holdLedgerId,
          idempotencyKey: `release:${ref.runId}`,
        });
      }
    });
    runIds.push(ref.runId);
  }
  return { swept: runIds.length, runIds };
}

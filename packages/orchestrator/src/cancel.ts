// "Cancel run to edit" (PRB.07; §5.4/§6.3 banner release; REQ-DATA-41, REQ-RUN-8). The run-level cancel the
// Page's lock banner invokes — it reuses the canonical seams a gate Stop already composes: every open gate of
// the run resolves with a `stop` Decision (one winner per gate via the conditional update), the run takes the
// legal edges to `cancelled` through `applyTransition` (the per-project writer lock clears at the terminal
// edge there), the credit hold is released, and credentials are revoked. A run in `running` steps through
// `cancelling` first so the pod quiesces at a tool-batch boundary (REQ-DATA-41) — the heartbeat cancel flag
// is set so the live task sees it.

import { applyTransition } from "./transition.js";
import { conditionalResolve, emitGateResolved, writeDecision } from "./gate-resolution.js";
import { revokeRunCredentials } from "./credentials.js";
import { isTerminal, type RunState } from "./state-machine.js";
import type { OrchestratorDeps } from "./internal-api.js";
import type { SqlClient } from "./tx.js";

export interface CancelRunArgs {
  readonly runId: string;
  readonly workspaceId: string;
}

export type CancelRunResult =
  | { readonly ok: true; readonly state: RunState; readonly alreadyTerminal: boolean }
  | { readonly ok: false; readonly reason: "not_found" | "not_cancellable"; readonly state?: RunState };

/** States the run-level cancel can legally take to `cancelled` (the machine's edges; `created` is pre-hold). */
const DIRECT_CANCEL: Readonly<Record<string, true>> = {
  awaiting_consent: true,
  queued: true,
  provisioning: true,
  waiting_gate: true,
  cancelling: true,
};

interface RunRow {
  state: RunState;
  hold_ledger_id: string | null;
  billing_account_id: string;
}

/**
 * Cancel a run from the Page's lock banner (§6.3). One tenant transaction: resolve the run's still-open gates
 * as user `stop` decisions, walk the legal edges to `cancelled`, release the hold, revoke credentials. The
 * paired `run.state_changed`/`gate.resolved` events ride the same tx (REQ-DATA-33). Idempotent: a terminal
 * run reports its state; a `created`/`orphaned`/`finalizing` run has no legal cancel edge and reports
 * `not_cancellable` (the reaper/finalizer owns those).
 */
export async function cancelRun(deps: OrchestratorDeps, args: CancelRunArgs): Promise<CancelRunResult> {
  const now = deps.clock.now();
  const result = await deps.txRunner.run(args.workspaceId, async (tx: SqlClient): Promise<CancelRunResult> => {
    const row = (
      await tx.query(
        `select r.state, r.hold_ledger_id, w.billing_account_id
           from runs r join workspaces w on w.id = r.workspace_id
          where r.id = $1 and r.workspace_id = $2 for update`,
        [args.runId, args.workspaceId],
      )
    ).rows[0] as RunRow | undefined;
    if (!row) return { ok: false, reason: "not_found" };
    if (isTerminal(row.state)) return { ok: true, state: row.state, alreadyTerminal: true };

    if (row.state !== "running" && !DIRECT_CANCEL[row.state]) {
      return { ok: false, reason: "not_cancellable", state: row.state };
    }

    // Resolve every still-open gate as a user `stop` (the same writes a gate card's Stop performs) so no
    // Needs-you card outlives its run — the conditional update makes a raced gate decision a no-op.
    const gates = (
      await tx.query(`select id from gates where run_id = $1 and resolved_at is null`, [args.runId])
    ).rows as { id: string }[];
    for (const g of gates) {
      if (!(await conditionalResolve(tx, g.id, now))) continue;
      await writeDecision(tx, now, { gateId: g.id, by: "user", action: "stop" });
      await emitGateResolved(tx, deps, args.runId, "stop", "user", now);
    }

    // The legal edges (§12.4): a live run steps through `cancelling` so the pod quiesces at a boundary.
    if (row.state === "running") {
      await applyTransition(tx, deps, { runId: args.runId, from: "running", to: "cancelling", reason: "cancel_to_edit" });
    }
    const from = row.state === "running" ? "cancelling" : row.state;
    await applyTransition(tx, deps, { runId: args.runId, from, to: "cancelled", reason: "cancel_to_edit" });

    if (row.hold_ledger_id) {
      await deps.ledger.release(tx, {
        billingAccountId: row.billing_account_id,
        workspaceId: args.workspaceId,
        runId: args.runId,
        holdLedgerId: row.hold_ledger_id,
        idempotencyKey: `release:${args.runId}`,
      });
    }
    await revokeRunCredentials(tx, args.runId, now);
    return { ok: true, state: "cancelled", alreadyTerminal: false };
  });

  // Post-commit flag for the live task (the harness polls it at the next heartbeat boundary). In-memory in
  // tests; a no-op for a run that was already terminal.
  if (result.ok && !result.alreadyTerminal) await deps.heartbeats.requestCancel(args.runId);
  return result;
}

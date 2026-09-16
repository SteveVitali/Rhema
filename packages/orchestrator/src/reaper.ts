// The orphan reaper (§12.4 resumability; REQ-RUN-14; AC3). A cron (`run.reap`, 1 min) scans Redis heartbeats;
// a run whose heartbeat is stale > 3 min is marked `orphaned`, its stale task is stopped, and after the
// StopTask return / 60-s grace the run is re-enqueued (`run.resume`) as a NEW attempt with a rotated token —
// at most twice per step. A third re-enqueue instead opens `resume_partial` (waiting_gate). Any call from an
// older attempt is already rejected `409 stale_task` (internal-api fence), so the stale task self-terminates.

import type { OrchestratorDeps } from "./internal-api.js";
import { openGate } from "./internal-api.js";
import { applyTransition } from "./transition.js";
import { revokeRunCredentials } from "./credentials.js";
import { RUN_JOBS } from "./queue.js";
import { scheduleGateNotifications } from "./notifications.js";
import { HEARTBEAT_STALE_MS } from "./heartbeat.js";
import type { SqlClient } from "./tx.js";

export const MAX_REENQUEUES_PER_STEP = 2; //  ≤2 re-enqueues per step; the third → resume_partial (§12.4)
export const STOP_TASK_GRACE_MS = 60_000; // wait for StopTask to return or 60 s before the next attempt (F5)
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface ReapOutcome {
  readonly runId: string;
  readonly action: "reenqueued" | "resume_partial" | "cancelled" | "skipped";
  readonly attempt?: number;
  readonly reason?: string;
}

interface ReapRow {
  state: string;
  current_attempt: number;
  resume_count: number;
  cap_credits: number;
  hold_ledger_id: string | null;
  billing_account_id: string;
}

/**
 * Run one reaper pass over stale heartbeats. Returns an outcome per stale run. Deterministic: the clock and the
 * heartbeat store are injected. A stale heartbeat from a superseded attempt (already re-enqueued) is skipped.
 */
export async function reap(
  deps: OrchestratorDeps,
  opts: { staleMs?: number } = {},
): Promise<ReapOutcome[]> {
  const now = deps.clock.now();
  const stale = await deps.heartbeats.listStale(now, opts.staleMs ?? HEARTBEAT_STALE_MS);
  const outcomes: ReapOutcome[] = [];

  for (const hb of stale) {
    const gateBox: { opened: { gateId: string; deadlineAt: Date } | null } = { opened: null };
    const outcome = await deps.txRunner.run(hb.workspaceId, async (tx): Promise<ReapOutcome> => {
      const res = await tx.query(
        `select r.state, r.current_attempt, r.resume_count, r.cap_credits, r.hold_ledger_id, w.billing_account_id
           from runs r join workspaces w on w.id = r.workspace_id where r.id = $1 for update`,
        [hb.runId],
      );
      const row = res.rows[0] as ReapRow | undefined;
      if (!row) return { runId: hb.runId, action: "skipped", reason: "not_found" };
      // the heartbeat must be from the CURRENT attempt to act on it.
      if (hb.attempt !== row.current_attempt) return { runId: hb.runId, action: "skipped", reason: "superseded" };

      // a Stopped run whose task died mid-cancel: complete cancellation, settling hold + credential (#4).
      if (row.state === "cancelling") {
        await applyTransition(tx, deps, { runId: hb.runId, from: "cancelling", to: "cancelled", reason: "stop" });
        await settle(deps, tx, hb.runId, hb.workspaceId, row);
        return { runId: hb.runId, action: "cancelled" };
      }
      if (row.state !== "running") return { runId: hb.runId, action: "skipped", reason: `state ${row.state}` };

      // running → orphaned (paired event).
      await applyTransition(tx, deps, {
        runId: hb.runId,
        from: "running",
        to: "orphaned",
        reason: "heartbeat_stale",
      });

      if (row.resume_count < MAX_REENQUEUES_PER_STEP) {
        const nextAttempt = row.current_attempt + 1;
        // orphaned → queued; bump attempt (rotates the token — the old token's attempt is now stale) and the
        // per-step re-enqueue count.
        await applyTransition(tx, deps, {
          runId: hb.runId,
          from: "orphaned",
          to: "queued",
          reason: "reaper_resume",
          fields: { currentAttempt: nextAttempt },
        });
        await tx.query("update runs set resume_count = resume_count + 1 where id = $1", [hb.runId]);
        await deps.eventWriter.append(tx, {
          runId: hb.runId,
          type: "run.hiccup",
          payload: { reason: "resumed from the last completed phase" },
          at: now,
        });
        return { runId: hb.runId, action: "reenqueued", attempt: nextAttempt };
      }

      // re-enqueues exhausted → orphaned → waiting_gate with a resume_partial gate (accept_partial on expiry).
      await applyTransition(tx, deps, {
        runId: hb.runId,
        from: "orphaned",
        to: "waiting_gate",
        reason: "resume_partial",
        fields: { parkedUntil: new Date(now.getTime() + THIRTY_DAYS_MS) },
      });
      const partialDeadline = new Date(now.getTime() + THIRTY_DAYS_MS);
      const gateId = await openGate(tx, deps, {
        runId: hb.runId,
        kind: "resume_partial",
        blocking: true,
        onExpiry: "accept_partial",
        deadlineAt: partialDeadline,
      });
      gateBox.opened = { gateId, deadlineAt: partialDeadline };
      return { runId: hb.runId, action: "resume_partial" };
    });

    // side effects outside the tx: stop the stale task, clear its heartbeat, and (on re-enqueue) schedule
    // run.resume after the StopTask grace with a per-run singleton key.
    await deps.heartbeats.clear(hb.runId);
    if (outcome.action === "reenqueued") {
      await deps.queue.send(
        RUN_JOBS.resume,
        { runId: hb.runId, attempt: outcome.attempt, fromStep: "current" },
        { singletonKey: hb.runId, startAfterMs: STOP_TASK_GRACE_MS },
      );
    }
    // PRB.09 — the resume_partial card emails its waiting notice (neverAutoProceed ⇒ no reminders armed).
    if (outcome.action === "resume_partial" && gateBox.opened) {
      await scheduleGateNotifications(deps, {
        gateId: gateBox.opened.gateId,
        workspaceId: hb.workspaceId,
        kind: "resume_partial",
        onExpiry: "accept_partial",
        deadlineAt: gateBox.opened.deadlineAt,
        now,
      });
    }
    outcomes.push(outcome);
  }
  return outcomes;
}

/** Release the unused hold + revoke the credential when the reaper takes a run to a terminal state. */
async function settle(
  deps: OrchestratorDeps,
  tx: SqlClient,
  runId: string,
  workspaceId: string,
  row: ReapRow,
): Promise<void> {
  if (row.hold_ledger_id) {
    await deps.ledger.release(tx, {
      billingAccountId: row.billing_account_id,
      workspaceId,
      runId,
      holdLedgerId: row.hold_ledger_id,
      idempotencyKey: `release:${runId}`,
    });
  }
  await revokeRunCredentials(tx, runId, deps.clock.now());
}

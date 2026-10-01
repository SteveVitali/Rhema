// User steering at MVP scope (§6.5; REQ-IDE-18; REQ-GATE-12 amended / REQ-GATE-13 / REQ-RUN-18):
//
//   • Pause after this phase — `requestPause` sets `runs.pause_requested_at`; `commitStep` honors it at
//     the NEXT phase boundary (the in-flight phase commits first), stamping `paused_at` and parking
//     `running → waiting_gate` at zero compute — a STEERING park: no gate row opens, so the card renders
//     *Paused after <phase> (n of m)* with Resume / Resume-with-note / Stop, not an approval.
//   • Resume — `resumePausedRun` takes a paused run `waiting_gate → queued` as a fresh attempt (the same
//     requeue edge a gate resume takes) and re-sends `run.resume`.
//   • Stop, keep partials — the existing `cancelRun`/`run.cancel` path (a parked run cancels directly;
//     committed artifacts stay, holds release, terminal spend reconciles).
//   • Note for the next phase — `queueRunNote` captures `Guidance{source:'queued_message', scope:'run'}`
//     on the run; `consumeGuidance` delivers it at the next boundary and NEVER into an independence
//     context (REQ-RUN-18 — enforced in guidance.ts, not advised).
//
// Section-granular pause, delivery-point chips, and batched comments are 1.x — none of that machinery is
// promised here (the card never offers a mid-phase stop point).

import { applyTransition } from "./transition.js";
import { captureGuidanceTx } from "./guidance.js";
import { RUN_JOBS } from "./queue.js";
import type { OrchestratorDeps } from "./internal-api.js";
import type { RunState } from "./state-machine.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export type RequestPauseResult =
  | { readonly ok: true; readonly state: "running" | "waiting_gate" }
  | { readonly ok: false; readonly reason: "not_found" | "not_running" | "terminal"; readonly state?: string };

/**
 * *Pause after this phase* (§6.5): flag the run so `commitStep` parks it at the next boundary. A `running`
 * run gets `pause_requested_at` (idempotent — re-pausing just re-stamps); an already-paused parked run is a
 * no-op `ok`. Any other state refuses (`not_running`) — the card only offers Pause while running.
 */
export async function requestPause(deps: OrchestratorDeps, args: { runId: string; workspaceId: string }): Promise<RequestPauseResult> {
  return deps.txRunner.run(args.workspaceId, async (tx) => {
    const row = (
      await tx.query("select state, paused_at from runs where id = $1 for update", [args.runId])
    ).rows[0] as { state: RunState; paused_at: Date | null } | undefined;
    if (!row) return { ok: false, reason: "not_found" } as const;
    if (row.state === "waiting_gate" && row.paused_at != null) {
      return { ok: true, state: "waiting_gate" } as const; // already parked — idempotent
    }
    if (row.state !== "running") {
      return {
        ok: false,
        reason: row.state === "completed" || row.state === "completed_partial" || row.state === "failed" || row.state === "cancelled" ? "terminal" : "not_running",
        state: row.state,
      } as const;
    }
    await tx.query("update runs set pause_requested_at = $2 where id = $1", [args.runId, deps.clock.now()]);
    return { ok: true, state: "running" } as const;
  });
}

export type ResumeResult =
  | { readonly ok: true; readonly state: "queued"; readonly guidanceId?: string }
  | { readonly ok: false; readonly reason: "not_found" | "not_paused" | "gate_waiting" };

/**
 * Resume a steering-parked run (§6.5): `waiting_gate + paused_at` → `queued` as a fresh attempt, the same
 * edge a gate resume takes — then `run.resume` is sent post-commit (singleton-keyed on the run). A
 * `waiting_gate` run WITHOUT `paused_at` is a real approval wait → `gate_waiting` (the card routes to the
 * gate, not here). An optional note is captured as `Guidance{source:'queued_message'}` IN the resume tx so
 * the next boundary delivers it (Resume-with-note).
 */
export async function resumePausedRun(
  deps: OrchestratorDeps,
  args: { runId: string; workspaceId: string; projectId: string; userId: string; note?: string },
): Promise<ResumeResult> {
  let guidanceId: string | undefined;
  const res = await deps.txRunner.run(args.workspaceId, async (tx): Promise<ResumeResult> => {
    const row = (
      await tx.query("select state, paused_at, current_attempt from runs where id = $1 for update", [args.runId])
    ).rows[0] as { state: RunState; paused_at: Date | null; current_attempt: number } | undefined;
    if (!row) return { ok: false, reason: "not_found" } as const;
    if (row.state !== "waiting_gate") return { ok: false, reason: "not_paused" } as const;
    if (row.paused_at == null) return { ok: false, reason: "gate_waiting" } as const;

    if (args.note != null && args.note.trim() !== "") {
      guidanceId = await captureGuidanceTx(tx, deps, {
        workspaceId: args.workspaceId,
        projectId: args.projectId,
        userId: args.userId,
        source: "queued_message",
        text: args.note.trim(),
        scope: "run",
        runId: args.runId,
      });
    }

    const nextAttempt = row.current_attempt + 1;
    await applyTransition(tx, deps, {
      runId: args.runId,
      from: "waiting_gate",
      to: "queued",
      reason: "resume",
      fields: { currentAttempt: nextAttempt },
    });
    await tx.query("update runs set paused_at = null, parked_until = null where id = $1", [args.runId]);
    await deps.eventWriter.append(tx, {
      runId: args.runId,
      type: "run.resumed",
      payload: { resumeFrom: "pause" },
      at: deps.clock.now(),
    });
    if (guidanceId) {
      await deps.eventWriter.append(tx, {
        runId: args.runId,
        type: "steer.queued",
        payload: { guidanceId },
        at: deps.clock.now(),
      });
    }
    return { ok: true, state: "queued", ...(guidanceId ? { guidanceId } : {}) } as const;
  });

  // post-commit send (pg-boss is not transactional; the singleton dedupes a lost-send replay).
  if (res.ok) {
    await deps.queue.send(RUN_JOBS.resume, { runId: args.runId, workspaceId: args.workspaceId }, { singletonKey: args.runId });
  }
  return res;
}

export type QueueNoteResult =
  | { readonly ok: true; readonly guidanceId: string }
  | { readonly ok: false; readonly reason: "not_found" | "terminal" | "empty" };

/**
 * *Note for the next phase* (§6.5; REQ-RUN-18): one text field on the running card → a run-scope
 * `Guidance{source:'queued_message'}` the NEXT phase boundary delivers exactly once. The note can also be
 * captured on a paused run (delivered on resume's first boundary). Terminal runs refuse. Emits
 * `steer.queued` so the card's queued-note count ticks.
 */
export async function queueRunNote(
  deps: OrchestratorDeps,
  args: { runId: string; workspaceId: string; projectId: string; userId: string; text: string },
): Promise<QueueNoteResult> {
  const text = args.text.trim();
  if (text === "") return { ok: false, reason: "empty" } as const;
  return deps.txRunner.run(args.workspaceId, async (tx) => {
    const row = (
      await tx.query("select state from runs where id = $1 and project_id = $2 for update", [args.runId, args.projectId])
    ).rows[0] as { state: RunState } | undefined;
    if (!row) return { ok: false, reason: "not_found" } as const;
    if (row.state === "completed" || row.state === "completed_partial" || row.state === "failed" || row.state === "cancelled") {
      return { ok: false, reason: "terminal", } as const;
    }
    const guidanceId = await captureGuidanceTx(tx, deps, {
      workspaceId: args.workspaceId,
      projectId: args.projectId,
      userId: args.userId,
      source: "queued_message",
      text,
      scope: "run",
      runId: args.runId,
    });
    await deps.eventWriter.append(tx, {
      runId: args.runId,
      type: "steer.queued",
      payload: { guidanceId },
      at: deps.clock.now(),
    });
    return { ok: true, guidanceId } as const;
  });
}

export { THIRTY_DAYS_MS as PAUSE_PARK_MS };

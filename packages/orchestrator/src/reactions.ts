// Orchestrator reactions to phase-loop / boundary / egress signals (§12.4 phase loop; §12.6/§12.8; REQ-ARCH-32;
// REQ-WF-5). These are the "what the orchestrator does when" pieces of the phase loop deliverable that sit
// beside the completion oracle: back-edge (re-plan) counting and re-opening Approve-plan, the run-pause
// reaction to a suspicious_query / egress.denied spike, and acting on the boundary hook's control signal.

import type { Clock } from "./clock.js";
import type { EventWriter } from "./event-writer.js";
import type { TxRunner } from "./tx.js";
import { applyTransition } from "./transition.js";
import { openGate, failRun, type OrchestratorDeps } from "./internal-api.js";

/** A phase may re-plan at most twice (§12.2 back-edges; REQ-WF-5). */
export const MAX_REPLANS = 2;

type MinDeps = { eventWriter: EventWriter; clock: Clock; txRunner: TxRunner };

export interface ReplanResult {
  readonly replans: number;
  /** true once the cap of 2 is exceeded — the orchestrator stops re-planning and proceeds/fails. */
  readonly capExceeded: boolean;
}

/**
 * Count a back-edge re-plan (`runs.replans`, cap 2 — REQ-WF-5). Returns the new count and whether the cap is
 * exceeded. The phase loop calls this when the oracle returns `replan` (a `phase-result.json {replan:true}`).
 */
export async function recordReplan(
  deps: Pick<OrchestratorDeps, "txRunner">,
  args: { runId: string; workspaceId: string },
): Promise<ReplanResult> {
  return deps.txRunner.run(args.workspaceId, async (tx) => {
    const res = await tx.query(
      "update runs set replans = replans + 1 where id = $1 returning replans",
      [args.runId],
    );
    const replans = (res.rows[0] as { replans: number }).replans;
    return { replans, capExceeded: replans > MAX_REPLANS };
  });
}

/**
 * Re-open Approve-plan (§6.4; §12.2) — when a back-edge changes the plan artifact's hash after it was approved,
 * the orchestrator re-opens the gate (or auto-approves within the consented cap under Run-to-completion — that
 * policy resolution is P0.10). This takes `running → waiting_gate` and opens the gate; P0.10 resumes. (The
 * plan-hash-change DETECTION uses P0.09's committed artifact hashes.)
 */
export async function reopenApprovePlan(
  deps: MinDeps & { ids: OrchestratorDeps["ids"] },
  args: { runId: string; workspaceId: string; stepId?: string; artifactVersionId?: string },
): Promise<{ gateId: string }> {
  return deps.txRunner.run(args.workspaceId, async (tx) => {
    await applyTransition(tx, deps, { runId: args.runId, from: "running", to: "waiting_gate", reason: "replan" });
    const gateId = await openGate(tx, deps, {
      runId: args.runId,
      kind: "approve_plan",
      blocking: true,
      onExpiry: "proceed_conservative",
      stepId: args.stepId,
      artifactVersionId: args.artifactVersionId,
    });
    return { gateId };
  });
}

export type PauseReason = "suspicious_query" | "egress_denied_spike";

/**
 * Pause a run in reaction to an egress signal (REQ-ARCH-32): a `suspicious_query` (a search query matching ≥12
 * draft n-grams — §12.8d) or an `egress.denied` spike. The run parks at a refusal-class card (`running →
 * waiting_gate` + a `refusal` gate); the sandbox exits, so a paused run consumes no compute. P0.07 EMITS the
 * signal (the proxy's `PauseSignal`); this is P0.08's reaction.
 */
export async function pauseRun(
  deps: MinDeps & { ids: OrchestratorDeps["ids"] },
  args: { runId: string; workspaceId: string; reason: PauseReason },
): Promise<{ gateId: string }> {
  return deps.txRunner.run(args.workspaceId, async (tx) => {
    await applyTransition(tx, deps, {
      runId: args.runId,
      from: "running",
      to: "waiting_gate",
      reason: args.reason,
    });
    const gateId = await openGate(tx, deps, {
      runId: args.runId,
      kind: "refusal",
      blocking: true,
      onExpiry: "cancel",
    });
    return { gateId };
  });
}

/**
 * Act on the boundary hook's control signal (§12.6; REQ-ARCH-18; @rhema/hooks `HookDecision.control`):
 *   • `abort_failed_boundary` (3 denials of one path) → the step fails `failed(boundary)`;
 *   • `hiccup_retry` (>20 denials in a phase) → a `run.hiccup` event; the phase loop then does one guided retry.
 * Emission is @rhema/hooks'; this is the orchestrator's reaction.
 */
export async function handleHookControl(
  deps: OrchestratorDeps,
  args: {
    runId: string;
    workspaceId: string;
    billingAccountId: string;
    control: "abort_failed_boundary" | "hiccup_retry";
    from?: "running";
    holdLedgerId?: string;
  },
): Promise<{ action: "failed_boundary" | "hiccup" }> {
  if (args.control === "abort_failed_boundary") {
    await failRun(deps, {
      runId: args.runId,
      workspaceId: args.workspaceId,
      billingAccountId: args.billingAccountId,
      from: args.from ?? "running",
      failure: { code: "boundary", message: "aborted at a boundary (3 denials of one path)", retryable: false },
      holdLedgerId: args.holdLedgerId,
    });
    return { action: "failed_boundary" };
  }
  await deps.txRunner.run(args.workspaceId, (tx) =>
    deps.eventWriter.append(tx, {
      runId: args.runId,
      type: "run.hiccup",
      payload: { reason: "repeated boundary denials — retrying the phase once" },
      at: deps.clock.now(),
    }),
  );
  return { action: "hiccup" };
}

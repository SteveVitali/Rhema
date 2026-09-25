// Orchestrator reactions to phase-loop / boundary / egress signals (§12.4 phase loop; §12.6/§12.8; REQ-ARCH-32;
// REQ-WF-5). These are the "what the orchestrator does when" pieces of the phase loop deliverable that sit
// beside the completion oracle: back-edge (re-plan) counting and re-opening Approve-plan, the run-pause
// reaction to a suspicious_query / egress.denied spike, and acting on the boundary hook's control signal.

import type { Clock } from "./clock.js";
import type { EventWriter } from "./event-writer.js";
import type { TxRunner } from "./tx.js";
import { applyTransition } from "./transition.js";
import { openGate, failRun, type OrchestratorDeps } from "./internal-api.js";
import { resolveGatePolicy, type ApprovalPolicy } from "./gate-policy.js";
import { conditionalResolve, writeDecision, emitGateResolved } from "./gate-resolution.js";
import { scheduleGateNotifications } from "./notifications.js";
import type { Queue } from "./queue.js";

/** A phase may re-plan at most twice (§12.2 back-edges; REQ-WF-5). */
export const MAX_REPLANS = 2;

type MinDeps = { eventWriter: EventWriter; clock: Clock; txRunner: TxRunner; queue?: Queue };

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
 * Re-open Approve-plan (§6.4; §12.2; REQ-GATE-6) — when a declared back-edge changes the plan artifact's hash
 * after it was approved. Under a NAMED policy the gate re-opens and the run parks (`running → waiting_gate`);
 * under Run-to-completion or the autonomous flag it AUTO-APPROVES within the consented cap (a gate row + a
 * `Decision{by:'policy'}`, the run staying `running` so the phase loop continues). The plan-hash-change
 * DETECTION uses P0.09's committed artifact hashes; this is the reaction.
 */
export async function reopenApprovePlan(
  deps: MinDeps & { ids: OrchestratorDeps["ids"] },
  args: {
    runId: string;
    workspaceId: string;
    stepId?: string;
    artifactVersionId?: string;
    /** the project's approval policy + autonomous flag; default named (park). */
    policy?: ApprovalPolicy;
    gatesOff?: boolean;
  },
): Promise<{ gateId: string; autoApproved: boolean }> {
  const now = deps.clock.now();
  const decision = resolveGatePolicy("approve_plan", { policy: args.policy ?? "named", gatesOff: args.gatesOff, now });

  return deps.txRunner.run(args.workspaceId, async (tx) => {
    if (decision.action === "skip") {
      // auto-approve within the consented cap: a gate row for the record + a policy Decision; stay running.
      const gateId = await openGate(tx, deps, {
        runId: args.runId,
        kind: "approve_plan",
        blocking: true,
        onExpiry: "proceed_conservative",
        stepId: args.stepId,
        artifactVersionId: args.artifactVersionId,
      });
      await conditionalResolve(tx, gateId, now);
      await writeDecision(tx, now, { gateId, by: "policy", action: "proceed_as_proposed" });
      await emitGateResolved(tx, deps, args.runId, "proceed_as_proposed", "policy", now);
      return { gateId, autoApproved: true };
    }
    // named: re-open and park; P0.10's resolveGate resumes.
    await applyTransition(tx, deps, { runId: args.runId, from: "running", to: "waiting_gate", reason: "replan" });
    const gateId = await openGate(tx, deps, {
      runId: args.runId,
      kind: "approve_plan",
      blocking: true,
      onExpiry: "proceed_conservative",
      stepId: args.stepId,
      artifactVersionId: args.artifactVersionId,
    });
    return { gateId, autoApproved: false };
  }).then(async (res) => {
    // PRB.09 — a re-opened approval gate gets the same +15 min waiting notice (no deadline ⇒ no reminders).
    if (!res.autoApproved && deps.queue) {
      await scheduleGateNotifications(
        { queue: deps.queue, clock: deps.clock },
        { gateId: res.gateId, workspaceId: args.workspaceId, kind: "approve_plan", onExpiry: "proceed_conservative", deadlineAt: null, now },
      );
    }
    return res;
  });
}

/**
 * The egress-proxy `PauseReason` set (P1.22 — mirrors `apps/egress-proxy/src/signals.ts` and the
 * `pause_signals.reason` CHECK constraint, 0041): `suspicious_query` (a search query matching ≥12 draft
 * n-grams — §12.8d), `egress_denied_spike` (REQ-ARCH-32), and `user_source_fetch` — a Memo run
 * web-fetching one of its own `user_sources[]` domains (P1.21; REQ-WF-8; §16.4's confidentiality row).
 */
export type PauseReason = "suspicious_query" | "egress_denied_spike" | "user_source_fetch";

/**
 * Pause a run in reaction to an egress signal (REQ-ARCH-32): a `suspicious_query`, an `egress.denied`
 * spike, or a `user_source_fetch` boundary violation. The run parks at a refusal-class card (`running →
 * waiting_gate` + a `refusal` gate); the sandbox exits, so a paused run consumes no compute. The proxy
 * EMITS the signal (`SqlSignalSink` → `pause_signals`); the worker's `drainPauseSignals` sweep applies
 * this reaction (P1.22's end-to-end wiring).
 */
export async function pauseRun(
  deps: MinDeps & { ids: OrchestratorDeps["ids"] },
  args: { runId: string; workspaceId: string; reason: PauseReason },
): Promise<{ gateId: string }> {
  const res = await deps.txRunner.run(args.workspaceId, async (tx) => {
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
  // PRB.09 — a paused run emails too (a refusal card is "Paused run"; the waiting notice carries the
  // do-nothing outcome — cancel — plus the deep link).
  if (deps.queue) {
    await scheduleGateNotifications(
      { queue: deps.queue, clock: deps.clock },
      { gateId: res.gateId, workspaceId: args.workspaceId, kind: "refusal", onExpiry: "cancel", deadlineAt: null, now: deps.clock.now() },
    );
  }
  return res;
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

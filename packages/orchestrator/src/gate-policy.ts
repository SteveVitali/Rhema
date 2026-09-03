// Gate policy resolution (§6.4 item 3; REQ-GATE-3; REQ-SPEC-1; REQ-SPEC-17). Given a gate kind and the run's
// approval policy + validated per-kind overrides + context, decide whether to OPEN the gate (with the deadline
// and onExpiry computed from the §6.4 R3 defaults, carried as data in @rhema/contracts) or SKIP it by policy
// (Run to completion / "Approve and run autonomously" — a Decision{by:'policy'} row, never a park). Pure: the
// orchestrator opens/resolves; this only decides. Spend/refusal kinds never skip and never auto-proceed (AC2).

import { GATE_DEFAULTS, type ApprovalOverrides, type GateKind, type GateOnExpiry } from "@rhema/contracts";

const HOUR_MS = 60 * 60 * 1000;

/** The per-project approval policy (§6.4 item 3; `projects.approval_policy`). */
export type ApprovalPolicy = "named" | "wait_each" | "run_to_completion";

export interface GatePolicyContext {
  readonly policy: ApprovalPolicy;
  /** validated `Project.approvalOverrides` (schema-checked at write; may only lengthen/remove/add — REQ-SPEC-1). */
  readonly overrides?: ApprovalOverrides | null;
  /** "Approve and run autonomously" was taken earlier this run — later NAMED gates are turned off (REQ-GATE-3). */
  readonly gatesOff?: boolean;
  readonly now: Date;
  // approve_scope context (REQ-SPEC-17): blocking when Full board / protocol|venue changed / Wait-for-me-each.
  readonly scopeBlocking?: boolean;
  /** the re-priced estimate exceeds the consented cap → the scope card is a spend gate that waits. */
  readonly scopeExceedsCap?: boolean;
  /** continue_rounds autonomy: Run all rounds proceeds; else Ask each round waits. */
  readonly runAllRounds?: boolean;
}

export type GatePolicyResolution =
  | { readonly action: "open"; readonly blocking: boolean; readonly onExpiry: GateOnExpiry; readonly deadlineAt: Date | null }
  | { readonly action: "skip"; readonly by: "policy"; readonly reason: "run_to_completion" | "autonomous" };

/**
 * Named gates a Run-to-completion / autonomous policy skips. Spend/refusal kinds always open (they never
 * auto-proceed, REQ-SPEC-1); continue_rounds always opens (it "ignores Run to completion and gates every
 * round", §6.4 R3).
 */
export function isNamedGate(kind: GateKind): boolean {
  return !GATE_DEFAULTS[kind].neverAutoProceed && kind !== "continue_rounds";
}

/**
 * Resolve the policy for a gate about to open. Returns `skip` (Decision{by:'policy'}, no park) for a named gate
 * under Run-to-completion or the autonomous flag; otherwise `open` with the deadline/onExpiry/blocking computed
 * from the R3 defaults, the project's overrides, and the run's context.
 */
export function resolveGatePolicy(kind: GateKind, ctx: GatePolicyContext): GatePolicyResolution {
  const def = GATE_DEFAULTS[kind];

  // Run-to-completion / autonomous: skip named gates. Spend/refusal + continue_rounds still open.
  if ((ctx.policy === "run_to_completion" || ctx.gatesOff) && isNamedGate(kind)) {
    const reason = ctx.policy === "run_to_completion" ? "run_to_completion" : "autonomous";
    return { action: "skip", by: "policy", reason };
  }

  let blocking = def.blocking;
  let onExpiry: GateOnExpiry = def.onExpiry;
  let deadlineMs = def.deadlineMs;

  // approve_scope (REQ-SPEC-17): informational unless a blocking condition; a cap-exceeding re-price waits.
  if (kind === "approve_scope") {
    if (ctx.scopeExceedsCap) {
      blocking = true;
      onExpiry = "wait";
      deadlineMs = null;
    } else if (ctx.scopeBlocking) {
      blocking = true;
      onExpiry = "proceed_as_proposed";
      deadlineMs = 2 * HOUR_MS;
    }
  }

  // continue_rounds: Run all rounds proceeds immediately at each boundary.
  if (kind === "continue_rounds" && ctx.runAllRounds) {
    onExpiry = "proceed_as_proposed";
    deadlineMs = 0;
  }

  if (ctx.policy === "wait_each") {
    // "Wait for me at each — no deadlines anywhere; the scope card blocks." The never-auto-proceed guarantee is
    // preserved (spend/refusal keep their own onExpiry; they still never proceed_*).
    deadlineMs = null;
    onExpiry = def.neverAutoProceed ? def.onExpiry : "wait";
    blocking = true;
  } else {
    // Apply a validated per-kind override (never present for spend/refusal — schema-guaranteed).
    const override = ctx.overrides?.[kind];
    if (override !== undefined && !def.neverAutoProceed) {
      if (override === null) {
        deadlineMs = null; // remove → wait
        onExpiry = "wait";
      } else if (def.deadlineMs === null) {
        deadlineMs = override; // add (only wait-default kinds pass the schema)
        onExpiry = "proceed_as_proposed";
      } else {
        deadlineMs = Math.max(override, def.deadlineMs); // lengthen (never below the default)
      }
    }
  }

  const deadlineAt = deadlineMs === null ? null : new Date(ctx.now.getTime() + deadlineMs);
  return { action: "open", blocking, onExpiry, deadlineAt };
}

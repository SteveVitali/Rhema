// Gate policy resolution (§6.4 item 3; REQ-GATE-3; REQ-SPEC-1; REQ-SPEC-17). Given a gate kind and the run's
// approval policy + validated per-kind overrides + context, decide whether to OPEN the gate (with the deadline
// and onExpiry computed from the §6.4 R3 defaults, carried as data in @rhema/contracts) or SKIP it by policy
// (Run to completion / "Approve and run autonomously" — a Decision{by:'policy'} row, never a park). Pure: the
// orchestrator opens/resolves; this only decides. Spend/refusal kinds never skip and never auto-proceed (AC2).

import {
  approvalOverridesSchema,
  GATE_DEFAULTS,
  type ApprovalOverrides,
  type GateKind,
  type GateOnExpiry,
} from "@rhema/contracts";

const HOUR_MS = 60 * 60 * 1000;

/** The per-project approval policy (§6.4 item 3; `projects.approval_policy`). */
export type ApprovalPolicy = "named" | "wait_each" | "run_to_completion";

export interface GatePolicyContext {
  readonly policy: ApprovalPolicy;
  /** validated `Project.approvalOverrides` (schema-checked at write; may only lengthen/remove/add — REQ-SPEC-1). */
  readonly overrides?: ApprovalOverrides | null;
  /**
   * P1.09 (§6.4) — the per-run override (`runs.gate_overrides`): layered OVER the project's overrides
   * — same validated shape, same rules ("this run only"). A run-level `null` REMOVES a deadline even
   * where the project added one; a run-level number sets/lengthens relative to the resolved default.
   */
  readonly runOverrides?: ApprovalOverrides | null;
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
    // Apply validated per-kind overrides — the project's first, the run's layered over it ("this run
    // only"; P1.09). Never present for spend/refusal — schema-guaranteed at every write path.
    const merged: ApprovalOverrides = { ...(ctx.overrides ?? {}), ...(ctx.runOverrides ?? {}) };
    const override = merged[kind];
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

// ---------------------------------------------------------------------------- P1.09 — server-side facts loader

/**
 * The policy facts a gate-open needs, read from the run + project rows (§6.4 item 3). The run's
 * `gate_overrides` (the per-run override, "this run only") layers over the project's
 * `approval_overrides`; `gates_off` is the "Approve and run autonomously" flag; `scopeBlocking` /
 * `runAllRounds` ride the run's frozen inputs. Overrides are re-validated on read — a row that fails
 * the schema is dropped (fail-safe: the defaults apply), never trusted.
 */
export interface GatePolicyFacts {
  readonly policy: ApprovalPolicy;
  readonly overrides: ApprovalOverrides | null;
  readonly runOverrides: ApprovalOverrides | null;
  readonly gatesOff: boolean;
  readonly scopeBlocking: boolean;
  /** the re-priced estimate exceeds the consented cap (the scope card becomes a spend gate). */
  readonly scopeExceedsCap: boolean;
  readonly runAllRounds: boolean;
}

export async function loadGatePolicyFacts(
  exec: { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> },
  runId: string,
): Promise<GatePolicyFacts | null> {
  const row = (
    await exec.query(
      `select r.gates_off, r.gate_overrides, r.inputs, r.estimate_credits, r.cap_credits,
              p.approval_policy, p.approval_overrides
         from runs r left join projects p on p.id = r.project_id
        where r.id = $1`,
      [runId],
    )
  ).rows[0] as
    | {
        gates_off: boolean;
        gate_overrides: unknown;
        inputs: Record<string, unknown> | null;
        estimate_credits: number;
        cap_credits: number;
        approval_policy: string | null;
        approval_overrides: unknown;
      }
    | undefined;
  if (!row) return null;
  const project = approvalOverridesSchema.safeParse(row.approval_overrides ?? {});
  const run = approvalOverridesSchema.safeParse(row.gate_overrides ?? {});
  const policy = row.approval_policy;
  return {
    policy:
      policy === "wait_each" || policy === "run_to_completion" || policy === "named"
        ? policy
        : "named",
    overrides: project.success ? project.data : null,
    runOverrides: run.success ? run.data : null,
    gatesOff: row.gates_off === true,
    scopeBlocking: row.inputs?.["scopeBlocking"] === true,
    scopeExceedsCap: row.estimate_credits > row.cap_credits,
    runAllRounds: row.inputs?.["runAllRounds"] === true,
  };
}

/** Build a `GatePolicyContext` from the loaded facts (pure — the loader's fields + `now`). */
export function gatePolicyContextFromFacts(
  facts: GatePolicyFacts,
  now: Date,
): GatePolicyContext {
  return {
    policy: facts.policy,
    overrides: facts.overrides,
    runOverrides: facts.runOverrides,
    gatesOff: facts.gatesOff,
    now,
    scopeBlocking: facts.scopeBlocking,
    scopeExceedsCap: facts.scopeExceedsCap,
    runAllRounds: facts.runAllRounds,
  };
}

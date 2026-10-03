// Gate policy resolution (§6.4 item 3; REQ-GATE-3; REQ-SPEC-1; REQ-SPEC-17). The PURE resolver moved to
// `@rhema/contracts` (RUN.1 / ADR-050): the run sheet, the gate card labels, the Inbox row, and the
// orchestrator's park decision must read the ONE resolution — a copy held here would drift. This module
// keeps the server-side facts loader (SQL) and re-exports the resolver for existing orchestrator callers.

export {
  isNamedGate,
  resolveGatePolicy,
  resolveScopeGate,
  type ApprovalPolicy,
  type GatePolicyContext,
  type GatePolicyResolution,
  type ResolvedScopeGate,
} from "@rhema/contracts";

import {
  approvalOverridesSchema,
  type ApprovalOverrides,
  type GatePolicyContext,
} from "@rhema/contracts";

/**
 * The policy facts a gate-open needs, read from the run + project rows (§6.4 item 3). The run's
 * `gate_overrides` (the per-run override, "this run only") layers over the project's
 * `approval_overrides`; `gates_off` is the "Approve and run autonomously" flag; `scopeBlocking` /
 * `runAllRounds` ride the run's frozen inputs. Overrides are re-validated on read — a row that fails
 * the schema is dropped (fail-safe: the defaults apply), never trusted.
 */
export interface GatePolicyFacts {
  readonly policy: "named" | "wait_each" | "run_to_completion";
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

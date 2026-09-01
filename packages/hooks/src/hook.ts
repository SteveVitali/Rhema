// @rhema/hooks — the PreToolUse hook evaluator (§12.6 tool layer).
//
// One pure function classifies every matched tool call against the per-run seat policy, denies out-of-
// namespace reads / read-only writes / escapes / recursive-over-root / hold-out fetches / `Agent` in
// judge-class phases (each with a one-line reason), records an audit row for every decision, and threads
// the denial thresholds. The same code runs for every seat and engine (REQ-ARCH-17); policy is data.

import type {
  AccessLogRow,
  ControlSignal,
  FetchLogRow,
  HookDecision,
  Namespace,
  SeatPolicy,
  ToolUse,
} from "./types.js";
import { MATCHER_TOOLS, SUBAGENT_TOOLS, WRITE_TOOLS } from "./types.js";
import type { AuditSink } from "./audit.js";
import type { DenialState } from "./denials.js";
import { recordDenial } from "./denials.js";
import { classifyPath, bashPathTokens, bashRecursiveOverRoot, searchTargetsRoot } from "./paths.js";
import type { RealpathResolver } from "./realpath.js";
import { defaultRealpath } from "./realpath.js";
import { evaluateUrl } from "./url-policy.js";

export interface EvalContext {
  /** Timestamp source for audit rows (default `Date.now`), injectable for deterministic tests. */
  readonly now?: () => string;
  /** Realpath resolver (default follows symlinks via `node:fs`); inject a fake for pure tests. */
  readonly resolveRealpath?: RealpathResolver;
  /** If given, every audit row is also written to this sink as it is produced. */
  readonly sink?: AuditSink;
}

const asStrings = (xs: readonly string[]): readonly string[] => xs;

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * SDK tool name → the `agent_types.tools` capability token it requires. `null` = governed here but not by
 * the token set (Bash: gated by the path/recursive checks + the kernel read-only mount + the SDK config,
 * per §12.6, not by a seat token — no seat carries a "bash" token). A tool absent from this map is outside
 * the hook's remit and passes through.
 */
const TOOL_TOKEN: Record<string, string | null | undefined> = {
  Read: "read",
  Glob: "read",
  Grep: "read",
  Write: "write",
  Edit: "write",
  MultiEdit: "write",
  WebFetch: "web_fetch",
  WebSearch: "web_search",
  Bash: null,
  Agent: "subagent",
  Task: "subagent",
};

/** One per-path sub-decision within a tool use. */
interface PathEval {
  readonly resolved: string;
  readonly namespace: Namespace | null;
  readonly decision: "allow" | "deny";
  readonly reason?: string;
}

function evalPath(
  rawPath: string,
  intent: "read" | "write" | "search",
  policy: SeatPolicy,
  resolveRealpath: RealpathResolver,
): PathEval {
  const c = classifyPath(rawPath, policy, resolveRealpath);
  if (c.escaped) {
    return { resolved: c.resolved, namespace: null, decision: "deny", reason: "path escapes the sandbox root" };
  }
  if (!c.rule) {
    const reason = intent === "write" ? "write outside the seat namespace" : "read outside the seat namespace";
    return { resolved: c.resolved, namespace: null, decision: "deny", reason };
  }
  if (intent === "write" && c.rule.mode === "read") {
    return { resolved: c.resolved, namespace: c.namespace, decision: "deny", reason: "write to a read-only path" };
  }
  return { resolved: c.resolved, namespace: c.namespace, decision: "allow" };
}

/**
 * Evaluate one tool use against the seat policy. Returns the allow/deny verdict, a one-line reason on
 * denial, any denial-threshold control signal, and the audit rows produced (also written to `ctx.sink`).
 */
export function evaluateToolUse(
  use: ToolUse,
  policy: SeatPolicy,
  state: DenialState,
  ctx: EvalContext = {},
): HookDecision {
  const ts = ctx.now?.() ?? new Date().toISOString();
  const resolveRealpath = ctx.resolveRealpath ?? defaultRealpath;
  const access: AccessLogRow[] = [];
  const fetchRows: FetchLogRow[] = [];
  const tool = use.tool;

  const emitAccess = (path: string, namespace: Namespace | null, decision: "allow" | "deny"): void => {
    const row: AccessLogRow = { runId: policy.runId, ts, agentLabel: policy.agentLabel, tool, path, namespace, decision };
    access.push(row);
    ctx.sink?.writeAccess(row);
  };
  const emitFetch = (row: FetchLogRow): void => {
    fetchRows.push(row);
    ctx.sink?.writeFetch(row);
  };
  const done = (
    decision: "allow" | "deny",
    reason: string | undefined,
    denyTarget: string | undefined,
  ): HookDecision => {
    let control: ControlSignal | undefined;
    if (decision === "deny" && denyTarget !== undefined) control = recordDenial(state, denyTarget);
    return { decision, ...(reason ? { reason } : {}), ...(control ? { control } : {}), accessRows: access, fetchRows };
  };

  // ---- tool-set enforcement (REQ-ARCH-17; the invariant: this hook enforces, `disallowedTools` is cosmetic) ----
  // A matched/subagent tool whose capability token the seat's `agent_types.tools` set lacks is denied. Bash
  // (token null) and non-matched tools (token undefined) are not gated here.
  const token = TOOL_TOKEN[tool];
  if (token != null && !policy.tools.has(token)) {
    emitAccess("", null, "deny");
    return done("deny", `the ${policy.seat} seat may not use ${tool}`, `tool:${tool}`);
  }

  // ---- subagent tools: rejected in judge-class phases (§12.2 / REQ-SPEC-13) ----
  if (asStrings(SUBAGENT_TOOLS).includes(tool)) {
    const label = str(use.input.subagent_type) ?? str(use.input.description) ?? "agent";
    if (policy.phase.phaseClass === "judge" || !policy.phase.allowsSubagents) {
      emitAccess(label, null, "deny");
      return done("deny", `Agent calls are not permitted in a ${policy.phase.phaseClass}-class phase`, `Agent:${label}`);
    }
    emitAccess(label, null, "allow");
    return done("allow", undefined, undefined);
  }

  // ---- URL tools ----
  if (tool === "WebSearch") {
    const query = str(use.input.query);
    emitFetch({ runId: policy.runId, ts, agentLabel: policy.agentLabel, kind: "search", ...(query ? { query } : {}), decision: "allow" });
    return done("allow", undefined, undefined);
  }
  if (tool === "WebFetch") {
    const url = str(use.input.url) ?? "";
    const r = evaluateUrl(url, policy.urlPolicy, { isCalibrator: policy.isCalibrator });
    emitFetch({
      runId: policy.runId,
      ts,
      agentLabel: policy.agentLabel,
      kind: "fetch",
      url,
      normalizedUrl: r.normalizedUrl,
      decision: r.decision,
      ...(r.denyReason ? { denyReason: r.denyReason } : {}),
    });
    return done(r.decision, r.reason, r.decision === "deny" ? r.normalizedUrl : undefined);
  }

  // ---- path tools ----
  const evals: PathEval[] = [];
  if (tool === "Read") {
    const p = str(use.input.file_path) ?? str(use.input.path);
    if (p) evals.push(evalPath(p, "read", policy, resolveRealpath));
  } else if (asStrings(WRITE_TOOLS).includes(tool)) {
    const p = str(use.input.file_path) ?? str(use.input.path);
    if (p) evals.push(evalPath(p, "write", policy, resolveRealpath));
  } else if (tool === "Glob" || tool === "Grep") {
    const searchPath = str(use.input.path);
    const pattern = str(use.input.pattern) ?? "";
    if (searchTargetsRoot(searchPath, policy)) {
      emitAccess(classifyPath(searchPath ?? ".", policy, resolveRealpath).resolved, null, "deny");
      return done("deny", "recursive operation over the root", policy.roots.project);
    }
    // A `..` in the glob pattern would let the search climb out of the search base (Finding 8).
    if (pattern.split("/").includes("..")) {
      emitAccess(classifyPath(searchPath ?? ".", policy, resolveRealpath).resolved, null, "deny");
      return done("deny", "search pattern escapes the search base", policy.roots.project);
    }
    evals.push(evalPath(searchPath ?? ".", "search", policy, resolveRealpath));
  } else if (tool === "Bash") {
    const command = str(use.input.command) ?? "";
    if (bashRecursiveOverRoot(command, policy)) {
      emitAccess(policy.roots.project, null, "deny");
      return done("deny", "recursive operation over the root", policy.roots.project);
    }
    for (const tok of bashPathTokens(command)) evals.push(evalPath(tok, "read", policy, resolveRealpath));
  } else if (!asStrings(MATCHER_TOOLS).includes(tool)) {
    // Not a matched tool and not a subagent tool: outside this hook's remit — pass through, no audit.
    return { decision: "allow", accessRows: access, fetchRows };
  }

  // Emit an audit row per classified path; the tool-level decision denies if any path denies.
  for (const e of evals) emitAccess(e.resolved, e.namespace, e.decision);
  const firstDeny = evals.find((e) => e.decision === "deny");
  if (firstDeny) return done("deny", firstDeny.reason, firstDeny.resolved);
  return done("allow", undefined, undefined);
}

/**
 * Adapt a `HookDecision` to the Claude Agent SDK `PreToolUse` hook output shape. Kept dependency-free (the
 * SDK is not a dep here); P0.06 wires this into `query({ hooks })`. The control signal rides along so the
 * orchestrator can act on the denial thresholds (P0.08).
 */
export function toPreToolUseResult(decision: HookDecision): {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    permissionDecision: "allow" | "deny";
    permissionDecisionReason?: string;
  };
  rhemaControl?: ControlSignal;
} {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision.decision,
      ...(decision.reason ? { permissionDecisionReason: decision.reason } : {}),
    },
    ...(decision.control ? { rhemaControl: decision.control } : {}),
  };
}

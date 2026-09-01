// @rhema/hooks — subagent policy (REQ-DATA-12/13).
//
// Subagents inherit the hook (same process tree) and are attributed by `agent_id` (REQ-DATA-12). The
// orchestrator — not the parent model — launches input-scoped subagents (§12.6): a private mount namespace
// holding exactly the enumerated files, `tools: ["Read"]`, no Bash. And, belt-and-braces (REQ-DATA-13),
// the allowed-path set is rendered verbatim into the subagent's prompt even though the mount already
// enforces it.

import type { MountRule, SeatPolicy } from "./types.js";
import { classifyPath } from "./paths.js";
import type { RealpathResolver } from "./realpath.js";
import { lexicalRealpath } from "./realpath.js";

/**
 * Render the seat's allowed-path set as prompt text (REQ-DATA-13). Redundant with the mount, harmless, and
 * the source conventions' "subagents told the allowed-path set verbatim" guarantee (§12.10).
 */
export function renderAllowedPaths(policy: SeatPolicy): string {
  const line = (m: MountRule): string => `  - ${m.base}/${m.glob} (${m.mode})`;
  const readable = policy.mounts.filter((m) => m.mode === "read").map(line);
  const writable = policy.mounts.filter((m) => m.mode === "readwrite").map(line);
  const parts = ["Allowed paths for this run (enforced by the sandbox; listed here for reference):"];
  parts.push("Readable:", ...(readable.length ? readable : ["  (none)"]));
  parts.push("Writable:", ...(writable.length ? writable : ["  (none)"]));
  return parts.join("\n");
}

export interface SubagentOptions {
  /** The attributing `agent_id` for the subagent (REQ-DATA-12). */
  readonly agentLabel: string;
  /**
   * For an input-scoped subagent (§12.6): the exact enumerated files it may read. When given, the
   * subagent's mounts collapse to just these (read-only) and its capability tokens default to `["read"]`
   * (so the tool-set gate permits only reads; `Write`/`WebFetch`/`Agent` are denied). "No Bash" for scoped
   * subagents is enforced by the SDK `tools` config + the private mount namespace (§12.6), not this token
   * set — no seat carries a "bash" token.
   */
  readonly scopedFiles?: readonly string[];
  /** Override the capability-token set (defaults: inherit the parent's, or `["read"]` for a scoped subagent). */
  readonly tools?: Iterable<string>;
  /** True for the input-scoped holdout-calibrator (§12.6). */
  readonly isCalibrator?: boolean;
  /** Realpath resolver for scoping the enumerated files (default lexical). */
  readonly resolveRealpath?: RealpathResolver;
}

/**
 * Derive a subagent policy from its parent. A plain subagent (researcher fan-out) inherits the parent's
 * mounts and tools; an input-scoped subagent (`scopedFiles`) is narrowed to exactly those files, read-only.
 * Both are attributed by their own `agent_id` and share the run's URL policy and phase.
 */
export function inheritForSubagent(parent: SeatPolicy, opts: SubagentOptions): SeatPolicy {
  const resolveRealpath = opts.resolveRealpath ?? lexicalRealpath;

  let mounts: readonly MountRule[];
  let tools: ReadonlySet<string>;
  if (opts.scopedFiles) {
    mounts = opts.scopedFiles.map((f) => {
      const c = classifyPath(f, parent, resolveRealpath);
      const base = c.resolved.startsWith(parent.roots.persona ?? "\0")
        ? parent.roots.persona!
        : parent.roots.project;
      const rel = c.resolved === base ? "" : c.resolved.slice(base.length + 1);
      const root = base === parent.roots.project ? "project" : "persona";
      return { glob: rel, root, mode: "read", namespace: c.namespace ?? "shared", base } as MountRule;
    });
    tools = new Set(opts.tools ?? ["read"]);
  } else {
    mounts = parent.mounts;
    tools = new Set(opts.tools ?? parent.tools);
  }

  return {
    ...parent,
    mounts,
    tools,
    agentLabel: opts.agentLabel,
    ...(opts.isCalibrator ? { isCalibrator: true } : {}),
  };
}

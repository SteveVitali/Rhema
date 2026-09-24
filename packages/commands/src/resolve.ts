// Resolution — the one mapping from a ParsedCommand to what a surface DOES with it. Cost-bearing
// verbs resolve to the run sheet's canonical route (`/p/:slug/run?…`); free actions navigate; 1.x
// verbs resolve disabled-with-reason. Palette, selection popover, context menu and (later) the
// composer all call this — four surfaces, one parsed command, an IDENTICAL sheet (REQ-CHAT-22,
// REQ-CHAT-25: the palette never launches a run; it routes to the sheet).

import { verbSpec } from "./verbs.js";
import { serializeScopes } from "./scopes.js";
import type { CommandResolution, ParsedCommand } from "./types.js";

export interface ResolveContext {
  /** the project slug the sheet route targets. */
  readonly projectSlug: string;
}

/**
 * Serialize a parsed command into the run sheet's query params (the byte-identical contract every
 * surface produces). `scope` uses the canonical `serializeScopes` form; `--no-*` toggles serialize as
 * `toggle.<key>=off`; guidance rides verbatim.
 */
export function sheetQueryForCommand(command: ParsedCommand): Record<string, string> {
  const spec = verbSpec(command.verb);
  const q: Record<string, string> = {};
  if (spec?.workflow) q.workflow = spec.workflow;
  if (command.scopes.length > 0) q.scope = serializeScopes(command.scopes);
  const l = command.levers;
  if (l.rigor) q.rigor = l.rigor;
  if (l.modelTier) q.tier = l.modelTier;
  if (l.stage) q.stage = l.stage;
  if (l.protocol) q.protocol = l.protocol;
  if (l.venue) q.venue = l.venue;
  if (l.approvals) q.approvals = l.approvals;
  if (l.tiers) q.tiers = l.tiers;
  if (l.sources != null) q.sources = String(l.sources);
  if (l.strata) q.strata = l.strata;
  if (l.target != null) q.target = String(l.target);
  if (l.protect?.length) q.protect = l.protect.join(",");
  if (l.map) q.map = "1";
  if (l.until) q.until = l.until;
  if (l.max != null) q.max = String(l.max);
  if (l.budget != null) q.budget = String(l.budget);
  if (l.variants?.length) q.variants = l.variants.join(",");
  for (const [k, on] of Object.entries(l.toggles ?? {})) q[`toggle.${k}`] = on ? "on" : "off";
  if (command.guidance) q.guidance = command.guidance;
  return q;
}

/**
 * Resolve a parsed command. The sheet path is `/p/:slug/run?…` — opening the sheet, NEVER creating
 * the run (REQ-IDE-49: no verb launches a run without the sheet).
 */
export function resolveCommand(command: ParsedCommand, ctx: ResolveContext): CommandResolution {
  const spec = verbSpec(command.verb);
  if (!spec) return { kind: "disabled", reason: `Unknown verb “${command.verb}”.` };
  if (spec.phase === "one_x") {
    return { kind: "disabled", reason: spec.disabledReason ?? `${spec.label} is a 1.x workflow — not yet available.` };
  }

  if (spec.workflow) {
    const query = sheetQueryForCommand(command);
    const qs = new URLSearchParams(query).toString();
    return { kind: "sheet", workflow: spec.workflow, query, path: `/p/${ctx.projectSlug}/run?${qs}` };
  }

  // Free navigation verbs (never cost-bearing — REQ-GROWTH-13 forbids a paywall on export anyway).
  if (spec.verb === "export") {
    const v = command.scopes.find((s) => s.kind === "version");
    const q = v && v.kind === "version" ? `?v=${v.version}` : "";
    return { kind: "navigate", path: `/p/${ctx.projectSlug}/export${q}` };
  }
  if (spec.verb === "compare") {
    const versions = command.scopes.filter((s): s is Extract<typeof s, { kind: "version" }> => s.kind === "version");
    if (versions.length < 2) {
      return { kind: "disabled", reason: "Compare needs two versions — e.g. /compare @v2 @v3." };
    }
    const [a, b] = versions;
    // the version page is the MVP anchor; ?compare=<older> hints the diff surface that lands later.
    return { kind: "navigate", path: `/p/${ctx.projectSlug}/v/${b!.version}?compare=${a!.version}` };
  }
  return { kind: "disabled", reason: `${spec.label} has no surface yet.` };
}

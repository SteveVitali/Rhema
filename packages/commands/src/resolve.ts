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
    // UX.1 — no build-vocabulary in a user-facing reason: the fallback is honest + product-shaped.
    return { kind: "disabled", reason: spec.disabledReason ?? `${spec.label} isn't available yet.` };
  }

  if (spec.workflow) {
    const query = sheetQueryForCommand(command);
    // P1.13 — the Figure run launches from its OWN sheet (`/p/:slug/visualize`), not the generic
    // run sheet: the §7.5 card's fields (request, provenance seeds, iterate id) don't exist on the
    // run sheet's review/draft form. The scopes map to the sheet's query params verbatim —
    // selection ⇒ entry=selection; @claim:/@asset: ride the request text (the POST classifies them
    // into the provenance seed); @figure: names the iterate target; free text ⇒ the request.
    if (spec.workflow === "figure") {
      const q: Record<string, string> = {};
      const requestParts: string[] = [];
      let entry = "chat";
      for (const s of command.scopes) {
        if (s.kind === "selection") entry = "selection";
        else if (s.kind === "claim") requestParts.push(`@claim:${s.version != null ? `v${s.version}/` : ""}${s.ordinal}`);
        else if (s.kind === "asset") requestParts.push(`@asset:${s.ref}`);
        else if (s.kind === "figure") q.figure = s.ref;
      }
      if (command.guidance) requestParts.push(command.guidance);
      if (requestParts.length > 0) q.request = requestParts.join(" ");
      q.entry = entry;
      const qs = new URLSearchParams(q).toString();
      return { kind: "sheet", workflow: spec.workflow, query: q, path: `/p/${ctx.projectSlug}/visualize${qs ? `?${qs}` : ""}` };
    }
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
    // P1.08 — the §5.8 compare surface is live: /v/:n/diff/:m (the api normalizes direction, so the
    // pair order the user typed is preserved).
    return { kind: "navigate", path: `/p/${ctx.projectSlug}/v/${a!.version}/diff/${b!.version}` };
  }
  return { kind: "disabled", reason: `${spec.label} has no surface yet.` };
}

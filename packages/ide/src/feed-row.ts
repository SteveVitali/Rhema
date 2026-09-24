// The live feed's row formatter (§5.5; REQ-IDE-14; P1.05). Shared by the SSR feed render AND the ide.js
// island's SSE handler so both produce the SAME rows. Every row's words come from the app's copy table —
// delivered to the island as embedded label maps (`FeedLabelMaps`), never authored client-side — and only
// the event's whitelisted payload fields interpolate ({phase} → the phase's copy label, {claimOrdinal} →
// the number). An event type with no template renders NOTHING (fail-closed: no un-catalogued row shows).
// Payloads are already §12.5-whitelist-bounded (≤280 chars, no prompts/reasoning/memory — REQ-DATA-37).

/** The feed's user-facing densities (§5.5) — contract "normal" maps to the "details" tab. */
export type FeedDensityTab = "summary" | "details" | "verbose";

/**
 * The label maps the app embeds for the island (`data-feed-labels` JSON) and passes to SSR.
 * `t` maps event type → row template; `enums` maps a placeholder name → payload value → display label
 * (phases, verdicts, run states, gate kinds, artifact kinds, booleans). Templates reference payload
 * fields as `{field}`.
 */
export interface FeedLabelMaps {
  readonly t: Readonly<Record<string, string>>;
  readonly enums: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/** The contract event density → the feed tab it belongs to (§5.5). */
export function feedTabForContractDensity(density: string): FeedDensityTab | null {
  if (density === "summary") return "summary";
  if (density === "normal") return "details";
  if (density === "verbose") return "verbose";
  return null; // "internal" or unknown — never a feed row (REQ-ARCH-12)
}

/** Tab rank for the ≤ comparison (a row shows when its tab ranks at-or-below the selected density). */
const TAB_RANK: Readonly<Record<FeedDensityTab, number>> = { summary: 0, details: 1, verbose: 2 };

/** True when an event at contract `density` renders under the selected feed tab. */
export function feedRowVisible(contractDensity: string, selected: FeedDensityTab): boolean {
  const tab = feedTabForContractDensity(contractDensity);
  return tab != null && TAB_RANK[tab] <= TAB_RANK[selected];
}

interface Rec {
  [k: string]: unknown;
}

function field(payload: Rec, name: string): unknown {
  return payload[name];
}

/**
 * Resolve one `{placeholder}`: `enums[placeholder][payloadValue]` when the enum map has it, else the raw
 * payload value coerced to text (numbers, bounded strings — §12.5 payloads only). Missing → "".
 */
function resolve(payload: Rec, maps: FeedLabelMaps, name: string): string {
  const raw = field(payload, name);
  if (raw == null) return "";
  const s = String(raw);
  const enumMap = maps.enums[name];
  return enumMap?.[s] ?? s;
}

/**
 * Render one streamed event to `{label, detail}` for a feed row — or null when the type has no template
 * (the fail-closed rule: nothing un-catalogued reaches the feed). The label is the filled template; a
 * template that leaves text after `—` splits there into detail (e.g. "Claim {claimOrdinal} — {verdict}").
 */
export function formatFeedRow(
  type: string,
  payload: unknown,
  maps: FeedLabelMaps,
): { readonly label: string; readonly detail?: string } | null {
  const template = maps.t[type];
  if (template == null) return null;
  const p: Rec = typeof payload === "object" && payload !== null ? (payload as Rec) : {};
  const filled = template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, name: string) => resolve(p, maps, name));
  const split = filled.indexOf(" — ");
  if (split < 0) return { label: filled };
  return { label: filled.slice(0, split), detail: filled.slice(split + 3) };
}

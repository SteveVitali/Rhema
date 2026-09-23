// @rhema/egress-proxy — inject the run's URL policy into server-tool request bodies (§12.6 URL layer).
//
// Anthropic's server tools filter by DOMAIN via `allowed_domains` / `blocked_domains` on the tool definition.
// The proxy rewrites every `/v1/messages` body so the run's policy is enforced regardless of what the sandbox
// put there: hold-out / excluded / paywalled domains become `blocked_domains`; the calibrator's narrowing
// becomes `allowed_domains`. The API forbids setting BOTH on one tool, so a run with an allow-list wins and
// its block-list is dropped for that tool. This DUPLICATES the hook's URL layer on purpose (defense in depth).

import type { ProxyUrlPolicy, WebToolPolicy } from "./context.js";

/**
 * The server-tool `type`s the proxy injects (P0.15i). The BASIC variants are used deliberately: they are the
 * broadest-compatible across the whole Rhema model line — the main-context models (`claude-sonnet-5`/
 * `claude-opus-5`/`claude-fable-5`) AND the research fan-out subagent (`claude-haiku-4-5`), which does NOT
 * accept the newer dynamic-filtering `web_search_20260209`/`web_fetch_20260209` variants. Newer models still
 * accept the basic variant, so one constant works for every request the proxy sees. If the roster ever drops
 * Haiku, upgrade per-request off `body.model` to the dynamic-filtering variant.
 */
export const WEB_SEARCH_TOOL_TYPE = "web_search_20250305" as const;
export const WEB_FETCH_TOOL_TYPE = "web_fetch_20250910" as const;
/** Default `max_uses` caps for the injected tools (a per-run budget/cap still bounds real spend). */
export const DEFAULT_WEB_SEARCH_MAX_USES = 15 as const;
export const DEFAULT_WEB_FETCH_MAX_USES = 15 as const;

/** Classify a tool definition as a server web_search / web_fetch tool (or neither), by its name/type tag. */
function serverWebToolKind(tool: unknown): "search" | "fetch" | null {
  if (!tool || typeof tool !== "object") return null;
  const t = tool as { name?: unknown; type?: unknown };
  const tag = `${typeof t.name === "string" ? t.name : ""} ${typeof t.type === "string" ? t.type : ""}`;
  if (tag.includes("web_search")) return "search";
  if (tag.includes("web_fetch")) return "fetch";
  return null;
}

/** A tool definition is a server web tool when its name or type names web_search / web_fetch. */
function isServerWebTool(tool: unknown): tool is Record<string, unknown> {
  return serverWebToolKind(tool) !== null;
}

/**
 * The vendored `claude` CLI's own CLIENT-side web tools (§12.6; P0.15i). It DECLARES these in the request
 * `tools[]` by their Claude Code names regardless of `allowedTools` — and the model, seeing a familiar
 * `WebSearch`, calls it in preference to Anthropic's server-side `web_search`, so no server search executes
 * (`usage_records.searches = 0`, no `web_search_tool_result`, hence `cited_not_fetched`). Confirmed live
 * 2026-09-09 via the proxy request diagnostic. A client fetch/search cannot traverse the sandbox's proxy-only
 * egress anyway. So the proxy STRIPS these from the body, leaving only the injected server tool for the model.
 */
const CLIENT_WEB_TOOL_NAMES: ReadonlySet<string> = new Set(["WebSearch", "WebFetch"]);
function isClientWebTool(tool: unknown): boolean {
  return !!tool && typeof tool === "object" && CLIENT_WEB_TOOL_NAMES.has((tool as { name?: unknown }).name as string);
}

/** The concrete, resolved web-tool config the proxy acts on for one request (defaults filled in). */
export interface ServerWebToolConfig {
  readonly search: boolean;
  readonly fetch: boolean;
  readonly searchMaxUses: number;
  readonly fetchMaxUses: number;
}

/**
 * Resolve the run's `WebToolPolicy` into a concrete config with defaults applied. BOTH web tools default ON:
 * `web_search_20250305` and `web_fetch_20250910` are GA and need no beta header (verified live 2026-09-10).
 * web_fetch matters for `cited⇒fetched`: the fact-check cites specific sources (search results, the draft's own
 * citations) it must FETCH to verify — without it, those cited URLs are never in the proxy fetch log and
 * delivery fails `cited_not_fetched` even though the search ran (diagnosed live P0.15i: 18/40 cited sources were
 * search-adjacent URLs the model never directly fetched). The outbound-channel guards (query-string strip +
 * novel-domain cap, `outbound-limits.ts`) still bound the fetch channel; web_fetch only reaches URLs already in
 * the conversation, so it cannot exfiltrate a novel target.
 */
export function resolveServerWebToolConfig(policy: WebToolPolicy | undefined): ServerWebToolConfig {
  return {
    search: policy?.search ?? true,
    fetch: policy?.fetch ?? true,
    searchMaxUses: policy?.searchMaxUses ?? DEFAULT_WEB_SEARCH_MAX_USES,
    fetchMaxUses: policy?.fetchMaxUses ?? DEFAULT_WEB_FETCH_MAX_USES,
  };
}

/**
 * Ensure the run's server web tools are present in a Messages request body's `tools[]` (§12.6; P0.15i — the
 * last construction blocker before GATE G1). The vendored `claude` CLI does not reliably emit Anthropic's
 * server-side web_search tool (proven live at P0.15h: `searches = 0`), so the proxy — already the run's single
 * meter of record and its only route to `api.anthropic.com` — GUARANTEES the tool, regardless of the CLI. This
 * makes the fact-check's web research REAL and proxy-logged so `cited⇒fetched` (§12.8(c)) has provenance.
 *
 * Two moves, both required for the model to actually do metered, proxy-logged research (confirmed live):
 *   1. STRIP the CLI's client `WebSearch`/`WebFetch` tools (see `isClientWebTool`) — otherwise the model calls
 *      the familiar client `WebSearch` in preference to the server tool and no server search ever runs.
 *   2. ADD-IF-ABSENT the server `web_search` (+ `web_fetch` when enabled). A server web tool already in the body
 *      is left in place (the API rejects two of the same kind; `injectUrlPolicyIntoBody` scopes whichever is
 *      present). Only a Messages request (a `messages` array) is touched; the input body is never mutated.
 * Returns a NEW body when it stripped or added anything, else the body unchanged.
 */
export function ensureServerWebTools(
  body: unknown,
  config: ServerWebToolConfig,
): { body: unknown; added: boolean } {
  if (!config.search && !config.fetch) return { body, added: false };
  if (!body || typeof body !== "object") return { body, added: false };
  const b = body as { messages?: unknown; tools?: unknown };
  // Only a Messages request carries `messages[]`; never inject into other endpoints' bodies.
  if (!Array.isArray(b.messages)) return { body, added: false };

  const tools = Array.isArray(b.tools) ? b.tools : [];
  // (1) strip the CLI's client web tools so they cannot pre-empt the server tool.
  const kept = tools.filter((t) => !isClientWebTool(t));
  const strippedAny = kept.length !== tools.length;
  const hasSearch = kept.some((t) => serverWebToolKind(t) === "search");
  const hasFetch = kept.some((t) => serverWebToolKind(t) === "fetch");

  // (2) add the server web tool(s) the run wants and does not already have.
  const additions: Record<string, unknown>[] = [];
  if (config.search && !hasSearch) {
    additions.push({ type: WEB_SEARCH_TOOL_TYPE, name: "web_search", max_uses: config.searchMaxUses });
  }
  if (config.fetch && !hasFetch) {
    additions.push({ type: WEB_FETCH_TOOL_TYPE, name: "web_fetch", max_uses: config.fetchMaxUses });
  }
  if (!strippedAny && additions.length === 0) return { body, added: false };

  const clone = JSON.parse(JSON.stringify(body)) as { tools?: unknown[] };
  clone.tools = [...kept.map((t) => JSON.parse(JSON.stringify(t)) as unknown), ...additions];
  return { body: clone, added: true };
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function union(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])];
}

/**
 * Rewrite each server web tool in `body.tools` to carry the run's domain policy. Returns a NEW body (the input
 * is not mutated) and whether anything changed. A run with `allowedDomains` narrows to that list (blocked
 * dropped, per the API's mutual-exclusivity rule); otherwise the run's blocked domains are unioned onto the
 * tool's own. When the policy has neither list, the body is returned unchanged.
 */
export function injectUrlPolicyIntoBody(
  body: unknown,
  policy: ProxyUrlPolicy,
): { body: unknown; rewritten: boolean } {
  const hasAllow = (policy.allowedDomains?.length ?? 0) > 0;
  const hasBlock = policy.blockedDomains.length > 0;
  if (!hasAllow && !hasBlock) return { body, rewritten: false };
  if (!body || typeof body !== "object") return { body, rewritten: false };

  const clone = JSON.parse(JSON.stringify(body)) as { tools?: unknown };
  if (!Array.isArray(clone.tools)) return { body, rewritten: false };

  let rewritten = false;
  clone.tools = clone.tools.map((tool) => {
    if (!isServerWebTool(tool)) return tool;
    const t = tool as Record<string, unknown>;
    if (hasAllow) {
      rewritten = true;
      const next = { ...t, allowed_domains: [...(policy.allowedDomains ?? [])] };
      delete (next as Record<string, unknown>)["blocked_domains"];
      return next;
    }
    // block-list mode: union onto whatever the sandbox set, and drop any allow-list (API forbids both).
    rewritten = true;
    const merged = union(asStringArray(t["blocked_domains"]), policy.blockedDomains);
    const next = { ...t, blocked_domains: merged };
    delete (next as Record<string, unknown>)["allowed_domains"];
    return next;
  });

  return rewritten ? { body: clone, rewritten } : { body, rewritten: false };
}

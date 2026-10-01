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
/** Default `max_uses` caps for the injected tools. `max_uses` bounds ONE API call only (per-request — the
 *  model re-issues tools each turn), so the per-RUN budgets below are the real bound (PRB.22). */
export const DEFAULT_WEB_SEARCH_MAX_USES = 15 as const;
export const DEFAULT_WEB_FETCH_MAX_USES = 15 as const;

/**
 * Per-run research budgets (PRB.22 — D-PRB.21-1). Verification research was unbounded: a 701-word review
 * burned 128 fetches + 13 searches and 6.65M cache-read tokens because fetched pages entered context
 * wholesale and every turn re-read them. `DEFAULT_WEB_*_BUDGET` bound a run's TOTAL search/fetch
 * invocations; `DEFAULT_WEB_FETCH_MAX_CONTENT_TOKENS` truncates each fetched page before it enters context
 * (the `max_content_tokens` tool param). The orchestrator authors per-run budgets scaled to the claim count
 * (`authorWebToolPolicy`); these defaults are the fail-safe bound for any credentialed run without one.
 */
export const DEFAULT_WEB_SEARCH_BUDGET = 24 as const;
export const DEFAULT_WEB_FETCH_BUDGET = 48 as const;
export const DEFAULT_WEB_FETCH_MAX_CONTENT_TOKENS = 8000 as const;

/** A run's cumulative server web-tool use so far (history + metered responses), for budget enforcement. */
export interface WebToolUsage {
  readonly searches: number;
  readonly fetches: number;
}

/**
 * Classify a tool definition as a SERVER web_search / web_fetch tool (or neither). RES.1 — the match is the
 * `type` field only (`web_search_20250305` / `web_fetch_20250910` / any `web_*_…` server variant): a bare
 * `{name:"web_search"}` CUSTOM tool is a client tool — it satisfies no server contract and must never
 * suppress the real injection (the 2026-09-30 incident path: a client-named `web_search` counted as "the
 * server tool is already present", so the request went out with a tool the model could call but the
 * provider would never execute — `tool_use` emitted, `searches=0` metered).
 */
function serverWebToolKind(tool: unknown): "search" | "fetch" | null {
  if (!tool || typeof tool !== "object") return null;
  const type = (tool as { type?: unknown }).type;
  if (typeof type !== "string") return null;
  if (type.startsWith("web_search")) return "search";
  if (type.startsWith("web_fetch")) return "fetch";
  return null;
}

/** A tool definition is a server web tool when its `type` names a web_search / web_fetch server variant. */
function isServerWebTool(tool: unknown): tool is Record<string, unknown> {
  return serverWebToolKind(tool) !== null;
}

/**
 * The vendored `claude` CLI's own CLIENT-side web tools (§12.6; P0.15i) — PLUS any custom tool that merely
 * borrows the server tool's name (RES.1). The CLI DECLARES `WebSearch`/`WebFetch` in the request `tools[]`
 * regardless of `allowedTools` — and the model, seeing a familiar `WebSearch`, calls it in preference to
 * Anthropic's server-side `web_search`, so no server search executes (`usage_records.searches = 0`, no
 * `web_search_tool_result`, hence `cited_not_fetched`). Confirmed live 2026-09-09 via the proxy request
 * diagnostic. RES.1 adds the lowercase `web_search`/`web_fetch` names: a sandbox-declared CUSTOM tool under
 * that name is still client-side (no server `type`) and would shadow the real injection exactly the same
 * way. A client fetch/search cannot traverse the sandbox's proxy-only egress anyway. So the proxy STRIPS
 * these from the body, leaving only the injected server tool for the model.
 */
const CLIENT_WEB_TOOL_NAMES: ReadonlySet<string> = new Set(["WebSearch", "WebFetch", "web_search", "web_fetch"]);
function isClientWebTool(tool: unknown): boolean {
  return (
    !!tool &&
    typeof tool === "object" &&
    CLIENT_WEB_TOOL_NAMES.has((tool as { name?: unknown }).name as string) &&
    // a tool that carries a real server `type` is the injected/provider tool, never a client alias.
    serverWebToolKind(tool) === null
  );
}

/** The concrete, resolved web-tool config the proxy acts on for one request (defaults filled in). */
export interface ServerWebToolConfig {
  readonly search: boolean;
  readonly fetch: boolean;
  readonly searchMaxUses: number;
  readonly fetchMaxUses: number;
  /** Run-total invocation budgets (PRB.22); 0 remaining ⇒ the tool is removed from the request. */
  readonly searchBudget: number;
  readonly fetchBudget: number;
  /**
   * RES.1 (REQ-SPEC-31(2)) — the RESEARCH FLOOR: invocations reserved for research-class traffic.
   * A request that is not floor-eligible sees `budget − floor` as its bound; a research-phase (or
   * preflight) request sees the full `budget` — so earlier phases, judge classes and side traffic can
   * never consume the share verification needs. Default 0 (no floor) keeps pre-RES.1 policies identical.
   */
  readonly searchFloor: number;
  readonly fetchFloor: number;
  /** Per-page context truncation applied to every web_fetch tool (`max_content_tokens`). */
  readonly fetchMaxContentTokens: number;
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
    searchBudget: policy?.searchBudget ?? DEFAULT_WEB_SEARCH_BUDGET,
    fetchBudget: policy?.fetchBudget ?? DEFAULT_WEB_FETCH_BUDGET,
    searchFloor: Math.min(policy?.searchFloor ?? 0, policy?.searchBudget ?? DEFAULT_WEB_SEARCH_BUDGET),
    fetchFloor: Math.min(policy?.fetchFloor ?? 0, policy?.fetchBudget ?? DEFAULT_WEB_FETCH_BUDGET),
    fetchMaxContentTokens: policy?.fetchMaxContentTokens ?? DEFAULT_WEB_FETCH_MAX_CONTENT_TOKENS,
  };
}

/**
 * Admission facts for `ensureServerWebTools` (RES.1; REQ-SPEC-31(2)).
 *  - `floorEligible`: the harness-stamped phase class was `research` — this request may draw the floor
 *    share; a non-eligible request's bound is `budget − floor` instead of `budget`.
 *  - `bypassBudget`: the harness's own preflight probe (`x-rhema-phase-class: preflight`). A probe must
 *    reach the tools even on a budget-exhausted resume — its whole job is proving tool reachability —
 *    so its `max_uses` grant is bounded by the per-call cap alone (the probe declares `max_uses: 1`).
 */
export interface WebToolAdmission {
  readonly floorEligible?: boolean;
  readonly bypassBudget?: boolean;
}

/** Read the granted `max_uses` off the web tools in a (rewritten) request body — the reservation amount. */
export function webToolGrantsOf(body: unknown): { searches: number; fetches: number } {
  const tools = (body as { tools?: unknown } | null)?.tools;
  let searches = 0;
  let fetches = 0;
  if (Array.isArray(tools)) {
    for (const t of tools) {
      const kind = serverWebToolKind(t);
      if (kind === null) continue;
      const max = (t as { max_uses?: unknown }).max_uses;
      const n = typeof max === "number" && Number.isFinite(max) ? Math.max(0, Math.floor(max)) : 0;
      if (kind === "search") searches += n;
      else fetches += n;
    }
  }
  return { searches, fetches };
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
  used?: WebToolUsage,
  admission?: WebToolAdmission,
): { body: unknown; added: boolean } {
  if (!body || typeof body !== "object") return { body, added: false };
  const b = body as { messages?: unknown; tools?: unknown };
  // Only a Messages request carries `messages[]`; never inject into other endpoints' bodies.
  if (!Array.isArray(b.messages)) return { body, added: false };
  const tools = Array.isArray(b.tools) ? b.tools : [];
  // Fast path: nothing to inject AND no web tools to police — leave the body untouched.
  if (tools.every((t) => !isClientWebTool(t) && serverWebToolKind(t) === null) && !config.search && !config.fetch)
    return { body, added: false };

  // (PRB.22) Per-run budgets: `max_uses` bounds only ONE API call, so the run's remaining budget is
  // enforced HERE — an exhausted kind's tool is dropped entirely (the model proceeds without it), and a
  // partial remainder clamps `max_uses` below the per-call cap. `used` counts every invocation the proxy
  // has seen for the run (committed history + metered responses + live grants), so the bound holds across
  // turns and subagents. RES.1: a non-floor-eligible request additionally sees its bound reduced by the
  // research floor (`budget − floor`), reserving that share for research-class traffic; `bypassBudget`
  // (the harness's preflight probe) grants up to the per-call cap regardless of remaining.
  const searchRemaining = config.search
    ? admission?.bypassBudget
      ? config.searchMaxUses
      : config.searchBudget - (admission?.floorEligible ? 0 : config.searchFloor) - (used?.searches ?? 0)
    : 0;
  const fetchRemaining = config.fetch
    ? admission?.bypassBudget
      ? config.fetchMaxUses
      : config.fetchBudget - (admission?.floorEligible ? 0 : config.fetchFloor) - (used?.fetches ?? 0)
    : 0;

  // (1) strip the CLI's client web tools so they cannot pre-empt the server tool.
  const kept = tools.filter((t) => !isClientWebTool(t));

  // (2) clamp every server web tool already in the body: drop a kind the run disabled or exhausted;
  //     otherwise shrink its max_uses to the run's remaining budget (never widened past what the sandbox
  //     set) and pin web_fetch's max_content_tokens to the run's page cap. A sandbox-declared tool gets
  //     the SAME treatment as an injected one — the run's policy is server-side truth.
  let changed = kept.length !== tools.length;
  const clamped: Record<string, unknown>[] = [];
  for (const t of kept) {
    const kind = serverWebToolKind(t);
    const tool = JSON.parse(JSON.stringify(t)) as Record<string, unknown>;
    if (kind === "search") {
      if (!config.search || searchRemaining <= 0) {
        changed = true;
        continue; // disabled for this run, or search budget exhausted — the tool leaves the request
      }
      const cap = Math.min(config.searchMaxUses, searchRemaining);
      const had = typeof tool["max_uses"] === "number";
      const next = Math.min(had ? (tool["max_uses"] as number) : cap, cap);
      if (!had || next !== tool["max_uses"]) changed = true;
      tool["max_uses"] = next;
    } else if (kind === "fetch") {
      if (!config.fetch || fetchRemaining <= 0) {
        changed = true;
        continue; // disabled for this run, or fetch budget exhausted — the tool leaves the request
      }
      const cap = Math.min(config.fetchMaxUses, fetchRemaining);
      const had = typeof tool["max_uses"] === "number";
      const next = Math.min(had ? (tool["max_uses"] as number) : cap, cap);
      if (!had || next !== tool["max_uses"]) changed = true;
      tool["max_uses"] = next;
      // per-page truncation: set (never widen) max_content_tokens.
      const contentCap = config.fetchMaxContentTokens;
      const hadContent = typeof tool["max_content_tokens"] === "number";
      const nextContent = Math.min(hadContent ? (tool["max_content_tokens"] as number) : contentCap, contentCap);
      if (!hadContent || nextContent !== tool["max_content_tokens"]) changed = true;
      tool["max_content_tokens"] = nextContent;
    }
    clamped.push(tool);
  }

  const hasSearch = clamped.some((t) => serverWebToolKind(t) === "search");
  const hasFetch = clamped.some((t) => serverWebToolKind(t) === "fetch");

  // (3) add the server web tool(s) the run wants, does not already have, and still has budget for.
  const additions: Record<string, unknown>[] = [];
  if (config.search && !hasSearch && searchRemaining > 0) {
    additions.push({
      type: WEB_SEARCH_TOOL_TYPE,
      name: "web_search",
      max_uses: Math.min(config.searchMaxUses, searchRemaining),
    });
    changed = true;
  }
  if (config.fetch && !hasFetch && fetchRemaining > 0) {
    additions.push({
      type: WEB_FETCH_TOOL_TYPE,
      name: "web_fetch",
      max_uses: Math.min(config.fetchMaxUses, fetchRemaining),
      max_content_tokens: config.fetchMaxContentTokens,
    });
    changed = true;
  }
  if (!changed) return { body, added: false };

  const clone = JSON.parse(JSON.stringify(body)) as { tools?: unknown[] };
  clone.tools = [...clamped, ...additions];
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
  // P1.21 — a Memo run's `user_sources[]` domains join the block set (`web_fetch_of_user_data:
  // 'forbidden'`): the provider refuses the call too, behind the proxy's own pre-forward deny.
  const blocked = union(policy.blockedDomains, policy.userSourceDomains ?? []);
  const hasAllow = (policy.allowedDomains?.length ?? 0) > 0;
  const hasBlock = blocked.length > 0;
  if (!hasAllow && !hasBlock) return { body, rewritten: false };
  if (!body || typeof body !== "object") return { body, rewritten: false };

  const clone = JSON.parse(JSON.stringify(body)) as { tools?: unknown };
  if (!Array.isArray(clone.tools)) return { body, rewritten: false };

  let rewritten = false;
  clone.tools = clone.tools.map((tool) => {
    if (!isServerWebTool(tool)) return tool;
    const t = tool as Record<string, unknown>;
    if (hasAllow) {
      // allow-list mode narrows to the list — and a user-source domain can never BE on it (the run's
      // own internal data is never a permitted fetch target, even under calibrator narrowing).
      rewritten = true;
      const allowed = (policy.allowedDomains ?? []).filter(
        (d) => !(policy.userSourceDomains ?? []).includes(d),
      );
      const next = { ...t, allowed_domains: allowed };
      delete (next as Record<string, unknown>)["blocked_domains"];
      return next;
    }
    // block-list mode: union onto whatever the sandbox set, and drop any allow-list (API forbids both).
    rewritten = true;
    const merged = union(asStringArray(t["blocked_domains"]), blocked);
    const next = { ...t, blocked_domains: merged };
    delete (next as Record<string, unknown>)["allowed_domains"];
    return next;
  });

  return rewritten ? { body: clone, rewritten } : { body, rewritten: false };
}

import { describe, expect, it } from "vitest";
import {
  DEFAULT_BACKFILL_FETCH_BUDGET,
  DEFAULT_WEB_FETCH_BUDGET,
  DEFAULT_WEB_FETCH_MAX_CONTENT_TOKENS,
  DEFAULT_WEB_FETCH_MAX_USES,
  DEFAULT_WEB_SEARCH_BUDGET,
  DEFAULT_WEB_SEARCH_MAX_USES,
  ensureServerWebTools,
  injectUrlPolicyIntoBody,
  resolveServerWebToolConfig,
  webToolGrantsOf,
  WEB_FETCH_TOOL_TYPE,
  WEB_SEARCH_TOOL_TYPE,
} from "./url-policy.js";

function messagesBody() {
  return {
    model: "claude-sonnet-5",
    messages: [{ role: "user", content: "hi" }],
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: 5, blocked_domains: ["already.example"] },
      { type: "web_fetch_20250910", name: "web_fetch" },
      { type: "custom_tool", name: "calculator" },
    ],
  };
}

describe("URL policy body injection (§12.6)", () => {
  it("unions the run's blocked domains onto server web tools, leaving other tools untouched", () => {
    const { body, rewritten } = injectUrlPolicyIntoBody(messagesBody(), {
      blockedDomains: ["holdout.example", "already.example"],
    });
    expect(rewritten).toBe(true);
    const tools = (body as { tools: Record<string, unknown>[] }).tools;
    expect(new Set(tools[0]!["blocked_domains"] as string[])).toEqual(
      new Set(["already.example", "holdout.example"]),
    );
    expect(new Set(tools[1]!["blocked_domains"] as string[])).toEqual(new Set(["holdout.example", "already.example"]));
    // A non-web tool is never touched.
    expect(tools[2]).toEqual({ type: "custom_tool", name: "calculator" });
  });

  it("narrows to allowed_domains and drops blocked_domains when the policy has an allow-list (calibrator)", () => {
    const { body, rewritten } = injectUrlPolicyIntoBody(messagesBody(), {
      blockedDomains: ["holdout.example"],
      allowedDomains: ["corpus.example"],
    });
    expect(rewritten).toBe(true);
    const tool = (body as { tools: Record<string, unknown>[] }).tools[0]!;
    expect(tool["allowed_domains"]).toEqual(["corpus.example"]);
    expect(tool["blocked_domains"]).toBeUndefined();
  });

  it("does not mutate the input body", () => {
    const original = messagesBody();
    const snapshot = JSON.stringify(original);
    injectUrlPolicyIntoBody(original, { blockedDomains: ["holdout.example"] });
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it("no-ops when the policy has no domains or the body has no tools", () => {
    expect(injectUrlPolicyIntoBody(messagesBody(), { blockedDomains: [] }).rewritten).toBe(false);
    expect(injectUrlPolicyIntoBody({ model: "x", messages: [] }, { blockedDomains: ["h.example"] }).rewritten).toBe(
      false,
    );
  });
});

describe("resolveServerWebToolConfig (P0.15i)", () => {
  it("defaults BOTH web_search and web_fetch ON (both GA, no beta header) with default max_uses + bounded budgets when the policy is absent", () => {
    expect(resolveServerWebToolConfig(undefined)).toEqual({
      search: true,
      fetch: true,
      searchMaxUses: DEFAULT_WEB_SEARCH_MAX_USES,
      fetchMaxUses: DEFAULT_WEB_FETCH_MAX_USES,
      searchBudget: DEFAULT_WEB_SEARCH_BUDGET,
      fetchBudget: DEFAULT_WEB_FETCH_BUDGET,
      searchFloor: 0,
      fetchFloor: 0,
      fetchMaxContentTokens: DEFAULT_WEB_FETCH_MAX_CONTENT_TOKENS,
      backfillFetchBudget: DEFAULT_BACKFILL_FETCH_BUDGET,
    });
  });

  it("honors explicit opt-outs and custom caps", () => {
    expect(resolveServerWebToolConfig({ search: false, fetch: false, searchMaxUses: 3, fetchBudget: 9, fetchMaxContentTokens: 4000 })).toEqual({
      search: false,
      fetch: false,
      searchMaxUses: 3,
      fetchMaxUses: DEFAULT_WEB_FETCH_MAX_USES,
      searchBudget: DEFAULT_WEB_SEARCH_BUDGET,
      fetchBudget: 9,
      searchFloor: 0,
      fetchFloor: 0,
      fetchMaxContentTokens: 4000,
      backfillFetchBudget: DEFAULT_BACKFILL_FETCH_BUDGET,
    });
  });

  it("clamps an over-budget floor to the budget (a floor can never exceed what the run holds)", () => {
    const c = resolveServerWebToolConfig({ searchBudget: 4, searchFloor: 10, fetchFloor: 2 });
    expect(c.searchFloor).toBe(4);
    expect(c.fetchFloor).toBe(2);
  });

  it("lets a run explicitly opt web_fetch OUT (e.g. a scoped subagent)", () => {
    expect(resolveServerWebToolConfig({ fetch: false }).fetch).toBe(false);
  });
});

describe("ensureServerWebTools — proxy guarantees the server web tools (§12.6; P0.15i)", () => {
  const config = resolveServerWebToolConfig(undefined);
  const bareBody = () => ({ model: "claude-sonnet-5", messages: [{ role: "user", content: "fact-check this" }] });

  it("adds BOTH server web tools to a request that has no tools at all (the P0.15h searches=0 case)", () => {
    const { body, added } = ensureServerWebTools(bareBody(), config);
    expect(added).toBe(true);
    const tools = (body as { tools: Record<string, unknown>[] }).tools;
    expect(tools).toContainEqual({ type: WEB_SEARCH_TOOL_TYPE, name: "web_search", max_uses: DEFAULT_WEB_SEARCH_MAX_USES });
    // web_fetch is ON by default (GA, no beta header) — required for cited⇒fetched of directly-fetched
    // sources; PRB.22 pins per-page context truncation on every injected fetch tool.
    expect(tools).toContainEqual({
      type: WEB_FETCH_TOOL_TYPE,
      name: "web_fetch",
      max_uses: DEFAULT_WEB_FETCH_MAX_USES,
      max_content_tokens: DEFAULT_WEB_FETCH_MAX_CONTENT_TOKENS,
    });
  });

  it("STRIPS the CLI's client WebSearch/WebFetch tools so they cannot pre-empt the injected server tool (P0.15i, live-confirmed)", () => {
    const body = {
      ...bareBody(),
      tools: [
        { name: "Read" },
        { name: "WebSearch" }, // the CLI's client web-search tool — must be stripped
        { name: "WebFetch" }, // the CLI's client web-fetch tool — must be stripped
        { type: "custom_tool", name: "calculator" },
      ],
    };
    const { body: out, added } = ensureServerWebTools(body, config);
    expect(added).toBe(true);
    const names = (out as { tools: Record<string, unknown>[] }).tools.map((t) => t["name"]);
    expect(names).not.toContain("WebSearch"); // client tool gone
    expect(names).not.toContain("WebFetch"); // client tool gone
    expect(names).toContain("Read"); // non-web tools kept
    expect(names).toContain("calculator");
    expect(names).toContain("web_search"); // server tool injected in their place
  });

  it("injects only web_search when a run opts web_fetch OUT", () => {
    const { body } = ensureServerWebTools(bareBody(), resolveServerWebToolConfig({ fetch: false }));
    const tools = (body as { tools: Record<string, unknown>[] }).tools;
    expect(tools.some((t) => t["name"] === "web_search")).toBe(true);
    expect(tools.some((t) => t["name"] === "web_fetch")).toBe(false);
  });

  it("adds the missing tool alongside existing custom tools, keeping them", () => {
    const { body, added } = ensureServerWebTools(
      { ...bareBody(), tools: [{ type: "custom_tool", name: "calculator" }] },
      config,
    );
    expect(added).toBe(true);
    const tools = (body as { tools: Record<string, unknown>[] }).tools;
    expect(tools[0]).toEqual({ type: "custom_tool", name: "calculator" });
    expect(tools.some((t) => t["name"] === "web_search")).toBe(true);
  });

  it("does NOT duplicate a server web tool the CLI already added — but CLAMPS it to the run policy (PRB.22)", () => {
    const { body, added } = ensureServerWebTools(
      { ...bareBody(), tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }, { type: "web_fetch_20250910", name: "web_fetch" }] },
      resolveServerWebToolConfig({ fetch: true }),
    );
    // The fetch tool lacked max_uses/max_content_tokens — the proxy pins both (added: a policy clamp is a rewrite).
    expect(added).toBe(true);
    const tools = (body as { tools: Record<string, unknown>[] }).tools;
    expect(tools.filter((t) => serverName(t) === "web_search")).toHaveLength(1);
    expect(tools.filter((t) => serverName(t) === "web_fetch")).toHaveLength(1);
    // the sandbox's TIGHTER max_uses (5 < the run's bound) is never widened.
    expect(tools.find((t) => serverName(t) === "web_search")!["max_uses"]).toBe(5);
    const fetchTool = tools.find((t) => serverName(t) === "web_fetch")!;
    expect(fetchTool["max_uses"]).toBe(DEFAULT_WEB_FETCH_MAX_USES);
    expect(fetchTool["max_content_tokens"]).toBe(DEFAULT_WEB_FETCH_MAX_CONTENT_TOKENS);
  });

  it("never touches a non-Messages body (no `messages` array) or a non-object", () => {
    expect(ensureServerWebTools({ input: "x" }, config).added).toBe(false);
    expect(ensureServerWebTools("not-json", config).added).toBe(false);
    expect(ensureServerWebTools(null, config).added).toBe(false);
  });

  it("does not mutate the input body", () => {
    const original = bareBody();
    const snapshot = JSON.stringify(original);
    ensureServerWebTools(original, config);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it("the injected tool is then domain-scoped by injectUrlPolicyIntoBody (the guarantor + scoper chain)", () => {
    const ensured = ensureServerWebTools(bareBody(), resolveServerWebToolConfig({ fetch: false }));
    const { body, rewritten } = injectUrlPolicyIntoBody(ensured.body, { blockedDomains: ["holdout.example"] });
    expect(rewritten).toBe(true);
    const search = (body as { tools: Record<string, unknown>[] }).tools.find((t) => t["name"] === "web_search")!;
    expect(search["blocked_domains"]).toEqual(["holdout.example"]);
  });
});

const serverName = (t: Record<string, unknown>): string => String(t["name"] ?? "");

describe("ensureServerWebTools — per-run research budgets (PRB.22; D-PRB.21-1)", () => {
  const bareBody = () => ({ model: "claude-sonnet-5", messages: [{ role: "user", content: "verify this" }] });

  it("shrinks the injected tools' max_uses to the run's REMAINING budget", () => {
    const config = resolveServerWebToolConfig({ fetchBudget: 6, searchBudget: 2 });
    const { body } = ensureServerWebTools(bareBody(), config, { fetches: 4, searches: 1 });
    const tools = (body as { tools: Record<string, unknown>[] }).tools;
    // fetch: 6 − 4 used ⇒ only 2 left this call; search: 2 − 1 ⇒ 1 left.
    expect(tools.find((t) => serverName(t) === "web_fetch")!["max_uses"]).toBe(2);
    expect(tools.find((t) => serverName(t) === "web_search")!["max_uses"]).toBe(1);
  });

  it("DROPS a tool entirely once its run budget is exhausted — the model proceeds without it", () => {
    const config = resolveServerWebToolConfig({ fetchBudget: 20, searchBudget: 24 });
    const { body, added } = ensureServerWebTools(bareBody(), config, { fetches: 20, searches: 3 });
    expect(added).toBe(true);
    const tools = (body as { tools: Record<string, unknown>[] }).tools;
    expect(tools.some((t) => serverName(t) === "web_fetch")).toBe(false);
    expect(tools.some((t) => serverName(t) === "web_search")).toBe(true);
  });

  it("removes an EXISTING (sandbox-declared) web tool whose budget is exhausted — never just un-injected", () => {
    const config = resolveServerWebToolConfig({ searchBudget: 5 });
    const body = { ...bareBody(), tools: [{ type: "web_search_20250305", name: "web_search" }, { type: "custom_tool", name: "calc" }] };
    const { body: out } = ensureServerWebTools(body, config, { searches: 5, fetches: 0 });
    const tools = (out as { tools: Record<string, unknown>[] }).tools;
    expect(tools.some((t) => serverName(t) === "web_search")).toBe(false);
    expect(tools).toContainEqual({ type: "custom_tool", name: "calc" });
    // the enabled, still-budgeted fetch tool is still injected.
    expect(tools.some((t) => serverName(t) === "web_fetch")).toBe(true);
  });

  it("strips a sandbox-declared web tool the run's policy disables outright", () => {
    const config = resolveServerWebToolConfig({ fetch: false }); // scoped subagent: no fetching
    const body = { ...bareBody(), tools: [{ type: "web_fetch_20250910", name: "web_fetch" }] };
    const { body: out } = ensureServerWebTools(body, config);
    const tools = (out as { tools: Record<string, unknown>[] }).tools;
    expect(tools.some((t) => serverName(t) === "web_fetch")).toBe(false);
    expect(tools.some((t) => serverName(t) === "web_search")).toBe(true); // still injected
  });

  it("never widens a sandbox-declared max_uses/max_content_tokens tighter than the run's bound", () => {
    const config = resolveServerWebToolConfig({ fetchMaxContentTokens: 8000 });
    const body = {
      ...bareBody(),
      tools: [{ type: "web_fetch_20250910", name: "web_fetch", max_uses: 3, max_content_tokens: 2000 }],
    };
    const { body: out } = ensureServerWebTools(body, config);
    const fetchTool = (out as { tools: Record<string, unknown>[] }).tools.find((t) => serverName(t) === "web_fetch")!;
    expect(fetchTool["max_uses"]).toBe(3);
    expect(fetchTool["max_content_tokens"]).toBe(2000);
  });
});

describe("ensureServerWebTools — RES.1 client-alias strip (the 2026-09-30 incident shape)", () => {
  const bareBody = () => ({ model: "claude-sonnet-5", messages: [{ role: "user", content: "verify this" }] });
  const config = resolveServerWebToolConfig(undefined);

  it("a CUSTOM tool that merely borrows the name `web_search` is stripped, and the real server tool injected", () => {
    // The incident: the body carried a bare-name `web_search` with no server `type` — it satisfied no
    // server contract, yet counted as "already present" under the old name-or-type match, so the request
    // went upstream with a tool the model could call but the provider would never execute (searches=0).
    const body = {
      ...bareBody(),
      tools: [
        { name: "web_search", description: "search the web", input_schema: { type: "object" } },
        { name: "web_fetch", description: "fetch a url", input_schema: { type: "object" } },
        { type: "custom_tool", name: "calculator" },
      ],
    };
    const { body: out } = ensureServerWebTools(body, config);
    const tools = (out as { tools: Record<string, unknown>[] }).tools;
    // the bare-name impostors are gone; only tools with a real server `type` survive.
    const searchTools = tools.filter((t) => serverName(t) === "web_search");
    expect(searchTools).toHaveLength(1);
    expect(searchTools[0]).toMatchObject({ type: WEB_SEARCH_TOOL_TYPE, name: "web_search" });
    const fetchTools = tools.filter((t) => serverName(t) === "web_fetch");
    expect(fetchTools).toHaveLength(1);
    expect(fetchTools[0]).toMatchObject({ type: WEB_FETCH_TOOL_TYPE });
    expect(tools).toContainEqual({ type: "custom_tool", name: "calculator" });
  });

  it("still strips the PascalCase CLI client tools AND a lowercase name-borrower in one pass", () => {
    const body = {
      ...bareBody(),
      tools: [{ name: "WebSearch" }, { name: "web_search" }, { name: "web_fetch" }],
    };
    const { body: out } = ensureServerWebTools(body, config);
    const tools = (out as { tools: Record<string, unknown>[] }).tools;
    expect(tools.filter((t) => serverName(t) === "web_search")).toHaveLength(1);
    expect(tools.filter((t) => serverName(t) === "web_fetch")).toHaveLength(1);
    expect(tools.every((t) => typeof t["type"] === "string" && (t["type"] as string).startsWith("web_"))).toBe(true);
  });

  it("a server tool the client declared WITH the real `type` is kept, not re-injected", () => {
    const body = {
      ...bareBody(),
      tools: [{ type: WEB_SEARCH_TOOL_TYPE, name: "web_search", max_uses: 2 }],
    };
    const { body: out } = ensureServerWebTools(body, config);
    const tools = (out as { tools: Record<string, unknown>[] }).tools;
    expect(tools.filter((t) => serverName(t) === "web_search")).toHaveLength(1);
    expect(tools.find((t) => serverName(t) === "web_search")!["max_uses"]).toBe(2);
  });
});

describe("ensureServerWebTools — RES.1 research floor + preflight bypass (REQ-SPEC-31(2))", () => {
  const bareBody = () => ({ model: "claude-sonnet-5", messages: [{ role: "user", content: "verify this" }] });

  it("a non-eligible request sees the bound NET of the floor; a research request sees the full remainder", () => {
    // searchBudget 24, floor 4: a judge/side request near the end of the budget is starved at 24−4,
    // reserving the last 4 searches for research-class traffic.
    const config = resolveServerWebToolConfig({ searchFloor: 4, fetchFloor: 8 });
    const used = { searches: 21, fetches: 45 };

    const nonEligible = ensureServerWebTools(bareBody(), config, used, {});
    const neTools = (nonEligible.body as { tools?: Record<string, unknown>[] }).tools ?? [];
    // 24 − 4 floor − 21 used = −1 ⇒ search dropped; 48 − 8 − 45 = −5 ⇒ fetch dropped.
    expect(neTools.some((t) => serverName(t) === "web_search")).toBe(false);
    expect(neTools.some((t) => serverName(t) === "web_fetch")).toBe(false);

    const eligible = ensureServerWebTools(bareBody(), config, used, { floorEligible: true });
    const eTools = (eligible.body as { tools: Record<string, unknown>[] }).tools;
    // research-class: 24 − 21 = 3 searches; 48 − 45 = 3 fetches — the floor share is theirs.
    expect(eTools.find((t) => serverName(t) === "web_search")!["max_uses"]).toBe(3);
    expect(eTools.find((t) => serverName(t) === "web_fetch")!["max_uses"]).toBe(3);
  });

  it("the floor leaves an under-budget non-eligible request's clamp intact when headroom remains", () => {
    const config = resolveServerWebToolConfig({ searchFloor: 4 });
    const { body } = ensureServerWebTools(bareBody(), config, { searches: 0, fetches: 0 }, {});
    const tools = (body as { tools: Record<string, unknown>[] }).tools;
    // 24 − 4 = 20 bound > 15 per-call cap ⇒ per-call cap still applies.
    expect(tools.find((t) => serverName(t) === "web_search")!["max_uses"]).toBe(DEFAULT_WEB_SEARCH_MAX_USES);
  });

  it("a preflight probe keeps its declared max_uses:1 even on an exhausted budget (resume re-preflight)", () => {
    const config = resolveServerWebToolConfig({ searchFloor: 4 });
    const probeBody = {
      ...bareBody(),
      tools: [
        { type: WEB_SEARCH_TOOL_TYPE, name: "web_search", max_uses: 1 },
        { type: WEB_FETCH_TOOL_TYPE, name: "web_fetch", max_uses: 1 },
      ],
    };
    const { body } = ensureServerWebTools(probeBody, config, { searches: 24, fetches: 48 }, { bypassBudget: true });
    const tools = (body as { tools: Record<string, unknown>[] }).tools;
    expect(tools.find((t) => serverName(t) === "web_search")!["max_uses"]).toBe(1);
    expect(tools.find((t) => serverName(t) === "web_fetch")!["max_uses"]).toBe(1);
  });

  it("a preflight probe cannot resurrect a tool the run disabled outright", () => {
    const config = resolveServerWebToolConfig({ fetch: false });
    const probeBody = {
      ...bareBody(),
      tools: [{ type: WEB_FETCH_TOOL_TYPE, name: "web_fetch", max_uses: 1 }],
    };
    const { body } = ensureServerWebTools(probeBody, config, { searches: 0, fetches: 0 }, { bypassBudget: true });
    const tools = (body as { tools: Record<string, unknown>[] }).tools;
    expect(tools.some((t) => serverName(t) === "web_fetch")).toBe(false);
  });

  it("webToolGrantsOf reads the granted max_uses off a rewritten body (the reservation amount)", () => {
    const config = resolveServerWebToolConfig({ searchBudget: 10, fetchBudget: 6 });
    const { body } = ensureServerWebTools(bareBody(), config, { searches: 0, fetches: 0 });
    expect(webToolGrantsOf(body)).toEqual({ searches: 10, fetches: 6 });
  });
});

describe("ensureServerWebTools — CITE.1 backfill admission (ADR-085)", () => {
  const bareBody = () => ({ model: "claude-sonnet-5", messages: [{ role: "user", content: "fetch these urls" }] });

  it("a backfill request fetches on the DEDICATED allowance — never the exhausted research budget", () => {
    // fetchBudget 1 fully spent + a floor of 8: a research request would see NOTHING. The backfill
    // admission draws `backfillFetchBudget − backfillUsed` — a separate line.
    const config = resolveServerWebToolConfig({ fetchBudget: 1, fetchFloor: 8, searchBudget: 24, backfillFetchBudget: 6 });
    const { body } = ensureServerWebTools(bareBody(), config, { fetches: 1, searches: 0 }, { backfill: true });
    const tools = (body as { tools: Record<string, unknown>[] }).tools;
    const fetch = tools.find((t) => serverName(t) === "web_fetch")!;
    // 6 − 1 used ⇒ 5 (below the per-call cap); a research-budget read would have been ≤ 0 (tool dropped).
    expect(fetch["max_uses"]).toBe(5);
    // …and the floor is never subtracted for it: 6 − 8 would be ≤ 0 (the proof the floor is intact —
    // the mechanism cannot spend the reserved share, it just also cannot be charged against it).
  });

  it("a backfill request carries NO search grant (discovery is not its job)", () => {
    const config = resolveServerWebToolConfig({ searchBudget: 24, backfillFetchBudget: 4 });
    const { body } = ensureServerWebTools(bareBody(), config, { fetches: 0, searches: 0 }, { backfill: true });
    const tools = (body as { tools: Record<string, unknown>[] }).tools;
    expect(tools.some((t) => serverName(t) === "web_search")).toBe(false);
    expect(tools.some((t) => serverName(t) === "web_fetch")).toBe(true);
  });

  it("the allowance clamps per call AND exhausts at the budget (never widened past the cap)", () => {
    const config = resolveServerWebToolConfig({ backfillFetchBudget: 3 });
    const { body } = ensureServerWebTools(bareBody(), config, { fetches: 2, searches: 0 }, { backfill: true });
    const tools = (body as { tools: Record<string, unknown>[] }).tools;
    expect(tools.find((t) => serverName(t) === "web_fetch")!["max_uses"]).toBe(1); // 3 − 2
    // exhausted ⇒ the fetch tool drops entirely; the re-entry's remaining misses degrade to the strip.
    const { body: exhausted } = ensureServerWebTools(bareBody(), config, { fetches: 3, searches: 0 }, { backfill: true });
    const eTools = (exhausted as { tools?: Record<string, unknown>[] }).tools ?? [];
    expect(eTools.some((t) => serverName(t) === "web_fetch")).toBe(false);
  });

  it("a run disabled for fetch gets NO backfill grant either (the mechanism never widens policy)", () => {
    const config = resolveServerWebToolConfig({ fetch: false, backfillFetchBudget: 6 });
    const { body } = ensureServerWebTools(bareBody(), config, { fetches: 0, searches: 0 }, { backfill: true });
    const tools = (body as { tools?: Record<string, unknown>[] }).tools ?? [];
    expect(tools.some((t) => serverName(t) === "web_fetch")).toBe(false);
  });
});

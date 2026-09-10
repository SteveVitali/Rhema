import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEB_FETCH_MAX_USES,
  DEFAULT_WEB_SEARCH_MAX_USES,
  ensureServerWebTools,
  injectUrlPolicyIntoBody,
  resolveServerWebToolConfig,
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
  it("defaults web_search ON and web_fetch OFF (no beta header) with default max_uses when the policy is absent", () => {
    expect(resolveServerWebToolConfig(undefined)).toEqual({
      search: true,
      fetch: false,
      searchMaxUses: DEFAULT_WEB_SEARCH_MAX_USES,
      fetchMaxUses: DEFAULT_WEB_FETCH_MAX_USES,
    });
  });

  it("honors an explicit web_search opt-out and custom caps", () => {
    expect(resolveServerWebToolConfig({ search: false, searchMaxUses: 3 })).toEqual({
      search: false,
      fetch: false,
      searchMaxUses: 3,
      fetchMaxUses: DEFAULT_WEB_FETCH_MAX_USES,
    });
  });

  it("lets a run explicitly opt web_fetch IN (once the beta header is wired)", () => {
    expect(resolveServerWebToolConfig({ fetch: true }).fetch).toBe(true);
  });
});

describe("ensureServerWebTools — proxy guarantees the server web tools (§12.6; P0.15i)", () => {
  const config = resolveServerWebToolConfig(undefined);
  const bareBody = () => ({ model: "claude-sonnet-5", messages: [{ role: "user", content: "fact-check this" }] });

  it("adds the server web_search tool to a request that has no tools at all (the P0.15h searches=0 case)", () => {
    const { body, added } = ensureServerWebTools(bareBody(), config);
    expect(added).toBe(true);
    const tools = (body as { tools: Record<string, unknown>[] }).tools;
    expect(tools).toContainEqual({ type: WEB_SEARCH_TOOL_TYPE, name: "web_search", max_uses: DEFAULT_WEB_SEARCH_MAX_USES });
    // web_fetch is OFF by default (needs a beta header) — not injected unless explicitly enabled.
    expect(tools.some((t) => t["name"] === "web_fetch")).toBe(false);
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

  it("adds web_fetch too when a run explicitly opts it in", () => {
    const { body } = ensureServerWebTools(bareBody(), resolveServerWebToolConfig({ fetch: true }));
    const tools = (body as { tools: Record<string, unknown>[] }).tools;
    expect(tools).toContainEqual({ type: WEB_FETCH_TOOL_TYPE, name: "web_fetch", max_uses: DEFAULT_WEB_FETCH_MAX_USES });
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

  it("does NOT duplicate a server web tool the CLI already added, for either kind (add-if-absent)", () => {
    const { added } = ensureServerWebTools(
      { ...bareBody(), tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }, { type: "web_fetch_20250910", name: "web_fetch" }] },
      resolveServerWebToolConfig({ fetch: true }), // both enabled — still no duplicate
    );
    expect(added).toBe(false);
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

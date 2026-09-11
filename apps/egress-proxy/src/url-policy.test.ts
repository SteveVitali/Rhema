import { describe, expect, it } from "vitest";
import { injectUrlPolicyIntoBody } from "./url-policy.js";

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

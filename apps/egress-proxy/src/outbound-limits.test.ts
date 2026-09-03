import { describe, expect, it } from "vitest";
import { registrableDomainOf } from "./domains.js";
import {
  extractServerToolInvocations,
  guardWebFetchUrl,
  MAX_WEB_FETCH_QUERY_CHARS,
  NovelDomainTracker,
  rewriteFetchUrl,
} from "./outbound-limits.js";

describe("web_fetch query guard (§12.8d, AC4)", () => {
  it("strips a query string longer than 256 chars", () => {
    const longQuery = "d=" + "a".repeat(298); // 300 chars, no leading '?'
    expect(longQuery.length).toBe(300);
    const g = guardWebFetchUrl(`https://x.example/p?${longQuery}`);
    expect(g.action).toBe("stripped");
    if (g.action === "stripped") expect(g.url).toBe("https://x.example/p");
  });

  it("allows a short query and refuses an unparseable URL", () => {
    expect(guardWebFetchUrl("https://x.example/p?q=hello").action).toBe("allow");
    expect(guardWebFetchUrl("not a url").action).toBe("refused");
    // Boundary: exactly 256 is allowed, 257 is stripped.
    expect(guardWebFetchUrl(`https://x.example/?${"a".repeat(MAX_WEB_FETCH_QUERY_CHARS)}`).action).toBe("allow");
    expect(guardWebFetchUrl(`https://x.example/?${"a".repeat(MAX_WEB_FETCH_QUERY_CHARS + 1)}`).action).toBe("stripped");
  });
});

describe("server-tool extraction + rewrite", () => {
  const body = {
    messages: [
      {
        role: "assistant",
        content: [
          { type: "server_tool_use", name: "web_search", input: { query: "site:example.com widgets" } },
          { type: "tool_use", name: "web_fetch", input: { url: "https://a.example/x?big=1" } },
          { type: "text", text: "ignored" },
        ],
      },
    ],
  };

  it("extracts search queries and fetch urls with their block paths", () => {
    const inv = extractServerToolInvocations(body);
    expect(inv).toHaveLength(2);
    expect(inv[0]).toMatchObject({ kind: "search", query: "site:example.com widgets" });
    expect(inv[1]).toMatchObject({ kind: "fetch", url: "https://a.example/x?big=1" });
    expect(inv[1]!.path).toEqual({ messageIndex: 0, contentIndex: 1 });
  });

  it("rewrites a fetch url at its path without mutating the input", () => {
    const snapshot = JSON.stringify(body);
    const out = rewriteFetchUrl(body, { messageIndex: 0, contentIndex: 1 }, "https://a.example/x");
    const block = (out as { messages: { content: { input: { url: string } }[] }[] }).messages[0]!.content[1]!;
    expect(block.input.url).toBe("https://a.example/x");
    expect(JSON.stringify(body)).toBe(snapshot);
  });

  it("tolerates a malformed body", () => {
    expect(extractServerToolInvocations(null)).toEqual([]);
    expect(extractServerToolInvocations({ messages: "nope" })).toEqual([]);
  });
});

describe("registrable domain (§12.8d)", () => {
  it("collapses subdomains to the registrable domain", () => {
    expect(registrableDomainOf("https://news.example.com/x")).toBe("example.com");
    expect(registrableDomainOf("https://a.b.bbc.co.uk/x")).toBe("bbc.co.uk");
    expect(registrableDomainOf("example.org")).toBe("example.org");
    expect(registrableDomainOf("not a url")).toBeNull();
  });
});

describe("novel-domain cap (§12.8d)", () => {
  it("never counts a known domain and caps distinct novel domains per run", () => {
    const t = new NovelDomainTracker();
    const known = ["corpus.example"];
    // known domain — free.
    expect(t.admit("run1", "corpus.example", known, 2)).toMatchObject({ admitted: true, novel: false });
    // first two novel domains admitted.
    expect(t.admit("run1", "a.example", known, 2)).toMatchObject({ admitted: true, novel: true, novelCount: 1 });
    expect(t.admit("run1", "b.example", known, 2)).toMatchObject({ admitted: true, novelCount: 2 });
    // re-fetching an already-admitted domain does not push the count.
    expect(t.admit("run1", "a.example", known, 2)).toMatchObject({ admitted: true, novel: false, novelCount: 2 });
    // a third distinct novel domain is over the cap.
    expect(t.admit("run1", "c.example", known, 2)).toMatchObject({ admitted: false, novelCount: 2 });
    // uncapped run admits freely.
    expect(t.admit("run2", "z.example", known, undefined)).toMatchObject({ admitted: true });
  });
});

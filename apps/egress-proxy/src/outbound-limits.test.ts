import { describe, expect, it } from "vitest";
import { registrableDomainOf } from "./domains.js";
import {
  extractExecutedServerToolUses,
  extractServerToolInvocations,
  guardWebFetchUrl,
  MAX_WEB_FETCH_QUERY_CHARS,
  NovelDomainTracker,
  RESEARCH_GRANT_TTL_MS,
  ResearchUsageTracker,
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

describe("extractExecutedServerToolUses — RES.1 executed-only history counting", () => {
  it("ignores bare tool_use calls (the 2026-09-30 phantom) and counts real server-tool executions", () => {
    const body = {
      messages: [
        {
          role: "assistant",
          content: [
            // the incident shape: a CLIENT call the provider never ran — must not count.
            { type: "tool_use", name: "web_search", input: { query: "test search" } },
            { type: "tool_use", name: "web_fetch", input: { url: "https://never.example/x" } },
            // a real server-side search the provider executed.
            { type: "server_tool_use", name: "web_search", input: { query: "who wrote middlemarch" } },
          ],
        },
        {
          role: "user",
          content: [
            { type: "web_search_tool_result", tool_use_id: "t1", content: [] },
            { type: "web_fetch_tool_result", tool_use_id: "t2", content: [{ url: "https://a.example/" }] },
          ],
        },
      ],
    };
    // searches: max(server_tool_use=1, results=1) = 1 — the phantom tool_use adds nothing.
    // fetches: the result proves an execution even though its use block is absent (max(0,1)=1).
    expect(extractExecutedServerToolUses(body)).toEqual({ searches: 1, fetches: 1 });
  });

  it("survives a compacted transcript that dropped the use block but kept the result", () => {
    const body = {
      messages: [
        {
          role: "user",
          content: [
            { type: "web_fetch_tool_result", content: [{ url: "https://a.example/" }] },
            { type: "web_fetch_tool_result", content: [{ url: "https://b.example/" }] },
          ],
        },
      ],
    };
    expect(extractExecutedServerToolUses(body)).toEqual({ searches: 0, fetches: 2 });
  });

  it("tolerates a malformed body", () => {
    expect(extractExecutedServerToolUses(null)).toEqual({ searches: 0, fetches: 0 });
    expect(extractExecutedServerToolUses({ messages: "nope" })).toEqual({ searches: 0, fetches: 0 });
    expect(extractExecutedServerToolUses({ messages: [{ role: "user", content: "text" }] })).toEqual({
      searches: 0,
      fetches: 0,
    });
  });
});

describe("ResearchUsageTracker — per-run research bound (PRB.22; D-PRB.21-1)", () => {
  it("accumulates metered fetch/search counts per run across responses", () => {
    const t = new ResearchUsageTracker();
    expect(t.usage("run1")).toEqual({ fetches: 0, searches: 0 });
    t.record("run1", { fetches: 3, searches: 1 });
    t.record("run1", { fetches: 2 }); // a fetch-only response
    t.record("run1", { searches: 4 }); // a search-only response
    expect(t.usage("run1")).toEqual({ fetches: 5, searches: 5 });
    // run-keyed: another run is unaffected.
    expect(t.usage("run2")).toEqual({ fetches: 0, searches: 0 });
  });

  it("sums live admission grants into inflight() and releases them idempotently (RES.1)", () => {
    const t = new ResearchUsageTracker();
    const r1 = t.reserve("run1", { searches: 5, fetches: 10 });
    const r2 = t.reserve("run1", { searches: 3, fetches: 0 });
    // the incident window: a second request sees the first's grant already committed against headroom.
    expect(t.inflight("run1")).toEqual({ searches: 8, fetches: 10 });
    r1.release();
    expect(t.inflight("run1")).toEqual({ searches: 3, fetches: 0 });
    r1.release(); // idempotent
    expect(t.inflight("run1")).toEqual({ searches: 3, fetches: 0 });
    r2.release();
    expect(t.inflight("run1")).toEqual({ searches: 0, fetches: 0 });
    // run-keyed: another run's grants are independent.
    expect(t.inflight("run2")).toEqual({ searches: 0, fetches: 0 });
  });

  it("expires a wedged grant at the TTL so a stuck request can never starve verification", () => {
    let now = 1_000;
    const t = new ResearchUsageTracker({ now: () => now });
    t.reserve("run1", { searches: 20, fetches: 0 });
    expect(t.inflight("run1").searches).toBe(20);
    now += RESEARCH_GRANT_TTL_MS - 1;
    expect(t.inflight("run1").searches).toBe(20); // still live just under the TTL
    now += 2; // past expiry
    expect(t.inflight("run1")).toEqual({ searches: 0, fetches: 0 });
  });

  it("a zero grant returns a no-op reservation", () => {
    const t = new ResearchUsageTracker();
    t.reserve("run1", { searches: 0, fetches: 0 }).release();
    expect(t.inflight("run1")).toEqual({ searches: 0, fetches: 0 });
  });
});

import { describe, expect, it } from "vitest";
import { scanCitationCompleteness, type ScanContentStore } from "./citation-scan.js";
import type { SqlClient } from "@rhema/orchestrator";

/**
 * CITE.1 — the $0 baseline scan's classification pinned against a canned fetch_log (BL-15; REQ-VIS-9):
 * every missed cited url lands in exactly one of normalizationOnly / searchOnly / trulyUnretrieved,
 * test-tenant runs are excluded from the aggregate, and a missing ledger artifact counts `unreadable`,
 * never silently scored.
 */

function fakeExec(opts: {
  readonly scanned?: number;
  readonly ledgerRows: {
    run_id: string;
    workspace_id: string;
    workflow: string;
    ended_at: string | null;
    test_tenant: boolean;
    content_sha256: string;
    mirror_path: string;
  }[];
  readonly fetchLog: Record<string, { url: string | null; normalized_url: string | null; kind: string; query: string | null }[]>;
}): SqlClient {
  return {
    query: (text, params) => {
      if (text.includes("count(*)") && text.includes("state = 'completed'")) {
        return Promise.resolve({ rows: [{ c: opts.scanned ?? 3 }] });
      }
      if (text.includes("distinct on (r.id)")) {
        return Promise.resolve({ rows: opts.ledgerRows });
      }
      if (text.includes("from fetch_log")) {
        const runId = (params as string[])[0]!;
        return Promise.resolve({ rows: opts.fetchLog[runId] ?? [] });
      }
      throw new Error(`unexpected query: ${text}`);
    },
  } as unknown as SqlClient;
}

const storeWith = (bytes: Record<string, string>): ScanContentStore => ({
  get: (sha) => Promise.resolve(bytes[sha] ? new TextEncoder().encode(bytes[sha]) : null),
});

const ledgerOf = (urls: string[]) =>
  JSON.stringify({ claims: urls.map((url, i) => ({ ordinal: i + 1, text: `c${i}`, tier: 2, url })) });

const ledgerRow = (runId: string, sha: string, test = false) => ({
  run_id: runId,
  workspace_id: "ws_1",
  workflow: "review",
  ended_at: "2026-10-01T00:00:00Z",
  test_tenant: test,
  content_sha256: sha,
  mirror_path: "agents/editor/01-claim-ledger.json",
});

describe("scanCitationCompleteness — the three miss classes (BL-15)", () => {
  it("a stored proxy-normalized url (query kept) that canonicalizes to the cited url is normalizationOnly", async () => {
    const exec = fakeExec({
      ledgerRows: [ledgerRow("run_1", "sha1")],
      fetchLog: {
        // the proxy's richer stored form (host case + query + trailing slash kept — the canonical
        // identity ignores all three; PATH case stays significant) — the LEGACY byte-join missed
        // this, the canonical join covers it.
        run_1: [{ url: null, normalized_url: "https://X.test/a/?q=7", kind: "fetch", query: null }],
      },
    });
    const res = await scanCitationCompleteness(exec, storeWith({ sha1: ledgerOf(["https://x.test/a"]) }));
    expect(res.scored).toBe(1);
    const r = res.runs[0]!;
    expect(r.citedUrls).toBe(1);
    expect(r.legacyCovered).toBe(0);
    expect(r.canonicalCovered).toBe(1);
    expect(r.normalizationOnly).toBe(1);
    expect(r.missedUrls.normalizationOnly).toEqual(["https://x.test/a"]);
    expect(res.aggregate.legacyCompleteness).toBe(0);
    expect(res.aggregate.canonicalCompleteness).toBe(1);
  });

  it("a url-bearing search row covers the cited url — canonical coverage (ADR-083 fetched∪search set)", async () => {
    const exec = fakeExec({
      ledgerRows: [ledgerRow("run_1", "sha1")],
      fetchLog: {
        run_1: [{ url: null, normalized_url: "https://news.example/story/", kind: "search", query: null }],
      },
    });
    const res = await scanCitationCompleteness(exec, storeWith({ sha1: ledgerOf(["https://news.example/story"]) }));
    const r = res.runs[0]!;
    expect(r.canonicalCovered).toBe(1); // search rows count in the retrieved set
    expect(r.normalizationOnly).toBe(1); // …and the stored trailing-slash byte form is a legacy-join miss
  });

  it("a cited url inside a search row's QUERY (pre-CITE.1 shape — no url column) classifies searchOnly", async () => {
    const exec = fakeExec({
      ledgerRows: [ledgerRow("run_1", "sha1")],
      fetchLog: {
        run_1: [{ url: null, normalized_url: null, kind: "search", query: "site:news.example https://news.example/story" }],
      },
    });
    const res = await scanCitationCompleteness(exec, storeWith({ sha1: ledgerOf(["https://news.example/story"]) }));
    const r = res.runs[0]!;
    expect(r.canonicalCovered).toBe(0); // the query alone is NOT retrieval evidence for the canonical join
    expect(r.searchOnly).toBe(1);
    expect(r.trulyUnretrieved).toBe(0);
  });

  it("a cited url that never touched the proxy is trulyUnretrieved — the class Path B honestly strips", async () => {
    const exec = fakeExec({
      ledgerRows: [ledgerRow("run_1", "sha1")],
      fetchLog: { run_1: [{ url: null, normalized_url: "https://other.example/f", kind: "fetch", query: null }] },
    });
    const res = await scanCitationCompleteness(exec, storeWith({ sha1: ledgerOf(["https://gone.example/x"]) }));
    expect(res.runs[0]!.trulyUnretrieved).toBe(1);
    expect(res.runs[0]!.missedUrls.trulyUnretrieved).toEqual(["https://gone.example/x"]);
  });

  it("flagged test tenants score per-run but drop OUT of the aggregate (JOURNEY.1)", async () => {
    const exec = fakeExec({
      ledgerRows: [ledgerRow("run_1", "sha1"), ledgerRow("run_t", "sha2", true)],
      fetchLog: {},
    });
    const res = await scanCitationCompleteness(exec, storeWith({ sha1: ledgerOf(["https://a.example/p"]), sha2: ledgerOf(["https://b.example/q"]) }));
    expect(res.scored).toBe(2); // the test run still has its own row (classified, visible)
    expect(res.aggregate.citedUrls).toBe(1); // …but the fleet number never counts it
  });

  it("a missing artifact counts unreadable (reported honestly, never silently scored)", async () => {
    const exec = fakeExec({ ledgerRows: [ledgerRow("run_1", "absent")], fetchLog: {} });
    const res = await scanCitationCompleteness(exec, storeWith({}));
    expect(res.scored).toBe(0);
    expect(res.unreadable).toBe(1);
    expect(res.aggregate.canonicalCompleteness).toBeNull(); // nothing cited → null, never a fabricated 1.0
  });
});

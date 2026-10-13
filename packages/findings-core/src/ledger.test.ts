import { describe, it, expect } from "vitest";
import type { Claim, FindingView } from "@rhema/contracts";
import { summarizeLedger, summarizeClaims, claimUrlViews, fetchLogFromRows } from "./ledger.js";

// AC4 — every claim URL shows fetched iff present in the proxy fetch log; the two-source stance fixture renders
// both edges (REQ-IDE-25; REQ-OBJ-18). (The chip DOM is asserted in @rhema/ui; here the join is the substrate.)

const user = { kind: "user", userId: "u_1" } as const;

function view(over: Partial<FindingView>): FindingView {
  return {
    id: "f_1", correspondenceId: "c_1", draftId: "d_1", kind: "argument", severity: "major",
    origin: "editor", anchor: null, title: "t", body: "b", rubricDims: [], provisional: false, ...over,
  };
}

function claim(over: Partial<Claim>): Claim {
  return {
    id: "cl_1", correspondenceId: "c_1", draftId: "d_1", ordinal: 1, text: "x",
    tier: 1, verdict: "verified", humanAdded: false, ...over,
  };
}

describe("claimUrlViews — the fetched ⇒ log join (REQ-IDE-25)", () => {
  const log = fetchLogFromRows([{ normalizedUrl: "https://courtlistener.com/opinion/1" }]);

  it("stamps a URL fetched iff its normalized URL is in the proxy log", () => {
    const c = claim({
      url: "https://www.courtlistener.com/opinion/1/?x=1",
      normalizedUrl: "https://courtlistener.com/opinion/1",
      accessedAt: "2026-09-16T00:00:00Z",
    });
    const [v] = claimUrlViews(c, log);
    expect(v?.fetched).toBe(true);
  });

  it("gives NO fetched chip to a URL absent from the log", () => {
    const c = claim({ url: "https://memory.example/not-fetched", normalizedUrl: "https://memory.example/not-fetched" });
    const [v] = claimUrlViews(c, log);
    expect(v?.fetched).toBe(false);
  });

  it("renders BOTH stance edges of a two-source claim (REQ-OBJ-18)", () => {
    const c = claim({
      sources: [
        { url: "https://a.test/s", normalizedUrl: "https://a.test/s", accessedAt: "2026-09-16T00:00:00Z", stance: "supports" },
        { url: "https://courtlistener.com/opinion/1", normalizedUrl: "https://courtlistener.com/opinion/1", accessedAt: "2026-09-16T00:00:00Z", stance: "contradicts" },
      ],
    });
    const views = claimUrlViews(c, log);
    expect(views.map((v) => v.stance)).toEqual(["supports", "contradicts"]);
    expect(views.find((v) => v.stance === "contradicts")?.fetched).toBe(true);
    expect(views.find((v) => v.stance === "supports")?.fetched).toBe(false);
  });

  it("de-duplicates the singular url against a matching sources[] edge", () => {
    const c = claim({
      url: "https://a.test/s",
      normalizedUrl: "https://a.test/s",
      sources: [{ url: "https://a.test/s", normalizedUrl: "https://a.test/s", accessedAt: "t", stance: "supports" }],
    });
    expect(claimUrlViews(c, log)).toHaveLength(1);
  });

  // CITE.1 — the "Search result" chip (ADR-083): the retrieved set is fetch ∪ search-url rows; a url
  // covered ONLY by a search hit still gets `fetched` but is stamped `retrievedBy:"search"` so the UI
  // can label it distinctly (never chip-less).
  it("a search-hit url stamps retrievedBy:'search' — the 'Search result' chip, not the fetch chip", () => {
    const c = claim({
      url: "https://news.example/story",
      normalizedUrl: "https://news.example/story",
    });
    const union = fetchLogFromRows([{ normalizedUrl: "https://news.example/story" }]);
    const searchOnly = fetchLogFromRows([{ normalizedUrl: "https://news.example/story" }]);
    const [v] = claimUrlViews(c, union, searchOnly);
    expect(v?.fetched).toBe(true);
    expect(v?.retrievedBy).toBe("search");
  });

  it("a page-fetched url stamps retrievedBy:'fetch' even when the search-only set is bound", () => {
    const c = claim({
      url: "https://courtlistener.com/opinion/1",
      normalizedUrl: "https://courtlistener.com/opinion/1",
    });
    const searchOnly = fetchLogFromRows([{ normalizedUrl: "https://elsewhere.example/hit" }]);
    const [v] = claimUrlViews(c, log, searchOnly);
    expect(v?.fetched).toBe(true);
    expect(v?.retrievedBy).toBe("fetch");
  });

  it("an unretrieved url carries NO retrievedBy — the missing chip stays missing", () => {
    const c = claim({ url: "https://memory.example/gone", normalizedUrl: "https://memory.example/gone" });
    const [v] = claimUrlViews(c, log, fetchLogFromRows([]));
    expect(v?.fetched).toBe(false);
    expect(v?.retrievedBy).toBeUndefined();
  });
});

describe("summaries (§5.7)", () => {
  it("summarizeClaims counts verdicts, tiers, contradicted-Tier-1 and fetched URLs", () => {
    const log = fetchLogFromRows([{ normalizedUrl: "https://cl.test/1" }]);
    const s = summarizeClaims(
      [
        claim({ id: "a", tier: 1, verdict: "contradicted", url: "https://cl.test/1", normalizedUrl: "https://cl.test/1" }),
        claim({ id: "b", tier: 2, verdict: "verified" }),
        claim({ id: "c", tier: 1, verdict: "verified" }),
      ],
      log,
    );
    expect(s.total).toBe(3);
    expect(s.contradictedTierOne).toBe(1);
    expect(s.byTier[1]).toBe(2);
    expect(s.fetchedUrls).toBe(1);
    expect(s.byVerdict.verified).toBe(2);
  });

  it("summarizeLedger tallies verbs, severities, undecided, and applied", () => {
    const s = summarizeLedger([
      view({ id: "a", severity: "blocking", disposition: { kind: "accept", by: user, at: "t", frozen: true, applied: true } }),
      view({ id: "b", severity: "major", disposition: { kind: "rebut", rationale: "r", by: user, at: "t", frozen: true } }),
      view({ id: "c", severity: "minor" }),
    ]);
    expect(s.total).toBe(3);
    expect(s.byVerb.accept).toBe(1);
    expect(s.byVerb.rebut).toBe(1);
    expect(s.undecided).toBe(1);
    expect(s.applied).toBe(1);
    expect(s.bySeverity.blocking).toBe(1);
  });
});

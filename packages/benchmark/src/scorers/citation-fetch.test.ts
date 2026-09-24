import { describe, expect, it } from "vitest";
import {
  citationFetchCompliance,
  claimLedgerCompliance,
  normalizeCitedUrl,
  assertCitationComplianceFloor,
  type CitedClaim,
} from "./citation-fetch.js";
// PARITY: the guard's own normalizer, imported so the test pins scorer↔guard agreement (dev-only import;
// @rhema/mirror is a devDependency of @rhema/benchmark — no production edge, see package.json).
import { normalizeUrl } from "@rhema/mirror";

// P0.15j — the citation-fetch-compliance eval (closes D-P0.15i-2). These fixtures model the two live shapes
// observed in P0.15i Stage B: a DISCIPLINED fact-check (every cited URL fetched → the guard passes) and the
// OBSERVED FAILURE (authoritative URLs cited from training knowledge — snopes/scientificamerican/forbes/
// deadline — that never appear in the run's fetch log). The eval is green on the compliant fixture (AC1) and
// flags every miss on the failing one, so a skill/model change can be hill-climbed to 100% and regressions caught.
const SCORER_DEVELOPMENT_ONLY = true as const;

/** A disciplined dev fixture: 3 claims, 4 distinct cited URLs, all fetched this session. */
const COMPLIANT: CitedClaim[] = [
  { ordinal: 0, url: "https://www.nature.com/articles/s41586-020-2649-2" },
  {
    ordinal: 1,
    url: "https://www.reuters.com/world/story",
    sources: [{ url: "https://www.reuters.com/world/story" }, { url: "https://arxiv.org/abs/2401.00001" }],
  },
  { ordinal: 2, sources: [{ url: "https://www.who.int/data/factsheet" }] },
];
// The proxy fetch log for the disciplined run — normalized, exactly what fetch_log stores.
const COMPLIANT_FETCHED = new Set(
  [
    "https://www.nature.com/articles/s41586-020-2649-2",
    "https://www.reuters.com/world/story",
    "https://arxiv.org/abs/2401.00001",
    "https://www.who.int/data/factsheet",
    "https://example.com/extra-search-result", // fetched but not cited — fine
  ].map(normalizeCitedUrl),
);

/** The observed P0.15i failure: real, on-topic URLs cited from memory, never retrieved this session. */
const NON_COMPLIANT: CitedClaim[] = [
  { ordinal: 0, url: "https://www.snopes.com/fact-check/some-claim/" },
  {
    ordinal: 1,
    url: "https://www.scientificamerican.com/article/some-piece",
    sources: [{ url: "https://www.forbes.com/sites/x/2023/01/01/y/" }],
  },
  { ordinal: 2, sources: [{ url: "https://deadline.com/2023/05/z-1234/" }] },
  // one claim WAS retrieved this session — compliance is a fraction, not 0.
  { ordinal: 3, url: "https://www.nature.com/articles/s41586-020-2649-2" },
];
const NON_COMPLIANT_FETCHED = new Set(
  ["https://www.nature.com/articles/s41586-020-2649-2"].map(normalizeCitedUrl),
);

describe("citation-fetch compliance eval (P0.15j / D-P0.15i-2)", () => {
  it("scores a disciplined fact-check at 100% (AC1 — green on the compliant dev fixture)", () => {
    expect(SCORER_DEVELOPMENT_ONLY).toBe(true);
    const r = citationFetchCompliance(COMPLIANT, COMPLIANT_FETCHED);
    expect(r.citedUrls).toBe(4); // reuters cited twice → counted once
    expect(r.fetchedCited).toBe(4);
    expect(r.compliance).toBe(1);
    expect(r.compliant).toBe(true);
    expect(r.misses).toEqual([]);
    expect(r.missedUrls).toBe(0);
    // the floor guard passes at the delivery bar.
    expect(() => assertCitationComplianceFloor(r)).not.toThrow();
  });

  it("flags every un-retrieved citation on the observed-failure fixture, per (claim, url, which)", () => {
    const r = citationFetchCompliance(NON_COMPLIANT, NON_COMPLIANT_FETCHED);
    expect(r.citedUrls).toBe(5); // snopes, scientificamerican, forbes, deadline, nature
    expect(r.missedUrls).toBe(4); // all but nature
    expect(r.fetchedCited).toBe(1);
    expect(r.compliance).toBeCloseTo(1 / 5, 10);
    expect(r.compliant).toBe(false);
    // the misses name the offending claim ordinal + whether the url was the claim url or a source url.
    expect(r.misses).toEqual([
      { claimOrdinal: 0, url: "https://www.snopes.com/fact-check/some-claim/", which: "claim" },
      { claimOrdinal: 1, url: "https://www.scientificamerican.com/article/some-piece", which: "claim" },
      { claimOrdinal: 1, url: "https://www.forbes.com/sites/x/2023/01/01/y/", which: "source" },
      { claimOrdinal: 2, url: "https://deadline.com/2023/05/z-1234/", which: "source" },
    ]);
  });

  it("counts a URL cited by many claims once toward the fraction but reports each occurrence as a miss", () => {
    const claims: CitedClaim[] = [
      { ordinal: 0, url: "https://miss.example/a" },
      { ordinal: 1, url: "https://miss.example/a" },
    ];
    const r = citationFetchCompliance(claims, new Set());
    expect(r.citedUrls).toBe(1);
    expect(r.missedUrls).toBe(1);
    expect(r.compliance).toBe(0);
    expect(r.misses).toHaveLength(2); // one row per citing claim, for the report
  });

  it("treats an empty / citation-free ledger as compliant (nothing to miss)", () => {
    expect(citationFetchCompliance([], new Set()).compliance).toBe(1);
    const noUrls: CitedClaim[] = [{ ordinal: 0 }, { ordinal: 1, sources: [] }];
    const r = citationFetchCompliance(noUrls, new Set());
    expect(r.citedUrls).toBe(0);
    expect(r.compliant).toBe(true);
  });

  it("throws below the floor with the misses named, passes at/above it", () => {
    const r = citationFetchCompliance(NON_COMPLIANT, NON_COMPLIANT_FETCHED);
    expect(() => assertCitationComplianceFloor(r)).toThrow(/snopes\.com/); // default floor 1
    expect(() => assertCitationComplianceFloor(r, 0.5)).toThrow(); // 0.2 compliance < 0.5
    expect(() => assertCitationComplianceFloor(r, 1 / 5)).not.toThrow(); // meets the exact floor
    expect(() => assertCitationComplianceFloor(r, 0.1)).not.toThrow();
  });

  it("scores a whole 01-claim-ledger sidecar via claimLedgerCompliance", () => {
    const r = claimLedgerCompliance({ claims: COMPLIANT as never }, COMPLIANT_FETCHED);
    expect(r.compliant).toBe(true);
  });

  describe("normalization parity with the guard (@rhema/mirror normalizeUrl)", () => {
    // the cases the guard cares about: case-fold scheme+host, strip trailing slash, drop query + fragment.
    const CASES = [
      "https://Example.COM/Path/",
      "http://host.example/a/b/",
      "https://x.example/p?q=1&r=2#frag",
      "https://y.example",
      "not a url",
      "HTTPS://Z.EXAMPLE/A?b=c",
    ];
    it("normalizeCitedUrl equals mirror's normalizeUrl on every case (drift guard)", () => {
      for (const c of CASES) expect(normalizeCitedUrl(c)).toBe(normalizeUrl(c));
    });
    it("a cited URL differing only by trailing slash / query / case matches a fetched one", () => {
      const claims: CitedClaim[] = [{ ordinal: 0, url: "https://Example.com/Article/?utm=x#top" }];
      const fetched = new Set([normalizeUrl("https://example.com/Article")]);
      expect(citationFetchCompliance(claims, fetched, normalizeUrl).compliant).toBe(true);
    });
  });
});

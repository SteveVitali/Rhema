import { describe, expect, it } from "vitest";
import {
  citationFetchCompliance,
  claimLedgerCompliance,
  normalizeCitedUrl,
  assertCitationComplianceFloor,
  type CitedClaim,
} from "./citation-fetch.js";
// PARITY: the guard's own normalizer + validator, imported so the test pins scorer↔guard agreement
// (dev-only import; @rhema/mirror + @rhema/findings-core are devDependencies of @rhema/benchmark —
// no production edge, see package.json).
import { normalizeUrl, validateCitedFetched } from "@rhema/mirror";
import { claimUrlViews, fetchLogFromRows } from "@rhema/findings-core";

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

  // CITE.1 (ADR-083/084) — the THREE-way parity pin: scorer ↔ guard ↔ chip must agree on every case.
  // Each row is a stored fetch_log `normalized_url` in the PROXY's write form (which keeps the query,
  // the trailing slash, `URL.toString()` output) plus the cited url the ledger carried; `covered` is the
  // expected post-fix verdict on ALL THREE surfaces. Pre-fix the chip + the byte-join disagreed with
  // the guard (real fetches stripped/chip-less); post-fix they can never drift — a regression in any
  // one of the three fails this table.
  describe("three-way parity: scorer ↔ guard ↔ chip (CITE.1)", () => {
    const CASES: { name: string; stored: string; cited: string; covered: boolean; kind?: "fetch" | "search" }[] = [
      { name: "trailing slash on the stored side", stored: "https://x.test/a/", cited: "https://x.test/a", covered: true },
      { name: "query on the stored side", stored: "https://x.test/a/?id=7", cited: "https://x.test/a", covered: true },
      { name: "query on the cited side", stored: "https://x.test/a/", cited: "https://x.test/a?id=7", covered: true },
      { name: "fragment dropped both ways", stored: "https://x.test/a#frag", cited: "https://x.test/a", covered: true },
      { name: "scheme+host case folds", stored: "https://X.TEST/a", cited: "https://x.test/a", covered: true },
      { name: "path case stays significant — a MISS on all three", stored: "https://x.test/A", cited: "https://x.test/a", covered: false },
      { name: "search-hit row counts retrieved (guard + chip + scorer agree)", stored: "https://hit.test/p", cited: "https://hit.test/p", covered: true, kind: "search" },
      { name: "a true miss stays a miss everywhere", stored: "https://x.test/other", cited: "https://gone.test/x", covered: false },
    ];

    for (const tc of CASES) {
      it(`${tc.name} — ${tc.covered ? "covered" : "missed"} identically`, () => {
        // the delivered read path: stored rows re-canonicalized on read (ADR-083) — the guard's set,
        // the scorer's set and the chip's set are THE SAME canonical identity.
        const canonicalSet = new Set([normalizeUrl(tc.stored)]);

        // (1) the guard — `validateCitedFetched` unchanged (ADR-006).
        const claim = {
          ordinal: 0,
          url: tc.cited,
          sources: [] as { url: string }[],
        };
        const guard = validateCitedFetched([claim as never], canonicalSet);
        expect(guard.misses).toHaveLength(tc.covered ? 0 : 1);

        // (2) the scorer.
        const score = citationFetchCompliance([claim], canonicalSet);
        expect(score.compliant).toBe(tc.covered);

        // (3) the dossier chip — `fetchLogFromRows` canonicalizes the stored proxy form, then
        // `claimUrlViews` stamps `fetched` (+ `retrievedBy` for the search-hit label).
        const log = fetchLogFromRows([{ normalizedUrl: tc.stored }]);
        const searchOnly = tc.kind === "search" ? log : undefined;
        const view = claimUrlViews(
          { url: tc.cited, normalizedUrl: normalizeUrl(tc.cited), ordinal: 0 } as never,
          log,
          searchOnly,
        );
        expect(view[0]?.fetched).toBe(tc.covered);
        if (tc.covered && tc.kind === "search") expect(view[0]?.retrievedBy).toBe("search");
        if (tc.covered && tc.kind !== "search") expect(view[0]?.retrievedBy).toBe("fetch");
      });
    }

    it("normalizeCitedUrl IS the canonical guard normalizer (same function, not a copy)", () => {
      // ADR-083 — the scorer re-exports @rhema/contracts `normalizeUrl`; identity is the guarantee.
      for (const c of ["https://a.test/x/", "HTTPS://B.test/Y?z=1#f", "not a url"]) {
        expect(normalizeCitedUrl(c)).toBe(normalizeUrl(c));
      }
    });
  });
});

import { describe, expect, it } from "vitest";
import type { ClaimLedgerSidecar } from "@rhema/contracts";
import {
  applyVerdictSourceChecks,
  normalizeUrl,
  registrableDomain,
  validateCitedFetched,
  validateSidecars,
  verdictSourceCheck,
  type VerdictSourceContext,
} from "./validation.js";

// P0.09 delivery validations (pure): cited⇒fetched (REQ-VIS-9), the model-independent verdict source check
// (§12.8(c)/REQ-SPEC-25(c)), sidecar validation, and the registrable-domain helper.

type Claim = ClaimLedgerSidecar["claims"][number];

function claim(over: Partial<Claim>): Claim {
  return { ordinal: 1, text: "a claim", tier: 1, verdict: "verified", humanAdded: false, ...over } as Claim;
}

describe("registrableDomain / normalizeUrl", () => {
  it("returns eTLD+1, handling common multi-part TLDs", () => {
    expect(registrableDomain("https://www.nature.com/articles/x")).toBe("nature.com");
    expect(registrableDomain("https://sub.example.co.uk/a")).toBe("example.co.uk");
    expect(registrableDomain("http://gov.uk")).toBe("gov.uk");
  });
  it("normalizes url to scheme+host+path, dropping the query (anti-exfil)", () => {
    expect(normalizeUrl("HTTPS://Example.com/Path/?q=secret#frag")).toBe("https://example.com/Path");
  });
});

describe("cited ⇒ fetched (REQ-VIS-9)", () => {
  const fetched = new Set([normalizeUrl("https://a.example/one"), normalizeUrl("https://b.example/two")]);

  it("passes when every claim.url and claim.sources[].url is in the proxy fetch log", () => {
    const claims = [
      claim({ url: "https://a.example/one", normalizedUrl: normalizeUrl("https://a.example/one") }),
      claim({
        ordinal: 2,
        verdict: "contradicted",
        sources: [{ url: "https://b.example/two", normalizedUrl: normalizeUrl("https://b.example/two"), accessedAt: "2026-09-03T00:00:00.000Z", stance: "contradicts" }],
      }),
    ];
    expect(validateCitedFetched(claims, fetched).ok).toBe(true);
  });

  it("fails a claim.url absent from the fetch log (AC3)", () => {
    const claims = [claim({ url: "https://c.example/missing" })];
    const r = validateCitedFetched(claims, fetched);
    expect(r.ok).toBe(false);
    expect(r.misses[0]).toMatchObject({ claimOrdinal: 1, which: "claim" });
  });

  it("fails a claim.sources[].url absent from the fetch log (REQ-OBJ-18 / AC3)", () => {
    const claims = [
      claim({
        verdict: "contradicted",
        sources: [{ url: "https://d.example/missing", normalizedUrl: normalizeUrl("https://d.example/missing"), accessedAt: "2026-09-03T00:00:00.000Z", stance: "contradicts" }],
      }),
    ];
    const r = validateCitedFetched(claims, fetched);
    expect(r.ok).toBe(false);
    expect(r.misses[0]!.which).toBe("source");
  });

  it("passes when a citation resolves against a proxy-logged web-SEARCH RESULT url, and still fails an unfetched one — the P0.15i provenance, guard intact (AC2)", () => {
    // Once the agent does real server-side web_search, the proxy logs each RESULT page url (P0.15h `collectResultUrls`).
    // `fetchedNormalizedUrls` is built from those rows; a claim citing one of them now has provenance and passes.
    const proxyLogged = new Set([normalizeUrl("https://reuters.com/article/x")]);
    expect(
      validateCitedFetched([claim({ url: "https://reuters.com/article/x?utm=1" })], proxyLogged).ok,
    ).toBe(true);
    // A citation reachable only from inside a fetched page (never a search result / direct fetch) is still a miss —
    // the §12.8(c) guard is preserved by this ticket, not weakened.
    expect(validateCitedFetched([claim({ url: "https://model-knowledge.example/z" })], proxyLogged).ok).toBe(false);
  });
});

describe("verdict source check (§12.8(c))", () => {
  const ctx = (over: Partial<VerdictSourceContext>): VerdictSourceContext => ({
    citationDomains: new Set(),
    reputableDomains: new Set(),
    searchResultDomains: new Set(),
    ...over,
  });

  // AC6 — a contradicted Tier-1 verdict citing only a domain reached from inside a fetched page is downgraded.
  it("downgrades a contradicted Tier-1 verdict whose source domain is only in-page-reached", () => {
    const c = claim({
      tier: 1,
      verdict: "contradicted",
      url: "https://attacker.example/injected",
      sources: [{ url: "https://attacker.example/injected", normalizedUrl: normalizeUrl("https://attacker.example/injected"), accessedAt: "2026-09-03T00:00:00.000Z", stance: "contradicts" }],
    });
    const out = verdictSourceCheck(c, ctx({})); // attacker.example is not in any allowed set
    expect(out.verdict).toBe("unverifiable");
    expect(out.sourceCheck).toBe("suspicious_source");
    expect(out.downgraded).toBe(true);
  });

  it("passes a citation-matching domain (§12.8(c))", () => {
    const c = claim({
      tier: 1,
      verdict: "contradicted",
      url: "https://journal.example/paper",
      sources: [{ url: "https://journal.example/paper", normalizedUrl: normalizeUrl("https://journal.example/paper"), accessedAt: "2026-09-03T00:00:00.000Z", stance: "contradicts" }],
    });
    const out = verdictSourceCheck(c, ctx({ citationDomains: new Set(["journal.example"]) }));
    expect(out.verdict).toBe("contradicted");
    expect(out.sourceCheck).toBe("matches_citation");
    expect(out.downgraded).toBe(false);
  });

  it("passes a domain reached from a search result", () => {
    const c = claim({
      tier: 1,
      verdict: "verified",
      url: "https://found.example/a",
      sources: [{ url: "https://found.example/a", normalizedUrl: normalizeUrl("https://found.example/a"), accessedAt: "2026-09-03T00:00:00.000Z", stance: "supports" }],
    });
    const out = verdictSourceCheck(c, ctx({ searchResultDomains: new Set(["found.example"]) }));
    expect(out.verdict).toBe("verified");
    expect(out.sourceCheck).toBe("from_search");
  });

  it("leaves non-Tier-1 and non-verified/contradicted verdicts untouched", () => {
    expect(verdictSourceCheck(claim({ tier: 2, verdict: "contradicted", url: "https://x.example/y" }), ctx({})).downgraded).toBe(false);
    expect(verdictSourceCheck(claim({ tier: 1, verdict: "unsupported" }), ctx({})).downgraded).toBe(false);
  });

  it("applyVerdictSourceChecks reports the downgraded ordinals", () => {
    const claims = [
      claim({ ordinal: 1, tier: 1, verdict: "verified", url: "https://ok.example/a", sources: [{ url: "https://ok.example/a", normalizedUrl: normalizeUrl("https://ok.example/a"), accessedAt: "2026-09-03T00:00:00.000Z", stance: "supports" }] }),
      claim({ ordinal: 2, tier: 1, verdict: "contradicted", url: "https://bad.example/b", sources: [{ url: "https://bad.example/b", normalizedUrl: normalizeUrl("https://bad.example/b"), accessedAt: "2026-09-03T00:00:00.000Z", stance: "contradicts" }] }),
    ];
    const applied = applyVerdictSourceChecks(claims, ctx({ reputableDomains: new Set(["ok.example"]) }));
    expect(applied.filter((a) => a.downgraded).map((a) => a.claim.ordinal)).toEqual([2]);
  });
});

describe("sidecar validation", () => {
  it("passes a valid claim-ledger sidecar and fails a malformed one", () => {
    const good = validateSidecars([
      { filename: "01-claim-ledger.json", json: { sidecar: "claim_ledger", version: 1, claims: [] } },
    ]);
    expect(good.ok).toBe(true);
    const bad = validateSidecars([{ filename: "01-claim-ledger.json", json: { sidecar: "claim_ledger", version: 1, claims: [{ ordinal: 0 }] } }]);
    expect(bad.ok).toBe(false);
  });
});

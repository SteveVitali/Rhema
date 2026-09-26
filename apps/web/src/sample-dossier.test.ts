import { describe, it, expect } from "vitest";
import { honorsContradictedTierOneRule } from "@rhema/ui";
import { SAMPLE_DOSSIER } from "./sample-dossier.js";

// REQ-POS-3 — the sample dossier's claim ledger must contain ≥1 contradicted Tier-1 claim carrying its
// fetched URL (the "this is not chat" proof). Enforced as data so the content can never regress below it.

describe("sample dossier (REQ-POS-3)", () => {
  it("has at least one contradicted Tier-1 claim with a fetched URL", () => {
    expect(honorsContradictedTierOneRule(SAMPLE_DOSSIER.claims)).toBe(true);
  });

  it("the contradicted Tier-1 claim carries a real fetched source", () => {
    const claim = SAMPLE_DOSSIER.claims.find((c) => c.tier === 1 && c.verdict === "contradicted");
    expect(claim).toBeDefined();
    expect(claim!.fetched.length).toBeGreaterThan(0);
    expect(claim!.fetched[0]!.url).toMatch(/^https:\/\//);
  });
});

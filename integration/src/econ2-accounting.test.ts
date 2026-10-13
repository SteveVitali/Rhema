import { describe, expect, it } from "vitest";
import { offlineAccounting } from "./econ2-accounting.js";

// ECON.2 (ADR-087) — the $0 offline accounting's own guard rails: the report must be internally
// consistent (L5's tuned policy = the real authored policy with the floor absolute-preserved;
// the L3 $0-at-Base prediction; the modeled ceiling finite and honest), and the restore
// assessment must state the gap rather than reach for it.

describe("offlineAccounting (ECON.2 — $0 Stage-B prerequisite)", () => {
  const report = offlineAccounting({
    words: 6_000,
    tier: "base",
    baselineEstimateUsd: 20.25,
    restoreTargetUsd: 6,
  });

  it("derives the fixture's provisional claim count at the PRB.22 density (24 claims)", () => {
    expect(report.claims).toBe(24);
    expect(report.fixtureWords).toBe(6_000);
  });

  it("L5's tuned policy is the REAL authorWebToolPolicy arm — floors absolute-preserved", () => {
    const { untuned, tuned } = report.policyDelta;
    expect(tuned.searchFloor).toBe(untuned.searchFloor);
    expect(tuned.fetchFloor).toBe(untuned.fetchFloor);
    expect(tuned.fetchBudget).toBeLessThan(untuned.fetchBudget!);
    expect(tuned.searchBudget).toBeLessThan(untuned.searchBudget!);
    expect(tuned.fetchMaxContentTokens).toBe(4_000);
    expect(untuned.fetchMaxContentTokens).toBe(8_000);
  });

  it("L3 models $0 at Base — the §12.3 table routes every cell to Sonnet", () => {
    const l3 = report.levers.find((l) => l.lever === "l3PhaseRouting")!;
    expect(l3.highUsd).toBe(0);
    expect(l3.model).toContain("Sonnet");
  });

  it("every lever emits a bounded range (low ≤ high) with a named model", () => {
    expect(report.levers).toHaveLength(5);
    for (const l of report.levers) {
      expect(l.lowUsd).toBeLessThanOrEqual(l.highUsd);
      expect(l.model.length).toBeGreaterThan(40);
    }
  });

  it("the restore assessment states the gap honestly — the modeled ceiling cannot reach ~$6", () => {
    // Offline accounting says the five levers' HIGH bounds sum to cents, not the ~$14 the
    // restore condition needs — the honest headline the run ledger + deferrals record.
    expect(report.restoreAssessment.reachable).toBe(false);
    expect(report.restoreAssessment.gapUsd).toBeGreaterThan(10);
    expect(report.modeledCeilingUsd).toBeLessThan(2);
  });
});

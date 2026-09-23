import { describe, it, expect } from "vitest";
import { buildEstimate } from "./estimate.js";
import { buildLeverMatrix, leverKey, signedCredits, timeBandFor } from "./lever-matrix.js";

// AC2 — every lever change recomputes estimate/cap/time ≤100 ms; Advanced toggles show signed deltas;
// fact-check off on the 8k/45 golden draft moves ≈1,240 → ≈330 ± 10%.
describe("buildLeverMatrix — recompute + signed deltas (§5.6 item 2; REQ-BILL-5)", () => {
  it("recomputes the whole matrix in well under 100 ms", () => {
    const start = performance.now();
    const m = buildLeverMatrix({ workflow: "review", inputs: { words: 8000, claims: 45 }, rigor: "standard", modelTier: "base" });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
    // a lookup recompute (what the client does per lever change) is a map read — effectively free.
    const lookupStart = performance.now();
    let sink: unknown;
    for (let i = 0; i < 1000; i++) sink = m.states[leverKey("full_board", "frontier", m.current.toggles)];
    expect(sink).toBeDefined();
    expect(performance.now() - lookupStart).toBeLessThan(100);
  });

  it("every rigor × tier × toggle combination is precomputed and keyed", () => {
    const m = buildLeverMatrix({ workflow: "review", inputs: { words: 8000, claims: 45 }, rigor: "standard", modelTier: "base" });
    // 3 rigor × 3 tier × 2^3 toggles = 72 review states.
    expect(Object.keys(m.states)).toHaveLength(72);
    const key = leverKey(m.current.rigor, m.current.modelTier, m.current.toggles);
    expect(m.states[key]).toBeDefined();
  });

  it("REQ-BILL-5: fact-check OFF on the 8k/45 review moves the figure to ≈614 ± 10% (Base/Standard)", () => {
    const on = buildEstimate({ workflow: "review", rigor: "standard", modelTier: "base", inputs: { words: 8000, claims: 45 }, toggles: { fact_check: true } });
    const off = buildEstimate({ workflow: "review", rigor: "standard", modelTier: "base", inputs: { words: 8000, claims: 45 }, toggles: { fact_check: false } });
    // the golden's post-toggle figure ≈ 614 (PRB.23's per-phase churn repriced the golden).
    expect(Math.abs(off.estimateCredits - 614) / 614).toBeLessThanOrEqual(0.1);
    // turning fact-check off is a strict reduction (a negative delta).
    expect(off.estimateCredits).toBeLessThan(on.estimateCredits);
    // and the delta equals the claim-verification contribution: 45 claims × the per-claim cost PLUS the
    // verification-phase research addend (PRB.22 — 60 floor + 16/claim) PLUS that phase's churn
    // (PRB.23 — the verification phase no longer runs, so its ~50-cr session burn leaves too).
    expect(on.estimateCredits - off.estimateCredits).toBe(45 * 24 + 60 + 45 * 16 + 50);
  });

  it("each Advanced toggle exposes a SIGNED delta from the same estimator", () => {
    const m = buildLeverMatrix({ workflow: "review", inputs: { words: 8000, claims: 45 }, rigor: "standard", modelTier: "base" });
    const byKey = Object.fromEntries(m.toggleDeltas.map((d) => [d.toggle, d]));
    // all default on at Standard; flipping fact-check OFF is a large negative delta.
    expect(byKey.fact_check.enabled).toBe(true);
    expect(byKey.fact_check.deltaCredits).toBeLessThan(0);
    expect(byKey.fact_check.deltaLabel.startsWith("−")).toBe(true);
    // discourse / second read off are smaller negative deltas.
    expect(byKey.discourse.deltaCredits).toBeLessThan(0);
    expect(byKey.second_read.deltaCredits).toBeLessThan(0);
  });

  it("a positive delta (turning a default-off toggle on) is labelled with a +", () => {
    // At Quick, discourse/second read default OFF; the matrix's toggle deltas at Quick show turning them ON as +.
    const m = buildLeverMatrix({ workflow: "review", inputs: { words: 8000, claims: 45 }, rigor: "quick", modelTier: "base" });
    const discourse = m.toggleDeltas.find((d) => d.toggle === "discourse")!;
    expect(discourse.enabled).toBe(false);
    expect(discourse.deltaCredits).toBeGreaterThan(0);
    expect(discourse.deltaLabel.startsWith("+")).toBe(true);
  });

  it("signedCredits formats with an explicit sign and thousands separators", () => {
    expect(signedCredits(90)).toBe("+90");
    expect(signedCredits(-1080)).toBe("−1,080");
    expect(signedCredits(0)).toBe("0");
  });

  it("timeBandFor derives a plausible increasing band", () => {
    const band = timeBandFor(560);
    expect(band.lowMinutes).toBeGreaterThanOrEqual(5);
    expect(band.highMinutes).toBeGreaterThan(band.lowMinutes);
  });

  it("changing rigor and tier changes the estimate (the one first-class lever + its consequence)", () => {
    const m = buildLeverMatrix({ workflow: "review", inputs: { words: 8000, claims: 45 }, rigor: "standard", modelTier: "base" });
    const quickBase = m.states[leverKey("quick", "base", { fact_check: true, discourse: false, second_read: false })];
    const fullFrontier = m.states[leverKey("full_board", "frontier", { fact_check: true, discourse: true, second_read: true })];
    expect(quickBase!.estimateCredits).toBeLessThan(fullFrontier!.estimateCredits);
  });
});

import { describe, it, expect, vi } from "vitest";
import { durationPriorForPhases } from "@rhema/contracts";
import { buildEstimate } from "./estimate.js";
import { buildLeverMatrix, leverKey, signedCredits } from "./lever-matrix.js";
import { activePhaseCount } from "./profiles.js";

// AC2 — every lever change recomputes estimate/cap/time ≤100 ms; Advanced toggles show signed deltas;
// fact-check off on the 8k/45 golden draft moves ≈1,240 → ≈330 ± 10%.
// EST.1 (ADR-036, BL-12) — TWO guards replace the flaky single-shot clock:
//  (a) wall-clock: the MEDIAN of five timed builds after two un-timed warm-ups stays <100 ms
//      (a single-shot measurement flaked under full-suite CPU contention — the code was fine);
//  (b) structural: the estimator's CALL COUNT is bounded to ~one buildEstimate per distinct state —
//      at 72 states a genuine O(states²) implementation (e.g. a per-state rescale over `m.states`)
//      stays under 100 ms on a fast machine, so the clock alone cannot catch it; the call bound can
//      (mutation-verified during the EST.1 run — see docs/build/runs/EST.1.md).
let buildEstimateCalls = 0;
vi.mock("./estimate.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./estimate.js")>();
  return {
    ...mod,
    buildEstimate: (a: Parameters<typeof mod.buildEstimate>[0]) => {
      buildEstimateCalls += 1;
      return mod.buildEstimate(a);
    },
  };
});
describe("buildLeverMatrix — recompute + signed deltas (§5.6 item 2; REQ-BILL-5)", () => {
  it("recomputes the whole matrix in well under 100 ms (median of 5)", () => {
    const args = { workflow: "review" as const, inputs: { words: 8000, claims: 45 }, rigor: "standard" as const, modelTier: "base" as const };
    buildLeverMatrix(args); // warm-up (JIT/module cold start is not the budgeted quantity)
    buildLeverMatrix(args);
    const samples: number[] = [];
    let m = buildLeverMatrix(args);
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      m = buildLeverMatrix(args);
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    expect(samples[2]).toBeLessThan(100); // median of 5
    // a lookup recompute (what the client does per lever change) is a map read — effectively free.
    const lookupStart = performance.now();
    let sink: unknown;
    for (let i = 0; i < 1000; i++) sink = m.states[leverKey("full_board", "frontier", m.current.toggles)];
    expect(sink).toBeDefined();
    expect(performance.now() - lookupStart).toBeLessThan(100);
  });

  it("calls the estimator ~once per DISTINCT state — a quadratic implementation fails this bound", () => {
    buildEstimateCalls = 0;
    const m = buildLeverMatrix({ workflow: "review", inputs: { words: 8000, claims: 45 }, rigor: "standard", modelTier: "base" });
    // 72 cells + 3 toggle-delta probes + the current state — LINEAR in distinct states.
    // A per-state rescale (the O(states²) mutation) costs ≈72² = 5,184 calls and fails here even
    // though it still meets the 100 ms wall-clock on a fast machine.
    const bound = Object.keys(m.states).length + m.toggleDeltas.length + 1;
    expect(buildEstimateCalls).toBeLessThanOrEqual(bound);
    expect(buildEstimateCalls).toBeGreaterThanOrEqual(Object.keys(m.states).length); // no state skipped
  });

  it("every rigor × tier × toggle combination is precomputed and keyed", () => {
    const m = buildLeverMatrix({ workflow: "review", inputs: { words: 8000, claims: 45 }, rigor: "standard", modelTier: "base" });
    // 3 rigor × 3 tier × 2^3 toggles = 72 review states.
    expect(Object.keys(m.states)).toHaveLength(72);
    const key = leverKey(m.current.rigor, m.current.modelTier, m.current.toggles);
    expect(m.states[key]).toBeDefined();
  });

  it("REQ-BILL-5: fact-check OFF on the 8k/45 review moves the figure to ≈1318 ± 10% (Base/Standard)", () => {
    const on = buildEstimate({ workflow: "review", rigor: "standard", modelTier: "base", inputs: { words: 8000, claims: 45 }, toggles: { fact_check: true } });
    const off = buildEstimate({ workflow: "review", rigor: "standard", modelTier: "base", inputs: { words: 8000, claims: 45 }, toggles: { fact_check: false } });
    // the golden's post-toggle figure ≈ 1318 (PRB.24's churn recalibration repriced the golden:
    // 736 base incl. 6×100 churn + 278 discourse + 40 second_read = 1054; PRB.25's ×1.25
    // metered-vs-committed coverage → ceil(1054 × 1.25) = 1318).
    expect(Math.abs(off.estimateCredits - 1318) / 1318).toBeLessThanOrEqual(0.1);
    // turning fact-check off is a strict reduction (a negative delta).
    expect(off.estimateCredits).toBeLessThan(on.estimateCredits);
    // and the delta equals the claim-verification contribution — 45 claims × the per-claim cost PLUS the
    // verification-phase research addend (PRB.22 — 60 floor + 16/claim; PRB.24 — +140 measured
    // research-loop churn) PLUS that phase's churn — scaled by the ×1.25 coverage:
    // (1080 + 920 + 100) × 1.25 = 2625.
    expect(on.estimateCredits - off.estimateCredits).toBe(Math.ceil(3154 * 1.25) - Math.ceil(1054 * 1.25)); // 3943 − 1318 = 2625
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

  it("EST.1 — duration bands are shared: a calibrated cell wins, else the per-phase prior", () => {
    const toggles = { fact_check: true, discourse: true, second_read: true };
    const m = buildLeverMatrix({
      workflow: "review",
      inputs: { words: 8000, claims: 45 },
      rigor: "standard",
      modelTier: "base",
      durations: { "standard|base": { lowMinutes: 8, highMinutes: 14 } },
    });
    // the calibrated cell governs its bucket …
    expect(m.states[leverKey("standard", "base", toggles)]!.time).toEqual({
      lowMinutes: 8,
      highMinutes: 14,
    });
    // … and an uncovered bucket falls back to the SAME per-phase prior every surface renders.
    const uncovered = m.states[leverKey("standard", "frontier", toggles)]!.time;
    expect(uncovered).toEqual(durationPriorForPhases(activePhaseCount("review", toggles)!));
    expect(uncovered.lowMinutes).toBeGreaterThanOrEqual(1);
    expect(uncovered.highMinutes).toBeGreaterThan(uncovered.lowMinutes);
  });

  it("changing rigor and tier changes the estimate (the one first-class lever + its consequence)", () => {
    const m = buildLeverMatrix({ workflow: "review", inputs: { words: 8000, claims: 45 }, rigor: "standard", modelTier: "base" });
    const quickBase = m.states[leverKey("quick", "base", { fact_check: true, discourse: false, second_read: false })];
    const fullFrontier = m.states[leverKey("full_board", "frontier", { fact_check: true, discourse: true, second_read: true })];
    expect(quickBase!.estimateCredits).toBeLessThan(fullFrontier!.estimateCredits);
  });
});

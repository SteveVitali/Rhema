import { describe, expect, it } from "vitest";
import { pairedDifference, fixSampleSize } from "./power.js";

// REQ-EVAL-5 power machinery — paired per-draft difference + n-fixing (≥80% power for a 10-pt difference, floor 24).

describe("pairedDifference", () => {
  it("computes the paired diffs and their sd (hand-checked)", () => {
    // rhema−baseline = [0.2,0.1,0.3]; mean 0.2; Σ(dev²)=0+0.01+0.01=0.02; /(2)=0.01; sd=0.1
    const p = pairedDifference([0.8, 0.7, 0.9], [0.6, 0.6, 0.6]);
    expect(p.differences.map((d) => Number(d.toFixed(4)))).toEqual([0.2, 0.1, 0.3]);
    expect(p.meanDifference).toBeCloseTo(0.2, 12);
    expect(p.variance).toBeCloseTo(0.01, 12);
    expect(p.sd).toBeCloseTo(0.1, 12);
  });
  it("rejects mismatched lengths and single-draft pilots", () => {
    expect(() => pairedDifference([0.5], [0.4])).toThrow();
    expect(() => pairedDifference([0.5, 0.6], [0.4])).toThrow();
  });
});

describe("fixSampleSize", () => {
  it("floors at 24 when the required n is smaller (sd 0.1, 10-pt effect)", () => {
    // n = ceil((2.80158522·0.1/0.1)²) = ceil(7.8489) = 8 → max(8,24) = 24
    const r = fixSampleSize(0.1, { effect: 0.1 });
    expect(r.requiredN).toBe(8);
    expect(r.fixedN).toBe(24);
    // detectable effect at n=24: 2.80158522·0.1/√24 ≈ 0.05719 (≈5.7 pts — below the 15-pt criterion)
    expect(r.detectableEffectAtFixedN).toBeCloseTo(0.057187, 5);
  });
  it("uses the required n when it exceeds the floor (larger sd)", () => {
    // sd 0.3: n = ceil((2.80158522·0.3/0.1)²) = ceil(70.64) = 71
    const r = fixSampleSize(0.3, { effect: 0.1 });
    expect(r.requiredN).toBe(71);
    expect(r.fixedN).toBe(71);
  });
  it("needs only the floor for a zero-variance pilot", () => {
    const r = fixSampleSize(0, { effect: 0.1 });
    expect(r.requiredN).toBe(0);
    expect(r.fixedN).toBe(24);
  });
  it("rejects a non-positive effect", () => {
    expect(() => fixSampleSize(0.1, { effect: 0 })).toThrow();
  });
});

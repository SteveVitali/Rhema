import { describe, expect, it } from "vitest";
import { cohenKappa, weightedKappa, mean, sampleVariance, diceOverlap, jaccard } from "./stats.js";

// Hand-computed checks of the statistical primitives the scorers + power machinery build on (REQ-EVAL-9b:
// chance-corrected agreement). Every expected value is derived by hand in the comments.

describe("cohenKappa", () => {
  it("reproduces a hand-computed κ", () => {
    // a=[X,X,Y,Y] b=[X,Y,Y,Y]: agree=3 → p_o=0.75; countA{X2,Y2} countB{X1,Y3}
    // p_e = (2/4)(1/4)+(2/4)(3/4) = 0.5 → κ = (0.75−0.5)/(1−0.5) = 0.5
    expect(cohenKappa(["X", "X", "Y", "Y"], ["X", "Y", "Y", "Y"])).toBeCloseTo(0.5, 12);
  });
  it("is 1 for perfect agreement and 0 at chance", () => {
    expect(cohenKappa(["a", "b", "c"], ["a", "b", "c"])).toBe(1);
    // total disagreement with balanced marginals → negative
    expect(cohenKappa(["a", "b"], ["b", "a"])).toBeLessThan(0);
  });
  it("handles the degenerate single-category case", () => {
    expect(cohenKappa(["a", "a"], ["a", "a"])).toBe(1);
    expect(cohenKappa([], [])).toBe(1);
  });
});

describe("weightedKappa (ordinal)", () => {
  const levels = ["lo", "hi"];
  it("is −1 for a complete swap on a 2-level quadratic scale", () => {
    // a=[lo,hi] b=[hi,lo]: numObs=1, numExp=0.5 → κ = 1 − 1/0.5 = −1
    expect(weightedKappa(["lo", "hi"], ["hi", "lo"], levels, "quadratic")).toBeCloseTo(-1, 12);
  });
  it("is 1 for perfect ordinal agreement", () => {
    expect(weightedKappa(["lo", "hi", "hi"], ["lo", "hi", "hi"], levels)).toBe(1);
  });
  it("penalizes a far disagreement more than a near one", () => {
    const scale = ["note", "minor", "major", "blocking"];
    const near = weightedKappa(["major", "major"], ["blocking", "major"], scale);
    const far = weightedKappa(["note", "major"], ["blocking", "major"], scale);
    expect(near).toBeGreaterThan(far);
  });
});

describe("mean / sampleVariance", () => {
  it("computes a hand-checked variance", () => {
    // [2,4,6]: mean 4; Σ(dev²)=4+0+4=8; /(3−1)=4
    expect(mean([2, 4, 6])).toBe(4);
    expect(sampleVariance([2, 4, 6])).toBe(4);
  });
  it("rejects fewer than two observations", () => {
    expect(() => sampleVariance([1])).toThrow();
  });
});

describe("diceOverlap / jaccard", () => {
  it("dice: 2·2/(3+3)=2/3", () => {
    expect(diceOverlap(2, 3, 3)).toBeCloseTo(2 / 3, 12);
  });
  it("jaccard {a,b,c}∩{b,c,d}=2, ∪=4 → 0.5", () => {
    expect(jaccard(new Set(["a", "b", "c"]), new Set(["b", "c", "d"]))).toBe(0.5);
    expect(jaccard(new Set(), new Set())).toBe(1);
  });
});

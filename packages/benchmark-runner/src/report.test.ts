import { describe, it, expect } from "vitest";
import {
  assertHeadlineNoPairwise,
  PairwiseInHeadlineError,
  assertPublicClean,
  PrivateLeakError,
  band,
  classifyConsequence,
  HEADLINE_METRICS,
  PAIRWISE_METRICS,
  type LiftReadout,
} from "./report.js";

const PASSING_LIFT: LiftReadout = {
  recallDeltaPp: 18, meetsRecall: true, a1InvalidRate: 0.1, a5InvalidRate: 0.05, invalidOk: true,
  pairwisePreferredFraction: 0.7, meetsPairwise: true, a1Voice: 0.8, a5Voice: 0.9, voiceOk: true, meetsThisWave: true,
};
const MISS_LIFT: LiftReadout = { ...PASSING_LIFT, recallDeltaPp: 8, meetsRecall: false, meetsThisWave: false };

describe("wave report guards + computations (REQ-EVAL-11/15/16/18)", () => {
  it("AC5: the headline metric set contains NO pairwise metric", () => {
    // the actual headline set the report ships passes the guard
    expect(() => assertHeadlineNoPairwise(HEADLINE_METRICS as unknown as string[])).not.toThrow();
    for (const k of HEADLINE_METRICS) expect(PAIRWISE_METRICS.has(k)).toBe(false);
    // a headline set that smuggled in a pairwise metric is rejected
    expect(() => assertHeadlineNoPairwise(["material_recall", "post_revision_improvement"])).toThrow(PairwiseInHeadlineError);
  });

  it("REQ-EVAL-18: the public-clean guard rejects any private-only field, anywhere in the structure", () => {
    expect(() => assertPublicClean({ waveId: "w", arms: [{ arm: "A5", headline: {} }] })).not.toThrow();
    expect(() => assertPublicClean({ waveId: "w", arms: [{ arm: "A5", perDraft: [{ draftId: "d1" }] }] })).toThrow(PrivateLeakError);
    expect(() => assertPublicClean({ nested: { deep: { runPrompt: "secret prompt" } } })).toThrow(/runPrompt/);
    expect(() => assertPublicClean({ examples: [{ draftText: "the corpus text" }] })).toThrow(PrivateLeakError);
  });

  it("stability band = mean/low/high/n over per-draft values", () => {
    expect(band([0.4, 0.6, 0.5])).toEqual({ mean: 0.5, low: 0.4, high: 0.6, n: 3 });
    expect(band([])).toEqual({ mean: 0, low: 0, high: 0, n: 0 });
  });

  it("REQ-EVAL-16: consequence classification follows the pre-committed go/no-go", () => {
    expect(classifyConsequence(PASSING_LIFT).outcome).toBe("pass");
    expect(classifyConsequence(MISS_LIFT).outcome).toBe("miss");
    expect(classifyConsequence(MISS_LIFT, { priorMiss: true }).outcome).toBe("two_consecutive_misses");
    // symmetric honesty: A1 beating Rhema is reported unspun even if the lift 'meets' by the other conditions
    expect(classifyConsequence(PASSING_LIFT, { a1BeatsRhema: true }).outcome).toBe("a1_beats_rhema");
    expect(classifyConsequence(MISS_LIFT, { priorMiss: true }).disposition).toMatch(/falsified/);
  });
});

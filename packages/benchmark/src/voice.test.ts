import { describe, expect, it } from "vitest";
import { voiceConformance, crossArmConvergence } from "./scorers/voice.js";
import { meaningDiff, type InventoryClaim } from "./scorers/meaning-diff.js";

// AC5: the voice scorer. A "laundered" (surface-polished, substance-unchanged) fixture does not move the meaning
// diff; every dropped Tier-1 claim traces to a disposed finding or is a violation (REQ-EVAL-12; C-e).

const PRE: InventoryClaim[] = [
  { claimId: "c1", tier: 1, polarity: "assert", strength: 0.9, text: "the state adjudicates who may be seen" },
  { claimId: "c2", tier: 1, polarity: "assert", strength: 0.8, text: "the 2019 guidance made this explicit" },
  { claimId: "c3", tier: 2, polarity: "assert", strength: 0.5, text: "a supporting aside" },
];

describe("meaning diff — the laundered control (AC5)", () => {
  it("a laundered draft (identical inventory, polished prose) does not move the diff", () => {
    // Same claims, same polarity/strength — only the prose changed. Zero meaning movement.
    const launderedPost = PRE.map((c) => ({ ...c }));
    const diff = meaningDiff(PRE, launderedPost);
    expect(diff.moved).toBe(false);
    expect(diff.tier1Changes).toBe(0);
    expect(diff.changes).toHaveLength(0);
    expect(diff.tier1Violations).toHaveLength(0);
  });

  it("a dropped Tier-1 claim that traces to a disposed finding is licensed, not a violation", () => {
    // c2 dropped; a disposition licensed touching c2 → traced, no violation.
    const post = [PRE[0]!, PRE[2]!];
    const diff = meaningDiff(PRE, post, ["c2"]);
    expect(diff.moved).toBe(true);
    expect(diff.tier1Changes).toBe(1);
    expect(diff.changes[0]).toMatchObject({ claimId: "c2", kind: "dropped", traced: true });
    expect(diff.tier1Violations).toHaveLength(0);
  });

  it("a dropped/negated/weakened Tier-1 claim with no disposition is a VIOLATION", () => {
    const post: InventoryClaim[] = [
      { ...PRE[0]!, polarity: "negate" }, // c1 negated, untraced → violation
      { ...PRE[1]!, strength: 0.3 }, // c2 weakened, untraced → violation
      // c3 (tier 2) dropped — not a Tier-1 violation
    ];
    const diff = meaningDiff(PRE, post, []);
    expect(diff.tier1Changes).toBe(2);
    expect(diff.tier1Violations.map((v) => v.claimId).sort()).toEqual(["c1", "c2"]);
    expect(diff.tier1Violations.map((v) => v.kind).sort()).toEqual(["negated", "weakened"]);
    // the tier-2 drop is recorded as a change but not a Tier-1 violation
    expect(diff.changes.some((c) => c.claimId === "c3" && c.kind === "dropped")).toBe(true);
  });
});

describe("voice band conformance (REQ-EVAL-12)", () => {
  const bands = { sentence_len: [12, 20] as const, subordination: [0.2, 0.4] as const };
  it("scores per-feature in-band / drift direction", () => {
    const r = voiceConformance({ sentence_len: 16, subordination: 0.5 }, bands);
    expect(r.total).toBe(2);
    expect(r.inBand).toBe(1);
    expect(r.conformance).toBeCloseTo(0.5, 12);
    const sub = r.perFeature.find((f) => f.feature === "subordination")!;
    expect(sub.direction).toBe("above");
    expect(sub.drift).toBeCloseTo(0.1, 12); // 0.5 − 0.4
  });
  it("ignores features with no author band", () => {
    const r = voiceConformance({ sentence_len: 16, unmeasured: 99 }, bands);
    expect(r.total).toBe(1); // only sentence_len is scored
  });
});

describe("cross-arm convergence (homogenization signal)", () => {
  it("collapses to a small mean range when arms converge", () => {
    const converged = crossArmConvergence([{ f: 10 }, { f: 10.2 }, { f: 9.9 }]);
    const diverse = crossArmConvergence([{ f: 5 }, { f: 15 }, { f: 25 }]);
    expect(converged.meanRange).toBeCloseTo(0.3, 10); // 10.2 − 9.9
    expect(diverse.meanRange).toBe(20); // 25 − 5
    expect(converged.meanRange).toBeLessThan(diverse.meanRange);
  });
  it("ignores features present in fewer than two arms", () => {
    const r = crossArmConvergence([{ a: 1, b: 2 }, { a: 3 }]);
    expect(r.features).toBe(1); // only 'a' appears in ≥2 arms
  });
});

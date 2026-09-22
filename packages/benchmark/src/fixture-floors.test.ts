import { describe, expect, it } from "vitest";
import { assertScoreFloors, promotionBlocked, type FixtureFloors, type FixtureScores } from "./fixture-floors.js";

const FLOORS: FixtureFloors = {
  materialRecallFloor: 0.8,
  findingCountsBySeverity: { major: { min: 2, max: 6 }, blocking: { min: 0, max: 1 } },
  wordBudgetDeltaMax: 200,
  citedFetched: true,
  attestationViolationsMax: 0,
  schemaValid: true,
  markdownRoundTrip: true,
  voiceFeatureBands: { avg_sentence_len: { min: 15, max: 25 } },
};

const GREEN: FixtureScores = {
  materialRecall: 0.85,
  findingCountsBySeverity: { major: 4, blocking: 1 },
  wordBudgetDelta: -120,
  citedFetched: true,
  attestationViolations: 0,
  schemaValid: true,
  markdownRoundTrip: true,
  voiceFeatures: { avg_sentence_len: 19 },
};

describe("assertScoreFloors (§13.5; REQ-ARCH-36/REQ-EVAL-17)", () => {
  it("passes a fixture whose scores meet every floor", () => {
    const r = assertScoreFloors("fx1", FLOORS, GREEN);
    expect(r.passed).toBe(true);
    expect(r.failures).toEqual([]);
    expect(r.checked).toBeGreaterThan(0);
  });

  it("blocks a recall regression (REQ-EVAL-17)", () => {
    const r = assertScoreFloors("fx1", FLOORS, { ...GREEN, materialRecall: 0.7 });
    expect(r.passed).toBe(false);
    expect(r.failures.map((f) => f.metric)).toContain("materialRecall");
  });

  it("gates finding counts by severity band (both under and over)", () => {
    const under = assertScoreFloors("fx1", FLOORS, { ...GREEN, findingCountsBySeverity: { major: 1, blocking: 1 } });
    expect(under.failures.some((f) => f.metric === "findingCount:major" && /below/.test(f.reason))).toBe(true);
    const over = assertScoreFloors("fx1", FLOORS, { ...GREEN, findingCountsBySeverity: { major: 9, blocking: 1 } });
    expect(over.failures.some((f) => f.metric === "findingCount:major" && /above/.test(f.reason))).toBe(true);
  });

  it("gates the word-budget delta by absolute tolerance", () => {
    const r = assertScoreFloors("fx1", FLOORS, { ...GREEN, wordBudgetDelta: 350 });
    expect(r.failures.map((f) => f.metric)).toContain("wordBudgetDelta");
  });

  it("fails cited⇒fetched / schema / round-trip / attestation when they do not hold", () => {
    const r = assertScoreFloors("fx1", FLOORS, {
      ...GREEN, citedFetched: false, schemaValid: false, markdownRoundTrip: false, attestationViolations: 1,
    });
    const metrics = r.failures.map((f) => f.metric);
    expect(metrics).toEqual(expect.arrayContaining(["citedFetched", "schemaValid", "markdownRoundTrip", "attestationViolations"]));
  });

  it("gates voice features to the author's band", () => {
    const r = assertScoreFloors("fx1", FLOORS, { ...GREEN, voiceFeatures: { avg_sentence_len: 40 } });
    expect(r.failures.map((f) => f.metric)).toContain("voice:avg_sentence_len");
  });

  it("treats a missing required score as a failure (an unrun check never passes)", () => {
    const r = assertScoreFloors("fx1", { materialRecallFloor: 0.8, citedFetched: true }, {});
    expect(r.passed).toBe(false);
    expect(r.failures).toHaveLength(2);
    expect(r.failures.every((f) => /not measured/.test(f.reason))).toBe(true);
  });

  it("a fixture with no floors gates nothing (checked = 0)", () => {
    const r = assertScoreFloors("fx1", {}, GREEN);
    expect(r.passed).toBe(true);
    expect(r.checked).toBe(0);
  });
});

describe("promotionBlocked (REQ-ARCH-36 promotion gate)", () => {
  it("blocks promotion if any fixture failed its floors", () => {
    const pass = assertScoreFloors("fx1", FLOORS, GREEN);
    const fail = assertScoreFloors("fx2", FLOORS, { ...GREEN, materialRecall: 0.5 });
    const gate = promotionBlocked([pass, fail]);
    expect(gate.blocked).toBe(true);
    expect(gate.failed.map((r) => r.fixtureId)).toEqual(["fx2"]);
  });

  it("allows promotion when every fixture is green", () => {
    const gate = promotionBlocked([assertScoreFloors("fx1", FLOORS, GREEN)]);
    expect(gate.blocked).toBe(false);
    expect(gate.failed).toEqual([]);
  });
});

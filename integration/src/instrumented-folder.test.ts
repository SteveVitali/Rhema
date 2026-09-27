import { describe, it, expect } from "vitest";
import { buildInstrumentedMeasurement } from "./instrumented-folder.js";
import type { InstrumentedRunRef } from "./live-exit-driver.js";

const ref = (workflow: InstrumentedRunRef["workflow"], rigor: InstrumentedRunRef["rigor"]): InstrumentedRunRef => ({
  runId: `run_${workflow}_${rigor}`,
  attempt: 1,
  workflow,
  rigor,
});

const facts = {
  tier: "base" as const,
  measuredCredits: 500,
  words: 3000,
  claims: 10,
  findings: 5,
  moves: 7,
  measuredAt: "2026-09-11T00:00:00Z",
};

describe("buildInstrumentedMeasurement (pure)", () => {
  it("maps a base-form workflow to words/claims/findings inputs and passes the measured cost through", () => {
    const m = buildInstrumentedMeasurement(ref("review", "standard"), facts);
    expect(m.variant).toBeUndefined();
    expect(m.rigor).toBe("standard");
    expect(m.inputs).toEqual({ words: 3000, claims: 10, findings: 5, movesWithResearch: 7 });
    expect(m.measuredCredits).toBe(500);
    expect(m.runId).toBe("run_review_standard");
    expect(m.tier).toBe("base");
  });

  it("maps the full rigor to the full_board estimator enum", () => {
    expect(buildInstrumentedMeasurement(ref("fact_check", "full"), facts).rigor).toBe("full_board");
    expect(buildInstrumentedMeasurement(ref("fact_check", "standard"), facts).rigor).toBe("standard");
  });

  it("selects the profile_voice variant by rigor (standard→quick, full→full) with voice inputs", () => {
    const quick = buildInstrumentedMeasurement(ref("profile_voice", "standard"), facts);
    expect(quick.variant).toBe("quick");
    expect(quick.inputs).toEqual({ wordsRead: 3000, piecesRead: 1, holdouts: 0 });

    const full = buildInstrumentedMeasurement(ref("profile_voice", "full"), facts);
    expect(full.variant).toBe("full");
    expect(full.inputs).toEqual({ wordsRead: 3000, piecesRead: 1, holdouts: 1 });
  });

  it("a revise measurement feeds movesWithResearch (the estimator term the run's obligation moves measure)", () => {
    const m = buildInstrumentedMeasurement(ref("revise", "standard"), facts);
    expect(m.inputs.movesWithResearch).toBe(7);
    expect(m.inputs.findings).toBe(5);
    expect(m.variant).toBeUndefined();
  });

  it("accepts a Date measuredAt", () => {
    const m = buildInstrumentedMeasurement(ref("revise", "standard"), { ...facts, measuredAt: new Date("2026-09-11T00:00:00Z") });
    expect(m.measuredAt).toBeInstanceOf(Date);
  });
});

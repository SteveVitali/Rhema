import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBenchmarkTestDb, testDeps, type BenchmarkTestDb } from "./testing/harness.js";
import { createWave } from "@rhema/benchmark";
import type { BenchmarkArm } from "./types.js";
import type { ArmMetrics, WaveReport } from "./report.js";
import { estimatePilotPower, recordPilotPower } from "./pilot.js";

/** A minimal WaveReport carrying only the arm.recallByDraft the pilot glue reads. */
function reportWith(arms: Record<BenchmarkArm, Record<string, number>>): WaveReport {
  const armMetrics = Object.entries(arms).map(
    ([arm, recallByDraft]) => ({ arm, recallByDraft }) as unknown as ArmMetrics,
  );
  return { public: {}, private: {}, lift: {} as WaveReport["lift"], arms: armMetrics };
}

describe("estimatePilotPower (REQ-EVAL-5)", () => {
  it("pairs A5 vs A1 per draft, estimates σ_d, and fixes n at the floor when variance is low", () => {
    // every draft moves A5 +0.20 over A1 → zero paired-difference variance → σ_d 0 → n = floor 24.
    const report = reportWith({
      A5: { d1: 0.8, d2: 0.7, d3: 0.9 },
      A1: { d1: 0.6, d2: 0.5, d3: 0.7 },
    } as Record<BenchmarkArm, Record<string, number>>);
    const est = estimatePilotPower(report);
    expect(est.rhemaArm).toBe("A5");
    expect(est.baselineArm).toBe("A1");
    expect(est.drafts).toEqual(["d1", "d2", "d3"]);
    expect(est.pairedN).toBe(3);
    expect(est.sigmaD).toBeCloseTo(0, 9);
    expect(est.meanDeltaPp).toBeCloseTo(20, 6);
    expect(est.requiredN).toBeLessThanOrEqual(1); // ~zero variance → tiny requiredN; the floor binds
    expect(est.fixedN).toBe(24);
    expect(est.sufficient).toBe(true);
  });

  it("a nonzero paired-difference variance yields σ_d > 0 and a required n", () => {
    const report = reportWith({
      A5: { d1: 0.9, d2: 0.6, d3: 0.8, d4: 0.5 },
      A1: { d1: 0.5, d2: 0.5, d3: 0.3, d4: 0.5 }, // diffs 0.4, 0.1, 0.5, 0.0
    } as Record<BenchmarkArm, Record<string, number>>);
    const est = estimatePilotPower(report);
    expect(est.pairedN).toBe(4);
    expect(est.sigmaD).toBeGreaterThan(0);
    // hand-check: diffs [0.4,0.1,0.5,0.0], mean 0.25 → 25pp
    expect(est.meanDeltaPp).toBeCloseTo(25, 6);
    expect(est.detectableEffectAtFixedNPp).toBeGreaterThan(0);
  });

  it("only counts drafts BOTH arms scored (aligned intersection), sorted deterministically", () => {
    const report = reportWith({
      A5: { d3: 0.9, d1: 0.8, d2: 0.7, dX: 0.5 }, // dX only in A5
      A1: { d1: 0.6, d2: 0.5, d3: 0.7, dY: 0.2 }, // dY only in A1
    } as Record<BenchmarkArm, Record<string, number>>);
    const est = estimatePilotPower(report);
    expect(est.drafts).toEqual(["d1", "d2", "d3"]);
    expect(est.pairedN).toBe(3);
  });

  it("< 2 shared drafts → not sufficient, n left at the floor (never a fabricated variance)", () => {
    const report = reportWith({
      A5: { d1: 0.8 },
      A1: { d1: 0.6 },
    } as Record<BenchmarkArm, Record<string, number>>);
    const est = estimatePilotPower(report);
    expect(est.sufficient).toBe(false);
    expect(est.pairedN).toBe(1);
    expect(est.fixedN).toBe(24);
  });

  it("can pair a different Rhema arm (A4 Standard) against A1", () => {
    const report = reportWith({
      A4: { d1: 0.7, d2: 0.6, d3: 0.75 },
      A1: { d1: 0.6, d2: 0.5, d3: 0.7 },
    } as Record<BenchmarkArm, Record<string, number>>);
    const est = estimatePilotPower(report, { rhemaArm: "A4" });
    expect(est.rhemaArm).toBe("A4");
    expect(est.sufficient).toBe(true);
  });

  it("throws when a requested arm is absent from the report", () => {
    const report = reportWith({ A5: { d1: 0.8, d2: 0.7 } } as Record<BenchmarkArm, Record<string, number>>);
    expect(() => estimatePilotPower(report)).toThrow(/baseline arm A1 not present/);
  });
});

describe("recordPilotPower (REQ-EVAL-5 'σ_d estimated and n fixed and recorded')", () => {
  let db: BenchmarkTestDb;
  beforeEach(async () => {
    db = await createBenchmarkTestDb();
  });
  afterEach(() => db.close());

  it("persists σ_d + fixed n onto the wave row", async () => {
    const deps = testDeps();
    const waveId = await createWave(db.exec, deps, { name: "pilot-rec", agreementFloor: 0.6, isDevSet: true, kind: "pilot" });
    const report = reportWith({
      A5: { d1: 0.9, d2: 0.6, d3: 0.8 },
      A1: { d1: 0.5, d2: 0.5, d3: 0.3 },
    } as Record<BenchmarkArm, Record<string, number>>);
    const est = estimatePilotPower(report);
    await recordPilotPower(db.exec, deps, waveId, est);

    const row = (
      await db.exec.query("select pilot_sigma_d, pilot_fixed_n, pilot_recorded_at from benchmark_waves where id=$1", [waveId])
    ).rows[0] as { pilot_sigma_d: string; pilot_fixed_n: number; pilot_recorded_at: Date };
    expect(Number(row.pilot_sigma_d)).toBeCloseTo(est.sigmaD, 6);
    expect(row.pilot_fixed_n).toBe(est.fixedN);
    expect(row.pilot_recorded_at).not.toBeNull();
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createBenchmarkTestDb, testDeps, fakeJudge, type BenchmarkTestDb } from "./testing/harness.js";
import {
  assertCrossFamily,
  SameFamilyJudgeError,
  calibrateJudge,
  recordJudgeCalibration,
  disqualifiedJudges,
  qualifiedJudgeScores,
  recordJudgeScore,
  HeadlineMetricJudgeError,
  assertAnchoredRubric,
  UnanchoredRubricError,
  type CalibrationPair,
  JUDGE_KAPPA_FLOOR,
} from "./judges.js";
import { createWave } from "@rhema/benchmark";

describe("LLM-judge hardening (REQ-EVAL-9; AC3; C-a..C-g)", () => {
  let db: BenchmarkTestDb;
  let waveId: string;
  const deps = testDeps();

  beforeEach(async () => {
    db = await createBenchmarkTestDb();
    waveId = await createWave(db.exec, deps, { name: "w", agreementFloor: 0.6 });
    await db.exec.query(
      `insert into benchmark_corpus_drafts (id, protocol, length_band, word_count, created_at, license_ref, content_sha256, enclave_key, canary_id)
       values ('d1','essay','2k',100, now(), 'lic','sha','key','can1')`,
    );
  });
  afterEach(async () => {
    await db.close();
  });

  it("C-d: a same-family judge/arm pairing is REJECTED", () => {
    const judge = fakeJudge("j1", "anthropic");
    // cross-family arms are fine
    expect(() => assertCrossFamily(judge, [{ arm: "A1", family: "openai" }, { arm: "A6", family: null }])).not.toThrow();
    // a same-family arm is rejected
    expect(() => assertCrossFamily(judge, [{ arm: "A5", family: "anthropic" }])).toThrow(SameFamilyJudgeError);
  });

  it("AC3: a judge below weighted κ 0.6 is disqualified; a well-calibrated judge is not", () => {
    // perfect agreement → κ = 1 (qualified)
    const agree: CalibrationPair[] = [
      { judgeLabel: "blocking", humanLabel: "blocking", stratum: "blocking" },
      { judgeLabel: "major", humanLabel: "major", stratum: "major" },
      { judgeLabel: "minor", humanLabel: "minor", stratum: "minor" },
      { judgeLabel: "note", humanLabel: "note", stratum: "note" },
    ];
    const good = calibrateJudge("good", agree);
    expect(good.disqualified).toBe(false);
    expect(good.weightedKappa).toBeGreaterThanOrEqual(JUDGE_KAPPA_FLOOR);

    // systematic max disagreement → κ ≤ 0 (disqualified)
    const disagree: CalibrationPair[] = [
      { judgeLabel: "note", humanLabel: "blocking", stratum: "blocking" },
      { judgeLabel: "blocking", humanLabel: "note", stratum: "note" },
      { judgeLabel: "note", humanLabel: "blocking", stratum: "blocking" },
      { judgeLabel: "blocking", humanLabel: "note", stratum: "note" },
    ];
    const bad = calibrateJudge("bad", disagree);
    expect(bad.disqualified).toBe(true);
  });

  it("C-c: calibration is validated PER severity stratum, not just on average", () => {
    const pairs: CalibrationPair[] = [
      { judgeLabel: "blocking", humanLabel: "blocking", stratum: "blocking" },
      { judgeLabel: "blocking", humanLabel: "blocking", stratum: "blocking" },
      { judgeLabel: "note", humanLabel: "note", stratum: "note" },
      { judgeLabel: "note", humanLabel: "note", stratum: "note" },
    ];
    const cal = calibrateJudge("j", pairs);
    expect(Object.keys(cal.perStratum).sort()).toEqual(["blocking", "note"]);
    expect(cal.perStratum.blocking!.pairs).toBe(2);
  });

  it("AC3: disqualified judges' metrics are WITHHELD; qualified judges' survive", async () => {
    await recordJudgeCalibration(db.exec, deps, {
      waveId, judge: { id: "good", model: "openai-judge", family: "openai" },
      calibration: calibrateJudge("good", [{ judgeLabel: "major", humanLabel: "major", stratum: "major" }, { judgeLabel: "note", humanLabel: "note", stratum: "note" }]),
    });
    await recordJudgeCalibration(db.exec, deps, {
      waveId, judge: { id: "bad", model: "openai-judge", family: "openai" },
      calibration: { judgeId: "bad", weightedKappa: 0.2, disqualified: true, perStratum: {} },
    });
    await recordJudgeScore(db.exec, deps, { waveId, draftId: "d1", arm: "A5", judgeId: "good", metric: "revision_plan_usefulness", score: 0.8, lengthUnits: 12 });
    await recordJudgeScore(db.exec, deps, { waveId, draftId: "d1", arm: "A5", judgeId: "bad", metric: "revision_plan_usefulness", score: 0.9, lengthUnits: 12 });

    expect([...(await disqualifiedJudges(db.exec, waveId))]).toEqual(["bad"]);
    const scores = await qualifiedJudgeScores(db.exec, waveId);
    expect(scores).toHaveLength(1);
    expect(scores[0]!.judgeId).toBe("good");
  });

  it("AC5: an LLM judge may not score a HEADLINE metric (headline is reference-based)", async () => {
    await expect(
      recordJudgeScore(db.exec, deps, { waveId, draftId: "d1", arm: "A5", judgeId: "j", metric: "material_recall", score: 0.9 }),
    ).rejects.toThrow(HeadlineMetricJudgeError);
    // a secondary metric is allowed
    await expect(
      recordJudgeScore(db.exec, deps, { waveId, draftId: "d1", arm: "A5", judgeId: "j", metric: "source_quality", score: 0.7 }),
    ).resolves.toBeTypeOf("string");
  });

  it("C-g: a rubric must carry a decomposition + exemplars (no untrusted holistic score)", () => {
    expect(() => assertAnchoredRubric({ metric: "m", dimensions: [], exemplars: [{ score: 1, text: "x" }] })).toThrow(UnanchoredRubricError);
    expect(() => assertAnchoredRubric({ metric: "m", dimensions: ["clarity"], exemplars: [] })).toThrow(/exemplars/);
    expect(() => assertAnchoredRubric({ metric: "m", dimensions: ["clarity"], exemplars: [{ score: 1, text: "good" }] })).not.toThrow();
  });
});

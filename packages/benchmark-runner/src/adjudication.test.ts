import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createBenchmarkTestDb, testDeps, fakeExtractor, type BenchmarkTestDb } from "./testing/harness.js";
import {
  confirmNovelty,
  confirmedNovelties,
  NoveltyAdjudicationError,
  recordPairwisePreference,
  pairwisePreference,
} from "./adjudication.js";
import { createMatchTask, recordMatchDecision } from "./matching.js";
import { normalizeArmOutput } from "./normalization.js";
import { createWave, recordArmRun } from "@rhema/benchmark";

describe("senior adjudication + pairwise preference (REQ-EVAL-8/11; C-a)", () => {
  let db: BenchmarkTestDb;
  let waveId: string;
  const deps = testDeps();

  beforeEach(async () => {
    db = await createBenchmarkTestDb();
    waveId = await createWave(db.exec, deps, { name: "w", agreementFloor: 0.6, isDevSet: true, kind: "pilot" });
    await db.exec.query(
      `insert into benchmark_corpus_drafts (id, protocol, length_band, word_count, created_at, license_ref, content_sha256, enclave_key, canary_id, is_dev_set)
       values ('d1','essay','2k',100, now(), 'lic','sha','key','can1', true)`,
    );
  });
  afterEach(async () => {
    await db.close();
  });

  it("confirmNovelty only applies to a valid_but_missed_by_gold decision; counts confirmed novelties", async () => {
    const armRunId = await recordArmRun(db.exec, deps, { waveId, draftId: "d1", arm: "A4", configHash: "h" });
    const [nf] = await normalizeArmOutput(db.exec, deps, {
      armRunId, rawText: "major: a genuinely new issue the gold set missed", draftId: "d1", extractor: fakeExtractor(),
    });
    await createMatchTask(db.exec, deps, { waveId, draftId: "d1", arm: "A4", armFindingId: nf!.id, armFinding: nf!.finding, goldFindings: [] });
    // cannot confirm novelty before the human rules it a novelty
    await expect(confirmNovelty(db.exec, deps, { armFindingId: nf!.id, adjudicator: "sr", confirmed: true })).rejects.toThrow(NoveltyAdjudicationError);
    await recordMatchDecision(db.exec, deps, { armFindingId: nf!.id, verdict: "valid_but_missed_by_gold", decidedBy: "ed" });
    await confirmNovelty(db.exec, deps, { armFindingId: nf!.id, adjudicator: "sr", confirmed: true });
    expect(await confirmedNovelties(db.exec, { waveId, draftId: "d1", arm: "A4" })).toBe(1);
  });

  it("pairwise preference resolves both orders; a cross-order DISAGREEMENT scores a tie (C-a)", async () => {
    // judge j1 prefers A5 in both orders → A5 wins; judge j2 disagrees across orders → tie
    await recordPairwisePreference(db.exec, deps, { waveId, draftId: "d1", armA: "A5", armB: "A1", presentation: "ab", preferred: "a", judgeKind: "human", judgeId: "j1" });
    await recordPairwisePreference(db.exec, deps, { waveId, draftId: "d1", armA: "A5", armB: "A1", presentation: "ba", preferred: "a", judgeKind: "human", judgeId: "j1" });
    await recordPairwisePreference(db.exec, deps, { waveId, draftId: "d1", armA: "A5", armB: "A1", presentation: "ab", preferred: "a", judgeKind: "human", judgeId: "j2" });
    await recordPairwisePreference(db.exec, deps, { waveId, draftId: "d1", armA: "A5", armB: "A1", presentation: "ba", preferred: "b", judgeKind: "human", judgeId: "j2" });

    const pref = await pairwisePreference(db.exec, { waveId, armA: "A5", armB: "A1", judgeKind: "human" });
    expect(pref.judgments).toBe(2);
    expect(pref.aWins).toBe(1);
    expect(pref.ties).toBe(1); // j2's disagreement resolved to a tie (C-a)
    expect(pref.preferredAFraction).toBe(0.5); // ties are in the denominator
    expect(pref.positionConsistency).toBe(0.5); // 1 of 2 judges was order-consistent
  });

  it("a (draft, judge) with only one order recorded is not a resolved judgment", async () => {
    await recordPairwisePreference(db.exec, deps, { waveId, draftId: "d1", armA: "A5", armB: "A1", presentation: "ab", preferred: "a", judgeKind: "human", judgeId: "solo" });
    const pref = await pairwisePreference(db.exec, { waveId, armA: "A5", armB: "A1", judgeKind: "human" });
    expect(pref.judgments).toBe(0);
    expect(pref.preferredAFraction).toBe(0);
  });
});

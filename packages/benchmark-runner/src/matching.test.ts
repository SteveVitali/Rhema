import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createBenchmarkTestDb, testDeps, buildFinding, type BenchmarkTestDb } from "./testing/harness.js";
import {
  createMatchTask,
  recordMatchDecision,
  loadMatchRecords,
  defaultMatcher,
  MatchDecisionError,
} from "./matching.js";
import { createWave, recordArmRun } from "@rhema/benchmark";
import type { GoldFinding } from "@rhema/benchmark";
import { normalizeArmOutput } from "./normalization.js";
import { fakeExtractor } from "./testing/harness.js";

const GOLD: GoldFinding[] = [
  { finding: buildFinding({ id: "g1", body: "the argument on page two lacks a citation", severity: "major" }), material: true },
  { finding: buildFinding({ id: "g2", body: "a comma splice in the intro", severity: "note" }), material: false },
];

describe("blind matching + adjudication tooling (REQ-EVAL-8)", () => {
  let db: BenchmarkTestDb;
  let waveId: string;
  let armRunId: string;
  const deps = testDeps();

  beforeEach(async () => {
    db = await createBenchmarkTestDb();
    waveId = await createWave(db.exec, deps, { name: "w", agreementFloor: 0.6, isDevSet: true, kind: "pilot" });
    await db.exec.query(
      `insert into benchmark_corpus_drafts (id, protocol, length_band, word_count, created_at, license_ref, content_sha256, enclave_key, canary_id, is_dev_set)
       values ('d1','essay','2k',100, now(), 'lic','sha','key','can1', true)`,
    );
    armRunId = await recordArmRun(db.exec, deps, { waveId, draftId: "d1", arm: "A4", configHash: "h" });
  });
  afterEach(async () => {
    await db.close();
  });

  it("createMatchTask is SUGGEST-ONLY: an undecided task, verdict null until a human decides", async () => {
    const [nf] = await normalizeArmOutput(db.exec, deps, {
      armRunId,
      rawText: "major: the argument on page two lacks a citation",
      draftId: "d1",
      extractor: fakeExtractor(),
    });
    await createMatchTask(db.exec, deps, {
      waveId, draftId: "d1", arm: "A4", armFindingId: nf!.id, armFinding: nf!.finding, goldFindings: GOLD, matcher: defaultMatcher(),
    });
    // a suggestion is stored, but the record is NOT yet a decision
    const decided = await loadMatchRecords(db.exec, { waveId, draftId: "d1", arm: "A4" });
    expect(decided).toHaveLength(0); // undecided ⇒ not consumed by the scorer
    const raw = (await db.exec.query(`select suggested_verdict, suggested_by, verdict, blind_to_arm from benchmark_match_records where arm_finding_id = $1`, [nf!.id])).rows[0] as {
      suggested_verdict: string | null; suggested_by: string | null; verdict: string | null; blind_to_arm: boolean;
    };
    expect(raw.suggested_verdict).toBe("matched"); // the automated matcher suggested
    expect(raw.suggested_by).toBe("jaccard-suggester");
    expect(raw.verdict).toBeNull(); // but no binding decision yet
    expect(raw.blind_to_arm).toBe(true);
  });

  it("records a human's binding decision; a 'matched' verdict MUST name the gold finding", async () => {
    const [nf] = await normalizeArmOutput(db.exec, deps, {
      armRunId,
      rawText: "major: the argument on page two lacks a citation",
      draftId: "d1",
      extractor: fakeExtractor(),
    });
    await createMatchTask(db.exec, deps, { waveId, draftId: "d1", arm: "A4", armFindingId: nf!.id, armFinding: nf!.finding, goldFindings: GOLD });
    await expect(recordMatchDecision(db.exec, deps, { armFindingId: nf!.id, verdict: "matched", decidedBy: "ed" })).rejects.toThrow(MatchDecisionError);
    await recordMatchDecision(db.exec, deps, { armFindingId: nf!.id, verdict: "matched", goldFindingId: "g1", decidedBy: "ed" });
    const decided = await loadMatchRecords(db.exec, { waveId, draftId: "d1", arm: "A4" });
    expect(decided).toEqual([{ armFindingId: nf!.id, goldFindingId: "g1", verdict: "matched" }]);
  });

  it("deciding a novelty vs invalid; recording a decision on a nonexistent task throws", async () => {
    const [nf] = await normalizeArmOutput(db.exec, deps, {
      armRunId, rawText: "minor: a stylistic quibble the gold set omits", draftId: "d1", extractor: fakeExtractor(),
    });
    await createMatchTask(db.exec, deps, { waveId, draftId: "d1", arm: "A4", armFindingId: nf!.id, armFinding: nf!.finding, goldFindings: GOLD });
    await recordMatchDecision(db.exec, deps, { armFindingId: nf!.id, verdict: "valid_but_missed_by_gold", decidedBy: "ed" });
    const decided = await loadMatchRecords(db.exec, { waveId, draftId: "d1", arm: "A4" });
    expect(decided[0]!.verdict).toBe("valid_but_missed_by_gold");
    expect(decided[0]!.goldFindingId).toBeUndefined();
    await expect(recordMatchDecision(db.exec, deps, { armFindingId: "nope", verdict: "invalid", decidedBy: "ed" })).rejects.toThrow(MatchDecisionError);
  });

  it("defaultMatcher suggests the highest-overlap gold match, abstains below threshold", () => {
    const m = defaultMatcher(0.3);
    const near = buildFinding({ id: "a", title: "citation", body: "the argument on page two lacks a citation" });
    const far = buildFinding({ id: "b", title: "unrelated", body: "the font choice is distracting to me overall" });
    expect(m.suggest({ armFinding: near, goldFindings: GOLD })).toEqual({ verdict: "matched", goldFindingId: "g1" });
    expect(m.suggest({ armFinding: far, goldFindings: GOLD })).toBeNull();
  });
});

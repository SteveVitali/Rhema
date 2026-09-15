import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createBenchmarkTestDb, testDeps, type BenchmarkTestDb } from "./testing/harness.js";
import { reportBlockingChecks, assertReportChecks, ReportCheckError } from "./checks.js";
import { recordPairwisePreference } from "./adjudication.js";
import { recordJudgeCalibration, recordJudgeScore, calibrateJudge } from "./judges.js";
import { freezeArmConfig } from "./arms.js";
import { createWave } from "@rhema/benchmark";

describe("C-a…C-g report-blocking checks (REQ-EVAL-9)", () => {
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

  it("a clean wave passes every binding check (C-a, C-d, C-g)", async () => {
    const checks = await reportBlockingChecks(db.exec, waveId);
    const binding = checks.filter((c) => c.binding);
    expect(binding.map((c) => c.code).sort()).toEqual(["C-a", "C-d", "C-g"]);
    expect(binding.every((c) => c.pass)).toBe(true);
    expect(() => assertReportChecks(checks)).not.toThrow();
  });

  it("C-a BLOCKS when an LLM pairwise judgment is missing its swapped order", async () => {
    // only one presentation order recorded → position swap violated
    await recordPairwisePreference(db.exec, deps, { waveId, draftId: "d1", armA: "A5", armB: "A1", presentation: "ab", preferred: "a", judgeKind: "llm", judgeId: "j" });
    const checks = await reportBlockingChecks(db.exec, waveId);
    const ca = checks.find((c) => c.code === "C-a")!;
    expect(ca.pass).toBe(false);
    expect(() => assertReportChecks(checks)).toThrow(ReportCheckError);
    // a human pairwise (guard rail) is not a C-a LLM concern
  });

  it("C-e runs styleControl: a laundered twin scoring materially higher BLOCKS (measuring fluency)", async () => {
    // no observations → C-e non-binding
    const none = await reportBlockingChecks(db.exec, waveId);
    expect(none.find((c) => c.code === "C-e")!.binding).toBe(false);
    // a substance-unchanged laundered twin scoring far higher → binding failure
    const bad = await reportBlockingChecks(db.exec, waveId, {
      styleControls: [{ label: "d1-judge", original: 0.5, laundered: 0.8 }],
    });
    const ce = bad.find((c) => c.code === "C-e")!;
    expect(ce.binding).toBe(true);
    expect(ce.pass).toBe(false);
    expect(() => assertReportChecks(bad)).toThrow(ReportCheckError);
    // a stable laundered twin passes
    const good = await reportBlockingChecks(db.exec, waveId, {
      styleControls: [{ label: "d1-judge", original: 0.5, laundered: 0.51 }],
    });
    expect(good.find((c) => c.code === "C-e")!.pass).toBe(true);
  });

  it("C-d BLOCKS when an LLM judge scored an arm of its own model family", async () => {
    await freezeArmConfig(db.exec, deps, { waveId, config: { arm: "A5", model: "claude", modelFamily: "anthropic", engineBuild: "e", protocolVersion: "essay@1" } });
    await recordJudgeCalibration(db.exec, deps, {
      waveId, judge: { id: "jbad", model: "claude-judge", family: "anthropic" },
      calibration: calibrateJudge("jbad", [{ judgeLabel: "major", humanLabel: "major", stratum: "major" }, { judgeLabel: "note", humanLabel: "note", stratum: "note" }]),
    });
    await recordJudgeScore(db.exec, deps, { waveId, draftId: "d1", arm: "A5", judgeId: "jbad", metric: "source_quality", score: 0.9 });
    const checks = await reportBlockingChecks(db.exec, waveId);
    const cd = checks.find((c) => c.code === "C-d")!;
    expect(cd.pass).toBe(false);
    expect(cd.detail).toMatch(/jbad\/A5/);
    expect(() => assertReportChecks(checks)).toThrow(ReportCheckError);
  });
});

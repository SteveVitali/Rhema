import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createBenchmarkTestDb,
  testDeps,
  buildFinding,
  makeRawOutput,
  fakeExecutor,
  fakeExtractor,
  seedUsageRecord,
  type BenchmarkTestDb,
} from "./testing/harness.js";
import { runWave } from "./wave-runner.js";
import { loadNormalizedFindings } from "./normalization.js";
import { recordMatchDecision } from "./matching.js";
import { recordPairwisePreference } from "./adjudication.js";
import { generateWaveReport, recordConsequence, classifyConsequence } from "./report.js";
import { recordJudgeCalibration, recordJudgeScore, calibrateJudge } from "./judges.js";
import { defaultMatcher } from "./matching.js";
import type { ArmConfig } from "./types.js";
import { createWave, adjudicateGold, recordProviderVerification, ProviderNotVerifiedError } from "@rhema/benchmark";

// AC1 end-to-end dry run on the dev set: all six arms executable (A6 via intake), outputs normalized, matching
// workflow exercised, all twelve metrics computed, report renders with the public/private split (nothing private in
// the public artifact). Plus AC6: the Rhema arm runs record engine build + protocol@version + config hash, joinable
// to run-ledger metering rows. Runs on a PILOT dev-set wave (pre-registration exempt — the scored pilot is P0.15).

const DRAFT = "d_dev1";

async function seedDevWave(db: BenchmarkTestDb): Promise<string> {
  const deps = testDeps();
  const waveId = await createWave(db.exec, deps, { name: "pilot-dryrun", agreementFloor: 0.6, isDevSet: true, kind: "pilot" });
  await db.exec.query(
    `insert into benchmark_corpus_drafts (id, protocol, length_band, word_count, created_at, license_ref, content_sha256, enclave_key, canary_id, is_dev_set, source_project_id)
     values ($1,'essay','2k',2000, now(), 'lic','sha','key','can1', true, 'surveillance-essay')`,
    [DRAFT],
  );
  await db.exec.query(
    `insert into benchmark_contamination_records (draft_id, created_after_cutoff, newest_model_cutoff, author_attestation_ref, near_duplicate_clean, near_duplicate_search_ref, canary_id)
     values ($1, true, now(), 'att', true, 'search', 'can1')`,
    [DRAFT],
  );
  await db.exec.query(`insert into benchmark_wave_drafts (wave_id, draft_id) values ($1,$2)`, [waveId, DRAFT]);
  // two material major gold findings — the recall denominator
  await adjudicateGold(db.exec, deps, { draftId: DRAFT, adjudicatorId: "sr", adjudicatedFrom: [], material: true, id: "g1", finding: buildFinding({ id: "g1", draftId: DRAFT, severity: "major", body: "the thesis is under-argued in section two" }) });
  await adjudicateGold(db.exec, deps, { draftId: DRAFT, adjudicatorId: "sr", adjudicatedFrom: [], material: true, id: "g2", finding: buildFinding({ id: "g2", draftId: DRAFT, severity: "major", body: "a key citation is missing on page five" }) });
  // REQ-EVAL-3: the provider no-training/retention terms verified in writing before any arm transmits (D-P0.13-2)
  await recordProviderVerification(db.exec, deps, { provider: "anthropic", termsRef: "terms-anthropic", verifiedAt: new Date("2026-01-01T00:00:00Z") });
  await recordProviderVerification(db.exec, deps, { provider: "openai", termsRef: "terms-openai", verifiedAt: new Date("2026-01-01T00:00:00Z") });
  return waveId;
}

const ARMS: ArmConfig[] = [
  { arm: "A1", model: "frontier-x", modelFamily: "openai", prompt: "steelman v1", published: true, steelmanOwner: "alice" },
  { arm: "A2", model: "generic", modelFamily: "openai", prompt: "5-turn recipe", published: true },
  { arm: "A3", modelFamily: undefined }, // Grammarly-class: craft only, offline
  { arm: "A4", model: "claude", modelFamily: "anthropic", engineBuild: "engine@sha4", protocolVersion: "essay@1.0" },
  { arm: "A5", model: "claude", modelFamily: "anthropic", engineBuild: "engine@sha4", protocolVersion: "essay@1.0" },
  { arm: "A6", modelFamily: undefined }, // human editors: results entered, not executed
];

describe("wave runner — end-to-end dev-set dry run (AC1, AC6)", () => {
  let db: BenchmarkTestDb;
  let waveId: string;
  const deps = testDeps(1000);

  beforeEach(async () => {
    db = await createBenchmarkTestDb();
    waveId = await seedDevWave(db);
  });
  afterEach(async () => {
    await db.close();
  });

  it("runs all six arms (A6 via intake), normalizes, and seeds blind match tasks", async () => {
    const twoFindings = [{ body: "issue alpha on this draft", severity: "major" as const }, { body: "issue beta on this draft", severity: "major" as const }];
    const executor = fakeExecutor({
      [`A1:${DRAFT}`]: makeRawOutput("A1", DRAFT, twoFindings),
      [`A2:${DRAFT}`]: makeRawOutput("A2", DRAFT, twoFindings),
      [`A3:${DRAFT}`]: makeRawOutput("A3", DRAFT, [{ body: "a craft-level comma issue", severity: "note" }]),
      [`A4:${DRAFT}`]: makeRawOutput("A4", DRAFT, twoFindings, { runId: "run_a4", model: "claude", latencyMs: 4200 }),
      [`A5:${DRAFT}`]: makeRawOutput("A5", DRAFT, twoFindings, { runId: "run_a5", model: "claude", latencyMs: 9100 }),
      [`A6:${DRAFT}`]: makeRawOutput("A6", DRAFT, twoFindings), // human-editor results ENTERED (intake), not executed
    });

    const result = await runWave(db.exec, deps, { waveId, arms: ARMS, executor, extractor: fakeExtractor(), matcher: defaultMatcher() });
    expect(result.armsRun).toEqual(["A1", "A2", "A3", "A4", "A5", "A6"]); // all six executable, A6 via intake
    expect(result.drafts).toEqual([DRAFT]);

    // A5 (a Rhema arm) recorded its run-ledger join, config hash, engine build + protocol — AC6
    const a5 = (await db.exec.query(
      `select ar.run_id, ar.config_hash, ac.engine_build, ac.protocol_version, ac.model_family
         from benchmark_arm_runs ar join benchmark_arm_configs ac on ac.wave_id = ar.wave_id and ac.arm = ar.arm
        where ar.wave_id = $1 and ar.arm = 'A5'`,
      [waveId],
    )).rows[0] as { run_id: string; config_hash: string; engine_build: string; protocol_version: string; model_family: string };
    expect(a5.run_id).toBe("run_a5");
    expect(a5.config_hash).toHaveLength(64);
    expect(a5.engine_build).toBe("engine@sha4");
    expect(a5.protocol_version).toBe("essay@1.0");
    expect(a5.model_family).toBe("anthropic");
  });

  it("REQ-EVAL-3: an arm whose provider is NOT verified in writing is refused before transmitting (D-P0.13-2)", async () => {
    // a fresh wave with NO provider verifications recorded
    const db2 = await createBenchmarkTestDb();
    const w2 = await createWave(db2.exec, deps, { name: "unverified", agreementFloor: 0.6, isDevSet: true, kind: "pilot" });
    const executor = fakeExecutor({});
    await expect(
      runWave(db2.exec, deps, { waveId: w2, arms: [ARMS[3]!], executor, extractor: fakeExtractor() }),
    ).rejects.toThrow(ProviderNotVerifiedError);
    await db2.close();
  });

  it("AC6: a Rhema arm run joins usage_records metering by run_id", async () => {
    const executor = fakeExecutor({
      [`A5:${DRAFT}`]: makeRawOutput("A5", DRAFT, [{ body: "a metered rhema finding", severity: "major" }], { runId: "run_a5", model: "claude", latencyMs: 9100 }),
    });
    await runWave(db.exec, deps, { waveId, arms: [ARMS[4]!], executor, extractor: fakeExtractor() });
    // seed the proxy meter of record for that run, then confirm the join
    await seedUsageRecord(db.exec, deps, { runId: "run_a5", listCostUsd: 1.25, credits: 500, source: "proxy" });
    const joined = (await db.exec.query(
      `select ar.arm, ar.latency_ms, u.list_cost_usd from benchmark_arm_runs ar
         join usage_records u on u.run_id = ar.run_id
        where ar.wave_id = $1 and ar.arm = 'A5' and u.source = 'proxy'`,
      [waveId],
    )).rows[0] as { arm: string; latency_ms: string; list_cost_usd: number };
    expect(joined.arm).toBe("A5");
    expect(Number(joined.list_cost_usd)).toBe(1.25);
    expect(Number(joined.latency_ms)).toBe(9100);
  });

  it("AC1: twelve metrics computed + report renders with the public/private split; LIFT passes when A5 leads A1", async () => {
    const twoFindings = [{ body: "issue alpha on this draft", severity: "major" as const }, { body: "issue beta on this draft", severity: "major" as const }];
    const executor = fakeExecutor({
      [`A1:${DRAFT}`]: makeRawOutput("A1", DRAFT, twoFindings),
      [`A4:${DRAFT}`]: makeRawOutput("A4", DRAFT, twoFindings, { runId: "run_a4", latencyMs: 4200 }),
      [`A5:${DRAFT}`]: makeRawOutput("A5", DRAFT, twoFindings, { runId: "run_a5", latencyMs: 9100 }),
      [`A6:${DRAFT}`]: makeRawOutput("A6", DRAFT, twoFindings),
    });
    await runWave(db.exec, deps, { waveId, arms: ARMS.filter((a) => ["A1", "A4", "A5", "A6"].includes(a.arm)), executor, extractor: fakeExtractor() });
    await seedUsageRecord(db.exec, deps, { runId: "run_a5", listCostUsd: 2.0, credits: 800, source: "proxy" });
    await seedUsageRecord(db.exec, deps, { runId: "run_a4", listCostUsd: 0.5, credits: 200, source: "proxy" });

    // exercise the blind matching workflow: A5 matches BOTH gold (recall 1.0); A1 matches ONE + one invalid (recall 0.5, FP)
    const armRunId = async (arm: string) => ((await db.exec.query(`select id from benchmark_arm_runs where wave_id=$1 and arm=$2`, [waveId, arm])).rows[0] as { id: string }).id;

    const a5f = await loadNormalizedFindings(db.exec, await armRunId("A5"));
    await recordMatchDecision(db.exec, deps, { armFindingId: a5f[0]!.id, verdict: "matched", goldFindingId: "g1", decidedBy: "ed" });
    await recordMatchDecision(db.exec, deps, { armFindingId: a5f[1]!.id, verdict: "matched", goldFindingId: "g2", decidedBy: "ed" });

    const a1f = await loadNormalizedFindings(db.exec, await armRunId("A1"));
    await recordMatchDecision(db.exec, deps, { armFindingId: a1f[0]!.id, verdict: "matched", goldFindingId: "g1", decidedBy: "ed" });
    await recordMatchDecision(db.exec, deps, { armFindingId: a1f[1]!.id, verdict: "invalid", decidedBy: "ed" });

    // human pairwise preference: A5 preferred over A1 in BOTH orders (≥60% guard rail)
    await recordPairwisePreference(db.exec, deps, { waveId, draftId: DRAFT, armA: "A5", armB: "A1", presentation: "ab", preferred: "a", judgeKind: "human", judgeId: "h1" });
    await recordPairwisePreference(db.exec, deps, { waveId, draftId: DRAFT, armA: "A5", armB: "A1", presentation: "ba", preferred: "a", judgeKind: "human", judgeId: "h1" });

    // a QUALIFIED cross-family LLM judge (openai judging anthropic A5) scores a SECONDARY metric → surfaced in report
    await recordJudgeCalibration(db.exec, deps, {
      waveId, judge: { id: "jgood", model: "gpt-judge", family: "openai" },
      calibration: calibrateJudge("jgood", [{ judgeLabel: "major", humanLabel: "major", stratum: "major" }, { judgeLabel: "note", humanLabel: "note", stratum: "note" }]),
    });
    await recordJudgeScore(db.exec, deps, { waveId, draftId: DRAFT, arm: "A5", judgeId: "jgood", metric: "source_quality", score: 0.88, lengthUnits: 14 });

    const report = await generateWaveReport(db.exec, deps, {
      waveId,
      // voice/meaning + secondary metric inputs (measurement/human-rubric halves not derivable from SQL)
      extras: {
        [`A5:${DRAFT}`]: { voiceConformance: 0.95, meaningPreservation: 0.98, reviewerFactualAccuracy: 0.97, sourceQuality: 0.9, revisionPlanUsefulness: 0.85, postRevisionImprovement: 0.9 },
        [`A1:${DRAFT}`]: { voiceConformance: 0.7, meaningPreservation: 0.75, reviewerFactualAccuracy: 0.9, sourceQuality: 0.8, revisionPlanUsefulness: 0.6, postRevisionImprovement: 0.5 },
        [`A4:${DRAFT}`]: { voiceConformance: 0.9, meaningPreservation: 0.9 },
        [`A6:${DRAFT}`]: { voiceConformance: 0.99, meaningPreservation: 0.99 },
      },
      consentedExamples: ["example-1"],
    });

    // a dev-set/pilot dry run is stamped preliminary + devSet, never a publishable result (REQ-EVAL-1/19; MAJOR-1)
    expect(report.public.preliminary).toBe(true);
    expect(report.public.devSet).toBe(true);
    expect((report.public.lift as { preliminary?: boolean }).preliminary).toBe(true);

    // the qualified LLM judge's SECONDARY metric is surfaced (disqualified judges would be withheld — AC3)
    const jm = report.public.judgeSecondaryMetrics as Array<{ arm: string; metric: string; mean: number }>;
    expect(jm).toContainEqual({ arm: "A5", metric: "source_quality", mean: 0.88, n: 1 });

    // all twelve metrics computed (8 headline + 4 secondary)
    expect((report.public.metricsComputed as string[])).toHaveLength(12);
    const a5m = (report.public.arms as Array<{ arm: string; headline: Record<string, unknown>; secondary: Record<string, unknown> }>).find((a) => a.arm === "A5")!;
    expect(Object.keys(a5m.headline).sort()).toEqual([
      "anchoring_specificity", "cost_latency", "false_positive_rate", "material_recall", "novelty",
      "second_read_contribution", "severity_calibration", "voice_meaning_preservation",
    ]);
    expect(Object.keys(a5m.secondary)).toHaveLength(4);

    // the public/private split: NO per-draft rows in the public report; per-draft IS in the private report
    expect(JSON.stringify(report.public)).not.toMatch(/perDraft/);
    expect(report.private.perDraft).toBeTruthy();
    // published baseline prompt is public (REQ-EVAL-18); a Rhema arm prompt never is
    expect((report.public.publishedBaselines as Array<{ arm: string }>).map((b) => b.arm).sort()).toEqual(["A1"]);

    // LIFT: A5 recall 1.0 vs A1 0.5 → 50pp ≥ 15; invalid 0 ≤ 0.5; pairwise 1.0 ≥ 0.6; voice 0.965 ≥ 0.725
    expect(report.lift.recallDeltaPp).toBeCloseTo(50, 5);
    expect(report.lift.meetsRecall).toBe(true);
    expect(report.lift.invalidOk).toBe(true);
    expect(report.lift.meetsPairwise).toBe(true);
    expect(report.lift.voiceOk).toBe(true);
    expect(report.lift.meetsThisWave).toBe(true);

    // economics joined the proxy meter (REQ-EVAL-14): A5 cost is the metered $2.00
    expect((a5m.headline.cost_latency as { listCostUsd: number }).listCostUsd).toBe(2.0);

    // consequence log (REQ-EVAL-16)
    const c = classifyConsequence(report.lift);
    expect(c.outcome).toBe("pass");
    await recordConsequence(db.exec, deps, { waveId, ...c });
    const logged = (await db.exec.query(`select outcome from benchmark_consequence_log where wave_id=$1`, [waveId])).rows[0] as { outcome: string };
    expect(logged.outcome).toBe("pass");

    // the report is persisted
    const persisted = (await db.exec.query(`select public_report from benchmark_wave_reports where wave_id=$1`, [waveId])).rows[0];
    expect(persisted).toBeTruthy();
  });
});

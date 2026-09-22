import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createBenchmarkTestDb,
  testDeps,
  buildFinding,
  makeRawOutput,
  fakeExecutor,
  fakeExtractor,
  type BenchmarkTestDb,
} from "./testing/harness.js";
import { runWave } from "./wave-runner.js";
import { loadNormalizedFindings } from "./normalization.js";
import { recordMatchDecision, defaultMatcher } from "./matching.js";
import { generateWaveReport } from "./report.js";
import { estimatePilotPower, recordPilotPower } from "./pilot.js";
import { createWave, adjudicateGold, recordProviderVerification } from "@rhema/benchmark";
import type { ArmConfig } from "./types.js";

// The §18 PILOT WAVE run end-to-end on the dev set (§17 exit criterion; REQ-EVAL-5/17): all six arms executable,
// normalization + matching exercised with trained (human) matchers, the deterministic scorers green, then σ_d
// estimated from the REPORT's per-draft paired recalls and benchmark n fixed + recorded. This is the AC6
// demonstration end-to-end (the `pilot.test.ts` unit tests cover the glue in isolation) — it proves the connector
// works against a real `generateWaveReport` output, not a synthetic one.

// two dev-set drafts, each with two material major gold findings (the recall denominator).
const DRAFTS = ["d_dev1", "d_dev2"];
const ARMS: ArmConfig[] = [
  { arm: "A1", model: "frontier-x", modelFamily: "openai", prompt: "steelman v1", published: true, steelmanOwner: "alice" },
  { arm: "A2", model: "generic", modelFamily: "openai", prompt: "5-turn recipe", published: true },
  { arm: "A3", modelFamily: undefined }, // Grammarly-class: craft only, offline
  { arm: "A4", model: "claude", modelFamily: "anthropic", engineBuild: "engine@sha4", protocolVersion: "essay@1.0" },
  { arm: "A5", model: "claude", modelFamily: "anthropic", engineBuild: "engine@sha4", protocolVersion: "essay@1.0" },
  { arm: "A6", modelFamily: undefined }, // human editors: results entered, not executed
];

async function seedDevWave(db: BenchmarkTestDb): Promise<string> {
  const deps = testDeps();
  const waveId = await createWave(db.exec, deps, { name: "pilot-e2e", agreementFloor: 0.6, isDevSet: true, kind: "pilot" });
  const sourceKeys: Record<string, string> = { d_dev1: "surveillance-essay", d_dev2: "methods-academic" };
  for (const d of DRAFTS) {
    await db.exec.query(
      `insert into benchmark_corpus_drafts (id, protocol, length_band, word_count, created_at, license_ref, content_sha256, enclave_key, canary_id, is_dev_set, source_project_id)
       values ($1,'essay','2k',2000, now(), 'lic','sha_'||$1,'key_'||$1,'can_'||$1, true, $2)`,
      [d, sourceKeys[d]],
    );
    await db.exec.query(
      `insert into benchmark_contamination_records (draft_id, created_after_cutoff, newest_model_cutoff, author_attestation_ref, near_duplicate_clean, near_duplicate_search_ref, canary_id)
       values ($1, true, now(), 'att', true, 'search', 'can_'||$1)`,
      [d],
    );
    await db.exec.query(`insert into benchmark_wave_drafts (wave_id, draft_id) values ($1,$2)`, [waveId, d]);
    for (const g of ["g1", "g2"]) {
      const gid = `${g}_${d}`;
      await adjudicateGold(db.exec, deps, {
        draftId: d, adjudicatorId: "sr", adjudicatedFrom: [], material: true, id: gid,
        finding: buildFinding({ id: gid, draftId: d, severity: "major", body: `${g} material issue on ${d}` }),
      });
    }
  }
  await recordProviderVerification(db.exec, deps, { provider: "anthropic", termsRef: "terms-anthropic", verifiedAt: new Date("2026-01-01T00:00:00Z") });
  await recordProviderVerification(db.exec, deps, { provider: "openai", termsRef: "terms-openai", verifiedAt: new Date("2026-01-01T00:00:00Z") });
  return waveId;
}

describe("§18 pilot wave — end-to-end on the dev set (AC6; REQ-EVAL-5/17)", () => {
  let db: BenchmarkTestDb;
  let waveId: string;
  const deps = testDeps(2000);

  beforeEach(async () => {
    db = await createBenchmarkTestDb();
    waveId = await seedDevWave(db);
  });
  afterEach(() => db.close());

  it("runs all six arms, trains matchers, greens scorers, estimates σ_d and fixes + records n", async () => {
    const two = [{ body: "issue alpha", severity: "major" as const }, { body: "issue beta", severity: "major" as const }];
    const outputs: Record<string, ReturnType<typeof makeRawOutput>> = {};
    for (const d of DRAFTS) {
      outputs[`A1:${d}`] = makeRawOutput("A1", d, two);
      outputs[`A2:${d}`] = makeRawOutput("A2", d, two);
      outputs[`A3:${d}`] = makeRawOutput("A3", d, [{ body: "a craft comma issue", severity: "note" }]);
      outputs[`A4:${d}`] = makeRawOutput("A4", d, two, { runId: `run_a4_${d}`, model: "claude", latencyMs: 4200 });
      outputs[`A5:${d}`] = makeRawOutput("A5", d, two, { runId: `run_a5_${d}`, model: "claude", latencyMs: 9100 });
      outputs[`A6:${d}`] = makeRawOutput("A6", d, two);
    }
    const result = await runWave(db.exec, deps, { waveId, arms: ARMS, executor: fakeExecutor(outputs), extractor: fakeExtractor(), matcher: defaultMatcher() });
    // all six arms executable; both dev-set drafts run
    expect(result.armsRun).toEqual(["A1", "A2", "A3", "A4", "A5", "A6"]);
    expect(result.drafts.sort()).toEqual([...DRAFTS].sort());

    // trained (human) matchers record BINDING decisions. Recall pattern chosen to yield a nonzero σ_d:
    //   d_dev1: A5 matches both gold (1.0), A1 matches one (0.5) → diff 0.5
    //   d_dev2: A5 matches both (1.0), A1 matches both (1.0)      → diff 0.0
    const armRunId = async (arm: string, draft: string) =>
      ((await db.exec.query(`select id from benchmark_arm_runs where wave_id=$1 and arm=$2 and draft_id=$3`, [waveId, arm, draft])).rows[0] as { id: string }).id;

    for (const d of DRAFTS) {
      const a5f = await loadNormalizedFindings(db.exec, await armRunId("A5", d));
      await recordMatchDecision(db.exec, deps, { armFindingId: a5f[0]!.id, verdict: "matched", goldFindingId: `g1_${d}`, decidedBy: "ed" });
      await recordMatchDecision(db.exec, deps, { armFindingId: a5f[1]!.id, verdict: "matched", goldFindingId: `g2_${d}`, decidedBy: "ed" });

      const a1f = await loadNormalizedFindings(db.exec, await armRunId("A1", d));
      await recordMatchDecision(db.exec, deps, { armFindingId: a1f[0]!.id, verdict: "matched", goldFindingId: `g1_${d}`, decidedBy: "ed" });
      // d_dev1: A1's second finding is invalid (recall 0.5); d_dev2: A1 matches the second too (recall 1.0)
      if (d === "d_dev1") await recordMatchDecision(db.exec, deps, { armFindingId: a1f[1]!.id, verdict: "invalid", decidedBy: "ed" });
      else await recordMatchDecision(db.exec, deps, { armFindingId: a1f[1]!.id, verdict: "matched", goldFindingId: `g2_${d}`, decidedBy: "ed" });
    }

    const report = await generateWaveReport(db.exec, deps, { waveId });
    // deterministic scorers green: every arm produced the full headline metric set (report rendered = C-a…C-g passed)
    const a5 = report.arms.find((a) => a.arm === "A5")!;
    expect(a5.recallByDraft).toEqual({ d_dev1: 1, d_dev2: 1 });
    const a1 = report.arms.find((a) => a.arm === "A1")!;
    expect(a1.recallByDraft).toEqual({ d_dev1: 0.5, d_dev2: 1 });

    // estimate σ_d from the REAL report and fix n (REQ-EVAL-5)
    const est = estimatePilotPower(report);
    expect(est.sufficient).toBe(true);
    expect(est.pairedN).toBe(2);
    expect(est.drafts).toEqual(["d_dev1", "d_dev2"]);
    // diffs [0.5, 0.0] → mean 0.25 (25pp), sample sd = sqrt(0.125) ≈ 0.3536
    expect(est.meanDeltaPp).toBeCloseTo(25, 6);
    expect(est.sigmaD).toBeCloseTo(Math.sqrt(0.125), 6);
    expect(est.fixedN).toBeGreaterThan(est.requiredN === 0 ? 24 : 0);
    expect(est.fixedN).toBeGreaterThanOrEqual(24);

    // record σ_d + n on the wave
    await recordPilotPower(db.exec, deps, waveId, est);
    const row = (await db.exec.query("select pilot_sigma_d, pilot_fixed_n from benchmark_waves where id=$1", [waveId])).rows[0] as { pilot_sigma_d: string; pilot_fixed_n: number };
    expect(Number(row.pilot_sigma_d)).toBeCloseTo(est.sigmaD, 6);
    expect(row.pilot_fixed_n).toBe(est.fixedN);

    // AC6 back-stop: the pilot report is stamped preliminary/dev-set — never a publishable headline (REQ-EVAL-1/19)
    expect(report.public.preliminary).toBe(true);
    expect(report.public.devSet).toBe(true);
  });
});

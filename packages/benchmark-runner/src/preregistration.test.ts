import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createBenchmarkTestDb, testDeps, type BenchmarkTestDb } from "./testing/harness.js";
import {
  buildPreregistrationBundle,
  freezePreregistration,
  loadPreregistration,
  assertPreregistered,
  NotPreregisteredError,
  detectDrift,
  loadDeviations,
  type PreregisteredRules,
} from "./preregistration.js";
import { freezeArmConfig } from "./arms.js";
import { generateWaveReport } from "./report.js";
import { createWave } from "@rhema/benchmark";

const RULES: PreregisteredRules = {
  metricDefinitions: { material_recall: "matched material major/blocking gold ÷ all" },
  matchingRules: "blind human matching, senior adjudication",
  exclusionRules: "memorization-probe failure excludes draft×arm",
  analysis: "paired per-draft, ≥80% power for 10pp, floor n=24",
  criterion: { recallPp: 15, pairwise: 0.6, waves: 2 },
};

async function seedDraftAndAdmit(db: BenchmarkTestDb, waveId: string, draftId: string) {
  await db.exec.query(
    `insert into benchmark_corpus_drafts (id, protocol, length_band, word_count, created_at, license_ref, content_sha256, enclave_key, canary_id)
     values ($1,'essay','2k',100, now(), 'lic',$1,$1,$1)`,
    [draftId],
  );
  await db.exec.query(
    `insert into benchmark_contamination_records (draft_id, created_after_cutoff, newest_model_cutoff, author_attestation_ref, near_duplicate_clean, near_duplicate_search_ref, canary_id)
     values ($1, true, now(), 'att', true, 'search', $1)`,
    [draftId],
  );
  await db.exec.query(`insert into benchmark_wave_drafts (wave_id, draft_id) values ($1,$2)`, [waveId, draftId]);
}

describe("pre-registration (REQ-EVAL-10; AC4)", () => {
  let db: BenchmarkTestDb;
  const deps = testDeps();
  beforeEach(async () => {
    db = await createBenchmarkTestDb();
  });
  afterEach(async () => {
    await db.close();
  });

  it("freezes + hash-commits, mirroring the hash onto the wave row", async () => {
    const waveId = await createWave(db.exec, deps, { name: "scored", agreementFloor: 0.6 });
    await seedDraftAndAdmit(db, waveId, "d1");
    await freezeArmConfig(db.exec, deps, { waveId, config: { arm: "A1", model: "gpt", modelFamily: "openai", prompt: "p" } });
    const bundle = await buildPreregistrationBundle(db.exec, waveId, RULES);
    const hash = await freezePreregistration(db.exec, deps, { waveId, bundle });
    expect(hash).toHaveLength(64);
    const waveHash = (await db.exec.query(`select preregistration_hash from benchmark_waves where id = $1`, [waveId])).rows[0] as { preregistration_hash: string };
    expect(waveHash.preregistration_hash).toBe(hash);
    expect((await loadPreregistration(db.exec, waveId))!.hash).toBe(hash);
  });

  it("AC4: a scored-wave report REFUSES without a matching hash-commit; the dev set is EXEMPT", async () => {
    const scored = await createWave(db.exec, deps, { name: "scored2", agreementFloor: 0.6 });
    await expect(assertPreregistered(db.exec, scored)).rejects.toThrow(NotPreregisteredError);
    // after freezing, it passes
    await freezeArmConfig(db.exec, deps, { waveId: scored, config: { arm: "A1", modelFamily: "openai" } });
    const bundle = await buildPreregistrationBundle(db.exec, scored, RULES);
    await freezePreregistration(db.exec, deps, { waveId: scored, bundle });
    expect(await assertPreregistered(db.exec, scored)).not.toBeNull();

    // a dev-set / pilot wave is exempt — returns null, never throws
    const pilot = await createWave(db.exec, deps, { name: "pilot", agreementFloor: 0.6, isDevSet: true, kind: "pilot" });
    expect(await assertPreregistered(db.exec, pilot)).toBeNull();
  });

  it("AC4: post-freeze config drift is logged as a deviation", async () => {
    const waveId = await createWave(db.exec, deps, { name: "scored3", agreementFloor: 0.6 });
    await seedDraftAndAdmit(db, waveId, "d1");
    await freezeArmConfig(db.exec, deps, { waveId, config: { arm: "A1", model: "gpt", modelFamily: "openai", prompt: "v1" } });
    const bundle = await buildPreregistrationBundle(db.exec, waveId, RULES);
    await freezePreregistration(db.exec, deps, { waveId, bundle });

    // no drift yet
    expect(await detectDrift(db.exec, deps, waveId)).toEqual([]);

    // change the A1 config AFTER the freeze → a config drift; add a draft → a manifest drift
    await freezeArmConfig(db.exec, deps, { waveId, config: { arm: "A1", model: "gpt", modelFamily: "openai", prompt: "v2-TUNED" } });
    await seedDraftAndAdmit(db, waveId, "d2");
    const drift = await detectDrift(db.exec, deps, waveId);
    expect(drift.map((d) => d.kind).sort()).toEqual(["config_drift", "manifest_drift"]);
    const logged = await loadDeviations(db.exec, waveId);
    expect(logged.some((d) => d.kind === "config_drift" && /A1 config changed/.test(d.detail))).toBe(true);
    expect(logged.some((d) => d.kind === "manifest_drift" && /d2/.test(d.detail))).toBe(true);
  });

  it("MINOR-8: generateWaveReport DETECTS drift at render for a scored wave (not only out-of-band)", async () => {
    const waveId = await createWave(db.exec, deps, { name: "scored4", agreementFloor: 0.6 });
    await seedDraftAndAdmit(db, waveId, "d1");
    await freezeArmConfig(db.exec, deps, { waveId, config: { arm: "A1", model: "gpt", modelFamily: "openai", prompt: "v1" } });
    await freezePreregistration(db.exec, deps, { waveId, bundle: await buildPreregistrationBundle(db.exec, waveId, RULES) });
    // drift the config AFTER the freeze, WITHOUT calling detectDrift explicitly
    await freezeArmConfig(db.exec, deps, { waveId, config: { arm: "A1", model: "gpt", modelFamily: "openai", prompt: "v2-DRIFTED" } });

    const report = await generateWaveReport(db.exec, deps, { waveId });
    const deviations = report.public.deviations as Array<{ kind: string; detail: string }>;
    expect(deviations.some((d) => d.kind === "config_drift")).toBe(true); // render-time detection
    expect(report.public.preliminary).toBe(false); // a scored wave is not preliminary
  });
});

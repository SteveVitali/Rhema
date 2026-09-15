import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBenchmarkTestDb, testDeps, InMemoryEnclaveBlobStore, seedUsageRecord } from "./testing/harness.js";
import type { BenchmarkTestDb } from "./testing/harness.js";
import { registerCorpusDraft } from "./corpus.js";
import { createWave, recordMemorizationProbe, applyMemorizationExclusions } from "./wave.js";
import { recordArmRun } from "./arm-runs.js";
import { armEconomics, recallPerDollar } from "./scorers/economics.js";
import type { BenchmarkDeps } from "./types.js";

// REQ-EVAL-14: cost/latency join from the §12.7 proxy metering; recall-per-dollar. REQ-EVAL-20: benchmark runs
// joinable to run-ledger data. REQ-EVAL-2: a memorization-probe failure excludes the draft from that arm.

describe("economics metering join — REQ-EVAL-14 / REQ-EVAL-20", () => {
  let db: BenchmarkTestDb;
  let deps: BenchmarkDeps;
  const store = new InMemoryEnclaveBlobStore();
  beforeEach(async () => {
    db = await createBenchmarkTestDb();
    deps = testDeps(0);
  });
  afterEach(async () => {
    await db.close();
  });

  async function draft(id: string) {
    return registerCorpusDraft(db.exec, store, deps, {
      id, protocol: "essay", lengthBand: "2k", text: "x", licenseRef: "l", canaryId: `c-${id}`,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
  }

  it("sums proxy-metered list cost + credits + wall-clock over an arm's runs", async () => {
    await draft("d1");
    await draft("d2");
    const wave = await createWave(db.exec, deps, { name: "w1", agreementFloor: 0.6 });
    await recordArmRun(db.exec, deps, { waveId: wave, draftId: "d1", arm: "A4", configHash: "h1", runId: "run_1", latencyMs: 1000 });
    await recordArmRun(db.exec, deps, { waveId: wave, draftId: "d2", arm: "A4", configHash: "h1", runId: "run_2", latencyMs: 2000 });
    // run_1: two proxy usage rows; run_2: one. Plus a non-proxy row that must be ignored.
    await seedUsageRecord(db.exec, deps, { runId: "run_1", listCostUsd: 0.5, credits: 70 });
    await seedUsageRecord(db.exec, deps, { runId: "run_1", listCostUsd: 0.25, credits: 35 });
    await seedUsageRecord(db.exec, deps, { runId: "run_2", listCostUsd: 1.0, credits: 140 });
    await seedUsageRecord(db.exec, deps, { runId: "run_2", listCostUsd: 9.99, credits: 9999, source: "sdk_estimate" });

    const econ = await armEconomics(db.exec, wave, "A4");
    expect(econ.runs).toBe(2);
    expect(econ.listCostUsd).toBeCloseTo(1.75, 6); // 0.5+0.25+1.0 — the sdk_estimate row is excluded
    expect(econ.credits).toBe(245); // 70+35+140
    expect(econ.latencyMs).toBe(3000);
    expect(econ.usageRows).toBe(3);
  });

  it("an offline arm with no run_id has no metered cost", async () => {
    await draft("d1");
    const wave = await createWave(db.exec, deps, { name: "w2", agreementFloor: 0.6 });
    await recordArmRun(db.exec, deps, { waveId: wave, draftId: "d1", arm: "A6", configHash: "h", latencyMs: 60000 });
    const econ = await armEconomics(db.exec, wave, "A6");
    expect(econ.runs).toBe(1);
    expect(econ.listCostUsd).toBe(0);
    expect(econ.latencyMs).toBe(60000);
    expect(recallPerDollar(0.7, econ.listCostUsd)).toBeNull(); // no cost → undefined ratio, never infinite
  });

  it("recallPerDollar divides recall by metered cost", () => {
    expect(recallPerDollar(0.6, 1.5)).toBeCloseTo(0.4, 12);
  });

  it("the benchmark role can actually run the cross-tenant join in prod: SELECT on usage_records + BYPASSRLS", async () => {
    // usage_records is FORCE-RLS + granted only to rhema_app; the economics join runs as rhema_benchmark, which
    // needs SELECT on it AND BYPASSRLS (a wave spans workspaces). PGlite's superuser masks a missing grant in the
    // other tests, so assert the migration actually established both (migration 0013).
    const grant = (
      await db.exec.query(
        `select 1 from information_schema.role_table_grants
          where table_name = 'usage_records' and privilege_type = 'SELECT' and grantee = 'rhema_benchmark'`,
      )
    ).rows;
    expect(grant.length).toBe(1);
    const bypass = (
      await db.exec.query(`select rolbypassrls from pg_roles where rolname = 'rhema_benchmark'`)
    ).rows[0] as { rolbypassrls: boolean };
    expect(bypass.rolbypassrls).toBe(true);
  });

  it("a failed memorization probe excludes the draft×arm and drops it from the arm's numbers", async () => {
    await draft("d1");
    await draft("d2");
    const wave = await createWave(db.exec, deps, { name: "w3", agreementFloor: 0.6 });
    await recordArmRun(db.exec, deps, { waveId: wave, draftId: "d1", arm: "A1", configHash: "h", runId: "run_1", latencyMs: 100 });
    await recordArmRun(db.exec, deps, { waveId: wave, draftId: "d2", arm: "A1", configHash: "h", runId: "run_2", latencyMs: 100 });
    await seedUsageRecord(db.exec, deps, { runId: "run_1", listCostUsd: 1, credits: 100 });
    await seedUsageRecord(db.exec, deps, { runId: "run_2", listCostUsd: 1, credits: 100 });
    // d1 memorized by A1's model → probe fails → excluded from A1.
    await recordMemorizationProbe(db.exec, deps, { waveId: wave, draftId: "d1", arm: "A1", model: "m", passed: false });
    await recordMemorizationProbe(db.exec, deps, { waveId: wave, draftId: "d2", arm: "A1", model: "m", passed: true });

    const excluded = await applyMemorizationExclusions(db.exec, wave);
    expect(excluded).toBe(1);
    const econ = await armEconomics(db.exec, wave, "A1");
    expect(econ.runs).toBe(1); // only d2 remains for A1
    expect(econ.listCostUsd).toBeCloseTo(1, 6);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  weeklyEstimatorRefit,
  currentCapMultiplier,
  CAP_MULTIPLIER_CEILING,
  CAP_MULTIPLIER_FLOOR,
  REFIT_MIN_SAMPLE,
} from "./estimator-refit.js";
import {
  createLedgerTestDb,
  seedProject,
  seedRun,
  testEntryDeps,
  type LedgerTestDb,
} from "./testing/index.js";

// REQ-BILL-7 amended — the weekly cap-multiplier re-fit: steps down toward 1.25 when estimates cover
// actuals, back up toward 1.5 on overruns; refuses to move on a thin sample.

let db: LedgerTestDb;
const WS = "ws_seed";
const BA = "ba_seed";
const PRJ = "prj_seed";
const NOW = new Date("2026-09-28T00:00:00Z");
const deps = () => testEntryDeps(NOW);

beforeEach(async () => {
  db = await createLedgerTestDb();
  await seedProject(db, { workspaceId: WS, billingAccountId: BA, projectId: PRJ });
});
afterEach(() => db.close());

async function seedCompletedRuns(n: number, est: number, act: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await seedRun(db, { runId: `run_${i}`, workspaceId: WS, projectId: PRJ });
  }
  await db.pg.query(
    `update runs set state = 'completed', estimate_credits = $2, spent_credits = $3, ended_at = $4
      where workspace_id = $1`,
    [WS, est, act, new Date(NOW.getTime() - 24 * 60 * 60 * 1000)],
  );
}

describe("weeklyEstimatorRefit", () => {
  it("holds on an insufficient sample and still writes the evidence row", async () => {
    const out = await weeklyEstimatorRefit(db.client, deps(), NOW);
    expect(out.moved).toBe("insufficient");
    expect(out.sampleRuns).toBe(0);
    expect(out.capMultiplier).toBe(CAP_MULTIPLIER_CEILING);
    const fit = (await db.client.query("select sample_runs, note from estimator_fits")).rows[0] as {
      sample_runs: number;
      note: string;
    };
    expect(fit.note).toContain("insufficient");
  });

  it("steps the multiplier DOWN when estimates cover actuals (median ratio ≥ 1)", async () => {
    await seedCompletedRuns(REFIT_MIN_SAMPLE, 200, 150); // estimates 33% over actual
    const out = await weeklyEstimatorRefit(db.client, deps(), NOW);
    expect(out.moved).toBe("down");
    expect(out.capMultiplier).toBeCloseTo(CAP_MULTIPLIER_CEILING - 0.05);
    expect(await currentCapMultiplier(db.client)).toBeCloseTo(1.45);
    // repeated evidence keeps stepping down but never past the floor
    for (let i = 0; i < 10; i++) await weeklyEstimatorRefit(db.client, deps(), NOW);
    expect(await currentCapMultiplier(db.client)).toBe(CAP_MULTIPLIER_FLOOR);
  });

  it("steps UP when runs overrun their estimates (median ratio < 0.85)", async () => {
    await db.pg.query("update estimator_config set cap_multiplier = 1.30 where id = 'current'");
    await seedCompletedRuns(REFIT_MIN_SAMPLE, 100, 150); // actual 50% over estimate
    const out = await weeklyEstimatorRefit(db.client, deps(), NOW);
    expect(out.moved).toBe("up");
    expect(out.capMultiplier).toBeCloseTo(1.40);
    // never above the ceiling
    for (let i = 0; i < 10; i++) await weeklyEstimatorRefit(db.client, deps(), NOW);
    expect(await currentCapMultiplier(db.client)).toBe(CAP_MULTIPLIER_CEILING);
  });

  it("holds in the deadband (0.85 ≤ median < 1.0)", async () => {
    await seedCompletedRuns(REFIT_MIN_SAMPLE, 90, 100); // ratio 0.9
    const out = await weeklyEstimatorRefit(db.client, deps(), NOW);
    expect(out.moved).toBe("held");
    expect(out.capMultiplier).toBe(CAP_MULTIPLIER_CEILING);
  });
});

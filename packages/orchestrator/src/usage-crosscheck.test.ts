import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, type OrchestratorTestDb } from "./testing/index.js";
import { proxyVsSdkCrossCheck } from "./usage-crosscheck.js";

let db: OrchestratorTestDb;
let seed: Awaited<ReturnType<typeof seedProject>>;

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  seed = await seedProject(db);
});
afterEach(() => db.close());

let seq = 0;
async function usage(runId: string, source: string, listUsd: number): Promise<void> {
  await db.txRunner.run(seed.workspaceId, (tx) =>
    tx.query(
      `insert into usage_records(
         id, ts, workspace_id, billing_account_id, run_id, role, provider, model, model_tier,
         rate_table_version, list_cost_usd, credits, source)
       values ($1, now(), $2, $3, $4, 'editor', 'anthropic', 'sonnet-5', 'balanced', 1, $5, $6, $7)`,
      [`ur_${seq++}`, seed.workspaceId, seed.billingAccountId, runId, listUsd, Math.ceil(listUsd * 140), source],
    ),
  );
}

function check(runId: string) {
  return db.txRunner.run(seed.workspaceId, (tx) => proxyVsSdkCrossCheck(tx, runId));
}

describe("proxyVsSdkCrossCheck (§12.7 cross-check 1)", () => {
  it("equal proxy and SDK totals → within tolerance, not flagged", async () => {
    await usage("run1", "proxy", 1.0);
    await usage("run1", "sdk_estimate", 1.0);
    const r = await check("run1");
    expect(r.comparable).toBe(true);
    expect(r.divergencePct).toBe(0);
    expect(r.withinTolerance).toBe(true);
    expect(r.flagged).toBe(false);
    expect(r.alert).toBe(false);
  });

  it("a 1.5% divergence is within the ±2% exit tolerance", async () => {
    await usage("run1", "proxy", 1.0);
    await usage("run1", "sdk_estimate", 0.985); // 1.5% under
    const r = await check("run1");
    expect(r.divergencePct).toBeCloseTo(1.5, 6);
    expect(r.withinTolerance).toBe(true);
    expect(r.flagged).toBe(false);
  });

  it("a 3% divergence raises the flag but not the SLO alert", async () => {
    await usage("run1", "proxy", 1.0);
    await usage("run1", "sdk_estimate", 1.03);
    const r = await check("run1");
    expect(r.divergencePct).toBeCloseTo(3, 6);
    expect(r.withinTolerance).toBe(false);
    expect(r.flagged).toBe(true);
    expect(r.alert).toBe(false);
  });

  it("a 6% divergence raises the SLO alert (page)", async () => {
    await usage("run1", "proxy", 1.0);
    await usage("run1", "sdk_estimate", 1.06);
    const r = await check("run1");
    expect(r.flagged).toBe(true);
    expect(r.alert).toBe(true);
  });

  it("sums sdk_stream + sdk_estimate as the SDK-reported figure", async () => {
    await usage("run1", "proxy", 2.0);
    await usage("run1", "sdk_estimate", 1.4);
    await usage("run1", "sdk_stream", 0.6);
    const r = await check("run1");
    expect(r.sdkListUsd).toBeCloseTo(2.0, 6);
    expect(r.withinTolerance).toBe(true);
  });

  it("scopes to the run: another run's rows do not leak into the sum", async () => {
    await usage("run1", "proxy", 1.0);
    await usage("run1", "sdk_estimate", 1.0);
    await usage("run2", "proxy", 99);
    const r = await check("run1");
    expect(r.proxyListUsd).toBeCloseTo(1.0, 6);
  });

  it("no SDK rows → not comparable (never a false 0% pass)", async () => {
    await usage("run1", "proxy", 1.0);
    const r = await check("run1");
    expect(r.comparable).toBe(false);
    expect(r.withinTolerance).toBe(false);
    expect(r.flagged).toBe(false);
  });

  it("no rows at all → not comparable", async () => {
    const r = await check("run-empty");
    expect(r.comparable).toBe(false);
    expect(r.proxyListUsd).toBe(0);
    expect(r.sdkListUsd).toBe(0);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryEventWriter, type SqlClient } from "@rhema/orchestrator";
import { reconcileProviderReport, reconcileProviderWindow, type ReconcileAlert, type ReconcileMeasurement, type ProviderUsageReport } from "./reconcile.js";
import { SqlHoldLedger } from "./sql-ledger.js";
import {
  createLedgerTestDb,
  seedProject,
  seedRun,
  seedBalances,
  testEntryDeps,
  readBalances,
  type LedgerTestDb,
} from "./testing/index.js";

// PRB.08 — AC4: the nightly `usage.reconcile` reconciliation (REQ-BILL-13; §12.7 cross-check 2). Provider
// Usage & Cost rows join proxy meter-of-record rows by request id; the ledger adjusts ONLY in the user's
// favour (report < proxy ⇒ silent refund; report > proxy ⇒ platform-eaten); >2% fleet drift alerts; each
// reconciled run feeds the estimator recalibration seam.

let db: LedgerTestDb;
const WS = "ws_seed";
const BA = "ba_seed";
const NOW = new Date("2026-09-20T12:00:00Z");
let alerts: ReconcileAlert[];
let measured: ReconcileMeasurement[];

beforeEach(async () => {
  db = await createLedgerTestDb();
  await seedProject(db, { workspaceId: WS, billingAccountId: BA });
  alerts = [];
  measured = [];
});
afterEach(() => db.close());

function inTx<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
  return db.txRunner.run(WS, fn);
}

function deps() {
  const d = testEntryDeps(NOW);
  return {
    ...d,
    ledger: new SqlHoldLedger(d),
    runTx: (workspaceId: string, fn: (tx: SqlClient) => Promise<void>) => db.txRunner.run(workspaceId, fn),
    eventWriter: new InMemoryEventWriter(),
    alert: (a: ReconcileAlert) => void alerts.push(a),
    recalibrate: (m: ReconcileMeasurement) => void measured.push(m),
  };
}

/** A meter-of-record proxy row for a run (what the egress proxy wrote at meter time). */
async function seedProxyUsage(args: { id: string; runId: string; requestId: string; listCostUsd: number }) {
  await db.pg.query(
    `insert into usage_records
       (id, ts, workspace_id, billing_account_id, run_id, attempt, role, provider, model, model_tier,
        rate_table_version, list_cost_usd, credits, source, provider_request_id)
     values ($1, $2, $3, $4, $5, 1, 'agent', 'anthropic', 'claude-test', 'base', 1, $6, $7, 'proxy', $8)`,
    [args.id, NOW, WS, BA, args.runId, args.listCostUsd, Math.round(args.listCostUsd * 140), args.requestId],
  );
}

/** A run with real held+debited ledger rows (the refund must land in a bucket the run actually debited). */
async function seededDebitedRun(runId: string, debit: number) {
  await seedBalances(db, { billingAccountId: BA, balances: { included: 2000 } });
  await seedRun(db, { runId, workspaceId: WS, state: "completed", capCredits: 840 });
  const led = new SqlHoldLedger(testEntryDeps());
  await inTx((tx) => led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId, credits: 840, idempotencyKey: `hold:${runId}` }));
  await inTx((tx) => led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId, phaseId: "p1", credits: debit, idempotencyKey: `debit:${runId}:p1` }));
}

const report = (rows: { requestId: string; listCostUsd: number }[]): ProviderUsageReport => ({
  provider: "anthropic",
  reportKey: "anthropic:2026-09-19",
  rows,
});

describe("reconcileProviderReport (AC4 — REQ-BILL-13)", () => {
  it("a planted 3% drift: user-favourable refund written + the >2% alert fires", async () => {
    await seededDebitedRun("run_rec", 500);
    await seedProxyUsage({ id: "ur_1", runId: "run_rec", requestId: "req_1", listCostUsd: 1.0 });

    const res = await reconcileProviderReport(db.client, deps(), report([{ requestId: "req_1", listCostUsd: 0.97 }]));

    expect(res.matched).toBe(1);
    expect(res.driftPct).toBeCloseTo(-0.03, 5); // provider reported 3% LESS than we metered
    expect(res.alerted).toBe(true);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.kind).toBe("usage_drift");

    // the refund: floor(0.03 USD × 140 cr/USD) = 4 credits back to available — user-favourable.
    expect(res.refunds).toEqual([{ runId: "run_rec", credits: 4 }]);
    expect((await readBalances(db, BA)).included.available).toBe(1164); // 1160 + 4
    const refundRow = (
      await db.client.query("select kind, credits, reason from credit_ledger where run_id = 'run_rec' and kind = 'refund'")
    ).rows[0] as { kind: string; credits: number } | undefined;
    expect(refundRow?.credits).toBe(4);

    // the provider_report row of record landed + the proxy row is marked reconciled.
    const rep = (
      await db.client.query("select source, reconciled, provider_request_id from usage_records where provider_request_id = 'req_1' order by id")
    ).rows as { source: string; reconciled: boolean | null; provider_request_id: string }[];
    expect(rep).toHaveLength(2); // the proxy row + the provider_report row
    expect(rep.every((r) => r.reconciled === true)).toBe(true);

    // the estimator recalibration fold received the measured-vs-modeled facts (REQ-ARCH-35).
    expect(measured).toHaveLength(1);
    expect(measured[0]).toMatchObject({ runId: "run_rec", workflow: "review", measuredCredits: Math.round(0.97 * 140) });
  });

  it("provider reports MORE than metered → no charge, ever (user-favourable-only); the drift still alerts", async () => {
    await seededDebitedRun("run_rec", 500);
    await seedProxyUsage({ id: "ur_1", runId: "run_rec", requestId: "req_1", listCostUsd: 1.0 });

    const res = await reconcileProviderReport(db.client, deps(), report([{ requestId: "req_1", listCostUsd: 1.03 }]));
    expect(res.driftPct).toBeCloseTo(0.03, 5);
    expect(res.alerted).toBe(true); // |+3%| > 2% — under-metering pages too (a rate-table bug upstream)
    expect(res.refunds).toHaveLength(0); // never debited on — the platform eats it
    expect((await readBalances(db, BA)).included.available).toBe(1160); // untouched
  });

  it("under-2% drift: the user-favourable refund still lands; no page", async () => {
    await seededDebitedRun("run_rec", 500);
    await seedProxyUsage({ id: "ur_1", runId: "run_rec", requestId: "req_1", listCostUsd: 1.0 });
    const res = await reconcileProviderReport(db.client, deps(), report([{ requestId: "req_1", listCostUsd: 0.99 }]));
    expect(res.driftPct).toBeCloseTo(-0.01, 5);
    expect(res.alerted).toBe(false);
    expect(res.refunds).toEqual([{ runId: "run_rec", credits: 1 }]); // floor(0.01 × 140)
  });

  it("re-running the same report is a no-op (request-id dedupe + refund idempotency)", async () => {
    await seededDebitedRun("run_rec", 500);
    await seedProxyUsage({ id: "ur_1", runId: "run_rec", requestId: "req_1", listCostUsd: 1.0 });
    const a = await reconcileProviderReport(db.client, deps(), report([{ requestId: "req_1", listCostUsd: 0.97 }]));
    const b = await reconcileProviderReport(db.client, deps(), report([{ requestId: "req_1", listCostUsd: 0.97 }]));
    expect(a.refunds).toHaveLength(1);
    // the report row still matches the proxy row (it re-sums), but the refund key dedupes — no second credit.
    expect((await readBalances(db, BA)).included.available).toBe(1164);
    expect(
      (await db.client.query("select count(*)::int n from usage_records where source = 'provider_report'")).rows[0],
    ).toEqual({ n: 1 });
    expect(b).toBeDefined();
  });

  it("a report row with no proxy row is counted as unmatched (a metering hole), not reconciled", async () => {
    await seededDebitedRun("run_rec", 500);
    const res = await reconcileProviderReport(db.client, deps(), report([{ requestId: "req_ghost", listCostUsd: 5.0 }]));
    expect(res.matched).toBe(0);
    expect(res.unmatchedReportRows).toBe(1);
    expect(res.refunds).toHaveLength(0);
  });
});

// STB.4 — the window arm (D-PRB.08-1b): Anthropic's Usage & Cost API serves ONLY aggregate buckets —
// no per-request rows exist — so the reconcile compares window totals (dollars + per-model tokens)
// against Σ usage_records(source='proxy') over the same bounds. Detection + alert, NO ledger writes:
// an aggregate carries no run attribution, so nothing is refunded or debited here.
describe("reconcileProviderWindow (the Anthropic aggregate contract)", () => {
  // the window bounds CONTAIN NOW (2026-09-20T12:00Z) — the seeded proxy rows land inside.
  const START = new Date("2026-09-20T00:00:00Z");
  const END = new Date("2026-09-21T00:00:00Z");

  async function seedWindowProxyUsage(args: {
    id: string; runId: string; model: string; usd: number;
    it?: number; cwt?: number; crt?: number; ot?: number; searches?: number;
  }) {
    await db.pg.query(
      `insert into usage_records
         (id, ts, workspace_id, billing_account_id, run_id, attempt, role, provider, model, model_tier,
          rate_table_version, input_tokens, cache_write_tokens, cache_read_tokens, output_tokens,
          searches, list_cost_usd, credits, source, provider_request_id)
       values ($1, $2, $3, $4, $5, 1, 'agent', 'anthropic', $6, 'base', 1, $7, $8, $9, $10, $11, $12, $13, 'proxy', $14)`,
      [
        args.id, NOW, WS, BA, args.runId, args.model,
        args.it ?? 0, args.cwt ?? 0, args.crt ?? 0, args.ot ?? 0, args.searches ?? 0,
        args.usd, Math.round(args.usd * 140), `req_${args.id}`,
      ],
    );
  }

  const windowReport = (
    usd: number,
    tokensByModel: readonly import("./reconcile.js").ProviderWindowModelUsage[],
  ): ProviderUsageReport & { window: NonNullable<ProviderUsageReport["window"]> } => ({
    provider: "anthropic",
    reportKey: "anthropic:2026-09-20",
    rows: [],
    window: { start: START, end: END, usd, tokensByModel },
  });

  it("in-tolerance window: both numbers returned, per-model compare populated, no alert, no writes", async () => {
    await seededDebitedRun("run_w", 500);
    await seedWindowProxyUsage({ id: "ur_w1", runId: "run_w", model: "claude-sonnet-5", usd: 1.0, it: 100, cwt: 200, crt: 500, ot: 200, searches: 1 });

    const res = await reconcileProviderWindow(db.client, deps(), windowReport(1.01, [
      { model: "claude-sonnet-5", uncachedInputTokens: 100, cacheCreationInputTokens: 200, cacheReadInputTokens: 500, outputTokens: 200, webSearchRequests: 1 },
    ]));

    expect(res.proxyUsd).toBeCloseTo(1.0, 6);
    expect(res.reportUsd).toBeCloseTo(1.01, 6);
    expect(res.driftPct).toBeCloseTo(0.01, 5);
    expect(res.proxyRows).toBe(1);
    expect(res.alerted).toBe(false);
    expect(alerts).toHaveLength(0);
    const m = res.models.find((x) => x.model === "claude-sonnet-5");
    expect(m?.proxy?.inputTokens).toBe(100);
    expect(m?.report?.cacheReadTokens).toBe(500);
    expect(m?.tokenDriftPct).toBeCloseTo(0, 6);

    // detection-only: no provider_report rows, no ledger rows, balances untouched.
    expect(
      (await db.client.query("select count(*)::int n from usage_records where source = 'provider_report'")).rows[0],
    ).toEqual({ n: 0 });
    expect((await readBalances(db, BA)).included.available).toBe(1160);
  });

  it("a planted 3% dollar drift pages usage_drift with the window detail — and still writes nothing", async () => {
    await seededDebitedRun("run_w", 500);
    await seedWindowProxyUsage({ id: "ur_w1", runId: "run_w", model: "claude-sonnet-5", usd: 1.0, it: 1000 });

    const res = await reconcileProviderWindow(db.client, deps(), windowReport(0.97, [
      { model: "claude-sonnet-5", uncachedInputTokens: 1000, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, outputTokens: 0, webSearchRequests: 0 },
    ]));

    expect(res.driftPct).toBeCloseTo(-0.03, 5); // the provider reports LESS than we charged
    expect(res.alerted).toBe(true);
    expect(alerts[0]?.kind).toBe("usage_drift");
    expect(alerts[0]?.detail).toContain("claude-sonnet-5");
    expect(
      (await db.client.query("select count(*)::int n from usage_records where source = 'provider_report'")).rows[0],
    ).toEqual({ n: 0 });
    expect(
      (await db.client.query("select count(*)::int n from credit_ledger where run_id = 'run_w' and kind = 'refund'")).rows[0],
    ).toEqual({ n: 0 });
  });

  it("a report-only model (usage we never metered) surfaces as proxy:null; a meter-only model as report:null", async () => {
    await seedWindowProxyUsage({ id: "ur_w1", runId: "run_w", model: "claude-sonnet-5", usd: 1.0, it: 100 });
    const res = await reconcileProviderWindow(db.client, deps(), windowReport(1.0, [
      { model: "claude-sonnet-5", uncachedInputTokens: 100, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, outputTokens: 0, webSearchRequests: 0 },
      { model: "claude-opus-5", uncachedInputTokens: 50, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, outputTokens: 10, webSearchRequests: 0 },
    ]));
    expect(res.models.find((m) => m.model === "claude-opus-5")?.proxy).toBeNull();
    expect(res.models.find((m) => m.model === "claude-opus-5")?.report?.inputTokens).toBe(50);
    expect(res.models.find((m) => m.model === "claude-sonnet-5")?.tokenDriftPct).toBeCloseTo(0, 6);
  });

  it("a window outside the proxy rows' bounds compares against zero rows", async () => {
    const res = await reconcileProviderWindow(db.client, deps(), {
      provider: "anthropic", reportKey: "anthropic:2026-09-18", rows: [],
      window: { start: new Date("2026-09-18T00:00:00Z"), end: new Date("2026-09-19T00:00:00Z"), usd: 0, tokensByModel: [] },
    });
    expect(res.proxyRows).toBe(0);
    expect(res.proxyUsd).toBe(0);
    expect(res.driftPct).toBe(0);
    expect(res.alerted).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, seedRun, makeDeps, type OrchestratorTestDb, type TestDeps } from "@rhema/orchestrator/testing";
import { testEntryDeps } from "@rhema/ledger/testing";
import { SqlHoldLedger, insertStripeEvent, applyLedgerEntry } from "@rhema/ledger";
import { InMemoryContentStore, normalizeUrl, type DeliveryArgs, type VerdictSourceContext } from "@rhema/mirror";
import type { ClaimLedgerSidecar } from "@rhema/contracts";
import {
  handleStripeEvent,
  handleUsageReconcile,
  handleRunDeliver,
  type WorkerBillingDeps,
} from "./billing-jobs.js";
import type { ReconcileAlert } from "@rhema/ledger";

// PRB.08 worker billing jobs — the queued halves of §14.6 (stripe.event), REQ-BILL-13 (usage.reconcile +
// the nightly balances assertion), and the chargeback delivery re-drive (run.deliver). PGlite + in-memory
// seams (reportSource / alert / contentStoreFor) — deterministic.

let db: OrchestratorTestDb;
let base: TestDeps;
const WS = "01JQ0000000000000000000WS1";
const BA = "ba_seed";
const USER = "01JQ0000000000000000000MB1";
const NOW = new Date("2026-09-20T12:00:00Z");

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  base = makeDeps(db, { now: NOW });
  await seedProject(db, { userId: USER, workspaceId: WS, billingAccountId: BA, draftN: 2 });
  await db.pg.query("insert into workspace_members(workspace_id, user_id, role) values ($1,$2,'admin')", [WS, USER]);
});
afterEach(() => db.close());

function deps(over: Partial<WorkerBillingDeps> = {}): WorkerBillingDeps {
  return { ...base, ledger: new SqlHoldLedger(testEntryDeps()), systemExec: db.client, ...over };
}

describe("handleStripeEvent (stripe.event consumer — §14.6)", () => {
  it("processes a parked checkout.session.completed into grant(topup)", async () => {
    await insertStripeEvent(db.client, {
      id: "evt_w1", type: "checkout.session.completed", receivedAt: NOW,
      payload: {
        id: "evt_w1", type: "checkout.session.completed",
        data: { object: { id: "cs_w1", amount_total: 2500, payment_intent: "pi_w1", client_reference_id: BA, metadata: { workspace_id: WS } } },
      },
    });
    const out = await handleStripeEvent(deps(), { eventId: "evt_w1" });
    expect(out.kind).toBe("topup_granted");
    const bal = (
      await db.client.query("select available::int as a from credit_balances where billing_account_id = $1 and bucket = 'topup'", [BA])
    ).rows[0] as { a: number } | undefined;
    expect(bal?.a).toBe(2500);
  });
});

describe("handleUsageReconcile (nightly usage.reconcile — REQ-BILL-13 + REQ-SPEC-24.1)", () => {
  async function seedMeteredRun() {
    // balances must equal Σ ledger for the assertion — grant through the real write path, never seedBalances.
    await db.txRunner.run(WS, (tx) =>
      applyLedgerEntry(tx, testEntryDeps(), {
        workspaceId: WS, billingAccountId: BA, kind: "grant", credits: 2000, bucket: "included",
        source: "admin", reason: "house_credit", idempotencyKey: "grant:seed",
      }),
    );
    await seedRun(db, { runId: "run_rec", workspaceId: WS, state: "completed", capCredits: 840 });
    const led = new SqlHoldLedger(testEntryDeps());
    await db.txRunner.run(WS, (tx) => led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId: "run_rec", credits: 840, idempotencyKey: "hold:run_rec" }));
    await db.txRunner.run(WS, (tx) => led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: "run_rec", phaseId: "p1", credits: 500, idempotencyKey: "debit:run_rec:p1" }));
    await db.pg.query(
      `insert into usage_records
         (id, ts, workspace_id, billing_account_id, run_id, attempt, role, provider, model, model_tier,
          rate_table_version, list_cost_usd, credits, source, provider_request_id)
       values ('ur_1', $1, $2, $3, 'run_rec', 1, 'agent', 'anthropic', 'claude-test', 'base', 1, 1.0, 140, 'proxy', 'req_1')`,
      [NOW, WS, BA],
    );
  }

  it("reconciles the fixture report (3% drift → refund + alert), then the balances assertion rides green", async () => {
    await seedMeteredRun();
    const alerts: ReconcileAlert[] = [];
    const res = await handleUsageReconcile(deps({
      reportSource: {
        fetch: async () => ({ provider: "anthropic", reportKey: "anthropic:2026-09-19", rows: [{ requestId: "req_1", listCostUsd: 0.97 }] }),
      },
      alert: (a) => void alerts.push(a),
    }));
    expect(res.report?.matched).toBe(1);
    expect(res.report?.alerted).toBe(true);
    expect(res.report?.refunds).toEqual([{ runId: "run_rec", credits: 4 }]);
    expect(alerts.some((a) => a.kind === "usage_drift")).toBe(true);
    expect(res.balances.ok).toBe(true); // balances = Σ ledger still holds after the refund
  });

  it("a missing report source skips the report leg but still runs the balances assertion", async () => {
    const res = await handleUsageReconcile(deps());
    expect(res.report).toBeNull();
    expect(res.balances.ok).toBe(true);
  });
});

describe("handleRunDeliver (run.deliver — the withheld-delivery re-drive)", () => {
  const RUN = "run_deliver";
  const FETCHED = "https://a.example/one";
  const VCTX: VerdictSourceContext = { citationDomains: new Set(), reputableDomains: new Set(), searchResultDomains: new Set() };

  function delivery(): DeliveryArgs {
    const claimLedger: ClaimLedgerSidecar = {
      sidecar: "claim_ledger",
      version: 1,
      claims: [{ ordinal: 1, text: "c1", tier: 2, verdict: "verified", url: FETCHED, normalizedUrl: normalizeUrl(FETCHED), humanAdded: false }],
    } as ClaimLedgerSidecar;
    return {
      runId: RUN,
      attempt: 1,
      workspaceId: WS,
      projectId: "prj_seed",
      draftId: "dft_prj_seed_2",
      correspondenceKind: "review",
      deliveredVersionIds: ["av_v2"],
      draftPromotedVersionId: "av_v2",
      sidecars: [{ filename: "01-claim-ledger.json", json: claimLedger }],
      claimLedger,
      verdictContext: VCTX,
    };
  }

  beforeEach(async () => {
    await seedRun(db, { runId: RUN, workspaceId: WS, projectId: "prj_seed", state: "finalizing" });
    await db.pg.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
       values ('art_v2',$1,$2,'draft','shared','drafts/v2.md','av_v2')`,
      [WS, "prj_seed"],
    );
    await db.pg.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
       values ('av_v2','art_v2',1,$1,'k',4,'text/markdown','{"kind":"system"}'::jsonb)`,
      ["b".repeat(64)],
    );
    await db.pg.query(
      `insert into fetch_log(run_id, ts, agent_label, attempt, kind, url, normalized_url, decision)
       values ($1, now(), 'editor', 1, 'fetch', $2, $3, 'allow')`,
      [RUN, FETCHED, normalizeUrl(FETCHED)],
    );
  });

  async function stash() {
    const args = { billingAccountId: BA, holdLedgerId: "hold_1", spentCredits: 42, capCredits: 100, delivery: delivery() };
    await db.txRunner.run(WS, (tx) =>
      tx.query("update runs set pending_delivery = $1::jsonb, delivery_withheld_at = now() where id = $2", [JSON.stringify(args), RUN]),
    );
  }

  it("nothing pending → ok without touching anything", async () => {
    const res = await handleRunDeliver(deps({ contentStoreFor: async () => new InMemoryContentStore() }), { runId: RUN, workspaceId: WS });
    expect(res).toEqual({ ok: true, reason: "nothing_pending" });
  });

  it("a still-suspended account re-stashes (withheld); once non-negative the delivery commits + the stash clears", async () => {
    await stash();
    await db.pg.query("update billing_accounts set suspended_at = now() where id = $1", [BA]);
    const store = new InMemoryContentStore();
    const d = deps({ contentStoreFor: async () => store });

    const refused = await handleRunDeliver(d, { runId: RUN, workspaceId: WS });
    expect(refused.ok).toBe(false);
    expect(refused.withheld).toBe(true);
    // still finalizing, stash intact
    const mid = (await db.client.query("select state, pending_delivery from runs where id = $1", [RUN])).rows[0] as { state: string; pending_delivery: unknown };
    expect(mid.state).toBe("finalizing");
    expect(mid.pending_delivery).not.toBeNull();

    // the dispute resolves — the account is non-negative again; the dispute-won path cleared the withhold
    // marker before enqueueing this re-drive (applyDisputeWon / reinstateAccount).
    await db.pg.query("update billing_accounts set suspended_at = null where id = $1", [BA]);
    await db.txRunner.run(WS, (tx) => tx.query("update runs set delivery_withheld_at = null where id = $1", [RUN]));
    const done = await handleRunDeliver(d, { runId: RUN, workspaceId: WS });
    expect(done.ok).toBe(true);
    const fin = (await db.client.query("select state, pending_delivery, delivery_withheld_at from runs where id = $1", [RUN])).rows[0] as {
      state: string; pending_delivery: unknown; delivery_withheld_at: string | null;
    };
    expect(fin.state).toBe("completed");
    expect(fin.pending_delivery).toBeNull();
    expect(fin.delivery_withheld_at).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SqlClient } from "@rhema/orchestrator";
import { planOf } from "@rhema/contracts";
import { usageLevel0, usageLevel1, usageLevel2, usageLevel4, usageCsv, usageCsvText } from "./usage.js";
import { activateSubscription } from "./subscriptions.js";
import { provisionTrial, gateTrialUnlock } from "./trial.js";
import { grant } from "./entries.js";
import {
  createLedgerTestDb,
  seedProject,
  seedRun,
  testEntryDeps,
  type LedgerTestDb,
} from "./testing/index.js";

// §14.5 usage read models — L0 status strip, L1 account, L2 project, CSV export. Server-computed fields
// only; PGlite-backed.

let db: LedgerTestDb;
const WS = "ws_seed";
const BA = "ba_seed";
const USR = "usr_seed";
const PRJ = "prj_seed";
const NOW = new Date("2026-09-03T12:00:00Z");
const inTx = <T>(fn: (tx: SqlClient) => Promise<T>) => db.txRunner.run(WS, fn);
const deps = () => testEntryDeps(NOW);

beforeEach(async () => {
  db = await createLedgerTestDb();
  // plan:null — the read-model assertions name the exact plan (Free / an explicitly-activated
  // subscription), so no seeded paid row.
  await seedProject(db, { workspaceId: WS, billingAccountId: BA, userId: USR, projectId: PRJ, plan: null });
});
afterEach(() => db.close());

describe("usageLevel0 — the status strip", () => {
  it("reports spendable/held, the plan display, and trial days left", async () => {
    await inTx((tx) =>
      grant(tx, deps(), {
        workspaceId: WS,
        billingAccountId: BA,
        bucket: "topup",
        credits: 500,
        idempotencyKey: "g:1",
      }),
    );
    const l0 = await usageLevel0(db.client, BA, NOW);
    expect(l0.spendableCredits).toBe(500);
    expect(l0.plan).toBe("Free");
    expect(l0.trialDaysLeft).toBeNull();
  });

  it("shows the trial countdown while trial_active", async () => {
    await inTx((tx) => provisionTrial(tx, deps(), { billingAccountId: BA }));
    await inTx((tx) =>
      gateTrialUnlock(tx, deps(), {
        billingAccountId: BA,
        workspaceId: WS,
        evidence: { billingAccountId: BA, disposableDomain: false },
      }),
    );
    const l0 = await usageLevel0(db.client, BA, NOW);
    expect(l0.trialState).toBe("trial_active");
    expect(l0.trialDaysLeft).toBeGreaterThan(0);
    expect(l0.spendableCredits).toBe(150); // the trial pocket
  });
});

describe("usageLevel1 — account usage", () => {
  it("reports per-bucket balances, MTD spend, and the period facts", async () => {
    await inTx((tx) =>
      activateSubscription(tx, deps(), {
        workspaceId: WS,
        billingAccountId: BA,
        tier: "writer",
        cycle: "monthly",
        stripeSubscriptionId: "sub_1",
        periodStart: new Date("2026-09-01T00:00:00Z"),
        periodEnd: new Date("2026-10-01T00:00:00Z"),
        idempotencyKey: "act:1",
      }),
    );
    // a debit this month
    await seedRun(db, { runId: "run_1", workspaceId: WS, projectId: PRJ });
    await inTx((tx) =>
      tx.query(
        `insert into credit_ledger (id, workspace_id, billing_account_id, kind, credits, bucket, run_id, source, idempotency_key)
         values ('led_d1',$1,$2,'debit',120,'included','run_1','run','d:1')`,
        [WS, BA],
      ),
    );
    const l1 = await usageLevel1(db.client, BA, WS, NOW);
    expect(l1.level0.plan).toBe("Writer");
    expect(l1.monthToDateCredits).toBe(120);
    expect(l1.includedRemaining).toBe(planOf("writer").includedCreditsMonthly);
    expect(l1.includedRolloverCap).toBe(planOf("writer").includedCreditsMonthly * 2);
    expect(l1.periodEnd).toBe("2026-10-01T00:00:00.000Z");
    expect(l1.buckets.some((b) => b.bucket === "included" && b.available === 2000)).toBe(true);
  });

  it("renders the past-due renewal warning sentence while inside the grace window", async () => {
    await inTx((tx) =>
      activateSubscription(tx, deps(), {
        workspaceId: WS,
        billingAccountId: BA,
        tier: "writer",
        cycle: "monthly",
        stripeSubscriptionId: "sub_1",
        periodStart: new Date("2026-09-01T00:00:00Z"),
        periodEnd: new Date("2026-10-01T00:00:00Z"),
        idempotencyKey: "act:1",
      }),
    );
    await inTx((tx) =>
      tx.query(
        "update subscriptions set status='past_due', renewal_failed_at=$1 where stripe_subscription_id='sub_1'",
        [new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000)],
      ),
    );
    const l1 = await usageLevel1(db.client, BA, WS, NOW);
    expect(l1.warnings.some((w) => w.includes("payment didn't go through") && w.includes("9"))).toBe(true);
  });
});

describe("usageLevel2 — project rollup", () => {
  it("lists the project's runs newest-first with spend + cap", async () => {
    await seedRun(db, { runId: "run_1", workspaceId: WS, projectId: PRJ });
    await seedRun(db, { runId: "run_2", workspaceId: WS, projectId: PRJ });
    await db.pg.query("update runs set spent_credits = 40, estimate_credits = 30, cap_credits = 45 where id = 'run_1'");
    await db.pg.query("update runs set spent_credits = 80, estimate_credits = 60, cap_credits = 90, created_at = now() + interval '1 hour' where id = 'run_2'");
    const l2 = await usageLevel2(db.client, WS, PRJ);
    expect(l2.projectName).toBe("Seed project");
    expect(l2.totalCredits).toBe(120);
    expect(l2.runs[0]!.runId).toBe("run_2"); // newest first
    expect(l2.runs.map((r) => r.capCredits)).toEqual([90, 45]);
  });
});

describe("usageCsv — the §14.5 export", () => {
  it("emits one flat row per debit and RFC-4180-quotes the text", async () => {
    await seedRun(db, { runId: "run_1", workspaceId: WS, projectId: PRJ });
    await inTx((tx) =>
      tx.query(
        `insert into credit_ledger (id, workspace_id, billing_account_id, kind, credits, bucket, run_id, source, idempotency_key)
         values ('led_d1',$1,$2,'debit',42,'included','run_1','run','d:1'),
                ('led_d2',$1,$2,'debit',7,'topup','run_1','run','d:2')`,
        [WS, BA],
      ),
    );
    const rows = await usageCsv(db.client, BA, WS);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.project === "Seed project")).toBe(true);
    const text = usageCsvText(rows);
    expect(text.startsWith("date,project,run_id,workflow,state,credits,bucket\n")).toBe(true);
    expect(text).toContain("run_1");
    // quoting: a comma-bearing field is quoted
    expect(usageCsvText([{ ...rows[0]!, project: 'A "quoted", project' }])).toContain('"A ""quoted"", project"');
  });
});

describe("usageLevel4 — the Advanced drill-down", () => {
  it("ECON.1 D-A: counts only source='proxy' rows — sdk/provider_report twins never double-count", async () => {
    await seedRun(db, { runId: "run_l4", workspaceId: WS, projectId: PRJ, workflow: "review" });
    await inTx(async (tx) => {
      await tx.query(
        `insert into steps(id, run_id, phase, ordinal, state, credits, attempt, started_at, ended_at)
         values ('st_l4','run_l4','verification',2,'done',100,1,now(),now())`,
      );
      // the incident shape: 632 proxy + 553 sdk_estimate + 440 sdk_stream = a 1,625 display figure
      // where only 632 was ever the metered charge.
      for (const [id, source, credits] of [
        ["u_l4_p", "proxy", 632],
        ["u_l4_e", "sdk_estimate", 553],
        ["u_l4_s", "sdk_stream", 440],
        ["u_l4_r", "provider_report", 631],
      ] as const) {
        await tx.query(
          `insert into usage_records
             (id, ts, workspace_id, billing_account_id, run_id, attempt, step_id, role, provider, model,
              model_tier, rate_table_version, input_tokens, output_tokens, list_cost_usd, credits, source)
           values ($1, now(), $2, $3, 'run_l4', 1, 'st_l4', 'editor', 'anthropic', 'm', 'base', 1,
                   100, 50, 0.1, $4, $5)`,
          [id, WS, BA, credits, source],
        );
      }
    });
    const rows = await usageLevel4(db.client, WS, "run_l4");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.credits).toBe(632); // the meter of record — never 632+553+440+631
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// RPT.1 — Showcase exclusion (§15.3; REQ-GROWTH-11's usage half): the seeded worked-example run leaves
// every ordinary usage surface — MTD spend, the project rollup, the CSV — while its own report still
// serves under the worked-example label. And the pod-stamped `step:<key>` attribution joins L4.

describe("RPT.1 — the Showcase run leaves ordinary usage history", () => {
  it("a showcase project's run never appears in the account MTD total, the project rollup, or the CSV", async () => {
    await db.pg.query(
      `insert into projects (id, workspace_id, owner_id, title, slug, showcase)
       values ('prj_show', $1, $2, 'Showcase', 'showcase', true)`,
      [WS, USR],
    );
    // the seeded Showcase run's fixture figures (3,860 cr) — cap sized so the REQ-BILL-3 clamp holds.
    await seedRun(db, {
      runId: "run_show",
      workspaceId: WS,
      projectId: "prj_show",
      capCredits: 10_000,
    });
    await seedRun(db, { runId: "run_1", workspaceId: WS, projectId: PRJ });
    await db.pg.query("update runs set spent_credits = 3860 where id = 'run_show'");
    await db.pg.query("update runs set spent_credits = 120 where id = 'run_1'");
    await inTx((tx) =>
      tx.query(
        `insert into credit_ledger (id, workspace_id, billing_account_id, kind, credits, bucket, run_id, source, idempotency_key)
         values ('led_show',$1,$2,'debit',3860,'included','run_show','run','d:show'),
                ('led_real',$1,$2,'debit',120,'included','run_1','run','d:real')`,
        [WS, BA],
      ),
    );

    const l1 = await usageLevel1(db.client, BA, WS, NOW);
    expect(l1.monthToDateCredits).toBe(120); // the worked example's 3,860 never enters spend

    const real = await usageLevel2(db.client, WS, PRJ);
    expect(real.runs.map((r) => r.runId)).toEqual(["run_1"]);
    const showcase = await usageLevel2(db.client, WS, "prj_show");
    expect(showcase.runs).toHaveLength(0); // the seeded run is not usage history
    expect(showcase.totalCredits).toBe(0);

    const csv = await usageCsv(db.client, BA, WS);
    expect(csv.map((r) => r.runId)).toEqual(["run_1"]);
    expect(csv.some((r) => r.runId === "run_show")).toBe(false);
  });
});

describe("RPT.1 — the Level-4 step attribution join", () => {
  it("a pod-stamped `step:<key>` resolves the phase the orchestrator row does", async () => {
    await seedRun(db, { runId: "run_l4b", workspaceId: WS, projectId: PRJ, workflow: "review" });
    await inTx(async (tx) => {
      await tx.query(
        `insert into steps(id, run_id, phase, ordinal, state, credits, attempt, started_at, ended_at)
         values ('st_l4b','run_l4b','checking_claims',2,'done',100,1,now(),now()+interval '2 minutes')`,
      );
      for (const [id, stepId, credits] of [
        ["u_step_a", "st_l4b", 60],               // the orchestrator's own step id
        ["u_step_b", "step:checking_claims", 40], // the pod-stamped form (x-rhema-step)
        ["u_step_c", null, 5],                    // unattributed — falls back to the role label
      ] as const) {
        await tx.query(
          `insert into usage_records
             (id, ts, workspace_id, billing_account_id, run_id, attempt, step_id, role, provider, model,
              model_tier, rate_table_version, input_tokens, output_tokens, list_cost_usd, credits, source)
           values ($1, now(), $2, $3, 'run_l4b', 1, $4, 'verifier', 'anthropic', 'm', 'base', 1,
                   100, 50, 0.1, $5, 'proxy')`,
          [id, WS, BA, stepId, credits],
        );
      }
    });
    const rows = await usageLevel4(db.client, WS, "run_l4b");
    expect(rows).toHaveLength(3);
    const byId = rows.reduce((s, r) => s + r.credits, 0);
    expect(byId).toBe(105);
    const attributed = rows.filter((r) => r.phase === "checking_claims");
    expect(attributed.reduce((s, r) => s + r.credits, 0)).toBe(100); // both forms resolve the phase
    expect(rows.find((r) => r.credits === 5)!.phase).toBe("verifier"); // the unattributed fallback
  });
});

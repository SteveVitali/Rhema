import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SqlClient } from "@rhema/orchestrator";
import { PRICING } from "@rhema/contracts";
import {
  provisionTrial,
  gateTrialUnlock,
  recordTrialSpend,
  convertTrialOnUpgrade,
  sweepExpiredTrials,
  killTrial,
  TrialCeilingExhaustedError,
  TrialKilledError,
  TRIAL,
} from "./trial.js";
import { SqlHoldLedger, EntitlementUnavailableError } from "./sql-ledger.js";
import {
  createLedgerTestDb,
  seedProject,
  testEntryDeps,
  readBalances,
  type LedgerTestDb,
} from "./testing/index.js";

// §14.3 trial engine — unlock gate, abuse controls, daily ceiling, conversion, expiry, kill switch
// (REQ-GROWTH-10/15, REQ-SPEC-8). All over PGlite — no Stripe, no network.

let db: LedgerTestDb;
const WS = "ws_seed";
const BA = "ba_seed";
const USR = "usr_seed";
const NOW = new Date("2026-09-03T00:00:00Z");
const inTx = <T>(fn: (tx: SqlClient) => Promise<T>) => db.txRunner.run(WS, fn);
const deps = () => testEntryDeps(NOW);

const cleanEvidence = {
  billingAccountId: BA,
  userId: USR,
  emailDomain: "example.test",
  disposableDomain: false,
  fingerprintHash: "fp_1",
  asnRisk: 0.1,
} as const;

async function trialState(ba: string = BA): Promise<string | null> {
  const r = (await db.client.query("select trial_state from billing_accounts where id = $1", [ba]))
    .rows[0] as { trial_state: string | null } | undefined;
  return r?.trial_state ?? null;
}

async function entState(ba: string = BA): Promise<string | undefined> {
  const r = (
    await db.client.query("select state from trial_entitlements where billing_account_id = $1", [ba])
  ).rows[0] as { state: string } | undefined;
  return r?.state;
}

async function unlockChecks(ba: string = BA): Promise<{ decision: string; reason: string }[]> {
  return (
    await db.client.query(
      "select decision, reason from trial_unlock_checks where billing_account_id = $1 order by at, id",
      [ba],
    )
  ).rows as { decision: string; reason: string }[];
}

beforeEach(async () => {
  db = await createLedgerTestDb();
  await seedProject(db, { workspaceId: WS, billingAccountId: BA, userId: USR });
});
afterEach(() => db.close());

describe("provisionTrial", () => {
  it("creates a LOCKED entitlement and marks the account trial_pending; a second call is idempotent", async () => {
    const id1 = await inTx((tx) => provisionTrial(tx, deps(), { billingAccountId: BA }));
    expect(await entState()).toBe("locked");
    expect(await trialState()).toBe("trial_pending");
    const id2 = await inTx((tx) => provisionTrial(tx, deps(), { billingAccountId: BA }));
    expect(id2).toBe(id1);
    const n = (
      await db.client.query("select count(*)::int as c from trial_entitlements where billing_account_id = $1", [BA])
    ).rows[0] as { c: number };
    expect(n.c).toBe(1);
  });
});

describe("gateTrialUnlock (the first-spend gate, §14.3)", () => {
  it("allow: unlocks the entitlement, grants the 150-credit pocket, audits the decision", async () => {
    await inTx((tx) => provisionTrial(tx, deps(), { billingAccountId: BA }));
    const out = await inTx((tx) =>
      gateTrialUnlock(tx, deps(), { billingAccountId: BA, workspaceId: WS, userId: USR, evidence: cleanEvidence }),
    );
    expect(out.decision).toBe("allow");
    expect(out.claimable).toBe(true);
    expect(await entState()).toBe("unused");
    expect(await trialState()).toBe("trial_active");
    expect((await readBalances(db, BA)).trial_pocket).toEqual({
      available: PRICING.trial.pocketCredits,
      held: 0,
    });
    const checks = await unlockChecks();
    expect(checks).toEqual([{ decision: "allow", reason: "ok" }]);
  });

  it("deny: a fingerprint already bound to another account refuses (one trial per fingerprint)", async () => {
    // an earlier account already bound this fingerprint.
    await db.pg.query(
      "insert into billing_accounts(id, fingerprint_hash) values ('ba_other','fp_1') on conflict (id) do nothing",
    );
    await inTx((tx) => provisionTrial(tx, deps(), { billingAccountId: BA }));
    const out = await inTx((tx) =>
      gateTrialUnlock(tx, deps(), { billingAccountId: BA, workspaceId: WS, userId: USR, evidence: cleanEvidence }),
    );
    expect(out.decision).toBe("deny");
    expect(out.reason).toBe("fingerprint_seen");
    expect(out.claimable).toBe(false);
    expect(await entState()).toBe("locked"); // stays locked — never usable
    expect(await trialState()).toBe("trial_denied");
    expect((await readBalances(db, BA)).trial_pocket).toBeUndefined(); // no pocket on a denial
  });

  it("deny: a disposable email domain refuses", async () => {
    await inTx((tx) => provisionTrial(tx, deps(), { billingAccountId: BA }));
    const out = await inTx((tx) =>
      gateTrialUnlock(tx, deps(), {
        billingAccountId: BA,
        workspaceId: WS,
        evidence: { ...cleanEvidence, fingerprintHash: "fp_fresh", disposableDomain: true },
      }),
    );
    expect(out.decision).toBe("deny");
    expect(out.reason).toBe("disposable_domain");
  });

  it("challenge: a high risk score asks for the phone challenge and stays locked", async () => {
    await inTx((tx) => provisionTrial(tx, deps(), { billingAccountId: BA }));
    const out = await inTx((tx) =>
      gateTrialUnlock(tx, deps(), {
        billingAccountId: BA,
        workspaceId: WS,
        evidence: { ...cleanEvidence, fingerprintHash: "fp_fresh", asnRisk: 0.9 },
      }),
    );
    expect(out.decision).toBe("challenge");
    expect(out.claimable).toBe(false);
    expect(await entState()).toBe("locked");
    expect(await trialState()).toBe("trial_pending"); // not denied — retryable after verification
  });

  it("paused: the global daily trial-spend ceiling pauses (not denies) the unlock", async () => {
    await db.pg.query("insert into trial_spend_daily(day, credits) values ($1, $2)", [
      NOW.toISOString().slice(0, 10),
      TRIAL.dailySpendCeilingCredits,
    ]);
    await inTx((tx) => provisionTrial(tx, deps(), { billingAccountId: BA }));
    const out = await inTx((tx) =>
      gateTrialUnlock(tx, deps(), { billingAccountId: BA, workspaceId: WS, evidence: { ...cleanEvidence, fingerprintHash: "fp_fresh" } }),
    );
    expect(out.decision).toBe("paused");
    expect(out.reason).toBe("daily_ceiling");
    expect(await entState()).toBe("locked");
  });

  it("a killed account is denied outright", async () => {
    await inTx((tx) => provisionTrial(tx, deps(), { billingAccountId: BA }));
    await inTx((tx) =>
      killTrial(tx, deps(), { actor: "op_1", billingAccountId: BA, workspaceId: WS }),
    );
    const out = await inTx((tx) =>
      gateTrialUnlock(tx, deps(), { billingAccountId: BA, workspaceId: WS, evidence: cleanEvidence }),
    );
    expect(out.decision).toBe("deny");
    expect(out.reason).toBe("killed");
  });

  it("an expired window denies", async () => {
    await inTx((tx) => provisionTrial(tx, deps(), { billingAccountId: BA }));
    await inTx((tx) =>
      tx.query("update trial_entitlements set expires_at = $2 where billing_account_id = $1", [
        BA,
        new Date(NOW.getTime() - 1000),
      ]),
    );
    const out = await inTx((tx) =>
      gateTrialUnlock(tx, deps(), { billingAccountId: BA, workspaceId: WS, evidence: cleanEvidence }),
    );
    expect(out.decision).toBe("deny");
    expect(out.reason).toBe("window_expired");
  });

  it("an already-active account short-circuits (no second pocket grant, no second audit gate)", async () => {
    await inTx((tx) => provisionTrial(tx, deps(), { billingAccountId: BA }));
    await inTx((tx) =>
      gateTrialUnlock(tx, deps(), { billingAccountId: BA, workspaceId: WS, evidence: cleanEvidence }),
    );
    const again = await inTx((tx) =>
      gateTrialUnlock(tx, deps(), { billingAccountId: BA, workspaceId: WS, evidence: { ...cleanEvidence, asnRisk: 0.99 } }),
    );
    expect(again.decision).toBe("allow");
    expect(again.reason).toBe("already_active");
    // still exactly one pocket grant
    expect((await readBalances(db, BA)).trial_pocket.available).toBe(PRICING.trial.pocketCredits);
  });
});

describe("recordTrialSpend — the global daily ceiling (REQ-GROWTH-15 amended)", () => {
  it("increments the day counter inside the tx and throws over the ceiling", async () => {
    const total = await inTx((tx) => recordTrialSpend(tx, 100, NOW));
    expect(total).toBe(100);
    await expect(inTx((tx) => recordTrialSpend(tx, TRIAL.dailySpendCeilingCredits, NOW))).rejects.toBeInstanceOf(
      TrialCeilingExhaustedError,
    );
    // the throwing increment rolled back with its tx
    const row = (
      await db.client.query("select credits::int as c from trial_spend_daily where day = $1", [
        NOW.toISOString().slice(0, 10),
      ])
    ).rows[0] as { c: number };
    expect(row.c).toBe(100);
  });
});

describe("the entitlement hold path (REQ-SPEC-8; §14.3)", () => {
  async function activate() {
    await inTx((tx) => provisionTrial(tx, deps(), { billingAccountId: BA }));
    await inTx((tx) =>
      gateTrialUnlock(tx, deps(), { billingAccountId: BA, workspaceId: WS, evidence: cleanEvidence }),
    );
    return (await db.client.query("select id from trial_entitlements where billing_account_id = $1", [BA]))
      .rows[0]!.id as string;
  }

  it("a locked entitlement cannot be claimed (the unlock gate hasn't run)", async () => {
    await inTx((tx) => provisionTrial(tx, deps(), { billingAccountId: BA }));
    const entId = (await db.client.query("select id from trial_entitlements where billing_account_id = $1", [BA]))
      .rows[0]!.id as string;
    const ledger = new SqlHoldLedger(deps());
    await expect(
      inTx((tx) =>
        ledger.hold(tx, {
          billingAccountId: BA,
          workspaceId: WS,
          runId: "run_1",
          credits: 100,
          idempotencyKey: "hold:run_1",
          entitlementId: entId,
        }),
      ),
    ).rejects.toBeInstanceOf(EntitlementUnavailableError);
  });

  it("an unlocked entitlement claims exactly once — a second run's hold refuses", async () => {
    const entId = await activate();
    const ledger = new SqlHoldLedger(deps());
    await inTx((tx) =>
      ledger.hold(tx, {
        billingAccountId: BA,
        workspaceId: WS,
        runId: "run_1",
        credits: 100,
        idempotencyKey: "hold:run_1",
        entitlementId: entId,
      }),
    );
    expect(await entState()).toBe("consumed");
    // a retry of the SAME run is idempotent
    const replay = await inTx((tx) =>
      ledger.hold(tx, {
        billingAccountId: BA,
        workspaceId: WS,
        runId: "run_1",
        credits: 100,
        idempotencyKey: "hold:run_1",
        entitlementId: entId,
      }),
    );
    expect(replay.bucket).toBe("trial_pocket");
    // a SECOND run can never ride the consumed entitlement (the free run is exactly one)
    await expect(
      inTx((tx) =>
        ledger.hold(tx, {
          billingAccountId: BA,
          workspaceId: WS,
          runId: "run_2",
          credits: 100,
          idempotencyKey: "hold:run_2",
          entitlementId: entId,
        }),
      ),
    ).rejects.toBeInstanceOf(EntitlementUnavailableError);
    // the claim charged the daily trial-spend ceiling
    const spend = (
      await db.client.query("select credits::int as c from trial_spend_daily where day = $1", [
        NOW.toISOString().slice(0, 10),
      ])
    ).rows[0] as { c: number };
    expect(spend.c).toBe(100);
  });

  it("a killed account's hold throws TrialKilledError even with an unused entitlement", async () => {
    const entId = await activate();
    await inTx((tx) => killTrial(tx, deps(), { actor: "op_1", billingAccountId: BA, workspaceId: WS }));
    const ledger = new SqlHoldLedger(deps());
    await expect(
      inTx((tx) =>
        ledger.hold(tx, {
          billingAccountId: BA,
          workspaceId: WS,
          runId: "run_1",
          credits: 50,
          idempotencyKey: "hold:run_1",
          entitlementId: entId,
        }),
      ),
    ).rejects.toBeInstanceOf(TrialKilledError);
  });
});

describe("convertTrialOnUpgrade (§14.3)", () => {
  it("voids the unspent pocket and grants the 800-credit promo — once", async () => {
    await inTx((tx) => provisionTrial(tx, deps(), { billingAccountId: BA }));
    await inTx((tx) =>
      gateTrialUnlock(tx, deps(), { billingAccountId: BA, workspaceId: WS, evidence: cleanEvidence }),
    );
    const conv = await inTx((tx) =>
      convertTrialOnUpgrade(tx, deps(), { billingAccountId: BA, workspaceId: WS }),
    );
    expect(conv.converted).toBe(true);
    expect(conv.pocketVoided).toBe(PRICING.trial.pocketCredits);
    const bal = await readBalances(db, BA);
    expect(bal.trial_pocket.available).toBe(0);
    expect(bal.promo.available).toBe(PRICING.trial.upgradePromoCredits);
    expect(await entState()).toBe("converted");
    // idempotent: a replayed upgrade event does not double-grant
    const again = await inTx((tx) =>
      convertTrialOnUpgrade(tx, deps(), { billingAccountId: BA, workspaceId: WS }),
    );
    expect(again.converted).toBe(false);
    expect((await readBalances(db, BA)).promo.available).toBe(PRICING.trial.upgradePromoCredits);
  });
});

describe("sweepExpiredTrials + killTrial", () => {
  it("expires the entitlement, voids the pocket, and drops the account to free", async () => {
    await inTx((tx) => provisionTrial(tx, deps(), { billingAccountId: BA }));
    await inTx((tx) =>
      gateTrialUnlock(tx, deps(), { billingAccountId: BA, workspaceId: WS, evidence: cleanEvidence }),
    );
    const later = new Date(NOW.getTime() + (TRIAL.windowDays + 1) * 24 * 60 * 60 * 1000);
    const out = await sweepExpiredTrials(
      db.client,
      { ...deps(), runTx: (ws, fn) => db.txRunner.run(ws, fn) },
      later,
    );
    expect(out.expired).toBe(1);
    expect(await entState()).toBe("expired");
    expect(await trialState()).toBe("free");
    expect((await readBalances(db, BA)).trial_pocket.available).toBe(0);
    // a second sweep finds nothing
    const again = await sweepExpiredTrials(db.client, { ...deps(), runTx: (ws, fn) => db.txRunner.run(ws, fn) }, later);
    expect(again.expired).toBe(0);
  });

  it("killTrial voids entitlement + pocket and audits the action; a second kill is a no-op", async () => {
    await inTx((tx) => provisionTrial(tx, deps(), { billingAccountId: BA }));
    await inTx((tx) =>
      gateTrialUnlock(tx, deps(), { billingAccountId: BA, workspaceId: WS, evidence: cleanEvidence }),
    );
    const res = await inTx((tx) =>
      killTrial(tx, deps(), { actor: "op_1", billingAccountId: BA, workspaceId: WS, note: "abuse cluster" }),
    );
    expect(res.killed).toBe(true);
    expect(res.voided).toBe(PRICING.trial.pocketCredits);
    expect(await entState()).toBe("revoked");
    const actions = (
      await db.client.query("select action from admin_actions where billing_account_id = $1", [BA])
    ).rows as { action: string }[];
    expect(actions.map((a) => a.action)).toEqual(["trial_kill"]);
    const again = await inTx((tx) =>
      killTrial(tx, deps(), { actor: "op_1", billingAccountId: BA, workspaceId: WS }),
    );
    expect(again.killed).toBe(false);
  });
});

describe("the pocket spends like a normal bucket", () => {
  it("a trial_pocket grant draws in consumption order via the ordinary hold path", async () => {
    await inTx((tx) => provisionTrial(tx, deps(), { billingAccountId: BA }));
    await inTx((tx) =>
      gateTrialUnlock(tx, deps(), { billingAccountId: BA, workspaceId: WS, evidence: cleanEvidence }),
    );
    const ledger = new SqlHoldLedger(deps());
    const hold = await inTx((tx) =>
      ledger.hold(tx, {
        billingAccountId: BA,
        workspaceId: WS,
        runId: "run_plain",
        credits: 50,
        idempotencyKey: "hold:run_plain",
      }),
    );
    expect(hold.bucket).toBe("trial_pocket"); // pocket is first in consumption order
    expect((await readBalances(db, BA)).trial_pocket.held).toBe(50);
  });
});

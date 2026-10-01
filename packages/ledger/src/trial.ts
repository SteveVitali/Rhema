// The trial engine (P1.16; §14.3; REQ-GROWTH-10/15, REQ-SPEC-8). One Review ≤6,000 words — Standard rigor,
// Base tier — "on us", plus a 150-credit pocket, inside a 14-day window. Identity-before-spend: the
// entitlement is created LOCKED at signup and only unlocks at the first spend attempt, behind the abuse
// gate (fingerprint reuse → deny, disposable domain → deny, risk score → phone challenge, global daily
// trial-spend ceiling → pause). The workspace kill switch voids entitlement + pocket; the hold path reads
// `trial_killed_at` live so the ≤60 s void is real, not best-effort. On upgrade inside the window the unused
// entitlement + unspent pocket convert to an 800-credit promo grant; at expiry it all lapses to Free.

import type { SqlClient } from "@rhema/orchestrator";
import {
  decideTrialUnlock,
  PRICING,
  type TrialUnlockDecision,
  type TrialUnlockEvidence,
} from "@rhema/contracts";
import { grant, type EntryDeps } from "./entries.js";
import { expireCredits } from "./expiry.js";

export const TRIAL = PRICING.trial;

/** Raised when a trial run's claim would push the platform past the global daily trial-spend ceiling. */
export class TrialCeilingExhaustedError extends Error {
  constructor() {
    super("the global daily trial-spend ceiling is exhausted — the trial unlocks again tomorrow (UTC)");
    this.name = "TrialCeilingExhaustedError";
  }
}

/** Raised when the workspace kill switch has voided the account's trial (§14.3; REQ-GROWTH-15). */
export class TrialKilledError extends Error {
  constructor(readonly billingAccountId: string) {
    super(`trial on billing account ${billingAccountId} was voided by the kill switch`);
    this.name = "TrialKilledError";
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ------------------------------------------------------------------ provisioning (signup)

/**
 * Create the LOCKED entitlement + mark the account `trial_pending`. Called by signup inside the account
 * bootstrap transaction. Idempotent per account (a second call returns the existing row).
 */
export async function provisionTrial(
  tx: SqlClient,
  deps: EntryDeps,
  args: { billingAccountId: string },
): Promise<string> {
  const existing = (
    await tx.query("select id from trial_entitlements where billing_account_id = $1 limit 1", [
      args.billingAccountId,
    ])
  ).rows[0] as { id: string } | undefined;
  const id = existing?.id ?? deps.ids("tent");
  if (!existing) {
    const expiresAt = new Date(deps.clock.now().getTime() + TRIAL.windowDays * DAY_MS);
    await tx.query(
      `insert into trial_entitlements
         (id, billing_account_id, kind, word_cap, rigor, model_tier, state, expires_at)
       values ($1,$2,$3,$4,$5,$6,'locked',$7)`,
      [id, args.billingAccountId, TRIAL.entitlement.kind, TRIAL.entitlement.wordCap, TRIAL.entitlement.rigor, TRIAL.entitlement.modelTier, expiresAt],
    );
  }
  await tx.query(
    "update billing_accounts set trial_state = 'trial_pending' where id = $1 and trial_state is null",
    [args.billingAccountId],
  );
  return id;
}

// ------------------------------------------------------------------ the unlock gate (first spend)

export interface TrialUnlockOutcome {
  readonly decision: TrialUnlockDecision;
  readonly reason: string;
  readonly entitlementId: string | null;
  /** true when the entitlement is claimable after this call (allow, or already active). */
  readonly claimable: boolean;
}

/**
 * The first-spend gate. Reads the account + entitlement under the caller's tx (the api calls this BEFORE
 * creating the run — inside the same workspace tx). Writes the audit row unconditionally
 * (REQ-GROWTH-10). On `allow`: entitlement locked→unused, the 150-credit pocket is granted (expiry = the
 * window end — a pocket that outlived the trial would be an unpriced subsidy), and the account moves to
 * `trial_active`. On `deny`: `trial_denied`. On `paused`/`challenge`: the entitlement stays locked — the
 * caller surfaces "try again" / the phone challenge.
 */
export async function gateTrialUnlock(
  tx: SqlClient,
  deps: EntryDeps,
  args: {
    billingAccountId: string;
    workspaceId: string;
    userId?: string;
    evidence: TrialUnlockEvidence;
    /** injectable risk threshold (ASN/IP score at/above which the phone challenge fires). */
    riskThreshold?: number;
  },
): Promise<TrialUnlockOutcome> {
  const account = (
    await tx.query(
      "select trial_state, trial_killed_at, fingerprint_hash from billing_accounts where id = $1 for update",
      [args.billingAccountId],
    )
  ).rows[0] as
    | { trial_state: string | null; trial_killed_at: string | null; fingerprint_hash: string | null }
    | undefined;
  const ent = (
    await tx.query(
      "select id, state, expires_at from trial_entitlements where billing_account_id = $1 order by expires_at desc nulls last limit 1",
      [args.billingAccountId],
    )
  ).rows[0] as { id: string; state: string; expires_at: string | null } | undefined;

  // Already past the gate — a retry or a second run inside the window must not re-run the checks.
  if (account?.trial_state === "trial_active" || account?.trial_state === "trial_used") {
    return { decision: "allow", reason: "already_active", entitlementId: ent?.id ?? null, claimable: ent?.state === "unused" };
  }
  if (account?.trial_killed_at) {
    return { decision: "deny", reason: "killed", entitlementId: ent?.id ?? null, claimable: false };
  }
  if (!ent || ent.state !== "locked") {
    // consumed/expired/revoked/denied — nothing to unlock.
    return {
      decision: "deny",
      reason: ent ? `entitlement_${ent.state}` : "no_entitlement",
      entitlementId: ent?.id ?? null,
      claimable: false,
    };
  }
  if (ent.expires_at && new Date(ent.expires_at).getTime() <= deps.clock.now().getTime()) {
    return { decision: "deny", reason: "window_expired", entitlementId: ent.id, claimable: false };
  }

  // evidence: fingerprint reuse count (accounts already bound to this fingerprint).
  let fingerprintSeen = 0;
  if (args.evidence.fingerprintHash) {
    fingerprintSeen = Number(
      (
        (
          await tx.query(
            "select count(*)::int as c from billing_accounts where fingerprint_hash = $1 and id <> $2",
            [args.evidence.fingerprintHash, args.billingAccountId],
          )
        ).rows[0] as { c: number }
      ).c,
    );
  }
  // the global daily trial-spend ceiling is checked against today's committed counter (the claim itself
  // increments inside the hold; here we refuse up front when it is already exhausted).
  const today = deps.clock.now().toISOString().slice(0, 10);
  const spentToday = Number(
    (
      (
        await tx.query("select credits::int as c from trial_spend_daily where day = $1", [today])
      ).rows[0] as { c: number } | undefined
    )?.c ?? 0,
  );

  const result = decideTrialUnlock(
    { ...args.evidence, fingerprintSeen },
    { riskThreshold: args.riskThreshold ?? 0.7, ceilingExhausted: spentToday >= TRIAL.dailySpendCeilingCredits },
  );

  // the audit row — every decision, every time (REQ-GROWTH-10).
  await tx.query(
    `insert into trial_unlock_checks
       (id, billing_account_id, user_id, at, email_domain, disposable_domain, fingerprint_hash, fingerprint_seen, asn_risk, decision, reason)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      deps.ids("tchk"),
      args.billingAccountId,
      args.userId ?? args.evidence.userId ?? null,
      deps.clock.now(),
      args.evidence.emailDomain ?? null,
      args.evidence.disposableDomain,
      args.evidence.fingerprintHash ?? null,
      fingerprintSeen,
      args.evidence.asnRisk ?? null,
      result.decision,
      result.reason,
    ],
  );

  if (result.decision === "deny") {
    await tx.query("update billing_accounts set trial_state = 'trial_denied' where id = $1", [args.billingAccountId]);
    if (args.evidence.fingerprintHash) {
      // bind the fingerprint at denial too — a retried signup under the same device stays denied.
      await tx.query(
        "update billing_accounts set fingerprint_hash = $2 where id = $1 and fingerprint_hash is null",
        [args.billingAccountId, args.evidence.fingerprintHash],
      );
    }
    return { decision: "deny", reason: result.reason, entitlementId: ent.id, claimable: false };
  }
  if (result.decision !== "allow") {
    return { decision: result.decision, reason: result.reason, entitlementId: ent.id, claimable: false };
  }

  // allow → activate: entitlement unlocks, pocket grants, fingerprint binds, the window starts at
  // activation only if expires_at is unset (signup already stamped it — keep the earlier bound).
  await tx.query(
    `update trial_entitlements set state = 'unused', activated_at = $2,
        expires_at = coalesce(expires_at, $3)
       where id = $1`,
    [ent.id, deps.clock.now(), new Date(deps.clock.now().getTime() + TRIAL.windowDays * DAY_MS)],
  );
  if (args.evidence.fingerprintHash) {
    await tx.query(
      "update billing_accounts set fingerprint_hash = $2 where id = $1 and fingerprint_hash is null",
      [args.billingAccountId, args.evidence.fingerprintHash],
    );
  }
  const expiresAt = (
    await tx.query("select expires_at from trial_entitlements where id = $1", [ent.id])
  ).rows[0] as { expires_at: string | null };
  const pocket = await grant(tx, deps, {
    workspaceId: args.workspaceId,
    billingAccountId: args.billingAccountId,
    bucket: "trial_pocket",
    credits: TRIAL.pocketCredits,
    reason: "trial_pocket",
    expiresAt: expiresAt.expires_at ? new Date(expiresAt.expires_at) : null,
    idempotencyKey: `trial:pocket:${ent.id}`,
  });
  await tx.query("update trial_entitlements set pocket_ledger_id = $2 where id = $1", [ent.id, pocket.ledgerId]);
  await tx.query("update billing_accounts set trial_state = 'trial_active' where id = $1", [args.billingAccountId]);
  return { decision: "allow", reason: result.reason, entitlementId: ent.id, claimable: true };
}

// ------------------------------------------------------------------ daily spend ceiling (the hold path)

/**
 * Charge a trial run's estimated cost against the global daily ceiling — inside the hold's transaction so
 * a refused hold rolls the increment back (no phantom usage). Throws `TrialCeilingExhaustedError` over the
 * bound. Returns the new day total.
 */
export async function recordTrialSpend(
  tx: SqlClient,
  credits: number,
  now: Date,
  opts?: { workspaceId?: string },
): Promise<number> {
  const day = now.toISOString().slice(0, 10);
  // JOURNEY.1 (REQ-SPEC-29): flagged test tenants never count against the global daily trial-spend
  // ceiling — the kill switch measures REAL users' trial burn, not the journey harness's. The read is
  // in-tx so a flagged hold still returns the day's running total (callers only need the count on
  // refusal; a test-tenant hold can never trip the ceiling).
  if (opts?.workspaceId) {
    const flagged = (
      await tx.query("select is_test from workspaces where id = $1", [opts.workspaceId])
    ).rows[0] as { is_test: boolean } | undefined;
    if (flagged?.is_test) {
      const cur = (
        await tx.query("select credits::int as c from trial_spend_daily where day = $1", [day])
      ).rows[0] as { c: number } | undefined;
      return Number(cur?.c ?? 0);
    }
  }
  const row = (
    await tx.query(
      `insert into trial_spend_daily (day, credits) values ($1, $2)
         on conflict (day) do update set credits = trial_spend_daily.credits + $2
         returning credits::int as c`,
      [day, Math.max(0, Math.trunc(credits))],
    )
  ).rows[0] as { c: number };
  const total = Number(row.c);
  if (total > TRIAL.dailySpendCeilingCredits) throw new TrialCeilingExhaustedError();
  return total;
}

// ------------------------------------------------------------------ upgrade conversion (§14.3)

export interface TrialConversion {
  readonly converted: boolean;
  readonly promoLedgerId: string | null;
  readonly pocketVoided: number;
}

/**
 * On upgrade inside the window: the unused/consumed entitlement and the unspent pocket convert to an
 * 800-credit promo grant. The pocket is voided FIRST (expire row — a converted pocket can't double-spend),
 * then the promo lands. Idempotent on the entitlement's conversion marker.
 */
export async function convertTrialOnUpgrade(
  tx: SqlClient,
  deps: EntryDeps,
  args: { billingAccountId: string; workspaceId: string },
): Promise<TrialConversion> {
  const ent = (
    await tx.query(
      `select id, state from trial_entitlements where billing_account_id = $1
         and state in ('unused','consumed','locked') order by expires_at desc nulls last limit 1`,
      [args.billingAccountId],
    )
  ).rows[0] as { id: string; state: string } | undefined;

  // void the unspent pocket whatever the entitlement state — a pocket that survived upgrade is a bug.
  const pocketVoided = await expireCredits(tx, deps, {
    workspaceId: args.workspaceId,
    billingAccountId: args.billingAccountId,
    bucket: "trial_pocket",
    credits: TRIAL.pocketCredits,
    reason: "trial_upgrade_conversion",
    idempotencyKey: `trial:convert:pocket:${args.billingAccountId}`,
  });

  if (!ent) {
    await tx.query(
      "update billing_accounts set trial_state = 'free' where id = $1 and trial_state like 'trial_%'",
      [args.billingAccountId],
    );
    return { converted: false, promoLedgerId: null, pocketVoided };
  }
  const converted = await tx.query(
    `update trial_entitlements set state = 'converted', converted_at = $2
       where id = $1 and state <> 'converted' returning id`,
    [ent.id, deps.clock.now()],
  );
  let promoLedgerId: string | null = null;
  if (converted.rows.length > 0) {
    const res = await grant(tx, deps, {
      workspaceId: args.workspaceId,
      billingAccountId: args.billingAccountId,
      bucket: "promo",
      credits: TRIAL.upgradePromoCredits,
      reason: "trial_upgrade_conversion",
      idempotencyKey: `trial:convert:promo:${ent.id}`,
    });
    promoLedgerId = res.ledgerId;
    await tx.query("update trial_entitlements set promo_ledger_id = $2 where id = $1", [ent.id, promoLedgerId]);
  }
  await tx.query(
    "update billing_accounts set trial_state = 'free' where id = $1 and trial_state like 'trial_%'",
    [args.billingAccountId],
  );
  return { converted: converted.rows.length > 0, promoLedgerId, pocketVoided };
}

// ------------------------------------------------------------------ expiry + kill switch

/**
 * Window-end sweep (worker period tick): entitlements whose 14 days lapsed go `expired`, unspent pockets
 * expire with them, and the account drops to `free` (a paid subscription's existence is checked by the
 * caller's effective-tier resolution, so this only stamps the trial machine).
 */
export async function sweepExpiredTrials(
  exec: SqlClient,
  deps: EntryDeps & { runTx: (workspaceId: string, fn: (tx: SqlClient) => Promise<void>) => Promise<void> },
  now: Date,
): Promise<{ expired: number }> {
  const rows = (
    await exec.query(
      `select e.id, e.billing_account_id, w.id as workspace_id
         from trial_entitlements e
         join billing_accounts b on b.id = e.billing_account_id
         join workspaces w on w.billing_account_id = b.id
        where e.state in ('locked','unused') and e.expires_at is not null and e.expires_at < $1
        order by e.expires_at`,
      [now],
    )
  ).rows as { id: string; billing_account_id: string; workspace_id: string }[];
  let expired = 0;
  for (const r of rows) {
    await deps.runTx(r.workspace_id, async (tx) => {
      const flipped = await tx.query(
        "update trial_entitlements set state = 'expired' where id = $1 and state in ('locked','unused') returning id",
        [r.id],
      );
      if (flipped.rows.length === 0) return;
      await expireCredits(tx, deps, {
        workspaceId: r.workspace_id,
        billingAccountId: r.billing_account_id,
        bucket: "trial_pocket",
        credits: TRIAL.pocketCredits,
        reason: "trial_window_expired",
        idempotencyKey: `trial:expire:pocket:${r.id}`,
      });
      await tx.query(
        `update billing_accounts set trial_state = 'free' where id = $1 and trial_state in ('trial_pending','trial_active','trial_used')`,
        [r.billing_account_id],
      );
      expired += 1;
    });
  }
  return { expired };
}

/**
 * The workspace kill switch (REQ-GROWTH-15): mark the account killed, REVOKE every un-consumed
 * entitlement, void the pocket, and audit it. `SqlHoldLedger.hold` reads `trial_killed_at` on the account
 * row under the same lock the hold already takes — the ≤60 s void is enforced on the spend path itself,
 * not on a sweeper's cadence.
 */
export async function killTrial(
  tx: SqlClient,
  deps: EntryDeps,
  args: { actor: string; billingAccountId: string; workspaceId: string; note?: string },
): Promise<{ killed: boolean; voided: number }> {
  const res = await tx.query(
    "update billing_accounts set trial_killed_at = $2, trial_state = 'trial_denied' where id = $1 and trial_killed_at is null returning id",
    [args.billingAccountId, deps.clock.now()],
  );
  if (res.rows.length === 0) return { killed: false, voided: 0 };
  await tx.query(
    `update trial_entitlements set state = 'revoked', revoked_at = $2
       where billing_account_id = $1 and state in ('locked','unused')`,
    [args.billingAccountId, deps.clock.now()],
  );
  const voided = await expireCredits(tx, deps, {
    workspaceId: args.workspaceId,
    billingAccountId: args.billingAccountId,
    bucket: "trial_pocket",
    credits: TRIAL.pocketCredits * 10, // clamp covers whatever remains
    reason: "trial_kill_switch",
    idempotencyKey: `trial:kill:${args.billingAccountId}`,
  });
  await tx.query(
    `insert into admin_actions (id, actor, action, billing_account_id, workspace_id, note, at)
     values ($1,$2,'trial_kill',$3,$4,$5,$6)`,
    [deps.ids("adm"), args.actor, args.billingAccountId, args.workspaceId, args.note ?? null, deps.clock.now()],
  );
  return { killed: true, voided };
}

/** The run-sheet view's entitlement lookup: is this account's trial Review claimable, and its facts. */
export async function trialEntitlementFor(
  tx: SqlClient,
  billingAccountId: string,
): Promise<{ id: string; state: string; wordCap: number; expiresAt: string | null } | undefined> {
  const row = (
    await tx.query(
      `select id, state, word_cap, expires_at from trial_entitlements
         where billing_account_id = $1 order by expires_at desc nulls last limit 1`,
      [billingAccountId],
    )
  ).rows[0] as { id: string; state: string; word_cap: number; expires_at: string | null } | undefined;
  if (!row) return undefined;
  return { id: row.id, state: row.state, wordCap: row.word_cap, expiresAt: row.expires_at };
}

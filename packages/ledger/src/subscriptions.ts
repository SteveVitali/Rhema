// Subscription lifecycle + the period-boundary sweep (P1.16; §14.2/14.6; REQ-BILL-14/16). Stripe Billing
// events land here from the webhook processor (`stripe.ts`); the worker's `billing.period-tick` drives the
// deterministic half: scheduled downgrades at period end, the renewal-failure 14-day grace → Free, the
// 7-day downgrade warning, monthly included grants (idempotent per period — the Stripe arm and the tick
// both try, exactly one wins), and the Free-tier 10-credits/day allowance.

import type { SqlClient } from "@rhema/orchestrator";
import { PLAN_TIERS, planOf, PRICING, type PlanTier, type BillingCycle } from "@rhema/contracts";
import { grant, type EntryDeps } from "./entries.js";
import { expireCredits } from "./expiry.js";

const DAY_MS = 24 * 60 * 60 * 1000;
/** §14.6: a failed renewal keeps the plan for a 14-day Smart-Retries window, then drops to Free. */
export const RENEWAL_GRACE_MS = 14 * DAY_MS;
/** The 7-day downgrade warning fires this far into the grace window. */
export const DOWNGRADE_WARN_MS = 7 * DAY_MS;

export interface SubDeps extends EntryDeps {
  /** Open one tenant-scoped transaction for a workspace. */
  readonly runTx: (workspaceId: string, fn: (tx: SqlClient) => Promise<void>) => Promise<void>;
  /** Enqueue a billing email through the notify queue (`trial_payment` carries a free reason string). */
  readonly notify?: (payload: {
    type: "trial_payment";
    workspaceId: string;
    userId?: string;
    billingAccountId?: string;
    reason: string;
  }) => Promise<void>;
}

function addMonths(d: Date, months: number): Date {
  const c = new Date(d.getTime());
  c.setUTCMonth(c.getUTCMonth() + months);
  return c;
}

/** The account's effective plan tier: the latest non-ended subscription's tier, else 'free'. */
export async function effectivePlanTier(tx: SqlClient, billingAccountId: string): Promise<PlanTier> {
  const row = (
    await tx.query(
      `select tier from subscriptions where billing_account_id = $1 and status in ('active','past_due')
         order by created_at desc limit 1`,
      [billingAccountId],
    )
  ).rows[0] as { tier: string } | undefined;
  const tier = row?.tier;
  return (PLAN_TIERS as readonly string[]).includes(tier ?? "") ? (tier as PlanTier) : "free";
}

/**
 * Grant this period's included credits with the §14.2 rollover rule: unused included rolls one month, and
 * the included BALANCE is capped at 2× the monthly amount — the excess expires as `rollover_cap`. The
 * grant itself expires at period_end + 1 month (the rollover window). Idempotent per (subscription,
 * period start).
 */
export async function grantIncludedCredits(
  tx: SqlClient,
  deps: EntryDeps,
  args: {
    workspaceId: string;
    billingAccountId: string;
    subscriptionId: string;
    tier: PlanTier;
    periodStart: Date;
    periodEnd: Date;
  },
): Promise<{ granted: number; rolledOff: number }> {
  const monthly = planOf(args.tier).includedCreditsMonthly;
  if (monthly <= 0) return { granted: 0, rolledOff: 0 };
  const res = await grant(tx, deps, {
    workspaceId: args.workspaceId,
    billingAccountId: args.billingAccountId,
    bucket: "included",
    credits: monthly,
    reason: `included:${args.tier}`,
    expiresAt: addMonths(args.periodEnd, PRICING.rollover.months),
    // the tier is part of the key: a mid-period upgrade re-keys the grant so the new plan's included
    // credits land immediately, while a replayed renewal for the SAME (period, tier) still dedupes.
    idempotencyKey: `sub:${args.subscriptionId}:included:${args.tier}:${args.periodStart.toISOString()}`,
  });
  // clamp the included balance to 2× monthly — whatever didn't fit rolls off.
  const balance = Number(
    (
      (
        await tx.query(
          "select available::int as a from credit_balances where billing_account_id = $1 and bucket = 'included'",
          [args.billingAccountId],
        )
      ).rows[0] as { a: number } | undefined
    )?.a ?? 0,
  );
  const cap = monthly * PRICING.rollover.balanceCapMultiple;
  const excess = Math.max(0, balance - cap);
  let rolledOff = 0;
  if (excess > 0) {
    rolledOff = await expireCredits(tx, deps, {
      workspaceId: args.workspaceId,
      billingAccountId: args.billingAccountId,
      bucket: "included",
      credits: excess,
      reason: "rollover_cap",
      idempotencyKey: `sub:${args.subscriptionId}:rollover_cap:${args.periodStart.toISOString()}`,
    });
  }
  return { granted: res.applied ? monthly : 0, rolledOff };
}

/**
 * `checkout.session.completed` (kind=subscribe) or `customer.subscription.created`: upsert the
 * subscription row, record the Stripe ids, grant the first period's included credits. Returns the row id.
 */
export async function activateSubscription(
  tx: SqlClient,
  deps: EntryDeps,
  args: {
    workspaceId: string;
    billingAccountId: string;
    tier: PlanTier;
    cycle: BillingCycle;
    stripeSubscriptionId: string;
    stripeCustomerId?: string;
    periodStart: Date;
    periodEnd: Date;
    idempotencyKey: string;
  },
): Promise<{ subscriptionId: string; applied: boolean }> {
  // idempotent on the Stripe subscription id — a redelivered event updates in place.
  const existing = (
    await tx.query("select id from subscriptions where stripe_subscription_id = $1", [args.stripeSubscriptionId])
  ).rows[0] as { id: string } | undefined;
  let id = existing?.id;
  if (!id) {
    id = deps.ids("sub");
    await tx.query(
      `insert into subscriptions
         (id, billing_account_id, tier, stripe_subscription_id, stripe_customer_id, billing_cycle,
          period_start, period_end, included_credits, concurrency, status, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11,$11)`,
      [
        id,
        args.billingAccountId,
        args.tier,
        args.stripeSubscriptionId,
        args.stripeCustomerId ?? null,
        args.cycle,
        args.periodStart,
        args.periodEnd,
        planOf(args.tier).includedCreditsMonthly,
        planOf(args.tier).concurrency,
        deps.clock.now(),
      ],
    );
  } else {
    await tx.query(
      `update subscriptions set tier=$3, billing_cycle=$4, period_start=$5, period_end=$6,
          included_credits=$7, concurrency=$8, status='active', renewal_failed_at=null, updated_at=$9
         where id=$1 and billing_account_id=$2`,
      [
        id,
        args.billingAccountId,
        args.tier,
        args.cycle,
        args.periodStart,
        args.periodEnd,
        planOf(args.tier).includedCreditsMonthly,
        planOf(args.tier).concurrency,
        deps.clock.now(),
      ],
    );
  }
  if (args.stripeCustomerId) {
    await tx.query(
      "update billing_accounts set stripe_customer_id = $2 where id = $1 and stripe_customer_id is null",
      [args.billingAccountId, args.stripeCustomerId],
    );
  }
  const g = await grantIncludedCredits(tx, deps, {
    workspaceId: args.workspaceId,
    billingAccountId: args.billingAccountId,
    subscriptionId: id,
    tier: args.tier,
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
  });
  return { subscriptionId: id, applied: g.granted > 0 || !existing };
}

/** `invoice.paid` on a renewal — new period: refresh bounds, grant included, clear the failure window. */
export async function applyRenewalPaid(
  tx: SqlClient,
  deps: EntryDeps,
  args: {
    stripeSubscriptionId: string;
    workspaceId: string;
    periodStart: Date;
    periodEnd: Date;
  },
): Promise<{ applied: boolean }> {
  const sub = (
    await tx.query(
      "select id, billing_account_id, tier from subscriptions where stripe_subscription_id = $1",
      [args.stripeSubscriptionId],
    )
  ).rows[0] as { id: string; billing_account_id: string; tier: string } | undefined;
  if (!sub) return { applied: false };
  await tx.query(
    `update subscriptions set period_start=$3, period_end=$4, status='active', renewal_failed_at=null,
        downgrade_warned_at=null, updated_at=$5 where id=$1 and billing_account_id=$2`,
    [sub.id, sub.billing_account_id, args.periodStart, args.periodEnd, deps.clock.now()],
  );
  await grantIncludedCredits(tx, deps, {
    workspaceId: args.workspaceId,
    billingAccountId: sub.billing_account_id,
    subscriptionId: sub.id,
    tier: sub.tier as PlanTier,
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
  });
  return { applied: true };
}

/** `invoice.payment_failed` — §14.6: banner + Smart Retries window; no new grant; the balance still spends. */
export async function applyRenewalFailed(
  tx: SqlClient,
  deps: SubDeps,
  args: { stripeSubscriptionId: string; workspaceId: string; userId?: string },
): Promise<{ applied: boolean }> {
  const res = await tx.query(
    `update subscriptions set status='past_due', renewal_failed_at=coalesce(renewal_failed_at,$2), updated_at=$2
       where stripe_subscription_id=$1 returning billing_account_id, tier`,
    [args.stripeSubscriptionId, deps.clock.now()],
  );
  const row = res.rows[0] as { billing_account_id: string; tier: string } | undefined;
  if (!row) return { applied: false };
  await deps.notify?.({
    type: "trial_payment",
    workspaceId: args.workspaceId,
    ...(args.userId !== undefined ? { userId: args.userId } : {}),
    billingAccountId: row.billing_account_id,
    reason: `Your ${planOf(row.tier).display} payment didn't go through — we'll keep retrying for 14 days, and your plan stays active meanwhile`,
  });
  return { applied: true };
}

/** `customer.subscription.updated` — sync tier/cycle/cancel flag/period from Stripe. */
export async function syncSubscription(
  tx: SqlClient,
  deps: EntryDeps,
  args: {
    stripeSubscriptionId: string;
    tier?: PlanTier;
    cycle?: BillingCycle;
    cancelAtPeriodEnd?: boolean;
    periodStart?: Date;
    periodEnd?: Date;
  },
): Promise<{ applied: boolean }> {
  const res = await tx.query(
    `update subscriptions set
        tier = coalesce($2, tier),
        billing_cycle = coalesce($3, billing_cycle),
        cancel_at_period_end = coalesce($4, cancel_at_period_end),
        period_start = coalesce($5, period_start),
        period_end = coalesce($6, period_end),
        included_credits = coalesce($7, included_credits),
        concurrency = coalesce($8, concurrency),
        updated_at = $9
       where stripe_subscription_id = $1 returning id`,
    [
      args.stripeSubscriptionId,
      args.tier ?? null,
      args.cycle ?? null,
      args.cancelAtPeriodEnd ?? null,
      args.periodStart ?? null,
      args.periodEnd ?? null,
      args.tier ? planOf(args.tier).includedCreditsMonthly : null,
      args.tier ? planOf(args.tier).concurrency : null,
      deps.clock.now(),
    ],
  );
  return { applied: res.rows.length > 0 };
}

/** `customer.subscription.deleted` — the plan ends now (cancel completed or Stripe-side termination). */
export async function endSubscription(
  tx: SqlClient,
  deps: EntryDeps,
  args: { stripeSubscriptionId: string },
): Promise<{ applied: boolean }> {
  const res = await tx.query(
    `update subscriptions set status='ended', updated_at=$2 where stripe_subscription_id=$1 and status <> 'ended'
       returning id`,
    [args.stripeSubscriptionId, deps.clock.now()],
  );
  return { applied: res.rows.length > 0 };
}

/**
 * A plan change on an ACTIVE subscription (the Portal / change-plan arm, §14.6): an upgrade applies now —
 * new tier + a fresh included grant for the period. A downgrade is SCHEDULED (`scheduled_tier`) and the
 * period tick applies it at period end — the user keeps what they paid for.
 */
export async function changePlan(
  tx: SqlClient,
  deps: EntryDeps,
  args: {
    subscriptionId: string;
    billingAccountId: string;
    workspaceId: string;
    newTier: PlanTier;
    cycle?: BillingCycle;
  },
): Promise<{ applied: "now" | "scheduled" }> {
  const sub = (
    await tx.query(
      "select id, tier, period_start, period_end, status from subscriptions where id = $1 and billing_account_id = $2 for update",
      [args.subscriptionId, args.billingAccountId],
    )
  ).rows[0] as
    | { id: string; tier: string; period_start: string; period_end: string; status: string }
    | undefined;
  if (!sub) throw new Error(`subscription ${args.subscriptionId} not found`);
  const rank = (t: string) => PLAN_TIERS.indexOf(t as PlanTier);
  if (rank(args.newTier) >= rank(sub.tier)) {
    // upgrade (or lateral) — applies immediately; the period's included grant is the new plan's.
    await tx.query(
      `update subscriptions set tier=$2, billing_cycle=coalesce($3, billing_cycle), scheduled_tier=null,
          included_credits=$4, concurrency=$5, updated_at=$6 where id=$1`,
      [
        sub.id,
        args.newTier,
        args.cycle ?? null,
        planOf(args.newTier).includedCreditsMonthly,
        planOf(args.newTier).concurrency,
        deps.clock.now(),
      ],
    );
    await grantIncludedCredits(tx, deps, {
      workspaceId: args.workspaceId,
      billingAccountId: args.billingAccountId,
      subscriptionId: sub.id,
      tier: args.newTier,
      periodStart: new Date(sub.period_start),
      periodEnd: new Date(sub.period_end),
    });
    return { applied: "now" };
  }
  await tx.query("update subscriptions set scheduled_tier=$2, updated_at=$3 where id=$1", [
    sub.id,
    args.newTier,
    deps.clock.now(),
  ]);
  return { applied: "scheduled" };
}

// ------------------------------------------------------------------ the period tick (worker sweep)

export interface PeriodTickResult {
  readonly includedGrants: number;
  readonly downgradesApplied: number;
  readonly pastDueLapsed: number;
  readonly warningsSent: number;
  readonly dailyGrants: number;
}

/**
 * `billing.period-tick` (hourly): walk live subscriptions — grant this period's included credits if the
 * Stripe arm hasn't (idempotent either way), apply scheduled downgrades at period end, fire the 7-day
 * renewal-failure warning, lapse a 14-day-past-due subscription to Free — then grant the Free-tier daily
 * chat allowance to every account with no live subscription.
 */
export async function runBillingPeriodTick(exec: SqlClient, deps: SubDeps, now: Date): Promise<PeriodTickResult> {
  const subs = (
    await exec.query(
      `select s.id, s.billing_account_id, s.tier, s.scheduled_tier, s.status, s.period_start, s.period_end,
              s.renewal_failed_at, s.downgrade_warned_at, s.billing_cycle, w.id as workspace_id, wm.user_id
         from subscriptions s
         join workspaces w on w.billing_account_id = s.billing_account_id
         left join lateral (
           select user_id from workspace_members x where x.workspace_id = w.id
           order by case x.role when 'owner' then 0 else 1 end, x.user_id limit 1
         ) wm on true
        where s.status in ('active','past_due')
        order by s.created_at`,
    )
  ).rows as {
    id: string;
    billing_account_id: string;
    tier: string;
    scheduled_tier: string | null;
    status: string;
    period_start: string;
    period_end: string;
    renewal_failed_at: string | null;
    downgrade_warned_at: string | null;
    billing_cycle: string | null;
    workspace_id: string;
    user_id: string | null;
  }[];

  let includedGrants = 0;
  let downgradesApplied = 0;
  let pastDueLapsed = 0;
  let warningsSent = 0;

  for (const s of subs) {
    await deps.runTx(s.workspace_id, async (tx) => {
      const periodEnd = new Date(s.period_end);
      const periodStart = new Date(s.period_start);
      const tier = s.tier as PlanTier;

      // --- renewal failure: 7-day warning, then lapse to Free at +14d (§14.6) --------------------------
      if (s.status === "past_due" && s.renewal_failed_at) {
        const failedAt = new Date(s.renewal_failed_at);
        if (!s.downgrade_warned_at && now.getTime() >= failedAt.getTime() + DOWNGRADE_WARN_MS) {
          await tx.query("update subscriptions set downgrade_warned_at=$2 where id=$1", [s.id, now]);
          warningsSent += 1;
          await deps.notify?.({
            type: "trial_payment",
            workspaceId: s.workspace_id,
            ...(s.user_id ? { userId: s.user_id } : {}),
            billingAccountId: s.billing_account_id,
            reason: `Your ${planOf(tier).display} payment still hasn't cleared — in 7 days the plan drops to Free unless a retry succeeds`,
          });
        }
        if (now.getTime() >= failedAt.getTime() + RENEWAL_GRACE_MS) {
          await tx.query("update subscriptions set status='ended', updated_at=$2 where id=$1", [s.id, now]);
          pastDueLapsed += 1;
          await deps.notify?.({
            type: "trial_payment",
            workspaceId: s.workspace_id,
            ...(s.user_id ? { userId: s.user_id } : {}),
            billingAccountId: s.billing_account_id,
            reason: `Your ${planOf(tier).display} plan has ended after 14 days of failed payment retries — you're on Free now (10 credits/day for chat)`,
          });
          return; // nothing else this period
        }
      }

      // --- period boundary: apply a scheduled downgrade, then grant the new period's included -----------
      if (now.getTime() >= periodEnd.getTime()) {
        const newStart = periodEnd;
        const newEnd = addMonths(periodEnd, s.billing_cycle === "annual" ? 12 : 1);
        const effectiveTier = s.scheduled_tier ?? tier;
        if (s.scheduled_tier) downgradesApplied += 1;
        await tx.query(
          `update subscriptions set tier=$2, scheduled_tier=null, cancel_at_period_end=false,
              period_start=$3, period_end=$4, included_credits=$5, concurrency=$6, updated_at=$7
             where id=$1`,
          [
            s.id,
            effectiveTier,
            newStart,
            newEnd,
            planOf(effectiveTier as PlanTier).includedCreditsMonthly,
            planOf(effectiveTier as PlanTier).concurrency,
            now,
          ],
        );
        const g = await grantIncludedCredits(tx, deps, {
          workspaceId: s.workspace_id,
          billingAccountId: s.billing_account_id,
          subscriptionId: s.id,
          tier: effectiveTier as PlanTier,
          periodStart: newStart,
          periodEnd: newEnd,
        });
        if (g.granted > 0) includedGrants += 1;
      } else if (s.status === "active") {
        // mid-period: make sure this period's grant exists (the Stripe arm may not have fired — a
        // subscription created before the webhook landed, or the test-mode path).
        const g = await grantIncludedCredits(tx, deps, {
          workspaceId: s.workspace_id,
          billingAccountId: s.billing_account_id,
          subscriptionId: s.id,
          tier,
          periodStart,
          periodEnd,
        });
        if (g.granted > 0) includedGrants += 1;
      }
    });
  }

  // --- Free-tier daily allowance: 10 credits/day, expiring nightly (§14.2 "chat only" is an api gate) ---
  const freeAccounts = (
    await exec.query(
      `select b.id as billing_account_id, w.id as workspace_id
         from billing_accounts b
         join workspaces w on w.billing_account_id = b.id
        where not exists (
          select 1 from subscriptions s
           where s.billing_account_id = b.id and s.status in ('active','past_due'))
        order by b.created_at`,
    )
  ).rows as { billing_account_id: string; workspace_id: string }[];
  let dailyGrants = 0;
  const day = now.toISOString().slice(0, 10);
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  for (const a of freeAccounts) {
    await deps.runTx(a.workspace_id, async (tx) => {
      const res = await grant(tx, deps, {
        workspaceId: a.workspace_id,
        billingAccountId: a.billing_account_id,
        bucket: "daily",
        credits: planOf("free").dailyChatCredits ?? 10,
        reason: "daily_allowance",
        expiresAt: midnight,
        idempotencyKey: `daily:${a.billing_account_id}:${day}`,
      });
      if (res.applied) dailyGrants += 1;
    });
  }

  return { includedGrants, downgradesApplied, pastDueLapsed, warningsSent, dailyGrants };
}

/** Cancel = cancel_at_period_end (the §14.6 rule: a cancellation runs to the paid-through date). */
export async function requestCancellation(
  tx: SqlClient,
  deps: EntryDeps,
  args: { subscriptionId: string; billingAccountId: string },
): Promise<{ applied: boolean }> {
  const res = await tx.query(
    "update subscriptions set cancel_at_period_end=true, updated_at=$3 where id=$1 and billing_account_id=$2 returning id",
    [args.subscriptionId, args.billingAccountId, deps.clock.now()],
  );
  return { applied: res.rows.length > 0 };
}

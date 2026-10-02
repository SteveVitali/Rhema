// Opt-in auto-reload (P1.16; §14.2; REQ-BILL-17). The ONLY unattended charge path on the platform: the
// user explicitly opts in, types the trigger threshold AND a monthly cap; the sweep charges the chosen
// pack off-session only while BOTH hold. Every attempt — charged, skipped, or failed — writes an
// `auto_reload_events` audit row; a failure also mails the user (the retry does not loop silently).

import type { SqlClient } from "@rhema/orchestrator";
import { topUpPack } from "@rhema/contracts";
import type { StripePort } from "./stripe-port.js";
import { grant, type EntryDeps } from "./entries.js";

const TOPUP_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;

export interface AutoReloadDeps extends EntryDeps {
  readonly stripe: StripePort;
  readonly runTx: (workspaceId: string, fn: (tx: SqlClient) => Promise<void>) => Promise<void>;
  readonly notify?: (payload: {
    type: "trial_payment";
    workspaceId: string;
    userId?: string;
    reason: string;
    tag?: string;
    openPath?: string;
  }) => Promise<void>;
}

export interface AutoReloadResult {
  readonly attempted: number;
  readonly charged: number;
  readonly skipped: number;
  readonly failed: number;
}

/**
 * Sweep every opted-in account: when spendable credits fall below the user's threshold, charge the chosen
 * pack off-session (monthly cap enforced against the account's 'YYYY-MM' spend counter) and grant the
 * pack's credits as `topup` (+12 months). A cap block or a card failure is an audited skip/fail — never a
 * silent retry loop.
 */
export async function sweepAutoReload(exec: SqlClient, deps: AutoReloadDeps, now: Date): Promise<AutoReloadResult> {
  const month = now.toISOString().slice(0, 7);
  const accounts = (
    await exec.query(
      `select b.id, b.stripe_customer_id, b.auto_reload_threshold_credits, b.auto_reload_pack_id,
              b.auto_reload_month_cap_cents, b.auto_reload_spend_cents, b.auto_reload_month,
              w.id as workspace_id,
              coalesce((select sum(available)::int from credit_balances cb
                          where cb.billing_account_id = b.id), 0) as spendable,
              (select wm.user_id from workspace_members wm where wm.workspace_id = w.id
                 order by case wm.role when 'owner' then 0 else 1 end, wm.user_id limit 1) as user_id
         from billing_accounts b
         join workspaces w on w.billing_account_id = b.id
        where b.auto_reload_enabled = true
          and b.suspended_at is null`,
    )
  ).rows as {
    id: string;
    stripe_customer_id: string | null;
    auto_reload_threshold_credits: number | null;
    auto_reload_pack_id: string | null;
    auto_reload_month_cap_cents: number | null;
    auto_reload_spend_cents: number;
    auto_reload_month: string | null;
    workspace_id: string;
    spendable: number;
    user_id: string | null;
  }[];

  let attempted = 0;
  let charged = 0;
  let skipped = 0;
  let failed = 0;

  for (const a of accounts) {
    const threshold = a.auto_reload_threshold_credits ?? 0;
    const pack = a.auto_reload_pack_id ? topUpPack(a.auto_reload_pack_id) : undefined;
    if (!pack || threshold <= 0) continue;
    if (Number(a.spendable) >= threshold) continue;
    attempted += 1;

    // roll the monthly counter over when the month flips (the row's month is the counter's scope).
    const spentThisMonth = a.auto_reload_month === month ? Number(a.auto_reload_spend_cents) : 0;
    const cap = a.auto_reload_month_cap_cents ?? 0;
    const packCents = pack.usd * 100;
    if (cap > 0 && spentThisMonth + packCents > cap) {
      await deps.runTx(a.workspace_id, async (tx) => {
        await tx.query(
          `insert into auto_reload_events (id, workspace_id, billing_account_id, at, pack_id, credits, cents, reason, outcome)
             values ($1,$2,$3,$4,$5,$6,$7,'monthly_cap','skipped')`,
          [deps.ids("are"), a.workspace_id, a.id, now, pack.id, pack.credits, packCents],
        );
      });
      skipped += 1;
      continue;
    }
    if (!a.stripe_customer_id) {
      await deps.runTx(a.workspace_id, async (tx) => {
        await tx.query(
          `insert into auto_reload_events (id, workspace_id, billing_account_id, at, pack_id, credits, cents, reason, outcome)
             values ($1,$2,$3,$4,$5,$6,$7,'no_payment_method','skipped')`,
          [deps.ids("are"), a.workspace_id, a.id, now, pack.id, pack.credits, packCents],
        );
      });
      skipped += 1;
      continue;
    }

    const charge = await deps.stripe.chargeOffSession({
      customerId: a.stripe_customer_id,
      amountCents: packCents,
      idempotencyKey: `auto-reload:${a.id}:${month}:${attempted}:${Math.floor(now.getTime() / 60000)}`,
      description: `Rhema auto-reload: ${pack.credits} credits`,
    });

    if (charge.status === "succeeded") {
      await deps.runTx(a.workspace_id, async (tx) => {
        const g = await grant(tx, deps, {
          workspaceId: a.workspace_id,
          billingAccountId: a.id,
          bucket: "topup",
          credits: pack.credits,
          reason: "auto_reload",
          expiresAt: new Date(now.getTime() + TOPUP_EXPIRY_MS),
          stripeRef: charge.paymentIntentId,
          idempotencyKey: `auto-reload:grant:${charge.paymentIntentId}`,
        });
        if (!g.applied) return; // a redelivered charge — the event + counter still land once below
        await tx.query(
          `update billing_accounts set auto_reload_month = $2, auto_reload_spend_cents = $3 where id = $1`,
          [a.id, month, spentThisMonth + packCents],
        );
        await tx.query(
          `insert into auto_reload_events (id, workspace_id, billing_account_id, at, pack_id, credits, cents, stripe_ref, reason, outcome)
             values ($1,$2,$3,$4,$5,$6,$7,$8,'below_threshold','charged')`,
          [deps.ids("are"), a.workspace_id, a.id, now, pack.id, pack.credits, packCents, charge.paymentIntentId],
        );
      });
      charged += 1;
    } else {
      await deps.runTx(a.workspace_id, async (tx) => {
        await tx.query(
          `insert into auto_reload_events (id, workspace_id, billing_account_id, at, pack_id, credits, cents, stripe_ref, reason, outcome)
             values ($1,$2,$3,$4,$5,$6,$7,$8,'payment_failed','failed')`,
          [
            deps.ids("are"),
            a.workspace_id,
            a.id,
            now,
            pack.id,
            pack.credits,
            packCents,
            charge.paymentIntentId || null,
          ],
        );
      });
      failed += 1;
      await deps.notify?.({
        type: "trial_payment",
        workspaceId: a.workspace_id,
        ...(a.user_id ? { userId: a.user_id } : {}),
        reason: "Your auto-reload payment failed — update your card in billing to keep it on",
      });
    }
  }
  return { attempted, charged, skipped, failed };
}

/** Opt in (or update): explicit threshold + pack + monthly cap — all user-typed (REQ-BILL-17). */
export async function configureAutoReload(
  tx: SqlClient,
  args: {
    billingAccountId: string;
    enabled: boolean;
    thresholdCredits?: number;
    packId?: string;
    monthlyCapCents?: number;
  },
): Promise<void> {
  if (args.enabled) {
    if ((args.thresholdCredits ?? 0) <= 0) throw new Error("auto-reload requires a positive credit threshold");
    if (!args.packId || !topUpPack(args.packId)) throw new Error(`unknown top-up pack ${args.packId ?? ""}`);
    if ((args.monthlyCapCents ?? 0) <= 0) throw new Error("auto-reload requires a positive monthly cap");
  }
  await tx.query(
    `update billing_accounts set
        auto_reload_enabled = $2,
        auto_reload_threshold_credits = $3,
        auto_reload_pack_id = $4,
        auto_reload_month_cap_cents = $5
       where id = $1`,
    [
      args.billingAccountId,
      args.enabled,
      args.thresholdCredits ?? null,
      args.packId ?? null,
      args.monthlyCapCents ?? null,
    ],
  );
}

// Stripe boundary — §14.6 (PRB.08 + P1.16). Two real-money channels: the beta's Payment Link
// fallback (a `checkout.session.completed` with no `checkout_sessions` row ⇒ grant `amount_total`
// at the 1¢ peg, unchanged) and the full P1.16 Checkout/Portal/subscription machinery — the same
// event dispatches on our persisted `checkout_sessions` row's kind (subscribe / topup pack /
// auto_reload_setup), `invoice.paid` ⇒ renewal + the included grant, `invoice.payment_failed` ⇒
// past_due + notify, `customer.subscription.created|updated` ⇒ sync (an unknown `created`
// activates whole — the Checkout race arm), `.deleted` ⇒ end.
//
// §14.6 webhook discipline, exactly: verify the `Stripe-Signature` HMAC → insert `stripe_events` keyed on the
// UNIQUE event id → enqueue `stripe.event` → return 200. A replayed event id is a no-op. The queued worker
// then `processStripeEvent`s the stored row: the session/invoice/subscription arms above;
// `charge.dispute.created` ⇒ the REQ-SPEC-24.7 chargeback path; `charge.dispute.closed` won ⇒
// reversal + reinstate + the withheld-delivery re-drive.
//
// The signature check is implemented directly (HMAC-SHA256 over `${t}.${rawBody}`) — no `stripe` SDK dep —
// so tests run against constructed fixtures and no network leg ever fires. The signing secret arrives
// injected (Secret Manager at deploy); it never appears in code, fixtures, or the ledger.

import { createHmac, timingSafeEqual } from "node:crypto";
import { RUN_JOBS, type SqlClient, type Queue } from "@rhema/orchestrator";
import { topUpPack, PLAN_TIERS, type PlanTier, type BillingCycle } from "@rhema/contracts";
import { applyLedgerEntry } from "./entries.js";
import { applyChargeback, applyDisputeWon, type ChargebackDeps } from "./chargeback.js";
import { recordAnalyticsEvent } from "./analytics.js";
import {
  resolveCheckoutSession,
  completeCheckoutSession,
  expireCheckoutSession,
  markCheckoutPendingEmailQueued,
  type CompletedCheckout,
} from "./checkout.js";
import {
  activateSubscription,
  applyRenewalPaid,
  applyRenewalFailed,
  syncSubscription,
  endSubscription,
} from "./subscriptions.js";
import { convertTrialOnUpgrade } from "./trial.js";

/** The pg-boss queue the webhook enqueues after inserting `stripe_events` (§14.6 step 3). */
export const STRIPE_EVENT_JOB = "stripe.event" as const;

/**
 * The canonical `enabled_events` contract for the Stripe webhook endpoint — every type
 * `processStripeEvent` dispatches on (F-R6H11B-2). The endpoint is Stripe-side state (created
 * imperatively in PRB.18 with only `checkout.session.completed` + `charge.dispute.*`, before the
 * P1.16/BILL.3 arms landed — `docs/ops/stripe-webhook-endpoint.md` carries the imperative update
 * the deployed endpoint needs). A new arm in the `processStripeEvent` switch must join this list
 * AND the endpoint's `enabled_events` — the dispatch-completeness test pins the list.
 */
export const STRIPE_WEBHOOK_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.expired",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "charge.dispute.created",
  "charge.dispute.closed",
] as const;
export type StripeWebhookEventType = (typeof STRIPE_WEBHOOK_EVENT_TYPES)[number];
/** The re-drive queue for deliveries a chargeback withheld (the pod's original POST was refused). */
export const RUN_DELIVER_JOB = RUN_JOBS.deliver;

/** Top-up grants expire +12 months (§14.6 "grant(topup, +12 months)"). */
const TOPUP_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;

// ------------------------------------------------------------------------------------------------------
// §14.6 step 1 — signature verification
// ------------------------------------------------------------------------------------------------------

/**
 * Verify a `Stripe-Signature` header against the raw request body. The header is
 * `t=<unix-ts>,v1=<hmac>[,v1=…]`; each `v1` is `HMAC_SHA256(secret, "${t}.${rawBody}")`. The timestamp must
 * be within `toleranceSec` of `now` (default 300 s — Stripe's own tolerance, replay protection).
 */
export function verifyStripeSignature(args: {
  secret: string;
  rawBody: string;
  signatureHeader: string | undefined;
  now: Date;
  toleranceSec?: number;
}): boolean {
  if (!args.signatureHeader) return false;
  const parts = args.signatureHeader.split(",").map((p) => p.trim());
  let t: string | undefined;
  const v1s: string[] = [];
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    const k = p.slice(0, eq);
    const v = p.slice(eq + 1);
    if (k === "t") t = v;
    else if (k === "v1") v1s.push(v);
  }
  if (!t || v1s.length === 0) return false;
  const ts = Number(t);
  if (!Number.isFinite(ts)) return false;
  const tolerance = args.toleranceSec ?? 300;
  if (Math.abs(args.now.getTime() / 1000 - ts) > tolerance) return false;
  const expected = createHmac("sha256", args.secret).update(`${t}.${args.rawBody}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  return v1s.some((sig) => {
    const sigBuf = Buffer.from(sig, "utf8");
    return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
  });
}

/** Test/deploy helper: mint a `Stripe-Signature` header for a body (the fixture side of the check). */
export function signStripePayload(args: { secret: string; rawBody: string; timestampSec: number }): string {
  const v1 = createHmac("sha256", args.secret)
    .update(`${args.timestampSec}.${args.rawBody}`)
    .digest("hex");
  return `t=${args.timestampSec},v1=${v1}`;
}

// ------------------------------------------------------------------------------------------------------
// §14.6 steps 2–3 — durable intake
// ------------------------------------------------------------------------------------------------------

/**
 * Insert the verified event into `stripe_events` keyed on its UNIQUE id. Returns false on a replayed id —
 * the caller still answers 200 but enqueues nothing (the original enqueue already covers processing).
 */
export async function insertStripeEvent(
  exec: SqlClient,
  args: { id: string; type: string; payload: unknown; receivedAt: Date },
): Promise<boolean> {
  const res = await exec.query(
    "insert into stripe_events (id, type, payload, received_at) values ($1,$2,$3,$4) on conflict (id) do nothing returning id",
    [args.id, args.type, JSON.stringify(args.payload), args.receivedAt],
  );
  return res.rows.length > 0;
}

// ------------------------------------------------------------------------------------------------------
// §14.6 processing — the queued worker's half
// ------------------------------------------------------------------------------------------------------

export interface StripeEventDeps extends ChargebackDeps {
  readonly queue: Queue;
  /** billing emails through the notify queue (P1.16 — the renewal-failure banner etc.).
   *  BILL.3: `tag` keys the delivery claim (`checkout:<sessionId>` ⇒ exactly-once per session);
   *  `openPath` overrides the mail's in-app href/open URL (an in-app path, never external). */
  readonly notify?: (payload: {
    type: "trial_payment";
    workspaceId: string;
    userId?: string;
    billingAccountId?: string;
    reason: string;
    tag?: string;
    openPath?: string;
  }) => Promise<void>;
}

export type StripeEventOutcome =
  | { readonly kind: "topup_granted"; readonly ledgerId: string; readonly credits: number; readonly billingAccountId: string; readonly applied: boolean }
  | { readonly kind: "subscription_activated"; readonly billingAccountId: string; readonly subscriptionId: string; readonly converted: boolean }
  | { readonly kind: "auto_reload_setup"; readonly billingAccountId: string }
  | { readonly kind: "renewal_paid"; readonly billingAccountId: string }
  | { readonly kind: "renewal_failed"; readonly billingAccountId: string }
  | { readonly kind: "subscription_synced"; readonly billingAccountId: string | null }
  | { readonly kind: "subscription_ended"; readonly billingAccountId: string | null }
  | { readonly kind: "chargeback"; readonly billingAccountId: string; readonly cancelled: readonly string[]; readonly withheld: readonly string[]; readonly clawed: number; readonly debt: number }
  | { readonly kind: "dispute_won"; readonly billingAccountId: string; readonly restored: number; readonly redeliver: readonly string[] }
  | { readonly kind: "ignored" }
  | { readonly kind: "unresolved"; readonly reason: string };

/** The Stripe event-object shapes this processor reads (structural — no SDK). */
interface CheckoutSession {
  id?: string;
  amount_total?: number;
  payment_intent?: string;
  client_reference_id?: string;
  /** subscription-mode Checkout: the created Stripe subscription id. */
  subscription?: string;
  customer?: string;
  metadata?: {
    billing_account_id?: string;
    workspace_id?: string;
    checkout_session_id?: string;
    kind?: string;
    plan?: string;
    cycle?: string;
    pack_id?: string;
  };
}
interface SubscriptionObject {
  id?: string;
  customer?: string;
  status?: string;
  cancel_at_period_end?: boolean;
  current_period_start?: number; // unix seconds
  current_period_end?: number;
  metadata?: { billing_account_id?: string; plan?: string; cycle?: string };
  items?: { data?: { plan?: { interval?: string } }[] };
}
interface InvoiceObject {
  id?: string;
  subscription?: string;
  customer?: string;
  billing_reason?: string;
  period_start?: number;
  period_end?: number;
  metadata?: { billing_account_id?: string };
}
interface DisputeObject {
  id?: string;
  amount?: number; // cents
  status?: string;
  payment_intent?: string;
  metadata?: { billing_account_id?: string };
}

/**
 * Process one stored `stripe_events` row. Reads the row by id (the webhook already inserted it), dispatches
 * on `type`, marks `processed_at` on success. Unhandled types are acknowledged (`ignored`) — the intake is
 * the dedupe boundary, so reprocessing a stored row is always safe.
 */
export async function processStripeEvent(
  exec: SqlClient,
  deps: StripeEventDeps,
  eventId: string,
): Promise<StripeEventOutcome> {
  const row = (
    await exec.query("select id, type, payload, processed_at from stripe_events where id = $1", [eventId])
  ).rows[0] as { id: string; type: string; payload: unknown; processed_at: string | null } | undefined;
  if (!row) return { kind: "unresolved", reason: `unknown event ${eventId}` };
  const payload = (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as {
    data?: { object?: unknown };
  };
  const object = (payload.data?.object ?? {}) as CheckoutSession & DisputeObject & SubscriptionObject & InvoiceObject;

  let outcome: StripeEventOutcome;
  switch (row.type) {
    case "checkout.session.completed":
      outcome = await processCheckoutCompleted(exec, deps, object);
      break;
    case "checkout.session.expired":
      outcome = await processCheckoutExpired(exec, deps, object);
      break;
    case "invoice.paid":
      outcome = await processInvoicePaid(exec, deps, object);
      break;
    case "invoice.payment_failed":
      outcome = await processInvoiceFailed(exec, deps, object);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      outcome = await processSubscriptionSync(exec, deps, object);
      break;
    case "customer.subscription.deleted":
      outcome = await processSubscriptionDeleted(exec, deps, object);
      break;
    case "charge.dispute.created": {
      const billingAccountId = await resolveDisputeAccount(exec, object);
      if (!billingAccountId) {
        outcome = { kind: "unresolved", reason: "dispute has no resolvable billing account" };
        break;
      }
      const r = await applyChargeback(exec, deps, {
        billingAccountId,
        disputeId: object.id ?? eventId,
        credits: Math.max(0, Math.trunc(object.amount ?? 0)),
      });
      outcome = {
        kind: "chargeback",
        billingAccountId,
        cancelled: r.cancelled,
        withheld: r.withheld,
        clawed: r.clawed,
        debt: r.debt,
      };
      break;
    }
    case "charge.dispute.closed": {
      if (object.status !== "won") {
        // lost/withdrawn: the suspension + debt stand (the operator settles or the account stays closed).
        outcome = { kind: "ignored" };
        break;
      }
      const billingAccountId = await resolveDisputeAccount(exec, object);
      if (!billingAccountId) {
        outcome = { kind: "unresolved", reason: "dispute has no resolvable billing account" };
        break;
      }
      const r = await applyDisputeWon(exec, deps, { billingAccountId, disputeId: object.id ?? eventId });
      // the withheld runs' deliveries can now complete — re-drive each stashed payload (run.deliver).
      for (const runId of r.withheldRuns) {
        const ws = (
          await exec.query("select workspace_id from runs where id = $1", [runId])
        ).rows[0] as { workspace_id: string } | undefined;
        if (ws) {
          await deps.queue.send(RUN_DELIVER_JOB, { runId, workspaceId: ws.workspace_id }, { singletonKey: `deliver:${runId}` });
        }
      }
      outcome = { kind: "dispute_won", billingAccountId, restored: r.restored, redeliver: r.withheldRuns };
      break;
    }
    default:
      outcome = { kind: "ignored" };
  }

  if (outcome.kind !== "unresolved") {
    await exec.query("update stripe_events set processed_at = $2 where id = $1", [eventId, deps.clock.now()]);
  }
  return outcome;
}

// ---- P1.16: Checkout arms (§14.2/14.6; REQ-BILL-14/16/17) ----------------------------------------------

function unixToDate(s: number | undefined, fallback: Date): Date {
  return s ? new Date(s * 1000) : fallback;
}

function planFrom(v: string | undefined): PlanTier | null {
  return v && (PLAN_TIERS as readonly string[]).includes(v) ? (v as PlanTier) : null;
}

/** A workspace for account-scoped writes (the account's first workspace carries account-level effects). */
async function homeWorkspace(exec: SqlClient, billingAccountId: string): Promise<string | null> {
  return (
    (
      await exec.query("select id from workspaces where billing_account_id = $1 order by created_at, id limit 1", [
        billingAccountId,
      ])
    ).rows[0] as { id: string } | undefined
  )?.id ?? null;
}

/** Resolve the account a Stripe object belongs to: metadata → customer id → client_reference_id. */
async function accountFor(
  exec: SqlClient,
  obj: { metadata?: { billing_account_id?: string }; customer?: string; client_reference_id?: string },
): Promise<string | null> {
  if (obj.metadata?.billing_account_id) return obj.metadata.billing_account_id;
  if (obj.client_reference_id) return obj.client_reference_id;
  if (obj.customer) {
    const row = (
      await exec.query("select id from billing_accounts where stripe_customer_id = $1", [obj.customer])
    ).rows[0] as { id: string } | undefined;
    if (row) return row.id;
  }
  return null;
}

/**
 * `checkout.session.completed` (§14.6): resolve our `checkout_sessions` row → the kind-specific arm.
 * `topup` grants the PACK's credits (never `amount_total` — packs carry bonus credits); `subscribe`
 * activates the subscription + converts the trial; `auto_reload_setup` enables the saved payment method.
 * A session with no row is the beta Payment-Link path — grant `amount_total` at the peg, unchanged.
 */
async function processCheckoutCompleted(
  exec: SqlClient,
  deps: StripeEventDeps,
  session: CheckoutSession,
): Promise<StripeEventOutcome> {
  if (!session.id) return { kind: "unresolved", reason: "checkout session has no id" };
  const ours = await resolveCheckoutSession(exec, session.metadata?.checkout_session_id ?? session.id);

  if (!ours) {
    // legacy beta Payment Link (no checkout_sessions row) — grant amount_total at the 1¢ peg.
    return processTopUp(exec, deps, session);
  }
  if (ours.state !== "open") {
    // already completed — the webhook replayed; the grant rows' idempotency keys make the arms safe.
    // If the earlier pass crashed AFTER completing the row but BEFORE the pending-mail enqueue, retry
    // that post-commit half here (`pending_email_queued_at` is the durable "a job exists" marker).
    if (ours.state === "completed") await notifyPendingCheckout(deps, ours, ours);
    return { kind: "ignored" };
  }

  if (ours.kind === "topup") {
    const pack = ours.packId ? topUpPack(ours.packId) : undefined;
    if (!pack) return { kind: "unresolved", reason: `checkout session ${ours.id} has no resolvable pack` };
    let ledgerId = "";
    let applied = false;
    let completed: CompletedCheckout | null = null;
    await deps.runTx(ours.workspaceId, async (tx) => {
      const res = await applyLedgerEntry(tx, deps, {
        workspaceId: ours.workspaceId,
        billingAccountId: ours.billingAccountId,
        kind: "grant",
        credits: pack.credits,
        bucket: "topup",
        source: "stripe",
        reason: `topup:${pack.id}`,
        expiresAt: new Date(deps.clock.now().getTime() + TOPUP_EXPIRY_MS),
        stripeRef: session.payment_intent ?? session.id ?? ours.id,
        idempotencyKey: `stripe:checkout:${session.id}`,
      });
      ledgerId = res.ledgerId;
      applied = res.applied;
      // BILL.3 — persist the Customer a payment-mode session minted (`customer_creation=always`) so the
      // account reaches the Portal after its first top-up. Same `is null` guard as the auto-reload arm.
      if (session.customer) {
        await tx.query(
          "update billing_accounts set stripe_customer_id = $2 where id = $1 and stripe_customer_id is null",
          [ours.billingAccountId, session.customer],
        );
      }
      completed = await completeCheckoutSession(tx, ours.id, deps.clock.now());
      if (applied) {
        const member = (
          await tx.query(
            "select user_id from workspace_members where workspace_id = $1 order by case role when 'owner' then 0 else 1 end, user_id limit 1",
            [ours.workspaceId],
          )
        ).rows[0] as { user_id: string } | undefined;
        if (member) {
          await recordAnalyticsEvent(tx, deps, {
            userId: member.user_id,
            workspaceId: ours.workspaceId,
            event: "topup.purchased",
            props: {},
          });
          await recordAnalyticsEvent(tx, deps, {
            userId: member.user_id,
            workspaceId: ours.workspaceId,
            event: "wtp.recorded",
            props: { source: "purchase", amount: pack.usd },
          });
        }
      }
    });
    await notifyPendingCheckout(deps, ours, completed);
    return { kind: "topup_granted", ledgerId, credits: pack.credits, billingAccountId: ours.billingAccountId, applied };
  }

  if (ours.kind === "subscribe") {
    const tier = planFrom(ours.plan ?? session.metadata?.plan);
    const cycle: BillingCycle = ours.cycle === "annual" || session.metadata?.cycle === "annual" ? "annual" : "monthly";
    if (!tier || tier === "free" || !session.subscription) {
      return { kind: "unresolved", reason: `subscribe session ${ours.id} lacks plan/subscription` };
    }
    // `customer.subscription.created` often lands first — the row it wrote carries the canonical
    // Stripe period. Reuse it instead of clock-now so the activation grant keys on the same period
    // the invoice/subscription arms use (STB.4: a drifted clock-now period double-granted the first
    // period) and the stored bounds stay Stripe-synced.
    const prior = (
      await exec.query(
        "select period_start, period_end from subscriptions where stripe_subscription_id = $1",
        [session.subscription],
      )
    ).rows[0] as { period_start: string; period_end: string } | undefined;
    const periodStart = prior ? new Date(prior.period_start) : deps.clock.now();
    const periodEnd = prior ? new Date(prior.period_end) : new Date(periodStart.getTime());
    if (!prior) periodEnd.setUTCMonth(periodEnd.getUTCMonth() + (cycle === "annual" ? 12 : 1));
    let subscriptionId = "";
    let converted = false;
    let completed: CompletedCheckout | null = null;
    await deps.runTx(ours.workspaceId, async (tx) => {
      const act = await activateSubscription(tx, deps, {
        workspaceId: ours.workspaceId,
        billingAccountId: ours.billingAccountId,
        tier,
        cycle,
        stripeSubscriptionId: session.subscription!,
        ...(session.customer ? { stripeCustomerId: session.customer } : {}),
        periodStart,
        periodEnd,
        idempotencyKey: `stripe:sub:${session.subscription}`,
      });
      subscriptionId = act.subscriptionId;
      // §14.3: inside the trial window, upgrade converts the unused entitlement + pocket to 800 promo.
      const conv = await convertTrialOnUpgrade(tx, deps, {
        billingAccountId: ours.billingAccountId,
        workspaceId: ours.workspaceId,
      });
      converted = conv.converted;
      completed = await completeCheckoutSession(tx, ours.id, deps.clock.now());
    });
    await notifyPendingCheckout(deps, ours, completed);
    return {
      kind: "subscription_activated",
      billingAccountId: ours.billingAccountId,
      subscriptionId,
      converted,
    };
  }

  // auto_reload_setup — the card is on file; the account's opt-in settings (already user-typed) take effect.
  let completed: CompletedCheckout | null = null;
  await deps.runTx(ours.workspaceId, async (tx) => {
    if (session.customer) {
      await tx.query(
        "update billing_accounts set stripe_customer_id = $2 where id = $1 and stripe_customer_id is null",
        [ours.billingAccountId, session.customer],
      );
    }
    completed = await completeCheckoutSession(tx, ours.id, deps.clock.now());
  });
  await notifyPendingCheckout(deps, ours, completed);
  return { kind: "auto_reload_setup", billingAccountId: ours.billingAccountId };
}

/**
 * `checkout.session.expired` (BILL.3; §14.6's expired row): Stripe abandons a session after ~24 h
 * unpaid — mark ours `expired` so the return poll renders the honest copy instead of auto-refreshing
 * a state that can never change. Idempotent: only an `open` row transitions.
 */
async function processCheckoutExpired(
  exec: SqlClient,
  deps: StripeEventDeps,
  session: CheckoutSession,
): Promise<StripeEventOutcome> {
  if (!session.id) return { kind: "unresolved", reason: "checkout session has no id" };
  const ours = await resolveCheckoutSession(exec, session.metadata?.checkout_session_id ?? session.id);
  if (!ours) return { kind: "ignored" }; // a Payment-Link session carries no row — nothing to expire
  if (ours.state !== "open") return { kind: "ignored" };
  await deps.runTx(ours.workspaceId, async (tx) => {
    await expireCheckoutSession(tx, ours.id, deps.clock.now());
  });
  return { kind: "ignored" };
}

/**
 * BILL.3 (REQ-BILL-16; ADR-029) — the pending-checkout email. `checkout.session.completed` fires it
 * ONLY when:
 *   (a) this event did the open→completed transition (`completed` non-null — a replayed webhook finds
 *       the row already completed and returns null), AND
 *   (b) the user observed the `open` return page (`return_viewed_at` stamped by the tenant-scoped poll,
 *       0048) — a completion that lands BEFORE the first poll never mails (the user never saw "pending"), AND
 *   (c) the pending mail was not already enqueued (`pending_email_queued_at`, 0048) — a redriven Stripe
 *       event can re-execute this function after a crash between enqueue + `stripe_events.processed_at`.
 * The `tag: checkout:<sessionId>` rides to the notification_deliveries dedup key, so a retried/duplicated
 * notify job can never send the same email twice. Post-commit only — a rolled-back grant never mails; the
 * queued marker is stamped only after the enqueue call returns, so a failed enqueue remains retryable.
 */
async function notifyPendingCheckout(
  deps: StripeEventDeps,
  ours: { workspaceId: string; billingAccountId: string },
  completed: CompletedCheckout | null,
): Promise<void> {
  if (
    !deps.notify ||
    !completed ||
    completed.returnViewedAt == null ||
    completed.pendingEmailQueuedAt != null ||
    !completed.userId
  ) {
    return;
  }
  const reason =
    completed.kind === "topup"
      ? "Your top-up landed — the credits are in"
      : completed.kind === "subscribe"
        ? "Your plan is active — the checkout finished"
        : "Your card is on file — auto-reload is set up";
  await deps.notify({
    type: "trial_payment",
    workspaceId: ours.workspaceId,
    userId: completed.userId,
    billingAccountId: ours.billingAccountId,
    reason,
    tag: `checkout:${completed.id}`,
    ...(completed.returnTo ? { openPath: completed.returnTo } : {}),
  });
  await deps.runTx(ours.workspaceId, async (tx) => {
    await markCheckoutPendingEmailQueued(tx, completed.id, deps.clock.now());
  });
}

/** `invoice.paid` — a subscription renewal: new period bounds + this period's included grant. */
async function processInvoicePaid(
  exec: SqlClient,
  deps: StripeEventDeps,
  invoice: InvoiceObject,
): Promise<StripeEventOutcome> {
  if (!invoice.subscription) return { kind: "ignored" };
  const billingAccountId = await accountFor(exec, invoice);
  if (!billingAccountId) return { kind: "unresolved", reason: "invoice has no resolvable billing account" };
  const workspaceId = await homeWorkspace(exec, billingAccountId);
  if (!workspaceId) return { kind: "unresolved", reason: `no workspace for ${billingAccountId}` };
  const start = unixToDate(invoice.period_start, deps.clock.now());
  const end = unixToDate(invoice.period_end, new Date(start.getTime() + 31 * 24 * 60 * 60 * 1000));
  let applied = false;
  await deps.runTx(workspaceId, async (tx) => {
    applied = (
      await applyRenewalPaid(tx, deps, {
        stripeSubscriptionId: invoice.subscription!,
        workspaceId,
        periodStart: start,
        periodEnd: end,
      })
    ).applied;
  });
  return applied ? { kind: "renewal_paid", billingAccountId } : { kind: "ignored" };
}

/** `invoice.payment_failed` — §14.6: past_due + the Smart-Retries window; NO new grant; banner via notify. */
async function processInvoiceFailed(
  exec: SqlClient,
  deps: StripeEventDeps,
  invoice: InvoiceObject,
): Promise<StripeEventOutcome> {
  if (!invoice.subscription) return { kind: "ignored" };
  const billingAccountId = await accountFor(exec, invoice);
  if (!billingAccountId) return { kind: "unresolved", reason: "invoice has no resolvable billing account" };
  const workspaceId = await homeWorkspace(exec, billingAccountId);
  if (!workspaceId) return { kind: "unresolved", reason: `no workspace for ${billingAccountId}` };
  await deps.runTx(workspaceId, async (tx) => {
    await applyRenewalFailed(tx, deps, {
      stripeSubscriptionId: invoice.subscription!,
      workspaceId,
    });
  });
  return { kind: "renewal_failed", billingAccountId };
}

/** `customer.subscription.created|updated` — sync the row (Stripe is the subscription's system of record). */
async function processSubscriptionSync(
  exec: SqlClient,
  deps: StripeEventDeps,
  sub: SubscriptionObject,
): Promise<StripeEventOutcome> {
  if (!sub.id) return { kind: "unresolved", reason: "subscription object has no id" };
  const billingAccountId = await accountFor(exec, sub);
  if (!billingAccountId) return { kind: "unresolved", reason: "subscription has no resolvable account" };
  const workspaceId = await homeWorkspace(exec, billingAccountId);
  if (!workspaceId) return { kind: "unresolved", reason: `no workspace for ${billingAccountId}` };
  const tier = planFrom(sub.metadata?.plan);
  const interval = sub.items?.data?.[0]?.plan?.interval;
  const status = sub.status === "active" || sub.status === "past_due" ? sub.status : undefined;
  let synced = false;
  await deps.runTx(workspaceId, async (tx) => {
    // a `created` event for a subscription we don't know (the Checkout arm raced) — activate it whole.
    const known = (
      await tx.query("select id from subscriptions where stripe_subscription_id = $1", [sub.id])
    ).rows[0];
    if (!known && tier && status === "active") {
      const periodStart = unixToDate(sub.current_period_start, deps.clock.now());
      const periodEnd = unixToDate(
        sub.current_period_end,
        new Date(periodStart.getTime() + (interval === "year" ? 366 : 31) * 24 * 60 * 60 * 1000),
      );
      await activateSubscription(tx, deps, {
        workspaceId,
        billingAccountId,
        tier,
        cycle: interval === "year" ? "annual" : "monthly",
        stripeSubscriptionId: sub.id!,
        ...(sub.customer ? { stripeCustomerId: sub.customer } : {}),
        periodStart,
        periodEnd,
        idempotencyKey: `stripe:sub:${sub.id}`,
      });
      await convertTrialOnUpgrade(tx, deps, { billingAccountId, workspaceId });
      synced = true;
      return;
    }
    synced = (
      await syncSubscription(tx, deps, {
        stripeSubscriptionId: sub.id!,
        ...(tier ? { tier } : {}),
        ...(interval ? { cycle: interval === "year" ? ("annual" as const) : ("monthly" as const) } : {}),
        ...(sub.cancel_at_period_end !== undefined ? { cancelAtPeriodEnd: sub.cancel_at_period_end } : {}),
        ...(sub.current_period_start ? { periodStart: unixToDate(sub.current_period_start, deps.clock.now()) } : {}),
        ...(sub.current_period_end ? { periodEnd: unixToDate(sub.current_period_end, deps.clock.now()) } : {}),
      })
    ).applied;
  });
  return synced ? { kind: "subscription_synced", billingAccountId } : { kind: "ignored" };
}

/** `customer.subscription.deleted` — the plan ends (a cancel ran to term, or Stripe terminated it). */
async function processSubscriptionDeleted(
  exec: SqlClient,
  deps: StripeEventDeps,
  sub: SubscriptionObject,
): Promise<StripeEventOutcome> {
  if (!sub.id) return { kind: "unresolved", reason: "subscription object has no id" };
  const billingAccountId = await accountFor(exec, sub);
  const workspaceId = billingAccountId ? await homeWorkspace(exec, billingAccountId) : null;
  if (workspaceId) {
    await deps.runTx(workspaceId, async (tx) => {
      await endSubscription(tx, deps, { stripeSubscriptionId: sub.id! });
    });
  }
  return { kind: "subscription_ended", billingAccountId };
}

/** A Payment Link purchase → `grant(topup)` + purchase telemetry (§14.6; REQ-BETA-12/15). */
async function processTopUp(
  exec: SqlClient,
  deps: StripeEventDeps,
  session: CheckoutSession,
): Promise<StripeEventOutcome> {
  const billingAccountId = session.client_reference_id ?? session.metadata?.billing_account_id;
  if (!billingAccountId || !session.id) {
    return { kind: "unresolved", reason: "checkout session carries no client_reference_id" };
  }
  const amountCents = Math.max(0, Math.trunc(session.amount_total ?? 0));
  const workspaceId =
    session.metadata?.workspace_id ??
    (
      (await exec.query("select id from workspaces where billing_account_id = $1 order by created_at, id limit 1", [
        billingAccountId,
      ])).rows[0] as { id: string } | undefined
    )?.id;
  if (!workspaceId) return { kind: "unresolved", reason: `no workspace for ${billingAccountId}` };

  let ledgerId = "";
  let applied = false;
  await deps.runTx(workspaceId, async (tx) => {
    const res = await applyLedgerEntry(tx, deps, {
      workspaceId,
      billingAccountId,
      kind: "grant",
      credits: amountCents,
      bucket: "topup",
      source: "stripe",
      reason: "topup",
      expiresAt: new Date(deps.clock.now().getTime() + TOPUP_EXPIRY_MS),
      // the payment intent — the key a later `charge.dispute.*` resolves this account through.
      stripeRef: session.payment_intent ?? session.id,
      idempotencyKey: `stripe:checkout:${session.id}`,
    });
    ledgerId = res.ledgerId;
    applied = res.applied;
    // BILL.3 — a Payment-Link purchase also mints a Stripe Customer; persist it so the account reaches
    // the Portal (the same `is null` guard the checkout arms use).
    if (session.customer) {
      await tx.query(
        "update billing_accounts set stripe_customer_id = $2 where id = $1 and stripe_customer_id is null",
        [billingAccountId, session.customer],
      );
    }
    if (!applied) return;

    // REQ-BETA-12 telemetry: the purchase IS the WTP signal. The envelope needs the workspace's member
    // (beta = personal workspace → its first member is the buyer).
    const member = (
      await tx.query(
        "select user_id from workspace_members where workspace_id = $1 order by case role when 'owner' then 0 else 1 end, user_id limit 1",
        [workspaceId],
      )
    ).rows[0] as { user_id: string } | undefined;
    if (member) {
      await recordAnalyticsEvent(tx, deps, {
        userId: member.user_id,
        workspaceId,
        event: "topup.purchased",
        props: {},
      });
      await recordAnalyticsEvent(tx, deps, {
        userId: member.user_id,
        workspaceId,
        event: "wtp.recorded",
        props: { source: "purchase", amount: amountCents / 100 },
      });
    }
  });
  return { kind: "topup_granted", ledgerId, credits: amountCents, billingAccountId, applied };
}

/** A dispute names a payment intent — resolve its account through the top-up grant's `stripe_ref`
 *  (metadata.billing_account_id is the fallback for an object that carries it). */
async function resolveDisputeAccount(exec: SqlClient, dispute: DisputeObject): Promise<string | null> {
  if (dispute.metadata?.billing_account_id) return dispute.metadata.billing_account_id;
  if (dispute.payment_intent) {
    const row = (
      await exec.query("select billing_account_id from credit_ledger where stripe_ref = $1 and kind = 'grant' limit 1", [
        dispute.payment_intent,
      ])
    ).rows[0] as { billing_account_id: string } | undefined;
    if (row) return row.billing_account_id;
  }
  return null;
}

// PRB.08 billing routes (REQ-BETA-14/15; §14.6): the Stripe webhook — the beta's ONE real-money channel
// (Payment Links) — plus the session-authed billing reads the web shell needs (the spendable balance chip +
// the exhaustion prompt's telemetry write).
//
// §14.6 webhook discipline, in order: verify the Stripe-Signature HMAC over the RAW body → insert the event
// into `stripe_events` keyed on its unique id → enqueue `stripe.event` for the worker → return HTTP 200. A
// replayed event id inserts nothing and enqueues nothing (the original enqueue covers processing) — still
// 200. A bad signature is a 400 BEFORE any row exists.
//
// Secrets: the webhook signing secret arrives injected (Secret Manager at deploy) — never an env var on
// web/collab, never in the repo.

import { Hono } from "hono";
import type { SqlClient, Queue, IdFactory } from "@rhema/orchestrator";
import {
  verifyStripeSignature,
  insertStripeEvent,
  recordAnalyticsEvent,
  STRIPE_EVENT_JOB,
  startCheckout,
  readCheckoutSession,
  markCheckoutSessionReturnViewed,
  changePlan,
  requestCancellation,
  configureAutoReload,
  effectivePlanTier,
  isTestWorkspace,
  StripeRequestError,
  usageLevel1,
  usageLevel2,
  usageLevel4,
  usageCsv,
  usageCsvText,
  type StripePort,
} from "@rhema/ledger";
import {
  PRICING,
  planOf,
  priceCents,
  topUpPack,
  visiblePlansPublication,
  claimsForAudience,
  PLAN_TIERS,
  type PlanTier,
  type PurchaseMode,
} from "@rhema/contracts";
import { surfacePricer } from "@rhema/run-sheet";
import type { Principal } from "./run-routes.js";

export interface BillingApiDeps {
  /** session principal (same seam run-routes uses). */
  principal(c: { req: { header(name: string): string | undefined } }): Principal | null;
  /** tenant-scoped transactions (balance read + analytics writes are tenant-keyed). */
  readonly txRunner: { run<T>(workspaceId: string, fn: (tx: SqlClient) => Promise<T>): Promise<T> };
  /** a system-scoped client for `stripe_events` (a system table — no tenant). Unset ⇒ the webhook 503s. */
  readonly systemExec?: SqlClient;
  readonly queue: Queue;
  readonly clock: { now(): Date };
  readonly ids: IdFactory;
  /** the Stripe webhook signing secret (whsec_…) — Secret Manager at deploy. Unset ⇒ webhook 404s. */
  readonly stripeWebhookSecret?: string;
  /** the beta Payment Link the exhaustion panel links to (deploy config; unset ⇒ panel hides the action). */
  readonly paymentLinkUrl?: string;
  /** P1.16 — the Stripe Billing port (Checkout/Portal/off-session charge). Unset ⇒ checkout 503s. */
  readonly stripe?: StripePort;
  /** P1.16 — the app origin Checkout success/cancel URLs bounce through (deploy config). */
  readonly appBaseUrl?: string;
  /**
   * BILL.3 (ADR-028; REQ-BILL-16) — the purchase switch. `closed` (the default when unset — the dep is
   * fail-closed, not fail-open) ⇒ `/billing/checkout` refuses with `purchase_closed` for every real
   * user; JOURNEY.1-flagged test workspaces (`workspaces.is_test`, read inside the tenant tx) are
   * allowlisted so N9 can exercise the real Stripe pages while purchase stays closed. The Portal is
   * gated with the rest — while closed the switch means NO Stripe call, not just no charge-minting call.
   */
  readonly purchaseMode?: PurchaseMode;
}

/** BILL.3 — a checkout's `returnTo` must be an in-app path; anything else drops to undefined (the
 *  field lands verbatim in the return page's continue link + the pending email's open URL — an
 *  external value would be an open redirect). */
function safeReturnToPath(v: unknown): string | undefined {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : undefined;
}

/**
 * BILL.3 — classify a failed Stripe call into the stable code the web maps to truthful copy:
 * a 4xx from Stripe is OUR request's fault (`stripe_rejected` — "Stripe refused that checkout",
 * logged with the session id); a 5xx or a network throw is `stripe_unavailable`. Anything that isn't
 * a StripeRequestError re-throws (an internal bug stays a 500 — never relabeled as billing trouble).
 */
function stripeFailure(
  kind: "checkout" | "portal",
  err: unknown,
  log: (msg: string) => void,
): { error: string; status: 502 | 503 } {
  if (err instanceof StripeRequestError) {
    const sessionId = (err as StripeRequestError & { checkoutSessionId?: string }).checkoutSessionId;
    log(
      `[api] billing ${kind} refused: status=${err.status} type=${err.stripeType ?? "-"} code=${err.stripeCode ?? "-"}` +
        (sessionId ? ` session=${sessionId}` : ""),
    );
    // a 4xx is our request's shape at fault (rejected, logged); a 5xx from Stripe is THEIR outage.
    return err.rejected ? { error: "stripe_rejected", status: 502 } : { error: "stripe_unavailable", status: 503 };
  }
  // Anything else is an internal/db bug, not Stripe trouble: rethrow so it stays a 500 instead of
  // collapsing into the billing-unavailable class (BILL.3's truthful-failure rule).
  throw err;
}

export function createBillingRoutes(deps: BillingApiDeps): Hono {
  const app = new Hono();

  // ---- §14.6 the webhook ------------------------------------------------------------
  // NOT session-authed — the Stripe-Signature IS the auth. Raw body ONLY (no json() — the HMAC signs bytes).
  app.post("/stripe/webhook", async (c) => {
    const systemExec = deps.systemExec;
    if (!deps.stripeWebhookSecret) return c.json({ error: "stripe webhook not configured" }, 404);
    if (!systemExec) return c.json({ error: "stripe intake is not wired" }, 503);
    const rawBody = await c.req.text();
    const ok = verifyStripeSignature({
      secret: deps.stripeWebhookSecret,
      rawBody,
      signatureHeader: c.req.header("stripe-signature"),
      now: deps.clock.now(),
    });
    if (!ok) return c.json({ error: "bad signature" }, 400);
    let event: { id?: string; type?: string };
    try {
      event = JSON.parse(rawBody) as { id?: string; type?: string };
    } catch {
      return c.json({ error: "invalid payload" }, 400);
    }
    if (!event.id || !event.type) return c.json({ error: "missing event id/type" }, 400);
    const inserted = await insertStripeEvent(systemExec, {
      id: event.id,
      type: event.type,
      payload: event,
      receivedAt: deps.clock.now(),
    });
    // A replayed id is a no-op (nothing inserted, nothing enqueued) — still 200 per §14.6.
    if (inserted) {
      await deps.queue.send(STRIPE_EVENT_JOB, { eventId: event.id }, { singletonKey: `stripe:${event.id}` });
    }
    return c.json({ received: true });
  });

  // ---- the spendable balance + account state the web shell renders --------------------------------------
  app.get("/billing/balance", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const row = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const bal = (
        await tx.query(
          `select coalesce(sum(available),0)::int as spendable,
                  coalesce(sum(held),0)::int as held
             from credit_balances where billing_account_id = $1`,
          [principal.billingAccountId],
        )
      ).rows[0] as { spendable: number; held: number } | undefined;
      const acct = (
        await tx.query(
          "select suspended_at, clawback_debt::int as debt from billing_accounts where id = $1",
          [principal.billingAccountId],
        )
      ).rows[0] as { suspended_at: string | null; debt: number } | undefined;
      // BILL.3 — the purchase switch surfaced to the web (is_test allowlist: a JOURNEY.1 tenant
      // exercises the purchase surfaces while the mode is closed for everyone else).
      const purchase: PurchaseMode =
        deps.purchaseMode === "open" || (await isTestWorkspace(tx, principal.workspaceId)) ? "open" : "closed";
      return {
        spendable: Number(bal?.spendable ?? 0),
        held: Number(bal?.held ?? 0),
        suspended: acct?.suspended_at != null,
        clawbackDebt: Number(acct?.debt ?? 0),
        purchase,
      };
    });
    return c.json({
      spendableCredits: row.spendable,
      /** §14.5 level-0 chip detail: credits held against in-flight runs (the chip's hover line). */
      heldCredits: row.held,
      suspended: row.suspended,
      clawbackDebt: row.clawbackDebt,
      purchase: row.purchase,
      // BILL.3 — a closed switch must not surface the Payment Link at all: a caller who has the URL can
      // otherwise hand Stripe money outside the closed UI (the webhook would still be obliged to grant it).
      ...(row.purchase === "open" && deps.paymentLinkUrl ? { paymentLinkUrl: deps.paymentLinkUrl } : {}),
      // PRB.19 (F32) — the caller's billing account id, so the web's Payment-Link 302 can pin
      // `client_reference_id` and the Stripe-originated checkout joins THIS account (money never lands
      // `unresolved`). Server truth from the authenticated principal — never a request field.
      billingAccountId: principal.billingAccountId,
    });
  });

  // ---- the level-1 usage glance (PRB.12; §14.5): the balance + the account's recent runs' spend — the
  //      usage page's rows. Credits are the user-facing cost unit (P0.11's proxy COGS stays operator-side). --
  app.get("/billing/usage", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const out = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const bal = (
        await tx.query(
          `select coalesce(sum(available),0)::int as spendable,
                  coalesce(sum(held),0)::int as held
             from credit_balances where billing_account_id = $1`,
          [principal.billingAccountId],
        )
      ).rows[0] as { spendable: number; held: number } | undefined;
      // RPT.1 (§15.3) — the seeded Showcase run is a worked example, not usage history: it never lists
      // in the account's run spend (its report still serves under the worked-example label).
      const runs = (
        await tx.query(
          `select r.id, r.project_id, r.workflow, r.state, r.estimate_credits, r.cap_credits, r.spent_credits,
                  r.created_at, r.ended_at
             from runs r
             where r.workspace_id = $1
               and coalesce((select p.showcase from projects p where p.id = r.project_id), false) = false
             order by r.created_at desc limit 50`,
          [principal.workspaceId],
        )
      ).rows as {
        id: string; project_id: string | null; workflow: string; state: string;
        estimate_credits: number; cap_credits: number; spent_credits: number;
        created_at: string; ended_at: string | null;
      }[];
      return {
        spendableCredits: Number(bal?.spendable ?? 0),
        heldCredits: Number(bal?.held ?? 0),
        runs: runs.map((r) => ({
          runId: r.id,
          projectId: r.project_id,
          workflow: r.workflow,
          state: r.state,
          estimateCredits: Number(r.estimate_credits),
          capCredits: Number(r.cap_credits),
          spentCredits: Number(r.spent_credits),
          createdAt: r.created_at,
          endedAt: r.ended_at,
        })),
      };
    });
    return c.json(out);
  });

  // ---- the exhaustion prompt's telemetry write (REQ-BETA-12: credits.exhausted_prompt{action_taken}) -----
  app.post("/billing/exhausted-prompt", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => null)) as { action_taken?: unknown } | null;
    if (typeof body?.action_taken !== "string" || body.action_taken.length === 0) {
      return c.json({ error: "action_taken required" }, 400);
    }
    await deps.txRunner.run(principal.workspaceId, async (tx) => {
      await recordAnalyticsEvent(tx, deps, {
        userId: principal.userId,
        workspaceId: principal.workspaceId,
        event: "credits.exhausted_prompt",
        props: { action_taken: body.action_taken },
      });
    });
    return c.json({ ok: true });
  });

  // ---- P1.06 (§5.6; REQ-BILL-4) — the "don't ask me to confirm runs under N credits" pref. Per-user on
  //      "user".consent_dont_ask_under; the spec caps it at 1,000 credits so the >500-consent wall always
  //      has room to bite above the pref. 0 disables the pref (every run over the base threshold asks). ----
  app.put("/settings/consent", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => null)) as { dontAskUnder?: unknown } | null;
    const n = body?.dontAskUnder;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
      return c.json({ error: "dontAskUnder must be an integer ≥ 0" }, 422);
    }
    const clamped = Math.min(n, 1000); // REQ-BILL-4: the pref is capped at 1,000 credits
    await deps.txRunner.run(principal.workspaceId, async (tx) => {
      await tx.query(`update "user" set consent_dont_ask_under = $2, updated_at = $3 where id = $1`, [
        principal.userId,
        clamped,
        deps.clock.now(),
      ]);
    });
    return c.json({ ok: true, dontAskUnder: clamped });
  });

  // ============================================================================
  // P1.16 — billing, full (§14.2/14.3/14.5/14.6)
  // ============================================================================

  // ---- the plan ladder (REQ-GROWTH-4/7/8): the pricing.json publication the web renders. HOT.1 —
  // `visiblePlansPublication` applies the claims gate server-side: a hidden claim's text transmits as
  // null on the DTO, so no client can render what the config has disabled. -------------------------
  app.get("/billing/plans", async (c) => {
    // ACT.1 — the claims gate resolves per AUDIENCE: the trial claim renders only for workspaces the
    // `trial.audience` flag covers (is_test under `test_tenants`); everyone else's DTO carries the
    // gated fields as null. `isTestWorkspace` fails closed (a read error hides the claim).
    const principal = deps.principal(c);
    const isTest = principal
      ? await deps.txRunner
          .run(principal.workspaceId, (tx) => isTestWorkspace(tx, principal.workspaceId))
          .catch(() => false)
      : false;
    const visible = visiblePlansPublication(claimsForAudience(undefined, isTest), surfacePricer());
    return c.json({
      version: PRICING.version,
      issuedAt: PRICING.issuedAt,
      usdPerCredit: PRICING.usdPerCredit,
      platformRate: PRICING.platformRate,
      annualSavingsPct: PRICING.annualSavingsPct,
      plans: visible.plans,
      trial: visible.trial,
      topUpPacks: PRICING.topUpPacks,
      autoReloadDefaults: PRICING.autoReload,
    });
  });

  // ---- Checkout (REQ-BILL-14): subscribe / top-up / auto-reload setup — returns the hosted URL. --------
  app.post("/billing/checkout", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => null)) as {
      kind?: unknown;
      plan?: unknown;
      cycle?: unknown;
      packId?: unknown;
      returnTo?: unknown;
      email?: unknown;
    } | null;
    const kind = body?.kind;
    const returnTo = safeReturnToPath(body?.returnTo);

    if (kind === "subscribe") {
      const tier = typeof body?.plan === "string" && (PLAN_TIERS as readonly string[]).includes(body.plan)
        ? (body.plan as PlanTier)
        : null;
      const cycle = body?.cycle === "annual" ? "annual" : "monthly";
      if (!tier || tier === "free") return c.json({ error: "plan required (writer|studio|studio_max)" }, 400);
      if (planOf(tier).waitlist) return c.json({ error: "plan_waitlisted" }, 422);
      try {
        const out = await deps.txRunner.run(principal.workspaceId, async (tx) => {
          // BILL.3 — the purchase switch: closed for real users; `is_test` (server-set) allowlists the
          // JOURNEY.1 tenant so N9 can walk the real Checkout while the mode stays closed.
          const test = await isTestWorkspace(tx, principal.workspaceId);
          if (deps.purchaseMode !== "open" && !test) return { error: "purchase_closed" as const };
          if (!deps.stripe || !deps.appBaseUrl) return { error: "stripe_unconfigured" as const };
          const acct = (
            await tx.query("select stripe_customer_id from billing_accounts where id = $1", [
              principal.billingAccountId,
            ])
          ).rows[0] as { stripe_customer_id: string | null } | undefined;
          return startCheckout(tx, { ids: deps.ids, clock: deps.clock, stripe: deps.stripe! }, {
            workspaceId: principal.workspaceId,
            billingAccountId: principal.billingAccountId,
            userId: principal.userId,
            kind: "subscribe",
            plan: tier,
            cycle,
            ...(returnTo ? { returnTo } : {}),
            customerId: acct?.stripe_customer_id ?? null,
            ...(typeof body?.email === "string" ? { customerEmail: body.email } : {}),
            appBaseUrl: deps.appBaseUrl!,
            unitAmountCents: priceCents(tier, cycle),
            planDisplay: planOf(tier).display,
          });
        });
        if ("error" in out) {
          return c.json(out, out.error === "stripe_unconfigured" ? 503 : 403);
        }
        return c.json({ sessionId: out.sessionId, url: out.url });
      } catch (err) {
        const f = stripeFailure("checkout", err, (m) => console.error(m));
        return c.json({ error: f.error }, f.status);
      }
    }

    if (kind === "topup" || kind === "auto_reload_setup") {
      const pack = typeof body?.packId === "string" ? topUpPack(body.packId) : undefined;
      if (!pack) return c.json({ error: "packId required (topup_10|topup_50|topup_200)" }, 400);
      try {
        const out = await deps.txRunner.run(principal.workspaceId, async (tx) => {
          const test = await isTestWorkspace(tx, principal.workspaceId);
          if (deps.purchaseMode !== "open" && !test) return { error: "purchase_closed" as const };
          if (!deps.stripe || !deps.appBaseUrl) return { error: "stripe_unconfigured" as const };
          const acct = (
            await tx.query(
              "select stripe_customer_id, created_at::text, first_month_topup_cents, daily_topup_date::text, daily_topup_cents, trial_state from billing_accounts where id = $1",
              [principal.billingAccountId],
            )
          ).rows[0] as
            | {
                stripe_customer_id: string | null;
                created_at: string;
                first_month_topup_cents: number;
                daily_topup_date: string | null;
                daily_topup_cents: number;
                trial_state: string | null;
              }
            | undefined;
          // §14.2 fraud bounds: top-ups require a paid plan (Free can't buy). The BILL.3 is_test
          // allowlist crosses ONLY the purchase switch — it must not relax a product invariant, so a
          // Free test tenant still gets `topups_require_plan` (its purchase paths are the Payment Link
          // and Choose Writer). Then: the first-month $100 account cap; >$200/day forces 3-D Secure.
          const tier = await effectivePlanTier(tx, principal.billingAccountId);
          if (kind === "topup" && planOf(tier).topUps === false) {
            return { error: "topups_require_plan" as const };
          }
          const firstMonth =
            acct && Date.now() - new Date(acct.created_at).getTime() < 31 * 24 * 60 * 60 * 1000;
          if (firstMonth && Number(acct?.first_month_topup_cents ?? 0) + pack.usd * 100 > PRICING.topUp.firstMonthCapUsd * 100) {
            return { error: "first_month_cap" as const };
          }
          const today = deps.clock.now().toISOString().slice(0, 10);
          const dailyCents = acct?.daily_topup_date === today ? Number(acct.daily_topup_cents) : 0;
          const require3ds = dailyCents + pack.usd * 100 > PRICING.topUp.threeDsDailyThresholdUsd * 100;
          const r = await startCheckout(tx, { ids: deps.ids, clock: deps.clock, stripe: deps.stripe! }, {
            workspaceId: principal.workspaceId,
            billingAccountId: principal.billingAccountId,
            userId: principal.userId,
            kind,
            packId: pack.id,
            ...(returnTo ? { returnTo } : {}),
            customerId: acct?.stripe_customer_id ?? null,
            ...(typeof body?.email === "string" ? { customerEmail: body.email } : {}),
            appBaseUrl: deps.appBaseUrl!,
            packUsd: pack.usd,
            packCredits: pack.credits,
            require3ds,
          });
          // counters the bound reads — updated at session creation so a declined/abandoned Checkout still
          // counts against the attempt (conservative; §14.2's bound is on attempts, not just captures).
          await tx.query(
            `update billing_accounts set
                first_month_topup_cents = first_month_topup_cents + $2,
                daily_topup_date = $3,
                daily_topup_cents = case when daily_topup_date = $3 then daily_topup_cents else 0 end + $2
               where id = $1`,
            [principal.billingAccountId, pack.usd * 100, today],
          );
          return r;
        });
        if ("error" in out) {
          return c.json(
            out,
            out.error === "purchase_closed" ? 403 : out.error === "stripe_unconfigured" ? 503 : 402,
          );
        }
        return c.json({ sessionId: out.sessionId, url: out.url });
      } catch (err) {
        const f = stripeFailure("checkout", err, (m) => console.error(m));
        return c.json({ error: f.error }, f.status);
      }
    }
    return c.json({ error: "kind required (subscribe|topup|auto_reload_setup)" }, 400);
  });

  // ---- the Stripe Portal (plan/card management lives Stripe-side) --------------------------------------
  app.post("/billing/portal", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const access = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      // BILL.3 — the closed switch admits no Stripe call, Portal included. A JOURNEY.1 tenant is the
      // only allowlisted caller while the mode is closed.
      const test = await isTestWorkspace(tx, principal.workspaceId);
      const customerId = (
        (await tx.query("select stripe_customer_id from billing_accounts where id = $1", [
          principal.billingAccountId,
        ])).rows[0] as { stripe_customer_id: string | null } | undefined
      )?.stripe_customer_id;
      return { customerId, allowed: deps.purchaseMode === "open" || test };
    });
    if (!access.allowed) return c.json({ error: "purchase_closed" }, 403);
    // The Portal needs BOTH the port and the absolute app return origin. Check after the purchase
    // gate so a closed account answers `purchase_closed`, not a config detail it cannot act on.
    if (!deps.stripe || !deps.appBaseUrl) return c.json({ error: "stripe_unconfigured" }, 503);
    if (!access.customerId) return c.json({ error: "no_stripe_customer" }, 404);
    const body = (await c.req.json().catch(() => null)) as { returnTo?: unknown } | null;
    // BILL.3 — the portal's return URL is an ABSOLUTE app URL built server-side: the web sends the
    // in-app path it wants back on and the api prefixes the configured origin (a client-supplied
    // absolute URL is never trusted — the redirect would become an open redirect off Stripe).
    const returnPath = safeReturnToPath(body?.returnTo) ?? "/billing";
    try {
      const ref = await deps.stripe.createPortalSession({
        customerId: access.customerId,
        returnUrl: `${deps.appBaseUrl}${returnPath}`,
      });
      return c.json({ url: ref.url });
    } catch (err) {
      const f = stripeFailure("portal", err, (m) => console.error(m));
      return c.json({ error: f.error }, f.status);
    }
  });

  // ---- the subscription read (plan, period, past-due banner flag) --------------------------------------
  app.get("/billing/subscription", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const out = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const sub = (
        await tx.query(
          `select id, tier, billing_cycle, status, period_start, period_end, cancel_at_period_end,
                  scheduled_tier, renewal_failed_at, stripe_subscription_id
             from subscriptions where billing_account_id = $1 and status in ('active','past_due')
             order by created_at desc limit 1`,
          [principal.billingAccountId],
        )
      ).rows[0] as
        | {
            id: string; tier: string; billing_cycle: string | null; status: string;
            period_start: string; period_end: string; cancel_at_period_end: boolean;
            scheduled_tier: string | null; renewal_failed_at: string | null; stripe_subscription_id: string | null;
          }
        | undefined;
      const acct = (
        await tx.query(
          `select trial_state, stripe_customer_id, auto_reload_enabled, auto_reload_threshold_credits,
                  auto_reload_pack_id, auto_reload_month_cap_cents
             from billing_accounts where id = $1`,
          [principal.billingAccountId],
        )
      ).rows[0] as
        | {
            trial_state: string | null; stripe_customer_id: string | null; auto_reload_enabled: boolean;
            auto_reload_threshold_credits: number | null; auto_reload_pack_id: string | null;
            auto_reload_month_cap_cents: number | null;
          }
        | undefined;
      const ent = (
        await tx.query(
          `select id, state, word_cap, expires_at from trial_entitlements
             where billing_account_id = $1 order by expires_at desc nulls last limit 1`,
          [principal.billingAccountId],
        )
      ).rows[0] as { id: string; state: string; word_cap: number; expires_at: string | null } | undefined;
      // BILL.3 — the purchase switch, surfaced for the billing page's paused rendering.
      const purchase: PurchaseMode =
        deps.purchaseMode === "open" || (await isTestWorkspace(tx, principal.workspaceId)) ? "open" : "closed";
      return {
        tier: sub?.tier ?? "free",
        purchase,
        subscription: sub
          ? {
              id: sub.id,
              tier: sub.tier,
              cycle: sub.billing_cycle,
              status: sub.status,
              periodStart: sub.period_start,
              periodEnd: sub.period_end,
              cancelAtPeriodEnd: sub.cancel_at_period_end,
              scheduledTier: sub.scheduled_tier,
              pastDue: sub.status === "past_due",
            }
          : null,
        trial: {
          state: acct?.trial_state ?? null,
          entitlement: ent ? { id: ent.id, state: ent.state, wordCap: ent.word_cap, expiresAt: ent.expires_at } : null,
        },
        autoReload: {
          enabled: acct?.auto_reload_enabled ?? false,
          thresholdCredits: acct?.auto_reload_threshold_credits ?? null,
          packId: acct?.auto_reload_pack_id ?? null,
          monthlyCapUsd: acct?.auto_reload_month_cap_cents != null ? acct.auto_reload_month_cap_cents / 100 : null,
        },
        hasStripeCustomer: acct?.stripe_customer_id != null,
      };
    });
    return c.json(out);
  });

  // ---- cancel = cancel_at_period_end (§14.6: the plan runs to the paid-through date) -------------------
  app.post("/billing/subscription/cancel", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const out = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const sub = (
        await tx.query(
          `select id from subscriptions where billing_account_id = $1 and status in ('active','past_due')
             order by created_at desc limit 1`,
          [principal.billingAccountId],
        )
      ).rows[0] as { id: string } | undefined;
      if (!sub) return { applied: false };
      return requestCancellation(tx, deps, { subscriptionId: sub.id, billingAccountId: principal.billingAccountId });
    });
    return c.json(out);
  });

  // ---- change plan: upgrade applies now; downgrade schedules to period end (§14.6) ---------------------
  app.post("/billing/subscription/change-plan", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => null)) as { tier?: unknown; cycle?: unknown } | null;
    const tier = typeof body?.tier === "string" && (PLAN_TIERS as readonly string[]).includes(body.tier)
      ? (body.tier as PlanTier)
      : null;
    if (!tier || tier === "free") return c.json({ error: "tier required" }, 400);
    if (planOf(tier).waitlist) return c.json({ error: "plan_waitlisted" }, 422);
    const cycle = body?.cycle === "annual" ? "annual" : undefined;
    const out = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const sub = (
        await tx.query(
          `select id from subscriptions where billing_account_id = $1 and status in ('active','past_due')
             order by created_at desc limit 1`,
          [principal.billingAccountId],
        )
      ).rows[0] as { id: string } | undefined;
      if (!sub) return { error: "no_subscription" as const };
      return changePlan(tx, deps, {
        subscriptionId: sub.id,
        billingAccountId: principal.billingAccountId,
        workspaceId: principal.workspaceId,
        newTier: tier,
        ...(cycle ? { cycle } : {}),
      });
    });
    if ("error" in out) return c.json(out, 404);
    return c.json(out);
  });

  // ---- the checkout-return poll (§14.6 webhook lag: ≤30 s, then the email fallback) --------------------
  // BILL.3 — the poll is also the pending-checkout email's precondition: an `open` read stamps
  // `return_viewed_at` (0048), so a completion that lands while the user watched fires exactly one
  // "your payment landed" mail and a completion before any view fires none.
  app.get("/billing/checkout-sessions/:id", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const session = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      // BILL.3 — stamp BEFORE reading: if the webhook's open→completed update wins the row lock, its
      // `returning` clause must see this observed-open marker and fire the promised mail. If completion
      // won first, this update is a no-op and the read below sees the finished state. The workspace
      // predicate keeps a guessed session id from being marked by another tenant.
      await markCheckoutSessionReturnViewed(tx, c.req.param("id"), principal.workspaceId, deps.clock.now());
      const s = await readCheckoutSession(tx, c.req.param("id"));
      // tenant check: a session row is only readable by its own workspace (404, not 403 — never reveal
      // that the id exists).
      if (!s || s.workspaceId !== principal.workspaceId) return null;
      return s;
    });
    if (!session) return c.json({ error: "not_found" }, 404);
    const { workspaceId: _ws, ...dto } = session;
    return c.json(dto);
  });

  // ---- opt-in auto-reload (REQ-BILL-17: threshold + monthly cap are user-typed, always) -----------------
  app.put("/billing/auto-reload", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => null)) as {
      enabled?: unknown; thresholdCredits?: unknown; packId?: unknown; monthlyCapUsd?: unknown;
    } | null;
    const enabled = body?.enabled === true;
    try {
      const out = await deps.txRunner.run(principal.workspaceId, async (tx) => {
        // BILL.3 — opting IN schedules a future unattended charge, so it is a purchase-path write and
        // obeys the same closed switch / JOURNEY.1 allowlist as the hosted Checkout setup leg. Opting
        // OUT (`enabled:false`) is a safety-off, not a purchase — it is never gated, so a closed
        // switch can never trap a configured account into charges it cannot cancel.
        const test = await isTestWorkspace(tx, principal.workspaceId);
        if (enabled && deps.purchaseMode !== "open" && !test) {
          return { error: "purchase_closed" as const };
        }
        await configureAutoReload(tx, {
          billingAccountId: principal.billingAccountId,
          enabled,
          ...(typeof body?.thresholdCredits === "number" ? { thresholdCredits: body.thresholdCredits } : {}),
          ...(typeof body?.packId === "string" ? { packId: body.packId } : {}),
          ...(typeof body?.monthlyCapUsd === "number" ? { monthlyCapCents: Math.round(body.monthlyCapUsd * 100) } : {}),
        });
        return { ok: true as const };
      });
      if ("error" in out) return c.json(out, 403);
    } catch (e) {
      return c.json({ error: "invalid_auto_reload", detail: (e as Error).message }, 422);
    }
    return c.json({ ok: true });
  });

  // ---- the Team waitlist (§14.2: listed, mechanics out of scope — the row IS the product) --------------
  app.post("/billing/team-waitlist", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => null)) as { email?: unknown; seats?: unknown; note?: unknown } | null;
    const email = typeof body?.email === "string" && body.email.includes("@") ? body.email : null;
    if (!email) return c.json({ error: "email required" }, 400);
    await deps.txRunner.run(principal.workspaceId, async (tx) => {
      await tx.query(
        "insert into team_waitlist (id, email, seats, workspace_id, note) values ($1,$2,$3,$4,$5)",
        [deps.ids("wl"), email, typeof body?.seats === "number" ? body.seats : null, principal.workspaceId, typeof body?.note === "string" ? body.note : null],
      );
    });
    return c.json({ ok: true }, 201);
  });

  // ---- §14.5 usage dashboards: L1 account, L2 project, L4 drill-down (Advanced), L1–2 CSV --------------
  app.get("/billing/usage/account", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const out = await deps.txRunner.run(principal.workspaceId, (tx) =>
      usageLevel1(tx, principal.billingAccountId, principal.workspaceId, deps.clock.now()),
    );
    return c.json(out);
  });

  app.get("/billing/usage/project/:id", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const out = await deps.txRunner.run(principal.workspaceId, (tx) =>
      usageLevel2(tx, principal.workspaceId, c.req.param("id")),
    );
    return c.json(out);
  });

  // Level 4 — the phase×seat×model drill-down behind the run report's Advanced disclosure (REQ-DATA-42).
  app.get("/billing/usage/run/:id/advanced", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const rows = await deps.txRunner.run(principal.workspaceId, (tx) =>
      usageLevel4(tx, principal.workspaceId, c.req.param("id")),
    );
    return c.json({ rows });
  });

  app.get("/billing/usage.csv", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const rows = await deps.txRunner.run(principal.workspaceId, (tx) =>
      usageCsv(tx, principal.billingAccountId, principal.workspaceId),
    );
    c.header("content-type", "text/csv; charset=utf-8");
    c.header("content-disposition", `attachment; filename="rhema-usage.csv"`);
    return c.body(usageCsvText(rows));
  });

  return app;
}

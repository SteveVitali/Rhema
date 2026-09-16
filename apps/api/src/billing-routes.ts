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
} from "@rhema/ledger";
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
          "select coalesce(sum(available),0)::int as spendable from credit_balances where billing_account_id = $1",
          [principal.billingAccountId],
        )
      ).rows[0] as { spendable: number } | undefined;
      const acct = (
        await tx.query(
          "select suspended_at, clawback_debt::int as debt from billing_accounts where id = $1",
          [principal.billingAccountId],
        )
      ).rows[0] as { suspended_at: string | null; debt: number } | undefined;
      return { spendable: Number(bal?.spendable ?? 0), suspended: acct?.suspended_at != null, clawbackDebt: Number(acct?.debt ?? 0) };
    });
    return c.json({
      spendableCredits: row.spendable,
      suspended: row.suspended,
      clawbackDebt: row.clawbackDebt,
      ...(deps.paymentLinkUrl ? { paymentLinkUrl: deps.paymentLinkUrl } : {}),
    });
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

  return app;
}

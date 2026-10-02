// Checkout session lifecycle (P1.16; §14.2; REQ-BILL-14). The api's `/api/billing/checkout` writes a
// `checkout_sessions` row FIRST (the return-to-context + the grant discriminator), then asks the StripePort
// for a hosted URL carrying that row id in metadata. `checkout.session.completed` resolves the row → the
// kind-specific grant arm. "Return to context" is a first-class column — the success redirect lands on the
// surface the user came from (the exhausted run sheet, the pricing card), not a generic page.

import type { SqlClient, Clock, IdFactory } from "@rhema/orchestrator";
import type { StripePort } from "./stripe-port.js";

export type CheckoutKind = "subscribe" | "topup" | "auto_reload_setup";

export interface CheckoutDeps {
  readonly ids: IdFactory;
  readonly clock: Clock;
  readonly stripe: StripePort;
}

export interface StartCheckoutArgs {
  readonly workspaceId: string;
  readonly billingAccountId: string;
  readonly userId?: string;
  readonly kind: CheckoutKind;
  readonly plan?: string;
  readonly cycle?: "monthly" | "annual";
  readonly packId?: string;
  /** where the user was — the success URL lands back here (REQ-BILL-14 "return to context"). */
  readonly returnTo?: string;
  readonly require3ds?: boolean;
  readonly customerId?: string | null;
  readonly customerEmail?: string;
  readonly appBaseUrl: string;
}

/** Persist the row, mint the Stripe session, store its id; returns the URL to redirect to. */
export async function startCheckout(
  tx: SqlClient,
  deps: CheckoutDeps,
  args: StartCheckoutArgs & { unitAmountCents?: number; planDisplay?: string; packUsd?: number; packCredits?: number },
): Promise<{ sessionId: string; url: string }> {
  const sessionId = deps.ids("chk");
  await tx.query(
    `insert into checkout_sessions
       (id, workspace_id, billing_account_id, user_id, kind, plan, cycle, pack_id, return_to, state, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open',$10)`,
    [
      sessionId,
      args.workspaceId,
      args.billingAccountId,
      args.userId ?? null,
      args.kind,
      args.plan ?? null,
      args.cycle ?? null,
      args.packId ?? null,
      args.returnTo ?? null,
      deps.clock.now(),
    ],
  );
  // BILL.3 — pin our row id on a thrown provider error so the api route can LOG the diagnosable
  // session id (the row was inserted first precisely so the failure is traceable).
  let ref: { id: string; url: string };
  try {
    ref = await deps.stripe.createCheckoutSession({
      sessionId,
      kind: args.kind,
      billingAccountId: args.billingAccountId,
      workspaceId: args.workspaceId,
      ...(args.userId !== undefined ? { userId: args.userId } : {}),
      customerId: args.customerId ?? null,
      ...(args.customerEmail !== undefined ? { customerEmail: args.customerEmail } : {}),
      ...(args.plan && args.unitAmountCents != null && args.cycle
        ? { plan: { tier: args.plan, display: args.planDisplay ?? args.plan, cycle: args.cycle, unitAmountCents: args.unitAmountCents } }
        : {}),
      ...(args.packId && args.packUsd != null && args.packCredits != null
        ? { pack: { id: args.packId, usd: args.packUsd, credits: args.packCredits } }
        : {}),
      // success/cancel land back in the app; `return_to` is what the api bounces through to the origin page.
      // STB.4 (live finding): the deployed web mounts `/billing/return?session_id=` — an earlier
      // `/billing/checkout-return?session=` shape 404'd the Stripe redirect on every real checkout.
      successUrl: `${args.appBaseUrl}/billing/return?session_id=${sessionId}`,
      cancelUrl: `${args.appBaseUrl}/billing/return?session_id=${sessionId}&cancelled=1`,
      ...(args.require3ds ? { require3ds: true } : {}),
    });
  } catch (err) {
    if (err instanceof Error && !("checkoutSessionId" in err)) {
      (err as Error & { checkoutSessionId?: string }).checkoutSessionId = sessionId;
    }
    throw err;
  }
  await tx.query("update checkout_sessions set stripe_session_id = $2 where id = $1", [sessionId, ref.id]);
  return { sessionId, url: ref.url };
}

/** The webhook's resolver: find our row by the Stripe session id (or our id — Payment Links may echo it). */
export async function resolveCheckoutSession(
  tx: SqlClient,
  stripeSessionId: string,
): Promise<
  | {
      id: string;
      workspaceId: string;
      billingAccountId: string;
      kind: CheckoutKind;
      plan: string | null;
      cycle: string | null;
      packId: string | null;
      state: string;
      /** the session's owner (0048: the pending-checkout email's recipient). */
      userId: string | null;
      /** the origin page the user returns to (0048: the pending email's open link). */
      returnTo: string | null;
      /** set once the user observed the `open` return page (0048: the pending-email precondition). */
      returnViewedAt: string | null;
      /** set only after the pending-email job was enqueued (0048: webhook-redrive guard). */
      pendingEmailQueuedAt: string | null;
    }
  | undefined
> {
  const row = (
    await tx.query(
      `select id, workspace_id, billing_account_id, kind, plan, cycle, pack_id, state,
              user_id, return_to, return_viewed_at::text, pending_email_queued_at::text
         from checkout_sessions where stripe_session_id = $1 or id = $1`,
      [stripeSessionId],
    )
  ).rows[0] as
    | {
        id: string;
        workspace_id: string;
        billing_account_id: string;
        kind: CheckoutKind;
        plan: string | null;
        cycle: string | null;
        pack_id: string | null;
        state: string;
        user_id: string | null;
        return_to: string | null;
        return_viewed_at: string | null;
        pending_email_queued_at: string | null;
      }
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    billingAccountId: row.billing_account_id,
    kind: row.kind,
    plan: row.plan,
    cycle: row.cycle,
    packId: row.pack_id,
    state: row.state,
    userId: row.user_id,
    returnTo: row.return_to,
    returnViewedAt: row.return_viewed_at,
    pendingEmailQueuedAt: row.pending_email_queued_at,
  };
}

/** What `completeCheckoutSession` hands back when it transitioned the row — the pending-checkout
 *  email's claims (BILL.3; 0048): whether the user waited on the open page, who to mail, where to
 *  link back to, and the kind (the message's wording). */
export interface CompletedCheckout {
  readonly id: string;
  readonly returnViewedAt: string | null;
  readonly pendingEmailQueuedAt: string | null;
  readonly userId: string | null;
  readonly returnTo: string | null;
  readonly kind: CheckoutKind;
}

/**
 * Mark the row completed. Returns the transitioned row ONLY on the open→completed transition — a
 * replayed `checkout.session.completed` (state already `completed`) returns null, which is the
 * caller's exactly-once guard for the pending-checkout email (BILL.3).
 */
export async function completeCheckoutSession(
  tx: SqlClient,
  sessionId: string,
  now: Date,
): Promise<CompletedCheckout | null> {
  const res = await tx.query(
    `update checkout_sessions set state = 'completed', completed_at = $2
       where id = $1 and state = 'open'
       returning id, return_viewed_at::text, pending_email_queued_at::text, user_id, return_to, kind`,
    [sessionId, now],
  );
  const row = res.rows[0] as
    | {
        id: string;
        return_viewed_at: string | null;
        pending_email_queued_at: string | null;
        user_id: string | null;
        return_to: string | null;
        kind: CheckoutKind;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    returnViewedAt: row.return_viewed_at,
    pendingEmailQueuedAt: row.pending_email_queued_at,
    userId: row.user_id,
    returnTo: row.return_to,
    kind: row.kind,
  };
}

/**
 * BILL.3 (0048): mark the pending-checkout mail as QUEUED only after the notify job was accepted.
 * A worker crash before enqueue leaves the column null (the redriven webhook can retry); a crash
 * after enqueue + stamp leaves it set (the redrive must not enqueue a second job under the same
 * `checkout:<sessionId>` dedup tag).
 */
export async function markCheckoutPendingEmailQueued(
  tx: SqlClient,
  sessionId: string,
  now: Date,
): Promise<boolean> {
  const res = await tx.query(
    `update checkout_sessions set pending_email_queued_at = $2
       where id = $1 and pending_email_queued_at is null returning id`,
    [sessionId, now],
  );
  return res.rows.length > 0;
}

/** BILL.3 (§14.6 "expired"): `checkout.session.expired` closes the row so the poll renders the honest
 *  expired copy instead of polling forever. Idempotent — only an `open` row expires. */
export async function expireCheckoutSession(tx: SqlClient, sessionId: string, now: Date): Promise<boolean> {
  const res = await tx.query(
    "update checkout_sessions set state = 'expired', completed_at = $2 where id = $1 and state = 'open' returning id",
    [sessionId, now],
  );
  return res.rows.length > 0;
}

/**
 * BILL.3 (0048): the tenant-scoped checkout-return poll stamps `return_viewed_at` the first time the
 * user OBSERVES the `open` page — the pending-checkout email's precondition ("we'll email you when it
 * lands" only applies to a user who saw the pending state). Idempotent: `is null` keeps the first
 * observation's instant. A completed/expired row is never marked — the poll reads it finished.
 */
export async function markCheckoutSessionReturnViewed(
  tx: SqlClient,
  sessionId: string,
  workspaceId: string,
  now: Date,
): Promise<void> {
  await tx.query(
    `update checkout_sessions set return_viewed_at = $2
       where id = $1 and workspace_id = $3 and state = 'open' and return_viewed_at is null`,
    [sessionId, now, workspaceId],
  );
}

/** The checkout-return read (§14.6 webhook lag: the page polls this ≤30 s, then falls back to email).
 *  BILL.3: `workspaceId` is returned so the api can refuse a cross-tenant read (404 — the session id is
 *  a bearer fact; revealing its state to another tenant would leak + the return-viewed marker must be
 *  owner-stamped). */
export async function readCheckoutSession(
  exec: SqlClient,
  sessionId: string,
): Promise<
  { state: string; kind: string; returnTo: string | null; workspaceId: string; createdAt: string } | undefined
> {
  const row = (
    await exec.query(
      `select state, kind, return_to, workspace_id,
              to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at
         from checkout_sessions where id = $1`,
      [sessionId],
    )
  ).rows[0] as
    | { state: string; kind: string; return_to: string | null; workspace_id: string; created_at: string }
    | undefined;
  if (!row) return undefined;
  return {
    state: row.state,
    kind: row.kind,
    returnTo: row.return_to,
    workspaceId: row.workspace_id,
    createdAt: row.created_at,
  };
}

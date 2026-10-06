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
  const ref = await deps.stripe.createCheckoutSession({
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
    }
  | undefined
> {
  const row = (
    await tx.query(
      `select id, workspace_id, billing_account_id, kind, plan, cycle, pack_id, state
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
  };
}

/** Mark the row completed (idempotent — a replayed webhook finds it already closed). */
export async function completeCheckoutSession(tx: SqlClient, sessionId: string, now: Date): Promise<boolean> {
  const res = await tx.query(
    "update checkout_sessions set state = 'completed', completed_at = $2 where id = $1 and state = 'open' returning id",
    [sessionId, now],
  );
  return res.rows.length > 0;
}

/** The checkout-return read (§14.6 webhook lag: the page polls this ≤30 s, then falls back to email). */
export async function readCheckoutSession(
  exec: SqlClient,
  sessionId: string,
): Promise<{ state: string; kind: string; returnTo: string | null } | undefined> {
  const row = (
    await exec.query("select state, kind, return_to from checkout_sessions where id = $1", [sessionId])
  ).rows[0] as { state: string; kind: string; return_to: string | null } | undefined;
  if (!row) return undefined;
  return { state: row.state, kind: row.kind, returnTo: row.return_to };
}

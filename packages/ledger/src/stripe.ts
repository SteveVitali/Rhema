// Stripe boundary for the beta's ONE real-money channel: Payment Links (PRB.08; §14.6; REQ-BETA-15). There
// is no Checkout/Portal/subscription machinery at beta — the exhaustion panel links out to a fixed Payment
// Link and Stripe calls back here.
//
// §14.6 webhook discipline, exactly: verify the `Stripe-Signature` HMAC → insert `stripe_events` keyed on the
// UNIQUE event id → enqueue `stripe.event` → return 200. A replayed event id is a no-op. The queued worker
// then `processStripeEvent`s the stored row: `checkout.session.completed` ⇒ `grant(topup)` (+12 months,
// `stripe_ref` on the payment intent so a later dispute finds its account) + `topup.purchased` /
// `wtp.recorded{source:"purchase"}` telemetry; `charge.dispute.created` ⇒ the REQ-SPEC-24.7 chargeback path;
// `charge.dispute.closed` won ⇒ reversal + reinstate + the withheld-delivery re-drive.
//
// The signature check is implemented directly (HMAC-SHA256 over `${t}.${rawBody}`) — no `stripe` SDK dep —
// so tests run against constructed fixtures and no network leg ever fires. The signing secret arrives
// injected (Secret Manager at deploy); it never appears in code, fixtures, or the ledger.

import { createHmac, timingSafeEqual } from "node:crypto";
import { RUN_JOBS, type SqlClient, type Queue } from "@rhema/orchestrator";
import { applyLedgerEntry } from "./entries.js";
import { applyChargeback, applyDisputeWon, type ChargebackDeps } from "./chargeback.js";
import { recordAnalyticsEvent } from "./analytics.js";

/** The pg-boss queue the webhook enqueues after inserting `stripe_events` (§14.6 step 3). */
export const STRIPE_EVENT_JOB = "stripe.event" as const;
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
}

export type StripeEventOutcome =
  | { readonly kind: "topup_granted"; readonly ledgerId: string; readonly credits: number; readonly billingAccountId: string; readonly applied: boolean }
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
  metadata?: { billing_account_id?: string; workspace_id?: string };
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
  const object = (payload.data?.object ?? {}) as CheckoutSession & DisputeObject;

  let outcome: StripeEventOutcome;
  switch (row.type) {
    case "checkout.session.completed":
      outcome = await processTopUp(exec, deps, object);
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

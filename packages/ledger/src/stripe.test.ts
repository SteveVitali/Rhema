import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryQueue, InMemoryEventWriter } from "@rhema/orchestrator";
import {
  verifyStripeSignature,
  signStripePayload,
  insertStripeEvent,
  processStripeEvent,
  type StripeEventDeps,
} from "./stripe.js";
import { SqlHoldLedger } from "./sql-ledger.js";
import {
  createLedgerTestDb,
  seedProject,
  testEntryDeps,
  readBalances,
  type LedgerTestDb,
} from "./testing/index.js";

// PRB.08 — the §14.6 webhook discipline + the Payment-Link top-up (REQ-BETA-15). Deterministic fixtures only:
// the signature check is HMAC-SHA256 over the raw body (no SDK, no network); `signStripePayload` mints the
// test side of the signature. AC2: purchase → webhook → idempotent grant(topup); a replayed event id no-ops.

let db: LedgerTestDb;
// the analytics envelope validates user_id/workspace_id as ULIDs at the write boundary — use ULID-shaped ids.
const WS = "01JQ0000000000000000000WS1";
const BA = "ba_seed";
const USER = "01JQ0000000000000000000MB1";
const SECRET = "whsec_test_fixture";

beforeEach(async () => {
  db = await createLedgerTestDb();
  await seedProject(db, { workspaceId: WS, billingAccountId: BA, userId: USER });
  await db.pg.query("insert into workspace_members(workspace_id, user_id, role) values ($1,$2,'admin')", [WS, USER]);
});
afterEach(() => db.close());

const NOW = new Date("2026-09-20T12:00:00Z");

function deps(queue = new InMemoryQueue()): StripeEventDeps & { queue: InMemoryQueue } {
  const d = testEntryDeps(NOW);
  const ledger = new SqlHoldLedger(d);
  return {
    ...d,
    ledger,
    runTx: (workspaceId, fn) => db.txRunner.run(workspaceId, fn),
    eventWriter: new InMemoryEventWriter(),
    queue,
  };
}

function checkoutPayload(over: Record<string, unknown> = {}) {
  return {
    id: "evt_checkout_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        amount_total: 5000, // $50.00 → 5000 credits at the 1¢ = 1 credit peg
        payment_intent: "pi_test_1",
        client_reference_id: BA,
        metadata: { workspace_id: WS },
        ...over,
      },
    },
  };
}

async function stripeEventRow(id: string) {
  return (await db.client.query("select id, type, processed_at from stripe_events where id = $1", [id])).rows[0] as
    | { id: string; type: string; processed_at: string | null }
    | undefined;
}
async function topupGrants() {
  return (
    await db.client.query(
      "select kind, bucket, source, reason, credits, stripe_ref, expires_at from credit_ledger where billing_account_id = $1 and bucket = 'topup'",
      [BA],
    )
  ).rows as { kind: string; bucket: string; source: string; reason: string | null; credits: number; stripe_ref: string | null; expires_at: string | null }[];
}
async function analyticsRows() {
  return (await db.client.query("select event, props from analytics_events order by at, id")).rows as {
    event: string; props: Record<string, unknown>;
  }[];
}

describe("verifyStripeSignature (§14.6 step 1)", () => {
  const body = JSON.stringify(checkoutPayload());

  it("accepts a correctly-signed body within tolerance", () => {
    const header = signStripePayload({ secret: SECRET, rawBody: body, timestampSec: Math.floor(NOW.getTime() / 1000) });
    expect(verifyStripeSignature({ secret: SECRET, rawBody: body, signatureHeader: header, now: NOW })).toBe(true);
  });
  it("rejects a tampered body / wrong secret / missing header / stale timestamp", () => {
    const ts = Math.floor(NOW.getTime() / 1000);
    const good = signStripePayload({ secret: SECRET, rawBody: body, timestampSec: ts });
    expect(verifyStripeSignature({ secret: SECRET, rawBody: body + "x", signatureHeader: good, now: NOW })).toBe(false);
    expect(verifyStripeSignature({ secret: "whsec_other", rawBody: body, signatureHeader: good, now: NOW })).toBe(false);
    expect(verifyStripeSignature({ secret: SECRET, rawBody: body, signatureHeader: undefined, now: NOW })).toBe(false);
    const stale = signStripePayload({ secret: SECRET, rawBody: body, timestampSec: ts - 400 });
    expect(verifyStripeSignature({ secret: SECRET, rawBody: body, signatureHeader: stale, now: NOW })).toBe(false);
  });
});

describe("insertStripeEvent (§14.6 step 2 — the unique-id dedupe)", () => {
  it("inserts once; a replayed event id is a no-op", async () => {
    const a = await insertStripeEvent(db.client, { id: "evt_1", type: "checkout.session.completed", payload: {}, receivedAt: NOW });
    const b = await insertStripeEvent(db.client, { id: "evt_1", type: "checkout.session.completed", payload: {}, receivedAt: NOW });
    expect(a).toBe(true);
    expect(b).toBe(false);
    expect((await db.client.query("select count(*)::int n from stripe_events")).rows[0]).toEqual({ n: 1 });
  });
});

describe("processStripeEvent — checkout.session.completed → grant(topup) (AC2)", () => {
  it("grants topup credits (+12mo expiry, stripe_ref = payment intent) + purchase telemetry", async () => {
    await insertStripeEvent(db.client, { id: "evt_checkout_1", type: "checkout.session.completed", payload: checkoutPayload(), receivedAt: NOW });
    const out = await processStripeEvent(db.client, deps(), "evt_checkout_1");
    expect(out.kind).toBe("topup_granted");
    if (out.kind !== "topup_granted") return;
    expect(out.applied).toBe(true);
    expect(out.credits).toBe(5000);
    expect(out.billingAccountId).toBe(BA);

    expect((await readBalances(db, BA)).topup).toEqual({ available: 5000, held: 0 });
    const [grant] = await topupGrants();
    expect(grant).toMatchObject({ kind: "grant", source: "stripe", reason: "topup", credits: 5000, stripe_ref: "pi_test_1" });
    // +12 months from the fixed clock.
    expect(new Date(grant!.expires_at!).getTime()).toBe(NOW.getTime() + 365 * 24 * 60 * 60 * 1000);

    // REQ-BETA-12: the purchase IS the WTP signal — topup.purchased + wtp.recorded{source:"purchase"}.
    const events = await analyticsRows();
    expect(events.map((e) => e.event)).toEqual(["topup.purchased", "wtp.recorded"]);
    expect(events[1]!.props).toEqual({ source: "purchase", amount: 50 });

    // §14.6 auditability: processed_at stamped.
    expect((await stripeEventRow("evt_checkout_1"))!.processed_at).not.toBeNull();
  });

  it("is idempotent — reprocessing a stored row does not double-grant (§14.6 replay)", async () => {
    await insertStripeEvent(db.client, { id: "evt_checkout_1", type: "checkout.session.completed", payload: checkoutPayload(), receivedAt: NOW });
    const a = await processStripeEvent(db.client, deps(), "evt_checkout_1");
    const b = await processStripeEvent(db.client, deps(), "evt_checkout_1");
    expect(a.kind).toBe("topup_granted");
    expect(b.kind).toBe("topup_granted");
    if (b.kind === "topup_granted") expect(b.applied).toBe(false);
    expect((await readBalances(db, BA)).topup.available).toBe(5000); // not 10,000
    expect(await topupGrants()).toHaveLength(1);
  });

  it("a session with no resolvable account is 'unresolved' and NOT marked processed (retry stays live)", async () => {
    await insertStripeEvent(db.client, {
      id: "evt_orphan",
      type: "checkout.session.completed",
      payload: checkoutPayload({ client_reference_id: undefined, metadata: {} }),
      receivedAt: NOW,
    });
    const out = await processStripeEvent(db.client, deps(), "evt_orphan");
    expect(out.kind).toBe("unresolved");
    expect((await stripeEventRow("evt_orphan"))!.processed_at).toBeNull();
  });

  it("an unhandled event type is acknowledged (ignored) — intake is the dedupe boundary", async () => {
    await insertStripeEvent(db.client, { id: "evt_ping", type: "ping", payload: {}, receivedAt: NOW });
    const out = await processStripeEvent(db.client, deps(), "evt_ping");
    expect(out.kind).toBe("ignored");
    expect((await stripeEventRow("evt_ping"))!.processed_at).not.toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SqlClient } from "@rhema/orchestrator";
import {
  startCheckout,
  resolveCheckoutSession,
  completeCheckoutSession,
  readCheckoutSession,
} from "./checkout.js";
import { StubStripePort } from "./stripe-port.js";
import {
  createLedgerTestDb,
  seedProject,
  testEntryDeps,
  type LedgerTestDb,
} from "./testing/index.js";

// REQ-BILL-14 checkout session lifecycle — the row lands first (return-to-context + grant
// discriminator), the Stripe session resolves back to it, completion is idempotent.

let db: LedgerTestDb;
const WS = "ws_seed";
const BA = "ba_seed";
const USR = "usr_seed";
const NOW = new Date("2026-09-03T00:00:00Z");
const inTx = <T>(fn: (tx: SqlClient) => Promise<T>) => db.txRunner.run(WS, fn);

beforeEach(async () => {
  db = await createLedgerTestDb();
  await seedProject(db, { workspaceId: WS, billingAccountId: BA, userId: USR });
});
afterEach(() => db.close());

describe("startCheckout + resolveCheckoutSession", () => {
  it("writes the row, mints the session, and resolves back by the Stripe id", async () => {
    const stripe = new StubStripePort();
    const out = await inTx((tx) =>
      startCheckout(tx, { ...testEntryDeps(NOW), stripe }, {
        workspaceId: WS,
        billingAccountId: BA,
        userId: USR,
        kind: "subscribe",
        plan: "writer",
        cycle: "monthly",
        unitAmountCents: 2000,
        planDisplay: "Writer",
        returnTo: "/app/usage",
        appBaseUrl: "https://app.test",
      }),
    );
    expect(out.url).toContain("checkout.stripe.test");
    const req = stripe.calls[0]!.args as { successUrl: string; cancelUrl: string; metadata?: unknown };
    // STB.4 — the return URL must be the deployed web route (`/billing/return?session_id=`); the
    // earlier `/billing/checkout-return?session=` shape 404'd the Stripe redirect end-to-end.
    expect(req.successUrl).toBe(`https://app.test/billing/return?session_id=${out.sessionId}`);
    expect(req.cancelUrl).toBe(`https://app.test/billing/return?session_id=${out.sessionId}&cancelled=1`);

    const stripeId = (await db.client.query("select stripe_session_id from checkout_sessions where id = $1", [out.sessionId]))
      .rows[0]!.stripe_session_id as string;
    const resolved = await inTx((tx) => resolveCheckoutSession(tx, stripeId));
    expect(resolved).toMatchObject({
      id: out.sessionId,
      workspaceId: WS,
      billingAccountId: BA,
      kind: "subscribe",
      plan: "writer",
      cycle: "monthly",
      state: "open",
    });
  });
});

describe("completeCheckoutSession + readCheckoutSession", () => {
  it("completes once; a replayed webhook finds it already closed", async () => {
    const stripe = new StubStripePort();
    const { sessionId } = await inTx((tx) =>
      startCheckout(tx, { ...testEntryDeps(NOW), stripe }, {
        workspaceId: WS,
        billingAccountId: BA,
        kind: "topup",
        packId: "topup_10",
        packUsd: 10,
        packCredits: 1000,
        returnTo: "/app/runs",
        appBaseUrl: "https://app.test",
      }),
    );
    expect(await inTx((tx) => completeCheckoutSession(tx, sessionId, NOW))).toBe(true);
    expect(await inTx((tx) => completeCheckoutSession(tx, sessionId, NOW))).toBe(false);
    const view = await readCheckoutSession(db.client, sessionId);
    expect(view).toEqual({ state: "completed", kind: "topup", returnTo: "/app/runs" });
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, makeDeps, type OrchestratorTestDb, type TestDeps } from "@rhema/orchestrator/testing";
import { createIpEmailThrottle, type IpEmailThrottle } from "@rhema/contracts";
import { processStripeEvent, signStripePayload, SqlHoldLedger } from "@rhema/ledger";
import { createApp, type Principal } from "./index.js";

// PRB.13 — REQ-BETA-19 (amended 2026-09-16): `signup.mode` drives the api's account-creation path.
// Deterministic on PGlite via Hono's app.request — no network, no live auth.
//
//   invite mode — no code ⇒ 403 invite_required and NO account; a valid code is consumed AT creation
//                 (the PRB.01 invariant, now through POST /signup); a returning account is an idempotent
//                 created:false (its exhausted code must not lock it out of re-login).
//   open mode   — no code ⇒ the account is created (0 credits, unverified); a supplied code is still
//                 validated + consumed; an invalid supplied code still refuses.
//   abuse       — account creation throttles per IP + per email (429); an unverified account cannot
//                 create a run (403 email_unverified — the sign-in link is the verification).
//   AC2         — a fresh open-mode account reads 0 spendable, reaches the exhaustion/purchase surface,
//                 and the Stripe Payment-Link webhook leg lands the top-up + wtp.recorded.

let db: OrchestratorTestDb;
let deps: TestDeps;
const NOW = new Date("2026-09-20T12:00:00Z");
const SECRET = "whsec_signup_test";

let t = NOW.getTime();
const throttle = (over: Partial<{ perIp: number; perEmail: number }> = {}): IpEmailThrottle =>
  createIpEmailThrottle({ perIp: 100, perEmail: 100, windowMs: 60_000, now: () => t, ...over });

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db, { now: NOW });
  t = NOW.getTime();
});
afterEach(() => db.close());

function app(mode: "invite" | "open", over: { signupThrottle?: IpEmailThrottle } = {}) {
  return createApp({
    ...deps,
    principal: () => null, // signup is pre-auth; authed routes in this file pass their own principal
    db: db.client,
    signupMode: mode,
    signupThrottle: over.signupThrottle ?? throttle(),
    stripeWebhookSecret: SECRET,
    systemExec: db.client,
    paymentLinkUrl: "https://buy.stripe.com/test_beta",
  });
}

function postSignup(a: ReturnType<typeof app>, body: Record<string, unknown>, ip = "203.0.113.10") {
  return a.request("/signup", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

async function insertInvite(over: Record<string, unknown> = {}) {
  const row = { code: "BETA-1", email: null, max_uses: 1, used_count: 0, expires_at: null, revoked_at: null, ...over };
  await db.pg.query(
    `insert into invites (code, email, max_uses, used_count, expires_at, revoked_at) values ($1,$2,$3,$4,$5,$6)`,
    [row.code, row.email, row.max_uses, row.used_count, row.expires_at, row.revoked_at],
  );
}

/** Resolve the provisioned account for an email (user + personal workspace + billing account). */
async function accountFor(email: string) {
  const user = (await db.pg.query(`select id, email_verified from "user" where email = $1`, [email])).rows[0] as
    | { id: string; email_verified: boolean }
    | undefined;
  if (!user) return undefined;
  const mem = (
    await db.pg.query(
      `select w.id as workspace_id, w.billing_account_id
         from workspaces w join workspace_members m on m.workspace_id = w.id
        where m.user_id = $1 and w.kind = 'personal'`,
      [user.id],
    )
  ).rows[0] as { workspace_id: string; billing_account_id: string } | undefined;
  return { userId: user.id, emailVerified: user.email_verified, workspaceId: mem?.workspace_id, billingAccountId: mem?.billing_account_id };
}

describe("POST /signup — invite mode (AC1)", () => {
  it("no code ⇒ 403 invite_required and NO rows written (a refusal leaves nothing behind)", async () => {
    const res = await postSignup(app("invite"), { email: "new@x.test" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "invite_required" });
    expect(await accountFor("new@x.test")).toBeUndefined();
  });

  it("an invalid code ⇒ 403 with the invite reason and no account", async () => {
    const res = await postSignup(app("invite"), { email: "new@x.test", code: "NOPE" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "unknown" });
    expect(await accountFor("new@x.test")).toBeUndefined();
  });

  it("a valid code creates the account AND consumes the invite at creation", async () => {
    await insertInvite({ code: "BETA-1" });
    const res = await postSignup(app("invite"), { email: "new@x.test", code: "BETA-1", method: "magic_link" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, created: true });

    const acct = (await accountFor("new@x.test"))!;
    expect(acct.emailVerified).toBe(false); // the sign-in link is the verification
    expect(acct.workspaceId).toBeTruthy();
    expect(acct.billingAccountId).toBeTruthy();

    // the redemption row + the seat count moved together (consume at creation).
    const invite = (await db.pg.query(`select used_count from invites where code = 'BETA-1'`)).rows[0] as { used_count: number };
    expect(invite.used_count).toBe(1);
    const red = (await db.pg.query(`select user_id from invite_redemptions where code = 'BETA-1'`)).rows;
    expect(red).toEqual([{ user_id: acct.userId }]);

    // signup.completed{method} landed in the analytics stream (opt-out honored by the sink).
    const ev = (await db.pg.query(`select event, props, user_id, workspace_id from analytics_events`)).rows as {
      event: string; props: { method: string }; user_id: string; workspace_id: string;
    }[];
    expect(ev).toEqual([
      { event: "signup.completed", props: { method: "magic_link" }, user_id: acct.userId, workspace_id: acct.workspaceId },
    ]);
  });

  it("a re-post of the same email is idempotent: created:false, no second consume, no second event", async () => {
    await insertInvite({ code: "BETA-1" });
    const a = app("invite");
    await postSignup(a, { email: "new@x.test", code: "BETA-1" });
    const res = await postSignup(a, { email: "new@x.test", code: "BETA-1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, created: false });
    const invite = (await db.pg.query(`select used_count from invites where code = 'BETA-1'`)).rows[0] as { used_count: number };
    expect(invite.used_count).toBe(1);
    expect((await db.pg.query(`select count(*)::int n from analytics_events`)).rows[0]).toEqual({ n: 1 });
  });

  it("a returning account is not locked out by its own exhausted code (re-login bypass)", async () => {
    await insertInvite({ code: "BETA-1" }); // max_uses 1 — consumed by the first signup
    const a = app("invite");
    expect((await postSignup(a, { email: "new@x.test", code: "BETA-1" })).status).toBe(201);
    const res = await postSignup(a, { email: "new@x.test" }); // no code, code now exhausted — still admitted
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, created: false });
  });
});

describe("POST /signup — open mode (AC1)", () => {
  it("no code ⇒ the account is created (self-serve), 0-credit start", async () => {
    const res = await postSignup(app("open"), { email: "self@x.test" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, created: true });
    const acct = (await accountFor("self@x.test"))!;
    expect(acct.emailVerified).toBe(false);
    const bal = (await db.pg.query(`select coalesce(sum(available),0)::int as s from credit_balances where billing_account_id = $1`, [acct.billingAccountId])).rows[0] as { s: number };
    expect(bal.s).toBe(0);
  });

  it("a supplied code is still validated + consumed; an invalid one still refuses", async () => {
    await insertInvite({ code: "BETA-1" });
    const a = app("open");
    const bad = await postSignup(a, { email: "self@x.test", code: "NOPE" });
    expect(bad.status).toBe(403);
    expect(await accountFor("self@x.test")).toBeUndefined();

    const ok = await postSignup(a, { email: "self@x.test", code: "BETA-1" });
    expect(ok.status).toBe(201);
    expect((await db.pg.query(`select used_count from invites where code = 'BETA-1'`)).rows[0]).toEqual({ used_count: 1 });
  });
});

describe("account-creation throttle (AC3 — per IP + per email, 429)", () => {
  it("blocks the next attempt once the IP is over its window limit", async () => {
    const a = app("open", { signupThrottle: throttle({ perIp: 2 }) });
    expect((await postSignup(a, { email: "a@x.test" })).status).toBe(201);
    expect((await postSignup(a, { email: "b@x.test" })).status).toBe(201);
    const res = await postSignup(a, { email: "c@x.test" });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited" });
    expect(res.headers.get("retry-after")).toBeTruthy();
    // a different source IP is unaffected; the window resets on schedule.
    expect((await postSignup(a, { email: "c@x.test" }, "198.51.100.7")).status).toBe(201);
    t += 61_000;
    expect((await postSignup(a, { email: "d@x.test" })).status).toBe(201);
  });

  it("blocks per email across IPs (credential-stuffing a single victim)", async () => {
    const a = app("open", { signupThrottle: throttle({ perEmail: 2 }) });
    expect((await postSignup(a, { email: "v@x.test" }, "1.1.1.1")).status).toBe(201);
    expect((await postSignup(a, { email: "v@x.test" }, "2.2.2.2")).status).toBe(200); // idempotent retry
    const res = await postSignup(a, { email: "v@x.test" }, "3.3.3.3");
    expect(res.status).toBe(429);
  });
});

describe("verified-email run gate (AC3 — an unverified self-serve account cannot POST /runs)", () => {
  it("unverified ⇒ 403 email_unverified; verified ⇒ the run creates", async () => {
    const a = app("open");
    await postSignup(a, { email: "self@x.test" });
    const acct = (await accountFor("self@x.test"))!;

    // the new account's own project + draft (the run sheet's target).
    await db.pg.query(
      `insert into projects(id, workspace_id, owner_id, title, slug) values ('prj_self', $1, $2, 'Self', 'self-p')`,
      [acct.workspaceId, acct.userId],
    );
    await db.pg.query(
      `insert into drafts(id, project_id, n, origin, state) values ('dft_self', 'prj_self', 1, 'agent', 'working')`,
    );

    const principal = (): Principal => ({
      userId: acct.userId,
      workspaceId: acct.workspaceId!,
      billingAccountId: acct.billingAccountId!,
    });
    const authed = createApp({
      ...deps,
      principal,
      db: db.client,
      signupMode: "open",
      signupThrottle: throttle(),
      paymentLinkUrl: "https://buy.stripe.com/test_beta",
    });
    // P1.16 (§14.3): a fresh self-serve account is `trial_pending` with a locked entitlement — the
    // first cost-bearing run is the included Review (Standard · Base · ≤6,000 words) claiming it.
    const entitlement = (
      await db.pg.query("select id from trial_entitlements where billing_account_id = $1", [
        acct.billingAccountId,
      ])
    ).rows[0] as { id: string };
    const body = JSON.stringify({
      idempotencyKey: "idem-self-1",
      workflow: "review",
      modelProfile: { tier: "base" },
      modelTier: "base",
      rigor: "standard",
      entitlementId: entitlement.id,
      estimateCredits: 560,
      capCredits: 840,
      rateTableVersion: 1,
      inputs: { draftId: "dft_self" },
      inputSnapshot: { wordCount: 1000 },
      draftId: "dft_self",
      corrKind: "review",
      corrK: 1,
    });
    const blocked = await authed.request("/projects/prj_self/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toEqual({ error: "email_unverified" });
    // P1.17: provisioning seeds the workspace Showcase (a frozen dossier WITH its completed review
    // run) — count only the project under test; the blocked request must create nothing there.
    expect(
      (await db.pg.query(`select count(*)::int n from runs where project_id = 'prj_self'`)).rows[0],
    ).toEqual({ n: 0 });

    // the sign-in link verified the mailbox — the gate opens and the SAME body now creates the run.
    await db.pg.query(`update "user" set email_verified = true where id = $1`, [acct.userId]);
    const ok = await authed.request("/projects/prj_self/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(ok.status).toBe(201);
  });
});

describe("the 0-credit purchase path (AC2 — balance 0 → exhaustion → Payment-Link top-up)", () => {
  it("a fresh open-mode account reads 0 spendable + the Payment Link, emits exhaustion + wtp events, and the webhook leg tops up", async () => {
    await postSignup(app("open"), { email: "self@x.test" });
    const acct = (await accountFor("self@x.test"))!;
    const principal = (): Principal => ({
      userId: acct.userId,
      workspaceId: acct.workspaceId!,
      billingAccountId: acct.billingAccountId!,
    });
    const authed = createApp({
      ...deps,
      principal,
      db: db.client,
      signupMode: "open",
      signupThrottle: throttle(),
      stripeWebhookSecret: SECRET,
      systemExec: db.client,
      paymentLinkUrl: "https://buy.stripe.com/test_beta",
    });

    // the §14.5 level-0 read a fresh account lands on: 0 spendable + the Payment Link for the panel.
    const bal = await authed.request("/billing/balance");
    expect(await bal.json()).toMatchObject({ spendableCredits: 0, suspended: false, paymentLinkUrl: "https://buy.stripe.com/test_beta" });

    // the exhaustion prompt's telemetry write (REQ-BETA-12) — the click-through to the Payment Link.
    const ep = await authed.request("/billing/exhausted-prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action_taken: "open_payment_link" }),
    });
    expect(ep.status).toBe(200);

    // the Payment-Link purchase completes → checkout.session.completed → topup + wtp.recorded (PRB.08 leg).
    const checkout = {
      id: "evt_selfserve_1",
      type: "checkout.session.completed",
      data: { object: { id: "cs_self_1", amount_total: 5000, payment_intent: "pi_self_1", client_reference_id: acct.billingAccountId, metadata: { workspace_id: acct.workspaceId } } },
    };
    const raw = JSON.stringify(checkout);
    const hook = await authed.request("/stripe/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signStripePayload({ secret: SECRET, rawBody: raw, timestampSec: Math.floor(NOW.getTime() / 1000) }),
      },
      body: raw,
    });
    expect(hook.status).toBe(200);
    const out = await processStripeEvent(db.client, {
      ids: deps.ids, clock: deps.clock, ledger: new SqlHoldLedger(deps),
      runTx: (w, fn) => db.txRunner.run(w, fn), eventWriter: deps.eventWriter, queue: deps.queue,
    }, "evt_selfserve_1");
    expect(out.kind).toBe("topup_granted");

    // both events are in the stream and the balance now reads the purchased credits.
    // (order by id — the ULID id factory is monotonic; `at` ties under the fixed test clock.)
    const events = (await db.pg.query(`select event, props from analytics_events order by id`)).rows as { event: string; props: Record<string, unknown> }[];
    expect(events.map((e) => e.event)).toEqual(["signup.completed", "credits.exhausted_prompt", "topup.purchased", "wtp.recorded"]);
    expect(events[3]!.props).toMatchObject({ source: "purchase" });
    const after = await authed.request("/billing/balance");
    expect((await after.json()).spendableCredits).toBe(5000);
  });
});

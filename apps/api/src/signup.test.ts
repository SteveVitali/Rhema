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

function postSignup(
  a: ReturnType<typeof app>,
  body: Record<string, unknown>,
  ip = "203.0.113.10",
  headers: Record<string, string> = {},
) {
  return a.request("/signup", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip, ...headers },
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

// SEC.2 (ADR-040) — the throttle bucket key: the LB-appended XFF hop or the web's OIDC-stamped
// `x-rhema-client-ip`; the caller-controlled FIRST XFF hop is never trusted.
describe("client-IP trust (SEC.2 — a forged XFF first hop cannot reset the bucket)", () => {
  it("rotating the forged first XFF hop stays in the SAME bucket (the penultimate hop keys)", async () => {
    const a = app("open", { signupThrottle: throttle({ perIp: 2 }) });
    const post = (forged: string) =>
      postSignup(a, { email: `f${forged}@x.test`.replace(/\./g, "") }, "ignored", {
        "x-forwarded-for": `${forged}, 203.0.113.10, 35.0.0.1`, // forged first, real client, LB
      });
    expect((await post("6.6.6.1")).status).toBe(201);
    expect((await post("6.6.6.2")).status).toBe(201);
    expect((await post("6.6.6.3")).status).toBe(429); // all three shared the 203.0.113.10 bucket
  });

  it("the verified web stamp keys the bucket on `x-rhema-client-ip`, not the XFF chain", async () => {
    const verify = async (token: string) => token === "good-token";
    const a = createApp({
      ...deps,
      principal: () => null,
      db: db.client,
      signupMode: "open",
      signupThrottle: throttle({ perIp: 2 }),
      verifyInternalToken: verify,
    });
    const post = (xff: string) =>
      postSignup(a, { email: `s${Math.random()}@x.test` }, "ignored", {
        "x-forwarded-for": xff,
        "x-rhema-client-ip": "198.51.100.42", // the web-stamped real browser IP
        "x-rhema-internal-token": "good-token",
      });
    // three different XFF chains — all carry the same verified stamp ⇒ ONE bucket.
    expect((await post("1.1.1.1, 35.0.0.1")).status).toBe(201);
    expect((await post("2.2.2.2, 35.0.0.1")).status).toBe(201);
    expect((await post("3.3.3.3, 35.0.0.1")).status).toBe(429);
  });

  it("a forged stamp without a valid token is ignored — the XFF penultimate hop governs", async () => {
    const verify = async () => false; // the token never verifies
    const a = createApp({
      ...deps,
      principal: () => null,
      db: db.client,
      signupMode: "open",
      signupThrottle: throttle({ perIp: 2 }),
      verifyInternalToken: verify,
    });
    const post = () =>
      postSignup(a, { email: `x${Math.random()}@x.test` }, "ignored", {
        "x-forwarded-for": "9.9.9.9, 203.0.113.10, 35.0.0.1",
        "x-rhema-client-ip": "5.5.5.5", // forged — ignored without a valid token
        "x-rhema-internal-token": "forged-token",
      });
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(429); // the 203.0.113.10 bucket — NOT the forged 5.5.5.5
  });
});

describe("x-rhema-instance (SEC.2 — the Stage-B cross-instance evidence marker)", () => {
  it("responses carry the serving instance id when bound; absent dep ⇒ no header", async () => {
    const withId = createApp({
      ...deps,
      principal: () => null,
      db: db.client,
      signupMode: "open",
      signupThrottle: throttle(),
      instanceId: "cr-0000000000000000001",
    });
    const hit = await postSignup(withId, { email: `i${Math.random()}@x.test` });
    expect(hit.headers.get("x-rhema-instance")).toBe("cr-0000000000000000001");
    // unset ⇒ never a fabricated id
    const without = app("open");
    const res2 = await postSignup(without, { email: `j${Math.random()}@x.test` });
    expect(res2.headers.get("x-rhema-instance")).toBeNull();
  });
});

describe("verified-email run gate (AC3 — an unverified self-serve account cannot POST /runs)", () => {
  it("unverified ⇒ 403 email_unverified; verified ⇒ the run creates", async () => {
    const a = app("open");
    await postSignup(a, { email: "self@x.test" });
    const acct = (await accountFor("self@x.test"))!;
    // ACT.1 (ADR-042) — R6LCH.1 shipped `audience: everyone`, so the entitlement claim below is
    // admitted for a real workspace too; the workspace is still flagged is_test because a
    // JOURNEY.1-style tenant is also exempt from the global daily trial-spend ceiling.
    await db.pg.query(`update workspaces set is_test = true where id = $1`, [acct.workspaceId]);

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
      // BILL.3 — the purchase switch ships closed; this AC2 leg exercises the Payment-Link path, so the
      // app under test runs `open` (a JOURNEY.1 is_test flag would allowlist the same read).
      purchaseMode: "open",
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

// JOURNEY.1 — the test-tenant flag at provisioning (REQ-SPEC-29; ADR-020): an address matching the
// configured test mailbox (exact base or +tag) flags the new workspace `is_test`; nothing else does;
// and the flag is never reachable through any API route (it exists in the schema for the system-side
// readers only).
describe("JOURNEY.1 — test-tenant flagging at provisioning", () => {
  function appWithMailbox(testMailbox?: string) {
    return createApp({
      ...deps,
      principal: () => null,
      db: db.client,
      signupMode: "open",
      signupThrottle: throttle(),
      stripeWebhookSecret: SECRET,
      systemExec: db.client,
      paymentLinkUrl: "https://buy.stripe.com/test_beta",
      ...(testMailbox ? { testMailbox } : {}),
    });
  }
  async function isTestFlag(email: string) {
    const acct = await accountFor(email);
    if (!acct?.workspaceId) return undefined;
    const r = (
      await db.pg.query(`select is_test from workspaces where id = $1`, [acct.workspaceId])
    ).rows[0] as { is_test: boolean } | undefined;
    return r?.is_test;
  }

  it("a test+<tag> signup flags its workspace is_test; a real address does not", async () => {
    const a = appWithMailbox("test@rhema.tools");
    const r1 = await postSignup(a, { email: "test+j1nv@rhema.tools", method: "magic_link" });
    expect([200, 201]).toContain(r1.status);
    expect(await isTestFlag("test+j1nv@rhema.tools")).toBe(true);
    const r2 = await postSignup(a, { email: "real.person@example.org", method: "magic_link" });
    expect([200, 201]).toContain(r2.status);
    expect(await isTestFlag("real.person@example.org")).toBe(false);
  });

  it("no configured mailbox ⇒ nothing is flagged", async () => {
    const a = appWithMailbox();
    await postSignup(a, { email: "test+j1nv@rhema.tools", method: "magic_link" });
    expect(await isTestFlag("test+j1nv@rhema.tools")).toBe(false);
  });

  it("the flag grants nothing: a flagged account still hits the unverified-email run gate", async () => {
    const a = appWithMailbox("test@rhema.tools");
    await postSignup(a, { email: "test+j1gate@rhema.tools", method: "magic_link" });
    const acct = (await accountFor("test+j1gate@rhema.tools"))!;
    expect(await isTestFlag("test+j1gate@rhema.tools")).toBe(true);
    // seed the account's project + draft and POST /runs as the (unverified) principal — the flag
    // must NOT bypass REQ-BETA-19's verification gate.
    await db.pg.query(
      `insert into projects(id, workspace_id, owner_id, title, slug) values ('prj_t', $1, $2, 'T', 't-p')`,
      [acct.workspaceId, acct.userId],
    );
    await db.pg.query(
      `insert into drafts(id, project_id, n, origin, state) values ('dft_t', 'prj_t', 1, 'agent', 'working')`,
    );
    const principal = (): Principal => ({
      userId: acct.userId,
      workspaceId: acct.workspaceId!,
      billingAccountId: acct.billingAccountId!,
    });
    const b = createApp({
      ...deps,
      principal,
      db: db.client,
      signupMode: "open",
      signupThrottle: throttle(),
      paymentLinkUrl: "https://buy.stripe.com/test_beta",
    });
    const r = await b.request("/projects/prj_t/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: "idem-t", workflow: "review", draftId: "dft_t" }),
    });
    expect(r.status).toBe(403);
  });
});

// F-R6SWP.1-5 — the test-identity exemption on `POST /signup`: `test[+<tag>]@<TEST_MAILBOX>`
// creations count on the dedicated `rl:testidentity` bucket, never the production `rl:signup`
// bucket — the suite's ~20+ mints cannot starve prod's perIp=10. Real + near-miss addresses keep
// the production limits, and no configured bucket/mailbox ⇒ no exemption.
describe("F-R6SWP.1-5 — test-mailbox identities ride the dedicated bucket on POST /signup", () => {
  const MAILBOX = "test@rhema.tools";
  function appWithTestBucket(over: { perIp?: number; testPerIp?: number; mailbox?: string | null } = {}) {
    return createApp({
      ...deps,
      principal: () => null,
      db: db.client,
      signupMode: "open",
      signupThrottle: throttle({ perIp: over.perIp ?? 2 }),
      ...(over.mailbox !== null ? { testMailbox: over.mailbox ?? MAILBOX } : {}),
      testIdentityThrottle: throttle({ perIp: over.testPerIp ?? 100 }),
      stripeWebhookSecret: SECRET,
      systemExec: db.client,
      paymentLinkUrl: "https://buy.stripe.com/test_beta",
    });
  }

  it("test+ signups past the prod per-IP limit still create — the prod bucket never moved", async () => {
    const a = appWithTestBucket({ perIp: 2 });
    const ip = "203.0.113.10";
    // 4 test-identity creations from one IP — prod's perIp=2 would have stopped the third.
    for (const email of ["test+j1@rhema.tools", "test+j2@rhema.tools", "test+j3@rhema.tools", "test+jrn-b@rhema.tools"]) {
      expect((await postSignup(a, { email }, ip)).status, email).toBe(201);
    }
    // a real address from the same IP still gets exactly its production budget.
    expect((await postSignup(a, { email: "real@x.test" }, ip)).status).toBe(201);
    expect((await postSignup(a, { email: "real2@x.test" }, ip)).status).toBe(201);
    expect((await postSignup(a, { email: "real3@x.test" }, ip)).status).toBe(429);
  });

  it("near-miss aliases stay production-limited — the boundary is exactly matchesTestMailbox", async () => {
    const a = appWithTestBucket({ perIp: 3 });
    const ip = "203.0.113.10";
    // Each shape consumes the production IP bucket — had any ridden the test bucket, the prod
    // budget would still hold and the 4th post would admit.
    for (const email of ["test+evil@other.test", "tesseract@rhema.tools", "test@rhema.tools.evil"]) {
      expect((await postSignup(a, { email }, ip)).status, email).toBe(201);
    }
    expect((await postSignup(a, { email: "test+fourth@other.test" }, ip)).status).toBe(429);
  });

  it("no configured testIdentityThrottle or testMailbox ⇒ test+ stays production-limited", async () => {
    const a = createApp({
      ...deps,
      principal: () => null,
      db: db.client,
      signupMode: "open",
      signupThrottle: throttle({ perIp: 2 }),
      testMailbox: MAILBOX, // mailbox configured but no dedicated bucket — no exemption
      stripeWebhookSecret: SECRET,
      systemExec: db.client,
      paymentLinkUrl: "https://buy.stripe.com/test_beta",
    });
    const ip = "203.0.113.10";
    expect((await postSignup(a, { email: "test+j1@rhema.tools" }, ip)).status).toBe(201);
    expect((await postSignup(a, { email: "test+j2@rhema.tools" }, ip)).status).toBe(201);
    expect((await postSignup(a, { email: "test+j3@rhema.tools" }, ip)).status).toBe(429);
  });

  it("the test bucket still bounds — past its own ceiling a test+ signup is refused", async () => {
    const a = appWithTestBucket({ perIp: 100, testPerIp: 2 });
    const ip = "203.0.113.10";
    expect((await postSignup(a, { email: "test+j1@rhema.tools" }, ip)).status).toBe(201);
    expect((await postSignup(a, { email: "test+j2@rhema.tools" }, ip)).status).toBe(201);
    const res = await postSignup(a, { email: "test+j3@rhema.tools" }, ip);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited" });
  });
});

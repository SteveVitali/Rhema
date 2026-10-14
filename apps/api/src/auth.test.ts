import { describe, it, expect, vi } from "vitest";
import { getCookies } from "better-auth/cookies";
import { memoryAdapter, type MemoryDB } from "better-auth/adapters/memory";
import { createIpEmailThrottle } from "@rhema/contracts";
import { createAuth, type AuthSecrets, type AuthAdmission } from "./auth.js";
import type { InviteGate } from "./invite.js";

// PRB.15 (rhema.tools single-zone amendment, 2026-09-17 — REQ-ARCH-24 amended): the user-content
// origin moved onto the app's own zone (`usercontent.rhema.tools`), so session material is defended
// by cookie SHAPE, not by registrable-domain separation. These tests pin the shape Better Auth must
// emit: a literal `__Host-` name (the browser enforces Secure + Path=/ + NO Domain, and refuses a
// same-named cookie planted with Domain=rhema.tools by a sibling subdomain — the clobber vector).

const PROD_LIKE: AuthSecrets = {
  baseURL: "https://api.rhema.tools",
  betterAuthSecret: "test-secret-0123456789abcdef0123456789abcdef",
  googleClientId: "google-client-id",
  googleClientSecret: "google-client-secret",
};

const noSend = async () => {};

describe("auth cookies are host-only `__Host-` (single-zone cookie isolation)", () => {
  it("every named auth cookie is `__Host-`-prefixed, Secure, Path=/, HttpOnly, and Domain-less", () => {
    const auth = createAuth(PROD_LIKE, undefined, noSend);
    const cookies = getCookies(auth.options);
    // The full emitted set — session token + the session/account caches + dont-remember.
    for (const [label, c] of Object.entries(cookies)) {
      expect(c.name, label).toMatch(/^__Host-/);
      expect(c.attributes.secure, label).toBe(true);
      expect(c.attributes.path, label).toBe("/");
      expect(c.attributes.httpOnly, label).toBe(true);
      // THE invariant: no Domain attribute — the cookie is host-only and cannot be scoped to
      // rhema.tools (which would both leak it to usercontent.* and accept subdomain plants).
      expect(c.attributes.domain, label).toBeUndefined();
    }
    expect(cookies.sessionToken.name).toBe("__Host-rhema.session_token");
  });

  it("a real sign-in emits a compliant Set-Cookie on the wire (OAuth state cookie)", async () => {
    const auth = createAuth(PROD_LIKE, undefined, noSend);
    const res = await auth.handler(
      new Request("https://api.rhema.tools/api/auth/sign-in/social", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://rhema.tools" },
        body: JSON.stringify({ provider: "google", callbackURL: "https://api.rhema.tools/app" }),
      }),
    );
    expect(res.status).toBe(200);
    const setCookies = res.headers.getSetCookie();
    // The OAuth state cookie MUST be set and MUST satisfy the `__Host-` contract end-to-end:
    // `__Host-` name + Secure + Path=/ + HttpOnly and — critically — no `Domain=` attribute.
    expect(setCookies.length).toBeGreaterThan(0);
    for (const header of setCookies) {
      expect(header).toMatch(/^__Host-/);
      expect(header).toMatch(/;\s*Secure/i);
      expect(header).toMatch(/;\s*Path=\//i);
      expect(header).toMatch(/;\s*HttpOnly/i);
      expect(header).not.toMatch(/;\s*Domain=/i);
    }
  });

  it("crossSubDomainCookies stays disabled — no Domain attribute can ever appear", () => {
    const auth = createAuth(PROD_LIKE, undefined, noSend);
    expect(auth.options.advanced?.crossSubDomainCookies?.enabled).toBe(false);
  });

  it("an http dev baseURL keeps a plain non-secure prefix (a __Host- cookie would be rejected)", () => {
    const auth = createAuth({ ...PROD_LIKE, baseURL: "http://localhost:3001" }, undefined, noSend);
    const cookies = getCookies(auth.options);
    expect(cookies.sessionToken.name).toBe("rhema-dev.session_token");
    expect(cookies.sessionToken.attributes.secure).toBe(false);
    // Still never Domain-scoped, even on dev.
    expect(cookies.sessionToken.attributes.domain).toBeUndefined();
  });

  it("account linking is enabled and restricted to the trusted google provider", () => {
    const auth = createAuth(PROD_LIKE, undefined, noSend);
    const linking = auth.options.account?.accountLinking;
    expect(linking?.enabled).toBe(true);
    expect(linking?.trustedProviders).toEqual(["google"]);
    // Same-email Google sign-in links even when the local row is unverified (magic-link delivery
    // never completed) — Google's verified assertion is the proof of ownership.
    expect(linking?.requireLocalEmailVerified).toBe(false);
  });
});

// SEC.2 (REQ-BETA-19 amended; ADR-039/040/041) — the api-side admission boundary on the Better Auth
// paths a direct `/api/auth/*` caller can reach: `user.create.before` throttles + mode/invite-checks
// every account creation (OAuth callback + magic-link verify), `create.after` consumes the invite at
// creation before provisioning, and `hooks.before` throttles + pre-gates the magic-link SEND itself.
// Exercised end-to-end against the memory adapter — real handler, real hook chain, no network.

const DEV: AuthSecrets = {
  baseURL: "https://api.rhema.tools",
  betterAuthSecret: "test-secret-0123456789abcdef0123456789abcdef",
  googleClientId: "google-client-id",
  googleClientSecret: "google-client-secret",
  trustedOrigins: ["https://rhema.tools"],
};

function admission(over: Partial<AuthAdmission> = {}): AuthAdmission {
  return {
    mode: "open",
    inviteGate: {
      check: async (code) => (code === "GOOD" ? { ok: true } : { ok: false, reason: "unknown" }),
      consume: async (code) => (code === "GOOD" ? { ok: true } : { ok: false, reason: "unknown" }),
    } satisfies InviteGate,
    knownUser: async () => false,
    accountThrottle: createIpEmailThrottle({ perIp: 100, perEmail: 100, windowMs: 60_000 }),
    magicLinkThrottle: createIpEmailThrottle({ perIp: 100, perEmail: 100, windowMs: 60_000 }),
    ...over,
  };
}

function authWith(db: MemoryDB, adm: AuthAdmission, onUserCreate = vi.fn(async () => {})) {
  // the memory adapter wants each model's table to exist.
  db.user ??= [];
  db.session ??= [];
  db.account ??= [];
  db.verification ??= [];
  const send = vi.fn(async () => {});
  const auth = createAuth(DEV, memoryAdapter(db), send, { onUserCreate, admission: adm });
  return { auth, send, onUserCreate };
}

const CB = "https://rhema.tools/app";
const sendLink = (
  auth: ReturnType<typeof createAuth>,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) =>
  auth.handler(
    new Request("https://api.rhema.tools/api/auth/sign-in/magic-link", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://rhema.tools", ...headers },
      body: JSON.stringify({ email: "new@x.test", callbackURL: CB, ...body }),
    }),
  );

/** Extract the token + callbackURL the send callback received (the emailed link's query). */
function sentLink(send: ReturnType<typeof vi.fn>, call = 0): { token: string; callbackURL: string } {
  const { url } = send.mock.calls[call]![0] as { url: string };
  const u = new URL(url);
  return { token: u.searchParams.get("token")!, callbackURL: u.searchParams.get("callbackURL")! };
}

const verifyLink = (auth: ReturnType<typeof createAuth>, token: string, callbackURL: string) =>
  auth.handler(
    new Request(
      `https://api.rhema.tools/api/auth/magic-link/verify?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent(callbackURL)}`,
      { headers: { origin: "https://rhema.tools" }, redirect: "manual" },
    ),
  );

describe("SEC.2 — the magic-link SEND throttle + admission gate (a direct /api/auth caller)", () => {
  it("over the email limit ⇒ 429 and NO email is enqueued", async () => {
    const db: MemoryDB = {};
    const { auth, send } = authWith(
      db,
      admission({ magicLinkThrottle: createIpEmailThrottle({ perIp: 100, perEmail: 1, windowMs: 60_000 }) }),
    );
    expect((await sendLink(auth, {}, { "x-forwarded-for": "1.1.1.1" })).status).toBe(200);
    const res = await sendLink(auth, {}, { "x-forwarded-for": "2.2.2.2" }); // same email, fresh IP
    expect(res.status).toBe(429);
    expect(send).toHaveBeenCalledTimes(1); // the refused send never reached the mail queue
  });

  it("over the IP limit ⇒ 429 and no email enqueues", async () => {
    const db: MemoryDB = {};
    const { auth, send } = authWith(
      db,
      admission({ magicLinkThrottle: createIpEmailThrottle({ perIp: 2, perEmail: 100, windowMs: 60_000 }) }),
    );
    const ip = { "x-forwarded-for": "9.9.9.9" };
    expect((await sendLink(auth, { email: "a@x.test" }, ip)).status).toBe(200);
    expect((await sendLink(auth, { email: "b@x.test" }, ip)).status).toBe(200);
    expect((await sendLink(auth, { email: "c@x.test" }, ip)).status).toBe(429);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("invite mode: a never-seen email needs a valid code even to SEND (nothing enqueued on refusal)", async () => {
    const db: MemoryDB = {};
    const { auth, send } = authWith(db, admission({ mode: "invite" }));
    const noCode = await sendLink(auth, {});
    expect(noCode.status).toBe(403);
    const badCode = await sendLink(auth, { callbackURL: `${CB}?rhema_ic=NOPE` });
    expect(badCode.status).toBe(403);
    expect(send).not.toHaveBeenCalled();
    const good = await sendLink(auth, { callbackURL: `${CB}?rhema_ic=GOOD` });
    expect(good.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("a returning (known) email needs no code even in invite mode — the re-login bypass", async () => {
    const db: MemoryDB = {};
    const { auth, send } = authWith(db, admission({ mode: "invite", knownUser: async () => true }));
    expect((await sendLink(auth, {})).status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("SEC.2 — admission on the magic-link VERIFY creation leg (user.create.before/after)", () => {
  it("open mode: verify creates the user and provisions via onUserCreate", async () => {
    const db: MemoryDB = {};
    const { auth, send, onUserCreate } = authWith(db, admission());
    expect((await sendLink(auth, {})).status).toBe(200);
    const { token, callbackURL } = sentLink(send);
    const res = await verifyLink(auth, token, callbackURL);
    expect(res.status).toBe(302); // isNewUser ⇒ redirect to the callbackURL
    expect(res.headers.get("location")).toContain("/app");
    expect((db["user"] ?? []).length).toBe(1);
    expect(onUserCreate).toHaveBeenCalledTimes(1);
  });

  it("invite mode: verify WITHOUT a carried code refuses creation — no user row, no provisioning", async () => {
    const db: MemoryDB = {};
    // `knownUser` answers true at SEND (the send gate admits the returning email — the link mints) and
    // false at VERIFY (the account is in fact absent — e.g. the row was never provisioned). This is the
    // leg that must re-gate: the verify's create cannot trust the send's admission.
    let known = true;
    const knownUser = async () => {
      const k = known;
      known = false;
      return k;
    };
    const { auth, send, onUserCreate } = authWith(db, admission({ mode: "invite", knownUser }));
    expect((await sendLink(auth, {})).status).toBe(200);
    const { token } = sentLink(send);
    // the verify leg enforces admission itself: invite mode + no code ⇒ refused before any row.
    const res = await verifyLink(auth, token, CB);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("error=invite_required");
    expect((db["user"] ?? []).length).toBe(0);
    expect(onUserCreate).not.toHaveBeenCalled();
  });

  it("invite mode: verify with a valid code on the callbackURL creates + consumes AT creation", async () => {
    const db: MemoryDB = {};
    const consume = vi.fn(async () => ({ ok: true as const }));
    const gate: InviteGate = {
      check: async (code) => (code === "GOOD" ? { ok: true } : { ok: false, reason: "unknown" }),
      consume,
    };
    const { auth, send, onUserCreate } = authWith(db, admission({ mode: "invite", inviteGate: gate }));
    expect((await sendLink(auth, { callbackURL: `${CB}?rhema_ic=GOOD` })).status).toBe(200);
    const { token, callbackURL } = sentLink(send);
    expect(callbackURL).toContain("rhema_ic=GOOD"); // the code rides the emailed link
    const res = await verifyLink(auth, token, callbackURL);
    expect(res.status).toBe(302);
    expect((db["user"] ?? []).length).toBe(1);
    const userId = (db["user"]![0] as { id: string }).id;
    expect(consume).toHaveBeenCalledWith("GOOD", userId, "new@x.test");
    expect(onUserCreate).toHaveBeenCalledTimes(1);
  });

  it("invite mode: a bogus code on the link refuses creation with the invite reason, no rows", async () => {
    const db: MemoryDB = {};
    const consume = vi.fn(async () => ({ ok: true as const }));
    const gate: InviteGate = {
      check: async () => ({ ok: false, reason: "unknown" }),
      consume,
    };
    // known at send (the link mints for a "returning" email), unknown at verify — the create gate sees
    // the never-provisioned email and applies the invite rule to the carried (bogus) code.
    let known = true;
    const knownUser = async () => {
      const k = known;
      known = false;
      return k;
    };
    const adm = admission({ mode: "invite", inviteGate: gate, knownUser });
    const { auth, send, onUserCreate } = authWith(db, adm);
    expect((await sendLink(auth, { callbackURL: `${CB}?rhema_ic=NOPE` })).status).toBe(200);
    const { token, callbackURL } = sentLink(send);
    const res = await verifyLink(auth, token, callbackURL);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("error=unknown");
    expect((db["user"] ?? []).length).toBe(0);
    expect(consume).not.toHaveBeenCalled();
    expect(onUserCreate).not.toHaveBeenCalled();
  });

  it("the account-creation throttle binds the verify leg — over limit ⇒ error redirect, no row", async () => {
    const db: MemoryDB = {};
    const accountThrottle = createIpEmailThrottle({ perIp: 1, perEmail: 100, windowMs: 60_000 });
    const { auth, send, onUserCreate } = authWith(db, admission({ accountThrottle }));
    const ip = { "x-forwarded-for": "9.9.9.9" };
    // burn the single per-IP creation slot, then a second creation from the same IP is refused
    // BEFORE the user row exists.
    expect((await sendLink(auth, { email: "a@x.test" }, ip)).status).toBe(200);
    const l1 = sentLink(send);
    const r1 = await verifyLink(auth, l1.token, l1.callbackURL);
    expect(r1.status).toBe(302);
    expect((db["user"] ?? []).length).toBe(1);
    expect((await sendLink(auth, { email: "b@x.test" }, ip)).status).toBe(200);
    const l2 = sentLink(send, 1);
    const res = await verifyLink(auth, l2.token, l2.callbackURL);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("error=rate_limited");
    expect((db["user"] ?? []).length).toBe(1); // still one — no second user row
    expect(onUserCreate).toHaveBeenCalledTimes(1);
  });
});

// The OAuth half of the admission channel (ADR-040): a direct `/api/auth/sign-in/social` caller can
// put `rhema_ic` in `additionalData`, but only the web service's verified OIDC token promotes it into
// the state's TRUSTED `serverContext` — where `inviteCodeFor` reads it first on the callback leg. The
// untrusted path stays a plain client claim (still invite-gate-validated at create — forging the
// transport buys nothing).
const socialSignIn = (
  auth: ReturnType<typeof createAuth>,
  headers: Record<string, string> = {},
) =>
  auth.handler(
    new Request("https://api.rhema.tools/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://rhema.tools", ...headers },
      body: JSON.stringify({
        provider: "google",
        callbackURL: CB,
        additionalData: { rhema_ic: "GOOD" },
      }),
    }),
  );

/** The persisted OAuth state rows' decoded `value` JSONs (serverContext survives the redirect here). */
function stateValues(db: MemoryDB): Record<string, unknown>[] {
  return (db.verification ?? []).map((row) => JSON.parse((row as { value: string }).value));
}

describe("SEC.2 — OAuth invite code: serverContext promotion only behind the verified stamp", () => {
  it("a verified internal token promotes additionalData.rhema_ic into state.serverContext", async () => {
    const db: MemoryDB = {};
    const { auth } = authWith(
      db,
      admission({ verifyInternalToken: async (t) => t === "good-token" }),
    );
    const res = await socialSignIn(auth, { "x-rhema-internal-token": "good-token" });
    expect(res.status).toBe(200);
    const states = stateValues(db);
    expect(states).toHaveLength(1);
    expect((states[0]!.serverContext as Record<string, unknown>)?.rhema_ic).toBe("GOOD");
  });

  it("a forged token leaves the code client-supplied — NO serverContext half is written", async () => {
    const db: MemoryDB = {};
    const { auth } = authWith(
      db,
      admission({ verifyInternalToken: async () => false }),
    );
    const res = await socialSignIn(auth, { "x-rhema-internal-token": "forged" });
    expect(res.status).toBe(200); // the sign-in itself proceeds — only the trusted channel is withheld
    const states = stateValues(db);
    expect(states).toHaveLength(1);
    expect(states[0]!.serverContext).toBeUndefined();
  });

  it("no token at all ⇒ no promotion either (the unforgeable-by-construction posture)", async () => {
    const db: MemoryDB = {};
    const { auth } = authWith(
      db,
      admission({ verifyInternalToken: async () => true }),
    );
    const res = await socialSignIn(auth);
    expect(res.status).toBe(200);
    expect(stateValues(db)[0]!.serverContext).toBeUndefined();
  });
});

// MAINT.4 — the OAuth sign-in START throttle rides the audited channel (the library's
// built-in limiter is DISABLED: under ADR-040 its `getIP` resolved null on every request
// and keyed ONE global `no-trusted-ip` bucket — prod's 3-starts/10s-for-everyone 429s).
// `NODE_ENV=test` leaves the library limiter off anyway, so the config is asserted
// directly and the behavior tests pin the app channel's wiring, not the library's.
describe("MAINT.4 — the app-owned OAuth sign-in start throttle", () => {
  it("the built-in rate limiter is disabled on the built auth instance", () => {
    const auth = createAuth(DEV, memoryAdapter({}), noSend, { admission: admission() });
    expect(auth.options.rateLimit?.enabled).toBe(false);
  });

  it("rapid starts from distinct stamped IPs never share a bucket (the library's global-bucket regression)", async () => {
    const db: MemoryDB = {};
    const { auth } = authWith(
      db,
      admission({
        verifyInternalToken: async (t) => t === "good-token",
        signinThrottle: createIpEmailThrottle({ perIp: 2, perEmail: 100, windowMs: 10_000 }),
      }),
    );
    // 4 starts inside one 10 s window from 4 distinct trusted IPs — the library's old
    // `/sign-in/*` rule (3/10s on ONE global bucket) would have 429'd the 4th; the app
    // channel keys per verified IP, so every distinct client gets its own budget.
    for (let i = 1; i <= 4; i++) {
      const res = await socialSignIn(auth, {
        "x-rhema-internal-token": "good-token",
        "x-rhema-client-ip": `10.0.0.${i}`,
      });
      expect(res.status, `stamped 10.0.0.${i}`).toBe(200);
    }
  });

  it("same-IP abuse still throttles via the app channel → 429 rate_limited", async () => {
    const db: MemoryDB = {};
    const { auth } = authWith(
      db,
      admission({
        verifyInternalToken: async (t) => t === "good-token",
        signinThrottle: createIpEmailThrottle({ perIp: 2, perEmail: 100, windowMs: 10_000 }),
      }),
    );
    const stamp = { "x-rhema-internal-token": "good-token", "x-rhema-client-ip": "10.1.2.3" };
    expect((await socialSignIn(auth, stamp)).status).toBe(200);
    expect((await socialSignIn(auth, stamp)).status).toBe(200);
    const res = await socialSignIn(auth, stamp);
    expect(res.status).toBe(429);
    expect(((await res.json()) as { message?: string }).message).toBe("rate_limited");
  });

  it("an unstamped caller keys on the penultimate XFF hop — the ADR-040 trust rule unchanged", async () => {
    const db: MemoryDB = {};
    const { auth } = authWith(
      db,
      admission({
        signinThrottle: createIpEmailThrottle({ perIp: 2, perEmail: 100, windowMs: 10_000 }),
      }),
    );
    // Three chains with DIFFERENT forged first hops but the same penultimate (LB-attested)
    // hop share one bucket — the forged hops cannot spread the abuse across buckets.
    expect((await socialSignIn(auth, { "x-forwarded-for": "1.2.3.4, 7.7.7.7, 130.211.0.1" })).status).toBe(200);
    expect((await socialSignIn(auth, { "x-forwarded-for": "5.6.7.8, 7.7.7.7, 130.211.0.1" })).status).toBe(200);
    expect((await socialSignIn(auth, { "x-forwarded-for": "9.9.9.9, 7.7.7.7, 130.211.0.1" })).status).toBe(429);
    // a different penultimate hop is a different bucket entirely.
    expect((await socialSignIn(auth, { "x-forwarded-for": "9.9.9.9, 8.8.8.8, 130.211.0.1" })).status).toBe(200);
  });
});

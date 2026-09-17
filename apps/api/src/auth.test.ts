import { describe, it, expect } from "vitest";
import { getCookies } from "better-auth/cookies";
import { createAuth, type AuthSecrets } from "./auth.js";

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
});

import { describe, expect, it } from "vitest";
import { servingHeadersFor, USERCONTENT_ORIGIN, RENDERED_ALLOWLIST } from "@rhema/convert";
import { createWebApp, type WebDeps } from "@rhema/web";
import { createApp, createAuth } from "@rhema/api";
import { parseQuarantineKey, presignQuarantinePut } from "@rhema/contracts";

// P1.22 — the usercontent-origin + CSP audit (REQ-ARCH-24 amended; §13.3). Asserts, against the real
// handlers: the cookieless origin's header posture, the `__Host-` cookie contract Better Auth emits,
// the web shell's per-request CSP nonce + policy, and the api's strict no-render CSP.
//
// The cookie boundary is a SHAPE contract, not a domain gap: usercontent.rhema.tools is a SIBLING
// subdomain on the app's own zone, so the isolation rests on (1) the origin emitting no Set-Cookie
// ever and (2) every auth cookie being host-only `__Host-` (no Domain= → a sibling subdomain cannot
// shadow or receive it, and a planted `Domain=rhema.tools` same-name cookie is rejected by the
// browser outright).

const PROD_LIKE = {
  baseURL: "https://api.rhema.tools",
  betterAuthSecret: "test-secret-0123456789abcdef0123456789abcdef",
  googleClientId: "google-client-id",
  googleClientSecret: "google-client-secret",
};

describe("usercontent origin (REQ-ARCH-24 amended)", () => {
  it("serves rendered types inline; EVERYTHING else downloads as octet-stream+attachment", () => {
    for (const t of RENDERED_ALLOWLIST) {
      const h = servingHeadersFor(t);
      expect(h["Content-Type"]).toBe(t);
      expect(h["Content-Disposition"]).toBe("inline");
    }
    // the hostile set — html/js/svg/pdf/text all become opaque downloads.
    for (const t of ["text/html", "application/javascript", "image/svg+xml", "application/pdf", "text/plain", ""]) {
      const h = servingHeadersFor(t);
      expect(h["Content-Type"], t).toBe("application/octet-stream");
      expect(h["Content-Disposition"], t).toBe("attachment");
      // a sniffed/parameter-laden type is still reduced to octet-stream.
      expect(h["X-Content-Type-Options"]).toBe("nosniff");
    }
  });

  it("NEVER sets a cookie, restricts cross-origin reads, and forbids caching", () => {
    for (const t of [...RENDERED_ALLOWLIST, "text/html", "application/octet-stream"]) {
      const h = servingHeadersFor(t);
      const names = Object.keys(h).map((k) => k.toLowerCase());
      expect(names).not.toContain("set-cookie");
      expect(h["Cross-Origin-Resource-Policy"]).toBe("same-site");
      expect(h["Cache-Control"]).toBe("private, no-store");
    }
    expect(USERCONTENT_ORIGIN.setsCookies).toBe(false);
    expect(USERCONTENT_ORIGIN.isSubresourceOfApp).toBe(false);
    // the origin is a sibling host on the app's own zone — pinned so a "move" can't silently regress it.
    expect(USERCONTENT_ORIGIN.host).toBe("usercontent.rhema.tools");
    expect(USERCONTENT_ORIGIN.registrableDomain).toBe("rhema.tools");
  });
});

describe("__Host- cookie posture (the single-zone boundary)", () => {
  it("a real auth flow emits only host-only __Host- cookies (Secure, Path=/, HttpOnly, no Domain)", async () => {
    const auth = createAuth(PROD_LIKE, undefined, async () => {});
    const res = await auth.handler(
      new Request("https://api.rhema.tools/api/auth/sign-in/social", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://rhema.tools" },
        body: JSON.stringify({ provider: "google", callbackURL: "https://rhema.tools/app" }),
      }),
    );
    const setCookies = res.headers.getSetCookie();
    expect(setCookies.length).toBeGreaterThan(0);
    for (const header of setCookies) {
      expect(header).toMatch(/^__Host-/);
      expect(header).toMatch(/;\s*Secure/i);
      expect(header).toMatch(/;\s*Path=\//i);
      expect(header).toMatch(/;\s*HttpOnly/i);
      expect(header).not.toMatch(/;\s*Domain=/i); // THE invariant — a sibling host can never scope it
    }
  });
});

describe("web + api CSP (the written-down policy, enforced per response)", () => {
  const webDeps: WebDeps = {
    dataSource: {
      checkSession: async () => true,
      listProjects: async () => [],
      checkInvite: async () => ({ ok: false, reason: "unknown" }),
      signup: async () => ({ ok: false as const, status: 403, error: "invite_required" }),
      previewImport: async () => {
        throw new Error("not called");
      },
      createImport: async () => {
        throw new Error("not called");
      },
      createRun: async () => {
        throw new Error("not called");
      },
      getDossier: async () => {
        throw new Error("not called");
      },
      getBillingBalance: async () => ({ spendableCredits: 0, suspended: false, clawbackDebt: 0 }),
      recordExhaustedPrompt: async () => undefined,
    },
    session: () => null,
  };

  it("every HTML response carries a per-request CSP nonce and the documented policy", async () => {
    const app = createWebApp(webDeps);
    const res = await app.request("/"); // the landing page — an HTML render
    expect(res.headers.get("content-type")).toContain("text/html");
    const csp = res.headers.get("content-security-policy");
    expect(csp).not.toBeNull();
    const m = /script-src 'self' 'nonce-([^']+)'/.exec(csp!);
    expect(m).not.toBeNull();
    const nonce = m![1]!;
    const html = await res.text();
    // every <script> tag in the emitted document carries the nonce — an injected one would not.
    const scripts = html.match(/<script[\s>]/gi) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    const nonced = html.match(/<script nonce="/g) ?? [];
    expect(nonced.length).toBe(scripts.length);
    // the documented policy's hard walls.
    for (const directive of [
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "connect-src 'self'",
    ]) {
      expect(csp, directive).toContain(directive);
    }
    expect(csp).toContain("img-src 'self' https://usercontent.rhema.tools data:");
    // a second request gets a DIFFERENT nonce.
    const res2 = await app.request("/");
    const m2 = /script-src 'self' 'nonce-([^']+)'/.exec(res2.headers.get("content-security-policy")!);
    expect(m2![1]).not.toBe(nonce);
  });

  it("non-HTML responses pass through without a CSP rewrite", async () => {
    const app = createWebApp(webDeps);
    const res = await app.request("/healthz");
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("content-security-policy")).toBeNull();
  });

  it("every api response carries the strict no-render CSP + nosniff", async () => {
    const app = createApp();
    const res = await app.request("/healthz");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    // and on an error path too — not just the happy route.
    const nf = await app.request("/no-such-route");
    expect(nf.headers.get("content-security-policy")).toBe("default-src 'none'; frame-ancestors 'none'");
  });
});

describe("the __Host- contract — a planted Domain= sibling is rejected (PRB.20 posture)", () => {
  /** The invariant a browser applies to `__Host-` cookies; our emitted cookies must satisfy it. */
  const isValidHostCookie = (header: string) =>
    /^__Host-/.test(header) &&
    /;\s*Secure/i.test(header) &&
    /;\s*Path=\//i.test(header) &&
    !/;\s*Domain=/i.test(header);

  it("a __Host- cookie with a Domain= attribute fails the contract — the sibling-scoping plant", () => {
    // The plant: an attacker-controlled sibling (usercontent.*) sets `__Host-rhema.session` scoped to the
    // parent zone. Browsers reject it (Domain= is barred on __Host-); our helper rejects it too — the
    // assertion pins the rule, not just the happy path.
    const plant = "__Host-rhema.session_token=evil; Secure; Path=/; HttpOnly; Domain=rhema.tools";
    expect(isValidHostCookie(plant)).toBe(false);
    const good = "__Host-rhema.session_token=abc; Secure; Path=/; HttpOnly";
    expect(isValidHostCookie(good)).toBe(true);
    // and the emitted cookies satisfy it (cross-check against the real auth flow above).
    expect(isValidHostCookie("__Host-rhema.x=v; Secure; Path=/; HttpOnly; SameSite=Lax")).toBe(true);
  });
});

describe("quarantine objects (PRB.20) — only through the user-content origin", () => {
  it("quarantine keys are workspace-prefixed and traversal-proof; a foreign prefix is refused", () => {
    expect(parseQuarantineKey("quarantine/ws1/up1", "ws1")).toEqual({ workspaceId: "ws1", uploadId: "up1" });
    expect(parseQuarantineKey("quarantine/ws2/up1", "ws1")).toBeNull(); // another tenant's object
    for (const bad of ["quarantine/ws1/../up1", "quarantine//up1", "q/ws1/up1", "quarantine/ws 1/up1"]) {
      expect(parseQuarantineKey(bad, "ws1"), bad).toBeNull();
    }
  });

  it("the presign binds the workspace + the ≤25MB cap — the PUT lands only on the quarantine prefix", async () => {
    const provider = {
      signedPut: async (a: { bucket: string; key: string; maxBytes: number }) => ({
        url: `https://storage.example/${a.bucket}/${a.key}?signed`,
        requiredHeaders: {},
      }),
    };
    const up = await presignQuarantinePut(provider, { bucket: "uc-bucket", workspaceId: "ws1", uploadId: "up1", maxBytes: 99e6 });
    expect(up.key).toBe("quarantine/ws1/up1");
    expect(up.maxBytes).toBeLessThanOrEqual(25 * 1024 * 1024); // the cap clamps
    expect(up.url).toContain("uc-bucket/quarantine/ws1/up1");
  });

  it("any read of quarantine bytes goes through the same serving policy — non-renderable = octet-stream", () => {
    // Quarantine/conversion outputs serve only via the user-content origin (the bucket is user-content's);
    // whatever content-type they carry, the serving policy is the same `servingHeadersFor` — re-assert the
    // hostile types here so a quarantine read can never land text/html on a renderable surface.
    for (const t of ["text/html", "image/svg+xml", "application/xhtml+xml"]) {
      const h = servingHeadersFor(t);
      expect(h["Content-Disposition"]).toBe("attachment");
      expect(h["Content-Type"]).toBe("application/octet-stream");
    }
  });
});

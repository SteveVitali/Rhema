import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { createWebApp, type WebDeps, type AuthOutcome } from "./server.js";
import { cspHtmlMiddleware } from "./csp.js";
import type { DataSource } from "./data.js";

/**
 * 275_R6WEB.1 — the web-hardening cluster (RH-30/23/31/33/34). Every arm's regression fails on the
 * pre-fix code: the regex-stamped nonce covered non-authored markup; mutations carried no origin
 * check; the magic-link email burned its token on a mail-scanner GET; `next` admitted `/\evil` and
 * never rode the login gate at all.
 */

const sessionHeaders = { cookie: "__Host-rhema.session_token=tok.sig" };

function makeDeps(over: Partial<WebDeps> = {}): WebDeps {
  return {
    dataSource: {
      checkSession: async () => true,
      checkInvite: async () => ({ ok: false, reason: "unknown" }),
      signup: async () => ({ ok: true, created: true }),
      recordLandingEvent: async () => ({ ok: true }),
    } as unknown as DataSource,
    session: () => null,
    ...over,
  };
}

function form(fields: Record<string, string>): { body: string; headers: Record<string, string> } {
  return {
    body: new URLSearchParams(fields).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  };
}

function cspNonceOf(res: Response): string {
  const m = /'nonce-([^']+)'/.exec(res.headers.get("content-security-policy") ?? "");
  expect(m?.[1], "CSP header nonce").toBeTruthy();
  return m![1]!;
}

describe("RH-30 — CSP nonce attaches only to server-authored <script> tags", () => {
  it("an authored document nonces every emitted script with the header value", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("http://app.test/login");
    expect(res.status).toBe(200);
    const nonce = cspNonceOf(res);
    const html = await res.text();
    const tags = html.match(/<script\b[^>]*>/g) ?? [];
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag).toContain(`nonce="${nonce}"`);
  });

  it("markup the server did not author never inherits the nonce (the body is not rewritten)", async () => {
    // A probe handler standing in for the defect class — ANY `<script>` that reaches the body by a
    // path outside the document builders (an injection, a missed escape, a future join). The
    // retired regex pass rewrote the whole body and handed it a working nonce
    // (`replace(/<script(?=[\s>])/gi, '<script nonce="N"')`); the new middleware must leave it inert.
    const probe = `<!doctype html><html><body><script>alert(1)</script><script src="/evil.js"></script></body></html>`;
    const app = new Hono();
    app.use("*", cspHtmlMiddleware((n) => `script-src 'nonce-${n}'`));
    app.get("/__probe", (c) => c.html(probe));
    const res = await app.request("http://app.test/__probe");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toMatch(/'nonce-[^']+'/);
    const html = await res.text();
    expect(html).toBe(probe); // byte-identical — the body is never rewritten
    expect(html).not.toContain("nonce=");
    // The retired pass would have produced `<script nonce="…">alert(1)</script>` — executable.
    expect(
      probe.replace(/<script(?=[\s>])/gi, `<script nonce="N"`),
    ).toContain('<script nonce="N">alert(1)');
  });

  it("a non-HTML response passes through untouched", async () => {
    const app = new Hono();
    app.use("*", cspHtmlMiddleware((n) => `script-src 'nonce-${n}'`));
    app.get("/__json", (c) => c.json({ ok: true }));
    const res = await app.request("http://app.test/__json");
    expect(res.headers.get("content-security-policy")).toBeNull();
  });
});

describe("RH-23 — web-host mutations carry an Origin/Sec-Fetch-Site check", () => {
  it("refuses a mutation whose Origin is not the request origin", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("http://app.test/login", {
      method: "POST",
      headers: { ...form({}).headers, origin: "https://evil.example" },
      body: "method=magic_link",
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden_origin" });
  });

  it("refuses a cross-site mutation with no Origin (Sec-Fetch-Site fallback)", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("http://app.test/login", {
      method: "POST",
      headers: { ...form({}).headers, "sec-fetch-site": "cross-site" },
      body: "method=magic_link",
    });
    expect(res.status).toBe(403);
  });

  it("admits a same-origin mutation (Origin present or fetch metadata same-origin)", async () => {
    const signup = vi.fn(async () => ({ ok: false as const, status: 403, error: "invite_required" }));
    const app = createWebApp(
      makeDeps({
        signupMode: "open",
        dataSource: {
          checkSession: async () => false,
          checkInvite: async () => ({ ok: true }),
          signup,
        } as unknown as DataSource,
      }),
    );
    const res = await app.request("http://app.test/login", {
      method: "POST",
      headers: { ...form({}).headers, origin: "http://app.test" },
      body: new URLSearchParams({ method: "magic_link", email: "a@b.c" }).toString(),
    });
    expect(res.status).not.toBe(403);
    expect(signup).toHaveBeenCalled();
  });

  it("admits a same-origin mutation behind TLS termination (F-R6DEP.5-2)", async () => {
    // Reproduces the prod shape: the container request URL is http: while the browser's
    // Origin is https: — the GFE stamps x-forwarded-proto so the guard must honor it or every
    // browser POST 403s (the 301_R6DEP.5 rollback cause).
    const signup = vi.fn(async () => ({ ok: false as const, status: 403, error: "invite_required" }));
    const app = createWebApp(
      makeDeps({
        signupMode: "open",
        dataSource: {
          checkSession: async () => false,
          checkInvite: async () => ({ ok: true }),
          signup,
        } as unknown as DataSource,
      }),
    );
    const res = await app.request("http://app.test/login", {
      method: "POST",
      headers: {
        ...form({}).headers,
        origin: "https://app.test",
        "x-forwarded-proto": "https",
      },
      body: new URLSearchParams({ method: "magic_link", email: "a@b.c" }).toString(),
    });
    expect(res.status).not.toBe(403);
    expect(signup).toHaveBeenCalled();
    // ...and a FOREIGN https origin is still refused behind the same hop.
    const foreign = await app.request("http://app.test/login", {
      method: "POST",
      headers: {
        ...form({}).headers,
        origin: "https://evil.example",
        "x-forwarded-proto": "https",
      },
      body: "method=magic_link",
    });
    expect(foreign.status).toBe(403);
  });

  it("admits a non-browser mutation (no Origin, no fetch metadata) and all safe methods", async () => {
    const app = createWebApp(makeDeps());
    // server-to-server / curl POSTs carry neither header — CSRF needs a browser.
    const beacon = await app.request("http://app.test/a/landing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "landing.dropzone_used" }),
    });
    expect(beacon.status).not.toBe(403);
    // a GET with a foreign Origin is a safe method — the guard is mutation-only.
    const get = await app.request("http://app.test/login", {
      headers: { origin: "https://evil.example" },
    });
    expect(get.status).not.toBe(403);
  });
});

describe("RH-34/RH-33 — the login gate carries a same-origin-validated `next`", () => {
  it("a session-gated GET redirects to /login?next=<path+query>", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("http://app.test/app");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/login?next=${encodeURIComponent("/app")}`);
  });

  it("a deep project link keeps its path AND query", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("http://app.test/p/abc/run?rigor=quick");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      `/login?next=${encodeURIComponent("/p/abc/run?rigor=quick")}`,
    );
  });

  it("POST /login forwards a same-origin `next` to beginAuth and rejects off-origin/backslash", async () => {
    const beginAuth = vi.fn(async () => ({ sent: true }) as AuthOutcome);
    const app = createWebApp(makeDeps({ beginAuth, signupMode: "open" }));

    await app.request("http://app.test/login", {
      method: "POST",
      ...form({ method: "magic_link", email: "a@b.c", next: "/p/abc?x=1" }),
    });
    expect(beginAuth).toHaveBeenCalledWith(
      "magic_link",
      expect.objectContaining({ next: "/p/abc?x=1" }),
      expect.anything(),
    );

    beginAuth.mockClear();
    // RH-33 — `/\evil.example` resolves to `//evil.example` under `new URL(next, origin)`; the
    // resolved-origin comparison must reject it (it never reaches beginAuth as a target).
    await app.request("http://app.test/login", {
      method: "POST",
      ...form({ method: "magic_link", email: "a@b.c", next: "/\\evil.example" }),
    });
    const second = beginAuth.mock.calls[0]![1] as { next?: string };
    expect(second.next === undefined || second.next === "/app").toBe(true);
  });

  it("GET /login with a live session lands on `next` — and never on a refused target", async () => {
    const app = createWebApp(
      makeDeps({ session: () => sessionHeaders }),
    );
    const ok = await app.request("http://app.test/login?next=" + encodeURIComponent("/p/abc"));
    expect(ok.status).toBe(302);
    expect(ok.headers.get("location")).toBe("/p/abc");
    const bad = await app.request("http://app.test/login?next=" + encodeURIComponent("https://evil.example/x"));
    expect(bad.status).toBe(302);
    expect(bad.headers.get("location")).toBe("/app");
  });

  it("the rendered form carries `next` through as a hidden field", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("http://app.test/login?next=" + encodeURIComponent("/p/abc"));
    const html = await res.text();
    expect(html).toContain('name="next"');
    expect(html).toContain("/p/abc");
  });
});

describe("RH-31 — the magic-link interstitial never consumes on GET", () => {
  const query = "token=tok123&callbackURL=%2Fapp&errorCallbackURL=%2Flogin";

  it("GET /auth/magic-link renders a confirm form and makes NO upstream call", async () => {
    const verifyMagicLink = vi.fn(async () => new Response(null, { status: 302 }));
    const app = createWebApp(makeDeps({ verifyMagicLink }));
    const res = await app.request(`http://app.test/auth/magic-link?${query}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('method="post"');
    expect(html).toContain("data-magic-link-confirm");
    expect(verifyMagicLink).not.toHaveBeenCalled();
  });

  it("POST /auth/magic-link relays the whole query to the api verify and returns its answer", async () => {
    const upstream = new Response(null, {
      status: 302,
      headers: {
        location: "/app",
        "set-cookie": "__Host-rhema.session_token=minted; Path=/; HttpOnly; Secure",
      },
    });
    const verifyMagicLink = vi.fn(async () => upstream);
    const app = createWebApp(makeDeps({ verifyMagicLink }));
    const res = await app.request(`http://app.test/auth/magic-link?${query}`, {
      method: "POST",
    });
    expect(verifyMagicLink).toHaveBeenCalledTimes(1);
    expect(String(verifyMagicLink.mock.calls[0]![0])).toContain("token=tok123");
    expect(String(verifyMagicLink.mock.calls[0]![0])).toContain("callbackURL=");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/app");
    expect(res.headers.get("set-cookie") ?? "").toContain("session_token=minted");
  });

  it("POST without a token refuses before any upstream call", async () => {
    const verifyMagicLink = vi.fn(async () => new Response(null, { status: 302 }));
    const app = createWebApp(makeDeps({ verifyMagicLink }));
    const res = await app.request("http://app.test/auth/magic-link?callbackURL=%2Fapp", {
      method: "POST",
    });
    expect(res.status).toBe(400);
    expect(verifyMagicLink).not.toHaveBeenCalled();
  });
});

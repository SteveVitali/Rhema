import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { ApiError } from "@rhema/api-client";
import type { ProjectRow } from "@rhema/api-client";
import { createWebApp } from "./server.js";
import type { WebDeps } from "./server.js";
import { requestContext } from "./observability.js";
import {
  bffRoute,
  confirmEmailHandler,
  externalNavTarget,
  mutationOutcome,
  projectHandoffHandler,
  projectRow,
  projectRows,
  swallowDegraded,
  wantsJson,
  type BffDeps,
} from "./bff.js";
import type { DataSource } from "./data.js";

// SPA.5 — the BFF conventions (REQ-BFF-1..12,14..30; REQ-DAT-1..14; REQ-SAFE-6/R11; REQ-INV-3..5).
// Driven through real Hono `app.request`s — no network — with a counting in-memory DataSource.

const SESSION = { cookie: "tok" };

const ROWS: ProjectRow[] = [
  {
    id: "proj_pv",
    slug: "the-politics-of-visibility",
    title: "The Politics of Visibility",
    state: { key: "draft", pill: "Draft", overlay: null, suggested: { action: "review", label: "Review" } },
  },
];

function deps(over: Partial<DataSource> = {}, session: WebDeps["session"] = () => SESSION): BffDeps {
  return { session, dataSource: { listProjects: async () => ROWS, ...over } as DataSource };
}

/** A mini app carrying the real request-id middleware so header echo + log lines are pinned. */
function miniApp(mount: (app: Hono, d: BffDeps) => void, d: BffDeps): Hono {
  const app = new Hono();
  app.use("*", requestContext(undefined));
  mount(app, d);
  return app;
}

const jsonPost = { method: "POST", headers: { "content-type": "application/json", accept: "application/json" } };

describe("wantsJson — the dual-mode predicate (REQ-BFF-1/2)", () => {
  const app = miniApp((a) => {
    a.post("/m", (c) => c.json({ json: wantsJson(c) }));
  }, deps());
  it("accept: application/json selects the JSON branch", async () => {
    const res = await app.request("/m", { method: "POST", headers: { accept: "application/json" } });
    expect(await res.json()).toEqual({ json: true });
  });
  it("content-type: application/json selects the JSON branch", async () => {
    const res = await app.request("/m", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(await res.json()).toEqual({ json: true });
  });
  it("a form post does NOT (the 302+flash leg survives)", async () => {
    const res = await app.request("/m", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "a=1",
    });
    expect(await res.json()).toEqual({ json: false });
  });
});

describe("mutationOutcome — the {ok,redirect,flash,data,pending,url} envelope (REQ-BFF-3, REQ-DAT-3, REQ-INV-3)", () => {
  const app = miniApp((a) => {
    a.post("/m", (c) =>
      mutationOutcome(c, {
        redirect: "/p/the-politics-of-visibility?disposed=f_1",
        flash: { disposed: "f_1" },
        data: { ok: true },
      }),
    );
    a.post("/u", (c) => mutationOutcome(c, { url: "https://checkout.stripe.com/c/pay/cs_1" }));
    a.post("/u-bad", (c) => mutationOutcome(c, { url: "https://checkout.stripe.com.evil.test/c/pay/cs_1" }));
  }, deps());

  it("JSON callers get the envelope — redirect carries the flash-parameterized URL verbatim", async () => {
    const res = await app.request("/m", { ...jsonPost, body: "{}" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      redirect: "/p/the-politics-of-visibility?disposed=f_1",
      flash: { disposed: "f_1" },
      data: { ok: true },
    });
  });

  it("form posts keep the 302 to the same URL (POST→302 parity)", async () => {
    const res = await app.request("/m", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "x=1",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-politics-of-visibility?disposed=f_1");
  });

  it("a validated external hand-off arrives as {url} for JSON callers", async () => {
    const res = await app.request("/u", { ...jsonPost, body: "{}" });
    expect(await res.json()).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_1" });
  });

  it("…and as the form post's 302 (today's mint→validate→302 behavior)", async () => {
    const res = await app.request("/u", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "x=1",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://checkout.stripe.com/c/pay/cs_1");
  });

  it("a refused {url} is the error envelope — the unvalidated URL never serializes (REQ-BFF-27)", async () => {
    const res = await app.request("/u-bad", { ...jsonPost, body: "{}" });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({ error: "external_nav_refused" });
    expect(JSON.stringify(body)).not.toContain("evil.test");
  });

  it("a refused {url} never becomes a form 302 either", async () => {
    const res = await app.request("/u-bad", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "x=1",
    });
    expect(res.status).toBe(502);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("externalNavTarget — the allowlist is the sole enforcement (REQ-SAFE-6 amended, R11)", () => {
  it.each([
    "https://checkout.stripe.com/c/pay/cs_test",
    "https://billing.stripe.com/p/session/test",
    "https://buy.stripe.com/test_abc",
    "https://accounts.google.com/o/oauth2/v2/auth?client_id=x",
  ])("permits the hosted origin %s", (url) => {
    expect(externalNavTarget(url)).toBe(url);
  });

  it.each([
    "https://checkout.stripe.com.evil.test/c/pay/cs_1", // suffix lookalike
    "https://checkout.stripe.com@evil.test/", // userinfo trick
    "https://evil.test/?next=checkout.stripe.com", // wrapped lookalike
    "http://checkout.stripe.com/c/pay/cs_1", // scheme downgrade
    "//checkout.stripe.com/c/pay/cs_1", // protocol-relative
    "javascript:alert(1)",
    "data:text/html,<script></script>",
    "/p/the-politics-of-visibility", // internal navs are `redirect`, never `url`
    "https://stripe.com/", // stripe.com proper is NOT a hosted surface
    "not a url",
  ])("refuses %s", (url) => {
    expect(externalNavTarget(url)).toBeNull();
  });
});

describe("bffRoute — session gate + the {error, detail?} envelope at preserved status (REQ-BFF-4, REQ-DAT-2/10)", () => {
  const lines: string[] = [];
  const errSpy = vi.spyOn(console, "error").mockImplementation((m: unknown) => lines.push(String(m)));
  const app = miniApp((a, d) => {
    a.get("/bff/x", bffRoute(d, (c) => c.json({ ok: true })));
    a.get("/bff/e/:status", bffRoute(d, (c) => {
      const status = Number(c.req.param("status"));
      throw new ApiError(status, "http://api/x", undefined, `code_${status}`, status === 422 ? { issue: "bad field" } : undefined);
    }));
    a.get("/bff/boom", bffRoute(d, () => { throw new TypeError("kaboom"); }));
  }, deps());

  it("no session → 401 {error:unauthenticated} — a JSON answer, never a redirect", async () => {
    const bare = new Hono();
    bare.get("/bff/x", bffRoute(deps({}, () => null), (c) => c.json({ ok: true })));
    const res = await bare.request("/bff/x");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
  });

  it("success passes through with the request id echoed", async () => {
    const res = await app.request("/bff/x");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("x-rhema-request-id")).toBeTruthy();
  });

  it("an api 409 passes its code through UNRENAMED at 409", async () => {
    const res = await app.request("/bff/e/409");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "code_409" });
  });

  it("a 422's {error,detail} body passes through verbatim", async () => {
    const res = await app.request("/bff/e/422");
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "code_422", detail: { issue: "bad field" } });
  });

  it("an upstream ≥500 collapses to the 502 gateway code — detail does not leak", async () => {
    const res = await app.request("/bff/e/503");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "upstream_unavailable" });
  });

  it("an api 401 is the unauthenticated envelope, NOT a /login redirect", async () => {
    const res = await app.request("/bff/e/401");
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
    expect(await res.json()).toEqual({ error: "unauthenticated" });
  });

  it("a non-ApiError is one structured line + {error:internal_error} 500 with the request id", async () => {
    lines.length = 0;
    const res = await app.request("/bff/boom");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal_error" });
    const requestId = res.headers.get("x-rhema-request-id");
    expect(requestId).toBeTruthy();
    expect(lines.length).toBe(1);
    const line = JSON.parse(lines[0]!);
    expect(line).toMatchObject({
      msg: "bff_unhandled_error",
      service: "web",
      route: "/bff/boom",
      status: 500,
      severity: "ERROR",
      requestId,
      errorClass: "TypeError",
    });
    expect(JSON.stringify(line)).not.toContain("kaboom"); // the message never reaches the log
  });

  it("an expected <500 refusal logs a WARNING line, a ≥500 an ERROR", async () => {
    lines.length = 0;
    await app.request("/bff/e/409");
    await app.request("/bff/e/503");
    expect(JSON.parse(lines[0]!)).toMatchObject({ severity: "WARNING", upstreamStatus: 409, upstreamCode: "code_409" });
    expect(JSON.parse(lines[1]!)).toMatchObject({ severity: "ERROR", upstreamStatus: 503 });
  });
  void errSpy;
});

describe("slug→id memo — once per request, request-scoped (REQ-BFF-11, REQ-DAT-6)", () => {
  it("two projectRow calls in one request issue exactly ONE listProjects", async () => {
    const listProjects = vi.fn(async () => ROWS);
    const d = deps({ listProjects });
    const app = miniApp((a) => {
      a.get("/t/:slug", async (c) => {
        const first = await projectRow(c, d.dataSource, SESSION, c.req.param("slug"));
        const second = await projectRow(c, d.dataSource, SESSION, c.req.param("slug"));
        return c.json({ same: first === second, slug: first?.slug ?? null });
      });
    }, d);
    const res = await app.request("/t/the-politics-of-visibility");
    expect(await res.json()).toEqual({ same: true, slug: "the-politics-of-visibility" });
    expect(listProjects).toHaveBeenCalledTimes(1);
  });

  it("the memo is per-request — the NEXT request re-lists (authorization-safe)", async () => {
    const listProjects = vi.fn(async () => ROWS);
    const d = deps({ listProjects });
    const app = miniApp((a) => {
      a.get("/t/:slug", async (c) => c.json({ n: (await projectRows(c, d.dataSource, SESSION)).length }));
    }, d);
    await app.request("/t/x");
    await app.request("/t/x");
    expect(listProjects).toHaveBeenCalledTimes(2);
  });
});

describe("swallowDegraded — the aggregate's best-effort swallow (REQ-BFF-9, REQ-DAT-12)", () => {
  it("a degraded read becomes null; an upstream 401 rethrows", () => {
    expect(swallowDegraded(new ApiError(503, "x"))).toBeNull();
    expect(swallowDegraded(new ApiError(404, "x"))).toBeNull();
    expect(swallowDegraded(new Error("drop"))).toBeNull();
    expect(() => swallowDegraded(new ApiError(401, "x"))).toThrow(ApiError);
  });
});

describe("confirm-email convention (REQ-BFF-21 — SPA.12 wires the route)", () => {
  const mount = (d: BffDeps) =>
    miniApp((a) => a.post("/bff/settings/account/confirm-email", confirmEmailHandler(d)), d);

  it("a good token → {ok:true, redirect:…notice=email-confirmed, data:{email}}", async () => {
    const confirmEmailChange = vi.fn(async () => ({ ok: true as const, email: "n@e.w" }));
    const res = await mount(deps({ confirmEmailChange })).request("/bff/settings/account/confirm-email", {
      ...jsonPost,
      body: JSON.stringify({ token: "tok_1" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      redirect: "/app/settings/account?notice=email-confirmed",
      data: { email: "n@e.w" },
    });
    expect(confirmEmailChange).toHaveBeenCalledWith(SESSION, "tok_1");
  });

  it("the api's {error} arm → 200 with the failed notice (parity with the 302 bounce)", async () => {
    const res = await mount(deps({ confirmEmailChange: async () => ({ error: "expired" }) })).request(
      "/bff/settings/account/confirm-email",
      { ...jsonPost, body: JSON.stringify({ token: "tok_1" }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      redirect: "/app/settings/account?notice=email-confirm-failed",
    });
  });

  it.each([["{}", "absent"], [JSON.stringify({ token: 7 }), "non-string"], [JSON.stringify({ token: "tok" }), "thrown seam"]])(
    "a missing/bad token or a failed seam still lands the failed notice (%s)",
    async (body, mode) => {
      const seam =
        mode === "thrown seam"
          ? async () => { throw new ApiError(500, "x"); }
          : async () => ({ ok: true as const, email: "e" });
      const res = await mount(deps({ confirmEmailChange: seam })).request(
        "/bff/settings/account/confirm-email",
        { ...jsonPost, body },
      );
      expect(res.status).toBe(200);
      expect((await res.json()).redirect).toBe("/app/settings/account?notice=email-confirm-failed");
    },
  );
});

describe("project-handoff convention (REQ-BFF-22 — SPA.23 wires the route)", () => {
  const ITEM = {
    id: "inbox_1",
    kind: "event" as const,
    type: "run_finished",
    title: "Review finished",
    href: "/p/the-politics-of-visibility/review/run_1",
    projectId: "proj_pv",
    unread: true,
    createdAt: "2026-10-08T00:00:00Z",
  };
  const mount = (d: BffDeps) => miniApp((a) => a.post("/bff/p/:slug/handoff", projectHandoffHandler(d)), d);

  it("an unread run_finished row → {handoff:{href,inboxItemId}} + the idempotent mark", async () => {
    const markInboxItemRead = vi.fn(async () => ({ ok: true as const }));
    const res = await mount(deps({ getInbox: async () => [ITEM], markInboxItemRead })).request(
      "/bff/p/the-politics-of-visibility/handoff",
      { ...jsonPost, body: "{}" },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: { handoff: { href: ITEM.href, inboxItemId: "inbox_1" } },
    });
    expect(markInboxItemRead).toHaveBeenCalledWith(SESSION, "inbox_1");
  });

  it("nothing owed → {handoff:null}, no mark; a read item stays read", async () => {
    const markInboxItemRead = vi.fn(async () => ({ ok: true as const }));
    const res = await mount(
      deps({ getInbox: async () => [{ ...ITEM, unread: false }], markInboxItemRead }),
    ).request("/bff/p/the-politics-of-visibility/handoff", { ...jsonPost, body: "{}" });
    expect(await res.json()).toEqual({ ok: true, data: { handoff: null } });
    expect(markInboxItemRead).not.toHaveBeenCalled();
  });

  it("?focus=1 suppresses the handoff without consulting the inbox", async () => {
    const getInbox = vi.fn(async () => [ITEM]);
    const res = await mount(deps({ getInbox })).request(
      "/bff/p/the-politics-of-visibility/handoff?focus=1",
      { ...jsonPost, body: "{}" },
    );
    expect(await res.json()).toEqual({ ok: true, data: { handoff: null } });
    expect(getInbox).not.toHaveBeenCalled();
  });

  it("an unknown slug → 404 {error:not_found}", async () => {
    const res = await mount(deps({ getInbox: async () => [ITEM] })).request("/bff/p/no-such/handoff", {
      ...jsonPost,
      body: "{}",
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});

describe("GET /bff/usage — the reference read twin (REQ-BFF-1/8/9, REQ-DAT-1/4/12)", () => {
  const USAGE = { period: { start: "2026-10-01", end: "2026-11-01" }, totalCredits: 12 } ;
  const ACCOUNT = { spendableCredits: 200_000 };
  const webDeps = (over: Partial<DataSource>): WebDeps =>
    ({
      session: () => SESSION,
      dataSource: {
        checkSession: async () => true,
        listProjects: async () => ROWS,
        getUsage: async () => USAGE,
        getUsageAccount: async () => ACCOUNT,
        ...over,
      } as DataSource,
    }) as WebDeps;

  it("returns the aggregate payload — raw api-client DTOs", async () => {
    const res = await createWebApp(webDeps({})).request("/bff/usage", { headers: { accept: "application/json" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ usage: USAGE, account: ACCOUNT });
    expect(res.headers.get("x-rhema-request-id")).toBeTruthy();
  });

  it("a degraded seam lands null — the aggregate still answers (degrade semantics preserved)", async () => {
    const res = await createWebApp(
      webDeps({ getUsage: async () => { throw new ApiError(503, "x"); } }),
    ).request("/bff/usage", { headers: { accept: "application/json" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ usage: null, account: ACCOUNT });
  });

  it("an upstream 401 is NOT swallowed to null — the unauthenticated envelope answers", async () => {
    const res = await createWebApp(
      webDeps({ getUsage: async () => { throw new ApiError(401, "x"); } }),
    ).request("/bff/usage", { headers: { accept: "application/json" } });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
  });

  it("no session → 401 JSON, never a redirect", async () => {
    const res = await createWebApp({ ...webDeps({}), session: () => null }).request("/bff/usage", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
  });
});

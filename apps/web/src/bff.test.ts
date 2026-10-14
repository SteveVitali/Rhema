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

describe("GET /bff/p/:slug/usage — the level-2 project rollup twin (SPA.10; REQ-BFF-11, REQ-DAT-4/6)", () => {
  const PROJECT_USAGE = {
    projectId: "proj_pv",
    projectName: "The Politics of Visibility",
    totalCredits: 88,
    runs: [
      { runId: "run_1", at: "2026-10-02T00:00:00Z", workflow: "review", state: "finished", credits: 40, estimateCredits: 50, capCredits: 60 },
      { runId: "run_2", at: "2026-10-03T00:00:00Z", workflow: "write", state: "finished", credits: 48, estimateCredits: 55, capCredits: 70 },
    ],
  };
  const webDeps = (over: Partial<DataSource>): WebDeps =>
    ({
      session: () => SESSION,
      dataSource: {
        checkSession: async () => true,
        listProjects: async () => ROWS,
        getUsageProject: async () => PROJECT_USAGE,
        ...over,
      } as DataSource,
    }) as WebDeps;

  it("returns the typed rollup with the slug attached (the back-link needs no second read)", async () => {
    const res = await createWebApp(webDeps({})).request("/bff/p/the-politics-of-visibility/usage", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ usageProject: { ...PROJECT_USAGE, slug: "the-politics-of-visibility" } });
    expect(res.headers.get("x-rhema-request-id")).toBeTruthy();
  });

  it("resolves slug→id through the seam — the project id, not the slug, reaches the api read", async () => {
    const seen: string[] = [];
    const res = await createWebApp(
      webDeps({
        getUsageProject: async (_s: unknown, projectId: string) => {
          seen.push(projectId);
          return PROJECT_USAGE;
        },
      }),
    ).request("/bff/p/the-politics-of-visibility/usage", { headers: { accept: "application/json" } });
    expect(res.status).toBe(200);
    expect(seen).toEqual(["proj_pv"]);
  });

  it("an unknown slug → 404 {error:not_found} — the document's own answer, preserved", async () => {
    const res = await createWebApp(webDeps({})).request("/bff/p/nope/usage", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("a missed rollup read → the same 404 the document gives (SSR degrade parity)", async () => {
    const res = await createWebApp(
      webDeps({ getUsageProject: async () => { throw new ApiError(503, "x"); } }),
    ).request("/bff/p/the-politics-of-visibility/usage", { headers: { accept: "application/json" } });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("an upstream 401 is NOT swallowed — the unauthenticated envelope answers", async () => {
    const res = await createWebApp(
      webDeps({ getUsageProject: async () => { throw new ApiError(401, "x"); } }),
    ).request("/bff/p/the-politics-of-visibility/usage", { headers: { accept: "application/json" } });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
  });

  it("no session → 401 JSON, never a redirect", async () => {
    const res = await createWebApp({ ...webDeps({}), session: () => null }).request(
      "/bff/p/the-politics-of-visibility/usage",
      { headers: { accept: "application/json" } },
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
  });

  it("a cross-tenant slug never reaches the read — listProjects scopes resolution (REQ-DAT-6)", async () => {
    const seen: string[] = [];
    const res = await createWebApp(
      webDeps({
        getUsageProject: async (_s: unknown, projectId: string) => {
          seen.push(projectId);
          return PROJECT_USAGE;
        },
      }),
    ).request("/bff/p/foreign-tenant-slug/usage", { headers: { accept: "application/json" } });
    expect(res.status).toBe(404);
    expect(seen).toEqual([]); // the slug resolved to no row — the upstream read never ran
  });
});

describe("GET /bff/app/inbox — the §5.11 aggregate twin (SPA.11; REQ-BFF-1/8/9, REQ-DAT-4)", () => {
  const GATE_ITEM = {
    id: "gate:gate_1",
    kind: "blocked",
    type: "gate",
    title: "approve plan needs your call",
    href: "/p/seed-essay/review/run_1?gate=gate_1",
    projectId: "proj_1",
    unread: true,
    createdAt: "2026-09-20T00:00:00Z",
    gate: { gateId: "gate_1", runId: "run_1", kind: "approve_plan", workflow: "review", deadlineAt: null },
  };
  const EVENT_ITEM = {
    id: "ib_1",
    kind: "event",
    type: "run_finished",
    title: "Review finished",
    href: "/p/seed-essay/review/run_9",
    projectId: "proj_1",
    unread: true,
    createdAt: "2026-09-25T00:00:00Z",
  };
  const CARD = {
    id: "gate_1",
    runId: "run_1",
    kind: "approve_plan",
    workflow: "review",
    openedAt: "2026-09-20T00:00:00Z",
    pausedWhileReading: false,
    held: false,
    blocking: true,
    onExpiry: "wait",
    spentCredits: 120,
    capCredits: 2000,
  };
  const webDeps = (over: Partial<DataSource>, session: WebDeps["session"] = () => SESSION): WebDeps =>
    ({
      session,
      dataSource: {
        checkSession: async () => true,
        listProjects: async () => ROWS,
        getInbox: async () => [GATE_ITEM, EVENT_ITEM],
        getInboxBadge: async () => ({ count: 1 }),
        listGates: async () => [CARD],
        ...over,
      } as DataSource,
    }) as WebDeps;

  it("returns the aggregate — items verbatim + badge + the gate-card join keyed by item id", async () => {
    const res = await createWebApp(webDeps({})).request("/bff/app/inbox", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      items: [GATE_ITEM, EVENT_ITEM],
      badge: 1,
      gateCards: { "gate:gate_1": CARD },
    });
    expect(res.headers.get("x-rhema-request-id")).toBeTruthy();
  });

  it("lists gates once per distinct project — a shared project id joins through ONE read", async () => {
    const calls: string[] = [];
    const second = {
      ...GATE_ITEM,
      id: "gate:gate_2",
      gate: { ...GATE_ITEM.gate, gateId: "gate_2" },
    };
    const res = await createWebApp(
      webDeps({
        getInbox: async () => [GATE_ITEM, second],
        listGates: async (_s: unknown, projectId: string) => {
          calls.push(projectId);
          return [CARD, { ...CARD, id: "gate_2" }] as never;
        },
      }),
    ).request("/bff/app/inbox", { headers: { accept: "application/json" } });
    expect(res.status).toBe(200);
    expect(calls).toEqual(["proj_1"]); // dedup — the join's cost is per-project, not per-row
    const body = await res.json();
    expect(Object.keys((body as { gateCards: object }).gateCards).sort()).toEqual([
      "gate:gate_1",
      "gate:gate_2",
    ]);
  });

  it("a missed gate join degrades to an empty gateCards record — the row still answers", async () => {
    const res = await createWebApp(
      webDeps({ listGates: async () => { throw new ApiError(503, "x"); } }),
    ).request("/bff/app/inbox", { headers: { accept: "application/json" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [GATE_ITEM, EVENT_ITEM], badge: 1, gateCards: {} });
  });

  it("degraded read seams land the SSR's defaults — [] items + 0 badge (REQ-BFF-9)", async () => {
    const res = await createWebApp(
      webDeps({
        getInbox: async () => { throw new ApiError(503, "x"); },
        getInboxBadge: async () => { throw new ApiError(503, "x"); },
      }),
    ).request("/bff/app/inbox", { headers: { accept: "application/json" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], badge: 0, gateCards: {} });
  });

  it("an upstream 401 is NOT swallowed — the unauthenticated envelope answers", async () => {
    const res = await createWebApp(
      webDeps({ getInbox: async () => { throw new ApiError(401, "x"); } }),
    ).request("/bff/app/inbox", { headers: { accept: "application/json" } });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
  });

  it("no session → 401 JSON, never a redirect", async () => {
    const res = await createWebApp(webDeps({}, () => null)).request("/bff/app/inbox", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("POST /app/inbox/read + /read-all — the JSON mutation branches (SPA.11; REQ-BFF-1/2/3)", () => {
  const postDeps = (
    over: Partial<DataSource>,
    session: WebDeps["session"] = () => SESSION,
  ): WebDeps =>
    ({
      session,
      dataSource: {
        checkSession: async () => true,
        listProjects: async () => ROWS,
        ...over,
      } as DataSource,
    }) as WebDeps;

  it("a JSON caller gets {ok:true, redirect:'/app/inbox'} — never a 302 (REQ-BFF-1)", async () => {
    const mark = vi.fn(async () => ({ ok: true as const }));
    const res = await createWebApp(postDeps({ markInboxItemRead: mark })).request("/app/inbox/read", {
      ...jsonPost,
      body: JSON.stringify({ item: "ib_1" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/app/inbox" });
    expect(res.headers.get("location")).toBeNull();
    expect(mark).toHaveBeenCalledWith(expect.anything(), "ib_1");
  });

  it("a JSON caller with no `item` still answers the envelope — the mark seam is skipped", async () => {
    const mark = vi.fn(async () => ({ ok: true as const }));
    const res = await createWebApp(postDeps({ markInboxItemRead: mark })).request("/app/inbox/read", {
      ...jsonPost,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    expect(mark).not.toHaveBeenCalled();
  });

  it("the form post keeps its 302 verbatim (the no-JS leg is untouched)", async () => {
    const mark = vi.fn(async () => ({ ok: true as const }));
    const res = await createWebApp(postDeps({ markInboxItemRead: mark })).request("/app/inbox/read", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ item: "ib_1" }).toString(),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/app/inbox");
    expect(mark).toHaveBeenCalledWith(expect.anything(), "ib_1");
  });

  it("read-all JSON → the envelope; form → the 302", async () => {
    const markAll = vi.fn(async () => ({ ok: true as const, marked: 2 }));
    const app = createWebApp(postDeps({ markInboxAllRead: markAll }));
    const json = await app.request("/app/inbox/read-all", { ...jsonPost, body: "{}" });
    expect(json.status).toBe(200);
    expect(await json.json()).toEqual({ ok: true, redirect: "/app/inbox" });
    const form = await app.request("/app/inbox/read-all", { method: "POST" });
    expect(form.status).toBe(302);
    expect(form.headers.get("location")).toBe("/app/inbox");
    expect(markAll).toHaveBeenCalledTimes(2);
  });

  it("no session: JSON callers get 401 JSON, form callers get the /login redirect — never crossed", async () => {
    const app = createWebApp(postDeps({}, () => null));
    const json = await app.request("/app/inbox/read-all", { ...jsonPost, body: "{}" });
    expect(json.status).toBe(401);
    expect(json.headers.get("location")).toBeNull();
    const form = await app.request("/app/inbox/read", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "item=ib_1",
    });
    expect(form.status).toBe(302);
    expect(form.headers.get("location")).toBe("/login");
  });
});

// ---- SPA.13 — the voices surface twins + mutations (REQ-BFF-1/2/3/9/11/16, REQ-DAT-4/6) --------

describe("GET /bff/voices — the §9.1 three-group twin (SPA.13; REQ-BFF-1/9)", () => {
  const GROUPS = { voices: [{ personaId: "p1", name: "Voice One" }], groups: {} };
  const webDeps = (over: Partial<DataSource>): WebDeps =>
    ({
      session: () => SESSION,
      dataSource: {
        checkSession: async () => true,
        listProjects: async () => ROWS,
        listVoiceGroups: async () => GROUPS,
        ...over,
      } as DataSource,
    }) as WebDeps;

  it("returns the aggregate payload — the library DTO verbatim", async () => {
    const res = await createWebApp(webDeps({})).request("/bff/voices", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ voices: GROUPS });
    expect(res.headers.get("x-rhema-request-id")).toBeTruthy();
  });

  it("a degraded seam lands {voices:null} — never a fabricated list", async () => {
    const res = await createWebApp(
      webDeps({ listVoiceGroups: async () => { throw new ApiError(503, "x"); } }),
    ).request("/bff/voices", { headers: { accept: "application/json" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ voices: null });
  });

  it("an upstream 401 is NOT swallowed — the unauthenticated envelope answers", async () => {
    const res = await createWebApp(
      webDeps({ listVoiceGroups: async () => { throw new ApiError(401, "x"); } }),
    ).request("/bff/voices", { headers: { accept: "application/json" } });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
  });

  it("no session → 401 JSON, never a redirect", async () => {
    const res = await createWebApp({ ...webDeps({}), session: () => null }).request("/bff/voices", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("GET /bff/voices/new — the creation-sheet twin (SPA.13)", () => {
  const webDeps = (): WebDeps =>
    ({ session: () => SESSION, dataSource: { listProjects: async () => ROWS } as DataSource }) as WebDeps;

  it("returns {voiceNew:{}} — the sheet composes no remote reads today", async () => {
    const res = await createWebApp(webDeps()).request("/bff/voices/new", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ voiceNew: {} });
  });

  it("registration order — 'new' does NOT land on /bff/voices/:persona", async () => {
    const res = await createWebApp(webDeps()).request("/bff/voices/new", {
      headers: { accept: "application/json" },
    });
    // A param-route hit would call getVoice("new") — absent seam ⇒ TypeError ⇒ 500, never 200.
    expect(res.status).toBe(200);
  });
});

describe("GET /bff/voices/:persona — the five-tab detail twin (SPA.13; REQ-BFF-1/9)", () => {
  const VOICE = {
    detail: { persona: { id: "p1", display_name: "Voice One" }, tier: "quick" },
  };
  const ESTIMATE = { estimateCredits: 60, capCredits: 150 };
  const PLAN = { route: { scope: "delta", sentence: "Re-run the changed phases." } };
  const CONNECTIONS = { connections: [{ id: "cn1", provider: "substack" }] };
  const SAMPLE_DETAIL = { item: { id: "s2" }, versions: [] };
  const webDeps = (over: Partial<DataSource>): WebDeps =>
    ({
      session: () => SESSION,
      dataSource: {
        checkSession: async () => true,
        listProjects: async () => ROWS,
        getVoice: async () => VOICE.detail,
        estimateVoice: async () => ESTIMATE,
        getVoiceUpdatePlan: async () => PLAN,
        listVoiceConnections: async () => CONNECTIONS,
        getVoiceSample: async () => SAMPLE_DETAIL,
        ...over,
      } as DataSource,
    }) as WebDeps;

  it("returns detail + estimate + updatePlan; the samples seams stay absent off-tab", async () => {
    const res = await createWebApp(webDeps({})).request("/bff/voices/p1", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.voice.detail).toEqual(VOICE.detail);
    expect(body.voice.estimate).toEqual(ESTIMATE);
    expect(body.voice.updatePlan).toEqual(PLAN);
    expect(body.voice.connections).toBeUndefined();
    expect(body.voice.sampleDetail).toBeUndefined();
  });

  it("?tab=samples&sample=s2 pulls the connections + drawer seams; tab echoes verbatim", async () => {
    const res = await createWebApp(webDeps({})).request("/bff/voices/p1?tab=samples&sample=s2", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.voice.connections).toEqual(CONNECTIONS);
    expect(body.voice.sampleDetail).toEqual(SAMPLE_DETAIL);
    expect(body.voice.tab).toBe("samples");
  });

  it("?tab=samples without ?sample — connections land, the drawer seam never runs", async () => {
    const seen = vi.fn(async () => SAMPLE_DETAIL);
    const res = await createWebApp(webDeps({ getVoiceSample: seen })).request(
      "/bff/voices/p1?tab=samples",
      { headers: { accept: "application/json" } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.voice.connections).toEqual(CONNECTIONS);
    expect(body.voice.sampleDetail).toBeUndefined();
    expect(seen).not.toHaveBeenCalled();
  });

  it("a missed persona → 404 {error:not_found} — the document's own answer", async () => {
    const res = await createWebApp(
      webDeps({ getVoice: async () => { throw new ApiError(404, "x"); } }),
    ).request("/bff/voices/nope", { headers: { accept: "application/json" } });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("a degraded estimate/connection seam lands absent, not fabricated", async () => {
    const res = await createWebApp(
      webDeps({
        estimateVoice: async () => { throw new ApiError(503, "x"); },
        listVoiceConnections: async () => { throw new ApiError(503, "x"); },
      }),
    ).request("/bff/voices/p1?tab=samples", { headers: { accept: "application/json" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.voice.estimate).toBeUndefined();
    expect(body.voice.connections).toBeUndefined();
    expect(body.voice.detail).toEqual(VOICE.detail);
  });

  it("an upstream 401 is NOT swallowed — the unauthenticated envelope answers", async () => {
    const res = await createWebApp(
      webDeps({ estimateVoice: async () => { throw new ApiError(401, "x"); } }),
    ).request("/bff/voices/p1", { headers: { accept: "application/json" } });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
  });
});

describe("GET /bff/p/:slug/voice/reseed — the §9.6 preview twin (SPA.13; REQ-BFF-11, REQ-DAT-6)", () => {
  const PREVIEW = { current: "s1", proposed: "s2", diff: [] };
  const webDeps = (over: Partial<DataSource>): WebDeps =>
    ({
      session: () => SESSION,
      dataSource: {
        checkSession: async () => true,
        listProjects: async () => ROWS,
        getVoiceReseedPreview: async () => PREVIEW,
        ...over,
      } as DataSource,
    }) as WebDeps;

  it("returns slug + projectId + preview — the back-link needs no second read", async () => {
    const seen: string[] = [];
    const res = await createWebApp(
      webDeps({
        getVoiceReseedPreview: async (_s: unknown, projectId: string) => {
          seen.push(projectId);
          return PREVIEW;
        },
      }),
    ).request("/bff/p/the-politics-of-visibility/voice/reseed", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      voiceReseed: { slug: "the-politics-of-visibility", projectId: "proj_pv", preview: PREVIEW },
    });
    expect(seen).toEqual(["proj_pv"]); // slug→id through the memo — never the slug upstream
  });

  it("an unknown slug → 404 {error:not_found} — the document's own answer", async () => {
    const res = await createWebApp(webDeps({})).request("/bff/p/nope/voice/reseed", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("a missed preview → the same 404 the document gives (SSR degrade parity)", async () => {
    const res = await createWebApp(
      webDeps({ getVoiceReseedPreview: async () => { throw new ApiError(503, "x"); } }),
    ).request("/bff/p/the-politics-of-visibility/voice/reseed", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("no session → 401 JSON, never a redirect", async () => {
    const res = await createWebApp({ ...webDeps({}), session: () => null }).request(
      "/bff/p/the-politics-of-visibility/voice/reseed",
      { headers: { accept: "application/json" } },
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("POST /bff/import/presign — the REQ-BFF-16 mint (SPA.13)", () => {
  const PRE = {
    url: "https://storage.example.test/quarantine/w1/u1",
    key: "quarantine/w1/u1",
    maxBytes: 10_000_000,
    requiredHeaders: { "content-type": "text/markdown" },
  };
  const webDeps = (over: Partial<DataSource>, omit = false): WebDeps =>
    ({
      session: () => SESSION,
      dataSource: {
        checkSession: async () => true,
        listProjects: async () => ROWS,
        ...(omit ? {} : { presignImportUpload: async () => PRE }),
        ...over,
      } as DataSource,
    }) as WebDeps;

  it("returns the signed-URL contract verbatim — the browser PUTs, the BFF never proxies", async () => {
    const res = await createWebApp(webDeps({})).request("/bff/import/presign", {
      ...jsonPost,
      body: "{}",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PRE);
    expect(res.headers.get("x-rhema-request-id")).toBeTruthy();
  });

  it("a web build without the seam → 503 {error:upload_unavailable} (the payload's own refusal)", async () => {
    const res = await createWebApp(webDeps({}, true)).request("/bff/import/presign", {
      ...jsonPost,
      body: "{}",
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "upload_unavailable" });
  });

  it("no session → 401 JSON, never a redirect", async () => {
    const res = await createWebApp({ ...webDeps({}), session: () => null }).request(
      "/bff/import/presign",
      { ...jsonPost, body: "{}" },
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("POST /voices/new — the create sheet's JSON dual-mode (SPA.13; REQ-BFF-1/2/16)", () => {
  const voiceDeps = (over: Partial<DataSource>, session: WebDeps["session"] = () => SESSION): WebDeps =>
    ({
      session,
      dataSource: {
        checkSession: async () => true,
        listProjects: async () => ROWS,
        createVoice: async () => ({ personaId: "p_new" }),
        addVoiceSample: async () => ({}),
        buildVoice: async () => ({ runId: "r1" }),
        ...over,
      } as DataSource,
    }) as WebDeps;

  it("a JSON save creates the persona and answers {ok, redirect:'/v/p_new'}", async () => {
    const create = vi.fn(async () => ({ personaId: "p_new" }));
    const res = await createWebApp(voiceDeps({ createVoice: create })).request("/voices/new", {
      ...jsonPost,
      body: JSON.stringify({ name: "Voice Two", mode: "self", intent: "save" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/v/p_new" });
    expect(res.headers.get("location")).toBeNull();
    expect(create).toHaveBeenCalledWith(expect.anything(), { name: "Voice Two", mode: "self" });
  });

  it("quarantineKey — the presign leg's key reaches addVoiceSample; no bytes transit the BFF", async () => {
    const add = vi.fn(async () => ({}));
    const res = await createWebApp(voiceDeps({ addVoiceSample: add })).request("/voices/new", {
      ...jsonPost,
      body: JSON.stringify({ name: "Upload Voice", intent: "save", quarantineKey: "quarantine/w1/u1", sample_title: "Essay" }),
    });
    expect(res.status).toBe(200);
    expect(add).toHaveBeenCalledWith(expect.anything(), "p_new", {
      quarantineKey: "quarantine/w1/u1",
      title: "Essay",
    });
  });

  it("missing name → the JSON refusal carries the document's own copy + stable code", async () => {
    const res = await createWebApp(voiceDeps({})).request("/voices/new", {
      ...jsonPost,
      body: JSON.stringify({ intent: "save" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "name_required", detail: "A name is required." });
  });

  it("a refused build redirects to ?build_failed=1 — the notice the document would flash", async () => {
    const res = await createWebApp(
      voiceDeps({ buildVoice: async () => { throw new ApiError(422, "x"); } }),
    ).request("/voices/new", {
      ...jsonPost,
      body: JSON.stringify({ name: "V", intent: "build", sample_text: "words" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/v/p_new?build_failed=1" });
  });

  it("the form post keeps its 302 — the no-JS leg is untouched", async () => {
    const res = await createWebApp(voiceDeps({})).request("/voices/new", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ name: "Voice Two", intent: "save" }).toString(),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/v/p_new");
  });

  it("no session: JSON callers get 401 JSON, form callers get the /login redirect", async () => {
    const app = createWebApp(voiceDeps({}, () => null));
    const json = await app.request("/voices/new", { ...jsonPost, body: JSON.stringify({ name: "x" }) });
    expect(json.status).toBe(401);
    expect(json.headers.get("location")).toBeNull();
    const form = await app.request("/voices/new", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "name=x",
    });
    expect(form.status).toBe(302);
    expect(form.headers.get("location")).toBe("/login");
  });
});

describe("POST /v/:persona/* — representative voices mutations, both modes (SPA.13)", () => {
  const voiceDeps = (over: Partial<DataSource>): WebDeps =>
    ({
      session: () => SESSION,
      dataSource: {
        checkSession: async () => true,
        listProjects: async () => ROWS,
        saveVoiceSeed: async () => ({}),
        addVoiceSample: async () => ({}),
        setVoiceSampleIncluded: async () => ({}),
        confirmVoiceConnection: async () => ({}),
        decideRunGate: async () => ({}),
        deleteVoice: async () => ({}),
        adoptProjectVoice: async () => ({}),
        ...over,
      } as DataSource,
    }) as WebDeps;

  it("seed save: JSON → {ok, redirect:'…?saved=1'}; the registers CSV decodes verbatim", async () => {
    const save = vi.fn(async () => ({}));
    const res = await createWebApp(voiceDeps({ saveVoiceSeed: save })).request("/v/p1/seed", {
      ...jsonPost,
      body: JSON.stringify({ description: "revised seed", byline: "B", registers: "essay, review" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/v/p1?saved=1" });
    expect(save).toHaveBeenCalledWith(expect.anything(), "p1", {
      description: "revised seed",
      byline: "B",
      registers: ["essay", "review"],
    });
  });

  it("add sample: JSON quarantineKey reaches the seam; form text posts the 302 floor", async () => {
    const add = vi.fn(async () => ({}));
    const app = createWebApp(voiceDeps({ addVoiceSample: add }));
    const json = await app.request("/v/p1/samples", {
      ...jsonPost,
      body: JSON.stringify({ quarantineKey: "quarantine/w1/u1", title: "T" }),
    });
    expect(await json.json()).toEqual({ ok: true, redirect: "/v/p1?added=1" });
    expect(add).toHaveBeenCalledWith(expect.anything(), "p1", { quarantineKey: "quarantine/w1/u1", title: "T" });
    const form = await app.request("/v/p1/samples", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ text: "pasted words" }).toString(),
    });
    expect(form.status).toBe(302);
    expect(form.headers.get("location")).toBe("/v/p1?added=1");
    expect(add).toHaveBeenCalledWith(expect.anything(), "p1", { text: "pasted words" });
  });

  it("confirm: JSON arrays and a repeated-field form post fold to the same items list", async () => {
    const confirm = vi.fn(async () => ({}));
    const app = createWebApp(voiceDeps({ confirmVoiceConnection: confirm }));
    const json = await app.request("/v/p1/connections/c1/confirm", {
      ...jsonPost,
      body: JSON.stringify({ known: ["e1", "e2"], include: "e1" }),
    });
    expect(await json.json()).toEqual({ ok: true, redirect: "/v/p1?tab=samples" });
    expect(confirm).toHaveBeenCalledWith(expect.anything(), "p1", "c1", {
      items: [
        { externalId: "e1", include: true },
        { externalId: "e2", include: false },
      ],
    });
    const form = await app.request("/v/p1/connections/c1/confirm", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "known=e1&known=e2&include=e1&include=e2",
    });
    expect(form.status).toBe(302);
    expect(confirm).toHaveBeenLastCalledWith(expect.anything(), "p1", "c1", {
      items: [
        { externalId: "e1", include: true },
        { externalId: "e2", include: true },
      ],
    });
  });

  it("the gate decision requires runId — a stale page's POST without it is a no-op", async () => {
    const decide = vi.fn(async () => ({}));
    const app = createWebApp(voiceDeps({ decideRunGate: decide }));
    await app.request("/v/p1/gates/g1", { ...jsonPost, body: JSON.stringify({ action: "approve" }) });
    expect(decide).not.toHaveBeenCalled();
    const res = await app.request("/v/p1/gates/g1", {
      ...jsonPost,
      body: JSON.stringify({ runId: "r9", action: "approve" }),
    });
    expect(await res.json()).toEqual({ ok: true, redirect: "/v/p1" });
    expect(decide).toHaveBeenCalledWith(expect.anything(), "r9", "g1", { action: "approve" });
  });

  it("the typed delete: confirm='delete' removes; any other body lands back on the voice", async () => {
    const del = vi.fn(async () => ({}));
    const app = createWebApp(voiceDeps({ deleteVoice: del }));
    const res = await app.request("/v/p1/delete", {
      ...jsonPost,
      body: JSON.stringify({ confirm: "delete" }),
    });
    expect(await res.json()).toEqual({ ok: true, redirect: "/voices" });
    expect(del).toHaveBeenCalledWith(expect.anything(), "p1");
    const back = await app.request("/v/p1/delete", { ...jsonPost, body: "{}" });
    expect(await back.json()).toEqual({ ok: true, redirect: "/v/p1" });
    expect(del).toHaveBeenCalledTimes(1);
  });

  it("the reseed adopt posts {reseed:true} through the slug-resolved row; unknown slug → 404", async () => {
    const adopt = vi.fn(async () => ({}));
    const app = createWebApp(voiceDeps({ adoptProjectVoice: adopt }));
    const res = await app.request("/p/the-politics-of-visibility/voice/adopt", {
      ...jsonPost,
      body: JSON.stringify({ reseed: "true" }),
    });
    expect(await res.json()).toEqual({ ok: true, redirect: "/p/the-politics-of-visibility" });
    expect(adopt).toHaveBeenCalledWith(expect.anything(), "proj_pv", { reseed: true });
    const miss = await app.request("/p/nope/voice/adopt", { ...jsonPost, body: "{}" });
    expect(miss.status).toBe(404);
    expect(await miss.json()).toEqual({ error: "not_found" });
  });
});

// ---- SPA.14 — the `onboarding` surface's twins + JSON mutation branches (REQ-BFF-1/2/3/4/9/11/
// 15/16, REQ-DAT-1/4/6/9; the /app/new* legs gate on `onboarding` alone, the /p/:p/import* legs
// AND `ide-chrome` — the BFF routes themselves are renderer-blind, so the tests pin payload +
// envelope shape, never the flag consult). ----

const CONVERSION = {
  sourceFormat: "md",
  markdown: "# Hello\n\nBody text.",
  title: "Hello",
  counts: { words: 3, footnotes: 0, citationSpans: 0, tables: 0, figures: 0 },
  warnings: [],
  unconverted: [],
  quality: "clean",
  qualityNotes: [],
};

const onboardingDeps = (over: Partial<DataSource>, session: WebDeps["session"] = () => SESSION): WebDeps =>
  ({
    session,
    dataSource: {
      checkSession: async () => true,
      listProjects: async () => ROWS,
      listProtocolCards: async () => [{ id: "essay", name: "Essay" }],
      listVoices: async () => [{ personaId: "p1", name: "Voice One" }],
      ...over,
    } as DataSource,
  }) as WebDeps;

describe("GET /bff/app/new — the new-project sheet twin (SPA.14; REQ-BFF-1/8/9)", () => {
  it("returns the sheet's two reads verbatim", async () => {
    const res = await createWebApp(onboardingDeps({})).request("/bff/app/new", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.newProject.protocols).toEqual([{ id: "essay", name: "Essay" }]);
    expect(body.newProject.voices).toEqual([{ personaId: "p1", name: "Voice One" }]);
    expect(res.headers.get("x-rhema-request-id")).toBeTruthy();
  });

  it("a degraded seam lands null — the leaf tells degraded from empty, never a fabricated list", async () => {
    const res = await createWebApp(
      onboardingDeps({
        listProtocolCards: async () => { throw new ApiError(503, "x"); },
        listVoices: async () => { throw new ApiError(503, "x"); },
      }),
    ).request("/bff/app/new", { headers: { accept: "application/json" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ newProject: { protocols: null, voices: null } });
  });

  it("no session → 401 JSON, never a redirect", async () => {
    const res = await createWebApp(onboardingDeps({}, () => null)).request("/bff/app/new", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("GET /bff/app/new/preview — the workspace poll twin (SPA.14; REQ-BFF-1/15)", () => {
  it("missing qk answers the document's own redirect leg as {ok,redirect}", async () => {
    const res = await createWebApp(onboardingDeps({})).request("/bff/app/new/preview", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/app/new?entry=draft" });
  });

  it("pending carries the server-owned cadence (pollAfterSeconds)", async () => {
    const res = await createWebApp(
      onboardingDeps({ previewWorkspaceImport: async () => ({ status: "pending", quarantineKey: "q1" }) }),
    ).request("/bff/app/new/preview?entry=draft&qk=q1&src=draft.md", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.newProjectPreview.status).toBe("pending");
    expect(body.newProjectPreview.quarantineKey).toBe("q1");
    expect(body.newProjectPreview.pollAfterSeconds).toBe(5);
    expect(body.newProjectPreview.sourceLabel).toBe("draft.md");
  });

  it("ready carries the §5.3 payload + the server-resolved title (typed → H1 → stem)", async () => {
    const res = await createWebApp(
      onboardingDeps({
        previewWorkspaceImport: async () => ({ status: "ready", preview: CONVERSION, quarantineKey: "q1" }),
      }),
    ).request("/bff/app/new/preview?entry=draft&qk=q1&src=draft.md", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.newProjectPreview.status).toBe("ready");
    expect(body.newProjectPreview.resolvedTitle).toBe("Hello"); // the document's own H1 beats the stem
    expect(body.newProjectPreview.convertedMarkdown).toBe(CONVERSION.markdown);
    expect(body.newProjectPreview.countLine).toContain("3 words");
  });

  it("a failed read-back answers the redirect leg, never an error page", async () => {
    const res = await createWebApp(
      onboardingDeps({ previewWorkspaceImport: async () => { throw new ApiError(500, "x"); } }),
    ).request("/bff/app/new/preview?entry=draft&qk=q1", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/app/new?entry=draft" });
  });
});

describe("GET /bff/p/:slug/import — the import sheet twin (SPA.14; REQ-BFF-11, REQ-DAT-6)", () => {
  it("returns project facts + the ide bag for the chrome publish", async () => {
    const res = await createWebApp(onboardingDeps({})).request(
      "/bff/p/the-politics-of-visibility/import",
      { headers: { accept: "application/json" } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.import.project.slug).toBe("the-politics-of-visibility");
    expect(body.import.project.title).toBe("The Politics of Visibility");
    expect(body.import.ide.projectId).toBe("proj_pv");
    expect(body.import.ide.palette).toBeTruthy();
    expect(JSON.parse(body.import.ide.palette).projectSlug).toBe("the-politics-of-visibility");
  });

  it("a missed slug is the document's own not_found", async () => {
    const res = await createWebApp(onboardingDeps({})).request("/bff/p/nope/import", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});

describe("GET /bff/p/:slug/import/preview — the project poll twin (SPA.14; REQ-BFF-11/15)", () => {
  it("missing qk answers the document's own ../import bounce as {ok,redirect}", async () => {
    const res = await createWebApp(onboardingDeps({})).request(
      "/bff/p/the-politics-of-visibility/import/preview",
      { headers: { accept: "application/json" } },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/p/the-politics-of-visibility/import" });
  });

  it("pending carries pending:true + the server-owned cadence", async () => {
    const res = await createWebApp(
      onboardingDeps({ previewImport: async () => ({ status: "pending", quarantineKey: "q1" }) }),
    ).request("/bff/p/the-politics-of-visibility/import/preview?qk=q1&src=paper.docx", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.importPreview.conversion.pending).toBe(true);
    expect(body.importPreview.conversion.quarantineKey).toBe("q1");
    expect(body.importPreview.conversion.pollAfterSeconds).toBe(5);
    // the shell titles itself with the SOURCE label, verbatim from the document
    expect(body.importPreview.project.title).toBe("paper.docx");
  });

  it("ready carries the conversion payload verbatim (toConversionData)", async () => {
    const res = await createWebApp(
      onboardingDeps({
        previewImport: async () => ({ status: "ready", preview: CONVERSION, quarantineKey: "q1" }),
      }),
    ).request("/bff/p/the-politics-of-visibility/import/preview?qk=q1&src=paper.docx", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.importPreview.conversion.projectSlug).toBe("the-politics-of-visibility");
    expect(body.importPreview.conversion.convertedMarkdown).toBe(CONVERSION.markdown);
    expect(body.importPreview.conversion.quarantineKey).toBe("q1");
    expect(body.importPreview.conversion.sourceText).toBe("(the uploaded source — already converted)");
  });
});

describe("POST /app/new — the sheet's JSON dual-mode (SPA.14; REQ-BFF-1/2/3/15/16)", () => {
  it("scratch without a title → 400 {error:title_required}, never a silent redirect", async () => {
    const res = await createWebApp(onboardingDeps({})).request("/app/new", {
      ...jsonPost,
      body: JSON.stringify({ entry: "scratch" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "title_required", detail: "A title is required." });
  });

  it("scratch create answers {ok,redirect:'/p/x?created=scratch'}", async () => {
    const create = vi.fn(async () => ({ slug: "fresh-project" }));
    const res = await createWebApp(onboardingDeps({ createProject: create })).request("/app/new", {
      ...jsonPost,
      body: JSON.stringify({ entry: "scratch", title: "Fresh" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/p/fresh-project?created=scratch" });
    expect(create).toHaveBeenCalled();
  });

  it("an upload entry without bytes/paste/quarantineKey → 400 {error:source_required}", async () => {
    const res = await createWebApp(onboardingDeps({})).request("/app/new", {
      ...jsonPost,
      body: JSON.stringify({ entry: "draft", title: "T" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "source_required", detail: "Upload a file or paste the text." });
  });

  it("quarantineKey+fileName replays the presign→PUT leg — the BFF never proxies bytes", async () => {
    const seen = vi.fn(async () => ({ status: "pending", quarantineKey: "q1" }));
    const res = await createWebApp(onboardingDeps({ previewWorkspaceImport: seen })).request("/app/new", {
      ...jsonPost,
      body: JSON.stringify({ entry: "draft", title: "T", quarantineKey: "q1", fileName: "draft.md" }),
    });
    expect(res.status).toBe(200);
    expect(seen).toHaveBeenCalledWith(expect.anything(), { quarantineKey: "q1", fileName: "draft.md" });
  });

  it("pending answers {ok,pending:{pollAfterSeconds},redirect:<poll-url>} — server-owned cadence", async () => {
    const res = await createWebApp(
      onboardingDeps({ previewWorkspaceImport: async () => ({ status: "pending", quarantineKey: "q1" }) }),
    ).request("/app/new", {
      ...jsonPost,
      body: JSON.stringify({ entry: "draft", title: "T", quarantineKey: "q1", fileName: "draft.md" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.pending.pollAfterSeconds).toBe(5);
    expect(body.redirect).toContain("/app/new/preview?");
    expect(body.redirect).toContain("qk=q1");
    expect(body.redirect).toContain("entry=draft");
  });

  it("ready answers the §5.3 inline payload — {ok,data:{form,preview}}", async () => {
    const res = await createWebApp(
      onboardingDeps({
        previewWorkspaceImport: async () => ({ status: "ready", preview: CONVERSION, quarantineKey: "q1" }),
      }),
    ).request("/app/new", {
      ...jsonPost,
      body: JSON.stringify({ entry: "draft", quarantineKey: "q1", fileName: "draft.md" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.form.title).toBe("Hello"); // resolved: typed → H1 → stem
    expect(body.data.preview.quarantineKey).toBe("q1");
    expect(body.data.preview.convertedMarkdown).toBe(CONVERSION.markdown);
  });

  it("a form post keeps the SSR branch — a 302 + Location, never a JSON body", async () => {
    const res = await createWebApp(
      onboardingDeps({ createProject: async () => ({ slug: "fresh-project" }) }),
    ).request("/app/new", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "entry=scratch&title=Fresh",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/fresh-project?created=scratch");
  });

  it("no session → 401 JSON / redirect for the form post", async () => {
    const app = createWebApp(onboardingDeps({}, () => null));
    const json = await app.request("/app/new", { ...jsonPost, body: "{}" });
    expect(json.status).toBe(401);
    expect(await json.json()).toEqual({ error: "unauthenticated" });
    const form = await app.request("/app/new", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "entry=scratch",
    });
    expect(form.status).toBe(302);
  });
});

describe("POST /app/new/create — the preview's create JSON dual-mode (SPA.14)", () => {
  it("conversion_pending 409 answers the pending contract, never an error", async () => {
    const res = await createWebApp(
      onboardingDeps({
        createProject: async () => { throw new ApiError(409, "/x", "pending", "conversion_pending"); },
      }),
    ).request("/app/new/create", {
      ...jsonPost,
      body: JSON.stringify({ entry: "draft", title: "T", qk: "q1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.pending.pollAfterSeconds).toBe(5);
    expect(body.redirect).toContain("/app/new/preview?");
  });

  it("success answers the identical flash-parameterized redirect — ?created + ?hc verbatim", async () => {
    const res = await createWebApp(
      onboardingDeps({ createProject: async () => ({ slug: "fresh-project" }) }),
    ).request("/app/new/create", {
      ...jsonPost,
      body: JSON.stringify({ entry: "draft", title: "T", qk: "q1", heldToken: "hold_abc" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.redirect).toBe("/p/fresh-project?created=draft&hc=hold_abc");
  });

  it("fix_now on a draft lands on the version route — the SSR's own target", async () => {
    const res = await createWebApp(
      onboardingDeps({ createProject: async () => ({ slug: "fresh-project", draftN: 3 }) }),
    ).request("/app/new/create", {
      ...jsonPost,
      body: JSON.stringify({ entry: "draft", title: "T", qk: "q1", action: "fix_now" }),
    });
    expect(await res.json()).toEqual({ ok: true, redirect: "/p/fresh-project/v/3?created=draft" });
  });
});

describe("POST /p/:slug/import/preview + /import/create — the JSON dual-modes (SPA.14)", () => {
  it("preview: quarantineKey+fileName replays the presign leg; pending → {ok,pending,redirect}", async () => {
    const seen = vi.fn(async () => ({ status: "pending", quarantineKey: "q1" }));
    const res = await createWebApp(onboardingDeps({ previewImport: seen })).request(
      "/p/the-politics-of-visibility/import/preview",
      { ...jsonPost, body: JSON.stringify({ quarantineKey: "q1", fileName: "paper.docx" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.pending.pollAfterSeconds).toBe(5);
    expect(body.redirect).toBe("/p/the-politics-of-visibility/import/preview?qk=q1&src=paper.docx");
    expect(seen).toHaveBeenCalledWith(expect.anything(), {
      projectSlug: "the-politics-of-visibility",
      text: "",
      fileName: "paper.docx",
      quarantineKey: "q1",
    });
  });

  it("preview: ready answers {ok,data:{conversion}} — the document's POST-time preview", async () => {
    const res = await createWebApp(
      onboardingDeps({
        previewImport: async () => ({ status: "ready", preview: CONVERSION, quarantineKey: "q1" }),
      }),
    ).request(
      "/p/the-politics-of-visibility/import/preview",
      { ...jsonPost, body: JSON.stringify({ quarantineKey: "q1", fileName: "paper.docx" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.conversion.projectSlug).toBe("the-politics-of-visibility");
    expect(body.data.conversion.convertedMarkdown).toBe(CONVERSION.markdown);
  });

  it("create: conversion_pending 409 → {ok,pending,redirect}; success → {ok,redirect:'/p/:slug'}", async () => {
    const pending = await createWebApp(
      onboardingDeps({
        createImport: async () => { throw new ApiError(409, "/x", "pending", "conversion_pending"); },
      }),
    ).request("/p/the-politics-of-visibility/import/create", {
      ...jsonPost,
      body: JSON.stringify({ qk: "q1", fileName: "paper.docx" }),
    });
    expect(pending.status).toBe(200);
    const pb = await pending.json();
    expect(pb.ok).toBe(true);
    expect(pb.pending.pollAfterSeconds).toBe(5);
    expect(pb.redirect).toBe("/p/the-politics-of-visibility/import/preview?qk=q1&src=paper.docx");

    const done = await createWebApp(
      onboardingDeps({ createImport: async () => ({ draftId: "d1" }) }),
    ).request("/p/the-politics-of-visibility/import/create", {
      ...jsonPost,
      body: JSON.stringify({ qk: "q1" }),
    });
    expect(await done.json()).toEqual({ ok: true, redirect: "/p/the-politics-of-visibility" });
  });

  it("a refused create passes the api's error through verbatim at its status", async () => {
    const res = await createWebApp(
      onboardingDeps({
        createImport: async () => { throw new ApiError(422, "/x", "refused", "invalid_quarantine_key", "expired"); },
      }),
    ).request("/p/the-politics-of-visibility/import/create", {
      ...jsonPost,
      body: JSON.stringify({ qk: "q1" }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("invalid_quarantine_key");
    expect(body.detail).toBe("expired");
  });

  it("no session → 401 JSON on both mutation legs", async () => {
    const app = createWebApp(onboardingDeps({}, () => null));
    for (const path of ["/p/the-politics-of-visibility/import/preview", "/p/the-politics-of-visibility/import/create"]) {
      const res = await app.request(path, { ...jsonPost, body: "{}" });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthenticated" });
    }
  });
});

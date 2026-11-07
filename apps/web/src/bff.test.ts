import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { ApiError } from "@rhema/api-client";
import type { FigureCardDto, FigureListItemDto, ProjectRow } from "@rhema/api-client";
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

  it("create: conversion_pending 409 → {ok,pending,redirect}; success → {ok,redirect:'/p/:slug/v/:n?imported'}", async () => {
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
      onboardingDeps({
        createImport: async () => ({ draftId: "d1", n: 1, outcome: "created" as const }),
      }),
    ).request("/p/the-politics-of-visibility/import/create", {
      ...jsonPost,
      body: JSON.stringify({ qk: "q1" }),
    });
    // R7HOME.2a — the writer lands on the editable Page with the REQ-DATA-14 toast in the URL.
    expect(await done.json()).toEqual({
      ok: true,
      redirect: "/p/the-politics-of-visibility/v/1?imported=created",
    });
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

describe("GET /bff/app — the §5.2 project-home aggregate twin (SPA.15; REQ-BFF-1/8/9, REQ-DAT-4/12)", () => {
  const VOICES = [{ personaId: "pers_1", name: "Lead", status: { pill: "Ready" } }];
  const PROTOCOLS = [{ id: "proto_1", name: "Standard" }];
  const HITS = [{ kind: "project", projectId: "proj_pv", slug: "the-politics-of-visibility", title: "The Politics of Visibility", snippet: "…" }];
  const DELETED = [{ id: "proj_del", slug: "gone", title: "Gone", deletedAt: "2026-10-01T00:00:00Z" }];
  const BAL = { spendableCredits: 12_000, heldCredits: 400 };
  const homeDeps = (over: Partial<DataSource>, session: WebDeps["session"] = () => SESSION): WebDeps =>
    ({
      session,
      dataSource: {
        checkSession: async () => true,
        listProjects: async () => ROWS,
        listVoices: async () => VOICES,
        getProjectGrouping: async () => "voice",
        getBillingBalance: async () => BAL,
        searchProjects: async () => HITS,
        listProtocolCards: async () => PROTOCOLS,
        listDeletedProjects: async () => DELETED,
        ...over,
      } as DataSource,
    }) as WebDeps;

  it("returns the aggregate — raw DTOs; deletedRows empty without ?deleted=1; no search key without ?q", async () => {
    const res = await createWebApp(homeDeps({})).request("/bff/app", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      rows: ROWS,
      voices: VOICES,
      groupBy: "voice",
      balance: { spendableCredits: 12_000, heldCredits: 400 },
      protocols: PROTOCOLS,
      deletedRows: [],
    });
    expect(res.headers.get("x-rhema-request-id")).toBeTruthy();
  });

  it("?deleted=1 gates the deleted-scope read — the rows land on the twin", async () => {
    let calls = 0;
    const res = await createWebApp(
      homeDeps({ listDeletedProjects: async () => { calls++; return DELETED as never; } }),
    ).request("/bff/app?deleted=1", { headers: { accept: "application/json" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(calls).toBe(1);
    expect(body.deletedRows).toEqual(DELETED);
  });

  it("?q= drives the server-side searchProjects — {search:{q,results}} rides the payload", async () => {
    const seen: string[] = [];
    const res = await createWebApp(
      homeDeps({ searchProjects: async (_s: unknown, q: string) => { seen.push(q); return HITS as never; } }),
    ).request("/bff/app?q=politics", { headers: { accept: "application/json" } });
    expect(res.status).toBe(200);
    expect(seen).toEqual(["politics"]);
    expect((await res.json()).search).toEqual({ q: "politics", results: HITS });
  });

  it("a ?q= that trims to empty never reaches searchProjects", async () => {
    let calls = 0;
    const res = await createWebApp(
      homeDeps({ searchProjects: async () => { calls++; return HITS as never; } }),
    ).request("/bff/app?q=%20%20", { headers: { accept: "application/json" } });
    expect(res.status).toBe(200);
    expect(calls).toBe(0);
    expect((await res.json()).search).toBeUndefined();
  });

  it("degraded optional seams land the SSR's composed defaults — groupBy attention, null balance, empty seams", async () => {
    const res = await createWebApp(
      homeDeps({
        listVoices: async () => { throw new ApiError(503, "x"); },
        getProjectGrouping: async () => { throw new ApiError(503, "x"); },
        getBillingBalance: async () => { throw new ApiError(503, "x"); },
        listProtocolCards: async () => { throw new ApiError(503, "x"); },
        listDeletedProjects: async () => { throw new ApiError(503, "x"); },
      }),
    ).request("/bff/app?deleted=1", { headers: { accept: "application/json" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      rows: ROWS,
      voices: [],
      groupBy: "attention",
      balance: null,
      protocols: [],
      deletedRows: [],
    });
  });

  it("a degraded search seam omits the search key — the SSR's undefined-search path", async () => {
    const res = await createWebApp(
      homeDeps({ searchProjects: async () => { throw new ApiError(503, "x"); } }),
    ).request("/bff/app?q=x", { headers: { accept: "application/json" } });
    expect(res.status).toBe(200);
    expect((await res.json()).search).toBeUndefined();
  });

  it("an upstream 401 in an optional seam is NOT swallowed — the unauthenticated envelope answers", async () => {
    const res = await createWebApp(
      homeDeps({ listVoices: async () => { throw new ApiError(401, "x"); } }),
    ).request("/bff/app", { headers: { accept: "application/json" } });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
  });

  it("a load-bearing listProjects failure maps through bffFail (upstream 5xx → 502)", async () => {
    const res = await createWebApp(
      homeDeps({ listProjects: async () => { throw new ApiError(503, "x"); } }),
    ).request("/bff/app", { headers: { accept: "application/json" } });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "upstream_unavailable" });
  });

  it("no session → 401 JSON, never a redirect", async () => {
    const res = await createWebApp(homeDeps({}, () => null)).request("/bff/app", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("POST /app/grouping + /p/:slug/* — the project-home mutation JSON branches (SPA.15; REQ-BFF-1/2/3)", () => {
  const homeMutDeps = (over: Partial<DataSource>, session: WebDeps["session"] = () => SESSION): WebDeps =>
    ({
      session,
      dataSource: {
        checkSession: async () => true,
        listProjects: async () => ROWS,
        listVoices: async () => [],
        getProjectGrouping: async () => "attention",
        setProjectGrouping: async () => undefined,
        duplicateProject: async () => ({ ...ROWS[0], id: "proj_copy", slug: "the-copy" }),
        archiveProject: async () => undefined,
        unarchiveProject: async () => undefined,
        deleteProject: async () => undefined,
        restoreProject: async () => undefined,
        listDeletedProjects: async () => [{ id: "proj_del", slug: "gone", title: "Gone" }],
        getBillingBalance: async () => null,
        listProtocolCards: async () => [],
        ...over,
      } as DataSource,
    }) as WebDeps;

  it("POST /app/grouping — JSON caller gets {ok,redirect:'/app'}; the write ran with the parsed value", async () => {
    const seen: string[] = [];
    const res = await createWebApp(
      homeMutDeps({ setProjectGrouping: async (_s: unknown, g: string) => { seen.push(g); } }),
    ).request("/app/grouping", {
      ...jsonPost,
      body: JSON.stringify({ groupBy: "voice" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/app" });
    expect(seen).toEqual(["voice"]);
  });

  it("POST /app/grouping — a form post still 302s to /app (SSR behaviour verbatim)", async () => {
    const res = await createWebApp(homeMutDeps({})).request("/app/grouping", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "groupBy=voice",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/app");
  });

  it("POST /app/grouping — no session → 401 JSON vs the form's /login redirect", async () => {
    const json = await createWebApp(homeMutDeps({}, () => null)).request("/app/grouping", {
      ...jsonPost,
      body: JSON.stringify({ groupBy: "voice" }),
    });
    expect(json.status).toBe(401);
    expect(await json.json()).toEqual({ error: "unauthenticated" });
    const form = await createWebApp(homeMutDeps({}, () => null)).request("/app/grouping", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "groupBy=voice",
    });
    expect(form.status).toBe(302);
    expect(form.headers.get("location")).toBe("/login");
  });

  it("POST /p/:slug/duplicate — JSON caller gets the copy's /p/<slug> as the envelope's redirect", async () => {
    const res = await createWebApp(homeMutDeps({})).request("/p/the-politics-of-visibility/duplicate", {
      ...jsonPost,
      body: "{}",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/p/the-copy" });
  });

  it("POST /p/:slug/duplicate — a swallowed write redirects to the SOURCE slug (SSR verbatim)", async () => {
    const res = await createWebApp(
      homeMutDeps({ duplicateProject: async () => { throw new ApiError(503, "x"); } }),
    ).request("/p/the-politics-of-visibility/duplicate", { ...jsonPost, body: "{}" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/p/the-politics-of-visibility" });
  });

  it("POST /p/:slug/duplicate — an unknown slug answers {error:not_found} 404 vs the form's not-found document", async () => {
    const json = await createWebApp(homeMutDeps({})).request("/p/nope/duplicate", {
      ...jsonPost,
      body: "{}",
    });
    expect(json.status).toBe(404);
    expect(await json.json()).toEqual({ error: "not_found" });
    const form = await createWebApp(homeMutDeps({})).request("/p/nope/duplicate", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "",
    });
    expect(form.status).toBe(404);
  });

  for (const suffix of ["archive", "unarchive", "delete"] as const) {
    it(`POST /p/:slug/${suffix} — JSON caller gets {ok,redirect:'/app'}; form still 302s`, async () => {
      const method = `${suffix}Project`;
      const calls: string[] = [];
      const json = await createWebApp(
        homeMutDeps({ [method]: async (_s: unknown, id: string) => { calls.push(id); } } as Partial<DataSource>),
      ).request(`/p/the-politics-of-visibility/${suffix}`, { ...jsonPost, body: "{}" });
      expect(json.status).toBe(200);
      expect(await json.json()).toEqual({ ok: true, redirect: "/app" });
      expect(calls).toEqual(["proj_pv"]); // slug→id resolved through the session-scoped list
      const form = await createWebApp(homeMutDeps({})).request(`/p/the-politics-of-visibility/${suffix}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "",
      });
      expect(form.status).toBe(302);
      expect(form.headers.get("location")).toBe("/app");
    });
  }

  it("POST /p/:slug/restore — resolves against the DELETED list, redirects to /app?deleted=1", async () => {
    const calls: string[] = [];
    const res = await createWebApp(
      homeMutDeps({ restoreProject: async (_s: unknown, id: string) => { calls.push(id); } }),
    ).request("/p/gone/restore", { ...jsonPost, body: "{}" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/app?deleted=1" });
    expect(calls).toEqual(["proj_del"]);
  });

  it("POST /p/:slug/restore — an active (non-deleted) slug answers {error:not_found}", async () => {
    const res = await createWebApp(homeMutDeps({})).request("/p/the-politics-of-visibility/restore", {
      ...jsonPost,
      body: "{}",
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("row mutations with no session → 401 JSON, never a redirect", async () => {
    const app = createWebApp(homeMutDeps({}, () => null));
    for (const path of [
      "/p/the-politics-of-visibility/duplicate",
      "/p/the-politics-of-visibility/archive",
      "/p/gone/restore",
    ]) {
      const res = await app.request(path, { ...jsonPost, body: "{}" });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthenticated" });
    }
  });
});

// ---- SPA.16 — the `billing` surface's twins + JSON mutation branches (REQ-BFF-1/2/3/8/9/15/27,
//  REQ-DAT-4/12, REQ-BILL-14/16/17; design/22 §2 `app.settings.billing` + `billing.return`) --------

describe("GET /bff/settings/billing — the billing aggregate twin (SPA.16; REQ-BFF-1/8/9)", () => {
  const SUB = {
    tier: "writer",
    subscription: {
      id: "sub_1", tier: "writer", cycle: "monthly", status: "active",
      periodStart: "2026-09-01T00:00:00Z", periodEnd: "2026-10-01T00:00:00Z",
      cancelAtPeriodEnd: false, scheduledTier: null, pastDue: false,
    },
    trial: { state: null, entitlement: null },
    autoReload: { enabled: false, thresholdCredits: null, packId: null, monthlyCapUsd: null },
    hasStripeCustomer: true,
    purchase: "open",
  };
  const PLANS_B = {
    version: "pricing-v1", issuedAt: "2026-09-02", usdPerCredit: 0.01, platformRate: 1.4,
    annualSavingsPct: 0.15, plans: {}, topUpPacks: [], autoReloadDefaults: null,
    trial: {
      windowDays: 14,
      entitlement: { kind: "review", wordCap: 6000, rigor: "standard", modelTier: "base" },
      pocketCredits: 150, upgradePromoCredits: 800, includedNote: null,
      postTrialNote: "After the trial.", eligibilityLine: "One trial per person.",
    },
  };
  const BAL = { spendableCredits: 3100, suspended: false, clawbackDebt: 0, purchase: "open" };
  const billDeps = (over: Partial<DataSource>, session: WebDeps["session"] = () => SESSION): WebDeps =>
    ({
      session,
      dataSource: {
        checkSession: async () => true,
        listProjects: async () => ROWS,
        getSubscription: async () => SUB,
        getPlans: async () => PLANS_B,
        getBillingBalance: async () => BAL,
        ...over,
      } as DataSource,
    }) as WebDeps;

  it("returns {billing:{subscription,plans}, balance} — raw DTOs verbatim", async () => {
    const res = await createWebApp(billDeps({})).request("/bff/settings/billing", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ billing: { subscription: SUB, plans: PLANS_B }, balance: BAL });
    expect(res.headers.get("x-rhema-request-id")).toBeTruthy();
  });

  it("a degraded seam lands billing:null — the SSR's `subscription && plans` gate, never a fabricated tier", async () => {
    const res = await createWebApp(
      billDeps({ getSubscription: async () => { throw new ApiError(503, "x"); } }),
    ).request("/bff/settings/billing", { headers: { accept: "application/json" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ billing: null, balance: BAL });
  });

  it("an upstream 401 rethrows — the unauthenticated envelope, not a polite empty page", async () => {
    const res = await createWebApp(
      billDeps({ getPlans: async () => { throw new ApiError(401, "x"); } }),
    ).request("/bff/settings/billing", { headers: { accept: "application/json" } });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
  });

  it("a Stripe-hosted paymentLinkUrl passes verbatim; a refused origin never serializes (REQ-BFF-27)", async () => {
    const ok = await createWebApp(
      billDeps({ getBillingBalance: async () => ({ ...BAL, paymentLinkUrl: "https://buy.stripe.com/test_link" }) }),
    ).request("/bff/settings/billing", { headers: { accept: "application/json" } });
    expect((await ok.json()).balance.paymentLinkUrl).toBe("https://buy.stripe.com/test_link");

    const bad = await createWebApp(
      billDeps({ getBillingBalance: async () => ({ ...BAL, paymentLinkUrl: "https://evil.example/pay" }) }),
    ).request("/bff/settings/billing", { headers: { accept: "application/json" } });
    const body = await bad.json();
    expect(body.balance.paymentLinkUrl).toBeUndefined(); // the key is absent — never on the wire
    expect(body.balance.spendableCredits).toBe(3100);
  });

  it("no session → 401 JSON, never a redirect", async () => {
    const res = await createWebApp(billDeps({}, () => null)).request("/bff/settings/billing", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("GET /bff/billing/return — the checkout-return twin (SPA.16; REQ-BILL-14, REQ-BFF-15)", () => {
  const RET_OPEN = { state: "open", kind: "subscribe", returnTo: null, createdAt: new Date().toISOString() };
  const retDeps = (over: Partial<DataSource>, session: WebDeps["session"] = () => SESSION): WebDeps =>
    ({
      session,
      dataSource: {
        checkSession: async () => true,
        listProjects: async () => ROWS,
        getCheckoutSession: async () => RET_OPEN,
        ...over,
      } as DataSource,
    }) as WebDeps;

  it("open + fresh ⇒ {checkoutReturn, cancelled:false, pollAfterSeconds:5} — the ≤30 s window", async () => {
    const res = await createWebApp(retDeps({})).request("/bff/billing/return?session_id=cs_1", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checkoutReturn.state).toBe("open");
    expect(body.cancelled).toBe(false);
    expect(body.pollAfterSeconds).toBe(5);
  });

  it("completed / expired / cancelled / past-window all answer WITHOUT pollAfterSeconds", async () => {
    const mk = (checkout: unknown) =>
      retDeps({ getCheckoutSession: async () => checkout });
    const completed = await createWebApp(mk({ ...RET_OPEN, state: "completed" }))
      .request("/bff/billing/return?session_id=cs_1", { headers: { accept: "application/json" } });
    expect((await completed.json()).pollAfterSeconds).toBeUndefined();
    const expired = await createWebApp(mk({ ...RET_OPEN, state: "expired" }))
      .request("/bff/billing/return?session_id=cs_1", { headers: { accept: "application/json" } });
    expect((await expired.json()).pollAfterSeconds).toBeUndefined();
    // cancelled=1 stops the poll even while the row reads open (the STB.4 live finding verbatim).
    const cancelled = await createWebApp(mk(RET_OPEN))
      .request("/bff/billing/return?session_id=cs_1&cancelled=1", { headers: { accept: "application/json" } });
    const cancelledBody = await cancelled.json();
    expect(cancelledBody.cancelled).toBe(true);
    expect(cancelledBody.pollAfterSeconds).toBeUndefined();
    // past the §14.6 webhook-lag bound — an open row older than 30 s never polls.
    const stale = await createWebApp(mk({ ...RET_OPEN, createdAt: new Date(Date.now() - 60_000).toISOString() }))
      .request("/bff/billing/return?session_id=cs_1", { headers: { accept: "application/json" } });
    expect((await stale.json()).pollAfterSeconds).toBeUndefined();
  });

  it("no session_id ⇒ checkoutReturn null and no read spent", async () => {
    let calls = 0;
    const res = await createWebApp(
      retDeps({ getCheckoutSession: async () => { calls++; return RET_OPEN; } }),
    ).request("/bff/billing/return", { headers: { accept: "application/json" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checkoutReturn: null, cancelled: false });
    expect(calls).toBe(0);
  });

  it("a degraded read lands checkoutReturn:null (the SSR's tolerate branch)", async () => {
    const res = await createWebApp(
      retDeps({ getCheckoutSession: async () => { throw new ApiError(503, "x"); } }),
    ).request("/bff/billing/return?session_id=cs_1", { headers: { accept: "application/json" } });
    expect(res.status).toBe(200);
    expect((await res.json()).checkoutReturn).toBeNull();
  });
});

describe("POST /app/settings/billing/* + /settings/billing/* — the JSON mutation branches (SPA.16; REQ-BFF-1/2/3/27)", () => {
  const mutDeps = (over: Partial<DataSource>, session: WebDeps["session"] = () => SESSION): WebDeps =>
    ({
      session,
      dataSource: {
        checkSession: async () => true,
        listProjects: async () => ROWS,
        ...over,
      } as DataSource,
    }) as WebDeps;

  it("subscribe — JSON callers get the validated {url} Stripe hand-off; form posts keep the 302", async () => {
    const checkout = async (_s: unknown, req: unknown) => ({ sessionId: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1", req });
    const seen: unknown[] = [];
    const app = createWebApp(mutDeps({
      startCheckout: async (s: unknown, req: unknown) => { seen.push(req); return checkout(s, req); },
    }));
    const json = await app.request("/app/settings/billing/subscribe", {
      ...jsonPost,
      body: JSON.stringify({ tier: "writer", cycle: "annual" }),
    });
    expect(json.status).toBe(200);
    expect(await json.json()).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_1" });
    expect(seen).toEqual([{ kind: "subscribe", plan: "writer", cycle: "annual", returnTo: "/app/settings/billing" }]);
    // The form post keeps its 302 verbatim on the SAME mint.
    const form = await createWebApp(mutDeps({ startCheckout: checkout })).request("/app/settings/billing/subscribe", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ tier: "writer", cycle: "annual" }).toString(),
      redirect: "manual",
    });
    expect(form.status).toBe(302);
    expect(form.headers.get("location")).toBe("https://checkout.stripe.com/c/pay/cs_1");
  });

  it("a non-Stripe mint is refused BEFORE the envelope — the notice redirect arm, never {url} (REQ-BFF-27)", async () => {
    const app = createWebApp(mutDeps({
      startCheckout: async () => ({ sessionId: "cs_bad", url: "https://evil.example/pay" }),
    }));
    const res = await app.request("/app/settings/billing/subscribe", { ...jsonPost, body: "{}" });
    expect(res.status).toBe(200);
    // The Stripe validator refused upstream of serialization — the JSON arm gets the same
    // ?notice=checkout redirect the form post would 302 to (the value was never serialized).
    expect(await res.json()).toEqual({ ok: true, redirect: "/app/settings/billing?notice=checkout" });
  });

  it("an api refusal maps its stable code into the redirect — JSON sees the identical URL", async () => {
    const app = createWebApp(mutDeps({
      startCheckout: async () => { throw new ApiError(403, "x", undefined, "purchase_closed"); },
    }));
    const res = await app.request("/settings/billing/subscribe", { ...jsonPost, body: "{}" });
    expect(res.status).toBe(200);
    // The ALIAS base — the redirect returns to whichever mount posted (billingBase verbatim).
    expect(await res.json()).toEqual({ ok: true, redirect: "/settings/billing?notice=purchase_closed" });
  });

  it("topup + portal — both ride the {url} envelope for JSON callers", async () => {
    const app = createWebApp(mutDeps({
      startCheckout: async () => ({ sessionId: "cs_top", url: "https://checkout.stripe.com/c/pay/cs_top" }),
      createBillingPortalSession: async () => ({ url: "https://billing.stripe.com/session/bps_1" }),
    }));
    const topup = await app.request("/app/settings/billing/topup", {
      ...jsonPost,
      body: JSON.stringify({ packId: "pack_10" }),
    });
    expect(await topup.json()).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_top" });
    const portal = await app.request("/app/settings/billing/portal", { ...jsonPost, body: "{}" });
    expect(await portal.json()).toEqual({ ok: true, url: "https://billing.stripe.com/session/bps_1" });
  });

  it("change-plan / cancel / auto-reload / waitlist — the {ok,redirect} saved/notice arms", async () => {
    const app = createWebApp(mutDeps({
      changePlan: async () => ({ applied: "scheduled" }),
      cancelSubscription: async () => ({ applied: true }),
      setAutoReload: async () => ({ ok: true }),
      joinTeamWaitlist: async () => ({ ok: true }),
    }));
    const cases: readonly { path: string; body: string; want: string }[] = [
      { path: "/app/settings/billing/change-plan", body: JSON.stringify({ tier: "writer", cycle: "monthly" }), want: "/app/settings/billing?saved=1" },
      { path: "/app/settings/billing/cancel", body: "{}", want: "/app/settings/billing?saved=1" },
      { path: "/app/settings/billing/auto-reload", body: JSON.stringify({ enabled: "1", thresholdCredits: "500", packId: "pack_50", monthlyCapUsd: "50" }), want: "/app/settings/billing?saved=1" },
      { path: "/app/settings/billing/waitlist", body: JSON.stringify({ email: "lead@example.com", seats: "4" }), want: "/app/settings/billing?saved=1" },
      { path: "/settings/billing/cancel", body: "{}", want: "/settings/billing?saved=1" },
    ];
    for (const row of cases) {
      const res = await app.request(row.path, { ...jsonPost, body: row.body });
      expect(res.status, row.path).toBe(200);
      expect(await res.json(), row.path).toEqual({ ok: true, redirect: row.want });
    }
  });

  it("the failure arms map to the notice redirects — never an error status", async () => {
    const app = createWebApp(mutDeps({
      changePlan: async () => ({ error: "no" }),
      cancelSubscription: async () => ({ applied: false }),
      setAutoReload: async () => { throw new ApiError(403, "x", undefined, "purchase_closed"); },
      joinTeamWaitlist: async () => ({ ok: false }),
    }));
    const cases: readonly { path: string; want: string }[] = [
      { path: "/app/settings/billing/change-plan", want: "/app/settings/billing?notice=change" },
      { path: "/app/settings/billing/cancel", want: "/app/settings/billing?notice=cancel" },
      { path: "/app/settings/billing/auto-reload", want: "/app/settings/billing?notice=purchase_closed" },
      { path: "/app/settings/billing/waitlist", want: "/app/settings/billing?notice=waitlist" },
    ];
    for (const row of cases) {
      const res = await app.request(row.path, { ...jsonPost, body: "{}" });
      expect(await res.json(), row.path).toEqual({ ok: true, redirect: row.want });
    }
  });

  it("unauthed JSON posts answer 401 {error:unauthenticated}, never a /login redirect", async () => {
    const app = createWebApp(mutDeps({}, () => null));
    for (const path of [
      "/app/settings/billing/subscribe",
      "/app/settings/billing/topup",
      "/app/settings/billing/change-plan",
      "/app/settings/billing/cancel",
      "/app/settings/billing/auto-reload",
      "/app/settings/billing/portal",
      "/app/settings/billing/waitlist",
      "/settings/billing/subscribe",
    ]) {
      const res = await app.request(path, { ...jsonPost, body: "{}" });
      expect(res.status, path).toBe(401);
      expect(await res.json(), path).toEqual({ error: "unauthenticated" });
      expect(res.headers.get("location"), path).toBeNull();
    }
  });
});

describe("GET /bff/p/:slug/export — the export twin (SPA.17; REQ-BFF-1/8/9/11, REQ-DAT-4/6, REQ-SEQ-12)", () => {
  const DIALOG = {
    projectId: "proj_pv",
    formats: [
      {
        id: "md",
        label: "Markdown",
        extension: "md",
        blurb: "The canonical file.",
        provenanceAppendix: true,
      },
    ],
    mdProfiles: [
      { id: "substack", label: "Substack", blurb: "Markdown shaped for the Substack editor." },
    ],
    citations: { hasBibliography: true, styles: [{ id: "apa", label: "APA" }] },
    provenance: {
      available: true,
      defaultOn: false,
      label: "Block-level provenance.",
      formats: ["md"],
    },
    surfaces: {
      disclosure: true,
      exclusivityReminder: "Confirm this piece is not under review anywhere else.",
    },
    obligations: {
      blockingOpen: 2,
      open: 3,
      line: "2 blocking obligations open",
      items: [],
      returnedIds: [],
    },
    statement: {
      template: "general",
      generated: ["This manuscript was prepared in Rhēma."],
      additions: [],
      markdown: "# AI-use statement\n",
      openObligations: 3,
      blockingOpen: 2,
      generatedAt: "2026-09-04T00:00:00.000Z",
    },
  };
  const webDeps = (over: Partial<DataSource>): WebDeps =>
    ({
      session: () => SESSION,
      dataSource: {
        listProjects: async () => ROWS,
        getExportDialog: async () => DIALOG,
        ...over,
      } as DataSource,
    }) as WebDeps;

  it("returns {export:{slug,projectId,dialog,project,paperTheme,ide}} — the document's composition verbatim", async () => {
    const res = await createWebApp(webDeps({})).request(
      "/bff/p/the-politics-of-visibility/export",
      {
        headers: { accept: "application/json" },
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      export: {
        slug: string;
        projectId: string;
        dialog: typeof DIALOG;
        project: { title: string; pill: string; slug: string };
        paperTheme: string;
        ide: { projectId?: string; themeUrl?: string };
      };
    };
    expect(body.export.slug).toBe("the-politics-of-visibility");
    expect(body.export.projectId).toBe("proj_pv");
    expect(body.export.dialog).toEqual(DIALOG);
    expect(body.export.project).toEqual({
      title: "The Politics of Visibility",
      pill: "Draft",
      slug: "the-politics-of-visibility",
    });
    expect(body.export.paperTheme).toBe("light");
    // the chrome publish bag — the ideContext fields the leaf republishes (REQ-SEQ-12).
    expect(body.export.ide.projectId).toBe("proj_pv");
    expect(body.export.ide.themeUrl).toBe("/ide/theme");
    expect(res.headers.get("x-rhema-request-id")).toBeTruthy();
  });

  it("an unknown slug answers {error:not_found} 404", async () => {
    const res = await createWebApp(webDeps({})).request("/bff/p/nope/export", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("a refused dialog read lands 404 — the SSR's catch→not-found seam verbatim", async () => {
    const res = await createWebApp(
      webDeps({
        getExportDialog: async () => {
          throw new ApiError(500, "x");
        },
      }),
    ).request("/bff/p/the-politics-of-visibility/export", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("no session → 401 JSON, never a redirect", async () => {
    const res = await createWebApp({ ...webDeps({}), session: () => null }).request(
      "/bff/p/the-politics-of-visibility/export",
      { headers: { accept: "application/json" } },
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("POST /p/:slug/export + /export/addition — the export mutation arms (SPA.17; REQ-BFF-1/2/3/17)", () => {
  const DL = {
    bytes: new TextEncoder().encode("# the manuscript").buffer as ArrayBuffer,
    mediaType: "text/markdown; charset=utf-8",
    fileName: "the-politics-of-visibility.md",
  };
  const webDeps = (
    over: Partial<DataSource> = {},
    session: WebDeps["session"] = () => SESSION,
  ): WebDeps =>
    ({
      session,
      dataSource: {
        listProjects: async () => ROWS,
        getExportDialog: async () => ({ statement: {} }),
        exportProject: async () => DL,
        appendAiUseAddition: async () => ({
          id: "ad_9",
          sentence: "x",
          createdAt: "2026-09-04T00:00:00.000Z",
        }),
        ...over,
      } as DataSource,
    }) as WebDeps;

  it("POST /export — a JSON caller gets the honest refusal (bytes never ride an envelope, REQ-BFF-17)", async () => {
    let exported = 0;
    const res = await createWebApp(
      webDeps({
        exportProject: async () => {
          exported += 1;
          return DL;
        },
      }),
    ).request("/p/the-politics-of-visibility/export", {
      ...jsonPost,
      body: JSON.stringify({ format: "md" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "binary_download" });
    // the refusal happens BEFORE the upstream call — nothing was exported.
    expect(exported).toBe(0);
  });

  it("POST /export — the form post still streams bytes (SSR behaviour verbatim)", async () => {
    const res = await createWebApp(webDeps({})).request("/p/the-politics-of-visibility/export", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "format=md",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("the-politics-of-visibility.md");
    expect(await res.text()).toBe("# the manuscript");
  });

  it("POST /export — no session: 401 JSON vs the form's /login redirect", async () => {
    const app = createWebApp(webDeps({}, () => null));
    const json = await app.request("/p/the-politics-of-visibility/export", {
      ...jsonPost,
      body: "{}",
    });
    expect(json.status).toBe(401);
    expect(await json.json()).toEqual({ error: "unauthenticated" });
    const form = await app.request("/p/the-politics-of-visibility/export", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "format=md",
    });
    expect(form.status).toBe(302);
    expect(form.headers.get("location")).toBe("/login");
  });

  it("POST /export/addition — JSON caller posts {sentence} and gets the ?added=1 redirect arm", async () => {
    let appended = "";
    const res = await createWebApp(
      webDeps({
        appendAiUseAddition: async (_s, _p, sentence) => {
          appended = sentence;
          return { id: "ad_9", sentence, createdAt: "2026-09-04T00:00:00.000Z" };
        },
      }),
    ).request("/p/the-politics-of-visibility/export/addition", {
      ...jsonPost,
      body: JSON.stringify({ sentence: "  I rewrote the ending myself.  " }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      redirect: "/p/the-politics-of-visibility/export?added=1",
    });
    expect(appended).toBe("I rewrote the ending myself.");
  });

  it("POST /export/addition — a form post still 302s to ?added=1 (SSR verbatim); empty sentence is a no-op write", async () => {
    let calls = 0;
    const app = createWebApp(
      webDeps({
        appendAiUseAddition: async () => {
          calls += 1;
          return { id: "ad_9", sentence: "x", createdAt: "2026-09-04T00:00:00.000Z" };
        },
      }),
    );
    const res = await app.request("/p/the-politics-of-visibility/export/addition", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "sentence=hi",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-politics-of-visibility/export?added=1");
    expect(calls).toBe(1);
    const empty = await app.request("/p/the-politics-of-visibility/export/addition", {
      ...jsonPost,
      body: JSON.stringify({ sentence: "   " }),
    });
    expect(empty.status).toBe(200);
    expect(calls).toBe(1); // a blank sentence never reaches the api — verbatim.
  });

  it("POST /export/addition — no session → 401 JSON vs the form's /login redirect; unknown slug → 404", async () => {
    const app = createWebApp(webDeps({}, () => null));
    const res = await app.request("/p/the-politics-of-visibility/export/addition", {
      ...jsonPost,
      body: JSON.stringify({ sentence: "x" }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
    const missing = await createWebApp(webDeps({})).request("/p/nope/export/addition", {
      ...jsonPost,
      body: JSON.stringify({ sentence: "x" }),
    });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not_found" });
  });
});

// ---- SPA.18 — the `outline` surface's twins + JSON mutation branches (REQ-BFF-1/2/3/4/8/9/11,
//      REQ-DAT-4/6): GET /bff/p/:slug/outline + /outline/promote mirror the document's own
//      composition verbatim; the four POSTs keep their form 302s and answer JSON callers the
//      `{ok,redirect}` envelope (the outline save keeps its unchanged-shape patch-result body —
//      an `{ok:true,…}` envelope already) or the `{error}` refusal at the preserved status. ----

const OUTLINE_DTO_SPA18 = {
  artifactId: "art_ol",
  slug: "the-politics-of-visibility",
  mirrorPath: "agents/author/outline/the-politics-of-visibility.md",
  versionId: "av_ol1",
  ordinal: 1,
  words: 320,
  markdown: "<!-- rhema:outline v1 -->\n# Outline\n",
  outline: {
    sidecar: "outline" as const,
    version: 1 as const,
    thesis: "Visibility is a governance technology.",
    venue: "op-ed",
    targetLength: 1200,
    spine: ["c1", "c2"],
    sections: [
      {
        ref: "I",
        title: "Set-up",
        targetWords: 500,
        function: "Stage the commonplace",
        claims: [
          { id: "c1", text: "Platforms frame visibility as empowerment.", provenance: { kind: "thread" as const, turnId: "turn_1" } },
          { id: "c2", text: "The burden falls unevenly.", provenance: { kind: "source" as const, url: "https://example.org/two" }, unverified: true },
        ],
      },
    ],
    alternativesConsidered: ["the inverse frame"],
    gaps: [{ id: "g1", needed: "A first-person refusal example", sectionRef: "I" }],
    provenance: { threadId: "thr_1", urls: [{ url: "https://example.org/two", unverified: true }] },
  },
  citedBy: { runs: [] as string[], draftIds: [] as string[] },
  editable: true,
};

const PROMOTION_DTO_SPA18 = {
  slug: "the-politics-of-visibility",
  scope: "thread" as const,
  threadId: "thr_1",
  sources: 3,
  sourceCopies: [{ src: "agents/assistant/research/sources/a.md", dst: "agents/author/research/sources/a.md" }],
  urls: ["https://example.org/one", "https://example.org/two"],
  threadTokens: 1200,
  urlsRefetched: 2,
  estimateCredits: 42,
  capCredits: 84,
  modelTier: "base",
  rigor: "standard",
  existing: false,
};

const outlineDeps = (
  over: Partial<DataSource> = {},
  session: WebDeps["session"] = () => SESSION,
): WebDeps =>
  ({
    session,
    dataSource: {
      listProjects: async () => ROWS,
      getOutline: async () => OUTLINE_DTO_SPA18,
      getOutlinePromotion: async () => PROMOTION_DTO_SPA18,
      promoteOutline: async () => ({ runId: "run_ol", state: "queued", deduped: false, slug: PROMOTION_DTO_SPA18.slug }),
      patchOutline: async () => ({ ok: true as const, versionIds: ["av_new1", "av_new2"], versionId: "av_new2", ordinal: 2 }),
      deleteOutline: async () => ({ ok: true as const }),
      answerOutlineGap: async () => ({ ok: true as const, versionIds: ["av_new1"] }),
      ...over,
    } as DataSource,
  }) as WebDeps;

describe("GET /bff/p/:slug/outline — the durable-editor twin (SPA.18; REQ-BFF-1/8/9/11, REQ-DAT-4/6)", () => {
  it("returns {outline:{…}} — the document's composition verbatim (rows, actions, estimate, cited)", async () => {
    const res = await createWebApp(outlineDeps()).request("/bff/p/the-politics-of-visibility/outline", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { outline: Record<string, unknown> };
    const o = body.outline as NonNullable<typeof body.outline>;
    expect(o.slug).toBe("the-politics-of-visibility");
    expect(o.editable).toBe(true); // the api's fact raw — the leaf ANDs deviceClass
    expect(o.saveAction).toBe("/p/the-politics-of-visibility/outline");
    expect(o.deleteAction).toBe("/p/the-politics-of-visibility/outline/delete");
    expect(o.cited).toBe(false);
    expect(typeof o.draftEstimateCredits).toBe("number");
    const view = o.outline as {
      thesis: string; venue: string; spine: string[];
      sections: { ref: string; claims: { id: string; provenanceKind: string; unverified: boolean }[] }[];
      gaps: { id: string }[]; urls: { url: string; unverified: boolean }[];
      alternativesConsidered: string[];
    };
    expect(view.thesis).toBe("Visibility is a governance technology.");
    expect(view.venue).toBe("op-ed");
    expect(view.spine).toEqual(["c1", "c2"]);
    expect(view.sections[0]!.claims[1]).toMatchObject({
      id: "c2",
      provenanceKind: "source",
      provenance: { url: "https://example.org/two" },
      unverified: true,
    });
    expect(view.gaps[0]).toMatchObject({ id: "g1", needed: "A first-person refusal example", sectionRef: "I" });
    expect(view.alternativesConsidered).toEqual(["the inverse frame"]);
    expect(view.urls).toEqual([{ url: "https://example.org/two", unverified: true }]);
    expect(res.headers.get("x-rhema-request-id")).toBeTruthy();
  });

  it("?slug passes through to the read (the artifact-pick param)", async () => {
    const getOutline = vi.fn(async () => OUTLINE_DTO_SPA18);
    const res = await createWebApp(
      outlineDeps({ getOutline: getOutline as never }),
    ).request("/bff/p/the-politics-of-visibility/outline?slug=alt-outline", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    expect(getOutline).toHaveBeenCalledWith(expect.anything(), "proj_pv", { slug: "alt-outline" });
  });

  it("no outline answers {outline:null} — the designed arm, never fabricated rows", async () => {
    const res = await createWebApp(
      outlineDeps({ getOutline: async () => { throw new ApiError(404, "x", "not_found", "not_found"); } }),
    ).request("/bff/p/the-politics-of-visibility/outline", { headers: { accept: "application/json" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outline: null });
  });

  it("a cited outline carries cited:true (the delete affordance stays withheld)", async () => {
    const res = await createWebApp(
      outlineDeps({ getOutline: async () => ({ ...OUTLINE_DTO_SPA18, citedBy: { runs: ["run_d"], draftIds: [] } }) }),
    ).request("/bff/p/the-politics-of-visibility/outline", { headers: { accept: "application/json" } });
    const body = (await res.json()) as { outline: { cited: boolean } };
    expect(body.outline.cited).toBe(true);
  });

  it("unknown slug → {error:not_found} 404; no session → 401 JSON, never a redirect", async () => {
    const missing = await createWebApp(outlineDeps()).request("/bff/p/nope/outline", {
      headers: { accept: "application/json" },
    });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not_found" });
    const res = await createWebApp(outlineDeps({}, () => null)).request(
      "/bff/p/the-politics-of-visibility/outline",
      { headers: { accept: "application/json" } },
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
    expect(res.headers.get("location")).toBeNull();
  });

  it("a cross-tenant slug never reaches the read — listProjects scopes resolution (REQ-DAT-6)", async () => {
    const getOutline = vi.fn(async () => OUTLINE_DTO_SPA18);
    const res = await createWebApp(
      outlineDeps({
        listProjects: async () => ROWS,
        getOutline: getOutline as never,
      }),
    ).request("/bff/p/nope/outline", { headers: { accept: "application/json" } });
    expect(res.status).toBe(404);
    expect(getOutline).not.toHaveBeenCalled();
  });
});

describe("GET /bff/p/:slug/outline/promote — the consent-sheet twin (SPA.18; REQ-BFF-1/8/9/11)", () => {
  it("returns {outlinePromotion:{…}} — the api's facts + the URL-echoed scope/thread/turn", async () => {
    const res = await createWebApp(outlineDeps()).request(
      "/bff/p/the-politics-of-visibility/outline/promote?scope=turn&threadId=thr_1&turnId=t_9",
      { headers: { accept: "application/json" } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      outlinePromotion: {
        slug: string; projectTitle: string; scope: string; threadId: string; turnId: string;
        promotion: typeof PROMOTION_DTO_SPA18;
      };
    };
    const p = body.outlinePromotion;
    expect(p.slug).toBe("the-politics-of-visibility");
    expect(p.projectTitle).toBe("The Politics of Visibility");
    expect(p.scope).toBe("turn");
    expect(p.threadId).toBe("thr_1");
    expect(p.turnId).toBe("t_9");
    expect(p.promotion).toEqual(PROMOTION_DTO_SPA18);
  });

  it("the legacy ?thread/?turn aliases resolve like the document's reads", async () => {
    const getOutlinePromotion = vi.fn(async () => PROMOTION_DTO_SPA18);
    const res = await createWebApp(
      outlineDeps({ getOutlinePromotion: getOutlinePromotion as never }),
    ).request("/bff/p/the-politics-of-visibility/outline/promote?thread=thr_9&turn=t_2", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    expect(getOutlinePromotion).toHaveBeenCalledWith(
      expect.anything(),
      "proj_pv",
      { scope: "thread", threadId: "thr_9", turnId: "t_2" },
    );
  });

  it("a refused promotion read answers {outlinePromotion:null} — the document's 404 arm", async () => {
    const res = await createWebApp(
      outlineDeps({ getOutlinePromotion: async () => { throw new ApiError(404, "x", "thread_not_found", "thread_not_found"); } }),
    ).request("/bff/p/the-politics-of-visibility/outline/promote?scope=thread&threadId=thr_gone", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outlinePromotion: null });
  });

  it("unknown slug → {error:not_found} 404; no session → 401", async () => {
    const missing = await createWebApp(outlineDeps()).request("/bff/p/nope/outline/promote", {
      headers: { accept: "application/json" },
    });
    expect(missing.status).toBe(404);
    const res = await createWebApp(outlineDeps({}, () => null)).request(
      "/bff/p/the-politics-of-visibility/outline/promote",
      { headers: { accept: "application/json" } },
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
  });
});

describe("POST /p/:slug/outline — the autosave's JSON dual-mode (SPA.18; REQ-BFF-1/2/3)", () => {
  it("a JSON caller posts the flat ed.* map → the same decoded PATCH edit; the answer stays the patch result verbatim", async () => {
    const patchOutline = vi.fn(async () => ({ ok: true as const, versionIds: ["av1", "av2"], versionId: "av2", ordinal: 2 }));
    const res = await createWebApp(
      outlineDeps({ patchOutline: patchOutline as never }),
    ).request("/p/the-politics-of-visibility/outline", {
      ...jsonPost,
      body: JSON.stringify({ "ed.values.thesis": "A tighter thesis.", "ed.sec.0.ord": "2" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; versionIds: string[]; ordinal: number };
    // REQ-BFF-3's unchanged-shape arm — the patch result IS the envelope (ok:true carries it).
    expect(body.ok).toBe(true);
    expect(body.versionIds).toEqual(["av1", "av2"]);
    expect(body.ordinal).toBe(2);
    expect(patchOutline).toHaveBeenCalledOnce();
    const edit = (patchOutline.mock.calls[0]![2] as { edit: Record<string, unknown> }).edit;
    expect((edit["values"] as Record<string, string>)["thesis"]).toBe("A tighter thesis.");
    expect(Array.isArray(edit["sections"])).toBe(true);
  });

  it("a structured {edit} JSON body reaches patchOutline verbatim (the PatchDto grammar)", async () => {
    const patchOutline = vi.fn(async () => ({ ok: true as const, versionIds: ["av1"], versionId: "av1", ordinal: 2 }));
    const edits = { values: { thesis: "Structured." }, gapAnswers: [{ gapId: "g1", text: "typed" }] };
    const res = await createWebApp(
      outlineDeps({ patchOutline: patchOutline as never }),
    ).request("/p/the-politics-of-visibility/outline", {
      ...jsonPost,
      body: JSON.stringify({ edit: edits }),
    });
    expect(res.status).toBe(200);
    expect(patchOutline).toHaveBeenCalledOnce();
    expect((patchOutline.mock.calls[0]![2] as { edit: unknown }).edit).toEqual(edits);
  });

  it("an empty JSON save is a no-op {ok,redirect} — never a 302 to a fetch caller", async () => {
    const patchOutline = vi.fn();
    const res = await createWebApp(
      outlineDeps({ patchOutline: patchOutline as never }),
    ).request("/p/the-politics-of-visibility/outline", {
      ...jsonPost,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/p/the-politics-of-visibility/outline" });
    expect(patchOutline).not.toHaveBeenCalled();
  });

  it("a failed patch answers {error:save_failed} 422 for JSON; the form keeps its 302s verbatim", async () => {
    const failing = outlineDeps({ patchOutline: async () => { throw new ApiError(409, "x", "version_conflict", "version_conflict"); } });
    const res = await createWebApp(failing).request("/p/the-politics-of-visibility/outline", {
      ...jsonPost,
      body: JSON.stringify({ "ed.values.thesis": "x" }),
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "save_failed" });
    // the form arm — unchanged (outline-surfaces.test.ts pins it too).
    const formRes = await createWebApp(outlineDeps()).request("/p/the-politics-of-visibility/outline", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ "ed.values.thesis": "x" }).toString(),
    });
    expect(formRes.status).toBe(302);
    expect(formRes.headers.get("location")).toBe("/p/the-politics-of-visibility/outline?saved=1");
  });
});

describe("POST /p/:slug/outline/promote — the consent click's JSON arm (SPA.18; REQ-BFF-1/2/3)", () => {
  it("a JSON caller posts {scope,threadId,slug} → {ok,redirect:/p/:slug,data} — never a 302", async () => {
    const promoteOutline = vi.fn(async () => ({ runId: "run_ol", state: "queued", deduped: false, slug: "the-politics-of-visibility" }));
    const res = await createWebApp(
      outlineDeps({ promoteOutline: promoteOutline as never }),
    ).request("/p/the-politics-of-visibility/outline/promote", {
      ...jsonPost,
      body: JSON.stringify({ scope: "thread", threadId: "thr_1", slug: "the-politics-of-visibility" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; redirect: string; data: { runId: string } };
    expect(body.ok).toBe(true);
    expect(body.redirect).toBe("/p/the-politics-of-visibility");
    expect(body.data.runId).toBe("run_ol");
    expect(res.headers.get("location")).toBeNull();
    expect(promoteOutline).toHaveBeenCalledOnce();
    const req = promoteOutline.mock.calls[0]![2] as { scope: string; threadId: string; slug: string; idempotencyKey: string };
    expect(req.scope).toBe("thread");
    expect(req.threadId).toBe("thr_1");
    expect(req.slug).toBe("the-politics-of-visibility");
    expect(req.idempotencyKey).toBeTruthy();
  });

  it("ApiError refusals ride bffFail at the preserved status — code verbatim, never a sheet", async () => {
    const missing = await createWebApp(
      outlineDeps({ promoteOutline: async () => { throw new ApiError(404, "x", "thread_not_found", "thread_not_found"); } }),
    ).request("/p/the-politics-of-visibility/outline/promote", {
      ...jsonPost,
      body: JSON.stringify({ scope: "thread", threadId: "thr_gone" }),
    });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "thread_not_found" });
    const busy = await createWebApp(
      outlineDeps({ promoteOutline: async () => { throw new ApiError(409, "x", "run_in_progress", "run_in_progress"); } }),
    ).request("/p/the-politics-of-visibility/outline/promote", {
      ...jsonPost,
      body: JSON.stringify({ scope: "thread", threadId: "thr_1" }),
    });
    expect(busy.status).toBe(409);
    expect(await busy.json()).toEqual({ error: "run_in_progress" });
  });

  it("an unbound seam answers {error:upstream_unavailable} 502 for JSON (the form keeps its 502 page)", async () => {
    const unbound = outlineDeps({ promoteOutline: undefined });
    const res = await createWebApp(unbound).request("/p/the-politics-of-visibility/outline/promote", {
      ...jsonPost,
      body: JSON.stringify({ scope: "thread" }),
    });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "upstream_unavailable" });
    const form = await createWebApp(unbound).request("/p/the-politics-of-visibility/outline/promote", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "scope=thread",
    });
    expect(form.status).toBe(502);
  });

  it("the form post still 302s to /p/:slug; no-session → 401 JSON vs /login redirect", async () => {
    const form = await createWebApp(outlineDeps()).request("/p/the-politics-of-visibility/outline/promote", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "scope=thread&threadId=thr_1",
    });
    expect(form.status).toBe(302);
    expect(form.headers.get("location")).toBe("/p/the-politics-of-visibility");
    const app = createWebApp(outlineDeps({}, () => null));
    const json = await app.request("/p/the-politics-of-visibility/outline/promote", {
      ...jsonPost,
      body: JSON.stringify({ scope: "thread", threadId: "thr_1" }),
    });
    expect(json.status).toBe(401);
    expect(await json.json()).toEqual({ error: "unauthenticated" });
    const formNoSess = await app.request("/p/the-politics-of-visibility/outline/promote", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "scope=thread",
    });
    expect(formNoSess.status).toBe(302);
    expect(formNoSess.headers.get("location")).toBe("/login");
  });
});

describe("POST /p/:slug/outline/delete + gaps/:gapId/answer — the remaining JSON arms (SPA.18; REQ-BFF-1/2/3)", () => {
  it("delete: JSON {ok,redirect:/p/:slug}; the cited 409 answers {error:outline_cited} — never a redirect", async () => {
    const res = await createWebApp(outlineDeps()).request("/p/the-politics-of-visibility/outline/delete", {
      ...jsonPost,
      body: "{}",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/p/the-politics-of-visibility" });
    expect(res.headers.get("location")).toBeNull();

    const cited = await createWebApp(
      outlineDeps({ deleteOutline: async () => { throw new ApiError(409, "x", "outline_cited", "outline_cited"); } }),
    ).request("/p/the-politics-of-visibility/outline/delete", { ...jsonPost, body: "{}" });
    expect(cited.status).toBe(409);
    expect(await cited.json()).toEqual({ error: "outline_cited" });
    expect(cited.headers.get("location")).toBeNull();
    // the form arm keeps its ?notice=cited 302 verbatim.
    const citedForm = await createWebApp(
      outlineDeps({ deleteOutline: async () => { throw new ApiError(409, "x", "outline_cited", "outline_cited"); } }),
    ).request("/p/the-politics-of-visibility/outline/delete", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "",
    });
    expect(citedForm.status).toBe(302);
    expect(citedForm.headers.get("location")).toBe("/p/the-politics-of-visibility/outline?notice=cited");
  });

  it("delete: no-session → 401 JSON vs the form's /login redirect; unknown slug → {error:not_found} 404", async () => {
    const app = createWebApp(outlineDeps({}, () => null));
    const json = await app.request("/p/the-politics-of-visibility/outline/delete", { ...jsonPost, body: "{}" });
    expect(json.status).toBe(401);
    expect(await json.json()).toEqual({ error: "unauthenticated" });
    const form = await app.request("/p/the-politics-of-visibility/outline/delete", { method: "POST" });
    expect(form.status).toBe(302);
    expect(form.headers.get("location")).toBe("/login");
    const missing = await createWebApp(outlineDeps()).request("/p/nope/outline/delete", { ...jsonPost, body: "{}" });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not_found" });
  });

  it("a gap Answer posts {text} JSON → {ok,redirect:…?saved=1}; blank input is the same no-op", async () => {
    const answerOutlineGap = vi.fn(async () => ({ ok: true as const, versionIds: ["av1"] }));
    const app = createWebApp(outlineDeps({ answerOutlineGap: answerOutlineGap as never }));
    const res = await app.request("/p/the-politics-of-visibility/outline/gaps/g1/answer", {
      ...jsonPost,
      body: JSON.stringify({ text: "  I declined the panel invite. " }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/p/the-politics-of-visibility/outline?saved=1" });
    expect(answerOutlineGap).toHaveBeenCalledWith(expect.anything(), "proj_pv", "g1", { text: "I declined the panel invite." });
    const blank = await app.request("/p/the-politics-of-visibility/outline/gaps/g1/answer", {
      ...jsonPost,
      body: JSON.stringify({ text: "   " }),
    });
    expect(blank.status).toBe(200);
    expect(await blank.json()).toEqual({ ok: true, redirect: "/p/the-politics-of-visibility/outline" });
    expect(answerOutlineGap).toHaveBeenCalledTimes(1); // the blank no-op never reaches the api
  });

  it("a gap Answer's upstream miss still answers the saved-1 arm — the swallow is verbatim; 401/404 parity", async () => {
    const res = await createWebApp(
      outlineDeps({ answerOutlineGap: async () => { throw new ApiError(500, "x"); } }),
    ).request("/p/the-politics-of-visibility/outline/gaps/g1/answer", {
      ...jsonPost,
      body: JSON.stringify({ text: "x" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/p/the-politics-of-visibility/outline?saved=1" });
    const noSess = await createWebApp(outlineDeps({}, () => null)).request(
      "/p/the-politics-of-visibility/outline/gaps/g1/answer",
      { ...jsonPost, body: JSON.stringify({ text: "x" }) },
    );
    expect(noSess.status).toBe(401);
    const missing = await createWebApp(outlineDeps()).request("/p/nope/outline/gaps/g1/answer", {
      ...jsonPost,
      body: JSON.stringify({ text: "x" }),
    });
    expect(missing.status).toBe(404);
  });
});

// ---- SPA.19 — the `figures` surface's BFF halves (REQ-BFF-1/2/3/8/9/11; REQ-DAT-4/6/13). The
// three twins + the seven POST JSON branches, driven through real Hono requests against the same
// fixtures the retained SSR suite (figure-surfaces.test.ts) pins. -------------------------------

const FIGURE_ROWS: ProjectRow[] = [
  {
    id: "proj_pv",
    slug: "the-politics-of-visibility",
    title: "The Politics of Visibility",
    headDraftId: "d_head",
    state: { key: "drafting", pill: "Drafting", overlay: null, suggested: { action: "review", label: "Review" } },
  } as ProjectRow,
];

const FIGURE_ITEM_SPA19: FigureListItemDto = {
  id: "fig01",
  assetUri: "asset://fig_fig01",
  title: "Visibility scores",
  caption: "Scores by group.",
  specKind: "vega_lite",
  kind: "chart",
  badge: "unverified_data",
  badgeText: "[unverified data]",
  n: 2,
  renderStatus: "rendered",
  hasRender: true,
  insertedInDraftId: null,
  pendingProposal: false,
  latestRunId: "run_fig",
};

const FIGURE_CARD_SPA19: FigureCardDto = {
  id: "fig01",
  assetUri: "asset://fig_fig01",
  title: "Visibility scores",
  caption: "Scores by group.",
  alt: "Bar chart of visibility scores for three groups.",
  sourceLine: "The review's claim ledger.",
  specKind: "vega_lite",
  kind: "chart",
  provenance: { kind: "none", refs: [], computedBy: "drafter", verification: "unverified" },
  badge: "unverified_data",
  badgeText: "[unverified data]",
  latestRunId: "run_fig",
  insertedInDraftId: null,
  insertedAtVersionId: null,
  pendingProposal: null,
  versions: [
    { n: 1, request: "initial", renderStatus: "rendered", renderError: null, createdAt: "2026-01-01T00:00:00Z" },
    { n: 2, request: "make it a bar chart", renderStatus: "rendered", renderError: null, createdAt: "2026-01-02T00:00:00Z" },
  ],
  files: {
    spec: '{"mark":"bar"}',
    dataCsv: "group,score\na,0.7",
    svgLight: "<svg data-fig=\"light\"></svg>",
    svgDark: null,
    tableSource: null,
  },
  render: { lightAvailable: true, darkAvailable: false, pngAvailable: false },
  readiness: { ok: true, missing: [] },
};

const figureDeps = (
  over: Partial<DataSource> = {},
  session: WebDeps["session"] = () => SESSION,
): WebDeps =>
  ({
    session,
    dataSource: {
      listProjects: async () => FIGURE_ROWS,
      listFigures: async () => [FIGURE_ITEM_SPA19],
      getFigure: async () => FIGURE_CARD_SPA19,
      patchFigure: async () => FIGURE_CARD_SPA19,
      editFigureSpec: async () => ({ ok: true as const, n: 3, specVersionId: "sv_3" }),
      restoreFigureVersion: async () => ({ ok: true as const }),
      proposeFigure: async () => ({
        ok: true as const,
        pendingProposal: { draftId: "d_head", afterBlockId: "b7", version: 2, markdown: "![a](asset://fig_fig01)", at: "2026-01-01T00:00:00Z" },
        block: "![a](asset://fig_fig01)",
      }),
      acceptFigureProposal: async () => ({
        ok: true as const,
        inserted: { figureId: "fig01", draftId: "d_head", draftN: 4, draftVersionId: "av_v4", forked: true },
      }),
      rejectFigureProposal: async () => ({ ok: true as const }),
      createRun: async () => ({ runId: "run_fig", state: "queued", deduped: false }),
      ...over,
    } as DataSource,
  }) as WebDeps;

describe("GET /bff/p/:slug/figures — the pane twin (SPA.19; REQ-BFF-1/8/9/11, REQ-DAT-4/6)", () => {
  it("returns {figures:{slug,items}} — the api's rows verbatim (badge text never retyped)", async () => {
    const res = await createWebApp(figureDeps()).request("/bff/p/the-politics-of-visibility/figures", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.figures.slug).toBe("the-politics-of-visibility");
    expect(body.figures.items).toHaveLength(1);
    expect(body.figures.items[0]).toMatchObject({
      id: "fig01",
      badge: "unverified_data",
      badgeText: "[unverified data]",
      n: 2,
      hasRender: true,
    });
    expect(res.headers.get("x-rhema-request-id")).toBeTruthy();
  });

  it("a degraded listFigures lands items:[] — the SSR's own .catch(() => null) ?? [] arm", async () => {
    const res = await createWebApp(
      figureDeps({ listFigures: async () => { throw new ApiError(500, "x"); } }),
    ).request("/bff/p/the-politics-of-visibility/figures", { headers: { accept: "application/json" } });
    expect(res.status).toBe(200);
    expect((await res.json()).figures.items).toEqual([]);
  });

  it("no session → {error:unauthenticated} 401; unknown slug → {error:not_found} 404", async () => {
    const noSess = await createWebApp(figureDeps({}, () => null)).request(
      "/bff/p/the-politics-of-visibility/figures",
      { headers: { accept: "application/json" } },
    );
    expect(noSess.status).toBe(401);
    expect(await noSess.json()).toEqual({ error: "unauthenticated" });
    const missing = await createWebApp(figureDeps()).request("/bff/p/nope/figures", {
      headers: { accept: "application/json" },
    });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not_found" });
  });
});

describe("GET /bff/p/:slug/figures/:figureId — the card twin (SPA.19)", () => {
  it("returns {figure:{slug,card,headDraftId}} — the full card + the insert target", async () => {
    const res = await createWebApp(figureDeps()).request(
      "/bff/p/the-politics-of-visibility/figures/fig01",
      { headers: { accept: "application/json" } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.figure.slug).toBe("the-politics-of-visibility");
    expect(body.figure.headDraftId).toBe("d_head");
    expect(body.figure.card.id).toBe("fig01");
    expect(body.figure.card.badgeText).toBe("[unverified data]");
    expect(body.figure.card.readiness).toEqual({ ok: true, missing: [] });
    expect(body.figure.card.versions).toHaveLength(2);
  });

  it("a missed figure read answers {figure:null} — the document's own 404 arm", async () => {
    const res = await createWebApp(
      figureDeps({ getFigure: async () => { throw new ApiError(404, "x", "figure_not_found"); } }),
    ).request("/bff/p/the-politics-of-visibility/figures/fig_gone", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ figure: null });
  });

  it("no session → 401 JSON; unknown slug → 404", async () => {
    const noSess = await createWebApp(figureDeps({}, () => null)).request(
      "/bff/p/the-politics-of-visibility/figures/fig01",
      { headers: { accept: "application/json" } },
    );
    expect(noSess.status).toBe(401);
    const missing = await createWebApp(figureDeps()).request("/bff/p/nope/figures/fig01", {
      headers: { accept: "application/json" },
    });
    expect(missing.status).toBe(404);
  });
});

describe("GET /bff/p/:slug/visualize — the consent-sheet twin (SPA.19)", () => {
  it("echoes the entry-point picks + the server-computed estimate (never leaf-derived)", async () => {
    const res = await createWebApp(figureDeps()).request(
      "/bff/p/the-politics-of-visibility/visualize?request=chart%20of%20scores&kind=vega_lite&entry=selection",
      { headers: { accept: "application/json" } },
    );
    expect(res.status).toBe(200);
    const v = (await res.json()).visualize;
    expect(v.slug).toBe("the-politics-of-visibility");
    expect(v.request).toBe("chart of scores");
    expect(v.specKind).toBe("vega_lite");
    expect(v.entryPoint).toBe("selection");
    expect(typeof v.estimateCredits).toBe("number");
    expect(typeof v.capCredits).toBe("number");
    expect(v.figureId).toBeUndefined();
    expect(v.priorVersion).toBeUndefined();
  });

  it("?figure=fig_fig01&prior=1 strips the fig_ prefix — iterate mode verbatim", async () => {
    const res = await createWebApp(figureDeps()).request(
      "/bff/p/the-politics-of-visibility/visualize?figure=fig_fig01&prior=1",
      { headers: { accept: "application/json" } },
    );
    const v = (await res.json()).visualize;
    expect(v.figureId).toBe("fig01");
    expect(v.priorVersion).toBe(1);
    expect(v.request).toBe("");
    expect(v.entryPoint).toBe("chat"); // the SSR's default arm
  });

  it("no session → 401 JSON; unknown slug → 404", async () => {
    const noSess = await createWebApp(figureDeps({}, () => null)).request(
      "/bff/p/the-politics-of-visibility/visualize",
      { headers: { accept: "application/json" } },
    );
    expect(noSess.status).toBe(401);
    const missing = await createWebApp(figureDeps()).request("/bff/p/nope/visualize", {
      headers: { accept: "application/json" },
    });
    expect(missing.status).toBe(404);
  });
});

describe("the seven figure POSTs — the JSON branches (SPA.19; REQ-BFF-1/2/3)", () => {
  it("the Visualize click: JSON → {ok,redirect:/p/:slug/figures}; the form keeps its 302 — and the run carries the verbatim field map", async () => {
    const createRun = vi.fn(async () => ({ runId: "run_fig", state: "queued", deduped: false }));
    const app = createWebApp(figureDeps({ createRun: createRun as never }));
    const json = await app.request("/p/the-politics-of-visibility/visualize", {
      ...jsonPost,
      body: JSON.stringify({
        request: "a chart of @claim:v2/41",
        specKind: "vega_lite",
        entryPoint: "chat",
        idempotencyKey: "idem_1",
      }),
    });
    expect(json.status).toBe(200);
    expect(await json.json()).toEqual({ ok: true, redirect: "/p/the-politics-of-visibility/figures" });
    const req = createRun.mock.calls[0]![2] as {
      workflow: string;
      figure: { request: string; specKind?: string; sourceRefs?: { claimIds?: string[] } };
    };
    expect(req.workflow).toBe("figure");
    expect(req.figure.request).toBe("a chart of @claim:v2/41");
    expect(req.figure.specKind).toBe("vega_lite");
    expect(req.figure.sourceRefs?.claimIds).toEqual(["v2/41"]);
    const form = await app.request("/p/the-politics-of-visibility/visualize", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "request=another",
    });
    expect(form.status).toBe(302);
    expect(form.headers.get("location")).toBe("/p/the-politics-of-visibility/figures");
  });

  it("a blank request answers {error:request_required, detail} 422 — the document's re-render arm, never a redirect", async () => {
    const createRun = vi.fn(async () => ({} as never));
    const res = await createWebApp(figureDeps({ createRun: createRun as never })).request(
      "/p/the-politics-of-visibility/visualize",
      { ...jsonPost, body: JSON.stringify({ request: "   " }) },
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("request_required");
    expect(typeof body.detail).toBe("string");
    expect(createRun).not.toHaveBeenCalled();
  });

  it("an upstream refusal passes through at the preserved status — a JSON caller never gets a sheet or a redirect", async () => {
    const res = await createWebApp(
      figureDeps({ createRun: async () => { throw new ApiError(402, "x", "msg", "insufficient_balance"); } }),
    ).request("/p/the-politics-of-visibility/visualize", {
      ...jsonPost,
      body: JSON.stringify({ request: "chart me" }),
    });
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: "insufficient_balance" });
    expect(res.headers.get("location")).toBeNull();
  });

  it("field edits: JSON → {ok,redirect:…?saved=1}; an alt>250 refusal rides the ?notice= redirect verbatim", async () => {
    const patchFigure = vi.fn(async () => FIGURE_CARD_SPA19);
    const app = createWebApp(figureDeps({ patchFigure: patchFigure as never }));
    const res = await app.request("/p/the-politics-of-visibility/figures/fig01", {
      ...jsonPost,
      body: JSON.stringify({ caption: "New caption.", alt: "Alt text.", sourceLine: "The ledger." }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/p/the-politics-of-visibility/figures/fig01?saved=1" });
    expect(patchFigure).toHaveBeenCalledWith(expect.anything(), "proj_pv", "fig01", {
      caption: "New caption.", alt: "Alt text.", sourceLine: "The ledger.",
    });
    const refused = await createWebApp(
      figureDeps({ patchFigure: async () => { throw new ApiError(422, "x", "alt_too_long"); } }),
    ).request("/p/the-politics-of-visibility/figures/fig01", {
      ...jsonPost,
      body: JSON.stringify({ caption: "", alt: "x".repeat(300), sourceLine: "" }),
    });
    expect(refused.status).toBe(200);
    const env = await refused.json();
    expect(env.ok).toBe(true);
    expect(env.redirect).toContain("/p/the-politics-of-visibility/figures/fig01?notice=");
  });

  it("spec-edit: JSON → {ok,redirect:card}; an unsupported chip rides the ?notice=<code> redirect", async () => {
    const editFigureSpec = vi.fn(async () => ({ ok: true as const }));
    const app = createWebApp(figureDeps({ editFigureSpec: editFigureSpec as never }));
    const res = await app.request("/p/the-politics-of-visibility/figures/fig01/spec-edit", {
      ...jsonPost,
      body: JSON.stringify({ mark: "line" }),
    });
    expect(await res.json()).toEqual({ ok: true, redirect: "/p/the-politics-of-visibility/figures/fig01" });
    expect(editFigureSpec).toHaveBeenCalledWith(expect.anything(), "proj_pv", "fig01", { mark: "line" });
    const refused = await createWebApp(
      figureDeps({ editFigureSpec: async () => { throw new ApiError(422, "x", "chip_not_supported"); } }),
    ).request("/p/the-politics-of-visibility/figures/fig01/spec-edit", {
      ...jsonPost,
      body: JSON.stringify({ mark: "arc" }),
    });
    const env = await refused.json();
    expect(env.redirect).toBe("/p/the-politics-of-visibility/figures/fig01?notice=chip_not_supported");
  });

  it("restore: JSON → {ok,redirect:card} with n off the path; propose: {ok,redirect,data} + the 409 readiness notice", async () => {
    const restoreFigureVersion = vi.fn(async () => ({ ok: true as const }));
    const app = createWebApp(figureDeps({ restoreFigureVersion: restoreFigureVersion as never }));
    const res = await app.request("/p/the-politics-of-visibility/figures/fig01/versions/1/restore", {
      ...jsonPost,
      body: "{}",
    });
    expect(await res.json()).toEqual({ ok: true, redirect: "/p/the-politics-of-visibility/figures/fig01" });
    expect(restoreFigureVersion).toHaveBeenCalledWith(expect.anything(), "proj_pv", "fig01", 1);

    const propose = await app.request("/p/the-politics-of-visibility/figures/fig01/propose", {
      ...jsonPost,
      body: JSON.stringify({ afterBlockId: "b7" }),
    });
    const penv = await propose.json();
    expect(penv.ok).toBe(true);
    expect(penv.redirect).toBe("/p/the-politics-of-visibility/figures/fig01");
    expect(penv.data.pendingProposal.version).toBe(2);
    const notReady = await createWebApp(
      figureDeps({ proposeFigure: async () => { throw new ApiError(409, "x", "figure_not_ready"); } }),
    ).request("/p/the-politics-of-visibility/figures/fig01/propose", { ...jsonPost, body: "{}" });
    expect((await notReady.json()).redirect).toBe(
      "/p/the-politics-of-visibility/figures/fig01?notice=figure_not_ready",
    );
  });

  it("Accept: the fork's draftN lands redirect:/p/:slug/v/<n> (the 302's identical target); Reject lands back on the card", async () => {
    const app = createWebApp(figureDeps());
    const accept = await app.request("/p/the-politics-of-visibility/figures/fig01/proposals/accept", {
      ...jsonPost,
      body: "{}",
    });
    const aenv = await accept.json();
    expect(aenv.ok).toBe(true);
    expect(aenv.redirect).toBe("/p/the-politics-of-visibility/v/4");
    expect(aenv.data.inserted.forked).toBe(true);
    const reject = await app.request("/p/the-politics-of-visibility/figures/fig01/proposals/reject", {
      ...jsonPost,
      body: "{}",
    });
    expect(await reject.json()).toEqual({ ok: true, redirect: "/p/the-politics-of-visibility/figures/fig01" });
  });

  it("no session → 401 JSON vs the form's /login redirect; unknown slug → {error:not_found} 404", async () => {
    const json = await createWebApp(figureDeps({}, () => null)).request(
      "/p/the-politics-of-visibility/figures/fig01/proposals/reject",
      { ...jsonPost, body: "{}" },
    );
    expect(json.status).toBe(401);
    expect(await json.json()).toEqual({ error: "unauthenticated" });
    const form = await createWebApp(figureDeps({}, () => null)).request(
      "/p/the-politics-of-visibility/figures/fig01/proposals/reject",
      { method: "POST" },
    );
    expect(form.status).toBe(302);
    expect(form.headers.get("location")).toBe("/login");
    const missing = await createWebApp(figureDeps()).request(
      "/p/nope/figures/fig01/proposals/reject",
      { ...jsonPost, body: "{}" },
    );
    expect(missing.status).toBe(404);
  });
});

// ---- SPA.20 — the `run-sheet` surface (REQ-BFF-1/2/3/4/8/9/11/12/23, REQ-DAT-4/6/12; design/22
// §2 `p.run` + §7.3). The twin shares the document's `runSheetComposition` verbatim — the same
// seams, the same side effects (the rhema_fp mint, the exhausted-prompt impression) — and the two
// POSTs answer the same envelope as their form 302s. ----

const RUN_CTX_SPA20 = {
  project: {
    protocol: "essay",
    venue: null,
    approvalPolicy: "named" as const,
    rigor: "standard",
    modelTier: null,
    protocolChanged: false,
    protocolVersion: 1,
    memoConfidentiality: false,
    protocolDefaults: {},
  },
  protocols: [],
  headDraft: { id: "d_1", n: 1, state: "ready", words: 600, sha256: null },
  sections: [],
  openObligations: 0,
  reviewScopeLine: null,
  reviseScopeLine: null,
  standingNotes: 0,
  entitlement: null,
  dontAskUnder: 0,
  activeRuns: [],
  blockedBy: null,
};

const BILLING_OPEN = {
  spendableCredits: 100000,
  suspended: false,
  clawbackDebt: 0,
  purchase: "open" as const,
  paymentLinkUrl: "https://buy.stripe.com/test_pl",
  billingAccountId: "ba_1",
};

const ESTIMATE_DTO_SPA20 = {
  estimateCredits: 288,
  capCredits: 432,
  rateTableVersion: 3,
  provisional: true,
  claimCount: 21,
  levers: {},
};

const runDeps = (
  over: Partial<DataSource> = {},
  session: WebDeps["session"] = () => SESSION,
): WebDeps =>
  ({
    session,
    dataSource: {
      checkSession: async () => true,
      listProjects: async () => ROWS,
      getRunSheetContext: async () => RUN_CTX_SPA20,
      getBillingBalance: async () => BILLING_OPEN,
      getProjectVoice: async () => null,
      getPretriage: async () => ({ triaged: 3, total: 12 }),
      estimate: async () => ESTIMATE_DTO_SPA20,
      createRun: async () => ({ runId: "run_1", state: "queued", deduped: false }),
      recordExhaustedPrompt: async () => undefined,
      ...over,
    } as DataSource,
  }) as WebDeps;

describe("GET /bff/p/:slug/run — the run-sheet aggregate twin (SPA.20; REQ-BFF-1/8/9/11)", () => {
  it("returns the document's composition verbatim — view-as-DTO incl. recompute/idempotencyKey + the shell bag", async () => {
    const res = await createWebApp(runDeps()).request("/bff/p/the-politics-of-visibility/run", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runSheet.slug).toBe("the-politics-of-visibility");
    expect(body.runSheet.projectTitle).toBe("The Politics of Visibility");
    const view = body.runSheet.view;
    expect(view.workflow).toBe("review");
    expect(typeof view.estimate.estimateCredits).toBe("number");
    expect(typeof view.idempotencyKey).toBe("string");
    // the lever matrix rides inside — the leaf repaints off `cells`, never the estimator.
    expect(Object.keys(view.recompute.cells).length).toBeGreaterThan(0);
    expect(view.recompute.spendableCredits).toBe(100000);
    // the IDE shell bag — project/theme/ide the framed leaf republishes.
    expect(body.project.slug).toBe("the-politics-of-visibility");
    expect(body.paperTheme).toBeDefined();
    expect(body.ide).toBeDefined();
    expect(res.headers.get("x-rhema-request-id")).toBeTruthy();
  });

  it("forwards the lever deep-link params onto the composition — workflow/scope verbatim", async () => {
    const ctx = vi.fn(async () => ({ ...RUN_CTX_SPA20 }));
    const res = await createWebApp(runDeps({ getRunSheetContext: ctx as never })).request(
      "/bff/p/the-politics-of-visibility/run?workflow=revise&scope=section%3AIII",
      { headers: { accept: "application/json" } },
    );
    expect(res.status).toBe(200);
    expect(ctx).toHaveBeenCalledWith(expect.anything(), "proj_pv", {
      workflow: "revise",
      scope: "section:III",
    });
    const body = await res.json();
    expect(body.runSheet.view.workflow).toBe("revise");
    // revise ⇒ the pretriage read lands on the twin (the document's own PageData key).
    expect(body.pretriage).toEqual({ triaged: 3, total: 12 });
  });

  it("a non-terminal run collapses the twin into the document's in-progress arm", async () => {
    const res = await createWebApp(
      runDeps({
        getRunSheetContext: async () => ({
          ...RUN_CTX_SPA20,
          blockedBy: { runId: "run_live", state: "running" },
        }),
      }),
    ).request("/bff/p/the-politics-of-visibility/run", { headers: { accept: "application/json" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runSheet.activeRun).toEqual({ runId: "run_live", state: "running" });
  });

  it("mints rhema_fp when the sheet carries an entitlement — the same billing trail the GET leaves", async () => {
    const res = await createWebApp(
      runDeps({
        getRunSheetContext: async () => ({
          ...RUN_CTX_SPA20,
          entitlement: { id: "ent_1", kind: "review", wordCap: 2800, rigor: "standard", modelTier: "base" },
        }),
      }),
    ).request("/bff/p/the-politics-of-visibility/run?rigor=standard&modelTier=base", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runSheet.view.entitlementId).toBe("ent_1");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("rhema_fp=");
    expect(cookie).toContain("HttpOnly");
  });

  it("no session → {error:unauthenticated} 401; unknown slug → {error:not_found} 404", async () => {
    const noSess = await createWebApp(runDeps({}, () => null)).request(
      "/bff/p/the-politics-of-visibility/run",
      { headers: { accept: "application/json" } },
    );
    expect(noSess.status).toBe(401);
    expect(await noSess.json()).toEqual({ error: "unauthenticated" });
    const missing = await createWebApp(runDeps()).request("/bff/p/nope/run", {
      headers: { accept: "application/json" },
    });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not_found" });
  });
});

describe("POST /bff/p/:slug/estimate — REQ-BFF-23's typed revalidation (SPA.20)", () => {
  const REQ = {
    workflow: "review",
    rigor: "standard",
    modelTier: "balanced",
    inputs: { words: 5180 },
  };

  it("forwards the EstimateRequestDto verbatim and lands the api's EstimateDto", async () => {
    const estimate = vi.fn(async () => ESTIMATE_DTO_SPA20);
    const res = await createWebApp(runDeps({ estimate: estimate as never })).request(
      "/bff/p/the-politics-of-visibility/estimate",
      { ...jsonPost, body: JSON.stringify(REQ) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(ESTIMATE_DTO_SPA20);
    expect(estimate).toHaveBeenCalledWith(expect.objectContaining(SESSION), "proj_pv", REQ);
  });

  it("a non-object body is {error:invalid_request} 400; an api refusal rides at its status", async () => {
    const bad = await createWebApp(runDeps()).request("/bff/p/the-politics-of-visibility/estimate", {
      ...jsonPost,
      body: "[1,2]",
    });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "invalid_request" });
    const refused = await createWebApp(
      runDeps({ estimate: async () => { throw new ApiError(422, "x", "msg", "estimate_out_of_range"); } }),
    ).request("/bff/p/the-politics-of-visibility/estimate", { ...jsonPost, body: JSON.stringify(REQ) });
    expect(refused.status).toBe(422);
    expect(await refused.json()).toEqual({ error: "estimate_out_of_range" });
  });

  it("no session → 401 JSON; unknown slug → 404", async () => {
    const noSess = await createWebApp(runDeps({}, () => null)).request(
      "/bff/p/the-politics-of-visibility/estimate",
      { ...jsonPost, body: JSON.stringify(REQ) },
    );
    expect(noSess.status).toBe(401);
    const missing = await createWebApp(runDeps()).request("/bff/p/nope/estimate", {
      ...jsonPost,
      body: JSON.stringify(REQ),
    });
    expect(missing.status).toBe(404);
  });
});

describe("POST /p/:slug/run — the JSON branch (SPA.20; REQ-BFF-2/3/4/5)", () => {
  const RUN_BODY = {
    workflow: "review",
    rigor: "standard",
    modelTier: "balanced",
    idempotencyKey: "idem_json",
    estimateCredits: "288",
    capCredits: "432",
    rateTableVersion: "3",
    words: "600",
    claims: "4",
    toggleKeys: "fact_check,discourse",
    toggleRigor: "standard",
    "toggle.fact_check": "on",
    approval: "named",
    guidance: "Watch the signposting.",
  };

  it("JSON → {ok:true,data:{runId,state}} — the verbatim field map reaches createRun (toggles, snapshot, levers)", async () => {
    const createRun = vi.fn(async () => ({ runId: "run_1", state: "queued", deduped: false }));
    const res = await createWebApp(runDeps({ createRun: createRun as never })).request(
      "/p/the-politics-of-visibility/run",
      { ...jsonPost, body: JSON.stringify(RUN_BODY) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { runId: "run_1", state: "queued" } });
    const req = createRun.mock.calls[0]![2] as {
      workflow: string; rigor: string; modelTier: string; idempotencyKey: string;
      estimateCredits: number; capCredits: number; rateTableVersion: number;
      toggles: Record<string, boolean>; inputSnapshot: { wordCount: number; claimCount?: number };
      guidance?: string; approvalPolicy?: string;
    };
    expect(req.workflow).toBe("review");
    expect(req.idempotencyKey).toBe("idem_json");
    expect(req.toggles).toEqual({ fact_check: true, discourse: false });
    expect(req.inputSnapshot).toEqual({ wordCount: 600, claimCount: 4 });
    expect(req.guidance).toBe("Watch the signposting.");
    expect(req.approvalPolicy).toBe("named");
  });

  it("the rhema_fp cookie forwards as the api's fingerprint field (minted on the GET)", async () => {
    const createRun = vi.fn(async () => ({ runId: "run_1", state: "queued", deduped: false }));
    const res = await createWebApp(runDeps({ createRun: createRun as never })).request(
      "/p/the-politics-of-visibility/run",
      {
        ...jsonPost,
        headers: { ...jsonPost.headers, cookie: "rhema_fp=fp_test_1" },
        body: JSON.stringify(RUN_BODY),
      },
    );
    expect(res.status).toBe(200);
    expect((createRun.mock.calls[0]![2] as { fingerprint?: string }).fingerprint).toBe("fp_test_1");
  });

  it("a refusal rides its preserved status + stable code — run_in_progress 409, insufficient 402, trial_* verbatim", async () => {
    const app = (code: string, status: number) =>
      createWebApp(
        runDeps({ createRun: async () => { throw new ApiError(status, "x", "msg", code); } }),
      );
    const busy = await app("run_in_progress", 409).request("/p/the-politics-of-visibility/run", {
      ...jsonPost, body: JSON.stringify(RUN_BODY),
    });
    expect(busy.status).toBe(409);
    expect(await busy.json()).toEqual({ error: "run_in_progress" });
    expect(busy.headers.get("location")).toBeNull();
    const short = await app("insufficient_balance", 402).request("/p/the-politics-of-visibility/run", {
      ...jsonPost, body: JSON.stringify(RUN_BODY),
    });
    expect(short.status).toBe(402);
    expect(await short.json()).toEqual({ error: "insufficient_balance" });
    const trial = await app("trial_shape", 422).request("/p/the-politics-of-visibility/run", {
      ...jsonPost, body: JSON.stringify(RUN_BODY),
    });
    expect(trial.status).toBe(422);
    expect(await trial.json()).toEqual({ error: "trial_shape" });
  });

  it("a form post lands its 302 back on the sheet (SPA.27 — the inline re-render is deleted)", async () => {
    const res = await createWebApp(runDeps()).request("/p/the-politics-of-visibility/run", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "workflow=review&rigor=standard&idempotencyKey=idem_f&estimateCredits=288&capCredits=432",
      redirect: "manual",
    });
    // SPA.27 — the sheet-HTML re-render ("Your run has started") retired with the document; the
    // no-JS floor keeps the 302 hand-off and the sheet reloads in its started state.
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-politics-of-visibility/run");
  });
});

describe("POST /p/:slug/exhausted — the Payment-Link JSON branch (SPA.20; REQ-BFF-2/27)", () => {
  it("JSON → {ok,url} with the allowlist-validated Stripe target carrying client_reference_id", async () => {
    const record = vi.fn(async () => undefined);
    const res = await createWebApp(runDeps({ recordExhaustedPrompt: record as never })).request(
      "/p/the-politics-of-visibility/exhausted",
      { ...jsonPost, body: JSON.stringify({ action_taken: "open_payment_link" }) },
    );
    expect(res.status).toBe(200);
    const env = await res.json();
    expect(env.ok).toBe(true);
    expect(env.url).toBe("https://buy.stripe.com/test_pl?client_reference_id=ba_1");
    expect(record).toHaveBeenCalledWith(expect.anything(), "open_payment_link");
  });

  it("a closed purchase switch answers {ok,redirect:…?notice=purchase_paused} — the 302's twin", async () => {
    const res = await createWebApp(
      runDeps({ getBillingBalance: async () => ({ ...BILLING_OPEN, purchase: "closed" as const }) }),
    ).request("/p/the-politics-of-visibility/exhausted", {
      ...jsonPost, body: JSON.stringify({ action_taken: "open_payment_link" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      redirect: "/p/the-politics-of-visibility/run?notice=purchase_paused",
    });
  });

  it("a form post keeps its 302 hand-off; no session → 401 JSON vs the /login redirect", async () => {
    const form = await createWebApp(runDeps()).request("/p/the-politics-of-visibility/exhausted", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "action_taken=open_payment_link",
    });
    expect(form.status).toBe(302);
    expect(form.headers.get("location")).toContain("https://buy.stripe.com/test_pl");
    const noSess = await createWebApp(runDeps({}, () => null)).request(
      "/p/the-politics-of-visibility/exhausted",
      { ...jsonPost, body: JSON.stringify({ action_taken: "open_payment_link" }) },
    );
    expect(noSess.status).toBe(401);
    const missing = await createWebApp(runDeps()).request("/p/nope/exhausted", {
      ...jsonPost, body: JSON.stringify({ action_taken: "open_payment_link" }),
    });
    expect(missing.status).toBe(404);
  });
});

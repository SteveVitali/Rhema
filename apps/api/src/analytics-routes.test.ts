import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, makeDeps, type OrchestratorTestDb, type TestDeps } from "@rhema/orchestrator/testing";
import { createAnalyticsRoutes } from "./analytics-routes.js";
import { createBillingRoutes } from "./billing-routes.js";
import type { Principal } from "./index.js";

// PRB.12 — the client-facing telemetry surface over PGlite via Hono's app.request:
//  • POST /analytics/events — the client mints {event, props, …}; the server owns the envelope
//    (session principal + clock). Only CLIENT_ANALYTICS_EVENTS pass — a server-owned or unknown
//    name is a 403, a malformed payload a 422, an opted-out user a silent {recorded:false}.
//  • GET|POST /settings/privacy — the analytics_opt_out flag round-trips per user (REQ-PROD-15).
//  • GET /billing/usage — the §14.5 level-1 glance: the balance (spendable + held) + recent runs' spend.

let db: OrchestratorTestDb;
let deps: TestDeps;
const NOW = new Date("2026-09-20T12:00:00Z");

// ULID-shaped ids — the analytics envelope validates user_id/workspace_id at the write boundary.
const USER = "01JQ0000000000000000000MB1";
const WS = "01JQ0000000000000000000WS1";
const BA = "ba_seed";
const PROJ = "01JQ0000000000000000PROJ1";

const principal = (): Principal => ({ userId: USER, workspaceId: WS, billingAccountId: BA });

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db, { now: NOW });
  await seedProject(db, { userId: USER, workspaceId: WS, billingAccountId: BA, projectId: PROJ, draftN: 1 });
  await db.pg.query("insert into workspace_members(workspace_id, user_id, role) values ($1,$2,'admin')", [WS, USER]);
});
afterEach(() => db.close());

function analyticsApp(over: Partial<Parameters<typeof createAnalyticsRoutes>[0]> = {}) {
  return createAnalyticsRoutes({ principal, txRunner: db.txRunner, ids: deps.ids, clock: deps.clock, ...over });
}
function usageApp(over: Partial<Parameters<typeof createBillingRoutes>[0]> = {}) {
  return createBillingRoutes({
    principal,
    txRunner: db.txRunner,
    systemExec: db.client,
    queue: deps.queue,
    clock: deps.clock,
    ids: deps.ids,
    ...over,
  });
}

const postEvent = (body: unknown) =>
  analyticsApp().request("/analytics/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const DWELL = (over: Record<string, unknown> = {}) => ({
  event: "surface.dwell",
  props: { surface: "editor", ms: 42_000 },
  ...over,
});

const eventCount = async () =>
  ((await db.client.query("select count(*)::int n from analytics_events")).rows[0] as { n: number }).n;

describe("POST /analytics/events — the client whitelist (AC1/AC5)", () => {
  it("mints a whitelisted event into analytics_events; the server fills the envelope", async () => {
    const res = await postEvent(DWELL());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recorded: true });
    const row = (await db.client.query("select user_id, workspace_id, event, props from analytics_events")).rows[0] as {
      user_id: string; workspace_id: string; event: string; props: { surface: string; ms: number };
    };
    // The session principal owns the envelope — the client cannot speak for another user.
    expect(row).toMatchObject({ user_id: USER, workspace_id: WS, event: "surface.dwell" });
    expect(row.props).toEqual({ surface: "editor", ms: 42_000 });
  });

  it("403s a server-owned event name — the client cannot mint run/billing facts", async () => {
    const res = await postEvent({ event: "run.started", props: { app_preset: "x", rigor: "standard" } });
    expect(res.status).toBe(403);
    expect(await eventCount()).toBe(0);
  });

  it("403s a name outside the catalogue entirely", async () => {
    const res = await postEvent({ event: "admin.backdoor", props: {} });
    expect(res.status).toBe(403);
    expect(await eventCount()).toBe(0);
  });

  it("422s a malformed props shape — the catalogue schema refuses, nothing is parked", async () => {
    const res = await postEvent({ event: "surface.dwell", props: { surface: "editor", ms: "lots" } });
    expect(res.status).toBe(422);
    expect(await eventCount()).toBe(0);
  });

  it("dedupes on the client's dedupeKey — a retried beacon is one row (0024)", async () => {
    const key = "beacon-abc";
    expect(await (await postEvent(DWELL({ dedupeKey: key }))).json()).toEqual({ ok: true, recorded: true });
    expect(await (await postEvent(DWELL({ dedupeKey: key }))).json()).toEqual({ ok: true, recorded: false });
    expect(await eventCount()).toBe(1);
  });

  it("an opted-out user's mint is a silent no-op — {recorded:false}, no row (REQ-PROD-15 write side)", async () => {
    await db.pg.query('update "user" set analytics_opt_out = true where id = $1', [USER]);
    const res = await postEvent(DWELL());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recorded: false });
    expect(await eventCount()).toBe(0);
  });

  it("401 unauthenticated", async () => {
    const anon = analyticsApp({ principal: () => null });
    const res = await anon.request("/analytics/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(DWELL()),
    });
    expect(res.status).toBe(401);
  });
});

// 223 R7DEM.6b (REQ-TOUR-9) — POST /analytics/demo: the ONE sanctioned demo write, pre-auth
// on `deps.db` exactly like /analytics/landing. Always 204, never a Set-Cookie, never reads
// an identity header; a valid event lands exactly one demo_events row through the
// SECURITY DEFINER channel; everything else is a silent drop.
describe("POST /analytics/demo — the anonymous demo funnel carve-out", () => {
  const post = (app: ReturnType<typeof analyticsApp>, body: unknown, headers: Record<string, string> = {}) =>
    app.request("/analytics/demo", {
      method: "POST",
      headers: { "content-type": "text/plain", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  const demoRows = async () =>
    (await db.client.query("select event, essay, step, src from demo_events")).rows;

  it("a valid event inserts exactly one row — signed out AND signed in", async () => {
    const app = analyticsApp({ db: db.client });
    for (const headers of [{}, { cookie: "rhema.session_token=x", authorization: "Bearer y" }]) {
      const res = await post(app, { event: "demo.hub_viewed", src: "jrn" }, headers);
      expect(res.status).toBe(204);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
    expect(await demoRows()).toHaveLength(2);
  });

  it("oversize, out-of-enum, malformed and non-JSON bodies are 204 with no row", async () => {
    const app = analyticsApp({ db: db.client });
    const res1 = await post(app, { event: "demo.evil" });
    const res2 = await post(app, { event: "demo.hub_viewed", essay: "x".repeat(400) });
    const res3 = await post(app, "not json at all");
    const res4 = await post(app, JSON.stringify({ event: "demo.hub_viewed" }).padEnd(300, " "));
    for (const r of [res1, res2, res3, res4]) {
      expect(r.status).toBe(204);
      expect(r.headers.get("set-cookie")).toBeNull();
    }
    expect(await demoRows()).toHaveLength(0);
  });

  it("bounded fields land; an out-of-bounds optional field is dropped, not the event", async () => {
    const app = analyticsApp({ db: db.client });
    await post(app, { event: "demo.tour_completed_or_cta", essay: "structure-of-political-difference", step: 11, src: "jrn" });
    const [row] = await demoRows();
    expect(row).toMatchObject({
      event: "demo.tour_completed_or_cta",
      essay: "structure-of-political-difference",
      step: 11,
      src: "jrn",
    });
    // a bad step clears the field, the event still lands (essay/src stay).
    await post(app, { event: "demo.tour_started", essay: "x", step: 1000, src: "s" });
    const rows = await demoRows();
    expect(rows[1]).toMatchObject({ event: "demo.tour_started", essay: "x", step: null, src: "s" });
  });
});

describe("GET|POST /settings/privacy — the opt-out flag (REQ-PROD-15)", () => {
  it("defaults off, then the POST flips it and the GET reflects it", async () => {
    expect(await (await analyticsApp().request("/settings/privacy")).json()).toEqual({ analyticsOptOut: false });
    const res = await analyticsApp().request("/settings/privacy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ analyticsOptOut: true }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, analyticsOptOut: true });
    expect(await (await analyticsApp().request("/settings/privacy")).json()).toEqual({ analyticsOptOut: true });
    const row = (await db.client.query('select analytics_opt_out as o from "user" where id = $1', [USER])).rows[0];
    expect(row).toEqual({ o: true });
  });

  it("422s a non-boolean body", async () => {
    const res = await analyticsApp().request("/settings/privacy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ analyticsOptOut: "yes" }),
    });
    expect(res.status).toBe(422);
  });
});

describe("GET /billing/usage — the §14.5 level-1 glance (REQ-BETA-14)", () => {
  const RUN = "01JQ0000000000000000000RN1";
  const seedRun = () =>
    db.pg.query(
      `insert into runs(id, workspace_id, project_id, workflow, state, inputs, model_profile, model_tier,
                        rigor, estimate_credits, cap_credits, spent_credits, rate_table_version, requested_by)
       values ($1,$2,$3,'chapter_review','done','{}','p','balanced','standard',400,600,517,1,$4)`,
      [RUN, WS, PROJ, USER],
    );

  it("returns the balance (spendable + held) + the account's recent runs' spend", async () => {
    await db.pg.query("insert into credit_balances(billing_account_id, bucket, available, held) values ($1,'included',1200,140)", [BA]);
    await seedRun();
    const res = await usageApp().request("/billing/usage");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      spendableCredits: 1200,
      heldCredits: 140,
      runs: [
        {
          runId: RUN,
          projectId: PROJ,
          workflow: "chapter_review",
          state: "done",
          estimateCredits: 400,
          capCredits: 600,
          spentCredits: 517,
          createdAt: expect.any(String),
          endedAt: null,
        },
      ],
    });
  });

  it("401 unauthenticated", async () => {
    const anon = usageApp({ principal: () => null });
    expect((await anon.request("/billing/usage")).status).toBe(401);
  });
});

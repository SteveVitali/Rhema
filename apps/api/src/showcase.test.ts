import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, makeDeps, seedProject, type OrchestratorTestDb, type TestDeps } from "@rhema/orchestrator/testing";
import { createIpEmailThrottle } from "@rhema/contracts";
import { InMemoryContentStore } from "@rhema/mirror";
import { createApp, type Principal } from "./index.js";
import { createShowcaseSeeder, isShowcaseProject } from "./showcase.js";

// P1.17 (§15.4) — the Showcase lifecycle over PGlite:
//   • provisioning seeds ONE deterministic dossier per workspace at $0 (idempotent — a re-provision
//     repairs rather than duplicates);
//   • GET /showcase hands the web's precedence read its {projectId, reviewRunId, firstFindingId,
//     opened, archived} entry + the recorded signup intent;
//   • read-only: POST /projects/:id/runs → 409 showcase_read_only; every mutating project route
//     (chat threads here stand in for the mounted guard) 409s; GETs pass;
//   • archive / unarchive / duplicate are allowed; DELETE refuses (showcase_not_deletable).

let db: OrchestratorTestDb;
let deps: TestDeps;
const NOW = new Date("2026-09-20T12:00:00Z");

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db, { now: NOW });
});
afterEach(() => db.close());

// 26-char Crockford-base32 ids — the analytics envelope validates them at the write boundary.
const UL = "01JQ0000000000000000000SC1";
const WS = "01JQ0000000000000000000WS1";
const BA = "ba_sc";

async function provisioned() {
  // seed the account rows, then run the provisioning seam once (what POST /signup + onUserCreate call).
  await seedProject(db, { userId: UL, workspaceId: WS, billingAccountId: BA, projectId: "01JQSC00000000000000PRJ1", draftN: 1 });
  // the content store bound like the live deploy — the dossier's letter/draft bytes render.
  const store = new InMemoryContentStore();
  const seed = createShowcaseSeeder({ txRunner: db.txRunner, ids: deps.ids, clock: deps.clock, store });
  const result = await seed(WS, UL);
  const principal = (): Principal => ({ userId: UL, workspaceId: WS, billingAccountId: BA });
  const app = createApp({
    ...deps,
    principal,
    db: db.client,
    store,
    signupMode: "open",
    signupThrottle: createIpEmailThrottle({ perIp: 100, perEmail: 100, windowMs: 60_000 }),
    systemExec: db.client,
  });
  return { seed, result, app, principal };
}

describe("the Showcase seed at provisioning (§15.4)", () => {
  it("seeds exactly one showcase dossier per workspace; a second call returns the same ids", async () => {
    const { seed, result } = await provisioned();
    expect(await isShowcaseProject(db.client, result.projectId)).toBe(true);
    const again = await seed(WS, UL);
    expect(again).toEqual(result);
    const n = (
      await db.client.query(`select count(*)::int n from projects where workspace_id = $1 and showcase`, [WS])
    ).rows[0] as { n: number };
    expect(n.n).toBe(1);
    // $0 — the fixture's run is precomputed; no ledger/usage rows exist for it.
    const spend = (
      await db.client.query(`select count(*)::int n from credit_ledger`)
    ).rows[0] as { n: number };
    expect(spend.n).toBe(0);
  });
});

describe("GET /showcase — the precedence read (§15.3/§15.4)", () => {
  it("401 unauthenticated; returns the seeded entry + null intent for a fresh account", async () => {
    const { app, result } = await provisioned();
    const unauth = createApp({ ...deps, principal: () => null, db: db.client, systemExec: db.client });
    expect((await unauth.request("/showcase")).status).toBe(401);

    const res = await app.request("/showcase");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      showcase: { projectId: string; reviewRunId: string; firstFindingId: string | null; opened: boolean; archived: boolean } | null;
      intent: unknown;
    };
    expect(body.showcase).toMatchObject({
      projectId: result.projectId,
      reviewRunId: result.reviewRunId,
      firstFindingId: result.firstFindingId,
      opened: false,
      archived: false,
    });
    expect(body.intent).toBeNull();
  });
});

describe("the read-only contract (§15.4; REQ-GROWTH-2)", () => {
  it("POST /projects/:id/runs on the showcase is 409 showcase_read_only — never a silent run", async () => {
    const { app, result } = await provisioned();
    const res = await app.request(`/projects/${result.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: "idem-sc-1",
        workflow: "review",
        modelProfile: { tier: "base" },
        modelTier: "base",
        rigor: "standard",
        estimateCredits: 560,
        capCredits: 840,
        rateTableVersion: 1,
        inputs: {},
        corrKind: "review",
        corrK: 1,
      }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "showcase_read_only" });
  });

  it("the mounted guard 409s mutating verbs (chat thread create stands in) but the dossier still reads — and the first read mints showcase.opened", async () => {
    const { app, result } = await provisioned();
    const mut = await app.request(`/projects/${result.projectId}/chat/threads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "q" }),
    });
    expect(mut.status).toBe(409);
    expect((await mut.json() as { error: string }).error).toBe("showcase_read_only");
    // the dossier still reads — the worked example is the product tour; the FIRST dossier read
    // emits the server-owned funnel event (letter_opened_at stamp ⇒ once per showcase).
    const dossier = await app.request(
      `/projects/${result.projectId}/review/${result.reviewRunId}/dossier`,
    );
    expect(dossier.status).toBe(200);
    const opened = (
      await db.client.query(
        `select count(*)::int n from analytics_events where event = 'showcase.opened'`,
      )
    ).rows[0] as { n: number };
    expect(opened.n).toBe(1);
    // a second read does not re-emit
    await app.request(`/projects/${result.projectId}/review/${result.reviewRunId}/dossier`);
    const opened2 = (
      await db.client.query(
        `select count(*)::int n from analytics_events where event = 'showcase.opened'`,
      )
    ).rows[0] as { n: number };
    expect(opened2.n).toBe(1);
  });

  it("archive + unarchive are allowed; DELETE refuses with showcase_not_deletable", async () => {
    const { app, result } = await provisioned();
    expect((await app.request(`/projects/${result.projectId}/archive`, { method: "POST" })).status).toBe(200);
    const after = (await app.request("/showcase")).status === 200 ? ((await (await app.request("/showcase")).json()) as { showcase: { archived: boolean } }).showcase : null;
    expect(after?.archived).toBe(true);
    expect((await app.request(`/projects/${result.projectId}/unarchive`, { method: "POST" })).status).toBe(200);
    const del = await app.request(`/projects/${result.projectId}/delete`, { method: "POST" });
    expect(del.status).toBe(409);
    expect(await del.json()).toEqual({ error: "showcase_not_deletable" });
    const row = (
      await db.client.query(`select deleted_at from projects where id = $1`, [result.projectId])
    ).rows[0] as { deleted_at: unknown };
    expect(row.deleted_at).toBeNull();
  });

  it("duplicate produces a NORMAL project (showcase=false) the user can run against", async () => {
    const { app, result } = await provisioned();
    const res = await app.request(`/projects/${result.projectId}/duplicate`, { method: "POST" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { project?: { id: string }; id?: string };
    const copyId = body.project?.id ?? body.id;
    expect(copyId).toBeTruthy();
    const row = (
      await db.client.query(`select showcase, slug from projects where id = $1`, [copyId])
    ).rows[0] as { showcase: boolean; slug: string };
    expect(row.showcase).toBe(false);
  });
});

describe("the §3.5 acquisition channels", () => {
  const postAcq = (app: ReturnType<typeof createApp>, body: unknown) =>
    app.request("/analytics/acquisition", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("POST /analytics/acquisition mints the funnel events with session-bound identity", async () => {
    const { app, result } = await provisioned();
    const res = await postAcq(app, { event: "showcase.opened", props: {}, projectId: result.projectId });
    expect(res.status).toBe(200);
    const row = (
      await db.client.query(`select user_id, workspace_id, event from analytics_events where event = 'showcase.opened'`)
    ).rows[0] as { user_id: string; workspace_id: string };
    expect(row.user_id).toBe(UL);
    expect(row.workspace_id).toBe(WS);
  });

  it("non-funnel names are 403 — the channel cannot mint spend/run facts", async () => {
    const { app } = await provisioned();
    for (const ev of ["run.started", "billing.checkout_completed", "not.real"]) {
      expect((await postAcq(app, { event: ev, props: {} })).status).toBe(403);
    }
  });

  it("an opted-out user's funnel mint is a silent {recorded:false} (REQ-PROD-15)", async () => {
    const { app } = await provisioned();
    await db.pg.query(`update "user" set analytics_opt_out = true where id = $1`, [UL]);
    const res = await postAcq(app, { event: "entry.chosen", props: { entry: "scratch" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recorded: false });
    const n = (
      await db.client.query(`select count(*)::int n from analytics_events where event = 'entry.chosen'`)
    ).rows[0] as { n: number };
    expect(n.n).toBe(0);
  });

  it("POST /analytics/landing is the PRE-AUTH channel — whitelisted names only, coarse props only", async () => {
    const unauth = createApp({ ...deps, principal: () => null, db: db.client, systemExec: db.client });
    const ok = await unauth.request("/analytics/landing", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.99" },
      body: JSON.stringify({
        event: "landing.dropzone_used",
        token: "hold_abc123",
        props: { kind: "docx", src: "hero", email: "strip@me.dev", filename: "secret.docx" },
      }),
    });
    expect(ok.status).toBe(200);
    const row = (
      await db.client.query(`select event, props, ip_hash from acquisition_events`)
    ).rows[0] as { event: string; props: Record<string, unknown>; ip_hash: string };
    expect(row.event).toBe("landing.dropzone_used");
    // PII stays out — only the whitelisted coarse keys + the hold token persist.
    expect(row.props).toEqual({ kind: "docx", src: "hero", token: "hold_abc123" });
    expect(row.ip_hash).toBeTruthy();
    expect(row.ip_hash).not.toContain("203.0.113");

    const bad = await unauth.request("/analytics/landing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "signup.completed" }),
    });
    expect(bad.status).toBe(403);
  });
});

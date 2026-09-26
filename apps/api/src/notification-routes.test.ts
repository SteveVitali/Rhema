import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mintEmailAction } from "@rhema/orchestrator";
import {
  createOrchestratorTestDb,
  makeDeps,
  seedGate,
  seedProject,
  seedRun,
  type OrchestratorTestDb,
  type SeededProject,
  type TestDeps,
} from "@rhema/orchestrator/testing";
import { createApp, type Principal } from "./index.js";

// PRB.09 route coverage (AC4 + AC5's route leg): the effective prefs matrix, server-side rejection of the
// non-configurable rows, and the signed one-click consume (single-use / tamper / expiry / binding).

const CONFIG = {
  actionSecret: "test-action-secret",
  apiBaseUrl: "https://api.test",
  appBaseUrl: "https://app.test",
};

let db: OrchestratorTestDb;
let deps: TestDeps;
let seed: SeededProject;
let app: ReturnType<typeof createApp>;
const principal = (): Principal => ({
  userId: seed.userId,
  workspaceId: seed.workspaceId,
  billingAccountId: seed.billingAccountId,
});

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = { ...makeDeps(db), notifications: CONFIG };
  seed = await seedProject(db);
  app = createApp({ ...deps, principal: () => principal() });
});
afterEach(() => db.close());

describe("GET/PUT /notifications/prefs (REQ-ACCT-1)", () => {
  it("returns the full effective matrix with the two locked rows", async () => {
    const r = await app.request("/notifications/prefs");
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      matrix: Record<string, { enabled: boolean; inApp: boolean; digest: string | null; configurable: boolean }>;
    };
    // P1.19 — matrix rows carry the in-app + digest columns alongside email `enabled`.
    expect(body.matrix.spend_gate).toMatchObject({ enabled: true, inApp: true, configurable: false });
    expect(body.matrix.trial_payment).toMatchObject({ enabled: true, inApp: true, configurable: false });
    expect(body.matrix.approval_waiting).toMatchObject({ enabled: true, inApp: true, configurable: true });
  });

  it("a configurable row toggles off; a non-configurable row rejects with 400", async () => {
    const off = await app.request("/notifications/prefs", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: { run_finished: false } }),
    });
    expect(off.status).toBe(200);
    const read = await app.request("/notifications/prefs");
    const body = (await read.json()) as { matrix: Record<string, { enabled: boolean }> };
    expect(body.matrix.run_finished.enabled).toBe(false);
    expect(body.matrix.spend_gate.enabled).toBe(true);

    for (const locked of ["spend_gate", "trial_payment"]) {
      const bad = await app.request("/notifications/prefs", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: { [locked]: false } }),
      });
      expect(bad.status).toBe(400);
    }
    // an unknown event type also rejects.
    const unk = await app.request("/notifications/prefs", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: { not_a_row: false } }),
    });
    expect(unk.status).toBe(400);
  });
});

describe("GET /action/:token — the signed one-click consume", () => {
  async function mint(action: "open" | "hold", expiresInMs = 60 * 60 * 1000) {
    const runId = "run_a1";
    await seedRun(db, { runId, workspaceId: seed.workspaceId, projectId: seed.projectId, state: "waiting_gate" });
    const gateId = await seedGate(db, {
      gateId: "gate_a1",
      runId,
      kind: "approve_plan",
      onExpiry: "proceed_conservative",
      deadlineAt: new Date(deps.clock.now().getTime() + expiresInMs),
    });
    const m = await db.txRunner.run(seed.workspaceId, (tx) =>
      mintEmailAction(tx, { ids: deps.ids, config: CONFIG }, {
        workspaceId: seed.workspaceId,
        gateId,
        runId,
        userId: seed.userId,
        action,
        expiresAt: new Date(deps.clock.now().getTime() + expiresInMs),
      }),
    );
    return { ...m, gateId, runId };
  }

  it("the MINTED /api/action/<token> URL consumes — the emailed link contract (DEF.3 / STB.3 F9)", async () => {
    // mintEmailAction returns `url = <apiBaseUrl>/api/action/<payload>.<sig>` — the string that
    // actually lands in the email. The api mounts at the listener root, so the consume handler must
    // answer at /api/action/:token or every emailed link is a dead 404 (observed on prod, STB.3).
    const m = await mint("hold");
    const path = new URL(m.url).pathname;
    expect(path).toBe(`/api/action/${m.token}`);
    const r1 = await app.request(path);
    expect(r1.status).toBe(303);
    expect(r1.headers.get("location")).toBe(`https://app.test/p/slug-${seed.projectId}/review/${m.runId}?gate=${m.gateId}`);
    const r2 = await app.request(path);
    expect(r2.status).toBe(410);
  });

  it("hold consumes once, holds the gate, and redirects to the deep link; the replay is 410", async () => {
    const m = await mint("hold");
    const r1 = await app.request(`/action/${m.token}`);
    expect(r1.status).toBe(303);
    // P1.19 — deep links are slug-based (the fixtures seed `slug-<projectId>`).
    expect(r1.headers.get("location")).toBe(`https://app.test/p/slug-${seed.projectId}/review/${m.runId}?gate=${m.gateId}`);
    const gate = (await db.client.query("select held, deadline_at from gates where id = $1", [m.gateId])).rows[0] as {
      held: boolean;
      deadline_at: Date | null;
    };
    expect(gate.held).toBe(true);
    expect(gate.deadline_at).toBeNull();

    const r2 = await app.request(`/action/${m.token}`);
    expect(r2.status).toBe(410);
  });

  it("a tampered token is 400 and never touches the gate", async () => {
    const m = await mint("hold");
    const tampered = `${Buffer.from(JSON.stringify({ tid: "eat_evil", ws: seed.workspaceId })).toString("base64url")}.${m.token.split(".")[1]}`;
    const r = await app.request(`/action/${tampered}`);
    expect(r.status).toBe(400);
    const gate = (await db.client.query("select held from gates where id = $1", [m.gateId])).rows[0] as { held: boolean };
    expect(gate.held).toBe(false);
  });

  it("an expired token is 410", async () => {
    const m = await mint("open", 1000);
    deps.clock.advance(2000);
    const r = await app.request(`/action/${m.token}`);
    expect(r.status).toBe(410);
  });

  it("unauthenticated prefs calls are 401", async () => {
    const unauth = createApp({ ...deps, principal: () => null });
    expect((await unauth.request("/notifications/prefs")).status).toBe(401);
  });
});

// --------------------------------------------------------------------------------------------------
// P1.19 — the §5.11 Inbox (REQ-IDE-2 amended / REQ-IDE-48 / REQ-MOBILE-19): the ordered item list,
// the approvals+decisions-only badge, and the read receipts (row / run / all).
// --------------------------------------------------------------------------------------------------

describe("the Inbox (P1.19)", () => {
  /** an open waiting-gate run + gate (badge + blocked row). */
  async function seedWaiting() {
    const runId = "run_ib1";
    await seedRun(db, { runId, workspaceId: seed.workspaceId, projectId: seed.projectId, state: "waiting_gate" });
    const gateId = await seedGate(db, {
      gateId: "gate_ib1",
      runId,
      kind: "approve_plan",
      onExpiry: "proceed_conservative",
      openedAt: deps.clock.now(),
      deadlineAt: new Date(deps.clock.now().getTime() + 60 * 60 * 1000),
    });
    return { runId, gateId };
  }
  async function seedDecision(id = "dr_ib1") {
    await db.client.query(
      `insert into decision_requests(id, project_id, source_run_id, text, options, state)
         values ($1,$2,'run_ib1','Keep or drop the deferred item?', '{keep,drop}', 'open')`,
      [id, seed.projectId],
    );
    return id;
  }
  async function seedItem(
    id: string,
    payload: { type: string; title: string; href?: string },
    opts: { runId?: string; collapse?: string; visibleInMs?: number; read?: boolean } = {},
  ) {
    await db.client.query(
      `insert into inbox_items(id, user_id, project_id, kind, payload, read_at, run_id, collapse_key, visible_at, created_at)
         values ($1,$2,$3,'event',$4,$5,$6,$7,$8, now())`,
      [
        id,
        seed.userId,
        seed.projectId,
        JSON.stringify(payload),
        opts.read ? deps.clock.now() : null,
        opts.runId ?? null,
        opts.collapse ?? null,
        new Date(deps.clock.now().getTime() + (opts.visibleInMs ?? 0)),
      ],
    );
    return id;
  }

  it("GET /inbox orders blocked → unread events → read events; quiet-deferred rows stay hidden", async () => {
    const { runId } = await seedWaiting();
    await seedDecision();
    await seedItem("ib_new", { type: "run_finished", title: "Run finished", href: `/p/slug-${seed.projectId}/review/${runId}` }, { runId });
    await seedItem("ib_read", { type: "chat_reply", title: "Chat reply" }, { read: true });
    await seedItem("ib_later", { type: "run_finished", title: "Quiet row" }, { runId: "run_quiet", visibleInMs: 3_600_000 });

    const r = await app.request("/inbox");
    expect(r.status).toBe(200);
    const body = (await r.json()) as { items: { id: string; kind: string; unread: boolean; href: string }[] };
    const ids = body.items.map((i) => i.id);
    // blocked-on-you rows lead (gate + decision), then unread events, then read — the deferred row never appears.
    expect(ids).toEqual(["gate:gate_ib1", "decision:dr_ib1", "ib_new", "ib_read"]);
    expect(body.items[0]!.href).toBe(`/p/slug-${seed.projectId}/review/${runId}?gate=gate_ib1`);
    expect(body.items[1]!.href).toBe(`/p/slug-${seed.projectId}#decisions`);
    expect(ids).not.toContain("ib_later");
  });

  it("GET /inbox/badge counts approvals + decisions ONLY — never unread events", async () => {
    await seedWaiting();
    await seedDecision();
    await seedItem("ib_ev", { type: "run_finished", title: "Run finished" }, { runId: "run_ib1" });
    const r = await app.request("/inbox/badge");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ count: 2 });
  });

  it("read receipts: one row, one run's row, and read-all leave blocked rows untouched", async () => {
    await seedWaiting();
    await seedItem("ib_a", { type: "run_finished", title: "A" }, { runId: "run_ib1" });
    await seedItem("ib_b", { type: "run_finished", title: "B" }, { runId: "run_other" });
    await seedItem("ib_c", { type: "chat_reply", title: "C" });

    // one row read.
    const one = await app.request("/inbox/ib_a/read", { method: "POST" });
    expect(one.status).toBe(200);
    let items = ((await (await app.request("/inbox")).json()) as { items: { id: string; unread: boolean }[] }).items;
    expect(items.find((i) => i.id === "ib_a")!.unread).toBe(false);
    expect(items.find((i) => i.id === "ib_b")!.unread).toBe(true);
    // a missing row 404s.
    expect((await app.request("/inbox/nope/read", { method: "POST" })).status).toBe(404);

    // the run-collapsed read receipt (the §4.2 landing marks its run's row).
    const run = await app.request("/inbox/read-run/run_other", { method: "POST" });
    expect((await run.json())).toEqual({ ok: true, marked: 1 });
    items = ((await (await app.request("/inbox")).json()) as { items: { id: string; unread: boolean }[] }).items;
    expect(items.find((i) => i.id === "ib_b")!.unread).toBe(false);

    // read-all marks the rest; the blocked row is untouched (it closes by deciding, never by reading).
    const all = await app.request("/inbox/read-all", { method: "POST" });
    expect((await all.json())).toEqual({ ok: true, marked: 1 });
    items = ((await (await app.request("/inbox")).json()) as { items: { id: string; unread: boolean }[] }).items;
    expect(items.every((i) => i.unread === false || i.id.startsWith("gate:"))).toBe(true);
    expect((await (await app.request("/inbox/badge")).json()) as { count: number }).toEqual({ count: 1 });
  });

  it("unauthenticated inbox calls are 401", async () => {
    const unauth = createApp({ ...deps, principal: () => null });
    expect((await unauth.request("/inbox")).status).toBe(401);
    expect((await unauth.request("/inbox/badge")).status).toBe(401);
    expect((await unauth.request("/inbox/read-all", { method: "POST" })).status).toBe(401);
  });
});

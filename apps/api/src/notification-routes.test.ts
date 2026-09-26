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
    const body = (await r.json()) as { matrix: Record<string, { enabled: boolean; configurable: boolean }> };
    expect(body.matrix.spend_gate).toEqual({ enabled: true, configurable: false });
    expect(body.matrix.trial_payment).toEqual({ enabled: true, configurable: false });
    expect(body.matrix.approval_waiting).toEqual({ enabled: true, configurable: true });
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

  it("hold consumes once, holds the gate, and redirects to the deep link; the replay is 410", async () => {
    const m = await mint("hold");
    const r1 = await app.request(`/action/${m.token}`);
    expect(r1.status).toBe(303);
    expect(r1.headers.get("location")).toBe(`https://app.test/p/${seed.projectId}/review/${m.runId}?gate=${m.gateId}`);
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

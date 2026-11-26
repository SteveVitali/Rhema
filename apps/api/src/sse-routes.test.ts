import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrchestratorTestDb,
  seedProject,
  seedRun,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "@rhema/orchestrator/testing";
import { SqlEventWriter, InMemoryRunEventBus, type EventInput } from "@rhema/orchestrator";
import { createApp, type Principal } from "./index.js";

// The viewer-facing SSE route (§12.5): auth, the internal-leak guarantee at the route (AC2), the viewer density
// split (REQ-DATA-38), and resume via `?after` / `Last-Event-ID`. Poll mode (REQ-MOBILE-5) returns a finite
// replay we can assert deterministically; the tail loop is covered by @rhema/orchestrator's stream tests.

let db: OrchestratorTestDb;
let deps: TestDeps;
let seed: Awaited<ReturnType<typeof seedProject>>;
let bus: InMemoryRunEventBus;
let writer: SqlEventWriter;

const principal = (over: Partial<Principal> = {}): Principal => ({
  userId: seed.userId,
  workspaceId: seed.workspaceId,
  billingAccountId: seed.billingAccountId,
  ...over,
});

let at = new Date("2026-09-03T08:00:00Z");
function append(event: Partial<EventInput> & Pick<EventInput, "type" | "payload">): Promise<unknown> {
  at = new Date(at.getTime() + 1000);
  return db.txRunner.run(seed.workspaceId, (tx) => writer.append(tx, { runId: "run1", at, ...event }));
}

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  bus = new InMemoryRunEventBus();
  writer = new SqlEventWriter(bus);
  deps = { ...makeDeps(db), eventWriter: writer };
  seed = await seedProject(db);
  await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, state: "running" });
  // mark the seeded user as the run's requester (so requester-density tests have a subject).
  await db.txRunner.run(seed.workspaceId, (tx) =>
    tx.query("update runs set requested_by = $1 where id = 'run1'", [seed.userId]),
  );
});
afterEach(() => db.close());

function makeApp(p: () => Principal | null) {
  return createApp({ ...deps, principal: p, eventSubscriber: bus });
}

/** The `id:` seqs of an SSE body. */
function seqs(body: string): number[] {
  return body
    .split("\n")
    .filter((l) => l.startsWith("id: "))
    .map((l) => Number(l.slice(4)));
}
function types(body: string): string[] {
  return body
    .split("\n")
    .filter((l) => l.startsWith("event: "))
    .map((l) => l.slice(7));
}

describe("GET /runs/:id/events — auth", () => {
  it("401 without a principal", async () => {
    const app = makeApp(() => null);
    const res = await app.request("/runs/run1/events?poll=1");
    expect(res.status).toBe(401);
  });

  it("404 when the run is in another workspace (RLS deny-by-default)", async () => {
    const app = makeApp(() => principal({ workspaceId: "ws_other" }));
    const res = await app.request("/runs/run1/events?poll=1");
    expect(res.status).toBe(404);
  });
});

describe("GET /runs/:id/events?poll — replay content (mobile poll shape, REQ-MOBILE-5)", () => {
  it("never streams an internal event (AC2; REQ-ARCH-12)", async () => {
    await append({ type: "run.started", payload: {} }); // user/summary seq 1
    await append({ type: "engine.error", payload: { secret: "x" } }); // internal seq 2
    await append({ type: "step.started", payload: { phase: "1", ordinal: 1, of: 2 } }); // user/summary seq 3
    const app = makeApp(() => principal());
    const res = await app.request("/runs/run1/events?poll=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const body = await res.text();
    expect(types(body)).toEqual(["run.started", "step.started"]); // engine.error is never present
    expect(seqs(body)).toEqual([1, 3]);
  });

  it("caps a non-requester viewer at Summary density (REQ-DATA-38)", async () => {
    await append({ type: "run.started", payload: {} }); // summary seq 1
    await append({ type: "source.read", payload: { url: "https://a.example/x", agentLabel: "editor" } }); // normal seq 2
    await append({ type: "search.performed", payload: { query: "q", resultCount: 1, agentLabel: "editor" } }); // verbose seq 3

    // a viewer who is NOT the requester (different user) → summary only
    const viewerApp = makeApp(() => principal({ userId: "usr_other_viewer" }));
    const viewerBody = await (await viewerApp.request("/runs/run1/events?poll=1")).text();
    expect(types(viewerBody)).toEqual(["run.started"]);

    // the requester → up to verbose
    const requesterApp = makeApp(() => principal());
    const requesterBody = await (await requesterApp.request("/runs/run1/events?poll=1")).text();
    expect(types(requesterBody)).toEqual(["run.started", "source.read", "search.performed"]);
  });

  it("resumes from ?after (exactly-once) and from the Last-Event-ID header", async () => {
    await append({ type: "run.started", payload: {} }); // seq 1
    await append({ type: "step.started", payload: { phase: "1", ordinal: 1, of: 1 } }); // seq 2
    await append({ type: "step.finished", payload: { phase: "1", ordinal: 1, of: 1 } }); // seq 3
    const app = makeApp(() => principal());

    const afterQuery = await (await app.request("/runs/run1/events?poll=1&after=1")).text();
    expect(seqs(afterQuery)).toEqual([2, 3]); // no replay of seq 1

    const afterHeader = await (
      await app.request("/runs/run1/events?poll=1", { headers: { "last-event-id": "2" } })
    ).text();
    expect(seqs(afterHeader)).toEqual([3]);
  });
});

// ADR-137 — the ephemeral (chat.token) replay rule at the route: catch-up/poll reads are live-only
// (a terminal run's token rows never replay to a late subscriber), a mid-flight replay returns them,
// and a summary-capped viewer can never receive token text (REQ-DATA-38).
const TURN = "01JQ00000000000000000000AB";

describe("GET /runs/:id/events — chat.token ephemerality (ADR-137)", () => {
  const setState = (state: string) =>
    db.txRunner.run(seed.workspaceId, (tx) => tx.query("update runs set state = $1 where id = 'run1'", [state]));

  it("replays live token deltas to the requester while the turn is in flight", async () => {
    await append({ type: "step.started", payload: { phase: "answer", ordinal: 0, of: 1 } });
    await append({ type: "chat.token", payload: { turnId: TURN, seq: 0, text: "The " } });
    await append({ type: "chat.token", payload: { turnId: TURN, seq: 1, text: "quick" } });
    const app = makeApp(() => principal());
    const body = await (await app.request("/runs/run1/events?poll=1")).text();
    expect(types(body)).toEqual(["step.started", "chat.token", "chat.token"]);
  });

  it("never replays token deltas once the run is terminal — a late subscriber sees no stale text", async () => {
    await append({ type: "step.started", payload: { phase: "answer", ordinal: 0, of: 1 } });
    await append({ type: "chat.token", payload: { turnId: TURN, seq: 0, text: "The " } });
    await append({ type: "chat.token", payload: { turnId: TURN, seq: 1, text: "quick" } });
    await append({ type: "cost.final", payload: { spentCredits: 12, capCredits: 840 } });
    await setState("completed");
    const app = makeApp(() => principal());
    const body = await (await app.request("/runs/run1/events?poll=1")).text();
    expect(types(body)).toEqual(["step.started", "cost.final"]);
    expect(body).not.toContain("quick");
  });

  it("a summary-capped viewer never receives token text even mid-turn (REQ-DATA-38)", async () => {
    await append({ type: "chat.token", payload: { turnId: TURN, seq: 0, text: "secret draft" } });
    const viewerApp = makeApp(() => principal({ userId: "usr_other_viewer" }));
    const body = await (await viewerApp.request("/runs/run1/events?poll=1")).text();
    expect(types(body)).toEqual([]);
    expect(body).not.toContain("secret");
  });
});

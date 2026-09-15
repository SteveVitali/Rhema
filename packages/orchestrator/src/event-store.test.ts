import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrchestratorTestDb,
  seedProject,
  seedRun,
  type OrchestratorTestDb,
} from "./testing/pg.js";
import {
  SqlEventWriter,
  InMemoryRunEventBus,
  deleteExpiredInternalEvents,
  ensureRunEventsPartition,
  eventDay,
  nextDay,
} from "./event-store.js";
import type { EventInput } from "./event-writer.js";

// The production event writer (§12.5): seq assignment, the user/internal visibility split, whitelist validation
// at the write boundary (REQ-DATA-37), fan-out, and internal-row retention. Backed by PGlite (a real Postgres),
// so partitioning + RLS behave exactly as against AlloyDB.

let db: OrchestratorTestDb;
let seed: Awaited<ReturnType<typeof seedProject>>;
let bus: InMemoryRunEventBus;
let writer: SqlEventWriter;

const AT = new Date("2026-09-03T08:00:00Z");

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  seed = await seedProject(db);
  await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, state: "running" });
  bus = new InMemoryRunEventBus();
  writer = new SqlEventWriter(bus);
});
afterEach(() => db.close());

function append(event: Partial<EventInput> & Pick<EventInput, "type" | "payload">): Promise<{ seq: number }> {
  return db.txRunner.run(seed.workspaceId, (tx) =>
    writer.append(tx, { runId: "run1", at: AT, ...event }),
  );
}

async function userRows(): Promise<{ seq: number; type: string; density: string; visibility: string }[]> {
  return (
    await db.client.query(
      "select seq, type, density, visibility from run_events where run_id='run1' order by seq",
    )
  ).rows as { seq: number; type: string; density: string; visibility: string }[];
}
async function internalRows(): Promise<{ seq: number; type: string }[]> {
  return (
    await db.client.query("select seq, type from run_events_internal where run_id='run1' order by seq")
  ).rows as { seq: number; type: string }[];
}

describe("SqlEventWriter — seq, the visibility split, fan-out", () => {
  it("appends a user event to run_events, stamps density, and publishes its seq", async () => {
    const { seq } = await append({ type: "run.started", payload: { phase: "0" } });
    expect(seq).toBe(1);
    const rows = await userRows();
    expect(rows).toEqual([{ seq: 1, type: "run.started", density: "summary", visibility: "user" }]);
    expect(await internalRows()).toHaveLength(0);
    expect(bus.published).toEqual([{ runId: "run1", seq: 1 }]);
  });

  it("routes an internal event to run_events_internal — never to run_events — and does NOT publish it", async () => {
    await append({ type: "engine.error", payload: { message: "boom" } });
    expect(await userRows()).toHaveLength(0);
    expect(await internalRows()).toEqual([{ seq: 1, type: "engine.error" }]);
    expect(bus.published).toHaveLength(0); // internal rows are never streamed → never a fan-out wakeup
  });

  it("assigns a gap-free, monotonic seq shared across the user/internal split", async () => {
    await append({ type: "run.started", payload: {} }); // seq 1 (user)
    await append({ type: "engine.error", payload: {} }); // seq 2 (internal)
    await append({ type: "step.started", payload: { phase: "1", ordinal: 1, of: 3 } }); // seq 3 (user)
    expect((await userRows()).map((r) => r.seq)).toEqual([1, 3]);
    expect((await internalRows()).map((r) => r.seq)).toEqual([2]);
  });

  it("a rolled-back transaction leaves NEITHER the run_events row NOR the consumed seq (REQ-DATA-33)", async () => {
    await expect(
      db.txRunner.run(seed.workspaceId, async (tx) => {
        await writer.append(tx, { runId: "run1", type: "run.started", payload: {}, at: AT });
        throw new Error("boom — after the append, before commit");
      }),
    ).rejects.toThrow("boom");
    expect(await userRows()).toHaveLength(0); // the event rolled back with the transaction
    // and the seq counter rolled back too — the next successful append is seq 1, not 2.
    const { seq } = await append({ type: "run.started", payload: {} });
    expect(seq).toBe(1);
  });

  it("stamps the partition day from the event instant", async () => {
    await append({ type: "run.started", payload: {} });
    const row = (await db.client.query("select day from run_events where run_id='run1'")).rows[0] as {
      day: string | Date;
    };
    const day = row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day).slice(0, 10);
    expect(day).toBe(eventDay(AT));
  });
});

describe("whitelist validation at the write boundary (REQ-DATA-37; AC6)", () => {
  it("rejects an unknown event type", async () => {
    await expect(append({ type: "not.a.real.type" as never, payload: {} })).rejects.toThrow(/unknown run event type/);
    expect(await userRows()).toHaveLength(0);
  });

  it("rejects a payload that violates the type's schema", async () => {
    // step.started requires {phase, ordinal, of}; omit them.
    await expect(append({ type: "step.started", payload: { phase: "1" } })).rejects.toThrow();
    expect(await userRows()).toHaveLength(0);
  });

  it("rejects a free-text field over the 280-char bound", async () => {
    await expect(
      append({ type: "run.hiccup", payload: { reason: "x".repeat(281) } }),
    ).rejects.toThrow();
    expect(await userRows()).toHaveLength(0);
  });

  it("nothing is written and no seq is consumed when validation throws", async () => {
    await expect(append({ type: "bogus" as never, payload: {} })).rejects.toThrow();
    const { seq } = await append({ type: "run.started", payload: {} });
    expect(seq).toBe(1); // the rejected append never advanced the counter
  });
});

describe("partition maintenance + internal-row retention (§12.5; AC5)", () => {
  it("ensureRunEventsPartition creates a named daily partition and is idempotent", async () => {
    const name = await ensureRunEventsPartition(db.client, "2026-09-03");
    expect(name).toBe("run_events_20260903");
    await ensureRunEventsPartition(db.client, "2026-09-03"); // no throw on re-run
    const exists = (
      await db.client.query("select 1 from pg_class where relname = 'run_events_20260903'")
    ).rows;
    expect(exists).toHaveLength(1);
    // a row for that day routes to the named partition, not the default.
    await append({ type: "run.started", payload: {} }); // AT is 2026-09-03
    const where = (
      await db.client.query("select tableoid::regclass::text as part from run_events where run_id='run1'")
    ).rows[0] as { part: string };
    expect(where.part).toContain("run_events_20260903");
  });

  it("nextDay rolls the UTC calendar day forward across a month boundary", () => {
    expect(nextDay("2026-09-30")).toBe("2026-10-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
  });

  it("expires internal rows older than 30 days but leaves user rows untouched", async () => {
    const now = new Date("2026-10-15T00:00:00Z");
    const old = new Date("2026-09-01T00:00:00Z"); // 44 days before `now`
    const recent = new Date("2026-10-10T00:00:00Z"); // 5 days before `now`
    await append({ type: "engine.error", payload: {}, at: old }); // internal, old → expires
    await append({ type: "engine.error", payload: {}, at: recent }); // internal, recent → survives
    await append({ type: "run.started", payload: {}, at: old }); // USER, old → must survive

    const deleted = await deleteExpiredInternalEvents(db.client, now);
    expect(deleted).toBe(1);
    expect((await internalRows()).map((r) => r.seq)).toEqual([2]); // only the recent internal row remains
    expect(await userRows()).toHaveLength(1); // the old user row is untouched (project-lifetime retention)
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RUN_EVENTS, parseRunEvent } from "@rhema/contracts";
import { createOrchestratorTestDb, seedProject, seedRun, type OrchestratorTestDb } from "./testing/pg.js";
import { FixedClock } from "./clock.js";
import { applyTransition, ConcurrentTransitionError } from "./transition.js";
import { IllegalTransitionError } from "./state-machine.js";
import type { AppendedEvent, EventInput, EventWriter } from "./event-writer.js";
import type { SqlClient } from "./tx.js";

// REQ-DATA-33: a transition and its event are one atomic write. We prove it with a SQL-backed EventWriter over
// a test-created events table (the InMemory writer cannot prove DB atomicity): a transition whose transaction
// rolls back leaves NEITHER the state change NOR the event. P0.08b ships the production run_events store.

class SqlTestEventWriter implements EventWriter {
  constructor(private readonly table = "test_run_events") {}
  async append(tx: SqlClient, event: EventInput): Promise<AppendedEvent> {
    parseRunEvent(event.type, event.payload);
    const def = RUN_EVENTS[event.type];
    const seqRow = (await tx.query(`select coalesce(max(seq),0)+1 as seq from ${this.table} where run_id=$1`, [event.runId]))
      .rows[0] as { seq: number };
    await tx.query(
      `insert into ${this.table}(run_id, seq, type, payload, visibility, at) values ($1,$2,$3,$4,$5,$6)`,
      [event.runId, seqRow.seq, event.type, JSON.stringify(event.payload), def.visibility, event.at],
    );
    return { ...event, seq: seqRow.seq, visibility: def.visibility, density: def.density };
  }
}

let db: OrchestratorTestDb;
let seed: Awaited<ReturnType<typeof seedProject>>;
const clock = new FixedClock(new Date("2026-09-02T12:00:00Z"));
const writer = new SqlTestEventWriter();

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  await db.pg.exec(
    "create table test_run_events(run_id text not null, seq int not null, type text not null, payload jsonb, visibility text, at timestamptz)",
  );
  // SEC.1 — the harness txRunner runs as `rhema_app_login` (the prod user role): a test-created table
  // carries no grant for it, so grant the surface the transition-under-test writes, exactly like a
  // migration would for a real table.
  await db.pg.exec("grant select, insert on test_run_events to rhema_app");
  seed = await seedProject(db);
  await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, state: "running" });
});
afterEach(() => db.close());

async function stateOf(): Promise<string> {
  const r = await db.txRunner.run(seed.workspaceId, (tx) => tx.query("select state from runs where id='run1'", []));
  return (r.rows[0] as { state: string }).state;
}
async function eventRows(): Promise<{ type: string }[]> {
  return (await db.client.query("select type from test_run_events where run_id='run1' order by seq", []))
    .rows as { type: string }[];
}

describe("transactional state+event pairing (REQ-DATA-33)", () => {
  it("a committed transition writes the state change AND the paired event", async () => {
    await db.txRunner.run(seed.workspaceId, (tx) =>
      applyTransition(tx, { eventWriter: writer, clock }, { runId: "run1", from: "running", to: "finalizing" }),
    );
    expect(await stateOf()).toBe("finalizing");
    const evs = await eventRows();
    expect(evs).toHaveLength(1);
    expect(evs[0].type).toBe("run.state_changed");
  });

  it("a rolled-back transaction leaves NEITHER the state change NOR the event (atomicity)", async () => {
    await expect(
      db.txRunner.run(seed.workspaceId, async (tx) => {
        await applyTransition(tx, { eventWriter: writer, clock }, { runId: "run1", from: "running", to: "finalizing" });
        throw new Error("boom — after the transition, before commit");
      }),
    ).rejects.toThrow("boom");
    expect(await stateOf()).toBe("running"); // unchanged
    expect(await eventRows()).toHaveLength(0); // the event rolled back with it
  });

  it("an illegal transition throws and writes nothing", async () => {
    await expect(
      db.txRunner.run(seed.workspaceId, (tx) =>
        applyTransition(tx, { eventWriter: writer, clock }, { runId: "run1", from: "running", to: "queued" }),
      ),
    ).rejects.toBeInstanceOf(IllegalTransitionError);
    expect(await stateOf()).toBe("running");
    expect(await eventRows()).toHaveLength(0);
  });

  it("the guarded CAS refuses a stale `from` (concurrent double-transition — REQ-RUN-10)", async () => {
    // first edge commits running → finalizing.
    await db.txRunner.run(seed.workspaceId, (tx) =>
      applyTransition(tx, { eventWriter: writer, clock }, { runId: "run1", from: "running", to: "finalizing" }),
    );
    // a second worker that still thinks the run is `running` (a legal edge on the diagram) is refused by the CAS.
    await expect(
      db.txRunner.run(seed.workspaceId, (tx) =>
        applyTransition(tx, { eventWriter: writer, clock }, { runId: "run1", from: "running", to: "orphaned" }),
      ),
    ).rejects.toBeInstanceOf(ConcurrentTransitionError);
    expect(await stateOf()).toBe("finalizing");
  });
});

describe("terminal transitions release the per-project writer lock (§12.4; REQ-RUN-8/17)", () => {
  it("a completed writer run clears projects.active_writer_run_id", async () => {
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query("update projects set active_writer_run_id='run1' where id=$1", [seed.projectId]),
    );
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query("update runs set state='finalizing', project_id=$1 where id='run1'", [seed.projectId]),
    );
    await db.txRunner.run(seed.workspaceId, (tx) =>
      applyTransition(tx, { eventWriter: writer, clock }, { runId: "run1", from: "finalizing", to: "completed" }),
    );
    const proj = (
      await db.txRunner.run(seed.workspaceId, (tx) =>
        tx.query("select active_writer_run_id from projects where id=$1", [seed.projectId]),
      )
    ).rows[0] as { active_writer_run_id: string | null };
    expect(proj.active_writer_run_id).toBeNull();
  });
});

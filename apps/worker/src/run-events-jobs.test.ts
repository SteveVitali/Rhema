import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, seedRun, type OrchestratorTestDb } from "@rhema/orchestrator/testing";
import { FixedClock } from "@rhema/orchestrator";
import {
  handleRunEventsRetention,
  handleRunEventsPartition,
  RUN_EVENT_JOBS,
  type RunEventsJobDeps,
} from "./run-events-jobs.js";
import { WORKER_QUEUES } from "./index.js";

// The run-event maintenance jobs (§12.5; AC5): internal-row retention (30 days) and daily-partition
// pre-creation. System-scoped — driven over PGlite with the bare (no-tenant) client.

let db: OrchestratorTestDb;
let deps: RunEventsJobDeps;
const clock = new FixedClock(new Date("2026-10-15T00:00:00Z"));

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  const seed = await seedProject(db);
  await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, state: "running" });
  deps = { db: db.client, clock };
});
afterEach(() => db.close());

async function insertInternal(seq: number, at: string): Promise<void> {
  await db.client.query(
    `insert into run_events_internal(run_id, seq, workspace_id, type, payload, at)
     values ('run1', $1, 'ws_seed', 'engine.error', '{}'::jsonb, $2)`,
    [seq, at],
  );
}

describe("handleRunEventsRetention — 30-day internal-row expiry (AC5)", () => {
  it("deletes internal rows older than 30 days and keeps recent ones", async () => {
    await insertInternal(1, "2026-09-01T00:00:00Z"); // 44 days old → expires
    await insertInternal(2, "2026-09-14T12:00:00Z"); // 30.5 days old → expires
    await insertInternal(3, "2026-10-10T00:00:00Z"); // 5 days old → survives

    const { deleted } = await handleRunEventsRetention(deps);
    expect(deleted).toBe(2);
    const remaining = (await db.client.query("select seq from run_events_internal order by seq")).rows as {
      seq: number;
    }[];
    expect(remaining.map((r) => r.seq)).toEqual([3]);
  });

  it("respects a custom retention window", async () => {
    await insertInternal(1, "2026-10-10T00:00:00Z"); // 5 days old
    const { deleted } = await handleRunEventsRetention(deps, { retentionDays: 3 }); // cutoff = 3 days → 5>3 expires
    expect(deleted).toBe(1);
  });
});

describe("handleRunEventsPartition — daily partition pre-creation", () => {
  it("ensures today's and tomorrow's partitions by default (idempotent)", async () => {
    const { ensured } = await handleRunEventsPartition(deps);
    expect(ensured).toEqual(["run_events_20261015", "run_events_20261016"]);
    // idempotent re-run does not throw
    await handleRunEventsPartition(deps);
    const parts = (
      await db.client.query("select relname from pg_class where relname like 'run_events_2026%' and relkind = 'r' order by relname")
    ).rows as { relname: string }[];
    expect(parts.map((p) => p.relname)).toEqual(["run_events_20261015", "run_events_20261016"]);
  });

  it("honors daysAhead", async () => {
    const { ensured } = await handleRunEventsPartition(deps, { daysAhead: 2 });
    expect(ensured).toEqual(["run_events_20261015", "run_events_20261016", "run_events_20261017"]);
  });
});

describe("queue registration", () => {
  it("registers the maintenance queues in WORKER_QUEUES", () => {
    expect(WORKER_QUEUES).toContain(RUN_EVENT_JOBS.retention);
    expect(WORKER_QUEUES).toContain(RUN_EVENT_JOBS.partition);
  });
});

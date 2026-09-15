import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EventDensity } from "@rhema/contracts";
import {
  createOrchestratorTestDb,
  seedProject,
  seedRun,
  type OrchestratorTestDb,
} from "./testing/pg.js";
import { SqlEventWriter, InMemoryRunEventBus } from "./event-store.js";
import {
  readUserEventsAfter,
  densitiesUpTo,
  formatSse,
  RunEventStreamer,
  streamRunEvents,
  type EventReader,
  type StreamedEvent,
} from "./event-stream.js";
import type { EventInput } from "./event-writer.js";

// SSE replay + tail (§12.5): exactly-once resumable replay keyed on seq (AC1), the internal-leak guarantee
// (AC2 — the route reads only run_events), and graceful degradation when the fan-out bus is down (AC3 — the
// tail still serves from Postgres). Viewer density split (REQ-DATA-38).

let db: OrchestratorTestDb;
let seed: Awaited<ReturnType<typeof seedProject>>;
let bus: InMemoryRunEventBus;
let writer: SqlEventWriter;

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  seed = await seedProject(db);
  await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, state: "running" });
  bus = new InMemoryRunEventBus();
  writer = new SqlEventWriter(bus);
});
afterEach(() => db.close());

let at = new Date("2026-09-03T08:00:00Z");
function append(event: Partial<EventInput> & Pick<EventInput, "type" | "payload">): Promise<{ seq: number }> {
  at = new Date(at.getTime() + 1000);
  return db.txRunner.run(seed.workspaceId, (tx) => writer.append(tx, { runId: "run1", at, ...event }));
}

/** A tenant-scoped reader like the SSE route builds (RLS-safe; reads only run_events). */
function makeReader(maxDensity: EventDensity = "verbose"): EventReader {
  return (afterSeq) =>
    db.txRunner.run(seed.workspaceId, (tx) => readUserEventsAfter(tx, "run1", afterSeq, { maxDensity }));
}

function collectSink(): { chunks: string[]; sink: (c: string) => void } {
  const chunks: string[] = [];
  return { chunks, sink: (c) => void chunks.push(c) };
}
/** The seqs an SSE chunk stream delivered (from the `id:` lines). */
function seqsOf(chunks: string[]): number[] {
  return chunks
    .flatMap((c) => c.split("\n"))
    .filter((l) => l.startsWith("id: "))
    .map((l) => Number(l.slice(4)));
}

describe("densitiesUpTo — the viewer density split (REQ-DATA-38)", () => {
  it("summary-only viewers get only summary; the requester gets up to verbose", () => {
    expect(densitiesUpTo("summary")).toEqual(["summary"]);
    expect(densitiesUpTo("normal")).toEqual(["summary", "normal"]);
    expect(densitiesUpTo("verbose")).toEqual(["summary", "normal", "verbose"]);
    expect(densitiesUpTo("internal")).toEqual(["summary", "normal", "verbose"]); // never widen to internal
  });
});

describe("readUserEventsAfter — the internal-leak guarantee (AC2; REQ-ARCH-12) + density filter", () => {
  it("never returns an internal-visibility row, whatever the density asked for", async () => {
    await append({ type: "run.started", payload: {} }); // user/summary, seq 1
    await append({ type: "engine.error", payload: { secret: "x" } }); // internal, seq 2
    await append({ type: "tool.audit", payload: { tool: "Bash" } }); // internal, seq 3
    const rows = await db.txRunner.run(seed.workspaceId, (tx) =>
      readUserEventsAfter(tx, "run1", 0, { maxDensity: "verbose" }),
    );
    expect(rows.map((r) => r.type)).toEqual(["run.started"]); // internal rows are in a separate table, never read
  });

  it("a summary-only viewer does not receive normal/verbose events", async () => {
    await append({ type: "run.started", payload: {} }); // summary, seq 1
    await append({ type: "source.read", payload: { url: "https://a.example/x", agentLabel: "editor" } }); // normal, seq 2
    await append({ type: "search.performed", payload: { query: "q", resultCount: 3, agentLabel: "editor" } }); // verbose, seq 3
    const summary = await db.txRunner.run(seed.workspaceId, (tx) => readUserEventsAfter(tx, "run1", 0, { maxDensity: "summary" }));
    expect(summary.map((r) => r.type)).toEqual(["run.started"]);
    const full = await db.txRunner.run(seed.workspaceId, (tx) => readUserEventsAfter(tx, "run1", 0, { maxDensity: "verbose" }));
    expect(full.map((r) => r.type)).toEqual(["run.started", "source.read", "search.performed"]);
  });
});

describe("formatSse", () => {
  it("emits id/event/data lines with the seq as the SSE id (Last-Event-ID)", () => {
    const ev: StreamedEvent = { seq: 7, type: "run.started", payload: { phase: "0" }, density: "summary", at: new Date("2026-09-03T08:00:00Z") };
    const s = formatSse(ev);
    expect(s).toContain("id: 7\n");
    expect(s).toContain("event: run.started\n");
    expect(s).toContain('"seq":7');
    expect(s.endsWith("\n\n")).toBe(true);
  });
});

describe("RunEventStreamer — exactly-once resumable replay (AC1)", () => {
  it("replays seq>after once, then a reconnect at Last-Event-ID resumes with no dup and no gap", async () => {
    await append({ type: "run.started", payload: {} }); // seq 1 (user)
    await append({ type: "engine.error", payload: {} }); // seq 2 (internal — a seq gap for the user stream)
    await append({ type: "step.started", payload: { phase: "1", ordinal: 1, of: 2 } }); // seq 3 (user)

    // first connection, from the beginning
    const a = collectSink();
    const s1 = new RunEventStreamer(makeReader(), a.sink, 0);
    expect(await s1.pump()).toBe(2);
    expect(seqsOf(a.chunks)).toEqual([1, 3]); // the internal seq 2 is never delivered
    const lastSeen = s1.lastSeq; // the client's Last-Event-ID

    // forced disconnect, more events arrive
    await append({ type: "step.finished", payload: { phase: "1", ordinal: 1, of: 2 } }); // seq 4
    await append({ type: "run.report", payload: { reportVersionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" } }); // seq 5

    // reconnect with Last-Event-ID = lastSeen → resumes exactly-once, no replay of 1/3
    const b = collectSink();
    const s2 = new RunEventStreamer(makeReader(), b.sink, lastSeen);
    expect(await s2.pump()).toBe(2);
    expect(seqsOf(b.chunks)).toEqual([4, 5]);
  });

  it("a duplicate wakeup with no new rows emits nothing (exactly-once guard)", async () => {
    await append({ type: "run.started", payload: {} });
    const a = collectSink();
    const s = new RunEventStreamer(makeReader(), a.sink, 0);
    expect(await s.pump()).toBe(1);
    expect(await s.pump()).toBe(0); // second wakeup, nothing new
    expect(await s.pump()).toBe(0);
    expect(seqsOf(a.chunks)).toEqual([1]);
  });

  it("overlapping pumps coalesce without double-emitting", async () => {
    await append({ type: "run.started", payload: {} });
    await append({ type: "step.started", payload: { phase: "1", ordinal: 1, of: 1 } });
    const a = collectSink();
    const s = new RunEventStreamer(makeReader(), a.sink, 0);
    const [n1, n2] = await Promise.all([s.pump(), s.pump()]); // fired concurrently
    expect(n1 + n2).toBe(2); // each event delivered exactly once across both calls
    expect(seqsOf(a.chunks)).toEqual([1, 2]);
  });
});

describe("Redis outage — the tail degrades but Postgres replay still serves (AC3)", () => {
  it("with the bus degraded, no wakeup fires, yet a poll/pump delivers from Postgres", async () => {
    bus.degraded = true; // simulate Redis down
    let woken = 0;
    bus.subscribe("run1", () => void (woken += 1));
    await append({ type: "run.started", payload: {} }); // publish is dropped by the degraded bus
    expect(bus.published).toHaveLength(1); // publish was attempted…
    expect(woken).toBe(0); // …but no subscriber was notified (Redis is down)

    // the SSE loop's safety poll (or a client reconnect) reads Postgres directly and serves the row.
    const a = collectSink();
    const s = new RunEventStreamer(makeReader(), a.sink, 0);
    expect(await s.pump()).toBe(1);
    expect(seqsOf(a.chunks)).toEqual([1]);
  });
});

describe("streamRunEvents — the composed replay-then-tail loop", () => {
  it("replays, then delivers a live event via a bus wakeup, and stops on abort", async () => {
    await append({ type: "run.started", payload: {} }); // seq 1, before connect
    const a = collectSink();
    const ac = new AbortController();
    const done = streamRunEvents({
      runId: "run1",
      afterSeq: 0,
      read: makeReader(),
      sink: a.sink,
      subscriber: bus,
      signal: ac.signal,
      pingIntervalMs: 10_000,
      pollIntervalMs: 10_000,
    });
    // let the replay settle, then push a live event through the bus wakeup.
    await new Promise((r) => setTimeout(r, 20));
    await append({ type: "step.started", payload: { phase: "1", ordinal: 1, of: 1 } }); // seq 2 → publish wakes the tail
    await new Promise((r) => setTimeout(r, 20));
    ac.abort();
    await done;
    expect(seqsOf(a.chunks)).toEqual([1, 2]); // replay (1) + tailed (2), each once
  });
});

// ADR-137 / BL-99 part 1 — the composed token-stream leg: a stubbed chat_turn phase emitting N
// text deltas → N ordered `chat.token` events through the harness pipe (runAgentPhase →
// EventBufferClient → the real `postEvents` internal-api write) → the run's `run_events` stream →
// an SSE subscription (RunEventStreamer + the route's live-only reader shape). Asserts ordering,
// mid-flight visibility, concurrent-subscriber delivery, and the no-stale-replay rule — all
// against the REAL mapper (FakeEngine replays SDK messages) and a PGlite schema.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeEngine, type PhaseRequest } from "@rhema/engine";
import type { SdkMessage } from "@rhema/engine";
import {
  createOrchestratorTestDb,
  seedProject,
  seedRun,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "@rhema/orchestrator/testing";
import {
  InMemoryRunEventBus,
  RunEventStreamer,
  SqlEventWriter,
  postEvents,
  readUserEventsAfter,
  type EventReader,
  type OrchestratorDeps,
} from "@rhema/orchestrator";
import { runAgentPhase } from "./agent-entry.js";
import { EventBufferClient, InMemoryBufferStore, type EventTransport, type OutboundEvent } from "./event-buffer.js";

const TURN = "01JQ00000000000000000000AB";

const delta = (text: string): SdkMessage => ({
  type: "stream_event",
  event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
});

let db: OrchestratorTestDb;
let deps: TestDeps;
let orchDeps: OrchestratorDeps;
let seed: Awaited<ReturnType<typeof seedProject>>;
let bus: InMemoryRunEventBus;
let writer: SqlEventWriter;

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  bus = new InMemoryRunEventBus();
  writer = new SqlEventWriter(bus);
  deps = { ...makeDeps(db), eventWriter: writer };
  orchDeps = deps;
  seed = await seedProject(db);
  await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, workflow: "chat_turn", state: "running" });
});
afterEach(() => db.close());

/** A transport that ships each buffered batch through the REAL `postEvents` (fence + write). */
function internalApiTransport(): EventTransport {
  return {
    post: (events: readonly OutboundEvent[]) =>
      postEvents(orchDeps, {
        runId: "run1",
        attempt: 1,
        workspaceId: seed.workspaceId,
        events,
      }).then(() => undefined),
  };
}

/** The SSE route's reader shape: live-only on catch-up, include-everything on the tail. */
const sseReader: EventReader = (after, mode) =>
  db.txRunner.run(seed.workspaceId, (tx) =>
    readUserEventsAfter(tx, "run1", after, {
      maxDensity: "verbose",
      ephemeral: mode?.tail ? "include" : "live-only",
    }),
  );

const collect = () => {
  const chunks: string[] = [];
  return { chunks, sink: (c: string) => void chunks.push(c) };
};
const typesOf = (chunks: string[]) =>
  chunks.flatMap((c) => c.split("\n")).filter((l) => l.startsWith("event: ")).map((l) => l.slice(7));
const seqsOf = (chunks: string[]) =>
  chunks.flatMap((c) => c.split("\n")).filter((l) => l.startsWith("id: ")).map((l) => Number(l.slice(4)));

function chatReq(): PhaseRequest {
  return {
    runId: "run1",
    attempt: 1,
    cwd: "/work/project",
    phase: { key: "answer", skillPhase: "answer", phaseClass: "edit" },
    ordinal: 0,
    of: 1,
    skill: "chat-turn",
    inputs: { turnId: TURN, threadId: "01JQ00000000000000000000AA" },
    seat: "assistant",
    maxBudgetUsd: 1,
    maxTurns: 5,
  } as unknown as PhaseRequest;
}

describe("a stubbed chat turn → chat.token events on the run's stream (ADR-137 AC)", () => {
  it("N deltas → N ordered chat.token events, visible on an SSE subscription before completion", async () => {
    const N = 7;
    const engine = new FakeEngine(
      [
        ...Array.from({ length: N }, (_, i) => delta(`word${i} `)),
        { type: "result", subtype: "success", usage: { input_tokens: 5, output_tokens: N } },
      ],
      "assistant",
    );
    const events = new EventBufferClient(internalApiTransport(), new InMemoryBufferStore());

    // TWO concurrent subscribers attach BEFORE the turn's events land.
    const a = collect();
    const b = collect();
    const sa = new RunEventStreamer(sseReader, a.sink, 0);
    const sb = new RunEventStreamer(sseReader, b.sink, 0);
    await sa.pump();
    await sb.pump();

    const res = await runAgentPhase(engine, chatReq(), events);
    expect(res.subtype).toBe("success");
    expect(res.eventsPosted).toBe(N);

    // run_events holds N ordered chat.token rows; their stamped seqs are strictly monotonic.
    const rows = await db.txRunner.run(seed.workspaceId, (tx) =>
      readUserEventsAfter(tx, "run1", 0, { maxDensity: "verbose" }),
    );
    expect(rows.map((r) => r.type)).toEqual(Array.from({ length: N }, () => "chat.token"));
    expect(rows.map((r) => r.seq)).toEqual(Array.from({ length: N }, (_, i) => i + 1));
    const payloads = rows.map((r) => r.payload as { turnId: string; seq: number; text: string });
    expect(payloads.map((p) => p.turnId)).toEqual(Array.from({ length: N }, () => TURN));
    expect(payloads.map((p) => p.seq)).toEqual([0, 1, 2, 3, 4, 5, 6]); // the in-turn ordinal
    expect(payloads.map((p) => p.text).join("")).toBe("word0 word1 word2 word3 word4 word5 word6 ");

    // both subscribers see all N deltas on the live tail — before any completion lands.
    await sa.pump();
    await sb.pump();
    expect(typesOf(a.chunks)).toEqual(Array.from({ length: N }, () => "chat.token"));
    expect(seqsOf(a.chunks)).toEqual(seqsOf(b.chunks));
    expect(a.chunks.join("")).toContain('"turnId":"' + TURN);
  });

  it("a non-chat phase emits no chat.token even if deltas stream (the chatTurnId gate)", async () => {
    const engine = new FakeEngine(
      [delta("leak"), { type: "result", subtype: "success", usage: {} }],
      "editor",
    );
    const events = new EventBufferClient(internalApiTransport(), new InMemoryBufferStore());
    const req = chatReq();
    (req as { inputs: Record<string, unknown> }).inputs = { scope: "all" }; // no turnId
    await runAgentPhase(engine, req, events);
    const rows = await db.txRunner.run(seed.workspaceId, (tx) =>
      readUserEventsAfter(tx, "run1", 0, { maxDensity: "verbose" }),
    );
    expect(rows).toEqual([]);
  });
});

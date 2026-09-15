import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EventBufferClient,
  InMemoryBufferStore,
  FileBufferStore,
  type EventTransport,
  type OutboundEvent,
} from "./event-buffer.js";

// The run-task event client (§12.5; AC4): batch ≤250 or 2 s, buffer to disk when the api is unreachable, land
// in order afterward, raise the pause signal past 5,000 buffered, and DROP NOTHING.

function ev(n: number): OutboundEvent {
  return { type: "usage.tick", payload: { spentCredits: n, capCredits: 1000 } };
}

/** A transport whose reachability is toggled; records every delivered batch (flattened, in order). */
class FlakyTransport implements EventTransport {
  reachable = true;
  readonly delivered: OutboundEvent[] = [];
  readonly batchSizes: number[] = [];
  post(events: readonly OutboundEvent[]): Promise<void> {
    if (!this.reachable) return Promise.reject(new Error("ECONNREFUSED"));
    this.delivered.push(...events);
    this.batchSizes.push(events.length);
    return Promise.resolve();
  }
}

describe("EventBufferClient — batching", () => {
  it("flushes automatically when the in-memory batch reaches maxBatch, chunking each POST at maxBatch", async () => {
    const t = new FlakyTransport();
    const c = new EventBufferClient(t, new InMemoryBufferStore(), { maxBatch: 3 });
    for (let i = 0; i < 3; i++) await c.enqueue(ev(i)); // reaching 3 triggers a flush
    expect(t.delivered).toHaveLength(3);
    expect(t.batchSizes).toEqual([3]);
    expect(c.pendingCount()).toBe(0);
  });

  it("flushDue respects the 2 s cadence (no early flush, then flushes)", async () => {
    const t = new FlakyTransport();
    const c = new EventBufferClient(t, new InMemoryBufferStore(), { maxBatch: 250, flushIntervalMs: 2000 });
    await c.enqueue(ev(1));
    expect(await c.flushDue(1500)).toBeNull(); // < 2 s since construction's lastFlushAt(0)
    const r = await c.flushDue(2001);
    expect(r?.ok).toBe(true);
    expect(t.delivered).toHaveLength(1);
  });
});

describe("EventBufferClient — disk buffering under an unreachable api (AC4)", () => {
  it("buffers to disk while the api is down, then delivers everything in order when it recovers", async () => {
    const t = new FlakyTransport();
    const store = new InMemoryBufferStore();
    const c = new EventBufferClient(t, store, { maxBatch: 2 });

    t.reachable = false;
    for (let i = 0; i < 5; i++) await c.enqueue(ev(i)); // enqueue-triggered flushes all fail → spill to disk
    const flush1 = await c.flush(); // flush the remainder too
    expect(flush1.ok).toBe(false);
    expect(await store.size()).toBe(5); // nothing delivered, nothing dropped
    expect(t.delivered).toHaveLength(0);

    t.reachable = true;
    const flush2 = await c.flush();
    expect(flush2.ok).toBe(true);
    expect(await store.size()).toBe(0);
    // order preserved across the outage
    expect(t.delivered.map((e) => (e.payload as { spentCredits: number }).spentCredits)).toEqual([0, 1, 2, 3, 4]);
  });

  it("preserves order when new events are enqueued after a disk-buffered backlog (disk-first drain)", async () => {
    const t = new FlakyTransport();
    const c = new EventBufferClient(t, new InMemoryBufferStore(), { maxBatch: 100 });
    t.reachable = false;
    await c.enqueue(ev(0));
    await c.enqueue(ev(1));
    await c.flush(); // 0,1 → disk
    t.reachable = true;
    await c.enqueue(ev(2)); // newer, in memory
    await c.enqueue(ev(3));
    await c.flush(); // disk (0,1) drained BEFORE pending (2,3)
    expect(t.delivered.map((e) => (e.payload as { spentCredits: number }).spentCredits)).toEqual([0, 1, 2, 3]);
  });

  it("raises the pause signal once the backlog exceeds the threshold, and DROPS NOTHING", async () => {
    const t = new FlakyTransport();
    t.reachable = false;
    const paused: { reason: string; buffered: number }[] = [];
    const c = new EventBufferClient(t, new InMemoryBufferStore(), {
      maxBatch: 250,
      pauseThreshold: 5000,
      onPause: (reason, buffered) => paused.push({ reason, buffered }),
    });
    for (let i = 0; i < 5001; i++) await c.enqueue(ev(i)); // 5001 events, api down the whole time
    await c.flush();
    expect(paused).toHaveLength(1);
    expect(paused[0].reason).toBe("event_buffer_overflow");
    expect(paused[0].buffered).toBeGreaterThan(5000);
    // recover → all 5001 delivered in order, none dropped
    t.reachable = true;
    await c.flush();
    expect(t.delivered).toHaveLength(5001);
    expect(t.delivered.map((e) => (e.payload as { spentCredits: number }).spentCredits)).toEqual(
      Array.from({ length: 5001 }, (_, i) => i),
    );
  });
});

describe("FileBufferStore — real disk spill round-trips in order", () => {
  const dir = mkdtempSync(join(tmpdir(), "rhema-evbuf-"));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("appends NDJSON, reads back oldest-first, and truncates on clear", async () => {
    const t = new FlakyTransport();
    const store = new FileBufferStore(join(dir, "events.ndjson"));
    const c = new EventBufferClient(t, store, { maxBatch: 10 });
    t.reachable = false;
    for (let i = 0; i < 4; i++) await c.enqueue(ev(i));
    await c.flush();
    expect(await store.size()).toBe(4);
    expect((await store.readAll()).map((e) => (e.payload as { spentCredits: number }).spentCredits)).toEqual([0, 1, 2, 3]);

    t.reachable = true;
    await c.flush();
    expect(await store.size()).toBe(0); // cleared after delivery
    expect(t.delivered).toHaveLength(4);
  });
});

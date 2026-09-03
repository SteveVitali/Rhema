// The run-task side of the event pipeline (§12.5): batch, and DROP NOTHING. The harness enqueues user/internal
// events as the SDK stream is mapped; this client batches them (≤250 events or every 2 s) and POSTs each batch
// to the internal `POST /internal/runs/:id/events`. When the api is unreachable the batch spills to an
// append-only disk buffer and is drained, in order, on the next successful flush — so a transient api outage
// never loses or reorders an event. If the backlog grows past the pause threshold (>5,000 buffered) the client
// raises a pause signal so the engine stops producing until delivery catches up (back-pressure, not loss).
//
// Kept transport-agnostic and filesystem-agnostic (both injected) so the batching/ordering/back-pressure logic
// is deterministically testable; the live shell binds `post` to a fetch against the internal API (with the run
// token) and `store` to a file under the harness-only scratch dir.

/** One event queued for delivery. `type` is validated server-side at the write boundary (REQ-DATA-37). */
export interface OutboundEvent {
  readonly type: string;
  readonly payload: unknown;
  readonly agentLabel?: string;
}

/** POSTs a batch to the internal events endpoint. Resolves on success; REJECTS on any network/HTTP failure. */
export interface EventTransport {
  post(events: readonly OutboundEvent[]): Promise<void>;
}

/** The append-only disk spill: events that could not be delivered, kept in order until the api recovers. */
export interface BufferStore {
  /** Append events to the end of the buffer (preserving order). */
  append(events: readonly OutboundEvent[]): Promise<void>;
  /** Read every buffered event, oldest first. */
  readAll(): Promise<OutboundEvent[]>;
  /** Empty the buffer (after its contents have been delivered). */
  clear(): Promise<void>;
  /** Count of buffered events. */
  size(): Promise<number>;
}

export type PauseReason = "event_buffer_overflow";

export interface EventBufferOptions {
  /** max events per POST (§12.5: ≤250). */
  readonly maxBatch?: number;
  /** flush cadence in ms (§12.5: 2 s). */
  readonly flushIntervalMs?: number;
  /** buffered-event count above which the engine is paused (§12.5: >5,000). */
  readonly pauseThreshold?: number;
  /** raised (once per crossing) when the backlog exceeds `pauseThreshold`. */
  readonly onPause?: (reason: PauseReason, buffered: number) => void;
}

export const DEFAULT_MAX_BATCH = 250;
export const DEFAULT_FLUSH_INTERVAL_MS = 2_000;
export const DEFAULT_PAUSE_THRESHOLD = 5_000;

export interface FlushResult {
  /** true if every pending + previously-buffered event was delivered. */
  readonly ok: boolean;
  /** events delivered in this flush. */
  readonly delivered: number;
  /** events left on disk after this flush (0 on full success). */
  readonly buffered: number;
}

/**
 * Batching, disk-buffering, back-pressuring event client. `enqueue` accumulates events in memory; a flush is
 * triggered when the in-memory batch reaches `maxBatch`, when `flushDue` fires the 2 s cadence, or explicitly.
 * The delivery invariant: every not-yet-delivered event lives either on disk (older) or in `pending` (newer),
 * always in enqueue order — so a drain sends disk-first and nothing is dropped or reordered.
 */
export class EventBufferClient {
  private readonly pending: OutboundEvent[] = [];
  private readonly maxBatch: number;
  private readonly flushIntervalMs: number;
  private readonly pauseThreshold: number;
  private readonly onPause?: (reason: PauseReason, buffered: number) => void;
  private lastFlushAt = 0;
  private paused = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<FlushResult> | null = null;

  constructor(
    private readonly transport: EventTransport,
    private readonly store: BufferStore,
    opts: EventBufferOptions = {},
  ) {
    this.maxBatch = opts.maxBatch ?? DEFAULT_MAX_BATCH;
    this.flushIntervalMs = opts.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.pauseThreshold = opts.pauseThreshold ?? DEFAULT_PAUSE_THRESHOLD;
    this.onPause = opts.onPause;
  }

  /** Queue an event for delivery. Triggers a flush once the in-memory batch reaches `maxBatch`. */
  async enqueue(event: OutboundEvent): Promise<void> {
    this.pending.push(event);
    if (this.pending.length >= this.maxBatch) await this.flush();
  }

  /** Flush if at least `flushIntervalMs` has elapsed since the last flush (drives the 2 s cadence). */
  async flushDue(now: number): Promise<FlushResult | null> {
    if (now - this.lastFlushAt < this.flushIntervalMs) return null;
    return this.flush();
  }

  /** Start the 2 s background flush cadence (live shell). Tests drive `flush`/`flushDue` directly instead. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), this.flushIntervalMs);
    if (typeof this.timer === "object" && "unref" in this.timer) this.timer.unref?.();
  }

  /** Stop the background cadence. */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Deliver everything buffered (disk-first) then pending, in order. Serialized: overlapping flushes coalesce. */
  async flush(): Promise<FlushResult> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.doFlush();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async doFlush(): Promise<FlushResult> {
    this.lastFlushAt = Date.now();
    const buffered = await this.store.readAll();
    const all = [...buffered, ...this.pending];
    this.pending.length = 0;
    if (all.length === 0) return { ok: true, delivered: 0, buffered: 0 };

    let delivered = 0;
    try {
      for (let i = 0; i < all.length; i += this.maxBatch) {
        const chunk = all.slice(i, i + this.maxBatch);
        await this.transport.post(chunk); // may reject → api unreachable
        delivered += chunk.length;
      }
      await this.store.clear(); // everything delivered — the disk buffer is now empty
      this.paused = false;
      return { ok: true, delivered, buffered: 0 };
    } catch {
      // the api is unreachable from `delivered` onward: persist the undelivered tail to disk, in order.
      const undelivered = all.slice(delivered);
      await this.store.clear();
      await this.store.append(undelivered);
      this.maybePause(undelivered.length);
      return { ok: false, delivered, buffered: undelivered.length };
    }
  }

  /** Raise the pause signal once when the backlog first crosses the threshold (§12.5: >5,000 buffered). */
  private maybePause(buffered: number): void {
    if (buffered > this.pauseThreshold && !this.paused) {
      this.paused = true;
      this.onPause?.("event_buffer_overflow", buffered);
    } else if (buffered <= this.pauseThreshold) {
      this.paused = false;
    }
  }

  /** Events buffered in memory (not yet flushed). */
  pendingCount(): number {
    return this.pending.length;
  }

  /** Final flush on shutdown; the engine has stopped, so pending must be delivered or durably buffered. */
  async close(): Promise<FlushResult> {
    this.stop();
    return this.flush();
  }
}

// --------------------------------------------------------------------------- store implementations

/** In-memory buffer store (tests / a single flush cycle). Preserves order. */
export class InMemoryBufferStore implements BufferStore {
  private events: OutboundEvent[] = [];
  append(events: readonly OutboundEvent[]): Promise<void> {
    this.events.push(...events);
    return Promise.resolve();
  }
  readAll(): Promise<OutboundEvent[]> {
    return Promise.resolve([...this.events]);
  }
  clear(): Promise<void> {
    this.events = [];
    return Promise.resolve();
  }
  size(): Promise<number> {
    return Promise.resolve(this.events.length);
  }
}

/**
 * File-backed buffer store: an append-only NDJSON file under the harness-only scratch dir. Each line is one
 * event; `readAll` parses in file order (oldest first); `clear` truncates. Survives a run-task process crash so
 * a buffered backlog is not lost across a restart within the same task.
 */
export class FileBufferStore implements BufferStore {
  constructor(
    private readonly path: string,
    private readonly fs: BufferFs = nodeBufferFs,
  ) {}

  async append(events: readonly OutboundEvent[]): Promise<void> {
    if (events.length === 0) return;
    const lines = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await this.fs.appendFile(this.path, lines);
  }

  async readAll(): Promise<OutboundEvent[]> {
    const raw = await this.fs.readFile(this.path);
    if (!raw) return [];
    return raw
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as OutboundEvent);
  }

  async clear(): Promise<void> {
    await this.fs.truncate(this.path);
  }

  async size(): Promise<number> {
    return (await this.readAll()).length;
  }
}

/** The minimal filesystem surface the file store needs (injectable for tests). */
export interface BufferFs {
  appendFile(path: string, data: string): Promise<void>;
  /** Read the file; resolve to "" if it does not exist. */
  readFile(path: string): Promise<string>;
  truncate(path: string): Promise<void>;
}

/** Node fs binding for `BufferFs` (lazy import so the module stays load-light in the hook subprocess). */
export const nodeBufferFs: BufferFs = {
  async appendFile(path, data) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(path, data, "utf8");
  },
  async readFile(path) {
    const { readFile } = await import("node:fs/promises");
    try {
      return await readFile(path, "utf8");
    } catch {
      return ""; // absent buffer file = empty buffer
    }
  },
  async truncate(path) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path, "", "utf8");
  },
};

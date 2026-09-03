// The SSE delivery path (§12.5): replay-then-tail over the `run_events` store, with exactly-once resumable
// replay keyed on `seq` (`Last-Event-ID`). The route reads ONLY `run_events` — which by construction holds only
// `visibility=user` rows — so an `internal` event can never be served (REQ-ARCH-12; AC2). Redis is a wakeup
// only: every wakeup (and a periodic safety poll) re-reads the actual rows from Postgres, so a lost, early, or
// duplicate publish is at most a no-op and reconnect (`Last-Event-ID`) always replays exactly-once from
// Postgres (REQ-ARCH-13; AC1/AC3). Viewers receive Summary density only; the run's requester may receive up to
// Verbose (REQ-DATA-38).

import type { EventDensity } from "@rhema/contracts";
import type { SqlClient } from "./tx.js";
import type { RunEventSubscriber } from "./event-store.js";

/** A user-visible event as delivered over SSE (never carries visibility/internal detail). */
export interface StreamedEvent {
  readonly seq: number;
  readonly type: string;
  readonly payload: unknown;
  readonly density: EventDensity;
  readonly agentLabel?: string;
  readonly at: Date;
}

/** Streamable densities, coarsest → finest. `internal` is never streamable (it lives in a separate table). */
const DENSITY_ORDER: readonly EventDensity[] = ["summary", "normal", "verbose"];

/** The densities a viewer at `maxDensity` receives (Summary-only viewers get just `summary`; REQ-DATA-38). */
export function densitiesUpTo(maxDensity: EventDensity): EventDensity[] {
  if (maxDensity === "internal") return [...DENSITY_ORDER]; // never widen to internal; treat as full user set
  const idx = DENSITY_ORDER.indexOf(maxDensity);
  return DENSITY_ORDER.slice(0, idx + 1);
}

export interface ReadEventsOptions {
  /** the finest density to include (default `summary` — the viewer rule). */
  readonly maxDensity?: EventDensity;
  /** cap the number of rows returned (replay paging); default unbounded. */
  readonly limit?: number;
}

/**
 * Read the run's user events with `seq > afterSeq`, in seq order, at or below `maxDensity`. Reads only
 * `run_events`, so an internal-visibility row can never be returned. Run inside the VIEWER's tenant
 * transaction — RLS then also guarantees cross-tenant isolation.
 */
export async function readUserEventsAfter(
  tx: SqlClient,
  runId: string,
  afterSeq: number,
  opts: ReadEventsOptions = {},
): Promise<StreamedEvent[]> {
  const densities = densitiesUpTo(opts.maxDensity ?? "summary");
  const limitClause = opts.limit != null ? ` limit ${Math.max(0, Math.floor(opts.limit))}` : "";
  const res = await tx.query(
    `select seq, type, payload, density, agent_label, at
       from run_events
      where run_id = $1 and seq > $2 and density = any($3)
      order by seq${limitClause}`,
    [runId, afterSeq, densities],
  );
  return (res.rows as RunEventRow[]).map(toStreamedEvent);
}

interface RunEventRow {
  seq: number;
  type: string;
  payload: unknown;
  density: string;
  agent_label: string | null;
  at: Date | string;
}

function toStreamedEvent(r: RunEventRow): StreamedEvent {
  return {
    seq: r.seq,
    type: r.type,
    payload: typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload,
    density: r.density as EventDensity,
    agentLabel: r.agent_label ?? undefined,
    at: r.at instanceof Date ? r.at : new Date(r.at),
  };
}

/** Format one event as an SSE message. `id:` carries the seq so the browser sets `Last-Event-ID` on reconnect. */
export function formatSse(ev: StreamedEvent): string {
  const data = JSON.stringify({
    seq: ev.seq,
    type: ev.type,
    payload: ev.payload,
    density: ev.density,
    at: ev.at instanceof Date ? ev.at.toISOString() : ev.at,
    ...(ev.agentLabel ? { agentLabel: ev.agentLabel } : {}),
  });
  return `id: ${ev.seq}\nevent: ${ev.type}\ndata: ${data}\n\n`;
}

/** The SSE heartbeat comment (§12.5: `: ping` every 25 s to hold the connection open through the ALB). */
export const SSE_PING = ": ping\n\n";

/** Reads the run's user events after a seq (a tenant-scoped Postgres read; the streamer's only data source). */
export type EventReader = (afterSeq: number) => Promise<StreamedEvent[]>;
/** Writes one SSE chunk to the client connection. */
export type SseSink = (chunk: string) => void | Promise<void>;

/**
 * The exactly-once cursor over a run's user events. `pump()` reads every row past the last emitted seq and
 * writes it once; `lastSeq` only advances, so a re-read (a duplicate wakeup, a replay after reconnect) never
 * re-emits. Both replay and tail are the same `pump()`. Concurrency-safe: overlapping pumps coalesce.
 */
export class RunEventStreamer {
  private last: number;
  private pumping = false;
  private dirty = false;

  constructor(
    private readonly read: EventReader,
    private readonly sink: SseSink,
    afterSeq = 0,
  ) {
    this.last = Number.isFinite(afterSeq) && afterSeq > 0 ? afterSeq : 0;
  }

  /** The highest seq delivered so far (the client's effective `Last-Event-ID`). */
  get lastSeq(): number {
    return this.last;
  }

  /**
   * Emit every not-yet-delivered user event (seq > lastSeq), in order, exactly once. Returns the count emitted.
   * If called while a pump is in flight, marks the cursor dirty and lets the in-flight pump pick up the new
   * rows, so concurrent wakeups never interleave or double-emit.
   */
  async pump(): Promise<number> {
    if (this.pumping) {
      this.dirty = true;
      return 0;
    }
    this.pumping = true;
    let emitted = 0;
    try {
      do {
        this.dirty = false;
        const rows = await this.read(this.last);
        for (const ev of rows) {
          if (ev.seq <= this.last) continue; // exactly-once guard
          await this.sink(formatSse(ev));
          this.last = ev.seq;
          emitted++;
        }
      } while (this.dirty);
    } finally {
      this.pumping = false;
    }
    return emitted;
  }

  /** Write the keep-alive ping. */
  ping(): void | Promise<void> {
    return this.sink(SSE_PING);
  }
}

export interface StreamRunEventsOptions {
  readonly runId: string;
  /** the client's `Last-Event-ID` (resume point); 0/undefined starts from the beginning. */
  readonly afterSeq?: number;
  readonly read: EventReader;
  readonly sink: SseSink;
  /** the fan-out subscriber (Redis); omit or a degraded bus → the safety poll still serves (AC3). */
  readonly subscriber?: RunEventSubscriber;
  /** aborts the stream (client disconnect / run terminal). */
  readonly signal: AbortSignal;
  /** keep-alive interval (§12.5: 25 s). */
  readonly pingIntervalMs?: number;
  /** safety re-poll interval — recovers a lost/early wakeup without waiting for reconnect. */
  readonly pollIntervalMs?: number;
}

/**
 * Run the replay-then-tail loop until the signal aborts: replay from Postgres (seq > afterSeq), subscribe to
 * the fan-out bus, and on every wakeup / safety-poll re-read Postgres and emit new rows; ping periodically.
 * Postgres is the only source of rows; the bus and poll are just wakeups (Redis is never a source of truth).
 */
export async function streamRunEvents(opts: StreamRunEventsOptions): Promise<void> {
  const streamer = new RunEventStreamer(opts.read, opts.sink, opts.afterSeq ?? 0);
  const pingMs = opts.pingIntervalMs ?? 25_000;
  const pollMs = opts.pollIntervalMs ?? 10_000;

  await streamer.pump(); // replay
  if (opts.signal.aborted) return;

  const unsubscribe = opts.subscriber?.subscribe(opts.runId, () => void streamer.pump());

  await new Promise<void>((resolve) => {
    const poll = setInterval(() => void streamer.pump(), pollMs);
    const ping = setInterval(() => void streamer.ping(), pingMs);
    const stop = (): void => {
      clearInterval(poll);
      clearInterval(ping);
      unsubscribe?.();
      opts.signal.removeEventListener("abort", stop);
      resolve();
    };
    if (opts.signal.aborted) stop();
    else opts.signal.addEventListener("abort", stop);
  });
}

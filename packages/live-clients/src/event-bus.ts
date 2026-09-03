// The live run-event fan-out binding (D-P0.08b-1): `RunEventPublisher` + `RunEventSubscriber` over Redis
// pub/sub (Memorystore). After a user event is appended, the writer publishes the run's high-water seq on
// `run:<id>`; every SSE task tailing that run wakes and reads the newly-committed rows from Postgres (Postgres
// stays the source of truth — the publish is only a wakeup, §12.5). Publishing uses the main connection;
// subscribing uses a DEDICATED connection (a Redis connection in subscriber mode cannot issue other commands),
// so the live bus takes both. The dispatch/refcount logic is written against minimal `RedisPubLike`/`RedisSubLike`
// surfaces so it is unit-tested with fakes; the live binding passes `redis` + `redis.duplicate()`.

import type { RunEventPublisher, RunEventSubscriber } from "@rhema/orchestrator";

/** The `run:<id>` pub/sub channel for a run's event fan-out. */
export function runChannel(runId: string): string {
  return `run:${runId}`;
}

/** Parse a run id back out of its channel name, or null when the channel is not a run channel. */
export function runIdFromChannel(channel: string): string | null {
  return channel.startsWith("run:") ? channel.slice("run:".length) : null;
}

/** Publish half of Redis pub/sub (the main connection). */
export interface RedisPubLike {
  publish(channel: string, message: string): Promise<unknown>;
}

/** Subscribe half of Redis pub/sub (a dedicated connection in subscriber mode). */
export interface RedisSubLike {
  subscribe(...channels: string[]): Promise<unknown>;
  unsubscribe(...channels: string[]): Promise<unknown>;
  on(event: "message", listener: (channel: string, message: string) => void): void;
}

/**
 * Redis-backed run-event bus. A single subscriber connection multiplexes every tailed run: per-run listener
 * sets are refcounted so the first `subscribe(runId, …)` issues `SUBSCRIBE run:<id>` and the last unsubscribe
 * issues `UNSUBSCRIBE run:<id>`. Malformed / non-numeric messages are ignored (the tail's safety re-poll keeps
 * delivery correct regardless — §12.5).
 */
export class RedisRunEventBus implements RunEventPublisher, RunEventSubscriber {
  private readonly listeners = new Map<string, Set<(seq: number) => void>>();
  private wired = false;

  constructor(
    private readonly pub: RedisPubLike,
    private readonly sub: RedisSubLike,
  ) {}

  publish(runId: string, seq: number): Promise<void> {
    return this.pub.publish(runChannel(runId), String(seq)).then(() => undefined);
  }

  subscribe(runId: string, onSeq: (seq: number) => void): () => void {
    this.ensureWired();
    let set = this.listeners.get(runId);
    if (!set) {
      set = new Set();
      this.listeners.set(runId, set);
      void this.sub.subscribe(runChannel(runId));
    }
    set.add(onSeq);
    return () => {
      const current = this.listeners.get(runId);
      if (!current) return;
      current.delete(onSeq);
      if (current.size === 0) {
        this.listeners.delete(runId);
        void this.sub.unsubscribe(runChannel(runId));
      }
    };
  }

  /** Attach the single `message` handler once (idempotent). */
  private ensureWired(): void {
    if (this.wired) return;
    this.wired = true;
    this.sub.on("message", (channel, message) => {
      const runId = runIdFromChannel(channel);
      if (runId == null) return;
      const seq = Number(message);
      if (!Number.isFinite(seq)) return;
      const set = this.listeners.get(runId);
      if (!set) return;
      for (const fn of set) fn(seq);
    });
  }
}

// The live `HeartbeatStore` binding (D-P0.08-1): run heartbeats in Redis (Memorystore), one key per run
// (`hb:<runId>`) with a TTL so a task that dies stops beating and ages out (§12.4). Postgres sees only
// transitions; Redis holds the volatile liveness signal. `requestCancel` flips the `cancelRequested` flag the
// next heartbeat read returns (Stop reaches the task). The reaper's `listStale` scan enumerates live runs via a
// companion index set (`hb:index`) — a Redis `SCAN` over a shared cluster is discouraged, so we track the id
// set explicitly and drop entries whose key has already expired.
//
// The store is written against a minimal `RedisLike` surface (the exact ioredis methods used), so the full
// beat/get/cancel/clear/listStale logic is unit-tested against an in-memory fake; the live binding is
// `new RedisHeartbeatStore(new IORedis(url))`.

import {
  HEARTBEAT_TTL_MS,
  type HeartbeatRecord,
  type HeartbeatStore,
} from "@rhema/orchestrator";

/** The `hb:<runId>` heartbeat key. */
export function heartbeatKey(runId: string): string {
  return `hb:${runId}`;
}

/** The companion index set holding every run id with a live heartbeat (for the reaper's scan). */
export const HEARTBEAT_INDEX_KEY = "hb:index";

/** The wire shape stored at the heartbeat key (`at` as epoch ms for a compact, timezone-free encoding). */
interface HeartbeatWire {
  readonly runId: string;
  readonly attempt: number;
  readonly workspaceId: string;
  readonly at: number;
  readonly cancelRequested: boolean;
}

/** Serialize a heartbeat record to its Redis value. */
export function encodeHeartbeat(rec: HeartbeatRecord): string {
  const wire: HeartbeatWire = {
    runId: rec.runId,
    attempt: rec.attempt,
    workspaceId: rec.workspaceId,
    at: rec.at.getTime(),
    cancelRequested: rec.cancelRequested,
  };
  return JSON.stringify(wire);
}

/** Parse a Redis heartbeat value back to a record, or null when the value is absent/malformed. */
export function decodeHeartbeat(value: string | null): HeartbeatRecord | null {
  if (value == null) return null;
  let wire: HeartbeatWire;
  try {
    wire = JSON.parse(value) as HeartbeatWire;
  } catch {
    return null;
  }
  if (typeof wire.runId !== "string" || typeof wire.at !== "number") return null;
  return {
    runId: wire.runId,
    attempt: wire.attempt,
    workspaceId: wire.workspaceId,
    at: new Date(wire.at),
    cancelRequested: Boolean(wire.cancelRequested),
  };
}

/** The minimal Redis surface the heartbeat store uses (ioredis satisfies it; a fake backs the tests). */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  /** SET with a TTL in seconds (`EX`) and optional `KEEPTTL` mode. */
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
  set(key: string, value: string, mode: "KEEPTTL"): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  mget(...keys: string[]): Promise<(string | null)[]>;
}

export class RedisHeartbeatStore implements HeartbeatStore {
  private readonly ttlSeconds: number;
  constructor(
    private readonly redis: RedisLike,
    ttlMs: number = HEARTBEAT_TTL_MS,
  ) {
    this.ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
  }

  async beat(rec: Omit<HeartbeatRecord, "cancelRequested"> & { cancelRequested?: boolean }): Promise<void> {
    // Preserve a pending cancel across beats (the task's beat must not clear a Stop request it hasn't seen yet).
    const prior = await this.get(rec.runId);
    const cancelRequested = rec.cancelRequested ?? prior?.cancelRequested ?? false;
    const full: HeartbeatRecord = {
      runId: rec.runId,
      attempt: rec.attempt,
      workspaceId: rec.workspaceId,
      at: rec.at,
      cancelRequested,
    };
    await this.redis.set(heartbeatKey(rec.runId), encodeHeartbeat(full), "EX", this.ttlSeconds);
    await this.redis.sadd(HEARTBEAT_INDEX_KEY, rec.runId);
  }

  async get(runId: string): Promise<HeartbeatRecord | null> {
    return decodeHeartbeat(await this.redis.get(heartbeatKey(runId)));
  }

  async requestCancel(runId: string): Promise<void> {
    const cur = await this.get(runId);
    if (!cur) return; // no live heartbeat — nothing to flag (a queued/terminal run cancels via the DB path)
    // KEEPTTL: flag the cancel without extending the staleness window.
    await this.redis.set(heartbeatKey(runId), encodeHeartbeat({ ...cur, cancelRequested: true }), "KEEPTTL");
  }

  async clear(runId: string): Promise<void> {
    await this.redis.del(heartbeatKey(runId));
    await this.redis.srem(HEARTBEAT_INDEX_KEY, runId);
  }

  async listStale(now: Date, staleMs: number): Promise<HeartbeatRecord[]> {
    const ids = await this.redis.smembers(HEARTBEAT_INDEX_KEY);
    if (ids.length === 0) return [];
    const values = await this.redis.mget(...ids.map(heartbeatKey));
    const cutoff = now.getTime() - staleMs;
    const stale: HeartbeatRecord[] = [];
    const expiredIds: string[] = [];
    ids.forEach((runId, i) => {
      const rec = decodeHeartbeat(values[i] ?? null);
      if (!rec) {
        expiredIds.push(runId); // key aged out — drop the dangling index entry
        return;
      }
      if (rec.at.getTime() < cutoff) stale.push(rec);
    });
    if (expiredIds.length > 0) await this.redis.srem(HEARTBEAT_INDEX_KEY, ...expiredIds);
    return stale;
  }
}

import { describe, it, expect } from "vitest";
import { HEARTBEAT_STALE_MS, type HeartbeatRecord } from "@rhema/orchestrator";
import {
  RedisHeartbeatStore,
  heartbeatKey,
  encodeHeartbeat,
  decodeHeartbeat,
  HEARTBEAT_INDEX_KEY,
  type RedisLike,
} from "./heartbeat.js";

/** A minimal in-memory Redis (string KV + one set + TTL bookkeeping) that satisfies `RedisLike`. */
class FakeRedis implements RedisLike {
  readonly kv = new Map<string, string>();
  readonly ttl = new Map<string, number>(); // seconds, for assertions
  readonly sets = new Map<string, Set<string>>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.kv.get(key) ?? null);
  }
  set(key: string, value: string, mode: "EX" | "KEEPTTL", ttlSeconds?: number): Promise<unknown> {
    this.kv.set(key, value);
    if (mode === "EX" && ttlSeconds != null) this.ttl.set(key, ttlSeconds);
    // KEEPTTL leaves this.ttl untouched (the point of the flag).
    return Promise.resolve("OK");
  }
  del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) {
      if (this.kv.delete(k)) n++;
      this.ttl.delete(k);
    }
    return Promise.resolve(n);
  }
  sadd(key: string, ...members: string[]): Promise<number> {
    const s = this.sets.get(key) ?? new Set<string>();
    this.sets.set(key, s);
    let n = 0;
    for (const m of members) {
      if (!s.has(m)) {
        s.add(m);
        n++;
      }
    }
    return Promise.resolve(n);
  }
  srem(key: string, ...members: string[]): Promise<number> {
    const s = this.sets.get(key);
    let n = 0;
    if (s) for (const m of members) if (s.delete(m)) n++;
    return Promise.resolve(n);
  }
  smembers(key: string): Promise<string[]> {
    return Promise.resolve([...(this.sets.get(key) ?? [])]);
  }
  mget(...keys: string[]): Promise<(string | null)[]> {
    return Promise.resolve(keys.map((k) => this.kv.get(k) ?? null));
  }
  /** test helper: simulate a key TTL expiry (drop the value but leave the index entry dangling). */
  expire(key: string): void {
    this.kv.delete(key);
  }
}

const rec = (over: Partial<HeartbeatRecord> = {}): Omit<HeartbeatRecord, "cancelRequested"> => ({
  runId: over.runId ?? "run_1",
  attempt: over.attempt ?? 1,
  workspaceId: over.workspaceId ?? "ws_1",
  at: over.at ?? new Date("2026-09-03T00:00:00Z"),
});

describe("heartbeat encode/decode", () => {
  it("round-trips a record (at as epoch ms)", () => {
    const r: HeartbeatRecord = { ...rec(), cancelRequested: true };
    expect(decodeHeartbeat(encodeHeartbeat(r))).toEqual(r);
  });
  it("returns null for absent or malformed values", () => {
    expect(decodeHeartbeat(null)).toBeNull();
    expect(decodeHeartbeat("not json")).toBeNull();
    expect(decodeHeartbeat(JSON.stringify({ nope: true }))).toBeNull();
  });
  it("keys by run id", () => {
    expect(heartbeatKey("run_x")).toBe("hb:run_x");
  });
});

describe("RedisHeartbeatStore", () => {
  it("beat SETEXes the key with a TTL and indexes the run", async () => {
    const redis = new FakeRedis();
    const store = new RedisHeartbeatStore(redis);
    await store.beat(rec());
    expect(await store.get("run_1")).toMatchObject({ runId: "run_1", attempt: 1, cancelRequested: false });
    expect(redis.ttl.get("hb:run_1")).toBe(HEARTBEAT_STALE_MS / 1000);
    expect(await redis.smembers(HEARTBEAT_INDEX_KEY)).toContain("run_1");
  });

  it("preserves a pending cancel across a beat", async () => {
    const redis = new FakeRedis();
    const store = new RedisHeartbeatStore(redis);
    await store.beat(rec());
    await store.requestCancel("run_1");
    expect((await store.get("run_1"))?.cancelRequested).toBe(true);
    // the task beats again WITHOUT clearing the flag it has not yet seen.
    await store.beat({ ...rec(), at: new Date("2026-09-03T00:00:20Z") });
    expect((await store.get("run_1"))?.cancelRequested).toBe(true);
  });

  it("requestCancel uses KEEPTTL (does not extend the staleness window)", async () => {
    const redis = new FakeRedis();
    const store = new RedisHeartbeatStore(redis);
    await store.beat(rec());
    redis.ttl.set("hb:run_1", 42); // pretend some TTL elapsed
    await store.requestCancel("run_1");
    expect(redis.ttl.get("hb:run_1")).toBe(42); // unchanged
  });

  it("requestCancel is a no-op when there is no live heartbeat", async () => {
    const redis = new FakeRedis();
    const store = new RedisHeartbeatStore(redis);
    await store.requestCancel("ghost");
    expect(await store.get("ghost")).toBeNull();
  });

  it("clear drops the key and de-indexes the run", async () => {
    const redis = new FakeRedis();
    const store = new RedisHeartbeatStore(redis);
    await store.beat(rec());
    await store.clear("run_1");
    expect(await store.get("run_1")).toBeNull();
    expect(await redis.smembers(HEARTBEAT_INDEX_KEY)).not.toContain("run_1");
  });

  it("listStale returns only records older than the cutoff", async () => {
    const redis = new FakeRedis();
    const store = new RedisHeartbeatStore(redis);
    const now = new Date("2026-09-03T01:00:00Z");
    await store.beat(rec({ runId: "fresh", at: new Date(now.getTime() - 1000) }));
    await store.beat(rec({ runId: "stale", at: new Date(now.getTime() - HEARTBEAT_STALE_MS - 1000) }));
    const stale = await store.listStale(now, HEARTBEAT_STALE_MS);
    expect(stale.map((r) => r.runId)).toEqual(["stale"]);
  });

  it("listStale prunes dangling index entries whose key expired", async () => {
    const redis = new FakeRedis();
    const store = new RedisHeartbeatStore(redis);
    const now = new Date("2026-09-03T01:00:00Z");
    await store.beat(rec({ runId: "gone", at: new Date(now.getTime() - 5000) }));
    redis.expire("hb:gone"); // key aged out, index still holds "gone"
    const stale = await store.listStale(now, HEARTBEAT_STALE_MS);
    expect(stale).toEqual([]);
    expect(await redis.smembers(HEARTBEAT_INDEX_KEY)).not.toContain("gone");
  });
});

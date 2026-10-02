// A beta-grade signup/magic-link throttle (PRB.13; REQ-BETA-19 amended 2026-09-16): a fixed-window
// counter over two independent dimensions — per source IP and per email. No captcha vendor, no risk
// scoring; the ticket's abuse control is deliberately this and only this. The clock is injected so the
// window boundary is deterministic under test.
//
// SEC.2 — the store is now shared: `attempt` is ASYNC and counts through a `ThrottleStore` seam so every
// Cloud Run instance counts against ONE Memorystore Redis (D-PRB.13-1 closed; ADR-039). The in-memory
// implementation below is kept for tests and for the documented degraded path (a Redis outage fails
// over to per-instance limits — never unlimited, never fail-closed; ADR-039).

import { sha256Hex } from "./sha256.js";

export interface ThrottleVerdict {
  readonly allowed: boolean;
  /** Seconds until the blocking window resets (present only when not allowed). */
  readonly retryAfterSec?: number;
}

export interface IpEmailThrottle {
  /**
   * Record one attempt under (ip, email). `allowed:false` when EITHER dimension is over its limit for the
   * current window; `retryAfterSec` is the time until the blocking window resets. Every attempt counts —
   * blocked attempts do not extend the window (fixed windows reset on schedule, not on last-hit).
   * ASYNC (SEC.2): the counting backend may be a remote store.
   */
  attempt(ip: string, email?: string): Promise<ThrottleVerdict>;
}

export interface IpEmailThrottleOptions {
  /** Max attempts per source IP per window. */
  readonly perIp: number;
  /** Max attempts per email per window. */
  readonly perEmail: number;
  /** Window length in milliseconds. */
  readonly windowMs: number;
  /** Injected clock (default `Date.now`) so tests control the window boundary. */
  readonly now?: () => number;
  /** SEC.2 — Redis key namespace (`rl` default); the deploy binds `rl:signup` / `rl:auth`. */
  readonly keyPrefix?: string;
}

export function createIpEmailThrottle(opts: IpEmailThrottleOptions): IpEmailThrottle {
  const now = opts.now ?? Date.now;
  // key → { windowStart, count }; a key's window starts at its first hit after expiry.
  const windows = new Map<string, { start: number; count: number }>();

  function hit(key: string): { allowed: boolean; retryAfterSec?: number } {
    const t = now();
    let w = windows.get(key);
    if (!w || t - w.start >= opts.windowMs) {
      w = { start: t, count: 0 };
      windows.set(key, w);
    }
    w.count += 1;
    // Cheap sweep: windows are only created on hit, so the map can only grow with real traffic; evict the
    // expired entries on a bounded cadence to bound memory on a hot route.
    if (windows.size > 10_000) {
      for (const [k, v] of windows) if (t - v.start >= opts.windowMs) windows.delete(k);
    }
    const max = key.startsWith("ip:") ? opts.perIp : opts.perEmail;
    if (w.count > max) {
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((w.start + opts.windowMs - t) / 1000)) };
    }
    return { allowed: true };
  }

  return {
    async attempt(ip, email) {
      const ipHit = hit(`ip:${ip.trim() || "unknown"}`);
      if (!email) return ipHit;
      const emHit = hit(`em:${email.trim().toLowerCase()}`);
      // Either dimension over → blocked; the retry hint is the SOONER-resetting blocking window.
      if (!ipHit.allowed && !emHit.allowed)
        return { allowed: false, retryAfterSec: Math.min(ipHit.retryAfterSec!, emHit.retryAfterSec!) };
      if (!ipHit.allowed) return ipHit;
      return emHit;
    },
  };
}

// ---------------------------------------------------------------- shared store (SEC.2, ADR-039)

/**
 * The counter seam a shared throttle counts through. ONE round-trip-shaped operation: atomically
 * increment `key` and — when this increment created the key — set its TTL to `windowMs` (an anchored
 * fixed window, the same semantics the in-memory impl uses). Returns the post-increment count and the
 * remaining TTL. Implementations THROW on backend failure; the caller's degraded policy owns fallback.
 * `key` arrives already hashed (the throttle hashes identifiers — keys never carry a raw IP/email,
 * invariant #10).
 */
export interface ThrottleStore {
  incrWithTtl(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }>;
}

/**
 * The deterministic in-process `ThrottleStore` — the "shared-store fake" the spec calls for when no
 * Redis is configured in the test env. Two throttle instances over ONE MemoryThrottleStore share the
 * count, exactly like two Cloud Run instances over one Redis; handing each its own store reproduces
 * the pre-SEC.2 per-instance hole (the test that fails when the shared store is removed).
 */
export function createMemoryThrottleStore(now: () => number = Date.now): ThrottleStore {
  const keys = new Map<string, { count: number; expiresAt: number }>();
  return {
    async incrWithTtl(key, windowMs) {
      const t = now();
      let k = keys.get(key);
      if (!k || k.expiresAt <= t) {
        k = { count: 0, expiresAt: t + windowMs };
        keys.set(key, k);
      }
      k.count += 1;
      return { count: k.count, ttlMs: Math.max(0, k.expiresAt - t) };
    },
  };
}

/**
 * A Redis `ThrottleStore` (INCR + PEXPIRE + PTTL as one EVAL — atomic, one round trip, and the
 * conditional-expire closes the crash-between-INCR-and-PEXPIRE forever-key hole). The client seam is
 * ioredis-shaped (`eval(script, numKeys, key, arg)`) but structural — the api binds the real client.
 */
export interface RedisEvalClient {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

const INCR_WINDOW_LUA = `local n = redis.call("INCR", KEYS[1])
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {n, ttl}`;

export function createRedisThrottleStore(client: RedisEvalClient): ThrottleStore {
  return {
    async incrWithTtl(key, windowMs) {
      const res = (await client.eval(INCR_WINDOW_LUA, 1, key, windowMs)) as [number, number];
      return { count: Number(res[0]), ttlMs: Number(res[1]) };
    },
  };
}

/** sha256(ip|normalized-email), truncated — throttle keys carry no raw identifiers (invariant #10). */
function keyFor(prefix: string, dim: "ip" | "em", value: string): string {
  const id = dim === "em" ? value.trim().toLowerCase() : value;
  return `${prefix}:${dim}:${sha256Hex(id).slice(0, 24)}`;
}

/**
 * The shared-store throttle: same dual-dimension fixed-window verdicts as `createIpEmailThrottle`,
 * counted through `store`. Keys are `keyPrefix:ip|em:sha256(id)` so the underlying store never sees a
 * raw identifier. Backend failures PROPAGATE — wrap with `createFallbackIpEmailThrottle` at the
 * composition boundary.
 */
export function createSharedIpEmailThrottle(
  store: ThrottleStore,
  opts: IpEmailThrottleOptions,
): IpEmailThrottle {
  const prefix = opts.keyPrefix ?? "rl";
  async function hit(dim: "ip" | "em", id: string): Promise<ThrottleVerdict> {
    const { count, ttlMs } = await store.incrWithTtl(keyFor(prefix, dim, id), opts.windowMs);
    const max = dim === "ip" ? opts.perIp : opts.perEmail;
    if (count > max) return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(ttlMs / 1000)) };
    return { allowed: true };
  }
  return {
    async attempt(ip, email) {
      const ipHit = await hit("ip", ip.trim() || "unknown");
      if (!email) return ipHit;
      const emHit = await hit("em", email);
      if (!ipHit.allowed && !emHit.allowed)
        return { allowed: false, retryAfterSec: Math.min(ipHit.retryAfterSec!, emHit.retryAfterSec!) };
      if (!ipHit.allowed) return ipHit;
      return emHit;
    },
  };
}

/**
 * ADR-039 — the Redis-failure posture, expressed in code: try the shared counter; on ANY backend
 * failure fall back to `fallback` (a per-instance in-memory limiter over the same options) — degraded
 * per-instance limits, NEVER unlimited and NEVER fail-closed. `onDegraded` fires at most once per
 * process (the "log once per instance" rule — the line carries no email/IP, just the failure kind);
 * the fallback persists for the instance's life once tripped (flapping back and forth would let a
 * shaky backend reset the in-memory window repeatedly).
 */
export function createFallbackIpEmailThrottle(
  shared: IpEmailThrottle,
  fallback: IpEmailThrottle,
  opts: { onDegraded?: (err: unknown) => void } = {},
): IpEmailThrottle {
  let degraded = false;
  return {
    async attempt(ip, email) {
      if (degraded) return fallback.attempt(ip, email);
      try {
        return await shared.attempt(ip, email);
      } catch (err) {
        degraded = true;
        opts.onDegraded?.(err);
        return fallback.attempt(ip, email);
      }
    },
  };
}

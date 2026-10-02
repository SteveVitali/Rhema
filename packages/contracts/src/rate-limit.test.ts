import { describe, it, expect, vi } from "vitest";
import {
  createFallbackIpEmailThrottle,
  createIpEmailThrottle,
  createMemoryThrottleStore,
  createRedisThrottleStore,
  createSharedIpEmailThrottle,
  type RedisEvalClient,
  type ThrottleStore,
} from "./rate-limit.js";

// SEC.2 (REQ-GROWTH-15 throttle half; D-PRB.13-1; ADR-039) — the shared-store throttle: two throttle
// instances over ONE store must count together (the Cloud-Run-instances case); the in-memory impl is
// kept for tests + the degraded path; a store failure degrades to per-instance limits — never
// unlimited, never fail-closed — and the degradation logs ONCE per process.

describe("createSharedIpEmailThrottle over one shared store (AC — cross-instance counting)", () => {
  it("two throttle instances over ONE store trip at perIp+1 COMBINED attempts", async () => {
    let t = 0;
    const store = createMemoryThrottleStore(() => t);
    const opts = { perIp: 2, perEmail: 1, windowMs: 60_000 };
    const instanceA = createSharedIpEmailThrottle(store, opts);
    const instanceB = createSharedIpEmailThrottle(store, opts);
    expect((await instanceA.attempt("9.9.9.9")).allowed).toBe(true); // count 1 on A
    expect((await instanceB.attempt("9.9.9.9")).allowed).toBe(true); // count 2 on B — SHARED
    const third = await instanceA.attempt("9.9.9.9"); // count 3 — over the limit
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSec).toBe(60);
    // the email dimension shares too (perEmail 1: the second attempt under the same email — counted
    // through the SAME store from a different instance+IP — is the one that trips).
    expect((await instanceA.attempt("8.8.8.8", "v@x.test")).allowed).toBe(true);
    const emailBlocked = await instanceB.attempt("7.7.7.7", "v@x.test");
    expect(emailBlocked.allowed).toBe(false);
    // a different IP is unaffected, and the window resets on schedule.
    expect((await instanceA.attempt("5.5.5.5")).allowed).toBe(true);
    t += 61_000;
    expect((await instanceB.attempt("9.9.9.9")).allowed).toBe(true);
  });

  it("removing the shared store reproduces the per-instance hole (the witness the spec demands)", async () => {
    const opts = { perIp: 2, perEmail: 10, windowMs: 60_000 };
    // Each instance with its OWN store — the pre-SEC.2 topology: perIp+1 combined does NOT trip.
    const instanceA = createSharedIpEmailThrottle(createMemoryThrottleStore(), opts);
    const instanceB = createSharedIpEmailThrottle(createMemoryThrottleStore(), opts);
    await instanceA.attempt("9.9.9.9"); // A sees count 1
    await instanceB.attempt("9.9.9.9"); // B sees count 1 (never saw A's)
    // THE HOLE: the third COMBINED attempt goes to A, which has only counted its own two — under
    // per-instance limits it is ALLOWED (the shared-store test above blocks this same call).
    expect((await instanceA.attempt("9.9.9.9")).allowed).toBe(true);
  });

  it("throttle keys carry hashed identifiers, never the raw IP or email (invariant #10)", async () => {
    const seen: string[] = [];
    const spy: ThrottleStore = {
      incrWithTtl: async (key) => {
        seen.push(key);
        return { count: 1, ttlMs: 60_000 };
      },
    };
    const th = createSharedIpEmailThrottle(spy, { perIp: 10, perEmail: 10, windowMs: 60_000, keyPrefix: "rl:signup" });
    await th.attempt("203.0.113.7", "Person@Example.Org");
    expect(seen).toHaveLength(2);
    for (const key of seen) {
      expect(key).toMatch(/^rl:signup:(ip|em):[0-9a-f]{24}$/);
      expect(key).not.toContain("203.0.113.7");
      expect(key.toLowerCase()).not.toContain("person@example.org");
    }
    // the email dimension normalizes case before hashing (A@B.com and a@b.com share a key) — same
    // prefix, so the comparison is the hash alone.
    const th2 = createSharedIpEmailThrottle(spy, { perIp: 10, perEmail: 10, windowMs: 60_000, keyPrefix: "rl:signup" });
    await th2.attempt("1.1.1.1", "PERSON@example.org");
    expect(seen[3]).toBe(seen[1]);
  });
});

describe("createRedisThrottleStore (the ioredis binding — INCR + PEXPIRE + PTTL in one EVAL)", () => {
  it("issues the atomic Lua script and maps [count, ttl] to the verdict fields", async () => {
    const calls: string[] = [];
    const client: RedisEvalClient = {
      eval: async (script, numKeys, ...args) => {
        calls.push(`${numKeys}:${args.join(",")}`);
        expect(script).toContain("INCR");
        expect(script).toContain("PEXPIRE");
        return [3, 59_000];
      },
    };
    const th = createSharedIpEmailThrottle(createRedisThrottleStore(client), {
      perIp: 2, perEmail: 10, windowMs: 60_000, keyPrefix: "rl:test",
    });
    const v = await th.attempt("9.9.9.9");
    expect(v).toEqual({ allowed: false, retryAfterSec: 59 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^1:rl:test:ip:[0-9a-f]{24},60000$/);
  });
});

describe("createFallbackIpEmailThrottle (ADR-039 — the Redis-outage posture)", () => {
  it("a store failure degrades to per-instance limits, logs ONCE, and the log sees no email/IP", async () => {
    const onDegraded = vi.fn();
    const failing: ThrottleStore = {
      incrWithTtl: async () => {
        throw new Error("ECONNREFUSED redis");
      },
    };
    const shared = createSharedIpEmailThrottle(failing, { perIp: 2, perEmail: 2, windowMs: 60_000 });
    const local = createIpEmailThrottle({ perIp: 2, perEmail: 2, windowMs: 60_000 });
    const th = createFallbackIpEmailThrottle(shared, local, { onDegraded });
    // the outage trip itself still enforces the local limit — never unlimited, never fail-closed.
    expect((await th.attempt("9.9.9.9", "a@b.com")).allowed).toBe(true);
    expect((await th.attempt("9.9.9.9", "a@b.com")).allowed).toBe(true);
    expect((await th.attempt("9.9.9.9", "a@b.com")).allowed).toBe(false); // local per-instance limit
    expect(onDegraded).toHaveBeenCalledTimes(1); // once per instance, not once per request
    const err = onDegraded.mock.calls[0]![0];
    // the signal carries the failure KIND only — no identifiers the call site could leak upstream.
    expect(String(err)).toBe("Error: ECONNREFUSED redis");
    expect(String(err)).not.toContain("9.9.9.9");
    expect(String(err)).not.toContain("a@b.com");
  });

  it("degradation is sticky: a recovering backend does not reset the in-memory window mid-outage", async () => {
    let fail = true;
    const flap: ThrottleStore = {
      incrWithTtl: async () => {
        if (fail) throw new Error("down");
        return { count: 1, ttlMs: 60_000 };
      },
    };
    const shared = createSharedIpEmailThrottle(flap, { perIp: 1, perEmail: 10, windowMs: 60_000 });
    const local = createIpEmailThrottle({ perIp: 1, perEmail: 10, windowMs: 60_000 });
    const th = createFallbackIpEmailThrottle(shared, local);
    expect((await th.attempt("9.9.9.9")).allowed).toBe(true); // degraded → local count 1
    fail = false; // backend recovers mid-window
    expect((await th.attempt("9.9.9.9")).allowed).toBe(false); // still local — sticky, not flap-reset
  });
});

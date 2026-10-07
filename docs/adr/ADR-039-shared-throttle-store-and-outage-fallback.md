# ADR-039: The signup/magic-link throttle counts in one shared Redis store; an outage degrades to a finite per-instance limiter — never unlimited, never fail-closed

- **Status:** Accepted
- **Date:** 2026-10-02
- **Ticket:** SEC.2 (signup admission on every path + a throttle shared across instances)
- **Requirement ids:** REQ-GROWTH-15 (primary — the throttle half), REQ-BETA-19, REQ-BETA-14,
  REQ-ARCH-30
- **Spec:** §13.3 (abuse posture), §15.3 (the admission surface)
- **Supersedes:** ADR-009's "fixed-window per-instance" clause — the per-instance trade is no longer
  accepted; the rest of ADR-009 stands (api-owned admission, the link as verification, fail-closed
  mode flag, the returning-account bypass)
- **Consumes:** D-PRB.13-1 (the shared/multi-instance store owed since PRB.13)

## Context

`createIpEmailThrottle` was deliberately in-memory per-instance (ADR-009): N Cloud Run instances ⇒
an attacker who rotates instance affinity gets N× the window. SEC.2 requires the count to be shared,
which forces `IpEmailThrottle.attempt` async (a network counter) through every call-site and test —
the exact ripple STB.2's deferral note predicted.

The harder owned decision is **what happens when Redis is down**. Two wrong postures: fail-open
(a Redis blip = an unthrottled signup window, silently worse than per-instance) and fail-closed
(a Redis blip = nobody can sign up — the throttle becomes a self-inflicted outage on a path with no
abuse benefit to closing).

## Decision

- **`IpEmailThrottle.attempt` is async** and a `ThrottleStore` seam sits under it:
  `incrWithTtl(key, windowMs) → {count, ttlMs}` — one atomic `EVAL` (INCR + conditional PEXPIRE +
  PTTL) over SHA-256-hashed keys (`rl:signup:` / `rl:magiclink:` prefixes). Key material never
  carries a raw IP or email (invariant #10).
- **Four implementations:** `createIpEmailThrottle` (in-memory — kept for tests and as the degraded
  backend), `createSharedIpEmailThrottle` (over any `ThrottleStore`), `createMemoryThrottleStore`
  (deterministic shared-store fake — the tests' stand-in), `createRedisThrottleStore` (ioredis,
  lives in `apps/api` — contracts stays dependency-free).
- **Outage posture: degrade, don't close.** `createFallbackIpEmailThrottle` wraps shared-over-local:
  a store error switches to the in-process limiter (same limits, same `429 + Retry-After` shape) and
  **logs once per process** with only the error kind — never an email/IP. The degraded state is
  sticky for the instance's life — flapping back mid-outage would let a shaky backend reset the
  in-memory window repeatedly; a new instance/revision re-tries shared counting from a clean slate.
  A throttle outage therefore means per-instance
  counting — ADR-009's old beta trade as the floor, never unlimited and never a signup outage.
- **The two dimensions keep their existing numbers:** account creation 10/IP + 5/email (1h,
  `rl:signup`); the send guard 20/IP + 4/email (1h, `rl:magiclink` — ADR-041).

## Consequences

- **Positive:** the per-instance multiplication hole closes — two instances over one store trip at
  `perIp+1` combined (tested, with the "removing the shared store" witness). The outage story is a
  degradation, not an outage of its own, and it's log-observable exactly once per process.
- **Negative / accepted:** `attempt` being async rippled through `admitSignup`, both Better Auth
  hooks, and every test — the cost D-PRB.13-1 predicted. Redis becomes a soft dependency of the
  signup path (a sustained outage quietly costs the shared-count property until recovery). Better
  Auth's own in-memory plugin limiter still runs underneath — defense-in-depth, not the authority.

## Alternatives considered

| Option | Why it lost |
|---|---|
| Fail closed on Redis error | Turns a cache blip into a signup outage; the abuse risk of a brief per-instance window is strictly smaller than a hard refusal of every legitimate signup. |
| Fail open on Redis error | A Redis blip silently removes throttling entirely — strictly worse than the old per-instance posture we're replacing. |
| Postgres/AlloyDB counters instead of Redis | The hot path is a counter bump; Redis is already provisioned (`rhema:redisUrl` shared api+worker+web) and atomic Lua gives us INCR+PEXPIRE+PTTL in one round-trip. A SQL upsert adds write load + lock contention to the user-serving pool for no property Redis lacks. |
| Better Auth's built-in limiter as the authority | In-memory per-instance (the exact defect), keyed on the first XFF hop (caller-controlled — see ADR-040), and 5/60s only on the magic-link endpoints — it stays on as a second layer but can never be the counted authority. |

## Revisit trigger

Reopen if Memorystore becomes a measured availability risk to signup (fallback flapping in
telemetry), or if beta abuse economics justify a stronger mechanism (CAPTCHA vendor, risk scoring —
the deliberate ADR-009 non-goals).

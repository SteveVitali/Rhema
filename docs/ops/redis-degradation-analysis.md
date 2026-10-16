# Redis degradation analysis (REQ-COST-4 — COST.1, 2026-10-16)

> Scope: the Memorystore BASIC M1 1 GiB instance on prod — **$35.77/mo**, the second-largest
> single line after the Cloud Run warm floor (`billing-read.mjs` recompute 2026-10-16). This
> is the degradation analysis REQ-COST-4 gates ANY Redis tier/removal lever on (D1-F4/F5:
> "Redis changes gated on degradation analysis of all three consumers — the last has no
> fallback"). Verdict up front: **removal is a design change, not a lever** — it is PAUSED
> out-of-class under the H9 ruling and carried as `D-COST.1-3`. This document is the
> analysis the paused ruling will read.

## Live inventory (verified 2026-10-16, $0 reads)

- `rhema-prod-redis` — Memorystore Redis **BASIC M1**, `memorySizeGb=1`, private-IP,
  shared by **api + worker** via the one `rhema:redisUrl` secret config (`compute.ts` env
  wiring: `REDIS_URL` on api and worker; collab and web carry none — D1-F4's "web has NO
  Redis" confirmed against the service env list).
- BASIC tier = single node, no replica, no SLA. STANDARD_HA (+$35.77 → ~$71.54/mo) is an
  HA lever — cost-INCREASING, contrary to ruling-(a), paused with the HA set.

## Consumer census (code-verified)

### 1. Signup / magic-link / OAuth throttles — api — **fallback exists (ADR-039)**

`apps/api/src/server.ts` — `createRedisThrottleStore(redis)` wrapped in
`createFallbackIpEmailThrottle`: one shared bucket per (ip|email) across ALL api instances
via an atomic `INCR`+`PEXPIRE` Lua — no check-then-set race. On Redis outage the store
degrades to a **per-instance** map for the rest of the process — never unlimited, never
fail-closed on signup — and logs once with the error kind only.

**Degradation on removal:** the cross-instance guarantee disappears permanently. Under the
post-COST.1 posture (min=0, typically ≤1 instance under real load) the per-instance map is
*near-equivalent* today; it silently weakens the moment api ever runs >1 warm instance —
the throttle each attacker IP sees divides by instance count. Removal-safe? **Mostly** —
the fallback is designed for outage, not removal; the honest replacement is a DB-backed
bucket (the throttle rows are tiny) or accepting the documented weaker bound.

### 2. SSE run-event fan-out — api + worker — **fallback exists (re-poll)**

`packages/live-clients/src/event-bus.ts` — `RedisRunEventBus` pub/sub: the worker publishes
run-event flushes, api subscribers fan them into `/runs/:id/events` tails. The tail already
carries a **safety re-poll** (the bus is an accelerator over the Postgres event chain, not
the source of truth — malformed/non-numeric messages are ignored and the re-poll heals).

**Degradation on removal:** every tail reverts to poll-only — `event_delivery_latency`
samples (the §13.5 `event_delivery_latency_p95_s` ≤ 2 s SLO) climb toward the poll period,
plus real DB load per open tail. Removal-safe? **Functionally yes, SLO-risky** — the probe
would honestly read the regression; D-SLO.1-6's terminal-batch delivery tail (2.2 s,
already near the alert line) would breach the 5 s alert on a multi-second poll cadence.
Any removal needs the poll cadence + delivery-latency budget re-derived first.

### 3. `RedisHeartbeatStore` — the `run.reap` orphan sweep — **NO FALLBACK (the blocker)**

`packages/live-clients/src/heartbeat.ts` `RedisHeartbeatStore` — liveness stamps the api
(`server.ts:283`) and worker (`main.ts:352`) write for running executions; the worker's
`run.reap` sweep reads them to decide a run's pod died. There is **no alternative store**:
removing Redis leaves the reaper blind → a pod that dies mid-run stays `running` forever →
the run's concurrency slot and entitlement hold never release → stuck-run stalls
(D-P0.08-4's flat-concurrency finding makes this a queue-wedge, not a display bug).

**Degradation on removal:** **fatal — no degrade path exists.** Removal requires a
DB-backed heartbeat first (a `run_heartbeats` table or `run_events`-derived liveness —
the worker heartbeats every N s, a `stale_after` sweep reads the max timestamp; modest
write load, all inside the existing system DSN). That is design work: a heartbeat write
every few seconds per active run is fine on `db-g1-small`, but the sweep's stale-window
semantics (reap threshold vs clock skew) need the same care the Redis TTL gave.

### 4. `import_preview` first-seen clock — api — **fails soft, lies downward**

`packages/live-clients/src/ingest.ts` `createImportPreviewTracker` — `SET rhema:ipr:<key>
NX EX 900` durable presign→preview-ready first-seen stamps across api instances and the
pending-poll hops; errors degrade to `null` → the caller falls back to **in-request
elapsed**.

**Degradation on removal:** the `import_preview_ms` samples feeding `import_preview_p95_s`
lose the presign→first-preview leg and read only the last poll hop — the SLO instrument
**understates** latency silently (a failure mode worse than `empty`: green-looking data
measuring the wrong window). Removal-safe? **No** — needs the stamp re-homed (a column on
the upload/quarantine record or a `pending_imports` row — cheap, but design work again).

## Tier question (BASIC → anything cheaper)

There is no cheaper Memorystore tier than BASIC M1 — the floor is already the floor. The
only downward moves are **removal** (design change above) or **self-hosted Redis on an
existing always-on surface** (e.g. a container on the GKE node — operational burden, new
persistence/HA questions, saves at most the $35.77 and inherits all four degradations on
failure). Both out-of-class.

## Verdict

| Consumer | Fallback today | Removal-safe? |
|---|---|---|
| Signup/magic-link/OAuth throttles | ADR-039 per-instance map | mostly — weaker bound when >1 api instance |
| SSE run-event fan-out | safety re-poll | functionally — `event_delivery` SLO at risk |
| `RedisHeartbeatStore` (`run.reap`) | **none** | **no — reaper blind; queue-wedge risk** |
| `import_preview` first-seen clock | fails soft to in-request elapsed | no — SLO instrument lies downward |

**Redis removal is a design change** (D1-F4 ratified): the heartbeat store needs a
DB-backed replacement and the first-seen clock needs a new home before the $35.77 is
removable. Carried paused as `D-COST.1-3` — the honest next step is a consolidation design
(DB-backed heartbeats + quarantine-row first-seen + DB throttle buckets), which is exactly
the ruling-(a) "consolidation moves" conversation for the operator.

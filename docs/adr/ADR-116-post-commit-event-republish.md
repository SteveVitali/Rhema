# ADR-116: Post-commit event republish — run-end paths re-publish the committed high-water seq

- **Status:** Accepted
- **Date:** 2026-10-21
- **Ticket:** R6ENG.2
- **Requirement ids:** REQ-ENG-2
- **Spec:** `docs/tickets/177_R6ENG.2__sse-finalize-wakeup.md`; spec §4.1 `REQ-ENG-2`,
  §12.5 (the fan-out bus is a wakeup only — Postgres is the source of truth);
  DEFERRALS row `D-SLO.1-6` (the deferred live re-read, `REQ-POST-8`/R6POST.1)

## Context

`SqlEventWriter.append` publishes the run's new high-water seq to the fan-out bus
**inside the caller's uncommitted transaction** (`event-store.ts`). A woken SSE tail
(`streamRunEvents`, `event-stream.ts`) pumps immediately, reads only committed rows,
sees nothing, and goes back to sleep. Mid-run batches are masked because the next
append's wakeup re-reads and catches the previous batch (measured p50 34 ms). A
terminal batch has no next publish, so the run's last events ride the 10 s
`pollIntervalMs` safety poll — the six ~2.2 s outliers that pushed live
event-delivery p95 to 2,238 ms against the ≤2,000 ms target (`D-SLO.1-6`).

The constraint that shaped the decision: the publish seam is a *wakeup*, not a
transport — the payload is only `(runId, seq)` and every consumer re-reads Postgres.
A wakeup for seq *n* is therefore always safe to fire *later* than intended; it is
never safe to fire for rows that were rolled back, and a wakeup that fires *before*
its rows commit is wasted work.

## Decision

Keep the in-transaction publish (it remains a correct, if occasionally wasted,
best-effort wakeup), and add a **post-commit republish** on every run-end path:
after the terminal commit resolves, `publishCommittedEventHighWater`
(`event-store.ts`) re-reads the run's committed `run_event_seq.seq` in a fresh
tenant transaction and re-publishes it through a new optional
`OrchestratorDeps.eventPublisher` seam, bound to the same `RedisRunEventBus` the
writer already publishes on (`apps/api/src/server.ts`,
`apps/worker/src/main.ts`).

Call sites — every path that can land a run's terminal transition plus its event
batch: `finalizeRun`, `failRun`, `failStep`'s terminal leg (`internal-api.ts`),
`deliverRun` committed-delivery arm (`delivery.ts`), `cancelRun` (`cancel.ts`),
`resolveGate`'s terminal `stop` (`gate-resolution.ts`), `handleGateExpiry`'s
cancel/accept_partial arm (`gate-expiry.ts`), `reap`'s cancelling→cancelled leg
(`reaper.ts`), `sweepStrandedRuns` leg A (`stranded-sweep.ts`), `provision`'s
launch-failed edge (`provision.ts`), and the worker's `handleRunCancel` /
`completeCancellation` (`apps/worker/src/run-jobs.ts`). The republish is best-effort:
it swallows every failure, and when `eventPublisher` is unbound it is a no-op —
the safety re-poll stays the backstop exactly as before.

## Consequences

- Terminal batches now wake attached tails at publish→flush latency (tens of ms)
  instead of up-to-10 s poll latency; the `D-SLO.1-6` p95 target becomes reachable.
  The live re-read proving it is `REQ-POST-8`/R6POST.1 (recipe in the R6ENG.2 run
  ledger).
- A terminal commit can fire several publishes (one per appended event, in-tx, plus
  one republish). Duplicate/late wakeups are already safe — the pump dedupes by seq
  and emits exactly once.
- One extra `run_event_seq` read per terminalized run — trivially cheap, tenant-scoped.
- Run-end paths stay correct under a missing or degraded bus: no new failure mode is
  introduced anywhere a `Result`/`throw` would propagate.
- The pre-commit publish was deliberately *not* removed: removing it would slow
  mid-run batches to poll latency whenever the post-commit seam is unbound
  (tests, admin tooling, a bus-less deploy).

## Alternatives considered

- **Defer the publish itself to after commit** (collect events in-tx, publish at
  commit). Cleaner conceptually, but `append` is called deep inside caller-owned
  transactions on `SqlClient` — there is no commit boundary visible to it, so every
  callsite would need a deferred-work channel anyway; the republish achieves the same
  guarantee at the existing post-commit points with no change to `append` semantics.
- **Postgres `LISTEN/NOTIFY` or a logical-decoding tailer.** Correct timing for
  free, but a new infrastructure dependency and a second wakeup plane to keep
  tenant-safe; out of proportion for a 10 s→50 ms latency fix.
- **Shorten `pollIntervalMs`.** Papering over the race, not fixing it — and a
  faster poll multiplies Postgres reads for every attached tail.

## Revisit trigger

Reopen if the live `REQ-POST-8` re-read shows terminal-batch delivery still ≥2 s
with the wakeup bound (⇒ the wakeup plane itself is the bottleneck, argue for
LISTEN/NOTIFY), or if `append` ever moves to an async/deferred flush where the
republish's high-water read could race a still-pending batch.

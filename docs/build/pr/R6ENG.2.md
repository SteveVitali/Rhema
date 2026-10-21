# R6ENG.2 — SSE finalize-path post-commit wakeup (REQ-ENG-2)

Stacked on `stevevitali/r6ci-1-ci-cost-phase-1` · `mergePolicy: OPERATOR` —
**do not merge; the operator merges the chain bottom-up.** Offline-only ticket;
$0; no live stage; zero prod contact. `implement-spec
spec=docs/tickets/177_R6ENG.2__sse-finalize-wakeup.md` — manifest row 177,
depends on 176a_R6CI.1.

**Requirement ids stamped:** REQ-ENG-2

## What

Closes the publish/commit race at run end (`D-SLO.1-6`): `SqlEventWriter.append`
publishes the run's high-water seq **inside the caller's uncommitted transaction**;
a woken SSE tail pumps, reads only committed rows, sees nothing, and — when that
batch was the run's LAST — rides the 10 s `pollIntervalMs` safety poll (the six
~2.2 s terminal flushes that pushed live event-delivery p95 to **2,238 ms** against
the ≤2,000 ms target; all other 80 tail samples ≤110 ms, p50 34 ms — mid-run
batches are masked because a later append's wakeup re-reads them).

The fix (ADR-116): keep the in-tx publish (still a correct, occasionally wasted,
best-effort wakeup) and add a **post-commit republish** — after every run-end
terminal commit resolves, `publishCommittedEventHighWater`
(`packages/orchestrator/src/event-store.ts`) re-reads the committed
`run_event_seq.seq` in a fresh tenant transaction and re-publishes it through the
new optional `OrchestratorDeps.eventPublisher` seam, bound to the same
`RedisRunEventBus` at `apps/api/src/server.ts` and `apps/worker/src/main.ts`.
Unbound ⇒ no-op; every failure swallowed — the safety re-poll stays the backstop
exactly as before (the bus is a wakeup only; Postgres remains the source of truth).

## Call sites — every run-end terminal commit

`finalizeRun` · `failRun` · `failStep` terminal leg · `deliverRun`
committed-delivery arm (the completed-run path D-SLO.1-6 measured) · `cancelRun` ·
`resolveGate` terminal `stop` · `handleGateExpiry` cancel/accept_partial · `reap`
cancelling→cancelled · `sweepStrandedRuns` leg A provisioning→failed ·
`provision` launch-failed · worker `handleRunCancel` / `completeCancellation`.
Audited against every `applyTransition` callsite that can reach a terminal state.

## Deterministic test evidence (`finalize-wakeup.test.ts`, 15 cases)

The race pin is a commit-boundary probe: every `publish` records whether a
transaction was still in flight. **Pre-fix: 12/15 failed — zero post-commit
publishes.** Post-fix: all green.

- Each of the 10 terminal paths republishes the committed `run_event_seq` high-water
  exactly once, **after** its commit, as the run's last publish.
- End-to-end attribution: with the in-tx wakeup modelled LOST (the prod race — the
  early pump finds no committed rows) and `pollIntervalMs` disabled, an attached
  tail still receives the terminal batch (`run.state_changed` + `cost.final`) —
  delivery can only have come via the post-commit wakeup. With the seam unbound
  (the pre-fix shape), no wakeup ever reaches the bus and the same batch arrives
  only on the safety poll — the verbatim D-SLO.1-6 shape.
- Rollback safety: a rolled-back terminal commit publishes no post-commit wakeup.
- Best-effort: a throwing publisher never breaks `finalizeRun`; an unbound seam is
  a no-op; the republished seq equals the committed `run_event_seq.seq`.

## Regression

Focused + scoped suites: **99 test files / 1,156 tests, 0 failures** across
`packages/orchestrator`, `apps/api`, `apps/worker` — incl. the SSE replay/tail
suites (`event-stream.test.ts`, `sse-routes.test.ts` — Last-Event-ID, exactly-once,
density caps, internal-event isolation), `event-store.test.ts`, and every touched
lifecycle suite. `pnpm turbo build lint typecheck` 135/135; all six `check:*`
scripts green. Event payloads unchanged — no prompt/private text on any surface
(cross-cutting invariant 10); the wakeup carries only `(runId, seq)`.

## ADRs

- **ADR-116** — Post-commit event republish: run-end paths re-publish the committed
  high-water seq. (Rejected: deferring the in-tx publish — `append` has no commit
  boundary; Postgres LISTEN/NOTIFY — new infra plane; shortening the poll —
  papers over the race.)

## Deferrals delta

- `D-SLO.1-6` — **stays OPEN**, dated note appended: the code lever landed; the
  live `slo_samples{signal:'event_delivery_ms', detail:'tail'}` p95 re-read rides
  the next deploy's `REQ-POST-8` leg (R6POST.1). Recipe committed in
  `docs/build/runs/R6ENG.2.md`.

## REQ-POST-8 live re-read recipe (for R6POST.1)

After the deploy carrying this fix, over a ≥50-sample post-deploy window:
`percentile_cont(0.95)` over `slo_samples{signal:'event_delivery_ms',
detail:'tail'}` must read ≤2,000 ms; every per-run terminal-event sample <2 s; a
wakeup-delivered terminal flush reads ≈publish→flush latency (tens of ms), never
~`pollIntervalMs`. Green ⇒ flip `D-SLO.1-6` DONE with the measured p95; red ⇒
OPEN with the measured gap + next lever (never a moved target without an
operator-approved ADR).

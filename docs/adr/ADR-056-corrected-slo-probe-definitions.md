# ADR-056: §13.5 probes measure the signal's own quantity — event-paired episodes, live-tail samples, per-attempt cross-checks; no target changed

- **Status:** Accepted
- **Date:** 2026-10-03
- **Ticket:** SLO.1
- **Requirement ids:** REQ-ARCH-34, REQ-SPEC-29, REQ-SPEC-31, REQ-DATA-16
- **Spec:** §13.5, §12.5, §12.7

## Context

STB.3's live SLO findings showed several §13.5 probes measuring a *different* quantity than the
signal's name promised — so the alerts and the weekly review read fabricated numbers:

- **Run start** read `runs.started_at − runs.created_at`. `started_at` is overwritten on every
  `provisioning → running` heartbeat (internal-api.ts), so a run that parked at a gate for a day and
  resumed in 30 s measured ~1 day of "start latency" — gate waits and resume delay folded into launch.
- **Gate resume** read `gates.resolved_at − gates.opened_at` — the human's decision time, not the
  decision→running relaunch the SLO budgets.
- **Event delivery** sampled every SSE pump batch: connect backlogs and `Last-Event-ID` replays
  carried append→flush deltas of minutes-to-days and landed beside ~sub-second live-tail samples in
  the same p95.
- **Autosave** sampled only the legacy HTTP save route; the Page's real save path (collab
  `onStoreDocument → storeDocument`) produced no samples at all — and `rhema_collab` held no
  `slo_samples` grant to write them (migration 0054 adds it).
- **Mirror errors** counted every `engine.error` internal row — a phase-failure record (retried
  artifact hiccups, cap-402s) whose terminal instances already count in `run_success_rate_24h_pct`.
  The unexplained "1" on the 2026-09-30 reading was exactly this.
- **Success rate** did not implement §13.5's denominator: user-side cancels (`stop`, `declined`,
  `expired`, `cancel_to_edit`) must leave the fraction; system/reasonless cancels stay in it; an
  Unverified delivery stays in the denominator but leaves the numerator.
- **Proxy-vs-SDK** grouped `usage_records` by run only, mixing a relaunch's proxy burn with the prior
  attempt's SDK rows (prod showed the artifacts: provisional `sdk_stream` burn and attempt mixing).

## Decision

Redefine the probes to measure each signal's own quantity — **no §13.5 target, threshold, or alert
window changes**:

- **Run start**: per-episode `run.state_changed` pairing — each `to='running'` event joins its own
  latest preceding `to='queued'` event. First starts, gate resumes, and reaper requeues each measure
  their own enqueue→heartbeat episode.
- **Gate resume**: each resolved *blocking* gate pairs `resolved_at` → the next `to='running'` event
  at/after it. Resolutions that end the run (stop/finalize) pair to nothing and drop out.
- **Event delivery**: `RunEventStreamer` suppresses `onFlush` for the initial catch-up pass entirely
  (connect backlog and `Last-Event-ID` replay alike — those events were written while no client was
  attached, so the delta measures the gap, not delivery); the SSE route tags live-tail samples
  `slo_samples.detail='tail'` and the probe requires it, so pre-SLO.1 unmarked rows can never be read
  as live delivery.
- **Autosave**: the collab store path samples `autosave_save_ms` `detail='collab'` on every real
  (unlocked) store; the HTTP route tags `detail='http'`. Both paths read into one p95.
- **Mirror errors**: `run.state_changed{to:'failed', reason:'validation'}` (delivery-transaction
  rejects) + `boundary.violation` internal events. `engine.error` is out — its terminal instances are
  already counted by the success rate.
- **Success rate**: `completed + failed + system-cancelled` over the window; the user-side cancel
  reasons are enumerated and anything else (including no reason row) stays in the denominator;
  `delivery.label='unverified'` completions leave the numerator; test tenants excluded throughout.
- **Proxy-vs-SDK**: compare `proxy` ↔ `sdk_estimate` per `(run_id, attempt)` — like-for-like lists
  price on both sides; one-sided attempts (a crash before harvest) are skipped rather than
  misattributed.

## Consequences

- Numbers move — mostly *down* to their true values (a resumed run no longer reports a day of "start
  latency"; replay no longer inflates the delivery p95), and the success rate stops punishing the
  platform for user cancels while gaining honest system-cancel coverage.
- Old `slo_samples` rows without `detail='tail'` are permanently excluded from the delivery probe —
  intended: replay-era rows cannot be told apart, so they must never be read as tail.
- One-sided (proxy-only or SDK-only) usage attempts are skipped by the cross-check; the crash that
  produced them is still visible through `run_success_rate_24h_pct` and the orphan/stranded sweeps.
- Every corrected probe carries a `weeklyProbe` (7-day window) feeding the weekly review (ADR-057).

## Alternatives considered

- **Keep the old queries and adjust targets.** Rejected: would enshrine the mis-measure; the ticket's
  constraint is honest probes at unchanged targets.
- **Measure run start from `runs` columns with a new `first_running_at` column.** Rejected: the
  `run.state_changed` event stream already records every episode boundary append-only (REQ-DATA-33) —
  a new mutable column would re-create the `started_at` overwrite class of bug.
- **Sample replay separately rather than suppressing it.** A `detail='replay'` sample class would
  measure a different (catch-up UX) quantity, not the §13.5 signal; we suppress instead and keep the
  probe's `detail='tail'` requirement so no stray class sneaks back in.
- **Flag one-sided usage attempts as divergent.** A missing side is missing data, not a divergence;
  the failed/orphaned-run signals already own that failure class.

## Revisit trigger

If the §13.5 table itself is amended (a target change needs its own operator-paused ADR), or a probe
proves to still mis-measure on prod evidence — e.g. the run-start stage attribution shows the
event-pair boundary itself hiding latency — the specific probe is re-specified in a new ADR.

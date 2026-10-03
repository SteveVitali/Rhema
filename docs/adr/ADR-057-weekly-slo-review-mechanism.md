# ADR-057: the REQ-ARCH-34 weekly review is produced by a worker cron into durable log metrics, not walked from memory

- **Status:** Accepted
- **Date:** 2026-10-03
- **Ticket:** SLO.1
- **Requirement ids:** REQ-ARCH-34
- **Spec:** §13.5; docs/ops/slo-review.md

## Context

REQ-ARCH-34's rule — *SLOs are reviewed weekly; a breach pauses feature work on that surface* —
existed only as a document (`docs/ops/slo-review.md`) plus the 5-minute alert sweep. Nothing produced
the weekly artifact: the review depended on an on-call remembering to open the dashboard, and nothing
recorded that a review happened or what it saw. The alert-window probes (10-minute to 24-hour windows)
also aren't the weekly quantity — a signal can clear its alert window while the week's tail was red.

## Decision

- **`SloSignalDef.weeklyProbe`** — every signal carries a 7-day-window probe variant (falling back to
  `probe` where the reading is already the honest weekly value: point-in-time counts like
  `orphaned_runs`, already-7d signals like the Unverified rate).
- **`sloWeeklyReview(system)`** in `packages/orchestrator/src/slo.ts` runs the whole registry over the
  weekly window with the same `ok | breach | empty | unmeasured | error` semantics — a `breach` is a
  budget-breach finding, an `empty`/`unmeasured`/`error` is reported, never skipped.
- **The worker produces it**: a `slo.review.weekly` pg-boss cron (Mon 07:12 UTC, off the cron edges)
  logs one `[slo] weekly {"signal","status","value","target","threshold"}` line per signal plus a
  `[slo] weekly-summary` status rollup. A pg-boss schedule (not a `setInterval`) makes the cadence
  durable across worker restarts and deploys; a boot readout runs it once per deploy so a fresh deploy
  always leaves a current weekly in the log.
- **Metrics + dashboard**: `rhema_slo_weekly` (DELTA counter, labels `signal`+`status` — so an
  `empty`/`unmeasured`/`error` reading is visible rather than absent) and `rhema_slo_weekly_value`
  (DISTRIBUTION of the numeric values, `valueExtractor` on the log line) in
  `infra/pulumi/monitoring.ts`; two "weekly SLO review" tiles on the §13.5 dashboard chart readings by
  status and values by signal.
- **`docs/ops/slo-review.md`** updated: the weekly walk is now "open the weekly tiles, read the
  summary line, act on `breach`/`error`" — the review is *produced*, not remembered.

## Consequences

- Every Monday leaves an auditable artifact: the log lines are the review record, the metrics carry
  it into Monitoring, and the dashboard tile shows review *status* (including honestly-measured
  `unmeasured`) not just breach counts.
- A deploy double-fires at most one extra readout (the boot call) — log lines are append-only, so the
  record is never corrupted, just slightly earlier.
- `sloWeeklyReview` runs on the system executor like `probeSlos` — cross-tenant platform counts only.

## Alternatives considered

- **A `setInterval` in the worker.** Rejected: the pg-boss schedule survives restarts and is visible
  to operators as a real scheduled job (`slo.review.weekly`), same mechanism as every other worker
  cron.
- **Writing the readout to a DB table.** Rejected for now: the log-based metric path reuses the
  existing `rhema_slo_violations` pattern, needs no migration, and the ticket's need is a durable
  review artifact — the log IS that artifact. A table can follow if review history ever needs
  querying beyond the log-retention window.
- **Slack/webhook push for the weekly.** Rejected: the review is a checklist walk, not a page; the
  dashboard + log record suffices and keeps the ops webhook reserved for actual breaches.

## Revisit trigger

If review history must be queryable past Cloud Logging retention (e.g. quarter-over-quarter trends),
persist `sloWeeklyReview` output to a table. If a weekly-only signal needs its own threshold distinct
from the alert threshold, add a `weeklyThreshold` field rather than reusing the alert number.

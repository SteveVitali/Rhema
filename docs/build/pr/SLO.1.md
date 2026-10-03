# SLO.1 — Prod SLO remediation: honest probes, then §13.5 on prod

Ticket: `docs/tickets/75_SLO.1__prod-slo-remediation.md` · run ledger: `docs/build/runs/SLO.1.md`
Stacks on `stevevitali/obs-1-observability` (PR #96, itself stacked on RUN.1 PR #95).
**DO NOT MERGE** — merge policy
OPERATOR. **Stage A is complete and green; Stage B (deploy, migration 0054, the k8s
DaemonSet apply, bounded live legs, prod re-reads, first weekly readout) is deferred
post-PR-review under the standing ADR-013 path as `D-SLO.1-1..4`** — no deploy, prod-DB
write, or `pulumi up` was run from the build environment.

## Summary

> Every §13.5 probe now measures the quantity its row names, the REQ-ARCH-34 weekly review
> is produced by the worker rather than remembered, and the run-start remediation levers
> that fit under the $15/mo standing authorization are shipped — **no target or alert
> threshold moved anywhere.**

- **Probe definitions made honest (ADR-056; `packages/orchestrator/src/slo.ts`).**
  - *Run start:* each `to='running'` event joins its own latest preceding `to='queued'`
    event — first starts, resumes, and reaper requeues each measure from their own
    enqueue. `runs.started_at` is untouched by the probe (it is overwritten on every
    `provisioning → running` heartbeat — the bug that folded gate waits into "start").
  - *Gate resume:* blocking-gate `resolved_at` → the next `to='running'` event, not
    `resolved_at − opened_at` (the human's decision time).
  - *Event delivery:* `slo_samples.event_delivery_ms` counts **live-tail flushes only**
    (`detail='tail'`). `RunEventStreamer` fires `onFlush` solely on post-catch-up pumps —
    connect backlogs and `Last-Event-ID` replays can never land a sample.
  - *Autosave:* both real save paths sample — api HTTP save (`detail='http'`) and the
    Page's collab `onStoreDocument → storeDocument` (`detail='collab'`, skips every
    locked/refused outcome; migration `0054` grants `rhema_collab` the insert it never
    had — the pre-SLO.1 writer was silently dropping every collab sample).
  - *Mirror errors:* scoped to the delivery/mirror failure class —
    `failed(reason='validation')` ∪ `boundary.violation` internal events. `engine.error`
    is out (a retried-phase record whose terminal instances already land in the success
    rate — this is what made the prod `1` unexplained; no failure class is hidden).
  - *Success rate:* denominator = completed + failed + **system-cancelled**; only
    user-side cancels (`stop`/`declined`/`expired`/`cancel_to_edit`) leave the fraction —
    a missing or new reason counts as system. Test tenants and Unverified deliveries stay
    excluded (JOURNEY.1/RES.2 untouched).
  - *Proxy-vs-SDK:* per `(run_id, attempt)`, `list_cost_usd ↔ list_cost_usd` — clean
    attempts read exactly 1.000 on prod; divergent attempts are real uncommitted burn
    (cap-enforcement COGS per D-PRB.16-5), and the ±2% target is unchanged.
  - The STB.3 `mirror_errors_10m` = 1 and the divergent proxy-vs-SDK run are each
    explained with their prod rows in the run ledger §0.
- **REQ-ARCH-34 made operational (ADR-057).** `sloWeeklyReview(system)` reads every signal
  over a 7-day window (`weeklyProbe` variants; `probe` fallback for point-in-time or
  already-7d signals) with identical `ok|breach|empty|unmeasured|error` semantics. The
  worker's `slo.review.weekly` pg-boss cron (Mon 07:12 UTC) + boot readout log
  `[slo] weekly {…}` per signal + `[slo] weekly-summary`; `rhema_slo_weekly`(+`_value`)
  log metrics + two dashboard tiles carry it; `docs/ops/slo-review.md` is the walk.
- **Run-start levers shipped ≤$0 (ADR-058).** `run_start_stage_ms` samples decompose
  `admit_mint` vs `job_launch`; pg-boss `useListenNotify` + `notify:true` on
  `run.start`/`run.resume` with a 0.5 s poll floor; `imagePullPolicy: IfNotPresent` on the
  digest-pinned image; and an image-prewarm DaemonSet (`infra/k8s/40-*.yaml`) holds the
  current digest on each sandbox node for ~$0. The costed alternatives (a second
  `e2-standard-2` ≈ $49/mo, GKE image streaming) are **deferred for operator approval**
  pending the post-deploy stage decomposition (D-SLO.1-4) — the G19 microVM escalation
  stays the named fallback.

## Verification

| gate | result |
|---|---|
| `pnpm turbo build lint typecheck` | 135/135 |
| `packages/orchestrator` vitest | 43 files / 476 pass / 0 fail |
| `slo.test.ts` (incl. every corrected probe's fails-on-old-query case + `sloWeeklyReview`) | 28 pass |
| `event-stream.test.ts` (replay never samples; live tail does) | 10 pass |
| `collab.test.ts` (collab autosave sample; locked store never samples) | 20 pass |
| `provision.test.ts` + stage-sample suites | 51 pass |
| `k8s-launcher.test.ts` (digest pin + `IfNotPresent`) | pass |
| api `sse-routes` + `editor-routes` suites | 19 pass |
| `check-additive-migrations.mjs --files 0054` | pass (grant only; no DROP/rename/rewrite/role-change) |
| `check-build-memory.sh .` | no violations |

## Stage B — deferred (D-SLO.1-1..4)

Deploy (`pulumi preview` → `up`, expected: two log metrics + two dashboard tiles +
image/env bumps, **zero stateful replace/delete**), migration `0054`, the DaemonSet
`apply.sh` leg, the bounded live legs (~10 chat turns, one gated Review, SSE tails, ≤$10),
prod re-reads of every corrected probe, the first produced weekly readout, and the
costed run-start decision are recorded as `D-SLO.1-1` … `D-SLO.1-4` in
`docs/tickets/DEFERRALS.md` with unblock conditions and verification steps. Any §13.5 row
still red on prod after deploy closes only as a named `D-SLO.1-<n>` with the measured
gap + lever + cost — the compensating control is that the alert policies keep firing
unchanged.

## Requirement IDs

REQ-ARCH-13 (primary — event delivery), REQ-ARCH-34 (primary — weekly review);
touched REQ-ARCH-32 (egress-denied signal), REQ-ARCH-35 (cross-check semantics);
REQ-SPEC-29 (provenance — asserted at Stage B).
ADRs: 056 (corrected probe definitions), 057 (weekly-review mechanism),
058 (run-start levers + costed deferral).
Absorbs BL-07 — `X-slo-probe-gaps` resolved at the probe layer; `X-f8-prod-slos-red` and
LEDGER OPEN FINDINGS F8 stay open until the corrected probes read green on prod (the
entries carry dated annotations).

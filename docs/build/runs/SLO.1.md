# SLO.1 — Prod SLO remediation: honest probes, then §13.5 on prod (run ledger)

- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/75_SLO.1__prod-slo-remediation.md`
- **Branch:** `stevevitali/slo-1-prod-slo-remediation`, stacked on OBS.1 `979b187`
  (`stevevitali/obs-1-observability` — open, `OPERATOR` merge policy, **not merged**).
- **Goal:** fix the §13.5 probe definitions that mis-measure (run start, gate resume, event delivery,
  autosave, mirror errors, success rate, proxy-vs-SDK), then remediate the real latency/success gaps
  until the unchanged targets hold on prod; make REQ-ARCH-34's weekly review operational.
- **Spend:** tracked per leg below; cap ≤ $10 metered (target ≈ $5), cheapest-first. Round-3 cumulative
  entering: $53.12.
- **ADRs:** (assigned at write-up — next free after ADR-055): corrected probe definitions;
  REQ-ARCH-34 weekly-review mechanism; run-start lever set / warm-pool proposal.

## 0 — Context load (done)

- DEFERRALS.md re-read; AGENTS.md re-read; `git status` on `stevevitali/obs-1-observability@979b187`
  verified clean before branching.
- Anchors re-confirmed: `slo.ts` (full), `internal-api.ts` heartbeat ~279–288 (`startedAt` overwrite
  on every `provisioning → running`), `gate-resolution.ts` (waiting_gate → queued / finalizing),
  `transition.ts` (paired `run.state_changed{from,to,reason}` events), `event-stream.ts` (`pump()`
  emits replay + tail alike; `onFlush` fires on every emitting pump), `sse-routes.ts` ~117–131,
  `editor-routes.ts` ~368–405 (HTTP-path `autosave_save_ms` only), `apps/collab/src/materialize.ts`
  `storeDocument` (no sample), `apps/worker/src/main.ts` ~160–240 (lazy/eager-warm launcher) +
  ~543–566 (5-min `slo.probe`), `infra/pulumi/monitoring.ts` (violations metric + dashboard),
  `infra/pulumi/compute.ts` (run-task pool `nodeCount: 1` e2-medium prod — ONE warm node, no
  autoscaler; worker `minInstanceCount:1` + `cpuIdle:false`).
- Prod facts gathered via IAP tunnel (`127.0.0.1:15433` → Cloud SQL `10.46.0.3`, read-only `postgres`,
  scratch `integration/.scratch/slo1-*.mts` — never committed):
  - **`mirror_errors_10m` = 1 explained.** `run_events_internal` holds zero `boundary.violation` rows
    ever; the `1` was an `engine.error` — a phase-level `artifact_missing`/`blocked`/`infra`
    (cap-402) failure record. Terminal phase failures already produce `run.state_changed{to:'failed'}`
    (counted by the success probe); retried engine errors are hiccups, not delivery/mirror failures.
    §13.5's "mirror errors" row is the DELIVERY-validation failure class (`failed(validation)` —
    `delivery.ts` → `failRun{code:'validation'}`) + `boundary.violation` internal events; prod has
    **zero** `reason='validation'` failures and zero boundary violations in the last 30d.
  - **Proxy-vs-SDK explained.** Per-(run,attempt): clean attempts read `usd_ratio = 1.000` exactly
    (SDK `costUsd` = our list cost). Divergent attempts (ratio 0.15–0.74) are retry/cap-death runs
    where crashed phases burned proxy-metered tokens but never reached `harvest` — the SDK side only
    rows the phases that reported (`sdk_estimate` exists only since D-P0.15-2; older runs have none).
    The old probe's 1-hour `ts` window also mixed attempts (proxy of attempt N vs sdk of attempt N−1).
    Uncommitted burn is cap-enforcement COGS per D-PRB.16-5 — real, not a metering bug.
  - **State transitions on prod** confirm the event-pairing shape: `created→queued`,
    `queued→provisioning` ≈ 1–2 s (pg-boss pickup), `provisioning→running` ≈ 2–30 s warm-path,
    `waiting_gate→queued` → `provisioning` → `running` for resumes (~2–3.5 s on prod),
    `orphaned→queued` requeues, `orphaned→waiting_gate` reparks, `cancelling→cancelled{reason:'stop'}`.
    Cancel reasons observed: `stop`, `cancel_to_edit`, `expired` (user-side); `chargeback` exists in
    code (system). `completed_partial` is terminal-partial — neither completed nor system-cancelled.
  - `slo_samples` on prod: `event_delivery_ms` n=829 (p95 ≈ 782 ms — includes replay pollution),
    `autosave_save_ms` n=1, `import_preview_ms` md/html/docx present.
  - `rhema_collab` lacks `insert on slo_samples` (0045 grants it to `rhema_app` only) → migration 0054.
- STB.3 §4 F8 / RCN.1 / DEF.3 §5–6 / D-P0.15-5 / D-PRB.16-5 / D-DEF.3-1 anchors re-read as loaded.

## 1 — Requirements → test matrix (Stage A plan)

| # | Change | Probe/code fix | Test that fails on the old behavior |
|---|---|---|---|
| 1 | `run_start_latency_p95_s` | per-episode `queued→running` latency from `run_events` pairs (each `to='running'` event joined to its latest preceding `to='queued'` event) — no `started_at` (it is overwritten per episode) | seeded run with a 1 h parked resume: old query reads started_at−created_at ≈ 1 h (breach); new reads the resume episode ≈ s-level |
| 2 | `gate_resume_latency_p95_s` | blocking gates: `resolved_at` → next `run.state_changed{to:'running'}` ≥ resolved_at | a gate that sat 1 h then resumed in 3 s: old reads 3,600 s (breach), new ≈ 3 s |
| 3 | `event_delivery_latency_p95_s` | `RunEventStreamer` only fires `onFlush` on LIVE-TAIL pumps (post-catch-up); route tags `detail='tail'`; probe requires `detail='tail'` | streamer test: replay pump emits backlog → no sample; tail pump → sample. Probe test: `detail` null/'replay' rows never count |
| 4 | `autosave_roundtrip_p95_ms` | probe unchanged; collab `onStoreDocument` samples `autosave_save_ms` (`detail='collab'`); api writer tagged `detail='http'` | collab test: a store produces the sample row |
| 5 | `mirror_errors_10m` | delivery-validation failures (`state_changed → failed, reason='validation'`) ∪ `boundary.violation` internal events; `engine.error` dropped (terminal failures still land in success rate — no hidden class) | an `engine.error` row alone must NOT breach (old counted it); a `validation` failure + a `boundary.violation` each breach |
| 6 | `run_success_rate_24h_pct` | denominator = completed + failed + **system-cancelled** (terminal `state_changed{to:'cancelled'}` reason ∉ {stop, declined, expired, cancel_to_edit}; a missing reason counts as system) | a `chargeback`-reason cancel drops the rate below 95% (old dropped all cancels); a `stop` cancel still excluded |
| 7 | `proxy_vs_sdk_cost_runs_over5pct_1h` | per `(run_id, attempt)` proxy Σ list_cost_usd vs `sdk_estimate` Σ list_cost_usd (usd↔usd — on clean attempts prod reads exactly 1.000; the rate-card ruling D-PRB.16-5 is untouched) | attempt-A proxy + attempt-B sdk (cross-attempt mismatch): old run-grouped read flags, new per-attempt read does not; a same-attempt >5% divergence still flags |
| 8 | Weekly review (REQ-ARCH-34) | `sloWeeklyReview` (`weeklyProbe` 7-day variants per signal, `probe` fallback) + worker `slo.review.weekly` cron logging `[slo] weekly {...}` + `[slo] weekly-summary` + `rhema_slo_weekly`(+`_value`) log metrics + dashboard tile + `slo-review.md` mechanism | unit: a 3-day-old episode reads on weekly, empty on the 24 h/10 m alert probe |
| 9 | Run-start stage attribution | `provisionRun` writes `slo_samples{signal:'run_start_stage_ms', detail:'admit_mint'\|'job_launch'}` (awaited-but-caught); residual pod stage = `provisioning→running` event delta − admit − launch | provision test: a launched run leaves stage sample rows |
| 10 | Migration 0054 | `grant insert on slo_samples to rhema_collab` (additive; collab writer) | additive-migration lint |

Targets and alert thresholds: **unchanged everywhere** (invariant: no target moves without an
operator-paused ADR — none needed; the ±2% `proxy_vs_sdk` target stays ±2%).

## 2 — Implementation notes (filled as built)

- **`slo.ts`** (`packages/orchestrator/src/slo.ts`): all seven mis-measuring probes rewritten in place;
  `SloSignalDef.weeklyProbe` added (7-day window variants; `probe` reused for point-in-time or
  already-7d signals); `sloWeeklyReview(system)` shares `runProbes` with `probeSlos` — identical
  `ok|breach|empty|unmeasured|error` semantics, a throwing probe degrades one signal to `error`,
  never the sweep.
- **`event-stream.ts`**: `RunEventStreamer.caughtUp` flips only after the first emitting pump
  completes; `onFlush` fires solely on post-catch-up passes — replay/catch-up rows can never land a
  sample, and the flag is positional-proof (a re-entrant `dirty` pump during catch-up stays inside the
  same suppressed pass).
- **`sse-routes.ts`**: the flush writer tags `detail='tail'`; the probe requires it, so pre-SLO.1
  unmarked rows (n=829 polluted samples on prod) simply age out of the window.
- **`editor-routes.ts`** / **`extension.ts`**: autosave writers tagged `detail='http'` / `'collab'`.
  The collab sample measures `storeDocument`'s full persistence pass, skips `outcome.locked`
  (all three refusal classes — draft lock, showcase, head-locked), and is awaited-but-caught (the
  PGlite single-wire tests serialize on the ordering; a grant failure still never fails a store).
- **`provision.ts`**: `run_start_stage_ms` rows (`admit_mint`, `job_launch`) land on launch success
  only — a failed launch's spans are diagnostic noise the stranded sweep already carries.
- **`k8s-launcher.ts`**: `imagePullPolicy: IfNotPresent` pinned explicitly on the digest-pinned
  run-task image.
- **`worker/main.ts`**: `useListenNotify: true` + `notify: true` on `run.start`/`run.resume` queues +
  `pollingIntervalSeconds: 0.5` floor; `slo.review.weekly` queue + consumer + Mon 07:12 UTC cron +
  boot readout (`logWeeklyReadout` shared).
- **`monitoring.ts`**: `rhema_slo_weekly` (DELTA counter by `signal`+`status`) and
  `rhema_slo_weekly_value` (DISTRIBUTION, `valueExtractor`) log metrics + two weekly-review tiles.
- **`infra/k8s/40-image-prepull-daemonset.yaml`** + `apply.sh` wiring: sleeper DaemonSet keeps each
  sandbox node's image cache warm for the current digest (ADR-058's $0 lever); `RUN_TASK_IMAGE` +
  `RUN_TASK_NODEPOOL` envsubst'd, re-applied per image bump.
- **Migration `0054_collab_slo_samples.sql`**: `grant insert on slo_samples to rhema_collab`
  (additive; the collab writer's grant gap found on prod — `rhema_app` had it since 0045).
- **ADRs**: 056 corrected probe definitions; 057 weekly-review mechanism; 058 run-start levers +
  costed warm-pool deferral.

### Test fixes during the run

- Collab autosave test asserted an absolute count of 1 — a disconnect-time `onStoreDocument` adds a
  legitimate second sample; the test now measures the locked leg's delta.
- Fire-and-forget `slo_samples` inserts raced the next tx on the single PGlite wire ("memory access
  out of bounds"); both writers switched to awaited-but-caught.
- `k8s-launcher.test.ts` manifest expectations updated for `imagePullPolicy`.

## 3 — Verification

| gate | result |
|---|---|
| `pnpm turbo build` | 45/45 tasks |
| `pnpm turbo lint typecheck` | 135/135 tasks |
| `packages/orchestrator` full vitest | 43 files / **476 pass / 0 fail** |
| `slo.test.ts` — every corrected probe has a PGlite test that fails on the pre-fix query; `sloWeeklyReview` weekly-window + one-reading-per-signal cases | **28 pass** |
| `event-stream.test.ts` — the catch-up/replay pump never samples; the post-catch-up tail pump does | **10 pass** |
| `collab.test.ts` — `onStoreDocument` lands `autosave_save_ms` `detail='collab'`; a locked store never samples | **20 pass** |
| `provision.test.ts` + related provision suites — `run_start_stage_ms` `admit_mint`/`job_launch` rows on launch success | **51 pass** |
| `k8s-launcher.test.ts` — digest pinning + `imagePullPolicy: IfNotPresent` in the manifest | pass |
| api `sse-routes.test.ts` + `editor-routes.test.ts` | **19 pass** |
| `node scripts/check-additive-migrations.mjs --files packages/db/migrations/0054_collab_slo_samples.sql` | pass (grant only) |
| `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` | no violations (9 pre-existing warnings) |
| `pnpm prettier --check` on new files | clean (touched `.ts` files share the repo's pre-existing non-Prettier baseline — no unrelated reformat diffs) |

## 4 — Stage B — deploy + bounded live legs

**Not executed in this environment** — the standing ADR-013 Stage-B path applies (operator-approved;
merge policy OPERATOR; no `pulumi up`, prod-DB write, or `kubectl` from the build env). The full leg
plan + unblock conditions are `D-SLO.1-1` in `docs/tickets/DEFERRALS.md`:

1. Cloud Build api/collab/worker/run-task images at the chain tip.
2. `pulumi preview` — expected delta: `rhema_slo_weekly` + `rhema_slo_weekly_value` log metrics, two
   dashboard tiles, image/env bumps; **zero stateful replace/delete** is the abort condition.
3. `pulumi up` at the chain-tip SHA → provenance PASS on api+web `/healthz` → `deployments` row.
4. Migration `0054` applies with the deploy path (additive-lint clean).
5. `infra/k8s/apply.sh RUN_TASK_IMAGE=<digest ref> RUN_TASK_NODEPOOL=<pool>` — the prewarm DaemonSet.
6. Bounded legs ≤ $10 metered: ~10 chat turns (run start), one ≤300-word Review under *Wait for me
   at each* approved promptly per gate (resume), SSE tails (delivery); then 7-day organic-window
   reads. Cheapest-first; drop the lowest-priority legs if the cap binds and record each dropped leg
   as its own `D-SLO.1-<n>`.

## 5 — Prod findings

**Pending Stage B** (D-SLO.1-2). Established pre-fix facts (IAP-tunnel reads, §0): run start p95 was
measuring `started_at − created_at` where `started_at` is overwritten per episode; event-delivery
p95 carried replay pollution (n=829 unmarked samples); the mirror `1` was a retried-phase
`engine.error`; the proxy-vs-SDK divergence was cross-attempt mixing + real uncommitted burn on
crashy runs (cap-enforcement COGS, D-PRB.16-5). Post-deploy readings under the corrected probes are
the deferred evidence — any still-red row becomes a named `D-SLO.1-<n>` with measured gap, lever,
monthly cost, and its operator pause; targets never move without an operator-approved ADR.

## 6 — Deferrals / spend / closeout

- **Opened:** `D-SLO.1-1` (Stage B deploy + bounded legs + provenance), `D-SLO.1-2` (prod re-reads +
  stage attribution), `D-SLO.1-3` (first weekly readout + dashboard tiles live), `D-SLO.1-4` (the
  costed run-start decision — evidence-gated, operator-paused > $15/mo). All in
  `docs/tickets/DEFERRALS.md` with unblock + verify conditions.
- **Annotated (append-only):** LEDGER OPEN FINDINGS F8 (dated note — probes corrected + levers
  shipped; stays open until green or named D-SLO.1 rows); BACKLOG `X-f8-prod-slos-red` +
  `X-slo-probe-gaps` (resolution pointers). `D-P0.15-5` already DONE (57 s first-start baseline
  cited); `D-DEF.3-1` already DONE (the `egress_denied_10m` sub-leg evidence landed at DEF.3).
- **ADRs:** ADR-056 (corrected probe definitions — no target moved), ADR-057 (weekly-review
  mechanism), ADR-058 (run-start levers + costed warm-pool deferral). `docs/adr/README.md`
  regenerated by `adr-index.sh`.
- **Spend this run:** $0 metered (Stage A only — no live legs run).
- **Remaining for close:** commit + push the stacked PR (operator merges); LEDGER CURRENT
  STATE/PHASE LOG + `BUILD_INDEX.md` row land with the PR; Stage B per D-SLO.1-1.

# SLO.1 — Prod SLO remediation: honest probes, then §13.5 on prod (run ledger)

- **Closed:** 2026-10-03 · PR #97 on `stevevitali/obs-1-observability` (OPERATOR — unmerged)
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/75_SLO.1__prod-slo-remediation.md`
- **Branch:** `stevevitali/slo-1-prod-slo-remediation`, stacked on OBS.1 `979b187`
  (`stevevitali/obs-1-observability` — open, `OPERATOR` merge policy, **not merged**).
- **Goal:** fix the §13.5 probe definitions that mis-measure (run start, gate resume, event delivery,
  autosave, mirror errors, success rate, proxy-vs-SDK), then remediate the real latency/success gaps
  until the unchanged targets hold on prod; make REQ-ARCH-34's weekly review operational.
- **Spend:** **$8.10 metered** (proxy-side `list_cost_usd`; cap ≤ $10, target ≈ $5 — over target on the
  standard-rigor entitlement review, under cap). Round-3 cumulative entering: $53.12.
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

## 4 — Stage B — executed 2026-10-03 (ADR-013 standing authorization)

The prior worker's "operator cloud creds required" premise was wrong — prod updates 94–128 all ran
from this env. Stage B executed end-to-end:

1. **Images** — the five diff'd services built at chain tip `552ed9a` and pushed `slo1`-tagged;
   Artifact Registry tags verified against the deployed digests (api `52b93db8`, web `d5809bde`,
   worker `44569797`, run-task `884bcc44`, collab `c9f06626`); fetcher/convert/export/egress-proxy
   kept their prior pins.
2. **Pulumi** — update **127** failed on the new `rhema_slo_weekly_value` DISTRIBUTION metric
   (GCP 400: `bucketOptions` required — fixed in `a205a5b`, monitoring.test 11/11). Update **128**
   applied (+1 metric, ~7 updates, **0 replaces/0 deletes**, ≈$0). Update **129** applied the
   autoname filter fix found on prod (below; monitoring-only service+Slo replace, paired).
3. **Migration `0054`** — applied via the IAP tunnel `127.0.0.1:15433` at ~08:11Z;
   `_migrations` shows `0054_collab_slo_samples.sql`; `rhema_collab` insert on `slo_samples`
   verified.
4. **DaemonSet** — `infra/k8s/apply.sh` applied earlier in the session; verified live:
   `run-task-image-prewarm` DESIRED/CURRENT/READY **1/1**, pod `run-task-image-prewarm-vztkm`
   Running on node `gke-rhema-prod-run-t-…-2pjr` (pool `rhema-prod-run-task-pool-647f9f4`),
   Image ID `run-task@sha256:884bcc44…` — the exact deployed digest, node cache warm.
5. **Provenance** — `check-deploy-provenance` PASS: api+web `/healthz` report
   `552ed9a133bc0e9966aaad58172bf8d0e5b92254` (protocols `0.4.0+ec61156725a895ab`); `deployments`
   row written with all nine digests.
6. **Weekly readout** — boot readout `2026-10-03T08:30:02Z` (rev `…-00061-s4g`): 15
   `[slo] weekly` lines + `[slo] weekly-summary {"ok":7,"breach":3,"empty":3,"unmeasured":2,"error":0}`.
   A second readout was produced by **triggering the mechanism**: pg-boss `send("slo.review.weekly")`
   job `f7605e3e` consumed + logged `08:50:36Z`. **Metric defect found + fixed on prod:** every
   `service_name` filter named the Pulumi base name (`rhema-prod-worker`/`rhema-prod-api`) while the
   Cloud Run resource label carries the autonamed service (`…-cbdaf0f`/`…-e745ce0`) — the violations
   counter, both weekly metrics, the api-availability Slo's monitored service (whose SLI filters also
   lacked service scoping — they read fleet-wide), and the dashboard api tiles all silently matched
   zero. `MonitoringArgs` now threads `apiServiceName`/`workerServiceName` from `compute.services`
   (`a828f01`); update **129** updated the three metric filters + dashboard in place and replaced
   service+Slo as a pair (`deletedWith`; GCP cascade-deletes SLOs with their service — a PATCH proved
   the service identity fields immutable). Post-fix, `rhema_slo_weekly` carries **15 signal×status
   series** on prod (verified `timeSeries.list` 08:44–09:00Z).
7. **Bounded live legs** — real magic-link sessions via the keyless Gmail DWD mailbox
   (`test@rhema.tools`; session cookies harvested from the verify redirect's `Set-Cookie` — **no
   session rows minted**):
   - **10 chat turns** on `01M40AA57KHY53ETXXBX6KEWMM` (`test+jrn-a@rhema.tools`, is_test ws
     `01M3YJGD…`), each with an SSE tail: 9 completed, 1 `failed{phase_blocked}` (engine-side
     `phase-result blocked [sdk=success]` at `answer` — a model-side block, counted honestly in the
     success denominator), run ids `01M40F4D…`–`01M40G5F…` (ledger §6 cost table).
   - **One gated Review** — JRN-A's account is `trial_used` (free-tier concurrency 0 ⇒
     `concurrency_limit`), so the leg ran on test tenant `test+ja2a02f060aedn9` (is_test, trial
     entitlement `01M40A8M2…`): duplicated showcase `01M40GCWX…`, editor-save of a **152-word** doc
     (the save itself sampled `autosave_save_ms detail='http'` — probe bonus), policy `wait_each`,
     launch `01M40GENB31HPQNKVDW4YKYEEE` (trial shape review/standard/base). `approve_scope` gate
     parked the run 09:12:46→approved 09:12:50→running 09:12:53 (**resume ≈2.6 s resolved→running**; opened→running ≈6.1 s incl. the human's 3.4 s).
     The run hit two `heartbeat_stale` orphans (09:29:33, 09:44:03); the reaper requeued in ≤10 ms
     and it resumed each time (~90 s end-to-end) — `orphaned_runs` stayed green *because* the reaper
     worked, honest evidence in both columns. Run **completed** 10:08:42Z (995 cr / $7.19 metered
     proxy-side, 196 usage rows; SSE tail carried 14 `detail='tail'` samples at 14–109 ms plus 8
     `run_start_stage_ms` rows across the three launch episodes).

## 5 — Prod findings (post-deploy, corrected probes)

| §13.5 signal (unchanged target) | Reading | Verdict |
|---|---|---|
| `run_start_latency_p95_s` ≤45 | **27.8 s** p95 on the 7-day organic window (weeklyProbe, non-test). Leg episodes (test-tenant, excluded from SLO math — the ticket's measure-the-levers traffic): 2.5–4.1 s warm, 10.9 s first-post-deploy | **ok** — levers measured working (pre-fix baseline was ~57 s first-start + mis-measured) |
| `gate_resume_latency_p95_s` ≤60 | **25.9 s** p95 7-day; leg resume ≈**2.6 s** (resolved→running) | **ok** |
| `event_delivery_latency_p95_s` ≤2 | p50 **34 ms**, p95 **2 238 ms** (86 leg tail samples, `detail='tail'`; six terminal-batch outliers rode the 10 s safety poll — wakeup/commit race at run end). Organic non-test tail samples still `empty` post-deploy | **edge → D-SLO.1-6** ($0 code lever named) |
| `mirror_errors_10m` =0 | **0** post-deploy + 30-day pre-read | **ok** |
| `run_success_rate` ≥97 wk / ≥95 day | **80%** 7-day (n=10 non-test; failures 09-26 `phase_blocked` + `cap_reached`) | **breach → D-SLO.1-5** |
| `proxy_vs_sdk` 0 attempts >5% | **4 divergent attempts**, 15.5–22.9% both directions (crashy multi-attempt runs) | **breach → D-SLO.1-7** |
| `egress_denied_10m` ≈0 | **9–12** denials, anthropic canary + `?beta=true` on the same crashy runs | **breach → D-SLO.1-8** |
| `autosave_roundtrip_p95_ms` ≤500 | post-deploy samples 379/385 ms (`detail='http'`; collab path armed by 0054) | **ok** (server leg; round-trip adds the unmeasured client leg by design) |
| `provider_429_5xx`, `orphaned_runs`, `unverified_review`, `absorbed_adjustments` | 0 / 0 / 0 / 1.82% | **ok** |
| `api_availability`, `cost_drift`, `import_preview` | measured-elsewhere / no 7-day traffic | `unmeasured`/`empty` — **visible by design**, not absent |

**Stage attribution** (12 leg episodes): queue pickup ≈0.5–1.5 s (LISTEN/NOTIFY vs the old poll),
`admit_mint` p95 65.5 ms, `job_launch` p95 2 987 ms (median ≈140 ms; one 6.5 s cold outlier on the
first post-deploy launch), pod stage residual ≈1–7 s → **queued→running 2.5–10.9 s** vs the 45 s
target. D-SLO.1-4 closes **not needed** — the ≈$49/mo second node + image streaming stay unbought.

## 6 — Deferrals / spend / closeout

- **Closed:** `D-SLO.1-1` (deploy + legs + provenance — DONE except the nightly JOURNEY.1 leg, which
  is the scheduler's, not this ticket's, and stays OPEN under that clause), `D-SLO.1-2` (re-reads +
  stage attribution), `D-SLO.1-3` (weekly readout ×2: boot + queue-triggered; 15 metric series),
  `D-SLO.1-4` (costed run-start decision — not needed, evidence-gated).
- **Opened (honest red):** `D-SLO.1-5` (success 80%/wk — two named 09-26 failures), `D-SLO.1-6`
  (event-delivery p95 2 238 ms — wakeup/commit race lever, $0), `D-SLO.1-7` (proxy-vs-SDK 4
  divergent attempts — reconcile/estimator lever, $0), `D-SLO.1-8` (egress_denied 9–12 — canary
  semantics lever, $0 or ADR-paused). No target moved anywhere.
- **Spend this ticket (metered `list_cost_usd`, `source='proxy'` only — `usage_records` carries both
  proxy and `sdk_estimate` rows per call; summing every row double-counts):** 10 chat turns
  **$0.91** (per-run $0.070–$0.123, 995–promo-credit account spend on the test tenant) + the gated
  review **$7.19** = **$8.10 total ≤ $10 cap** (over the ~$5 target — the standard-rigor entitlement
  shape is the heavy leg; the two orphan resumes re-executed phases inside it). Infra side $0
  marginal (existing pool + node + free monitoring resources).
- **Mirror/proxy explanations** (carried from §0, now with post-deploy rows): the mirror `1` was a
  retried-phase `engine.error` — zero `reason='validation'` failures and zero `boundary.violation`
  rows ever (checked again post-deploy); the divergent proxy-vs-SDK attempts are real crashy-run
  burn/variance — attempt-level rows enumerated in D-SLO.1-7.

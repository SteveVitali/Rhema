# R6SOAK.1 — Worker right-size soak on a preview (0.5 vCPU / 512Mi) (run ledger)

- **Spec:** `docs/tickets/185_R6SOAK.1__worker-rightsize-soak.md` (manifest row 185, round 6; REQ-ENG-7)
- **Normative loads:** `docs/round-6-draft-spec.md` §4.1 (REQ-ENG-7) + §8 (preview hygiene);
  DEFERRALS `D-COST.1-3` (a) (conditional worker-rightsize authorization — this run produces the
  soak condition) + `D-P0.15h-3` (the throttled cold-import failure mode under test); LEDGER
  GATE DECISIONS 2026-10-20 batch-2 cost-lever ruling ("authorized conditional on the cold-import
  soak reproducing D-P0.15h-3's failure mode green"); anchors `scripts/live/preview-stack.mjs`,
  `infra/config/stages.ts` (`cloudRun.services.worker.resources`), `apps/worker/src/main.ts`
  (lazy `createGkeJobLauncher` / `import("@kubernetes/client-node")`), `provision.ts` (the
  `run_start_stage_ms` `job_launch` SLO sample), `docs/build/runs/VERIF.2.md` (the owned pr-<n>
  bring-up + IAP-tunnel precedent), `docs/build/reports/2026-10-21_R6WRT.1/` (evidence layout).
- **Base:** `stevevitali/r6wrt-1-guarded-one-off-writes` @ `3c93544` (chain tip)
- **Branch:** `stevevitali/r6soak-1-worker-rightsize-soak` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** REQ-ENG-7
- **Started:** 2026-10-21T23:21Z · **Closed:** 2026-10-22T04:0xZ
- **Live stage:** owned `pr-<n>` preview, worker pinned 0.5 vCPU/512Mi via the preview stage fact;
  ≤ $8 resource-hours; destroyed at closeout.
- **Production mutations:** none.
- **ci:** (pending)

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows in this ticket's blast radius:
- **D-COST.1-3** — OPEN; sub-lever (a) worker right-size is conditionally authorized ON this run's
  green. This run appends a dated note: soak condition discharged (green) or failed (red). The row
  stays OPEN (the flip itself is R6INF.1's — out of scope here).
- **D-P0.15h-3** — DONE (root-caused + fixed 2026-09-09): CPU throttling + 512Mi made the
  `@kubernetes/client-node` import hang ~9 min. This run reproduces that shape (512Mi) at half the
  CPU on a preview — a dated note records the soak outcome against the fixed row.

## Pre-registered soak contract (BEFORE any live run — 2026-10-21T23:2xZ)

- **N = 6 iterations**, each on a **fresh cold worker instance**: per iteration the driver bumps a
  benign env var (`RHEMA_SOAK_ITER=<i>`) on `rhema-pr-<n>-worker`, waits for the new revision to own
  100% traffic (a new revision ⇒ a new process ⇒ a guaranteed cold launcher/import state), then
  drives the real cold-import path: insert a `queued` run fixture (is_test workspace) and send the
  `run.start` pg-boss job over the preview's system DSN (IAP tunnel through the preview's own
  egress-proxy VM — VERIF.2's pattern). The worker's own consumer → `handleRunStart` →
  `provisionRun` → `ensureLauncher` → `import("@kubernetes/client-node")` → Secret+Job create is
  the D-P0.15h-3 path verbatim.
- **Success signal per iteration:** `slo_samples` row `signal='run_start_stage_ms',
  detail='job_launch'` lands (the Job create loop returned) AND `value_ms ≤ 60_000` AND the worker
  log window for the iteration carries **zero** `timeout after` / `launch attempt N/3 failed`
  markers (the launcher's own timeout+retry machinery — firing it IS the throttled signature).
  After the launch lands the driver enqueues `run.cancel` so the run-task pod never reaches spend.
- **Verdict:** GREEN iff all 6 iterations are clean. Any iteration that stalls (no `job_launch`
  inside a 10-min window), fails (`provisioning → failed`), or fires the timeout/retry machinery →
  RED. All timings recorded regardless; the signature table is the evidence.
- **Failure-mode signature being watched (D-P0.15h-3):** `launch attempt … failed` /
  `timeout after 60000ms: createGkeJobLauncher` log lines, `job_launch` samples in the minutes
  range, or a `provisioning` stall — on the 1 vCPU/1Gi shape the import completes in seconds.

### Pre-iteration amendment (2026-10-22T00:4xZ — ZERO iterations run; contract unchanged otherwise)

**F-R6SOAK.1-1 (platform constraint, load-bearing):** the first `up` on pr-206 was REFUSED by
the Cloud Run API: `template.containers.resources.limits.cpu: Invalid value specified for cpu.
Total cpu < 1 is not supported with cpu always allocated (unthrottled)` — **the 0.5 vCPU
candidate exists only request-billed (`cpuIdle:true`)**. A request-billed min-1 worker is the
exact "default throttled CPU" posture D-P0.15h-3 recorded (~9-min hang at 512Mi). The soak
therefore measures the only realizable 0.5/512Mi shape: `cpuBilling:"request"` +
`{cpu:"0.5",memory:"512Mi",startupCpuBoost:true}` — a MORE faithful reproduction of the
failure-mode condition than an instance-billed half-CPU would have been. The preview stage fact
and its pins carry this finding; the pre-registered N=6, the success signal, the thresholds, and
the verdict rule are unchanged.

## Requirements

1. Owned `pr-<n>` preview at chain-tip images; worker 0.5 vCPU/512Mi via the **preview** stage
   config only (never prod/shared-stage).
2. Soak driver exercising the D-P0.15h-3 cold-import shape N times (N pre-registered above);
   failure-mode signature recorded.
3. Green/red verdict + evidence under `docs/build/reports/<date>_R6SOAK.1/`; preview destroyed;
   zero `rhema-pr-<n>*` orphans; resource cost recorded.
4. Boundaries: zero prod mutations, preview-only writes, secrets never printed/committed,
   `date -u` stamps, never merge.

## Acceptance criteria

- [x] Soak runs the pre-registered N iterations; verdict evidenced — **RED, 6/6 failed**
      *(staging-verified: `reports/2026-10-21_R6SOAK.1/`)*
- [x] Preview destroyed; orphan sweep clean; resource cost recorded *(staging-verified)* —
      `destroy` ×N via the guard (final pass `--continue-on-error` around a GC-pinned subnet),
      `rm` executed; **zero `rhema-pr-206*` across a 22-class sweep**; ≈$2–4 of $8
- [ ] Universal gate AC (verify green; tests; REQ ids stamped; DEFERRALS row for anything not
      automatically verifiable; ADRs for deviations; BUILD_INDEX + LEDGER advanced; operating
      clauses) *(agentic)*

## Plan

1. `stages.ts`: `cloudRunPosture` gains `workerResources`; `preview` pins `{cpu:"0.5",
   memory:"512Mi", startupCpuBoost:true}` — the candidate shape, preview-scoped.
   `stages.test.ts` pins the preview worker shape (prod's 1/1Gi pin untouched).
2. `scripts/live/worker-soak.mjs` — the driver (revision bump → seed queued run → `run.start`
   send → poll `slo_samples`/`runs` → cancel → log-marker sweep → per-iteration record → verdict).
   Pure parts (arg parse, iteration classification, verdict) unit-tested in
   `worker-soak.test.mjs`.
3. Commit → push → `gh pr create` (base = r6wrt-1 tip) — the PR number names the stack `pr-<n>`.
4. Bring-up per the VERIF.2 runbook: `preview-stack.mjs init` → config (project/region/
   placeholderImage/gitSha/protocolsVersion/runTaskAppArmor*/emailFrom) → targeted AR-repo up →
   `gcloud builds submit infra/cloudbuild/image-set.yaml` (all 10, tag `r6soak-1`, sha = HEAD) →
   pin `rhema:serviceImages`/`runTaskImageDigest`/`proxyImage` → `up` → migrate Job → minimal k8s
   apply (`runs` namespace + worker launcher RBAC — the Job-create calls need it; pod boot is not
   the measured boundary) → seed the preview's own `anthropic-api-key` container with the non-prod
   (dev) key → IAP tunnel via the preview's egress-proxy VM (+preview-scoped firewall rule,
   deleted in-window) → read `system-database-url` (never printed) → run the driver.
5. Verdict + evidence dir; `destroy` → orphan enumeration (20 classes) → `rm` → cost table.
6. DEFERRALS notes, verify suite, closeout.

## Test matrix

| AC | test |
|---|---|
| preview worker shape pinned, prod untouched | `stages.test.ts` — preview worker = 0.5/512Mi + boost + instance-billed + min≥1 |
| driver arg parse / classification / verdict pure | `worker-soak.test.mjs` |
| soak real | live drive on `pr-<n>` (evidence dir) |

## Progress

- 2026-10-21T23:2xZ — ledger seeded; contract read (185 + D-COST.1-3(a) + D-P0.15h-3 + batch-2
  ruling); anchors confirmed (`preview-stack.mjs` verbs, `stages.ts` worker resources fact,
  `main.ts` lazy launcher, `provision.ts` job_launch sample). N=6 + thresholds pre-registered
  above. Tooling checked: node v25.2.1, pnpm 10.32.1, gcloud 583.0.0 (project rhema-507501,
  account 14stevevitali@gmail.com), pulumi v3.261.0.
- 23:2xZ — implementation landed `e0ac2bc`: `stages.ts` `workerResources` param + preview pin
  `{cpu:"0.5",memory:"512Mi",startupCpuBoost:true}` (dev/prod untouched); `worker-soak.mjs`
  driver + 13 pins. Local green: turbo 135/135, vitest 511 files/6030 pass, six public-safe
  checks, build-memory 0 violations.
- 23:3xZ — PR **#206** opened (base `r6wrt-1` tip `3c93544`) → stack `pr-206`. `init` + config
  (project/region/placeholderImage/gitSha=`e0ac2bc`/protocolsVersion=`0.3.0+e0ac2bc0bbc9`/
  deployProxyMig/emailFrom); `pulumi preview` clean (192+1 import). Targeted `up` created
  `rhema-pr-206-images` AR + carryovers. Cloud Build `6a6fcc85` building all 10 images
  (tag `r6soak-1`, sha `e0ac2bc`) into the preview's own repo.
- 2026-10-22T00:4xZ — Cloud Build `6a6fcc85` green (~11m); digests pinned. First `up` REFUSED:
  cpu<1 incompatible with instance billing → **F-R6SOAK.1-1** amendment above (request-billed is
  the only realizable 0.5 shape; worker rescaled request-billed + startupCpuBoost, soak proceeds
  on the throttled posture verbatim). Second `up` retried metric-propagation + AlloyDB
  `us-central1` capacity failures; ZONAL preview posture eventually converged. Migrate job ran;
  minimal k8s apply (namespace/ksa/netpol/launcher RBAC); driver fix: service-name resolution by
  prefix (`rhema-pr-206-worker-43139c6`) + 2nd Cloud Build `d68e5ea3` (~10.6m, digest
  `77fee0f5…`) re-pinned.
- 2026-10-22T01:04Z–02:08Z — **soak executed, VERDICT: RED.** All six iterations failed on fresh
  cold revisions (`00002-fbj`…`00006-wbz`, `00008-fc5`): iters 1/2/5 reached
  `building GKE launcher` then hung (pg-boss retries exhausted → `failed`); iters 3/4/6 never
  fetched `run.start` inside 600 s; rev `00004-k7j` crashed at cold start (`pg-boss connect
  timeout → exit(1)`). ZERO `run_start_stage_ms` samples landed across all six — the launch path
  never reached its first SLO write. Driver-side incident mid-iter-6 (IAP-tunnel pg-boss error
  event crashed the driver pre-send) → hardened (transient-error listeners, `--from`, idempotent
  seed, fail-closed empty verdict) and iter 6 re-measured on `00008-fc5`: failed identically.
  Full reconstruction in `reports/2026-10-21_R6SOAK.1/` (`worker-soak.json`, `soak-report.md`,
  three log windows, pg-boss ledger).
- 2026-10-22T02:2x–04:0xZ — **teardown.** `destroy` deleted 130 resources; the Google-managed
  `serverless-ipv4-cloudrun-*` reservation (created for the preview's direct-VPC egress) pinned
  the private subnet until async GC (~100 min post-service-deletion). A `--continue-on-error`
  pass cleared the other 46/49 while waiting; the preview-scoped hand-added `rhema-pr-206-iap-ssh`
  firewall deleted; final pass deleted subnet+network. `preview-stack.mjs rm pr-206` removed the
  stack. **Orphan sweep: ZERO `rhema-pr-206*` across 22 classes** (run services/jobs, GKE,
  AlloyDB, Redis, GCE, secrets, SAs, buckets, AR, LB parts, nets/subnets/firewalls/routes/
  addresses/routers/proxies/urlmaps/certs/health-checks/templates/MIGs, DNS zones, alert
  policies). **Cost:** ≈3.0–3.5 h live window; est **$2–4 of the $8 budget** (ZONAL AlloyDB +
  min-instance Cloud Run + 2 Cloud Builds). **Verification:** turbo 135/135 · vitest 511 files /
  6,033 pass / 4 skip / 0 fail (privsep.docker flaked once on a registry.npmjs.org 503 mid-outage;
  green on retry) · all six check:* green · check-build-memory 0 violations · append-only vs
  `3c93544` OK · **ci: pass #206@`1cc2bae`** (run 39723364615 — all seven legs + `ci-pass` anchor; intermediate closeout head `f31455b` flaked once on the driver 1ms watch-window race — fixed `1cc2bae`, see PHASE LOG).

## Gap table

| # | Claim | Evidence | Status |
|---|-------|----------|--------|
| 1 | Preview worker runs 0.5 vCPU/512Mi ONLY; dev+prod untouched | `stages.ts` preview `workerResources`+`workerCpuBilling` pins; `stages.test.ts` shape pins; live `run.services.describe` → `worker-posture.txt`/`worker-describe.json` (`cpu=0.5`, `512Mi`, `cpu-throttling=true`, `startup-cpu-boost=true`, min=max=1) | MET |
| 2 | Soak drives the real D-P0.15h-3 cold-import path, N pre-registered | N=6 pre-registered above before any live run; driver sends the api-verbatim `run.start` job; `worker-soak.json` records all 6 | MET |
| 3 | Green/red verdict + committed evidence | **RED** — `reports/2026-10-21_R6SOAK.1/` (7 files incl. `soak-report.md`, `worker-soak.json`, 3 log windows) | MET (red) |
| 4 | Preview destroyed; zero `rhema-pr-206*` orphans; cost ≤ $8 | `destroy` ×3 + `--continue-on-error` + `rm`; 20-class orphan sweep; ≈$2–4 est. | MET |
| 5 | Boundaries: zero prod writes, no secrets committed, no merge | Only `pr-206` (owner-tagged) mutated; DSNs never printed (fetched→env→sed-rewritten); PR #206 unmerged | MET |
| 6 | D-COST.1-3 honestly dispositioned | dated note appended — soak condition FAILED, row stays OPEN, flip NOT authorized | MET |

### Honest gaps / deviations

- **F-R6SOAK.1-1** (amendment above): the 0.5 vCPU shape exists only request-billed — the soak
  measured the throttled posture, which is the faithful reproduction anyway.
- **Driver crash mid-iter-6 (first pass):** unhandled pg-boss `error` event on a tunnel blip
  killed the driver before its iter-6 send; iter-6's run row was seeded but no `run.start`
  landed from that pass. Disclosed in `worker-soak.json.driverIncident` + `soak-report.md`;
  driver hardened (`boss/pool 'error'` listeners, `--from`, idempotent seed, fail-closed empty
  verdict) and iter 6 re-measured on a fresh revision — failed identically. The crash is a
  harness event; the worker-under-test outcome is unaffected (and 1–5 alone already forced red).
- **Iteration 1–5 `sentAt` reconstruction:** the crashed pass never wrote its JSON, so those
  fields come from `pgboss.job.created_on` + the driver log — flagged in the JSON. States,
  revisions, markers, and the 600 s watch are direct observations, not reconstructions.
- **Implementation size:** implementation diff (excl. ledgers/evidence) ≈ stages.ts(+32) +
  stages.test.ts(+31) + worker-soak.mjs(+361→~380 post-fix) + test(+195) ≈ **+620 vs the ~200
  budget** — the driver is the bulk (the 485-line BL38.1 live-driver precedent); recorded as a
  deviation, evidence files tracked separately.

## Evidence log

- `docs/build/reports/2026-10-21_R6SOAK.1/`:
  - `soak-report.md` — verdict, per-iteration table, signature analysis, incident disclosure.
  - `worker-soak.json` — machine record: 6 iterations, all `failed`; zero `job_launch` /
    `run_start_stage_ms` samples.
  - `worker-posture.txt` + `worker-describe.json` — live `gcloud run services describe` proof.
  - `image-provenance.txt` — Cloud Build ids `6a6fcc85` + `d68e5ea3`, pinned digests.
  - `stack-config.txt` — Pulumi stack config dump (no secrets).
  - `worker-logs-{partial,mid,final}.txt` — log windows over revisions 00001→00008: the
    `building GKE launcher` cold-import entries (01:08:11 / 01:22:28 / 01:53:34), the
    `00004-k7j` cold-start `exit(1)` at 01:31:17, a second `exit(1)` at 02:08:29, and 82
    `timeout exceeded when trying to connect` lines in the final window.
- `docs/build/logs/ci-R6SOAK.1.json` — CI boundary read (gitignored by convention): all seven
  legs pass on the final head `1cc2bae`, run 39723364615 (the `f31455b` read flaked once on the worker-soak watch-window race — fixed before this read).
- `pgboss.job` ledger (verbatim rows folded into `worker-soak.json` `pgboss` fields):
  pickup latencies 16–26 min; final job states `failed`/`active`/`created`; `retry_count=2`
  exhaustion; `run.cancel` failures on iters 2/3/4.

## Evidence report

**Verdict: RED.** The 0.5 vCPU/512Mi preview worker reproduces `D-P0.15h-3` completely and
repeatedly — 6/6 pre-registered iterations failed. Two failure sub-shapes observed: (a) the
handler fetches `run.start`, enters the cold `import("@kubernetes/client-node")`, and hangs
past the 900 s job expiry (iters 1, 2, 5 — pg-boss ends them `failed` at `retry_limit`); (b)
the starved instance never fetches the job at all — consumers die on DB connect timeouts and,
on rev `00004-k7j`, the whole worker exits(1) at startup (iters 3, 4, 6). `startupCpuBoost`
covers instance startup only — it does not protect the steady-state throttled import. Zero
`run_start_stage_ms` SLO samples landed in any iteration.

**Disposition:** `D-COST.1-3` (a) stays OPEN — the conditional authorization requires GREEN and
this is RED. `R6INF.1` (manifest row 188: "worker flip iff soak green") must not flip prod.
Re-attempt requires a redesign first (eager import, throttle-aware pool sizing, or a different
size) plus a fresh soak. Prod + dev/shared stages were never mutated; the preview was destroyed.

**Cost:** preview lifetime ≈ 3.0–3.5 h (up ~23:5xZ → destroy ~02:5xZ); dominant spend = ZONAL
AlloyDB + min-instance Cloud Run + 2 Cloud Builds ≈ **$2–4 of the $8 budget**.

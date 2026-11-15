# r7deploy-main — post-merge prod deploy @ `ebfd33f2` (the merged-`main` tip: the ENTIRE R6 tail stack + inserts 255–260 + R7b, every PR through #332) under the 2026-11-12 deploy ruling

- **Ticket:** run-time insert (no ticket file — the R7DEP.2/3 + r7deploy-composed precedent):
  post-merge prod deploy of the merged `main` tip, authorized by the operator's 2026-11-12
  verbatim ruling relayed by the orchestrator and recorded by this run in GATE DECISIONS
  (`GD-DEPLOY.MAIN`): *"…I authorize pulumi up at merged main tip…"* — a **fresh** ruling:
  `GD-DEPLOY.R7` expired at the GATE-ACCEPT.R7 signature and `GD-DEPLOY.R6` at GATE-ACCEPT.R6;
  no standing deploy authority existed (`206_R6REC.3` §R6 external-state re-read). The ruling
  was not yet committed anywhere in the ledger when this run opened — the run records it
  verbatim (the same posture as R7DEP.3, whose ruling text the run itself recorded).
- **Branch:** `stevevitali/r7deploy-main-records` (records branch forked at `main` `ebfd33f2`
  so the deploy commit set stays records-only; mergePolicy OPERATOR — a run never merges).
- **Deploy SHA:** `ebfd33f2d06aff5d1e387fd50ac3d62eb73d8015` (`origin/main` tip; 191 commits
  since `ee40639d`, `ee40639d` a proven ancestor). Prod pre-deploy serves `ee40639d` (verified
  live below). The deployed-product delta this deploy carries: `apps/worker`
  `provider-report.ts`/`billing-jobs.ts`/`main.ts`/`jobs.ts` (**257's** `usage.reconcile`
  deny-degrade + **260's** `handleProjectPurgeSweep` re-arm watchdog + loud FAILED logging —
  both PROD-LOADED fixes), `packages/ledger`'s `report_fetch_denied` alert kind,
  `packages/journeys` leg-side code (259's `U6_STUB_TURN_FIXTURE` — journeys runs from a
  checkout, not a deployed image), `scripts/live/first-finding-latency.mjs`, and every
  records/docs row merged since `ee40639d`.
- **Harness:** devin-desktop/swe-2-high/subagent
- **Production mutations (ruling scope):** all-10 image build at `ebfd33f2` → `rhema-prod` AR;
  `pulumi preview --diff` classification → `pulumi up --stack prod`; `check-deploy-provenance`;
  `deployments` row via `record-deployment.mjs` over the operator IAP tunnel; the Cloud CDN
  invalidation of `/bff/p/demo~*` through `scripts/live/cdn-invalidate-demo.mjs` (dry-run ==
  act); the deployed re-proofs `D-R6OPS.1-1` and `D-BL38.1-2`/`BL-112` (read-only).
- **Not authorized / not done here:** a NEW preview walk or teardown (condition-1 evidence
  carried — below); merges (`mergePolicy: OPERATOR`); any paid/funded dispatch; golden re-run
  (classified non-affecting, below); the survivor re-arm as a manual `pgboss.job` write (the
  deploy's own sweep performs it — GD-R6OPS.3-1 arm (a)).
- **Concurrency:** the deploy ran inside a dedicated detached worktree
  (`/private/tmp/rhema-deploy-main` @ `ebfd33f2` — git refuses a second worktree on
  already-checked-out `main`). The vendored agent SDK (gitignored, operator-held) was copied in
  from the main checkout for the image-build context only; never committed.

## The eight conditions (each evidenced before the act it guards)

1. **Owned preview walk + teardown — evidence carried, honestly labelled.** No new preview was
   stood up (the ruling authorizes the deploy arm, not a second preview; GD-PREVIEW.R7's
   windows closed with pr-293's teardown). Carried: pr-293's all-16-green walk + zero-orphan
   teardown + `rm` (R7DEP.2), and the proven-deploy discipline at `e578a767`/`b8307a40`/
   `ee40639d` (R7DEP.2/3 + r7deploy-composed). The product delta in this payload is precisely
   the two ops fixes whose verification is **deploy-bound by definition** — `D-R6OPS.1-1`
   (the degrade re-proof rides the next worker deploy) and `D-BL38.1-2`/`BL-112` (the sweep
   re-arm rides the next worker deploy per GD-R6OPS.3-1 arm (a)). Both are Stage-A-pinned
   (`billing-jobs.test.ts` 401/403-degrade + 500-rethrow cases; `jobs.test.ts` 7 focused sweep
   tests) and their prod re-proofs are this deploy's own arm-5 work — no preview could have
   proven them earlier.
2. All-service image build at the tip — Cloud Build `ddc437fa` (below).
3. `pulumi preview --diff` classified — zero stateful replace/delete; additive-only migrations
   (NONE in this payload — `git diff ee40639d..ebfd33f2` touches zero `packages/db` paths);
   cost Δ ≤ $15.
4. `pulumi up --stack prod` at `ebfd33f2`.
5. `check-deploy-provenance` all-PASS on web + api.
6. `deployments` row recorded (`prod:ebfd33f2…`).
7. Committed rollback recipe (§ below) + corpus-in-web-image assertion.
8. CDN invalidation `/bff/p/demo~*` recorded.

## Pre-state (captured 2026-11-15T19:2x–19:4xZ, before any mutation)

- prod `/healthz` `build.gitSha` on web `rhema.tools` + api `api.rhema.tools`:
  `ee40639de6c3bde6080ea7135c44860815357111` (r7deploy-composed's deploy SHA) — verified live.
- prod stack export: `docs/build/logs/r7deploy-main/prod-stack-export-prestore.json`
  (182 resources).
- Migrations: `git diff ee40639d..ebfd33f2` touches ZERO `packages/db` paths — repo max stays
  `0062_drafts_discard.sql`, already applied. Nothing to apply; the additive-migration clause
  is satisfied vacuously.
- prod digests (`Pulumi.prod.yaml` at pre-state) — the rollback pins: api `005be56d…`, web
  `c9ce8640…`, worker `136bd755…`, fetcher `d65231f3…`, convert `3c14b4f1…`, export
  `ed5af8f3…`, collab `fec46d77…`, turbo-cache `2a52519d…`; run-task `77265fb6…`;
  egress-proxy `692b8d14…` (all `@sha256:` in `rhema-prod` AR — the `ee40639d`/build-`4e7ae7f5`
  set).
- **Deployed re-proof baselines** (prod `BEGIN READ ONLY` over the operator IAP tunnel
  `rhema-prod-proxy-m4g8` → `127.0.0.1:15433→10.46.0.3:5432`; system-role DSN
  `rhema-prod-proxy-database-url`, host rewritten, never printed):
  - Tombstone `01M3SK380GQX41RKMD4KVFB34Q` still sits `deleted_at=2026-09-30T21:41:10.945Z` —
    the ONLY tombstoned project on prod (`logs/r7deploy-main/prestate-tombstones.json`).
  - ZERO live `project.purge` rows under singleton `project.purge:01M3SK38…` in any state —
    the vanished-job posture 255/260 diagnosed persists pre-deploy
    (`logs/r7deploy-main/prestate-jobs.json`).
  - `usage.reconcile` still `failed` daily ×5 visible (11-11→11-15 03:15Z), `output` carrying
    `provider report fetch failed: 403` at `AnthropicAdminReportSource.fetchAll` verbatim —
    the undeployed-`ee40639d` crash shape; `assertBalances` still eaten nightly.
  - `test-tenant.purge` fires hourly (~:10Z; latest `fc44dad3` 19:10Z `completed`) — the tick
    260's sweep rides; a re-arm + purge of the tombstone is observable inside this deploy
    window.

## Payload classification (`ee40639d..ebfd33f2`, 191 commits)

- **Deploy-neutral?** No — product code changed → every `/healthz` service rebuilt at the tip.
- **Product delta:** `apps/worker` — `provider-report.ts` (`ProviderReportFetchError`, typed
  status), `billing-jobs.ts` (`handleUsageReconcile` degrades a 401/403 report-fetch denial:
  `reportError` recorded, `report_fetch_denied` paged once nightly, `assertBalances` still
  runs; non-denial faults still fail+retry — 257), `main.ts` (denial-verbatim log line +
  the hourly `handleProjectPurgeSweep` ride + FAILED logging — 257/260), `jobs.ts` (the
  tombstone re-arm sweep + purge-handler loud throw log — 260); `packages/ledger`
  `reconcile.ts` (`ReconcileAlert.kind` += `report_fetch_denied`); `packages/journeys` leg-side
  (`r7legs.ts` `U6_STUB_TURN_FIXTURE` + `fixtures/` relocation + `u6-fixture.test.ts` — 259);
  `scripts/live/first-finding-latency.mjs` (entrypoint-guard fix); `Pulumi.prod.yaml` re-pins.
  Remaining surface: docs/AGENTS/README/SECURITY/gitleaks-toml/build-records (162 files total,
  15,316+/327−).
- **Golden rule:** **NOT protocol-affecting → no re-run → $0.** The worker delta is
  ops/billing/maintenance jobs (nightly reconcile degrade, hourly tombstone watchdog,
  tenant-purge sweep, alert-kind enum) — none of it touches `packages/protocols`, the
  run/dispatch path (protocol resolution, phase defaults, URL policy freezing, delivery),
  the harness/skill phase machinery, the egress proxy's research/fetch policy, or a REQ-SEC-3
  boundary. `apps/run-task` and `apps/egress-proxy` are untouched (rebuilt for provenance
  parity only).
- **Migrations:** none (above).

## Part B — rollback recipe (committed; NOT executed — the operator's go)

Rollback of the `ebfd33f2` deploy = the r7deploy-composed recipe shape with this round's pins:
1. `git revert` the `ee40639d..ebfd33f2` range for a source rollback, OR (operator-faster)
   re-pin the pre-deploy digest set in `infra/pulumi/Pulumi.prod.yaml`: api `005be56d…`, web
   `c9ce8640…`, worker `136bd755…`, fetcher `d65231f3…`, convert `3c14b4f1…`, export
   `ed5af8f3…`, collab `fec46d77…`, turbo-cache `2a52519d…`, run-task `77265fb6…`,
   egress-proxy `692b8d14…` (the `ee40639d`/build-`4e7ae7f5` set — still in `rhema-prod` AR).
2. `pulumi up --stack prod` → `check-deploy-provenance --expect ee40639d…` all-PASS.
3. CDN invalidate `/bff/p/demo~*` again (the S-13 act is idempotent).
4. `deployments` row re-record via `record-deployment.mjs` with the reverted digests.
5. No migration rollback — the payload carried zero migrations.
6. The SPA renderer flags/keys do not exist to flip (renderer rollback is a code rollback,
   infra gotcha 7). A prod incident attributed to this deploy voids the ruling's authority —
   rollback is then the operator's go.
7. **Re-proof caveat:** a rollback reverts the worker to the pre-degrade `usage.reconcile`
   (nightly 403 crash resumes, `assertBalances` eaten) and re-orphans any tombstone the sweep
   had re-armed — record that honestly if rollback is ever exercised; `D-R6OPS.1-1` and
   `D-BL38.1-2` re-open on their live criteria.

## Progress

- 2026-11-15T19:2xZ — detached worktree `/private/tmp/rhema-deploy-main` @ `ebfd33f2` (clean,
  == origin/main); vendored SDK copied in (gitignored) for the run-task context assert;
  pre-state captured (above); payload classified non-protocol-affecting; zero new migrations;
  `pnpm install --frozen-lockfile` + `@rhema/infra`/`@rhema/protocols` dists built in-worktree
  for the record arm. IAP tunnel up on `rhema-prod-proxy-m4g8`; re-proof baselines read
  `BEGIN READ ONLY` (tombstone present; zero live `project.purge` arms; `usage.reconcile`
  failing 403 daily; `test-tenant.purge` hourly green).
- 2026-11-15T19:31Z — Cloud Build `ddc437fa-caf6-4ac7-9ffc-16f3b6cd6822` submitted: all-10 @
  `ebfd33f2`, `_AR=us-central1-docker.pkg.dev/rhema-507501/rhema-prod`, `_TAG=r7deploy-main`,
  `_ALLOW_PLACEHOLDER_SDK=0` (vendored SDK present in the context; `.gcloudignore` keeps it —
  submit from the deploy-tip worktree, the r7deploy-composed pattern). Log:
  `docs/build/logs/r7deploy-main/cloud-build-submit.log`.
- 2026-11-15T19:5xZ — **condition 2 DONE:** Cloud Build `ddc437fa` SUCCESS (~24 m), all-10
  images @ `ebfd33f2` → `rhema-prod` AR; run-task in-build vendored-SDK asserts PASS
  (`vendored native claude binary … executable by uid agent=10002` + `run-task image assert:
  vendored agent SDK readable+executable by uid agent=10002`). Digests re-verified against AR:
  `docs/build/logs/r7deploy-main/digests-ebfd33f2.txt` — api `5f2ac960…`, web `aacb7d42…`,
  worker `4f1a55a8…`, fetcher `74db8783…`, convert `2612de42…`, export `23c6bd13…`, collab
  `c3854f80…`, turbo-cache `c5454e08…`, run-task `6f021c17…`, egress-proxy `7b54bd07…`.
- 2026-11-15T19:5xZ — **condition 3 DONE — `pulumi preview --diff --stack prod` CLASSIFIED:**
  **10 updates + 1 replace, zero deletes, 169 unchanged** — 9 image rolls (8 services +
  convert job) + the `rhema-prod-proxy-mig` version pin, and the ONE replace is the
  `rhema-prod-proxy-tmpl` InstanceTemplate — a stateless immutable template the MIG rolls
  (the identical class accepted at every prior deploy). The worker's `+ [22] / - [25]` envs
  diff is the same non-converging secret-masked env-shape line the two prior deploys carried —
  cosmetic, non-stateful. **Zero stateful replace/delete, zero stateful touches. Migrations:
  none in the payload** (additive clause vacuous). **Cost Δ ≈ $0** — identical service
  count/sizing; ≤ $15. Log: `logs/r7deploy-main/pulumi-preview-diff.log`.
- 2026-11-15T19:5xZ — **condition 4 DONE:** `pulumi up --stack prod` — **update 177**, 10
  updated + 1 replaced, 1m30s, zero destructive. Log: `logs/r7deploy-main/pulumi-up.log`. The
  proxy MIG rolled (`rhema-prod-proxy-{m4g8,g556}` retired → `{t1m0,nrqg}`) — the recorded
  per-deploy pattern; the operator IAP tunnel re-established on `rhema-prod-proxy-t1m0`.
- 2026-11-15T19:5xZ — **condition 5 DONE — `check-deploy-provenance` all-PASS:**
  `rhema.tools` + `api.rhema.tools` both report `build.gitSha = ebfd33f2…`.
  Log: `logs/r7deploy-main/provenance.log`.
- 2026-11-15T19:5xZ — **condition 6 DONE — `deployments` row recorded:** `prod:ebfd33f2…`,
  `protocols_version=0.4.0+9c2b880dbee74bd8`, all-10 digests — over the operator IAP tunnel
  (`rhema-prod-proxy-t1m0` → `127.0.0.1:15433→10.46.0.3:5432`; the pre-roll tunnel on `m4g8`
  dropped mid-deploy — the recorded pattern; re-established on the new instance). Log:
  `logs/r7deploy-main/record-deployment.log`.
- 2026-11-15T19:5xZ — **condition 7 (corpus arm) DONE — corpus-in-web-image assertion:** the
  web Dockerfile's in-build `RUN test -s` on `corpus/PROVENANCE.md` +
  `snapshots/projects.json` + `snapshots/structure-of-political-difference/index.json`
  (Dockerfile L25–27) ran inside `ddc437fa` — step `#15 [builder 9/9]` DONE before the export;
  the asserted web digest `aacb7d42…` is exactly what prod serves (provenance PASS). The
  r7deploy-composed in-build-assert + AR-digest-match evidence class carries.
- 2026-11-15T19:5xZ — **condition 8 DONE — CDN invalidation:** dry-run == act on
  `rhema-prod-urlmap-6f2b86e`, host `rhema.tools`, path **`/bff/p/demo~*`** —
  `invalidate-cdn-cache` submitted (eventually consistent per-edge). Logs:
  `logs/r7deploy-main/cdn-{dry-run,invalidate}.log`.
- 2026-11-15T19:4x–20:0xZ — **arm-5 timing note:** the new worker revision
  `rhema-prod-worker-cbdaf0f-00089-tnk` deployed 19:46:48Z and enqueued its boot
  `test-tenant.purge` (`e5335665`, `singleton_key="boot"`, 19:47:33→35.8Z `completed`) — that
  firing was claimed by a draining `00088` poller inside the ~2 s race (no sweep evidence:
  tombstone intact, no `project.purge:01M3SK38…` arm, no `[worker] project.purge.sweep` log
  line — consistent with old-code claim, NOT with the sweep finding nothing: on the new code
  the tombstone unconditionally produces `scanned≥1` + a re-arm + a log line). The hourly
  `10 * * * *` tick (~20:10Z) is the first firing certain to run on the new revision — the
  re-proof reads it there.
- **Arm 5 — deployed re-proofs (below).**

## Arm 5 — deployed re-proofs at `ebfd33f2`

### (b) BL-112 / `D-BL38.1-2` — the purge watchdog LIVE, and the original loss replayed in the open: **live-verified PARTIAL**

First hourly `test-tenant.purge` tick on the deployed revision (`8c999a25`, 20:10:03.752Z →
completed 20:10:04.084Z, `pgboss.job` + Cloud Logging on
`rhema-prod-worker-cbdaf0f-00089-tnk`):

- **The sweep worked, verbatim as designed.** `20:10:04.083Z —
  [worker] project.purge.sweep → {"scanned":1,"rearmed":["01M3SK380GQX41RKMD4KVFB34Q"]}` —
  the orphaned tombstone detected and `project.purge:01M3SK38…` re-armed (job
  `a381480e-707f-4b88-919e-ebc5bc72a4f5`, `start_after` 20:10:06.230Z = grace-past immediate).
  GD-R6OPS.3-1 arm (a) — "next worker deploy auto-re-arms via the sweep" — **executed live.**
- **260's loud-logging fix worked.** Three `FAILED` lines, one per attempt:
  `20:10:04.535Z / 06.229Z / 08.227Z — [worker] project.purge 01M3SK38… FAILED — pg-boss
  retries/fails per queue policy: error: update or delete on table "drafts" violates foreign
  key constraint "claims_draft_id_fkey" on table "claims"` — the error the original armed job
  swallowed without trace is now on the record per attempt (`retry_count` 2/`retry_limit` 2,
  terminal `failed`, `output` carries the full pg error 23503 + stack;
  `logs/r7deploy-main/postdeploy-jobs-t2.json`).
- **The purge handler itself has a real, live-verified product defect** — `F-R7DEPMAIN-1` →
  **BL-113**. `handleProjectPurge`'s destroy path relies on `delete from projects` cascading
  the tree and pre-deletes only `working_copies`, `provenance_maps`, `analytics_events` —
  but prod FKs (read verbatim, `logs/r7deploy-main/postdeploy-fk-noaction.json`) mark a dozen
  project-tree leaves **NO ACTION** (`confdeltype='a'`): `claims.draft_id`,
  `findings.draft_id`, `correspondence_items.draft_id`,
  `revision_obligations.{opened_on_draft_id,finding_id}`, `obligation_findings.finding_id`,
  `gates.step_id→steps`, `working_copies.live_doc_id→live_docs`,
  `drafts.promoted_version_id→artifact_versions`, `drafts.base_draft_id→drafts`,
  `runs.parent_run_id→runs`. Draft `01M3SK386XX5RXA8W95HV83ZTF` (a `01M3SK38…` sibling —
  same review-test project) still holds **16 `claims` rows** → the keyed `delete from
  projects` throws 23503 on `claims_draft_id_fkey` — the FIRST blocker hit; siblings
  (findings, correspondence, obligations, gated steps) wait behind it. **Any project that ran
  a Review is unpurgeable by the current handler** — the 10-21 `01M5G7M7…` green almost
  certainly had no review output. `handleAccountHardDelete` (same file, L~273-340) already
  enumerates the same NO-ACTION leaf set in the right order — the fix is to reuse that
  ordering (or add the FK cascades) in `handleProjectPurge`; owner ticket, not this run.
- **The original loss is now conclusively explained.** The 10-30 armed job `57bbef6f` fetched
  at its fire instant, threw this exact 23503, retried ×2, went terminal `failed`, and the
  7-day `deletion_seconds` prune erased the evidence — the "best-supported mechanism" from
  260's read-only diagnosis, replayed deterministically with the loud logging now on.
- **Steady state is loud-and-recorded, not silent:** each hourly tick re-arms (the terminal
  `failed` row frees the singleton) and each arm fails the same way until BL-113 lands — every
  cycle leaves sweep + FAILED log lines and a `pgboss.job` row. That is the designed repair
  loop honestly churning, not a hidden stall.
- **Verdicts:** `D-BL38.1-2` stays **OPEN** — its criterion (verify select returns zero rows)
  is still unmet; the tombstone sits `deleted_at=2026-09-30T21:41:10.945Z` (read 20:1xZ).
  BL-112 stays **OPEN** — its audit question is answered (silent-fail class proven live) but
  the survivor is still tombstoned; the residual fix is BL-113. A manual tombstone clear is a
  one-off prod data write — operator-paused (ADR-013 class), not done here.

### (a) `D-R6OPS.1-1` — the deny-degrade deploys; the firing re-proof rides the cron: **dated disposition**

The 257 fix IS deployed — provenance all-PASS at `ebfd33f2`, worker revision `00089-tnk`
running the digest `4f1a55a8…` build. The row's live criterion needs the NEXT
`usage.reconcile` firing (`15 3 * * *` — next `2026-11-16T03:15Z`, ≈7.4 h past this window):
`pgboss.job` `state=completed` (not `failed`), the log line
`report=provider report fetch failed: 403` while v4 stays denied, `balances …` printed, one
`report_fetch_denied` POST at the ops sink. **Not claimed early** — the baseline was re-read
pre-deploy (5 consecutive `failed` rows 11-11→11-15 03:15Z, `output` verbatim
`provider report fetch failed: 403` at `AnthropicAdminReportSource.fetchAll`) so the contrast
at first post-deploy firing is a clean before/after. An operator enqueue could fire it sooner
— no prod write from this run. Dated disposition + recipe appended to the row.

### (c) 259's nightly-cron green — **recorded, not claimed**

`259_R6FIX.10`'s `U6_STUB_TURN_FIXTURE` fix is harness-side (the scheduled `journeys.yml`
arm runs `node dist/cli.js` from a checkout of `main` — it picks the fix up from the merge,
not this deploy). The next nightly (06:05Z) and the Monday 04:35Z paid arm are the cron's own
records; nothing claimed here beyond "the fix now rides `main` @ `ebfd33f2`, also deployed".

### Spend

Cloud Build `ddc437fa` ~24 min (~$1.1 list) + `pulumi up` (Δ≈$0) + prod `BEGIN READ ONLY`
reads $0. No funded/paid arms; golden classified non-affecting ($0). Well under any envelope.

### Records

`runs/r7deploy-main.md` (this), `pr/r7deploy-main.md`, BUILD_INDEX row 320, LEDGER PHASE LOG
`done` + `ci boundary` lines + GATE DECISIONS `GD-DEPLOY.MAIN` (the verbatim ruling — it was
not yet committed anywhere at open; recorded here), DEFERRALS dated tails on `D-R6OPS.1-1` /
`D-BL38.1-2` / `D-ECON.1-1`, BACKLOG `BL-113` opened + `BL-112` dated note, `Pulumi.prod.yaml`
re-pin comments. `nextTicket`/`lastCompleted` UNCHANGED — the committed chain is exhausted
(every row dispatched + merged through #332; the next acts are the owed operator items, the
03:15Z reconcile firing, and BL-113's fix ticket — noted, not invented).

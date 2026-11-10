# r7deploy-composed — post-acceptance prod deploy @ `ee40639d` (the orchestrator-composed tip: 250h + 250i + paid-u6 records) under the standing 2026-11-09 deploy ruling

- **Ticket:** run-time insert (no ticket file — the R7DEP.2/3 + r7deploy-tip2 precedent):
  post-acceptance prod deploy of the unmerged round-7 chain tip, authorized by the operator's
  2026-11-09 verbatim ruling recorded in `docs/build/LEDGER.md` PHASE LOG + GATE DECISIONS:
  *"clock rows? can we expedite these somehow? i want you to do everything remaining, including
  prod deploy, etc."* — disposition (b): **`pulumi up --stack prod` at the newest composed tip**
  under the same eight-condition discipline. The prior run (`runs/r7deploy-tip2.md`, PR #309)
  correctly **PAUSED**: the then-named tip `13e7d9dc` did not carry the 250h sync-pill fix — the
  tip the ruling describes did not exist. The orchestrator has since **composed it**:
  `stevevitali/r7deploy-composed` @ `ee40639d` = `r7fix-9-paid-leg-pin` (250i) +
  `r7fix-8-sync-pill` (250h) + `paid-u6-run` (#306 records), union-resolved on append-only
  records — the unblock `r7deploy-tip2.md` named, executed by the orchestrator.
- **Branch:** `stevevitali/r7deploy-composed` (it IS the deploy carrier; records commit directly
  on it. #309 stays the pause-evidence PR — cited, not superseded).
- **Deploy SHA:** `ee40639de6c3bde6080ea7135c44860815357111`. Prod pre-deploy serves `b8307a40`
  (verified live below). The composed tip carries **real deployed-product delta** vs `b8307a40`:
  `packages/tokens/src/ide-css.ts`'s scoped `.ide .ide-focus-exit` hide rule — the exact
  `D-R7FIX.8-1`/`D-R7DEP.3-1` payload `r7deploy-tip2` proved absent at `13e7d9dc`.
- **Harness:** devin-desktop/swe-2-high/subagent
- **Production mutations (ruling scope):** all-10 image build at the tip → `rhema-prod` AR;
  `pulumi preview --diff` classification → `pulumi up --stack prod`; `check-deploy-provenance`;
  `deployments` row via `record-deployment.mjs` over the operator IAP tunnel; the Cloud CDN
  invalidation of `/bff/p/demo~*` through `scripts/live/cdn-invalidate-demo.mjs`; the `P1.pill`
  prod read-only arm discharging `D-R7FIX.8-1` + `D-R7DEP.3-1` (+ `D-R7FIX.7-1`'s residual leg).
- **Not authorized / not done here:** a NEW preview walk or teardown (condition-1 evidence
  carried — below); merges (`mergePolicy: OPERATOR`); any second paid dispatch (`D-R7FIX.9-1`
  stays cron-bound — the Monday `journeys.yml` paid arm carries its own standing authority);
  golden re-run (classified non-affecting, below).
- **Concurrency:** a sibling worker holds the main worktree on `stevevitali/r6watch-early`; all
  work ran inside a dedicated worktree (`/private/tmp/rhema-compose` — the same one the
  orchestrator composed in; `git worktree add /tmp/rhema-deploy-composed` was moot — git refuses
  a second worktree on an already-checked-out branch). The vendored agent SDK (gitignored,
  operator-held) was copied in for the image-build context only; never committed.

## The eight conditions (each evidenced before the act it guards)

1. **Owned preview walk + teardown — evidence carried, honestly labelled.** No new preview was
   stood up (the ruling authorizes the deploy arm, not a second preview; pr-293's one-R7b-preview
   window closed with its teardown). Carried: pr-293's all-16-green walk + zero-orphan teardown
   + `rm` (R7DEP.2), R7DEP.3's proven-deploy discipline at `b8307a40`, and the product delta —
   the 250h CSS scoping fix — being leg-walked at Stage A on PR #307 (`p1-pill.local.test.ts`
   2/2 leg-verbatim) with its prod re-walk deploy-bound by definition (`D-R7FIX.8-1`).
2. All-service image build at the tip — Cloud Build `4e7ae7f5` (below).
3. `pulumi preview --diff` classified — zero stateful replace/delete; additive-only migrations
   (NONE in this payload); cost Δ ≤ $15.
4. `pulumi up --stack prod` at `ee40639d`.
5. `check-deploy-provenance` all-PASS on web + api.
6. `deployments` row recorded (`prod:ee40639d…`).
7. Committed rollback recipe (§ below) + corpus-in-web-image assertion.
8. CDN invalidation `/bff/p/demo~*` recorded.

## Pre-state (captured 2026-11-09T21:1xZ, before any mutation)

- prod `/healthz` `build.gitSha` on web `rhema.tools` + api `api.rhema.tools`:
  `b8307a401ba21a08cd15a7abcab2eb7c5743a506` (R7DEP.3's deploy SHA) — verified live, unchanged
  since r7deploy-tip2's pause read.
- prod stack export: `docs/build/logs/r7deploy-composed/prod-stack-export-prestore.json`
  (182 resources).
- Migrations: `git diff b8307a40..ee40639d` touches ZERO `packages/db` paths — repo max stays
  `0062_drafts_discard.sql`, already applied. Nothing to apply; the additive-migration clause
  is satisfied vacuously.
- prod digests (`Pulumi.prod.yaml` at pre-state) — the rollback pins: api `ef1da826…`, web
  `977203e8…`, worker `15a6197e…`, fetcher `d7f601c4…`, convert `79ffd171…`, export
  `09929319…`, collab `42ea4a0a…`, turbo-cache `57b48cd6…`; run-task `ff540da2…`;
  egress-proxy `90554732…` (all `@sha256:` in `rhema-prod` AR — the `b8307a40`/build-`e8883414`
  set).

## Payload classification (`b8307a40..ee40639d`)

- **Deploy-neutral?** No — product code changed → every `/healthz` service rebuilt at the tip.
- **Product delta (the whole point):** `packages/tokens/src/ide-css.ts` — the R7FIX.8 scoped
  hide rule `.ide-focus-exit` → `.ide .ide-focus-exit` (two-class specificity beats the
  `.ui-btn` primitive; the invisible fixed exit button's live hit-box over `[data-sync-pill]`
  is gone — F-R7DEP.3-1). Bundles into the web image's CSS.
- **Golden rule:** **NOT protocol-affecting → no re-run → $0.** Zero paths under
  `packages/protocols`, `apps/run-task`, `apps/worker`, `packages/orchestrator`,
  `apps/egress-proxy` or the run/dispatch path. Remaining product surface:
  `packages/journeys/src/steps.ts` (250i's R4 turn-id pin + 250h's `pillTextOverlap` export —
  leg-side, journeys runs from a checkout not a deployed image) + new local test files +
  `tokens.test.ts` (test pin) + `Pulumi.prod.yaml` (the `b8307a40` re-pins, already live) +
  docs/build records (250h/250i run ledgers, paid-u6 records, orchestrator ruling records,
  union-resolved append-only rows).
- **Migrations:** none (above).

## Part B — rollback recipe (committed; NOT executed — the operator's go)

Rollback of the `ee40639d` deploy = the R7DEP.3 recipe shape with this round's pins:
1. `git revert` the `b8307a40..ee40639d` range for a source rollback, OR (operator-faster)
   re-pin the pre-deploy digest set in `infra/pulumi/Pulumi.prod.yaml`: api `ef1da826…`, web
   `977203e8…`, worker `15a6197e…`, fetcher `d7f601c4…`, convert `79ffd171…`, export
   `09929319…`, collab `42ea4a0a…`, turbo-cache `57b48cd6…`, run-task `ff540da2…`,
   egress-proxy `90554732…` (the `b8307a40`/build-`e8883414` set — still in `rhema-prod` AR).
2. `pulumi up --stack prod` → `check-deploy-provenance --expect b8307a40…` all-PASS.
3. CDN invalidate `/bff/p/demo~*` again (the S-13 act is idempotent).
4. `deployments` row re-record via `record-deployment.mjs` with the reverted digests.
5. No migration rollback — the payload carried zero migrations.
6. The SPA renderer flags/keys do not exist to flip (renderer rollback is a code rollback,
   infra gotcha 7). A prod incident attributed to this deploy voids the ruling's authority —
   rollback is then the operator's go.

## Progress

- 2026-11-09T21:1xZ — worktree `/private/tmp/rhema-compose` on `stevevitali/r7deploy-composed`
  @ `ee40639d` (clean, == remote); vendored SDK copied in (gitignored) for the run-task context
  assert; pre-state captured (above); payload classified non-protocol-affecting; zero new
  migrations; `pnpm install --frozen-lockfile` + `@rhema/journeys`/`@rhema/infra` dists built
  in-worktree for the leg + record arms.
- 2026-11-09T21:22Z — Cloud Build `4e7ae7f5` submitted: all-10 @ `ee40639d`,
  `_AR=us-central1-docker.pkg.dev/rhema-507501/rhema-prod`, `_TAG=r7deploy-composed`,
  `_ALLOW_PLACEHOLDER_SDK=0` (vendored SDK present in the context; `.gcloudignore` keeps it —
  submit from the deploy-tip worktree, the R7DEP.3 pattern). Log:
  `docs/build/logs/r7deploy-composed/cloud-build-submit.log`.
- 2026-11-09T21:40Z — **condition 2 DONE:** Cloud Build `4e7ae7f5` SUCCESS (~18m), all-10 images
  @ `ee40639d` → `rhema-prod` AR; run-task in-build vendored-SDK assert PASS
  (`uid agent=10002` read+exec). Digests re-verified against AR:
  `docs/build/logs/r7deploy-composed/digests-ee40639d.txt` — api `005be56d…`, web `c9ce8640…`,
  worker `136bd755…`, fetcher `d65231f3…`, convert `3c14b4f1…`, export `ed5af8f3…`,
  collab `fec46d77…`, turbo-cache `2a52519d…`, run-task `77265fb6…`, egress-proxy `692b8d14…`.
- 2026-11-09T21:4xZ — **condition 3 DONE — `pulumi preview --diff --stack prod` CLASSIFIED:**
  **10 updates + 1 replace, zero deletes, 169 unchanged** — 9 image rolls (8 services + convert
  job) + the `rhema-prod-proxy-mig` version pin, and the ONE replace is the
  `rhema-prod-proxy-tmpl` InstanceTemplate — a stateless immutable template the MIG rolls (the
  identical class accepted at every prior deploy). The worker's `+ [22] / - [25]` envs diff is
  the same non-converging secret-masked env-shape line R7DEP.3's preview carried — applied at
  update 175, re-presented identically; cosmetic, non-stateful. **Zero stateful replace/delete,
  zero stateful touches. Migrations: none in the payload** (additive clause vacuous). **Cost
  Δ ≈ $0** — identical service count/sizing; ≤ $15. Log:
  `logs/r7deploy-composed/pulumi-preview-diff.log`.
- 2026-11-09T21:4xZ — **condition 4 DONE:** `pulumi up --stack prod` — **update 176**, 10 updated
  + 1 replaced, 1m32s, zero destructive. Log: `logs/r7deploy-composed/pulumi-up.log`. The proxy
  MIG rolled (`rhema-prod-proxy-{czpk,mw02}` retired → `{m4g8,g556}`) — the recorded per-deploy
  pattern; the operator IAP tunnel re-established on `rhema-prod-proxy-m4g8`.
- 2026-11-09T21:4xZ — **condition 5 DONE — `check-deploy-provenance` all-PASS:**
  `rhema.tools` + `api.rhema.tools` both report `build.gitSha = ee40639d…`.
  Log: `logs/r7deploy-composed/provenance.log`.
- 2026-11-09T21:4xZ — **condition 6 DONE — `deployments` row recorded:** `prod:ee40639d…`,
  `protocols_version=0.4.0+9c2b880dbee74bd8`, all-10 digests — over the operator IAP tunnel
  (`rhema-prod-proxy-m4g8` → `127.0.0.1:15433→10.46.0.3:5432`; system DSN
  `rhema-prod-proxy-database-url`, host rewritten, never printed). Log:
  `logs/r7deploy-composed/record-deployment.log`.
- 2026-11-09T21:4xZ — **condition 7 (corpus arm) DONE — corpus-in-web-image assertion:** the
  web Dockerfile's in-build `RUN test -s` on `corpus/PROVENANCE.md` + `snapshots/projects.json`
  + `snapshots/structure-of-political-difference/index.json` (Dockerfile L25–27) ran inside
  `4e7ae7f5` — step `#15 [builder 9/9]` DONE before the export; the asserted web digest
  `c9ce8640…` is exactly what prod serves (provenance PASS). Local docker/crane unavailable —
  the R7DEP.2/R7DEP.3 in-build-assert + AR-digest-match evidence class carries.
- 2026-11-09T21:4xZ — **condition 8 DONE — CDN invalidation:** dry-run == act on
  `rhema-prod-urlmap-6f2b86e`, host `rhema.tools`, path **`/bff/p/demo~*`** —
  `invalidate-cdn-cache` submitted (eventually consistent per-edge). Logs:
  `logs/r7deploy-composed/cdn-{dry-run,invalidate}.log`.
- 2026-11-09T21:44Z — **`D-R7FIX.8-1`/`D-R7DEP.3-1` arm — `P1.pill` prod read-only at
  `ee40639d`, provenance-matched, $0** (`docs/build/reports/2026-11-09_r7deploy-composed/prod-legs/`):
  **PASS** — `report.json` `passed:true`, provenance `match:true` (web+api `ee40639d`), spend
  $0 ≤ $5; screenshots `P1.pill.png`, `p1-pill-{390,1440}.png`. The leg that failed
  deterministically ×2 at `b8307a40` (`sync pill covers text at desktop: button "Exit focus ·
  Esc"`) is green at the deployed fix — the scoped `.ide .ide-focus-exit` hide rule wins the
  cascade as the Stage-A arm predicted. Log: `logs/r7deploy-composed/prod-legs.log`.
  - **`D-R7FIX.8-1` DISCHARGED** — the row's criterion verbatim (`P1.pill` green at the NEXT
    deployed SHA carrying the insert, `--expect-sha`, prod read-only, screenshots).
  - **`D-R7DEP.3-1` DISCHARGED** — the overlap it was opened for is gone at the deployed fix.
  - **`D-R7FIX.7-1` residual DISCHARGED → row CLOSED** — its all-8-green criterion's sole
    residual leg was `P1.pill` on the new F-R7DEP.3-1 overlap (named on the row); with `P1.pill`
    green at `ee40639d` the row's criterion is met — all eight legs have verified green at a
    deployed SHA (seven at `b8307a40`, `P1.pill` at `ee40639d`).
  - `D-R7FIX.9-1` unchanged — R4's green verdict still rides the Monday paid cron (leg-side;
    no deploy dependency).
- **Golden classification:** non-affecting payload, **$0** spent (no rerun authorized or needed).
- **Spend:** Cloud Build ~18 min (~$0.8 list) + `pulumi up` (Δ≈$0) + `P1.pill` prod read-only $0.
  No funded/paid arms.
- **Not run:** post-deploy nightly dispatch (not in the ruling's arm list); smoke/SSR sweeps
  (R7DEP.2's prod Stage-B board at `e578a767` + R7DEP.3's `D-R7FIX.7-1` legs stand; this
  deploy's product delta is exactly the `P1.pill` arm just proven).
- **Records:** `runs/r7deploy-composed.md` (this), `pr/r7deploy-composed.md`, BUILD_INDEX row
  309, LEDGER PHASE LOG `done` + `ci boundary` lines, DEFERRALS dated dispositions.
  `nextTicket`/`lastCompleted` UNCHANGED (`200_R6WATCH.1` / `R7REC.1`).
- 2026-11-09T21:5xZ — records committed `c38182a8` (run ledger, PR body, BUILD_INDEX 309, LEDGER
  PHASE LOG, DEFERRALS dispositions, `Pulumi.prod.yaml` re-pin, leg evidence) → pushed →
  **PR #312** (base `stevevitali/r7fix-9-paid-leg-pin`) → `8ea28b08` BUILD_INDEX PR-cell fix.
- **Checks:** `check-append-only.mjs --base origin/stevevitali/r7fix-9-paid-leg-pin` — **OK**.
  `check-build-memory.sh` — **2 violations + 22 warnings, both violations INHERITED, none added
  by this diff:** (a) `duplicate DEFERRALS id 'D-R7DEP.3-1'` — introduced by the orchestrator's
  union-resolve `48ea5dbd` (each source branch carries exactly one copy; the union kept both —
  r7fix-8's carries the 250h note, r7fix-9's doesn't). "Never delete a row" rules out collapsing
  it; the dated note on the first copy records the artifact and marks the canonical tail.
  (b) the OPEN-row→GATE-ACCEPT.R7 reference — the standing pre-existing class recorded at
  R7DEP.3/tip2 (34 such refs at base; this diff adds none and closes three rows, none of them
  that class). The `docs/build/logs/.gitignore` layout violation my work created was fixed
  locally before this commit (untracked, matching the main worktree's posture — the root
  `.gitignore` keeps the whole dir local-only).
- **CI boundary:** `ci-boundary.sh --pr 312` — **pass `#312@8ea28b0`** (run 42706079203 — all
  seven legs + ci-pass anchor: fast-path, typecheck/lint/unit, contracts, public-safe,
  integration, images; record `logs/ci-r7deploy-composed.json`, read 2026-11-09T22:20:32Z).

- **Closed 2026-11-09** — deploy live at `ee40639d`, provenance verified.

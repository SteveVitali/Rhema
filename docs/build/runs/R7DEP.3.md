# R7DEP.3 — post-acceptance prod deploy @ `b8307a40` (the 250g/F-round fixes head) under the 2026-11-08 fresh deploy ruling

- **Ticket:** run-time insert (no ticket file — the R6DEP.2/3/4 precedent): post-acceptance prod
  deploy of the unmerged round-7 chain tip, authorized by the operator's 2026-11-08 verbatim
  ruling recorded in `docs/build/LEDGER.md` PHASE LOG: *"I'll handle merge myself. You can just
  deploy from latest open PR's branch tip right? … Please proceed with everything and keep me
  updated."* — disposition (a): **`pulumi up --stack prod` at the latest PR tip** (`83e8f5e7`,
  PR #304 head, + the ruling-records commit `b8307a40`) under the same eight-condition discipline
  as `GD-DEPLOY.R7` — a fresh ruling since `GD-DEPLOY.R7` expired at the GATE-ACCEPT.R7 signature.
- **Branch:** `stevevitali/r7deploy-tip` (records branch forked at the deploy tip so PR #304 stays
  a clean 250g diff — the R7DEP.2 part-A/part-B split pattern).
- **Base / deploy SHA:** `b8307a401ba21a08cd15a7abcab2eb7c5743a506` (`stevevitali/r7fix-7-postround-defects`
  tip: PR #304 head `83e8f5e7` + ruling-records commit — carries the whole unmerged R7b stack +
  F-11–14 fixes). Prod pre-deploy serves `e578a767`.
- **Harness:** devin-desktop/swe-2-high/subagent
- **Production mutations (ruling scope):** all-10 image build at the tip → `rhema-prod` AR;
  `pulumi preview --diff` classification → `pulumi up --stack prod`; `check-deploy-provenance`;
  `deployments` row via `record-deployment.mjs` over the operator IAP tunnel; the Cloud CDN
  invalidation of `/bff/p/demo~*` through `scripts/live/cdn-invalidate-demo.mjs` (dry-run == act);
  prod read-only journey legs for `D-R7FIX.7-1`.
- **Not authorized / not done here:** a NEW preview walk or teardown (the ruling's condition-1
  evidence is carried — see below); merges (`mergePolicy: OPERATOR`; the operator handles merge);
  the paid-U6 re-dispatch + `house-grant` (ruling arm (b) — separate authority tracked on
  `D-R7DEP.2-1`, not this deploy arm); golden re-run (classified non-affecting, below).

## The eight conditions (ruling discipline, each evidenced before the act it guards)

1. **Owned preview walk + teardown — evidence carried, honestly labelled.** The ruling authorized
   "deploy from latest open PR's branch tip" — no NEW preview was stood up (GD-PREVIEW.R7's one-R7b-preview
   window closed with pr-293's teardown; a second preview is outside this authorization). The carried
   evidence: pr-293's full walk/teardown at `e578a767` (R7DEP.2 Part A — all-16 board green at
   `d0a77d0`, T1 re-walk green, zero-orphan teardown + `rm`), plus the `e578a767..b8307a40` payload
   being exactly the 250a–f fix rounds already leg-walked on pr-293 + the 250g fixes whose prod
   legs are deploy-bound by definition (`D-R7FIX.7-1` — discharged in this run's arm 5). The same
   legs are red on `e578a767` by construction — no preview could have proven them earlier.
2. All-service image build at the tip — Cloud Build `e8883414` (below).
3. `pulumi preview --diff` classified — zero stateful replace/delete; additive-only migrations
   (there are NONE in this payload); cost Δ ≤ $15.
4. `pulumi up --stack prod` at `b8307a40`.
5. `check-deploy-provenance` all-PASS on web + api.
6. `deployments` row recorded (`prod:b8307a40…`).
7. Committed rollback recipe (§ below) + corpus-in-web-image assertion.
8. CDN invalidation `/bff/p/demo~*` recorded.

## Pre-state (captured 2026-11-09T16:46Z, before any mutation)

- prod `/healthz` `build.gitSha` on web `rhema.tools` + api `api.rhema.tools`:
  `e578a767fbff5e8e0cfb7282541ba2bb3172744b` (R7DEP.2's deploy SHA) — verified live.
- prod stack export: `docs/build/logs/r7deploy-tip/prod-stack-export-prestore.json` (182 resources).
- Migrations: `git diff e578a767..b8307a40` touches ZERO `packages/db` paths — repo max stays
  `0062_drafts_discard.sql`, already applied at the prior deploy. Nothing to apply; the
  additive-migration clause is satisfied vacuously (no new files exist to lint).
- prod digests (`Pulumi.prod.yaml` at pre-state) — the rollback pins: api `ea5a2240…`, web
  `259973f9…`, worker `eb58889c…`, fetcher `d900ee21…`, convert `566a2efe…`, export `4314843f…`,
  collab `d920a2a9…`, turbo-cache `3fdc9d0f…`; run-task `3eb63151…`; egress-proxy `54f72452…`
  (all `@sha256:` in `rhema-prod` AR — the `e578a767`/build-`7d470657` set).

## Payload classification (`e578a767..b8307a40`)

- **Deploy-neutral?** No — product code changed → every `/healthz` service rebuilt at the tip.
- **Golden rule:** **NOT protocol-affecting → no re-run → $0.** The diff contains zero paths under
  `packages/protocols`, `apps/run-task`, `apps/worker`, `packages/orchestrator`, `apps/egress-proxy`
  or the run/dispatch path. Product surface: `apps/web` SPA (`ide/controller.ts` aria/tab gate;
  `surfaces/export.tsx` + `surfaces/voices.tsx` native `select`/`checkbox` carriers),
  `packages/tokens/ide-css.ts` (closed-drawer `visibility:hidden`), `packages/ui/files-pane.tsx`
  (`ui-t-pm`→`ui-t-mut` contrast), `packages/journeys/steps.ts` (F-9 ranged-media 206 parity —
  leg-side), eslint exemption table, tests, `Pulumi.prod.yaml` re-pins + `Pulumi.pr-293.yaml`
  removal (the stack was `rm`'d), docs/build records.
- **Migrations:** none (above).
- **F-9 leg-side fix note:** `packages/journeys/dist` is rebuilt locally for the D-R7FIX.7-1 arms;
  the corrected parity check ships in the deployed journeys artifact on next CI/nightly build.

## Part B — rollback recipe (committed; NOT executed — the operator's go)

Rollback of the `b8307a40` deploy = the R7DEP.2 recipe shape with this round's pins:
1. `git revert` the `e578a767..b8307a40` range for a source rollback, OR (operator-faster)
   re-pin the pre-deploy digest set in `infra/pulumi/Pulumi.prod.yaml`: api `ea5a2240…`, web
   `259973f9…`, worker `eb58889c…`, fetcher `d900ee21…`, convert `566a2efe…`, export
   `4314843f…`, collab `d920a2a9…`, turbo-cache `3fdc9d0f…`, run-task `3eb63151…`,
   egress-proxy `54f72452…` (the `e578a767`/build-`7d470657` set — still in `rhema-prod` AR).
2. `pulumi up --stack prod` → `check-deploy-provenance --expect e578a767…` all-PASS.
3. CDN invalidate `/bff/p/demo~*` again (the S-13 act is idempotent).
4. `deployments` row re-record via `record-deployment.mjs` with the reverted digests.
5. No migration rollback — the payload carried zero migrations; `0062`'s columns are additive
   and the `e578a767` code already runs against them.
6. The SPA renderer flags/keys do not exist to flip (renderer rollback is a code rollback,
   infra gotcha 7). A prod incident attributed to this deploy voids the ruling's authority —
   rollback is then the operator's go.

## Progress

- 2026-11-09T16:46Z — branch `stevevitali/r7deploy-tip` cut at `b8307a40`; pre-state captured
  (above); payload classified non-protocol-affecting; zero new migrations.
- 2026-11-09T16:5xZ — Cloud Build `e8883414` submitted: all-10 @ `b8307a40`,
  `_AR=us-central1-docker.pkg.dev/rhema-507501/rhema-prod`, `_TAG=r7deploy-tip`,
  `_ALLOW_PLACEHOLDER_SDK=0` (vendored SDK present in the clean tree; `.gcloudignore` keeps it —
  submit from the working checkout at the exact SHA, equivalent to R7DEP.2's worktree build).
  Log: `docs/build/logs/r7deploy-tip/cloud-build-submit.log`.
- 2026-11-09T16:59Z — **condition 2 DONE:** Cloud Build `e8883414` SUCCESS (12m14s), all-10 images
  @ `b8307a40` → `rhema-prod` AR. Digests: `docs/build/logs/r7deploy-tip/digests-b8307a40.txt`
  (re-verified against AR: api `ef1da826…`, web `977203e8…`, worker `15a6197e…`, fetcher
  `d7f601c4…`, convert `79ffd171…`, export `09929319…`, collab `42ea4a0a…`, turbo-cache
  `57b48cd6…`, run-task `ff540da2…`, egress-proxy `90554732…`).
- 2026-11-09T17:0xZ — **condition 3 DONE — `pulumi preview --diff --stack prod` CLASSIFIED:**
  **10 updates + 1 replace, zero deletes, 169 unchanged** — 9 image rolls (8 services + convert
  job) + the `rhema-prod-proxy-mig` version pin, and the ONE replace is the
  `rhema-prod-proxy-tmpl` InstanceTemplate — a stateless immutable template the MIG rolls
  (the identical class accepted at every prior deploy). **Zero stateful replace/delete, zero
  stateful touches. Migrations: none in the payload** (additive clause vacuous). **Cost Δ ≈ $0**
  — identical service count/sizing; ≤ $15. Log: `logs/r7deploy-tip/pulumi-preview-diff.log`.
- 2026-11-09T17:0xZ — **condition 4 DONE:** `pulumi up --stack prod` — **update 175**, 10 updated
  + 1 replaced, 1m31s, zero destructive. Log: `logs/r7deploy-tip/pulumi-up.log`. The proxy MIG
  rolled (`rhema-prod-proxy-{cptb,lz04}` retired → `{czpk,mw02}`) — the operator IAP tunnel
  re-established on the new instance (the recorded per-deploy pattern).
- 2026-11-09T17:1xZ — **condition 5 DONE — `check-deploy-provenance` all-PASS:**
  `rhema.tools` + `api.rhema.tools` both report `build.gitSha = b8307a40…`.
- 2026-11-09T17:2xZ — **condition 6 DONE — `deployments` row recorded:** `prod:b8307a40…`,
  `protocols_version=0.4.0+9c2b880dbee74bd8`, all-10 digests — over the operator IAP tunnel
  (`rhema-prod-proxy-czpk` → `127.0.0.1:15433→10.46.0.3:5432`; first attempt ECONNRESET on the
  pre-roll tunnel — retried on the current instance, same as R7DEP.2's mid-deploy drop).
  Log: `logs/r7deploy-tip/record-deployment.log`.
- 2026-11-09T17:2xZ — **condition 7 (corpus arm) DONE — corpus-in-web-image assertion:** the
  web Dockerfile's in-build `RUN test -s` on `corpus/PROVENANCE.md` + `snapshots/projects.json`
  + `snapshots/structure-of-political-difference/index.json` (Dockerfile L25–27) ran inside
  `e8883414` — step `#15 [builder 9/9]` DONE before the `#18` export; the asserted web digest
  `977203e8…` is exactly what prod serves (provenance PASS). Local docker/crane unavailable —
  the R7DEP.2 in-build-assert + AR-digest-match evidence class carries.
- 2026-11-09T17:2xZ — **condition 8 DONE — CDN invalidation:** dry-run == act on
  `rhema-prod-urlmap-6f2b86e`, host `rhema.tools`, path **`/bff/p/demo~*`** —
  `invalidate-cdn-cache` submitted (eventually consistent per-edge). Logs:
  `logs/r7deploy-tip/cdn-{dry-run,invalidate}.log`.
- 2026-11-09T18:0xZ — **`D-R7FIX.7-1` arm — prod read-only legs at `b8307a40`, provenance-matched,
  $0** (`docs/build/reports/2026-11-09_R7DEP.3/prod-legs/`): **7/8 green** —
  `P1.project`, `P1.runsheet`, `P1.outline`, `P1.figures`, `P1.app-new`, `T4` PASS.
  `T5` reported `discovery listed 0 items, expected 2` on first run — **retry at the SAME SHA
  PASS** (`prod-legs-retry/`): the checkbox interception is fixed (the leg found, unchecked and
  submitted `autoIncludeNew`, then Discover listed the two fixture items) — classified flake.
  **All four F-11…F-14 fixes verified at the deployed SHA.**
- **Residual — `P1.pill` FAIL, deterministic ×2 (first run + retry, identical error):**
  `sync pill covers text at desktop: button "Exit focus · Esc"` — `[data-sync-pill]` overlaps
  `[data-ide-focus-exit]` at 1440×900 when the Page is in focus view. The leg got PAST the F-11
  pick (the `/p/` link resolution is verified fixed) and failed at the next, never-before-exercised
  layer — this overlap existed under the same leg at `e578a767` too but was unreachable (the pick
  failed first). **F-R7DEP.3-1** — a real surface state, owner defect work (focus-exit vs
  sync-pill layout); carried on `D-R7DEP.3-1`. `D-R7FIX.7-1` dispositioned **partial** — the
  four fix-verifications discharged; the row's all-8-green criterion stays OPEN on the new
  finding.
- **Golden classification:** non-affecting payload, **$0** spent (no rerun authorized or needed).
- **Spend:** Cloud Build ~12 min (~$0.5 list) + `pulumi up` (Δ≈$0) + prod read-only legs $0.
  No funded/paid arms in this arm — the authorized `house-grant` + paid-U6 re-dispatch (ruling
  arm (b)) is a separate act tracked on `D-R7DEP.2-1`.
- **Not run:** post-deploy nightly dispatch (not in the ruling's arm list for this deploy; the
  scheduled nightly re-proves the board on its own cadence), smoke/SSR sweeps (R7DEP.2's
  prod Stage-B board at `e578a767` stands; this deploy's payload is the defect-fix delta whose
  legs are the `D-R7FIX.7-1` arm).
- 2026-11-09T18:5xZ — records committed `16a0eb09` (run ledger, PR body, BUILD_INDEX 304, LEDGER
  PHASE LOG, DEFERRALS dispositions, leg evidence) → pushed → **PR #305** (base
  `stevevitali/r7fix-7-postround-defects`) → `c33b51bb` BUILD_INDEX PR-cell fix.
- **Checks:** `check-append-only.mjs --base b8307a40` — **OK**. `check-build-memory.sh` —
  **1 violation + 22 warnings; the violation is PRE-EXISTING/inherited** (an OPEN DEFERRALS row
  references GATE-ACCEPT.R7 whose readout says PASSED — 34 such references exist at base
  `b8307a40`, e.g. `D-R7DEM.2c-1` re-homed on BL-100 per the gate's own (b) disposition; this
  diff adds none). The warnings are the standing ledger-budget/index-shape class.
- **CI boundary:** `ci-boundary.sh --pr 305` — **pass #305@16a0eb0** (run 42663409706 — all
  seven legs + ci-pass anchor: fast-path 46s, typecheck/lint/unit 27m40s, contracts 26s,
  public-safe 38s, integration 2m25s, images 8m36s; record `logs/ci-R7DEP.3.json`). Trailing
  `c33b51bb` is BUILD_INDEX-only (deploy-neutral).
- **Closed 2026-11-09** — deploy live at `b8307a40`, provenance re-verified post-close below.

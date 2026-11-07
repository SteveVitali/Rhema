# R7DEP.2 — the one R7b preview (walk every leg, H16, hero recording) → prod deploy under `GD-DEPLOY.R7` → Stage B → the one U6 paid run (run ledger)

- **Ticket:** `docs/tickets/250_R7DEP.2__r7b-deploy.md` (row 250, round 7 / R7b; contract)
- **Branch:** `stevevitali/r7dep-2-phase-preview` (forked off `stevevitali/r7pub-1-landing-pricing`)
- **Base / T0:** `stevevitali/r7pub-1-landing-pricing` @ `18b79c30c2b8d730414ce8fbb67d015b6a599611`
  — the R7b code tip (249a included). The operator has NOT merged the stack (mergePolicy
  OPERATOR), so the deploy SHA is the chain tip, not a post-merge `main` HEAD.
- **T1:** T0 + the hero-recording asset commit (249a's declared `HERO_RECORDING` paths).
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** implement-spec + build-memory @ `~/agent-skills`
- **Requirement ids stamped:** REQ-DACC-1…8; REQ-PUB-1/2 (B evidence + the committed recording);
  REQ-DOPS-6 (R7DEP.2 arm), REQ-DOPS-2 (assertion re-run); REQ-DWEB-10 (invalidation act);
  REQ-SPEED-5 (primary prod record); REQ-GUARD-4, REQ-PANE-4 (U3 Stage-B arm); REQ-TALK-2 (U6).
- **Started:** 2026-11-07T17:0xZ (`date -u`) · **Closed:** (open)
- **Live stage:** Part A — the ONE owned R7b phase preview `pr-<n>` (`GD-PREVIEW.R7`; round-7
  preview spend hard cap **$20**, target ≤ $16, 224's ≈$8 carried in; $0 inference). Part B —
  prod (`GD-DEPLOY.R7`, 8 conditions each evidenced before the act it guards).
- **Production mutations (ticket header scope — Part B only):** additive migration `0062` via
  `scripts/live/prod-migrate-seed.mjs` over the operator IAP tunnel (+ in-band
  `check-additive-migrations` vs prod `_migrations` max); `pulumi up --stack prod` at T1 (CI
  digests re-pinned in `infra/pulumi/Pulumi.prod.yaml` with dated comments);
  `scripts/live/record-deployment.mjs`; the Cloud CDN invalidation of `/bff/p/demo~*` through
  `scripts/live/cdn-invalidate-demo.mjs` (dry-run == act, committed); free journey legs on
  `is_test` identities; the one U6 paid run via the R4 row (`GD-UX-PAIDLEG.R7`); a post-deploy
  `gh workflow run journeys.yml` `paid=false` `expect-sha=T1`. Golden re-run: **none —
  classified NOT protocol-affecting** (below).
- **Gates:** `GD-DEPLOY.R7` (8 conditions; any failure → PAUSE) · `GD-PREVIEW.R7` ($20 round cap;
  voided at $20 → destroy + PAUSE) · `GD-GOLDEN.R7` (classified non-affecting → $0) ·
  `GD-UX-PAIDLEG.R7` (exactly one U6-class paid run < $10, target ≤ $0.50; voided ≥ $10 or by a
  second run — no retry) · `GD-PUBDELTA.R7` (enumerated deltas) · **HUMAN-H16** hosted in the
  Part A window (operator's optional UX session — recorded walked / declined verbatim /
  not-dispositioned, never fabricated) · GATE-ACCEPT.R7 expiry.

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Round-7 rows whose "unblocked by" is this
preview walk — verify + close at the R7b phase preview (evidence paths per each row):

`D-R7SHELL.1a-1`, `D-R7SHELL.1b-1`, `D-R7SHELL.1c-1` (palette + two-tenant LIVE probe),
`D-R7PANE.1-1` (U3.occlusion + U3.stopgap re-disposition), `D-R7SHELL.2-1` (extended U1.shell),
`D-R7RELOAD.1-1` (U2.noreload flip), `D-R7TALK.1a-1` (U6.chat flip), `D-R7TALK.1b-1` (Findings/
Claims latest-review tabs), `D-R7HOME.1-1` (flat list + batch-c1), `D-R7HOME.2b-1` (opens-to-Page
contract), `D-R7HOME.2a-1` (U7.import flip), `D-R7WRITE.1a-1` (format bubble + strip),
`D-R7WRITE.1b-1` (comment/fork + U5.write flip), `D-R7WRITE.2-1` (source/paper/keymap + U5.write),
`D-R7KIT.3a-1` (settings/billing/usage + /pricing; appends to D-P1.20-1), `D-R7KIT.3a2-1`
(voices), `D-R7KIT.3b-1` (run-sheet/export/import/new-project), `D-R7KIT.3c2-1` (outline+figures),
`D-R7KIT.3d-1` (batch-d surfaces), `D-R7KIT.3e-1` (dossier + U4.controls flip),
`D-R7COPY.1b-1` (markdown evidence ×4), `D-R7COPY.1c-1` (mapped error on lock_held),
`D-R7SYNC.1-1` (SYNC legs + SPEED-5 preview record), `D-R7RO.2-1` (phone reader, real UA),
`D-R7TOUR.2-1` (D2.tour re-pin + sidebar-demo), `D-R7KIT.3f-1` (29 migrated surfaces),
`D-R7GUARD.1-1` (U3.occlusion at the deployed SHA — closes at prod Stage B), `D-R7PUB.1-1`
(landing + hero recording + LCP/CLS + signed-in /pricing + ADR-127 row).

Plus `D-R7OPEN.1-1` (the R7b half — U1–U7 flips + D2.tour re-flip; closes when all are green).
Append-evidence rows (never closed unless their own criteria are met): D-PRB.07-1, D-P1.20-1,
D-FIX.1-2, D-P1.19-2. Verify-then-disposition: D-P1.17-2 (Lighthouse/axe hero arm), D-FIX.1-2
(real-UA phone), D-OBS.1-3 (nightly green on the deployed SHA).

## Pre-state (captured 2026-11-07T18:0xZ, before any mutation)

- prod `/healthz` `build.gitSha` on web + api: `4bc8cf4a73402aed782546fe233235e9807cc990`
  (R7DEP.1's deploy SHA) — verified live.
- prod `_migrations` max: `0061_demo_events.sql` (61 applied; `0062_drafts_discard.sql` the only
  newer file) — via IAP tunnel `rhema-prod-proxy-5bv1` → `127.0.0.1:15433→10.46.0.3:5432`,
  PostgreSQL 16.15 (Cloud SQL — the engine `0062` needs no portability fix for).
- prod stack export: `logs/r7dep2/prod-stack-export-prestore.json` (182 resources).
- prod digests (`Pulumi.prod.yaml` at pre-state): the R7DEP.1 `4bc8cf4a` set — the rollback pins:
  api `794c6e66…`, web `8ae9b40f…`, worker `4d771eea…`, fetcher `cf8cb11d…`, convert `44062bde…`,
  export `2a4b3e7c…`, collab `a6da4f10…`, turbo-cache `9893066c…`; run-task `762c1d99…`;
  egress-proxy `81017be4…` (all `@sha256:` in `rhema-prod` AR).

## Classification (deliverable 1 — committed before any Part B act)

- **Deploy-neutral:** non-neutral payload → every `/healthz` service rebuilt at the deploy SHA.
- **Golden rule (`4bc8cf4a..18b79c30`):** **NOT protocol-affecting → no re-run → $0** —
  item-by-item in `reports/2026-11-07_R7DEP.2/golden-classification.md` (zero `packages/protocols`
  /`run-task`/`engine`/`worker` source changes; egress-proxy test-only; orchestrator change is a
  comment-anchoring column, not dispatch; mirror changes are draft-lifecycle).
- **Migrations:** `0062_drafts_discard.sql` only — additive lint PASS (two ADD COLUMN).

## Spend opening read (deliverable 2 — `GD-PREVIEW.R7`)

- 224's measured R7a preview spend (R7DEP.1 ledger): **≈ $8** (list-price inventory — honestly
  labelled, no billing export exists, D-OPS.2-1).
- pr-259 residual carry DISCHARGED this run (2026-11-07T18:0xZ): re-ran `destroy` — 51 resources
  removed (the orphaned `rhema-pr-259-iap-ssh` firewall, not in state, deleted via gcloud after
  the network block surfaced it) → zero-orphan sweep across compute/network/firewall/addresses/
  secrets/buckets/alloydb/redis/AR/GKE/Cloud Run → `rm pr-259`. Stack gone; residual spend was
  secrets/buckets/AR/subnetwork-class (≈ pennies over 2 days).
- This preview's committed estimate: ≈ $8–11 (same component profile as pr-259 at a similar
  window; the T1 rebuild adds ~1 Cloud Build ≈ $0.4).
- **Opening balance: ≈ $8 carried + ≤ ~$11 estimate = ≤ ~$19 projected worst-case < $20 →
  PROCEED.** (Target ≤ $16 means the window must stay tight: no idle holds outside the H16
  window; teardown immediately after the T1 re-walk.) Any read reaching $20 → tear down at
  once + PAUSE.

## Requirements (ticket deliverables) / Gap table

| # | Deliverable | Layer | Status | Evidence |
|---|---|---|---|---|
| 1 | Pre-state + payload classification committed | deterministic | DONE | this ledger + golden-classification.md |
| 2 | Spend opening read < $20 headroom | live-executed | DONE | § Spend opening read (≈$8 + ≤$11 < $20) |
| 3 | Part A: preview up at T0, every paid:false D*/U* leg + screenshots; D-rows closed | staging-verified | PENDING | — |
| 4 | HUMAN-H16 window recorded (walked/declined/not-dispositioned, `date -u`) | human-completed when walked | PAUSE | the operator's act inside the preview window |
| 5 | Hero recording → T1 commit at HERO_RECORDING paths + ADR-127 row | staging-verified | PENDING | — |
| 6 | T1 in-place update + re-walk + verified teardown + spend read | staging-verified | PENDING | — |
| 7 | Part B: classified diff → migrations → `pulumi up` → provenance → invalidation → deployments row | live-executed | PENDING | — |
| 8 | Stage B at prod: every D*/U* leg green at T1 + flips + N10/P1.public/smoke | live-executed/public | PENDING | — |
| 9 | U6 paid run — exactly one, < $10 (target ≤ $0.50), mechanism recorded | live-executed | PENDING | R4 row (capUsd 0.5) planned |
| 10 | REQ-SPEED-5 timings preview + prod (N≥20, `date -u`, SHA) | live-executed | PENDING | — |
| 11 | Close-out: rollback recipe, nightly dispatch, provenance re-read, records | live-executed | PENDING | — |

## Progress

- 2026-11-07T17:0xZ — branch `stevevitali/r7dep-2-phase-preview` cut at `18b79c30` (clean, base
  pushed). Contract + all Load files read: spec §§0–8 (verbatim rulings), LEDGER `### Round 7`
  gate rows verbatim, R7DEP.1/R7PUB.1/R7SYNC.1/R6DEP.1/R6DEP.4 ledgers, golden-rerun-rule,
  PROD-BRINGUP, INTEGRATION_PLAN, infra+journeys+docs AGENTS, DEFERRALS (every R7b row mapped).
  Tooling verified: pulumi v3.261.0 (login `14stevevitali-gmail-com`), gcloud → `rhema-507501`
  (ADC live), node v26.13.0, pnpm 10.32.1, ffmpeg/ffprobe present, vendored agent SDK in
  worktree (run-task image assert will pass), playwright chromium present.
- 2026-11-07T18:0xZ — pre-state captured (above); pr-259 carry discharged; golden classification
  committed **NOT affecting**; `0062` additive PASS; spend opening read committed → PROCEED.
- 2026-11-07T18:1xZ — seed commit `f7674618` (ledger + PR body + classification) → pushed →
  **PR #293** (base `stevevitali/r7pub-1-landing-pricing`) → preview **`pr-293`**.
- 2026-11-07T18:2xZ — `init` + config (project/region/placeholderImage/deployProxyMig/
  runTaskAppArmor*/gitSha=`18b79c30`/protocolsVersion `0.4.0+9c2b880dbee74bd8`/
  googleOauthClientId) + `resend-pull`. `up` converged on **third pass** (198 resources; two
  known-transient AlertPolicy metric-propagation races — `route_5xx` then `slo_violations`,
  the same class as R6DEP.1/R7DEP.1).
- 2026-11-07T18:3xZ — Cloud Build `98c5244a` SUCCESS, all-10 images @ `18b79c30` (~13m32s;
  `_TAG=r7dep-2`, `_AR=rhema-pr-293`). NOTE: the AR repo is `rhema-pr-293` (resource name
  `…-images` is the Pulumi name, not the repo id — first submit failed at push on the wrong id).
  Digests pinned (`logs/r7dep2/pr293-digests-t0.txt`) + `appBaseUrl`/`apiPublicUrl`
  (web `…web-723313c…`, api `…api-e35a071…` run.app).
- 2026-11-07T18:5xZ — image-roll `up` (11 changes): 10 services rolled; **api revision failed
  its startup probe while the schema was absent** (crash-loop pre-migrations — expected order).
  Migrate Job `rhema-pr-293-migrate-3a1bdcf` exec `6ttcc` applied **62 migrations incl.
  `0062_drafts_discard.sql`** under the real migration role; `rhema_app_login`/`rhema_collab`
  LOGIN-enabled. Re-running `up` for the api roll.
- 2026-11-07T19:0xZ — forced a fresh api revision (`gcloud run services update … --image <digest>`,
  owned-preview act): the `rhema` db's absence had sent `00002-p9s` terminal pre-migration;
  `00003-78w` now serves. **Provenance T0: web+api `/healthz/` → `18b79c30…`** (the live route is
  the trailing-slash `/healthz/`; bare `/healthz` 404s — recorded honestly). Migrations: 62 applied
  (incl. `0062`), roles LOGIN.
- **Preview URL:** web `https://rhema-pr-293-web-723313c-tkbl73n3tq-uc.a.run.app` · api
  `https://rhema-pr-293-api-e35a071-tkbl73n3tq-uc.a.run.app` · invite `prv-293-test` ·
  digests `logs/r7dep2/pr293-digests-t0.txt` · prod IAP tunnel `127.0.0.1:15433→10.46.0.3:5432`.
- 2026-11-07T19:1xZ — `seed-invite` exec `z6jq9` succeeded → invite **`prv-293-test`** seeded.
- 2026-11-07T19:2xZ — **T0 leg walk, U-legs** (`--expect-sha 18b79c30…`, provenance match, $0,
  `reports/2026-11-07_R7DEP.2/u-legs/`): **FLIP U4.controls, U6.chat** (green, `ready-to-flip`);
  **owed U1.shell** ("no recent project row to walk into" — a returning-tenant data gap, under
  investigation: seed vs leg expectation), **owed U2.noreload** (timeout clicking the hidden
  `/p/showcase/review/` link — element not visible), **owed U3.occlusion** ("panel tab chat
  @1440×900: not enabled"), **owed U5.write** ("the inline title was not focused on the blank
  Page"), **owed U7.import** ("Conversion notes do not name the title normalization"). The five
  owed legs are recorded defects — **never fixed in-ticket** (each becomes `F-R7DEP.2-n` /
  carries its D-row open with reason).
- 2026-11-07T19:4xZ — **T0 leg walk, D-legs + smoke** (`reports/2026-11-07_R7DEP.2/d-legs/`):
  PASS — N10, P1.public, R8.showcase, D1.hub, D2.tour, D3.readonly, P1.demo, R11.demo (the eight
  incumbent greens re-proven at `18b79c30`). **FAIL R8.showcase.spa** (a GREEN leg — REGRESSION on
  the R7b surface: `a[href*="/review/"]` resolves but `element is not visible`; same hidden-link
  class as U2.noreload) and **FAIL U3.stopgap** (expected — the R7a-era ⌘J/`data-ide-desk-tab`
  asserts are superseded by `U3.occlusion` on R7b per `D-R7PANE.1-1`; needs re-disposition, not a
  fix).

### F-R7DEP.2 findings (recorded at T0 — never fixed in-ticket)

| # | Leg | Symptom at `18b79c30` | Class |
|---|---|---|---|
| F-R7DEP.2-1 | R8.showcase.spa (GREEN→fail) + U2.noreload (red→owed) | the dossier "From Review of vN"/`/review/` link resolves in DOM but `element is not visible` — invisible after the R7b findings-into-panel/layout change | real defect (regression on an existing green leg) |
| F-R7DEP.2-2 | U3.occlusion (red→owed) | `[data-ide-panel-tab="chat"]` @1440×900 `not enabled` | real defect |
| F-R7DEP.2-3 | U5.write (red→owed) | the new blank Page's inline title is not focused on open (REQ-HOME-3) | real defect |
| F-R7DEP.2-4 | U7.import (red→owed) | Conversion notes don't name `title_extracted` (237's convert warning isn't surfacing) | real defect |
| F-R7DEP.2-5 | U1.shell (red→owed) | "no recent project row to walk into" — the fresh returning tenant's recents list is empty | leg-vs-seed gap under investigation |
| — | U3.stopgap (GREEN→fail) | R7a-era asserts on a retired surface — superseded by `U3.occlusion` (`D-R7PANE.1-1`) | re-disposition (retire), not a fix |

**PAUSE — the Part A→Part B boundary for owner fixes.** The contract's defect path: these land
as `F-R7DEP.2-n` findings → owner insert rows on the chain (the R7FIX.2 shape) → re-walk on the
same preview at the advanced tip. Prod Stage B cannot honestly report green while five held legs
owe and an existing green regresses. The preview stays UP at T0 within the $20 cap for the H16
window + remaining deferral captures while the owner fixes land.

## RESUME — defect boundary closed by `250a_R7FIX.1` (PR #294, unmerged OPERATOR)

- 2026-11-07T2xZ — **250a_R7FIX.1 landed at `c426bf74`** (CI pass #294, run `42406663079`, boundary
  commit `3d790572` = the composed tip carrying this branch's Part-A records + the orchestrator's
  insert row + the fixes). F-R7DEP.2-1 (`latestReviewRunId` stamped server-side + sidebar prefers
  it), F-R7DEP.2-2 (`demo` presence-vs-value gate in `chrome.tsx`), F-R7DEP.2-3 (title focus
  re-asserted post-mount), F-R7DEP.2-4 (notes card moved inside `data-conversion-form`), F-R7DEP.2-5
  (leg-vs-fixture race — `waitFor` in the leg). `U3.stopgap` superseded by `U3.occlusion`
  (`D-R7FIX.1-2` records "verified at T1 re-walk" — this ticket's act). Records branch for the
  T1/Part-B phase: **`stevevitali/r7dep-2-t1-prod`** forked at `3d790572` (the R7DEP.1
  part-A/part-B split pattern; keeps PR #294 a clean 250a diff).
- 2026-11-07T2xZ — **HUMAN-H16 disposition: not-dispositioned.** Re-checked `docs/build/LEDGER.md`,
  `docs/tickets/DEFERRALS.md`, `docs/build/readouts/` and `git log --grep=H16` after the pause:
  no operator UX-session record exists (only `HUMAN-H14.md` in readouts). The contract records
  three honest states — walked / declined-verbatim / **not-dispositioned** — and H16 is the
  optional operator session; it blocks nothing. Recorded as not-dispositioned with `date -u`;
  if the operator runs the session later this record gets a dated addendum.

## RESUME act 2 — in-place update to the composed tip `3d790572` + re-walk

- 2026-11-07T20:5xZ — Cloud Build `60e1ced5` SUCCESS, all-10 images @ `3d790572`
  (`_TAG=r7dep-2-t1`; first resubmit `f2337378` failed at push — `_AR` needs the FULL
  `us-central1-docker.pkg.dev/rhema-507501/rhema-pr-293` path, `docker.io` default bit).
  Digests `logs/r7dep2/pr293-digests-composed.txt`; `rhema:gitSha`+image pins re-set through the
  guarded `config` verb; `up` applied 11 updates + proxy template replace (1m33s, zero destructive).
  **Provenance: web+api `/healthz/` → `3d790572…` — the same pr-293 stack, updated in place.**
- 2026-11-07T21:0xZ — **re-walk at `3d790572`** (`t1-u-legs/` + `t1-d-legs/`, `--expect-sha` match,
  $0). 11 legs green: the 8 incumbents re-proven + **U3.occlusion FLIP** (F-2 verified fixed — chat
  tab enabled at all five sizes), **U7.import FLIP** (F-4 verified fixed — Conversion notes name
  `title_extracted`), **U6.chat FLIP** (stub leg still green). Still owed/failing — see findings.
- 2026-11-07T21:1xZ — **hero-capture attempt** at `3d790572` through a localhost URL-normalizer
  (`/healthz`→`/healthz/` 307; the recipe's bare-`/healthz` provenance fetch is GFE-intercepted on
  `*.run.app` — the same quirk VERIF.2/F-OPS.1-10 documents; uncommitted tool, transparent record).
  The tour walk RAN to completion through the normalizer — then the recipe crashed deterministically
  at `hero-capture.ts:~151`: `context.cookies()` is called **after** `context.close()` in `finally`
  (`browserContext.cookies: Target … has been closed`, exit 2, no artifacts). **F-R7DEP.2-7.**

### F-R7DEP.2 findings — status after `250a_R7FIX.1` (re-walk at `3d790572`)

| # | State | Evidence |
|---|---|---|
| F-1 (R8.showcase.spa + U2.noreload) | **partial — still failing.** R8.showcase.spa fails identically: the dossier `.ui-d-l` "Clear" review link resolves but `element is not visible` (the fix stamped `latestReviewRunId` + moved the SIDEBAR item; the dossier-body link remains hidden). U2.noreload evolved: now times out on `a[href^="/p/untitled/review/"]` — the `untitled` project's review link is absent (fresh project, no review run? or leg picks the wrong row). | `t1-u-legs/`, `t1-d-legs/` report.json |
| F-2 (U3.occlusion) | **FIXED — leg green** (ready-to-flip at `3d790572`, all five sizes). | `t1-u-legs/` |
| F-3 (U5.write) | **unchanged.** "the inline title was not focused on the blank Page" — identical symptom at both SHAs; the post-mount re-assert did not close it. | `t1-u-legs/` |
| F-4 (U7.import) | **FIXED — leg green** (Conversion notes name `title_extracted`). | `t1-u-legs/` |
| F-5 (U1.shell) | **evolved.** Recents now resolve (the `waitFor` half worked) — new symptom: `/p/untitled/outline` loses the "Project › Surface" breadcrumb (or 404s). | `t1-u-legs/` |
| **F-6 (new)** | **U4.controls regression — was FLIP at T0, now owed.** The F-2 fix enabled `data-ide-panel-tab="chat"`; on `/p/untitled` the probe now counts it as ONE native-styled control (`appearance=auto`, UA radius 8px, accent `rgb(43,99,201)`, inline `border:none;background:none` — missing the migrated control class). Collateral of enabling the tab. | `t1-u-legs/` report.json |
| **F-7 (new)** | **hero-capture recipe broken end-to-end:** (a) bare `/healthz` provenance fetch has no `/healthz/` fallback — GFE-intercepted on `*.run.app` (normalizer workaround used); (b) `context.cookies()` after `context.close()` crashes the recipe deterministically after a completed walk (exit 2, no artifacts). 249a's recipe — out of scope for this ticket to patch. | run record above |

**PAUSE — second defect-boundary.** `D-R7FIX.1-2` is NOT discharged (its verify list requires
R8.showcase.spa + U2 + U5 + U1 green — all four still owe; U3.occlusion + U7.import verified).
F-1 residual, F-3 residual, F-5 evolved, F-6 + F-7 new → owner insert round 2 (the `250a` shape).
The preview stays UP at `3d790572` within the $20 cap for fix round 2's re-walk + the deferred
hero capture; tear down at once if measured spend reaches $20.

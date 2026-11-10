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
| 6 | T1 in-place update + re-walk + verified teardown + spend read | staging-verified | DONE | teardown verified (zero orphans, `rm`); spend ≈$14 vs $20 |
| 7 | Part B: classified diff → migrations → `pulumi up` → provenance → invalidation → deployments row | live-executed | DONE | all 8 conditions evidenced; update 174; provenance all-PASS |
| 8 | Stage B at prod: every D*/U* leg green at T1 + flips + N10/P1.public/smoke | live-executed/public | PART | U1–U7 all FLIP green; 12 honest reds recorded (F-R7DEP.2-9…17); D2.tour owed |
| 9 | U6 paid run — exactly one, < $10 (target ≤ $0.50), mechanism recorded | live-executed | DONE-FAILED | one R4 dispatch: 402, metered $0.00; pause per ruling |
| 10 | REQ-SPEED-5 timings preview + prod (N≥20, `date -u`, SHA) | live-executed | DONE | preview 147/119/-1; prod 123/116/-1 |
| 11 | Close-out: rollback recipe, nightly dispatch, provenance re-read, records | live-executed | DONE | recipe committed; nightly 42465216426; provenance re-PASS at close |

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

## RESUME — defect boundary round 2 closed by `250b_R7FIX.2` (PR #295, unmerged OPERATOR)

- 2026-11-07T22:xxZ — **250b_R7FIX.2 landed at `8608192b`** (CI pass #295 `142caaa`, run
  `42414115104`; boundary commit **`2817ba73`** = composed tip: my Part-B records + round-2
  fixes). Fixes: F-1 (`?view=tree` resolves `getLatestReview` in parallel — the correspondence
  join couldn't see the showcase dossier; U2's substrate picks `[data-shell-recent="showcase"]`
  explicitly), F-3 (HeadManager's REQ-COPY-7 h1-focus on settle was the claimer — it now yields
  to `[data-inline-title]` + a MutationObserver belt), F-5 (`OutlineSurface`'s `{outline:null}`
  arm emitted `PageHeader` without crumbs — same gap pre-closed on Figures/Settings), F-6 (a
  SECOND `data-ide-panel-tab="chat"` emitter in `page-chrome.tsx` was a raw button → `Button`
  primitive), F-7 (`hero-capture.ts` reads cookies inside try-before-close + fetches `/healthz/`
  first). `stevevitali/r7dep-2-t1-prod` advanced to `2817ba73` (the composed tip — records stay
  continuous on the deployed line). H16 re-checked: still **not-dispositioned**.
- 2026-11-07T22:xxZ — journeys dist rebuilt (fixed recipe in `dist/hero-capture.js`); Cloud Build
  `8622f186` all-10 @ `2817ba73` (`_TAG=r7dep-2-t1b`).
- 2026-11-07T21:5xZ — Cloud Build `8622f186` SUCCESS (~13m); digests
  `logs/r7dep2/pr293-digests-t1b.txt`; guarded `config` re-pins + `up` (11 updates + proxy
  template replace, 1m34s, zero destructive). **Provenance: web+api `/healthz/` → `2817ba73…`
  — same pr-293 stack, second in-place update.**
- 2026-11-07T21:5xZ — **T1b re-walk at `2817ba73`** (`t1b-u-legs/` + `t1b-d-legs/`, `--expect-sha`
  match, $0): **12 legs green** — 8 incumbents + **U3.occlusion, U4.controls, U6.chat, U7.import**
  all ready-to-flip (F-6 verified closed — the panel tab is the `Button` primitive now).
- 2026-11-07T21:53Z — **hero-capture REHEARSAL at `2817ba73` — recipe verified fixed** (F-7
  closed): exit 0, `/healthz/` provenance match, clip `13.72s / 763,492B / 1280×720 / no audio`,
  poster `5,765B`, manifest `violations: []` (raw scratch `/tmp/r7dep2/hero-t1b`; NOT committed —
  the committed capture runs at the final T1 SHA so the manifest's expectSha IS the deployed tip).

### F-R7DEP.2 findings — status after `250b_R7FIX.2` (T1b re-walk at `2817ba73`)

| # | State | Root-cause diagnosis for round 3 |
|---|---|---|
| F-1 (R8.showcase.spa) | **still FAILING (identical ×3).** The leg's `a[href*="/review/"]`.first() resolves the findings-desk filter-Clear `<a class="ui-d-l">` (findings-desk.tsx:141) inside the UNOPENED right panel — legitimately invisible. The dossier-letter review link exists but is not DOM-first. Leg-vs-surface selector mismatch (scope to the letter/sidebar region) or panel must not emit hidden anchors before the letter's. | `t1b-u-legs/` report.json |
| F-1b (U2.noreload) | **evolved — substrate fix worked** (rides `[data-shell-recent="showcase"]`, the `/p/<slug>/review/` hop passed), now times out on `a[href="/p/showcase/export"]` — the read-only Showcase project exposes no export affordance; the leg's export hop needs a writable project or the surface must carry it. | same |
| F-3 (U5.write) | **still FAILING (identical ×3)** — "the inline title was not focused". Root cause now precise: `data-inline-title` is emitted on the `<form>` WRAPPER (page-chrome.tsx:492) while the leg asserts `document.activeElement === [data-inline-title]`; focus lands on the inner `<input>` so the check can never pass. Fix = attribute onto the input OR leg asserts `el.contains(document.activeElement)`. | same |
| F-5 (U1.shell) | **evolved again** — outline crumb verified fixed; new symptom: "the reviews item did not become aria-current after its SPA nav" — sidebar reviews-link active-state wiring misses the `/p/:slug/review/:runId` route. | same |
| F-2, F-4, F-6, F-7 | **CLOSED** — U3.occlusion + U7.import + U4.controls green at `2817ba73`; hero-capture exit 0 with a clean manifest. | same |

**PAUSE — third defect-boundary.** `D-R7FIX.1-2`/`D-R7FIX.2-1` each partially verified (4 legs
green of their named set + the recipe proven). Four legs remain: R8.showcase.spa (selector-vs-
surface), U2.noreload (export affordance absent on read-only showcase), U5.write (attribute-vs-
assertion mismatch), U1.shell (reviews-item aria-current). All four are owner dispositions — leg
re-pins or surface wiring, never this ticket's code. Preview stays UP at `2817ba73` for the
round-3 re-walk + the real hero capture; tear down at once at $20 measured.

## RESUME — defect boundary round 3 closed by `250c_R7FIX.3` (PR #296, unmerged OPERATOR)

- 2026-11-07T23:xxZ — **250c_R7FIX.3 landed at `60f55777`** (CI pass #296, run `42419889345`;
  boundary commit **`d372de85`** = composed tip: my Part-B records + all three fix rounds).
  Fixes: R8.showcase.spa (walk hops through declared `[data-project-item]` hooks + asserts the
  `/p/<slug>/review/` landing; an unresolved `/p/:slug` fallback now fails as its own defect),
  U2 (export/settings withhold state asserted GD-class + hops detour over the first writable
  recent), U5 (`data-inline-title` moved onto the `<input>` — consumers re-pointed), U1
  (`aria-current` asserted on the item whose route family owns the landed pathname).
  `stevevitali/r7dep-2-t1-prod` advanced to `d372de85`. H16 re-checked: still
  **not-dispositioned**. Journeys dist rebuilt (the re-pinned legs are in `dist/`).
- 2026-11-08T00:xxZ — Cloud Build `b20f71b1` SUCCESS, all-10 @ `d372de85` (`_TAG=r7dep-2-t1c`);
  digests `logs/r7dep2/pr293-digests-t1c.txt`; guarded `config` re-pins + `up` (11 updates +
  proxy template replace, 1m33s, zero destructive). **Provenance: web+api `/healthz/` →
  `d372de85…` — same pr-293 stack, third in-place update.**
- 2026-11-08T00:xxZ — **T1c re-walk at `d372de85`** (`t1c-u-legs/`, `--expect-sha` match, $0):
  **U1.shell, U3.occlusion, U4.controls, U6.chat, U7.import all ready-to-flip + R8.showcase.spa
  PASS** (the ×3-incumbent-regression CLOSED — the `[data-project-item]` re-pin hopped the
  visible item). Two legs remain, both at deeper layers:

| Leg | T1c state | Root cause for round 4 |
|---|---|---|
| U2.noreload | owed — evolved | chat-send: the leg's FIRST `chatTab.click()` runs BEFORE the `]` panel-open (r7legs.ts:~1254) — the Chat tab lives in the closed right panel (`aria-selected` but invisible) → the unconditional first click times out. Re-order: open panel → wait `[data-panel="open"]` → click. |
| U5.write | owed — evolved | title-focus assert now PASSES (F-3 closed); new layer: `editor.selectText()` never surfaced `[data-format-bubble]` (10s waitFor timeout) — bubble arm vs SPA selection. |
| R8.showcase.spa | **PASS** | — |
| U1/U3/U4/U6/U7 | ready-to-flip | — |

**PAUSE — fourth defect-boundary.** `D-R7FIX.1-2`/`D-R7FIX.2-1`/`D-R7FIX.3-1` each verified
partial; two legs remain (U2 chat-send sequencing, U5 format-bubble arm). Owner round 4. Preview
stays UP at `d372de85`; ~$11.5 of $20; tear down at once at $20 measured.

## RESUME — defect boundary round 4 closed by `250d_R7FIX.4` (PR #297, unmerged OPERATOR)

- 2026-11-08T01:xxZ — **250d_R7FIX.4 landed at `3833209`** (CI pass #297, run `42424967401`;
  records-head re-read `e143828f` also all-green, run `42427709159`; **`e143828f` = composed
  tip**: my Part-B records + all four fix rounds). Both remaining legs were leg-side bugs, the
  surface honest: U2's `chatTab.click()` re-ordered to the reader's sequence (blur → `]` →
  `waitForSelector('.ide[data-panel="open"]')` → click; the `.catch` swallow removed); U5's
  `selectText()` replaced with a real pointer-drag across the paragraph (the bubble mount was
  intact at head — the arm had never been exercised because title-focus failed ×3 first).
  `stevevitali/r7dep-2-t1-prod` advanced to `e143828f`. H16 re-checked: still
  **not-dispositioned**. Journeys dist rebuilt; Cloud Build `40eda3ed` all-10 @ `e143828f`
  (`_TAG=r7dep-2-t1d`).
- 2026-11-08T02:xxZ — Cloud Build `40eda3ed` SUCCESS, all-10 @ `e143828f`; digests
  `logs/r7dep2/pr293-digests-t1d.txt`; `up` 11 updates + proxy replace (1m34s, zero destructive).
  **Provenance: web+api `/healthz/` → `e143828f…` — fourth in-place update.**
- 2026-11-08T02:xxZ — **T1d re-walk at `e143828f`** (`t1d-u-legs/`, `--expect-sha` match, $0):
  **U1.shell, U4.controls, U6.chat, U7.import ready-to-flip + R8.showcase.spa PASS** (green ×2
  runs). `U3.occlusion` reported owed on "right panel did not open on demand @1440×900" — an
  isolated retry at the SAME SHA **PASSED** (`/tmp/r7dep2/u3-retry`; the `]` press raced the
  listener mount — recorded as a timing flake for the owner, not a regression). Two legs remain:

| Leg | T1d state | Root cause for round 5 |
|---|---|---|
| U2.noreload | owed — evolved | chat-send now passes; the peer-recent hop's `.first()` `[data-shell-recent]:not(=showcase)` resolves `untitled-4` — in DOM but `element is not visible` (the recents group renders it collapsed/overflowed; leg needs the first VISIBLE writable recent or a disclosure step). |
| U5.write | owed — evolved | title-focus + pointer-drag bubble BOTH pass now; `[data-comment-submit]` is absent after the comment composer opens (composer mounts, its submit hook isn't where the leg expects — or the anchored selection didn't persist). |
| U3.occlusion | **ready-to-flip** (retry PASS, first-run `]`-press race recorded) | — |
| U1/U4/U6/U7, R8.showcase.spa | green | — |

**PAUSE — fifth defect-boundary.** Two legs remain (U2 recents visibility, U5 comment-submit
hook) — both owner dispositions again. U3's flake is worth a hardening note but its retry is
green at the same SHA. Preview stays UP at `e143828f`; ~$12 of $20; teardown at once at $20.

## RESUME — defect boundary round 5 closed by `250e_R7FIX.5` (PR #298, unmerged OPERATOR)

- 2026-11-08T03:xxZ — **250e_R7FIX.5 landed at `56ee2333`** (CI pass #298 `fd7da3f`, run
  `42431069420`; records head **`5d001e6b`** = composed tip: my Part-B records + all five fix
  rounds). U2 = leg bug (the `]` left the panel open → rail recents honestly hidden; the leg now
  closes it before the peer pick); U5 = REAL surface defect (`onDocSelectionChange` closed the
  format-bubble when the composer's own `input.focus()` collapsed the doc selection — the
  composer self-destructed on open; collapse-close now exempts a menu holding
  `document.activeElement`, covering the Link composer's latent defect too); U3's `]`-press race
  hardened in u3-probe (blur + open/closed waits + one retry on both toggle arms).
  `stevevitali/r7dep-2-t1-prod` advanced to `5d001e6b`. H16 re-checked: still
  **not-dispositioned**. Journeys dist rebuilt; Cloud Build `c2d595fd` all-10 @ `5d001e6b`
  (`_TAG=r7dep-2-t1e`).
- 2026-11-08T04:xxZ — Cloud Build `c2d595fd` SUCCESS; digests `logs/r7dep2/pr293-digests-t1e.txt`;
  `up` 11 updates + proxy replace (1m26s, zero destructive). **Provenance: web+api `/healthz/` →
  `5d001e6b…` — fifth in-place update.**
- 2026-11-08T04:xxZ — **T1e re-walk at `5d001e6b`** (`t1e-legs/`, `--expect-sha` match, $0):
  **15 of 16 walked legs green** — 8 incumbents PASS + **U1.shell, U2.noreload, U3.occlusion,
  U4.controls, U6.chat, U7.import ready-to-flip** (U2's panel-close + peer-pick fixes verified)
  + **R8.showcase.spa PASS** (×3 consecutive). **ONE leg remains:**

| Leg | T1e state | Root cause for round 6 |
|---|---|---|
| U5.write | owed — evolved | title-focus ✓, pointer-drag bubble ✓, composer-survives-own-collapse ✓, `[data-comment-submit]` clicked — but `[data-comment-card]` never became visible post-submit (30s). The anchored margin card didn't render (POST failed? card hook differs? anchored selection lost?). |

**PAUSE — sixth defect-boundary.** `D-R7FIX.1-2…D-R7FIX.4-1` all verified; `D-R7FIX.5-1` partial
(U2 closed; U5 remains at a deeper layer). ONE leg owes round 6. Preview stays UP at `5d001e6b`;
~$13.5 of $20; teardown at once at $20.

## RESUME — defect boundary round 6 closed by `250f_R7FIX.6` (PR #299, unmerged OPERATOR)

- 2026-11-08T05:xxZ — **250f_R7FIX.6 landed at `d0a77d0`** (CI pass #299, run `42436202046`,
  first-read green; **`d0a77d0` = composed tip**: my Part-B records + all six fix rounds).
  U5's last root cause was a REAL defect: `EditorEventBridge` (the `rhema:comment-added` →
  invalidateQueries seam) mounted only in `VersionPageSurface`, not `ProjectPageSurface` — the
  working-head Page POSTed the note but never refetched so `page.doc.comments` stayed empty and
  the card could never mount. Fixed: `ProjectPageSurface` wrapped in ToastProvider + the bridge
  (lands the REQ-WRITE-7 fork-undo toast too); the toast.tsx `aria-allowed-role` latent violation
  fixed alongside. `stevevitali/r7dep-2-t1-prod` advanced to `d0a77d0`. H16 re-checked: still
  **not-dispositioned**. Journeys dist rebuilt `--force`; Cloud Build `1f40a059` all-10 @
  `d0a77d0` (`_TAG=r7dep-2-t1f`).
- 2026-11-08T06:xxZ — Cloud Build `1f40a059` SUCCESS; digests `logs/r7dep2/pr293-digests-t1f.txt`;
  `up` 11 updates + proxy replace (1m34s, zero destructive). **Provenance: web+api `/healthz/` →
  `d0a77d0…` — sixth in-place update.**
- 2026-11-08T06:xxZ — **T1f re-walk at `d0a77d0` — ALL 16 LEGS GREEN** (`t1f-legs/`,
  `--expect-sha` match, $0): 8 incumbents PASS + **U1.shell, U2.noreload, U3.occlusion,
  U4.controls, U5.write, U6.chat, U7.import ALL ready-to-flip** + **R8.showcase.spa PASS** (×4
  consecutive — the regression durably closed). **The board is closed** — every `F-R7DEP.2-*`
  finding verified fixed at the deployed tip; `D-R7FIX.1-2…D-R7FIX.6-1` dispositions follow.
- 2026-11-08T22:0xZ — **committed hero capture at `d0a77d0`** (the fixed recipe, `/healthz/`
  provenance): clip `13.8s / 780,708B / 1280×720 / no audio` sha256 `8f4bda23…`, poster `5,769B`
  sha256 `d3d51548…`, manifest `violations: []` → `docs/build/reports/2026-11-08_R7DEP.2/hero-recording-manifest.json`.
  Assets landed at the declared `HERO_RECORDING` paths; `licenses.exceptions.json`
  `demo-hero-recording` + `LICENSES.md` completed with bytes+sha256; `.gitignore` gained
  `!apps/web/public/media/` (the generated-bundle ignore needed a declared-asset carve-out).
- 2026-11-08T22:0xZ — **REQ-SPEED-5 preview record** @ `d0a77d0`, N=20: **hard-open p75 147 ms**
  (≤1.2 s ✓), **warm-open p75 119 ms** (≤400 ms ✓), **pending 0 samples** (the skeleton never
  painted — no regressions recorded; `gated:false`). JSON in the speed-leg output.
- 2026-11-08T22:0xZ — `public-ssr-baseline` @ `d0a77d0` → `public-ssr-baseline-t1f/baseline.json`:
  all 5 public routes 200/SSR. 2 WARNs recorded (not gates): `/login` carries banned copy
  "private beta" (F-R7DEP.2-8 — copy defect for the tail) and `/showcase` lacks the sample-dossier
  text leg (the workspace Showcase now owns that surface).
- 2026-11-08T22:0xZ — **two-tenant BFF probe: UNMEASURABLE (skipped-with-reason)** — `B:/bff/*`
  all 401 (the jrn-b session was never minted/expired on this stack) and A lacks the
  `JRN-<nonce>-TENANTA`/`VOICEA` markers the X1 leg plants — the probe's inputs don't exist in
  this window; NOT a tenant-isolation failure. Anonymous `/bff/app` → 401 `unauthenticated` ✓
  (the one leg that could run). Bodies preserved under `two-tenant-t1f/`.
- 2026-11-08T22:1xZ — **T1 = `e578a767fbff5e8e0cfb7282541ba2bb3172744b`** — committed + pushed:
  the all-16-green board, U1–U7 `expected:"green"` flips, hero assets + license records,
  `D-R7FIX.*-N` + staging `D-R7*` dispositions. (Environment incident: local disk hit 100% —
  gcloud crashed on temp; ~7 GB of regenerable caches freed; the T1 push reached the remote.)
- 2026-11-08T22:4xZ — Cloud Build `0b004712` SUCCESS, all-10 @ `e578a767`; digests
  `pr293-digests-t1final.txt`; `up` (7th in-place update, zero destructive). **Provenance:
  web+api `/healthz/` → `e578a767…`.**
- 2026-11-08T22:5xZ — **T1 re-walk set PASS** (`t1-rewalk/`): N10, R8.showcase, P1.public, D1.hub,
  U1.shell, R8.showcase.spa all green at `e578a767`. **Hero vitals**: landing LCP **184–304 ms**
  (≤2.5 s ✓) + CLS **0.000** (≤0.05 ✓) at 1440+390, clip arm live at both widths (the
  reduced-motion arm is the video's poster frame — no autoplay by design; markup violations []).
  Landing/pricing screenshots `t1-landing/`.
- 2026-11-08T23:2xZ — **teardown act 1 `destroy pr-293` ran** — 138 deleted; ONE residual:
  `gcp:compute:Subnetwork rhema-pr-293-private-app` blocked by the Google-managed serverless
  address `serverless-ipv4-cloudrun-1794077420824796023` (still RESERVED — the Cloud Run VPC
  lease auto-releases after service deletion; same orphan class as pr-259's `iap-ssh` residual).
  Direct `gcloud compute addresses delete` refused (used by
  `//serverless.googleapis.com/.../addressReservations/…`). **RETRY: re-run
  `node scripts/live/preview-stack.mjs destroy pr-293` after the reservation releases
  (~30–60 min post-service-delete), then the zero-orphan sweep, then `rm pr-293`, then the
  spend read.** The stack is otherwise reduced to network residue.
- 2026-11-08T23:5xZ/00:1xZ — **destroy retries #2+#3:** 9 more deleted (147 total); the
  `serverless-ipv4-cloudrun-1794077420824796023` lease is STILL `RESERVED` at ~55 min post-delete
  (auto-release timing varies; a passive GCP wait — the preview surface is down, only network
  residue remains: ~54 stack resources, all behind the held subnet). **RETRY LOOP (operator may
  run):** `gcloud compute addresses describe serverless-ipv4-cloudrun-1794077420824796023
  --region us-central1 --format='value(status)'` — when the read 404s/IN_USE clears, re-run
  `node scripts/live/preview-stack.mjs destroy pr-293` → orphan sweep → `rm pr-293` → spend read.
- NEXT: destroy-retry → orphan sweep → `rm` → spend read → **Part B** GD-DEPLOY.R7's 8
  conditions → prod `pulumi up` @ `e578a767` → provenance → deployments row → CDN invalidate
  `/bff/p/demo~*` → corpus-in-image → Stage B at T1 → U6 paid (<$10) → SPEED-5 prod → nightly
  dispatch → close-out records/PR/CI boundary.

## Teardown completion + Part B + Stage B (2026-11-08, prod @ `e578a767`)

- 2026-11-08T01:0xZ — **GCP lease released** (~60+ min hold): `serverless-ipv4-cloudrun-…023`
  gone. **`destroy pr-293` retry #4 deleted the remaining 51 resources** (subnet, network,
  secrets, buckets, AR repo, cert, SAs — 34 s). **Zero-orphan sweep: 9 families all 0**
  (run services/jobs, secrets, buckets, networks, subnets, AR, addresses, certs). **`rm
  pr-293` done.** One R7b preview created total; the surface was down from act 1.
- **Preview spend record (round-7 vs $20 cap, target ≤$16):** list-price estimate ≈ **$14**
  ($8 carried R7a + ~$2.6 uptime + ~$3.7 builds); preview inference $0. Under cap.
- 2026-11-08T08:0xZ — **Part B under `GD-DEPLOY.R7` — all eight conditions evidenced in
  order:**
  1. **Preview walk done + teardown verified** — the full T0 walk + T1 re-walk above;
     destroy→zero-orphan→`rm` complete (this section).
  2. **All-service image build at the tip** — Cloud Build **`7d470657`** SUCCESS, all-10 @
     `e578a767` (`_TAG=r7dep-2`, `_AR=…/rhema-prod`, `_ALLOW_PLACEHOLDER_SDK=0`; built from a
     `git worktree` checkout at the exact SHA; the earlier `0b004712` digests died with the
     pr-293 AR — a fresh prod push is the of-record artifact). Digests re-verified against AR.
  3. **`pulumi preview --diff --stack prod` classified** — **10 updates + 1 replace, zero
     deletes, zero stateful touches** (169 unchanged): 9 image swaps (8 services + convert
     job) + MIG version pin + the `rhema-prod-proxy-tmpl` InstanceTemplate replace — a
     stateless immutable template (the MIG rolls instances; identical class to R7DEP.1's
     replace). Migrations additive-only (`0062` ADD COLUMN ×3). **Cost Δ ≈ $0** — same
     service count/sizing. Under the ≤$15 bound.
  4. **Migration applied first** — `prod-migrate-seed` over the operator IAP tunnel:
     `[lint] 1 migration additive` → `applied 0062_drafts_discard.sql` → 62 recorded →
     protocol+agent-type seeds idempotent. **`pulumi up --stack prod` update 174** (1m42s)
     → **`check-deploy-provenance` all-PASS: web `rhema.tools` + api `api.rhema.tools` both
     report `e578a767…`**.
  5. **`deployments` row recorded** — `prod:e578a767…`,
     `protocols_version=0.4.0+9c2b880dbee74bd8`, all-10 digests.
  6. **Rollback recipe committed** — § below (the `4bc8cf4a`/`c6d7dedb` digest set recorded
     at pre-state; never executed without the operator).
  7. **Corpus-in-web-image assertion** — in-build `RUN test -s` on `corpus/PROVENANCE.md` +
     `snapshots/projects.json` + `structure-of-political-difference/index.json` (web
     Dockerfile L25–27) ran inside `7d470657` — step `#15 [builder 9/9]` PASSED before the
     `#18` export; the asserted digest `259973f9…` is exactly what prod serves (provenance
     PASS). Local docker/crane unavailable — in-build assert + AR digest match carried.
  8. **CDN invalidation** — dry-run == act on `rhema-prod-urlmap-6f2b86e`, host
     `rhema.tools`, path **`/bff/p/demo~*`**: `invalidate-cdn-cache` submitted (eventually
     consistent per-edge).
- 2026-11-08T08:4xZ — **Stage B at prod T1** (`prod-stageb/`, 150+ captures): **U1–U7 ALL
  FLIP GREEN** at the deployed SHA (shell, noreload, occlusion, controls, write, chat,
  import), plus D1.hub, D3.readonly, P1.demo, R11.demo, P1.public, N10, R8.showcase,
  R8.showcase.spa, R8.prefs, R8.inbox, X1.*, T1–T3/T17, C1, R1/R5/R7/R10.keepalive, N2–N4/N7.
  **`D-R7GUARD.1-1` closes** (U3.occlusion green at the deployed SHA). **Honest red tally
  (12 legs — recorded, not flipped):**
  - **NEW at T1** (green on the 4bc8cf4a nightly): **D2.tour** — bundle parity counts the
    hero clip's HTTP **206** (correct ranged-video response, new at T1 — the clip first
    exists at `e578a767`) as a failed asset response → **F-R7DEP.2-9** (leg/asset-class
    mismatch; the flip 250 was to cite stays OWED); **N9** — "Buy 1,000 credits" copy gone
    on the R7b pricing surface → **F-R7DEP.2-10**; **P1.project/pill/runsheet/outline/
    figures** — `a[href^="/p/"]`.first() resolves the `showcase-copy` shell-recent link
    parked outside the scroll viewport (the R7b recents row the R7FIX.3 R8 fix already had
    to steer around — the older legs lack that steering) → **F-R7DEP.2-11**;
    **P1.app-new** — 2 WCAG-AA violations (aria-allowed-attr on the chat ghost tab +
    color-contrast `.ui-t-pm`) → **F-R7DEP.2-12**; **T4** citation-style select absent →
    **F-R7DEP.2-13**; **T5** autoInclude checkbox intercepted by its card → **F-R7DEP.2-14**.
  - **Still-red, pre-existing** (red on the 4bc8cf4a nightly too): N1/N3 magic-link verify
    (error shape evolved `waitForURL`-timeout → `ERR_TOO_MANY_REDIRECTS` on the R7b /app
    boundary) → **F-R7DEP.2-15**; N8 fork banner; T6 restore window → **F-R7DEP.2-16**.
  - **Skipped-with-reason:** T7/R6F/T12F/T13F need `JOURNEY_DATABASE_URL` (not bound to the
    local run); T8 owed per `D-FIX.1-1`. **U3.stopgap** fails (superseded leg of record —
    U3.occlusion green is the R7b arm; its registry `expected` stays `green` and the red
    row is recorded, not hidden).
  - The green flips U1–U7 are ALREADY `expected:"green"` since T1; this Stage B is the
    deployed-SHA citation that completes them. D2.tour's flip is NOT cited — it stays owed.
- 2026-11-08T08:5xZ — **The ONE U6 paid run (`GD-UX-PAIDLEG.R7`): FAILED — pause per
  ruling.** Mechanism: the 232-updated paid `R4` row (`--paid --steps R4 --headroom 0.5`;
  `capUsd` $0.50 ∈ [$0.50,$10) at the ≤$0.50 target; `cogsLevers {testCheapRoute:false}`
  applied; Base-tier journey identity). Preflight: system-role DSN (bypass_rls `true`),
  ISO-week metered **$3.34352 < $5** (`WEEKLY_PAID_CAP_USD`). Outcome: the turn POST got
  **HTTP 402** — the fresh journey identity's wallet carried no credits; the turn-status
  poll never returned `optimistic`; the leg failed at 156 s. **Metered spend for the
  dispatch: $0.00** (usage_records delta over the window: 0; debits == metered burn: both
  $0). Weekly total remains $3.34352. **No second run** — the single authorized dispatch
  was consumed; any re-dispatch needs fresh operator authority (ruling voided-by is not
  met: no ≥$10 spend, no second run). No `funded-pause.json` exists (a plain failure, not
  cap_overrun); none created, none cleared. **F-R7DEP.2-17** (prod paid-leg funding seam:
  the R4 identity had no credit path on prod at T1).
- 2026-11-08T08:59Z — **REQ-SPEED-5 prod primary record** @ `e578a767`, N=20,
  slug `demo~the-borrowed-commons`: **hard-open p75 123 ms** (≤1200 ✓), **warm-open p75
  116 ms** (≤400 ✓), pending-indicator −1 (0 samples — none painted; no regression).
- 2026-11-08T08:59Z — **post-deploy nightly dispatched** — run `42465216426`
  (`paid=false`, `expect-sha=e578a767…`, ref `stevevitali/r7dep-2-t1-prod`):
  https://github.com/SteveVitali/Rhema/actions/runs/42465216426 — tally recorded when it
  lands (it re-proves the same paid:false board this Stage B ran).
- **Golden classification:** non-affecting payload, **$0** spent (no rerun authorized or
  needed — R7a→R7b diff had no protocol touch; 0062 additive).

## Part B — rollback recipe (committed; NOT executed — the operator's go)

Rollback of the R7b deploy = the R7DEP.1 recipe shape with this round's pins:
1. `git revert` the R7b range for a source rollback, OR (operator-faster) re-pin the
   pre-deploy digest set in `infra/pulumi/Pulumi.prod.yaml`: api `794c6e66…`, web
   `8ae9b40f…`, worker `4d771eea…`, fetcher `cf8cb11d…`, convert `44062bde…`, export
   `2a4b3e7c…`, collab `a6da4f10…`, turbo-cache `9893066c…`, run-task `762c1d99…`,
   egress-proxy `81017be4…` (the `4bc8cf4a`/`c6d7dedb` set — still in `rhema-prod` AR).
2. `pulumi up --stack prod` → `check-deploy-provenance --expect 4bc8cf4a…` all-PASS.
3. CDN invalidate `/bff/p/demo~*` again (the S-13 act is idempotent).
4. `deployments` row re-record via `record-deployment.mjs` with the reverted digests.
5. No migration rollback — `0062` is additive columns; the `4bc8cf4a` code ignores them.
6. The SPA renderer flags/keys do not exist to flip (renderer rollback is a code rollback,
   gotcha 7). A prod incident attributed to this deploy voids `GD-DEPLOY.R7` — rollback
   is then the operator's go.
- 2026-11-08T09:4xZ — **post-deploy nightly `42465216426` completed: FAIL (honest tally).**
  Its reds largely match the direct Stage-B set — N1/N3 (magic-link loop), N8, T4/T5/T6,
  P1.project/pill/runsheet/outline/figures, P1.app-new — plus DB-bound legs that ran there:
  T7 (purge-job variant), T12F/T13F — and **U2.noreload + U5.write evolved again** (the two
  flakiest seams: `.first()` recent pick / bounding-box — they were green in the direct run).
  **D2.tour PASSED on the nightly** — the direct run's 206-parity fail did not reproduce
  (CDN-warmed path; F-9 stays open as the intermittent-class record, the leg is deploy-green).
- 2026-11-08T09:3xZ — **CI boundary first read: FAIL on #300 (typecheck/lint/unit, run
  42465484349)** — three test-side gaps surfaced by the flip commit, none product code:
  `registry.test.ts` + `runner.test.ts` pinned the pre-flip owed census (U1–U7 now green),
  `marketing.test.ts` pinned `data-hero-placeholder` on the served `/` (the committed clip
  makes the server render `data-hero-video`). Fixed as flip-catch-up at `53946e6f` (the
  placeholder arm is now proven via `heroClip:false`; the round-7 census asserts green +
  real-fail classification). 48/48 tests in the three files re-run green locally.
- 2026-11-08T10:2xZ — **CI boundary second read:** `typecheck/lint/unit` PASS at `53946e6f`
  (the flip-catchup) + fast-path/contracts/public-safe green; **`images` leg FAIL twice on the
  SAME external cause: `curl (22) 504` fetching pandoc+typst from github.com releases** (the
  convert Dockerfile's pinned-download step). Not diff-caused — the identical image built clean
  in Cloud Build `7d470657` ~1 h earlier; a github release-CDN outage window. Rerun #3 queued;
  record `logs/ci-R7DEP.2.json`.
- 2026-11-08T11:1xZ — **CI boundary final read: EXTERNALLY-BLOCKED, not diff-caused.** At
  `474d49be`: fast-path + typecheck/lint/unit + contracts + public-safe all PASS (the
  flip-catchup holds); `integration` + `images` legs FAIL ×3 attempts on the SAME external
  cause — github.com release/archive fetches (pandoc, typst, dumb-init tarballs) answering
  504/failed through a sustained github CDN outage window (~2.5 h). The identical images
  built clean in Cloud Build `7d470657` (the deploy artifact itself). Record
  `logs/ci-R7DEP.2.json`; the boundary re-reads when the upstream recovers — rerun
  `gh run rerun <run> --failed` on run `42470880492`, then `ci-boundary --pr 300`.

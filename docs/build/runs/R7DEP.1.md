# R7DEP.1 — R7a deploy: the one R7a phase preview (Part A) → H15 hold → prod under GD-DEPLOY.R7 (Part B) (run ledger)

- **Ticket:** `docs/tickets/224_R7DEP.1__r7a-deploy.md` (row 224, round 7 / R7a; contract)
- **Branch:** `stevevitali/r7dep-1-r7a-deploy` (forked off `stevevitali/r7dem-6b-metrics`)
- **Base:** `stevevitali/r7dem-6b-metrics` @ `8f6ef4781d470172e4e2c4bb15ab8543288c107a` (chainTip)
- **Deploy SHA:** `8f6ef4781d470172e4e2c4bb15ab8543288c107a` — the R7a chain tip. The operator has
  NOT merged the R7a stack (PRs #240–#258 open, mergePolicy OPERATOR), so the deploy SHA is the
  chain tip, not a post-merge `main` HEAD (ticket deliverable 4's first arm).
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** implement-spec + build-memory + self-review @ `~/agent-skills`
- **Requirement ids stamped:** REQ-DOPS-6 (R7a half); REQ-DACC-1…6 (Stage-B evidence at the
  deployed tip); the B halves of REQ-DWEB-6/9/10/11/14/16, REQ-TOUR-1/2/4.
- **Started:** 2026-11-04T19:12Z (`date -u`) · **Closed:** (open — Part A in flight)
- **Live stage:** Part A — the one owned R7a phase preview `pr-<n>` (GD-PREVIEW.R7; target ≤ $8
  of the $20 round cap shared with 250; $0 inference). Part B — prod, gated on HUMAN-H15.
- **Production mutations (ticket header, verbatim scope — Part B only):** prod migration of
  `demo_events` via `scripts/live/prod-migrate-seed.mjs` (+ in-band `check-additive-migrations`
  vs the prod `_migrations` max); `pulumi up --stack prod` at the deploy SHA (all-service CI
  digests copied to `rhema-prod` AR, re-pinned in `infra/pulumi/Pulumi.prod.yaml` with dated
  comments); `scripts/live/record-deployment.mjs`; a Cloud CDN invalidation of `/bff/p/demo~*`
  on the prod URL map through the scripted path authored here (dry-run == act); CONDITIONAL one
  minimal-cohort golden re-run ≤ $100 only if deliverable 1 classifies protocol-affecting.
- **Gates:** `GD-DEPLOY.R7` (8 conditions, each evidenced before the act it guards; any failure
  → PAUSE) · `GD-PREVIEW.R7` ($20 round preview cap; voided at $20 → destroy + PAUSE) ·
  `GD-GOLDEN.R7` (≤1 minimal-cohort re-run ≤ $100, only if classified protocol-affecting) ·
  `GD-PUBDELTA.R7` (enumerated public-delta additions) · **HUMAN-H15 unticked → PAUSE at the
  Part A/Part B boundary** (the pause is internal to this ticket).

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows this ticket must verify + close at the
R7a phase preview (`staging-verified at the R7a phase preview (224)`):

- **D-R7OPEN.1-1** — the 14 registered round-7 legs report `owed` then flip green at their
  phase preview. R7a half: D1.hub, D2.tour, D3.readonly, P1.demo, R11.demo, U3.stopgap,
  R8.showcase.spa (R7b legs stay open to 250).
- **D-R7KIT.1-1** — native controls render themed on six surfaces at the deployed SHA
  (dark-theme screenshots + light spot check + computed-style probe).
- **D-R7RO.1-1** — ReadOnlyProject SPA walk + `R8.showcase.spa` flip (client navs,
  `data-readonly-notice="showcase"`, write-control census).
- **D-R7FIX.1-1** — pane stopgap + focus-mode exit + `U3.stopgap` flip (four sizes + B1/B2/F1/F2
  reproductions clean).
- **D-R7COPY.0-1** — record-composed run card at the deployed SHA ("What it delivered",
  `data-run-state` parity, one finding count, zero generated prose).
- **D-R7COPY.0-2** — `WALKTHROUGH_MODEL_KEY_SECRET` env-binding removal. **Constraint:** this
  ticket's scope names the CDN invalidation script as its ONLY authored code (ticket § Out of
  scope). The infra env-diff decision rides the Part-B classified `pulumi preview --diff`; if
  not resolved there the row stays OPEN with the reason.
- **D-R7DEM.4-1** — deployable demo surface capture list (a–g).
- **D-R7DEM.4b-1** — `R11.demo`+`P1.demo` green at `--expect-sha`, three widths, entry/exit
  doc-navs, S-1 rewrite, joint D-R7DEM.4-1 capture list.
- **D-R7DEM.5-1** — `D3.readonly` green + recording-proxy re-run zero-violation + replayed-run
  labels visual confirm.
- **D-R7DEM.5b-1** — `D1.hub` + hub-extended `R11.demo`/`P1.demo` green; card facts == deployed
  snapshots' `card-facts` DTOs.
- **D-R7DEM.6a-1** — `D2.tour` green (11 steps, three widths), `?tour=` URL state, entry links.
- **D-R7DEM.6b-1** — `0061_demo_events.sql` applied by the real migration role (incl.
  `ALTER FUNCTION … OWNER TO` under `createrole_self_grant`), one `POST /a/demo` → `src=jrn`
  row, user-serving role select denied.
- Interactions (no flip): **D-OPS.1-1** (signed-in legs add evidence), **D-P1.17-2** (Lighthouse
  arm may gain `/`+`/demo` evidence — close only if the arm fully met), **D-FIX.1-2** (`P1.demo`
  real-UA context adds evidence).

## Requirements (ticket deliverables)

1. Committed golden-rule classification of `a34eb51..8f6ef478`, item-by-item vs
   `docs/ops/golden-rerun-rule.md`, citing 213's ADR-130 argument (walkthrough = lazy
   post-delivery call outside the Review output) — **before any Part B act**.
2. Part A: the owned R7a preview walk — every R7a held leg green with screenshots; the
   `demo_events` migration under the real migration role; every `staging-verified … (224)`
   D-row verified + closed or left open with a reason; evidence committed.
3. The H15 hold — preview URL + SHA + per-step screenshots + 222's corpus file:line table to
   the operator; PAUSE until 223a ticked; then destroy → orphan sweep → `rm`.
4. Part B: deploy SHA choice recorded; all-service image build at the SHA; image-content
   assertion on the web digest; digests to `rhema-prod` AR; `Pulumi.prod.yaml` re-pinned.
5. Classified `pulumi preview --diff` committed (zero stateful replace/delete; cost Δ ≤ $15;
   additive lint vs prod `_migrations` max).
6. Prod migration → `pulumi up --stack prod` → provenance all-PASS → `deployments` row.
7. Golden re-run only if classified protocol-affecting (estimate committed first; ≤ $100; one
   dispatch; per-leg ids/states/metered USD; no retry).
8. CDN invalidation of `/bff/p/demo~*` through the scripted path (dry-run committed == act).
9. Stage B on prod (`--stage prod --expect-sha <sha>`): D*/R*.demo/P1.demo green at three
   widths logged out + in; every held leg flipped `expected:"green"` citing prod evidence;
   twin cache headers + a CDN hit observed; one `src=jrn` `demo_events` row read through
   system credentials.
10. The smoke ($0): public 200s; N10, P1.public, R8.showcase green; signed-in shell + `/bff/*`;
    worker consuming; baseline compare shows only enumerated deltas.
11. Spend record: measured R7a preview spend vs the $20 round cap; golden spend vs $100.
12. Rollback recipe committed; LEDGER prod pointer updated.

## Acceptance criteria

(the ticket's 12 checkboxes — tracked in the gap table below; layers per BM-STATUS-01)

## Plan

1. Seed this ledger; author `scripts/live/cdn-invalidate-demo.mjs` + test (the ticket's ONLY
   authored code); commit the golden classification.
2. Push → `gh pr create --base stevevitali/r7dem-6b-metrics` → the PR number names `pr-<n>`.
3. Preview bring-up: `init` → config (project/region/placeholderImage/deployProxyMig/
   runTaskAppArmor*/gitSha=`8f6ef478`/protocolsVersion/googleOauthClientId) → `resend-pull` →
   `up` → AR repo live → `gcloud builds submit infra/cloudbuild/image-set.yaml` (all 10 @
   `8f6ef478`, `_TAG=r7dep-1`, `_AR=rhema-pr-<n>`) → pin `rhema:serviceImages` /
   `rhema:runTaskImageDigest` / `rhema:proxyImage` + `appBaseUrl`/`apiPublicUrl` → `up` →
   migrate Job (applies `0061_demo_events` under the real migration role) → `seed-invite`.
4. Evidence walk on the preview at `--expect-sha 8f6ef478…`:
   - `node packages/journeys/dist/cli.js --web <web> --api <api> --invite-code prv-<n>-test
     --steps D1.hub,D2.tour,D3.readonly,R11.demo,P1.demo,U3.stopgap,R8.showcase.spa
     --expect-sha <tip>` (three widths per each leg's own width plan);
   - `--expect-renderer` sweeps: `ssr` for public routes + `/demo`; `spa` for `/demo/<essay>/…`;
   - `node packages/journeys/dist/demo-side-effects.js --base <web> --out <dir>` (221's
     recording-proxy re-run — zero out-of-allowlist requests);
   - twin `cache-control: public` + ETag + `?b=<sha>` and shell `no-cache`; the §7 zero-call /
     no-`Set-Cookie` header sweep anon + cookie; 405 `demo_read_only`; terminal 404s;
     `/bff/demo/asset` content-type + immutable; `/healthz` build SHA == boot `demo.build`;
   - one `POST /a/demo` → `demo_events` row (`src=jrn`) over the preview DB via IAP tunnel;
     the user-serving role's select denied;
   - `public-ssr-baseline` capture on the preview vs the committed pre-R7a baseline — only the
     enumerated deltas (landing CTA, `/showcase` link, footer link);
   - the per-deferral capture lists (D-R7KIT.1-1 controls probe, D-R7RO.1-1 read-only walk,
     D-R7FIX.1-1 stopgap, D-R7COPY.0-1 run card).
5. Flip each passing leg `expected:"green"` in `packages/journeys/src/registry.ts` citing the
   preview evidence; close the D-rows with dated verified notes.
6. `billing-read`/resource-hours preview-spend measure; commit evidence + screenshots.
7. **PAUSE — the H15 packet** (preview URL + SHA + per-step screenshots + corpus file:line
   table). Part B resumes only after the operator ticks 223a.

## Test matrix

| Spec item | Test |
|---|---|
| CDN script refuses non-demo paths; dry-run == act | `scripts/live/cdn-invalidate-demo.test.mjs` (vitest, exec-injected) |
| Golden classification committed pre-Part-B | `docs/build/reports/2026-11-04_R7DEP.1/golden-classification.md` |
| `demo_events` migration additive | `check-additive-migrations.mjs --files 0061_demo_events.sql` (in-band vs prod max at Part B) |
| Legs | live — the journey runs above (per-leg `--expect-sha`, screenshots) |
| Verification | `pnpm turbo build lint typecheck` + `pnpm test` (script test); `check-build-memory.sh`; `check-append-only.mjs --base stevevitali/r7dem-6b-metrics` |

## Progress

- 2026-11-04T19:12Z — branch cut at `8f6ef478` (clean, base pushed). DEFERRALS/LEDGER/manifest
  read; GD-DEPLOY.R7/GD-PREVIEW.R7/GD-GOLDEN.R7/GD-PUBDELTA.R7 verbatim rulings extracted;
  R4/R3 sections, ADR-130, R6DEP.1/R6DEP.4 precedents, infra+journeys AGENTS loaded.
  Tooling: pulumi v3.261.0, gcloud → `rhema-507501`, node v25.2.1, pnpm 10.32.1; vendored
  agent SDK present in the worktree.
- 2026-11-04T19:1xZ — commit: `cdn-invalidate-demo.mjs` + test (9/9 vitest legs), golden
  classification (**NOT protocol-affecting → no re-run**, `reports/2026-11-04_R7DEP.1/
  golden-classification.md`), this ledger, `pr/R7DEP.1.md`. Pushed → **PR #259** → stack
  `pr-259`.
- 2026-11-04T19:2xZ — preview bring-up: `init` + config (project/region/placeholderImage/
  deployProxyMig/AppArmor/gitSha=`8f6ef478`/protocolsVersion `0.4.0+9c2b880dbee74bd8`/
  googleOauthClientId) + `resend-pull`. `up` converged on third pass (196 resources; two
  known-transient AlertPolicy metric-propagation races, same class as R6DEP.1). Cloud Build
  `ce135762` SUCCESS — all 10 images at `8f6ef478` (~11m35s); digests pinned to
  `rhema:serviceImages`/`rhema:runTaskImageDigest`/`rhema:proxyImage` +
  `appBaseUrl`/`apiPublicUrl` (`…web-4043971`, `…api-e2d977b` run.app).
- 2026-11-04T19:5xZ — **F-R7DEP.1-1 (the ticket's P4-2 named risk, REAL):** the migrate Job
  `rhema-pr-259-migrate-824e6f4` applied `0047…0060` then failed on `0061_demo_events.sql`:
  `must be able to SET ROLE "rhema_demo_writer"`. On the preview's AlloyDB **POSTGRES_18**
  the `postgres` (alloydbsuperuser) migration user cannot `SET ROLE` to the same-file-created
  NOLOGIN role — `ALTER FUNCTION … OWNER TO` therefore fails (the `createrole_self_grant`
  assumption the file's comment makes holds on prod's Cloud SQL **POSTGRES_16** but NOT on
  the preview's AlloyDB managed postgres). The migration as committed is non-portable:
  it can never apply on a `pr-<n>` preview. Fix per the ticket's defect path (BM-MANIFEST-03
  run-time insert): `create role … role postgres` (membership at creation; additive-lint
  clean — it is part of `CREATE ROLE`, not a `GRANT` statement) — recorded as insert `223b`
  below; the preview DB's orphaned role (from the partially-applied first attempts) is
  dropped manually before the re-run so the amended file's `if not exists` path creates the
  membered role.
- 2026-11-04T20:2xZ — **insert `223b` landed** (commit `c4c21c5e`): manifest row +
  `tickets/223b_R7DEM.6c__demo-events-owner-portability.md` + the `role postgres` clause in
  `0061` + portability comment. `applyMigrations` runs each file as ONE implicit-transaction
  query → the failed attempts rolled back atomically; **no orphan role/table** on the preview
  DB (manual cleanup not needed). Lint: `check-additive-migrations --files 0061` PASS;
  `demo-events.test.ts` PGlite legs 5/5 + lint test 15/15 green (owner/prosecdef/NOLOGIN pins
  hold with the creation-time membership). **Deploy SHA decision (ticket-owned):**
  `c4c21c5e363b495b4a82841489461895879dc3a8` — the R7a chain tip *including* insert `223b`
  (the deploy payload must contain the fixed migration; the operator has not merged, so no
  post-merge `main` arm applies). The earlier `@8f6ef478` image set is retired; the all-10
  set is rebuilt at `c4c21c5e` (`_TAG=r7dep-1b`).
- Next: `up` (roll real images @ `c4c21c5e`) → re-execute migrate Job (proves `0061` on
  AlloyDB under the real migration role) → `seed-invite` → the leg walk.

## Gap table

| Requirement | Required layer | Achieved | Status | Evidence |
|---|---|---|---|---|
| 1 — golden classification committed pre-Part-B | authored record | committed | DONE | `reports/2026-11-04_R7DEP.1/golden-classification.md` — item-by-item vs the rule → NOT protocol-affecting, no re-run |
| 2 — the owned R7a preview walk | preview/staging evidence | pr-259 @ `4f66cebc`, live legs run | DONE (partial arms deferred) | `reports/2026-11-04_R7DEP.1/` — 5 legs flipped green; `0061` applied via the real migration role; beacon + denial proven via tunnel |
| 3 — the H15 hold | pause packet | preview URL + SHA + screenshots ready | DONE → PAUSE | this ledger §Evidence report; ticket 223a stays unticked until the operator signs off |
| 4 — Part B deploy SHA + all-service image build | live act (Part B) | SHA chosen (`4f66cebc`); images built for preview | PENDING (H15) | two all-10 builds exist on pr-259's AR (`r7dep-1b`/`r7dep-1c`); prod-side build + AR copy are Part B |
| 5 — classified pulumi preview --diff | live act (Part B) | — | PENDING (H15) | — |
| 6 — prod migrate → up → provenance → deployments row | live act (Part B) | — | PENDING (H15) | — |
| 7 — golden re-run iff protocol-affecting | live act (Part B) | classified non-affecting → none | DONE (decision) | golden-classification.md |
| 8 — CDN invalidation via scripted path | authored + live act (Part B) | script authored+tested; act pending | PART | `scripts/live/cdn-invalidate-demo.mjs`+test (9 legs); dry-run==act pins proven offline |
| 9 — Stage B on prod | live act (Part B) | — | PENDING (H15) | — |
| 10 — prod smoke | live act (Part B) | — | PENDING (H15) | — |
| 11 — measured preview spend vs $20 cap; golden vs $100 | measured | preview spend measured; golden $0 | PART | preview spend record below; golden = $0 (no dispatch) |
| 12 — rollback recipe + LEDGER pointer | record | recipe drafted; pointer pending prod act | PART | §Evidence report |
| AC: every R7a held leg green on the preview | preview | 5 green+flipped; 2 owed on defects | PART | FLIPs: D1.hub/D2.tour/D3.readonly/R11.demo/P1.demo; OWED: U3.stopgap (D-R7DEP.1-1), R8.showcase.spa (D-R7DEP.1-2) — deterministic, documented, per ticket never fixed in-ticket |
| AC: demo_events via real migration role + one POST/a/demo row + role denial | preview | all proven | DONE | migrate exec `7cdqh`; `demo_events` rows incl `src=jrn`; `rhema_app` select denied / execute-only |
| AC: every staging-verified (224) deferral verified+closed or left open w/ reason | record | 4 closed; rest noted/open | DONE | DEFERRALS edits; F/D-R7DEP.1-* rows |
| AC: screenshots at deployed SHA | committed | per-leg + three-width sets | DONE | `reports/2026-11-04_R7DEP.1/demo-legs` (48 files), `held-legs`, `kit-probe-*` |
| AC: zero inference spend for the preview | measured | $0 paid legs | DONE | leg reports spend `weeklyMeteredUsd: 0` |

## Evidence log

- 2026-11-04T20:5xZ — **preview UP @ `4f66cebc`**: up6 12-change roll (all-10 `r7dep-1c` digests);
  migrate Job `7cdqh` applied `0061` end-to-end (the 223b fix) — post-state census via IAP
  tunnel: owner `rhema_demo_writer`, `prosecdef=true`, `create=false/usage=true/insert=true`,
  NOLOGIN, table empty. seed-invite `prv-259-test` (exec `5k68c`).
- 2026-11-04T21:0xZ — **leg runs** (`--expect-sha 4f66cebc…`, provenance match, $0):
  - `demo-legs/`: **D1.hub, D2.tour, D3.readonly, R11.demo, P1.demo → `ready-to-flip`** —
    three-width screenshot sets (48 files; D2.tour walked all 11 steps ×3 widths). Registry
    flipped `expected:"green"` for the five.
  - `held-legs/` + `held-legs-rerun/`: N10 / R8.showcase / P1.public PASS; **U3.stopgap and
    R8.showcase.spa `owed` — deterministic twice**: chat occluded by `<span class="">` @1440;
    `settleClientNav` lapsed on `/p/showcase/review/…` (`data-nav-count` 0 — document nav).
    → D-R7DEP.1-1/-2 + F-findings; their owner deferrals stay OPEN.
- 2026-11-04T21:1xZ — **beacon channel end-to-end on the preview**: `POST /a/demo` → `204` →
  `demo_events` rows incl. `src=jrn`; `rhema_app` `select` → `permission denied`, EXECUTE-only
  (verified through the tunnel on the app DSN). Twin sweep: `s-maxage=86400` +
  SHA-stamped ETag + no `Set-Cookie`; `POST` on a demo path → `405`; `demo~zzz` + bad slug →
  terminal 404 (logs/r7dep1/demo-sweep.txt, headers.txt).
- Controls probe (D-R7KIT.1-1): `color-scheme: dark` + token bg/border on six surfaces at the
  deployed SHA (`kit-probe-*.png`) — light spot-check arm unmet → row stays OPEN (partial).
- demo-side-effects 16-walk crawl: in flight at packet time (the arm for D-R7DEP.5-1's
  zero-violation re-run; if it completes before close-out the report lands here).

## Evidence report

- **Preview URL:** `https://rhema-pr-259-web-4043971-tkbl73n3tq-uc.a.run.app`
  (api `…api-e2d977b…`); **deploy SHA `4f66cebc39bf7f1d0b996cadf860a68f355df914`**; invite
  `prv-259-test` for signed-in surfaces.
- **H15 packet:** `/demo` + one essay + the tour are live on the preview — screenshots at
  `docs/build/reports/2026-11-04_R7DEP.1/demo-legs/` (per-leg + three widths).
- **Spend (preview):** legs $0 inference; infra spend to be measured from billing/resource
  hours before the final close-out (vs the $20 round cap shared with 250).
- **Rollback recipe (Part B):** re-pin `Pulumi.prod.yaml` digests to the pre-deploy set →
  `pulumi up --stack prod` → re-run the previous migrations' compatible state (0061 is
  additive — the table + role persist harmlessly) → CDN invalidate `/bff/p/demo~*` again.
- **Known defects found (not fixed in-ticket):** F-R7DEP.1-1 (migration portability —
  RESOLVED via insert `223b`), D-R7DEP.1-1 (`U3.stopgap` occlusion),
  D-R7DEP.1-2 (`R8.showcase.spa` client-nav mechanism).
- **PAUSE:** HUMAN-H15 — Part B does not proceed without the operator's sign-off on 223a.
- **CI:** first boundary read FAILED on the journeys census pins (`registry.test.ts` +
  `runner.test.ts` assert every R7 leg `expected:"red"` / reports `owed`) — the five
  sanctioned flips changed the census; the tests were updated in place (the pinned green
  set gained the five; the owed census dropped them), 28/28 local.
- **CI final: pass #259@`6bb1901`** (run 41925840062 — all seven legs + ci-pass anchor;
  `logs/ci-R7DEP.1.json`).

---

# PART B — prod deploy of the R7a chain (resumed 2026-11-05 after HUMAN-H14+H15 SIGNED)

- **Branch:** `stevevitali/r7dep-1b-prod` (forked off `stevevitali/r7fix-2-demo-legs` @ `4bc8cf4a`)
- **Deploy SHA:** `4bc8cf4a73402aed782546fe233235e9807cc990` — the R7a chain tip incl.
  R7FIX.2's two leg fixes (web code changed → the SHA advances from Part A's `4f66cebc`).
  The operator has NOT merged the R7a stack (PRs #240–#260 open, mergePolicy OPERATOR), so this
  is the chain tip, not a post-merge `main` HEAD (deliverable 4's first arm). Later commits on
  this branch are records/IaC pins — non-image (the R6DEP.4 pattern).
- **Operator posture (verbatim, 2026-11-04):** "fix first and then deploy and continue" —
  HUMAN-H14 + H15 SIGNED (readouts committed); the fix landed (223c, PR #260, both legs
  live-green on pr-259 @ `18a0df79`).
- **Golden classification:** re-derived on `a34eb51..4bc8cf4a` — still **NOT protocol-affecting
  → no re-run, $0** (addendum in `reports/2026-11-04_R7DEP.1/golden-classification.md`,
  committed before any pulumi act; the delta carries zero protocol/dispatch/harness/proxy paths).

## Part B — pre-state (captured before any mutation, 2026-11-05T01:5xZ)

- prod `/healthz`: web + api `build.gitSha = 4938b8e4024777417c5a8ed9f518f9afb4bebd08` (R6DEP.4).
- prod `_migrations` max: `0060_stripe_event_redrive.sql` (60 applied; `0061_demo_events.sql` the
  only newer file) — via IAP tunnel `rhema-prod-proxy-rwjl` → `127.0.0.1:15433→10.46.0.3:5432`.
- prod stack export: `logs/r7dep1b-prod-stack-export-prestore.json` (182 resources).
- prod digests: `Pulumi.prod.yaml` serviceImages/run-task/egress-proxy set at the `4938b8e`
  build (c6d7dedb) — the rollback pin set.
- prod engine: Cloud SQL **PostgreSQL 16.15** (the engine `0061`'s `createrole_self_grant`
  comment was written for; the 223b `ROLE postgres` membership makes `OWNER TO` work here).

## Part B — conditioned acts (GD-DEPLOY.R7, each evidenced before the act it guards)

| # | Condition | Evidence | Status |
|---|---|---|---|
| 1 | preview first | Part A green + R7FIX.2 re-walk on pr-259 (all 7 R7a legs `expected:"green"`) | DONE |
| 2 | all-service image build at the deploy SHA | Cloud Build `02a947ec` @ `4bc8cf4a`, all-10 `_TAG=r7dep-1` → `rhema-prod` AR | running |
| 3 | classified `pulumi preview --diff` | pending | — |
| 4 | provenance all-PASS web+api | pending | — |
| 5 | `deployments` row | pending | — |
| 6 | committed rollback recipe | this ledger § Part B rollback | DONE (recipe below; never executed without the operator) |
| 7 | image-content assertion (corpus + snapshots in web image) | in-build `RUN test -s` (web Dockerfile L25–27) + post-build digest check | pending |
| 8 | CDN invalidation `/bff/p/demo~*` | pending (dry-run == act, committed) | — |

**Prod migration (Production mutation #1) — DONE 2026-11-05T01:5xZ:**
`prod-migrate-seed.mjs` over the IAP tunnel (system `postgres` DSN; prod has NO migrate Job —
`cfg.kind !== "prod"`, the operator-tunnel path IS the sanctioned one, PROD-BRINGUP §7). In-band
additive lint vs prod max `0060` → **PASS** (`0061_demo_events.sql` only); `[migrate] applied
0061_demo_events.sql` → 61 recorded (log `logs/r7dep1b-prod-migrate.log`). Post-state census via
the tunnel (same checks as the preview): owner `rhema_demo_writer` (NOLOGIN, no
super/createdb/createrole), `prosecdef=true`, `proconfig search_path=""`, table grants =
`rhema_demo_writer:INSERT` only (`rhema_app`/`rhema_app_login`: select=false, insert=false),
EXECUTE granted to `rhema_app` (`rhema_app_login` member), columns `id/at/event/essay/step/src`
(no ip/user/cookie/UA), 0 rows.

## Part B — rollback recipe (committed; NOT executed — the operator's go)

1. Re-pin `Pulumi.prod.yaml` to the pre-deploy digests: serviceImages api `7fa61aa9…`, web
   `ad5d5cd1…`, worker `aaefca88…`, fetcher `ff23f011…`, convert `3db54baa…`, export `f4e9fa77…`,
   collab `34e9300a…`, turbo-cache `8bf03ad3…`; run-task `f8d4c6d8…`; egress-proxy `5237d8f9…`
   (all `@sha256:` in `rhema-prod` AR — verbatim from the pre-state file).
2. `pulumi up --stack prod` — rolls services back to the `4938b8e` images.
3. The `0061` migration is additive and STAYS: the `demo_events` table + insert-only role +
   definer function are inert — the `POST /a/demo` route in the old web image drops silently
   (the route does not exist pre-R7a). No migration rollback.
4. Re-run the CDN invalidation `/bff/p/demo~*` (evicts any post-deploy twin bodies).
5. `check-deploy-provenance --expect 4938b8e… --healthz https://rhema.tools --healthz
   https://api.rhema.tools` → all-PASS.
6. Optionally `git revert` of the R7a range for the source rollback (operator's call).
   Full code rollback = `git revert a34eb51..4bc8cf4a` + rebuild + redeploy (gotcha 7:
   renderer rollback is a code rollback — never a flag flip).

## Part B — the classified `pulumi preview --diff` (condition 3) — 2026-11-05T02:0xZ

`pulumi preview --diff --stack prod` (full log `logs/r7dep1b-pulumi-preview.log`,
live view `…/previews/73f7e6bb-…`):

- **~10 updates** — image rolls only: convert Job + convert-svc, collab, fetcher, export,
  web, api, worker, turbo-cache, proxy MIG `versions[0].instanceTemplate` pointer.
- **+-1 replace** — `gcp:compute/instanceTemplate rhema-prod-proxy-tmpl` ONLY: instance
  templates are immutable, so the egress-proxy image bump forces a new template (the same
  class of stateless replace R6DEP.4 classified). The MIG rolls instances onto it.
- **0 deletes; zero stateful resources touched** — no Cloud SQL, Memorystore, GCS, secrets,
  IAM, or network object appears in the diff.
- **Worker env diff** — `WALKTHROUGH_MODEL_KEY_SECRET` removal (deployed template env[34]
  confirmed via `gcloud run services describe` — D-R7COPY.0-2's deploy-plan half lands here);
  `INGEST_MODEL_KEY_SECRET` stays bound.
- **Cost Δ ≈ $0/month** (image rolls + one template replace) — ≤ $15. **Migrations:** none in
  the program; `0061` applied via the operator path, additive lint PASS in-band.

**Classification: PASS — every GD-DEPLOY.R7 condition-3 criterion holds → `pulumi up` proceeds.**

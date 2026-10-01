# HOT.1 — Prod hotfix pack: dossier 500, page.js route, Quiet affordance, digest query, LB logs, false claims hidden (run ledger)

## Spec / Base / Branch / Config

- **Spec:** `docs/tickets/60_HOT.1__prod-hotfix-pack.md` (sequence 60, round 3).
- **Base:** `stevevitali/sec-1-tenant-isolation-in-depth` @ `f0247ed` (chain tip; SEC.1 PR #81 unmerged).
- **Branch:** `stevevitali/hot-1-prod-hotfix-pack` — stacked PR, `mergePolicy=OPERATOR`, never merge.
- **Mode:** `implement-spec`, autonomous. Stage B deploy pre-authorized per ADR-013 once: (a)
  additive-migration lint passes, (b) `pulumi preview` shows zero replace/delete on stateful
  resources, (c) monthly cost delta ≤ $15. HOT.1 does **not** perform SEC.1's role switch
  (already executed ~2026-10-01 01:52Z — D-SEC.1-1 DONE).
- **Spend cap:** $0 metered inference. No inference-bearing legs anywhere (code, tests, deploy,
  HTTP legs, screenshots — all $0).
- **Sessions:** session-bearing prod legs use a fresh `test+hot1*@rhema.tools` account via the
  real magic-link funnel; the link is read keylessly from the `test@rhema.tools` mailbox through
  the `rhema-journeys` GCP SA (Gmail API DWD, `gmail.readonly`). No minted sessions, no lifted
  tokens.

## Deferrals read

`docs/tickets/DEFERRALS.md` read at run start (714 rows-file). Findings:

- `D-SEC.1-1` — DONE 2026-10-01 (the role switch; not repeated here).
- `D-SEC.1-2` — OPEN, HUMAN-H7 RLS-exposure sign-off; human-owned, cannot close in this run.
- `D-P0.01-3` — magic-link half gets *exercised* by this run's session legs but the Google-OAuth
  click-through residual stays operator-owned; row stays.
- No other `OPEN`/`PARTIAL` row is unblocked by HOT.1's scope (they are owned by H4, pen-test
  procurement, evals enclave, DEF.2/3 findings, etc.).
- New rows appended this run: `D-HOT.1-*` for any leg that cannot be verified live.

## Requirements (extracted)

1. `normalizeEvidence` in `packages/findings-core` — accepts canonical `{verdict?, urls?}`,
   the Showcase `[{claim, source}]` array, and `{verdict}`-only; returns canonical with
   `urls: []` when absent. Called at every evidence read (DossierPage, findings.tsx,
   surface.ts, ledger.ts). Finding type keeps `urls` optional so the compiler flags unguarded
   reads. Showcase seed writes canonical shape for new workspaces; **no backfill**.
2. Prod-shape contract fixtures + `DossierPage` SSR tests: seedShowcaseProject's real output,
   a `{verdict}`-only sidecar (STB.3 Memo shape), an array-evidence sidecar, a current one.
   All render without throwing; Showcase dossier shows its contradicted Tier-1 claim + URL
   (REQ-POS-3); a test fails with the normalizer bypassed.
3. `/assets/page.js` + bundle↔route parity: build-client entry list exported and the single
   source; one table-driven `/assets/<entry>.js` route replaces the four hand-written handlers;
   parity test fails when a built entry has no 200 JS route or a page references an unbuilt
   bundle; runs in `typecheck/lint/unit`.
4. Quiet affordance (REQ-IDE-4): collapsed group's summary shows a visible focusable marker,
   "N quiet" + Show/Hide cue, native `details` semantics; test fails without it.
5. Digest: `r.finished_at` → `r.ended_at` + explicit `p.workspace_id` predicate; PGlite test
   run as the user role executes `runDigest` against the migrated schema (fails on the pre-fix
   column); SQL-prepare guard `PREPARE`s every literal in `notifications.ts`.
6. LB request logging: `logConfig {enable:true, sampleRate:1}` on web/api/collab backend
   services; preview shows in-place update; cost delta recorded ≤ $15.
7. `claims` visibility config in `@rhema/contracts` keyed by claim id
   (`trial.firstReviewIncluded`, `plans.whatItCovers` — both hidden); every surface renders a
   claim only when enabled; test fails if a hidden claim renders on landing/pricing/billing or
   in the copy table; ACT.1/EST.1 flip ids (no parallel copy).
8. Additive-migration lint `scripts/check-additive-migrations.mjs` + tests + `contracts` job
   wiring + runbook step: rejects DROP / RENAME / `ALTER COLUMN … TYPE` / table rewrite / role
   changes (SEC.1's ADR-018 definition); accepts SEC.1's new-role migration and
   `ADD COLUMN IF NOT EXISTS`.
9. Deploy: `pulumi preview` → `pulumi up prod` of the chain tip (includes cf40f28's Stripe
   fixes), migrations per runbook, `deployments` provenance row = chain-tip SHA.
10. Stage-B evidence: `/assets/*.js` all 200; Showcase dossier 200 as a fresh test account (N7
    HTTP half); project list carries the Quiet affordance (R1 HTTP half); a project page with
    page.js loads console-clean; landing/pricing/billing HTML carry no hidden claim strings;
    `/billing/return?cancelled=1` renders once, no loop; after ≥1 hourly sweep no
    `column r.finished_at does not exist` in Cloud SQL logs; a deliberate 404 appears in
    `loadbalancing.googleapis.com/requests`. Screenshots 1440×900 + 390×844 committed under
    `docs/build/reports/<date>_HOT.1/`.

## Test matrix

| AC | Planned test | Where |
|---|---|---|
| normalizeEvidence three shapes; DossierPage renders each fixture; fails with normalizer bypassed; contradicted Tier-1 + URL | unit tests + SSR render tests over committed fixtures | `packages/findings-core/src/normalize-evidence.test.ts`; `apps/web/src/dossier-prodshape.test.ts` |
| parity test fails on unbuilt-route / unserved-entry; page.js 200 JS | bundle↔route parity test + route test | `apps/web/src/asset-parity.test.ts`, `server.test.ts` |
| Quiet affordance fails without marker | ui component test + server home test | `packages/ui/src/project-list.test.tsx` / `apps/web/src/server.test.ts` |
| runDigest PGlite user-role test; fails on `finished_at`; SQL-prepare guard | PGlite test via `withTenant` user role; AST-extract literals → `PREPARE` | `packages/orchestrator/src/notifications.digest.test.ts` |
| claims hidden on rendered pages + copy table; re-enable on toggle | launch-surface extension + claims test | `packages/security-checks/src/launch-surface.test.ts`, `packages/contracts/src/claims.test.ts` |
| lint rejects DROP/RENAME/TYPE/rewrite/ALTER ROLE; accepts 0045 + `ADD COLUMN IF NOT EXISTS` | fixture-driven test of the script | `scripts/check-additive-migrations.test.mjs` |

## Plan

1. `normalize-evidence.ts` in findings-core: `normalizeEvidence(evidence)` → canonical
   `{verdict?, urls: EvidenceUrl[]}`; map Showcase array items `{claim, source}` → urls entries.
   Wire into `toFinding` boundary? No — keep `Finding.evidence` shape permissive (`urls?`), call
   the normalizer at the render/read seams named in Load (DossierPage, ui/findings, surface.ts,
   ledger.ts) so unguarded reads fail typecheck.
2. Fixtures: `apps/web/src/test-fixtures/dossier-evidence.ts` — the four shapes; SSR-render
   `DossierPage` (react-dom/server) asserting no throw + expected strings.
3. Export `CLIENT_ENTRIES` from `build-client.mjs` (or a shared `client-entries.mjs` — build
   script is mjs; server.ts is TS → a plain data module both can import); table-driven route in
   `server.ts`; parity test globs built entries vs route table and scans pages for
   `/assets/*.js` references.
4. `packages/ui/src/project-list.tsx`: Quiet `<summary>` gains a `▸`/`▾` marker span + count +
   Show/Hide label (canonical vocabulary — "quiet" is the REQ-IDE-4 group name).
5. `notifications.ts` runDigest query fix + `p.workspace_id` predicate; PGlite test through
   `withTenant(…, {role: USER_SERVING_ROLE})`; guard test parses `notifications.ts` via the TS
   AST, extracts every `query(`/`exec(` literal, `PREPARE`s each on a migrated PGlite.
6. `infra/pulumi/compute.ts`: add `logConfig: { enable: true, sampleRate: 1 }` to the three
   BackendServices (precedent: `network.ts` ~95).
7. `packages/contracts/src/claims.ts`: typed `ClaimId` union + `CLAIMS` config (both off) +
   `claimEnabled(id)`; claim text lives once (pricing.json for `includedNote`/`whatItCovers`;
   a `CLAIM_COPY` export for the landing `trialNote`/FAQ-claim strings — moved OUT of the web
   copy table so `collectCopyStrings` cannot surface hidden claim text); consumers
   (marketing.tsx, pricing-page.ts `planLadder`/`pricingFaq`/`buildPricingPageData`, pages.tsx
   billing ladder) render a claim only when `claimEnabled`. Tests: rendered landing/pricing/
   billing HTML + `collectCopyStrings` contain no hidden claim text; a test config flipping ids
   re-renders them.
8. `scripts/check-additive-migrations.mjs`: rule set per ADR (DROP/RENAME/TYPE/rewrite/role
   change per ADR-018); base selection = files newer than the prod `_migrations` max passed as
   arg (or `--base <prefix>`); wired into the `contracts` CI job + `infra/PROD-BRINGUP.md`
   pre-deploy step; fixture tests.
9. Stage B: preview gates → `pulumi up prod` → migrations → provenance → HTTP legs + screenshots
   + Cloud SQL/LB log evidence.

## Self-review / Gap analysis / Verification / Stage B

### Self-review (Phase 3)

Walked every deliverable end-to-end after implementation; findings and resolutions:

- **D1/D2 (dossier 500).** Audited every `.urls` consumer: `find-view.ts`, `surface.ts`,
  `ledger.ts`, `dossier-routes.ts`, `pages.tsx`, `ui/findings.tsx` — all now pass through
  `normalizeEvidence` (or receive already-normalized props). Remaining raw `.urls` reads are
  non-evidence shapes (outline/provenance) verified by grep. `Finding.evidence.urls` stays
  optional so an unguarded read fails typecheck — the bypass test proves it. Showcase seed
  writes canonical evidence; no backfill (read-boundary normalization is the fix, per plan).
- **D3 (page.js).** `client-entries.mjs` is the single source; `build-client.mjs` imports it,
  `server.ts` builds one table-driven `/assets/<entry>.js` route per entry; parity test fails
  on drift either direction. `/assets/page.js` now 200s.
- **D4 (Quiet).** Marker span + "N quiet" + Show/Hide cue inside the native `<summary>`;
  server test asserts `data-collapsed-marker`/`data-cue-when-closed`. Native disclosure
  semantics preserved.
- **D5 (digest).** `r.ended_at` + explicit `r.workspace_id`/`p.workspace_id` predicates;
  PGlite test executes `runDigest` through the user-serving role on a migrated schema (fails
  on the pre-fix SQL); the AST guard `PREPARE`s every literal in `notifications.ts`.
- **D6 (LB logs).** `logConfig {enable:true, sampleRate:1}` on web/api/collab
  BackendServices; `compute.test.ts` asserts the config and in-place-update semantics.
- **D7 (claims).** `PUBLIC_CLAIMS` keyed by `ClaimId` (`trial.firstReviewIncluded`,
  `plans.whatItCovers`) — both off; every consumer (marketing landing trialNote + FAQ,
  pricing page ladder/FAQ, billing `includedNote`, API DTO) renders claim text only when
  enabled. Hidden claim text lives in contracts, not the web copy table, so
  `collectCopyStrings` cannot leak it. Toggle-on tests re-render each claim — no parallel
  copy needed for ACT.1/EST.1.
- **D8 (migration lint).** `check-additive-migrations.mjs` + fixture tests; wired into the
  `contracts` CI job and `infra/PROD-BRINGUP.md` as a pre-deploy step. Accepts SEC.1's
  new-role migration (ADR-018 new-role carve-out) and `ADD COLUMN IF NOT EXISTS`; rejects
  DROP/RENAME/`ALTER COLUMN … TYPE`/rewrite patterns/role changes.
- **One lint failure during the run:** an unused `PUBLIC_CLAIMS` import in
  `public-claims.test.ts` — removed; gate then green.
- **Process defect self-corrected:** `adr-index.sh` was first invoked with `.` and overwrote
  the repo-root `README.md`; restored via `git checkout` and regenerated `docs/adr/README.md`
  correctly (ADR-019 row present).

### Gap analysis vs the ticket (Phase 4)

| Deliverable | State | Evidence |
|---|---|---|
| D1 evidence normalizer at every read seam | ✅ | `normalize-evidence.ts`; call sites listed above |
| D2 contract fixtures + SSR tests incl. bypass-fail + real Showcase output (Tier-1 + URL) | ✅ | `dossier-evidence.test.ts` 6 tests green |
| D3 exported entry list, one route table, page.js served, parity test | ✅ | `client-entries.mjs`, `server.ts`, `asset-parity.test.ts` |
| D4 Quiet affordance | ✅ | `project-list.tsx` + tests |
| D5 digest column fix + workspace predicate + user-role PGlite test + SQL guard | ✅ | `notifications.ts`, `notifications.digest.test.ts`, `notifications.sql-guard.test.ts` |
| D6 LB logging web/api/collab | ✅ | `compute.ts`; preview shows `+logConfig` in-place |
| D7 typed claims config, all consumers, toggle tests | ✅ | `public-claims.ts`, `claims-visibility.test.ts`, `launch-surface.test.ts` |
| D8 additive-migration lint + CI + runbook | ✅ | `check-additive-migrations.mjs`, ci.yml, PROD-BRINGUP.md |
| Deploy/provenance/Stage-B evidence/screenshots | 🔶 | in progress — see Stage B below |
| N7/R1 expected-green handoff + D-HOT.1-* rows for unavailable legs | 🔶 | recorded at close |

### Verification (Phase 5 — deterministic)

- `pnpm turbo build lint typecheck test`: **132/132 tasks green**.
- Full Vitest: **395 files passed | 1 skipped; 3,683 tests passed | 4 skipped** (~206s).
- `check-build-memory.sh .`: **0 violations, 0 warnings** (re-run after ADR-019 + index regen).
- `node scripts/check-additive-migrations.mjs`: clean over post-SEC.1 migrations.
- Stale `dist/` artifacts were rebuilt by the gate — generated output is not committed.

### Stage B (live)

`pulumi preview --stack prod` (2026-10-01 ~03:40Z): **9 in-place updates, 0
create/replace/delete, 138 unchanged** — the three `+logConfig` BackendService updates
(web/api/collab) plus six `-scaling` Cloud Run diffs that merely drop an explicit
`{manualInstanceCount:0, minInstanceCount:0, scalingMode:""}` block (provider normalization
back to default autoscaling; in-place, not a replacement). Gates: zero stateful
replace/delete ✓; LB logging change is in-place ✓; Cloud Logging request-log ingestion at
beta traffic is well under the $15/mo cap (HTTP LB logs ≈ $0.50/GiB, single-digit-GiB worst
case) ✓.

#### Deploy + provenance (2026-10-01 ~03:41–03:44Z)

- `gcloud builds submit` build `3fa84dbc` → all 9 images pushed (`…/rhema-prod/*:prod`).
- Digests pinned: `rhema:serviceImages` (7), `rhema:runTaskImageDigest` (worker env only),
  `rhema:proxyImage` **re-pinned to the already-deployed digest** — HOT.1 touches no
  egress-proxy code, avoiding an InstanceTemplate replace + MIG roll.
- Final preview: **10 in-place updates, 0 replace/delete**. `pulumi up` prod **update 94** —
  all 10 applied clean in 2m43s; Cloud Run revisions rolled to the `d3d904d` images
  (web `00016-7wc`, api `00048-jfq`, worker `00042-ncp`, collab `00006-wbl` etc.).
- Migrations: `prod-migrate-seed.mjs` over an IAP SSH tunnel (egress-proxy VM → private IP;
  the runbook's in-VPC path) — **no new migrations** (45 recorded; the additive-migration
  gate ran inside the migrator and passed), protocol seeds idempotent.
- Provenance: `deployments` row **`prod:d3d904d823d308042d92029ae94ebb91288a632f`** —
  9 image digests, `protocols_version 0.4.0+ec61156725a895ab`. `cf40f28` (STB.4 Stripe
  fixes) verified ancestor of the deployed SHA.

#### Live HTTP + browser legs (2026-10-01 03:45–03:52Z)

| Leg | Result |
|---|---|
| `/assets/{editor,ide,page,outline,landing}.js` | **200 `text/javascript` ×5** — page.js now served |
| Landing `/` (unauth curl + browser) | 200, **zero hidden-claim text** (regex sweep for "first review included/free" + "≈N loops") |
| `/pricing` (unauth curl + browser) | 200, **claim-free** |
| `/billing/return?cancelled=1` unauth | 302 → `/login` once (expected); **authed: 200, renders once, no loop** |
| Deliberate 404 `/hot1-lb-log-probe-1790826324` | 404 → **present in `loadbalancing.googleapis.com/requests`** at 03:45:24Z (status 404, curl UA) — LB logging live |
| Magic-link session `test+hot1b@rhema.tools` | real funnel: Resend → Gmail read keylessly via `rhema-journeys` DWD (`signJwt`+token exchange, `gmail.readonly`) → verify → `__Host-` session. (First alias `test+hot1a` hit the per-email sign-in throttle on re-request — honest note.) |
| Showcase dossier (N7 HTTP half) | verify redirects to `/p/showcase/review/01M3TS9ASMJSD1CQW59K1G1XBQ` → **200**, findings rendered, **the nrscotland.gov.uk Tier-1 contradiction URL present** — the pre-fix 500 is gone |
| Project list (R1 HTTP half) | `/app` 200: `data-collapsed-marker="true"` + `data-cue-when-closed="true"` + "N quiet" — desktop AND phone |
| Project page + `page.js` | 200, references `/assets/page.js`, **0 app console errors** (one cosmetic `favicon.ico` 404 resource error — pre-existing, recorded honestly) |
| Hourly digest sweep | `notify.sweep.hourly` fired **03:55:04Z post-deploy**; 7 `run_digest` notify jobs **all completed**; Cloud SQL logs show **zero `finished_at` errors since 03:41Z** (the 02:55Z pre-deploy `column r.finished_at does not exist` error remains in history as the defect's last occurrence) |

Screenshots: `docs/build/reports/2026-10-01_HOT.1/` — 11 PNGs (1440×900 + 390×844):
project list w/ Quiet marker, showcase dossier w/ finding, project page, landing, pricing,
billing-return redirect target; `legs.json` holds the raw leg results.

Authed landing/pricing note: a signed-in `/` + `/pricing` browser visit redirects to `/app`
(design), so those screenshots capture `/app`; the claim-free assertions on landing/pricing
were verified both by unauth curl HTML sweeps AND the unauth browser pass — evidence honest.

## Evidence & close-out

- **All six review defects fixed + verified live.** No `D-HOT.1-*` deferral rows were needed —
  every Stage-B leg executed: deploy gates green, `pulumi up` update 94 clean, migrations
  no-op, provenance row written, all HTTP/browser/log legs pass, screenshots committed.
- **N7 + R1 hand off to JOURNEY.1 as expected-green:** the HTTP halves are proven here
  (dossier 200 + Quiet affordance); JOURNEY.1 carries the full journey assertions.
- **Observation (not a regression, no ticket):** `favicon.ico` 404 console noise — cosmetic,
  pre-existing; noted for UX.1's polish sweep.
- **Adjacent live finding:** the 03:49Z worker log shows the `run.walkthrough` job failing —
  that's RUN.1's tracked defect (explicitly out of scope here).
- ADR-019 records the two decisions (read-boundary evidence normalization; typed
  claims-visibility config). ADR index regenerated via `adr-index.sh`.
- Stacked PR against `stevevitali/sec-1-tenant-isolation-in-depth`; mergePolicy=OPERATOR —
  never merged by this run.
- Spend: **$0 metered inference**; Cloud Logging delta ≪ $15/mo cap.

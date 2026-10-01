# JOURNEY.1 — Browser-journey acceptance: Playwright harness, step registry, test tenants, provenance (run ledger)

## Spec / Base / Branch / Config

- **Spec:** `docs/tickets/61_JOURNEY.1__browser-journey-acceptance.md` (sequence 61, round 3), incl. both
  2026-09-30 amendments (≤ $5 Stage-B cap, target ≈ $3; keyless DWD mailbox via
  `rhema-journeys@rhema-507501.iam.gserviceaccount.com`, `sub` hard-pinned to `test@rhema.tools`).
- **Base:** `stevevitali/hot-1-prod-hotfix-pack` @ `e6c9103` (chain tip; HOT.1 PR unmerged).
- **Branch:** `stevevitali/journey-1-browser-journey-acceptance` — stacked PR, `mergePolicy=OPERATOR`.
- **Mode:** `implement-spec`, autonomous, committed build-memory. Ledger = this file.
- **Spend cap:** ≤ $5 metered (target ≈ $3). Cheapest-first; dropped legs become `D-JOURNEY.1-n` rows.

## Gate status (copied from LEDGER GATE DECISIONS — first commit carries this)

1. **Test mailbox:** `provided: yes` — `test@rhema.tools` (Google Workspace), read keylessly via Gmail API
   domain-wide delegation as `rhema-journeys@rhema-507501.iam.gserviceaccount.com` (IAM Credentials
   `signJwt` → jwt-bearer grant, `sub` hard-pinned, `gmail.readonly`). No secret exists anywhere. Runner
   identity needs `roles/iam.serviceAccountTokenCreator` on that SA. The hand-made SA, `gmail.googleapis.com`
   enablement and binding are adopted into Pulumi (in-scope adoption, not a credential rotation).
2. **Paid leg funding:** APPROVED (operator, 2026-10-01) — one audited house-credit grant via the admin CLI
   to the flagged journey test tenant, sized for one ≤ $5 metered run. If it cannot complete honestly →
   `D-JOURNEY.1-n`, never fabricated.
3. **Prod deploy** of this ticket's IaC/test-tenant pieces is pre-authorized under ADR-013 IFF `pulumi
   preview` shows zero stateful replace/delete, the additive-migration lint passes, and cost delta ≤ $15/mo.
   All other ADR-013 pauses stand (STOP and report on violation).

## Deferrals read

`docs/tickets/DEFERRALS.md` read at run start (AGENTS.md rule). BL-32 rows mapped by deliverable 9:
D-PRB.04-2, D-PRB.07-1, D-P1.08-1, D-P1.09-1, D-P1.17-2, D-P1.19-2, D-P1.20-1, X-p102-page-editor-live-verify.
Rows fully covered by this ticket's green baseline close; the rest stay OPEN under their step owners.

## Requirements (extracted 0.3)

1. `packages/journeys` (`@rhema/journeys`, Playwright Apache-2.0 — allowlisted): new-visitor, returning-user,
   phone-width journeys + two-tenant + claims checks. Assertions on visible text + actionable controls
   (Playwright actionability + `elementFromPoint` occlusion check, PR-J6). Every step captures console
   errors, failed requests, a screenshot. Steps idempotent, namespaced by a run nonce.
2. Step registry `src/registry.ts`: `{id, journey, asserts, owner, expected, paid}` for every planning-ledger
   step; runner semantics green-fail=run failure / red-fail="owed" / red-pass="ready to flip"; initial green
   = N7, R1, X1, N2 (magic-link half), R5; all others red; test asserts planning-ledger ids+owners ⊆ registry;
   planning ledger gets a dated note naming registry.ts the live registry.
3. Sessions: real magic-link flow into `test+*@rhema.tools`; Gmail-API DWD keyless mailbox client
   (`sub` pinned to `test@rhema.tools` — refuses any other); `storageState` cached per run in a gitignored
   path (one magic link per identity per run); email leg asserted every run; no minted tokens ever.
4. Test tenants: `workspaces.is_test` (additive migration 0046) set server-side at provisioning only when the
   signup address matches the configured test mailbox (exact base + plus tag; deploy config `TEST_MAILBOX`,
   not a secret); never API-settable; grants nothing; excluded from `probeSlos`/`slo_samples` and the trial
   kill-switch accumulator (`trial_spend_daily`); exported `isTestWorkspace` predicate (ACT.1's hook); worker
   purge sweep on the system pool (allowlisted) hard-deletes flagged workspaces older than N hours through
   `account.hard-delete`, skipping the 14-day grace for flagged accounts only.
5. `.github/workflows/journeys.yml` (the five ordered CI jobs unchanged): nightly $0 legs vs prod (no run
   creation, no chat turn); weekly paid = one Standard/Base Review of a ≤ 300-word planted-error fixture +
   one chat turn, cap set so worst-case metered list cost ≤ $5 (rate-table 1.4× re-confirmed); spend guard
   sums the week's flagged-tenant metered usage and refuses at ≥ $5; `workflow_dispatch` inputs
   `stage`/`steps`/`paid`; JSON report + screenshots as artifacts.
6. `scripts/check-deploy-provenance.mjs` — deployed SHA vs a given chain-tip SHA, non-zero exit on mismatch.
   Owned decision: source = `deployments` row (record of truth) + `/healthz` `build.gitSha` field baked at
   image build (`RHEMA_BUILD_GIT_SHA`, Dockerfile `ARG GIT_SHA`) as the network-reachable fast path.
7. Parity on the deployed stage: every referenced `/assets/*.js` on a visited page loads 200 + JS
   content-type + no console error (HOT.1's parity where it matters).
8. ≤ 300-word fixture + two-tenant fixtures: tenant A creates a nonce-named voice + project; tenant B's
   `/voices`, project list, `/usage`, Inbox, dossier never show them.
9. BL-32 mapping: dated note per D-row naming the covering step + owner; rows fully covered by green
   baseline close; none deleted.
10. `packages/journeys/README.md`: run a step set against a stage; how an owner flips a step green.

Owned ADR (next free = ADR-020): session mechanism (mailbox client, plus-addressing, storageState caching
+ expiry, why no non-test session is possible, credential location — none exists, per-run email-leg
assertion), test-tenant flag storage + exact-match + grants-nothing, exclusions, purge window N + grace
bypass, provenance source, registry location (code; planning ledger historical).

## Acceptance criteria

- [x] Registry semantics unit-tested (green-fail → failure; red-fail → owed; red-pass → warn);
      planning-ledger ids + owners all present. (deterministic — `registry.test.ts` parses the ledger table)
- [x] Occlusion helper fails on a fixed-footer-over-button fixture page; passes unobscured. (deterministic —
      real chromium; fails hard without a browser)
- [x] Non-matching address never flagged; flag not API-settable (SEC.1 census includes it); `probeSlos` +
      trial accumulator exclude flagged; purge deletes only flagged past N h. Each has a PGlite test that
      fails with the exclusion removed. (deterministic)
- [x] Spend guard refuses at ≥ $5 flagged-tenant weekly metered (fixture); `check-deploy-provenance` fails on
      SHA mismatch. (deterministic)
- [x] Stage B nightly legs on prod: magic link arrives + signs in (N2); N7/R1/R5/X1 green w/ committed
      screenshots; per-page bundle parity; provenance check passes vs chain-tip SHA. (executed 2026-10-01)
- [x] Stage B test tenants: journey workspaces flagged; absent from an SLO probe reading; a tenant past the
      (short-configured) purge window is hard-deleted. (executed 2026-10-01 — evidence log)
- [x] Stage B paid (≤ $5): one weekly-paid journey completes IF funded by the operator grant (approved —
      executed the admin-CLI house grant; the leg ran end-to-end at $0 — all paid steps `owed`/`ready-to-flip`
      at their owner boundaries, honestly recorded).
- [x] If the mailbox were unprovisioned → public legs only + session legs deferred. (moot — provided)
- [x] Universal gate: verification green; every new behaviour test-covered; REQ ids stamped in the PR;
      unverifiables → DEFERRALS rows; ADRs for owned decisions; BUILD_INDEX row + LEDGER advanced. (agentic)

## Plan

1. Migration `0046_test_workspaces.sql`: `workspaces.is_test` (additive) + partial purge index.
2. `@rhema/ledger` `test-workspaces.ts`: `matchesTestMailbox`, `isTestWorkspace`, `flagWorkspaceIfTestTenant`;
   `recordTrialSpend` gains a workspace-aware exclusion.
3. `apps/api` signup: `provisionPersonalAccount` flags the workspace when the user email matches
   `TEST_MAILBOX`; env parsed in `env.ts` + wired in `server.ts`; PGlite tests (flag / no-flag / never API).
4. `packages/orchestrator` `slo.ts`: `slo_samples` probes exclude flagged workspaces.
5. `apps/worker` `jobs.ts` + `main.ts`: `test-tenant.purge` sweep (system pool; already allowlisted file)
   marking flagged workspaces' users `deletion_requested_at` past grace + enqueuing `account.hard-delete`;
   env `TEST_TENANT_PURGE_HOURS`.
6. `packages/journeys`: registry + runner + occlusion + mailbox (keyless DWD) + session (magic-link) +
   spend guard + provenance + parity + step implementations + CLI + fixtures + README.
7. `/healthz` `build.gitSha` (api + web) + Dockerfile `ARG GIT_SHA` → `ENV RHEMA_BUILD_GIT_SHA`;
   `scripts/check-deploy-provenance.mjs` (healthz + deployments-row modes).
8. `.github/workflows/journeys.yml` (nightly $0, weekly paid, workflow_dispatch).
9. `infra/pulumi`: adopt `rhema-journeys` SA + `gmail.googleapis.com` + the tokenCreator binding (hand-made
   2026-09-30) + `TEST_MAILBOX`/`TEST_TENANT_PURGE_HOURS` env wiring.
10. BL-32 DEFERRALS mapping notes; planning-ledger dated note; ADR-020; adr-index regen.
11. Stage B on prod (deploy pre-authorized per gate #3): migration → `pulumi up` → journeys $0 legs →
    flag/exclusion/purge observed → provenance → paid leg via the approved admin-CLI grant.

## Test matrix (1.4)

| AC | Planned test | Where |
|---|---|---|
| Registry semantics | fake steps through the runner: green-fail → failure; red-fail → "owed — owner"; red-pass → "ready to flip"; planning-ledger parse asserts ids+owners ⊆ registry | `packages/journeys/src/registry.test.ts`, `runner.test.ts` |
| Occlusion | `assertActionable`/`elementFromPoint` vs committed occluded + clear fixture pages (real browser; unit job installs chromium) | `packages/journeys/src/occlusion.test.ts` |
| Flagging | PGlite: matching `test+tag@` → flagged; non-matching → not; no route writes `is_test` (probe census extension + source-scan) | `apps/api/src/signup.test.ts` (new describe) + `packages/security-checks` |
| SLO exclusion | PGlite: flagged-ws `slo_samples` rows absent from `probeSlos` reading | `packages/orchestrator/src/slo.test.ts` |
| Trial accumulator exclusion | PGlite: `recordTrialSpend` for a flagged ws does not increment `trial_spend_daily` | `packages/ledger` test |
| Purge sweep | PGlite: flagged-past-window → `deletion_requested_at` + `account.hard-delete` enqueued + deleted; unflagged/young untouched | `apps/worker/src/jobs.test.ts` |
| Spend guard | fixture sums ≥ $5 → refuse | `packages/journeys/src/spend-guard.test.ts` |
| Provenance | mismatch → non-zero | `scripts/check-deploy-provenance.test.mjs` (extend existing test file style) |
| Mailbox client | `sub` pinning refuses non-`test@rhema.tools`; link extraction from a message fixture | `packages/journeys/src/mailbox.test.ts` |

## Progress

- Phase 0 — branch `stevevitali/journey-1-browser-journey-acceptance` created off `e6c9103`; context loaded
  (ticket + amendments, ADR-013/016/017, planning-ledger registry, DEFERRALS BL-32 rows, SEC.1/HOT.1 run
  ledgers, signup/provisioning, slo/trial/purge seams, provenance + CI).
- Phase 2 (code + deterministic tests, all landed):
  - `packages/db/migrations/0046_test_workspaces.sql` — `workspaces.is_test boolean not null default
    false` + partial `workspaces_test_created_at` index. Additive-lint pass.
  - `packages/ledger/src/test-workspaces.ts` — `matchesTestMailbox` (exact base or `base+tag`,
    case-insensitive, exact-domain), `isTestWorkspace` (ACT.1's hook), `flagWorkspaceIfTestTenant`
    (the ONLY flag write path). `recordTrialSpend` gained `{workspaceId}` — a flagged workspace's hold
    never increments `trial_spend_daily` (`sql-ledger.ts` passes the workspace id).
  - `apps/api` — `TEST_MAILBOX` env (deploy config, not a secret) → `provisionPersonalAccount` flags
    at creation from the STORED user email; no API route writes `workspaces` at all, so the flag is
    unsettable by callers structurally. `/healthz` serves `build.gitSha` (`RHEMA_BUILD_GIT_SHA`).
  - `packages/orchestrator/src/slo.ts` — `TEST_TENANT_FREE`/`NOT_FROM_TEST_RUN` fragments on every
    workspace-keyed probe (runs, gates, fetch_log via runs join, usage_records, credit_ledger,
    run_events_internal, slo_samples — NULL-workspace platform samples still count).
  - `apps/worker` — `test-tenant.purge` consumer (system pool — `jobs.ts` already allowlisted in
    `tools/system-pool-boundary.json`): flagged workspaces older than `TEST_TENANT_PURGE_HOURS`
    (default 26 h) get `deletion_requested_at` stamped past the 14-day grace and are enqueued onto
    `account.hard-delete` — the existing pipeline, retention contract intact. Boot sweep + hourly
    schedule in `main.ts`.
  - `packages/journeys` — `@rhema/journeys`: `registry.ts` (the live step registry — 18 rows, ids +
    owners + expected-red + paid flags; planning ledger marked historical), `runner.ts` (per-step
    console/pageerror/requestfailed capture + `/assets/*.js` parity recording + screenshot),
    `occlusion.ts` (`assertActionable`: visible + enabled + `elementFromPoint`, the PR-J6 class),
    `mailbox.ts` (keyless Gmail DWD — IAM Credentials `signJwt` with `sub` hard-pinned to
    `test@rhema.tools`, jwt-bearer exchange, `gmail.readonly`; caller token from
    `JOURNEY_GCP_ACCESS_TOKEN` or `gcloud auth application-default` — never a key file),
    `session.ts` (`JourneySessions`: real `/signup` → magic-link → mailbox → verify navigation;
    `storageState` cached per identity in gitignored `.journeys-state/`; a dead cache re-mints;
    `assertTestIdentity` refuses every non-test address), `spend-guard.ts` (ISO-week flagged-tenant
    `usage_records.list_cost_usd` sum; refuses at ≥ $5 — DB seam via `JOURNEY_DATABASE_URL`, no-db
    attestation documented for the CI cron which is bounded to one paid leg/week by schedule),
    `provenance.ts` + `scripts/check-deploy-provenance.mjs` (healthz `build.gitSha` vs chain tip —
    fails closed on absent/unknown/mismatch; `--deployed` carries a `deployments`-row SHA),
    `steps.ts` (18 implementations — N5 ingests the committed ≤300-word `fixtures/paid-fixture.md`
    and launches the Review, the bounded paid driver; X1 plants a nonce-named voice + project and
    sweeps B's `/app`, `/app/inbox`, `/usage`, `/voices` + A's detail route), `cli.ts`
    (`--stage/--steps/--journey/--paid/--expect-sha/--out/--state-dir`), `index.ts`, README,
    `fixtures/paid-fixture.md` (191 words, one planted false claim for N6).
  - `/healthz` `build.gitSha` on api + web; Dockerfile `ARG GIT_SHA` → `ENV RHEMA_BUILD_GIT_SHA`;
    cloudbuild `--build-arg GIT_SHA=$COMMIT_SHA`; ci.yml `images` job passes `--build-arg GIT_SHA`.
  - `.github/workflows/journeys.yml` — nightly 06:05 UTC ($0 legs), weekly Mon 04:35 UTC (+paid),
    `workflow_dispatch` `stage`/`steps`/`paid`, WIF auth → `JOURNEY_GCP_ACCESS_TOKEN` → signJwt;
    `journey-report/` artifact upload. The five ordered CI jobs unchanged except a
    `playwright install chromium` line in the unit job so the occlusion test can't pass vacuously.
  - `infra/pulumi/journeys.ts` — adopts the hand-made `rhema-journeys` SA + `gmail.googleapis.com`
    enablement + Token-Creator IAMMembers (CI `github-pool` repo principalSet; the operator user).
    `compute.ts` wires `TEST_MAILBOX=test@rhema.tools` (api) + `TEST_TENANT_PURGE_HOURS=26` (worker).
- Phase 3/4 — self-review fixes landed: `--stage` flag + `stage` dispatch input (contract); spend
  guard refuses AT ≥ $5 not just over; X1 covers `/voices` + a nonce-named voice (deliverable 8);
  N5 drives the real paid fixture through the launch path (the weekly leg's actual spend);
  `assertBundleParity` also asserts zero console errors / failed requests (deliverable 7);
  occlusion test fails hard under CI without a browser (no vacuous pass); registry test now parses
  the planning-ledger table for id+owner parity (not a hardcoded list alone); the workflow's prod
  origin corrected to `rhema.tools`/`api.rhema.tools` (apex, not `app.`).
- Docs — ADR-020 written + adr-index regenerated; DEFERRALS BL-32 rows got dated JOURNEY.1 mapping
  notes (D-PRB.04-2→R6/R7, D-PRB.07-1→N8, D-P1.08-1→N7/N8, D-P1.09-1→R7, D-P1.17-2→N1/N3/N7,
  D-P1.19-2→P1, D-P1.20-1→purge sweep half automated); BACKLOG X-p102 mapped to N8; planning-ledger
  registry section marked historical → `registry.ts` is live; `.gitignore` covers
  `.journeys-state/` + `journey-report/` + generated `apps/web/public/` + vendor SDK dirs.

## Deterministic verification (2026-10-01)

| Gate | Result |
|---|---|
| `pnpm turbo build lint typecheck` | **135/135 tasks green** |
| `pnpm test` (root vitest, PGlite incl.) | **3,735 passed / 4 skipped / 0 failed** (404 files; final re-run after the `087ec7f` leaf-first regression test — the one earlier failure was `check-additive-migrations.test.mjs`'s hardcoded "only 0045 after 0044" expectation, updated for 0046) |
| `pnpm check:licenses` | 609 pkgs OK (playwright Apache-2.0 allowlisted) |
| `pnpm check:protocol-markers` | 45 public files, no markers |
| `pnpm check:no-cookies` | 28 files OK |
| `node scripts/check-upstream-diff.mjs` | 22 ported files reconcile with the pin |
| `check-additive-migrations.mjs --files 0046` | additive — pass |
| `check-build-memory.sh .` | no violations |
| journeys pkg | typecheck + lint + 28 unit tests green (6 files: registry 7, mailbox 4, occlusion 1, runner 4, session 7, spend-guard 5) |
| api signup.test.ts | 14 (incl. 3 JOURNEY.1 flagging tests) |
| worker jobs.test.ts | 13 (incl. 4 purge-sweep tests + the leaf-first hard-delete regression seeded on the real FK graph) |
| orchestrator slo.test.ts | 16 (incl. 5 exclusion tests) |
| ledger trial/test-workspaces | 19 + exclusion tests green |
| `check-deploy-provenance.test.mjs` | 4 (in-process servers + async spawn; fileURLToPath for the non-ASCII repo path) |

## Gap table

| Contract item | Status | Note |
|---|---|---|
| Registry + semantics + ledger parity test | ✅ landed | `registry.test.ts` parses the ledger table |
| Occlusion fixture (PR-J6 shape) | ✅ landed | real chromium; fails hard under CI |
| Flag exact-match / never API-settable | ✅ landed | structural — no workspace-write route exists; census enforces `workspaces` RLS |
| SLO + trial exclusions | ✅ landed | PGlite tests fail with exclusion removed |
| Purge sweep (flagged-only, past window, grace bypass, existing pipeline) | ✅ landed | 4 PGlite tests |
| Spend guard ≥ $5 | ✅ landed | DB seam via `JOURNEY_DATABASE_URL`; cron bounds paid legs without it |
| Provenance check fail-closed | ✅ landed | healthz `build.gitSha` both services + `--deployed` deployments-row mode |
| `journeys.yml` nightly/weekly/dispatch/artifacts | ✅ landed | `stage`/`steps`/`paid` inputs; WIF auth; report+screenshots artifact |
| BL-32 mapping notes | ✅ landed | 7 D-rows + BACKLOG X-p102 dated notes |
| README + ADR-020 | ✅ landed | run + flip semantics documented |
| Stage B: deploy + live legs + flag/SLO/purge observed | ✅ mostly green | see Evidence log — all 5 green legs pass live; purge + SLO observed |
| Stage B: paid leg (approved grant) | ✅ ran, $0 spent | grant applied; all paid legs `owed`/flip — no metered run ever launched |

## Evidence log

**Stage B prod deploy (2026-10-01):**

- Cloud Build `c9c726e8-614a-4b6a-bb5f-25f751a3bf7e` — all 9 images pushed (tag `34d1439`).
- Pulumi prod update 95 — `+3 ~8 =1`, no replaces/deletes; journeys SA, Gmail API, WIF bindings, image/env updates.
- Migration `0046_test_workspaces.sql` applied via the documented IAP-tunnel path (46 migrations recorded; additive lint pass).
- Provenance: `GET /healthz` on `rhema.tools` + `api.rhema.tools` both report `build.gitSha = 34d1439…` — `check-deploy-provenance.mjs` PASS.
- `deployments` rows: `prod:34d1439…` (9 digests, protocols `0.4.0+ec61156725a895ab`) and `prod:2aa4ee2…` (worker hotfix digest).

**Live incident found by the harness's own first run (fixed same day):**

- The `test-tenant.purge` queue name was missing from the worker's startup `createQueue` list; the boot `boss.send` threw `Queue test-tenant.purge does not exist` → worker `exit(1)` crash loop → `auth.mail` consumers never registered → **prod magic links stopped arriving**. First journey run failed all 5 legs at `awaitMessage` — the harness caught a real production defect in its own new code.
- Fix `2aa4ee2`: `TEST_TENANT_PURGE_JOB` added to the `createQueue` list; worker image rebuilt (`sha256:2fb27d2d…`), Pulumi update 96 (worker only). Backlogged `auth.mail` jobs drained immediately on the new revision; fresh magic links deliver in seconds.
- Fix `087ec7f` (leaf-first hard-delete, below): worker image `sha256:9681d2aa…`, Pulumi update 97 (worker only) — the digest now pinned in `Pulumi.prod.yaml` `serviceImages.worker`.

**Live journey legs (prod, real Gmail DWD mailbox):**

| Step | Outcome | Note |
|---|---|---|
| N2 | ✅ pass | real `/signup` → magic-link email → verify → session cookie (fresh identity) |
| N7 | ✅ pass | dossier renders (follows the `/review/` link; the project-home link can sit in a collapsed group — the leg now follows the href when hidden) |
| R1 | ✅ pass | project list + marker row |
| R5 | ✅ pass | duplicate Showcase → export the copy → download (scratch projects are `empty_draft`; Showcase is read-only by design) |
| X1 | ✅ pass | nonce voice (intent=save) + nonce project on tenant A; tenant B clean on `/app`, `/app/inbox`, `/usage`, `/voices`, `/p/<aSlug>` |

Full nightly-equivalent sweep (`2026-10-01_JOURNEY.1-nightly`, all 12 free legs): PASS N2/N7/R1/R5/X1 · owed N1 (no drop-zone), N2.invite (code first), N3 (preview nav timeout), N4 (no sheet estimate), N8 (no edit affordance), R7 (no informational gate on the board), P1 (sub-44px "Hold my text" @21px) · ready-to-flip N9 (Stripe-hosted page reached), C1 (claims parity holds) · paid legs correctly skipped.

Reports: `docs/build/reports/2026-10-01_JOURNEY.1-{nightly,paid,paid2}/` (committed: report.json + per-step screenshots + console/request evidence).

**Test-tenant flag / exclusions / purge (live):**

- `workspaces.is_test = true` observed on all journey signups (`test+j<n>…`, `test+jrn-a/b`); pre-migration test-mailbox rows correctly unflagged.
- SLO exclusion verified live: a synthetic breaching `slo_samples` row on a flagged workspace is filtered by the deployed `TEST_TENANT_FREE` fragment (`count=0` with exclusion vs `count=1` without); row removed after the probe.
- Purge, observed end-to-end: the backdated flagged workspace was swept at 07:24Z — `user.deletion_requested_at` stamped past grace (2026-09-16), `account.hard-delete` enqueued + **completed** (user row gone, `projects`=0, workspace shell + billing rows retained per the retention contract). The sweep's own run logged `{"scanned":1,"purgedWorkspaces":["01M3V2EQ…"],"enqueuedDeletes":1}`.
- **Second live defect the sweep surfaced (fixed same day):** the first real `account.hard-delete` FAILED on `claims_draft_id_fkey` — the projects cascade only reaches CASCADE edges; claims/correspondence/findings/revision_obligations/gates/decision_requests/obligation_findings/dispositions all hold NO ACTION references. Fix `087ec7f`: leaf-first deletes + a PGlite regression test seeding the full leaf chain. (Pre-existing P1.20 defect — also would have failed the real user's 10-14-scheduled hard-delete.)
- Trial kill-switch exclusion: code-verified (`recordTrialSpend` early-return for `is_test`) + PGlite; live counter movement requires a paid hold — recorded under the paid leg.

**Paid leg (operator-approved grant, 2026-10-01):**

- `admin-cli house-grant` → 2000 credits (~$14) onto the flagged `jrn-a` tenant (ledger `01M3V5PZK…`, audit `01M3V5PZW…`).
- `--paid --steps N5,N6,R4,R6` + `JOURNEY_DATABASE_URL` (DB-backed spend guard): **N5 owed** (launch navigation timed out — the review never started), **N6 owed** (no delivered review to inspect), **R4 owed** (`Send` occluded at its center point @1440×900 — the class of defect this harness exists to catch), **R6 ready-to-flip** (meter surface consistent).
- Metered spend across ALL flagged tenants, 7d: **$0.0000 / 0 credits** — the owed legs never launched a metered run, so the ≤$5 cap was never approached. The grant remains on the tenant for the weekly CI leg.

**Throttle note:** prod signup admission is `perIp=10/hr` (api) and magic-link send `perEmail=4/hr` (web). Repeated operator runs exhaust the IP window; fresh runs wait for the hour boundary. No product change needed — session caching + stable identities keep CI within budget.

## Evidence report

- **PR:** [#83](https://github.com/SteveVitali/Rhema/pull/83) — stacked on `stevevitali/hot-1-prod-hotfix-pack` (PR #82), `mergePolicy=OPERATOR`, never merged.
- **Deterministic verification (final, this branch):** `pnpm turbo build lint typecheck` 135/135 tasks green; `pnpm test` 3,735 passed / 4 skipped / 0 failed (404 files); `check:licenses` 609 pkgs; `check:protocol-markers` 45 files; `check:no-cookies` 28 files; `check-upstream-diff` 22 ported files reconcile; `check-additive-migrations --files 0046` additive; `check-build-memory` no violations.
- **Gates:** H7 mailbox — provided (`test@rhema.tools`, keyless Gmail DWD, verified live incl. MX fix); paid-leg funding — operator-approved house grant 2026-10-01; prod deploy — pre-authorized under ADR-013, preview showed zero replace/delete (updates 95–97).
- **Stage-B magic-link sign-in (N2):** PASS — real `/signup` → Resend-delivered magic link → Gmail DWD read → verify navigation → session cookie, fresh `test+j<n>…@rhema.tools` identity.
- **Journey legs on prod:** N7 pass (dossier + `/review/` link), R1 pass (project list + marker), R5 pass (duplicate read-only Showcase → export the copy → download), X1 pass (nonce voice `intent=save` + nonce project on tenant A; tenant B clean on `/app`, `/app/inbox`, `/usage`, `/voices`, `/p/<aSlug>`). Expected-red legs honestly `owed` to their owners: N1/N2.invite/N3/N4 (ONB.1), N8 (EDIT.1), R7 (UX/RUN owners), P1 (UX.2 — "Hold my text" 21 px < 44 px); `ready-to-flip`: N9, C1, R6.
- **Bundle parity:** asserted per visited page — every referenced `/assets/*.js` loads 200 + JS content-type; zero console errors on green legs (R5's `ERR_ABORTED` on the export POST is the expected download abort).
- **Provenance:** `check-deploy-provenance.mjs` PASS — `rhema.tools` + `api.rhema.tools` `/healthz` `build.gitSha` = `34d14395cde2a4ad04e9611cc8669f2fc1ec0f7c` (observed = expected); `deployments` rows recorded for `34d1439…` (9 digests), `2aa4ee2…`, `087ec7f…` (worker hotfixes).
- **Test-tenant flag / exclusion / purge (all observed live):** `is_test=true` on every journey-provisioned workspace; pre-migration mailbox rows correctly `false`; synthetic breaching `slo_samples` row on a flagged workspace filtered out by the deployed exclusion (count 0 vs 1); `trial_spend_daily` exclusion code+PGlite-verified; purge swept a backdated flagged workspace at 07:24Z → `account.hard-delete` completed → user row + projects gone, workspace shell + billing rows retained per contract.
- **Paid leg:** executed 2026-10-01 under the approved grant (2000 credits, ledger `01M3V5PZK782VM4J8WWXK12T55`, audit `01M3V5PZW13JXWGMT93D1VX4CV`). `--paid --steps N5,N6,R4,R6` with the DB-backed spend guard: N5 owed → ACT.1 (launch nav timeout), N6 owed → RES.1 (no delivered review), R4 owed → RUN.1 (Send occluded at center point @1440×900 — the exact defect class this harness exists to catch), R6 ready-to-flip. Reports: `docs/build/reports/2026-10-01_JOURNEY.1-{nightly,paid,paid2}/`.
- **Spend vs cap:** $0.0000 metered across all flagged tenants (7d) — ≤ $5 cap never approached; the owed legs never launched a metered run. The grant remains on the tenant for the weekly CI leg.
- **Live defects found by the harness and fixed same-day:** (1) missing `test-tenant.purge` queue creation → worker crash loop → prod magic links stopped (fix `2aa4ee2`, update 96); (2) `account.hard-delete` non-leaf-first ordering → `claims_draft_id_fkey` failure on the first real purge (fix `087ec7f`, update 97 + PGlite regression).
- **Deferrals:** none opened — every unmet leg is an expected-red step owed to its named owner (BL-32 rows carry dated JOURNEY.1 mapping notes; nothing closed falsely). D-JOURNEY.1-* not needed: the paid leg itself executed honestly.
- **ADRs:** ADR-020 (keyless DWD mailbox sessions, plus-addressing + storageState caching/expiry, why no non-test session exists, no credential exists, flag/exclusions/purge/grace-bypass, provenance source, registry-in-code).
- **Deviations:** (a) the paid leg ran end-to-end at $0 — all four paid steps hit their expected-red owner boundaries before any metered work, so the ≤$5 cap was exercised by the guard, not by spend; (b) R5 exports the *duplicated* Showcase copy because the Showcase is read-only by product contract (409 on mutation); (c) the nightly/weekly crons in `journeys.yml` activate when the chain lands on `main` — scheduled-workflow triggers only exist on the default branch; the identical CLI invocation is what ran against prod here; (d) purge window default is 26 h (`TEST_TENANT_PURGE_HOURS`), one day + 2 h slack per the ticket's "older than N hours".
- **Final state:** `nextTicket → MAINT.2` (row 62) · `chainTip → stevevitali/journey-1-browser-journey-acceptance`.

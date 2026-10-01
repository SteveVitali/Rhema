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

- [ ] Registry semantics unit-tested (green-fail → failure; red-fail → owed; red-pass → warn);
      planning-ledger ids + owners all present. (deterministic)
- [ ] Occlusion helper fails on a fixed-footer-over-button fixture page; passes unobscured. (deterministic)
- [ ] Non-matching address never flagged; flag not API-settable (SEC.1 census includes it); `probeSlos` +
      trial accumulator exclude flagged; purge deletes only flagged past N h. Each has a PGlite test that
      fails with the exclusion removed. (deterministic)
- [ ] Spend guard refuses at ≥ $5 flagged-tenant weekly metered (fixture); `check-deploy-provenance` fails on
      SHA mismatch. (deterministic)
- [ ] Stage B nightly legs on prod: magic link arrives + signs in (N2); N7/R1/R5/X1 green w/ committed
      screenshots; per-page bundle parity; provenance check passes vs chain-tip SHA. (agentic)
- [ ] Stage B test tenants: journey workspaces flagged; absent from an SLO probe reading; a tenant past the
      (short-configured) purge window is hard-deleted. (agentic)
- [ ] Stage B paid (≤ $5): one weekly-paid journey completes IF funded by the operator grant (approved —
      execute the admin-CLI house grant). Else `D-JOURNEY.1-n`. (agentic)
- [ ] If the mailbox were unprovisioned → public legs only + session legs deferred. (moot — provided)
- [ ] Universal gate: verification green; every new behaviour test-covered; REQ ids stamped in the PR;
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
| `pnpm test` (root vitest, PGlite incl.) | **3,736 tests — 4 skipped, 0 failed** (403 files; the one initial failure was `check-additive-migrations.test.mjs`'s hardcoded "only 0045 after 0044" expectation — updated for 0046, now 13/13) |
| `pnpm check:licenses` | 609 pkgs OK (playwright Apache-2.0 allowlisted) |
| `pnpm check:protocol-markers` | 45 public files, no markers |
| `pnpm check:no-cookies` | 28 files OK |
| `node scripts/check-upstream-diff.mjs` | 22 ported files reconcile with the pin |
| `check-additive-migrations.mjs --files 0046` | additive — pass |
| `check-build-memory.sh .` | no violations |
| journeys pkg | typecheck + lint + 28 unit tests green (6 files: registry 7, mailbox 4, occlusion 1, runner 4, session 7, spend-guard 5) |
| api signup.test.ts | 14 (incl. 3 JOURNEY.1 flagging tests) |
| worker jobs.test.ts | 12 (incl. 4 purge-sweep tests) |
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
| Stage B: deploy + live legs + flag/SLO/purge observed | ⏳ pending | operator-tooling path (gcloud builds → pulumi up → migrate → journeys) |
| Stage B: paid leg (approved grant) | ⏳ pending | `admin-cli house-grant` to the flagged tenant, then `--paid` legs |

## Evidence log

_(populated Phase 5 — Stage B live legs)_

## Evidence report

_(populated Phase 6)_

# JOURNEY.1 — Browser-journey acceptance: the Playwright harness, the step registry, test tenants, provenance

Ticket: `docs/tickets/61_JOURNEY.1__browser-journey-acceptance.md` · run ledger:
`docs/build/runs/JOURNEY.1.md` · ADR: `docs/adr/ADR-020-browser-journey-harness.md`
Stacks on `stevevitali/hot-1-prod-hotfix-pack` (PR #82). **DO NOT MERGE** — mergePolicy=OPERATOR.

REQ-SPEC-29 (primary) · REQ-ARCH-39 · REQ-SPEC-30 (the system-pool purge seam) · BL-32 automatable half.

## Summary

Rounds 1–2 shipped ~3.7k green tests with a broken user journey — nothing walked the product as a
user. This PR lands the walker every later round-3 Stage B cites, plus the test-tenant machinery that
makes nightly walks safe.

- **`packages/journeys` (`@rhema/journeys`)** — the committed Playwright suite (Apache-2.0,
  allowlisted). Assertions are on visible text and on controls that are visible+enabled+unobscured
  at click time (Playwright actionability + `elementFromPoint`, the PR-J6 covered-Send class).
  Every step captures console errors, failed requests, `/assets/*.js` parity hits, and a screenshot.
  Steps are idempotent, nonce-namespaced, and run against a stage via
  `rhema-journeys --stage prod --steps …`.
- **The step registry** (`src/registry.ts`) owns the format: `{id, journey, asserts, owner,
  expected, paid}` for all 18 planning-ledger steps. A test parses the ledger table itself so
  id/owner drift fails. Runner semantics: green-fail ⇒ run failure; red-fail ⇒ `owed — owner X`;
  red-pass ⇒ `ready-to-flip`. Initial green: **N2, N7, R1, R5, X1**; owners flip the rest in their
  own PRs with the screenshot.
- **Sessions are real.** `JourneySessions` signs `test+<tag>@rhema.tools` identities in through the
  actual `/signup` → magic-link → mailbox → verify navigation. The mailbox client is keyless Gmail
  DWD: IAM Credentials `signJwt` as `rhema-journeys@rhema-507501.iam.gserviceaccount.com` (`sub`
  hard-pinned to `test@rhema.tools`, `gmail.readonly`) → OAuth jwt-bearer. No key file, no secret
  anywhere. `storageState` caches per identity in gitignored `.journeys-state/`; `assertTestIdentity`
  makes a non-test session impossible — no minted tokens, no DB-lifted sessions.
- **Test tenants** — `workspaces.is_test` (migration `0046`, additive) set server-side at
  provisioning only when the stored signup email matches `TEST_MAILBOX` (exact base or `+tag`,
  case-insensitive, exact-domain). No API route writes `workspaces` at all, so the flag is
  structurally unsettable by callers; it grants nothing — it only *excludes*: `probeSlos`/
  `slo_samples` skip flagged workspaces (platform-level NULL rows still count), and
  `recordTrialSpend` never counts flagged spend against the daily kill-switch ceiling.
- **Auto-purge** — the worker's `test-tenant.purge` consumer (hourly + boot; `jobs.ts` is already
  on the SEC.1 system-pool allowlist) stamps flagged workspaces older than `TEST_TENANT_PURGE_HOURS`
  (default 26 h) past the 14-day grace and enqueues the existing `account.hard-delete` pipeline —
  retention contract intact, unflagged workspaces never touched.
- **Provenance (REQ-ARCH-39)** — `Dockerfile ARG GIT_SHA` → `ENV RHEMA_BUILD_GIT_SHA` →
  `/healthz build.gitSha` on api + web; `scripts/check-deploy-provenance.mjs` compares against the
  chain tip and fails closed on absent/unknown/mismatch (also accepts `--deployed` SHAs from the
  `deployments` record of truth). Cloud Build bakes `_GIT_SHA` (caller-supplied — `builds submit`
  has no `$COMMIT_SHA`); the CI `images` job passes `github.sha`.
- **CI** — `.github/workflows/journeys.yml`: nightly $0 legs (06:05 UTC — no run creation, no chat
  turn) + weekly paid leg (Mon 04:35 UTC — one ≤300-word planted-error fixture + one chat turn,
  guarded at ≥ $5 ISO-week flagged-tenant metered), `workflow_dispatch` inputs `stage`/`steps`/`paid`,
  WIF auth (`id-token: write`, repo-attribute principalSet), report + screenshots artifact. The five
  ordered CI jobs are unchanged except a `playwright install chromium` line in the unit job so the
  occlusion test can never pass vacuously.
- **IaC** — `infra/pulumi/journeys.ts` adopts the 2026-09-30 hand-created resources (the
  `rhema-journeys` SA, `gmail.googleapis.com`, Token-Creator for the CI WIF principalSet and the
  operator) via `import:`; `compute.ts` wires `TEST_MAILBOX` (api) + `TEST_TENANT_PURGE_HOURS` (worker).
- **Docs** — ADR-020 (session mechanism, plus-addressing, storageState caching + expiry, why no
  non-test session exists, no credential exists, per-run email leg, flag/exclusions/purge/provenance,
  registry-in-code); BL-32 DEFERRALS rows get dated mapping notes (covered halves → named steps +
  owners; nothing deleted, none falsely closed); planning-ledger registry marked historical.

## Verification (deterministic, this branch)

| Gate | Result |
|---|---|
| `pnpm turbo build lint typecheck` | 135/135 tasks green |
| `pnpm test` | 3,735 passed / 4 skipped / 0 failed (404 files) |
| `check:licenses` / `check:protocol-markers` / `check:no-cookies` | green (609 pkgs; playwright Apache-2.0) |
| `check-upstream-diff` | 22 ported files reconcile |
| `check-additive-migrations` on `0046` | additive — pass |
| `check-build-memory` | no violations |

New/changed coverage: registry semantics + ledger parity (7), mailbox pin/extract/timeout (4),
occlusion on a real browser (1, CI-enforced), runner red/green semantics (4), session identity (7),
spend guard incl. the at-cap refusal (5), signup flagging (3 in `signup.test.ts`'s 14), purge sweep +
the leaf-first hard-delete regression (5 of `jobs.test.ts`'s 13), SLO exclusions incl. NULL-workspace
samples (5), trial-kill-switch exclusion, provenance script (4).

## Stage B (prod) — executed 2026-10-01

Deployed: Cloud Build `c9c726e8` (9 images, tag `34d1439`) → Pulumi updates 95–97 (zero
replaces/deletes) → migration `0046` applied (46 recorded) → provenance PASS
(`build.gitSha = 34d14395…` on api + web; `deployments` rows for all three SHAs).

**Live legs (real Gmail DWD mailbox):** N2 PASS (real magic-link sign-up → verify → session) · N7 PASS
(dossier + bundle parity) · R1 PASS (project list) · R5 PASS (duplicate the read-only Showcase → export
the copy → download) · X1 PASS (nonce voice + project on tenant A invisible to tenant B across
`/app`, `/app/inbox`, `/usage`, `/voices`, `/p/<slug>`). Expected-red legs honestly `owed` to their
owners: N1/N2.invite/N3/N4 (ONB.1), N8 (EDIT.1 — no edit affordance), R7, P1 (UX.2 — "Hold my text"
21 px < 44 px); `ready-to-flip`: N9, C1, R6. Reports + screenshots committed under
`docs/build/reports/2026-10-01_JOURNEY.1-{nightly,paid,paid2}/`.

**Test tenants observed live:** `is_test=true` on every journey-provisioned workspace (pre-migration
mailbox rows stay `false`); a planted breaching `slo_samples` row on a flagged workspace is filtered
out of `probeSlos` (count 0 vs 1); the hourly `test-tenant.purge` sweep backdated a flagged workspace
past grace → `account.hard-delete` completed → user + projects gone, workspace shell + billing rows
retained per the retention contract.

**Paid leg (operator-approved grant, 2000 cr):** `--paid --steps N5,N6,R4,R6` with the DB-backed spend
guard — N5 owed → ACT.1, N6 owed → RES.1, R4 owed → RUN.1 (chat `Send` occluded at its center point —
the exact defect class this harness exists to catch), R6 ready-to-flip. **Metered spend $0.0000** across
all flagged tenants (7d) — the ≤$5 cap was exercised by the guard, never approached by spend.

**Two live defects the harness's own first runs caught and this branch fixes:** (1) the new
`test-tenant.purge` queue was missing from the worker's `createQueue` list → boot crash loop → prod
magic links stopped arriving (fix `2aa4ee2`); (2) `account.hard-delete` deleted parent rows before
dependents → `claims_draft_id_fkey` on the first real purge — a pre-existing P1.20 defect that would
also have failed the real user's scheduled hard-delete (fix `087ec7f` + regression test).

## Deferrals

BL-32 rows carry dated JOURNEY.1 mapping notes; nothing closed falsely; no `D-JOURNEY.1-<n>` rows —
every unmet leg is an expected-red step owed to its named owner, and the paid leg executed honestly
(the weekly pipeline runs end-to-end; metered spend requires the owners' fixes).

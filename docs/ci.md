# Continuous integration

The [CI workflow](../.github/workflows/ci.yml) checks builds, types, lint, tests, migrations,
container images, and public-artifact policies. It runs on pull requests, pushes to `main`, and
manual dispatch. CI uses Node 22 and the pnpm version pinned in the root package manifest.

## Jobs and dependencies

Every run begins with `fast-path`, which decides whether the head needs the full pipeline or
can reuse a verified full-run result. The main jobs retain these names in either mode:

| Job                                                 | Full-run work                                                                                                                                                       | Depends on                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `typecheck / lint / unit`                           | Workspace build/lint/typecheck, Chromium installation, root Vitest suite, DOM contract, protocol drift and version checks                                           | `fast-path`               |
| `contracts`                                         | Additive-migration check against the base branch                                                                                                                    | `typecheck / lint / unit` |
| `integration`                                       | Composed integration suite with PostgreSQL 16, then Docker privilege-separation checks                                                                              | `contracts`               |
| `images (build + scan, pin digests)`                | All nine service image builds, AppArmor loader build/profile compilation, and provenance recording                                                                  | `contracts`               |
| `public-safe (gitleaks / markers / licence policy)` | Stub builds (kept-warm fallbacks), real web build, secret scan, dependency licences, protocol markers, ingestion credential policy, SPA size and environment checks | `typecheck / lint / unit` |
| `ci-pass anchor`                                    | Upload an anchor only after a successful full run                                                                                                                   | All preceding jobs        |

Thus `integration` and `images` can run in parallel after `contracts`; `public-safe` can run
after the first check job. The job names are stable check interfaces, not a strictly serial
execution order.

## The four recurrence guards (REQ-GUARD-1…4)

Round 7 added four guards so the defects it fixed cannot quietly return. Each runs in a
required job on the full path — never only on a deployed stage — and each is pinned by
`scripts/ci/guards-wiring.test.mjs`:

| Guard                        | What it enforces                                                                                                                                                                                                                                                                            | Job it runs in                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| GUARD-1 — no raw controls    | `rhema/no-raw-controls` is an `error` over `packages/ui/src/**` (except `primitives/**`) and `apps/web/src/**/*.tsx` (test sources excluded); the committed no-JS/SSR exemption list carries a reason per entry and acts inside the rule, so an unlisted raw control fails even beside an exemption | `typecheck / lint / unit` — the `pnpm turbo build lint typecheck` leg                                     |
| GUARD-2 — no internal keys   | the copy lint (`lintInternalTerms` over the COPY leaf values + the `bannedPatterns` ESLint block seeded from `banned-internal-terms.json`) and the DOM guard (`expectNoInternalKeys` — no `snake_case` workflow/phase/kind key in rendered text outside `data-*`)                                    | `typecheck / lint / unit` — the lint leg and `pnpm test`                                                  |
| GUARD-3 — no reload          | the no-document-reload walk harness (`packages/journeys/src/noreload.ts`): a scripted in-app walk keeps one document (one navigation entry, the window marker persists), sanctioned document navigations excepted by name; its Stage-A fixture walk is `noreload.local.test.ts`                      | `typecheck / lint / unit` — `pnpm test` after the bundled-Chromium install                                 |
| GUARD-4 — no occlusion       | `u3ProbePage` + `u3UnscrimmedViolation` at 1440×900, 1280×800, 1024×768, 820×1180 and 390×844 emulated: zero intersection between the Page text column, the dossier letter column or any tour target and an open un-scrimmed panel/overlay/menu, and no main column below 45 ch at ≥768 px; the seeded negative legs prove the assert fires (`u3-occlusion.local.test.ts`) | `typecheck / lint / unit` — `pnpm test` after the bundled-Chromium install                                 |

The browser legs fail hard when the server build or Chromium is absent, so they are never
silent skips. Their Stage-B twins (`U2.noreload`, `U3.occlusion`) run in the scheduled
journeys on the deployed revision.

Two limits of the current workflow are relevant to contributors:

- The image job's name mentions scanning, but the checked-in workflow has no container
  vulnerability-scanner invocation. Image builds and provenance are not evidence of a
  vulnerability scan.
- `public-safe` builds the protocol and evaluation stubs as packages. Amended 2026-11-03
  (operator ruling 2026-11-02, R6OSS.1): protocols ship public, so the `protocols-stub` build is
  a kept-warm fallback check (ADR-002 amendment/ADR-125), not a model of an export; the evals
  stub still substitutes for the private `@rhema/evals`. Neither stub build proves a
  public-export artifact. The [release-preparation guide](./open-source-readiness.md) and the
  [flip runbook](./ops/open-source-readiness.md) track the remaining publication work.

The run-task image built in CI explicitly allows a placeholder SDK. This supports image and
isolation checks without the separately supplied SDK trees; it is not an image for live model
execution. See the [vendor prerequisite](../apps/run-task/vendor/README.md).

## The documentation fast path

A pull request can take the fast path only when the classifier proves its relevant content is
already covered by a successful full run. It validates a `ci-pass-<hash>` anchor, ancestry, the
changes since that anchor, and either matching content or the required base context. Missing,
invalid or ambiguous evidence selects a full run.

Eligibility comes from [`scripts/ci/fast-path-paths.txt`](../scripts/ci/fast-path-paths.txt):
currently `docs/`, excluding `docs/build/tools/` and `docs/build/record_policy/`. **Root README,
CONTRIBUTING and AGENTS changes are not eligible just because they are Markdown.** Workflow,
code, `.gitleaks.toml`, or boundary-tool changes also require the full path.

On a fast run, gitleaks, the ingestion credential check and the committed
[documentation-reader test subset](../scripts/ci/neutral-readers.txt) still run. Each job reports
`CI-FAST-PATH` in its logs/summary and retains its successful check result; a fast run never
writes another anchor. A green check should be read together with this mode.

Pushes to `main` and manual `workflow_dispatch` runs always take the full path. The
[classifier](../scripts/ci/lib/fast-path.mjs) is the detailed contract.

## Maintainer cadence policy

This section preserves the policy introduced by [ADR-115](./adr/ADR-115-ci-fast-path-same-tree-anchor.md)
and formerly documented in `docs/development.md`.

One successful **full** run, read by the `ci-boundary` tool, is required at each round-6 gate
(`GATE-R6B`, `GATE-LAUNCH`, `GATE-ACCEPT.R6`) and each deploy SHA, including the R6DEP.1,
R6SWP.1, R6CNT.2 redeploy, and R6LCH.1 activation boundaries. A per-ticket boundary may accept a
valid fast-path pass at its head. Do not add a full-run requirement to every ticket.

If a gate or deployment needs a full run and its revision has none, a maintainer can dispatch:

```bash
gh workflow run ci.yml --ref "${RHEMA_CI_BRANCH:?Set RHEMA_CI_BRANCH to the branch to check}"
```

Wait for the run at the intended head to succeed before reading the boundary. This is the
forcing mechanism for a full run; it is not required for each documentation edit.

The existing policy also prohibits:

- Reusing a PR pass in place of a full `main` push run.
- Adopting the phase-2 CI levers before the measured-delta decision tracked by `D-R6CI.1-1`:
  PGlite template cloning, unit-test sharding/job-graph changes, and a shared image builder.
- Scoping code-head image builds to only selected images.
- Using `[skip ci]`, which leaves the boundary pending.
- Widening the fast-path allowlist or anchor contract without a new ADR.

The policy's decision and deferral identifiers point into the preserved build records. This
guide does not change their status.

## Scheduled browser journeys

The separate [journeys workflow](../.github/workflows/journeys.yml) configures a nightly sweep at
**06:05 UTC** and a weekly paid sweep on **Monday at 04:35 UTC**, plus manual dispatch. These
schedules were restored by R6SWP.1; the earlier pause described in the original cadence page no
longer matches the workflow.

Journey runs authenticate to GCP through Workload Identity Federation, use the designated test
mailbox, and compare the deployment with an expected revision. The schedule pins `github.sha`;
a manual dispatch can supply `expect-sha`. An enabled schedule or green source build does not
prove that the expected revision is deployed or that the browser journey passes.

The weekly paid dispatch retains the enforced spend guard and declared headroom. See
[Testing](./testing.md#deployed-browser-journeys) and the
[journey package guide](../packages/journeys/README.md) for prerequisites and authorization.

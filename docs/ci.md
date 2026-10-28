# Continuous integration

The [CI workflow](../.github/workflows/ci.yml) checks builds, types, lint, tests, migrations,
container images, and public-artifact policies. It runs on pull requests, pushes to `main`, and
manual dispatch. CI uses Node 22 and the pnpm version pinned in the root package manifest.

## Jobs and dependencies

Every run begins with `fast-path`, which decides whether the head needs the full pipeline or
can reuse a verified full-run result. The main jobs retain these names in either mode:

| Job                                                 | Full-run work                                                                                                                                 | Depends on                |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `typecheck / lint / unit`                           | Workspace build/lint/typecheck, Chromium installation, root Vitest suite, DOM contract, protocol drift and version checks                     | `fast-path`               |
| `contracts`                                         | Additive-migration check against the base branch                                                                                              | `typecheck / lint / unit` |
| `integration`                                       | Composed integration suite with PostgreSQL 16, then Docker privilege-separation checks                                                        | `contracts`               |
| `images (build + scan, pin digests)`                | All nine service image builds, AppArmor loader build/profile compilation, and provenance recording                                            | `contracts`               |
| `public-safe (gitleaks / markers / licence policy)` | Stub builds, real web build, secret scan, dependency licences, protocol markers, ingestion credential policy, SPA size and environment checks | `typecheck / lint / unit` |
| `ci-pass anchor`                                    | Upload an anchor only after a successful full run                                                                                             | All preceding jobs        |

Thus `integration` and `images` can run in parallel after `contracts`; `public-safe` can run
after the first check job. The job names are stable check interfaces, not a strictly serial
execution order.

Two limits of the current workflow are relevant to contributors:

- The image job's name mentions scanning, but the checked-in workflow has no container
  vulnerability-scanner invocation. Image builds and provenance are not evidence of a
  vulnerability scan.
- `public-safe` builds the protocol and evaluation stubs as packages. It does not replace the
  real protocol package and rebuild the entire repository as a public export. The
  [release-preparation guide](./open-source-readiness.md) tracks that separate requirement.

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

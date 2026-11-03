# Public-release readiness

This page records the boundary between the current source repository and its intended public
release. It is a maintained release reference, not a declaration that publication is complete.

Amended 2026-11-03 (operator ruling 2026-11-02, R6OSS.1): the publication shape changed from
"export a sanitized tree" to **"flip this repository's visibility"** — `packages/protocols`
ships public with its history. Private evaluations stay outside the public distribution
(`RHEMA_EVALS_PATH`). Changing either boundary remains a maintainer decision. It cannot be
inferred from the presence of an MIT license or a CI job named `public-safe`. The operator's
flip procedure and this run's audit results live in
[`docs/ops/open-source-readiness.md`](ops/open-source-readiness.md).

## What a checkout contains

| Component                                         | Current source tree                                                          | Intended public boundary                                                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Application, shared libraries, and infrastructure | Tracked here                                                                 | Review for publication under the repository's [MIT license](../LICENSE) and applicable third-party terms.          |
| Editorial protocols                               | `packages/protocols` is a committed workspace member, including Git history. | **Public** (operator ruling 2026-11-02; ADR-002 amendment/ADR-125). Ships with the tree and its history — no swap. |
| Protocol stub                                     | `packages/protocols-stub`, named `@rhema/protocols-stub`                     | Dormant fallback shim, retained and still compiled by `public-safe`; no longer the intended replacement.           |
| Private evaluations                               | Optional external checkout selected by `RHEMA_EVALS_PATH`                    | Excluded. The default checkout resolves `@rhema/evals` to `evals-stub`.                                            |
| Model runtime                                     | Separately licensed material vendored into the run-task image at build time  | Review acquisition and redistribution terms separately; it is not installed by the contributor quickstart.         |
| Design/build records and fixtures                 | Tracked here, with historical observations and example material              | Review sensitivity and redistribution rights before choosing the release contents and history.                     |

The package behavior is defined by [pnpm-workspace.yaml](../pnpm-workspace.yaml),
[.pnpmfile.cjs](../.pnpmfile.cjs), the [protocol stub](../packages/protocols-stub/src/index.ts), and the
[runtime vendor guide](../apps/run-task/vendor/README.md). There is no automatic protocol substitution
when the private package is absent.

## What has been checked

A documentation-refresh probe on **2026-10-27**, using source revision
`2a652643fdaf53535617036a3439007b3d481fb8`, Node 22.23.4, and pnpm 10.32.1, found:

| Check                                                                                                                          | Result                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Clean source checkout, private evaluation path unset: frozen install                                                           | Passed.                                                                                                      |
| Same checkout: build, lint, and typecheck                                                                                      | Passed, 135 tasks.                                                                                           |
| Disposable copy with private protocols omitted and the public stub installed at the original package path/name: frozen install | Failed: protocol importer dependencies no longer match the lockfile.                                         |
| Same disposable copy, after regenerating only its lockfile: application build                                                  | Failed in `@rhema/run-sheet`: missing estimator functions/types and workflow manifest exports from the stub. |

The probe was an interface/build experiment, not a sanitized release artifact. It retained the
original stub package as well as the replacement to keep existing project references valid. No
release, history rewrite, or source-code fix was performed. A different export layout still needs
its own install, build, and test proof.

The current [public-safe CI job](../.github/workflows/ci.yml) builds the two stub packages separately
and checks public-facing outputs built from the current source tree. Since the 2026-11-02 ruling the
stub build is a kept-warm fallback check, not an export model; with protocols public there is no
export gap to close for that package.

## Work required before publication

1. **Choose and verify the public package boundary.** _Resolved for protocols 2026-11-03
   (operator ruling 2026-11-02):_ `packages/protocols` publishes with the repository — no export,
   no swap. The boundary that remains is `RHEMA_EVALS_PATH` (private evals stay out); a fresh
   public clone builds against `evals-stub`, which is the same shape CI already exercises.
2. **Choose the release contents and history.** Review protocol material, historical security
   findings, operational records, screenshots, fixtures, and personal data. The private source
   repository's append-only rules remain in force; an approved export can select different contents
   without rewriting its historical evidence. Deleting a file at the tip does not remove it from
   earlier commits. The full-history audit ran under R6OSS.1 — findings and per-class dispositions
   are in [`docs/ops/open-source-readiness.md`](ops/open-source-readiness.md).
3. **Verify distributed dependencies and notices.** Follow [LICENSES.md](../LICENSES.md) for runtime
   SDK terms, container binaries, font notices, and the limits of the npm license gate. Review the
   actual artifacts intended for distribution. Code comments or an allowlist entry are not a
   substitute for that review.
4. **Prove the advertised contributor experience on the public export.** The current guides
   distinguish local build/tests and web-shell inspection from a full configured service. Update
   them only when the public artifact supports the documented workflow. Full self-hosting currently
   requires substantial GCP and service configuration.
5. **Confirm the community's operating policies.** The repository includes contribution, support, security,
   and issue/PR guidance. Before launch, choose a code of conduct and its responsible reporting and
   enforcement contact, and state any supported-release policy. These policies are not adopted by
   implication from a documentation refresh.

If publishing by changing the existing repository's visibility, review GitHub-hosted history and
artifacts as well: GitHub makes Actions history and logs public with that change.
[GitHub's visibility guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)

## Implementation questions exposed by the documentation audit

These are follow-up engineering or policy questions. The refresh corrected misleading instructions
but did not change the implementation or claim live verification.

| Finding                                                                                                                           | Source evidence                                                                                                                                                   | Follow-up                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Provider-key placement differs from the required proxy-only boundary on optional worker paths.                                    | [`apps/worker/src/main.ts`](../apps/worker/src/main.ts) loads walkthrough/ingest model secrets and constructs direct clients, including `AnthropicReconstructor`. | Reconcile those paths with the security requirement and verify the deployed configuration.                                             |
| The orphan metric's time predicate does not match the intended lingering-orphan description.                                      | [`packages/orchestrator/src/slo.ts`](../packages/orchestrator/src/slo.ts) uses `state_since > now() - interval '10 minutes'`.                                     | Review metric semantics and add a discriminating test before treating the value as an aged backlog count.                              |
| Incident runbooks previously prescribed a global launch-pause switch and outage banner that have no implemented operator control. | [`provider-outage.md`](ops/playbooks/provider-outage.md), [`orphan-storm.md`](ops/playbooks/orphan-storm.md), API run routes, and worker admission behavior.      | Define and verify a supported incident admission procedure. The corrected runbooks no longer tell operators to flip nonexistent flags. |
| The image job's title suggests scanning, but the workflow has no container vulnerability scanner invocation.                      | [CI workflow](../.github/workflows/ci.yml), `images` job.                                                                                                         | Decide and implement the release scanning requirement; image-build success alone does not prove a vulnerability scan.                  |

Keep these findings separate from dated deployment evidence and from the repository's existing
[deferrals ledger](tickets/DEFERRALS.md). Completing a follow-up requires its own verification; a
clearer explanation is not evidence of a fixed system.

# Open-source documentation refresh — 2026-10-27

Source baseline: `2a652643fdaf53535617036a3439007b3d481fb8` (`main`). This is documentation
evidence, not a deployment, public release, security certification, or closure of a build-chain
obligation. No application code, test assertions, workflows, dependency manifests, or lockfiles
were changed. The separate unmerged launch branch was not included.

## Method and scope

Used the maintainer's `refresh-repo-docs` skill in full-audit mode for maintained human docs and
`agent-docs` in deep-refresh mode, bootstrapping uncovered scopes. Findings and source evidence
were recorded before authoring. Human entry pages were substantially rewritten; operator and
security procedures received targeted corrections. Agent instructions were restructured with an
old-clause-to-new-location preservation review.

The baseline contains 1,090 tracked Markdown files. The mode inventory identified 526 build,
258 ticket, 125 ADR, 65 research/design, and 54 private-protocol files, alongside maintained
guides, top-level specifications, and fixtures. Frozen/generated/history content received
classification and detector triage, not a claim-by-claim rewrite. Private protocol bodies were
not used as source material for public prose. Historical budgets, deployment observations, and
security findings remain attributed to their dates. Existing build ledgers, tickets, ADRs,
specifications, and executable fixtures were not edited. `docs/build/README.md` is the existing
living navigation exception; its migration table was preserved.

Independent reviews covered the newcomer path, source accuracy, and agent-rule preservation.
The reviews checked whether a contributor can build and test without private evaluations or
maintainer skills, and whether an agent can find the applicable web, database, journey, and
infrastructure constraints before acting.

## Human-document findings and disposition

Paths in this table are repository-relative. Severity describes the original defect; it is not
a rating of product readiness. “Critical” means following the old instruction could produce a
wrong result; “moderate” means misleading or missing context.

| Document                                     | Finding and correction                                                                                                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `README.md`                                  | Moderate mode drift: replaced ticket/deployment chronology with purpose, source capabilities, verified contributor quickstart, source map, and candid export status.                                               |
| `CONTRIBUTING.md`                            | Critical prerequisite drift: corrected Node/pnpm guidance; added fork workflow, focused validation, PR expectations, and protected-record rules.                                                                   |
| `SUPPORT.md`                                 | Gap: separates reproducible repository questions, hosted-service contact, and private vulnerability reports using existing contacts.                                                                               |
| `.github/ISSUE_TEMPLATE/bug_report.md`       | Gap: concise reproduction, revision, expected/actual behavior, and sanitized evidence.                                                                                                                             |
| `.github/ISSUE_TEMPLATE/feature_request.md`  | Gap: user problem, proposed behavior, alternatives, and scope.                                                                                                                                                     |
| `.github/PULL_REQUEST_TEMPLATE.md`           | Gap: problem/result, relevant verification, and remaining prerequisites without new approval machinery.                                                                                                            |
| `docs/README.md`                             | Moderate navigation drift: task-oriented guide index; preserved and extended document modes; replaced stale production posture with provenance rules.                                                              |
| `docs/development.md`                        | Critical mode gap: actual install/build/test/watch guide; moved the existing CI policy into `docs/ci.md` without dropping its obligations.                                                                         |
| `docs/architecture.md`                       | Gap: source-linked service and data-flow map, browser split, package boundaries, and isolated run execution.                                                                                                       |
| `docs/testing.md`                            | Critical gap: explains built-package imports, Chromium, optional mutating PostgreSQL and Docker legs, focused checks, and deployed acceptance.                                                                     |
| `docs/configuration.md`                      | Gap: distinguishes zero-credential builds, web-shell inspection, parser defaults, deployment bindings, and full-service prerequisites.                                                                             |
| `docs/ci.md`                                 | Critical drift: actual job DAG, restored journey schedules, preserved cadence policy, fast-path limits, and absent container-scanner invocation.                                                                   |
| `docs/open-source-readiness.md`              | Critical gap: exact private/public boundary, measured export failure, publication prerequisites, and implementation questions.                                                                                     |
| `SECURITY.md`                                | Moderate overclaims: qualified tenant/network controls, retained existing contact/acknowledgement aim, and distinguished required controls from deployment evidence.                                               |
| `LICENSES.md`                                | Critical overclaims: removed blanket GPL/LGPL exemption assertions; documented component exceptions, font-notice review, SDK terms, and gate limits with primary references.                                       |
| `apps/web/README.md`                         | Critical broken startup: replaced inert `tsx watch src/main.ts` with compiled-server workflow; updated renderer/source map and build checks.                                                                       |
| `apps/run-task/vendor/README.md`             | Moderate audience gap: clarifies separately supplied SDK material, exact build gate, and why the CI placeholder cannot execute live models.                                                                        |
| `integration/README.md`                      | Critical prerequisite gap: separates local PGlite tests from disposable PostgreSQL and operator-owned live drivers; corrects golden-cadence claims.                                                                |
| `infra/PROD-BRINGUP.md`                      | Critical stale procedures: clarified command directories, current source topology, signed-GCS delivery, secret provisioning exceptions, and historical versus current rollback guidance. Preserved dated receipts. |
| `infra/pulumi/README.md`                     | Critical procedure drift: current infrastructure map, separate npm project, guarded preview lifecycle, secret/ownership boundaries, and source-versus-live distinction.                                            |
| `packages/journeys/README.md`                | Critical broken CLI example: use compiled CLI path from root; correct shell continuation, browser prerequisites, and scope flags while retaining spending controls.                                                |
| `packages/contracts/test/fixtures/README.md` | Moderate drift: fixtures prove schema shape, not model quality; preserved provenance and corrected rerun cadence.                                                                                                  |
| `docs/build/README.md`                       | Moderate stale navigation: removed obsolete PR-count bound; named external checker prerequisite and committed append-only check. Migration history unchanged.                                                      |
| `docs/ops/debit-mode-flip.md`                | Critical procedure drift: explicit working directories and filtered environment inspection; preserved calibration/notice gates and the at-least-30-day notice requirement.                                         |
| `docs/ops/golden-rerun-rule.md`              | Critical shell placeholders: required real bound environment values; preserved rerun triggers, spend bound, and NON-EVIDENCE conditions.                                                                           |
| `docs/ops/launch-flips.md`                   | Minor command clarification; preserved activation order and dated observation.                                                                                                                                     |
| `docs/ops/on-call.md`                        | Critical stale status: distinguished original unarmed-monitoring receipt from later binding; actual signal-to-playbook mapping and fallback.                                                                       |
| `docs/ops/proxy-ha.md`                       | Critical recovery clarification: restart is not an image rollback; dated resource snapshot and measured drill remain dated; removed unsupported current billing assertion.                                         |
| `docs/ops/redis-degradation-analysis.md`     | Historical analysis: added scope note; preserved original prices, observations, and rulings.                                                                                                                       |
| `docs/ops/slo-review.md`                     | Moderate drift: current probe ownership and uncovered-alert fallback; preserved breach-pause and unmeasured-is-not-green rules.                                                                                    |
| `docs/ops/stripe-webhook-endpoint.md`        | Critical CLI drift: indexed event parameters, explicit live mode, root-qualified admin CLI, complete identifiers, and historical/current verification distinction. No Stripe action performed.                     |
| `docs/ops/playbooks/boundary-violation.md`   | Critical wrong signal/files: separated delivery failures from containment violations; replaced removed paths and unsupported manual-pause instructions.                                                            |
| `docs/ops/playbooks/cost-anomaly.md`         | Critical invented controls: removed nonexistent manual breaker and `BILLING_REFIT` switch; clarified run-attempt reconciliation and refund limits.                                                                 |
| `docs/ops/playbooks/egress-denied-spike.md`  | Moderate diagnostic drift: query time window/test-tenant exclusion and aggregate-versus-per-run threshold distinction.                                                                                             |
| `docs/ops/playbooks/orphan-storm.md`         | Critical code suspect: documented reversed age predicate without changing code; corrected retry count and health limitations; removed nonexistent launch switch.                                                   |
| `docs/ops/playbooks/provider-outage.md`      | Critical code gap: global outage pause/banner absent; documented supported diagnosis/escalation without pretending the desired control exists.                                                                     |
| `docs/security/pen-test-findings-triage.md`  | Critical public-intake hazard: restricted exploit reports, sanitized tracking, and canonical deferral-ID grammar; retained severity/launch gates.                                                                  |
| `docs/security/pen-test-scope.md`            | Moderate stale surfaces: current renderer/user-content boundaries and explicit engagement scope; no unscoped permission to test production.                                                                        |
| `docs/security/pen-test-vendor-package.md`   | Critical wrong architecture/provisioning: PostgreSQL-backed pg-boss, current auth/proxy/content model, and verified engagement prerequisites.                                                                      |
| `docs/security/rls-exposure-since-0026.md`   | Historical audit: added date/scope note and current-reference pointer; original findings and receipts retained.                                                                                                    |
| `docs/security/tenancy-audit.md`             | Moderate role/secret drift: canonical audited-seam census, system-versus-user roles, and dated correction of nonproduction DSN injection claims.                                                                   |
| `docs/security/usercontent-csp-audit.md`     | Critical overclaim: current CSP summary and explicit CSS tradeoff; preserved the original origin record and ADR-113 amendment.                                                                                     |

## Agent-instruction preservation map

The root now holds universal constraints and routes work into nine scoped documents. Root
`CLAUDE.md` remains byte-identical (`@AGENTS.md`). Root-plus-largest-scope is approximately
19.9 KiB. The semantic audit checked 50 source claims; the structural detector alone found no
problem in the original, despite stale behavioral instructions.

| Original obligation                                                                                        | Destination and treatment                                                                                                    |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Authority, TypeScript/no Python, pnpm/Turbo/Pulumi/GCP, commands                                           | Root Purpose, Architecture, Build & Test; corrected runtime floor and test prerequisites.                                    |
| Explicit dependencies, composite references, package imports, `.js`, canonical vocabulary, adding packages | Root Code Conventions; retained all boundaries and harness-brand prohibition.                                                |
| Deferred obligations, closing unblocked criteria, phase-gate prohibition                                   | Root Critical Gotchas and `docs/AGENTS.md`; retained verify/record requirements.                                             |
| Memory marker/layout, machine keys, identifier grammar, generated ADR index, scratch retirement            | Root Build memory and `docs/AGENTS.md`; retained exact record semantics and generator ownership.                             |
| Append-only history, stacked chain, OPERATOR merges, gates as pauses, no ledger secrets                    | Root Build memory and `docs/AGENTS.md`; no authority or history relaxation.                                                  |
| Stage-B browser evidence, screenshots, served assets, chain-tip provenance                                 | Root Critical Gotchas and web/journeys scopes; remains cross-repository binding.                                             |
| Non-bypass user role, audited elevated seams, workspace predicates, two-tenant probe                       | Root Critical Gotchas and API/DB scopes; includes migration and tenant-context guidance.                                     |
| Metered-debit requirement, truthful prices/trials/durations, research disclosure/refund                    | Root Critical Gotchas and orchestrator scope; retained the requirement while disclosing the still-configured committed mode. |
| Renderer split, Page exceptions, removed flags, source-versus-live proof                                   | Web scope with root provenance rule; corrected complete public-route census and metadata-versus-activation distinction.      |
| Delegated navigation guards, push behavior, no intent preload, settle markers, native hashes               | Web and journeys scopes; preserved listener ownership and mechanism-specific acceptance.                                     |
| BFF-only JSON transport, form/JSON equivalence, status/errors, query conventions                           | Web scope; clarified actual status mapping without weakening mutation or authorization contracts.                            |
| DOM selector manifest, component versus browser tests, permanent islands, source-mode merge, rollback      | Web scope; retained each contract and design-change boundary.                                                                |
| Journey registry proof, CLI flags, origins, invite/renderer modes, leg ID grammar                          | Journeys scope; corrected executable CLI syntax and preserved red/green evidence rules.                                      |
| Weekly/leg caps, fixture size, explicit headroom, system-role metering, cron exception, opt-outs           | Journeys scope and root paid-action rule; no new spending authorization.                                                     |
| Funded nine-check gate, scope exclusions, ordering, stable tenant, pause/reauthorization                   | Journeys scope; preserved the dated October 16 refusal and directed readers to later recorded rulings.                       |
| Private protocols/export swap, optional evals, no submodules, marker/IP prohibition, upstream drift        | Root Critical Gotchas and commands; distinguished stub compilation from complete export proof.                               |
| Stage facts, preview cap/no prod secrets, guarded ownership/lifecycle, secret stdin, teardown order        | Infra scope with root live-script routing; retained all operational constraints.                                             |
| CI stable jobs and full/fast evidence                                                                      | Root Build & Test and CI guide; corrected the false serial ordering to the actual dependency DAG.                            |
| Proxy-only provider keys, Secret Manager, no plaintext web/collab secrets, model-process isolation         | Root Critical Gotchas and run-task/proxy scopes; retained policy and separately reported optional worker discrepancies.      |

## Verification

Local runtime: Node 22.23.4, pnpm 10.32.1. Private eval path and remote-cache credentials were
unset for the clean-checkout install/build. The full test run additionally unset database URLs,
installed Chromium, and used `CI=true RHEMA_DOCKER_TESTS=0` to avoid the optional Docker leg.

| Check                                | Result                                                                                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`     | Passed; default eval stub selected.                                                                                                                                  |
| `pnpm turbo build lint typecheck`    | Passed, 135/135 tasks.                                                                                                                                               |
| README contract-test command         | Passed, 3 tests.                                                                                                                                                     |
| Initial full `pnpm test`             | 514 test files passed, 2 failed, 2 skipped; 6,144 tests passed, 5 failed, 6 skipped. All five failures were documentation expectations in two files.                 |
| Corrected documentation expectations | `observability.test.ts` and `licenses-doc.test.mjs` passed, 17 tests. Restored accurate alert labels, SDK/brand facts, and Pandoc process wording; no test weakened. |
| Public-artifact checks               | License policy, protocol markers, never-cookies, SPA gzip budgets, SPA environment leaks, and DOM contract all passed.                                               |
| Built web host without backend       | `/healthz`, `/`, `/login`, `/terms` returned HTTP 200. Public-page inspection only; no authenticated/live journey claimed.                                           |
| Shell examples in agent instructions | 13 Bash blocks passed syntax checks; operator commands source-checked, not executed.                                                                                 |
| History comparison                   | Committed append-only checker passed against the baseline.                                                                                                           |
| Final documentation-reader rerun     | Seven files, 52 tests passed: the five CI neutral readers plus license-document and Pulumi runbook-completeness checks.                                              |
| Parsed Markdown links and anchors    | 335 local references across all 53 changed/new Markdown files; no unresolved target or anchor.                                                                       |
| Agent freshness detector             | 10 documents, zero issues after making source-relative, external-tool, and runtime-file references unambiguous.                                                      |
| Formatting and whitespace            | Rewritten guides and agent files formatted explicitly; mixed historical files retain minimal diffs. `git diff --check` passed.                                       |

CI on the PR is authoritative for its final committed head; this report does not substitute
for that run. Root documentation changes require the full pipeline under the existing classifier.

The external build-memory structure checker reported one existing clean-checkout violation:
`docs/build/logs/.gitignore` is absent. It also reported 15 existing record warnings, including
CURRENT STATE formatting and legacy history schemas. The refresh did not rewrite those records
or create an ignored sentinel to disguise the clean-checkout limitation. The committed
append-only check passed. The same one violation and 15 warnings were reproduced against
the baseline documentation in the disposable export tree.

The initial human detector scanned 561 documents and reported 16 apparent broken references,
all example URI/path tokens in protected specifications, private material, or executable
fixtures. Those examples were not silently rewritten. Changed maintained documents receive
separate parsed Markdown link and anchor validation; the detector is not a semantic audit.
The final human scan found the same 16 examples across 570 documents. Its 11 pre-commit recency
suspects were in the rewritten guides: Git still assigned their previous commit dates, and each
cited source was reviewed during this audit. No maintained link remained broken.

## Remaining work

The disposable public-export probe failed frozen install because the protocol importer no
longer matches the lockfile. After regenerating that disposable lockfile, the application build
failed in `@rhema/run-sheet` because the stub lacks required estimator and workflow interfaces.
The source checkout was not modified by the experiment. See
[public-release readiness](../../open-source-readiness.md) for the method and next steps.

That guide also records the optional worker provider-key discrepancy, orphan-age predicate,
missing outage admission control, missing image-scanner invocation, distribution/notice review,
and history/fixture disclosure decisions. They remain engineering or maintainer work. No live
infrastructure, paid inference, publication, license change, or history rewrite occurred here.

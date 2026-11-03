# AGENTS.md — Rhema

## Purpose

- Rhema is a writing and editorial workflow system: collaborative documents, structured reviews,
  revisions, research, and budgeted AI runs.
- This file defines repository-wide constraints. Read the nearest scoped `AGENTS.md` before editing;
  scoped instructions add detail without relaxing the security, accounting, or history rules here.
- All paths and commands below are relative to the repository root. Human onboarding starts in
  `CONTRIBUTING.md` and `docs/development.md`.

## Architecture

- TypeScript end-to-end; no Python. pnpm workspaces + Turborepo + composite TypeScript projects.
- GCP-first deployment through TypeScript Pulumi; model inference is designed to use the direct
  Anthropic API through the egress proxy.
- Browser → Hono web host / same-origin BFF → API → orchestration / worker → isolated run-task.
  PostgreSQL stores tenant data and job state; Redis coordinates live events; GCS stores artifacts.

| Work area                                           | Read before changing it           |
| --------------------------------------------------- | --------------------------------- |
| SSR, SPA, navigation, editor integration, BFF       | `apps/web/AGENTS.md`              |
| API routes, auth, request tenancy                   | `apps/api/AGENTS.md`              |
| Schema, migrations, tenant isolation                | `packages/db/AGENTS.md`           |
| Run lifecycle, gates, delivery, accounting coupling | `packages/orchestrator/AGENTS.md` |
| Harness, model process, sandbox                     | `apps/run-task/AGENTS.md`         |
| Provider access, metering, research limits          | `apps/egress-proxy/AGENTS.md`     |
| Browser acceptance and any paid verification        | `packages/journeys/AGENTS.md`     |
| Infrastructure or any deploy/preview script         | `infra/AGENTS.md`                 |
| Guides, specifications, tickets, build records      | `docs/AGENTS.md`                  |

- For cross-package work, read each affected area's instructions. Before using `scripts/live`, read
  the infrastructure instructions and, for journey/funded scripts, the journey instructions too.
- Shared DTOs and vocabulary live in `packages/contracts`; UI primitives in `packages/ui`; editor
  logic in `packages/editor`; production service adapters in `packages/live-clients`.

## Key Files

| File                 | Lines (approx) | Purpose                                                          |
| -------------------- | -------------- | ---------------------------------------------------------------- |
| `package.json`       | ~50            | Node/pnpm requirements and root commands.                        |
| `tsconfig.base.json` | ~50            | Strict NodeNext compiler and composite-project defaults.         |
| `eslint.config.js`   | ~200           | Package, tenant-pool, vocabulary, and browser-import boundaries. |
| `vitest.config.ts`   | ~50            | Repository test discovery and web DOM-test environment.          |

## Build & Test

- Use Node 22 (22.12 or newer, matching CI's major) and the pnpm version in `package.json`.
  The package engine floor is Node 20.19; the Vite build also constrains supported Node versions.
- Build before tests that import workspace packages: those exports resolve to generated `dist` files.
  No operator credentials or private eval checkout are needed for the ordinary build/test path.

```bash
pnpm install --frozen-lockfile
pnpm turbo build lint typecheck
pnpm --filter @rhema/journeys exec playwright install chromium
pnpm test

# Focused example: build the package's dependency closure, then run one test file.
pnpm turbo build --filter=@rhema/db...
pnpm exec vitest run packages/db/src/rls.test.ts
```

| Check                                         | Command                                        |
| --------------------------------------------- | ---------------------------------------------- |
| Dependency license policy                     | `pnpm check:licenses`                          |
| Private material in public bundles            | `pnpm check:protocol-markers`                  |
| Never-cookies ingestion contract              | `pnpm check:no-cookies`                        |
| SPA gzip ceilings / environment leaks         | `pnpm check:spa-budget` / `pnpm check:spa-env` |
| Declared, emitted, and asserted DOM selectors | `pnpm check:dom-contract`                      |
| Protocol port against vendored upstream pin   | `node scripts/check-upstream-diff.mjs`         |
| Formatting check                              | `pnpm format`                                  |

- CI's core jobs are `typecheck / lint / unit`, `contracts`, `integration`, `images`, and
  `public-safe (gitleaks / markers / licence policy)`, with `fast-path` and `ci-anchor` helpers.
  Their dependency graph and full-versus-fast evidence requirements are documented in
  `.github/workflows/ci.yml` and `docs/ci.md`.
- A skipped Docker, server-Postgres, browser, or live leg is not proof of that leg. Report it explicitly.

## Code Conventions

- Declare every imported dependency in the owning package's `package.json`; use `@rhema/*` across
  package boundaries. Within a package, relative TypeScript imports use the emitted `.js` extension.
- Correct ✓: `import type { TenantClient } from "@rhema/db"` and `import { helper } from "./helper.js"`.
  Wrong ✗: reaching into another package through `../../db/src/...` or omitting `.js`.
- Preserve composite projects and references. The compiler enables `strict`,
  `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, and `noImplicitOverride`.
- Use canonical vocabulary from `packages/contracts/src/reserved-strings.ts`: plans, model tiers,
  rigor, seats, and approvals are separate concepts. Never call the product's harness “Claude Code”
  in user-facing strings; the Rhema ESLint rules enforce banned copy and package boundaries.
- To add a package: create an explicit workspace member under `apps` or `packages`, named
  `@rhema/<name>`, with `type: module` and `build` / `typecheck` / `lint` scripts; extend
  the root `tsconfig.base.json` using a relative path from the package directory, reference each
  workspace dependency, and add the project to root
  `tsconfig.json`. Wire a new container into `infra/pulumi`.
- Colocate `*.test.ts` / `*.test.tsx`; exclude tests from TypeScript production builds. Regenerate
  outputs with their owning tool; do not patch compiled `dist`, bundles, or generated route trees.

## Critical Gotchas

1. **Read `docs/tickets/DEFERRALS.md` first, every run.** In an `implement-spec` run, verifying and
   closing any `OPEN` row unblocked by the ticket or its prerequisites is part of the work. Append
   newly deferred work in the same run. A phase-exit gate must not pass with an unresolved `OPEN`
   row scoped to that phase; preserve explicit, recorded operator dispositions.
2. **Never cross the tenant boundary.** User-serving code uses a role that cannot bypass RLS.
   Set tenant context only through `withTenant`; elevated system pools are limited to the audited
   seams in `tools/system-pool-boundary.json`, never a user request, with explicit workspace
   predicates. Extend the two-tenant probe for every new tenant read.
3. **Protect secrets and private material.** Secrets never enter the repo, logs, or ledgers.
   Provider keys belong only in the egress proxy; Stripe/Better Auth secrets belong in Secret
   Manager. No plaintext secret environment variables in web/collab, and no secret may reach the
   model's process. Private protocol/eval text must never enter browser bundles, OpenAPI, or event
   payloads. These are required boundaries; do not infer universal enforcement from a green build.
4. **Prove user surfaces in a browser.** Stage-B acceptance requires JOURNEY.1 visible text,
   actionable controls, and screenshots at the deployed chain-tip SHA (REQ-SPEC-29). A built client
   asset without a served route fails acceptance. Use the committed DOM selector vocabulary.
5. **Keep money and research truthful.** Preserve REQ-SPEC-32: debits must equal metered burn,
   clamped at the cap. The implementation retains `committed` mode alongside `metered`; this is an
   activation discrepancy to disclose, not permission to weaken the requirement. Read stage facts
   and the activation record before claiming `metered` is active. Every price/duration/trial claim comes
   from the shared estimator/entitlement configuration. A Review that could not research must say
   so and refund its research phases (REQ-SPEC-31). Do not change a money-mode activation as cleanup.
6. **Authored code is not deployed evidence.** Live claims require successful
   `check-deploy-provenance` evidence for the expected SHA. Follow the ordered activation in
   `docs/build/INTEGRATION_PLAN.md`. Never restore deleted renderer override flags.
7. **Live actions require their existing operator authorization.** Preview lifecycle goes only
   through `scripts/live/preview-stack.mjs`; it refuses prod and requires owned stacks. Paid
   journeys retain their measured spend guards and explicit headroom; a funded envelope or pause
   cannot be reset by editing docs, changing an epoch, or removing a sentinel without reauthorization.
8. **Protocols ship public; evals stay private — and a stub build proves neither.** Amended
   2026-11-03 (operator ruling 2026-11-02, R6OSS.1; ADR-002 amendment/ADR-125): the ADR-002
   export-time swap is retired — `packages/protocols` publishes with the tree and its history;
   `packages/protocols-stub` is a retained dormant shim (`public-safe` still compiles it; it is
   not "the intended replacement"). `@rhema/evals` stays private, resolved by `RHEMA_EVALS_PATH`
   through `.pnpmfile.cjs`, otherwise `evals-stub` — never commit eval text or private protocol
   derivatives into public-facing artifacts, and never use git submodules for either package.
   The visibility flip is the operator's act; its exposure surface is **all of git history** —
   the audit and flip steps live in `docs/ops/open-source-readiness.md`.

## Build memory

- `docs/build/` is the committed memory root (`<!-- build-memory: v2 -->`, ADR-004).
  `docs/tickets/00_MANIFEST.md` § The chain owns ticket order; `docs/build/LEDGER.md` owns machine
  state (`nextTicket`, `chainTip`, CURRENT STATE / OPEN FINDINGS / GATE DECISIONS / RETURN PASS /
  PHASE LOG). Read the current records rather than copying an old posture into guidance.
- `docs/build/BUILD_INDEX.md`, `docs/build/runs`, `docs/build/pr`, and `docs/build/readouts` hold
  PR/run/gate evidence. `docs/build/logs` is gitignored; `.agents/scratch` is retired.
- Contracts and historical records are **append-only**: correct them by a dated note or new ADR.
  `docs/adr/README.md` is generated by `build-memory adr-index`; never hand-edit it.
- Build-chain PRs **stack**; `mergePolicy: OPERATOR` means the operator merges bottom-up and a run
  never merges its own PR. A gate is a pause, not a block. Secrets never enter any ledger.
- Detailed record rules and identifier grammar are in `docs/AGENTS.md`. The external build-memory
  skill owns the detailed layout contract. With that skill installed, run the structural check;
  run the committed history check against the actual PR base (shown here as `origin/main`):

```bash
bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .
node docs/build/tools/check-append-only.mjs --base origin/main
```

## Terminology

| Term              | Meaning                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| Stage A / Stage B | Repository-level proof / deployed acceptance proof.                      |
| Chain tip         | The implementation revision whose deployed behavior is being verified.   |
| Deferral          | An explicit owed criterion with evidence and an unblock condition.       |
| BFF / twin        | Same-origin web backend / JSON read corresponding to a document surface. |

## Do / Don't

- **Do:** identify the owning package, read its scoped instructions, and report exactly which checks ran.
- **Don't:** merge your own PR, weaken a safeguard to obtain a green check, or claim unrun live evidence.

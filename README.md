# Rhema

TypeScript-end-to-end monorepo (pnpm + Turborepo) for Rhema — closed-source, open-source-ready.

This is the **P0.01 skeleton**: the empty-but-deployable substrate every later ticket lands in — the
package layout (spec §13.2), Pulumi (TypeScript) stacks, the core GCP scaffolding (AlloyDB, GCS,
Memorystore Redis, Cloud Run + a GKE cluster for run-task, a no-egress sandbox subnet), Better Auth
(Google + magic link), and the five-job CI pipeline with the licence policy and public-safe checks.
Services ship as placeholders; their logic lands in later tickets. *(Cloud amended 2026-09-02 from
AWS to GCP — see `docs/tickets/00_MANIFEST.md` § Spec amendments applied. The Pulumi/GCP IaC rewrite
landed in P0.15b, DEFERRALS D-P0.01-7; the live `pulumi up` is operator-gated, D-P0.15b-1.)*

## Quickstart
```bash
pnpm install
pnpm turbo build lint typecheck
pnpm test
```

## Layout
- `apps/*` — deployable services (web, api, collab, worker, run-task, fetcher, convert, egress-proxy, export, mobile)
- `packages/*` — shared libraries (contracts, db, engine, hooks, harness, protocols-stub, measure, figures, ui, api-client, tokens, findings-core, markdown-view)
- `infra/` — pure GCP stage/retention/provenance config (`config/`, unit-tested) + the Pulumi (TypeScript) program (`pulumi/`, operator-run IaC — Cloud Run, GKE, AlloyDB, GCS, Memorystore, Secret Manager, the no-egress sandbox subnet)
- `evals-stub/` — public stub of the private `evals/` package
- `tools/` — repo-local tooling (ESLint plugin)

See `AGENTS.md` for conventions, `CONTRIBUTING.md` to get started, `SECURITY.md` for the security
posture, `LICENSES.md` for the dependency licence policy, and `docs/tickets/DEFERRALS.md` for the
ledger of acceptance criteria deferred to later prerequisites (e.g. live GCP deploys).

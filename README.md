# Rhema

TypeScript-end-to-end monorepo (pnpm + Turborepo) for Rhema — closed-source, open-source-ready.

This is the **P0.01 skeleton**: the empty-but-deployable substrate every later ticket lands in — the
package layout (spec §13.2), SST v3 stages, the core AWS scaffolding (Aurora Serverless v2, S3, Redis,
ECS, a no-egress sandbox subnet), Better Auth (Google + magic link), and the five-job CI pipeline
with the licence policy and public-safe checks. Services ship as placeholders; their logic lands in
later tickets.

## Quickstart
```bash
pnpm install
pnpm turbo build lint typecheck
pnpm test
```

## Layout
- `apps/*` — deployable services (web, api, collab, worker, run-task, fetcher, convert, egress-proxy, export, mobile)
- `packages/*` — shared libraries (contracts, db, engine, hooks, harness, protocols-stub, measure, figures, ui, api-client, tokens, findings-core, markdown-view)
- `infra/` — SST v3 config, stages, IAM-as-code, retention + provenance config
- `evals-stub/` — public stub of the private `evals/` package
- `tools/` — repo-local tooling (ESLint plugin)

See `AGENTS.md` for conventions, `CONTRIBUTING.md` to get started, `SECURITY.md` for the security
posture, `LICENSES.md` for the dependency licence policy, and `docs/tickets/DEFERRALS.md` for the
ledger of acceptance criteria deferred to later prerequisites (e.g. live AWS deploys).

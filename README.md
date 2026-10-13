# Rhema

TypeScript-end-to-end monorepo (pnpm + Turborepo) for Rhema — closed-source, open-source-ready.

This repo builds the product deployed in production on GCP at **https://rhema.tools**
(`api.rhema.tools`, `usercontent.rhema.tools`) — the stacked chain of ticket PRs decomposed from the
ratified spec (`docs/rhema-design-spec.md`; order in `docs/tickets/00_MANIFEST.md`). The substrate:
Pulumi (TypeScript) stacks over Cloud Run services, a GKE cluster running each run-task as a Job
(CAP_SYS_ADMIN two-uid sandbox), Cloud SQL Postgres 16 on prod (AlloyDB on dev/previews), Memorystore
Redis, GCS, Secret Manager, an egress-proxy that is the no-egress sandbox subnet's only route out,
and the five-job CI pipeline with the licence policy and public-safe checks. *(Cloud amended
2026-09-02 from AWS to GCP — see `docs/tickets/00_MANIFEST.md` § Spec amendments applied.)*

## Status (2026-10-04 — honest, not aspirational)

- **Prod** is live on `rhema.tools`. `dev` deploys the full stack for verification windows and returns
  to idle between them (ADR-077); `pr-<n>` previews exist only through the guarded
  `scripts/live/preview-stack.mjs` (refuses `prod`, refuses any non-`pr-<digits>` name).
- **Trial:** interim terms in force (ADR-014) — one Standard Review on Base of ≤ 2,800 words plus a
  150-credit pocket, offered to flagged test tenants only until the operator flips `trial.audience`
  (`packages/contracts/src/domain/pricing.json` — `interim: true`, `audience: "test_tenants"`).
- **Purchases:** the path works but `purchaseMode: "closed"` on every stage pending the operator's
  re-open ruling (ADR-028; GD-BILL.3-1) — no real-money purchase is open to users.
- **Refund window:** shipped flag-off — `refundWindowMode: "test_tenants"` admits only
  server-flagged `is_test` workspaces; `open` awaits the BL-30 ruling (ADR-071; D-DEF.4-3).
- **Cost:** the measured prod bill is ~$285/mo list against the ~$50/mo target — the reduction
  levers are priced but plan-only (OPS.2; ADR-082).
- **SLOs:** four named breaches are OPEN on prod (D-SLO.1-5…8 — run success rate, event-delivery p95,
  proxy-vs-SDK divergence, egress-denied spikes); per REQ-ARCH-34 a breach pauses feature work on the
  owning surface.
- **Efficacy claims:** gate G2 is deferred — no benchmark wave has run, so no superiority or efficacy
  claim appears on any surface, docs included (REQ-EVAL-19; `lintGrowthCopy` enforces it).

## Round-3 invariants (REQ-SPEC-29…32, 2026-09-30)

- **REQ-SPEC-29 — user-journey acceptance:** scripted Playwright journeys (`@rhema/journeys`) walk
  the deployed stage as the acceptance evidence of every user-surface change, plus scheduled runs
  against prod (`.github/workflows/journeys.yml`); assertions are on visible text and actionable
  controls, never HTTP status alone.
- **REQ-SPEC-30 — tenant isolation in depth:** user-serving code connects as a Postgres role that
  cannot bypass RLS over the forced-RLS tenant tables; only the documented system pool
  (`SYSTEM_DATABASE_URL`) may bypass — never for a user request — and a two-tenant probe runs over
  the tenant-scoped read routes on the deployed stage.
- **REQ-SPEC-31 — research integrity:** research-bearing runs preflight their model × server-tool
  pairs through the proxy before any debit and keep a research floor; a Review that ends with zero
  verification coverage delivers *Unverified* and its research debits are refunded as a platform
  fault.
- **REQ-SPEC-32 — cost truthfulness:** committed debits equal proxy-metered burn at the published
  rate, clamped at the cap; every user-facing price, cap and trial claim renders from the one
  calibrated estimator — never a hand-written figure.

## Quickstart
```bash
pnpm install
pnpm turbo build lint typecheck
pnpm test
```

## Layout
- `apps/*` — deployable services: `web` (React Router SSR shell), `api` (Hono REST + SSE, Better
  Auth), `worker` (pg-boss consumers), `collab` (Hocuspocus WSS + materialization), `run-task` (the
  two-uid agent run image — one GKE Job per run), `fetcher` (network-only link reads), `convert`
  (no-network bytes→markdown), `export` (pandoc/typst rendering), `egress-proxy` (the sandbox's only
  egress: per-run credential + allowlist, usage meter, cap enforcer, fetch log of record), `mobile`
  (Expo companion, skeleton), `turbo-cache` (self-hosted Turborepo remote cache)
- `packages/*` — shared libraries: the run pipeline (`engine`, `orchestrator`, `harness`, `hooks`,
  `mirror`, `ledger`, `measure`, `live-clients`), the product surface (`ui`, `editor`, `ide`,
  `markdown`, `markdown-view`, `figures`, `findings-core`, `obligations`, `run-sheet`, `assistant`,
  `ai-use`, `commands`, `tokens`), data + contracts (`contracts`, `db`, `ingest`, `archive`,
  `api-client`), evaluation + verification (`benchmark`, `benchmark-runner`, `journeys`,
  `security-checks`), and the private protocols workspace (`protocols` — committed member;
  `protocols-stub` — the public-export swap)
- `infra/` — pure GCP stage/retention/provenance config (`config/`, unit-tested) + the Pulumi
  (TypeScript) program (`pulumi/`, operator-run IaC) + `k8s/` manifests + `cloudbuild/` image sets +
  `PROD-BRINGUP.md` (the operator runbook)
- `integration/` — the composed FakeEngine integration suite (G21) plus the live-stage drivers
  (prod bring-up, two-tenant probe, instrumented-run folder, deploy provenance)
- `evals-stub/` — public stub of the private `evals/` package (path-resolved via `RHEMA_EVALS_PATH`)
- `tools/` — repo-local tooling (ESLint plugin, checks)

See `AGENTS.md` for conventions, `CONTRIBUTING.md` to get started, `SECURITY.md` for the security
posture, `LICENSES.md` for the dependency licence policy, and `docs/tickets/DEFERRALS.md` for the
ledger of acceptance criteria deferred to later prerequisites (e.g. live GCP deploys).

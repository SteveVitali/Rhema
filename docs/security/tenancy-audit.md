# Tenancy audit — the system-pool boundary (SEC.1 / REQ-SPEC-30 / ADR-017)

**Purpose.** Since migration `0026` made the production `postgres` role `BYPASSRLS`, every pool that
authenticated as `postgres` silently bypassed row-level security. SEC.1 splits the roles: user-serving
code authenticates as **`rhema_app_login`** (`NOBYPASSRLS`, member of `rhema_app` — migration `0045`),
and the bypass-tier connection is reachable only through the seams audited below.

**The seams.** `systemPool` / `systemExec` (bare cross-tenant query/exec, api + worker) and
`systemTxRunner` (tenant-scoped transactions on the elevated pool — no `rhema_app_login` role pin, so
`proxy_*` and other system tables stay writable). `SYSTEM_DATABASE_URL` / `systemDatabaseUrl` are the
DSN plumbing for it.

**The pins.**
- `tools/system-pool-boundary.json` — the single allowlist of files that may reference a seam.
- `eslint-plugin-rhema/no-system-pool-in-user-route` — user-route modules (`apps/api/src/*-routes.ts`)
  and worker user-scoped handlers may never touch a seam (identifiers *and* `process.env.SYSTEM_DATABASE_URL`).
- `packages/security-checks/src/system-pool-boundary.test.ts` — a source scan that fails if a file
  references a seam unlisted, or an allowlist row goes stale.
- `packages/security-checks/src/rls-catalog.test.ts` — the per-table grant census; `rhema_app_login`
  inherits `rhema_app`'s surface and every public table carries an explicit decision.
- `integration/src/two-tenant-probe.ts` — end-to-end proof that the restricted posture leaks nothing.

## Audited system call sites

| Path | Seam | What it does | Why it needs the boundary |
|---|---|---|---|
| `apps/api/src/server.ts` | `systemPool`, `systemExec`, `systemDatabaseUrl` | constructs the elevated pool; `systemPool` is `null` when the env is absent (fail-closed — the circuit-breaker/webhook seams degrade, they never fall back to the user pool) | pool construction |
| `apps/api/src/server.ts` (circuit breaker) | `systemExec` → `circuitBreakerState` | reads `pause_signals` (a system table denied to `rhema_app`) | cross-tenant pause telemetry |
| `apps/api/src/billing-routes.ts` | `systemExec` → `insertStripeEvent` | Stripe webhook intake writes `stripe_events` (system-only; the event may name any tenant's ids before the workspace is resolved) | intake precedes tenant resolution |
| `apps/api/src/claim-prepass.ts` | `systemExec` | estimate claim pre-pass mints `proxy_allowlists` / `proxy_credentials` rows | `proxy_*` are system-only tables |
| `apps/api/src/index.ts` | `systemExec` | composition root forwards the seam into billing deps | plumbing only |
| `apps/api/src/env.ts` | `SYSTEM_DATABASE_URL` | env parse | plumbing only |
| `apps/api/src/admin-cli.ts` | `systemExec`, `SYSTEM_DATABASE_URL`, `pg-boss` on system DSN | `rhema admin` operator CLI — support-access logging, run-analytics materialization, beta dashboard, `stripe-redrive` re-enqueue + `stripe_event_redrives` audit (0060 — denied to `rhema_app`, written on the system pool only); all deliberately cross-tenant and operator-audited (`RHEMA_OPERATOR_ID` required) | operator tooling, never a user route |
| `apps/worker/src/env.ts` | `SYSTEM_DATABASE_URL` | env parse — **required**; worker throws at boot without it | fail closed |
| `apps/worker/src/main.ts` | `systemPool`, `systemExec`, `systemTxRunner`, `PgBoss` on system DSN | pool construction; the queue transport rides the system DSN (pg-boss owns `pgboss.*` schema objects the user role must not hold) | construction + queue transport |
| `apps/worker/src/run-jobs.ts` | `systemTxRunner` (via deps) | `run.start`/`run.resume` provision mints proxy credentials inside a tenant-scoped tx on the system pool | `proxy_*` grant boundary |
| `apps/worker/src/stranded-sweep.ts` → `packages/orchestrator/src/stranded-sweep.ts` | `systemExec` | stranded-run sweeps enumerate `runs`/`steps` across ALL workspaces, then re-enter tenant-scoped txs for mutations | cross-tenant enumeration is the job |
| `apps/worker/src/run-events-jobs.ts` | `systemExec` | `run_events` retention expiry (daily) + partition maintenance DDL — deliberately not tenant-scoped | retention/DDL is global |
| `apps/worker/src/jobs.ts` | `systemExec` | project/account purge plans: anonymize retained usage rows, hard-delete phases | cross-table deletion pipeline |
| `apps/worker/src/ledger-jobs.ts` | `systemExec` | billing sweeps: parked holds, period tick, expired trials, auto-reload | ledger spans tenants |
| `apps/worker/src/billing-jobs.ts` | `systemExec` | `stripe_events` processing, provider reconcile (usage report vs ledger), balance assertion, withheld-delivery re-drive | billing system tables |
| `apps/worker/src/export-jobs.ts` | `systemExec` | account export zip — reads across the account's tables (the export is itself the cross-table read) | account-scope, pre-dates tenant txs |
| `apps/worker/src/ingest-jobs.ts` | `systemExec` | ingestion sweeps + purge bookkeeping | sweep is global |
| `packages/orchestrator/src/internal-api.ts` | `systemTxRunner` (field) | `OrchestratorDeps` declares the seam | declaration only |
| `packages/orchestrator/src/provision.ts` | `systemTxRunner` | `provisionRunCredentials` mint + `revokeCredentials` — **fail closed**: absent `systemTxRunner` throws, never falls back to `deps.txRunner` | `proxy_*` grant boundary |
| `packages/orchestrator/src/testing/{pg,deps}.ts` | both runners | the harness binds `txRunner`→`rhema_app_login` and `systemTxRunner`→the bootstrap handle so tests exercise the prod privilege split | test wiring |
| `integration/src/harness.ts`, `integration/src/run-live-exit.ts` | `systemTxRunner`/`systemExec`-shaped adapters | same binding for integration | test wiring |
| `infra/pulumi/compute.ts`, `infra/pulumi/data.ts`, `infra/pulumi/index.ts` | `SYSTEM_DATABASE_URL`/`systemDatabaseUrl`/`app-database-url` | IaC — injects the env values into api/worker service envs | intentional env wiring |

## Non-bypass service roles (verified, not bypassed)

- **collab** connects as `rhema_collab` (migration `0028` grants; `live_docs`/`restore_points`/
  `working_copies`/limited `drafts`) — never a bypass role. SEC.1 moves its `DATABASE_URL` to a
  `secretKeyRef` (`collab-database-url`) so REQ-ARCH-30's "no plaintext secret env on web/collab"
  holds.
- **egress-proxy** connects on its own DSN (`rhema:proxyDatabaseUrl` config secret) — a system-tier
  component by design (it writes `proxy_*`, `access_log`, `fetch_log`); it never serves user queries.
- **pg-boss** (api + worker) rides `SYSTEM_DATABASE_URL` — the queue owns its `pgboss` schema and is
  internal plumbing, not a user-data path. Decided: system DSN, because pg-boss DDL/DML on its own
  schema must not depend on the user role's grant surface.
- **rawDb** (api `server.ts`) is the account-side client on the **user** pool — `user`/`session`/
  `workspaces`/`invites` are account tables (not workspace-keyed, never under RLS). Tenant-keyed
  tables on it answer empty under FORCE RLS — deny by default.

## Residuals (tracked, not silent)

- `apiSystemDatabaseUrl`/`workerSystemDatabaseUrl`/`proxyDatabaseUrl`/`collabDatabaseUrl` config
  secrets still inject as plaintext env `value:` on non-prod stages (the secretKeyRef path engages
  only where the stage's `requiredSecrets` provision the container). Previews keep the value path by
  design — they never carry production secrets (REQ-ARCH-38).
- Bucket-C tables (child tables tenant-keyed only through a parent FK — `threads`, `findings`,
  `correspondence_items`, …) carry residual risk: a route that reads one without a parent-join is
  cross-tenant under ANY bypass role. `loadProject`'s explicit `workspace_id` predicate
  (`chat-routes.ts`, `outline-routes.ts`) and the `/voices` predicate (`voice-routes.ts`) are the
  SEC.1 guards; the rls-catalog census pins the bucket-C set.

# SEC.1 — Tenant isolation in depth: split the user-serving and system DB roles (run ledger)

## Spec / Base / Branch / Config

- **Spec:** `docs/tickets/59_SEC.1__tenant-isolation-in-depth.md` (sequence 59, round 3).
- **Base:** `stevevitali/stb-4-real-money-external` @ `0e4a0c4` (chain tip; STB.4 PR #80 unmerged).
- **Branch:** `stevevitali/sec-1-tenant-isolation-in-depth` — stacked PR, `mergePolicy=OPERATOR`, never merge.
- **Mode:** `implement-spec`, autonomous. Stage B DB-role-switch window **OPEN** per LEDGER GATE
  DECISIONS 2026-09-30 (supersedes the ticket's stale "operator-paused" wording — amended in the
  ticket's Gate status block in the first commit).
- **Spend cap:** $0 metered inference. No inference-bearing runs.

## Deferrals read

`docs/tickets/DEFERRALS.md` read at run start. Rows touching SEC.1's surface:

- D-P1.07-1 (dossier STB.2 hole) — already patched with a predicate; the probe re-proves it. Not flipped
  here (its own-tenant Margin/Desk legs are dossier-surface, not SEC.1).
- No `OPEN` row is unblocked by SEC.1's machinery (BL-08/PR-S1 is a backlog row this ticket absorbs).
- New rows this run appends: `D-SEC.1-*` as needed (e.g. the H7 exposure-window access review — HUMAN-H7
  consumes `docs/security/rls-exposure-since-0026.md`; access review is operator work, BL-37).

## Requirements (extracted 0.3)

1. Migration `0045_user_serving_role.sql`: user-serving role, `NOLOGIN NOBYPASSRLS NOSUPERUSER`, no
   membership in `postgres`/`cloudsqlsuperuser`, grants DML on exactly the tables user-serving code
   touches (the grants `0027`–`0044` never gave `rhema_app` — e.g. `slo_samples`, `acquisition_events`),
   `pgboss` schema privileges only if pg-boss stays on this pool (decision: **pg-boss moves to the
   system pool** — see plan). Changes no existing role. LOGIN+password only in the Stage B window.
2. Pool wiring: api + worker `DATABASE_URL` = user role; `SYSTEM_DATABASE_URL` = bypass role; worker
   `systemPool … : pool` silent fallback → fail closed (absent + logged, never the user pool);
   pg-boss/rawDb pool decision documented; egress-proxy + collab classified.
3. Lint `no-system-pool-in-user-route` + test + the one allowlist file with named functions + reasons.
4. System-pool audit → `docs/security/tenancy-audit.md` + a pin test over the allowlist.
5. Suite runs as the user role: harness tenant transactions `set local role <user role>`; separate
   seed/system handle; CI integration leg connects as the role on `postgres:16`; guard assertion that
   the tenant handle is non-superuser non-BYPASSRLS; root-cause fixes listed here.
6. `/voices` compensating `workspace_id` predicate + a BYPASSRLS regression test.
7. `integration/src/two-tenant-probe.ts`: deterministic in-process mode over PGlite as the user role +
   route census over `app.routes` + `--base-url` live mode (sessions from env; web pages + JSON).
8. IaC: `@pulumi/random` password → Secret Manager → `secretKeyRef` (never plaintext `value` env);
   `infra/PROD-BRINGUP.md` gains enable/switch/verify/rollback; collab plaintext `DATABASE_URL` recorded
   as a REQ-ARCH-30 finding (env-source fix in scope; else `D-SEC.1-n` → OPS.2).
9. `docs/security/rls-exposure-since-0026.md` — the RLS-only exposure list (ids/counts only; query
   outputs never committed — `docs/build/logs/` is gitignored).
10. Stage B (window open): preview (zero stateful replace/delete) → `pulumi up prod` → pre-probe →
    `ALTER ROLE … LOGIN PASSWORD` → repoint api+worker URLs → post-probe → 30-min observe → keep/rollback.
    Rollback = shift Cloud Run traffic to the retained pre-switch revision + restore config.
11. Owned ADR (next free number): user-role identity (LOGIN child of `rhema_app`), SQL-created role (not
    Cloud SQL Users API), explicit-grants+census model, pg-boss/rawDb pools, lint boundary + allowlist +
    the elevated-mint ruling, and the "role change" definition HOT.1 encodes.

## Test matrix (1.4 — from the ACs)

| AC | Planned test | Where |
|---|---|---|
| Role exists, non-bypass, non-super, no postgres/cloudsqlsuperuser membership, no existing role altered | role-attrs assertions after `applyMigrations` | `packages/db/src/testing/` new test (or extend `pglite` tests) |
| Census pins every table's user-role grant decision; an ungranted new table fails CI | extend `rls-catalog.test.ts` with a per-table grant-decision map verified via `has_table_privilege` | `packages/security-checks/src/rls-catalog.test.ts` |
| Tenant txns run as the user role; guard fails on superuser/BYPASSRLS | harness `set local role` + `current_user`/`rolbypassrls` guard test; whole suite green under it | `packages/orchestrator/src/testing/pg.ts`, new guard test |
| CI integration leg connects as the user role on postgres:16 | extend `server-postgres.test.ts`: `ALTER ROLE … LOGIN` on the throwaway CI db, reconnect, run the tenant isolation probe | `integration/src/server-postgres.test.ts` |
| `/voices` predicate: fails without it under BYPASSRLS, passes with | two-tenant PGlite test driving the route over a bypassing exec | `apps/api/src/voice-routes.test.ts` (new describe) |
| Lint rejects fixture route modules referencing systemExec; accepts allowlisted named functions | RuleTester cases + the allowlist pin test | `tools/eslint-plugin-rhema/rules/no-system-pool-in-user-route{,.test.ts}.js` + security-checks pin test |
| Probe: zero foreign rows/ids on every tenant-scoped GET; census fails on an unprobed GET | `two-tenant-probe.ts` deterministic leg + census | `integration/src/two-tenant-probe.ts` + a vitest leg |
| Audit doc + exposure doc committed, no user data | review artifacts | `docs/security/*.md` |
| Stage B legs | live evidence in this ledger | below |

## Plan (1.3)

1. `0045_user_serving_role.sql`: `create role rhema_app_login nologin nobypassrls nosuperuser
   nocreatedb nocreaterole noinherit?` — **decision:** LOGIN child `IN ROLE rhema_app` (inherits the
   existing grant surface); grants the group lacks get added to `rhema_app` so both the group and any
   future member carry them. Also grants `slo_samples` insert (api writes it inside tenant txs —
   editor/sse), `acquisition_events` insert (signup capture — verify), and revokes `pause_signals`
   from `rhema_app` (system transport only — the proxy writes it, the worker drains it; nothing
   user-serving touches it). Wait — verify each at build time; the census map is the contract.
2. `withTenant` gains `{ role?: string }` → `set local role` inside the tx; `PgPoolTxRunner` takes an
   optional role; prod passes `rhema_app_login` (defense-in-depth: a mispointed DATABASE_URL still
   enforces). The orchestrator PGlite harness runs every tenant tx under `set local role
   rhema_app_login`.
3. Pools: worker `systemPool` fail-closed (null + loud stub + warn, never the user pool); admin-cli
   requires `SYSTEM_DATABASE_URL`; api `PgBoss` + worker `PgBoss` bind `systemDatabaseUrl ?? databaseUrl`
   (queue substrate decision → ADR); `rawDb` stays on the user pool (all its tables are non-tenant or
   ws-exempt — auth bootstrap design, census WS_EXEMPTIONS); egress-proxy classified as a system-tier
   connection (its DATABASE_URL is effectively a system pool); collab already on `rhema_collab`.
4. Lint rule + `docs/security/system-pool-allowlist.json` (named-function entries) + pin test.
5. `/voices` predicate fix (+ the by-id persona lookups in the same file get `workspace_id` predicates —
   same surface, same fix class) + the BYPASSRLS regression test.
6. Two-tenant probe + route census.
7. IaC: `random.RandomPassword` → SM secret `rhema-<stack>-app-db-url` (a full URL built from the
   generated password + `databaseHost`) + `rhema-<stack>-system-db-url` (built from the bootstrap
   secret) → `secretKeyRef` env binding gated on the SM version existing; runbook steps.
8. Docs + ADR-018 + DEFERRALS rows; Stage B; PR; ledger close.

## Root-cause list (deliverable 5 — appended as discovered)

- `slo_samples`: written by `apps/api/src/editor-routes.ts` + `sse-routes.ts` inside tenant txs but has
  NO `rhema_app` grant → 0045 grants insert (ws-keyed exempt by design, 0042).
- (append here as the suite run surfaces them)

## Progress

- 2026-09-30 — Phase 0: branch created off `0e4a0c4`; context loaded (ticket, ADR-013/017, spec banners,
  migrations, census, pools, IaC, runbook, lint precedent, harnesses, CI); baseline green (146 tests,
  packages/security-checks + packages/db + voice-routes).
- Real catalog confirmed on PGlite: 99 tables — 18 RLS-forced (bucket A), 8 ws-keyed exempt (B), 36
  tenant-by-FK (C), 37 non-tenant (D). `rhema_app` zero-grant tables today: `_migrations`,
  `acquisition_events`, `benchmark_*` (19), `proxy_allowlists`, `proxy_credentials`,
  `run_events_default`, `slo_samples`.

## Gap table

(filled at Phase 4)

## Evidence log

(filled at Phase 5+)

## Evidence report

(filled at Phase 6)

# SEC.1 — Tenant isolation in depth: split the user-serving and system DB roles

Ticket: `docs/tickets/59_SEC.1__tenant-isolation-in-depth.md` · run ledger:
`docs/build/runs/SEC.1.md`
Stacks on `stevevitali/stb-4-real-money-external` (PR #80). **DO NOT MERGE** — mergePolicy=OPERATOR.

## Summary

Since `0026_system_bypassrls.sql` (2026-09-17) every prod service connected as `postgres` with
`rolbypassrls=true`, so every query relying on RLS alone was cross-tenant in prod. This PR splits
the roles: user-serving code connects as `rhema_app_login` (`NOBYPASSRLS`, member of `rhema_app`),
and only named, linted, allowlisted seams keep the elevated `SYSTEM_DATABASE_URL` pool.

- **Migration `0045_user_serving_role.sql`** — creates `rhema_app_login` (`NOLOGIN` until the
  Stage-B switch; `NOBYPASSRLS`, `NOSUPERUSER`, member of `rhema_app` only); grants the missing
  user-serving writes (`slo_samples`, `acquisition_events` inserts); revokes system-only grants
  from `rhema_app` (`pause_signals`, `stripe_events`, `deployments`, `estimator_config`,
  `estimator_fits`); adds `rhema_revoke_run_credentials(run_id, at)` SECURITY DEFINER for the
  user-initiated cancel path. Proxy credential minting stays system-only.
- **Transaction-local role pinning** — `withTenant(client, tenantId, fn, { role })` applies
  `set_config('role', …)` + `set_config('app.tenant_id', …)` inside the tx; `PgPoolTxRunner` and
  `createScopedDb` pin `USER_SERVING_ROLE = "rhema_app_login"`, so even a mispointed `DATABASE_URL`
  can't drift a tenant tx onto a bypassing role.
- **Pool split** — api `DATABASE_URL` (user role) vs `SYSTEM_DATABASE_URL` (elevated; also drives
  pg-boss); worker `SYSTEM_DATABASE_URL` is **required** (no user-pool fallback; pg-boss on system);
  `admin-cli` requires `SYSTEM_DATABASE_URL`; collab stays on `rhema_collab`; the egress proxy is
  classified as a system-tier connection. Raw account DB access is limited to non-tenant /
  bootstrap tables (FORCE RLS still denies tenant reads unscoped).
- **Lint boundary** — new `rhema/no-system-pool-in-user-route` rule blocks
  `systemExec`/`systemTxRunner`/`systemPool`/`systemDatabaseUrl`/`SYSTEM_DATABASE_URL` outside the
  audited allowlist `tools/system-pool-boundary.json`; a security-checks pin test fails on
  unexpected additions.
- **Suite runs as the user role** — the orchestrator PGlite harness's tenant `txRunner` pins
  `rhema_app_login`; seeding/system work uses explicit system handles.
- **Live-leak fixes** — `/voices` persona queries carry explicit `workspace_id` predicates (with a
  BYPASSRLS regression test); `loadProject` in `chat-routes.ts` and `outline-routes.ts` now filters
  by `workspace_id` — the deterministic probe caught both returning foreign rows under a bypassing
  role.
- **Two-tenant probe** (`integration/src/two-tenant-probe.ts`) — deterministic in-process PGlite
  census over **all 72 GET routes** (fail-closed on an unprobed/unexempted GET) plus a live
  `--base-url`/`--web-url` mode using real magic-link sessions from env.
- **IaC** — `@pulumi/random` generates the `rhema_app_login` password; the program writes
  `rhema-<stack>-app-database-url` (full DSN) into Secret Manager itself; api + worker mount
  `DATABASE_URL`/`SYSTEM_DATABASE_URL` via `secretKeyRef` (never plaintext `value:`); collab's
  `DATABASE_URL` moves to `secretKeyRef` on `rhema-<stack>-collab-database-url` (operator-seeded);
  the api/worker/collab service accounts get `secretAccessor` on the new secrets.
- **Docs** — `docs/security/tenancy-audit.md` (every system-pool path, the seam, why it needs
  cross-tenant, how it's audited) and `docs/security/rls-exposure-since-0026.md` (the RLS-only
  exposure windows for HUMAN-H7 — ids/counts only, no user data).

## Live verification (Stage-B window, operator-authorized)

- `pulumi preview` prod: +7 create / ~6 update / 0 replace / 0 delete — no stateful changes.
- Pre-switch probe (real sessions, `test+sec1a/b@rhema.tools` via the magic-link funnel): **failed
  as designed** — `GET /voices` + `GET /voices/<foreign>` + `/voices` & `/app` pages returned
  foreign-tenant markers under the old `postgres` BYPASSRLS posture. (Confirms the live leak.)
- Migration `0045` applied to prod Cloud SQL; role verified `NOLOGIN/NOBYPASSRLS/NOSUPERUSER`,
  sole membership `rhema_app`.
- `rhema-prod-collab-database-url` secret created + version seeded before the collab env flip.
- Post-switch probe + 30-min observation: **see run ledger Evidence log** (filled at Stage-B
  completion; rollback path = `update-traffic --to-revisions <pre-switch>=100` + `alter role …
  nologin`).

## Test plan

- `pnpm turbo build lint typecheck` — 132/132 tasks green.
- `pnpm test` — full suite green (incl. new `system-pool-boundary.test.ts`, the no-system-pool rule
  tests, BYPASSRLS voice regressions, `two-tenant-probe.test.ts`, orchestrator role-guard tests).
- `check:licenses` / `check:protocol-markers` / `check-upstream-diff` / `check-build-memory` — all OK.
- RLS catalog census (99 tables pinned) + grant-map pins green.

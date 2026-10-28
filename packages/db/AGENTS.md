# AGENTS.md — Database

## Purpose

- Own schema definitions, forward-only SQL migrations, seed data, session lookup, and tenant scoping.
- Root `AGENTS.md` applies; deployed migrations also require `infra/AGENTS.md`.

## Key Files

| File                                | Lines (approx) | Purpose                                                      |
| ----------------------------------- | -------------- | ------------------------------------------------------------ |
| `packages/db/src/rls.ts`            | ~50            | Transaction-local tenant context and user-serving role name. |
| `packages/db/src/migrate.ts`        | ~50            | Ordered migration discovery and application.                 |
| `packages/db/src/testing/pglite.ts` | ~50            | Isolated Postgres-compatible test database with migrations.  |
| `packages/db/src/index.ts`          | ~50            | Public package exports.                                      |

## Build & Test

```bash
pnpm turbo build --filter=@rhema/db... --filter=@rhema/security-checks...
pnpm --filter @rhema/db typecheck
pnpm --filter @rhema/db lint
pnpm exec vitest run packages/db/src packages/security-checks/src/rls-catalog.test.ts
node scripts/check-additive-migrations.mjs --since-git origin/main
```

- Run from the repo root; use the actual PR base instead of `origin/main` for a stacked change.
- PGlite tests need no Docker or external database. `integration/src/server-postgres.test.ts`
  separately exercises a server database when `DATABASE_URL` is supplied; do not claim that leg ran
  when it skipped.

## Code Conventions

- Add new numbered SQL files in `packages/db/migrations`; the migrator sorts filenames and records
  applied names in `_migrations`. Never change the meaning of an already-applied migration.
- Keep schema definitions in `packages/db/src/schema` aligned with migrations and exported types.
- Correct ✓: `withTenant(client, workspaceId, callback)` with parameterized SQL.
  Wrong ✗: raw `SET app.tenant_id`, interpolated tenant SQL, or a bypass-capable request pool.
- Use `USER_SERVING_ROLE` (`rhema_app_login`) for the production user-serving posture. Tenant setting
  is transaction-local (`set_config(..., true)`), so reused connections cannot retain a previous tenant.
- Reuse `createTestDb`, close it after the test, and exercise the real role/RLS behavior in isolation
  tests instead of relying only on mocked query results.

## Critical Gotchas

1. **Every tenant read expands the isolation proof.** Extend
   `packages/security-checks/src/rls-catalog.test.ts` and keep the system-pool boundary census current.
   Missing tenant context must deny access, never broaden it.
2. **A table grant is not an RLS policy.** Verify non-owner/non-bypass behavior, FORCE RLS, and the
   two-tenant pooled case; a superuser-only test can hide a broken tenant boundary.
3. **Migrations are additive in the ordinary deployment lane.** The checker rejects destructive
   drops/renames, type/table rewrites, and unauthorized role changes. Do not evade it with formatting
   or disable it; use the documented operator procedure for a deliberate non-additive change.
4. **Migration bookkeeping is durable.** `_migrations` tracks names, not replacement content. Fix a
   landed migration through a new migration; preserve data and deployed compatibility.
5. **Account/auth and tenant tables differ.** Consult schema and the RLS census before assuming a
   table is tenant-keyed. Do not solve account lookup by granting arbitrary system access to routes.

## Terminology

- **RLS:** PostgreSQL row-level security, enforced on the user-serving database role.
- **System pool:** the audited elevated connection for explicit system operations, never user requests.

## Do / Don't

- **Do:** verify the migration and its isolation behavior together.
- **Don't:** rewrite applied SQL or treat a green mocked test as proof of database privileges.

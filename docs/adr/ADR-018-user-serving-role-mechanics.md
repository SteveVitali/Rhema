# ADR-018: The user-serving role's mechanics — identity, grants, pools, and the lint boundary

- **Status:** Accepted
- **Date:** 2026-10-01
- **Ticket:** SEC.1
- **Requirement ids:** REQ-SPEC-30, REQ-DATA-4, REQ-ARCH-30
- **Spec:** §11.4, §13.3 (2026-09-30 banners); Appendix A.9; pairs with ADR-017 (the split decision)

## Context

ADR-017 decided to split user-serving traffic off the `postgres` (BYPASSRLS) role. This record pins the
mechanics the ticket owns: which role, how it's created, how grants are modeled, where pg-boss and the
raw/account bootstrap queries live, how the lint boundary is shaped, and how the one user-triggered
elevated mint is classified. It also fixes the vocabulary HOT.1's additive-migration lint encodes.

## Decision

1. **Identity: a LOGIN child of `rhema_app`, not a fresh grant surface.** `rhema_app_login` is created
   `NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE`, `IN ROLE rhema_app`. Group-level privileges
   stay on `rhema_app` so the suite's census pins one grant map; the login role is a credential, not a
   second policy surface. Stage B flips it to `LOGIN` with the IaC-generated password — the migration
   itself is inert (a `NOLOGIN` role cannot authenticate, so shipping it early changes nothing).
2. **Created by SQL in migration 0045, run as `postgres` — never the Cloud SQL Users API.** API/console-
   created users are enrolled in `cloudsqlsuperuser`, which would silently re-bypass RLS. The SQL path
   keeps `rolbypassrls=false` and `rolsuper=false` provable.
3. **Grants: explicit per-table grants + a pinned census, not `ALTER DEFAULT PRIVILEGES`.** Migration 0045
   grants exactly what the user-serving census needs (`slo_samples`/`acquisition_events` inserts were the
   two missing) and *revokes* the system-only grants `rhema_app` had accumulated (`pause_signals`,
   `stripe_events`, `deployments`, `estimator_config`, `estimator_fits`). `ALTER DEFAULT PRIVILEGES` was
   rejected: defaults are invisible to the census test and silently extend the grant map as new tables
   land — the direction this ticket exists to reverse. `rls-catalog.test.ts` pins every table's
   `rhema_app` privilege set, so a future migration that widens or misses a grant fails the suite.
4. **Pools.** `DATABASE_URL` = the user role for api + worker user-scoped handlers; `SYSTEM_DATABASE_URL`
   = the elevated role for the audited seams. pg-boss moves to the **system** pool on both services (its
   schema migrations and queue maintenance are DDL-shaped; the user role never sees the queue schema).
   `rawDb` stays on the user pool: every table it touches is non-tenant or workspace-exempt, and FORCE RLS
   is the backstop — an unscoped tenant read through `rawDb` returns zero rows, it does not leak. Worker's
   system pool **fails closed** when `SYSTEM_DATABASE_URL` is unset (loud stub, never a silent fallback to
   the user pool). Collab keeps `rhema_collab`; the egress proxy's DSN is classified a system-tier
   connection and documented in `docs/security/tenancy-audit.md`.
5. **Defense in depth inside the transaction.** `withTenant` accepts `{ role }` and applies
   `set_config('role', …)` alongside `set_config('app.tenant_id', …)` — transaction-local, parameterized,
   pooled-connection-safe (cleared at COMMIT/ROLLBACK). The api `txRunner` and `createScopedDb` pin
   `rhema_app_login`, so a tenant tx holds the non-bypass posture even if the pool's login role were
   somehow wider.
6. **Lint boundary.** `rhema/no-system-pool-in-user-route` forbids `systemExec`, `systemTxRunner`,
   `systemPool`, `systemDatabaseUrl`, and `SYSTEM_DATABASE_URL` outside `tools/system-pool-boundary.json`
   — a flat file→reason map, one entry per audited seam. The allowlist itself is pinned by
   `packages/security-checks/src/system-pool-boundary.test.ts`, so adding a seam is a deliberate,
   reviewable diff, never an accident.
7. **The user-triggered elevated mint is a named, audited function.** REQ-SPEC-30 allows "elevated mints"
   on the system pool while ADR-017 says the system pool never serves a user request. Resolution: the
   claim pre-pass mint (`apps/api/src/claim-prepass.ts` → `proxy_credentials`/`proxy_allowlists`) is
   allowed ONLY as an allowlisted seam — the system-pool reference is confined to that module, the mint is
   workspace-bound by the caller's principal, and it is enumerated in the tenancy audit. The rule is
   "never a *tenant-scoped read* serving a user request"; a bounded credential mint is the exception the
   allowlist exists to make explicit.
8. **"Role change" for HOT.1's additive-migration lint.** A role change is any `ALTER ROLE`, `DROP ROLE`,
   `GRANT <role> TO <role>` / `REVOKE <role> FROM <role>`, or attribute change (`LOGIN`, `BYPASSRLS`, …)
   on an **existing** role. Creating a new `NOLOGIN` role and granting/revoking its **table** privileges is
   additive. Migration 0045 is additive under this definition; the `ALTER ROLE … LOGIN` in Stage B is the
   role change the operator window covers.

## Consequences

- A user-serving query that relied on the bypass now fails closed (empty surface), and the suite — which
  runs tenant transactions as `rhema_app_login` on PGlite — catches it before prod.
- The generated password exists only in Pulumi state and Secret Manager; no operator ever copies it into
  config. `pulumi stack output appDatabaseDsnOutput` is the audit path.
- Adding a system seam now fails lint AND the pin test; both must be touched deliberately.
- `ALTER DEFAULT PRIVILEGES` must never appear in a migration for `rhema_app*` — the census test is the
  tripwire, and reviewers should reject it on sight.

## Alternatives considered

- **Fresh standalone role** (`rhema_app_user` with its own grants): a second grant map to keep in lockstep
  with the census; rejected for a single policy surface.
- **`ALTER DEFAULT PRIVILEGES`**: invisible to the census; silently widens grants on new tables. Rejected.
- **pg-boss on the user pool**: would require granting the queue schema to the user role and letting a
  user-serving credential run queue DDL; the queue is a system substrate, so it rides the system pool.
- **`rawDb` on the system pool**: would re-bypass the auth-bootstrap reads for no benefit — every `rawDb`
  table is non-tenant/exempt, and the user pool keeps the "unscoped tenant read = empty" guarantee.
- **Cloud SQL Users API for the login**: enrolls the user in `cloudsqlsuperuser` — defeats the ticket.
- **Making every system call site carry an explicit `workspace_id` predicate instead of an allowlist**:
  the whole point of the system seams (sweeps, mints, internal run hydration) is cross-tenant scope;
  the allowlist + audit doc is the bounded answer.

## Revisit trigger

- A need for user-serving DDL or queue-schema access (would reopen the pg-boss pool decision).
- `rhema_app_login` accumulating a second membership or any `BYPASSRLS`-adjacent grant.
- A second user-triggered elevated seam beyond `claim-prepass` (each new one re-litigates item 7).
- Cloud SQL changing role semantics for API-created users (would remove the reason for item 2, not the
  decision itself).

# R7DEM.6c — `0061_demo_events.sql` OWNER-TO portability (run-time insert; found by 224 Part A)

- **Sequence:** 223b of 254 · **Phase:** round 7 (R7a) · **Kind:** run-time insert (BM-MANIFEST-03)
- **base_branch:** `stevevitali/r7dem-6b-metrics` (folded into PR #259's branch — it blocks
  224's deploy lane)
- **Depends on:** 223_R7DEM.6b (the file it amends).
- **Discovered by:** 224_R7DEP.1 Part A, live on the pr-259 preview migrate Job
  (`rhema-pr-259-migrate-824e6f4`): `0061` failed with
  `must be able to SET ROLE "rhema_demo_writer"` — the ticket's own P4-2 named risk, REAL.

## Defect

`ALTER FUNCTION public.rhema_demo_event_insert … OWNER TO rhema_demo_writer` requires the
migration user to `SET ROLE` to the new owner. The file's comment assumed
`createrole_self_grant` covers it because the role is created in the same file. On the
preview's AlloyDB **POSTGRES_18** the managed `postgres` (alloydbsuperuser) does not hold an
effective self-grant — the migration can **never apply on any `pr-<n>` preview**. Prod's
Cloud SQL **POSTGRES_16** `postgres` (cloudsqlsuperuser) would be covered by the
self-grant, but the deploy lane's preview-proof requirement (GD-DEPLOY.R7 condition 1, and
the standing rule that every stage migrates the same file) demands portability.

## Fix (one line, additive-lint clean)

Inside the same `do $$ … $$` `if not exists` arm:

```sql
create role rhema_demo_writer nologin nobypassrls nosuperuser nocreatedb nocreaterole
  role postgres;
```

`ROLE postgres` adds `postgres` — the bootstrap migration user on every stage (dev/preview/
prod system DSNs all connect as `postgres`) — as a member of the new role **at creation**
(the SET-ROLE half of `ALTER OWNER`'s check). **Second live finding:** `ALTER FUNCTION …
OWNER TO` also requires the *new owner* to hold `CREATE` on the containing schema, and on
AlloyDB `public` is owned by `alloydbsuperuser` while `rhema_demo_writer` holds only USAGE —
proven by a rolled-back reproduction through the preview's IAP tunnel
(`permission denied for schema public` at the `ALTER FUNCTION` statement; every other
statement green). So `grant create on schema public` is issued **transiently**, revoked
immediately after `OWNER TO` — verified end-state on the real engine:
`create=false, usage=true, owner=rhema_demo_writer` — the durable surface stays
`usage`+`insert` and both extra statements carry `ON <object>` (lint-clean).

Lint posture: the membership is declared inside `CREATE ROLE` (the `ROLE` option), not a
`GRANT <role> TO <role>` statement — `check-additive-migrations.mjs` classifies by
statement shape and continues to exit 0. A literal `grant rhema_demo_writer to postgres`
remains a `role_change` (grantee predates the file) — the test at
`scripts/check-additive-migrations.test.mjs` pins that refusal.

**Partial-application healing:** `0061` never committed anywhere — its earlier attempts on
pr-259 left an orphaned `rhema_demo_writer` role (the DO-block `if not exists` then skips
creation, so a bare re-run still cannot `OWNER TO`). The deploy run drops the orphan on the
preview DB before re-executing the Job (documented in `runs/R7DEP.1.md`). A stage that had
the role pre-fix would need the same one-line `DROP ROLE` — the run record notes it.

## Acceptance

- `check-additive-migrations.mjs --files packages/db/migrations/0061_demo_events.sql` exits 0.
- The pr-259 migrate Job applies `0061` including `ALTER FUNCTION … OWNER TO`.
- The committed PGlite legs in `packages/security-checks/src/demo-events.test.ts` stay green
  (the role still exists NOLOGIN, the function owner is still `rhema_demo_writer`,
  `prosecdef` still true).

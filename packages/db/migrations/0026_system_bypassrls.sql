-- 0026_system_bypassrls.sql — PRB.16 live finding (2026-09-17).
--
-- The worker's system-scoped sweeps (`sweepStrandedRuns` legs A–C, the parked-run sweep,
-- run_events retention/partition) and the api's SYSTEM_DATABASE_URL circuit-breaker read are all
-- designed to run on a BYPASSRLS role ("the worker's BYPASSRLS role", run-jobs.ts) — the whole point
-- is a cross-tenant scan. Prod surfaced the gap live: every service connects as `postgres`, which on
-- Cloud SQL is neither superuser nor BYPASSRLS, and every tenant table carries FORCE ROW LEVEL
-- SECURITY (0004_rls.sql) — so the stranded sweep's `where state='provisioning'` scan returned zero
-- rows forever and a genuinely stuck run (InvalidImageName pod, run 01M2R2W9WKYXQG0JR95T58MAEP) sat
-- in `provisioning` past its 15-min launch SLO until this landed.
--
-- `postgres` is already the instance admin: it can `set app.tenant_id` to any tenant today, so
-- BYPASSRLS widens no real authority — it makes the designed system-scan seam actually see rows.
-- (The tenant write path still sets the GUC; BYPASSRLS only exempts postgres from the filter.)
-- Guarded: no-op where the postgres role doesn't exist (PGlite/test clusters create their own).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'postgres') then
    alter role postgres bypassrls;
  end if;
end $$;

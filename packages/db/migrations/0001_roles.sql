-- 0001_roles.sql — application roles (REQ-DATA-4 amended; REQ-ARCH-25).
-- All application roles are NON-OWNER (non-superuser) so FORCE ROW LEVEL SECURITY actually binds them; the
-- tenant is set ONLY via `SET LOCAL app.tenant_id` inside the transaction wrapper in packages/db (rls.ts),
-- never a raw `SET app.tenant_id` (a lint forbids that). `collab` (Hocuspocus) and the harvester get their
-- own LIMITED roles rather than a superuser bypass. Roles are cluster-global, so guard creation.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'rhema_app') then
    create role rhema_app nosuperuser noinherit;
  end if;
  -- collab (Hocuspocus): reads/writes only the working-head tables (REQ-ARCH-25).
  if not exists (select 1 from pg_roles where rolname = 'rhema_collab') then
    create role rhema_collab nosuperuser noinherit;
  end if;
  -- harvester: the per-run mirror harvester; writes artifact_versions + logs, never billing.
  if not exists (select 1 from pg_roles where rolname = 'rhema_harvester') then
    create role rhema_harvester nosuperuser noinherit;
  end if;
end $$;

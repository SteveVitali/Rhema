-- 0004_rls.sql — row-level tenancy (REQ-DATA-4 amended; REQ-ARCH-25). FORCE ROW LEVEL SECURITY on the core
-- tables so even the table owner is subject to policy; the tenant is read from `current_setting('app.tenant_id')`
-- which the packages/db wrapper sets ONLY via `SET LOCAL app.tenant_id` inside the transaction (a lint forbids a
-- raw `SET app.tenant_id`). Application roles are non-owner, so the policies bind. §16.3 #15 is closed by this.

-- Grants: the app role gets full DML on the tenant-scoped tables; collab and the harvester get LIMITED grants
-- (their own roles, not a superuser bypass). Grants here are the P0.02 baseline; later tickets tighten per table.
grant usage on schema public to rhema_app, rhema_collab, rhema_harvester;

-- The tenant read helper: missing/blank setting yields NULL, which no row's workspace_id equals → deny-by-default.
create function current_tenant() returns text language sql stable as $$
  select nullif(current_setting('app.tenant_id', true), '')
$$;

do $$
declare t text;
begin
  foreach t in array array['projects','personas','artifacts','runs','usage_records','credit_ledger']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    -- one uniform policy: the row's tenant key must equal the session tenant (deny when unset).
    execute format($f$create policy tenant_isolation on %I using (workspace_id = current_tenant())
                        with check (workspace_id = current_tenant())$f$, t);
    execute format('grant select, insert, update, delete on %I to rhema_app', t);
  end loop;
end $$;

-- collab only touches the working-head tables (REQ-ARCH-25): live_docs, restore_points, working_copies, drafts.
grant select, insert, update, delete on live_docs, restore_points, working_copies to rhema_collab;
grant select, update on drafts to rhema_collab;

-- the harvester writes artifacts/versions and the logs, never billing.
grant select, insert, update on artifacts, artifact_versions to rhema_harvester;
grant select, insert on access_log, fetch_log to rhema_harvester;

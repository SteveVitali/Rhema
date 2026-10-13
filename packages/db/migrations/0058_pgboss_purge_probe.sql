-- 0058_pgboss_purge_probe.sql — CAP.3 (D-STB.5a-3; REQ-ARCH-28 tombstone→30-day-purge visibility).
--
-- The `project.purge` schedule's durable witness is `pgboss.job`, and the user-serving role has
-- no grant on the `pgboss` schema (42501) — correct: the queue payload column can carry
-- tenant-scoped fields and a blanket SELECT would widen the app role's cross-tenant read
-- surface. The JOURNEY.1 T7 leg only needs the schedule tuple for ONE queue and ONE project:
-- name is pinned to 'project.purge', the filter is `data->>'projectId'`, and the function
-- returns schedule columns only — never the job payload.
--
-- SECURITY DEFINER is the established bounded-read idiom (0045's
-- `rhema_revoke_run_credentials`): the definer (the migration role) owns the pgboss read; the
-- function's surface is exactly one queue name and one project id. `set search_path = ''` pins
-- resolution. The body is dynamic SQL: pg-boss owns its schema and may not exist in migration-
-- only test databases — the reference resolves at first call, not at CREATE.
create or replace function public.rhema_project_purge_schedule(p_project_id text)
returns table (
  state text,
  start_after timestamptz,
  singleton_key text,
  tombstoned_at timestamptz
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  return query execute
    'select j.state::text,
            j.start_after,
            j.singleton_key,
            nullif(j.data->>''tombstonedAt'', '''')::timestamptz
       from pgboss.job j
      where j.name = ''project.purge''
        and j.data->>''projectId'' = $1
      order by j.created_on desc
      limit 1'
    using p_project_id;
end;
$$;
revoke all on function public.rhema_project_purge_schedule(text) from public;
grant execute on function public.rhema_project_purge_schedule(text) to rhema_app;

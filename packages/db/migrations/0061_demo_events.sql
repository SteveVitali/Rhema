-- 0061_demo_events.sql — R7DEM.6b (REQ-TOUR-9; ADR-126; GD-DEMO-METRICS-CARVE.R7).
--
-- THE ONE SANCTIONED DEMO WRITE. The anonymous demo funnel (hub view, tour start, tour
-- completion-or-CTA) lands in `demo_events` — an append-only NON-TENANT store carrying no IP,
-- IP-hash, user id, cookie or user-agent column. It is reached through exactly one channel:
--
--   web `POST /a/demo` (sendBeacon) → api `POST /analytics/demo`
--     → `select public.rhema_demo_event_insert($1,$2,$3,$4)` on the user-serving pool
--
-- The user-serving role `rhema_app` holds NO table privilege on `demo_events` (the
-- rls-catalog census pins it `-`); it may only EXECUTE the SECURITY DEFINER insert function,
-- which runs as its owner `rhema_demo_writer` — a NOLOGIN role granted INSERT and nothing
-- else. This needs NO role-membership grant (`GRANT rhema_demo_writer TO rhema_app` would be
-- a `role_change` under ADR-018 §8 / scripts/check-additive-migrations.mjs and would PAUSE
-- the 224 deploy): every GRANT/REVOKE below carries `ON <object>` (a privilege grant), the
-- new role is created in this file, and `ALTER FUNCTION … OWNER TO` is not ALTER ROLE/USER.
--
-- P4-2's named risk (recorded on the ticket + D-R7DEM.6b-1): on Cloud SQL PG16 the migration
-- role is not a true superuser and `ALTER FUNCTION … OWNER TO` requires it to hold the new
-- role WITH SET OPTION — the creator's implicit `createrole_self_grant` covers it since the
-- role is created in this same file. The 224 preview migrate job is the first real proof.
--
-- Ids: caller-supplied is unnecessary — the `id` default mints through `gen_random_uuid()`
-- (PG13+ core; a CREATE-TABLE default, never the lint's ADD-COLUMN volatile default), so no
-- sequence grant is involved.

-- (a) the table — append-only, anonymous by construction (no identity columns of any kind).
create table if not exists public.demo_events (
  id text primary key default 'dem_' || replace(gen_random_uuid()::text, '-', ''),
  at timestamptz not null default now(),
  event text not null check (event in ('demo.hub_viewed', 'demo.tour_started', 'demo.tour_completed_or_cta')),
  essay text check (essay is null or char_length(essay) <= 80),
  step integer check (step is null or (step >= 1 and step <= 99)),
  src text check (src is null or char_length(src) <= 40)
);

-- (b) the insert-only role — created here so the lint registers it as new; NOLOGIN and
--     every dangerous attribute denied. Never granted TO any existing role (that would be
--     a role_membership change on an existing grantee).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'rhema_demo_writer') then
    create role rhema_demo_writer nologin nobypassrls nosuperuser nocreatedb nocreaterole;
  end if;
end
$$;

-- privilege grants (each carries ON <object> — additive by rule):
grant usage on schema public to rhema_demo_writer;
grant insert on public.demo_events to rhema_demo_writer;

-- (c) the channel: a SECURITY DEFINER function owned by the insert-only role. The body is
--     exactly one schema-qualified INSERT — executing as `rhema_demo_writer`, it needs only
--     that role's INSERT privilege and grants the caller nothing else.
create or replace function public.rhema_demo_event_insert(
  p_event text,
  p_essay text,
  p_step integer,
  p_src text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.demo_events (event, essay, step, src)
  values (p_event, p_essay, p_step, p_src);
$$;
alter function public.rhema_demo_event_insert(text, text, integer, text) owner to rhema_demo_writer;
revoke all on function public.rhema_demo_event_insert(text, text, integer, text) from public;
grant execute on function public.rhema_demo_event_insert(text, text, integer, text) to rhema_app;

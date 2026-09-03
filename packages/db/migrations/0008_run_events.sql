-- 0008_run_events.sql — the run-event store and its delivery substrate (P0.08b, §12.5).
--
-- Forward-only, additive. P0.08 defined the `EventWriter` interface its transitions call and deliberately left
-- the event store to this ticket (see 0007 header). Three tables:
--
--   (1) `run_events` — the USER-visible event log, streamed over SSE. Daily RANGE partitions kept for the
--       project's lifetime (review 13 F32: daily partitions carry the write load; purge is by run-cascade at
--       project deletion, not by time). A DEFAULT partition is the drop-nothing safety net so an append never
--       fails because the maintenance job has not yet cut tomorrow's partition. `seq` is the run's monotonic,
--       gap-free event ordinal (assigned from `run_event_seq`); `Last-Event-ID = seq` drives exactly-once
--       resumable replay (`seq > after`). A CHECK pins every row to `visibility='user'` — a mis-routed internal
--       event fails loudly at the write boundary (REQ-ARCH-12; the SSE route reads only this table).
--
--   (2) `run_events_internal` — INTERNAL-visibility rows (tool.audit, engine.error, egress.denied, …). Full
--       detail, NEVER streamed. 30-day retention by a delete job (indexed on `at`). Shares the run's `seq`
--       space, so `run_events` has seq gaps where internal events fell — harmless for `seq > after` replay.
--       NOT under RLS (like access_log / fetch_log — 0004): its only readers are internal tooling and its
--       retention delete is system-scoped; confidentiality rests on it never being served, not on the row filter.
--
--   (3) `run_event_seq` — the per-run counter. An `insert … on conflict do update … returning seq` assigns the
--       next seq atomically inside the caller's transaction (serializing concurrent appenders on the run row),
--       so seq is gap-free even across partitions and across the user/internal split.
--
-- RLS (REQ-ARCH-25): `run_events` (served to viewers) and `run_event_seq` carry a denormalized `workspace_id`
-- and are FORCE-RLS tenant-scoped like runs / usage_records — a viewer can never read another tenant's feed
-- even through a wrong query. The event writer appends inside the same tenant transaction as the state change
-- (REQ-DATA-33), so `current_tenant()` is always set on the write path.

-- (1) user-visible event log — daily range partitions for the project's lifetime.
create table run_events (
  run_id text not null references runs on delete cascade,
  seq int not null,
  workspace_id text not null references workspaces,            -- denormalized tenant key (RLS)
  day date not null,                                           -- partition key: the UTC date of `at`
  type text not null,
  payload jsonb not null,
  density text not null,                                       -- summary | normal | verbose (viewer density split)
  agent_label text,                                            -- attribution for requester-only routing
  visibility text not null default 'user' check (visibility = 'user'),  -- structural: only user rows here
  at timestamptz not null,
  primary key (run_id, seq, day)
) partition by range (day);
-- DEFAULT partition: catches any day the maintenance job has not pre-cut, so an append never fails (drop-nothing).
create table run_events_default partition of run_events default;
-- replay scan: `where run_id = $1 and seq > $2 order by seq` across every partition.
create index on run_events (run_id, seq);

-- (2) internal event log — separate table, 30-day retention, NOT streamed, NOT under RLS.
create table run_events_internal (
  run_id text not null references runs on delete cascade,
  seq int not null,
  workspace_id text not null references workspaces,
  type text not null,
  payload jsonb not null,
  agent_label text,
  at timestamptz not null,
  primary key (run_id, seq));
create index on run_events_internal (at);

-- (3) per-run seq counter — the monotonic, gap-free source of `seq`.
create table run_event_seq (
  run_id text primary key references runs on delete cascade,
  workspace_id text not null references workspaces,
  seq int not null default 0);

-- RLS on the served + counter tables (deny-by-default when the tenant is unset). run_events_internal stays
-- unguarded so the system-scoped retention delete works; it is never served on the viewer route.
do $$
declare t text;
begin
  foreach t in array array['run_events','run_event_seq']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format($f$create policy tenant_isolation on %I using (workspace_id = current_tenant())
                        with check (workspace_id = current_tenant())$f$, t);
    execute format('grant select, insert, update, delete on %I to rhema_app', t);
  end loop;
end $$;

-- the orchestrator (rhema_app) writes + retention-deletes internal rows; no RLS, so a system job can sweep it.
grant select, insert, delete on run_events_internal to rhema_app;

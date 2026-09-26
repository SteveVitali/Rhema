-- 0019_timeline_events.sql — the project timeline's non-run events (PRB.07; REQ-DATA-24).
--
-- §5.5's round timeline is the runs list COMPOSED with draft/correspondence rows; human edits happen outside
-- any run, so their events cannot live in `run_events` (`run_id` is a NOT NULL FK to `runs` and a partition
-- PK member — a draft id can never satisfy it). This table is the project-scoped half of the same stream:
-- `draft.forked` when a frozen head opens as v(N+1) `human_revision`, `revision.move_traced` for the
-- human-edit diff (REQ-BETA-7's manual half), and any later user action that is not a run. Payloads are the
-- SAME `RUN_EVENTS` catalogue shapes — validated by `parseRunEvent` at the write boundary (REQ-DATA-37) so no
-- prose/markdown ever lands here.

create table timeline_events (
  id text primary key,
  project_id text not null references projects on delete cascade,
  workspace_id text not null references workspaces,           -- denormalized tenant key (RLS)
  type text not null,                                          -- a RUN_EVENTS key (e.g. 'draft.forked')
  payload jsonb not null,
  at timestamptz not null default now());
create index on timeline_events (project_id, at);

-- same tenant rule as the run-event store: deny-by-default when the tenant is unset.
alter table timeline_events enable row level security;
alter table timeline_events force row level security;
create policy tenant_isolation on timeline_events
  using (workspace_id = current_tenant()) with check (workspace_id = current_tenant());
grant select, insert on timeline_events to rhema_app;

-- 0023_ai_use.sql — PRB.11 (the AI-use statement; §8.4 REQ-VIS-10).
--
--  • ai_use_additions — the author's append-only additions to the generated AI-use statement. Generated
--    sentences are NOT stored: they are recomputed from the run rows on every read, so there is nothing to
--    mutate or delete. Only the user's own appended sentences persist, and the table grants SELECT + INSERT
--    only — no UPDATE/DELETE — so an addition can never be edited or removed through the app role (the
--    append-only half of REQ-VIS-10 enforced below the API).
--
-- Tenant-keyed + RLS'd like analytics_events (0020): every read/write happens inside the workspace's
-- transaction.

create table ai_use_additions (
  id text primary key,
  workspace_id text not null references workspaces,            -- tenant key (RLS)
  project_id text not null references projects on delete cascade,
  sentence text not null check (length(trim(sentence)) > 0),   -- one appended sentence, non-empty
  by_actor jsonb not null,                                     -- the user who added it (contracts Actor)
  created_at timestamptz not null default now());
create index on ai_use_additions (project_id, created_at);

alter table ai_use_additions enable row level security;
alter table ai_use_additions force row level security;
create policy tenant_isolation on ai_use_additions
  using (workspace_id = current_tenant()) with check (workspace_id = current_tenant());
-- append-only: no update/delete grant — an addition is permanent once written.
grant select, insert on ai_use_additions to rhema_app;

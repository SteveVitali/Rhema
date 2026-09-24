-- 0029_project_home.sql — P1.04 (project list, new-project flow, state surfaces; §5.2/§5.3).
--
-- Three additive changes, all forward-only and nullable-safe:
--
--   1. "user".project_group_by — the per-user /app grouping preference ('attention' default,
--      'voice' for the alternate §5.2 grouping). Same pattern as app_theme (0027).
--
--   2. projects.deleted_at — the soft-delete marker for the row action's Delete (30-day window;
--      hidden from every read while set, cleared by Restore). Archived stays archived_at (0002).
--      There is STILL no persisted lifecycle state column — these are visibility markers, not state;
--      every list row's state derives from projectState() over the row sets.
--
--   3. correspondence_items.letter_opened_at — the §5.2 "Ready to read clears when the deliverable is
--      opened" signal: stamped once when the delivered dossier (the Editor's letter) is read; feeds
--      projectState's existing letterOpenedAt input.
--
--   4. project_search_docs — the server-side search index (§11.4). One row per indexed document:
--      ('project','') = title + venue + linked Voice name; ('draft', draft_id) = the materialized
--      canonical markdown; ('letter', correspondence_id) = the delivered letter's claim/finding text.
--      A generated tsvector column + GIN index backs `GET /projects/search`. RLS-tenant-scoped like
--      timeline_events.

alter table "user"
  add column if not exists project_group_by text not null default 'attention'
    check (project_group_by in ('attention','voice'));

alter table projects
  add column if not exists deleted_at timestamptz;

alter table correspondence_items
  add column if not exists letter_opened_at timestamptz;

create table project_search_docs (
  id text primary key,
  project_id text not null references projects on delete cascade,
  workspace_id text not null references workspaces,           -- denormalized tenant key (RLS)
  kind text not null check (kind in ('project','draft','letter')),
  ref_id text not null default '',                            -- '' for the project doc; else draft/correspondence id
  body text not null default '',
  fts tsvector generated always as (to_tsvector('english', body)) stored,
  updated_at timestamptz not null default now());
create unique index on project_search_docs (project_id, kind, ref_id);
create index on project_search_docs using gin (fts);

alter table project_search_docs enable row level security;
alter table project_search_docs force row level security;
create policy tenant_isolation on project_search_docs
  using (workspace_id = current_tenant()) with check (workspace_id = current_tenant());
grant select, insert, update, delete on project_search_docs to rhema_app;

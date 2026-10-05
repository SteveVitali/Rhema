-- 0039_in_app_notifications.sql — P1.19 (the in-app notification channel + the Inbox read model;
-- §5.11; REQ-IDE-2 amended, REQ-IDE-47, REQ-MOBILE-19).
--
-- `inbox_items` (0002) already owns the row shape (id, user_id, project_id, kind, payload, read_at).
-- This migration adds the delivery semantics the in-app channel needs:
--   • collapse_key  — the §5.11 collapse key ('run:<id>' for run-scoped events — a run's notifications
--                     update one row in place; 'voice:<persona>' / 'billing:<acct>:<tag>' for the rest).
--   • visible_at    — quiet-hours visibility: deferrable events (run_finished, chat_reply) written
--                     inside the quiet window stay invisible until the window ends; approvals and spend
--                     gates are always visible immediately (§5.11, REQ-ACCT-1).
--   • run_id        — the §5.11 collapse family + the returning-landing query's index key.
-- The unique (user_id, collapse_key) index is the collapse/upsert target — the writer uses
-- INSERT … ON CONFLICT DO UPDATE to update the existing row in place.
--
-- The table is USER-scoped (the recipient owns the row — like notification_prefs/devices it predates
-- tenant-column RLS; every write rides the workspace transaction the notify job already opens, and the
-- api's read routes filter on the principal's own user_id).

alter table inbox_items add column if not exists collapse_key text;
alter table inbox_items add column if not exists run_id text;
alter table inbox_items add column if not exists visible_at timestamptz not null default now();

create unique index if not exists inbox_items_collapse
  on inbox_items (user_id, collapse_key) where collapse_key is not null;
create index if not exists inbox_items_unread
  on inbox_items (user_id, visible_at) where read_at is null;
create index if not exists inbox_items_project
  on inbox_items (project_id) where read_at is null;

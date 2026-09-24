-- 0034_figures.sql — P1.13 (§7.5): the figure card + proposal lifecycle fields.
-- `title` — the card's headline (the caption phase's figure.json twin carries it; the row stores it).
-- `pending_proposal` — the insert-as-proposal card's state (anchor + block markdown + the figure
--   version it pins), written by POST …/proposals, cleared by accept/reject. A proposal is never a
--   direct draft write — Accept is the one transaction that forks + splices (REQ-VIZ-10/11/12).
-- `latest_run_id` — the run that last produced the figure (the render job + the card's "open run").
-- `inserted_at_version_id` — the draft artifact version Accept produced (the splice's version pin).
-- `figure_versions.request` — the Versions strip's per-version request text ("initial",
--   "make it a bar chart", "chip:bar", "restore:2").
-- `figure_versions.data_version_id` / `render_status` / `render_error` — the restore pin and the
--   render-state the card shows while a `figure.render` job is in flight.

alter table figures add column if not exists title text;
alter table figures add column if not exists pending_proposal jsonb;
alter table figures add column if not exists latest_run_id text;
alter table figures add column if not exists inserted_at_version_id text;
alter table figures add column if not exists created_at timestamptz not null default now();
alter table figure_versions add column if not exists request text;
alter table figure_versions add column if not exists data_version_id text;
alter table figure_versions add column if not exists render_status text not null default 'pending';
alter table figure_versions add column if not exists render_error text;

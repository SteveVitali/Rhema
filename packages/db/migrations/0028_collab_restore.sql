-- 0028_collab_restore.sql — P1.03: the collab service's least-privilege grants + the widened
-- restore_points cause enum.
--
-- `rhema_collab` (0001) already held the working-head tables (live_docs / restore_points /
-- working_copies / drafts select+update). The real Hocuspocus service additionally needs:
--
--   • session/workspace_members/workspaces (select) — the WebSocket auth hook resolves the
--     session cookie to the user's personal workspace (shared with the api via
--     @rhema/db's resolveSessionPrincipal). These tables are NOT tenant-RLS'd; the auth read is
--     deliberately unscoped, and every later query runs inside withTenant(workspaceId).
--   • projects / runs (select) — the document authorization join (draft → project → workspace)
--     and the §6.3 run-lock read. Both are FORCE-RLS tables, so they only answer inside a
--     tenant-scoped transaction — a cross-workspace document name resolves to not-found.
--   • drafts (insert) — the offline-edit fork writes v(N+1) origin='human_revision'
--     (openHumanRevision) on reconnect to a since-frozen head (REQ-IDE-46 amended).
--   • artifacts / artifact_versions (select/insert/update) — debounced materialization writes
--     the content-addressed canonical-markdown version via saveManualRevision.
--   • provenance_maps (select/insert) — the block-level provenance map per materialized version.
--   • findings (select/update) — findings re-project onto the edited head on save.
--   • timeline_events (select/insert) — the project-scoped event stream takes `draft.forked` /
--     `revision.move_traced` when the save has no run (RLS'd — the insert carries workspace_id).
--   • subscriptions (select) — the retention sweeper resolves the workspace's plan tier.
--
-- The cause check gains 'timer' (the 5-minute-activity point) and 'pre_run' (the checkpoint the
-- store writes when a run lock lands); 'auto'/'blur'/'named'/'workflow' stay.

grant select on session, workspace_members, workspaces, subscriptions to rhema_collab;
grant select on projects, runs to rhema_collab;
grant select, insert, update on drafts to rhema_collab;
grant select, insert, update on artifacts to rhema_collab;
grant select, insert on artifact_versions to rhema_collab;
grant select, insert on provenance_maps to rhema_collab;
grant select, update on findings to rhema_collab;
grant select, insert on timeline_events to rhema_collab;

alter table restore_points drop constraint restore_points_cause_check;
alter table restore_points add constraint restore_points_cause_check
  check (cause in ('auto','timer','blur','pre_run','named','workflow'));

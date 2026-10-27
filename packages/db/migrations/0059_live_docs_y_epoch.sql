-- R6FIX.2 (F-R6H11-1) — the out-of-band live-doc replacement signal.
--
-- The api's restore-point apply (`apps/api/src/version-routes.ts`) replaces `live_docs.y_state`
-- out-of-band. A loaded collab runtime otherwise keeps serving + re-flushing its in-memory
-- (pre-replace) Y.Doc — the R6H11 prod symptom: stored head correct, live doc unconverged,
-- reconnects resurrecting restored-away text. `y_epoch` is the writer's generation counter:
-- the out-of-band write bumps it in the SAME statement as the y_state replace; the collab
-- runtime records the epoch it loaded and converges its in-memory doc to the stored state
-- (instead of flushing stale bytes back) whenever a store/restore-point/beforeSync hook
-- observes a newer epoch. Collab's own persistence writes never touch the column — only a
-- writer that bypasses the live document bumps it.
--
-- Additive: one nullable-free ADD COLUMN with a non-volatile default (PG11 metadata-only
-- default — no table rewrite). Table-level grants already held by `rhema_app_login` /
-- `rhema_collab` cover the new column.

alter table live_docs add column y_epoch bigint not null default 0;

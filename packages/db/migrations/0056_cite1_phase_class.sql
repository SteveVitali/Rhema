-- 0056_cite1_phase_class.sql — CITE.1 (ADR-083/085): stamp the harness-attested phase class on the
-- proxy's rows of record.
--
-- The harness stamps `x-rhema-phase-class` on every agent request (RES.1 — the research floor's
-- admission class: 'research' / 'preflight' / null; CITE.1 adds 'backfill' for the bounded pre-delivery
-- fetch re-entry). Until now the class lived only in the request path: the usage row of record and the
-- fetch log row of record carried no trace of it, so "what did the backfill mechanism retrieve and at
-- what metered cost" was unanswerable from the durable tables (item 5's per-run mechanism delta for
-- ECON.2, and the `backfilled` ids the delivery completeness record persists).
--
-- Both columns are plain nullable text — additive, no default, no rewrite. Rows that predate the column
-- (or carry an unstamped class) read NULL, which every consumer treats as "not backfill".
--
-- The fetch_log RLS posture is unchanged (tenant-visible like before); usage_records already carries
-- the run's own attribution columns — a nullable classifier adds no privilege surface.

alter table fetch_log add column if not exists phase_class text;
alter table usage_records add column if not exists phase_class text;

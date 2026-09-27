-- 0024_analytics_dedupe.sql — PRB.12 (beta analytics pipeline: idempotent intake for the
-- domain→stream projector; REQ-BETA-12, REQ-PROD-15/16).
--
--  • analytics_events.dedupe_key — an optional idempotency key on the telemetry sink. The PRB.12
--    materializer (run-domain facts → catalogued analytics events) writes with
--    dedupe_key = 'mat:<event>:<source row key>', so a re-run of `beta-report` over the same window
--    inserts nothing twice. Live emissions (no key) are unaffected: NULL keys never conflict under
--    the partial index.

alter table analytics_events add column dedupe_key text;

create unique index analytics_events_dedupe_key
  on analytics_events (dedupe_key) where dedupe_key is not null;

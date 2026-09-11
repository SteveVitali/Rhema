-- 0006_fetch_log_attempt.sql — add `attempt` to the fetch log of record (REQ-DATA-16; P0.07 §12.7).
--
-- The egress proxy is the fetch log of record and tags every request with run_id/attempt/agent_id (the
-- attribution the per-run credential carries — §12.6 attestation, §12.7). The original fetch_log DDL (0002)
-- predates the proxy and carried run_id + agent_label but not the attempt. This is an additive extension
-- (never a rename — REQ-IDE-50): existing rows default to attempt 1, matching a run's first attempt.

alter table fetch_log add column attempt int not null default 1;

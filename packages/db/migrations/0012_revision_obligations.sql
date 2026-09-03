-- 0012_revision_obligations.sql — P0.12 (revision obligations: spawn, routing, discharge, lineage, stall;
-- §11.7, REQ-OBJ-2..8, REQ-WF-7/15, REQ-DATA-26).
--
-- The three obligation tables, the state-cache trigger, and the closed-world `check (state not in
-- ('rebutted','deferred') or rationale is not null)` DDL already exist (0002 schema / 0003 invariants) — this
-- ticket adds NO ArtifactKind and NO new table (REQ-OBJ-7). This migration is purely ADDITIVE: the
-- least-privilege grants the app role needs to spawn/route/transition obligations inside the delivery
-- transaction and to write escalations, plus the read/lineage indexes the counts (REQ-WF-7), stall query
-- (§6.8) and lineage matchers (REQ-OBJ-4) hit. An empty deploy and existing rows are unaffected.

-- Least-privilege grants (REQ-ARCH-25). The obligation tables are not RLS-scoped (reached via project_id →
-- projects, which is RLS-forced), like correspondence_items / findings / dispositions; they need explicit DML
-- for the app role. The state-cache trigger updates revision_obligations from an obligation_transitions insert,
-- so the app role needs UPDATE on revision_obligations even though state changes only ever ride a transition
-- row (the forbid-direct-state trigger still guards that). decision_requests is the Decisions-inbox sink the
-- escalation + stall paths write (REQ-OBJ-5; §5.11). No-op under the test owner role; load-bearing on a deploy.
grant select, insert, update, delete on revision_obligations to rhema_app;
grant select, insert, delete on obligation_findings to rhema_app;
grant select, insert on obligation_transitions to rhema_app;
grant select, insert, update, delete on decision_requests to rhema_app;

-- Lineage matchers join obligation_findings by finding (reverse lineage: "which obligation does this finding
-- belong to") and the counts (carried/closed/new) group this correspondence's edges — index both. The
-- (project_id, state) index on revision_obligations already backs the stall query and the read APIs (0002).
create index obligation_findings_finding_idx on obligation_findings (finding_id);
create index obligation_findings_correspondence_idx on obligation_findings (correspondence_id);

-- An escalate disposition "keeps the obligation open and LINKS its decision_request" (§11.7; REQ-OBJ-3). Add
-- the link column so an escalated obligation's Decisions-inbox row is joinable AND idempotent — an obligation
-- with an OPEN decision_request is not re-escalated each round (the partial index makes that lookup cheap).
alter table decision_requests add column obligation_id text references revision_obligations on delete set null;
create index decision_requests_open_obligation_idx on decision_requests (obligation_id) where state = 'open';

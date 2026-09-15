-- 0010_gates_guidance.sql — P0.10 (gates, decisions, guidance, write-back overlays; §6.4/§6.5/§11.5).
--
-- The gates and decisions tables (0002) already carry every column P0.10 writes (blocking, on_expiry, held,
-- paused_while_reading, presence_deadline_at, resolved_at; by_actor, presence, overlay_version_ids). This
-- migration is purely ADDITIVE: it extends `guidance` with the run-scope / delivery / retire fields the §6.5
-- Guidance object needs, and adds the run-level "Approve and run autonomously" flag. All columns have
-- back-compatible defaults, so an empty deploy and existing rows are unaffected.

-- Guidance (§6.5; REQ-GATE-9/10/11). `standing = true` is project-scope standing guidance (retirable via
-- `active`, never deleted); run-scope guidance carries `run_id` and is delivered at the next phase boundary.
-- `consumed_by` records which run/phase read the guidance; `workflows` narrows which workflows it applies to.
alter table guidance add column if not exists run_id text references runs on delete cascade;
alter table guidance add column if not exists workflows text[];
alter table guidance add column if not exists consumed_by jsonb not null default '[]'::jsonb;
alter table guidance add column if not exists active boolean not null default true;
-- deliver run-scope guidance in order, and look it up by run cheaply at phase start.
create index if not exists guidance_run_active_idx on guidance (run_id, active) where run_id is not null;
-- standing (project-scope) guidance shown on every run sheet ("3 standing notes apply").
create index if not exists guidance_project_standing_idx on guidance (project_id) where standing = true;

-- "Approve and run autonomously" (§6.4 item 1; REQ-GATE-3): once taken, later NAMED gates in this run are
-- turned off (resolved by policy with a Decision{by:'policy'} row — REQ-DATA-36). Spend/refusal gates still
-- open. A run-level flag so the phase loop / gate-policy resolution can honor it without re-reading a decision.
alter table runs add column if not exists gates_off boolean not null default false;

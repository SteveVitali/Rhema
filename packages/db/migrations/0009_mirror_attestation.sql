-- 0009_mirror_attestation.sql — the server-side facts the boundary attestation rests on (§12.6 attestation;
-- REQ-DATA-19/20; REQ-ARCH-20 amended). P0.09 materializes the per-seat mirror and, at delivery, builds the
-- `access_report` from facts the sandbox cannot touch: (1) the hydration manifest it generated — which paths
-- were mounted for which seat ("never mounted" is provable, "never read" is not), and (3) the orchestrator's
-- input-scoped subagent launch records + their `producerQueryId`. The proxy fetch log (2) already exists
-- (fetch_log, 0002/0006); the in-container audit (access_log) is the fourth, secondary "attempts" input.
--
-- Additive only (REQ-DATA-3; never edit a shipped migration). Both tables are enforcement/provenance tables
-- that reference `runs` and are written server-side by the orchestrator (like access_log / fetch_log) — not
-- under RLS, so the system-scoped attestation build + retention sweeps read them without a tenant scope.

-- The persisted hydration manifest, one row per (run, attempt): materialization happens before step 1 and at
-- every resume (REQ-DATA-5), so each attempt has exactly one manifest. `manifest` is the array of mounted
-- paths with their artifact_version_id, sha256 and mount mode — the "which paths were mounted for which seat"
-- fact the access_report counts and the "never mounted is provable" guarantee reads.
create table run_mounts (
  run_id text not null references runs on delete cascade,
  attempt int not null,
  seat text not null,
  manifest jsonb not null,
  materialized_at timestamptz not null default now(),
  primary key (run_id, attempt));

-- The orchestrator's input-scoped subagent launch records (§12.6; REQ-DATA-17/18). The orchestrator — not the
-- parent model — launches the second-reader / fidelity-auditor / gap-analyst / holdout-calibrator as separate
-- scoped `query()` calls; each launch is recorded here with the exact enumerated input files and the
-- `producer_query_id` recorded on whatever it writes, so the attestation can list subagent scoping and the
-- delivery producer check can verify the second read was produced by the orchestrator-launched scoped query.
create table subagent_launches (
  id text primary key, run_id text not null references runs on delete cascade, attempt int not null,
  label text not null, model text,
  inputs_kind text not null check (inputs_kind in ('explicit_files','inherit')),
  input_paths text[] not null default '{}', file_count int not null default 0,
  producer_query_id text, launched_at timestamptz not null default now());
create index on subagent_launches (run_id, attempt);

-- The harvester writes the mirror facts alongside artifacts/versions and the logs; the app role reads them to
-- build the access_report at delivery (never billing — cf. 0004 grants).
grant select, insert on run_mounts, subagent_launches to rhema_harvester;
grant select, insert, update, delete on run_mounts, subagent_launches to rhema_app;

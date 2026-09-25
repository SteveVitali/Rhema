-- 0042_slo_samples.sql — the platform-telemetry sample table (STB.2 / D-P1.22-1 + D-P0.08b-3;
-- REQ-ARCH-13, §13.5). The two §13.5 signals that previously read `unmeasured` write here:
--
--   • event_delivery_ms      — one row per SSE pump batch that emitted rows: the batch's max
--                              append→flush latency (`now()` at sink-write − the event's `at`). The
--                              honest server-side half of "event delivery latency"; the final
--                              socket→render hop stays unmeasured (no client ack — see D-P1.22-1).
--   • autosave_save_ms       — the api's server-side duration for the debounced autosave POST
--                              (`/projects/:id/editor/:draftId/save`). The §13.5 target is a client
--                              round-trip; this is the server-visible component.
--
-- NOT under RLS — same posture as `run_events_internal` (0008) / `pause_signals` (0041): written by
-- the api inside its tenant transaction (workspace_id recorded for hygiene, never for filtering),
-- probed cross-tenant by the worker's system-scoped `slo.probe` sweep (percentiles only — platform
-- signals, never tenant data). Retention is the worker's daily sweep (7 days — beyond the probes'
-- 10-minute windows with ample margin).

create table slo_samples (
  signal text not null,
  value_ms double precision not null,
  workspace_id text,
  run_id text,
  at timestamptz not null default now()
);
create index slo_samples_signal_at on slo_samples (signal, at);

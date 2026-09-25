-- 0041_pause_signals.sql — the durable pause-signal transport (P1.22; REQ-ARCH-32; §12.8).
--
-- The egress proxy emits a `PauseSignal` on a `suspicious_query` (the ≥12-word draft n-gram match —
-- §12.8d), an `egress.denied` spike, or a `user_source_fetch` (P1.21's Memo confidentiality boundary).
-- Before this table the live service collected signals in memory (`InMemoryEventSink`) and dropped
-- them — emitted, never delivered. This table is the transport: the proxy INSERTs (it already writes
-- `fetch_log`/`usage_records` on the same connection), the worker's pause sweep CLAIMS pending rows
-- (a `claimed_at` lease + bounded `attempts`) and applies `pauseRun` — `running → waiting_gate` +
-- a blocking `refusal` gate, the refusal-class card §12.8d requires.
--
-- NOT under RLS — same posture as `run_events_internal` (0008): written cross-tenant by the proxy
-- role, drained by the worker's system-scoped sweep, never served on a tenant route. Confidentiality
-- rests on it never being served, not on a row filter; the payload carries ids/domains/reasons only
-- (never query text, never page bodies — the §12.5 internal-signal rule).
--
-- `attempts`/`claimed_at` make the drain crash-safe and poison-proof: a claim is a 60-second lease;
-- a row whose attempts exhaust the cap is marked processed so one bad signal cannot wedge the sweep.
-- Cascades with `runs` — a purged run takes its pending signals with it.

create table pause_signals (
  id bigint generated always as identity primary key,
  run_id text not null references runs on delete cascade,
  workspace_id text not null references workspaces,
  reason text not null check (reason in ('suspicious_query', 'egress_denied_spike', 'user_source_fetch')),
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts int not null default 0,
  processed_at timestamptz
);
-- the drain's pending scan: unprocessed rows whose claim lease is free, oldest first.
create index pause_signals_pending on pause_signals (id) where processed_at is null;

-- the proxy (postgres/BYPASSRLS) inserts; the worker (rhema_app) claims + processes.
grant select, insert, update on pause_signals to rhema_app;

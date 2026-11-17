-- 0064_outbox.sql — the durable outbox transport (BL-115; 298_R6FIX.31).
--
-- The delayed arms did mark-then-send across two datasources: the marker committed on the app DB
-- (`user.deletion_requested_at`, `projects.deleted_at`, the `account_exports` 'building' row) while
-- the pg-boss job row landed on the system DSN — a crash between them left an armed intent with no
-- job (the hourly 260/270 watchdogs repaired it after the fact). The honest same-seam fix per the
-- 2026-11-16 operator ruling: the marker and an outbox row commit in ONE tx on the app connection
-- (`txRunner`), and the worker's `outbox.drain` cron claims pending rows (lease + bounded attempts
-- + SKIP LOCKED) and replays them onto pg-boss with the original send options preserved verbatim
-- (`startAfterMs`, `singletonKey` — the delay and dedupe contracts move with the intent).
--
-- NOT under RLS — the same posture as `pause_signals` (0041) and `run_events_internal` (0008):
-- written inside the tenant-scoped request tx, drained by the worker's system exec, never served
-- on a tenant route. The payload is the job payload — ids and timestamps only, no user content.
--
-- `claimed_at`/`attempts` make the drain crash-safe: a claim is a 60-second lease, so a drained-
-- but-unsent row re-arms itself. A row that exhausts the drain's attempt cap stays unsent and
-- unclaimed (`sent_at is null and attempts >= 25`) — visible to the operator, never wedging the
-- sweep and never silently "sent".

create table outbox (
  id text primary key,                       -- caller-minted; also the drain's log identity
  workspace_id text not null,                -- the tenant the intent armed under (ops visibility; NOT an RLS key)
  queue text not null,                       -- the pg-boss queue the drain replays onto
  payload jsonb not null default '{}'::jsonb,
  send_options jsonb not null default '{}'::jsonb,  -- pg-boss opts replayed verbatim
  created_at timestamptz not null default now(),
  claimed_at timestamptz,                    -- drain claim lease
  attempts int not null default 0,
  sent_at timestamptz,                       -- set once the pg-boss send lands
  last_error text
);
-- the drain's pending scan: unsent rows whose claim lease is free, oldest first.
create index outbox_pending on outbox (created_at) where sent_at is null;

-- the request path inserts inside its tenant tx on the user-serving role — INSERT ONLY, the
-- slo_samples grant class (0045): the drain's select/claim/mark all ride the system pool, which
-- never carries the user role's grants. A forged intent can at worst enqueue a job whose handler
-- re-validates the durable marker and no-ops — the marker, not the row, is the state.
grant insert on outbox to rhema_app;

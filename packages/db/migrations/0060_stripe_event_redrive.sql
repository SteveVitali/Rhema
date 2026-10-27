-- 0060_stripe_event_redrive.sql — R6FIX.5 (F-R6H11B-1 compensation path) — the operator
-- `stripe-redrive` verb's audit sink. A parked `stripe_events` row whose `processed_at` stayed
-- NULL (the nanoid-user topup whose in-tx analytics validation threw) re-drives through the
-- ordinary `stripe.event` queue — idempotent by construction (the event row + the grant's
-- `stripe:checkout:<sessionId>` idempotency key make a replay a no-op), so NO manual compensation
-- ledger row is ever written by hand. The audit row records who asked for the re-drive.
--
-- Why a purpose table: `admin_actions.action`'s CHECK list can only be widened by replacing the
-- constraint, and the additive-migration lint (correctly) refuses that destructive shape — a
-- dedicated, additive audit table is how this operator verb keeps the REQ-BETA-14 rule (every
-- operator action is audited) without touching the shared constraint.
create table stripe_event_redrives (
  id text primary key,
  actor text not null,                          -- the operator id (RHEMA_OPERATOR_ID)
  event_id text not null references stripe_events (id),
  note text,
  at timestamptz not null default now());
create index on stripe_event_redrives (event_id, at);
grant select, insert on stripe_event_redrives to rhema_app;

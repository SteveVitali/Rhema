-- 0060_stripe_event_redrive.sql — R6FIX.5 (F-R6H11B-1 compensation path) — the operator
-- `stripe-redrive` verb's audit action. A parked `stripe_events` row whose `processed_at` stayed
-- NULL (the nanoid-user topup whose in-tx analytics validation threw) re-drives through the
-- ordinary `stripe.event` queue — idempotent by construction (the event row + the grant's
-- `stripe:checkout:<sessionId>` idempotency key make a replay a no-op), so NO manual compensation
-- ledger row is ever written by hand. The audit row records who asked for the re-drive.
alter table admin_actions drop constraint if exists admin_actions_action_check;
alter table admin_actions add constraint admin_actions_action_check
  check (action in (
    'house_credit_grant', 'house_credit_void', 'account_suspend', 'account_reinstate', 'wtp_record',
    'trial_kill', 'support_access', 'balance_recompute', 'stripe_event_redrive'));

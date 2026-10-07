-- 0048_checkout_return_viewed.sql — BILL.3 (REQ-BILL-16; ADR-029) — the pending-checkout email's
-- trigger fact. §14.6 webhook lag: the /billing/return page promises "we'll email you when it lands".
-- The promise only holds when the user actually WAITED on the open page — a completion that lands before
-- the first return view must NOT email (the user never saw a pending state; the return page renders
-- "confirmed" immediately). So the tenant-scoped session poll stamps `return_viewed_at` on the first
-- read that observes state='open'; the webhook's open→completed transition sends the
-- `trial_payment`-template notice only when this marker is already set, claimed exactly once by the
-- state guard + the notification_deliveries dedup key `checkout:<sessionId>` (a replayed
-- `checkout.session.completed` finds `state='completed'` and sends nothing).
-- `pending_email_queued_at` makes a redriven webhook retry-safe: the marker is written only after the
-- notify enqueue succeeds, and a second worker pass sees it before enqueueing a second job.
alter table checkout_sessions
  add column if not exists return_viewed_at timestamptz,
  add column if not exists pending_email_queued_at timestamptz;

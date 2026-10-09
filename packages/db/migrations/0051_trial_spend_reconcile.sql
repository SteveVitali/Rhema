-- 0051_trial_spend_reconcile.sql — ACT.1 (§14.3; REQ-GROWTH-15 amended; ADR-014/042; REQ-SPEC-30).
--
-- The daily trial-COGS kill switch is re-based to $50/day of proxy-metered list COGS with a
-- projected-plus-reconciled tally:
--
--   • `credits` (existing) — the claim-time PROJECTIONS: each entitlement hold books the run's
--     estimate (the p90 card figure) inside the hold transaction, so a refused hold rolls back.
--   • `reconciled_credits` (new) — the SYSTEM-POOL sweep's recomputation
--     (`sweepTrialSpend` on `billing.period-tick`): Σ greatest(runs.spent_credits,
--     runs.estimate_credits) over today's non-test entitlement runs. The aggregate read never
--     serves a user request (REQ-SPEC-30) — user paths only touch this compact counter row.
--   • `paused_at` (new) — the sticky trip marker. Set by the sweep (or persisted alongside a
--     crossing projection) it refuses new unlocks/holds for the rest of the UTC day; tomorrow's
--     row starts unpaused.
--
-- Purely additive — both columns default, existing rows stay valid, no backfill needed.

alter table trial_spend_daily
  -- the reconciled metered tally for the day (proxy-credit units: $50 list COGS = 7,000).
  add column reconciled_credits bigint not null default 0,
  -- set ⇒ the day's trial spend crossed the $50/day ceiling — new unlocks/holds refuse until UTC
  -- rollover. Sticky within the day (the ceiling opens again on tomorrow's row).
  add column paused_at timestamptz;

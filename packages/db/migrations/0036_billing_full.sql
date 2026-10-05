-- 0036_billing_full.sql — P1.16 (billing, full: plan ladder, trial entitlement, subscriptions,
-- top-ups, auto-reload, usage dashboards; §14.2/14.3/14.5/14.6; REQ-SPEC-8, REQ-BILL-14/16/17/19,
-- REQ-GROWTH-10/15, REQ-GROWTH-4/7/8, REQ-PERSONA-5, REQ-DATA-42).
--
--  • subscriptions — the full Stripe Billing lifecycle columns (customer, cycle, scheduled downgrade,
--    the renewal-failure Smart-Retries window, the 7-day downgrade warning marker).
--  • billing_accounts — the §14.3 trial state machine, abuse-control fields (fingerprint, phone
--    challenge), the Stripe customer id, Tax-ready billing address, and the opt-in auto-reload
--    (threshold, pack, monthly cap, spend counter) + first-month $100 top-up cap counters.
--  • trial_entitlements — state enum widened (locked/revoked/converted) + the unlock/consumption/
--    conversion audit columns.
--  • trial_unlock_checks — every first-spend unlock decision is an auditable row (REQ-GROWTH-10).
--  • trial_spend_daily — the global daily trial-spend ceiling counter (REQ-GROWTH-15 amended).
--  • checkout_sessions — the Checkout return-to-context + the grant-path discriminator.
--  • auto_reload_events — every unattended charge (or skip/failure) is auditable (REQ-BILL-17).
--  • estimator_fits / estimator_config — the weekly re-fit's evidence rows + the live cap multiplier.
--  • runs — the parked-resume re-price marker (§14.6 rate-table-change-while-parked).
--  • team_waitlist — the Team tier's waitlist row (mechanics remain out of scope).

-- ---- subscriptions (§14.2; REQ-BILL-14) ------------------------------------------------------------
alter table subscriptions
  add column stripe_customer_id text,
  add column billing_cycle text check (billing_cycle in ('monthly', 'annual')),
  add column cancel_at_period_end boolean not null default false,
  -- §14.6: a downgrade is scheduled, not immediate — it applies at period end.
  add column scheduled_tier text check (scheduled_tier in ('free', 'writer', 'studio', 'studio_max', 'team')),
  -- renewal failure: set on invoice.payment_failed; cleared on payment_succeeded. The 14-day grace
  -- window (Smart Retries) is measured from this timestamp.
  add column renewal_failed_at timestamptz,
  -- the 7-day downgrade-warning email marker (§14.6 renewal-failure sequence).
  add column downgrade_warned_at timestamptz,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();
-- 'ended' = lapsed to free (past-due grace expired, or a cancel ran to the cycle end). The tier the
-- account is ON is then 'free' — an ended row is history, not the current plan.
alter table subscriptions drop constraint if exists subscriptions_status_check;
alter table subscriptions add constraint subscriptions_status_check
  check (status in ('active', 'past_due', 'cancelled', 'ended'));
create unique index subscriptions_stripe_sub_uniq
  on subscriptions (stripe_subscription_id) where stripe_subscription_id is not null;
create index subscriptions_account_idx on subscriptions (billing_account_id, created_at desc);
-- period-end sweeps (renewal failure → free at +14d; scheduled downgrades; rollover grants) scan by it.
create index subscriptions_period_end_idx on subscriptions (period_end) where status in ('active', 'past_due');

-- ---- billing_accounts: trial + abuse + Stripe customer + auto-reload (§14.2/14.3; REQ-BILL-16/17) ----
alter table billing_accounts
  -- the account-level trial machine (contracts/trial.ts); null = predates P1.16 / legacy account.
  add column trial_state text check (trial_state in ('trial_pending', 'trial_active', 'trial_denied', 'trial_used', 'free')),
  -- the workspace kill switch (REQ-GROWTH-15): set ⇒ void entitlement + pocket within 60s. Read live
  -- on every hold; the sweeper is belt-and-braces, not the enforcement.
  add column trial_killed_at timestamptz,
  -- one trial per fingerprint (REQ-GROWTH-10): the salted device fingerprint hash — never raw PII.
  add column fingerprint_hash text,
  add column phone_verified boolean not null default false,
  add column stripe_customer_id text,
  -- Stripe Tax-ready billing address (collected at Checkout; stored for invoice rendering).
  add column billing_country text,
  add column billing_postal_code text,
  -- opt-in auto-reload (REQ-BILL-17): the ONLY unattended charge path — user-typed threshold + cap.
  add column auto_reload_enabled boolean not null default false,
  add column auto_reload_threshold_credits int,
  add column auto_reload_pack_id text,
  add column auto_reload_month_cap_cents int,
  add column auto_reload_spend_cents int not null default 0,
  add column auto_reload_month text,                 -- 'YYYY-MM' the spend counter covers
  -- §14.2 top-up fraud bounds: $100 account cap the first month; >$200/day forces 3-D Secure.
  add column first_month_topup_cents int not null default 0,
  add column daily_topup_date date,
  add column daily_topup_cents int not null default 0;
create index billing_accounts_fp_idx on billing_accounts (fingerprint_hash)
  where fingerprint_hash is not null;
create unique index billing_accounts_stripe_customer_uniq
  on billing_accounts (stripe_customer_id) where stripe_customer_id is not null;

-- ---- trial_entitlements (§14.3; REQ-GROWTH-10) ------------------------------------------------------
-- locked (pre-unlock), revoked (kill switch), converted (upgrade → promo) join the existing three.
alter table trial_entitlements drop constraint if exists trial_entitlements_state_check;
alter table trial_entitlements add constraint trial_entitlements_state_check
  check (state in ('locked', 'unused', 'consumed', 'expired', 'revoked', 'converted'));
alter table trial_entitlements
  add column activated_at timestamptz,               -- unlock time — day 0 of the 14-day window
  add column consumed_at timestamptz,
  add column converted_at timestamptz,
  add column revoked_at timestamptz,
  add column pocket_ledger_id text,                  -- the trial_pocket grant row (audit join)
  add column promo_ledger_id text;                   -- the 800-credit upgrade-conversion grant row
create index trial_entitlements_account_idx on trial_entitlements (billing_account_id);

-- every first-spend unlock decision is a row (REQ-GROWTH-10 audit; identity-before-spend).
create table trial_unlock_checks (
  id text primary key,
  billing_account_id text not null references billing_accounts,
  user_id text,
  at timestamptz not null default now(),
  email_domain text,
  disposable_domain boolean not null default false,
  fingerprint_hash text,
  fingerprint_seen int not null default 0,           -- accounts already bound to this fingerprint
  asn_risk numeric,                                -- injectable scorer output [0,1]
  decision text not null check (decision in ('allow', 'challenge', 'deny', 'paused')),
  reason text not null);
create index trial_unlock_checks_account_idx on trial_unlock_checks (billing_account_id, at);
create index trial_unlock_checks_fp_idx on trial_unlock_checks (fingerprint_hash)
  where fingerprint_hash is not null;
grant select, insert on trial_unlock_checks to rhema_app;

-- the global daily trial-spend ceiling (REQ-GROWTH-15 amended): one row per UTC day, incremented inside
-- the trial debit transaction so the ceiling is exact under concurrency (no read-modify-write race).
create table trial_spend_daily (
  day date primary key,
  credits bigint not null default 0);
grant select, insert, update on trial_spend_daily to rhema_app;

-- ---- Checkout sessions (REQ-BILL-14: return-to-context + grant discrimination) ----------------------
create table checkout_sessions (
  id text primary key,                             -- our id; the Stripe session id lives beside it
  workspace_id text not null,
  billing_account_id text not null references billing_accounts,
  user_id text,
  kind text not null check (kind in ('subscribe', 'topup', 'auto_reload_setup')),
  plan text,                                       -- subscribe: the plan tier
  cycle text,                                      -- subscribe: 'monthly' | 'annual'
  pack_id text,                                    -- topup/auto_reload_setup: the top-up pack id
  stripe_session_id text unique,
  return_to text,                                  -- where the user was; the success redirect lands here
  state text not null default 'open' check (state in ('open', 'completed', 'expired')),
  created_at timestamptz not null default now(),
  completed_at timestamptz);
alter table checkout_sessions enable row level security;
alter table checkout_sessions force row level security;
create policy tenant_isolation on checkout_sessions
  using (workspace_id = current_tenant()) with check (workspace_id = current_tenant());
create index checkout_sessions_account_idx on checkout_sessions (billing_account_id, created_at desc);
grant select, insert, update on checkout_sessions to rhema_app;

-- ---- auto-reload audit (REQ-BILL-17: the only unattended charge path must be auditable) --------------
create table auto_reload_events (
  id text primary key,
  workspace_id text not null,
  billing_account_id text not null references billing_accounts,
  at timestamptz not null default now(),
  pack_id text,
  credits int,
  cents int,
  stripe_ref text,
  reason text not null,                            -- 'below_threshold' | 'monthly_cap' | 'disabled' | 'payment_failed'
  outcome text not null check (outcome in ('charged', 'skipped', 'failed')));
alter table auto_reload_events enable row level security;
alter table auto_reload_events force row level security;
create policy tenant_isolation on auto_reload_events
  using (workspace_id = current_tenant()) with check (workspace_id = current_tenant());
create index auto_reload_events_account_idx on auto_reload_events (billing_account_id, at desc);
grant select, insert on auto_reload_events to rhema_app;

-- ---- the weekly estimator re-fit (REQ-BILL-7 amended; §14.6) -----------------------------------------
-- every weekly re-fit writes an evidence row; the live multiplier is a singleton the estimator reads.
create table estimator_fits (
  id text primary key,
  computed_at timestamptz not null default now(),
  sample_runs int not null,
  median_ratio numeric,                            -- Σ estimate / Σ actual over sampled completed runs
  cap_multiplier numeric not null,                 -- adopted multiplier, clamped to [1.25, 1.5]
  note text);
create table estimator_config (
  id text primary key,                             -- singleton 'current'
  cap_multiplier numeric not null check (cap_multiplier between 1.0 and 2.0),
  updated_at timestamptz not null default now());
insert into estimator_config (id, cap_multiplier) values ('current', 1.5) on conflict do nothing;
grant select, insert on estimator_fits to rhema_app;
grant select, update on estimator_config to rhema_app;

-- ---- parked-resume re-price (§14.6: rate-table change while parked) -----------------------------------
alter table runs
  add column repriced_at timestamptz,
  add column repriced_from_version int;            -- the frozen table version the resume re-priced away from

-- the operator audit vocabulary gains the trial kill switch (REQ-GROWTH-15; the ≤60 s void is audited).
alter table admin_actions drop constraint if exists admin_actions_action_check;
alter table admin_actions add constraint admin_actions_action_check
  check (action in (
    'house_credit_grant', 'house_credit_void', 'account_suspend', 'account_reinstate', 'wtp_record',
    'trial_kill'));

-- ---- Team waitlist (§14.2: the tier is listed, mechanics out of scope — the row is the product) -------
create table team_waitlist (
  id text primary key,
  email text not null,
  seats int,
  workspace_id text,
  note text,
  created_at timestamptz not null default now());
create index team_waitlist_email_idx on team_waitlist (email);
grant select, insert on team_waitlist to rhema_app;

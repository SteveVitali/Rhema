-- 0020_beta_billing.sql — PRB.08 (beta billing: house credits, Stripe Payment Links, refunds,
-- reconciliation, chargeback; REQ-BETA-14/15, REQ-BILL-13, REQ-SPEC-24.7, §14.6).
--
--  • billing_accounts gains the chargeback state (suspension + the clawed shortfall).
--  • usage_records gains the provider request id — the join key the nightly `usage.reconcile` job matches
--    provider Usage & Cost reports against (REQ-SPEC-11 cross-check 2; REQ-BILL-13).
--  • stripe_events gains processed_at so the enqueue→process half of the §14.6 discipline is auditable.
--  • runs gains the delivery-withhold marker + the stashed deliver payload a chargeback-withheld delivery is
--    re-driven from once the account is non-negative (REQ-SPEC-24.7).
--  • admin_actions is the operator CLI's audit trail (every house-credit grant/void + account action).
--  • analytics_events is the beta's persisted telemetry sink for the REQ-BETA-12 events
--    (`credits.exhausted_prompt`, `wtp.recorded`, `credits.granted`, `topup.purchased`) — validated by
--    `parseAnalyticsEvent` at the write boundary; the warehouse export is a later phase.
--  • "user".analytics_opt_out is the flag `recordAnalyticsEvent` honors (REQ-PROD-15); the §14.7 settings
--    toggle that flips it is not a beta surface.

-- ---- chargeback state (REQ-SPEC-24.7) ---------------------------------------------------------------
alter table billing_accounts
  add column suspended_at timestamptz,          -- set by a chargeback; new holds refuse while set
  add column clawback_debt bigint not null default 0 check (clawback_debt >= 0);
-- the disputed amount's credits that could not be clawed from `available` (already spent) — the account
-- stays suspended and deliveries withheld until the debt is cleared (dispute won / operator write-off).

-- ---- reconciliation join key (REQ-BILL-13; §12.7 cross-check 2) --------------------------------------
alter table usage_records add column provider_request_id text;
-- the provider's per-request id (Anthropic `request-id` response header) the proxy captured at meter time.
create index usage_records_provider_request_idx
  on usage_records (provider_request_id) where provider_request_id is not null;
-- one provider_report row per provider request id — the reconcile job's idempotent write boundary.
create unique index usage_records_provider_report_request_uniq
  on usage_records (provider_request_id) where source = 'provider_report';

-- ---- §14.6 webhook discipline auditability ----------------------------------------------------------
alter table stripe_events add column processed_at timestamptz;

-- ---- withheld deliveries (REQ-SPEC-24.7) ------------------------------------------------------------
alter table runs
  add column delivery_withheld_at timestamptz,
  add column pending_delivery jsonb;            -- the stashed DeliveryArgs the run.deliver job re-drives

-- ---- the operator audit trail (REQ-BETA-14: grants audited) -----------------------------------------
-- System-level, deliberately NOT under RLS (like stripe_events): written only by the operator CLI under an
-- elevated role — never by a tenant request.
create table admin_actions (
  id text primary key,
  actor text not null,                          -- the operator id (RHEMA_OPERATOR_ID)
  action text not null check (action in (
    'house_credit_grant', 'house_credit_void', 'account_suspend', 'account_reinstate', 'wtp_record')),
  billing_account_id text references billing_accounts,
  workspace_id text references workspaces,
  credits int,
  note text,
  ledger_id text,                             -- the credit_ledger row the action wrote, when it wrote one
  at timestamptz not null default now());
create index on admin_actions (billing_account_id, at);
grant select, insert on admin_actions to rhema_app;

-- ---- the beta telemetry sink (REQ-BETA-12) ----------------------------------------------------------
-- Tenant-keyed like every product row; writers run inside the workspace-scoped transaction. Payloads are
-- the ANALYTICS_EVENTS catalogue shapes, validated by `parseAnalyticsEvent` at the write boundary — the
-- same discipline timeline_events keeps (0019). Envelope columns are lifted for queries; props stay jsonb.
create table analytics_events (
  id text primary key,
  user_id text,
  workspace_id text not null references workspaces,            -- tenant key (RLS)
  project_id text,
  run_id text,
  event text not null,
  props jsonb not null default '{}',
  at timestamptz not null default now());
create index on analytics_events (workspace_id, at);
create index on analytics_events (event, at);

alter table analytics_events enable row level security;
alter table analytics_events force row level security;
create policy tenant_isolation on analytics_events
  using (workspace_id = current_tenant()) with check (workspace_id = current_tenant());
grant select, insert on analytics_events to rhema_app;

-- ---- the per-account analytics opt-out flag (REQ-PROD-15) --------------------------------------------
alter table "user" add column analytics_opt_out boolean not null default false;
-- the webhook intake writes + the worker marks processed_at; "user" is the opt-out read.
grant select, insert, update on stripe_events to rhema_app;
grant select on "user" to rhema_app;

-- 0047_run_delivery.sql — RES.2 (REQ-SPEC-31(3); ADR-015) — the persisted run-level delivery label.
-- A Review whose verification ends with zero coverage (no Tier-1/2 claim with a fetched source while its
-- inventory held ≥1 Tier-1/2 claim) delivers Unverified. The classification is a PRODUCT fact computed
-- server-side in the delivery transaction and persisted HERE — write-once; every surface (run card,
-- dossier, delivery email) READS it and never recomputes. The same blob carries the platform-fault
-- settlement markers (refunded credits, trial restore, alert) so the once-only semantics survive a
-- settlement retry — separate fields from `failure` (an Unverified run completed; it did not fail).
alter table runs
  add column if not exists delivery jsonb;
-- The stranded sweep's unverified leg + the weekly rate probe scan this predicate.
create index if not exists runs_delivery_label_idx
  on runs ((delivery ->> 'label'))
  where delivery is not null;

-- The trial-restore audit row (REQ-SPEC-31(3)): when an Unverified run consumed the account's trial
-- Review, the settlement restores the entitlement (consumed → unused, clearing consumed_by_run_id)
-- EXACTLY ONCE and writes one row here — `admin_actions` stays operator-only (its action CHECK cannot
-- widen under the additive-migration gate), so the durable audit for the platform-fault restore lives
-- in its own table. Ids + timestamps only; the run's `delivery.trialRestoredAt` marker gates replay.
create table if not exists trial_restorations (
  id text primary key,
  entitlement_id text not null references trial_entitlements,
  run_id text not null references runs on delete cascade,
  workspace_id text not null references workspaces,
  billing_account_id text not null references billing_accounts,
  restored_at timestamptz not null default now(),
  unique (entitlement_id, run_id));
alter table trial_restorations enable row level security;
alter table trial_restorations force row level security;
create policy tenant_isolation on trial_restorations
  using (workspace_id = current_tenant()) with check (workspace_id = current_tenant());
grant select, insert on trial_restorations to rhema_app;

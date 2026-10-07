-- 0046_test_workspaces.sql — JOURNEY.1 (REQ-SPEC-29; ADR-016; ADR-020): the test-tenant flag.
--
-- A workspace created for a signup address that matches the configured test mailbox (exact base
-- address or base+tag — `test@rhema.tools` / `test+<tag>@rhema.tools`) is flagged `is_test` at
-- provisioning, server-side, inside apps/api's provisionPersonalAccount. The flag:
--   - is deploy config (`TEST_MAILBOX`), never a secret, and never settable by any API route;
--   - grants nothing — it only EXCLUDES: `probeSlos`/`slo_samples` ignore flagged workspaces and the
--     trial kill-switch accumulator (`trial_spend_daily`) does not count their spend;
--   - drives the worker's `test-tenant.purge` sweep (the system pool): flagged workspaces older than
--     TEST_TENANT_PURGE_HOURS are hard-deleted through the existing account-deletion pipeline, the
--     14-day grace bypassed for flagged accounts only.
--
-- Additive (check-additive-migrations): one column add with a constant default + a
-- partial index for the purge scan. No drops, renames, type changes, or role changes.

alter table workspaces
  add column if not exists is_test boolean not null default false;

-- The purge sweep's scan: flagged workspaces by age. Partial — the unflagged majority never indexes.
create index if not exists workspaces_test_created_at on workspaces (created_at) where is_test;

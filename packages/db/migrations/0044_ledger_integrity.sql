-- 0044_ledger_integrity.sql — DEF.2 (F4): the denormalized `credit_balances.held` invariant.
--
-- STB.3 found `held = −897` on a live topup bucket: a write path had drifted the counter without the
-- ledger noticing. With the in-tree bypass repaired (the sample meter now goes through
-- `applyLedgerEntry` as a hold+debit pair), the remaining hole is structural: nothing stops a future
-- write from pushing `held` negative. This CHECK makes a negative hold an error at the write —
-- the balance row can never lie about a reservation it no longer holds.
--
-- `NOT VALID` on purpose: existing rows are NOT scanned (a divergent counter like the −897 row does
-- not block the migration), but every NEW insert/update is checked immediately. The operator repair
-- (`admin recompute-balances`, which backfills the missing `hold` rows and rewrites the counter from
-- the ledger fold) is the documented correction path; `VALIDATE CONSTRAINT` may run afterwards to
-- attest the repaired rows. Any write that would leave a still-negative balance errors — that is the
-- invariant: a stuck row surfaces loudly instead of silently compounding drift.
alter table credit_balances
  add constraint credit_balances_held_nonnegative check (held >= 0) not valid;

-- the operator audit vocabulary gains the balances recompute (the correction path is itself audited).
alter table admin_actions drop constraint if exists admin_actions_action_check;
alter table admin_actions add constraint admin_actions_action_check
  check (action in (
    'house_credit_grant', 'house_credit_void', 'account_suspend', 'account_reinstate', 'wtp_record',
    'trial_kill', 'support_access', 'balance_recompute'));

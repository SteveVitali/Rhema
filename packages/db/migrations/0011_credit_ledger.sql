-- 0011_credit_ledger.sql — P0.11 (credit ledger: holds, debits, cap semantics, refunds; §14.4, REQ-SPEC-24).
--
-- The credit_ledger / credit_balances tables already carry every column P0.11 writes (0002): kind (incl.
-- 'adjustment'), credits, bucket, run_id, phase_id, source, reason, expires_at, idempotency_key; and
-- credit_balances(available, held) with check(available >= 0). This migration is purely ADDITIVE — the
-- cap-guarantee assertion trigger, two supporting indexes, and the least-privilege grants the app role needs
-- for the ledger's own transaction. An empty deploy and existing rows are unaffected.

-- REQ-BILL-3 (amended): a run's NET charge `Σ debits − Σ refunds ≤ cap_credits` is a database constraint
-- trigger AND an assertion that must NEVER fire — the debit amount is computed as min(actual, cap − net) under
-- the run row's lock (P0.11 `SqlHoldLedger.debit`), so the net reaches but never exceeds the cap; the overrun
-- is booked as `adjustment(absorbed)`, which this trigger deliberately ignores (only debit/refund rows count).
-- Net (not gross) is the invariant because a refunded partial that is later resumed re-debits its refunded
-- phases (REQ-SPEC-24.6): the refund lowers the net, the re-debit restores it to ≤ cap. A firing here means
-- the clamp was bypassed — a bug, surfaced loudly rather than silently overbilling.
create function assert_run_debits_within_cap() returns trigger language plpgsql as $$
declare
  run_cap int;
  net_debited bigint;
begin
  if new.kind not in ('debit', 'refund') or new.run_id is null then
    return new;
  end if;
  select cap_credits into run_cap from runs where id = new.run_id;
  if run_cap is null then
    return new;   -- a debit not tied to a known run (e.g. a manual adjustment path) is not cap-bound
  end if;
  select coalesce(sum(case kind when 'debit' then credits when 'refund' then -credits else 0 end), 0)
    into net_debited from credit_ledger where run_id = new.run_id and kind in ('debit', 'refund');
  if net_debited > run_cap then
    raise exception 'run % net debits (% credits) exceed cap (% credits) — the min(actual, cap−net) clamp was bypassed (REQ-BILL-3)',
      new.run_id, net_debited, run_cap using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger t_run_debits_within_cap after insert on credit_ledger
  for each row execute function assert_run_debits_within_cap();

-- The debit path reads Σ debits for the run under the run-row lock (min(actual, cap − Σ)); the release/refund
-- paths group the run's own hold/debit/release/refund rows by bucket. Index both hot reads.
create index credit_ledger_run_kind_idx on credit_ledger (run_id, kind);
-- The nightly balances = Σ ledger assertion (REQ-SPEC-24.1) rebuilds each account's per-bucket balance from
-- its ledger rows; group by (account, bucket).
create index credit_ledger_account_bucket_idx on credit_ledger (billing_account_id, bucket);

-- Least-privilege grants for the ledger's own transaction (REQ-ARCH-25). credit_ledger is already granted to
-- rhema_app by 0004 (it is RLS-forced); the balance table it maintains in the same transaction, the billing
-- account it row-locks for a hold (REQ-SPEC-24.2), and the trial entitlement an entitlement run holds against
-- are not RLS-scoped and need explicit DML here. (No-op under the test owner role; load-bearing on the app
-- role in a live deploy.)
grant select, insert, update, delete on credit_balances to rhema_app;
grant select, update on billing_accounts to rhema_app;
grant select, update on trial_entitlements to rhema_app;

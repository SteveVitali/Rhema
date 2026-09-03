-- 0003_invariants.sql — the §11.4 in-Postgres invariants enforced by triggers.

-- Immutability (REQ-DATA-2): once immutable=true, the content columns cannot change. A "change" is a new
-- version (content is content-addressed), so the trigger is the only enforcement needed.
create function forbid_immutable_change() returns trigger language plpgsql as $$
begin
  if old.immutable and (new.content_sha256 <> old.content_sha256 or new.s3_key <> old.s3_key) then
    raise exception 'artifact_version % is immutable', old.id using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger t_immutable before update on artifact_versions for each row execute function forbid_immutable_change();

-- Obligation state cache (REQ-OBJ-1): the append-only obligation_transitions ARE the truth; the row's `state`
-- is a cache of the LAST transition. Two triggers enforce it:
--   (1) inserting a transition updates the obligation's state (via a transaction-local flag), and
--   (2) any OTHER update that changes `state` raises — so a direct `UPDATE … SET state` without a transition
--       row is impossible. This is the one deliberate mutable exception to "correspondence is immutable" (§11.7).
create function apply_obligation_transition() returns trigger language plpgsql as $$
begin
  perform set_config('rhema.in_obligation_transition', 'on', true);   -- true = transaction-local
  update revision_obligations
     set state = new.to_state, state_since = new.at,
         -- closing states stamp closed_at; any re-open (or non-closing transition) clears it, so a
         -- discharged→reopened obligation is not left with a stale closed_at.
         closed_at = case when new.to_state in ('discharged','rebutted','mooted') then new.at else null end
   where id = new.obligation_id;
  perform set_config('rhema.in_obligation_transition', 'off', true);
  return new;
end $$;
create trigger t_obligation_transition after insert on obligation_transitions
  for each row execute function apply_obligation_transition();

create function forbid_direct_obligation_state() returns trigger language plpgsql as $$
begin
  if new.state is distinct from old.state
     and coalesce(current_setting('rhema.in_obligation_transition', true), 'off') <> 'on' then
    raise exception 'revision_obligation % state may change only via an obligation_transitions row', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger t_obligation_state before update on revision_obligations
  for each row execute function forbid_direct_obligation_state();

-- Documented invariants owned by later tickets (recipes, not live logic here):
--   * credit cap (REQ-BILL-3/REQ-SPEC-24, P0.11): the debit amount is computed as min(actual, cap − Σ debits)
--     under the run row's lock, so `sum(debits for run) ≤ cap_credits` holds by construction.
--   * credit_balances (P0.11): maintained in the same transaction as each ledger insert —
--     `insert … on conflict (billing_account_id,bucket) do update set available = available + $delta` (check ≥ 0).
--   * holds (P0.11): `select … for update on billing_accounts` (or pg_advisory_xact_lock(account_id)) in the hold tx.
--   * gates (P0.10): resolution/expiry both `update gates set … where id=$1 and resolved_at is null`, acting only
--     if a row changed (conditional-update fencing).
--   * internal API (P0.08): reject any call whose attempt < runs.current_attempt with 409 stale_task.

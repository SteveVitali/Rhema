-- 0055_refund_window.sql — DEF.4 (§14.4 fairness rules L10; REQ-SPEC-24(6); REQ-SPEC-30).
--
-- Two halves:
--
--   (a) VALIDATE CONSTRAINT credit_balances_held_nonnegative — parity with prod. 0044 added the
--       check NOT VALID so a divergent row could never block the migration; the DEF.2 operator
--       repair cleaned prod and re-validated it there by hand, which left every FRESH stage
--       carrying the constraint un-validated (convalidated = false). One statement here closes
--       the gap: a no-op on prod (already validated), a clean table scan on fresh stages — every
--       counter written since the check went in already satisfies held >= 0 (the check is
--       enforced on writes under NOT VALID), so the scan passes. A stage that fails here has
--       live drift to repair BEFORE it validates — that is the invariant working, loudly.
--       Additive: VALIDATE CONSTRAINT is online-safe DDL (ShareUpdateExclusive lock), and the
--       additive-migration lint carries no rule against it.
--
--   (b) user_refund_requests — the §14.4 user refund window's durable record. One row per run
--       (the request IS the audit: who asked, when, the quarter it counted against, and how it
--       resolved). Following RES.2's precedent (0047 — `admin_actions.action`'s CHECK cannot
--       widen under the additive-migration gate), the review decision lives on the row itself
--       (decision / decided_by / decided_at), not in admin_actions.

alter table credit_balances validate constraint credit_balances_held_nonnegative;

create table if not exists user_refund_requests (
  id text primary key,
  workspace_id text not null references workspaces,                            -- tenant key (RLS)
  billing_account_id text not null references billing_accounts,                -- the allowance's scope
  run_id text not null references runs on delete cascade,
  user_id text not null references "user",                                     -- the authenticated requester
  -- 'refunded' (auto-allowance or admin-approved, credits returned) · 'pending_review'
  -- (the quarter's allowance is spent — awaits the operator verb) · 'denied'.
  state text not null check (state in ('refunded', 'pending_review', 'denied')),
  -- how the request resolved: 'auto_allowance' = §14.4's one-per-quarter automatic refund;
  -- 'admin_approve'/'admin_deny' = the operator verb's verdict. NULL while pending_review.
  decision text check (decision in ('auto_allowance', 'admin_approve', 'admin_deny')),
  credits int not null check (credits > 0),
  -- the UTC calendar-quarter key the allowance counts against, 'YYYYQn' (ADR-07x — calendar,
  -- not rolling): the count that gates auto-approval reads refunded rows in the same key.
  quarter text not null,
  note text,                                                                   -- operator annotation on review
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text,                                                             -- operator id; NULL for auto_allowance
  -- the ops page's send-then-mark marker (the stranded sweep's leg G): NULL ⇒ unalerted; the
  -- sweep stamps it only after the sink accepted, so a dead sink retries next pass — never a
  -- re-page. Owner-role writes only (the user role has no UPDATE on this table).
  alerted_at timestamptz,
  unique (run_id));                                                            -- one request per run — the replay anchor
-- the allowance count: refunded requests against this account in this quarter.
create index if not exists user_refund_requests_allowance_idx
  on user_refund_requests (billing_account_id, quarter) where state = 'refunded';
alter table user_refund_requests enable row level security;
alter table user_refund_requests force row level security;
create policy tenant_isolation on user_refund_requests
  using (workspace_id = current_tenant()) with check (workspace_id = current_tenant());
-- the user-serving surface INSERTs + SELECTs its own requests only; state transitions ride the
-- admin-cli verb on the system pool (the owner role), so UPDATE is deliberately NOT granted.
grant select, insert on user_refund_requests to rhema_app;

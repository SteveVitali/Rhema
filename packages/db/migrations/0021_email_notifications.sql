-- 0021_email_notifications.sql — PRB.09 (email notifications with signed one-click actions; §5.11, §10.4;
-- REQ-IDE-47, REQ-ACCT-1, REQ-SPEC-20, REQ-GATE-8; closes D-P0.10-1).
--
--  • email_action_tokens — the server-side state behind a signed one-click link. The link itself is
--    `<id>.<hmac>`; the ROW carries the binding (gate + account user + action + expiry), the HMAC makes the
--    id unforgeable, and `consumed_at` (a conditional update) makes it single-use. Only 'open' and 'hold'
--    exist — Approve is never a remote action (REQ-SPEC-20/REQ-MOBILE-10-as-email).
--  • notification_deliveries — the "one notification per event per channel" ledger: a unique
--    (user, channel, dedup_key) claim row per send; `run_id` is the §5.11 collapse key. `claimed` rows
--    without `sent_at` are a crashed attempt a retry may complete; `sent` rows dedupe.
--
-- Both are tenant-keyed + RLS'd like analytics_events (0020): every write happens inside the workspace's
-- transaction; the api consumes tokens under the token's own workspace claim.

-- ---- signed one-click action state -------------------------------------------------------------------
create table email_action_tokens (
  id text primary key,
  workspace_id text not null references workspaces,            -- tenant key (RLS)
  gate_id text not null references gates on delete cascade,
  run_id text not null references runs on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  action text not null check (action in ('open','hold')),      -- Open / Wait-for-me — never an approve action
  expires_at timestamptz not null,
  consumed_at timestamptz,                                     -- set by the conditional consume (single-use)
  created_at timestamptz not null default now());
create index on email_action_tokens (gate_id);

alter table email_action_tokens enable row level security;
alter table email_action_tokens force row level security;
create policy tenant_isolation on email_action_tokens
  using (workspace_id = current_tenant()) with check (workspace_id = current_tenant());
grant select, insert, update on email_action_tokens to rhema_app;

-- ---- the per-(user, channel, event) delivery ledger --------------------------------------------------
create table notification_deliveries (
  id text primary key,
  workspace_id text not null references workspaces,            -- tenant key (RLS)
  user_id text not null references "user"(id) on delete cascade,
  channel text not null default 'email',
  event_type text not null,                                    -- a contracts NOTIFICATION_EVENT_TYPES value
  dedup_key text not null,                                     -- e.g. 'gate:<id>:waiting' / 'credits:<ba>:80'
  run_id text references runs on delete cascade,               -- the §5.11 collapse key (null for account-level)
  subject text,
  status text not null default 'claimed' check (status in ('claimed','sent')),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, channel, dedup_key));
create index on notification_deliveries (run_id);

alter table notification_deliveries enable row level security;
alter table notification_deliveries force row level security;
create policy tenant_isolation on notification_deliveries
  using (workspace_id = current_tenant()) with check (workspace_id = current_tenant());
grant select, insert, update on notification_deliveries to rhema_app;

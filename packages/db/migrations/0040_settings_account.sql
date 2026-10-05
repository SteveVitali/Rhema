-- 0040_settings_account.sql — P1.20 (the §14.7 settings tree; REQ-ACCT-2/4, REQ-VIS-11,
-- REQ-OBJ-14, REQ-GATE-3/10, REQ-GENRE-2).
--
--   1. "user".prefs — the account-level Preferences blob (model tier / rigor / approval-policy
--      defaults, editor prefs, the Q-26 preference-profile opt-out). One jsonb, validated by
--      `userPrefsSchema` in @rhema/contracts at the write boundary — the same shape the
--      notification_prefs row uses.
--   2. "user".deletion_requested_at — the REQ-ACCT-4 grace clock (14 days, worker-side
--      `accountDeletionPlan`). NULL = no pending deletion.
--   3. "user".byline — the account byline (the default voice byline §14.7 lists under Account).
--   4. support_access_grants / support_access_log — REQ-VIS-11's surface half: the "Allow Rhema
--      staff to view my projects for support (per request, 72 h)" toggle mints a 72-h-expiring
--      grant; every grant event AND every staff access writes a `support_access_log` row (the
--      admin_actions-class audit) the user can read back. USER-scoped like notification_prefs —
--      no RLS; every route filters on the principal's own user_id.
--   5. admin_actions gains 'support_access' — the operator CLI writes one row per staff access
--      (the operator-side audit trail; support_access_log is the user-visible mirror).
--   6. projects.protocol_changed_at — the §6.7 marker: a protocol change in project settings marks
--      the next Review's scope card ("protocol changed since the last reviewed version"); the run
--      creation clears it once a review carries the mark.
--      projects.protocol_overrides — the REQ-GENRE-2 safe fields (length norms / phase defaults /
--      stage) as a validated jsonb; the protocol row stays the versioned truth.

alter table "user"
  add column if not exists prefs jsonb not null default '{}',
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists byline text;

create table support_access_grants (
  id text primary key,
  user_id text not null references "user"(id) on delete cascade,
  workspace_id text not null references workspaces(id) on delete cascade,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz);
create index support_access_grants_user_idx on support_access_grants (user_id, granted_at desc);

create table support_access_log (
  id text primary key,
  user_id text not null references "user"(id) on delete cascade,
  workspace_id text not null references workspaces(id) on delete cascade,
  grant_id text references support_access_grants(id) on delete set null,
  actor text not null,                          -- 'user' for grant/revoke; the operator id for access
  action text not null check (action in ('granted','revoked','accessed','expired')),
  detail text,
  at timestamptz not null default now());
create index support_access_log_user_idx on support_access_log (user_id, at desc);

grant select, insert, update on support_access_grants to rhema_app;
grant select, insert on support_access_log to rhema_app;

-- the operator audit vocabulary gains the support-access class (one row per staff access).
alter table admin_actions drop constraint if exists admin_actions_action_check;
alter table admin_actions add constraint admin_actions_action_check
  check (action in (
    'house_credit_grant', 'house_credit_void', 'account_suspend', 'account_reinstate', 'wtp_record',
    'trial_kill', 'support_access'));

alter table projects
  add column if not exists protocol_changed_at timestamptz,
  add column if not exists protocol_overrides jsonb;

-- §14.7 "per-project overrides win over account defaults": a project with NO explicit rigor pick
-- inherits the account default. NULL rigor_default means inherit — the not-null 'standard' default
-- would stamp every project with a phantom override, so both constraints go. Existing 'standard'
-- rows keep their value (the same default, now explicit).
alter table projects alter column rigor_default drop not null;
alter table projects alter column rigor_default drop default;

-- REQ-OBJ-14 (Q-26) — the preference profile is capture-only at MVP: "signals are views over rows
-- the account already holds" (§11.7), so the capture half marks each captured signal's
-- preference-eligibility AT WRITE TIME. `captureGuidance` stamps `preference_signal =
-- preferenceCaptureEnabled(user.prefs)`; an opted-out user's row still lands (it is functional —
-- the run consumes it) but is never preference-eligible, so the 1.x aggregation reads only
-- `preference_signal = true` rows. Opting out flips the next capture immediately.
alter table guidance add column if not exists preference_signal boolean not null default false;

-- 0016_invites.sql — beta invite gating (PRB.01; REQ-BETA-19). The beta is private and invite-only: there is
-- no public signup path. An invite is a code (optionally bound to one email, as an allowlist entry), single-use
-- by default; redemptions are recorded so a code cannot be reused past `max_uses`, and the last-use race is
-- closed by a conditional UPDATE at consume time (used_count < max_uses in the WHERE).
--
-- Forward-only, additive (never a rename — REQ-IDE-50). System-level, PRE-account tables: consulted by the
-- auth/api layer before a user has a workspace, so — like the proxy_* tables (0007) — they are deliberately
-- NOT under RLS (0004). No credential or secret lives here; a code is a bearer token the operator issues.

create table invites (
  code text primary key,
  email text,                          -- optional allowlist binding; if set only this email may redeem
  note text,                           -- operator memo (cohort / partner)
  max_uses integer not null default 1 check (max_uses >= 1),
  used_count integer not null default 0 check (used_count >= 0),
  expires_at timestamptz,              -- null = no expiry
  revoked_at timestamptz,              -- null = active
  created_by text,                     -- operator/user id who issued it
  created_at timestamptz not null default now()
);
create index on invites (email);

create table invite_redemptions (
  id text primary key,
  code text not null references invites on delete cascade,
  user_id text not null references "user" on delete cascade,
  redeemed_at timestamptz not null default now()
);
create index on invite_redemptions (code);
-- one redemption per (code, user): a user cannot redeem the same code twice.
create unique index on invite_redemptions (code, user_id);

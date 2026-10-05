-- P1.17 — the Showcase marker + the pre-auth acquisition funnel (§15.3/§15.4/§3.5).
--
-- `projects.showcase` marks the one deterministic worked-example dossier seeded per workspace at
-- provisioning. A showcase project is read-only by rule (run creation refuses 409
-- `showcase_read_only`; draft/outline/disposition writes refuse; delete refuses; archive + restore +
-- Duplicate-into-a-normal-project stay allowed). Enforced in the route layer; the column is the
-- single flag every guard reads.

alter table projects add column if not exists showcase boolean not null default false;
create index if not exists projects_showcase_idx on projects (workspace_id) where showcase;

-- `acquisition_events`: the PRE-AUTH half of the §3.5 funnel (landing.viewed, landing.dropzone_used)
-- — events minted before a session exists, so they cannot carry the analytics_events envelope's
-- user_id/workspace_id. Session-authed + server-owned events still flow through analytics_events
-- (validated catalogue + REQ-PROD-15 opt-out); this table is append-only, carries no PII (the IP is
-- stored hashed for coarse dedupe), and accepts ONLY the whitelisted acquisition names.
create table if not exists acquisition_events (
  id text primary key,
  event text not null check (event in ('landing.viewed','landing.dropzone_used')),
  props jsonb not null default '{}',
  surface text not null default 'web',
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists acquisition_events_event_idx on acquisition_events (event, created_at);

-- `user.signup_intent` — the §15.3 intent the /signup funnel carried (entry + src). Written once at
-- account creation (never overwritten for a returning user); `GET /app`'s precedence redirect reads
-- it through GET /showcase to decide whether the workspace opens on the Showcase dossier or the
-- carried-file path (a user who arrived holding a draft goes to the import entry, not the example).
alter table "user" add column if not exists signup_intent jsonb;

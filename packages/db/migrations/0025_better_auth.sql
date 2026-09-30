-- 0025_better_auth.sql — PRB.16 (the live Better Auth binding, D-P0.01-3).
--
-- (a) The 0002 account schema predates better-auth 1.7.2's core schemas: every row carries
--     createdAt/updatedAt (coreSchema), `session` lacked updated_at, `verification` lacked
--     updated_at, and `account` lacked issuer / scope / password / refresh_token_expires_at /
--     updated_at. The Kysely adapter writes all of them — a missing column is a runtime
--     `column does not exist` on the first sign-in.
-- (b) `issuer` is REQUIRED (half of the account key — {issuer, accountId}). Existing rows are
--     OAuth-linked, so the backfill is better-auth's synthetic issuer for providers without an
--     `accountIssuer` resolver: 'local:oauth:' || providerId (createOAuthAccountIssuer;
--     encodeURIComponent is identity on our provider ids like 'google').
-- (c) rhema_app grants on the account + product surface. The earlier per-ticket grants covered
--     only the RLS-loop subset and the billing/notification tables; the account tables
--     (session/account/verification/user-beyond-select) and the 0002 product tables the api +
--     worker drive (drafts, correspondence_items, findings, …) had none. Owner connections
--     (the prod DATABASE_URLs) were unaffected, which is why the gap never surfaced — the
--     grants make the restricted role actually usable and document intent.
--     benchmark_* stay rhema_benchmark-only (REQ-EVAL-3); proxy_* stay ungranted (the egress
--     proxy carries its own DATABASE_URL); run_events* were granted in 0008.

alter table session add column if not exists updated_at timestamptz not null default now();

alter table account add column if not exists issuer text;
update account set issuer = 'local:oauth:' || provider_id where issuer is null;
alter table account alter column issuer set not null;
alter table account add column if not exists scope text;
alter table account add column if not exists password text;
alter table account add column if not exists refresh_token_expires_at timestamptz;
alter table account add column if not exists updated_at timestamptz not null default now();

alter table verification add column if not exists updated_at timestamptz not null default now();

-- the adapter's hot lookups: session list by user, account resolve by key, verification by identifier.
create index if not exists session_user_id_idx on session (user_id);
create index if not exists account_issuer_account_idx on account (issuer, account_id);
create index if not exists verification_identifier_idx on verification (identifier);

-- account + tenancy tables (the session→membership→workspace join and provisioning writes).
grant select, insert, update, delete on
  session, account, verification, device,
  workspaces, workspace_members, invites, invite_redemptions, project_members, subscriptions
  to rhema_app;
grant insert, update, delete on "user" to rhema_app;       -- select granted in 0020
grant insert, delete on billing_accounts to rhema_app;      -- select,update granted in 0011
grant insert, delete on trial_entitlements to rhema_app;    -- select,update granted in 0011

-- the product surface the api + worker drive (0002 tables outside the 0004 RLS-loop subset; the
-- loop's six + later per-ticket grants already cover projects/personas/artifacts/runs/
-- usage_records/credit_ledger, run_events*, run_mounts, subagent_launches, credit_balances,
-- revision_obligations, obligation_*, decision_requests, stripe_events, analytics_events,
-- email_action_tokens, notification_deliveries, timeline_events, ai_use_additions,
-- admin_actions — those are intentionally not re-granted).
grant select, insert, update, delete on
  artifact_versions, drafts, live_docs, restore_points, working_copies,
  correspondence_items, claims, claim_sources, findings, dispositions,
  agent_types, agent_instances, steps, gates, decisions, estimate_cache,
  access_log, fetch_log, provenance_maps, guidance, threads, protocols, inbox_items,
  notification_devices, notification_prefs, figures, figure_versions,
  persona_members, connections, discovered_items, sample_versions, persona_profiles,
  persona_build_notes, profile_corrections, deployments, run_idempotency
  to rhema_app;

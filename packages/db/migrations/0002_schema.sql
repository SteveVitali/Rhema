-- 0002_schema.sql — the §11 data model as forward-only DDL (design/3 §3.3 adopted by reference §0.1, with
-- the §11.4 amendments and REQ-IDE-50 renames). IDs are ULIDs stored as text. This migration is authoritative;
-- the Drizzle schema (src/schema/*) is the typed query layer over exactly these tables (a parity test guards
-- drift). Tables owned by later tickets are intentionally absent: run_events + daily partitioning (P0.08b).

-- ============================ tenancy & auth ============================
-- Better Auth tables (P0.01 owns their SHAPE; recreated here because migrations are the DDL of record — R4,
-- §13.1). Field names follow Better Auth's Drizzle adapter. "user" is a reserved word, hence quoted.
create table "user" (
  id text primary key, name text, email text not null unique,
  email_verified boolean not null default false, image text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table session (
  id text primary key, user_id text not null references "user"(id) on delete cascade,
  token text not null unique, expires_at timestamptz not null, ip_address text, user_agent text,
  created_at timestamptz not null default now());
create table account (
  id text primary key, user_id text not null references "user"(id) on delete cascade,
  provider_id text not null, account_id text not null, access_token text, refresh_token text, id_token text,
  access_token_expires_at timestamptz, created_at timestamptz not null default now());
create table verification (
  id text primary key, identifier text not null, value text not null,
  expires_at timestamptz not null, created_at timestamptz not null default now());
create table device (
  id text primary key, user_id text not null references "user"(id) on delete cascade,
  label text, platform text, last_seen_at timestamptz, created_at timestamptz not null default now());

create table billing_accounts (
  id text primary key, created_at timestamptz not null default now());
create table workspaces (
  id text primary key, kind text not null check (kind in ('personal','team')), name text not null,
  billing_account_id text not null references billing_accounts, created_at timestamptz not null default now());
create table workspace_members (
  workspace_id text not null references workspaces on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  role text not null check (role in ('member','admin')), primary key (workspace_id, user_id));
create index on workspace_members (user_id);

-- ============================ projects & sharing ============================
create table projects (
  id text primary key, workspace_id text not null references workspaces, owner_id text not null references "user"(id),
  title text not null, slug text not null,
  protocol_id text, protocol_version int not null default 1, venue text,
  persona_id text, persona_profile_snapshot_id text, register text, persona_locked_at timestamptz,
  approval_policy text not null default 'named' check (approval_policy in ('named','wait_each','run_to_completion')),
  approval_overrides jsonb,
  rigor_default text not null default 'standard' check (rigor_default in ('quick','standard','full_board')),
  model_tier_default text check (model_tier_default in ('base','balanced','frontier')),
  paper_theme text not null default 'light' check (paper_theme in ('light','follow','dark')),
  tags text[], monthly_credit_cap int, accepted_draft_id text,
  archived_at timestamptz, created_at timestamptz not null default now(),
  unique (workspace_id, slug));
create table project_members (
  project_id text not null references projects on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  role text not null check (role in ('viewer','editor','admin')), invited_by text, run_credit_cap int,
  primary key (project_id, user_id));
create index on project_members (user_id);

-- ============================ artifacts ============================
create table artifacts (
  id text primary key, workspace_id text not null references workspaces,           -- denormalized tenant key (RLS)
  project_id text references projects on delete cascade, persona_id text,
  kind text not null, namespace text not null, mirror_path text not null, head_version_id text,
  created_at timestamptz not null default now(),
  check ((project_id is null) <> (persona_id is null)),
  unique (project_id, mirror_path), unique (persona_id, mirror_path));
create index on artifacts (project_id, namespace, kind);
create table artifact_versions (
  id text primary key, artifact_id text not null references artifacts on delete cascade, ordinal int not null,
  content_sha256 text not null, s3_key text not null, bytes int not null, word_count int,
  media_type text not null, created_by jsonb not null, created_at timestamptz not null default now(),
  immutable boolean not null default false,
  parse_status text check (parse_status in ('ok','failed')),   -- 'partial' removed (REQ-SPEC-12)
  producer_query_id text, block_id_map jsonb,
  unique (artifact_id, ordinal));
create index on artifact_versions (content_sha256);

-- ============================ drafts (three tiers) ============================
create table drafts (
  id text primary key, project_id text not null references projects on delete cascade, n int not null,
  origin text not null, state text not null default 'working' check (state in ('working','frozen')),
  promoted_version_id text references artifact_versions, live_doc_id text,
  frozen_at timestamptz, frozen_by jsonb, base_draft_id text references drafts,
  claims_pending_verification boolean not null default false, created_at timestamptz not null default now(),
  unique (project_id, n),
  check (state <> 'frozen' or promoted_version_id is not null));
create unique index one_working_head_per_project on drafts (project_id) where state = 'working';  -- REQ-DATA-14
create table live_docs (
  id text primary key, draft_id text references drafts on delete cascade,
  y_state bytea not null, state_vector bytea not null, md_sha256 text, materialized_at timestamptz);
create table restore_points (
  id text primary key, live_doc_id text references live_docs on delete cascade, s3_key text not null,
  kind text not null check (kind in ('snapshot','delta')), cause text not null check (cause in ('auto','blur','named','workflow')),
  label text, created_at timestamptz not null default now());
create index on restore_points (live_doc_id, created_at desc);
create table working_copies (
  id text primary key, base_draft_id text references drafts, live_doc_id text references live_docs,
  reconciled_into text references drafts, created_at timestamptz not null default now());

-- ============================ correspondence, claims, findings, dispositions ============================
create table correspondence_items (
  id text primary key, project_id text not null references projects on delete cascade, kind text not null,
  draft_id text not null references drafts, run_id text not null, ordinal int not null default 1,
  delivered_at timestamptz not null, artifact_ids text[] not null,
  rubric jsonb, verdict text, protocol_id text, protocol_version int, scope jsonb,
  opted_out text[] not null default '{}', prior_review_id text,
  unique (draft_id, kind, ordinal));
create index on correspondence_items (project_id, delivered_at);
create table claims (
  id text primary key, correspondence_id text not null references correspondence_items on delete cascade,
  draft_id text not null references drafts, ordinal int not null, text text not null, tier smallint,
  verdict text not null, kind text, url text, normalized_url text, accessed_at timestamptz, note text,
  source_check text, anchor jsonb, human_added boolean not null default false, figure_id text, extra jsonb);
create index on claims (draft_id, verdict);
create index on claims (normalized_url);
-- v0.3: claim source stance edges (REQ-OBJ-18) — rows, not jsonb, so cited⇒fetched stays mechanical.
create table claim_sources (
  claim_id text not null references claims on delete cascade, ordinal int not null,
  url text not null, normalized_url text not null, accessed_at timestamptz not null,
  stance text not null check (stance in ('supports','contradicts','contextualizes')), note text,
  primary key (claim_id, ordinal));
create index on claim_sources (normalized_url);
create table findings (
  id text primary key, correspondence_id text not null references correspondence_items on delete cascade,
  draft_id text not null references drafts, ordinal int not null, kind text not null, severity text not null,
  origin text not null, reconciliation text, title text not null, body text not null,
  evidence jsonb, suggestion jsonb, rubric_dims text[] not null default '{}', letter_section text,
  anchor jsonb, projections jsonb not null default '[]');
create index on findings (draft_id, severity);
create table dispositions (
  id text primary key, finding_id text not null references findings on delete cascade,
  response_id text references correspondence_items, kind text not null, status text not null default 'proposed',
  rationale text, adapted_text text, move_ordinal int, applied boolean, by_actor jsonb not null,
  frozen_at timestamptz, created_at timestamptz not null default now(),
  unique (finding_id, response_id));
create table decision_requests (
  id text primary key, project_id text references projects on delete cascade, source_run_id text, text text not null,
  options text[] not null, state text not null default 'open' check (state in ('open','answered','dismissed')), answer text);

-- ============================ revision obligations (v0.3, §11.7; REQ-OBJ-1) ============================
create table revision_obligations (
  id text primary key, project_id text not null references projects on delete cascade,
  source text not null check (source in ('finding','escalation_decision','agenda','user')),
  finding_id text references findings, severity text not null, kind text,
  title text not null, state text not null default 'open', state_since timestamptz not null default now(),
  opened_on_draft_id text references drafts, rationale text, defer_horizon jsonb,
  rounds_open int not null default 0, discharged_by jsonb,
  created_by jsonb not null, created_at timestamptz not null default now(), closed_at timestamptz,
  check (state not in ('rebutted','deferred') or rationale is not null));
create index on revision_obligations (project_id, state);
create unique index one_obligation_per_root_finding on revision_obligations (finding_id) where finding_id is not null;
create table obligation_findings (
  obligation_id text not null references revision_obligations on delete cascade,
  finding_id text not null references findings, correspondence_id text not null,
  relation text not null check (relation in ('root','carried','regression')),
  primary key (obligation_id, finding_id));
create table obligation_transitions (
  id text primary key, obligation_id text not null references revision_obligations on delete cascade,
  from_state text, to_state text not null, cause text not null, by_actor jsonb not null,
  run_id text, disposition_id text, finding_id text, at timestamptz not null default now());
create index on obligation_transitions (obligation_id, at);

-- backlog_items (design/3 §3.3) — dropped after its rows migrate to source='agenda' obligations (0005; REQ-OBJ-7).
create table backlog_items (
  id text primary key, project_id text not null references projects on delete cascade,
  from_correspondence_id text, text text not null, consumed_by_run_id text, opened_on_draft_id text references drafts);

-- ============================ agents, runs, steps, gates ============================
create table agent_types (
  key text primary key, display_name text not null, readable text[] not null, writable text[] not null,
  persona_view text[] not null, tools text[] not null, skills text[] not null,
  default_model_profile text not null, subagents jsonb not null);
create table agent_instances (
  id text primary key, project_id text references projects on delete cascade, persona_id text,
  type_key text not null references agent_types, namespace text not null,
  created_at timestamptz not null default now(),
  unique (project_id, type_key), unique (persona_id, type_key));
create table runs (
  id text primary key, workspace_id text not null references workspaces,               -- denormalized tenant key (RLS)
  project_id text references projects on delete cascade, persona_id text, workflow text not null,
  agent_instance_id text references agent_instances, state text not null, state_since timestamptz not null default now(),
  current_step_id text, current_attempt int not null default 1,
  inputs jsonb not null, input_snapshot jsonb, model_profile text not null,
  model_tier text not null check (model_tier in ('base','balanced','frontier')),
  rigor text not null check (rigor in ('quick','standard','full_board')),
  variant_group_id text, parent_run_id text references runs, scope jsonb,
  estimate_credits int not null, cap_credits int not null, hold_ledger_id text, hold_bucket text,
  spent_credits int not null default 0, rate_table_version int not null,
  proxy_credential_id text, proxy_allowlist_id text, entitlement_id text,
  lock_set text[] not null default '{}', requested_by text references "user"(id),
  image_digest text, protocols_version text, replans int not null default 0,
  failure jsonb, created_at timestamptz not null default now(), started_at timestamptz, ended_at timestamptz,
  parked_until timestamptz);
create index on runs (project_id, created_at desc);
create index on runs (state) where state in ('queued','running','waiting_gate');
create index on runs using gin (lock_set);
create table steps (
  id text primary key, run_id text not null references runs on delete cascade, phase text not null, ordinal int not null,
  state text not null, attempt int not null default 1, expected_artifacts text[] not null default '{}',
  produced_version_ids text[] not null default '{}', started_at timestamptz, ended_at timestamptz,
  credits int not null default 0, checks jsonb, result jsonb, unique (run_id, ordinal));
create table gates (
  id text primary key, run_id text not null references runs on delete cascade, step_id text references steps,
  kind text not null, artifact_version_id text, opened_at timestamptz not null, deadline_at timestamptz,
  blocking boolean not null default true, on_expiry text not null,
  held boolean not null default false, paused_while_reading boolean not null default false,
  presence_deadline_at timestamptz, resolved_at timestamptz);
create table decisions (
  gate_id text primary key references gates on delete cascade,
  by_actor text not null, presence boolean, action text not null,
  guidance text, standing_rule boolean, changes int, overlay_version_ids text[], at timestamptz not null default now());

-- ============================ usage & billing (§14) ============================
create table usage_records (
  id text primary key, ts timestamptz not null, workspace_id text not null references workspaces,   -- tenant key (RLS)
  billing_account_id text not null references billing_accounts, user_id text, project_id text, persona_id text,
  run_id text not null, attempt int not null default 1, step_id text, role text not null, agent_instance_id text, subagent_label text,
  provider text not null, model text not null, model_tier text not null, rate_table_version int not null,
  input_tokens bigint, cache_write_tokens bigint, cache_read_tokens bigint, output_tokens bigint,
  searches int, fetches int, list_cost_usd numeric(12,6) not null, credits int not null,
  source text not null check (source in ('proxy','sdk_stream','sdk_estimate','provider_report')),
  reconciled boolean default false);
create index on usage_records (run_id, step_id, role);
create index on usage_records (billing_account_id, ts);
create table credit_ledger (
  id text primary key, workspace_id text not null references workspaces,                              -- tenant key (RLS)
  billing_account_id text not null references billing_accounts,
  kind text not null check (kind in ('grant','hold','debit','release','expire','refund','adjustment')),
  credits int not null,
  bucket text not null check (bucket in ('included','topup','trial_pocket','daily','promo')),
  run_id text, phase_id text, source text not null, reason text, expires_at timestamptz,
  idempotency_key text unique not null, stripe_ref text, at timestamptz not null default now());
create index on credit_ledger (billing_account_id, at);
-- credit_balances is a TABLE, not a materialized view (REQ-SPEC-24); maintained in the SAME transaction as each
-- ledger insert (P0.11 owns that logic): `insert … on conflict (billing_account_id,bucket) do update set
-- available = available + $delta`. The check(available >= 0) is the guard; a nightly job asserts balances = Σ ledger.
create table credit_balances (
  billing_account_id text not null references billing_accounts, bucket text not null,
  available bigint not null default 0, held bigint not null default 0, updated_at timestamptz not null default now(),
  primary key (billing_account_id, bucket), check (available >= 0));
create table subscriptions (
  id text primary key, billing_account_id text not null references billing_accounts,
  tier text not null check (tier in ('free','writer','studio','studio_max','team')),
  trial_ends_at timestamptz, stripe_subscription_id text, period_start timestamptz, period_end timestamptz,
  included_credits int, concurrency int, status text check (status in ('active','past_due','cancelled')));
create table trial_entitlements (
  id text primary key, billing_account_id text not null references billing_accounts,
  kind text not null default 'review', word_cap int not null default 6000, rigor text not null default 'standard',
  model_tier text not null default 'base', state text not null default 'unused' check (state in ('unused','consumed','expired')),
  consumed_by_run_id text, expires_at timestamptz);
create table proxy_credentials (
  id text primary key, run_id text, created_at timestamptz not null default now(), revoked_at timestamptz);
create table proxy_allowlists (
  id text primary key, run_id text, hosts text[] not null default '{}', created_at timestamptz not null default now());
create table estimate_cache (
  id text primary key, cache_key text not null unique, estimate_credits int not null, cap_credits int not null,
  rate_table_version int not null, computed_at timestamptz not null default now());
create table stripe_events (
  id text primary key, type text not null, payload jsonb not null, received_at timestamptz not null default now());

-- ============================ enforcement & provenance (§12.6) ============================
create table access_log (
  run_id text not null references runs on delete cascade, ts timestamptz not null, agent_label text not null,
  tool text not null, path text not null, namespace text, decision text not null);
create index on access_log (run_id, decision);
create table fetch_log (
  run_id text not null references runs on delete cascade, ts timestamptz not null, agent_label text not null,
  kind text not null, query text, url text, normalized_url text, status int, bytes int,
  decision text not null, deny_reason text);
create index on fetch_log (run_id, normalized_url);
create table provenance_maps (
  draft_version_id text primary key references artifact_versions, granularity text not null default 'block', spans jsonb not null);

-- ============================ guidance, threads, protocols, notifications, figures, deployments ============================
create table guidance (
  id text primary key, project_id text references projects on delete cascade, source text, anchors jsonb,
  body text not null, standing boolean not null default false, created_by jsonb, created_at timestamptz not null default now());
create table threads (
  id text primary key, project_id text references projects on delete cascade, name text, session_store_key text,
  brief_key text, created_by text, archived_at timestamptz);
create table protocols (
  id text primary key, version int not null, body jsonb not null, seeded_at timestamptz not null default now(),
  venue_table_verified_at timestamptz, unique (id, version));
create table inbox_items (
  id text primary key, user_id text not null references "user"(id) on delete cascade, project_id text, kind text not null,
  payload jsonb not null, read_at timestamptz, created_at timestamptz not null default now());
create table notification_devices (
  id text primary key, user_id text not null references "user"(id) on delete cascade, platform text not null,
  token text not null, created_at timestamptz not null default now());
create table notification_prefs (
  user_id text primary key references "user"(id) on delete cascade, prefs jsonb not null default '{}');
create table figures (
  id text primary key, project_id text references projects on delete cascade, artifact_id text,
  spec_kind text not null check (spec_kind in ('vega_lite','mermaid','table')), spec_version_id text,
  data_version_id text, rendered_version_id text, caption text, alt text, source_line text,
  provenance jsonb, inserted_in_draft_id text);
create table figure_versions (
  id text primary key, figure_id text not null references figures on delete cascade, ordinal int not null,
  spec_version_id text, rendered_version_id text, created_at timestamptz not null default now(),
  unique (figure_id, ordinal));

-- ============================ personas (§9) ============================
create table personas (
  id text primary key, workspace_id text not null references workspaces, slug text, display_name text, byline text,
  mode text not null check (mode in ('self','consented','house','study')), kind text not null check (kind in ('leaf','composite')),
  provenance text check (provenance in ('user','platform','fork')),
  seed_artifact_id text, seed_sha256 text, seed_authored_by text, registers text[], seed_updated_at timestamptz,
  current_profile_id text, active_run_id text, unique (workspace_id, slug));
create table persona_members (
  composite_id text not null references personas on delete cascade, member_id text not null references personas,
  primary key (composite_id, member_id));
create table connections (
  id text primary key, persona_id text not null references personas on delete cascade, provider text not null,
  handle text, auth_ref text, status text, last_sync_at timestamptz, schedule text, auto_include_new boolean, error text);
create table discovered_items (
  id text primary key, connection_id text not null references connections on delete cascade, external_id text,
  title text, url text, date date, word_count int, access text, remote_change_key text, state text not null,
  current_sample_id text, unique (connection_id, external_id));
create table sample_versions (
  id text primary key, discovered_item_id text not null references discovered_items on delete cascade, n int not null,
  content_sha256 text not null, original_sha256 text, artifact_version_id text, quality text, quality_notes text[], word_count int,
  unique (discovered_item_id, n));
create table persona_profiles (
  id text primary key, persona_id text not null references personas on delete cascade, built_by_run_id text, built_at timestamptz not null,
  tier text, seed_sha256 text, sample_set_hash text, sample_set jsonb not null, corpus_size_at_build int,
  calibration_status text, artifact_ids text[] not null, member_profile_ids text[], build_note jsonb);
create index on persona_profiles (persona_id, built_at desc);
create table persona_build_notes (
  id text primary key, persona_id text not null references personas on delete cascade, profile_id text,
  body text, created_at timestamptz not null default now());
create table profile_corrections (
  id text primary key, persona_id text not null references personas on delete cascade, profile_id text,
  target_artifact_id text, statement_ref text, text text not null, source text not null,
  consumed_by_profile_id text, at timestamptz not null default now());

-- deployments — deploy provenance of record (REQ-ARCH-39). P0.01 defined the shape; authoritative here.
create table deployments (
  id text primary key, stage text not null, git_sha text not null, image_digests jsonb not null,
  protocols_version text not null, rate_table_version text not null, deployed_at timestamptz not null default now());

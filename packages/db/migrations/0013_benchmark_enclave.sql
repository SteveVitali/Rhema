-- 0013_benchmark_enclave.sql — P0.13 (§18 evaluation program: corpus enclave, contamination controls, gold
-- set, waves, run-ledger join; REQ-EVAL-1..5, REQ-EVAL-12/13/14, REQ-EVAL-20).
--
-- The comparative-benchmark data layer, deliberately SEPARATE from every tenant table. The corpus drafts and
-- gold annotations are program data with NO workspace — they are never reached from a product path (REQ-EVAL-3),
-- so these tables are NOT RLS-forced (there is no workspace_id to scope on). Access control is instead (a) a
-- dedicated non-owner role that the product roles never assume, and (b) the append-only access log every read
-- writes. Purely additive: an empty deploy and every existing table/row are untouched.

-- A dedicated benchmark-PROGRAM role (REQ-ARCH-25 least privilege). The product roles (rhema_app / rhema_collab /
-- rhema_harvester) are NEVER granted the enclave tables below, so no product/fixture code path — which runs as
-- rhema_app — can resolve corpus content even by accident (REQ-EVAL-3; AC1). Conversely this role reads the §12.7
-- meter of record (usage_records) for the REQ-EVAL-14 cost/latency join: that join spans every Rhema-arm run in a
-- wave (potentially across billing workspaces), so it is a cross-tenant REPORTING read — hence BYPASSRLS, scoped
-- tightly by granting SELECT on usage_records ONLY (no product-table writes, no other reads). Roles are
-- cluster-global; guard. (BYPASSRLS matters only for tables the role is granted — here just usage_records.)
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'rhema_benchmark') then
    create role rhema_benchmark nosuperuser noinherit bypassrls;
  else
    alter role rhema_benchmark bypassrls;
  end if;
end $$;
grant usage on schema public to rhema_benchmark;
-- The read-only run-ledger join (REQ-EVAL-14 / REQ-EVAL-20): the benchmark role reads the proxy meter of record.
grant select on usage_records to rhema_benchmark;

-- The corpus: unpublished, human-written, licensed drafts (REQ-EVAL-1). Bytes live in the access-logged enclave
-- store keyed by content sha (never in the row). The three real projects are the frozen dev set (is_dev_set) —
-- dev-set results never enter a headline table (enforced again at wave admission + at report render, AC6).
create table benchmark_corpus_drafts (
  id text primary key,
  protocol text not null check (protocol in ('essay','academic','op_ed','memo')),
  length_band text not null check (length_band in ('2k','5k','8k')),
  word_count int not null,
  created_at timestamptz not null,             -- authoring date — the contamination cutoff check reads this
  license_ref text not null,                   -- the written license (eval use + provider transmission, API terms)
  content_sha256 text not null,                -- enclave blob pointer (content-addressed)
  enclave_key text not null,                   -- the access-logged store key
  canary_id text not null unique,              -- unique canary embedded (REQ-EVAL-2)
  is_dev_set boolean not null default false,   -- three real projects = frozen dev set (REQ-EVAL-1)
  source_project_id text,                      -- for a dev-set draft, the real project it mirrors
  rotation_year int,                           -- ≥20%/yr rotation bookkeeping (REQ-EVAL-3)
  retired_at timestamptz,                      -- rotation retirement
  added_at timestamptz not null default now()
);
create index benchmark_corpus_drafts_protocol_idx on benchmark_corpus_drafts (protocol, length_band);

-- Per-draft contamination evidence (REQ-EVAL-2). Every field is required for admission; a draft whose record is
-- missing or incomplete cannot be admitted to a wave (the trigger below — AC2). The per-wave memorization probe
-- is per-arm and lives in its own table (it gates a draft's inclusion in ONE arm, not blanket admission).
create table benchmark_contamination_records (
  draft_id text primary key references benchmark_corpus_drafts on delete cascade,
  created_after_cutoff boolean not null,       -- authored after the newest arm model's training cutoff…
  never_published boolean not null default false,  -- …or verifiably never published/indexed
  newest_model_cutoff date not null,           -- the cutoff cleared
  author_attestation_ref text not null,        -- human authorship, no generative-AI drafting (on file)
  near_duplicate_clean boolean not null,       -- near-duplicate web search came back clean…
  near_duplicate_search_ref text not null,     -- …the search result on file
  canary_id text not null,                     -- the canary embedded in this draft
  recorded_at timestamptz not null default now()
);

-- Waves (REQ-EVAL-17): a pilot wave (dev set, machinery) and scored waves. agreement_floor is the pre-registered
-- IAA floor (REQ-EVAL-4). preregistration_hash is filled by P0.14 (pre-registration hashing is out of scope here).
create table benchmark_waves (
  id text primary key,
  name text not null unique,
  kind text not null default 'scored' check (kind in ('pilot','scored')),
  is_dev_set boolean not null default false,   -- a dev-set wave (the pilot) — never a headline source
  agreement_floor numeric not null,            -- the pre-registered IAA floor drafts must clear (REQ-EVAL-4)
  preregistration_hash text,                   -- P0.14 (pre-registration hashing) fills this
  created_at timestamptz not null default now()
);

-- The admitted manifest (REQ-EVAL-10 corpus manifest). Admission is gated by a trigger: a complete contamination
-- record is required, and a dev-set draft may only enter a dev-set wave (REQ-EVAL-1) — AC2.
create table benchmark_wave_drafts (
  wave_id text not null references benchmark_waves on delete cascade,
  draft_id text not null references benchmark_corpus_drafts on delete cascade,
  admitted_at timestamptz not null default now(),
  primary key (wave_id, draft_id)
);

create function assert_wave_draft_contamination() returns trigger language plpgsql as $$
declare
  rec benchmark_contamination_records%rowtype;
  draft_is_dev boolean;
  wave_is_dev boolean;
begin
  select is_dev_set into draft_is_dev from benchmark_corpus_drafts where id = new.draft_id;
  select is_dev_set into wave_is_dev from benchmark_waves where id = new.wave_id;
  -- REQ-EVAL-1: dev-set drafts never enter a scored (headline-eligible) wave.
  if draft_is_dev and not coalesce(wave_is_dev, false) then
    raise exception 'benchmark: dev-set draft % cannot be admitted to a non-dev-set wave % (REQ-EVAL-1)',
      new.draft_id, new.wave_id using errcode = 'check_violation';
  end if;
  -- REQ-EVAL-2: a draft with no / incomplete contamination evidence cannot be admitted (AC2).
  select * into rec from benchmark_contamination_records where draft_id = new.draft_id;
  if not found then
    raise exception 'benchmark: draft % has no contamination record — cannot admit to a wave (REQ-EVAL-2)',
      new.draft_id using errcode = 'check_violation';
  end if;
  if not (rec.created_after_cutoff or rec.never_published)
     or rec.author_attestation_ref = '' or rec.author_attestation_ref is null
     or not rec.near_duplicate_clean
     or rec.near_duplicate_search_ref = '' or rec.near_duplicate_search_ref is null
     or rec.canary_id = '' or rec.canary_id is null then
    raise exception 'benchmark: draft % contamination evidence incomplete — cannot admit to a wave (REQ-EVAL-2)',
      new.draft_id using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger t_wave_draft_contamination before insert on benchmark_wave_drafts
  for each row execute function assert_wave_draft_contamination();

-- Per-wave memorization probe, per draft × arm model (REQ-EVAL-2). A failure excludes the draft from THAT arm by
-- the pre-registered rule (the exclusion is applied on benchmark_arm_runs.excluded).
create table benchmark_memorization_probes (
  id text primary key,
  wave_id text not null references benchmark_waves on delete cascade,
  draft_id text not null references benchmark_corpus_drafts on delete cascade,
  arm text not null,
  model text not null,
  passed boolean not null,
  probed_at timestamptz not null default now(),
  unique (wave_id, draft_id, arm)
);

-- The gold set (REQ-EVAL-4): two independent professional editors annotate each draft in the §5.7 Finding schema
-- plus a `material` flag; a senior editor adjudicates the annotator rows into the gold set (role='adjudicator',
-- is_gold). IAA is computed per draft from the two annotators' rows (below-floor → flagged for re-adjudication).
create table benchmark_gold_annotations (
  id text primary key,
  draft_id text not null references benchmark_corpus_drafts on delete cascade,
  editor_id text not null,                     -- the annotator/adjudicator (distinct from the A6 arm editors)
  role text not null check (role in ('annotator','adjudicator')),
  finding jsonb not null,                      -- a §5.7 Finding
  material boolean not null,                   -- "a competent editor would require this before publication"
  is_gold boolean not null default false,      -- the adjudicated gold row
  adjudicated_from text[] not null default '{}', -- annotator finding ids this gold row reconciles
  annotated_at timestamptz not null default now(),
  check (role <> 'adjudicator' or is_gold)     -- adjudicator rows ARE the gold set
);
create index benchmark_gold_annotations_draft_idx on benchmark_gold_annotations (draft_id, role);

-- The run-ledger join (REQ-EVAL-20, REQ-EVAL-14): one arm's run on one draft in one wave. Rhema arms carry a
-- run_id that joins runs / usage_records for the §12.7 proxy-metered cost + wall-clock; offline arms (human
-- editors, Grammarly) carry no run_id. config_hash is recorded per run (REQ-EVAL-20). `excluded` records the
-- memorization-probe exclusion for this arm (REQ-EVAL-2).
create table benchmark_arm_runs (
  id text primary key,
  wave_id text not null references benchmark_waves on delete cascade,
  draft_id text not null references benchmark_corpus_drafts on delete cascade,
  arm text not null,
  run_id text,                                 -- joins runs / usage_records (Rhema arms); null for offline arms
  config_hash text not null,                   -- REQ-EVAL-20: config-hash recorded per run
  model text,
  latency_ms bigint,                           -- wall-clock per arm (REQ-EVAL-14)
  excluded boolean not null default false,     -- memorization-probe exclusion applied (REQ-EVAL-2)
  created_at timestamptz not null default now(),
  unique (wave_id, draft_id, arm)
);
create index benchmark_arm_runs_run_idx on benchmark_arm_runs (run_id);

-- The enclave access log (REQ-EVAL-3; AC1): every read of a corpus draft or a gold annotation leaves a row. The
-- annotation reference is kept even if the annotation row is later dropped (no FK on annotation_id) — the audit
-- trail must outlive the data it recorded access to.
create table benchmark_enclave_access_log (
  id text primary key,
  at timestamptz not null default now(),
  actor text not null,                         -- who/what read (a benchmark-runner principal)
  action text not null default 'read' check (action in ('read','list')),
  draft_id text references benchmark_corpus_drafts on delete set null,
  annotation_id text,                          -- a gold annotation read (kept if the row is dropped)
  wave_id text,                                -- the wave context, if any
  run_id text,                                 -- run-ledger join, if any
  purpose text
);
create index benchmark_enclave_access_log_draft_idx on benchmark_enclave_access_log (draft_id, at);

-- Provider no-training/retention verification (REQ-EVAL-3 machinery). "Drafts reach model APIs only inside
-- benchmark runs from accounts whose no-training/retention terms were verified IN WRITING (open item: not yet
-- verified for any provider; nothing is transmitted until it is)." The written verification itself is a human act;
-- this is the RECORD it produces + the seam the P0.14 transmission path consults (assertProviderTransmissible). A
-- verification can carry an expiry (terms lapse) and be revoked — either makes the provider non-transmissible again.
create table benchmark_provider_verifications (
  id text primary key,
  provider text not null,                      -- 'anthropic' | 'openai' | 'google' (the arm model's provider)
  terms_ref text not null,                     -- the signed no-training/retention terms on file
  verified_at timestamptz not null,
  expires_at timestamptz,                      -- the terms' validity horizon, if any
  revoked_at timestamptz,
  recorded_at timestamptz not null default now()
);
create index benchmark_provider_verifications_provider_idx on benchmark_provider_verifications (provider, verified_at);

-- Least-privilege grants — ONLY the dedicated benchmark role (REQ-ARCH-25). The product roles are intentionally
-- absent: the enclave is unreachable from a product/fixture path at the privilege layer as well as the code layer.
grant select, insert, update, delete on
  benchmark_corpus_drafts, benchmark_contamination_records, benchmark_waves, benchmark_wave_drafts,
  benchmark_memorization_probes, benchmark_gold_annotations, benchmark_arm_runs, benchmark_provider_verifications
  to rhema_benchmark;
-- The access log is append-only for the benchmark role (insert + read its own trail; never update/delete).
grant select, insert on benchmark_enclave_access_log to rhema_benchmark;

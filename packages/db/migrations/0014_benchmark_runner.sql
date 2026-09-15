-- 0014_benchmark_runner.sql — P0.14 (§18 evaluation program: the EXECUTION layer — arms as configs, blind
-- normalization, human matching/adjudication, LLM-judge hardening, pre-registration, wave runner + report;
-- REQ-EVAL-6..11, REQ-EVAL-15/16/17/18/20).
--
-- Additive on top of 0013's benchmark data layer. Every table below is benchmark-PROGRAM data with NO workspace
-- (never reached from a product path — REQ-EVAL-3), so — like 0013 — NOT RLS-forced. Access control is the same:
-- the dedicated non-owner `rhema_benchmark` role (created in 0013) is the ONLY role granted these tables; the
-- product roles are never granted them. Purely additive: an empty deploy and every existing table/row untouched.

-- The six arms as runnable configurations, FROZEN per wave (REQ-EVAL-6, REQ-EVAL-10). One row per wave × arm.
-- `config` carries the exact configuration the pre-registration freezes: model IDs, settings, prompts, and — for
-- the Rhema arms (A4/A5) — the engine build + `protocol@version` (REQ-EVAL-20). `config_hash` is the sha256 over
-- the canonical config; the pre-registration hash-commit is over the whole wave bundle (benchmark_preregistrations).
-- `model_family` is the arm model's provider family (null for offline arms A3/A6) — the cross-family judge gate
-- (C-d) reads it. `published` marks the A1 baseline prompt / A2 recipe as published-with-results (REQ-EVAL-18).
create table benchmark_arm_configs (
  wave_id text not null references benchmark_waves on delete cascade,
  arm text not null check (arm in ('A1','A2','A3','A4','A5','A6')),
  config jsonb not null,                       -- exact config: model IDs, settings, prompts, engine build, protocol@version
  config_hash text not null,                   -- sha256 over the canonical config (REQ-EVAL-20)
  model_family text,                           -- provider family (null for offline arms A3/A6) — the C-d cross-family gate
  engine_build text,                           -- Rhema arms (A4/A5): the pinned production engine build (REQ-EVAL-20/6)
  protocol_version text,                        -- Rhema arms: pinned protocol@version (REQ-EVAL-20/6)
  steelman_owner text,                          -- A1: the owner who re-steelmanned the prompt this wave (REQ-EVAL-6)
  published boolean not null default false,     -- A1 prompt / A2 recipe published-with-results (REQ-EVAL-18)
  created_at timestamptz not null default now(),
  primary key (wave_id, arm)
);

-- Normalized arm outputs (REQ-EVAL-7): every arm output is normalized into the common §5.7 Finding schema by an
-- extractor BLIND to arm, from a DE-BRANDED output, under the verbatim-substance rule (segment and locate, never
-- sharpen). One row per normalized finding; its id is what the human match records reference, so it must be stable.
-- `blind` records that the extractor did not see the arm identity; `extractor` names the extractor build (fidelity
-- audit provenance). Findings link to a benchmark_arm_runs row (the arm × draft × wave execution).
create table benchmark_normalized_findings (
  id text primary key,
  arm_run_id text not null references benchmark_arm_runs on delete cascade,
  finding jsonb not null,                       -- a §5.7 Finding (normalized, de-branded, verbatim-substance)
  extractor text not null,                      -- the blind extractor build that produced it
  blind boolean not null default true,          -- the extractor was blind to arm (REQ-EVAL-7)
  created_at timestamptz not null default now()
);
create index benchmark_normalized_findings_run_idx on benchmark_normalized_findings (arm_run_id);

-- Extraction-fidelity audit (REQ-EVAL-7): "extraction fidelity is audited on a sample" (10%). A sampled normalized
-- finding is checked by a human against the raw arm output for the verbatim-substance rule; `verdict` records
-- whether the normalization was faithful, sharpened (a vague comment made specific — a violation), or dropped.
create table benchmark_extraction_audits (
  id text primary key,
  wave_id text not null references benchmark_waves on delete cascade,
  normalized_finding_id text not null references benchmark_normalized_findings on delete cascade,
  auditor text not null,
  verdict text not null check (verdict in ('faithful','sharpened','dropped')),
  note text,
  audited_at timestamptz not null default now()
);

-- Human match records (REQ-EVAL-8): trained humans BLIND to arm decide whether an arm finding matches a gold
-- finding, or adjudicate an unmatched arm finding as `valid_but_missed_by_gold` (novelty) or `invalid` (false
-- positive). Automated matchers may only SUGGEST (`suggested_verdict`) — the binding decision is `verdict`, made by
-- a human (`decided_by`). Senior adjudication of a novelty is recorded with `novelty_confirmed`. `blind_to_arm`
-- asserts the matcher did not see the arm identity. This is the persistence of P0.13's `MatchRecord`; the recall/FP
-- scorer (P0.13) consumes rows where `verdict is not null`.
create table benchmark_match_records (
  id text primary key,
  wave_id text not null references benchmark_waves on delete cascade,
  draft_id text not null references benchmark_corpus_drafts on delete cascade,
  arm text not null,
  arm_finding_id text not null references benchmark_normalized_findings on delete cascade,
  gold_finding_id text,                         -- present iff verdict = 'matched'
  suggested_verdict text check (suggested_verdict in ('matched','valid_but_missed_by_gold','invalid')),
  suggested_by text,                            -- the automated matcher build that suggested (suggest-only)
  verdict text check (verdict in ('matched','valid_but_missed_by_gold','invalid')),  -- the human's binding call
  decided_by text,                              -- the human who decided (null until decided)
  blind_to_arm boolean not null default true,   -- the human matcher was blind to arm (REQ-EVAL-8)
  novelty_confirmed boolean,                    -- senior adjudication confirmed a valid_but_missed_by_gold as novel
  adjudicator text,                             -- the senior adjudicator, if adjudicated
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (verdict is distinct from 'matched' or gold_finding_id is not null),  -- a match names its gold finding
  unique (arm_finding_id)                        -- one binding record per arm finding
);
create index benchmark_match_records_wave_idx on benchmark_match_records (wave_id, draft_id, arm);

-- Post-revision pairwise preference (REQ-EVAL-8, REQ-EVAL-11): blinded editors prefer one arm's revised manuscript
-- over another's. Judged in BOTH orders (position A/B swapped) — a disagreement across orders is scored a tie
-- (C-a). `judge` is a human editor (headline guard rail — REQ-EVAL-15) or an LLM judge (secondary only — REQ-EVAL-9).
create table benchmark_pairwise_preferences (
  id text primary key,
  wave_id text not null references benchmark_waves on delete cascade,
  draft_id text not null references benchmark_corpus_drafts on delete cascade,
  arm_a text not null,
  arm_b text not null,
  presentation text not null check (presentation in ('ab','ba')),  -- which arm was shown first
  preferred text not null check (preferred in ('a','b','tie')),
  judge_kind text not null check (judge_kind in ('human','llm')),
  judge_id text not null,                        -- the human editor id or the LLM judge id
  created_at timestamptz not null default now()
);
create index benchmark_pairwise_preferences_pair_idx on benchmark_pairwise_preferences (wave_id, draft_id, arm_a, arm_b);

-- Per-wave LLM-judge calibration (REQ-EVAL-9): each wave, every LLM judge is calibrated against the human-adjudicated
-- subset and DISQUALIFIED below weighted κ 0.6 (its metrics are withheld from the report — AC3). `family` must differ
-- from every arm the judge scores (C-d — enforced in code + reported here). `position_consistency` is the fraction of
-- pairwise judgments that agreed across presentation orders (C-a, reported).
create table benchmark_judge_calibrations (
  id text primary key,
  wave_id text not null references benchmark_waves on delete cascade,
  judge_id text not null,
  model text not null,
  family text not null,                          -- the judge model's provider family (must differ from every arm — C-d)
  weighted_kappa numeric not null,               -- vs the human-adjudicated subset (REQ-EVAL-9)
  kappa_floor numeric not null default 0.6,      -- the pre-registered disqualification floor
  disqualified boolean not null,                 -- weighted_kappa < kappa_floor
  position_consistency numeric,                  -- fraction of pairwise judgments consistent across orders (C-a)
  calibrated_at timestamptz not null default now(),
  unique (wave_id, judge_id)
);

-- Per-unit LLM-judge scores on SECONDARY metrics (REQ-EVAL-9): "scoring is per-finding-unit with length reported."
-- A disqualified judge's scores are withheld from the report (the report guard drops them — AC3).
create table benchmark_judge_scores (
  id text primary key,
  wave_id text not null references benchmark_waves on delete cascade,
  draft_id text not null references benchmark_corpus_drafts on delete cascade,
  arm text not null,
  judge_id text not null,
  metric text not null,                          -- a SECONDARY metric key (never a headline metric — REQ-EVAL-11)
  score numeric not null,
  length_units int,                              -- the unit length reported alongside the score (REQ-EVAL-9)
  created_at timestamptz not null default now()
);
create index benchmark_judge_scores_idx on benchmark_judge_scores (wave_id, judge_id, metric);

-- Pre-registration (REQ-EVAL-10): before a scored wave, the arms + configs + corpus manifest + metric definitions +
-- matching/exclusion rules + statistical analysis + lift criterion are FROZEN and hash-committed. A scored-wave
-- report refuses to render without a matching pre-registration (AC4). The dev set (pilot) is exempt. `bundle` is the
-- exact frozen object the hash is over; `hash` is also mirrored onto benchmark_waves.preregistration_hash.
create table benchmark_preregistrations (
  wave_id text primary key references benchmark_waves on delete cascade,
  hash text not null,                            -- sha256 over the canonical frozen bundle
  bundle jsonb not null,                         -- arms, configs, corpus manifest, metrics, matching/exclusion rules, analysis, criterion
  public_registration_ref text,                  -- the public registration pointer (waves intended for publication)
  frozen_at timestamptz not null default now()
);

-- Deviation log (REQ-EVAL-10): any post-freeze drift from the pre-registered configuration is logged and surfaced in
-- the wave report — the freeze is not a lock, it is an accountability record.
create table benchmark_deviations (
  id text primary key,
  wave_id text not null references benchmark_waves on delete cascade,
  kind text not null,                            -- e.g. 'config_drift', 'arm_excluded', 'metric_changed'
  detail text not null,
  logged_at timestamptz not null default now()
);
create index benchmark_deviations_wave_idx on benchmark_deviations (wave_id, logged_at);

-- The rendered wave report (REQ-EVAL-11, REQ-EVAL-18): the twelve metrics, the REQ-EVAL-15 LIFT readout, stability
-- bands, split into `public_report` (methodology, baseline prompt, aggregate results per arm with bands, consented
-- examples) and `private_report` (corpus texts, gold annotations, per-draft results, Rhema protocol content, run
-- prompts). The report generator enforces the split (REQ-EVAL-18) and the headline-no-pairwise rule (AC5).
create table benchmark_wave_reports (
  wave_id text primary key references benchmark_waves on delete cascade,
  public_report jsonb not null,
  private_report jsonb not null,
  lift jsonb not null,                           -- the REQ-EVAL-15 LIFT readout
  generated_at timestamptz not null default now()
);

-- The consequence log (REQ-EVAL-16, go/no-go): each scored wave's outcome and the pre-committed consequence it
-- triggers (superiority marketing on/off, Full-board premium re-justification, R&D pivot/freeze, disposition). An
-- append-only accountability trail — the program forbids selling rigor the measurement contradicts.
create table benchmark_consequence_log (
  id text primary key,
  wave_id text not null references benchmark_waves on delete cascade,
  outcome text not null check (outcome in ('pass','miss','two_consecutive_misses','a1_beats_rhema')),
  disposition text not null,                     -- the pre-committed consequence (REQ-EVAL-16)
  note text,
  logged_at timestamptz not null default now()
);
create index benchmark_consequence_log_wave_idx on benchmark_consequence_log (wave_id, logged_at);

-- Least-privilege grants — ONLY the dedicated benchmark role (REQ-ARCH-25), matching 0013. The product roles are
-- intentionally absent: the execution layer is as unreachable from a product path as the enclave it scores over.
grant select, insert, update, delete on
  benchmark_arm_configs, benchmark_normalized_findings, benchmark_extraction_audits, benchmark_match_records,
  benchmark_pairwise_preferences, benchmark_judge_calibrations, benchmark_judge_scores,
  benchmark_preregistrations, benchmark_deviations, benchmark_wave_reports, benchmark_consequence_log
  to rhema_benchmark;

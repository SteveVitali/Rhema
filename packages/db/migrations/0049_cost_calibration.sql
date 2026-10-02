-- 0049_cost_calibration.sql — ECON.1 (REQ-SPEC-32(a) "charge what we meter"; REQ-BILL-7 "calibrate
-- before charging"; ADR-032).
--
-- The durable calibration store. Until now the instrumented estimators lived in a PROCESS-LOCAL map
-- (`INSTRUMENTED_OVERRIDES` in @rhema/protocols) — a worker restart forgot every folded run and the
-- API never saw them at all. ECON.1 makes calibration durable with the SEC.1 posture: the user role
-- SELECTs (the API serves cost cards + the estimator cells override-first), only the system pool
-- writes (no insert/update grants — `postgres` is the owner and BYPASSRLS).
--
--   cost_observations      — one row per admissible proxy-metered leg (the harvest's raw evidence;
--                            tenant-scoped, RLS-forced like the `runs`/`usage_records` it derives from)
--   cost_card_cells        — the derived workflow × rigor × tier × size-band × outcome cards
--                            (platform aggregates — no tenant key, NON_TENANT)
--   cap_calibration_reports — per-bucket cap-refit evidence (p95 ratio, adopted multiplier, in-sample
--                            cap-reach %, the ≤10% target the report asserts)
--   estimator_cells        — the folded EstimatorSpec per workflow; the API/worker boot-loads these
--                            into the override map (the durable replacement for INSTRUMENTED_OVERRIDES)

-- ---- raw evidence: one row per admissible metered run leg -------------------------------------------
create table cost_observations (
  id text primary key,
  run_id text not null unique,
  workspace_id text not null,            -- provenance; RLS key (the row derives from a tenant's run)
  workflow text not null,
  rigor text not null,
  model_tier text not null,
  size_band text not null,               -- 'xs'|'s'|'m'|'l'|'unit' — see sizeBandFor (cost-calibration.ts)
  outcome text not null check (outcome in ('completed', 'cancelled', 'failed', 'platform_fault')),
  proxy_credits int not null,            -- Σ usage_records(source='proxy').credits — the meter of record
  proxy_list_cost_usd numeric not null,  -- Σ proxy list_cost_usd — the cost card's dollar figure
  committed_credits int not null,        -- net committed debits − refunds (the divergence datum)
  estimate_credits int,                  -- the run's frozen estimate (cap-ratio denominator)
  words int,
  claims int,
  phases int,                            -- active phase count the run executed (the churn term's input)
  admissible boolean not null,           -- estimator/cap-fit admissibility: completed + verified + paid
  inadmissible_reason text,              -- 'trial' | 'unverified' | 'not_completed' | 'no_proxy_rows'
  source text not null,                  -- 'production' | 'stage_b' | 'synthetic'
  measured_at timestamptz not null,      -- the run's ended_at (evidence windowing)
  created_at timestamptz not null default now()
);
alter table cost_observations enable row level security;
alter table cost_observations force row level security;
create policy tenant_isolation on cost_observations
  using (workspace_id = current_tenant()) with check (workspace_id = current_tenant());
create index cost_observations_cell_idx on cost_observations (workflow, rigor, model_tier, size_band, outcome);
create index cost_observations_measured_idx on cost_observations (measured_at desc);
grant select on cost_observations to rhema_app;

-- ---- derived cards: workflow × rigor × tier × size-band × outcome ------------------------------------
create table cost_card_cells (
  workflow text not null,
  rigor text not null,
  model_tier text not null,
  size_band text not null,
  outcome text not null check (outcome in ('completed', 'cancelled', 'failed', 'platform_fault')),
  n int not null,                        -- observations behind the cell
  p50_credits numeric,
  p95_credits numeric,
  p50_usd numeric,
  p95_usd numeric,
  fit_version text not null,             -- the recompute that produced it (provenance / invalidation)
  computed_at timestamptz not null default now(),
  primary key (workflow, rigor, model_tier, size_band, outcome)
);
grant select on cost_card_cells to rhema_app;

-- ---- per-bucket cap-refit evidence (REQ-BILL-7): p95 metered/estimate ratio → adopted multiplier -----
create table cap_calibration_reports (
  id text primary key,
  workflow text not null,
  rigor text not null,
  model_tier text not null,
  size_band text not null,
  sample_runs int not null,
  p95_ratio numeric,                     -- p95 of (proxy_metered / estimate) across the bucket
  cap_multiplier numeric not null check (cap_multiplier between 1.0 and 2.0), -- floor 1.25, breaker 2×
  cap_reach_pct numeric,                 -- % of in-sample replays that reach the cap (target ≤ 10%)
  adopted boolean not null default false,-- whether estimator_config consumed this cell (min-sample gate)
  note text,
  computed_at timestamptz not null default now()
);
grant select on cap_calibration_reports to rhema_app;

-- ---- the durable estimator cells (the INSTRUMENTED_OVERRIDES replacement) ----------------------------
create table estimator_cells (
  workflow text primary key,
  spec jsonb not null,                   -- the folded EstimatorSpec (`estimateCredits` reads it verbatim)
  runs_behind text[] not null default '{}',
  measured_at timestamptz not null,
  updated_at timestamptz not null default now()
);
grant select on estimator_cells to rhema_app;

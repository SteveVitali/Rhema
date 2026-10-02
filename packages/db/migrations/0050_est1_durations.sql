-- 0050_est1_durations.sql — EST.1 (REQ-SPEC-32(b) "one estimate everywhere"; the duration half of the
-- calibrated cost card; ADR-036).
--
-- ECON.1's cost cards carried credits + USD percentiles but no DURATION — so the sheet's
-- credits÷25-derived "time band" and the run card's flat 5-min/phase prior were two independent
-- guesses (PR-E3's "25–45 min" vs "~30–35 min" disagreement). These columns make duration a
-- calibrated fact: `cost_observations.duration_ms` is the run's Σ step durations (the steps table's
-- started_at→ended_at — gate waits are NOT execution time), and `cost_card_cells` gains the
-- p10/p50/p95 duration percentiles the surfaces render as "~low–high min".
--
-- Purely additive: NULL columns only — pre-0050 observations/cells simply lack durations and the
-- surfaces fall back to the shared per-phase prior until a harvest backfills them.

alter table cost_observations
  add column duration_ms bigint;           -- Σ step (ended_at − started_at); NULL when no steps ran

alter table cost_card_cells
  add column p10_ms bigint,
  add column p50_ms bigint,
  add column p95_ms bigint;

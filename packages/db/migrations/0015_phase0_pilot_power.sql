-- 0015 — Phase-0 pilot-wave power record (P0.15; REQ-EVAL-5, §17 exit criterion).
-- The pilot wave runs on the dev set to estimate σ_d (the sd of the paired per-draft recall difference) and fix the
-- scored waves' sample size n. These columns record that estimate on the wave so a scored wave can trace which pilot
-- fixed its n. Additive + nullable — a wave without a recorded pilot estimate reads NULL (back-compat).
alter table benchmark_waves
  add column pilot_sigma_d numeric,             -- σ_d: the estimated paired-difference sd (REQ-EVAL-5)
  add column pilot_fixed_n int,                 -- n fixed from σ_d at ≥80% power for a 10-pt difference, floor 24
  add column pilot_recorded_at timestamptz;     -- when the pilot power estimate was recorded

-- benchmark_waves is already granted to rhema_benchmark only (0013); added columns inherit the table grant.

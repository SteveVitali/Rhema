# ADR-032: Durable calibration store — schema, size bands, admissibility, derived cells

- **Status:** Accepted
- **Date:** 2026-10-02
- **Ticket:** ECON.1
- **Requirement ids:** REQ-BILL-7 (primary); REQ-SPEC-32(a)(c); REQ-SPEC-24(5); REQ-SPEC-29; REQ-SPEC-30
- **Spec:** §14.4 (REQ-BILL-7 row), §16.3 #1 (instrumented cost runs), §12.7 (meter of record)
- **Follow-up to:** ADR-005 (estimator fold) — this is the durability layer its caveat asked for

## Context

Instrumented estimator folds lived in `INSTRUMENTED_OVERRIDES` — a process-local map in
`@rhema/protocols` a worker restart forgot and the API never saw (D-P0.15k-1's caveat). There was
no place to put measured cost evidence, no per-bucket cap fit, and no read API for EST.1 / RPT.1 /
ACT.1 / ECON.2. ECON.1 owns the store (ticket deliverable 5) plus three owned decisions: the
schema, the size bands + admissibility, and whether a `derived` cell may drive a cap or a surface.

## Decision

**Schema** (migration `0049_cost_calibration.sql`, additive, SEC.1 grants — user role SELECTs,
system pool writes):

- `cost_observations` — one row per metered run leg, tenant-scoped (RLS `tenant_isolation` on
  `workspace_id`, forced), carrying proxy credits + proxy list-$ (meter of record only), net
  committed debits, estimate, words/claims/phases, the admissibility verdict + reason, provenance
  (`production` | `stage_b` | `synthetic`), and `measured_at` = the run's `ended_at`.
- `cost_card_cells` — the derived workflow × rigor × tier × size-band × **outcome** card
  (n, p50/p95 credits, p50/p95 list-$). Platform aggregates; no tenant key.
- `cap_calibration_reports` — the per-bucket cap-refit evidence: n, p95 metered/estimate, the
  adopted multiplier, in-sample cap-reach %, `adopted`, a human note.
- `estimator_cells` — the folded `EstimatorSpec` per workflow (JSONB verbatim); API and worker
  boot-load it into the override map (`loadEstimatorCells` → `setInstrumentedOverride`), and the
  worker's `recalibrate` fold writes back (`persistEstimatorCell`).

**Size bands** — `xs < 1,000` / `s < 4,000` / `m < 12,000` / `l ≥ 12,000` words; claim-priced
inputs without a word count band on claims (≤4 xs, ≤16 s, ≤48 m, else l); unit-priced work
(chat_turn, figure, research_burst) is `unit`. Bands follow the spend plan's leg sizes
(~300/~1,000/~2,500 words all land xs/s) — coarse enough that real cells can fill.

**Outcome axis** — `completed | cancelled | failed | platform_fault`. Cost cards count every
observation (a cancelled run's metered burn is real cost evidence); only `admissible` rows drive
the cap refit.

**Admissibility** (cap-fit input = `admissible` observations only):

- `completed` (cancelled/failed/platform-fault runs stay evidence, never fit input);
- not a trial entitlement (`entitlement_id null`);
- proxy-metered (`proxy_credits > 0`);
- not an Unverified delivery (RES.2 — platform fault);
- `ended_at ≥ presetCutover` — the §6.5 conformance deploy (`CALIBRATION_PRESET_CUTOVER`); a
  pre-fix run is recorded but can never fit a cap (`pre_preset_fix`), because its preset derivation
  was the defect ECON.1 repairs;
- research-bearing workflows (manifest has a research-class phase) additionally need
  `ended_at ≥ researchAfter` — RES.1's research-restore deploy (`CALIBRATION_RESEARCH_AFTER`);
  zero-coverage legs are `pre_res1_research`.

Both cutovers are deploy-stamped config (`apps/worker` env → `billing.estimator-refit`); unset,
the predicate does not fire — a stage without them harvests honestly ungated evidence.

**Refit rule (REQ-BILL-7, per bucket over the trailing 30 days):** with `n ≥ 5` admissible
observations the bucket holds **1.5×** while p95 metered/estimate ≥ 1.3 and drops to **1.35×** once
p95 < 1.3; every adopted value clamps to [1.25, 1.5] — REQ-BILL-7's "never below 1.25" floor and the
spec ceiling. The 2× breaker is preserved as a *runtime* override (`circuit-breaker.ts`,
REQ-SPEC-24(5)) — the refit never writes it. Below the min sample the bucket reports
`insufficient` and adopts nothing; `capFor` then falls through to the workflow's latest adopted
report, then to the global `estimator_config` singleton. Each report records the in-sample cap
reach at the adopted multiplier (the ≤10% target the calibration is judged against).

**Derived cells.** A cell with provenance `derived` (re-rated from another bucket's token mix —
e.g. Balanced priced from a Base measurement at the tier rate) may drive an *estimate* surface but
**never a cap**: `cap_calibration_reports.adopted` requires real `cost_observations` rows in the
bucket. This keeps every user-charged cap on measured ground truth; derived cells are pricing
honesty, not charge evidence.

**What rides the same deploy:** the store + APIs + the `debitMode` flag (committed) ship together —
ADR-014's sequencing guard (caps ready before the flip is ever armed).

## Consequences

- `INSTRUMENTED_OVERRIDES` is a cache, not the truth; a restart reloads from `estimator_cells`.
- The weekly `billing.estimator-refit` job harvests → recomputes → refits in one pass; Stage B's
  CLI legs write `source='stage_b'` observations through the same path.
- Downstream readers (`costCard`, `capFor`) are plain SELECTs on user-role-readable tables —
  invariant #13 holds (system-pool writes only).
- Nothing in the store keys user content — aggregates and ids only (invariant #10).

## Alternatives considered

- **Extend `estimator_fits`/`estimator_config`** (P1.16's singleton fit). The singleton carries one
  global multiplier and no per-run evidence; bolting buckets on it mixes grain. Rejected — the
  global refit still governs buckets with no cells.
- **Adopt the raw p95 ratio as the multiplier.** More precise, but not REQ-BILL-7's rule (the spec
  names discrete levels 1.5 → 1.35, floor 1.25). Rejected.
- **Let derived cells drive caps.** Cheaper coverage, but a cap is a user-charge bound — unmeasured
  caps reproduce the exact class of incident this ticket exists to end. Rejected.
- **Per-tenant cards.** Premature; tenant-shapes live in observations already if ever needed.

## Revisit trigger

- The weekly refit reports `insufficient` on a cell that drives a paid surface for 2 consecutive
  weeks — lower `CAP_REFIT_MIN_SAMPLE` or widen bands.
- In-sample cap reach > 10% on an adopted bucket — the two-level rule is too coarse for that cell.
- `cost_observations` grows past ~100k rows — partition by `measured_at`.

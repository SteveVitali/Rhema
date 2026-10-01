# PRB.25 — Synthesis-phase churn: the last under-modeled estimator term

> **Inserted 2026-09-23** (manifest § Plan extensions). Defect-repair ticket, NOT P1 scope —
> G3 stays parked. PRB.24's transcript bound landed and a `review` DELIVERED on prod for the
> first time (`01M36663…`, committed 586, metered 720) — but only because the operator raised
> the cap 783→1100 at creation. The residual: **synthesis-phase (`letter`) churn is still
> under-modeled** — the phase metered ~241cr vs 120 committed, and the derived cap (783) would
> have died again at exactly 783. Goal: make the derived cap honestly cover a full run so no
> operator raise is needed.

- **Sequence:** inserted — runs **after `28o_PRB.24`, before `29_P1.01`**. Sorts as `28p`.
- **Phase:** LV — prod launch (defect closeout).
- **base_branch:** current chainTip at dispatch (`stevevitali/prb-24-intra-phase-transcript`).
- **Depends on:** PRB.24 (`autoCompactWindow`, `research_fanout`, the churn terms), the
  estimator, the letter/synthesis phase skill.
- **Run:** `implement-spec spec=docs/tickets/28p_PRB.25__synthesis-phase-churn-term.md`
- **Gate status:** Stage A only at dispatch — Stage B live verify held for explicit operator
  go (day's committed spend ≈ $25.7).
- **Live stage:** Stage A is code + measurement at $0; Stage B is ONE capped prod run.

## Evidence (prod `rhema` DB, 2026-09-23)
- `01M36663…` (delivered, cap 1100): metered 720; committed 586. `letter` committed 120 but
  metered ≈241 (est: spent climbed 479→720 during letter). The committed-vs-metered delta
  (~134cr) and letter's own churn are the residual.
- `01M364236…` (cap 783): died `cap_reached` at exactly 783 in `letter` — the derived cap is
  ~100–300cr short of a delivered run's metered total.
- Verified-bound phases now commit close to modeled values (verification 233 vs ~350 priced).

## Goal
A `review/quick` run on the 701-word draft **DELIVERS within its server-derived cap** — no
operator raise. Either synthesis-phase churn gets its own modeled term (and/or the
committed-vs-metered delta gets modeled), or the synthesis phase gets a context bound like
verification's.

## In scope — Stage A (code + tests, PR-able, $0)
1. **Measure letter's request profile** — from `usage_records` rows of `01M36663…` /
   `01M364236…` (step_id `step:letter` / unattributed during that window): request count,
   per-request cache-read, fetches. Does the synthesis phase accumulate transcript the same
   way (it is likely not an `allowsSubagents` phase, so `research_fanout` never applied)?
   Per-request breakdown in the run ledger BEFORE fixing.
2. **Bound or price it** (evidence decides):
   a. if the phase has its own subagent/tool loop → extend the bound (fanout contract or
      `autoCompactWindow` already applies session-wide — check whether it fired);
   b. if the phase is a single long generation → model a `SYNTHESIS_CHURN_CREDITS` term
      (and/or a `METERED_VS_COMMITTED` multiplier term) so the estimate covers the real
      metered total (~720 → derived cap needs ≥ ~800–900 headroom);
   c. document the ruling in the run ledger.
3. Deterministic tests + `turbo build lint typecheck` + `pnpm test` + memory validator green.

## In scope — Stage B (live on prod, operator-gated, ≤ $8 hard ceiling)
4. `pulumi up` (preview first). ONE live `review/quick` on draft `01M35KC9K6N6R2P6EJD19T30E9`
   at the **derived cap only** — no raise. Success = `delivered` + `spent ≤ derived cap`.
   On `cap_reached`: STOP, record numbers, no retry.

## Acceptance
- A delivered `review` within the server-derived cap (Stage B), OR a documented finding that
  the honest floor exceeds what quick's sheet tier should advertise — recorded for G3.

## Out of scope
- P1.* (G3-parked), merges (OPERATOR), re-verifying already-bounded phases, multi-run live
  verification, pricing-page/copy changes (product ruling, not code).

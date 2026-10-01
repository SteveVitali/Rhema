# PRB.24 — Intra-phase transcript accumulation: the residual context-churn driver

> **Inserted 2026-09-23** (manifest § Plan extensions). Defect-repair ticket, NOT P1 scope —
> G3 stays parked. PRB.23 cut the per-request envelope ~45% and priced churn honestly
> (50cr/phase term), but its Stage B verify run still died `cap_reached`: the residual is
> **per-phase transcript accumulation**. Phases already get fresh `query()` sessions
> (`AgentSdkEngine.startPhase` forwards no `resume`); the growth happens *inside* a phase —
> `verification`'s editor subagent loop makes ~40 requests in one session, each re-reading
> the ever-growing transcript (~60K cache-read/request avg, 2 compactions = extra burn).
> Envelope shrinkage cannot bound transcript growth; only context segmentation or an honest
> cost ruling can.

- **Sequence:** inserted — runs **after `28n_PRB.23`, before `29_P1.01`**. Sorts as `28o`.
- **Phase:** LV — prod launch (defect closeout).
- **base_branch:** current chainTip at dispatch (`stevevitali/prb-23-context-churn-estimate`).
- **Depends on:** PRB.23 (envelope cut + churn term), the pod's per-phase session lifecycle,
  the verification skill's subagent loop, the estimator.
- **Run:** `implement-spec spec=docs/tickets/28o_PRB.24__intra-phase-transcript-accumulation.md`
- **Gate status:** Stage A only at dispatch — Stage B live verify held for explicit operator
  go (day's committed spend already ≈ $15).
- **Live stage:** Stage A is code + measurement at $0; Stage B is ONE capped prod run.

## Evidence (prod `rhema` DB, 2026-09-23)
- `01M35Y9BH…` (quick, derived est 288 / cap 432, died `cap_reached` at 506 in
  `verification`): `usage_records` 44 rows ≈ **5.03M cache-read**; intake 2 reqs ≈ 1.58M,
  craft 2 reqs ≈ 1.08M, editor-loop 40 reqs ≈ 2.4M (~60K/req, growing); 13 fetches /
  3 searches; 2 `context.compacted` events. Committed debits only 159 (intake 96 + craft 63).
- Prior runs (`01M35Q8M…`, `01M35KCFA…`, `01M35CEQ…`) same shape: a mid-run phase's
  uncommitted burn (≈250–2100cr) is what kills, never the committed phase totals.
- The estimator models content size + a flat 50cr/phase churn term; verification's actual
  churn measured ≈ 347cr — a ~7× miss on the phase that matters.

## Goal
Either a `review` phase's subagent work runs in **bounded context** (per-claim or per-task
isolated sessions whose transcripts cannot accumulate past a fixed envelope), OR the
churn term is calibrated to measured reality per phase — and if the honest price prices the
workflow out of the advertised tiers, that finding lands in the ledger for the G3 read.

## In scope — Stage A (code + tests, PR-able, $0)
1. **Locate the accumulation point precisely** — instrument or fixture-drive the
   verification phase's editor loop: does each subagent request carry the full accumulated
   transcript? Is the growth linear in requests? Per-request context breakdown in the run
   ledger BEFORE the fix.
2. **Bound the transcript** (pick from evidence, document the ruling):
   a. per-claim/per-task isolated subagent sessions — a fresh `query()` per claim or
      bounded batch, so no request reads more than the seed context;
   b. intra-phase context reset/checkpointing (summarize-and-restart at a token threshold);
   c. if the SDK offers session forking/segmented resume, use it; otherwise structure the
      skill's loop as N bounded sessions rather than one long one.
3. **Recalibrate the churn term** — replace the provisional flat `50` with measured
   per-phase churn (verification ≈ 347 this run; intake/craft ≈ 100–140) OR, if the bound
   lands, re-derive from the new envelope. `foldInstrumentedRun` exists for this.
4. Deterministic tests for the segmentation/model; `turbo build lint typecheck` +
   `pnpm test` green; `check-build-memory.sh .` clean.

## In scope — Stage B (live on prod, operator-gated, ≤ $5 hard ceiling)
5. `pulumi up` (preview first). ONE live `review/quick` on draft `01M35KC9K6N6R2P6EJD19T30E9`.
   If it dies `cap_reached` again: STOP, report numbers, no retry.
6. Assert `state=delivered`, `spent ≤ cap`, per-request cache-read materially below ~60K
   for the editor loop. Close **D-PRB.21-1** on success; sharpen on failure.

## Acceptance
- Stage A lands a bounded-context mechanism (or a measured recalibration proving the bound
  is impossible) + the per-request context breakdown in the run ledger.
- Stage B, when run: a delivered `review` within cap, OR a documented failure whose numbers
  feed the G3 cost-structure ruling.

## Out of scope
- P1.* (G3-parked), merges (OPERATOR), further envelope/tool-schema work (PRB.23 landed),
  research-side tuning (PRB.22's bound stands), multi-run live verification.

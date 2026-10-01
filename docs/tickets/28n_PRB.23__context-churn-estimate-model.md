# PRB.23 — Context-churn burn: the estimator's missing fixed-overhead term

> **Inserted 2026-09-22** (manifest § Plan extensions). Defect-repair ticket, NOT P1 scope —
> G3 stays parked. PRB.22 bound the *research* leg of D-PRB.21-1 and proved it wasn't the
> bottleneck: a run with **zero** fetches/searches still died `cap_reached`. The residual is
> **baseline context churn** — every request re-reads ~66K–1M tokens (protocol prompts +
> accumulated turns), so a 701-word doc burns ~5.1M cache-read tokens / ~400–850cr. The
> estimator models content size, not request-count × context-size; no `review` run has ever
> delivered on prod within a derived cap.

- **Sequence:** inserted — runs **after `28m_PRB.22`, before `29_P1.01`**. Sorts as `28n`.
- **Phase:** LV — prod launch (defect closeout).
- **base_branch:** current chainTip at dispatch (`stevevitali/prb-22-verification-burn-cap`).
- **Depends on:** PRB.22 (the bound + addend it landed), the orchestrator phase loop, the
  pod/harness context management, the estimator.
- **Run:** `implement-spec spec=docs/tickets/28n_PRB.23__context-churn-estimate-model.md`
- **Gate status:** Stage B is ONE bounded live verify (≤ $5) — same pattern as PRB.22.
- **Live stage:** Stage A is the real work; Stage B is a single capped prod run.

## Evidence (prod `rhema` DB, 2026-09-22)
- `01M35Q8M…` (quick, cap 207, died 211): 34 requests; `step:intake` top-level 2 reqs /
  2.0M cache-read (~1M/req); `editor` subagent 30 reqs / 1.97M (~66K/req); `step:craft`
  2 reqs / 1.2M. **Zero fetches, zero searches.** The doc is ~1K tokens.
- `01M35KCFA…` (quick, cap 400, died 466): same shape + 128 fetches/13 searches.
- `01M2TZ8E…` (fact_check — the only "completed" comparable): 41 reqs / 5.8M cache-read /
  ~430cr usage. **Correction to the earlier ledger note:** it is not a `review` run.
- Committed debits per finished phase stay ~60–120cr; burn inside a phase is what kills.

## Goal
A `review/quick` run on the 701-word draft **DELIVERS within its derived cap**. That means
either the per-request context floor drops enough that ~30–40 requests fit a few-hundred-
credit cap, or the estimate honestly prices the floor (and the sheet tells the truth).

## In scope — Stage A (code + tests, PR-able)
1. **Find the context driver first** — inspect the harness/pod request construction: what
   occupies ~66K (subagent) and ~1M (top-level) tokens per call? Candidates: protocol
   prompt corpus loaded whole, per-turn resend of full transcript, fetched-page ingress
   (bounded since PRB.22 but baseline existed before), per-claim subagent calls inheriting
   parent context. Produce a per-request context budget breakdown in the run ledger BEFORE
   choosing the fix.
2. **Shrink the floor** (pick from evidence, document the ruling):
   a. per-phase fresh context / phase-scoped compaction so verification's ~30 subagent
      calls don't inherit an ever-growing transcript;
   b. per-claim subagent isolation with a fixed small context envelope;
   c. prompt-corpus slimming / lazy skill loading if the protocol text dominates.
3. **Model the residual honestly** — the estimate gains a per-phase fixed-cost term
   (phases × expected requests × expected context), so a derived cap can actually cover a
   completed run. If the honest floor prices quick out of existence on small docs, the
   sheet must say so (remove/gray the tier or show the real floor) — a derived cap that
   cannot complete is the defect, not the price.
4. Deterministic tests for whatever bound/model lands; `turbo build lint typecheck` +
   `pnpm test` green.

## In scope — Stage B (live on prod, ≤ $5 hard ceiling)
5. `pulumi up` (preview first). ONE live `review/quick` on draft `01M35KC9K6N6R2P6EJD19T30E9`
   via minted session — same api path as PRB.22. If the derived cap still can't plausibly
   cover the floor, ONE operator-style cap+hold raise ≤ 500 is permitted (recorded). If the
   run dies `cap_reached` again: STOP, report numbers, do not retry.
6. Assert `state=delivered`, `spent ≤ cap`, debits ≈ estimate, per-request cache-read
   materially below the ~151K baseline. Close **D-PRB.21-1** on success; sharpen it again on
   failure. Run ledger + BUILD_INDEX + PHASE LOG; `check-build-memory.sh .` clean.

## Acceptance
- A delivered `review` on prod within its cap, OR a documented operator ruling that the
  real per-run cost floor stands and the sheet/pricing model is amended to say so.
- The context-driver breakdown is in the run ledger regardless of outcome.

## Out of scope
- P1.* (G3-parked), merges (OPERATOR), research-side tuning (PRB.22's bound stands),
  multi-run live verification (one run, one budget).

# PRB.22 — Review completion defect: verification research burn vs the cap model

> **Inserted 2026-09-22** (manifest § Plan extensions). Defect-repair ticket, NOT P1 scope — G3
> stays parked. On day one of real operator use, **every** `review` run died `cap_reached` —
> five consecutive failures across three rigor levels — because the `verification` phase's
> web-research burn is not modeled by the estimator and can exceed any `ceil(1.5×estimate)`
> cap. The core paid workflow currently cannot complete at advertised prices (D-PRB.21-1).

- **Sequence:** inserted — runs **after `28l_PRB.21`, before `29_P1.01`**. Sorts as `28m`.
- **Phase:** LV — prod launch (defect closeout).
- **base_branch:** current chainTip at dispatch (the PRB.21 branch — stacked PR chain).
- **Depends on:** PRB.17 (cap/billing legs), P0.15i (proxy web-research channel), the
  estimator (`packages/run-sheet/src/estimate.ts` → `@rhema/protocols` `estimatorSpec`).
- **Run:** `implement-spec spec=docs/tickets/28m_PRB.22__review-verification-burn-cap-model.md`
- **Gate status:** no new credentials; Stage B is ONE bounded live verify (≤ $5, see below).
- **Live stage:** Stage A is the real work; Stage B is a single capped prod run.

## Goal
A `review` run on a small real doc **DELIVERS within its derived cap**. The beta's core
promise — click Review, get a dossier — currently cannot be fulfilled for any doc with
verifiable claims.

## Load
- `docs/tickets/DEFERRALS.md` — **D-PRB.21-1** (authoritative defect description + all five
  failed-run ids, fetch/usage counts, and the committed-vs-burn ledger numbers).
- `apps/egress-proxy/src/cap.ts` + `context.ts` — cap enforcement is on Σ proxy-metered
  credits per request (`isOverCap`), resolved fresh per request (operator cap-raise seam
  used twice on 2026-09-22: `update runs set cap_credits=…` + matching `credit_ledger`
  `hold` row — takes effect next request).
- `packages/run-sheet/src/estimate.ts` + `@rhema/protocols` `estimatorSpec` — the estimate
  is words×claim-density + addends; there is NO research/fetch-volume term.
- `packages/protocols/` review pipeline — `verification`/`discourse` phases issue searches
  and fetch sources per claim (~128 fetches + 13 searches on a 701-word doc; fetched pages
  accumulate into context — 6.65M cache-read tokens / 41 calls).
- `packages/orchestrator/src/` — phase commit semantics (debits commit per finished step;
  burn accrues inside the phase before any commit).

## In scope — Stage A (code + tests, PR-able)
1. **Diagnose precisely, then pick the fix shape** (the ticket's ruling, documented in the
   run ledger + an ADR if it changes REQ-SPEC-11 semantics):
   a. **Bound the research** — per-claim and/or per-run fetch+search budget in the
      verification/discourse phase contracts (e.g. ranked-source top-K, fetched-page byte
      truncation before context ingress). This is the honest root fix: research volume
      today is unbounded and driven by page size, not claim count.
   b. **Model the burn** — a research addend in the estimator (claims × expected fetches ×
      expected tokens) so the derived cap reflects reality. Alone this just makes caps
      bigger (users pay more for the same waste) — pair with (a) unless data says burn is
      already tight.
   c. **Re-scope the cap** (meter committed work only / separate research sub-cap) — only
      with an explicit operator ruling; it changes the REQ-SPEC-11 meter-of-record contract.
   - Recommended: **(a) + (b)**. The 6.65M cache-read-token figure says fetched pages are
     entering context wholesale — bound that first, then teach the estimator the residual.
2. **Quick-rigor floor** — the honest quick cap (~86–110cr) is below the observed minimum
   viable burn (~146cr). Either the floor rises, or quick is removed from the sheet for
   claim-bearing docs, or (a) shrinks minimum burn below the floor — pick from evidence.
3. Deterministic tests: the chosen bound enforced in the phase contract; the estimator
   addend (if taken) reflected in `buildEstimate` output; `turbo build lint typecheck` +
   `pnpm test` green.

## In scope — Stage B (live on prod, ≤ $5 hard ceiling)
4. `pulumi up` with the new images (preview first — no unexpected resources).
5. ONE live `review/quick` run on `my-first-project` draft 6 (701 words, zero URLs,
   already in prod) via the api with a minted session — exactly the pattern used
   2026-09-22. If the derived cap is implausibly small for the new model, an operator-style
   cap raise (cap + hold row) is permitted ONCE, recorded in the run ledger — spend ceiling
   $5 either way; if the run still dies `cap_reached`, STOP and report rather than retry.
6. Assert `state=delivered`, `spent_credits ≤ cap_credits`, committed debits ≈ estimate
   (within the platform-pricing tolerance), and the fetch/search counts within the chosen
   budget. Close **D-PRB.21-1** in DEFERRALS.md with evidence; run ledger + BUILD_INDEX +
   PHASE LOG; `check-build-memory.sh .` clean.

## Acceptance
- D-PRB.21-1 → DONE with live evidence (a delivered review within cap).
- The fix shape + any REQ-SPEC-11 semantic change is recorded (ADR if semantics moved).
- No new OPEN rows without a `D-PRB.22-*` id + owner.

## Out of scope
- P1.* skeletons (G3-parked), merges (OPERATOR policy), the missing run-history/review-link
  surface (P1.05), the add-credits entry-point gap (P1.04-adjacent), retries/refunds policy
  changes beyond the cap question.

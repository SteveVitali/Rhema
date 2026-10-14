# VERIF.1 — SHA-exact composed verification pass at `ffbb8ad` (stream V-1)

- **Sequence:** 153 · **Phase:** round 5 · **Kind:** ticket (verification — $0 prod reads/journeys only)
- **base_branch:** current checkout
- **Depends on:** 152_FIX.1 (chain position; the legs target the ALREADY-deployed tip — no code dependency)
- **Run:** `implement-spec spec=docs/tickets/153_VERIF.1__composed-verification-ffbb8ad.md`
- **Gate status:** none
- **Live stage:** operator-gated: prod reads + journey runs only (no writes, $0 legs)
- **Production mutations:** none
- **Size budget:** ~150 changed lines (evidence + any thin-leg wiring)

## Goal
Close the post-deploy verification backlog with one SHA-exact pass over the deployed `ffbb8ad`
tip (the ratified Q-SHA ruling: one re-run, it costs nothing) — BL-82 plus every $0 residual leg
the G1 census grouped into stream V-1.

## Load
- `docs/post-spa-disposition-spec.md` §9 stream V + `docs/research/r5_g1_dispositions.md` (row list)
- `docs/research/r5_d234_stage-residuals.md` (the D-SPACAP.2-* / D-SPA.28-1 leg recipes)
- `packages/journeys` CLI (`--expect-sha ffbb8ad`, `--expect-renderer`, `--surface`)
- `scripts/live/public-ssr-baseline.mjs` + `scripts/check-coverage-matrix.test.mjs`

## In scope — deliverables
1. **BL-82 / D-SPA.28-1 thin legs:** bundle grep-scan over the deployed `ffbb8ad` (no
   `x-rhema-renderer`/`SPA_OVERRIDES` text in served assets) + `--pin-renderer`/`JOURNEY_PIN_RENDERER`
   refuse exit 2 — evidence committed.
2. **D-SPACAP.2-1** — the composed suite on `--expect-sha ffbb8ad` (`--expect-renderer` arms per
   surface); **D-SPACAP.2-2** — the two-tenant BFF probe; **D-SPACAP.2-3** — the post-deploy half of
   the public-SSR baseline diff (BEFORE half exists under `reports/2026-10-10_SPACAP.2-public-ssr-baseline/`);
   **D-SPACAP.2-4** — the zero-CSP-warning walk.
3. **D-SPACAP.3-1** — the showcase forced-SSR in-SPA handoff arm verified on prod.
4. **D-CAP.1-2 + D-CAP.2-2** — the zero-uninstrumented-surface leg and the chain-tip composed suite`s $0 half — the zero-uninstrumented-surface leg.
5. **BL-74 residual (this ticket OWNS the row`s flip):** record whether the first scheduled nightly green has landed on a deployed-
   SHA-equal `main` — merge-dependent; if `main` HEAD ≠ `ffbb8ad` the row stays OPEN with the
   merge dependency named (never fabricate).

## Out of scope
- Preview (`pr-<n>`) legs → 165_VERIF.2 · Paid legs → FUNDED.1 · Any prod write

## Acceptance criteria
- [ ] Every listed leg executed against `ffbb8ad` with committed evidence, or left OPEN with the exact blocker *(live-executed)*
- [ ] Each closed D-row flips with the evidence pointer; none flip without it *(deterministic · engineered)*
- [ ] verification green; `BUILD_INDEX.md` row + `LEDGER.md` advanced; operating clauses met. *(agentic — universal AC)*

D-OPS.1-2 (paused-AlloyDB leg) is 165_VERIF.2`s, not this ticket`s.

## Requirement IDs to satisfy and stamp in the PR
REQ-G1-3 (V-1 half)

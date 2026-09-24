<!--
  docs/build/readouts/GATE-G2.md (BM-INDEX-03) — append-only gate readout for GATE G2 (benchmark wave-1 LIFT).
  Do NOT write the reserved verdict token PASSED unless the LIFT criterion is genuinely met (two consecutive
  waves) with no OPEN row referencing GATE-G2. This file currently records a DEFERRAL, not a pass.
-->
# GATE-G2 — benchmark wave-1 LIFT — readout

- **Criterion (REQ-EVAL-15; operator-confirmed 2026-09-01):** Rhēma Full-board over the A1 frontier baseline on
  major-or-blocking material-issue recall by **≥ 15 percentage points absolute**, at an invalid-finding rate no
  worse than A1, **sustained across two consecutive waves**. Run with the §18 tooling over the H2 corpus,
  pre-registered per REQ-EVAL-10. §17: "the lift gate read before any UI spend beyond Phase 0."

## Disposition — 2026-09-15: **DEFERRED (operator decision) — proceeding to Phase-B implementation without the eval**

**The eval has NOT been run and this gate is NOT passed.** The operator has decided (2026-09-15) to **defer the
wave-1 eval (and its H2 corpus prerequisite)** and proceed to Phase-B (`17_PRB.01`+) implementation now. This is
a deliberate override of the spec's "no UI spend beyond Phase 0 until G2" rule (§17 / REQ-EVAL-15), taken with
eyes open:

- **Rationale:** build velocity — the review pipeline is proven live end-to-end (G1), and the operator chooses to
  build the beta UI in parallel rather than block on commissioning the corpus + running the eval.
- **Standing consequences (NOT waived, only deferred):**
  - **§16.4** — the §1.4/§15.1 marketing/efficacy claims **do NOT ship** until the LIFT criterion is met. Building
    the UI is permitted; *claiming the product beats the baselines* is not, until this gate genuinely passes.
  - The Path-B citation-quality caveat (ADR-006: reviews currently deliver with many `unverifiable` verdicts)
    compounds this — the review's measured quality is unproven and, on this session's evidence, needs work.
  - **REQ-EVAL-16 failure consequences** are deferred, not escaped: if the eval later shows no LIFT, that verdict
    applies to whatever UI has been built by then. UI spend past this point is **at risk**.

## What unblocks a genuine G2 pass (when the operator chooses to close it)
- **Rigorous:** complete **H2** (`16b_HUMAN-H2` — ≥24 commissioned drafts, two editors + a senior adjudicator,
  provider no-training verification), then run wave 1 with `@rhema/benchmark-runner` `runWave` + the built
  scorers over the corpus, pre-registered; hit ≥15pp LIFT across two waves.
- **Cheap directional signal first:** run a dev-set pilot (`runWave` over the 3 real projects + a few drafts,
  reusing the §18 machinery) to see whether the LIFT is plausibly reachable before committing to H2.
- Then write the disposition here (the reserved verdict token) + record it in `docs/build/LEDGER.md`
  GATE DECISIONS.

**Status:** DEFERRED. Phase-B implementation proceeds under this documented operator override; G2 remains a HARD
gate before public launch + any efficacy marketing.

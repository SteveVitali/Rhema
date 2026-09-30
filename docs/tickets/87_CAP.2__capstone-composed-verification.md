<!--
  Template: tail ticket CAP.2 (capstone composed verification). Filled by: decompose-spec at
  seed/extend. Placeholders filled on instantiation. An ordinary implement-spec contract.
-->
# CAP.2 — capstone composed verification

- **Sequence:** 87 (round 3 tail) · **Phase:** capstone · **Kind:** capstone
- **Tag:** capstone
- **base_branch:** current checkout
- **Depends on:** CAP.1
- **Run:** `implement-spec spec=docs/tickets/87_CAP.2__capstone-composed-verification.md`
- **Gate status:** none
- **Live stage:** operator-gated: ≤ $15 metered (round-3 standing authorization, ADR-013)

> Each additive ticket only ever exercised its own slice; the fully-composed path may never
> have run green. This ticket runs the **whole build as one unit**.

## Goal
Exercise the composed build of every executed chain row (rounds 1–3: the 58 original/inserted rows, CAPSTONE/RCN.1/STB.1–4/DEF.1–3, and round 3's 27) tickets end-to-end and record the result, so
"rhema works as a whole" is proven empirically, not inferred from per-ticket greens.

## Load (read these — do not re-read others)
- `docs/build/CAPSTONE_GAP_ANALYSIS.md` and `docs/build/COVERAGE_MATRIX.csv` (CAP.1's output —
  especially the AT-RISK-INTEGRATION rows and the seam hunt).
- `docs/rhema-design-spec.md` § acceptance criteria and integration invariants.
- `docs/tickets/DEFERRALS.md` (the consciously-unwired seams).

## In scope — deliverables
1. A composed-final-state verification exercising the fully-wired path the additive tickets
   never covered — unit/integration and, where the build has one, the composed runtime run.
2. `docs/build/COMPOSED_E2E_REPORT.md` — what was driven, what was observed, and why it proves
   the behaviour; every unwired seam is an `xfail`/skip whose reason **starts with a
   `DEFERRALS.md` id**; an environment-blocked composed run is recorded (the exact blocker +
   what would close it) and routed to the operator — **never a fabricated green**.

## Out of scope
- Closing new gaps found here (route them to CAP.3). Reconciliation (REC.*).

## Acceptance criteria
- [ ] the composed path runs green, or every non-green is an xfail/skip whose reason starts with a `D-*` id *(deterministic)*
- [ ] `COMPOSED_E2E_REPORT.md` records commands + observed signals for each composed scenario *(agentic)*
- [ ] any environment block is recorded with what would close it and routed to the operator *(agentic)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
The composed-verification / integration ids of `docs/rhema-design-spec.md` (matching `REQ-[A-Z]+-[0-9]+`).

## Cross-cutting invariants
- Cited from `docs/tickets/00_MANIFEST.md § Cross-cutting invariants`.

## Notes
- This ticket owns `COMPOSED_E2E_REPORT.md`. Never mutate canonical/production state; use
  tagged/throwaway fixtures and clean up shared-store records from a written list.

## Round-3 notes (2026-09-30)
- **Composed verification here means:**
  - the full JOURNEY.1 suite, every registry step expected green, on the deployed prod stage at the chain tip
  - the SEC.1 two-tenant probe
  - one paid new-visitor journey including the trial Review
  - the REQ-SPEC-32(c) calibration report
- **Budget:** ≤ $15 metered, under the round-3 standing authorization (ADR-013).
- **A step still red** is recorded, not fabricated green, and routed as `xfail` with a DEFERRALS id.

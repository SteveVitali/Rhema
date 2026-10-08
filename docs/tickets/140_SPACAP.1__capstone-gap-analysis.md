# SPACAP.1 — capstone gap analysis

- **Sequence:** 140 (round 4 tail) · **Phase:** capstone · **Kind:** capstone
- **Tag:** capstone
- **base_branch:** current checkout
- **Depends on:** SPA.28 (139) (the last implement-spec ticket landed)
- **Run:** `implement-spec spec=docs/tickets/140_SPACAP.1__capstone-gap-analysis.md gap_analysis=true live_verification=false`
- **Gate status:** none
- **Live stage:** none

> **Independence is the point.** This is the one place the build is judged as a *whole*. Do
> the verdicts in a fresh context, from the composed final tree and the spec — **before**
> reading any per-ticket run ledger — so a per-ticket lens cannot hide a cross-cutting gap.

## Goal
Prove, or disprove with evidence, that the composed build of the round-4 SPA tickets
satisfies `docs/frontend-spa-spec.md` as a whole: one verdict per requirement id, a coverage matrix, and a
seam hunt that a per-ticket gap analysis structurally cannot see.

## Load (read these — do not re-read others)
- `docs/frontend-spa-spec.md` in full (every §, the 192 REQ ids, the out-of-scope list, Appendix E dispositions).
- `docs/tickets/00_MANIFEST.md` § The chain (round-4 banner) + § Requirement-ID index.
- The composed final tree: `git diff <pinnedBaseSha>...<chainTip>` and the real final files.
- `docs/tickets/DEFERRALS.md`. **Do not** read `docs/build/runs/*` until every verdict is recorded.

## In scope — deliverables
1. `docs/build/COVERAGE_MATRIX.csv` — one row per SPA-spec requirement id
   (`REQ-[A-Z]+-[0-9]+` in the SPA families: INV/ISL/DAT/TST/FW/TL/BFF/ED/UX/NAV/BND/VFY/SAFE/SEQ),
   columns identical to the round-3 `86_CAP.1` `COVERAGE_MATRIX.csv` — **never rename columns**; the `verdict` column uses the round-3 matrix's vocabulary verbatim.
2. The seam hunt: cross-ticket integration gaps no single ticket owned (the stranger-migration
   seams: boot staleness across flag changes, mixed-mode navs, storage-schema coexistence).
3. A routed gap list → CAP.3.

## Out of scope
- Fixing gaps — routed to SPACAP.3
- Re-verifying per-ticket ACs — the composed-tree lens only
- Prod mutations — none; this row reads prod, never writes

## Acceptance criteria
- [ ] every SPA-spec requirement id has exactly one matrix row with a verdict *(deterministic)*
- [ ] every PARTIAL/MISSING verdict is either routed to CAP.3 or a DEFERRALS row *(deterministic)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Cross-cutting invariants
- Canonical vocabulary lint (`no-banned-strings`) binds all new code + copy (REQ-SPEC-2).
- No protocol/eval IP in any browser bundle, OpenAPI, or event payload (REQ-ARCH-33; REQ-SAFE-1/2).
- Strict CSP retained: `script-src 'self' 'nonce-…'`, no `unsafe-eval` (spec §9).
- Session cookies on `rhema.tools`; ADR-040 internal-stamp seam preserved (spec §2 I-5).
- Deployable dark: every PR lands flag-∅-safe — additive-only shared files, SSR fallback
  never deleted mid-migration (REQ-SEQ-11/12).
- `mergePolicy: OPERATOR` — this run never merges; append-only history.

## Requirement IDs to satisfy and stamp in the PR
none — process/capstone row (the SPA REQ ids are audited by SPACAP.1's matrix, not stamped here)


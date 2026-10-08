# SPAREC.3 — integration plan

- **Sequence:** 146 (round 4 tail) · **Phase:** reconcile · **Kind:** reconcile
- **Tag:** reconcile
- **base_branch:** current checkout
- **Depends on:** GATE-ACCEPT.SPA (143)
- **Run:** `implement-spec spec=docs/tickets/146_SPAREC.3__integration-plan.md reconcile=integration`
- **Gate status:** none — process row; `mergePolicy: OPERATOR`.
- **Live stage:** offline-only

## Goal
reconcile-build `mode=integration`: the merge plan for the round-4 stack — how the ~50-row
SPA chain composes with the still-unmerged round-3 chain (Q-7: independent schedule), the
flip-PR merge order (SPAF rows interleaved), and the deploy sequence. Never merges — writes
the plan the operator executes.

## Acceptance criteria
- [ ] `docs/build/INTEGRATION_PLAN.md` gains the round-4 section: merge order, flip timing, deploy steps *(deterministic)*
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


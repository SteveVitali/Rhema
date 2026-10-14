# SPACAP.3 — capstone closure

- **Sequence:** 142 (round 4 tail) · **Phase:** capstone · **Kind:** capstone
- **Tag:** capstone
- **base_branch:** current checkout (closure PRs stack at the tip on `stevevitali/frontend-spa-capstone`)
- **Depends on:** SPACAP.1 (140), SPACAP.2 (141)
- **Run:** `implement-spec spec=docs/tickets/142_SPACAP.3__capstone-closure.md`
- **Gate status:** feeds GATE-ACCEPT.SPA
- **Live stage:** none

## Goal
Close every routed gap from SPACAP.1/2, then write `docs/build/CAPSTONE_CLOSURE.md` — the
landed-shape summary and the ACCEPTED-deviations list the operator signs at GATE-ACCEPT.SPA.

## Acceptance criteria
- [ ] Every routed gap either closed by a fix commit or dispositioned as a signed-deviation candidate *(agentic)*
- [ ] `CAPSTONE_CLOSURE.md` written: landed shape, deviations list, remaining deferrals *(deterministic)*
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


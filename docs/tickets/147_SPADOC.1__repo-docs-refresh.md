# SPADOC.1 — repo docs refresh

- **Sequence:** 147 (round 4 tail) · **Phase:** docs · **Kind:** docs
- **Tag:** docs
- **base_branch:** current checkout
- **Depends on:** SPAREC.3 (146) — docs refresh runs after all three reconcile rows land
- **Run:** `implement-spec spec=docs/tickets/147_SPADOC.1__repo-docs-refresh.md`
- **Gate status:** none — process row; `mergePolicy: OPERATOR`.
- **Live stage:** offline-only

## Goal
refresh-repo-docs over the composed build: README/docs/CHANGELOG/examples converge onto the
SPA reality — the "no client bundle" claims die, the architecture docs describe the
SSR-public + SPA-authed hybrid, the island pipeline's surviving scope is documented.

## Acceptance criteria
- [ ] Every human-facing doc claim about the frontend architecture verified against the code *(deterministic)*
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


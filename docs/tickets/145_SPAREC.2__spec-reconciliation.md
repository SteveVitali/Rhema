# SPAREC.2 — spec reconciliation

- **Sequence:** 145 (round 4 tail) · **Phase:** reconcile · **Kind:** reconcile
- **Tag:** reconcile
- **base_branch:** current checkout
- **Depends on:** GATE-ACCEPT.SPA (143)
- **Run:** `implement-spec spec=docs/tickets/145_SPAREC.2__spec-reconciliation.md reconcile=spec`
- **Gate status:** none — process row; `mergePolicy: OPERATOR`.
- **Live stage:** offline-only

## Goal
reconcile-build `mode=spec`: fold what the build actually shipped back into
`docs/frontend-spa-spec.md` — amend it to the as-built shape (the source spec is the authority; landed
deviations get spec amendments + ADRs, never drift), and mark which parts of
`docs/rhema-design-spec.md` the SPA spec now supersedes in practice.

## Acceptance criteria
- [ ] `docs/frontend-spa-spec.md` describes the landed system (amendments appended, version bumped) *(deterministic)*
- [ ] Supersession notes recorded where SPA reality differs from the product spec *(deterministic)*
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


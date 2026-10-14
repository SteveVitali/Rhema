# SPACAP.2 — capstone composed verification

- **Sequence:** 141 (round 4 tail) · **Phase:** capstone · **Kind:** capstone
- **Tag:** capstone
- **base_branch:** current checkout
- **Depends on:** SPACAP.1 (140), SPA.28 (139)
- **Run:** `implement-spec spec=docs/tickets/141_SPACAP.2__capstone-composed-verification.md`
- **Gate status:** none
- **Live stage:** operator-gated (prod journeys — $0 legs only)

> "The frontend-spa build works as a whole" is proven empirically, not inferred from per-ticket greens.

## Goal
Exercise the composed build end-to-end on prod: the full journey suite with
`--expect-renderer spa` on every flipped surface, the two-tenant probe across the BFF
(the tenant-isolation contract is the load-bearing invariant), and a final public-surface
SSR regression pass (the forever-SSR set must be byte-clean).

## Acceptance criteria
- [ ] Full journey suite green on prod; `--expect-renderer spa` asserted per surface *(deterministic · live-executed)*
- [ ] Two-tenant isolation probe across SPA BFF reads *(deterministic · live-executed)*
- [ ] Public surfaces (`/`, `/login`, `/showcase`, pricing) unchanged — SSR regression pass *(deterministic · live-executed)*
- [ ] Zero-CSP-error browser walk on a real flagged surface *(deterministic · live-executed)*
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


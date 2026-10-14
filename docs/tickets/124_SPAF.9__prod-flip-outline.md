# SPAF.9 — prod flip: `outline`

- **Sequence:** 124 (round 4 — frontend SPA) · **Phase:** round 4 — prod flips · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** SPAF.8; the `outline` surface ticket's PR merged + deployed (its code must be live)
- **Run:** `implement-spec spec=docs/tickets/124_SPAF.9__prod-flip-outline.md`
- **Gate status:** operator-merged PR + deploy; ≥1 nightly green before the NEXT flip row executes (REQ-SEQ-10)
- **Live stage:** operator-gated (prod deploy)
- **Production mutations:** `STAGES.prod.spaSurfaces` gains `outline` → `pulumi up` — pre-state captured in the run ledger; rollback = revert + redeploy
- **Size budget:** ~20 changed lines

## Goal
Flip `outline` to the SPA on prod — one minimal PR touching only the prod stage fact, then a `pulumi up` deploy. This is the strangler's point of no immediate return for `/p/:p/outline*` — rollback is a config flip, not a code change.

## Load
- `docs/design/29_spa-migration-sequencing.md` §prod-flip runbook (verbatim procedure)
- `infra/config/stages.ts` (`spaSurfaces` fact), `infra/pulumi/Pulumi.prod.yaml` precedent (MAINT.5's deploy)
- `docs/frontend-spa-spec.md` §11 + REQ-SEQ-10/11

## In scope — deliverables
1. `STAGES.prod.spaSurfaces += 'outline'` — the only code change (REQ-SEQ-10)
2. PR open (base = chain tip), operator merges, `pulumi up` deploys
3. Post-deploy evidence: `data-renderer="spa"` on `/p/:p/outline*`; `--expect-renderer spa` leg green on prod; `?ssr=1` escape hatch verified still serving SSR
4. Run-ledger entry: deploy SHA, nightly-green precondition on the next flip

## Out of scope
- Any other code change — a flip PR that grows scope is rejected by review
- The next surface's work — separate row

## Acceptance criteria
- [ ] The PR diff touches only `stages.ts` (+ generated config if any) *(deterministic · engineered)*
- [ ] Post-deploy: flagged GETs return `data-renderer="spa"`; `?ssr=1` still returns SSR *(deterministic · live-executed)*
- [ ] `--expect-renderer spa` journey leg green on prod for `outline`'s surface steps *(deterministic · live-executed)*
- [ ] Rollback path verified: a revert PR would restore SSR in one deploy (recorded, not exercised destructively) *(agentic · live-executed)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-SEQ-10, REQ-SEQ-11, REQ-SEQ-12; REQ-VFY-8 (the prod legs)

## Cross-cutting invariants
- Canonical vocabulary lint (`no-banned-strings`) binds all new code + copy (REQ-SPEC-2).
- No protocol/eval IP in any browser bundle, OpenAPI, or event payload (REQ-ARCH-33; REQ-SAFE-1/2).
- Strict CSP retained: `script-src 'self' 'nonce-…'`, no `unsafe-eval` (spec §9).
- Session cookies on `rhema.tools`; ADR-040 internal-stamp seam preserved (spec §2 I-5).
- Deployable dark: every PR lands flag-∅-safe — additive-only shared files, SSR fallback
  never deleted mid-migration (REQ-SEQ-11/12).
- `mergePolicy: OPERATOR` — this run never merges; append-only history.

## Operating clauses
- `mergePolicy: OPERATOR` — the run opens the PR; the operator merges it. A nightly green since the PREVIOUS flip is this row's entry gate — pause if unmet.

## Notes
- Spend: $0 beyond the nightly suite. If a bake fails: revert the flip, redeploy, and record — never fix-forward under pressure on prod.

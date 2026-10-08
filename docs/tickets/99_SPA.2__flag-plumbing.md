# SPA.2 — SPA surface flags: parse → WebDeps → deps.spa → deploy wiring

- **Sequence:** 99 (round 4 — frontend SPA) · **Phase:** round 4 · **Kind:** ticket
- **base_branch:** current checkout (the SPA chain stacks on the round-3 tip)
- **Depends on:** SPA.1 (98)
- **Run:** `implement-spec spec=docs/tickets/99_SPA.2__flag-plumbing.md`
- **Gate status:** none — code + tests; `mergePolicy: OPERATOR`.
- **Live stage:** offline-only
- **Production mutations:** none
- **Size budget:** ~600 changed lines excl. generated/fixtures

## Goal
The whole strangler consult: `SPA_SURFACES` CSV parsed fail-closed (`signupMode` precedent), the 14-key + `ide-chrome` vocabulary, `deps.spa(c, surface)` implementing the fixed handler order (session → server redirects → forced-SSR → renderer override → flag → ide-chrome AND-gate), and the deploy wiring (StageConfig fact → compute.ts env → Pulumi stack config; `SPA_OVERRIDES` non-prod only).

## Load (read these — do not re-read others)
- `docs/design/29_spa-migration-sequencing.md` §flag mechanism (concrete pseudocode)
- `docs/design/26_spa-public-auth-boundary.md` §3 (boundary/catch-all)
- spec §11 flag bullets + §4 fixed handler order
- `packages/contracts/src/signup.ts` (the parse precedent), `apps/web/src/main.ts:108`, `infra/config/stages.ts` §signupMode fact, `infra/pulumi/compute.ts:919`
- `docs/frontend-spa-spec.md` — the canonical SPA spec (cite, do not re-derive).
- `docs/tickets/00_MANIFEST.md` § Cross-cutting invariants + § Operating rules.

## In scope — deliverables
1. `parseSpaSurfaces` + `SpaSurface` union (14 keys + `ide-chrome`) in `@rhema/contracts` — unset/invalid ⇒ ∅, unknown tokens dropped + one warn line (REQ-SEQ-1/2)
2. `WebDeps.spaSurfaces` + `deps.spa(c, surface)` — consult order verbatim per spec §4 incl. `?ssr=1`/`x-rhema-renderer` override semantics + the `ide-chrome` AND-gate (REQ-SEQ-4, REQ-BND-11)
3. `StageConfig.spaSurfaces` fact (default `[]` all kinds) + stage-fact unit tests mirroring `signupMode` (REQ-SEQ-3)
4. `compute.ts` web env `SPA_SURFACES` + `SPA_OVERRIDES=1` iff `kind !== 'prod'`; `rhema:spaSurfaces` Pulumi stack config for previews
5. Unit tests: parse edges, consult order, override honored/refused per stage, AND-gate

## Out of scope
- The shell document itself — SPA.3
- Any surface's actual SPA content — surface tickets
- Preview/prod flag values — no flag is set anywhere until the foundation set lands (REQ-SEQ-5)

## Acceptance criteria
- [ ] `parseSpaSurfaces` fail-closed on garbage/unset; unknown tokens dropped + warned *(deterministic · engineered)*
- [ ] `deps.spa` consult order pinned by tests: session gate precedes override precedes flag precedes ide-chrome AND *(deterministic · engineered)*
- [ ] `?ssr=1` honored on every stage; `?renderer=spa` + `x-rhema-renderer: spa` honored only where `SPA_OVERRIDES=1` *(deterministic · engineered)*
- [ ] Stage facts default `[]` on all three kinds; Pulumi config override path tested *(deterministic · engineered)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-SEQ-1..4; REQ-SEQ-2 (vocabulary); REQ-BND-11; REQ-FW-3

## Cross-cutting invariants
- Canonical vocabulary lint (`no-banned-strings`) binds all new code + copy (REQ-SPEC-2).
- No protocol/eval IP in any browser bundle, OpenAPI, or event payload (REQ-ARCH-33; REQ-SAFE-1/2).
- Strict CSP retained: `script-src 'self' 'nonce-…'`, no `unsafe-eval` (spec §9).
- Session cookies on `rhema.tools`; ADR-040 internal-stamp seam preserved (spec §2 I-5).
- Deployable dark: every PR lands flag-∅-safe — additive-only shared files, SSR fallback
  never deleted mid-migration (REQ-SEQ-11/12).
- `mergePolicy: OPERATOR` — this run never merges; append-only history.

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`.

## Notes
- Overrides never bypass the session gate, server redirects, or forced-SSR checks (spec §11).

# MAINT.3 — funded-window defect repairs

Manifest row 94 (maintenance) · stacks on `stevevitali/doc-2-agent-docs-refresh` @ `b51f80b`
(the round-3 tip, PR #115) · merge policy **OPERATOR** — do not merge from the build
environment · **$0** spend, no deploys, no production writes — the operator-authorized
maintenance pass for the defects the funded window surfaced.

## What lands

Four recorded defects repaired at the seams their deferral rows named — each with a
deterministic regression test; no paid legs, no live writes.

- **D-STB.5b-4 — `defer` on a `mooted` obligation → HTTP 500.** `triage-routes.ts` now maps
  `ObligationTransitionError` to a clean **409 `obligation_not_routable`** at the disposition
  POST (the transaction rolls back — nothing is persisted) and makes the Decisions-answer
  obligation leg best-effort. `obligations/hook.ts` absorbs a stale response-ledger fold onto
  a CLOSING-state obligation so a race can no longer wedge a run in `finalizing` (the PRB.19
  F33 class, generalized); a refusal onto a non-closing state still throws. The closed-world
  state machine is unchanged — no `mooted → deferred` edge was added.
- **D-STB.5b-5 — scoped empty-text `sdk=success` → unrecoverable `phase_blocked`.**
  `scoped-phase.ts` re-issues **once** through the prompt-guidance channel
  (`EMPTY_SUCCESS_NUDGE`, injected into the scoped spec's `query.prompt`) before declaring the
  phase blocked. A transient empty converts and writes the normal artifact + marker + agent
  result + `done` phase result; a persistent empty still fails honestly — nothing fabricated.
  Guidance never reaches `/work` files or artifacts.
- **D-MAINT.3-1 (new row) — trial-entitlement interception.** `buildSheet` attaches the
  claimable entitlement — `Included` rendering + the hidden `entitlementId` — only when the
  selected workflow/rigor/tier match `PRICING.trial.entitlement`'s configured shape (the same
  config the api's `trial_shape` gate enforces). A mismatched selection now prices on credits
  and launches; the previous 422 loop can't begin. Qualifying Standard/Base Review sheets are
  unchanged.
- **D-OBS.1-3 — N4 selector drift + N9 fixture.** N4's `sheetFigure` reads the Included
  variant's embedded recompute cell (`cells[rig|tier|toggles]`, §5.6 item 2) when
  `data-included="true"` hides the credits line — the one-estimate numerical assertion is
  unchanged; the credit-line path is untouched for non-entitled sheets. **N9** gets
  `scripts/live/reseat-n9-fixture.mjs` — an idempotent, `is_test`-checked reseat of
  `sub_jrna_bill3_fixture` onto jrn-a's *current* billing account (`--dry-run` default; the
  prod write itself remains operator-owed).

Two **baseline** reds found by the full suite (pre-existing on `b51f80b`, BL-02 hygiene
class) also fixed: the T3 registry green-note literally spelled `systemExec` and tripped the
system-pool-boundary scanner, and REC.1's `MET-ENGINEERED(D-RES.1-2)` verdict was outside the
coverage-matrix vocabulary (restored `MET`; the deferral ref stays in the note).

## Owed (honest)

- Live re-verification of all four fixes rides the next deploy/funded window — **not run**
  (the $0 constraint).
- The N9 reseat is a production write — script ready, operator-run.
- Leg-1a zero-coverage diagnosis stays a separate investigation row (FUNDED §B.4).

## Test plan

- [x] `triage-routes.test.ts` 17/17 — new: mooted obligation + `defer` → 409 + rolled back
- [x] `obligations` 55/55 — new: stale `defer` fold onto `mooted` absorbs, delivery completes
- [x] `scoped-phase.test.ts` 13/13 — new: empty→retry-success, guidance in prompt only
- [x] `server.test.ts` (web) 105/105 — new: mismatched shape suppresses entitlement
- [x] `pnpm test` — 4,565 pass; the only 2 failures were the baseline reds this PR fixes
- [x] `turbo build lint typecheck` green · `git diff --check` clean
- [x] `check-build-memory.sh` 0 violations · `check-append-only --base b51f80b` OK
- [ ] live: post-deploy journey sweep incl. N4 + the reseated N9

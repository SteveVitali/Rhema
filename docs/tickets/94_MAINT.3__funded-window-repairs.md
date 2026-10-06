# MAINT.3 — Funded-window defect repairs: obligation 500s, scoped empty-success, entitlement interception, N4/N9 substrate

- **Sequence:** 94 (round 3 — maintenance row, post-chain) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** defect
- **base_branch:** `stevevitali/doc-2-agent-docs-refresh` (the chain tip; stacked PR on `stevevitali/maint-3-funded-window-repairs`)
- **Depends on:** the funded window's recorded evidence (`docs/build/runs/FUNDED-2026-10-06-A.md` §B.3/§B.4, `FUNDED-2026-10-06-B.md`, DEFERRALS `D-STB.5b-4`, `D-STB.5b-5`, `D-OBS.1-3`)
- **Scope (one line):** deterministic $0 code repairs of the four product defects the funded window surfaced — no paid legs, no prod writes. Live re-verification rides the next deploy/funded window and stays ledgered.
- **Absorbs (backlog):** BL-78 (new — the funded-window defect set), the N4-selector half of BL-74
- **Run:** `implement-spec spec=docs/tickets/94_MAINT.3__funded-window-repairs.md`
- **Gate status:** none — code + tests only; `mergePolicy: OPERATOR`.
- **Spend:** **$0.** The operator's constraint: no further credits.

## Defects (each filed by the funded window; fix at the seam it named)

1. **D-STB.5b-4 — defer on a `mooted` obligation → HTTP 500.** `recordDispositionInTx` routes through
   `routeDisposition`; `mooted → deferred` is not an edge in the closed world so
   `ObligationTransitionError` escaped as `internal_error`. Fix at three seams, never by relaxing the
   state machine:
   - `apps/api/src/triage-routes.ts` disposition POST maps `ObligationTransitionError` → 409
     `obligation_not_routable` (the tx rolls the disposition write back).
   - The Decisions-answer route's re-defer/drop leg is best-effort (its comment already promised that:
     the `live` read races the obligation's own transition).
   - `packages/obligations/src/hook.ts` response-ledger fold: a frozen move whose obligation closed
     since the ledger froze is a stale fold — absorbed, never wedging delivery (the PRB.19 F33 class,
     generalised). A refusal onto a NON-closing state still throws — that is a real transition bug.
2. **D-STB.5b-5 — scoped-phase empty-text `sdk=success` → non-retryable `phase_blocked` (×2 live).**
   `apps/run-task/src/scoped-phase.ts` wrote `blocked` when the SDK reported success with empty text;
   `internal-api.ts` maps `blocked` to a terminal run failure. Fix: one guided re-issue through the
   existing prompt-guidance channel (`EMPTY_SUCCESS_NUDGE`) before the `blocked` verdict — a transient
   empty converts to a real artifact; a persistent empty still fails honestly (the verdict is not
   relaxed, no artifact/marker/done is written for empty text).
3. **FUNDED §B.3 — the run sheet POSTs the trial `entitlementId` for EVERY shape.** A Quick launch on
   an entitled account 422'd `trial_shape` and the funded figure was never re-offered (the sheet
   cannot launch a credit-funded Quick run while a trial is claimable). Fix in `buildSheet`: the
   entitlement applies only to the one configured shape (`workflow === PRICING.trial.entitlement.kind
   && rigor === …rigor && modelTier === …modelTier` — the api's `trial_shape` gate reads the same
   config); on a mismatch `Included` + the hidden `entitlementId` are suppressed and the honest funded
   estimate renders. The 422 error path stays as the forged-post backstop.
4. **D-OBS.1-3 — N4/N9 substrate drift.** N4: the sheet renders ACT.1's `data-included` variant for an
   entitled tenant while the leg targeted only `data-credits-line` — `sheetFigure` now reads the
   embedded recompute cell (`var R={cells[rigor|tier|toggles]}`, §5.6 item 2) exactly as the inline
   script does; the assertion is unchanged. N9: the BILL.3 fixture `subscriptions` row stranded on the
   stale billing account after jrn-a's purge/re-provision (§14.2 mounts top-ups only for a paid
   tier) — `scripts/live/reseat-n9-fixture.mjs` reseats/inserts `sub_jrna_bill3_fixture` on the
   identity's CURRENT flagged billing account, idempotent, `is_test`-checked, system-role DSN. The
   reseat run itself is a prod write — owed, not done in this pass.

## Out of scope
- Paid/live re-verification of any fix (rides the next deploy + funded window; each D-row keeps the leg).
- The N9 reseat execution (prod write) and the 429 magic-link throttle (transient).
- Leg-1a zero-coverage diagnosis (recorded; a separate investigation row).

## Verify
- `pnpm exec vitest run apps/api/src/triage-routes.test.ts` — defer-on-mooted → 409, nothing written.
- `pnpm exec vitest run packages/obligations` — stale defer fold onto `mooted` does not wedge delivery.
- `pnpm exec vitest run apps/run-task/src/scoped-phase.test.ts` — empty→retry→produced; empty→empty→blocked.
- `pnpm exec vitest run apps/web/src/server.test.ts` — entitlement renders `Included` only at its shape.
- `pnpm turbo typecheck lint` on the touched packages; `pnpm --filter @rhema/journeys build`.
- `check-build-memory.sh` + `check-append-only.mjs --base <tip>` clean.

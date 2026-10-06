# MAINT.3 — funded-window defect repairs (run ledger)

- **Harness:** Devin CLI (agentic coding session); model: SWE-2 High; tier: n/a (build work)
- **Spec:** `docs/tickets/94_MAINT.3__funded-window-repairs.md` (manifest row 94, maintenance)
- **Base:** `stevevitali/doc-2-agent-docs-refresh` @ `b51f80b` (the chain tip)
- **Branch:** `stevevitali/maint-3-funded-window-repairs` (mergePolicy=OPERATOR — never merge)
- **Started / Closed:** 2026-10-06
- **Config:** code + deterministic tests only; **Live stage: none**; metered spend **$0**;
  zero prod writes, zero deploys (the operator's constraint: no further credits)

## What this run did

Repaired the four product defects the funded window recorded, each at the seam the deferral
named — code + regression tests, every live leg honestly owed on its D-row.

### 1 — D-STB.5b-4: defer on a `mooted` obligation → clean 409 (was HTTP 500)

`mooted → deferred` is not an edge in the closed world (`state-machine.ts` — correct by
design; no edge added). Three boundary fixes, none relaxing the state machine:

- `apps/api/src/triage-routes.ts` — the disposition POST catches
  `ObligationTransitionError` → 409 `{error:"obligation_not_routable"}` alongside the existing
  `DispositionFrozenError` → 409. The disposition write rolls back with the tx.
- Same file — the Decisions-answer re-defer/drop obligation leg is now best-effort (its
  comment already promised: the `live` read races the obligation's own transition).
- `packages/obligations/src/hook.ts` — the response-ledger fold wraps the routing switch: a
  frozen move whose obligation sits in a CLOSING state (`discharged`/`rebutted`/`mooted` —
  `CLOSING_STATES`) is a stale fold, absorbed with `continue`; a refusal onto a non-closing
  state still throws (real transition bugs wedge loudly, the PRB.19 F33 class generalised).

Tests: `triage-routes.test.ts` (defer on a finding whose obligation is `mooted` → 409, zero
disposition rows written); `delivery-integration.test.ts` (a frozen `defer` fold onto a
`mooted` obligation does not abort delivery — the exact prod wedge class).

### 2 — D-STB.5b-5: scoped empty-text `sdk=success` → one guided re-issue

`scoped-phase.ts` restructured around an `attempt(guidance)` closure: on
`subtype==="success" && text.length===0` the phase re-issues ONCE through the existing
prompt-guidance channel with `EMPTY_SUCCESS_NUDGE` (composed under any caller guidance).
A transient empty converts to a real artifact; a persistent empty still writes `blocked`
honestly — no artifact/marker/`done` for empty text (the verdict is not relaxed). Mirrors the
main loop's `RERUN_CLASSES` bounded-retry pattern (`harness-loop.ts` artifact_missing/infra/
provider_transient → one guided re-run).

Tests: empty→retry→produced (spawn×2, artifact + `done`); empty→empty→blocked (spawn×2, the
nudge lands on `query.prompt` and leaks nowhere into `/work` outputs).

### 3 — FUNDED §B.3 → D-MAINT.3-1: the run sheet posts the trial `entitlementId` only at its shape

`buildSheet` (`apps/web/src/server.ts`) now suppresses the entitlement unless
`(workflow, rigor, modelTier) === PRICING.trial.entitlement` — the exact triple the api's
`trial_shape` gate enforces (run-routes.ts:519-528 reads the same config). On a mismatch the
sheet renders the funded estimate (no `data-included`, no hidden `entitlementId`) so a
Quick launch on an entitled account prices and launches on credits — the §B.3 loop (Included
→ POST → `trial_shape` 422 → re-render → still Included) can no longer begin. The 422 error
path stays as the forged-post backstop; the word-cap scope pill suppression rides the same
`entitlement` local.

Test: `server.test.ts` MAINT.3 block — mismatch suppresses `data-included`+`entitlementId`
(funded `data-credits-line` renders); match renders `Included` + `value="ent_1"`.

### 4 — D-OBS.1-3: N4 leg repaired, N9 reseat scripted

- **N4** — `sheetFigure` (`packages/journeys/src/steps.ts`) reads the embedded recompute
  payload (`var R={…cells[rig|tier|toggles]→{e,c,lo,hi}…}`, §5.6 item 2) when the sheet
  renders the §14.3 `data-included` variant for an entitled tenant — the same cell the inline
  script repaints from, so the one-estimate assertion is unchanged, never a fabricated figure.
- **N9** — `scripts/live/reseat-n9-fixture.mjs` (new): reseats/inserts
  `sub_jrna_bill3_fixture` (writer/past_due — the BILL.3-ledgered shape) on `test+jrn-a`'s
  CURRENT flagged billing account. Idempotent; `is_test`-checked (refuses a non-flagged
  tenant); ends competing live rows; `--dry-run`. The reseat itself is a prod write — **owed,
  not run** (system-role DSN; recurs every purge cycle, hence a script not ad-hoc SQL).

## Deferral dispositions

- `D-STB.5b-4` → **PARTIAL** (code-fixed; live T14-class leg owed)
- `D-STB.5b-5` → **PARTIAL** (code-fixed; live outline leg owed — blocks B19B/D-P0.15-3)
- `D-OBS.1-3` → stays **OPEN** (N4 leg fixed; owed: reseat run + clean sweep on deployed tip)
- `D-MAINT.3-1` → **new row, PARTIAL** (code-fixed; live browser leg owed)

## Verification

- `pnpm exec vitest run apps/api/src/triage-routes.test.ts` — 17/17
- `pnpm exec vitest run packages/obligations` — 55/55 (incl. the new stale-fold test)
- `pnpm exec vitest run apps/run-task/src/scoped-phase.test.ts` — 13/13
- `pnpm exec vitest run apps/web/src/server.test.ts` — 105/105
- `pnpm turbo typecheck lint` on the 5 touched packages — 35 tasks green
- `pnpm --filter @rhema/journeys build` — green (DOM-lib evaluate types)
- `pnpm test` (full suite) — 4,565 pass / 2 fail, **both baseline reds pre-existing on `b51f80b`,
  both fixed in this run (BL-02 hygiene class):**
  - `packages/journeys/src/registry.ts` tripped the system-pool-boundary scanner — its T3
    green-note *literally spelled* `systemExec` (b51f80b added it). The note now says
    "system-pool token lookup"; no code touched the seam.
  - `check-coverage-matrix.test.mjs` rejected `MET-ENGINEERED(D-RES.1-2)` — REC.1 invented a
    non-vocabulary verdict for REQ-SPEC-31 (pre-REC.1 value: `MET`; the D-RES.1-2 ref already
    lives in the note cell). Restored `MET`; 6/6 checker tests green.
- `git diff --check` — clean
- `check-build-memory.sh .` — 0 violations (warnings baseline-class; the new BUILD_INDEX row lands with the PR number)
- `check-append-only.mjs --base b51f80b` — OK

## Owed (honest)

- Live re-verification of all four fixes on the deployed tip (rides the next deploy/funded
  window — not run: $0 constraint).
- The N9 reseat run (a prod write — script ready).
- Leg-1a zero-coverage diagnosis (recorded in FUNDED §B.4; a separate investigation row).
- The 429 magic-link throttle on N8/N9 sweeps (transient; noted on D-OBS.1-3).

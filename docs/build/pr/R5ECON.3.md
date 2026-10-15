# R5ECON.3 — Funded-window regime + driver-build prerequisites

Manifest row 160 · stacks on `stevevitali/r5econ-2-testcheaproute-arm` · merge policy
**OPERATOR** — do not merge from the build environment · contract
`docs/tickets/160_R5ECON.3__funded-window-regime.md` · run ledger
`docs/build/runs/R5ECON.3.md`.

## What lands

The window-opening regime is now mechanically checkable: per-leg caps live on the registry
verbatim, the ~$60 re-authorized envelope replaces the stale round-3 bound, the riders ride
the window's own deliveries instead of paying for parallel substrate, and
`funded-window.mjs --dry-run` prints the §5.5 checklist as pass/fail rows — so 166_GATE-R5F's
checklist is a command, and 167_FUNDED.1 is a leg-runner, not a design exercise.

- **The §5.3 cap table on the registry (REQ-ECON-9).** `JourneyStep.capUsd` — declared on all
  21 paid rows: B16 .50 · B17 1.00 · B18A/B 1.00 · B19A 3.50 · B19B 1.50 · B19C 15.00 ·
  N5 9.00 · N6 6.00 · N11 6.50 · R4 .50 · R6 4.50 · R9 .50 verbatim, the no-own-spend riders
  (T9, T10–T16) at the $0.50 floor, `CITE_PROBE_CAP_USD=9` for the non-registry probes.
  `legCapUsdFor` is the read seam; `finishLeg` now enforces `ctx.step.capUsd` — the registry
  is the ONE cap authority (`STB5B_CAPS` survives only as a derived view). Dispatches refuse
  uncapped paid legs: `rhema-journeys --paid` exits 2 and `funded-window.mjs` exits 3 when a
  selected paid step declares no cap ≥ the floor.
- **`window-plan.ts` — the regime's vocabulary.** `FUNDED_WINDOW_CAP_USD=60` (ratified
  Q-ECON.f); the census classes (`free · prestep · launcher · rider · conditional`);
  `orderWindowSteps` (T9 → launchers → riders → B19C last, registry order inside each class —
  a `--steps` CSV can never invert the ordering); `planWindowDispatch` (cap presence + Σ caps
  = the required headroom — the full paid registry asks $54.50, inside the envelope);
  `windowChecklist`, the pure evaluator for the nine §5.5 rows.
- **`funded-window.mjs` rewritten (REQ-FND-8).** `--dry-run` prints the checklist — system-role
  DSN · cumulative < ~$60 (pinned `FLAGGED_PROXY_SPEND_SCOPE` + `req_jrn_` exclusion, both
  queries) · required `--headroom` covering summed caps · per-leg cap enforcement proven by a
  synthetic `CapOverrunError` probe · ordering · the `JOURNEY_FUNDED_STABLE_TAG` tenant probe
  (`is_test` + age < `TEST_TENANT_PURGE_HOURS`) · REQ-ECON-6 exclusions · REQ-ECON-11 opt-outs
  · unpaused — every row fail-closed when unmeasurable. Live dispatch orders the selected
  steps, refuses `headroom < Σ caps` and `cumulative + headroom ≥ $60`, and keeps the pause
  sentinel verbatim.
- **Rider consolidation (REQ-FND-6).** T15 first probes the tenant for a REAL open gate (the
  inbox group-1a predicate) — the substrate B19A/B19B's new `JOURNEY_FUNDED_HOLD_GATE` arm
  parks (hold ⇒ owed-held + a hold file; a re-run resumes at the gate decision, never
  re-launches); the seeded dossier stays the no-window fallback. T16 keeps the seeded
  `persona_profiles` substrate — ratified Q-ECON.g — annotated. R9 probes for §14.4-eligible
  delivered runs (refundable state, non-entitlement, inside `REFUND_WINDOW_DAYS`, net debits
  > 0, no prior request) and launches its own pair only for the shortfall.
- **Driver builds (REQ-FND-7).** `scripts/live/funded-tenant.mjs` — dry-run-first tenant prep:
  probe rows + the printed `admin-cli house-grant` command + the purge-exemption arm
  (`created_at` freshness vs the 26h sweep) gated behind `--execute`.
  `scripts/live/lever-pair.mjs` — the ECON.2 OFF/ON pair driver (D-ECON.2-2/-3/-4): `LEVER`
  +`ARM` or `LEVERS_JSON`, is_test-verified pre-launch, and it REFUSES the row when the frozen
  `input_snapshot.cogsLevers` doesn't match the posted arm — no unlabeled measurements.
  `scripts/live/bl20-legs.mjs` — the BL-20 ≤$5 pair (D-P1.11-1 + D-DEF.1-1): thread →
  chat_turn → planCard.researchSheetHref → `plan-decision{run_research}` proved sheet-NOT-run
  → the fetch-decomposable research_burst leg with `fetch_log`/phase evidence.
  D-RES.3-1 stays a named prerequisite (the protocol/orchestrator product change must land
  first) — all six rows carry a dated note in DEFERRALS.md.

## What changed

- `packages/journeys/src/registry.ts` — `capUsd` on the step type + all 21 paid rows;
  `legCapUsdFor`.
- `packages/journeys/src/window-plan.ts` (new) — the regime constants/classes/ordering/plan/
  checklist + `window-plan.test.ts` (16 tests).
- `packages/journeys/src/stb5b.ts` — registry-sourced `capUsd` in `finishLeg`; the
  `JOURNEY_FUNDED_HOLD_GATE` hold file + hold/resume arms on B19A/B19B.
- `packages/journeys/src/stb5b-helpers.ts` — `STB5B_CAPS` is now the derived view of the
  registry (one source of truth).
- `packages/journeys/src/stb5a.ts` — `ridingOpenGate` + the T15 ride arm; T16 annotation.
- `packages/journeys/src/steps.ts` — `ridingRefundTargets` + the R9 ride arm.
- `packages/journeys/src/cli.ts` + `index.ts` — the cap-presence pre-flight; window-plan
  exports.
- `scripts/live/funded-window.mjs` + `funded-window.test.mjs` — the rewrite + 13 source pins.
- `scripts/live/funded-tenant.mjs` · `lever-pair.mjs` · `bl20-legs.mjs` — the new drivers.
- `docs/tickets/DEFERRALS.md` — dated driver/prerequisite notes on D-P1.11-1, D-DEF.1-1,
  D-ECON.2-2/-3/-4, D-RES.3-1.
- `docs/build/runs/R5ECON.3.md` — the run ledger.

## Test plan (deterministic only)

| Contract clause | Test |
|---|---|
| §5.3 caps verbatim on every paid row + ≥ the floor | `registry.test.ts` |
| Ordering T9 → launchers → riders → B19C; classes; Σ-caps headroom | `window-plan.test.ts` |
| Checklist rows pass/fail closed incl. every threshold | `window-plan.test.ts` |
| `finishLeg` reads the registry cap; the derived view agrees | `stb5b.test.ts` |
| `--dry-run`, $60 envelope, ordering, headroom coverage, tenant probe, pause, DSN fail-closed | `funded-window.test.mjs` (13 source pins) |
| Paid dispatch refuses uncapped legs | cli.ts cap block (reviewed; the refusal is exit-2 misuse) |
| `--dry-run` prints §5.5 pass/fail rows | captured transcript — 6/9 pass offline, DSN rows fail closed |
| Each non-registry item has a driver or a named D-row | the three scripts fail-closed w/o env; DEFERRALS notes |

## Boundaries

No paid leg ran; no tenant seeded; no purge exemption executed; no prod writes, deploys, real
DSNs, or provider calls. `funded-tenant.mjs` is committed unexecuted — its `--execute` arm and
the printed grant belong to the operator under 166_GATE-R5F. Live verification of every rider
arm is honestly gate-pending; the deterministic regime is fully covered.

Requirement ids stamped: **REQ-FND-6 · REQ-FND-7 · REQ-FND-8 · REQ-ECON-9 (caps-in-registry half)**.

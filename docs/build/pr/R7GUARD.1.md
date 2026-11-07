# R7GUARD.1 — Recurrence guards: no-raw-controls global + the pane-occlusion check in CI

Ticket 249 (round 7 / R7b). `implement-spec`, `live_verification=false` — **Stage A only, $0**;
no preview, no production (GD-PREVIEW.R7). Requirement ids satisfied and stamped:
**REQ-GUARD-1, REQ-GUARD-4, REQ-PANE-4** (CI arm); REQ-GUARD-2 / REQ-GUARD-3 stamped
"wiring verified" only.

Second attempt: the first stopped at its own bound; insert 248a_R7KIT.3f landed the 29-file
migrate-tail with a 0-diagnostics dry-run that cleared this flip — the forecast held at **0
residue** under `pnpm turbo lint`.

## What changed

- **GUARD-1 global** (`eslint.config.js`): the per-batch enablement list collapses into one
  `error` block over `packages/ui/src/**` + `apps/web/src/**/*.tsx`, ignoring `primitives/**`
  and `*.test.{ts,tsx,mts,mjs}`. The committed no-JS/SSR exemption list stays data acting
  inside the rule — an unlisted raw control fails even in an exempt-looking file.
- **Rule test rewritten** (`no-raw-controls.test.ts`): `calculateConfigForFile` proves `error`
  per glob (incl. never-batched files and `error`-configured exempt files), absent on
  primitives/tests/out-of-scope; seeded raw-control/style-literal legs fail; component-scoped
  exemption applies only to its named component.
- **GUARD-4 tour arm** (`u3-probe.ts`): new shared `u3UnscrimmedViolation` — the in-page
  un-scrimmed-overlay census (`.ide-panel` minus its scrim, `.ui-dialog`/`.ui-sheet` minus
  `.ui-dialog-overlay`, `.ui-menu`/`.ui-popover`/`.ui-select-content`/`.ui-tooltip`, and the
  `[data-demo-tour]` mark with centre-point semantics). The deployed `U3.occlusion` leg now
  walks `TOUR_STEPS` targets at 390×844 with the same assertion; the list is exported from
  `r7legs.ts` and pinned id-for-id to `DEMO_TOUR_STEPS` by the wiring test.
- **Local walk + negatives** (`u3-occlusion.local.test.ts`): all 11 tour steps × 5 REQ-PANE-4
  sizes (55 checks, zero violations); seeded legs — a fixed `.ide-panel` over `.ide-page
  .paper` fails `u3ProbePage`, and `.ui-menu`/`[data-demo-tour]` overlays over the verdict
  target's centre violate. Chromium/server absence fails hard under CI.
- **Wiring + docs** (`scripts/ci/guards-wiring.test.mjs` + `neutral-readers.txt` +
  `docs/ci.md`): the three full-path-gated carrier steps (`turbo build lint typecheck`,
  chromium install, `pnpm test`), all four guards' carriers present, ci.md names each
  guard's job.

## Evidence

- `pnpm turbo lint` — **0 diagnostics** over the 122-file scope.
- `no-raw-controls.test.ts` 21/21 · `guards-wiring.test.mjs` 7/7 · journeys suite **219/219**.
- `u3-occlusion.local.test.ts` 3/3 — five-size probe, 55-step tour arm, seeded negatives.
- `check:dom-contract`/`spa-entry-graph`/`spa-budget`/`spa-env`/`protocol-markers`/`licenses`/
  `no-cookies`/`demo-corpus` all green.
- Screenshots: `docs/build/reports/2026-11-07_r7guard-1-u3/`.
- Entry: 244.3/300.0 kB; **+33.2 kB cumulative vs `04a4e98b`, +0.0 kB this ticket**
  (GD-KIT3A-BUDGET / GD-SPA-ENTRY.R7 stand). CI cost: ≈ +11 s on the unit leg.

## Owed

`D-R7GUARD.1-1` (kind P → 250_R7DEP.2): `U3.occlusion` green across the five sizes at the
preview SHA and the deployed R7b SHA, screenshots under `docs/build/runs/R7GUARD.1/`.
`U3.occlusion` stays `expected:"red"`.

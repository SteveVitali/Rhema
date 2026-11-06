# R7KIT.3b — run ledger

- **Ticket:** `docs/tickets/241_R7KIT.3b__migrate-run-sheet-export.md` (row 241 of 254, round 7 R7b)
- **Harness:** devin-desktop/swe-2-high/subagent (BM-HARNESS-01)
- **Branch:** `stevevitali/r7kit-3b-run-sheet` (forked at chainTip `7563e4c7`) · **PR base:** `stevevitali/r7kit-3a2-voices` · mergePolicy: OPERATOR
- **Spend:** $0 — Stage A only (`GD-PREVIEW.R7`; no preview, no production mutation, no run launched)
- **Requirements:** REQ-KIT-3 (batch b), REQ-COPY-5, REQ-KIT-5 (allowance), REQ-GUARD-1 (batch-b enablement). Findings: E1, D5, G6, I1, I3, UXC-16.
- **Requirement ids stamped in the PR:** REQ-KIT-3, REQ-COPY-5, REQ-KIT-5, REQ-GUARD-1.

## Plan

1. **One number formatter** in `@rhema/contracts` `domain/estimate.ts` (the module that already owns
   money vocabulary — the ticket's call, recorded here): `formatRate` (bounded ≤4-decimal precision —
   "0.023000000000000003" impossible by construction), the D5 sentence generators
   (`includedCreditsLine`, `bucketExpiryLine`), and `MONEY_FMT_INLINE_JS` (the no-JS script's usd/cr
   source, parity-tested against `formatUsd`/`formatCredits`). `formatUsd`/`formatCredits`/`estimateLine`/
   `creditsLine` already live here and stay the canonical implementations — call sites converge on them.
2. **Migrations** (225/225a primitives, `uiCss()` classes, hooks preserved):
   `apps/web/src/spa/surfaces/{run-sheet,export,onboarding}.tsx`. Radios → Radix RadioGroup (hidden
   `<input type="radio">` carriers keep the `name=` field map), selects → `Select` (hidden `<select>`
   carrier), checkboxes → `Checkbox`, text/number inputs → `TextField`, textareas → `TextArea`,
   buttons → `Button`; the dozen-plus hidden run-sheet carriers → the `HiddenField` exemption
   component (RV-36).
3. **GUARD-1 enabled** for the three files (`NO_RAW_CONTROLS_ENABLED`); exemptions appended for
   `HiddenField` (both files) and `FileDropzone`'s visually-hidden file proxy.
4. **REQ-COPY-5 call sites:** run-sheet surface (`toLocaleString`/`toFixed` → `formatCredits`/
   `formatUsd`), usage (`credits()` helper + `.toLocaleString` → `formatCredits`), the shared
   `packages/ui/src/run-sheet.tsx` helper call sites + its inline-script `usd`/`cr` (now emitted from
   `MONEY_FMT_INLINE_JS`), and `packages/run-sheet/src/view.ts` `renderWhyLine` (E1's float-noise line
   → `formatRate`).
5. **D5 sentences:** `includedFmt`/`nextExpiryFmt` replaced by generated lines — remaining > monthly
   (rollover/top-up) renders `includedOverFmt`, never "4,000 of 2,000"; the expiry line renders exactly
   one "credits" noun via `expiryBucketLabels` + normalization.
6. **E1 dedup (P2):** `lede`/`meteredNote` render as ONE paragraph; the "never more than the cap" claim
   appears once.

## Test matrix

| AC | Leg | Evidence |
|---|---|---|
| GUARD-1 on + seeded raw fails | `tools/eslint-plugin-rhema/rules/no-raw-controls.test.ts` batch-b legs | pending |
| Existing DOM tests + dom-contract, hooks preserved, one `<Paywall>` | `run-sheet/export/onboarding/usage.dom.test`, `paywall.test`, `pnpm check:dom-contract` | pending |
| Formatter tests (rates ≤4dp property test, credits↔$, grouping, 0/neg/null) | `packages/contracts/src/domain/number-format.test.ts` | pending |
| D5 sentence tests + no `toFixed(`/`toLocaleString(` on money/credits in migrated files + shared helpers | `number-format.test.ts` + `apps/web/src/spa/money-format.test.ts` (grep leg) | pending |
| `check:spa-budget` + entry delta, `spa-env`, vocab lints | `pnpm check:spa-budget`, `check:spa-env` | pending |
| Stage B owed to 250 | `D-R7KIT.3b-1` in DEFERRALS | pending |

## Evidence log

- `turbo build` — PASS (all 13 tasks incl. `@rhema/web` vite build).
- `turbo typecheck` (web/ui/contracts/run-sheet) — PASS (17/17).
- `turbo lint` — PASS (one pre-existing warning in `chat-live.tsx`, untouched).
- `vitest apps/web/src` — **1599/1599** (93 files): run-sheet dom 24 (Radix-driven legs updated), export dom, onboarding dom, usage dom, `money-format` 6 (zero `toFixed(`/`toLocaleString(` in the six files), copy-containment.
- `vitest packages/ui` — **157/157** (incl. `ui-css.test.ts` bound leg).
- `vitest packages/contracts` + `packages/run-sheet` + `tools/eslint-plugin-rhema` — **450/450** (incl. `number-format.test.ts`: rate ≤4dp property sweep, credits+$ pairing, `MONEY_FMT_INLINE_JS` parity, D5 sentences; `no-raw-controls.test.ts` batch-b legs — rule ON + seeded raw control fails on all three files).
- `pnpm check:dom-contract` — OK (run-sheet 71 / export 21 / onboarding 27 / usage 16 hooks emitted+asserted; `data-over` flagged and replaced by `.ui-ob-drop--over`).
- `pnpm check:spa-budget` — OK; **entry delta +15.5 kB gz vs `04a4e98b`** (WARN on the cumulative allowance — ticket increment **+0.2 kB** over the 240a head; parent's `GD-KIT3A-BUDGET` +0.3 deficit unchanged).
- `pnpm check:spa-env` — OK. `pnpm check:protocol-markers` — OK.
- `uiCss()` — **23,887 B ≤ 24,576 B** (my block added ~1.1 kB; cascade-identical dedup removed ~1.55 kB: the nine-rule disabled-state group, duplicated `focus-visible` rules, ~20 selector merges).
- Iterated fixes: `</button>`→`</Button>` mismatch; usd parity (inline `usd` must NOT group — `formatUsd` prints `$1000.00`); unused imports in `money-format.test.ts`; `data-over` attr → class (undocumented DOM hook); dom-test legs updated for primitive-driven radio/select interactions (verified happy-dom keyboard path).

## AC gap table (operating clauses 1–10)

| Clause | Held by |
|---|---|
| 1 dates from `date -u` | yes — all record stamps from the clock |
| 2 CI at exact head | pending — ci-boundary after push |
| 3 AC layers stated | yes — engineered here; Stage-B row reports owed, never green |
| 4 append-only records | yes — DEFERRALS/LEDGER/BUILD_INDEX appends only |
| 5 gate words verbatim | yes — `GD-PREVIEW.R7` quoted, not paraphrased |
| 6 no secrets/PII | yes — none touched |
| 7 harness in ledger header | yes — devin-desktop/swe-2-high/subagent |
| 8 no living-record pins | yes — tests pin source text + behavior, never ledger cells |
| 9 no ledger-only push | yes — records land before the first push |
| 10 full-CI cadence | boundary read accepts a fast-path pass per D4/D5 |

## Evidence report (final)

- **REQ-KIT-3 batch b** — run-sheet/export/onboarding(+usage) on 225/225a primitives; Radix hidden carriers keep the `name=` post grammar verbatim (run-sheet flat field map, export's native download POST, held-draft grammar); all `data-*` hooks emitted+asserted (`check:dom-contract`). **Layer:** unit + DOM + contract check.
- **REQ-COPY-5** — ONE formatter in `@rhema/contracts` `domain/estimate.ts` (home recorded); `formatRate` ≤4dp (E1), D5 generators, `MONEY_FMT_INLINE_JS` parity-tested; zero `toFixed(`/`toLocaleString(` in the six money files (grep leg). **Layer:** unit (property sweep, pairing, 0/neg/null, parity) + static grep + DOM.
- **REQ-GUARD-1** — enabled on the three files (`error`); exemptions only `HiddenField`×2 + `FileDropzone` proxy (RV-36, reasons recorded); seeded raw-control legs fail on all three. **Layer:** rule tests + enabled-config check.
- **REQ-KIT-5** — entry delta +15.5 kB vs `04a4e98b` (increment +0.2 kB over the 240a head; cumulative >15.0 WARN honestly declared, parent's `GD-KIT3A-BUDGET` deficit unchanged); `uiCss()` 23,887 ≤ 24,576 B. **Layer:** `check:spa-budget` + `ui-css.test.ts`.
- **E1 dedup** — lede+meteredNote render as one paragraph; the cap claim once.
- **Stage B** — `D-R7KIT.3b-1` OPEN → `250_R7DEP.2` (screenshots/provenance/computed-style at the R7b preview). Reported as owed, never green.
- **Spend:** $0. **CI:** pending — `docs/build/logs/ci-R7KIT.3b.json`.

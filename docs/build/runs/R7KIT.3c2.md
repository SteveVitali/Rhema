# R7KIT.3c2 — run ledger

- **Ticket:** `docs/tickets/242_R7KIT.3c2__migrate-outline-figures.md` (row 242 of 254, round 7 R7b)
- **Harness:** devin-desktop/swe-2-high/subagent (BM-HARNESS-01)
- **Branch:** `stevevitali/r7kit-3c2-outline-figures` (forked at chainTip `74890212`) · **PR base:** `stevevitali/r7kit-3b-run-sheet` · mergePolicy: OPERATOR
- **Spend:** $0 — Stage A only (`GD-PREVIEW.R7`; no preview, no production mutation, no run launched)
- **Requirements:** REQ-KIT-3 (batch c2), REQ-KIT-5 (allowance), REQ-GUARD-1 (batch-c2 enablement), REQ-KIT-1 (tokens consumed). Findings: RV-23, UXC-16, UXC-32, S-7, P4-21, REQ-TOUR-2.
- **Requirement ids stamped in the PR:** REQ-KIT-3, REQ-KIT-5, REQ-GUARD-1.

## Plan

1. **Migrations** (225/225a primitives, `uiCss()` classes, hooks + form grammar preserved):
   `apps/web/src/spa/surfaces/outline.tsx`, `apps/web/src/spa/surfaces/figures.tsx`,
   `packages/ui/src/outline-sections.tsx`. Buttons → `Button`, text/number inputs → `TextField`,
   textareas → `TextArea`, the specKind `<select>` → `Select`, the insist `<input type=checkbox>` →
   `Checkbox`; hidden no-JS carriers → the exempted `HiddenField`/`EdCheckbox` components (RV-36).
2. **Style-literal removal:** every banned style key (spacing/type/colour/radius/box metrics)
   goes through terse `.ui-c2-*`/`.ui-os-*` classes or reused `.ui-set-*`/`.ui-vc-*`/`.ui-inbox-row`;
   layout-only keys stay inline (not literals under the rule's own key list).
3. **`uiCss()` ≤ 24,576 B:** the c2 block needs ~2.6 kB; cascade-identical dedup (grouped selector
   hoists for repeated decls, groups placed so later modifier/state decls still win; pinned
   moved-export strings restored verbatim) frees the room.
4. **Tokens:** saved/inserted notes → `--state-ok`; the undefined `--sev-ok` reference removed.
   Named c2 usage leg in `contrast.test.ts` (both themes).
5. **GUARD-1 enabled** on the three files; exemptions only `HiddenField` (×2) + `EdCheckbox`;
   seeded raw-control legs fail on all three.
6. **Tests:** new `specKind:"image"` list + card DOM legs (S-7 / P4-21 — image renders, zero
   chart-spec controls, hook contract unchanged).

## Test matrix

| AC | Leg | Evidence |
|---|---|---|
| GUARD-1 enabled + passing on the c2 files; seeded raw control fails | `tools/eslint-plugin-rhema/rules/no-raw-controls.test.ts` batch-c2 legs | PASS — 21/21 (rule `error` on all three files; seeded `<button>` fails on each) |
| Outline + figures DOM tests pass with hooks preserved | `outline.dom.test.tsx` 21/21, `figures.dom.test.tsx` 31/31 | PASS |
| `check:dom-contract` | `pnpm check:dom-contract` | PASS (all hooks emitted+asserted) |
| Demo-bucket figure hooks from 220/221 unchanged | `data-figure-image` arm untouched in behaviour; dom-contract emitted | PASS |
| `specKind:"image"` figure in list + card — image renders, no chart-spec controls, hook matches pre-migration P4-21 contract | new DOM legs in `figures.dom.test.tsx` | PASS (list row `img[data-figure-image]`; card arm + negative sweep over `[data-figure-preview]`/`[data-type-chips]`/`[data-figure-fields]`/`[data-provenance]`/`[data-insert]`/`select[name=specKind]`) |
| KIT-1 token contrast covers outline "saved" + diff usages in both themes | `packages/tokens/src/contrast.test.ts` named c2 leg + existing floors | PASS (18/18) |
| `check:spa-budget`, `check:spa-env`, vocabulary lints | `pnpm check:spa-budget`, `check:spa-env`, `lint` | PASS (budget WARN on cumulative >15.0 — see entry delta) |
| `uiCss()` ≤ 24 kB | `ui-css.test.ts` bound leg | PASS — 24,430/24,576 B |
| Stage-B deferred to 250 | `D-R7KIT.3c2-1` in DEFERRALS | OPEN — reported owed, never green |

## Evidence log

- `turbo build` — PASS (all tasks incl. `@rhema/web` vite build for the budget check).
- `typecheck` (`@rhema/ui`, `@rhema/web`) — PASS.
- `lint` — PASS on all three enabled files (zero problems); repo-wide: one pre-existing `chat-live.tsx` warning, untouched.
- `vitest apps/web/src` — **1601/1601** (93 files): outline dom 21/21, figures dom 31/31 incl. the two new `specKind:"image"` legs, axe legs green.
- `vitest packages/ui packages/tokens` — **203/203** (incl. `ui-css.test.ts` — 24,430 B ≤ 24,576; `contrast.test.ts` 18/18).
- `vitest tools/eslint-plugin-rhema/rules/no-raw-controls.test.ts` — **21/21** (enablement matrix incl. the three c2 files; seeded `<button>` fails on each).
- `pnpm check:dom-contract` — OK (journey selectors ⊆ manifest ⊆ emitted+asserted).
- `pnpm check:spa-budget` — OK with WARN: **entry delta +15.5 kB gz vs `04a4e98b`** — ticket increment **+0.0 kB** (Radix `Select`/`Checkbox` leaf-chunk as `select-*.js`/`toggles-*.js` async; static primitive cost already in the entry graph). The +0.5 cumulative over-allowance is 240's `GD-KIT3A-BUDGET`-ruled COPY-map deficit — unchanged, honestly stated.
- `pnpm check:spa-env` — OK. `pnpm check:protocol-markers` — OK.
- `uiCss()` — 23,887 → 26,931 (raw c2 block) → **24,430 B** after cascade-identical dedup (font-size/colour/display/flex-wrap/gap/radius decls hoisted into grouped selectors at the array head — a hoisted decl can only LOSE conflicts it previously lost to later rules; the pinned `.ui-pill`/`.ui-action-link` strings restored verbatim — `ui-css.test.ts` 6/6).
- Iterated fixes: `--sev-ok`-style muted/faint stragglers (`{F.empty}`/`{V.notFound}` arms); `.ui-c2-s`/`.ui-c2-as` classes folded into composed class sets; `.ui-os-t` removed from the muted group (claim text stays `--shell-fg`); `IMAGE_ITEM` fixture asset URI corrected to the REQ-DWEB-17 route shape.
- Prettier applied to the touched files (the diff noise in `figures.dom.test.tsx` is reflow, not content).

## AC gap table

| AC | Status |
|---|---|
| GUARD-1 enabled + passing; seeded raw control fails | GREEN at this head |
| Outline + figures DOM tests + `check:dom-contract` pass, hooks preserved | GREEN |
| Demo-bucket figure hooks unchanged | GREEN |
| `specKind:"image"` list + card legs | GREEN |
| KIT-1 token contrast coverage (saved/diff, both themes) | GREEN |
| `check:spa-budget`/`spa-env`/vocab lints | GREEN (budget WARN declared) |
| Stage-B screenshots + computed-style probe | **OWED — `D-R7KIT.3c2-1` → 250_R7DEP.2** |

## Evidence report

- Changed lines: ~1,190 across 9 files (implementation ~600; test additions ~120; prettier reflow + dedup noise the rest). Estimate "~350" exceeded — the dedup pass and DOM-test legs account for it; no extra scope absorbed.
- Entry delta vs `04a4e98b`: **+15.5 kB gz** (increment **+0.0 kB**; cumulative over-allowance is the parent's ruled deficit).
- `uiCss()` 24,430/24,576 B.
- Deferrals: opened `D-R7KIT.3c2-1`; none closed.
- Judgment calls: (a) `specKind` "auto" rides the `"auto"` item value — Radix forbids empty Item values; the api maps non-enum values to auto exactly as the old `""` did (post grammar unchanged); (b) `EdCheckbox` keeps a native checkbox inside the SSR gate card — a Radix toggle is inert without JS there; (c) the uiCss dedup preserves computed values by construction (hoisted groups sit at the array head; every later same-specificity decl still wins) — computed-style probing at 250 is the deployed proof.

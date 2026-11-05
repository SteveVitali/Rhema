# R7KIT.2b — Form and menu primitives + the REQ-GUARD-1 `no-raw-controls` rule (authored off) (run ledger)

- **Spec:** `docs/tickets/225a_R7KIT.2b__primitives-forms-guard-rule.md` (manifest row 225a, phase
  round 7 / R7b). Round-7 posture: `GD-PREVIEW.R7` (no per-ticket previews), **$0 spend**,
  repo-only; Stage A only (unit + DOM + lint-rule tests plus a local build; no surface changes).
  mergePolicy=OPERATOR — never merge. LAUNCHED — prod serves `4bc8cf4a`; zero prod mutations.
- **Normative loads:** the ticket's Load list — `docs/round-7-draft-spec.md` §3.2 ADR-129, §4.6
  REQ-KIT-2/5, §4.16 REQ-GUARD-1, §8 items 3/5/7; `R6-ux-code-audit.md` §4/§8 + UXC-15/18;
  `R5-ux-browser-audit.md` C6 (static chip ≠ clickable); `REVIEW-round-7-draft-spec.md` RV-16
  (guard scope), RV-36 (native fallback stays); 225_R7KIT.2 as landed (`primitives/`, `uiCss()`,
  entry-graph guard, delta report, ADR-129); 210_R7KIT.1's KIT-1 base-layer selectors (the
  no-JS/SSR controls the exemption list names); `00_MANIFEST.md` § invariants + operating rules.
- **Base:** `stevevitali/r7kit-2-primitives` @ `15a5fb7e` (chainTip; PRs #240–#262 unmerged per
  OPERATOR).
- **Branch:** `stevevitali/r7kit-2b-forms-guard` · **Harness:** devin-desktop/swe-2-high/subagent
  · **Skills:** implement-spec + build-memory + self-review @ `~/agent-skills`
- **Started:** 2026-11-05T05:30Z · **Closed:** _pending_
- **ci:** _pending_
- **Production mutations:** none (repo-only; external acts are read-only `gh`/`ci-boundary` reads).

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Open round-7 rows: **D-R7OPEN.1-1** (R7b legs
→ 250_R7DEP.2), **D-R7KIT.1-1** (six-surface deployed probe — owed to a deployed R7b tip),
**D-R7COPY.0-1**, **D-R7DEM.5-1**, **D-R7DEM.6b-1** (prod arms owed to later deploy walks),
**D-R7DEM.2c-1** (owner 253). None is unblocked by this ticket (unit/DOM/lint-rule scope only);
none is closed here. No gate rows scoped to this phase.

## Requirements (from the contract)

1. Radix wrappers under `packages/ui/src/primitives/` (REQ-KIT-2): Popover, ContextMenu, Select,
   Tabs, Checkbox, RadioGroup, Switch — leaf chunks only (REQ-KIT-5; the 225 entry-graph guard
   already denies these `@radix-ui/react-*` paths in the entry).
2. cmdk (REQ-KIT-2): a Combobox + the palette list base (the palette surface itself is 228's).
3. In-house (REQ-KIT-2): TextField; TextArea (auto-grow); RadioCards; two-variant Chip [C6] —
   static has no interactive role/tabindex/pointer affordance, existing call sites render
   unchanged; EmptyState; Accordion. Every primitive forwards `ref`/`data-*`/ARIA; no user-facing
   text (REQ-UX-12); styling from `uiCss()` within the ≤ 24 kB bound; no inline literals.
4. `rhema/no-raw-controls` authored OFF (REQ-GUARD-1): bans raw `<button|input|select|textarea>`
   + inline spacing/type/colour/radius literals; scope `packages/ui/src/**` except `primitives/**`
   plus `apps/web/src/**/*.tsx` (RV-16); named no-JS/SSR exemption list; per-file enablement list
   that KIT-3 batches append to — registered `off` globally, enabled list empty here.
5. ADR-129 dated append: the GUARD-1 rule name, the enablement-list mechanism, the exemption
   list, this ticket's primitive set.
6. No new dependency expected (REQ-DOPS-8 re-asserted if one lands).

## Acceptance criteria

Tracked in the ticket file; the gap table below carries one row per AC + the operating clauses.

## Plan

- Primitives in `packages/ui/src/primitives/`: `popover.tsx`, `context-menu.tsx`, `select.tsx`,
  `tabs.tsx`, `toggles.tsx` (Checkbox/RadioGroup/Switch), `combobox.tsx` (Combobox + PaletteList),
  `fields.tsx` (TextField/TextArea/RadioCards), `surfaces.tsx` (EmptyState/Accordion), two-variant
  Chip in `chips.tsx`; `index.ts` barrels extended.
- `ui-css.ts` extended with the new `.ui-*` rule families inside the ≤ 24 kB bound.
- The rule: `tools/eslint-plugin-rhema/rules/no-raw-controls.js` + `no-raw-controls-exemptions.js`
  (committed data: file[/component] + reason), registered in `index.js`; `eslint.config.js` gets
  the scoped-`off` block + the empty `NO_RAW_CONTROLS_ENABLED` list the batches append to.
- ADR-129 dated append; run ledger + PR body + BUILD_INDEX/LEDGER close.

## Test matrix (per AC)

- AC primitives: `primitives/forms.dom.test.tsx` (happy-dom) — render, keyboard, ref/`data-*`/ARIA
  forwarding, `.ui-*` theme classes per primitive + the pinned cases (static Chip no interactive
  role/tabindex/pointer; existing Chip call sites render unchanged via inline snapshot; TextArea
  auto-grow via stubbed scrollHeight; Select/Popover/ContextMenu keyboard-only; Combobox
  filter+select by keyboard).
- AC uiCss bound: `ui-css.test.ts` additions — ≤ 24 kB raw still, every new class family emitted;
  `no-inline-literals.test.ts` covers the new files automatically.
- AC entry guard: `check:spa-entry-graph` green at head; `check:spa-budget` prints this ticket's
  entry delta (expect ≈ 0 — nothing in the entry imports these).
- AC rule: `no-raw-controls.test.ts` — positive (raw control / style literal fails), negative
  (primitive/`--*` var pass), exemption (listed file passes, unlisted fails, component scope),
  per-file-enablement (config-resolution via the real `eslint.config.js`: off over scope, a
  seeded enabled entry turns it error).
- AC checks: `check:spa-budget`/`spa-env`/`dom-contract`/`licenses`/`protocol-markers` all run;
  no ceiling raised.

## Progress

- 2026-11-05T05:30Z — branch `stevevitali/r7kit-2b-forms-guard` cut at `15a5fb7e` (chainTip).
  Load docs + anchors read. `pnpm install --frozen-lockfile` clean; baseline
  `pnpm turbo build --filter=@rhema/ui... --filter=@rhema/web` green at base (13/13 tasks).
- Design decisions taken: exemption list = committed data module
  (`rules/no-raw-controls-exemptions.js`, `{file, component?, reason}`) consumed as the rule's
  default option; enablement = `NO_RAW_CONTROLS_ENABLED` files-list in `eslint.config.js`
  (empty here — a conditional block turns `error` on per listed file; 249 collapses to global);
  Chip variant inferred from `href`/`onSelect` with an explicit `variant` escape — existing
  call-site markup kept byte-identical.

## Test matrix

_(planned above; results land in the evidence log)_

## Gap table

| item (spec §) | required layer | achieved layer | status | evidence |
|---|---|---|---|---|
| Radix wrappers Popover/ContextMenu/Select/Tabs/Checkbox/RadioGroup/Switch, leaf chunks only (d1; REQ-KIT-2/5) | engineered | engineered | **met** | `primitives/{popover,context-menu,select,tabs,toggles}.tsx`; entry guard already denies these `@radix-ui/*` paths — `check:spa-entry-graph` green at head (7 chunks, none denied); `forms.dom.test.tsx` keyboard legs |
| cmdk Combobox + palette list base (d2; REQ-KIT-2) | engineered | engineered | **met** | `primitives/combobox.tsx` — `Combobox` (`inputLabel` required; `label` on Command root — the aria-labelledby source) + `PaletteList` groups/empty/onSelect; DOM legs filter-by-typing + keyboard select + empty label + grouped render |
| In-house: TextField/TextArea(auto-grow)/RadioCards/2-variant Chip[C6]/EmptyState/Accordion; ref/`data-*`/ARIA; no copy; `uiCss()` ≤24 kB; no inline literals (d3; REQ-KIT-2, REQ-UX-12) | engineered | engineered | **met** | `primitives/{fields,surfaces}.tsx`, `chips.tsx` two-variant Chip; `forms.dom.test.tsx` 20 legs — static Chip no role/tabindex + `.ui-chip` has no `cursor` (only `button.ui-chip`); before/after inline snapshot byte-identical; TextArea auto-grow via stubbed `scrollHeight` (96px); autoGrow=false leaves height; RadioCards APG semantics + hidden input; `type-contracts.ts` `@ts-expect-error` (Combobox `inputLabel`, RadioCards `aria-label`); `ui-css.test.ts` ≤24 kB + family coverage + C6 pin; `no-inline-literals.test.ts` scans all new sources |
| `rhema/no-raw-controls` authored OFF: raw control + style-literal bans; scope `packages/ui/src/**` ex-`primitives/**` + `apps/web/src/**/*.tsx` (RV-16); no-JS/SSR exemption list; per-file enablement list, empty (d4; REQ-GUARD-1) | engineered | engineered | **met** | `rules/no-raw-controls.js` + `no-raw-controls-exemptions.js` (`{file, component?, reason}`; seeded pages/marketing/page-chrome per RV-36) + plugin `index.js` (`noRawControlsExemptions` exposed); `eslint.config.js` `NO_RAW_CONTROLS_ENABLED=[]` + scoped-`off` block + conditional `error` block; `no-raw-controls.test.ts` 21 legs — RuleTester pos/neg/exemption/component-scope, committed-data shape, real-config resolution (`off` over scope, absent primitives/out-of-scope), seeded-enablement lintText (error on named file, off on sibling, exemption wins) |
| ADR-129 dated append: rule name, enablement mechanism, exemption list, primitive set (d5) | engineered | engineered | **met** | `docs/adr/ADR-129-…` "## Dated note — 2026-11-05 (225a_R7KIT.2b)" appended |
| No new dependency (d6; REQ-DOPS-8) | engineered | engineered | **met** | `git diff packages/ui/package.json` empty — every primitive rides 225's exact pins (all React-19 compatible — the DEFERRALS fallback not needed, recorded in the ADR note) |
| AC: per-primitive DOM tests + the 5 pinned cases | engineered | engineered | **met** | `forms.dom.test.tsx` 20 legs incl. all pinned cases (above) |
| AC: `uiCss()` ≤24 kB + no-`style` scan green | engineered | engineered | **met** | `ui-css.test.ts` bound leg + `no-inline-literals.test.ts` 2/2 (scans all new files) |
| AC: entry-graph guard green; delta ≤15 kB stated in PR | engineered | engineered | **met** | `check:spa-entry-graph` OK (7 chunks); `check:spa-budget` — entry 173.4 kB/250 kB = base-head-identical; delta report −37.7 kB vs `04a4e98b` baseline (225's figure — this ticket adds **0 B** to the entry) |
| AC: rule tests (pos/neg/exemption/per-file-enablement); registered off; `turbo lint` green no new warnings | engineered | engineered | **met** | 21/21 legs; `pnpm turbo lint` 138/138 |
| AC: check:spa-budget/spa-env/dom-contract/licenses/protocol-markers green, no ceiling raised | engineered | engineered | **met** | all five green; `git diff apps/web/spa-budget.json` empty |
| Out-of-scope honoured (no surface migration, no enablement entries, no global flip, no palette surface, no SplitPane) | engineered | engineered | **met** | `git status` — no app-surface JSX touched; `NO_RAW_CONTROLS_ENABLED` empty; primitives/tests/rule/docs only |
| Universal phase-gate AC | engineered | engineered | **met** | this ledger + `pr/R7KIT.2b.md`; BUILD_INDEX row 264 + LEDGER advance; dates `date -u`; AC layers stated; append-only honoured; no living-record pins |

## Evidence log

- `pnpm turbo build --filter=@rhema/ui... --filter=@rhema/web` — 13/13 green at head.
- `pnpm turbo lint typecheck` — 138/138 tasks green; `@rhema/ui` lint + typecheck clean.
- `pnpm test` — **574 files, 6,806 pass / 6 skipped / 0 fail** (demo-side-effect report churn restored to HEAD — test side effect, not this ticket's diff).
- Touched suites: `forms.dom.test.tsx` 20/20 · `ui-css.test.ts` 6/6 · `no-inline-literals.test.ts` 2/2 · `no-raw-controls.test.ts` 21/21 · `primitives.dom.test.tsx` + `radix-import-policy.test.mjs` etc. green (all in the 6,806).
- `pnpm check:spa-budget` → entry graph **173.4 kB / 250.0 kB**, `entry delta vs baseline 04a4e98b: −37.7 kB` (same as 225's head → **0 B added by this ticket**); `SPA bundle budget OK`.
- `pnpm check:spa-entry-graph` → 7 entry chunks scanned, **none denied** (allowance: tooltip + dropdown-menu).
- `check:spa-env` OK (127 sources) · `check:dom-contract` OK · `check:protocol-markers` OK · `check:licenses` OK (873 pkgs).
- Implementation fixes during the run: packages/ui builds DOM-free (React `global.d.ts` stubs) → structural member assertions on `scrollHeight`/`style`/`focus` (documented); cmdk's hidden `<label>`+`aria-labelledby` overrides `aria-label` → `label` prop on Command root; Select first-item highlight on open (test ArrowUp returns to it); RadioGroup arrow leg via `fireEvent.keyDown`; docblock `*/` inside a `src/**` glob terminated the JSDoc early → reworded.
- No Stage-B leg (GD-PREVIEW.R7; $0; Stage A only) — nothing deferred by it.

## Evidence report

_(see `docs/build/pr/R7KIT.2b.md`)_

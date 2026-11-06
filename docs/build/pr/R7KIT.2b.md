# R7KIT.2b — Form and menu primitives + the REQ-GUARD-1 `no-raw-controls` rule (authored off)

**Spec:** `docs/tickets/225a_R7KIT.2b__primitives-forms-guard-rule.md` (manifest row 225a · phase round 7/R7b)
**Requirement ids:** REQ-KIT-2 (the rest: Popover, ContextMenu, Select, Tabs, Checkbox, RadioGroup, Switch, cmdk Combobox + palette list base, TextField, TextArea, RadioCards, two-variant Chip, EmptyState, Accordion), REQ-GUARD-1 (authoring — off), REQ-KIT-5 (allowance)
**Posture:** Stage A only, $0 · no prod mutations · mergePolicy OPERATOR · no preview (`GD-PREVIEW.R7`)

## Summary

Completes the round-7 component kit on 225's landed stack — the form/menu primitives the KIT-3
batches and R7b surfaces migrate onto — and authors `rhema/no-raw-controls`, the REQ-GUARD-1
recurrence guard, **off**. The rule bans raw `<button|input|select|textarea>` and inline
spacing/type/colour/radius literals across `packages/ui/src/**` (except `primitives/**`) and
`apps/web/src/**/*.tsx` (RV-16), carries the committed no-JS/SSR exemption list, and enables per
file through `NO_RAW_CONTROLS_ENABLED` (empty here — KIT-3 batches append; 249 goes global). No
surface is migrated; no new dependency (every wrapper rides 225's exact pins, all React-19-clean).

**This ticket's entry delta: ≈ 0 B added** — `check:spa-budget` prints **−37.7 kB gz** vs the
committed `04a4e98b` baseline (entry 173.4 kB / 250.0 kB ceiling — byte-identical to 225's head;
the −37.7 kB is 225's own `sideEffects` win). Nothing in the entry graph imports these
primitives; the sourcemap entry guard keeps every new `@radix-ui/react-*` out of the entry
(7 chunks scanned, none denied).

## What changed

- **`packages/ui/src/primitives/`** — new wrappers: `popover.tsx` (Popover + PopoverClose),
  `context-menu.tsx` (ContextMenu + Item/Label/Separator, shares `.ui-menu*`),
  `select.tsx` (items-as-data Select; trigger carries `ref`/`data-*`/ARIA; Lucide chevron/check),
  `tabs.tsx` (Radix composition), `toggles.tsx` (Checkbox, RadioGroup+Item, Switch),
  `combobox.tsx` (cmdk `Combobox` — required `inputLabel`, and `PaletteList`, the grouped list
  base 228's palette surface composes), `fields.tsx` (TextField; auto-grow TextArea — a measured
  `scrollHeight` imperative write, not a style literal; RadioCards — APG radiogroup over
  `role="radio"` cards with roving tabindex + optional hidden input for no-JS posts),
  `surfaces.tsx` (EmptyState; in-house Accordion — `aria-expanded` triggers, roving arrow focus).
  `chips.tsx` — the **two-variant Chip** (C6): static renders a `<span>` with no interactive
  role/tabindex/pointer (existing call-site markup byte-identical — inline-snapshot pinned);
  `href` ⇒ link, `onSelect` ⇒ `<button>`, explicit `variant` escape.
- **`ui-css.ts`** — the new `.ui-*` rule families inside the ≤ 24 kB bound (`ui-css.test.ts`
  asserts the bound + family coverage + the C6 pin: `.ui-chip` has no `cursor`, only
  `button.ui-chip` does). No inline literals in primitives (`no-inline-literals.test.ts`).
- **`tools/eslint-plugin-rhema/`** — `rules/no-raw-controls.js` (raw controls + banned style
  keys; `--*` custom properties pass; spread conservatively accepted; file/component-scoped
  exemptions from `no-raw-controls-exemptions.js`, the committed `{file, component?, reason}`
  data seeded with `pages.tsx`, `marketing.tsx`, `page-chrome.tsx` — the permanent no-JS/SSR
  KIT-1 fallback per RV-36), registered in `index.js`.
- **`eslint.config.js`** — `NO_RAW_CONTROLS_ENABLED = []` (the enablement list the KIT-3 batches
  append to) + the scoped-`off` block + the conditional `error` block that appears when the list
  is non-empty.
- **`type-contracts.ts`** — `@ts-expect-error` legs: `Combobox` without `inputLabel` and
  `RadioCards` without `aria-label` must not typecheck.
- **ADR-129 dated append** — rule name, enablement mechanism, exemption list, primitive set;
  no React-19 substitution needed (the ticket's DEFERRALS fallback stayed unused).

## Design decisions (ticket-owned)

- **Rule name + enablement list:** `rhema/no-raw-controls`, enabled per file by the committed
  `NO_RAW_CONTROLS_ENABLED` files-list — batch blocks append; 249 collapses to global `error`.
- **Exemption mechanism:** committed data `{file, component?, reason}` — file suffix-match;
  `component` narrows to that component's JSX (covers hidden inputs inside migrated files);
  the rule consumes it as the default option (`options.exemptions` overrides in tests) and the
  plugin exposes it as `noRawControlsExemptions`.
- **Two-variant Chip API:** `variant: "static" | "action"` inferred from `href`/`onSelect` —
  static markup unchanged for every existing call site.
- **Combobox/PaletteList API:** items/groups-as-data; cmdk's `label` prop (not `aria-label`) is
  the accessible-name path — the hidden `<label>`+`aria-labelledby` is what AT reads.
- **DOM-free package posture kept:** `packages/ui` compiles without DOM lib — the two needed
  DOM members are structurally asserted where used (scrollHeight/style write, focus roving).

## Verification

- `pnpm turbo build lint typecheck` — **138/138** tasks green (ui/web closure built 13/13).
- `pnpm test` — **574 files, 6,806 pass / 6 skipped / 0 fail**.
- Touched: `forms.dom.test.tsx` 20/20 (per-primitive render/keyboard/ref/`data-*`/ARIA/theme +
  all pinned cases) · `ui-css.test.ts` 6/6 (≤24 kB bound, C6) · `no-inline-literals.test.ts` 2/2 ·
  `no-raw-controls.test.ts` 21/21 (RuleTester pos/neg/exemption/component scope; committed-data
  shape; real `eslint.config.js` resolution — `off` over both scope globs, absent for
  `primitives/**` and out-of-scope paths; a seeded enabled file → `error`, sibling stays off,
  exemption wins) · `primitives.dom.test.tsx` + `radix-import-policy` + `check-spa-*` suites.
- `pnpm check:spa-budget` — entry **173.4 kB / 250.0 kB**, delta **−37.7 kB** of ≤15.0 kB (0 B
  added) · `check:spa-entry-graph` — 7 chunks, none denied · `check:spa-env`, `check:dom-contract`,
  `check:protocol-markers`, `check:licenses` (873) — all green; **no ceiling raised**.
- No Stage-B leg: `GD-PREVIEW.R7` / $0 / Stage A only — none owed, none deferred.

## Acceptance criteria → evidence

| AC | Layer | Evidence |
|---|---|---|
| Per-primitive DOM tests + the five pinned cases | engineered | `forms.dom.test.tsx` (20): static Chip no role/tabindex/pointer; call-site snapshot byte-identical; TextArea auto-grow; Select/Popover/ContextMenu keyboard; Combobox filter+select |
| `uiCss()` ≤ 24 kB + no-`style`-literal scan green | engineered | `ui-css.test.ts`; `no-inline-literals.test.ts` (2) |
| Entry guard green; delta ≤ 15 kB stated | engineered | `check:spa-entry-graph` OK; delta **−37.7 kB** (0 B added this ticket) |
| Rule: pos/neg/exemption/per-file-enablement tests; off; lint green | engineered | `no-raw-controls.test.ts` (21); `NO_RAW_CONTROLS_ENABLED=[]`; `turbo lint` 138/138 |
| check:spa-budget/spa-env/dom-contract/licenses/protocol-markers green, no ceiling raised | engineered | all five green; `spa-budget.json` untouched |
| Universal phase-gate AC | engineered | this body + `runs/R7KIT.2b.md` gap table; BUILD_INDEX 264; LEDGER advanced; append-only; `date -u` |

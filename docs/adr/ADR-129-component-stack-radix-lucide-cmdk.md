# ADR-129: Component stack — Radix per-package primitives, Lucide icons, `cmdk`; SplitPane choice by R7PANE.1

- **Status:** Accepted
- **Date:** 2026-11-03 (shell by R7OPEN.1); filled and accepted **2026-11-05** by 225_R7KIT.2.
- **Ticket:** R7OPEN.1 (shell); filled and accepted by **225 R7KIT.2**. The no-raw-controls rule
  item is **225a R7KIT.2b**'s; the SplitPane choice (`react-resizable-panels` vs in-house, under
  the REQ-KIT-5 budget rule) is **229 R7PANE.1**'s.
- **Requirement ids:** REQ-KIT-2/3/4/5, REQ-DOPS-8, REQ-GUARD-1, REQ-PANE-1
- **Spec:** `docs/round-7-draft-spec.md` §3.2 (ADR-129 bullets), §4.6, §4.7; `GD-UX-KIT.R7`

## Context

The operator ruled **"Radix primitives + Lucide"** (GD-UX-KIT.R7). Spec §3.2 enumerates:
Radix per-package primitives (`@radix-ui/react-*`; no meta-package), `lucide-react`, and
`cmdk` for Combobox and palette; `react-resizable-panels` *or* an in-house SplitPane — the
R7PANE.1 ticket chooses under the budget rule; all candidates are MIT/ISC and `check:licenses`
verifies; styling comes from a generated `uiCss()` in `@rhema/ui`; the no-raw-controls rule
(REQ-GUARD-1) and the per-ticket entry-delta allowance (REQ-KIT-5) apply.

R6's code audit (§4) counted 70 distinct padding literals, 7 radius values and zero shared
controls across the surfaces — every surface invents its own buttons (UXC-15) — and RV-15
measured the entry headroom thinner than the spec implied (~44 kB gz stale, re-measured at the
tip before any dependency landed: **216,153 B gz ≈ 211.1 kB** of the 250 kB ceiling at
`04a4e98b`).

## Decision

**The dependency stack, pinned once in `packages/ui/package.json`** (REQ-DOPS-8; `pnpm
check:licenses` green — every package MIT except `lucide-react` ISC, both allowlisted, no
exception rows):

| Package | Pin | Licence |
|---|---|---|
| `@radix-ui/react-dialog` | 1.3.1 | MIT |
| `@radix-ui/react-popover` | 1.3.1 | MIT |
| `@radix-ui/react-dropdown-menu` | 2.2.1 | MIT |
| `@radix-ui/react-context-menu` | 2.4.1 | MIT |
| `@radix-ui/react-select` | 2.4.1 | MIT |
| `@radix-ui/react-tabs` | 1.2.1 | MIT |
| `@radix-ui/react-tooltip` | 1.4.1 | MIT |
| `@radix-ui/react-checkbox` | 1.4.1 | MIT |
| `@radix-ui/react-radio-group` | 1.5.1 | MIT |
| `@radix-ui/react-switch` | 1.4.1 | MIT |
| `lucide-react` | 1.68.0 | ISC |
| `cmdk` | 1.1.1 | MIT |

All pins exact (no `^`/`~`); the Radix packages all declare React-19 peer support, so the
repo's React 19.3 pin is satisfied without a substitution. The whole stack lands in one ticket
even though the Select/Popover/ContextMenu/Tabs/Checkbox/RadioGroup/Switch/cmdk wrappers are
225a's — licence evidence and this listing happen in one place.

**Per-package import policy** (lint-enforced in `eslint.config.js`): the `radix-ui`
meta-package and any barrel/subpath of it are banned; `lucide-react` is named-icon-imports
only (deep `lucide-react/*`/`dist/*` paths are banned); `@radix-ui/react-icons` is banned —
Lucide is the one icon set.

**Entry-delta discipline** (REQ-KIT-5): the tip budget was re-measured BEFORE the stack
landed — `apps/web/spa-budget-baseline.json` (`04a4e98b`: entry 216,153 B / total JS 566,807 B
/ total CSS 0 B gz). `scripts/check-spa-budget.mjs` prints each run's entry delta against the
committed baseline keyed to the **≤ 15 kB gz per-ticket allowance**; every Stream-U PR states
its actual. The report flags an over-allowance delta loudly; the hard gate stays the
`entryGzipBytes` ceiling, which no ticket may raise without a ruling. This ticket's own entry
delta is reported in its PR.

**Entry-graph guard** (`scripts/check-spa-entry-graph.mjs`, `pnpm check:spa-entry-graph`,
wired into the `public-safe` CI job): Dialog/Select/Popover/ContextMenu-class primitives load
in leaf chunks only. The guard walks the manifest's transitive static entry graph and reads
each chunk's sourcemap `sources`; any `@radix-ui/react-{dialog,select,popover,context-menu,
tabs,checkbox,radio-group,switch}` path in the entry fails. The shell's allowance is exactly
Tooltip + DropdownMenu; shared internals (popper/menu/dismissable-layer…) are exempt — the map
proves only presence and the allowed parents legitimately pull them in.

**`uiCss()` lives in `@rhema/ui`** (the spec wins over R6 WP1's `@rhema/tokens` suggestion):
one generated stylesheet emitted beside `themeCss()`/`ideCss()` in the SPA shell and every SSR
head, driven by the token layer (`var(--s*)`, `var(--fs-*)`, `var(--radius-*)`, palette vars —
light and dark resolve through the one token set, no `[data-theme]` fork) plus the typed maps
(`LAYOUT.timelinePx`, `MOTION.paneMs`). Bound **≤ 24 kB raw** inlined per shell document,
asserted on the rendered document; primitives carry no inline spacing/type/colour/radius
literals (a source-scan test fails on any `style={…}` non-`--*` prop under `primitives/`).

**Native-fallback doctrine (RV-36):** KIT-1's token-styled native controls remain the
permanent no-JS/SSR control layer — Radix wrappers are enhancements over them, never a
replacement. The sheet keeps REQ-IDE-41: `Sheet` mounts on Radix Dialog with `modal={false}`
(no overlay, no focus trap, outside content stays focusable).

## Consequences

- The dependency stack lands once; 225a's form/menu primitives reuse these exact pins.
- Bundle cost is bounded by mechanism, not discipline: per-package imports +
  `sideEffects:false` keep unused primitives out of chunks; the entry-graph guard + the delta
  report make a violation loud at CI, not at review.
- The moved `primitives.tsx` exports keep their rendered declarations byte-for-byte (now in
  `.ui-*` rules) — the equivalence is test-pinned.
- 229 R7PANE.1 still chooses SplitPane; 225a still authors GUARD-1's mechanism.

## Alternatives considered

- **Radix meta-package (`radix-ui`)** — rejected: one import pulls every primitive into the
  consumer's chunk, defeating the leaf-chunk budget rule.
- **`react-resizable-panels` vs in-house SplitPane** — open; 229 decides under the ≤ 15 kB rule.
- **Per-component CSS-in-JS / inline styles** — rejected: R6's 70-padding sprawl is the bug
  being fixed; one generated stylesheet gives the token layer a single owner.

## Revisit trigger

`check:licenses` fails a candidate, the budget rule rejects both SplitPane options, a needed
primitive has no Radix implementation, or the icon set changes.

## Dated note — 2026-11-05 (225a_R7KIT.2b)

**The form/menu half of REQ-KIT-2 landed on the same pins** — no new dependency: the Radix
wrappers Popover (`primitives/popover.tsx`), ContextMenu (`context-menu.tsx`), Select
(`select.tsx`, items-as-data with the trigger carrying the DOM-contract hooks), Tabs
(`tabs.tsx`, Radix composition), and the toggles (`toggles.tsx` — Checkbox / RadioGroup+Item /
Switch, Lucide check glyph). The cmdk pair is `combobox.tsx`: `Combobox` (filter input + list;
`inputLabel` required — cmdk's hidden `<label>`+`aria-labelledby` is what assistive tech reads)
and `PaletteList` (the grouped `Command.List`/`Group`/`Item`/`Empty` base 228's palette surface
composes inside its own `Command` root). In-house (`fields.tsx`/`surfaces.tsx`): TextField,
auto-grow TextArea (measured `scrollHeight` imperative write, not a style literal), RadioCards
(APG radiogroup over `role="radio"` cards, optional hidden input for no-JS posts), the
two-variant Chip (C6 — static `<span>`: no interactive role/tabindex/pointer, existing
call-site markup byte-identical; `href`⇒link, `onSelect`⇒button; `variant` is the explicit
escape), EmptyState, Accordion (in-house — no `@radix-ui/react-accordion` in the stack).

**REQ-GUARD-1 mechanism (this ticket owns):** rule name `rhema/no-raw-controls`
(`tools/eslint-plugin-rhema/rules/no-raw-controls.js`) — bans raw
`<button|input|select|textarea>` and inline spacing/type/colour/radius literals in `style={…}`
props (`--*` custom-property keys pass, matching the primitives' no-inline-literals scan; a
spread is conservatively accepted, the require-estimate-prop precedent). **Enablement:** the
committed `NO_RAW_CONTROLS_ENABLED` files-list in `eslint.config.js` — the rule registers `off`
over its whole scope (`packages/ui/src/**` except `primitives/**`, `apps/web/src/**/*.tsx`),
each KIT-3 batch appends its migrated files, 249_R7GUARD.1 collapses the list into one global
`error` block. Empty at authoring. **Exemptions:** the committed data module
`no-raw-controls-exemptions.js` (`{file, component?, reason}` — file suffix-match; `component`
narrows to that component's JSX), consumed as the rule's default option and exposed as
`rhema.noRawControlsExemptions`; seeded with the permanent no-JS/SSR surfaces
(`apps/web/src/pages.tsx`, `marketing.tsx`, `page-chrome.tsx` — funnel/signup/phone-reader
controls, RV-36). Batches append hidden-input/no-JS-form entries with a reason each.

**No React-19 incompatibility surfaced** — every wrapper mounts on the repo's React 19.3 pin
under happy-dom tests, so the DEFERRALS fallback path was not needed.

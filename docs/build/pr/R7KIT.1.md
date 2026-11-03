# R7KIT.1 — Control base layer, missing tokens, programmatic-focus rings

**Spec:** `docs/tickets/210_R7KIT.1__control-base-layer.md` (manifest row 210 · phase round 7/R7a)
**Requirement ids:** REQ-KIT-1, REQ-COPY-7
**Posture:** Stage A only, $0 · no prod mutations · mergePolicy OPERATOR · no preview (`GD-PREVIEW.R7`)

## Summary

Kills the "white system control on a dark shell" class everywhere at once (R6 §0 root cause 1;
UXC-14): `color-scheme` is declared per theme and every native `button`/`input`/`select`/`textarea`/
checkbox/radio/file control gets token-based base rules with hover/active/disabled/focus-visible/
invalid states — emitted by `themeCss()`, so SPA shells and SSR documents carry the same layer.
The previously-undefined `--paper-diff-*` and `--state-ok` tokens exist with contrast tests, and
route-change focus stops painting a focus box on the page heading (REQ-COPY-7).

## What changed

- `packages/tokens/src/tokens.ts` — `--paper-diff-add/del` + `--state-ok` in both palettes;
  `--paper-diff-*` join `PAPER_KEYS` (ride the `[data-paper]` pin); `--state-ok` joins
  `paperScopeVars`; `--radius-pill`; new `FONT_SIZE` scale (`--fs-caption/micro/dense/body/lead`).
- `packages/tokens/src/theme-css.ts` — `color-scheme: dark` on `:root`, `light` under
  `[data-theme="light"]` (Auto resolves via the boot script), `.paper`/pinned color-scheme rules,
  `--fs-*` emission, and the element-specificity (`:where()`-wrapped) control base layer.
- `packages/tokens/src/index.ts` — export `FONT_SIZE`.
- `apps/web/src/spa/head.tsx` — programmatic route focus stamps `outline-style:none` inline until
  blur (restores prior value); keyboard focus is never stamped → the REQ-IDE-42 ring is untouched.
- `packages/ui/src/compare.tsx`, `what-changed.tsx` — drop the light-tuned rgba fallbacks → the
  defined `--paper-diff-*` tokens.
- `apps/web/src/spa/surfaces/outline.tsx`, `figures.tsx` — `--sev-ok` → `var(--state-ok)` (4 sites).
- Tests: `tokens.test.ts` (+7), `contrast.test.ts` (+4), `spa.dom.test.tsx` (+3 REQ-COPY-7 legs),
  new `control-base.dom.test.tsx` (6 computed-style legs).

## Design decisions

- **Specificity contract** (ticket-owned): bare element selectors + `:where()` refinements keep the
  layer at element-level specificity — `.ide-*` region rules and inline styles always win; `:invalid`
  keeps real pseudo-class specificity to beat the layer's own hover. DOM legs prove both precedences.
- **`outline-style` inline stamp** (not `outline`, not an attribute): happy-dom-safe, restores the
  prior value on blur, adds no `data-*` to the DOM contract; the stamp itself distinguishes
  programmatic from keyboard focus — REQ-COPY-7's mechanism.
- **`--state-ok` = the `--state-ready` hue** — one green for one semantic in the §5.7 state scale.
- Checkbox/radio stay UA widgets themed by `accent-color` (the `color-scheme` path); file inputs
  get the shared box + a themed `::file-selector-button`.
- Native controls remain the permanent no-JS/SSR fallback (RV-36); KIT.2's `uiCss()` builds on
  these tokens and must not redefine them.

## Verification

- `vitest packages/tokens/src` → 44 pass · `vitest spa.dom + control-base.dom` → 44 pass.
- `pnpm turbo build lint typecheck` (web/ui/tokens closure) → 18/18.
- `pnpm test` → 6,202 pass / 4 skip / **1 environmental fail** — `privsep.docker.test.ts`: Docker
  daemon EOF mid-build; self-skips with the daemon down. Unrelated skipped leg, reported as such.
- `check:dom-contract` / `check:spa-env` / `check:spa-budget` / `check:protocol-markers` /
  `check:no-cookies` — all green; no ceiling raised.
- **Deltas:** `themeCss()` 7,503 → 10,049 B (+2,546 raw); JS entry delta ~0.
- `pnpm format` — pre-existing repo-wide red at base; no new violations (new file formatted).

## Acceptance criteria → evidence

| AC | Layer | Evidence |
|---|---|---|
| `color-scheme` + rule per control class/state; generator test fails if removed | engineered | `tokens.test.ts`; `control-base.dom.test.tsx` |
| Diff/state/fs/radius tokens defined + contrast floors; consumers repointed | engineered | `contrast.test.ts`; repointed call sites |
| Route focus: no ring on heading, keyboard ring kept — DOM test | fixture-verified | `spa.dom.test.tsx` REQ-COPY-7 legs |
| IDE + inline-styled controls unchanged; checks green; byte delta | engineered | computed-style legs; 3 checks green; +2,546 B |
| Stage-A proxy: every control class × dark+light | fixture-verified | `control-base.dom.test.tsx` |
| Stage B (deferred — `GD-PREVIEW.R7`) | met-engineered(D-R7KIT.1-1) | DEFERRALS row: six surfaces + light spot check + probe fields for 224 |

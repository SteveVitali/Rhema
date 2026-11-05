# R7KIT.2 — UI kit foundations: fresh budget, ADR-129 stack, `uiCss()`, entry guard, shell-critical primitives

**Spec:** `docs/tickets/225_R7KIT.2__ui-primitives.md` (manifest row 225 · phase round 7/R7b — first R7b row)
**Requirement ids:** REQ-KIT-2 (shell-critical part), REQ-KIT-5, REQ-DOPS-8
**Posture:** Stage A only, $0 · no prod mutations · mergePolicy OPERATOR · no preview (`GD-PREVIEW.R7`)

## Summary

Lays round 7's component-kit foundation **before any surface migrates**. The SPA entry budget was
re-measured at the tip BEFORE the first dependency landed (**`04a4e98b`: entry 216,153 B gz /
total JS 566,807 B gz / CSS 0 B** — committed as `apps/web/spa-budget-baseline.json`), and
`check:spa-budget` now prints every run's per-ticket entry delta against the ≤ 15 kB gz allowance.
`@rhema/ui` gained the whole ADR-129 stack at exact pins — per-package Radix primitives, `cmdk`,
`lucide-react` — a generated `uiCss()` inlined beside `themeCss()`/`ideCss()` in the SPA shell and
every SSR head, a sourcemap-keyed entry-graph guard, the per-package import lint, and the
shell-critical primitives (Tooltip, DropdownMenu, Dialog + non-modal Sheet, Button/IconButton,
Badge, Kbd, Skeleton, Toast). Form/menu primitives and `rhema/no-raw-controls` are 225a's.

**This ticket's entry delta vs the baseline: −37.7 kB gz** (entry 177.6 kB of the 250.0 kB
ceiling; total JS +0.8 kB). The entry SHRANK — declaring `"sideEffects": false` on `@rhema/ui`
let the bundler drop module bodies the shared entry chunk had been pinning.

## What changed

- **Baseline + delta report** (pre-deps commit `31374ccb`): `apps/web/spa-budget-baseline.json`
  (sha/branch/measuredAt + the three gzip figures + the 15 kB allowance);
  `scripts/check-spa-budget.mjs` prints `entry delta vs baseline <sha> … of the ≤ 15.0 kB
  per-ticket allowance` (+ total-JS/CSS deltas) — report-only, loud on over-allowance; the hard
  ceilings in `spa-budget.json` are untouched.
- **Dependencies** (commit `8e68b467`): `packages/ui/package.json` — `@radix-ui/react-dialog@1.3.1`,
  `-popover@1.3.1`, `-dropdown-menu@2.2.1`, `-context-menu@2.4.1`, `-select@2.4.1`, `-tabs@1.2.1`,
  `-tooltip@1.4.1`, `-checkbox@1.4.1`, `-radio-group@1.5.1`, `-switch@1.4.1` (all MIT),
  `lucide-react@1.68.0` (ISC), `cmdk@1.1.1` (MIT) — exact pins, all ≥7 days old;
  `@testing-library/*` + `happy-dom` devDeps for the DOM legs. `"sideEffects": false` declared.
- **`packages/ui/src/primitives/`** — the kit directory: `chips.tsx` (the moved Pill / Chip /
  FetchedUrlChip / ActionLink + `severityColor`, rendered declarations pinned unchanged),
  `button.tsx` (Button + IconButton — `aria-label` required), `status.tsx` (Badge / Kbd /
  Skeleton), `toast.tsx` (in-house queue — no `@radix-ui/react-toast` in the stack),
  `tooltip.tsx`, `menu.tsx`, `dialog.tsx` (Dialog + Sheet, `modal={false}` default → no overlay,
  no focus trap; REQ-IDE-41 kept), `type-contracts.ts` (the `@ts-expect-error` legs — an
  IconButton without `aria-label` does not typecheck). Every primitive forwards `ref` /
  `data-*` / ARIA; every user-facing string is a prop (REQ-UX-12).
- **`ui-css.ts` `uiCss()`** — one generated `.ui-*` stylesheet, var-driven off the token layer
  (`--s*`, `--fs-*`, `--radius-*`, `--shell-*`, `--state-*`, `--sev-*`) + typed maps
  (`LAYOUT.timelinePx`, `MOTION.paneMs`); light/dark resolve through the tokens, no
  `[data-theme]` fork; ≤ 24 kB raw asserted on the rendered document.
- **`scripts/check-spa-entry-graph.mjs`** (`pnpm check:spa-entry-graph`, wired into the
  `public-safe` CI job): walks the manifest's transitive static entry graph, reads each chunk's
  sourcemap `sources`, fails on any `@radix-ui/react-{dialog,select,popover,context-menu,tabs,
  checkbox,radio-group,switch}` path — keys on package paths so 225a's wrappers are covered
  already; allowance is exactly Tooltip + DropdownMenu; fails closed on a missing map.
- **`eslint.config.js`** — per-package import policy: `radix-ui` meta/barrel banned,
  `lucide-react` named-imports-only (deep `dist` paths banned), `@radix-ui/react-icons` banned.
- **`apps/web`** — `spa-shell.ts` + `render.tsx` inline `<style>${uiCss()}</style>` beside
  theme/ide in every document; `dom-contract.ts` declares `data-highlighted` (Radix roving
  highlight on menu items) and repoints the `data-fetched` owner to `primitives/chips.tsx`.
- **`docs/adr/ADR-129-…`** — filled + Accepted: stack table (pkg/pin/licence), per-package import
  policy, the ≤ 15 kB entry-delta rule + reporting, the `uiCss()` bound, the RV-36
  native-fallback doctrine. SplitPane left open for 229; GUARD-1 mechanism is 225a's.
- Internal `@rhema/ui` consumers repointed `primitives.js` → `primitives/chips.js`.

## Design decisions

- **Baseline file + delta format** (ticket-owned): `spa-budget-baseline.json` carries the sha,
  branch, `date -u` stamp and all three gzip figures; the delta line keys to the committed file
  so every later Stream-U PR states the same unit. Report-only — the ceiling gate is unchanged.
- **`uiCss()` in `@rhema/ui`** — the spec wins over R6 WP1's `@rhema/tokens` suggestion (recorded
  in the ticket's Notes and ADR-129): the stylesheet ships with the components it styles.
- **`sideEffects: false`** on `@rhema/ui` — makes ADR-129's tree-shaking claim true by mechanism,
  not hope; measured −37.7 kB gz on the entry chunk.
- **Toast in-house** — the ADR-129 list carries no `@radix-ui/react-toast`; the queue is owned
  (`useToast` throws loudly outside its provider; the dismiss name is a required copy prop).
- **Non-modal Sheet on Radix Dialog** — `modal={false}` mounts no overlay / focus trap / scroll
  lock; a DOM leg proves outside content stays focusable (REQ-IDE-41).
- **Entry guard keys on sourcemap `sources`** — package paths survive bundling; a missing map
  fails closed (REQ-TL-6 provenance).

## Verification

- `pnpm turbo build lint typecheck` (ui/web closure) → green; `pnpm --filter @rhema/ui|web
  typecheck lint` clean.
- `pnpm test` → full suite green (see run ledger for the tail; the only skips are environmental
  Docker legs).
- Touched suites: `primitives.dom.test.tsx` 16/16 · `ui-css.test.ts` 5/5 ·
  `no-inline-literals.test.ts` 2/2 · `check-spa-entry-graph.test.mjs` 8/8 (planted Dialog fails,
  head passes) · `check-spa-budget.test.mjs` 12/12 · `radix-import-policy.test.mjs` 6/6 (planted
  barrel fails) · `spa-shell.test.ts` 36/36 · `render.test.tsx` 9/9.
- `pnpm check:spa-budget` → entry **173.4 kB / 250.0 kB**, total JS 554.4 / 800.0, CSS 0 —
  **entry delta −37.7 kB of the ≤ 15.0 kB allowance**; `check:spa-entry-graph` → 7 entry chunks,
  none denied; `check:spa-env`, `check:dom-contract`, `check:protocol-markers`,
  `check:licenses` (873 pkgs) — all green; no ceiling raised.
- No Stage-B leg: `GD-PREVIEW.R7` / $0 / Stage A only (ticket header) — none owed, none deferred.

## Acceptance criteria → evidence

| AC | Layer | Evidence |
|---|---|---|
| Fresh tip baseline committed pre-deps; delta report prints ≤ 15 kB delta | engineered | `spa-budget-baseline.json` @`04a4e98b` (commit `31374ccb` before dep commit `8e68b467`); delta line `−37.7 kB`; `check-spa-budget.test.mjs` |
| Every package pinned exactly, ADR-129 lists version+licence, `check:licenses` green | engineered | `packages/ui/package.json` exact pins; ADR-129 Decision table; `Licence policy OK — 873` |
| Per-primitive DOM tests + the three pinned cases | engineered | `primitives.dom.test.tsx` (16); `type-contracts.ts` `@ts-expect-error` legs (IconButton sans `aria-label` fails typecheck); non-modal Sheet outside-focusable leg; moved-export legs |
| `uiCss()` generated + ≤ 24 kB asserted + style-literal scan | engineered | `ui-css.test.ts`; `spa-shell.test.ts` document-level bound; `no-inline-literals.test.ts` |
| Entry-graph guard fails planted Dialog / passes at head; barrel lint fails planted | engineered | `check-spa-entry-graph.test.mjs` (8); `check:spa-entry-graph` OK at head; `radix-import-policy.test.mjs` (6) |
| `check:spa-budget`/`spa-env`/`dom-contract`/`protocol-markers` green, no ceiling raised | engineered | all four outputs above; `spa-budget.json` unchanged |
| Universal phase-gate AC | engineered | this PR body + `runs/R7KIT.2.md` gap table; BUILD_INDEX row 263; LEDGER advanced; dates from `date -u`; append-only honoured |

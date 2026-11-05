# R7KIT.2 — UI kit foundations: fresh budget, dependencies, `uiCss()`, entry guard, ADR-129, shell-critical primitives (run ledger)

- **Spec:** `docs/tickets/225_R7KIT.2__ui-primitives.md` (manifest row 225, phase round 7 / R7b — first R7b row).
  Round-7 posture: `GD-PREVIEW.R7` (no per-ticket previews), **$0 spend**, repo-only; Stage A only
  (unit + DOM tests + local build; REQ-KIT-2/5 and REQ-DOPS-8 are Stage-A evidence, no surface changes).
  mergePolicy=OPERATOR — never merge. LAUNCHED — prod serves `4bc8cf4a`; zero prod mutations.
- **Normative loads:** the ticket's Load list — `docs/round-7-draft-spec.md` §2 (SPA budget), §3.1
  `GD-UX-KIT.R7`, §3.2 ADR-129, §4.6 REQ-KIT-2/5, §4.17 REQ-DOPS-8, §8 items 3/5/7;
  `R6-ux-code-audit.md` §4/§8 + UXC-15/18/31; `R5-ux-browser-audit.md` B8;
  `REVIEW-round-7-draft-spec.md` RV-15 (budget headroom) + RV-36 (native fallback stays);
  210_R7KIT.1's base layer + `--fs-*`/`--radius-*`/`--paper-diff-*`/`--state-ok` tokens; the anchors.
- **Base:** `stevevitali/r7dep-1b-prod` @ `04a4e98b` (chainTip; PRs #240–#261 unmerged per OPERATOR).
- **Branch:** `stevevitali/r7kit-2-primitives` · **Harness:** devin-desktop/swe-2-high/subagent
  · **Skills:** implement-spec + build-memory + self-review @ `~/agent-skills` (`e981ec5`)
- **Started:** 2026-11-05T02:55Z · **Closed:** TBD
- **Production mutations:** none (repo-only; the external acts are read-only `npm view`/`gh`/`ci-boundary` reads).

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Open round-7 rows reviewed: **D-R7OPEN.1-1**
(R7b legs remain for 250_R7DEP.2 — not this ticket's to close), **D-R7KIT.1-1** (six-surface
deployed probe; the prod demo arm did not cover it — stays OPEN, owed to a deployed R7b tip),
**D-R7COPY.0-1**, **D-R7DEM.5-1**, **D-R7DEM.6b-1** (prod arms owed to later deploy walks),
**D-R7DEM.2c-1** (owner 253). None is unblocked by this ticket; none is closed here. No gate rows
scoped to this phase.

## Requirements (from the contract)

1. Fresh tip SPA budget measured BEFORE the first dependency lands; entry/total-JS/CSS gzip recorded
   with the SHA; committed baseline + a delta report in `scripts/check-spa-budget.mjs` keyed to the
   ≤ 15 kB gz per-ticket entry-delta allowance. No `spa-budget.json` ceiling changes (REQ-KIT-5).
2. Whole ADR-129 stack declared once in `packages/ui/package.json`, exact pins, `check:licenses`
   green: `@radix-ui/react-{dialog,popover,dropdown-menu,context-menu,select,tabs,tooltip,checkbox,
   radio-group,switch}` + `lucide-react` + `cmdk` (REQ-DOPS-8).
3. Shell-critical primitives under `packages/ui/src/primitives/`: Radix wrappers Tooltip,
   DropdownMenu, Dialog (+ Sheet with a non-modal, no-focus-trap variant — REQ-IDE-41 kept);
   in-house Button, IconButton (required `aria-label`), Badge, Kbd, Skeleton, Toast queue. Every
   primitive forwards `ref`/`data-*`/ARIA props; no user-facing text (REQ-UX-12). The existing
   `primitives.tsx` exports (Pill, Chip, FetchedUrlChip, ActionLink) move into the directory with
   rendered behaviour unchanged (REQ-KIT-2 shell-critical part).
4. `uiCss()` in `@rhema/ui` (ADR-129): generated from tokens, no inline spacing/type/colour/radius
   literals in primitives, inlined beside `themeCss()`/`ideCss()` in the SPA shell and SSR heads,
   light+dark via tokens, ≤ 24 kB raw asserted per shell document (REQ-KIT-2/5).
5. Entry-graph guard: fails if Dialog/Select/Popover/ContextMenu (or any non-allowlisted
   `@radix-ui/react-*`) code is reachable from the SPA entry graph; allowance = exactly Tooltip +
   DropdownMenu (keys on `@radix-ui/*` package paths so it covers 225a's wrappers). Per-package
   import lint: no barrel/meta `@radix-ui` import; named `lucide-react` imports only (REQ-KIT-5).
6. ADR-129 shell filled: stack + pins/licences, per-package import policy, ≤ 15 kB entry-delta rule
   + reporting, `uiCss()` bound, native-fallback doctrine (RV-36). SplitPane left open for 229;
   GUARD-1 mechanism is 225a's.

## Acceptance criteria

Tracked in the ticket file; the gap table below carries one row per AC + the operating clauses.

## Plan

- **Commit A (pre-deps):** build `@rhema/web` at `04a4e98b`, run `check:spa-budget`, record
  entry/total-JS/CSS gzip in `apps/web/spa-budget-baseline.json` (new committed baseline file) +
  the delta report in `scripts/check-spa-budget.mjs` (+ test coverage). This precedes any dep add.
- **Commit B:** deps in `packages/ui/package.json` (exact pins), `pnpm install`, `check:licenses`.
- **Commit C:** `primitives/` directory + `ui-css.ts` + shell inlining + guards + eslint + ADR-129 +
  tests. Size target ~500 lines excl. generated/lockfile (Split 5 applied — no form/menu primitives,
  no GUARD-1 rule).

## Test matrix (per AC)

- AC1 baseline/delta: `check-spa-budget` run at base (recorded), delta-report unit legs in
  `check-spa-budget.test.mjs` (planted baseline → printed delta, over-allowance marker).
- AC2 pins/licences: `pnpm check:licenses` green; ADR-129 lists each package+version+licence;
  package.json pins asserted exact by a unit leg (no `^`/`~`/range).
- AC3 primitives: `packages/ui/src/primitives/*.dom.test.tsx` (happy-dom) — render, keyboard,
  ref/`data-*`/ARIA forwarding, theme classes; non-modal Sheet leaves outside content focusable;
  moved-exports render-unchanged legs; IconButton `aria-label` typecheck failure (planted
  `@ts-expect-error` in a typechecked file).
- AC4 uiCss: `ui-css.test.ts` — ≤ 24 kB raw bound, var-token driven (no hex colour / px spacing
  literals in emitted rules where a token exists), dark/light via `[data-theme]` vars; source-scan
  leg fails on `style={…}` spacing/type/colour/radius literals under `primitives/`; shell/SSR
  document tests assert the `<style>` block inlined + ≤ 24 kB.
- AC5 guards: `check-spa-entry-graph.test.mjs` — planted Dialog manifest key fails, Tooltip/
  DropdownMenu pass; eslint planted-import legs via the ESLint API (`radix-ui` meta fails,
  `lucide-react/*` deep import fails, `@radix-ui/react-dialog` + named `lucide-react` pass).
- AC6 green checks: `check:spa-budget`/`spa-env`/`dom-contract`/`protocol-markers` all run; no
  ceiling raised.

## Progress

- 2026-11-05T02:55Z — branch `stevevitali/r7kit-2-primitives` cut at `04a4e98b` (chainTip).
  Load docs + anchors read; anchor drift note: `packages/ui/package.json` carries workspace deps
  (`@rhema/tokens`, `@rhema/ide`, `@rhema/run-sheet`, `@rhema/findings-core`, `@rhema/contracts`)
  — the ticket's "only runtime dependency is react" reads as the only *external* runtime dep, which
  holds. `pnpm-lock.yaml` confirmed free of `@radix-ui/*`, `lucide-react`, `cmdk`.

## Gap table

_(filled at Phase 4)_

## Evidence log

_(filled through Phase 5)_

## Evidence report

_(filled at Phase 6)_

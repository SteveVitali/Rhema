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
- 2026-11-05T02:56Z — **baseline measured before any dep**: `pnpm turbo build --filter=@rhema/web...`
  + `pnpm check:spa-budget` at `04a4e98b` → entry **216,153 B gz (211.1 kB)** of the 250 kB ceiling,
  total JS 566,807 B gz, total CSS 0 B. Committed as `apps/web/spa-budget-baseline.json` +
  the delta report in `scripts/check-spa-budget.mjs` (commit `31374ccb`, precedes every dep).
- 2026-11-05T02:57Z — **deps** (commit `8e68b467`): the whole ADR-129 stack declared once in
  `packages/ui/package.json` at exact pins (`@radix-ui/react-{dialog 1.3.1, popover 1.3.1,
  dropdown-menu 2.2.1, context-menu 2.4.1, select 2.4.1, tabs 1.2.1, tooltip 1.4.1, checkbox 1.4.1,
  radio-group 1.5.1, switch 1.4.1}`, `lucide-react 1.68.0` ISC, `cmdk 1.1.1` MIT — all ≥7 days
  old per `npm view` time stamps); `@testing-library/{dom,react,user-event}` + `happy-dom` devDeps
  for the DOM legs. `check:licenses` green (873 pkgs, no exception rows).
- 2026-11-05T03:20Z — **kit + guards + ADR-129** (uncommitted→committed): `primitives/` directory
  (the moved Pill/Chip/FetchedUrlChip/ActionLink into `chips.tsx` verbatim-styled; Button/IconButton,
  Badge/Kbd/Skeleton, Toast queue, Tooltip, DropdownMenu, Dialog+Sheet wrappers; `type-contracts.ts`
  type-level legs), `ui-css.ts` `uiCss()` inlined in `spa-shell.ts` + `render.tsx`, the sourcemap-keyed
  `check-spa-entry-graph.mjs` guard wired into `package.json` + `ci.yml` public-safe job, the
  per-package import lint in `eslint.config.js`, `data-highlighted` declared in `dom-contract.ts`,
  ADR-129 filled + accepted, `"sideEffects": false` declared on `@rhema/ui` (makes the ADR's
  tree-shaking claim true — and measurably: it dropped the entry chunk 37.7 kB gz).
- 2026-11-05T04:13Z — **self-review fixes**: `sideEffects:false` added (ADR-129 consequence made
  true); `prettier --write` on the changed set (13 files reformatted). Re-verified: entry delta now
  **−37.7 kB gz** vs the `04a4e98b` baseline (entry 177.6 kB / 250 kB ceiling; the flag let the
  bundler drop previously-pinned `@rhema/ui` module bodies from the shared entry chunk).

## Gap table

| item (spec §) | required layer | achieved layer | status | evidence |
|---|---|---|---|---|
| Fresh tip budget measured first; baseline committed pre-deps; delta report ≤15 kB (AC1; REQ-KIT-5) | engineered | engineered | **met** | `apps/web/spa-budget-baseline.json` @`04a4e98b` (commit `31374ccb`, precedes dep commit `8e68b467`); `check:spa-budget` prints `entry delta vs baseline 04a4e98b … −37.7 kB of the ≤ 15.0 kB per-ticket allowance`; `scripts/check-spa-budget.test.mjs` (12 legs incl. planted-baseline delta legs); no `spa-budget.json` ceiling touched |
| Every added package pinned exactly, ADR-129 lists pkg+version+licence, `check:licenses` green (AC2; REQ-DOPS-8) | engineered | engineered | **met** | `packages/ui/package.json` deps block — 10 Radix + `cmdk` + `lucide-react` all exact; ADR-129 Decision table (pin + licence per row); `Licence policy OK — 873 package(s)` |
| Per-primitive DOM tests: render/keyboard/ref-`data-*`-ARIA/theme classes + the 3 pinned cases (AC3; REQ-KIT-2) | engineered | engineered | **met** | `primitives/primitives.dom.test.tsx` 16 legs (hover/focus tooltip, arrow-key menu, Escape dialog, auto/manual toast dismiss, non-modal Sheet outside-focusable, moved-exports unchanged); `type-contracts.ts` `@ts-expect-error` legs = the IconButton `aria-label` typecheck-failure AC |
| `uiCss()` generated, ≤24 kB raw asserted per shell document, style-literal scan fails (AC4) | engineered | engineered | **met** | `ui-css.test.ts` (bound + var-driven + moved-value pins); `spa-shell.test.ts` asserts the inlined `<style>` block ≤ 24 kB on the rendered document; `no-inline-literals.test.ts` source-scans `primitives/` |
| Entry-graph guard fails on planted Dialog, passes at head; barrel lint fails planted (AC5; REQ-KIT-5) | engineered | engineered | **met** | `check-spa-entry-graph.test.mjs` 8 legs (planted `react-dialog` source fails; traversal via `imports`; allowance exactly tooltip+dropdown-menu); `check:spa-entry-graph` green at head (7 entry chunks, none denied); `radix-import-policy.test.mjs` 6 legs via the real ESLint API |
| `check:spa-budget`/`spa-env`/`dom-contract`/`protocol-markers` green, no ceiling raised (AC6) | engineered | engineered | **met** | all four run at head — outputs in the evidence log; `git diff apps/web/spa-budget.json` empty |
| ADR-129 shell filled (deliverable 6) | engineered | engineered | **met** | `docs/adr/ADR-129-…md` — stack table, per-package import policy, ≤15 kB delta rule + reporting, `uiCss()` ≤24 kB bound, RV-36 native-fallback doctrine; SplitPane left open for 229; GUARD-1 deferred to 225a (stated) |
| Out-of-scope honoured (no form/menu primitives, no GUARD-1 rule, no surface migration, no AppShell) | engineered | engineered | **met** | `git status`/`diff` — no Popover/ContextMenu/Select/Tabs/Checkbox/RadioGroup/Switch/cmdk/TextField wrappers; no `no-raw-controls` rule; no app-surface JSX touched beyond the stylesheet `<style>` line + one `dom-contract.ts` selector declaration |
| Universal phase-gate AC | engineered | engineered | **met** | this ledger + PR body `docs/build/pr/R7KIT.2.md` + BUILD_INDEX row + LEDGER advance; dates from `date -u`; AC layers stated; append-only honoured |

## Evidence log

- `pnpm turbo build --filter=@rhema/ui... --filter=@rhema/web` → 13/13 tasks green; Vite SPA build emitted with `.map` provenance.
- `pnpm --filter @rhema/ui typecheck|lint`, `pnpm --filter @rhema/web typecheck|lint` → all clean.
- `pnpm exec vitest run` (touched): `primitives.dom.test.tsx` 16/16, `ui-css.test.ts` 5/5,
  `no-inline-literals.test.ts` 2/2, `check-spa-entry-graph.test.mjs` 8/8, `check-spa-budget.test.mjs`
  12/12, `radix-import-policy.test.mjs` 6/6, `spa-shell.test.ts` 36/36, `render.test.tsx` 9/9 — plus
  the rest of `packages/ui` + `apps/web` touched files; full `pnpm test` green (see below).
- `pnpm check:spa-budget` → `entry graph: 173.4 kB / 250.0 kB · total JS: 554.4 kB / 800.0 kB ·
  total CSS: 0.0 kB` — **entry delta vs baseline `04a4e98b`: −37.7 kB of the ≤ 15.0 kB allowance**
  (report-only flag; hard ceiling untouched). `SPA bundle budget OK`.
- `pnpm check:spa-entry-graph` → `entry-graph chunks scanned: 7 · denied Radix primitives in entry:
  none (shell allowance: react-tooltip, react-dropdown-menu)` — OK.
- `pnpm check:spa-env` → `OK — 127 client sources, 158 artifacts`; `check:dom-contract` → OK
  (journey ⊆ manifest ⊆ emitted+asserted, `data-highlighted` declared); `check:protocol-markers` →
  OK; `pnpm check:licenses` → `OK — 873 package(s)`.
- Self-review: 2 findings (ADR's `sideEffects:false` claim unbacked → flag added, entry −37.7 kB;
  13 files needed prettier). Re-verified green after both.
- No Stage-B leg (GD-PREVIEW.R7; $0; Stage A only per ticket header) — nothing deferred by it.

## Evidence report

_(see `docs/build/pr/R7KIT.2.md` — same table, stamped REQ-KIT-2 (shell-critical part), REQ-KIT-5,
REQ-DOPS-8; entry delta **−37.7 kB gz** vs the committed `04a4e98b` baseline)_

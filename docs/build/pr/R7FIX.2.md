# R7FIX.2 — fix the two R7DEP.1 owed legs (U3.stopgap occlusion + R8.showcase.spa nav)

**Ticket:** `docs/tickets/223c_R7FIX.2__demo-leg-defects.md` · **Run ledger:** `docs/build/runs/R7FIX.2.md`
**Base:** `stevevitali/r7dep-1-r7a-deploy` (mergePolicy OPERATOR — never self-merges)
**Live stage:** the one owned R7a preview `pr-259` redeployed at this PR's head `18a0df79`
(service/api image digests re-pinned; provenance match web+api).

## What it fixes (both deterministic defects 224's walk held `owed`)

### D-R7DEP.1-1 — Desk head occluded by `<span class="">` (U3.stopgap, 1440×900)

**Root cause:** `.ide-desk` opens via a `height var(--dur-pane)` transition (0→280 px). While the
drawer's box is shorter than its head (~25 px — the first ~9 % of the transition), the head
overflows downward into `.ide-statusbar`'s row, and since the statusbar follows the desk in DOM
order in the same stacking context, its first `<span>` ("Review of v1…") wins `elementFromPoint`
at the tab's center — reproduced live on pr-259: `deskH=1, cy=889 → <span class="">Review of v1`;
clean at `deskH≥28`. A real user defect: the tab is unclickable for the first ~25 px of the open.

**Fix:** `packages/tokens/src/ide-css.ts` — `.ide-desk-head` gains `position: relative;
z-index: 1` (the B2 contract "the Desk head stays actionable — the status bar may never cover
it"). `overflow:hidden` was evaluated and rejected — the button's layout rect still centers in
the bar, so the occlusion would persist.

### D-R7DEP.1-2 — dossier→review click dead (`data-nav-count` stays 0)

**Root cause:** the dossier's first `a[href*="/review/"]` is `data-delivered-link="dossier"` — a
**self-link to the current URL**. `nav-intercept` DOES intercept (`preventDefault` proven via a
wrapped stack trace into `handleSpaClick`); `router.navigate({href})` then hits TanStack
`commitLocation`'s `isSameLocation` arm → silent `this.load()` — no committed transition. The
224 record's "document navigation" was an inference — `documentLoads` never incremented; it's a
**dead click** (three such self-links on the page: "Dossier", "Open the delivered review",
"Clear").

**Fix:** `apps/web/src/spa/nav-intercept.ts` — an in-tree anchor whose resolved href equals
`router.latestLocation.href` (the same value `isSameLocation` uses) commits through
`router.history.push(href)`: a new location key → a real in-document transition — the native
reload's SPA twin. Every other href still goes through `router.navigate` (push-only, REQ-NAVM-3).

## Verification

- **Live (pr-259 @ `18a0df79`, provenance match, spend $0):**
  `rhema-journeys --steps U3.stopgap,R8.showcase.spa` → both **ready-to-flip** → flipped
  `expected:"green"`. Screenshots: `docs/build/reports/2026-11-05_R7FIX.2/`
  (`u3-stopgap-1440x900|1280x800|1024x768|820x1180.png`, `U3.stopgap.png`,
  `R8.showcase.spa.png`, `r8-showcase-spa.png`, `report.json`).
- **Stage A:** `vitest run packages/tokens apps/web/src/spa` — 36 files green;
  `pnpm turbo build --filter=@rhema/tokens... --filter=@rhema/web` green;
  `@rhema/web` typecheck+lint, `@rhema/tokens` lint green.
  New tests: `tokens.test.ts` pins the desk-head stacking rule;
  `intercept.dom.test.tsx` pins the same-location arm (claimed + `history.push` + never a
  document nav — the commit itself is the live-proven half).

## Deferrals

- **Closed:** `D-R7DEP.1-1`, `D-R7DEP.1-2` (dated DONE evidence appended).
- **Progress notes:** `D-R7OPEN.1-1` (all seven R7a legs now green; R7b → 250),
  `D-R7RO.1-1`, `D-R7FIX.1-1` (leg flips discharged; census/evidence sets remain with 224 Part B).

## Records

BUILD_INDEX row 261 · LEDGER `lastCompleted: R7FIX.2` → `nextTicket: 224_R7DEP.1` Part B
(H15's "then deploy and continue" arm) · `chainTip` → this branch · `ci-boundary` JSON at
`docs/build/logs/ci-R7FIX.2.json`.

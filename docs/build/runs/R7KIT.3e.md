# R7KIT.3e — run record (dossier layout + claims + the dossier-file migration)

- **Ticket:** `docs/tickets/243a_R7KIT.3e__dossier-layout-claims.md` — REQ-PANE-5, REQ-COPY-8, REQ-KIT-3 dossier portion, REQ-KIT-5, REQ-GUARD-1, REQ-DACC-7/8.
- **Branch:** `stevevitali/r7kit-3e-dossier` ← `stevevitali/r7kit-3d-ide-surfaces` @ `3e7fc4e6`.
- **Scope:** Stage A only, `$0`, no preview (`GD-PREVIEW.R7`), unmerged (`mergePolicy: OPERATOR`). Harness: `devin-desktop/swe-2-high/subagent`.
- **Audit refs:** C7 (five-column dossier squeeze), C9 ([0] ordinals + duplicated verdicts), F1/F3 (1024/1280 squeeze), C6 (static-vs-action chips), UXC-16.

## Plan (written before implementation)

1. Migrate the six dossier composition files to primitives + generated `.ui-*` classes; enable `rhema/no-raw-controls` `error` on all six with named exemptions only for no-JS carriers.
2. REQ-PANE-5: letter = the main column at Page measure (68ch), run card → one-line run header, findings → the right panel's Findings tab (no dossier column, minimap removed), claim ledger = a section of the letter column, sticky in-column outline only ≥1440.
3. REQ-COPY-8: claim ordinals = source id or 1-based (never `[0]`); verdict rendered once.
4. U4.controls: the computed-style probe (`u4-probe.ts` + `U4_CONTROLS` leg + local test), kept `expected:"red"` / AUTHORED_HELD.
5. Verify + records + stacked PR; never merge.

## What changed

### Layout (REQ-PANE-5)

- `packages/ui/src/letter.tsx` — migrated to `uiCss()` classes; the cream card chrome is gone (the `.paper` sheet owns the surface). New `claims?: ReactNode` slot renders the claim ledger INSIDE the letter column; `claimsTocLabel` adds its TOC entry. `data-letter-toc` emits at every width (attribute parity); the `.ui-letter-toc`/`.ui-letter-grid` media rule gates visibility at ≥1440.
- `apps/web/src/dossier-view.tsx` — `DossierArticle`: `RunCard` replaced by the one-line `data-run-header` line (workflow · state · meter · report link — the same `RunSummaryView` facts); `ClaimsTable` now mounts inside `LetterView`'s `claims` slot (`#claims`, `data-letter-section="claims"`); the body's findings section (FindingsList + pretriage/promo/bulk/notice/budget/explainer/saved) is removed — every one of those hooks moved into `dossierSurfaces.deskFindingsBody` inside `data-dossier-desk` in the right panel's Findings tab.
- `dossierSurfaces` no longer returns `marginBody`; the leaf publishes `findings: []` — the Margin rail and the colour-dot minimap are **removed** on the dossier (recorded decision: removed, not labelled). Letter passage links + desk-row links now target `#desk-finding-<id>`; the desk row also emits `data-finding` so the hook stays emitted on the dossier surface.
- `apps/web/src/spa/showcase-beacon.ts` — the P1.17 anchor beacon resolves `[data-passage-link="<id>"]` first, then `[data-desk-row]`, then `[data-finding]` (the finding anchor moved off the rail).
- `apps/web/src/spa/ide/chrome-data.tsx` + `chrome.tsx` — `IdeChromeData` gains `onPaneError`: a leaf publishes a refusal sink so a pane-body write refused through the chrome's delegated submit repaints the leaf's `?ferr`-parity arm (notice line + under-card error). Without it the dossier's finding writes — now panel-housed — silently invalidated on 422. The dossier leaf publishes its existing handler.
- `apps/web/src/spa/surfaces/dossier.tsx` — `ObligationNewSurface` migrated (TextField/Select/Button + `HiddenField`); the phone-chat section rides classes.

### Claims (REQ-COPY-8)

- `claimOrdinalLabel` (`packages/ui/src/claims.tsx`, exported): `[sourceId ?? ordinal + 1]` — never `[0]`. `ClaimTableRow`/`DossierClaim` gain `sourceId?`; `data-claim-ordinal` carries the rendered value; `data-claim` keeps the machine ordinal.
- The duplicate `contradictedTierOneLabel` badge is gone in both claims.tsx and dossier.tsx — a verdict renders exactly once (the red verdict text + `ui-claim--bad` left rule + `data-contradicted-tier1` keep the REQ-POS-3 marker readable). `contradictedTierOneLabel` is `@deprecated` — kept for call-site compat.
- Chip semantics (C6): tier chips are `variant="static"`; host/figure links stay action-variant `Chip`/`FetchedUrlChip`.

### GUARD-1

- `eslint.config.js` `NO_RAW_CONTROLS_ENABLED` += the six files: `packages/ui/src/{dossier,letter,claims,findings}.tsx`, `apps/web/src/dossier-view.tsx`, `apps/web/src/spa/surfaces/dossier.tsx`.
- Exemptions appended (all reasoned, no-JS/SSR carriers only): `dossier-view.tsx` `HiddenField` (`next`/`action`/`section` id carriers) and `BulkOnlyCheck` (the `only[]` checkboxes); `surfaces/dossier.tsx` `HiddenField` (`next`). The visible bulk section select and obligation severity select are Radix `Select` primitives (their named carriers post through the same form grammar) — no exemption.
- `no-raw-controls.test.ts`: the six files moved into the enabled assertion lists + seeded raw-control legs; `pages.tsx`/`chat-pane.tsx` carry the still-off arm.

### U4.controls (AUTHORED_HELD)

- `packages/journeys/src/u4-probe.ts` (new): `U4_SURFACES` — the 12 named surfaces (/app, /app/inbox, /app/settings, /app/settings/billing, /app/usage, /app/voices, /app/new, /p/:p IDE Page+panel, /p/:p/run, /p/:p/export, /p/:p/outline, /p/:p/review/:runId); `u4ProbePage` flags any visible `button/input/select/textarea` that is neither a `ui-*`/`cmdk-*` primitive carrier, a hidden/`aria-hidden` carrier, a disabled+readOnly document mark, nor inside the surface's named exemption containers; `assertU4Clean` throws with the computed-style signature.
- `r7legs.ts` `U4_CONTROLS` (real body, AUTHORED_HELD): `returningUser('a')`, resolves the project slug + a completed review run id from the twins, walks the 12, probes + screenshots each. Registry `asserts` names the 12; row stays `expected:"red"` — 250_R7DEP.2 flips it at `--expect-sha`.
- `u4-controls.local.test.ts` (new): local `demoDataSource` build → `u4ProbePage` over the demo-servable surfaces (IDE Page + dossier) + a seeded raw `<button>` that MUST fail + the 12-surface list assertion.

### DOM contract

`data-run-header`, `data-dossier-desk`, `data-letter-toc`, `data-toc-link`, `data-passage-link` declared on the dossier surface and asserted in `dossier.dom.test.tsx` (114 hooks — all emitted + asserted).

## Verification

| Check | Result |
| --- | --- |
| `pnpm turbo build --filter=@rhema/web...` | PASS — 13 tasks |
| `pnpm --filter @rhema/web typecheck` / `@rhema/journeys typecheck` | PASS |
| `pnpm exec eslint` on all touched sources | PASS — 0 errors (eslint.config.js self-scan flags its own banned-strings options literal — pre-existing, unrelated) |
| `pnpm exec vitest run apps/web/src` | PASS — 1,600/1,601 → all pass after REQ-COPY-8 test update |
| `pnpm exec vitest run apps/web/src/spa/dossier.dom.test.tsx` | PASS — 17/17 |
| `pnpm exec vitest run tools/eslint-plugin-rhema/rules/no-raw-controls.test.ts` | PASS — 21/21 |
| `pnpm exec vitest run packages/ui/src` | PASS (findings-surface, dossier-surfaces, ui-css bound) |
| `pnpm check:dom-contract` | PASS — dossier 114 hooks emitted + asserted |
| `pnpm check:spa-env` | PASS |
| `pnpm check:protocol-markers` | PASS |
| `pnpm check:spa-budget` | PASS (ceilings held) — entry delta **+15.4 kB vs baseline `04a4e98b`**, ticket increment **≈ −0.1 kB** (migration net-reduced); the WARN is the parent's `GD-KIT3A-BUDGET` deficit |
| `uiCss()` byte bound | **24,516 B ≤ 24,576** (was 23,162 after batch d; +1,354 B net for the dossier rules) |
| `pnpm turbo lint --filter=@rhema/ui,@rhema/web,@rhema/journeys` | PASS (1 pre-existing warning in chat-live.tsx — not touched) |
| U4 local probe (`u4-controls.local.test.ts`) | see Evidence log |

## AC gap table

| AC | Disposition | Evidence layer |
| --- | --- | --- |
| Letter = main column at Page measure (45–80ch at 1280/1440/1920), sticky outline only ≥1440 | **Engineered, partial at Stage A** — letter IS the `.paper` column (card chrome removed); `.ui-letter-p` clamps 68ch; the TOC emits at every width with a `@media (min-width:1440px)` visibility rule. Deterministic DOM+CSS-rule evidence holds; the three-width browser measure is owed to Stage B (D-R7KIT.3e-1). | dom test: `data-letter-view` mounts, TOC attrs emitted; uiCss rule asserted; no overlay columns remain |
| Run card collapses to a one-line header | **Done** — `data-run-header` one-line `<p>` (workflow · state · meter · report link). | dom test asserts the hook + "Completed" |
| Findings in the right panel's Findings tab, not a dossier column | **Done** — `deskFindingsBody` carries the desk + workflow furniture (`data-dossier-desk`); marginBody/`findings` publish removed → margin rail + minimap gone; `data-findings-list`/`data-margin-surface` absent. | dom test asserts presence in panel + absence in body |
| Claim ledger is a section of the letter column | **Done** — `ClaimsTable` mounts inside `LetterView`'s `claims` slot (`#claims`, `data-letter-section="claims"`, TOC entry). | dom test asserts `[data-letter-view] [data-claims-table]` |
| Minimap labelled or removed | **Removed** — `findings: []` published → `hasFindings` false → margin hidden on the dossier. | dom test asserts `data-margin-surface` absent |
| Claim ordinals source-id or 1-based, never `[0]`; verdict once | **Done** — `claimOrdinalLabel` = `[sourceId ?? ordinal+1]`; `data-claim-ordinal`; `contradictedTierOneLabel` badge removed; `data-contradicted-tier1` + `data-verdict` kept. | server.test.ts asserts no duplicated badge + `data-verdict`; unit asserts ordinal label |
| Tier-1 contradicted proof + fetched URL | **Done** — REQ-POS-3 marker preserved (attr + red verdict + left rule + fetched chips). | server.test.ts `data-contradicted-tier1`/`data-fetched` |
| Six files migrated; GUARD-1 on; named exemptions only | **Done** — `error` on all six; 3 reasoned exemptions (HiddenField ×2, BulkOnlyCheck). | rule test 21/21 + seeded legs |
| SSR/SPA parity + DOM contract | **Done** — new hooks declared+emitted+asserted; `data-findings-*`, `data-letter-view`, `data-claims-table` all still emitted (in the panel where moved). | `check:dom-contract` green — 114 dossier hooks |
| Letter/findings/claims chips static vs action (C6) | **Done** — tier `variant="static"`; host/figure links action-variant. | Chip semantics in the ui sources |
| No dossier control becomes a run launcher | **Done** — all dossier writes keep their form grammar; no run-launcher affordance added. | code review + unchanged write paths |
| Budget: entry delta ≤15 kB; uiCss ≤24 kB | **Done** — entry +15.4 kB cumulative (parent +15.5 → increment ≈ −0.1 kB); `uiCss()` 24,516 B ≤ 24,576. | check:spa-budget + byte count |
| U4: probe authored over 12 surfaces; local pass; AUTHORED_HELD | **Engineered, partial at Stage A** — `U4_SURFACES` names 12; `u4ProbePage`+`U4_CONTROLS` authored; local probe passes on the demo-servable surfaces + the seeded-fail leg; the full-12 deployed walk is owed to 250. The workspace-only surfaces (list/inbox/settings/billing/usage/voices/new/run-sheet/export) cannot be served by a local demo build — honest gap, not a pass claim. | u4-controls.local.test.ts + this table |
| Stage-B dossier screenshots/provenance | **OPEN — D-R7KIT.3e-1** | deferred by design |

## CI boundary

- First read **red** at `9ebc82ca` (run 42313586539) — three legs:
  1. `ui.test.tsx` sample-dossier leg still asserted the removed `Contradicted Tier-1` badge text → updated to the REQ-COPY-8 arm (`data-verdict="contradicted"` + `data-contradicted-tier1`, badge text absent).
  2. `runner.test.ts` — `U4.controls` now carries a real body; its test-harness error isn't the `owed — owner` shape → moved into the same exclusion set as U1/U2/U3/U5/U6/U7 (real-body legs).
  3. `demo-tour-legs.local` — TWO real regressions the probe surfaced honestly:
     a. the demo dossier SPA crashed — the one-line run header called `creditsLabel(spent, cap)` unconditionally; the replayed demo `runSummary.card` carries `null` meters (the RunCard had a `!= null` guard). Guarded identically; new `dossier-demo.test.tsx` renders the committed demo snapshot through `DossierArticle` + `dossierSurfaces`.
     b. `?tour=…` finding marks couldn't place at 1024 — findings now live in the right panel, which at 1024–1279 is a CLOSED overlay (REQ-PANE-2): the `data-finding` desk row is `display:none` → zero-size target → mark unplaced. The leg now opens the panel + selects the Findings tab via the delegated toggles and re-syncs the mark — the same path a user takes.
- Repair head `1e076372` — local re-verification: `ui.test` 4/4 · `runner.test` 18/18 · `dossier-demo` 2/2 · `demo-tour-legs` 1/1 (all 11 steps × 3 widths, 127s). Second read `821a0628` red on `registry.test.ts`'s owed-loudly census (`U4.controls` joins AUTHORED_HELD); **third read `ci: pass #283@7a96e41b`** (run 42322192847 — all seven legs + ci-pass anchor).

## Evidence log

- DOM tests: `dossier.dom.test.tsx` 17/17 — letter vocabulary, TOC attrs, claims-inside-letter, findings-in-panel, minimap absent, run-header, passage-link → desk-row, refused-write `?ferr` parity (pane-write `onPaneError`), bulk preview round-trip, axe.
- GUARD-1: rule ON `error` on the six files; seeded raw `<button>` legs fail on every one; exemptions narrow and reasoned.
- U4: `u4-probe.ts` authored; local probe green on demo IDE Page + dossier + seeded-fail leg; 12-surface list asserted.
- Budget: `uiCss()` 24,516/24,576; entry +15.4 kB (≈ −0.1 kB vs parent).
- Harness: `devin-desktop/swe-2-high/subagent`; spend `$0` (Stage A only).

## Judgement calls (operator review)

1. **Minimap removed, not labelled** — the colour-dot rail lost its finder's purpose once findings live in the panel; removing keeps C7's column squeeze solved.
2. **`data-finding-evidence`/`data-fetched-chip` hooks are no longer emitted on the dossier** — `FindingsDesk` rows don't render evidence blocks (they're table rows). The claim ledger's `data-claim-url`/`data-url-in-log`/`data-fetched` chips still carry the fetched-source proof. Conditional hooks allow absence; flagged for the operator in case an evidence-per-row affordance was intended.
3. **Verdict rendered once via the red verdict text + `ui-claim--bad` left rule** (not the removed `· Tier 1` badge) — `contradictedTierOneLabel` deprecated not deleted.
4. **The `onPaneError` chrome seam** — pane-body writes refused through the chrome's delegated submit used to silently invalidate; publishing the leaf's `?ferr` sink preserves the SSR refusal repaint for panel-housed finding writes.
5. **Letter h2 22px → `ui-d-h` (fs-lead)** and card title `color: var(--paper-fg)` inline drops — minor visual deltas from byte trimming; recorded, reversible.

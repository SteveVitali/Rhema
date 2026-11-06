# R7WRITE.2 — Source-mode prose, pre-paint paper, the complete browser-safe keymap (239)

Stacked on #276 (`stevevitali/r7write-1b-comments`). mergePolicy OPERATOR — do not merge.

## REQ-WRITE-5 — Source reads like prose, ONE toggle

- `page-source-mode.ts` gains `lineWrapping` + a paper-serif/measure theme — no monospace prose; the line-number gutter is **removed** (recorded: prose doesn't number lines).
- The ONE `Rich text / Source` toggle lives in the page header strip (`data-source-toggle`, `aria-pressed`) — the ⋯ "Edit source" item and the floating chip are **removed** (I7).
- Source stays a projection over the same mounted PM view (`applySourceMarkdown`); Rule-5 `source` focus zone lets CodeMirror's own bindings win — only ⌘S mints.

## REQ-WRITE-8 — paper from boot, no dark→light flip (B15)

- `spaBootPayload` reads `getProjectTheme` and stamps `data-paper` in the **first document bytes** for `/p/:slug` hard loads.
- `applyPaperForPath` resolves the policy synchronously at SPA-nav start (localStorage mirror); `reconcilePaperTheme` writes only on a real difference — **no intermediate value**.

## REQ-KEYS-1/2 — the complete committed browser-safe keymap

- `IDE_KEYMAP` rewritten: `g p/i/v/s` go-tos, `r d/r/v/n` run sheets, `f` focus, `t` triage, `⇧T` paper, `v` view menu, `c` compare, `h`/`l` versions, `⌘⏎` run sheet — every `⌘⇧*`/`⌘G`/`⌘,`/`⌘I`/`⌘1-2`/`⌘J`/`⌥[` `⌥]` retired (`goto-approval` recorded-removed).
- `reserved-chords.json` `transitional` is **empty** — the remap is complete; checker extended to sequences, `scope:"editor"` (PM keymap, Rule-1 only), and `ISLAND_CHORDS`. Evidence fields moved to a test-only JSON.
- Hints are **generated**: run-menu `keys`, View-menu `<kbd>`, shell tooltips, bubble marks, `restoreEmpty` `{chord}` — `chord-literals.test.ts` fails on hand-typed chords.

## Evidence (Stage A, $0)

- `turbo build`/`typecheck` — green; `lint` clean (1 pre-existing warning).
- `vitest` ide/ui/editor/journeys **577/577**; `vitest run apps/web/src` **1561/1561**; `vitest run scripts/` pending.
- `check:dom-contract`/`spa-env`/`protocol-markers` OK; `check:spa-budget` — **entry +15.0 kB gz vs `04a4e98b` (≤15 kB allowance, at the edge)**.
- U5.write re-pointed — still `expected:"red"`/AUTHORED_HELD; Stage-B owed → `D-R7WRITE.2-1` (250_R7DEP.2).

## Budget note

Entry delta sits at the `+15.0 kB` allowance edge after shaves (evidence JSON test-only, checker module evicted from the runtime graph, `PAGE_KEYMAP` to a `@rhema/contracts/page-keymap` subpath).

# R7WRITE.2 — Source-mode prose + pre-paint paper + the complete browser-safe keymap (ticket 239)

- Harness: devin-desktop/swe-2-high/subagent · branch `stevevitali/r7write-2-source-keymap` · base `stevevitali/r7write-1b-comments` @ `13cdfc96`
- Layer: engineered (Stage A only, $0; GD-PREVIEW.R7 — no owned preview). Stage-B legs owed → `D-R7WRITE.2-1` (owner 250_R7DEP.2).
- REQ ids: REQ-WRITE-5, REQ-WRITE-8, REQ-KEYS-1, REQ-KEYS-2; ADR-128 (`?` sheet kept). Findings: I7, I8, B15, RV-14/33, B12 remainder.

## Plan (all steps landed)

1. **Keymap table** (`packages/ide/src/keymap.ts`): `IDE_KEYMAP` is the committed binding table — every chord + display glyph + `?` row + scope. `dispatchIdeKey` gains a `pending` param for the `g`/`r` two-key sequences (Rule 3) and a `"source"` zone (Rule 5 — CodeMirror's bindings win; only ⌘S dispatches). Retired: every `mod+shift+*`, `mod+g`, `mod+i`, `mod+,`, `mod+1/2/j` (226), `alt+[/]` (provisional). `goto-approval` REMOVED (recorded: Needs-you → Inbox, `g i` owns it). New bindings: `mod+enter` run-sheet, `g p/i/v/s`, `h`/`l` versions.
2. **Checker** (`reserved-chords.ts` + split JSON): sequences checked per-key; `scope:"editor"` = Rule-1 only. Evidence (sources/old→new/keepReasons/layoutNote) split to a test-only JSON — ~2 kB never enters a bundle. `matchesChord`/`canonicalChord` moved into `keymap.ts` so the checker module is test-only.
3. **PM keymap** (`packages/contracts/src/page-keymap.ts`, subpath export): `PAGE_KEYMAP` + `BASE_KEYMAP_CHORDS` as data; `plugins.ts` builds `keymap()` from the table; a coverage test asserts the committed base list names every real `pcBaseKeymap`/`macBaseKeymap` key.
4. **Source mode**: `page-source-mode.ts` adds `lineWrapping` + `SOURCE_PROSE_THEME` (paper serif/measure) — gutter REMOVED (recorded: prose doesn't number lines). `page-mount` is controlled; `page-strip` owns the ONE `[data-source-toggle]` (aria-pressed, Rich text/Source); ⋯ "Edit source" item + floating chip removed (I7).
5. **Paper** (`paper-boot.ts` + `spa-shell.ts` + `chrome.tsx`): `getProjectTheme` DS read stamps `data-paper` in first document bytes; `applyPaperForPath` resolves the policy synchronously at nav start (mirror arm); `reconcilePaperTheme` writes only on a real difference — no intermediate value (B15).
6. **REQ-KEYS-2**: hints generated — run-menu `keys`, View-menu kbd, shell tooltips, bubble marks (`BUBBLE_MARK_HINTS` + consistency test), `restoreEmpty` `{chord}` template. `chord-literals.test.ts` fails on hand-typed chords.
7. **U5.write** re-pointed (still `expected:"red"`/AUTHORED_HELD); ADR-128 dated banner in spec §4.12.

## Test matrix / evidence log

- `turbo build` (all) + `turbo typecheck` — green. `turbo lint` — clean; one PRE-EXISTING `chat-live.tsx` unused-disable warning (untouched).
- `pnpm exec vitest run` ide/ui/editor/journeys — **577/577** (keymap.test 51: zones incl. source + sequences + checker extension + seeded ⌘, fixture + table↔dispatch + generated CHEAT_SHEET/tooltips + base-keymap coverage).
- `pnpm exec vitest run apps/web/src` — **1561/1561** (page-source.dom 6: wrap facet/`cm-lineWrapping`/no gutter/controlled toggle; page-strip.dom: the ONE strip toggle + read-only withhold; spa-shell: `data-paper` stamped in first bytes; paper-boot.dom 8: mirror arm/reconcile/no-intermediate; chord-literals: no hand-typed chords; ide-chrome: `f`/`t`/`h`/`l` chords).
- `pnpm exec vitest run scripts/` — pending final sweep (below).
- `check:dom-contract` — OK (data-source-wrap declared+emitted; data-source-bar retired; U5 uses only manifested attrs). `check:spa-env` OK. `check:protocol-markers` OK.
- `check:spa-budget` — **entry +15.0 kB gz vs `04a4e98b` (≤15 kB; at the allowance edge)**. The budget warns at the boundary; the hard ceilings all hold (229-entry? no — 226.2/250).

## AC gap table

| AC | Status | Where proven |
|---|---|---|
| Source soft-wraps, prose typography | DONE (Stage A) | `lineWrapping` + prose theme; `cm-lineWrapping`/no-gutter dom assert |
| ONE Rich text/Source toggle in header strip; ⋯ item + chip gone | DONE | page-strip toggle + `data-source-toggle`; U5 asserts exactly one |
| Source view = projection over same PM doc | DONE (unchanged) | `applySourceMarkdown` + existing commit tests |
| Rule-5: CM bindings win in Source; ⌘S mints | DONE | `source` zone in dispatcher; zone tests |
| Paper pre-paint, no dark→light flip (hard load + SPA nav) | DONE | `getProjectTheme` stamp + `applyPaperForPath` mirror + `reconcilePaperTheme` |
| Complete browser-safe keymap; transitional emptied | DONE | `IDE_KEYMAP` + `chordViolations` empty; seeded-violation test |
| Checker extended to PM keymap + island bindings | DONE | `PAGE_KEYMAP`/`BASE_KEYMAP_CHORDS`/`ISLAND_CHORDS` rows in `chordViolations` |
| Hints generated from keymap in menus/tooltips/`?` | DONE | `shortcutFor`/`pageShortcutFor`/`BUBBLE_MARK_HINTS` everywhere + literal guard |
| U5.write re-pointed, still red | DONE (held) | r7legs U5 + AUTHORED_HELD |
| Stage-B evidence (deployed screenshots + flip) | OWED → `D-R7WRITE.2-1` | owner 250_R7DEP.2 |

## Operating clauses

- mergePolicy OPERATOR — PR left unmerged for the stack.
- $0 Stage A — no preview, no prod mutation (GD-PREVIEW.R7); Stage-B owed at 250.
- Append-only records; `reserved-chords.json` `transitional` is emptied, not removed (schema stable).
- `data-source-bar` is retired per the dom-contract convention (comment records the retirement; the U5 leg asserts the strip's ONE toggle + no in-page emitter, never the retired attr).

## Budget note (operator-visible)

The entry delta sits at the `+15.0 kB` allowance edge. Shaves applied: reserved-chords evidence moved test-only (~2 kB), the checker module evicted from the runtime graph (`matchesChord`/`canonicalChord` into `keymap.ts`), `PAGE_KEYMAP` to a `@rhema/contracts/page-keymap` subpath (barrel never pulls it), `pageShortcutFor` removed from `menus.ts` (committed `BUBBLE_MARK_HINTS` + consistency test). Any further keymap/table growth must either lazy-load or earn a baseline re-measure.

# Run ledger — R7SHELL.2 (row 230)

- **Spec:** `docs/tickets/230_R7SHELL.2__project-scope-sidebar.md`
- **Base:** `stevevitali/r7pane-1-split-pane` @ `429749dd` (chainTip; R7PANE.1 PR #267)
- **Branch:** `stevevitali/r7shell-2-project-scope`
- **Harness:** `devin-desktop/swe-2-high/subagent`
- **Skills:** `unknown` (loaded from `~/agent-skills/skills`)
- **Started:** 2026-11-05T17:40:24Z
- **Closed:** 2026-11-05T20:32Z
- **Config:** autonomous, ledger, self-review, gap-analysis, tests, Stage-A-only verification (Live stage: Stage A only, $0; `GD-PREVIEW.R7`), evidence report. Stage B deferred to 250 via `D-R7SHELL.2-1`.
- **ci:** pending — first read failed at `1277313e` (run 42082775909, two dom tests pinning the pre-rail DOM); fixed at `fb3e07d2`; boundary read running on the pushed head

## Deferrals read

Read `docs/tickets/DEFERRALS.md` first per AGENTS. R7 OPEN rows: `D-R7OPEN.1-1` (14 legs `owed`, owners map; R7b legs incl. U1.shell → 250), `D-R7KIT.1-1`, `D-R7RO.1-1` (both partially discharged at 224, remainders OPEN → 224/250), `D-R7FIX.1-1` DONE, `D-R7COPY.0-1` OPEN (run-card captures → 224), `D-R7DEM.2c-1` OPEN (owner 253), `D-R7DEM.5b-1` etc. — none unblocked by this ticket's scope. New deferral opened here: `D-R7SHELL.2-1` (Stage B at 250).

## Requirements

- R1: project scope in sidebar — current-project entry expands into Page, Outline, Figures, Versions, Reviews, Export, Project settings (REQ-SHELL-4). SPA links + active state; collapsed ⇒ icon+tooltip; write-only items honour ReadOnlyProject; current project not repeated in Recent projects.
- R2: Files pane content → expanded tree under the project entry (tree roles + keyboard nav); Lucide icons; frozen/working Badge not lock glyphs; "Files" label → COPY (UXC-30); renders whatever "outline exists" source files data carries.
- R3: Removal — delete `.ide-rail` + `.ide-files` code + CSS + LAYOUT widths; drop files fields from pane state (tolerant codec); remove `files` pane action from keymap + reserved-chords; `paneLayout()` sidebar width replaces rail+files.
- R4: DOM contract + journeys — rail/Files hooks retired or migrated; tree hooks added; every R7a tour target resolvable until 248; U1.shell extended (seven items reached from Page), held `ready-to-flip`.
- R5: entry delta ≤ 15 kB gz reported vs `apps/web/spa-budget-baseline.json`.

## Acceptance criteria

- AC1: no IDE route renders icon rail or Files strip; a test fails if reintroduced. (engineered)
- AC2: seven items navigate SPA with correct active state; ReadOnlyProject hides/disables write-only with reason. (engineered)
- AC3: Files tree keyboard-navigable (tree roles), Badges not lock glyphs. (engineered)
- AC4: pre-change pane blob reads without throw → defaults for removed keys; reserved-chords green. (engineered)
- AC5: `check:dom-contract` green; R7a tour targets resolve; entry delta ≤ 15 kB gz reported. (engineered)
- AC6: Stage B at 250 via `D-R7SHELL.2-1` (extended U1.shell walk + screenshots expanded/collapsed @1440×900). (met-engineered(D-R7SHELL.2-1))
- AC7: universal phase-gate AC. (engineered)

## Plan

1. `packages/ide` — layout.ts drop filesOpen/filesWidth/files verdict (paneDrag panel-only; collapse: panel→closed, margin→hidden); state.ts tolerant codec (unknown keys ignored); keymap `pane:"panel"` union.
2. `packages/tokens` — LAYOUT drop railPx/files* + bpFilesTicksMarginPx; ide-css drop rail/files rules + files media/scrim arms.
3. `packages/ui` — ide-shell delete rail nav + files aside + files handle + `data-files` + `filesBody`/`sourceHref` props + files labels; files-pane → tree (role=tree/treeitem/group, roving-tabindex arrows, Lucide kind icons, Badge for lock, COPY heading).
4. `apps/web` — server `/bff/p/:slug?view=tree` light twin (project facts + `ide.files`-equivalent `getFiles`, readOnlyProject showcase/demo); queries `projectTreeQuery`; app-shell `ProjectSection` (current-project entry + 7 items + `<FilesPane>`; recents exclude current; write-only = Export + Project settings → disabled under ReadOnlyProject w/ reason; demo items limited to demo-served routes); controller + client/ide files paths removed; pages.tsx drop filesBody.
5. COPY — `COPY.files.heading`, `COPY.files.lockBadge`, `COPY.appShell.project*` labels; drop dead `COPY.ide.files`.
6. dom-contract — retire `data-files`/`data-files-mode`/`data-ide-files-toggle`; add `data-shell-project`, `data-project-item`, `data-project-tree` (+ files-pane hooks already declared).
7. U1.shell extended: from the Page, each of the 7 items reached; assert active state; screenshots expanded+collapsed; stays `expected:"red"`.
8. Tests: update ide/ide-shell/ide-chrome/app-shell/tokens/occlusion/versions-surface/server/dom-contract/control-base; new `project-section.dom.test.tsx`.
9. Records: DEFERRALS `D-R7SHELL.2-1`; ADR(s) for owned decisions; PR body; BUILD_INDEX 269; LEDGER `nextTicket: 231_R7RELOAD.1`, `chainTip` → this branch.

## Test matrix

- paneLayout: no files region at any breakpoint; sidebar px replaces rail+files; collapse order panel→margin; paneDrag panel-only.
- codec: `{"v":2,"filesOpen":true,"filesWidth":320}` → defaults, no throw; round-trip without files keys.
- ide-shell DOM: no `.ide-rail`, no `.ide-files`, no `data-files`, no `data-ide-files-toggle` — fails if reintroduced.
- app-shell/project-section DOM: 7 items present + correct hrefs + aria-current; recents exclude current slug; collapsed tooltips; ReadOnlyProject disables Export+Project settings with reason; demo variant renders only demo-served items + no workspace reads; tree role=tree + keyboard nav + Badges (no lock glyphs); "Files" label from COPY.
- U1.shell walk extension: each item reached from Page (asserted in body; stays red).
- check:dom-contract; spa-budget entry delta.

## Progress

- 17:40Z — branch `stevevitali/r7shell-2-project-scope` @ 429749dd; Load docs read (spec §3.2/4.5/4.6/5.4/8; R6 §3/6.2, UXC-10/26/30; R5 B3/B10; anchors; DEFERRALS; manifest; LEDGER; AGENTS chain).
- DONE so far: `packages/ide/src/layout.ts` (filesOpen/filesWidth/files verdict removed; paneDrag panel-only; collapse panel→margin; sidebar px only left occupancy), `state.ts` (tolerant codec, files keys ignored), `keymap.ts` (`pane:"panel"`), `tokens.ts` LAYOUT (railPx/files*/bpFilesTicksMarginPx dropped), `ide-css.ts` (rail/files rules + media/scrim arms dropped), `ui/ide-shell.tsx` (rail nav + files aside + handle + data-files + filesBody/sourceHref + labels.files removed; phonebar kept for !hosted), `ui/files-pane.tsx` (rewritten as role=tree component: treeitem/group, roving tabindex, Arrow/Home/End/Left/Right, Lucide KindIcon per kind, Badge frozen/working replaces lock glyph, `data-lock-badge`, heading from labels), `files-labels.ts` (heading+lockBadge), `pages.tsx` (filesBody/FilesPane dropped).
- ALSO DONE: chrome-data.tsx (filesBody/sourceHref dropped), chrome.tsx, pages.tsx sourceHref pass, client/ide.ts (files paths removed — pane "panel" only), controller.ts (files paths removed, overlay refs panel-only, drag/key panel-only), server.ts (sourceHref emit removed; `GET /bff/p/:slug?view=tree` light twin added — rides existing demo-allowed `/p/$project` routeId).
- REMAINING: queries.ts `projectTreeQuery`+BffProjectTreeTwin; app-shell.tsx ProjectSection (7 items+tree+recents-exclusion+demo); copy.ts (`COPY.files.heading/lockBadge`, `COPY.appShell.project*` labels, drop `COPY.ide.files` — IDE_CHROME_LABELS must drop `rail.files`/`files` bag; check `page-data.ts` `sourceHref` field — keep or remove from PageData; check `ide.files`/`BffIdeBag.files` usages); dom-contract.ts retire data-files*/data-ide-files-toggle + add tree/shell hooks (data-shell-project, data-project-item, data-project-tree, data-lock-badge — data-project-tree already emitted via data-files-pane? both emitted now); r7legs.ts U1.shell extension; tests (ide.test.ts, ide-shell.test.tsx, ide-chrome.dom.test.tsx, app-shell.dom.test.tsx, tokens.test.ts, occlusion-harness.test.ts, versions-surface.test.ts, server.test.ts, control-base.dom.test.tsx, dom-contract.test.tsx + new project-section.dom.test.tsx); DEFERRALS D-R7SHELL.2-1; ADR; PR; BUILD_INDEX 269; LEDGER advance (nextTicket 231_R7RELOAD.1).
- DECISIONS: item order Page/Outline/Figures/Versions/Reviews/Export/Project settings; targets Page→`/p/:slug`, Outline→`/outline`, Figures→`/figures`, Versions→`/v/working`, Reviews→`/review/<latest>` (latest review runId from files rounds; fallback `/p/:slug`), Export→`/export`, Settings→`/settings`; write-only={Export,Project settings} disabled under ReadOnlyProject w/ reason; demo allows Page/Figures/Versions/Reviews only; tree twin = `GET /bff/p/:slug?view=tree` (rides the existing demo-allowed `/p/$project` routeId — no demo allowlist change); icons: FileText/ListTree/Image/Mic/Paperclip/GitCommitHorizontal/File; hooks `data-shell-project`,`data-project-item`,`data-project-tree`,`data-lock-badge`; item icons FileText/ListTree/ImageIcon/History/ClipboardCheck/Download/Settings2; tree hidden when sidebar collapsed (items stay as icon+tooltip).
- IN PROGRESS NOW: app-shell.tsx ProjectSection (imports added, DemoAppShell mounts it; WorkspaceAppShell mount + component body next).
- 13:15Z — Phase 2 implementation COMPLETE: all source edits done (layout/state/keymap/tokens/ui/web/server/queries/app-shell/copy/dom-contract/r7legs/u3-probe). Verification: build+lint+typecheck green (138); check:dom-contract green; spa-budget **entry delta +13.7 kB / ≤15.0 allowance**. Unit tests: ide/tokens/ide-shell/app-shell/ide-chrome/versions-surface/occlusion-harness GREEN. DEFERRALS row D-R7SHELL.2-1 appended.
- TEST FALLOUT being fixed: figures.dom (sidebar /p/:slug link exemption — DONE), transitions.dom (pageGets excludes view=tree — DONE), SsrHandoff BFF-spend (projectTreeQuery gated on isSpaEnabled leaf verdict — DONE), copy-containment (COPY.appShell.project object ref — fix to leaf refs NEXT), registry.test U3.occlusion (check if pre-existing), demo.dom/palette.dom/dom-contract.test details pending, privsep.docker + demo-corpus = environmental (docker absent; corpus denylist — check pre-existing).
- 20:32Z — RESUMED run: commit `1277313e` + PR #268 + records were landed but the run paused before the CI boundary read and the ledger close. Boundary read at `1277313e` = **fail** (run 42082775909): `control-base.dom` (probe named `.ide-panel` — only `.ide-panel-tabs button` carries `background:none`) + `outline.dom` (back-link census over `[data-spa-root]` now includes the sidebar's Page item). Fixed scoped at `fb3e07d2`; all touched suites green locally; ADR-133 canonical header + Revisit trigger + index regen (check-build-memory 0 viol); ledger/index/phase-log close + boundary re-read next.

## Gap table

| item (spec §) | required layer | achieved layer | status | evidence |
|---|---|---|---|---|
| D1 project section — 7 items, SPA links + active, collapsed icon+tooltip, ReadOnlyProject write-only, recents exclusion (In scope 1, REQ-SHELL-4) | engineered | engineered | met | `app-shell.tsx:174-322` `ProjectSection` (items `:215-271`, disabled+reason `:285-306`, collapsed Tooltip `:291-294`); `ShellItem` `aria-current` `:379`; recents filter `:511` (`r.slug !== projectSlug`); `app-shell.dom.test.tsx` census |
| D2 Files tree — tree roles + keyboard nav, Lucide, Badge not glyphs, COPY label (In scope 2) | engineered | engineered | met | `files-pane.tsx` `role="tree"` `:176`, `treeitem` `:128`, `group` `:181`, roving tabindex `:105/:172`, `data-lock-badge` Badge `:132-139`; walk `onProjectTreeKeyDown` `app-shell.tsx:325`; `COPY.files.heading` `files-labels.ts` |
| D3 removal — rail + Files strip deleted, LAYOUT widths, pane state, keymap, paneLayout inputs (In scope 3) | engineered | engineered | met | `ide-shell.tsx` (no `.ide-rail`/`.ide-files` markup); `ide-css.ts` rail/files rules + arms dropped; `tokens.ts` LAYOUT `railPx`/`files*`/`bpFilesTicksMarginPx` gone; `layout.ts` files verdict gone, collapse panel→margin; `keymap.ts` `pane:"panel"`; `controller.ts`/`client/ide.ts` files paths removed |
| D4 DOM contract + U1.shell extension, R7a targets resolvable (In scope 4) | engineered | engineered | met | `dom-contract.ts:309-312` new hooks, `:1589-1590` retire note, `:1645-1649` files-pane family + `data-lock-badge`; `r7legs.ts` U1_SHELL project walk (rails/Files absent, recents exclusion, 7-item SPA walk, collapsed screenshot) held `expected:"red"` |
| AC1 no rail/Files DOM; test fails if reintroduced | engineered | engineered | met | `ide-shell.test.tsx`, `ide-chrome.dom.test.tsx`, `app-shell.dom.test.tsx`, `tokens.test.ts` absence asserts |
| AC2 7 items SPA-nav + active; ReadOnlyProject disables write-only w/ reason | engineered | engineered | met | `app-shell.dom.test.tsx` — item census, hrefs, `aria-current`, `data-disabled`+reason |
| AC3 tree keyboard-navigable, Badges not glyphs | engineered | engineered | met | tree roles + roving tabindex above; `data-lock-badge` every row, no lock glyph |
| AC4 pre-change blob tolerates; chords green | engineered | engineered | met | `ide.test.ts` codec stale-keys test; `keymap.test.ts` + `intercept.dom.test.tsx` green |
| AC5 dom-contract green; tour targets resolve; entry delta ≤15 kB | engineered | engineered | met | `check:dom-contract` OK; `check:spa-budget` **+13.7 kB** vs `04a4e98b` |
| AC6 Stage B at 250 | staging-verified | engineered | met-engineered(D-R7SHELL.2-1) | `DEFERRALS.md` `D-R7SHELL.2-1` OPEN → owner 250 |
| AC7 universal gate | engineered | engineered | met | this ledger; ADR-133; BUILD_INDEX 269; LEDGER advance; append-only OK; check-build-memory 0 viol |
| Out of scope (236 coherence/settings page · 243 versions · 241 export · 248 demo entry · 239 keymap) | — | — | confirmed not implemented | no outline-source rewrite, no Versions/Export surface work, no Demo item, no keymap expansion in the diff |

## Evidence log

- `pnpm turbo build lint typecheck` — green 138/138 at `1277313e` (recorded); `@rhema/web` typecheck+lint re-run clean at `fb3e07d2`.
- `pnpm exec vitest run` touched files: 8 dom files 137/137 + `server/versions-surface/renderer-overrides/palette/ide/tokens/ide-shell/occlusion/registry` 233/233 + `keymap/intercept` 87/87 — all green at `fb3e07d2`.
- `pnpm check:dom-contract` — OK (journeys ⊆ manifest ⊆ emitted+asserted).
- `pnpm check:spa-budget` — **entry +13.7 kB** of the ≤15.0 kB allowance vs baseline `04a4e98b`; total JS +48.5 kB; ceilings held.
- `node docs/build/tools/check-append-only.mjs --base stevevitali/r7pane-1-split-pane` — OK.
- `check-build-memory.sh .` — 0 violations after ADR-133 canonical header + `## Revisit trigger` + `adr-index` regen (18 warnings, all legacy/pre-existing).
- CI: first boundary read **fail** at `1277313e` (run 42082775909 — `control-base.dom` panel-button probe + `outline.dom` back-link census both pinned the pre-rail DOM) → scoped to the surviving rules at `fb3e07d2`; boundary re-read pending on the pushed head.

## Evidence report

Phase-4 gap walk found no unimplemented deliverable; the only drift was two Stage-A test
assertions still pinning the pre-removal DOM (found by CI, not the gap walk — the run paused
before the boundary read): `control-base.dom`'s specificity probe named `.ide-panel` where only
`.ide-panel-tabs button` carries `background:none`, and `outline.dom`'s "no back-link in the
body" census ran over `[data-spa-root]` which now legitimately contains the sidebar's Page item
linking `/p/:slug`. Both were scoped, not relaxed (the census moved to the leaf `<main>`; the
probe moved inside `.ide-panel-tabs`). Stage-B evidence is gate-pending per GD-PREVIEW.R7 —
`D-R7SHELL.2-1` names the extended `U1.shell` walk + 1440×900 screenshots at 250. Entry delta
+13.7 kB gz vs `spa-budget-baseline.json` (`04a4e98b`).

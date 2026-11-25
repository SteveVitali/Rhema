# Run ledger — R7UX.6 (row 329)

Harness: devin-cli/swe-2-high/subagent
Skills: implement-spec (full)
Started: 2026-11-25T21:26Z
Closed: (open)
Spec: docs/tickets/329_R7UX.6__slash-menu.md
Base: `stevenvitali/r7ux-5-pricing-copy` @ `4e1d2c86` (unmerged — OPERATOR)
Branch: `stevenvitali/r7ux-6-slash-menu`
Config: implement-spec full (ledger/self-review/gap/tests/evidence on; live = Stage A + owned
pr-<n> preview walk per the 324 ruling, $0, prod untouched)
Budget: ~700 changed lines incl. tests (M) — stop past it; the ticket OWNS the design
(spec deferred REQ-WRITE-3 to "a real design owns it later") — keep it deliberately minimal.

## Deferrals read

- Read `docs/tickets/DEFERRALS.md` at run start (2026-11-25). No `OPEN` row names this
  ticket, its branch, REQ-WRITE-3, or the slash menu as its unblocker.
- `D-R7UX.1-1` … `D-R7UX.5-1` (OPEN) — the 324–328 deployed-tip re-walks — untouched:
  they unblock only on the operator's stack merge + a deploy carrying those SHAs.
- This ticket's Live stage is "Stage A + preview walk" (same ruling as 324): the
  deployed-tip re-walk lands as a new D-R7UX.6-1 row at close.

## Requirements (spec Goal/anchors)

1. `/` typed at a block start opens a small command menu of the document's
   block-level constructs (data-hook emitted).
2. Entries are schema-derived only — only constructs `pageSchema` actually has
   (headings, lists, quote/code blocks, figures…), not a Notion clone.
3. Typed text after `/` filters the entries.
4. Arrow keys navigate; Enter inserts the chosen node at the caret and consumes
   the typed `/`+query text.
5. Escape dismisses the menu.
6. No menu where the schema forbids (inside a code block; anywhere the caret is
   not a paragraph-position block start).
7. Keyboard-first; mouse hover/click also works.
8. Follow the keymap/command conventions (chord literals, `format-commands`);
   menu renders on `ui-menu*` primitive classes; new `data-*` selectors only via
   `apps/web/src/dom-contract.ts`; no private protocol text in a browser bundle.

## Acceptance criteria (working checklist)

- AC1 (engineered): unit/DOM tests — `/` at block start opens the menu (data-hook).
- AC2 (engineered): typed text filters the entries.
- AC3 (engineered): arrow+Enter inserts the chosen node at the caret; the typed
  `/` is consumed.
- AC4 (engineered): Escape dismisses.
- AC5 (engineered): no menu inside a code block (or wherever the schema forbids).
- AC6 (engineered): `pnpm turbo build lint typecheck` + editor + web suites +
  `check:dom-contract`/`spa-budget`/`spa-env`/`protocol-markers` green.
- AC7 (preview): preview walk — editor screenshot with the menu open.

## Plan

1. `packages/editor/src/slash-menu.ts` — a PM plugin (like `decorationsPlugin`):
   state derives `{open, from, query, dismissedFrom, active}` from the caret's
   textblock match `^\/(\S*)` inside a `paragraph` parent (covers code_block /
   heading / table_cell exclusion — their parent is not `paragraph`); a
   `handleKeyDown` claims ArrowUp/Down/Enter/Escape only while open; a plugin
   `view` renders a `.ui-menu` div (`data-slash-menu`, `data-slash-item` rows,
   listbox/option roles, `aria-selected` on the active row) positioned at
   `view.coordsAtPos`, appended to `document.body` (the cmdMenu precedent).
   Entries are a small table `SLASH_ENTRIES` whose `make()` builds the schema
   node(s); apply = `tr.replaceWith` of the `/`-paragraph by the entry's node(s)
   in ONE transaction (the typed `/`+query is inside that paragraph — consumed).
2. `packages/editor/src/plugins.ts` — wire `slashMenuPlugin()` into `pagePlugins`
   (both local + collab states get it; read-only mounts never open it — the
   plugin view guards on `view.editable`).
3. `packages/editor/src/index.ts` — export the public surface (types + entries).
4. `packages/editor/src/slash-menu.test.ts` — PM-state tests (node env).
5. `apps/web/src/dom-contract.ts` — `data-slash-menu` + `data-slash-item`
   (editor surface, conditional, emittedBy `packages/editor`).
6. `apps/web/src/spa/slash-menu.dom.test.tsx` — happy-dom EditorView test
   proving the emitted hooks + keydown-driven insert through the real view.
7. Preview lifecycle on the PR head + signed-in headless walk (scratch project
   → `/` → `data-slash-menu` screenshot) → destroy → orphan sweep → rm.
8. Records: D-R7UX.6-1 deferral, runs/R7UX.6.md, BUILD_INDEX, LEDGER advance,
   BL-97 pointer in BACKLOG if applicable.

## Test matrix

| AC | Test |
|---|---|
| AC1 | plugin-state derive: "/" at empty-paragraph caret → open; "/" mid-text → closed |
| AC2 | `filterSlashEntries` — label/keyword substring match; query "he" narrows |
| AC3 | apply → paragraph carrying "/he" replaced by `heading{level:2}`; doc has no "/" text; selection inside the heading |
| AC3b | lists/quote/code/atoms — node shapes asserted (list>list_item>para, blockquote>para, table 2×2) |
| AC4 | Escape → dismissed at that `from`; further typing stays closed; leaving the match re-arms |
| AC5 | "/" inside code_block → closed; inside heading → closed |
| AC6 | suite runs |
| AC7 | signed-in preview walk |

## Progress

- 2026-11-25T21:2xZ — Phase 0: worktree on `stevenvitali/r7ux-6-slash-menu` @ `4e1d2c86`;
  `pnpm install --frozen-lockfile` clean; DEFERRALS read (ledger §Deferrals);
  scoped AGENTS read (root, apps/web, packages/ui, infra, journeys, docs;
  `packages/editor` has no scoped file — root applies).
- 2026-11-25T22:4xZ — Phase 1/2 implemented, design deviation from Plan §1 recorded: the
  menu DOM did NOT land as a plugin `view` inside `packages/editor` — that package is
  deliberately DOM-free (`decorations.ts` comment; `tsconfig` carries no DOM lib, the
  `HTMLElement` names fail typecheck). Split: `packages/editor/src/slash-menu.ts` owns the
  state plugin (match/derive/dismiss/move/set + `handleKeyDown` + `applySlashEntry`, zero DOM
  types) and `apps/web/src/spa/slash-menu.ts` owns the `.ui-menu` box — mounted in
  `PageMount`'s effect, synced through `installOriginDispatch`'s existing `onTransaction`
  tap (covers local commits AND remote ySync applies), plus capture-scroll/resize listeners.
  Same net shape, cleaner boundary. Editor plugin wired BEFORE the editing keymap so its
  while-open Enter/Escape/arrow claims beat `split`; PM's claimed-key preventDefault also
  keeps the chrome's layered-Esc handler out via its `e.defaultPrevented` guard.
- 2026-11-25T22:4xZ — Tests: `packages/editor/src/slash-menu.test.ts` 21 legs (node PM-state:
  match arms incl. atom-leading block, mid-text, caret-not-at-end; filter substring semantics;
  apply node shapes incl. nested list_item parent + schema `doc.check()`; dismiss/re-arm;
  collab-state arm). `apps/web/src/spa/slash-menu.dom.test.tsx` 9 legs (happy-dom real
  EditorView + real PM keydown: emit-only-while-open contract, filter, Enter insert through
  the keyboard path, Escape, read-only + code-block arms, the PageMount production-seam leg).
  All green. `turbo build lint typecheck` (editor+web) 17 tasks clean; editor+spa vitest
  921/921; `check:dom-contract` 88 editor hooks emitted+asserted; `check:spa-env` +
  `check:protocol-markers` OK; `check:spa-budget` ceilings held — entry delta +33.7 kB vs
  `04a4e98b` is the pre-existing cumulative drift (identical to the R7UX.2..R7UX.5 rows;
  this ticket ≈ +0 kB — the menu rides the lazy `editor` chunk).

## Gap table

(filled at Phase 4)

## Evidence log

(filled at Phase 5)

## Evidence report

(filled at Phase 6)

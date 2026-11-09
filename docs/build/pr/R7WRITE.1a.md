# R7WRITE.1a — Format bubble + page header strip (REQ-WRITE-1/6)

Ticket `docs/tickets/237_R7WRITE.1a__format-bubble-header-strip.md` · row 237 · stacked on `stevevitali/r7home-2b-opens-to-page`. **Stage A only — $0; no preview (`GD-PREVIEW.R7`), no production mutation.** mergePolicy: OPERATOR — this PR is never merged by the worker.

## What landed

### REQ-WRITE-1 — the format bubble (replaces the agent-only selection popover)

- A floating `data-format-bubble` appears **above** any non-collapsed Page selection. The pure
  placement rule (`@rhema/ide` `bubble.ts`) puts it over the selection's top edge and flips below
  ONLY when there is no room above — its rect never intersects the selection's client rects
  (geometry pinned by `bubble.test.ts` at top-of-page / mid-page / bottom-of-viewport).
- **Group 1** — Bold · Italic · Link · H2 · H3 · Quote · Bulleted · Numbered: local ProseMirror
  commands (`@rhema/editor` `format-commands.ts`) dispatched as `rhema:format-command`; the Page
  mount's live view applies them (PM-state tests cover all eight on plain + collab-bound state).
  No item POSTs; the bubble is zero-POST by construction.
- **Group 2** — Ask · Visualize · Fact-check · Review this section: the agent verbs keep the
  verbatim `parseCommand`/`resolveCommand` → run-sheet route (the §7.2 byte-identical invariant —
  the sheet stays the only launcher). Items carry estimator-sourced cost hints.
- The **"not available yet" items (Line edit, Cut to length) are REMOVED** — I6's shipping
  disabled affordances.
- The **leading Comment slot is reserved** for 238 (`SelectionMenuModel.comment` — `null` today;
  nothing renders).
- **Esc dismisses** and returns focus to the selection.
- **Contextual ⌘K = Link** (REQ-KEYS-1 Rule 4): inside the `page` zone with a non-collapsed
  selection the chord opens the bubble's inline link form (`data-format-link-input` + apply);
  everywhere else — and with no selection — the global palette event fires unchanged.

### REQ-WRITE-6 — the page header strip

- `PageStrip` (`@rhema/ui`) renders inside `.ide-page` ABOVE `.paper`: the `Project › Page`
  breadcrumb, the version chip (`vN` + frozen/working badge), the one sync indicator
  (`data-sync-pill`, moved — ADR-049's single indicator, still in-flow), the ReadOnlyProject
  notice, and the project actions **Run ▾ / Export / ⋯** (Run is a real DropdownMenu — B8's
  dead-caret fix; ⋯ carries Edit source until 239 + Import).
- The `page-chrome.tsx` hyperlink action row inside `ProjectOverviewBody` is REMOVED.
- The version/lock/read-only **banners and the proposal cards moved OUT of `.paper`** into the
  strip — informational left-rule style (B5 — never the input-like bordered box; B11 — no second
  card border at the measure). `.paper` now holds only the document + findings rail + note form.
- `.ide-page` is now a column (strip + paper, same measure clamp); Focus view hides the strip.
- SSR (`IdeFrame`) and SPA (leaves publish `IdeChromeData.pageHeader`) emit the same strip.

### ReadOnlyProject (S-3 / REQ-DWEB-14)

- `demo`/`showcase`/`run_lock`: the bubble withholds ALL write + agent items (it never opens —
  `data-readonly`/`data-locked`/demo gate); the strip renders `actions={null}` — zero affordance
  to fire a non-GET. Showcase keeps its Duplicate form in the notice. Frozen versions stay
  editable (typing/fork is 238's surface — not disabled here).

## Evidence (Stage A)

- **build** `pnpm turbo build --filter=@rhema/web...` ✅ · **typecheck** `@rhema/web` (all three
  tsconfigs) ✅ · **lint** touched packages ✅ (one pre-existing warning, chat-live.tsx)
- **vitest**: full `apps/web/src` sweep **1541/1541** ✅ · touched packages
  (`@rhema/{editor,ide,ui,tokens}`) **390/390** ✅
- `pnpm check:dom-contract` ✅ (all new hooks declared+emitted+asserted) · `check:spa-env` ✅ ·
  `check:protocol-markers` ✅
- **Entry delta: +14.8 kB gz** vs `apps/web/spa-budget-baseline.json` (baseline `04a4e98b`) —
  inside the ≤15.0 kB allowance (running total was +14.6 kB at ticket 236). Total JS +57.6 kB
  across all chunks; CSS +0.0 kB.

### New tests

| File | Pins |
| --- | --- |
| `packages/editor/src/format-commands.test.ts` | all eight format actions on PM state + collab arm |
| `packages/ide/src/bubble.test.ts` | above placement at top/mid/bottom, flip-only-when-no-room, no client-rect intersection, viewport clamps |
| `packages/ide/src/menus.test.ts` | two groups, cost hints, no dead items, reserved comment slot, byte-identical sheet resolve |
| `apps/web/src/spa/format-bubble.dom.test.tsx` | real mounted chrome: items, `data-placed="above"`, Esc, read-only withhold, ⌘K=Link / no-selection⇒palette, zero-POST dispatch |
| `apps/web/src/spa/page-strip.dom.test.tsx` | strip contents; `.paper` emits no banner/pill/proposal; read-only withholds all actions |

## Deferred

- `D-R7WRITE.1a-1` — Stage-B browser evidence at `250_R7DEP.2`'s R7b phase preview
  (`GD-PREVIEW.R7`): bubble-above-selection screenshot, header strip @1440+1024, read-only
  Showcase Page without bubble write items (covers B4/B5/B11/I6) + provenance PASS.
  This PR reports it owed — never green.

## Notes / judgement calls

- `@rhema/ide` gained a declared `@rhema/editor` dep edge for the `FormatAction` vocabulary
  (package.json + tsconfig reference + lockfile).
- `Run ▾` items navigate `GET /p/:slug/run?workflow=<w>` — the sheet stays the only launcher.
  Hint strings ride `opts.runHints`; items render hint-free rather than fabricating a figure.
- `page-mount`'s pill/banner DOM writes re-scoped to `[data-pane='page']` (document fallback —
  the demo mount) and now resolve lazily per write: the strip mounts via the leaf's chrome
  publish, which can land after the mount's effect.
- Changed-line budget: ~1,000 lines incl. test files — over the ~550 ticket estimate, driven by
  the test matrix (6 new/rewritten test files ≈ 600 lines) the ticket's evidence rules require.

## Requirement IDs

`REQ-WRITE-1`, `REQ-WRITE-6`, `REQ-KEYS-1` (Rule 4), `REQ-DWEB-14` (ReadOnlyProject), `REQ-KIT-2/5`,
`REQ-CHAT-22` (byte-identical sheet), `REQ-SPEC-30` (no tenant reads added). Findings discharged:
UXC-22, UXC-24, B4, B5, B11, I6 (B8 passed — Run ▾ is a real menu). `WRITE-3` stays BACKLOG.

Spend: **$0** (Stage A only).

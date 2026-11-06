# R7WRITE.1a — Format bubble + page header strip — run ledger

- Harness: `devin-desktop/swe-2-high/subagent`
- Ticket: `docs/tickets/237_R7WRITE.1a__format-bubble-header-strip.md`
- Scope: `REQ-WRITE-1` (format bubble) + `REQ-WRITE-6` (page header strip); `REQ-KEYS-1` Rule 4 contextual ⌘K.
- Base: `stevevitali/r7home-2b-opens-to-page` @ `c2f55cfd`; branch `stevevitali/r7write-1a-format-bubble`; PR base `stevevitali/r7home-2b-opens-to-page`.
- Stage A only — $0. No preview (GD-PREVIEW.R7); Stage B deferred to `250_R7DEP.2` (`D-R7WRITE.1a-1`).

## Plan (written before the build)

1. `@rhema/editor/format-commands.ts` — pure PM commands for the eight format actions
   (strong/em/link/heading-2/heading-3/blockquote/bullet/ordered) over the committed schema.
2. `@rhema/ide/menus.ts` — the selection popover's item model becomes the format-bubble model:
   reserved `comment` slot for 238 (null today), group 1 `format`, group 2 `agent` with
   estimator-supplied cost hints; the 1.x "not available yet" items are REMOVED (I6).
3. `@rhema/ide/bubble.ts` — the pure above-first placement rule (flip only when no room above).
4. `apps/web/src/spa/ide/controller.ts` — the selection popover becomes `data-format-bubble`:
   above-selection placement via `formatBubblePlacement`, format items dispatch
   `rhema:format-command` (PageMount's live view applies), agent items keep the sheet-route
   resolve; Esc dismisses + returns focus to the selection; the whole bubble withholds under
   ReadOnlyProject (`data-readonly`/`data-locked`/`isDemo`). Contextual ⌘K = Link inside the
   `page` zone with a selection; no selection ⇒ the global palette event (Rule 4).
5. `apps/web/src/spa/page-mount.tsx` — listens for `rhema:format-command` and dispatches the PM
   command on the live view (backstopped by `editable`); pill/banner queries re-scope to
   `.ide-page` (they moved out of `data-page-root`).
6. `packages/ui/src/page-strip.tsx` — `PageStrip`: crumb + version chip (frozen/working badge) +
   the moved sync pill + the ReadOnlyProject notice + Run ▾/Export/⋯ + the moved banners/proposals.
7. `packages/ui/src/ide-shell.tsx` — `pageHeader` slot inside `.ide-page` above `.paper`;
   `ide-css.ts` makes the page column stack + measure-clamps the strip + `.ide-fmt-bubble` chrome.
8. `page-chrome.tsx` — `pageStripFor(page, opts)` builds the strip from the shared `page` bag;
   the `ide-actions` hyperlink row inside `ProjectOverviewBody` is removed.
9. `pages.tsx` `IdeFrame` emits the strip for `data.page` (SSR); `spa/surfaces/editor.tsx`
   publishes it through `IdeChromeData.pageHeader` (SPA); `chrome-data.tsx`/`chrome.tsx` plumb it.
10. `dom-contract.ts` — declare the new hooks; `copy.ts` — `COPY.pageStrip`.

## Test matrix (Stage A)

| Behaviour | Test | Status |
| --- | --- | --- |
| format items apply marks/nodes (all 8) + collab state | `packages/editor/src/format-commands.test.ts` | PASS |
| placement: above at top/mid/bottom, flip only when no room, no client-rect intersection | `packages/ide/src/bubble.test.ts` | PASS |
| item model: two groups, cost hints, no dead items, reserved comment slot | `packages/ide/src/menus.test.ts` | PASS |
| strip: crumb/chip/pill/notice/actions; `.paper` has no banner/pill/proposal | `apps/web/src/spa/page-strip.dom.test.tsx` | PASS |
| bubble DOM: items, above placement, Esc, read-only withhold, ⌘K=Link / no-selection⇒palette | `apps/web/src/spa/format-bubble.dom.test.tsx` | PASS |
| read-only withholds (strip actions absent, proposal buttons disabled) | `read-only.dom.test.tsx` (updated) | PASS |
| phone compact withholds strip actions | `ide-surfaces.test.tsx` (updated) | PASS |
| collab pill/banner updates via `.ide-page` scope | `page-collab.dom.test.tsx` (updated) | PASS |

## Evidence log

- build/typecheck/lint on `@rhema/editor`, `@rhema/ide`, `@rhema/ui`, `@rhema/tokens`, `@rhema/web`: PASS.
- `pnpm turbo build --filter=@rhema/web...`: PASS (SPA bundle rebuilt).
- `pnpm --filter @rhema/web typecheck`: PASS (all three tsconfigs).
- `pnpm exec vitest run apps/web/src`: **PASS — 1541/1541** (89 files, 22.6 s). The first
  full-sweep attempt exposed an infinite publish→re-render loop (fresh `pageHeader` element each
  render destabilised the chrome memo — workers spun at 100 % CPU): fixed by `useMemo`-ing the
  strip in the three Page leaves + `useCallback`-ing `useProposalSeams`'s returns. Real failures
  fixed before commit: the demo mount's pill scope (pill/banner refs now resolve lazily per
  write — the strip mounts via the leaf's chrome publish after the mount effect), the
  copy-containment scan (`document.querySelector<…>` generic read as JSX text — the seam moved to
  leaf opts), and `page-collab`/`ide-surfaces` re-scopes.
- `pnpm exec vitest run packages/{editor,ide,ui,tokens}/src`: **PASS — 390/390** (36 files).
- `pnpm check:dom-contract`: PASS — every new hook declared + emitted + asserted.
- `pnpm check:spa-budget`: PASS — **entry delta +14.8 kB gz** of the ≤15.0 kB allowance vs
  baseline `04a4e98b` (was +14.6 kB at ticket 236; total JS +57.6 kB, CSS +0.0 kB).
- `pnpm check:spa-env`: PASS (52 banned server-env names, 142 client files scanned).
- `pnpm check:protocol-markers`: PASS.
- `node docs/build/tools/check-append-only.mjs --base stevevitali/r7home-2b-opens-to-page`: PASS.
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .`: 0 violations
  (20 warnings — all pre-existing/legacy + ledger line-budget notes).
- CI (`logs/ci-R7WRITE.1a.json`): first read FAIL `typecheck / lint / unit` — `linkCommand`
  unused import in `format-commands.test.ts` → fixed `6546f595`; second read FAIL —
  `document` is not defined in the server tsconfig (`page-chrome.tsx`'s `selectSourceToggle`)
  → the DOM seam moved back to leaf `onEditSource` opts `c80340aa`; third read below.

## AC gap table (Stage A posture)

| AC | Evidence layer | State |
| --- | --- | --- |
| Bubble above any non-collapsed selection; never covers selected lines; flips only when no room above | engineered + unit geometry (`bubble.test.ts`) + DOM (`format-bubble.dom.test.tsx`) | GREEN (Stage A) |
| Format controls Bold/Italic/Link/H2/H3/Quote/Bulleted/Numbered apply to the selection | engineered + PM-state (`format-commands.test.ts`) | GREEN |
| Second agent group with cost hints; no "not available yet" actions | engineered + unit (`menus.test.ts`) + DOM | GREEN |
| Esc dismisses | engineered + DOM | GREEN |
| Reserved first slot for 238's Comment | engineered (`SelectionMenuModel.comment`) | GREEN |
| Contextual ⌘K = Link with selection; palette without | engineered + DOM | GREEN |
| Header strip above paper: crumb, chip, sync, notice, Run▾/Export/⋯ | engineered + DOM (`page-strip.dom.test.tsx`) | GREEN |
| Chrome moved out of `.paper`; no card-in-card border | engineered + DOM; CSS column layout | GREEN |
| Read-only: bubble write/agent absent; strip writes absent; zero non-GET | engineered + DOM (readonly + zero-POST posture — no write affordance emits) | GREEN (Stage A) |
| Stage B: deployed screenshots (bubble above; strip @1440/1024; read-only showcase) | owed — `D-R7WRITE.1a-1` → `250_R7DEP.2` | RED (deferred) |

## Deferral

`D-R7WRITE.1a-1` — Stage-B browser evidence at 250's R7b phase preview (`GD-PREVIEW.R7`).
Unblocked by 250's preview walk. Verification: screenshots at the preview SHA, `--expect-sha`,
provenance PASS for web + api, committed under `docs/build/runs/R7WRITE.1a/`:
bubble above selection; header strip at 1440 + 1024; read-only Showcase Page without bubble
write items (covers B4/B5/B11/I6). 250 closes the row.

## Notes / judgement calls

- The hyperlink action row (`ide-actions`: Import/Run/Export) inside `ProjectOverviewBody` is
  REPLACED by the strip's Run ▾/Export/⋯ menus — the ticket's stated intent ("replaced by the
  strip's actions"). `Edit source` survives in the ⋯ menu: SPA calls the mounted
  `[data-source-toggle]`; SSR keeps the `/v/working` link (239's Rich text / Source toggle
  replaces it).
- The banners + proposal cards moved into `PageStrip` (inside `.ide-page`, above `.paper`) —
  `client/page.ts`'s proposal listener pass re-scoped to document; `page-mount`'s pill/banner
  writes re-scoped to `[data-pane='page']`.
- `@rhema/ide` gained an `@rhema/editor` dep edge (the `FormatAction` vocabulary — declared in
  `package.json` + `tsconfig` references).
- `Run ▾` items link to `/p/:slug/run?workflow=<w>` (GET to the sheet — the sheet stays the only
  launcher). Cost hints ride `opts.runHints` — supplied from the estimator surface; items render
  hint-free when no figure is supplied rather than fabricating one.
- The bubble's agent items keep the verbatim `parseCommand`/`resolveCommand` → sheet-route path
  (the §7.2 byte-identical invariant; zero POST).

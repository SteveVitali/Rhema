# SPA.25 — source-mode revival on the SPA Page mount (REQ-ED-17)

Manifest row 136 · stacks on `stevevitali/spaf-14-prod-flip-editor` @ `076f321` ·
merge policy **OPERATOR** — do not merge from the build environment · **$0** spend, no
deploys, no production writes.

Implements `docs/tickets/136_SPA.25__source-mode-revival.md` per
`docs/design/30_spa-source-mode.md` (the new design note — written first per the
ticket) and `docs/frontend-spa-spec.md` §6/R20's operator ruling: *"drop the dead
code; revive Source mode as a designed feature."* This is a **rebuild on the SPA
mount**, not a port of the retired `editor.js`/`SourceEditor`/`sync-machine.ts`
island — that island's failure mode was a second document story (own undo, own
`/save` transport, no provenance, no collab session). The revival is an alternate
*projection* over the live ProseMirror document: same `EditorState`, same
`Y.XmlFragment`/`Y.Doc`, same collab wire, same undo stack, same provenance plugin.

## Requirement IDs

**REQ-ED-17** (the source-mode revival) · **REQ-SAFE-7** (the SPA bundle budget —
the `codemirror` group ceiling) · supporting: REQ-ED-1/2/4/12 (mount discipline +
forced-SSR posture), REQ-POS-8/9 (provenance vocabulary + mixed degradation),
REQ-VFY-8 (journey leg wiring)

## What lands

- **`packages/editor/src/source-mode.ts`** — `diffTopBlocks` (top-level LCS over
  `node.eq`) + `applySourceMarkdown` — a **three-way merge** at block granularity:
  user runs (base→buffer) apply to the live doc translated past kept foreign runs;
  overlapping foreign runs drop (local wins the run). One transaction per commit,
  stamped `ORIGIN_META` `human`/`pasted` + `SOURCE_EDIT_META`. `null` on
  buffer≡base — normalization-only churn never reaches undo/provenance.
- **`apps/web/src/spa/page-source-mode.ts`** — the CodeMirror 6 bridge, imported
  ONLY dynamically → its own async chunk (`codemirror` budget group: **87.2 kB
  gzip**, ceiling 130 kB). Dirty on edits (`input.paste` arms `pasted`), 500 ms
  debounce commits, `commitNow` on toggle-off/pagehide/route-leave/⌘S-mint;
  foreign trs pull into a clean buffer verbatim (annotated out of CM history) and
  raise the stale note on a dirty one; editable posture follows the mount's lock
  flip on every tr.
- **`apps/web/src/spa/page-mount.tsx`** — `[data-source-bar]` + toggle +
  stale-note + `[data-source-host]`/`[data-pm-host]`; `installOriginDispatch`
  gains `onTransaction(tr)` (the bridge's tap — remote ySync applies funnel
  through `view.dispatch`); the pending buffer commits before the session release.
- **`dom-contract.ts`** — five new `editor` hooks (new names; the retired
  `data-editor-*` island hooks stay dropped per REQ-ED-16).
- **`packages/journeys`** — `T17` wired into `SURFACE_GATES.editor`
  (`expected:"red"`, `paid:false`): toggle → CM seeds canonical markdown → typed
  text commits through the same PM doc → toggle-back renders it. SPA-renderer-only
  by design; owed until the flagged preview exists (`D-SPA.25-1` — the shared
  `rhema-nonprod-resend-api-key` blocker, re-probed NOT_FOUND).
- **Styles + copy** — `.rm-source-*` rules in `ide-css.ts`; labels in `copy.ts`.
- **`apps/web/package.json`** — `prosemirror-model` declared (type-only; already
  pinned transitively at 1.25.12 — zero new packages, zero new licenses).

## Posture

Rides the existing `editor` surface flag — no new surface key; SSR keeps its
verbatim `data-page-host` block (the toggle only exists inside the SPA mount).
Phone/showcase stay forced-SSR forever — source mode cannot activate there by
construction. Read-only/locked drafts still toggle — into a read-only CM whose
commits refuse. No new endpoints; the four-layer autosave + provenance piggyback
carry source edits unchanged.

## Verification

`pnpm turbo build lint typecheck` 135/135 · `pnpm test` **5,618 pass / 6 skip / 0
fail** · `check:dom-contract` OK (editor 58/58) · `check:spa-budget` OK (87.2 kB) ·
`check:licenses`/`protocol-markers`/`no-cookies`/`spa-env` all OK · focused:
`source-mode.test.ts` 13, `page-source.dom.test.tsx` 5.

## Deferrals / deviations

`D-SPA.25-1` OPEN — the T17 preview leg (shared Resend-secret blocker).
Owned decisions (design/30 §"Rejected" + runs/SPA.25.md §5): per-run
last-writer-wins on overlapping foreign edits; no `@codemirror/lang-markdown` in
v1 (the grammar pushed the group to 169.8 kB — dropped to fit the ceiling; plain
CM editing stays "CodeMirror-class").

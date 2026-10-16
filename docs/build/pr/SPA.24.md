# SPA.24 — surface: `editor` part 2 — collab wire, autosave, provenance, undo

Manifest row 134 · stacks on `stevevitali/spa-23-editor-mount` @ `030761c` ·
merge policy **OPERATOR** — do not merge from the build environment · **$0** spend, no
deploys, no production writes.

Implements `docs/tickets/134_SPA.24__editor-collab-binding.md` per
`docs/design/23_spa-editor-collab-binding.md` (the normative mount discipline + the 29-row
parity checklist's second half) and `docs/frontend-spa-spec.md` §6. **The collab half of
the LAST surface** — `client/collab.ts` ports framework-free verbatim and binds into
`PageSessionRegistry`; `client/page.ts`'s chrome legs move into `PageMount`. The retired
source-editor island drops here per the manifest's dead-code note (`/edit/:draftId` has
302'd to `/v/:n` since P1.02); Source-mode return is SPA.25's designed feature; the prod
`editor` flip is SPAF.14 (after this lands — `editor` flips only when both halves land;
`STAGES.dev` already carries it from SPA.23).

## Requirement IDs

REQ-ED-3/5/7/8/9/10/11/15/16 · REQ-ISL-1..8 + REQ-ISL-16 · REQ-BFF-13 · REQ-VFY-8/9 ·
REQ-UX-3/4/5/10/13/14/15/16

## What lands

### The wire (`apps/web/src/spa/page-collab.ts`)

`createCollabWire` wraps `createCollabSession` verbatim (REQ-ISL-4 — ONE wire
implementation serves the SSR island and the SPA): `draft:<id>` document name,
`rhema-page/draft:<id>` IDB store, the cookie-authed `HocuspocusProvider`, the `rhema.*`
stateless vocabulary (`provenance`/`restore`/`fork`/`readonly`/`restore_point`/
`frozen_fork`). The added seam: the session lives in the registry across mounts, so
`setChrome` binds the CURRENTLY mounted `PageMount`'s `onSync`/`onFork`/`onReadOnly`/
`onRestorePoint` delegates — cleared on unmount, re-armed on remount, never rebuilding the
session. DOM-free; `pageCollabRuntime` is the test seam (the `spaRuntime.assign`
precedent).

### The mount (`apps/web/src/spa/page-mount.tsx`)

`client/page.ts` verbatim, effect-scoped to the mount's own `[data-page-root]`:

- **Four-layer autosave** — `acquire`'s init branches on the server-authorized
  `collabWsUrl`: present ⇒ the `CollabPageWire` + `createCollabPageState(wire.fragment,
  initSources)` (ySyncPlugin + yUndoPlugin — remote edits never enter the local undo
  stack); absent ⇒ `createPageState` (the artifact/read-only floor).
- **Pill/banners** — `setPill` + `lockedOverride` precedence (the poll's §6.3 read beats
  the session's optimistic state), `setLockBanner` writer/reader `{workflow}` templates,
  `showForkBanner` `v{n}`/`v{base}`.
- **`rebase` → `registry.rekey`** — every head-switch (the `rhema.fork` auth refusal AND
  the poll's `draftId` read) runs the wire's `rebind` FIRST inside `rekey`, then the
  mount's locals + `data-draft-id`/`data-draft-n` + the poll URL follow — the SAME Y.Doc
  + EditorState, never a rebuilt view.
- **10 s visible-only `/doc` poll** — `credentials:"same-origin"`, `accept:json`,
  `document.visibilityState` gate; rebase + lock banner + `editable` flip (empty-`tr`
  re-read) + rail `data-lost`/`data-lost-note` resync + `data-status-venue`.
- **`syncRail`** — scoped to `[data-findings-rail]` (the PM decoration layer stamps
  `data-finding-id` too; the island's document-wide query had the same latent skew —
  removed, not replicated); decoration inputs' `lost` flags stay in step.
- **⌘S exactly-once** — the window keydown mints in `input` focus or with no `[data-ide]`
  chrome; everywhere else the chrome's `rhema:restore-point` CustomEvent resolves to the
  SAME mint (the 250 ms same-tick guard collapses double-delivery — design/23 F9).
- **Flush ordering** — `pagehide`/`visibilitychange:hidden`/route-leave refcount-0: the
  pending 600 ms provenance piggyback lands BEFORE `session.flushOnHide()` (the
  `blur` restore trigger + provider flush). No `beforeunload`, no Save button, no
  `sendBeacon`, no markdown POST — ever.

### The dead-code drops (REQ-ED-16)

`client/editor.ts`, `client/editor.test.ts`, `client/sync-machine.ts`,
`client/sync-machine.test.ts`, `packages/ui/src/source-editor.tsx` deleted;
`@rhema/ui` index exports pruned; `editor` out of `CLIENT_ENTRIES`; `collab.ts`'s
callerless `intent:"ro"` option dropped (OQ2); `data-save-url`/`saveUrl` dropped (OQ3 —
`/save` stays server-side); the lock banner's `data-{writer,reader}-text` templates now
emit unconditionally (a mid-session lock needs them); `dom-contract.ts` editor surface
rebalanced to **53 hooks, 53 emitted + asserted**; `check-protocol-markers.mjs`'s
`SPA_WEB_SRC_ALLOW` += `client/collab.`; `COVERAGE_MATRIX.csv` REQ-IDE-43/46 re-cited to
the live modules.

## Verification

| Gate | Result |
|---|---|
| `pnpm turbo build lint typecheck` | green — 90/90 tasks per leg |
| `pnpm test` (repo root) | **5,599 pass / 6 skip / 0 fail** (487 files) |
| `page-collab.dom.test.tsx` (NEW) | **15/15** — wire bind, pill + lock precedence, visible-only poll, rail resync, fork→rekey same-Y.Doc, ⌘S exactly-one, flush ordering, refcount-0 release + session reuse, collab-less floor |
| `page-sessions.test.ts` · `editor.dom.test.tsx` · `page-dispatch.test.ts` | 9/9 · 16/16 · 3/3 |
| `check:dom-contract` | editor **53/53** emitted + asserted |
| `stages.test.ts` · `surface-gates.test.ts` · `check-coverage-matrix` | green |
| `check:licenses` · `check:protocol-markers` · `check:no-cookies` · `check:spa-budget` · `check:spa-env` | all clean (822 packages; 244 public-facing files / 142 artifacts; all ceilings held) |

## Deferrals

Opened `D-SPA.24-1` (the collab half's preview two-leg + leg C on `pr-<n>` — the shared
`rhema-nonprod-resend-api-key` prerequisite re-probed NOT_FOUND; D-MAINT.6-1 operative) and
`D-SPA.24-2` (rollback drill — flag-off exercises the SAME `collab.ts` wire through the SSR
island). `D-OPS.1-1`, `D-SPA.6-1`, `D-MAINT.6-1` blocker-updated, stay OPEN. **None
closed** — every upstream OPEN row still needs its named operator prerequisite.

## Out of scope (SPAF.14 / SPA.25 / SPA.26+)

The prod `editor` flip — SPAF.14. Source-mode revival — SPA.25. Island-bundle retirement
beyond the editor entry — SPA.26.

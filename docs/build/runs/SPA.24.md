# SPA.24 — run ledger: surface `editor` part 2 — collab wire, autosave, provenance, undo

- **Ticket:** `docs/tickets/134_SPA.24__editor-collab-binding.md` (manifest row 134)
- **Branch:** `stevevitali/spa-24-editor-collab` — forked from
  `stevevitali/spa-23-editor-mount` @ `030761c` (the requested chain tip).
- **PR:** #156 — opened at closeout; `gh pr checks 156 --watch=false` read once at closeout
  (result recorded in § PR checks read below; inherited `integration`/privsep red, if it
  reports, is waived per GD-MAINT.4-1 — classified, not repaired).
- **Harness:** devin-cli subagent (per the 2026-10-08T23:05Z dispatch-tier ruling).
- **Mode:** offline-only, $0 — no deploys, no production writes, mergePolicy OPERATOR.
- **Spend:** `paid:false` legs only; no metered spend ($0).

## 0 — Prerequisite probe (run first, per the ticket's operating clause)

```
gcloud secrets versions access latest \
  --secret=rhema-nonprod-resend-api-key --project=rhema-507501
→ ERROR: (gcloud.secrets.versions.access) NOT_FOUND
gcloud secrets list --filter='name~resend' --project=rhema-507501
→ only rhema-prod-resend-api-key
```

The secret was never printed (there is no version to print); the shared non-prod Resend
key is still absent, so no signed-in preview session can mint through the magic-link +
mailbox leg — the Page routes are session-gated and the collab legs additionally need the
live `apps/collab` service on the same stack. The preview two-leg and rollback drill are
honestly deferred (`D-SPA.24-1`/`-2`), with the deterministic in-repo proof standing in.
Same live blocker as `D-MAINT.6-1` / `D-SPA.6-1` / `D-SPA.12-1` … `D-SPA.23-1`.

## 0b — Inherited chain debt

None closed this run. `D-OPS.1-1`, `D-SPA.6-1`, `D-MAINT.6-1` blocker-updated (the SPA.24
re-probe), all stay OPEN; `D-SPAF.1-*`…`D-SPAF.13-*` stay OPEN behind the operator
merge+deploy prerequisite; `D-SPA.23-1`/`-2` stay OPEN on the same stack.

## 1 — What landed

The **second half of the LAST surface** — the editor's collab binding (design/23 §3/§6).
`client/collab.ts` was already framework-free, so this row WRAPS it in the registry
(`REQ-ISL-4` — one wire implementation serves the SSR island and the SPA verbatim) and
ports `client/page.ts`'s chrome legs into `PageMount`. The retired source-editor island
(`client/editor.ts` + `client/sync-machine.ts` + `ui/source-editor.tsx` + the `editor`
bundle entry) drops here per the manifest's dead-code note — `/edit/:draftId` has 302'd to
`/v/:n` since P1.02, so nothing routed to it; Source-mode return is SPA.25's designed
feature.

### The wire (`apps/web/src/spa/page-collab.ts`)

- `createCollabWire` wraps `createCollabSession` verbatim — `draft:<id>` document name,
  `rhema-page/draft:<id>` IDB store, the cookie-authed `HocuspocusProvider`, the `rhema.*`
  stateless vocabulary (`provenance`/`restore`/`fork`/`readonly`/`restore_point`/
  `frozen_fork`) — and adds the one seam the registry custody needs: the session outlives
  any one mount, so `setChrome` binds the CURRENTLY mounted PageMount's
  `onSync`/`onFork`/`onReadOnly`/`onRestorePoint` delegates; unmount clears them (events
  degrade to no-ops), remount re-arms without rebuilding the session.
- `CollabPageWire` = `PageSessionWire` + the collab internals the chrome legitimately
  reads (`provider.unsyncedChanges` for the queued count, the `sync` snapshot for the
  pill's initial paint). `isCollabWire` narrows a registry session. DOM-free.
- `pageCollabRuntime` — the `spaRuntime.assign`-precedent test seam: mounted-router specs
  rebind the session factory module-wide; production keeps `createCollabSession`.

### The mount (`apps/web/src/spa/page-mount.tsx`) — `client/page.ts` verbatim, effect-scoped

- `acquire`'s init branches on the server-authorized `collabWsUrl` prop: present ⇒ the
  `CollabPageWire` + `createCollabPageState(wire.fragment, initSources)` (ySyncPlugin +
  yUndoPlugin — a peer's edits never enter the local undo stack, REQ-ED-10); absent ⇒
  `createPageState(docJson, initSources)` (the collab-less/artifact read floor, parity row
  29 verbatim).
- `setPill` + `lockedOverride` precedence, `setLockBanner` writer/reader `{workflow}`
  templates, `showForkBanner` `v{n}`/`v{base}` — imperative writes into the verbatim
  `data-sync-pill`/`data-page-banner` DOM the shared `PageEditor` emits.
- `rebase` routes EVERY head-switch through `registry.rekey` — the wire's `rebind` runs
  FIRST inside `rekey` (a throw leaves the map untouched), then the mount's locals +
  `data-draft-id`/`data-draft-n` follow; the SAME Y.Doc + EditorState, never a rebuilt
  view. The `/doc` poll URL rewrites to the child verbatim.
- `applyLock` + the 10 s visible-only `/doc` poll (`credentials: "same-origin"`,
  `accept: application/json`, unchanged route — REQ-ED-11/REQ-ISL-6): rebase, banner,
  `editable` flip via the empty-`tr` re-read, rail `data-lost`/`data-lost-note` resync,
  `data-status-venue`.
- `syncRail` — scoped to `[data-findings-rail]` (the decoration layer stamps
  `data-finding-id` on the PM node too; an unscoped query would write lost markers onto
  the decorated block — the island's document-wide query had that same latent skew), then
  the decoration inputs' `lost` flags stay in step + `applyDecorations` re-runs.
- ⌘S → exactly ONE `markRestorePoint` (REQ-ED-7): the window keydown mints in `input`
  focus or when no `[data-ide]` chrome is mounted; everywhere else the chrome's
  `restore-point` IdeAction emits `rhema:restore-point`, which resolves to the SAME mint —
  the 250 ms same-tick guard makes double-delivery a no-op regardless of listener order.
- `pagehide`/`visibilitychange:hidden` → the pending 600 ms provenance piggyback flushes
  BEFORE `session.flushOnHide()` (the `rhema.restore{cause:"blur"}` trigger + the
  provider's own flush); route-leave = refcount 0 runs the same pair through the registry
  release — `provFlushRef` lands the capture before `release`'s flush (REQ-ED-5 ordering).
  No `beforeunload`, no Save button, no `sendBeacon`, no markdown POST — ever.
- The island's `installOriginDispatch` moves here verbatim (non-re-entrant `updateState`
  apply — a `dispatch` inside `dispatchTransaction` blew the stack on the N8 walk);
  `page-dispatch.test.ts` still pins it.

### The dead-code drops (REQ-ED-16; manifest note)

- `apps/web/src/client/editor.ts`, `editor.test.ts`, `sync-machine.ts`,
  `sync-machine.test.ts`, `packages/ui/src/source-editor.tsx` — deleted (the
  `/edit/:draftId` GET's 302 made the SourceEditor surface unrouted since P1.02).
- `packages/ui/src/index.ts` — the stale `SourceEditor`/`SyncPill`/`EditorLockBanner`/
  `EditorFindingsRail` exports removed.
- `client-entries.mjs` — `editor` out of `CLIENT_ENTRIES` (`["ide","page","outline",
  "landing"]`).
- `collab.ts` — the `intent:"ro"` option removed (design/23 OQ2's recommended arm: no
  caller existed — every attach is write-intent, the fork-on-type IS the feature).
- `page-editor.tsx` — `data-save-url`/`saveUrl` prop dropped (OQ3's recommended arm; the
  `/save` route stays server-side for `?collab=local`) AND the lock banner's
  `data-{writer,reader}-text` templates now emit unconditionally — the §6.3 poll can grab
  a lock mid-session on a page that mounted unlocked and needs the templates to fill in.
- `pages.tsx`/`routes.tsx`/`page-data.ts`/`render.tsx` — the retired source-editor
  rendering paths, bags, and comments pruned; `page-chrome.tsx` drops the `saveUrl` line.
- `dom-contract.ts` — the retired `editor`-surface hooks pruned; `data-page-banner-text`
  + `data-lost-note` manifested (the poll's live-written nodes); editor surface now
  **53 hooks — 53 emitted, 53 asserted**.
- `check-protocol-markers.mjs` — `SPA_WEB_SRC_ALLOW` += `client/collab.` (the shared
  leaf module the SPA graph legitimately bundles — REQ-ISL-4).
- `COVERAGE_MATRIX.csv` — REQ-IDE-43/46 re-cited to the live files
  (`page-mount.tsx`/`collab.ts`/`page-collab.dom.test.tsx`); owning_tickets += `SPA.24`.

## 2 — Verification

| Gate | Result |
|---|---|
| `pnpm turbo build lint typecheck` | green — 90/90 tasks per leg |
| `pnpm test` (repo root) | **5,599 pass / 6 skip / 0 fail** (487 files, 2 skipped) |
| `page-collab.dom.test.tsx` (NEW) | **15/15** — wire binds at acquire + one session per registry entry across StrictMode remount; verbatim pill vocabulary + `lockedOverride` precedence; 10 s visible-only poll (hidden pages never fetch) + lock banner fill/release + editable flip; rail `data-lost`/`data-lost-note` resync scoped to the rail; `rhema.fork` → `registry.rekey` same-Y.Doc/state rebase + §5.4 banner + poll-URL rebase; ⌘S exactly-one mint across keydown + `rhema:restore-point`; `pagehide`/`visibilitychange:hidden` provenance+session flush ordering; route-leave refcount-0 flush + session reuse within TTL; the collab-less mount never touches the wire factory |
| `page-sessions.test.ts` | **9/9** (rekey moves the entry + runs `rebind` first) |
| `editor.dom.test.tsx` | **16/16** (mount contract unchanged — the wire is a registry-custody detail) |
| `check:dom-contract` | editor **53/53** emitted + asserted (`data-writer-text`/`data-reader-text`/`data-lost`/`data-lost-note-text` literal selector coverage added) |
| `stages.test.ts` · `surface-gates.test.ts` | green (dev already carries `editor` from SPA.23 — the manifest's "both halves land before flip" note; prod/preview pinned; editor gate owed-note names D-SPA.24-1) |
| `check:licenses` · `check:protocol-markers` · `check:no-cookies` · `check:spa-budget` · `check:spa-env` | all clean (protocol allowlist += `client/collab.`; 822 packages; 110 client sources / 142 artifacts; all bundle ceilings held) |
| `check-coverage-matrix` | green (REQ-IDE-43/46 re-cited) |
| REQ-VFY-9 disposition | **MET** — SSR HTML-string asserts retained (`server.test.ts`/`page.test.ts`/`editor.test.ts` transport legs); SPA render asserts in `page-collab.dom.test.tsx` + `editor.dom.test.tsx`; status/mutation legs in `server.test.ts` + the carried journey steps |

### Mid-run fixes (all real, all re-verified)

- `check:dom-contract` initially red: `data-writer-text`/`data-reader-text`/
  `data-lost-note-text` lacked literal-selector assertion coverage (the scanner does not
  count `dataset` reads) — literal `getAttribute` assertions added to the poll test.
- `syncRail` rail/PM ambiguity: the first test run found `[data-finding-id]` matching the
  ProseMirror decoration node before the rail row — `syncRail` scoped to
  `[data-findings-rail]` (the island's latent skew removed, not replicated).
- Lint: `prefer-const` on the test's view ref; unused `CollabPageWire` import dropped.
- `check-coverage-matrix` red on the deleted `sync-machine.*` citations — re-cited to the
  live modules (the matrix is the current-state gate; REQ rows updated in place).
- Harness note (carried from SPA.23): `paywall.test.ts` walks `packages/ui/src` relative
  to CWD — green under the canonical root `pnpm test`; a CWD-scoped run reds it as an
  invocation artifact.

## 3 — Deferrals

Opened `D-SPA.24-1` (the collab half's preview two-leg + leg C on `pr-<n>` — the Resend
prerequisite) and `D-SPA.24-2` (rollback drill on the same preview — flag-off exercises the
SAME `collab.ts` wire through the SSR island, so the drill double-covers the shared
transport). `D-OPS.1-1`, `D-SPA.6-1`, `D-MAINT.6-1` blocker-updated. **None closed** —
every upstream OPEN row still needs its named operator prerequisite.

## 4 — AC disposition

| AC | Layer | Disposition |
|---|---|---|
| All 29 parity-checklist rows asserted (component + integration tests enumerate them) | deterministic · engineered | **MET** — rows 2-26 + 29 ported verbatim or per their design/23 DELIBERATE-CHANGE arms and asserted in `page-collab.dom.test.tsx` (15) + `page-sessions.test.ts` (9) + `editor.dom.test.tsx` (16) + `page-dispatch.test.ts`; rows 1/27/28 are the sanctioned drops (props/DTO inputs, `data-save-url` pruned, typed bootstrap over `script[type=json]` scraping) |
| Autosave layers proven: IDB write, WS sync, materialization debounce, route-leave flush | deterministic · engineered | **MET** — the wire module is `collab.ts` verbatim (IDB + WS + materialization unchanged); the registry's refcount-0 flush leg is asserted (`flushOnHide` on unmount), `pagehide`/hidden-flush ordering asserted against a pending provenance capture |
| Provenance/undo separation: agent txns never in human undo; `frozen_fork` refusal honored | deterministic · engineered | **MET** — `createCollabPageState` carries `yUndoPlugin` scoping verbatim (peer edits never enter local undo); proposal accepts dispatch `acceptProposalTr` agent-origin trs leaf-side (SPA.23 seam retained); the `rhema.fork` → rekey/rebind leg is asserted same-Y.Doc/same-EditorState |
| Collab session survives route remount (registry rekey) | deterministic · engineered | **MET** — StrictMode double-mount keeps ONE session + the same EditorState; unmount→remount inside the TTL reuses the same wire (`sessions.length` stays 1); `rekey` moves the entry with `rebind` first |
| Dev stage-fact line lands (`STAGES.dev.spaSurfaces += 'editor'`); `?ssr=1` + the `x-rhema-renderer` override still force SSR | deterministic · engineered | **MET** — `STAGES.dev.spaSurfaces` already carries `editor` (SPA.23 authored the line per the manifest's both-halves note); preview `[]`, prod untouched (SPAF.14 owns); the override pins are unchanged + asserted (`spa-flag.test.ts`) |
| Universal phase-gate AC | agentic | **MET** — verification green; requirement ids stamped in `pr/SPA.24.md`; `D-SPA.24-1`/`-2` ledgered; no new ADRs (no design deviations — every DELIBERATE-CHANGE row executes design/23's own named arm: F9 ⌘S ownership, OQ2 `intent:"ro"` drop, OQ3 `data-save-url` prune, the retired-source-editor drop); BUILD_INDEX + LEDGER advanced; append-only honored; dates from the clock; PR checks read and recorded below |

## PR checks read

`gh pr checks 156 --watch=false` at closeout (2026-10-09T23:33Z) → **`typecheck / lint /
unit — pending`** (one job reported; the first substantive check status this chain has
reported — #140–#155 all read "no checks reported"). Not yet resolved at ledger-write time;
the local green gate (`turbo build/lint/typecheck` + `pnpm test` 5,599/0-fail + all
`check:*` gates) stands in — recorded per the operating clause, not awaited.

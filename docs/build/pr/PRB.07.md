# PRB.07 — CodeMirror source editing and manual revision (beta stopgap #1)

**Spec:** `docs/tickets/23_PRB.07__source-editing.md` (REQ-BETA-21, REQ-DATA-24, REQ-DATA-26,
REQ-DATA-29, REQ-IDE-32, §6.3 / REQ-RUN-8 surface, REQ-BETA-7 manual half)
· **Base:** `stevevitali/prb-06-revise-whatchanged-rereview` · **Stacked PR — do not merge (mergePolicy=OPERATOR).**

## Summary

The beta's manual-revision path: a CodeMirror 6 editor over the canonical markdown (stopgap #1 — it
survives as 1.x Source mode), honoring the version contract the permanent editor will inherit. Typing
on a frozen reviewed head forks `v(N+1) origin='human_revision'` with a `draft.forked` timeline event
and no confirm dialog; every later save updates that working head in place. The review's findings
project onto the edited head through the shared `resolveAnchor` ladder with "from Review of vN" labels;
lost anchors land on Whole piece with "passage changed — still applies?". The page is read-only while a
writer run holds the project or a reader run holds the head — banner + *Cancel run to edit*. The one
note field writes `Guidance` for the next Revise; "Revise using your edits" creates the revise run with
`priorReviewId` + the new base draft and auto-moots the lost findings' live obligations pending triage.
Human-edited blocks carry `human` provenance in the sidecar map; the stored markdown stays verbatim.

## What changed

- **`@rhema/findings-core`** — `manual-revision.ts`: `projectFindingsOntoMarkdown` (re-anchor through
  the canonical ladder; unresolved → `unanchored` + `lost`), `diffBlockIds`, `humanProvenanceSpans`
  (inherit base spans; touched/new blocks → `human`).
- **`@rhema/contracts`** — `draft.forked` event (ids + n only).
- **`@rhema/orchestrator`** — `locks.ts` exports `HOLDING_STATES` + `editorLockForRuns`
  (writer=`ns:write`/​`draft:write`; reader=`draft:read:<head>`); `cancel.ts` `cancelRun`.
- **`@rhema/db`** — migration `0019` `timeline_events` (project-scoped timeline for run-less human
  events) + the Drizzle table.
- **`@rhema/mirror`** — `saveManualRevision`: for-update head read; frozen → `openHumanRevision` fork
  (idempotent — an existing working child owns the save, so a stale base id or retried beacon can never
  fork twice); working `human_revision` → in place. Per save: content-addressed markdown,
  `artifact_versions` + `block_id_map` sidecar, `provenance_maps`, `live_docs`, snapshot restore point,
  persisted finding projections, `revision.move_traced` via the PRB.06 `manual-trace` seam.
- **`apps/api`** — `createEditorRoutes`: `GET …/editor/:draftId` (doc+lock+rail), `POST …/save` (JSON
  or `text/plain` beacon), `POST …/note` (→ `Guidance`, `revise`-scoped), `POST …/cancel-run`, `POST
  …/revise` (auto-moot lost findings; idempotency-keyed `createRun` with `manualRevision`). Every route
  resolves a frozen base to its working `human_revision` child (`resolveEditorHead`) — stale URLs/forms
  never 404 and never re-fork.
- **`@rhema/api-client`** — `EditorDocDto`/`EditorSaveDto`/`EditorLockDto`/`EditorFindingDto` + the
  five methods.
- **`@rhema/ui`** — `SourceEditor` SSR shell: CodeMirror host + read-only `<textarea>` no-JS fallback,
  `SyncPill`, `EditorLockBanner` + Cancel-run form, findings rail, note form, "Revise using your edits".
- **`apps/web`** — `GET /p/:slug/edit/:draftId` SSR + JSON `/doc` poll + `/save` `/note` `/cancel-run`
  `/revise` (forms work with no JS); `project-list.ts` `headDraftId` (the "Edit source" entry point);
  `COPY.editor`; the client bundle (`src/client/editor.ts` + `sync-machine.ts`, esbuild →
  `public/editor.js`, gitignored): CodeMirror markdown mount, debounced autosave, sync pill, lock poll,
  rail lost-badge sync, pagehide beacon flush, and **fork rebase** — a save/doc response carrying a new
  `draftId` re-targets every subsequent request and `history.replaceState`s the URL onto the working
  head.

## Design decisions

- **Idempotent fork.** The save path treats "frozen base + existing working `human_revision` child" as
  already-forked and routes the write to the child — at the mirror, the api read/lock layer, and the
  client URL layer. Three independent guards, all regression-tested.
- **Locks check the resolved head.** A `draft:read` lock on the frozen base alone does not block a save
  bound for the child — the run reads the immutable base version either way; the child's own locks and
  project writer locks still apply.
- **Events are ids + counts.** `draft.forked`/`revision.move_traced` carry no draft text — no protocol
  IP or content in the event stream (REQ-ARCH-33).
- **No save affordance.** No Save button and no unsaved-changes dialog; the 800 ms debounce + pagehide
  beacon bound the refresh-loss window (documented on the pill + in code).

## Out of scope (as specced)

Tiptap/ProseMirror WYSIWYG, proposal cards, Apply, suggestion marks, Yjs, working copies, restore-point
browsing UI (P1.02/P1.3). Live `dev` exercise of the editor is deferred — **D-PRB.07-1**.

## Test plan

- `packages/mirror/src/manual-revision.test.ts` — fork rows/events, verbatim bytes, block-id sidecar,
  human spans, restore point, projections, no-op save, **stale-base routing**, not-editable guard.
- `apps/api/src/editor-routes.test.ts` — GET doc/labels/lock, save fork + in-place, **stale base URL
  stays live** (GET resolves to child, second base save doesn't re-fork), 409-under-lock + cancel
  release, note → Guidance, revise auto-moot + run inputs + **stale re-POST dedupe**.
- `apps/web/src/client/` — sync-machine (6), editor controller (7: mount, debounced payload, 409 lock,
  poll lock/unlock, rail badge sync, **fork rebase**, doc-poll rebase); SSR `editor.test.ts` (16).
- Gates: `pnpm turbo build lint typecheck` **108/108**; `pnpm test` **1722 pass / 2 skip / 241 files**;
  `check:protocol-markers` OK; `check:licenses` OK (497 pkgs; `duck`/`pako` exceptions recorded);
  build-memory validator 0 violations. Live: not run (deterministic-only per operator; D-PRB.07-1).

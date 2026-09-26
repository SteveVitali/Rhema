# PRB.07 — CodeMirror source editing and manual revision (beta stopgap #1)

- **Spec:** `docs/tickets/23_PRB.07__source-editing.md`
- **Base:** `stevevitali/prb-06-revise-whatchanged-rereview` @ `9c4777a`
- **Branch:** `stevevitali/prb-07-source-editing`
- **Config:** implement-spec full preset (autonomous; live legs NOT permitted — deterministic only per operator)

## Deferrals read

`docs/tickets/DEFERRALS.md` read at start. Relevant OPEN rows:

- `D-PRB.05-1` (live triage-write leg), `D-PRB.04-1/2` (live dossier read + SSE) — same class of live
  exercise this ticket can't drive without a deploy; none unblocked here.
- `D-P0.09-2` (markdown↔ProseMirror round-trips) — explicitly out of scope (no PM schema; the CodeMirror
  stopgap edits canonical markdown directly). Untouched.
- `D-P0.12-3`, `D-P0.10-1/-2`, etc. — other tickets' rows, untouched.
- **Opened:** `D-PRB.07-1` (live source-editor exercise on `dev`).

## Requirements

1. CodeMirror 6 over the canonical markdown; debounced autosave (800 ms) + server-side snapshot restore
   points; sync pill (synced / syncing / offline-queued); no Yjs, no Save button, no unsaved-changes
   dialog.
2. Editing a frozen head forks `v(N+1) origin=human_revision` without a confirm; findings project onto
   the new head via quote re-anchoring with "from Review of vN" labels; lost anchors land on Whole piece
   with "passage changed — still applies?".
3. Read-only during writer runs and frozen-head reads; lock banner with *Cancel run to edit*; the note
   field writes `Guidance` (REQ-DATA-41's comment path, one field at beta).
4. Manual-revision saves emit the PRB.06 `revision.move_traced`; "Revise using your edits" seeds a revise
   run (review = vN review, base = v(N+1) head) and auto-moots unanchored findings pending triage.
5. Human-edited blocks carry `human` provenance in the sidecar map; the stored markdown is verbatim — no
   ids or marks.

Out of scope (must NOT implement): Tiptap/ProseMirror WYSIWYG, proposal cards, Apply, suggestion marks,
Yjs, working copies, restore-point browsing UI.

## Plan

- **findings-core `manual-revision.ts`:** `projectFindingsOntoMarkdown` (anchor re-resolution through the
  shared `resolveAnchor` ladder; unresolved → Whole piece + `lost`), `diffBlockIds` (block-id sidecar
  diff → which blocks the human touched), `humanProvenanceSpans` (inherit base spans; touched/new blocks
  → `human`).
- **contracts:** `draft.forked` event (id/n payload only).
- **orchestrator:** `locks.ts` gains `HOLDING_STATES` (exported; `provision.ts` now imports it) +
  `editorLockForRuns` (writer = `ns:write:*:<projectId>`/`draft:write:<head>`; reader =
  `draft:read:<head>`); `cancel.ts` `cancelRun` (terminal-state-aware; releases the lock by transitioning
  out of holding states).
- **db:** migration `0019_timeline_events.sql` (project-scoped timeline rows for run-less human events —
  `draft.forked`, `revision.move_traced` on manual saves) + the `timelineEvents` Drizzle table
  (schema-parity gate).
- **mirror `manual-revision.ts`:** `saveManualRevision` — `for update` draft read; frozen → fork via
  `openHumanRevision` (idempotent: an existing working `human_revision` child owns the save — a stale
  base id can never fork twice); working `human_revision` → in place. Content-addressed markdown write,
  `artifact_versions` row with `block_id_map` sidecar, `provenance_maps` spans, `live_docs` upsert,
  snapshot restore point per changed save, finding projections persisted, `draft.forked` +
  `revision.move_traced` via the project-scoped `timeline_events` sink (or the run-scoped writer when a
  run id is present).
- **api `editor-routes.ts`:** `GET /projects/:id/editor/:draftId` (doc + lock + findings rail DTO),
  `POST …/save`, `POST …/note` (→ `captureGuidance` `inline_comment`, `revise`-scoped), `POST
  …/cancel-run`, `POST …/revise` (auto-moot live obligations of lost findings; `createRun` with
  `priorReviewId`/`nextDraftId`/`manualRevision{baseDraftId,mootedFindingIds}`). `resolveEditorHead`
  follows a frozen base to its working child on every route — stale URLs/forms never 404 and never
  re-fork; the revise idempotency key is on the resolved head so a stale re-POST dedupes.
- **api-client:** `EditorDocDto`/`EditorSaveDto`/`EditorLockDto`/`EditorFindingDto` + `getEditorDoc`,
  `saveEditorDraft`, `postEditorNote`, `cancelEditorRun`, `reviseWithEdits`.
- **ui `source-editor.tsx`:** `SourceEditor` SSR shell — CodeMirror host + read-only `<textarea>`
  no-JS fallback, `SyncPill`, `EditorLockBanner` (+ Cancel-run form), findings rail (quote, "from Review
  of vN" label, lost badge), note form, "Revise using your edits" (human_revision heads only).
- **web:** `GET/POST /p/:slug/edit/:draftId` (+ `/doc` JSON poll, `/save` JSON+beacon, `/note`,
  `/cancel-run`, `/revise` progressive-enhancement forms); `data.ts`/`page-data.ts` editor seam;
  `COPY.editor`; `project-list.ts` `headDraftId` (the "Edit source" link target); client bundle
  `src/client/` (`editor.ts` CodeMirror mount + autosave + lock poll + rail sync + **fork rebase**:
  `data-draft-id` + save/doc response `draftId` re-target all subsequent requests and
  `history.replaceState` the URL; `sync-machine.ts` pure state machine) built by `build-client.mjs`
  (esbuild → `public/editor.js`, gitignored); `tsconfig.client.json` (DOM lib) + eslint browser globals.

## Test matrix

| AC / requirement | Test |
|---|---|
| AC1 fork + event + projections | mirror `manual-revision.test.ts` (fork rows, `draft.forked`, verbatim bytes, block_id_map, human spans, restore point, move_traced); api `editor-routes.test.ts` GET (labels "from Review of v1", lost=true) |
| AC1 stale-base idempotency | mirror test "a save to the STALE frozen base id routes to the existing working child"; api test "a stale base URL stays live after the fork" |
| AC2 lock/banner/cancel/note | api test "409s while a run holds the head…saves after the lock clears"; note → guidance row test; client poll lock/unlock test; SSR banner hidden/shown |
| AC3 revise-with-edits | api test "seeds review=v1 review + base=v2 head, and auto-moots…" (obligation `mooted` via transition row; `manualRevision.baseDraftId`; `draftRead(headId)` lock; stale re-POST dedupes) |
| AC4 move_traced | mirror tests assert `revision.move_traced` per changed save (0 on no-op) |
| AC5 provenance/verbatim | mirror test asserts `provenance_maps` human spans + stored bytes verbatim |
| AC6 no Save/dialog, ≤debounce loss | no Save button/dialog anywhere (copy + component); 800 ms debounce + pagehide beacon; client tests assert the debounced POST |
| Client mechanics | `sync-machine.test.ts` (6: debounce/queue/locked/retry/dedupe); `editor.test.ts` (7: mount, save payload, 409 lock, poll lock release, rail lost-badge sync, fork rebase, doc-poll rebase) |
| SSR page | `editor.test.ts` (16: page render, rail, banner, forms, hidden-attr regression) |

## Progress

- Implementation complete across findings-core / contracts / orchestrator / db / mirror / api /
  api-client / ui / web (+ client bundle).
- Self-review + gap analysis done; three real defects found and closed (below); full gates green
  (see Evidence).

## Gap table

| # | Requirement / AC / invariant | Status | Evidence |
|---|---|---|---|
| R1 | CodeMirror over canonical markdown; debounced autosave; restore-point rows; sync pill; no Yjs | met | `apps/web/src/client/` + `build-client.mjs`; `restore_points` snapshot per changed save (mirror test); pill states tested; no Yjs dep |
| R2 | Frozen-head fork v(N+1) `human_revision`, no confirm; projections + "from Review of vN"; lost → Whole piece + badge | met | `saveManualRevision` + `openHumanRevision`; `projectFindingsOntoMarkdown`; rail SSR + `sourceLabel`/`lost` DTO fields; tests in both layers |
| R3 | Read-only during writer runs + frozen-head reads; banner + Cancel-run; note → Guidance | met | `editorLockForRuns` + `cancelRun`; api 409 + cancel tests; guidance row asserted |
| R4 | Manual revision → `revision.move_traced`; Revise-with-edits seeds run + auto-moots lost findings | met | `manual-trace.ts` seam invoked per changed save; revise route moots live obligations only, idempotency-keyed on the head |
| R5 | `human` provenance sidecar; stored markdown verbatim | met | `provenance_maps` rows + `block_id_map` on `artifact_versions`; stored bytes asserted verbatim |
| AC1–AC6 | all ticket ACs | met | per-row above; deterministic |
| REQ | REQ-BETA-21, REQ-DATA-24/26/29, REQ-IDE-32, §6.3, REQ-BETA-7 (manual half) | met | stamped in PR body |
| INV | "Save" not a verb; reviewed drafts immutable; restore never deletes correspondence; never two writers | met | no Save UI; frozen heads only ever fork; restore points additive; `one_working_head_per_project` + for-update lock + child-redirect |
| INV | No protocol IP in client bundle/events; no secrets | met | events carry ids+counts; bundle is editor chrome only; protocol-markers gate green |
| OOS | No Tiptap/ProseMirror, proposal cards, Apply, suggestion marks, Yjs, working-copy UI, restore-point browsing | met (absent) | grep-clean; ticket's out-of-scope list respected |

### Gaps found during this run's review (all closed)

- **Forked-draft id lifecycle (the big one).** First save on a frozen head returns a NEW `draftId`; a
  client keeping the base id would re-fork every save (v3, v4, …). Closed three ways: (a)
  `saveManualRevision` routes a save on a frozen base to its existing working `human_revision` child
  (idempotent — retried beacons/stale tabs can't fork twice); (b) every api route resolves a frozen base
  to the working child (`resolveEditorHead` — GET serves the child's text so edits are never invisible,
  save/cancel/revise lock-check + act on the head; the revise idempotency key + `manualRevision.baseDraftId`
  use the resolved head); (c) the client bundle rebases save/doc/beacon URLs + `data-draft-id` +
  `history.replaceState` on any save/doc response carrying a different `draftId`. Regression tests at all
  three layers.
- **Findings source on a frozen reviewed v(N>1).** The GET rail queried `head.base_draft_id ?? head.id`,
  which reads v1's findings on a frozen v2 — wrong review. Now conditional: a working `human_revision`
  head reads its base's findings; any other head reads its own.
- **Revise-run inputs bound the param id, not the resolved head** — `manualRevision.baseDraftId`,
  `lockSetSpec.draftId`, and the idempotency key now use `prep.headId`.
- **Lock check on the unresolved id.** Save/cancel checked `editorLock(param draftId)`; a reader lock on
  the base alone must not block a save that lands on the child (the run reads the immutable base either
  way) — the check now runs against the resolved head.
- **`hidden` + inline `display:flex` banner** — the inline style won over the UA `[hidden]` rule, so the
  lock banner always rendered; the component now manages `display` explicitly + the client toggles it.
  Regression assertion added.
- **Findings-rail staleness** — the lock poll now also syncs each finding's lost-anchor badge in place
  (data attrs + `data-lost-note`), no reload needed.
- **Missing `timeline_events` Drizzle definition** — migration 0019 landed without the schema export;
  `timelineEvents` added to `packages/db/src/schema/run-events.ts` (schema-parity gate).
- **CodeMirror deps + browser typecheck/lint** — direct `@codemirror/*` deps in `apps/web`;
  `tsconfig.client.json` + an eslint browser-globals block; `tsc -b && tsc -p tsconfig.client.json`.
- **`history` name collision** — `history.replaceState` collided with CodeMirror's `history` import;
  `window.history` used.
- **Licence scan** — pre-existing transitive `duck`/`pako` (via mammoth/jszip) reported non-allowlisted
  licences; checked-in `licenses.exceptions.json` entries with rationale (the editor tree itself adds
  only MIT `@codemirror/*`).
- **Lever-matrix timing flake** — one `pnpm test` run failed a <100 ms timing assertion at ~530 ms under
  load; focused rerun green; no code change (environment flake).

## Evidence log

- Targeted: findings-core `manual-revision.test.ts` (12); mirror `manual-revision.test.ts` (6);
  orchestrator `cancel.test.ts`; api `editor-routes.test.ts` (8); api-client tests; ui/web `editor.test.ts`
  (16 SSR) + `client/editor.test.ts` (7) + `client/sync-machine.test.ts` (6) — all green.
- `pnpm turbo build lint typecheck` → **108/108** tasks green (client bundle → `public/editor.js`).
- `pnpm test` (full suite) → **1722 passed / 2 skipped / 241 files**, zero failures.
- `pnpm check:protocol-markers` → OK (39 public-facing files). `pnpm check:licenses` → OK (497 packages;
  `duck`/`pako` exceptions recorded).
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` → 0 violations.
- Live verification: NOT RUN — live legs are not permitted for this ticket (deterministic-only per
  operator); the live editor exercise is deferred as **D-PRB.07-1**.

## Evidence report

**What landed.** The beta's manual-revision path (REQ-BETA-21 stopgap #1 — survives as 1.x Source mode):
a CodeMirror 6 editor over canonical markdown with a debounced (800 ms) autosave that writes
content-addressed versions, snapshot restore points, and `live_docs` — all inside the caller's
transaction. Typing on a frozen reviewed head forks `v(N+1) origin='human_revision'` with a
`draft.forked` timeline event and no confirm (REQ-IDE-32); every subsequent save updates that head in
place. Findings from the review of vN project onto the new head through the shared `resolveAnchor`
ladder, carry "from Review of vN" labels, and lost anchors land on Whole piece with "passage changed —
still applies?". The page is read-only while a writer run holds the project or a reader run holds the
head, with the banner + *Cancel run to edit* release; the single note field writes `Guidance` rows
scoped to the next Revise. "Revise using your edits" creates the revise run with `priorReviewId` + the
new base draft, marks the human's edits as made moves via `revision.move_traced`, and auto-moots the
unanchored findings' live obligations pending triage confirmation (REQ-DATA-26). Touched blocks carry
`human` provenance in the sidecar map; the stored markdown is verbatim (REQ-DATA-29).

**The forked-head lifecycle** is the subtle contract: the first save returns a new draft id, and the
system is idempotent end-to-end — the mirror routes stale-base saves to the existing child, the api
resolves stale base URLs to the child on every route, and the client rebases its URLs + address bar onto
the forked head.

**Not shipped (correctly):** Tiptap/ProseMirror, proposal cards, Apply, suggestion marks, Yjs,
working-copy UI, restore-point browsing (P1.02/P1.3). The live `dev` exercise is **D-PRB.07-1**.

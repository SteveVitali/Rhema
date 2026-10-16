# design/30 — Source mode on the SPA Page mount (REQ-ED-17, operator ruling R20)

**Status:** implemented by SPA.25 (row 136). Authoritative contract for the revived source view —
the *designed rebuild* the operator ruled for (`docs/frontend-spa-spec.md` §6 + R20; NOT a port of
the retired `editor.js`/`SourceEditor`/`sync-machine.ts` island, which SPA.24 dropped under
REQ-ED-16).

## The old mode (what design/23's dead-code notes recorded)

`SourceEditor` was a standalone island on `/edit/:draftId` — an SSR `<textarea>` upgraded to a
CodeMirror markdown editor that autosaved by POSTing `{markdown}` to `/save` every 800 ms and
polled `/doc` for locks. A *transport*, not a view: it owned a separate document story (its own
undo, its own save machine, no provenance, no collab session). The island retired with REQ-ED-16;
`/edit/:draftId/*` stays a transport-only family (`/doc` poll, `/note`, `/cancel-run`, `/revise`).

## The revival — one document, two views

The Page already holds the durable editing session: the registry-held `EditorState` bound to the
`Y.XmlFragment` (ySyncPlugin), the collab wire, the undo stack, the provenance plugin. Source mode
is **an alternate projection over that same state**, never a second document:

- The ProseMirror `EditorView` stays mounted and bound (hidden via `hidden`, still dispatching —
  remote trs keep landing through `view.dispatch` → `installOriginDispatch`). `[data-page-host]`
  gains a sibling `[data-source-host]`; `[data-source-toggle]` swaps which is visible.
- The source view is CodeMirror 6 (already-pinned deps — `@codemirror/{view,state,commands}`; MIT;
  zero new licenses). It is **lazy-imported** (`import("./page-source-mode.js")` from
  `page-mount.tsx`) so it ships as its own async chunk — the §9/R25 `codemirror` group ceiling
  (≤130 kB gzip) covers it (REQ-SAFE-7). **Budget-forced trade (measured):** with the
  `@codemirror/lang-markdown` grammar + `syntaxHighlighting` the group gzipped to 169.8 kB — over
  the ceiling. The language pack drops for now; the source view is a plain-text CM surface
  (line numbers, selection, undo, paste detection — "CodeMirror-class" per the ticket). Markdown
  highlighting returns only if the ceiling is raised or a lighter grammar ships — the seam is one
  `extensions` array line.
- PM doc ⇄ text mapping is the ONE canonical pair: `docToMarkdown` (the serializer the server's
  materialization path uses — the markdown shown is byte-identical to what `/save` would see) and
  `markdownToDoc` (the canonical parser — total: any text parses). A commit whose re-parse is
  `doc.eq`-equal dispatches nothing — normalization-only edits never churn provenance.

## Commit — block-diffed transactions, human origin

Edits commit to the PM doc as ONE transaction per debounce window (500 ms), plus an immediate
`commitNow` on toggle-off, pagehide/hidden-flush, route-leave destroy, and before a ⌘S
`markRestorePoint` mint (a restore point must cover the pending source text).

`applySourceMarkdown` (`packages/editor/src/source-mode.ts`):

1. `next = markdownToDoc(text)`; if `cur.eq(next)` → null (no-op, no tr, no provenance write).
2. `diffTopBlocks` aligns top-level children by `node.eq` — longest-common-subsequence over the
   child arrays (≤200k cells; larger falls back to a single prefix/suffix run). Each unmatched run
   becomes one `tr.replaceWith`/`tr.delete` step, applied back-to-front so positions stay in
   original-doc coordinates.
3. The tr carries `ORIGIN_META` — `"human"` normally, `"pasted"` when the CM update's transactions
   report `isUserEvent("input.paste")` — plus `SOURCE_EDIT_META` so the bridge ignores its own echo.

Consequences: provenance stamps ONLY the blocks the markdown edit actually touched (an agent block
the user didn't touch keeps its source; a human edit inside a recorded agent span still degrades to
`mixed` via the existing plugin rule — REQ-POS-9 verbatim); each commit is one undo unit on the PM
stack — under collab `yUndoPlugin` captures it as local-client work exactly like a rendered-mode
tr. **Undo story:** the durable undo is the PM stack (survives toggles, registry-held). CM keeps
its own in-mode history while open — destroyed with the CM view; the toggle itself is not an undo
boundary that loses anything (the PM doc+stack are untouched by toggling).

## Remote/other writes while source is open

`installOriginDispatch` gains an `onTransaction(tr)` hook (every tr, docChanged or not). The
source bridge reads it:

- tr with `SOURCE_EDIT_META` → own commit echo → ignore (clean baseline already updated).
- `docChanged` tr without it (ySyncPlugin remote apply, `acceptProposalTr`, restore apply):
  - CM **clean** → re-seed CM to `docToMarkdown(latest doc)` (a `addToHistory.of(false)`
    annotated replace — pulls never pollute the in-mode undo).
  - CM **dirty** → set the `data-source-note` stale line ("This draft changed elsewhere…"): the
    pending text stays; the next commit's block diff applies over the current doc —
    **last-writer-wins at top-level-block granularity**. Chosen honestly: a remote edit inside a
    block the user rewrote is overwritten by the user's text; remote edits in untouched blocks
    survive (the diff only replaces changed runs). A mid-source-mode concurrent peer editing the
    SAME paragraph is the residual edge — surfaced by the stale note, bounded by the block diff.
- ANY tr → `syncEditable()` re-reads `editableRef` (the mount's lock/read-only posture flips via
  the empty re-dispatch `applyLock`/`onReadOnly` already dispatch) → CM compartments reconfigure.

## Posture and reach

- **Rides the `editor` flag** — the toggle only exists inside the SPA `PageMount`; the SSR host
  block is unchanged (no new surface key; REQ-SEQ-11 deployable-dark).
- **Forced-SSR is forever** (REQ-ED-12): phone/showcase posture never mounts the SPA — the source
  view cannot activate there by construction.
- **Read-only/lock** still toggles: the source *view* of a locked or artifact draft is legitimate
  (the retired island's read-only textarea precedent) — CM mounts `EditorState.readOnly` +
  `editable:false`; `commitNow` refuses while `!editable()`.
- **No new transport.** Source mode adds zero endpoints — commits reach the server through the
  existing four-layer autosave (Y.Doc → IDB → collab WS → materialization) and the existing
  provenance piggyback (`sendProvenance` fires from the mount's `onDocChanged` verbatim).
- **⌘S** still mints exactly one restore point — `mintRestorePoint` flushes `commitNow` first, so
  pending source text is inside the restore point.

## Rejected

- *Whole-doc replace commits* — simplest, but `touchedRanges` would stamp every block human and
  destroy agent/human provenance on any one-word source edit. The block-diff is the honest bound.
- *y-codemirror over a Y.Text* — the shared type is a `Y.XmlFragment` (PM structure), not text;
  a second CRDT text mirror would fork the document story.
- *Keeping CM mounted hidden across toggles* — its buffer drifts (pull policy gets ambiguous);
  destroy+reseed keeps one honest seed point per open.
- *Reviving the island's `/save` POST path* — `data-save-url` is dropped (REQ-ED-16); collab is the
  only transport.

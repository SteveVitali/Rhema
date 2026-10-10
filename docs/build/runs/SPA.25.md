# SPA.25 — run ledger: source-mode revival on the SPA Page mount (REQ-ED-17, REQ-SAFE-7)

- **Ticket:** `docs/tickets/136_SPA.25__source-mode-revival.md` (manifest row 136)
- **Branch:** `stevevitali/spa-25-source-mode-revival` — forked from
  `stevevitali/spaf-14-prod-flip-editor` @ `076f321` (the requested chain tip).
- **PR:** opened at closeout against `stevevitali/spaf-14-prod-flip-editor`;
  `gh pr checks --watch=false` read once at closeout (result recorded in
  § PR checks read below; inherited `integration`/privsep red, if it reports, is
  waived per GD-MAINT.4-1 — classified, not repaired).
- **Harness:** devin-cli subagent (per the 2026-10-08T23:05Z dispatch-tier ruling).
- **Mode:** offline-only, $0 — no deploys, no production writes, mergePolicy OPERATOR.
- **Spend:** `paid:false` legs only; no metered spend ($0).
- **Design note (written first, per the ticket):** `docs/design/30_spa-source-mode.md`.

## 0 — Prerequisite probe (run first, per the ticket's operating clause)

```
gcloud secrets versions access latest \
  --secret=rhema-nonprod-resend-api-key --project=rhema-507501
→ ERROR: (gcloud.secrets.versions.access) NOT_FOUND  (output redirected to a temp file;
  never printed — there is no version to print)
gcloud secrets list --filter='name~resend' --project=rhema-507501
→ only rhema-prod-resend-api-key
```

The shared non-prod Resend key is still absent, so no signed-in preview session can
mint through the magic-link + mailbox leg — the Page routes are session-gated. The
new T17 source-mode leg's preview run is honestly deferred (`D-SPA.25-1`), with the
deterministic in-repo proof standing in. Same live blocker as `D-MAINT.6-1` /
`D-SPA.6-1` / `D-SPA.12-1` … `D-SPA.24-1`.

## 0b — Inherited chain debt

None closed this run. `D-OPS.1-1` + `D-MAINT.6-1` blocker-updated (the SPA.25
re-probe), all stay OPEN; the `D-SPAF.*` rows stay OPEN behind the operator
merge+deploy prerequisite (SPAF.14 itself awaits merge — mergePolicy OPERATOR).

## 1 — What landed

The **revived source view** — the R20 ruling ("drop the dead code; revive Source
mode as a designed feature") executed as a REBUILD on the SPA mount, not a port of
the retired island. One ProseMirror document, two views:

- **`packages/editor/src/source-mode.ts`** — `diffTopBlocks` (top-level LCS over
  `node.eq`, ≤200k-cell table, prefix/suffix fast path, one-run fallback) and
  `applySourceMarkdown(state, next, base, origin)` — a **three-way merge** at
  top-level-block granularity: user runs = base→buffer parse; foreign runs =
  base→live doc; overlapping foreign runs drop (local wins the run, the stale note
  warns); non-overlapping foreign writes survive. The returned tr carries
  `ORIGIN_META` (`human`/`pasted` via `isUserEvent("input.paste")`) +
  `SOURCE_EDIT_META` (own-echo filter). `null` when buffer ≡ base — normalization
  churn never reaches the undo stack or provenance.
- **`apps/web/src/spa/page-source-mode.ts`** — the CodeMirror bridge, loaded ONLY
  via `import("./page-source-mode.js")` from `page-mount.tsx` so all CM bytes ship
  in their own async chunk (`page-source-mode-*.js` → the `codemirror` budget
  group). Extension set: `lineNumbers`/`highlightActiveLine`/`drawSelection`/
  `history`/`keymap(default+history+indentWithTab)` + editable/readOnly
  compartments + `contentAttributes` aria-label + the `updateListener` dirty/paste
  arm. **No `@codemirror/lang-markdown`/`syntaxHighlighting`**: with the lezer
  grammar the group gzipped 169.8 kB > the 130 kB ceiling — plain-text CM editing
  only (measured 87.2 kB after the drop; the seam is one extensions line).
- **`apps/web/src/spa/page-mount.tsx`** — `[data-source-bar]` toolbar with
  `[data-source-toggle]` (`aria-pressed` = mode) + `[data-source-note]` (stale
  line); the PM view now mounts inside `[data-pm-host]` (hidden while source mode
  is up — still mounted, still dispatching: remote trs keep landing through
  `view.dispatch`). `installOriginDispatch` gained `onTransaction(tr)` — the tap
  the source bridge rides (remote pulls when clean, stale-marking when dirty,
  editable re-reads on lock flips). Flush points for pending buffer text:
  500 ms debounce, toggle-off (`destroy()` → `commitNow`), `pagehide`/
  `visibilitychange:hidden`, route-leave release, and BEFORE the ⌘S
  `markRestorePoint` mint (a restore point covers pending source text).
- **Mapping contract:** `docToMarkdown`/`markdownToDoc` — the canonical pair the
  materialization path already uses; the markdown shown is what `/save` would see.
- **`packages/tokens/src/ide-css.ts`** — `.rm-source-bar/-toggle/-note` +
  `.rm-source-host .cm-*` styles (mono font inside the paper measure).
- **`apps/web/src/copy.ts`** — `editor.sourceToggle`/`sourceAriaLabel`/
  `sourceStaleNote` (copy containment — no literals in the component).
- **`apps/web/src/dom-contract.ts`** — five new hooks under `editor`
  (`data-source-bar`, `data-source-toggle`, `data-source-host`,
  `data-source-note`, `data-pm-host`) — NEW names; the retired island's
  `data-editor-*` vocabulary stays dropped (REQ-ED-16).
- **`packages/journeys`** — `T17` (`expected:"red"`, `paid:false`, `journey:"both"`;
  fresh draft → `/v/working` → toggle → CM seeds canonical md → type marker →
  hidden `[data-page-view]` re-renders it → toggle-back shows it; requires
  `data-renderer="spa"`, else reports owed); wired into `SURFACE_GATES.editor`.
- **`apps/web/package.json`** — `prosemirror-model` declared (type-only — the
  merge deals in `PMNode`; already pinned transitively at 1.25.12; the lockfile
  additionally repaired a stale `@vitest/mocker` peer-snapshot key — recorded).

## 2 — Verification

| Gate | Result |
|---|---|
| `pnpm turbo build lint typecheck` | 135/135 tasks green |
| `pnpm test` | **5,618 pass / 6 skip / 0 fail** (487 files) |
| `pnpm check:dom-contract` | OK — `editor` 58 hooks emitted+asserted |
| `pnpm check:spa-budget` | OK — codemirror group **87.2 kB** ≤ 130 kB (`page-source-mode-*.js` async) |
| `pnpm check:licenses` | OK — 822 packages, CM set all MIT, zero new packages |
| `pnpm check:protocol-markers` | OK — no protocol IP in client bundles |
| `pnpm check:no-cookies` | OK — 254 files scanned |
| `pnpm check:spa-env` | OK — 112 sources / 146 artifacts |

Focused legs: `packages/editor/src/source-mode.test.ts` — **13** (diff runs:
single/middle/two-scattered/insert/delete; commit stamps human+pasted+
SOURCE_EDIT_META; untouched-agent provenance survives; mixed degradation
REQ-POS-9; one undo unit on PM history; the three 3-way merge legs).
`apps/web/src/spa/page-source.dom.test.tsx` — **5** (toggle+hosts emit only
post-mount; CM seeds canonical md with the PM view still bound; edit commits
through the live doc + provenance human + re-seed on re-entry; clean pull of a
foreign tr + dirty stale-note + foreign tail survives the merge; read-only mount
→ read-only CM + refused commit).

### Mid-run fixes (all real, all re-verified)

- `diffTopBlocks` boundary asymmetry: a foreign insert at a user run's START
  boundary must shift the mapped position, while one at the END must not —
  `curStart`/`curEnd` split (caught by the 3-way unit leg).
- `installOriginDispatch.onDocChanged` widened to take the tr (callers'
  `() => void` stay compatible); `onTransaction` added alongside.
- dom-contract caught `data-source-bar` unmanifested — manifested + asserted.
- The codemirror group measured 169.8 kB with `lang-markdown`+highlighting —
  dropped to fit the 130 kB ceiling (deviation — see §5).

## 3 — Deferrals

Opened: `D-SPA.25-1` — the T17 journey leg green on a flagged `pr-<n>` preview
(the Resend secret blocker, re-probed NOT_FOUND this run). `D-OPS.1-1` +
`D-MAINT.6-1` blocker-updated. None closed.

## 4 — AC disposition

- *Source view edits flow through the same PM doc + collab session; provenance +
  undo semantics proven* — DONE in-repo: commits are PM trs through the mounted
  `EditorView.dispatch` (the same seam ySync remote applies ride); provenance
  stamps + mixed-degradation + one undo unit proven in `source-mode.test.ts`;
  collab wiring is the unchanged registry-held wire (no new transport).
- *Toggling rendered/source views preserves doc + undo stack* — DONE:
  `data-pm-host` hides but never unmounts; CM destroy→commit→reseed on toggle.
- *Journey leg green on preview* — OWED (`D-SPA.25-1`; T17 is `expected:"red"` and
  reports owed until the flagged preview exists).
- *Verification green* — DONE (§2).
- *Every new behavior has a removal-detecting test* — DONE: 18 focused tests; the
  dom-contract checker fences all five new hooks.
- *Requirement IDs stamped in PR* — REQ-ED-17 + REQ-SAFE-7 in `pr/SPA.25.md`.
- *Anything not automatically verifiable gets a DEFERRALS row* — DONE (`D-SPA.25-1`).
- *ADRs for deviations and owned decisions* — design/30 records the two owned
  decisions (per-run last-writer-wins on overlapping foreign edits; the
  lang-markdown drop under the budget ceiling). No new ADR: both are scoped
  implementation calls within the ticket's own contract, documented in the design
  note + this ledger.
- *Build memory artifacts updated* — this file, `pr/SPA.25.md`, BUILD_INDEX row,
  LEDGER advance, PHASE LOG entry.
- *Operating clauses met* — offline-only, $0, no merges, no prod mutations;
  phone/showcase forced-SSR posture untouched (source mode exists only inside the
  SPA mount — it cannot activate there by construction); no new surface flag
  (rides `editor`); no dead `editor.js`-era hooks revived; no protocol/eval import;
  no new cookies; canonical-vocabulary lint clean.

## 5 — Owned decisions / deviations

1. **No `@codemirror/lang-markdown` in v1** — the lezer grammar + highlight pack
   pushed the `codemirror` group to 169.8 kB gzip against the 130 kB ceiling
   (measured). Plain-text CodeMirror editing ships instead — still
   "CodeMirror-class" per the ticket (real CM6 view: line numbers, selection
   drawing, undo, paste detection, keymaps). Highlighting returns if the ceiling
   is raised or a lighter grammar lands — one extensions line.
2. **Merge conflict model** — per-run last-writer-wins: foreign (remote collab /
   proposal / restore) writes that overlap a pending user edit region drop at
   commit time; non-overlapping foreign writes always survive. The dirty-buffer
   foreign write raises `data-source-note`. Chosen over whole-doc replace
   (would erase provenance) and a second CRDT text mirror (forks the document
   story — the island's defect).
3. **CM undo scope** — CodeMirror keeps its own history only while open; the
   durable undo story is the PM stack (registry-held, survives toggles). Yjs's
   yUndoPlugin captures source commits as local units in collab mode.

## PR checks read

Filled at closeout (see `git log` for the commit carrying the recorded verdict).

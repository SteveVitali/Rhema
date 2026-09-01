# PRB.07 — CodeMirror source editing and manual revision (beta stopgap)

- **Sequence:** 23 of 50
- **Phase:** RB — Review beta
- **base_branch:** current checkout (stacked PR chain)
- **Depends on:** PRB.02 (canonical markdown), PRB.04 (read views), P0.09 (freeze/fork semantics)
- **Run:** `implement-spec spec=docs/tickets/23_PRB.07__source-editing.md`

## Goal
The beta's manual-revision path: a CodeMirror markdown editor over the canonical draft (beta-only
stopgap #1, REQ-BETA-21 — it survives as 1.x Source mode), honoring the version semantics: editing
a frozen head forks `v(N+1) origin=human_revision`, read-only during runs, block-level provenance
recorded.

## Load
- Spec §17 beta row ("revise, agent or CodeMirror source editing"), REQ-BETA-21 (stopgap #1;
  "CodeMirror editing survives as 1.x Source mode"), §5.4/§6.3 editing rules (unreviewed = in
  place; reviewed = fork immediately, findings follow the text with "from Review of vN" labels via
  projections; read-only during writer runs / frozen-head reads with the banner + Cancel-run
  release), §11.6 (REQ-DATA-21/24; restore-point *storage* exists server-side — the full UI is
  P1.3), §5.4 provenance (block-level from transaction origins — here `human` edits mark blocks;
  REQ-POS-9's span capture concerns agent-origin transactions and rides P1.02).

## In scope — deliverables
1. **CodeMirror editor** over canonical markdown; autosave (debounced server saves + restore-point
   rows via the existing storage; no Yjs at beta); sync pill (synced/syncing/offline-queued
   minimal).
2. **Version semantics:** typing on a frozen vN forks v(N+1) `origin=human_revision` without a
   confirm, with the banner; findings projected onto the new head by quote re-anchoring
   (findings-core), labeled "from Review of vN"; lost anchors move to Whole piece with "passage
   changed — still applies?" (§5.4; REQ-IDE-32's fork rule in beta form).
3. **Run lock:** Page read-only during writer runs and while a reader run holds the frozen head;
   banner with *Cancel run to edit*; comments-become-guidance box (REQ-DATA-41's comment path,
   simplified to one note field at beta).
4. **Manual-revision integration:** saving a manual revision triggers the PRB.06 diff + move-trace
   events; `Revise using your edits` path (`review = vN review, base = v(N+1)`; user edits as made
   moves; unanchored findings auto-`mooted` for triage confirmation) (REQ-DATA-26; §6.3).
5. **Block-level provenance capture** for human edits (`human` origin rows in `provenance_map`).

## Out of scope
- Tiptap/ProseMirror WYSIWYG, proposal cards, Apply, suggestion marks, Yjs autosave layers, working
  copies (P1.02/P1.3; 1.x). Restore-points browsing UI (P1.3/P1.8).

## Acceptance criteria
- [ ] Editing a frozen draft forks v(N+1) `origin=human_revision` with a timeline event and no
      confirm dialog; findings render as projections with source labels (REQ-DATA-24; §5.4).
      *(deterministic)*
- [ ] During a writer run or frozen-head read, the editor is read-only with the banner; the note
      becomes `Guidance`; Cancel-run releases the lock (§6.3 concurrency). *(deterministic)*
- [ ] `Revise using your edits` fixture: user edits treated as made moves; unanchored findings
      auto-`mooted` pending triage confirmation (REQ-DATA-26). *(deterministic)*
- [ ] Manual-revision save emits `revision.move_traced` on the diff (REQ-BETA-7). *(deterministic)*
- [ ] Human-edited blocks carry `human` provenance in the sidecar map; the stored markdown carries
      no ids or marks (REQ-DATA-29's stripping rule). *(deterministic)*
- [ ] No unsaved-changes dialog or Save button exists; refresh mid-edit loses nothing beyond the
      debounce window (REQ-IDE-43's spirit at beta fidelity — document the window). *(deterministic)*

## Requirement IDs to satisfy and stamp in the PR
REQ-BETA-21 (stopgap #1 declared), REQ-DATA-24, REQ-DATA-26, REQ-DATA-29 (block-level capture
half), REQ-IDE-32 (fork-without-confirm rule), §6.3 lock behavior (REQ-RUN-8 surface), REQ-BETA-7
(manual half).

## Cross-cutting invariants — re-check before opening the PR
- "Save" is not a verb; reviewed drafts are immutable; restore never deletes correspondence
  (principle 8).
- Never two writers of one draft (runtime-enforced; this UI only surfaces it).
- See 00_MANIFEST.md § Cross-cutting invariants.

## Notes
Everything here except the CodeMirror chrome (version semantics, projections, lock behavior,
provenance capture) is permanent contract the Tiptap editor (P1.02) inherits.

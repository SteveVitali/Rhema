# PRB.06 — Revise delivery, what-changed, re-review, rubric delta

- **Sequence:** 22 of 50
- **Phase:** RB — Review beta
- **base_branch:** current checkout (stacked PR chain)
- **Depends on:** PRB.05 (triage), P0.12 (lineage), P0.09 (server diff inputs)
- **Run:** `implement-spec spec=docs/tickets/22_PRB.06__revise-whatchanged-rereview.md`

## Goal
Closing the loop: the server-side block diff with move joins ("what changed and why"), obligation
discharge lines and the summary strip, the re-review path (reads the letter first; lineage events),
and the rubric-delta before/after view — the beta's steps 7–9.

## Load
- Spec §5.8 (compare layouts — beta ships **What changed** and Inline, server-rendered read-only;
  move cards with discharge lines naming obligations; Unlinked group; rebutted with rationale and
  no hunk; hunk comments → next-round `Guidance` — REQ-IDE-33 amended), §6.2 REQ-WF-7 (re-review
  reads the response letter first; carried/closed/new from rows), §6.3 (version rail data: origin
  chips, claims-pending-verification, open-obligations chip — beta-flat rendering), REQ-BETA-7
  (`revision.move_traced`), REQ-BETA-8 (`rereview.lineage`), §11.6 REQ-DATA-25 (changed-block
  claims → `humanAdded` placeholders).

## In scope — deliverables
1. **Server diff:** block-aligned markdown diff vN→v(N+1); joins each changed block to ledger moves
   via discharge evidence using the same quote-resolution service as findings (findings-core);
   hunks with no move grouped Unlinked; rebutted findings shown with rationale, no hunk.
2. **What-changed view:** move cards ("Move 3 · … — discharges OBL-3 (F-07, carried from v2) —
   verified by gap check"), header strip "7 obligations addressed · 1 rebutted · 2 still open"
   beside move counts (REQ-OBJ-6); Inline layout; hunk comments become `Guidance` for the next
   Revise (REQ-IDE-33).
3. **Re-review path:** launching Review on v(N+1) passes `prior_review` + `changed_since`; the run
   report line "N carried, M closed, K new" from obligation rows; `rereview.lineage{carried,
   closed, new, reopened}` event (REQ-BETA-8); well-rebutted findings not re-raised (skill behavior
   verified by fixture).
4. **Move tracing events:** `revision.move_traced{finding_id, move_id, hunk_count, chars_changed}`
   at Revise delivery *and* on manual-revision diffs (REQ-BETA-7, with PRB.07's edits).
5. **Rubric delta:** before/after per-dimension dots across rounds (never a total), on the project's
   round summary.

## Out of scope
- Side-by-side compare, in-editor `prosemirror-changeset`, restore-point UI (P1.8 / 1.x).
- The full Timeline pane (P1.5) — the beta's flat round list gains these views as pages.

## Acceptance criteria
- [ ] Golden: the seeded multi-round project renders What-changed with correct move↔finding↔
      obligation joins; unlinked edits grouped; rebutted rendered with rationale (REQ-IDE-33).
      *(deterministic)*
- [ ] Re-review fixture: carried/closed/new computed from rows matches the planted lineage; the
      reopened regression appears (with P0.12's AC). *(deterministic)*
- [ ] `revision.move_traced` and `rereview.lineage` events fire with correct payloads on the
      fixtures (REQ-BETA-7/8). *(deterministic)*
- [ ] Human-edited blocks yield `humanAdded, verdict: 'unverifiable'` claim placeholders passed as
      `changed_since` to the next Review (REQ-DATA-25). *(deterministic)*
- [ ] Hunk comment becomes a `Guidance` row consumed by the next Revise (fixture). *(deterministic)*
- [ ] Rubric delta renders per-dimension, no aggregate. *(deterministic)*

## Requirement IDs to satisfy and stamp in the PR
REQ-IDE-33 (amended, beta layouts), REQ-WF-7 (surface half; engine half P0.12), REQ-DATA-25,
REQ-OBJ-6 (what-changed half), REQ-BETA-7, REQ-BETA-8, REQ-PROD-11 (pending-verification surface).

## Cross-cutting invariants — re-check before opening the PR
- "What changed and why" joins hunks to ledger moves — the response ledger is the author's record,
  not chat scrollback (T2; principle 1).
- Server-rendered read-only at MVP — no editor-side diff machinery (REQ-SPEC-19).
- See 00_MANIFEST.md § Cross-cutting invariants.

## Notes
The diff/join service built here is the same one P1.8 re-skins inside the pane system. Keep it an
API + renderer pair.

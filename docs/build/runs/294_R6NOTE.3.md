# Run record — 294_R6NOTE.3 (BL closures — carrier-discharged rows)

- **Base:** `main` @ `e6aa12b9` · **branch:** `stevevitali/r6note-3-bl-closures`
- Records-only — no code; four dated closures for rows already discharged by their named
  carriers: BL-91 (REQ-HOME-1, `234_R7HOME.1` in passing), BL-92 (REQ-KIT-2, `225a_R7KIT.2b`),
  BL-103 (flip sweep `224_R7DEP.1` + `250_R7DEP.2`; residual → BL-104), BL-107 (REQ-CLOSE-4,
  `254_R7DOC.1` + re-verified by `290_R6FIX.26`).
- Evidence: code-level pins re-verified this run — `project-home.dom.test.tsx:327` (no Apply
  button), `primitives/chips.tsx` two-variant Chip + `timeline.tsx:208` naming B8, DEFERRALS
  tracked rows DONE, and the 254_R7DOC.1 run record's own sweep results.
- **Records gap found:** 291_R6NOTE.2 (PR #375) merged carrying only the BACKLOG.csv diff —
  its ticket/run/pr/index/manifest records were never authored. Owed as a backfill in the next
  hygiene pass alongside the post-merge dated closures for this sweep's landed fix PRs.
- Append-only vs `origin/main` · gitleaks — clean.

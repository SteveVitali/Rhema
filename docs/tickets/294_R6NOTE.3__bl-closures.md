# 294_R6NOTE.3 — backlog hygiene: dated closures for carrier-discharged rows

**Status:** done (records-only; PR opened, unmerged — OPERATOR)
**Class:** run-time insert — records hygiene, no code
**Base:** `main` @ `e6aa12b9`
**Branch:** `stevevitali/r6note-3-bl-closures`

## What

Four BL rows verified as already discharged by their named carrier tickets but still carrying
`open` — dated closure notes only, no code:

- **BL-91** — R5 A8 filter Apply wrote empty params into the URL. REQ-HOME-1 landed: no Apply
  button at all; filters apply instantly, URL carries only non-default params
  (`project-home.dom.test.tsx:327` pin).
- **BL-92** — R5 B8 chips carried false dropdown affordances on plain links. REQ-KIT-2's
  two-variant Chip landed: static variant never looks clickable; B8 named in `timeline.tsx:208`.
- **BL-103** — round-7 phase-preview flip sweep: tracked rows all DONE (D-R7OPEN.1-1,
  D-R7RO.1-1, D-R7FIX.1-1 green 2026-11-05..08); bespoke-capture residual rides BL-104.
- **BL-107** — REQ-CLOSE-4 docs refresh: discharged by 254_R7DOC.1 (both sweeps ran, detector
  0 critical, the five web sections landed) and re-verified by 290_R6FIX.26's 1,719-doc sweep.

## Disposition

Records-only, unmerged — `mergePolicy: OPERATOR`. Sibling note PRs #372 (288_R6NOTE.1) and
#375 (291_R6NOTE.2) cover the other closure batches; 291_R6NOTE.2's per-ticket records are
owed as a backfill (that PR merged BACKLOG-only) — tracked in the run record.

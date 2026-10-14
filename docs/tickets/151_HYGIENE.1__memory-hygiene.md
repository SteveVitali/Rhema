# HYGIENE.1 — Build-memory hygiene + status-cell normalization

- **Sequence:** 151 · **Phase:** round 5 · **Kind:** ticket
- **base_branch:** current checkout (round-5 chain tip)
- **Depends on:** 150_HUMAN-H8 (chain position; no code dependency)
- **Run:** `implement-spec spec=docs/tickets/151_HYGIENE.1__memory-hygiene.md`
- **Gate status:** none
- **Live stage:** none
- **Production mutations:** none
- **Size budget:** ~400 changed lines excl. generated — mostly append-only cell edits + script diffs

## Goal
Make the two DEFERRALS status parsers agree, normalize forward cells, discharge the zombie and
mooted rows the G1 census identified, and land the small BUILD_INDEX/anchor fixes — so every
downstream row reads the same truth.

## Load (read these — do not re-read others)
- `docs/post-spa-disposition-spec.md` §8 (REQ-MEM-1..10 — **not** REQ-MEM-6/7/8; those are 172_R5REC.2's)
- `docs/research/r5_e_memory-hygiene.md` (parser mechanics + the census counts)
- `docs/research/r5_g1_dispositions.md` §Full table (the ALREADY-DONE/DROP row lists — normative)
- `scripts/`+`docs/build/tools/` checkers: `check-build-memory.sh` (~:543-545 priority scan) vs `check-backlog.sh` (~:88-89 positional)
- `docs/tickets/DEFERRALS.md`, `docs/build/BUILD_INDEX.md`, `docs/build/BACKLOG.csv`
- `docs/build/COVERAGE_MATRIX.csv` §-anchors for REQ-IDE-20/-21 (REQ-MEM-9)

## In scope — deliverables
1. **Scripted pre-census** (REQ-MEM-2): a committed `node` script printing, per DEFERRALS row, the
   positional status + every non-canonical trailing token — run FIRST; its output is the normative
   edit list for the whole ticket (paste summary into the run ledger).
2. **Parser alignment** (REQ-MEM-3): `check-build-memory.sh` (upstream `~/agent-skills` copy +
   any vendored copy) flipped to positional first-canonical-token semantics matching
   `check-backlog.sh`; a checker test/fixture proves the two read the ~50 drifted rows identically.
3. **Cell normalization** (REQ-MEM-1): every G1-table ALREADY-DONE row's leading status token
   flipped to DONE with the dated tail preserved verbatim; every DROP-class row (D-SPAF.*-3/-4,
   preview drills) gets a literal dated `DROPPED <date>:` close per the ratified Q-DROP ruling —
   never a deletion.
4. **BUILD_INDEX + conventions** (REQ-MEM-5): the `ARMB.2` index row backfilled; the entry-ID /
   evidence-file naming convention stated once in `docs/build/README.md` or the index header.
5. **§-anchor fix** (REQ-MEM-9): REQ-IDE-20/-21 COVERAGE_MATRIX anchors pointed at the settled
   sections.
6. **BL-73 recorded** (REQ-MEM-10): a dated BACKLOG note — the 33 `1.x` Later rows are
   spec-scheduled, not lost; BL-73 → DEFER-class disposition (not a close).
7. **PHASE LOG rotation convention** (REQ-MEM-4): document + apply the rotation rule for the
   LEDGER's phase-log section so round-5 entries land under `## PHASE LOG — Round 5`.

## Out of scope
- Spec fold-back to `frontend-spa-spec.md`/`rhema-design-spec.md` (REQ-MEM-6/7/8) → 172_R5REC.2
- Any product code, journey code, or fixture change → siblings
- Rewriting historical prose in append-only files — dated notes only

## Acceptance criteria
- [ ] The two checkers emit identical status for every DEFERRALS row — fixture-tested *(deterministic · engineered)*
- [ ] Every G1 ALREADY-DONE/DROP row's cell reads the ratified disposition; zero rows parse OPEN-or-PARTIAL whose dated tail says DONE *(deterministic · engineered)*
- [ ] `check-build-memory.sh` + `check-append-only.mjs` green after the pass *(deterministic · engineered)*
- [ ] BUILD_INDEX ARMB.2 row + naming convention landed *(deterministic · engineered)*
- [ ] verification green; …; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-MEM-1 REQ-MEM-2 REQ-MEM-3 REQ-MEM-4 REQ-MEM-5 REQ-MEM-9 REQ-MEM-10 REQ-G1-2 REQ-G1-3(V-3 half)

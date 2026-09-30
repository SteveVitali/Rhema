# MAINT.2 — Build-memory hygiene: LEDGER cleanup, Plan-extensions backfill, stale deferral flips, prod test-data inventory

- **Sequence:** 62 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** process
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** JOURNEY.1, SEC.1 (their run ledgers name the probe accounts and test tenants the inventory lists)
- **Scope (one line):** docs only, $0.
  - LEDGER: annotate resolved OPEN FINDINGS, prune RETURN PASS, and cut the size by moving verbose resolved state into a dated archive. History is never deleted, and the PHASE LOG stays append-only.
  - Manifest: backfill § Plan extensions for the 2026-09-22…09-26 inserts.
  - DEFERRALS: make the stale flips BACKLOG.md § Stale rows lists, plus the BL-49 flips, each with evidence.
  - Write the prod test-data inventory for HUMAN-H7, and record the check-backlog.sh parser gap as an upstream item.
- **Spec §§:** none (process). The build-memory contract: ADR-004; `~/agent-skills/skills/build-memory/layout.md` (LEDGER §, modes table); `docs/tickets/DEFERRALS.md` rules 1–4
- **REQ coverage:** — (process row; no REQ id to stamp)
- **Absorbs (backlog):** BL-02 (X-ledger-state-drift, X-manifest-plan-extensions-stale, X-deferrals-status-hygiene, X-run-ledger-stale-headers), BL-49 (D-PRB.03-1, D-PRB.16-4 flips), BL-38 (the inventory half; X-prod-test-data-residue)
- **Run:** `implement-spec spec=docs/tickets/62_MAINT.2__build-memory-hygiene.md`
- **Gate status:** None beyond the round-3 standing authorization (ADR-013). MAINT.2 writes nothing to prod. The deletes the inventory recommends are the operator's HUMAN-H7 "prod test-data cleanup" item.
- **Live stage:** Stage A: docs + one small committed validator, $0. Stage B: none. Read-only prod queries only if a committed id is ambiguous ($0, no writes).

## Goal
Make the build memory tell the truth again, so orchestrate-build, REC.1 and GATE-ACCEPT read a clean state. Four
problems:
- `docs/build/LEDGER.md` is ~208 KB. Its OPEN FINDINGS still carries resolved entries (e.g. "D-PRB.21-1 (OPEN)",
  which was DONE on 2026-09-23), and its RETURN PASS lists P0.15j/P0.15k/PRB.18 though their legs landed.
- The manifest's § Plan extensions stops at 2026-09-18, although PRB.20–25, the P1 bodies, CAPSTONE, RCN.1,
  STB.1–4 and DEF.1–3 were inserted on 09-22…09-26.
- Several DEFERRALS rows have a first keyword that contradicts their own evidence.
- The operator needs one list of the test data left on prod to decide deletes (BL-38).

Throughout: append-only stays append-only, every flip carries evidence, and nothing is deleted.

## Load (read these — do not re-read others)
- `docs/build/BACKLOG.md`: § X- id mapping (rows X-ledger-state-drift … X-run-ledger-stale-headers,
  X-prod-test-data-residue), § Stale rows, § Rows marked DONE that still owe something, and § Added 2026-09-30.
  `BACKLOG.csv` rows BL-02, BL-38, BL-49.
- `docs/build/LEDGER.md`:
  - CURRENT STATE ~16–38
  - OPEN FINDINGS ~40–163, with about 12 top-level bullets. The resolved candidates are the G1 core, the G1
    PASSED, the STB.2 finding, D-PRB.21-1, and the DEF.1/2/3 landings. G2 DEFERRED and the round-3 entry are
    **open**.
  - GATE DECISIONS ~165 (append-only)
  - RETURN PASS ~202–210
  - PHASE LOG ~212+ (append-only; ≈177 KB; the 09-22…09-26 lines ~280–330 are the backfill source)
- `docs/tickets/00_MANIFEST.md` § Plan extensions (the last line is the 2026-09-30 ROUND 3 entry, which names this
  backfill) and § The chain rows 28k–28p, 51–58. `docs/build/BUILD_INDEX.md` gives the PR numbers.
- `docs/tickets/DEFERRALS.md`: the rules header, and the rows named in BACKLOG.md § Stale rows + BL-49. Evidence
  sources are the run ledgers `docs/build/runs/STB.2.md` §6, `STB.3.md` §4, `DEF.1.md` §7, `DEF.2.md` §5–6 and
  `DEF.3.md` §5–6, plus `RCN.1.md`.
- `docs/build/reports/2026-09-30_prod-design-review.md` § Method ("Prod state touched"), PR-S1 (the "PRB16 /
  STB3 Probe Voice" rows); `docs/tickets/85a_HUMAN-H7__round3-operator-legs.md` (the cleanup item).
- The run ledgers of SEC.1 (probe accounts, by tag) and JOURNEY.1 (test tenants; purge results).
- `~/agent-skills/skills/reconcile-build/scripts/check-backlog.sh` ~44–50: the status parse. Read only; it is out
  of this repo.

## In scope — deliverables
1. **OPEN FINDINGS: annotate resolved** (BL-02).
   - Each resolved entry becomes a one-line stub: `**RESOLVED <date> → <pointer>**` (e.g. D-PRB.21-1 →
     `runs/…` + PHASE LOG 2026-09-23).
   - Its verbose body moves **verbatim** into a dated archive, `docs/build/reports/<date>_ledger-archive.md`:
     append-only, one anchor per moved block, with a header naming its origin and date.
   - Open entries stay, tightened to ≤ ~4 lines each with pointers. Their substance must not change.
2. **RETURN PASS prune** (BL-02).
   - P0.15j and P0.15k are done and archived with pointers.
   - PRB.18 is pruned to what actually remains, the browser SSE/editor legs (BL-32). They now map to JOURNEY.1
     steps and the H7 real-device residual, so the row is archived with that pointer.
   - The `returnPass:` key must equal the table's ids (BM-LEDGER-05).
3. **CURRENT STATE** (BL-02, X-ledger-state-drift).
   - Verify each drift item BACKLOG.md names against today's file. The 2026-09-30 seeding already fixed
     `nextTicket`, `lastCompleted` and the `## GATE DECISIONS` heading; confirm and record that.
   - Shorten the trailing comments to one short clause each, moving any history into the archive.
   - Keep the key order exactly as BM-LEDGER-02 requires.
4. **Size cut**, measured. Record LEDGER bytes before and after, per section. The cut comes only from items 1–3.
   PHASE LOG and GATE DECISIONS stay byte-identical.

   The PHASE LOG's own size (~177 KB of verbose "one-line" entries) is a **watch item**, not work here. A
   rotation convention would change the build-memory contract (ADR-004 / upstream `layout.md`), so it is
   recorded in item 8's upstream list.
5. **§ Plan extensions backfill** (BL-02, X-manifest-plan-extensions-stale): append one dated line per insert.
   - The inserts, all with dates from their PHASE LOG lines:
     - `28k_PRB.20`, `28l_PRB.21`, `28m_PRB.22`, `28n_PRB.23` (2026-09-22)
     - `28o_PRB.24`, `28p_PRB.25`, the P1 bodies write (29–50), and G3's early read as context (2026-09-23)
     - the CAPSTONE ledger row, `51_RCN.1`, `52_STB.1`…`58_STB.4`, and `55_DEF.1`…`57_DEF.3`
   - Each line carries its PR number (BUILD_INDEX) and the trigger (live finding / operator ruling), and is
     marked "*backfilled <date> by MAINT.2*".
   - Append to § Plan extensions only. Never edit the ROUND 3 line above it.
6. **DEFERRALS flips** (BL-02 X-deferrals-status-hygiene; BL-49). Per BACKLOG.md § Stale rows:
   - **Flip to DONE**, each with a prefix `DONE (<date>, MAINT.2 — evidence: <run ledger §, run id, PR>)` placed
     before the untouched original cell text:
     - D-P0.03-3, carrying the mid-phase pin as a note → BL-16
     - **D-PRB.03-1** and **D-PRB.16-4** (BL-49)
     - D-P0.15b-2 · D-P0.15c-2, pointing to D-P0.03-2
     - D-P0.15b-3 · D-P0.15c-3, with pointers to their owning rows
     - D-P0.15b-4 · D-P0.15c-5 (G1 PASSED 2026-09-15; the readout rewrite → BL-06/BL-36)
   - **Re-scope, keeping PARTIAL:** D-P0.15b-1 → BL-25 / OPS.1.
   - **Re-assess** against the DEF.1 §7.2 / DEF.3 §6 evidence: D-P1.11-1, D-P1.10-1, D-P1.12-1, D-P1.14-1,
     D-P1.07-1, D-P1.21-2. Flip a row **only** if every leg is evidenced in a committed ledger. Otherwise add a
     dated note narrowing the residual and naming its round-3 owner: STB.5a (BL-21/22), STB.5b (BL-16–19) or
     HUMAN-H7 (BL-20).
   - First re-confirm that SEC.1/HOT.1/JOURNEY.1 did not already flip any of these, and skip those.
7. **Stale run-ledger headers** (X-run-ledger-stale-headers): a **dated correction note** directly under the
   `runs/DEF.2.md` and `runs/DEF.3.md` headers ("Stage B was since executed — see §…"). The headers are not
   rewritten.
8. **Upstream items** (out of this repo). Record them in LEDGER OPEN FINDINGS as a one-line "upstream" entry,
   with the full text in the run ledger, including a proposed patch description. Never edit `~/agent-skills`.
   - (a) `reconcile-build/scripts/check-backlog.sh` takes the last cell, uppercases it and matches `OPEN*|PARTIAL*`
     at its **start**, so a status cell beginning with `**` or a date is missed. This contradicts DEFERRALS.md's
     own "first keyword in the cell" rule. In-repo, do **not** mass-rewrite cell formatting to satisfy the parser.
   - (b) the PHASE LOG size / rotation watch item.
9. **Prod test-data inventory for HUMAN-H7** (BL-38), `docs/build/reports/<date>_prod-test-data-inventory.md`.
   One row per item, giving what it is, where (stage/workspace/project/table + id), the source evidence, a
   recommended action (delete / keep / keep-as-fixture), and the risk of deleting it. At least these:
   - the STB.2 test draft `01M3D7E1…` v7 on `my-first-project` (`runs/STB.2.md` §6)
   - the stray `deployments` row `prod:82179e1` (`0.4.0+test`; `runs/DEF.1.md` §7.1)
   - the 2026-09-30 review account (`+rhema-review`), its seeded Showcase and its two "The Library After Dark"
     projects, including the accidental Page note and the completed review
   - the review-test project and run in the operator's workspace
   - the "PRB16 Probe Voice" / "STB3 Probe Voice" personas (whose workspace — confirm)
   - SEC.1's two probe accounts (by tag)
   - any JOURNEY.1 test tenant the purge did not remove

   Emails appear only where committed docs already name them. Confirm ids with **read-only** queries only when the
   committed evidence is ambiguous. No writes, no deletes.
10. **A small append-only validator**, `docs/build/tools/check-append-only.mjs` (the layout's `tools/` is allowed). Given
    a base ref, it asserts:
    - the old PHASE LOG and GATE DECISIONS are prefixes of the new
    - every pre-existing DEFERRALS row id still exists, with its original cell text still present
    - § Plan extensions only grew

    Record its result in the run ledger. It is reusable by REC.1 and GATE-ACCEPT.

## Out of scope
- Deleting any prod data: HUMAN-H7 authorizes, and a later operator-approved write executes it.
- Ratifying BACKLOG.csv statuses (BL-02 → closed, etc.): REC.1 (BL-04). MAINT.2 records completion in its run
  ledger and does not edit BACKLOG.csv.
- The coverage matrix and CAPSTONE REQ-count drift: CAP.1 (BL-03). Doc refresh and stale phase readouts: DOC.1/DOC.2
  (BL-06).
- Closing any deferral that needs new live evidence: its round-3 owner (STB.5a/5b, OPS.1, H7).
- Changing the build-memory contract or `check-backlog.sh`: upstream (agent-skills), recorded only.

## Acceptance criteria
- [ ] `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` reports 0 violations, before the
      close commit and after. *(deterministic)*
- [ ] `docs/build/tools/check-append-only.mjs` passes against the pre-MAINT.2 base:
  - PHASE LOG and GATE DECISIONS are unchanged prefixes
  - no DEFERRALS row or original cell text is lost
  - Plan extensions only appended

  A fixture test proves it fails on a deleted row and on an edited PHASE LOG line. *(deterministic)*
- [ ] OPEN FINDINGS holds only open entries plus one-line `RESOLVED → pointer` stubs. Every moved body exists
      verbatim in the dated archive. `returnPass:` equals the RETURN PASS table ids. Before/after bytes are
      recorded per section. *(deterministic — diff + byte counts in the run ledger)*
- [ ] Every 2026-09-22…09-26 insert named in deliverable 5 has exactly one dated Plan-extensions line, with its PR
      number matching BUILD_INDEX. *(deterministic — cross-check script or table in the run ledger)*
- [ ] Every flipped row's new first keyword is `DONE` and cites committed evidence (ledger § + run id/PR) that
      actually contains the claim. Every "re-assess" row not flipped has a dated note naming its round-3 owner.
      `check-backlog.sh`'s output is recorded, with the parser caveat. *(agentic)*
- [ ] `runs/DEF.2.md` and `runs/DEF.3.md` carry dated correction notes, with their original headers intact.
      *(deterministic)*
- [ ] The prod test-data inventory is committed with every item named in deliverable 9, each with evidence and a
      recommended action. HUMAN-H7's cleanup item points to it (a dated note in the H7 marker's checklist line;
      the checkbox is left for the operator). *(agentic)*
- [ ] The upstream items (check-backlog.sh parser gap; PHASE LOG rotation) are recorded in OPEN FINDINGS + the run
      ledger with a proposed patch description. *(agentic)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
None: a process row. The PR states "no REQ ids (build-memory hygiene; ADR-004)".

## Cross-cutting invariants
- Build memory (AGENTS.md; ADR-004):
  - contracts and history are append-only, amended by a dated note
  - **secrets never** enter a ledger or report
  - the inventory records ids and `provided: yes/no`, never credentials or session tokens
- Manifest **#10**: the inventory and archive carry ids and titles already in committed docs, never user draft
  text.
- Manifest **#13** / REQ-SPEC-30: any read-only confirmation query runs on the system pool, in the operator's
  session, and is recorded as such. It is never run through a user route.
- Manifest **#12** / REQ-SPEC-29 and **#14** / REQ-SPEC-32: not touched (no user surface, no money path).
  JOURNEY.1 is not needed for acceptance.

## Notes
- **Owned decisions → write an ADR only if taken:**
  - the archive's location and format (a dated `reports/` file vs an in-LEDGER archive section; recommended:
    the reports file, so the LEDGER shrinks)
  - any status-cell convention beyond the DEFERRALS rules header

  If neither departs from ADR-004, record the choice in the run ledger instead.
- **Consumes:** SEC.1 (probe accounts), HOT.1 (the deployed state the inventory's `deployments` rows reflect),
  JOURNEY.1 (test tenants; the BL-32 row mapping; its flips, which must not be double-flipped).
- **Consumers:** REC.1 (a clean backlog baseline; BL-04), GATE-ACCEPT (BL-47 reads OPEN FINDINGS + the upstream
  items), HUMAN-H7 (the inventory).
- **Anchors to re-confirm at build time:** LEDGER line ranges (later round-3 closes will have appended PHASE LOG
  lines and possibly OPEN FINDINGS); which Stale-rows rows are still stale; the exact ids in the inventory.
- **DEFERRALS rule:** a re-assess row that cannot be settled from committed evidence stays as-is with a dated note.
  An inventory item whose id cannot be confirmed read-only is listed as "unconfirmed", with the query to run. It
  becomes a `D-MAINT.2-<n>` row only if an acceptance criterion above cannot be met.

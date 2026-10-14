# HYGIENE.1 — build-memory hygiene + status-cell normalization (run ledger)

- **Spec:** `docs/tickets/151_HYGIENE.1__memory-hygiene.md` (manifest row 151, round 5 — first
  dispatchable chain row after the 150_HUMAN-H8 marker)
- **Base:** `stevevitali/r5-synthesis` @ `27f8672` (round-5 chain tip)
- **Branch:** `stevevitali/hygiene-1-memory-hygiene` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-cli subagent (Cognition agentic coding CLI)
- **Skills:** implement-spec + build-memory + reconcile-build @ `~/agent-skills` `e3faecf`
- **Requirement ids stamped:** REQ-MEM-1 REQ-MEM-2 REQ-MEM-3 REQ-MEM-4 REQ-MEM-5 REQ-MEM-9
  REQ-MEM-10 REQ-G1-2 REQ-G1-3 (V-3 half)
- **Started:** 2026-10-14T20:58Z · **Closed:** _pending_
- **Config:** docs/tooling-only; **Live stage: none**; **Production mutations: none**; metered
  spend **$0**; zero prod writes, zero deploys, zero merges

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). This ticket does not unblock rows by code —
it *discharges* the G1-censused ALREADY-DONE and DROP classes in place (see Requirements).
Pre-existing finding (recorded, not continued): D-P1.22-2 (line ~697), D-OBS.1-2/-3
(lines ~797-798) carry `2026-10-15` status stamps ahead of the `date -u` clock
(`2026-10-14T20:58Z`) — the checker's `~ clock` warning; per BM-CLOCK-01 this run does not
continue their sequence (all new stamps are `2026-10-14`).

## Requirements (from the ticket contract)

1. REQ-MEM-2 — committed `node` scripted pre-census over DEFERRALS.md: per row, the positional
   status + every non-canonical trailing token; run FIRST; summary pasted here.
2. REQ-MEM-3 — `~/agent-skills/skills/build-memory/scripts/check-build-memory.sh` flipped to
   positional first-canonical-token semantics matching `check-backlog.sh` (no vendored copy
   exists in-repo — verified); committed checker fixture/test proves both read the drifted
   rows identically.
3. REQ-MEM-1 — every G1-table ALREADY-DONE row's leading status token → `DONE` with the dated
   tail preserved verbatim; every DROP-class row (D-SPAF.*-3/-4, D-SPA.*-2 preview drills)
   gets a literal dated `DROPPED <date>:` close — never a deletion (ratified Q-DROP ruling).
4. REQ-MEM-5 — BUILD_INDEX `ARMB.2` row backfilled; entry-ID / evidence-file naming convention
   stated once in `docs/build/README.md`.
5. REQ-MEM-9 — COVERAGE_MATRIX REQ-IDE-20/-21 anchors `§5.3` → settled `§6.6` (register section;
   REQ-IDE-22 precedent).
6. REQ-MEM-10 — BL-73 dated BACKLOG note: the 33 `1.x` Later rows are spec-scheduled, not lost;
   DEFER-class disposition (not a close).
7. REQ-MEM-4 — PHASE LOG rotation convention documented + applied: `## PHASE LOG — Round 5`.

## Acceptance criteria

- [ ] The two checkers emit identical status for every DEFERRALS row — fixture-tested
      (deterministic · engineered)
- [ ] Every G1 ALREADY-DONE/DROP row's cell reads the ratified disposition; zero rows parse
      OPEN-or-PARTIAL whose dated tail says DONE (deterministic · engineered)
- [ ] `check-build-memory.sh` + `check-append-only.mjs` green after the pass (deterministic)
- [ ] BUILD_INDEX ARMB.2 row + naming convention landed (deterministic)
- [ ] verification green; BUILD_INDEX.md row and LEDGER.md advanced; operating clauses met
      (agentic — universal phase-gate AC)

## Plan

1. Census tool `docs/build/tools/deferral-status-census.mjs` (+ shared parse lib
   `docs/build/tools/deferral-status.mjs`) — run first; output is the normative edit list.
2. Upstream parser flip in `~/agent-skills` (priority-scan → positional) + fixture test in-repo.
3. DEFERRALS cell normalization per the census + G1 table (codemod script, then verified
   re-census).
4. BUILD_INDEX ARMB.2 row + `runs/ARMB.2.md` stub + naming convention in `docs/build/README.md`.
5. COVERAGE_MATRIX §-anchor fix; BL-73 dated note; BL-16/17/21 closes (G1 ALREADY-DONE).
6. PHASE LOG `— Round 5` region + rotation convention documented.
7. Self-review → gap analysis → verification → PR + closeout.

## Test matrix

| AC | planned test / check |
|---|---|
| checker parity | `scripts/deferral-status-parity.test.mjs` (vitest): fixture of the real drifted cells → node positional parse vs `check-backlog.sh` expected-set vs `check-build-memory.sh` kind-P warning set — three-way equal (upstream scripts skipped when absent) |
| normalization correct | re-run census after the pass: every G1 row positional-reads its ratified status; parity script's "owed" set shrinks by exactly the closed ids |
| append-only | `node docs/build/tools/check-append-only.mjs --base 27f8672` (+ `--staged`) |
| memory structure | `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` exit 0 |
| repo green | `pnpm turbo build lint typecheck` (docs-only → FULL TURBO/no-op) + `pnpm test` incl. the new parity test |

## Progress

- 2026-10-14 — committed `docs/build/tools/deferral-status.mjs` (shared positional/priority
  parse) + `docs/build/tools/deferral-status-census.mjs` (the REQ-MEM-2 pre-census); ran the
  census FIRST, before any normalization; artifacts committed at
  `docs/build/reports/2026-10-14_deferral-census.{txt,json}`.
- 2026-10-14 — upstream `~/agent-skills` commit `e981ec5` (pushed to
  `SteveVitali/agent-skills@main`): `check-build-memory.sh` flipped to positional
  first-canonical-token semantics at all three status consumers (§5 status parse, the kind-P
  rule-5 warn, the passed-gate check); new `v2-positional-status` fixture makes each script's
  owed set observable (rule-5 warnings vs check-backlog `missing` issues) and asserts them
  equal — `run-tests.sh` 18/18 PASS. No vendored copy exists in-repo (`docs/build/tools/`
  holds only `check-append-only.mjs` + `record_policy/`).
- 2026-10-14 — `docs/build/tools/deferral-status-normalize.mjs --apply`: 96 status-cell
  flips — 55 G1 ALREADY-DONE → `DONE` (incl. all 28 `D-SPAF.*-1/-2`), 41 G1 DROP →
  `WONTFIX` + literal `DROPPED 2026-10-14:` close lines (28 `D-SPAF.*-3/-4` + the 13
  `D-SPA.12-2..24-2` preview rollback drills); 10 ALREADY-DONE rows already led `DONE`
  (no edit). `--verify`: 106/106 G1 rows read the ratified disposition.
- 2026-10-14 — `BACKLOG.csv`: BL-16/BL-17/BL-21 closed (substance discharged in funded
  window B 2026-10-06 / GATE-ACCEPT sign-off — G1 ALREADY-DONE); ADR-094 rehomed BL-17 →
  BL-77 (the process/infra revisit-trigger watch) so `check-backlog` stays
  home-closed-clean; BL-73 dated REQ-MEM-10 DEFER note appended (stays `open`, not closed).
- 2026-10-14 — `BUILD_INDEX.md` seq 177 = ARMB.2 (PR #171, `ffbb8ad` deployed prod);
  naming convention stated once in `docs/build/README.md`; `COVERAGE_MATRIX.csv`
  REQ-IDE-20/-21 anchors `§5.3` → `§6.6` (the register's own section column, rows 3115–16).
- 2026-10-14 — `LEDGER.md`: `harness:` key moved to its allowed slot (between `round:` and
  `updatedAt:` — the sole pre-existing violation); `## PHASE LOG — Round 5` region opened
  per the REQ-MEM-4 rotation convention (documented in README + in the heading note).

## Pre-census output (REQ-MEM-2 — run FIRST)

`node docs/build/tools/deferral-status-census.mjs` over the base DEFERRALS.md
(`27f8672`), 2026-10-14 — full per-row output committed at
`docs/build/reports/2026-10-14_deferral-census.txt` (+ `.json`). Summary:

```
rows scanned: 320
positional status: {"DONE":116,"ACCEPTED-SKELETON":1,"OPEN":168,"PARTIAL":35}
DONE-before-OPEN: 43 · DONE-before-PARTIAL: 13 · OPEN-before-DONE: 17
PARTIAL-and-DONE: 12 · PARTIAL-before-OPEN: 27
noncanonical-tail: 260 · trailing-OPEN+PARTIAL: 21
PARSER-DISAGREE (priority-scan != positional): 78
```

The actual disagreement count is **78**, not the ~50 the research note estimated — the
scripted census is the normative edit list; the research number was a hand-grep
approximation (recorded honestly, not silently re-fitted).

The pre-census drove the edit list: of the 65 G1 ALREADY-DONE rows, 55 led `OPEN`/`PARTIAL`
(flipped) and 10 already led `DONE` (no edit needed — they were only misread by the
priority scan); all 41 DROP rows led `OPEN`. Post-normalization census: `DONE: 171,
WONTFIX: 41, OPEN: 82, PARTIAL: 25, ACCEPTED-SKELETON: 1` — owed shrank 203 → 107.

Residual notes (checked, honestly owed — no flip): five rows still lead OPEN/PARTIAL with a
trailing DONE word — `D-P0.06-3` (G1 DEFER; its cell names the BL-02 carry),
`D-P1.18-1`/`D-STB.5b-5`/`D-CAP.2-2` (trailing DONE names a discharged sub-leg; "still owed"
clauses follow), `D-EDIT.1-2` (the DONE names sibling row D-EDIT.1-1). `D-P0.15b-1`'s tail
confirmed before flip (§Q caveat): OPS.1 2026-10-03 discharged the preview-lifecycle half,
sign-in re-homed to D-P0.01-3. `D-P0.01-4` leads `ACCEPTED-SKELETON` with a discharged tail —
outside the G1 table (not an owed row in the census), left verbatim as recorded observation.

## Gap table

| requirement / AC | status | evidence |
|---|---|---|
| REQ-MEM-2 scripted pre-census, run FIRST, summary in ledger | DONE | `tools/deferral-status-census.mjs` + `deferral-status.mjs`; ran before any edit; reports committed (`2026-10-14_deferral-census.{txt,json}`); summary pasted above |
| REQ-MEM-3 parsers agree; fixture proves it | DONE | upstream `agent-skills@e981ec5` positional flip (3 sites) + `v2-positional-status` fixture (rule-5 warn-set ≡ check-backlog missing-set); repo `scripts/deferral-status-parity.test.mjs` — 0 disagreements on all 320 rows + 7 synthetic cells |
| REQ-MEM-1 G1 rows read ratified disposition; tails verbatim | DONE | 96 flips via `deferral-status-normalize.mjs`; `--verify` 106/106; `check-append-only` + `check-history --staged` clean (dated-grow judgment on every flip) |
| AC: zero OPEN/PARTIAL rows whose dated tail says DONE | DONE | all G1 zombies closed; 5 residual trailing-DONE words audited — sub-leg/sibling references on honestly-owed rows (recorded above) |
| REQ-MEM-5 ARMB.2 index row + naming convention | DONE | BUILD_INDEX seq 177; convention in `docs/build/README.md` |
| REQ-MEM-9 REQ-IDE-20/-21 anchors | DONE | `§5.3` → `§6.6` (register column truth, spec rows 3115–16) |
| REQ-MEM-10 BL-73 dated DEFER note | DONE | BACKLOG.csv BL-73 title note; status stays `open` (DEFER, not close) |
| REQ-MEM-4 PHASE LOG rotation | DONE | convention documented (README + in-heading note); `## PHASE LOG — Round 5` opened; oversized-entry warning reclassified to older regions |
| check-build-memory / check-append-only green | DONE | 0 violations · append-only OK vs 27f8672 |
| extra: CURRENT STATE key order violation (pre-existing) | DONE | `harness:` moved into its allowed slot |
| extra: BL-16/17/21 G1 ALREADY-DONE backlog cells | DONE | closed w/ dated notes; ADR-094 rehomed → BL-77 (check-backlog green at 369) |
| out-of-scope guard | held | no spec fold-back, no product/journey code, zero rows deleted, zero prose rewritten |

## Evidence log

_(filled at verification close — see Evidence report)_

## Evidence report

_(Phase 6)_

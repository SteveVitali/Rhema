# MAINT.2 — Build-memory hygiene (run ledger)

## Spec / Base / Branch / Config

- **Spec:** `docs/tickets/62_MAINT.2__build-memory-hygiene.md` (sequence 62, round 3) — LEDGER
  cleanup + size cut, manifest § Plan extensions backfill (2026-09-22…09-26), stale DEFERRALS
  flips, stale run-ledger headers, upstream items, prod test-data inventory for HUMAN-H7, and a
  committed append-only validator. **Scope: docs only, $0.**
- **Base:** `stevevitali/journey-1-browser-journey-acceptance` @ `a2bf831` (chain tip; JOURNEY.1
  PR unmerged).
- **Branch:** `stevevitali/maint-2-build-memory-hygiene` — stacked PR, `mergePolicy=OPERATOR`,
  never merged by the worker.
- **Mode:** `implement-spec`, committed build-memory (ADR-004). Ledger = this file.
- **Harness:** devin (subagent) — no model-tier relevance; docs-only ticket.
- **Spend cap:** $0. Docs + one committed validator. **No production writes**; read-only prod
  queries only if a committed id is ambiguous (none needed — see §8).

## Gate status (copied from LEDGER GATE DECISIONS — first commit carries this)

- **D6/D6-revised (2026-09-30):** round-3 spend envelope hard ≤ $200 / target ≤ $100; the ADR-013
  pre-authorizations + pauses stand. **D7 (2026-09-30): build-memory cleanup authorized → this
  ticket.** MAINT.2 writes nothing to prod — no pause applies; $0 spend.
- Standing: PRs stack and stay operator-held (D1); secrets never enter a ledger or report.

## Deferrals read

`docs/tickets/DEFERRALS.md` read at run start (AGENTS.md rule). MAINT.2 does not unblock rows by
landing code; it *reconciles* rows whose committed evidence already supports a flip (BACKLOG.md §
Stale rows + BL-49), per deliverable 6. Rows already flipped/annotated by SEC.1, HOT.1 or
JOURNEY.1 (D-SEC.1-1/-2; the BL-32 JOURNEY.1 dated mapping notes on D-PRB.04-2, D-PRB.07-1,
D-P1.08-1, D-P1.09-1, D-P1.17-2, D-P1.19-2, D-P1.20-1) are **not** touched beyond what the ticket
names.

## Requirements (extracted 0.4)

1. **LEDGER OPEN FINDINGS** — annotate resolved entries as one-line `**RESOLVED <date> →
   <pointer>**` stubs; verbose bodies move **verbatim** to a dated archive
   (`docs/build/reports/ledger-archive/2026-10-01_open-findings-return-pass.md` — see Owned
   decisions). Open entries stay, tightened to ≤ ~4 lines, substance unchanged.
   - Resolved candidates (per the ticket): the G1-core entry, the G1-PASSED disposition, the STB.2
     finding, `D-PRB.21-1 (OPEN)` (DONE 2026-09-23, residual = BL-13 pricing), and the DEF.1/2/3
     landings.
   - Staying open: G2 DEFERRED, REQ-coverage note, STB.3 findings entry (F8 SLOs still red —
     PR-R2; other findings' residuals named), the round-3 review entry.
2. **RETURN PASS prune** — P0.15j/P0.15k done → archived with pointers; PRB.18 pruned to the
   browser SSE/editor legs, which now map to JOURNEY.1 steps + the H7 real-device residual → row
   archived with that pointer; `returnPass:` equals the surviving table ids → `(none)` once all
   three rows archive.
3. **CURRENT STATE** — confirm the 2026-09-30 seeding fixed `nextTicket`/`lastCompleted` and the
   `## GATE DECISIONS` heading (drift items from X-ledger-state-drift); shorten trailing comments
   to one short clause; keep BM-LEDGER-02 key order; `lastCompleted`/`nextTicket`/`chainTip`/
   `updatedAt`/`returnPass` update at closeout (the seed keeps MAINT.2-era values until then).
4. **Size cut, measured** — LEDGER bytes before/after per section, recorded below; PHASE LOG and
   GATE DECISIONS byte-identical.
5. **Manifest § Plan extensions** — one dated line per 2026-09-22…09-26 insert (28k–28p, the P1
   bodies write, CAPSTONE, RCN.1, STB.1, STB.2, STB.2 follow-up deploy, STB.3, DEF.1–3, STB.4),
   each with its PR number from BUILD_INDEX and `*backfilled 2026-10-01 by MAINT.2*`; append only,
   never edit the ROUND 3 line.
6. **DEFERRALS reconciliation** — flip to DONE (prefix `DONE (2026-10-01, MAINT.2 — evidence: …)`
   before untouched cell text): D-P0.03-3 (mid-phase pin note → BL-16), D-PRB.03-1, D-PRB.16-4
   (BL-49), D-P0.15b-2, D-P0.15c-2 (residual pin legs → D-P0.03-2), D-P0.15b-3, D-P0.15c-3
   (residuals → owning rows), D-P0.15b-4, D-P0.15c-5 (G1 PASSED; readout rewrite → BL-06/BL-36).
   **Re-scope, keeping PARTIAL:** D-P0.15b-1 → BL-25/OPS.1 (`pr-<n>` up/destroy never exercised).
   **Re-assess** vs DEF.1 §7.2 / DEF.3 §6: D-P1.11-1, D-P1.10-1, D-P1.12-1, D-P1.14-1, D-P1.07-1,
   D-P1.21-2 — flip only if every leg is evidenced; else dated narrowing note + round-3 owner.
7. **Stale run-ledger headers** — dated correction note under the `runs/DEF.2.md` and
   `runs/DEF.3.md` header blocks (Stage B was executed 2026-09-26 — see §7 / §6); headers not
   rewritten.
8. **Upstream items** — one-line entries in LEDGER OPEN FINDINGS + full text here: (a)
   `check-backlog.sh` status parse vs the "first keyword in the cell" rule (observed 2026-10-01
   output below); (b) the PHASE LOG ~177 KB size/rotation watch item. Both record a proposed patch;
   `~/agent-skills` is never edited.
9. **Prod test-data inventory** — `docs/build/reports/2026-10-01_prod-test-data-inventory.md`:
   one row per item (what, where, evidence, recommended action, delete-risk); ids/titles only,
   never credentials or draft text; a dated note on the H7 checklist line (checkbox unticked).
10. **Append-only validator** — `docs/build/tools/check-append-only.mjs`: given a base ref,
    asserts old PHASE LOG + GATE DECISIONS are prefixes of the new; every pre-existing DEFERRALS
    row id exists with its original cell text; § Plan extensions only grew; moved LEDGER bodies
    survive verbatim in the archive. Fixture test: fails on a deleted row and on an edited PHASE
    LOG line.

## Plan

1. Seed this ledger; baseline `check-build-memory.sh .` (done — 0 violations, 7 warnings,
   recorded below).
2. Record LEDGER per-section byte counts (before).
3. Write the dated archive file with the moved bodies verbatim; rewrite OPEN FINDINGS +
   RETURN PASS to stubs/pointers; tighten CURRENT STATE comments.
4. Append the manifest Plan-extensions backfill lines.
5. Apply the DEFERRALS flips + re-scope + dated re-assess notes.
6. Dated header-correction notes in `runs/DEF.2.md`, `runs/DEF.3.md`.
7. Write the prod test-data inventory; dated note on the H7 cleanup item.
8. Add the two upstream items to OPEN FINDINGS + this ledger.
9. `docs/build/tools/check-append-only.mjs` + `--selftest` fixture mode.
10. Two-pass self-review → gap analysis vs the contract → deterministic verification
    (`check-build-memory.sh` tree + `--staged`, `check-append-only.mjs` vs base, backlog parser
    output recorded, byte counts) → commit → push → stacked PR → closeout commit (BUILD_INDEX
    row, LEDGER advance, PHASE LOG line).

## Test matrix

| Behaviour | Test / check | Evidence |
|---|---|---|
| LEDGER still parses (keys/order, PHASE LOG last, orient budget) | `check-build-memory.sh .` → 0 violations | § Verification |
| Moved bodies preserved verbatim | `check-append-only.mjs` archive check + `git diff` review | § Verification |
| PHASE LOG / GATE DECISIONS untouched | byte-compare sections base vs head (validator asserts prefix) | § Verification |
| `returnPass:` == table ids | hand-check + validator grep | § Verification |
| Manifest lines: exactly one per named insert, PR matches BUILD_INDEX | table in § Verification | § Verification |
| DEFERRALS first keyword = actual status on touched rows; original cell text intact | `check-history.sh --staged` row-annotate (grown/flip rules) + manual | § Verification |
| Validator fails on fixture violations | `check-append-only.mjs --selftest` | § Verification |
| check-backlog.sh output recorded incl. parser caveat | run + paste output | § Verification |
| `git diff --check` clean | git | § Verification |

## Baseline (Phase 1)

- `check-build-memory.sh .` @ `a2bf831`: **0 violations, 7 warnings** — manifest rows outside a
  round banner (pre-existing), `nextTicket` MAINT.2 vs GATE-G2 (pre-existing), orient stale token
  `.agents/scratch` in the line-3 provenance comment (fixed below — orient text is living state,
  not a record), 44 PHASE LOG entries > 2 KiB (watch item → deliverable 8b), 18 legacy
  BUILD_INDEX `run` values, 3 pre-guard readouts, 85 run ledgers without `Harness:` (this ledger
  carries one).
- `check-backlog.sh` @ `a2bf831` (2026-10-01): **8 issues** — recorded verbatim in § Evidence.
- LEDGER.md @ `a2bf831`: **220,841 B**, 350 lines. Section bytes measured below at edit time.

## Implementation notes (what changed)

1. **Archive** — `docs/build/reports/ledger-archive/2026-10-01_open-findings-return-pass.md` (14,141 B).
   Holds, verbatim: the superseded LEDGER line-3 provenance comment, the bodies of the resolved OPEN
   FINDINGS bullets (G1 core, G1 PASSED disposition, STB.2 cross-tenant finding, D-PRB.21-1, DEF.1/2/3
   landings) and the full original text of the still-open entries that were tightened (REQ coverage,
   STB.3 F1–F10, the 2026-09-30 review bullet), plus all three RETURN PASS rows. Verbatim check: every
   moved base line `grep -qxF`-matches a line in the archive (verified § Verification).
2. **LEDGER.md** — head comment reworded (`.agents/scratch` path retired → archive pointer added);
   CURRENT STATE comments shortened to one clause and `returnPass:` → `(none)`; OPEN FINDINGS collapsed
   to stubs/tightened opens + one upstream bullet; RETURN PASS emptied to a dated note; GATE DECISIONS +
   PHASE LOG byte-identical.
3. **Manifest** — 12 dated lines appended to § Plan extensions (28k–28p ×6, the G3 early read as context,
   the P1 bodies write, CAPSTONE, RCN.1, STB.1, STB.2, STB.3, DEF.1, DEF.2, DEF.3, STB.4 — DEF.1–3 each
   got their own line after review). The ROUND 3 line untouched.
4. **DEFERRALS.md** — 9 flips to `DONE (2026-10-01, MAINT.2 — evidence: …)` prepended before untouched
   cell text: D-P0.03-3, D-PRB.03-1, D-PRB.16-4, D-P0.15b-2, D-P0.15c-2, D-P0.15b-3, D-P0.15c-3,
   D-P0.15b-4, D-P0.15c-5. One re-scope staying PARTIAL: D-P0.15b-1 → BL-25/OPS.1. Six dated
   re-assessment notes staying PARTIAL: D-P1.11-1 (→ BL-20/H7+STB.5b), D-P1.10-1 (→ BL-19), D-P1.12-1
   (→ BL-19), D-P1.14-1 (→ BL-19), D-P1.07-1 (→ BL-21/STB.5a), D-P1.21-2 (→ BL-18). None of the six had
   been flipped by SEC.1/HOT.1/JOURNEY.1 (checked first keywords).
5. **Run-ledger header corrections** — dated notes appended under the `runs/DEF.2.md` + `runs/DEF.3.md`
   gate-status bullets (original text intact).
6. **History policy** — `docs/build/tools/record_policy/history.policy` (new): `exempt` declarations for
   the LEDGER's OPEN FINDINGS and RETURN PASS regions — curated lists whose maintenance moves bodies to
   the archive, so removal inside them is by design; the living-head rule above them still applies.
7. **Prod test-data inventory** — `docs/build/reports/2026-10-01_prod-test-data-inventory.md` (12 rows,
   every ticket-named candidate + JOURNEY.1/SEC.1 residue), and a dated pointer appended to the H7
   checklist item (checkbox left unticked).
8. **Validator** — `docs/build/tools/check-append-only.mjs` (new): `--base <ref> [--staged]` asserts the
   three invariants; `--selftest` runs the two negative fixtures + a clean fixture.

## Owned decisions

- **Archive mechanism, no ADR.** Moving resolved bodies into `reports/ledger-archive/` uses the
  existing living-archived convention (BM-LEDGER-08) — removed head lines archived byte-for-byte with a
  pointer comment left in place. The `exempt` policy records the OPEN FINDINGS / RETURN PASS exception
  explicitly rather than weakening the check. Recorded here per the ticket ("record the archive decision
  in the run ledger if no ADR is needed").
- **Archive path: `reports/ledger-archive/<date>_… .md`, a directory,** not the ticket's sketched
  `reports/<date>_ledger-archive.md`. `check-history.sh`'s living-archived search only scans
  `docs/build/reports/ledger-archive/` (plus `archive` policy dirs), so the flat name would fail
  BM-LEDGER-08; the directory form satisfies both the check and the ticket's "dated archive … one
  anchor per moved block" contract.
- **`returnPass: (none)`** — all three RETURN PASS rows resolved or re-routed; the two PRB.18 residual
  legs (browser SSE run-card, CodeMirror) are JOURNEY.1 step-registry items + the H7 real-device check
  (BL-32), so no ticket re-run is owed. Documented in the archived row + the LEDGER note.
- **The six P1 rows stay PARTIAL** — each has at least one live leg not evidenced in a committed ledger
  (notes on each row name the residual + round-3 owner); the flip rule "only if every leg is evidenced"
  was applied literally.

## Evidence

### LEDGER size cut (deliverable 4 — bytes via `wc -c` per `##` region)

| Section | base `a2bf831` | after cleanup | Δ |
|---|---|---|---|
| head (comment + title + OPERATING MODE) | 1,054 | 1,345 | +291 (archive pointer comment) |
| CURRENT STATE | 1,532 | 1,245 | −287 |
| OPEN FINDINGS | 11,466 | 4,875 | −6,591 |
| GATE DECISIONS | 18,780 | 18,780 | 0 — byte-identical |
| RETURN PASS | 2,066 | 462 | −1,604 |
| PHASE LOG | 185,943 | 185,943 | 0 — byte-identical |
| **Total** | **220,841** | **212,244** | **−8,597 (−3.9 %)** |

The cut is honest: it comes only from collapsing resolved bodies to stubs (the bytes are preserved in
the 14,141 B archive, not destroyed). The dominant PHASE LOG (~186 KB) is untouched — its rotation is
the upstream watch item below.

### `check-backlog.sh` output (deliverable 8a — recorded verbatim)

Baseline (@ `a2bf831`, run against the base DEFERRALS copy):

```
check-backlog: docs/build/BACKLOG.csv (expected sources: 81)
  ✗ 8 issue(s):
    - missing: ADR-018 is owed but appears in no backlog sources cell
    - missing: ADR-019 is owed but appears in no backlog sources cell
    - missing: ADR-020 is owed but appears in no backlog sources cell
    - missing: D-P0.08b-3 is owed but appears in no backlog sources cell
    - missing: D-P1.22-1 is owed but appears in no backlog sources cell
    - home-closed: D-PRB.03-1 is still owed but its home BL-49 is closed
    - home-closed: D-PRB.16-4 is still owed but its home BL-49 is closed
    - missing: D-SEC.1-2 is owed but appears in no backlog sources cell
```

After the MAINT.2 flips (same command, working tree): **6 issues** — the two `home-closed` BL-49 rows
resolved (D-PRB.03-1/D-PRB.16-4 now read DONE, so BL-49's closed status is consistent). Remaining:
ADR-018/019/020, D-P0.08b-3, D-P1.22-1, D-SEC.1-2 — genuinely owed ids with no backlog home → **REC.1**
(BL-04 owns backlog ratification; MAINT.2 does not edit BACKLOG.csv, per scope).

**Parser caveat (checked against the code, not just the ticket's description).** The ticket says the
parser "matches `OPEN*|PARTIAL*` at the cell's start". What `check-backlog.sh` actually does (lines
85–91): the last cell is uppercased, every `[^A-Z-]` run collapses to a space (hyphens survive), and
the **first canonical token anywhere** (`OPEN|PARTIAL|DONE|WONTFIX|ACCEPTED-SKELETON`) wins. Real
consequences, observed live:

- `**DONE-code** …` — the hyphenated compound survives tokenization as `DONE-CODE`, which is not
  `DONE`; a later bare `OPEN` in the prose then wins. D-P0.08b-3 / D-P1.22-1 read OPEN this way —
  accidentally correct today (they are owed), but the parse is luck, not intent.
- Any prose before the intended status that happens to contain a bare canonical word (`confirmed
  open`, `→ OPEN`) is read as the status.
- MAINT.2's own flip format `**DONE (2026-10-01, …)` parses correctly because `DONE` is the first
  canonical token — verified by running the parser's own extraction against the file (all 9 flipped
  rows → `DONE`, all 7 untouched-by-flip target rows → `PARTIAL`/`OPEN` as intended).

**Proposed patch (upstream; `~/agent-skills` untouched):** anchor the scan at the cell start after
stripping `*`/`_`/` ` decoration — i.e. extract the status from the *leading* keyword position of the
normalized cell (matching DEFERRALS.md's documented "first … keyword … in its status cell" rule read
as "the leading status word"), or treat hyphenated compounds `DONE-*`/`PARTIAL-*` as their root
keyword. Either way, a cell that *begins* with a date/`**` decoration should still resolve its status
from the first status word rather than the first status word appearing anywhere.

### PHASE LOG rotation (deliverable 8b)

The PHASE LOG is 185,943 B of 212,244 B (87.6 %) and every landed ticket appends ≥1 KB. Proposed
upstream/ADR change (recorded, not implemented): a rotation convention where PHASE LOG entries older
than the last N landings are moved verbatim into `reports/ledger-archive/<date>_phase-log.md` —
exactly the mechanism this ticket already uses for OPEN FINDINGS/RETURN PASS — while the head region +
current entries stay machine-readable. Needs an ADR-004 amendment + `layout.md`/`check-history.sh`
support (a `phases` policy line or an `exempt`-style rotation marker). Watch item; no repo change.

### Manifest § Plan extensions ↔ BUILD_INDEX cross-check (deliverable 5)

| New line (dated) | Insert | PR per line | PR per BUILD_INDEX | Match |
|---|---|---|---|---|
| 2026-09-22 | `28k_PRB.20` | #49 | #49 | ✓ |
| 2026-09-22 | `28l_PRB.21` | #50 | #50 | ✓ |
| 2026-09-22 | `28m_PRB.22` | #51 | #51 | ✓ |
| 2026-09-22 | `28n_PRB.23` | #52 | #52 | ✓ |
| 2026-09-23 | G3 early read (context) | — | — | n/a |
| 2026-09-23 | P1 bodies write (rows 29–50) | #55–#76 | #55–#76 (P1.01…P1.22) | ✓ |
| 2026-09-23 | `28o_PRB.24` | #53 | #53 | ✓ |
| 2026-09-23 | `28p_PRB.25` | #54 | #54 | ✓ |
| 2026-09-26 | CAPSTONE ledger row | — (ledger row) | — | ✓ |
| 2026-09-25 | `51_RCN.1` | — (ledger row) | — | ✓ |
| 2026-09-25 | `52_STB.1` | — (ledger row) | — | ✓ |
| 2026-09-25 | `53_STB.2` (+ STB.2-deploy) | — (ledger rows) | — | ✓ |
| 2026-09-26 | `54_STB.3` | — (ledger row) | — | ✓ |
| 2026-09-26 | `55_DEF.1` | #77 | #77 | ✓ |
| 2026-09-26 | `56_DEF.2` | #78 | #78 | ✓ |
| 2026-09-26 | `57_DEF.3` | #79 | #79 | ✓ |
| 2026-09-26 | `58_STB.4` | #80 | #80 | ✓ |

Dates taken from the PHASE LOG landing lines; PR numbers from `docs/build/BUILD_INDEX.md` rows.

## Self-review

**Pass 1 — implementation vs the contract (before verification).** Read every deliverable against the
diff. Findings, all fixed in flight:

- The manifest's AC asks for "exactly one dated Plan-extensions line" per *named* insert — the
  combined `55–57_DEF.1–3` line was ambiguous → split into three dated lines (PRs #77/#78/#79).
- The upstream item (a) text initially repeated the ticket's shorthand ("matches at the cell's
  start"). Checked against `check-backlog.sh` lines 85–91: the parser tokenizes the whole cell on
  `[^A-Z-]` (hyphens survive) and takes the *first canonical keyword anywhere* — `**DONE-code**` never
  resolves to `DONE`. LEDGER + this ledger now describe the real behavior.
- Archive location: the ticket sketches `reports/<date>_ledger-archive.md`, but BM-LEDGER-08's
  living-archived check only scans `docs/build/reports/ledger-archive/` — the directory form was used
  (recorded under Owned decisions).
- BM-CLOCK-01: the backfilled act dates (2026-09-22…26) need `retro:`/`as-of` on the *same line* —
  moved the marker inside each bullet's bold head after the first staged run flagged 17 R2s.

**Pass 2 — diff + evidence review (after the fixes).** `git diff --cached --check` clean; staged
history run: **0 violations** (27 record dates, 1,003 protected lines judged). Spot-checked: the
DEF.2/DEF.3 headers keep their original text with the dated note *under* them; the H7 checkbox stays
unticked; no secrets/session tokens in the archive or inventory (ids, titles, emails only where
committed docs already print them); every DEFERRALS edit prepends dated text and leaves the original
cell untouched (the parser's own extraction reads the intended first keyword on all 16 touched rows).

## Gap analysis (fresh read of `docs/tickets/62_MAINT.2__build-memory-hygiene.md`)

| AC | Evidence | Status |
|---|---|---|
| `check-build-memory.sh .` 0 violations before + after close | baseline 0/7 → now 0/6 (stale-token warning gone); staged run 0 | met (tree) — re-run at close |
| `check-append-only.mjs` vs base passes; fixtures fail | `--base a2bf831` OK (tree + staged); `--selftest`: deleted-row + edited-PHASE-LOG fixtures flagged, clean passes | met |
| OPEN FINDINGS = open entries + RESOLVED stubs; bodies verbatim in archive; `returnPass:` == table ids; byte counts recorded | stubs + tightened opens; `grep -qxF` verification that every moved line is in the archive; `returnPass: (none)` == empty table; § Evidence byte table | met |
| one dated Plan-extensions line per named 09-22…09-26 insert, PR == BUILD_INDEX | § Evidence cross-check table — 17 lines, all matched | met |
| flipped rows: first keyword DONE + committed evidence; non-flipped re-assess rows: dated note + round-3 owner | parser extraction prints DONE ×9 / PARTIAL ×7; each note names BL owner (BL-16/18/19/20/21/25) | met (agentic) |
| DEF.2/DEF.3 dated correction notes, headers intact | `runs/DEF.2.md`, `runs/DEF.3.md` — original bullets unchanged, dated note appended | met |
| prod test-data inventory committed; H7 points to it; checkbox unticked | `reports/2026-10-01_prod-test-data-inventory.md` (12 rows); dated note appended under the BL-38 checklist item; `[ ]` untouched | met (agentic) |
| upstream items recorded in OPEN FINDINGS + run ledger w/ proposed patch | LEDGER upstream bullet (a)(b)(c); § Evidence parser analysis + patch + rotation proposal | met (agentic) |
| universal phase gate: verification green; tests for new behaviour; REQ ids; deferrals for the unverifiable; ADRs for deviations; BUILD_INDEX + LEDGER advanced | `check-append-only.mjs --selftest` is the negative-fixture test; **no REQ ids** (build-memory hygiene; ADR-004 — stated in the PR body); nothing live-unverifiable (all $0 docs); deviations recorded under Owned decisions (no ADR needed — none departs ADR-004); BUILD_INDEX + LEDGER advance in the close commit | pending closeout |

**Residual gap found in pass 2 → handled:** the archive dir is the only place the removed LEDGER head
line-3 text and pruned bodies live — verified byte-for-byte. No other unverifiable claim; the two
"whose workspace" / `is_test` ambiguities in the inventory are recorded *as* ambiguities with the
read-only query that settles them at cleanup time (ticket allows: identifiers ambiguous → read-only
query may run — none was needed since the inventory documents the uncertainty explicitly instead).

## Verification (Phase 5)

| Check | Command | Result |
|---|---|---|
| tree validator | `check-build-memory.sh .` | **0 violations, 6 warnings** (all pre-existing; `.agents/scratch` orient warning resolved) |
| staged history | `check-build-memory.sh . --staged` | **0 violations** (27 record dates; 1,073 changed protected lines judged — implementation-commit index) |
| append-only vs base | `node docs/build/tools/check-append-only.mjs --base a2bf831ec58f1ce245bfed8a12376961bd9ed790` | **OK** — PHASE LOG + GATE DECISIONS prefixes intact, all DEFERRALS ids + cell text survive, Plan extensions only grew |
| append-only staged | `… --staged` | **OK** |
| negative fixtures | `… --selftest` | **SELFTEST OK** — deleted-row and edited-PHASE-LOG fixtures both flagged; clean fixture passes |
| backlog parser | `check-backlog.sh docs/build/BACKLOG.csv docs/build docs/tickets` | 6 issues (was 8 at base — both BL-49 `home-closed` resolved); remainder → REC.1; caveat in § Evidence |
| whitespace | `git diff --cached --check` | clean |
| archive verbatim | every moved base line `grep -qxF`-matched in the archive | all 11 moved regions match (incl. the line-3 head text) |
| section bytes | `wc -c` per `##` region | table in § Evidence; PHASE LOG + GATE DECISIONS byte-identical |

### `check-append-only.mjs` usage (for REC.1 / GATE-ACCEPT reuse)

```
node docs/build/tools/check-append-only.mjs --base <ref>            # working tree vs ref
node docs/build/tools/check-append-only.mjs --base <ref> --staged   # index vs ref
node docs/build/tools/check-append-only.mjs --selftest              # negative-fixture proof
```

Exit 0 clean, 1 violations, 2 usage. Asserts: LEDGER PHASE LOG + GATE DECISIONS base sections are
strict prefixes of head; every base DEFERRALS row id survives with every cell's original text (a
status flip may prepend a dated keyword); manifest § Plan extensions base lines survive in order.

## Closeout — 2026-10-01

- **PR:** [#84](https://github.com/SteveVitali/Rhema/pull/84) —
  `stevevitali/maint-2-build-memory-hygiene` → base `stevevitali/journey-1-browser-journey-acceptance`.
  Operator-held (`mergePolicy=OPERATOR`); not merged by the worker.
- **Commits:** `2d61a6f` (implementation: LEDGER/archive/manifest/DEFERRALS/headers/inventory/
  validator/policy), PR-body commit, then this closeout commit (BUILD_INDEX row 90, CURRENT STATE
  advance, PHASE LOG entry).
- **BUILD_INDEX:** row 90 appended.
- **Final state:** `nextTicket → RES.1` (row 63) · `chainTip → stevevitali/maint-2-build-memory-hygiene`
  · `lastCompleted: MAINT.2`.
- **Post-closeout verification** (index = closeout edits; vs HEAD `8c020ab` = impl + PR-body commits):

  | Check | Command | Result |
  |---|---|---|
  | build memory (tree) | `check-build-memory.sh .` | **0 violations, 6 warnings** — same pre-existing classes; ledger-budget now 45 oversized PHASE LOG entries (+1 = this closeout entry, same legacy class); `nextTicket` warning unchanged in kind (`RES.1` vs deferred `GATE-G2`) |
  | staged history | `check-build-memory.sh . --staged` | **0 violations** (3 record dates; 41 changed protected lines judged — closeout delta only) |
  | append-only vs base | `check-append-only.mjs --base a2bf831` | **OK** (tree + `--staged`) — PHASE LOG grew only by this entry |
  | negative fixtures | `… --selftest` | **SELFTEST OK** — 4 fixtures incl. appended-entry-must-pass (see fix below) |
  | backlog parser | `check-backlog.sh docs/build/BACKLOG.csv docs/build docs/tickets` | **6 issues** — unchanged (REC.1 scope) |
  | whitespace | `git diff --cached --check` | clean |

- **Validator fix during closeout:** appending the closeout PHASE LOG entry exposed a real bug —
  `split("\n")` yields a trailing `""` element on a newline-terminated file, so a legitimate append
  landed where the base's EOF artifact stood and the strict-prefix loop flagged it. Fixed by
  trimming trailing empty lines from the base section only (content lines still compare strictly);
  a fourth selftest fixture (appended entry must pass) guards the regression. Selftest: 4/4.
- **Operator-owned remainders:** H7's test-data cleanup (inventory rows + delete-risk are in the
  committed report — nothing was deleted); the six re-assessed P1 PARTIAL rows land on
  STB.5a/STB.5b/OPS.1/H7 as noted; REC.1 owns the residual `check-backlog` gaps (ADR-018…020 +
  D-P0.08b-3/D-P1.22-1/D-SEC.1-2 source rows) and the upstream parser fix proposal.

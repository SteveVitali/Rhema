# MAINT.2 — Build-memory hygiene: LEDGER cleanup, Plan-extensions backfill, stale deferral flips, prod test-data inventory

Docs-only change on the committed build memory (ADR-004). Makes `LEDGER.md`, `00_MANIFEST.md`,
`DEFERRALS.md` and two stale run-ledger headers tell the truth again so `orchestrate-build`, REC.1
and GATE-ACCEPT read a clean state. **No production writes, $0 spend.**

Ticket: `docs/tickets/62_MAINT.2__build-memory-hygiene.md` (chain row 62, round 3).
Base: `stevevitali/journey-1-browser-journey-acceptance` @ `a2bf831` (stacks on PR #83).

## What changed

- **`docs/build/LEDGER.md`** — OPEN FINDINGS collapsed: resolved entries are one-line
  `RESOLVED <date> → pointer` stubs, open entries tightened (G2 deferred, REQ coverage note, STB.3
  F8 SLOs, the 2026-09-30 review entry, a new upstream bullet). RETURN PASS emptied (P0.15j/k done;
  PRB.18's residual legs → JOURNEY.1 steps + H7/BL-32), `returnPass: (none)`. CURRENT STATE comments
  shortened; the stale `.agents/scratch` token retired. 220,841 → 212,244 B; GATE DECISIONS and
  PHASE LOG **byte-identical** (185,943 + 18,780 B).
- **`docs/build/reports/ledger-archive/2026-10-01_open-findings-return-pass.md`** — new dated archive;
  every moved body preserved verbatim (verified line-for-line).
- **`docs/tickets/00_MANIFEST.md`** — 17 dated lines appended to § Plan extensions covering every
  2026-09-22…09-26 insert (28k–28p, G3 early read, P1 bodies 29–50, CAPSTONE, RCN.1, STB.1–4, DEF.1–3),
  each with its BUILD_INDEX PR number and a `retro:` marker.
- **`docs/tickets/DEFERRALS.md`** — 9 rows flipped to `DONE (2026-10-01, MAINT.2 — evidence: …)`
  prepended before untouched text: D-P0.03-3, D-PRB.03-1, D-PRB.16-4 (the BL-49 pair), D-P0.15b-2/-3/-4,
  D-P0.15c-2/-3/-5. D-P0.15b-1 re-scoped PARTIAL → BL-25/OPS.1. Six P1 rows re-assessed with dated
  notes narrowing the residual + naming round-3 owners (all stay PARTIAL — not every leg is evidenced).
- **`docs/build/runs/DEF.2.md` / `DEF.3.md`** — dated correction notes under the stale gate-status
  bullets (headers intact).
- **`docs/build/reports/2026-10-01_prod-test-data-inventory.md`** — 12-row committed inventory for
  HUMAN-H7's cleanup item (ids + evidence + recommended action + delete-risk; no secrets). Dated
  pointer added to the H7 checklist; checkbox stays unticked.
- **`docs/build/tools/check-append-only.mjs`** — new committed validator (`--base <ref> [--staged]`,
  `--selftest`); reusable by REC.1/GATE-ACCEPT.
- **`docs/build/tools/record_policy/history.policy`** — new repo-local policy declaring the LEDGER's
  OPEN FINDINGS/RETURN PASS regions exempt from append-only (they're curated lists; prunes are
  archived, not deleted).

## Requirement ids

None — a process row (build-memory hygiene; ADR-004). Per the ticket: "no REQ ids".

## Verification

| Check | Result |
|---|---|
| `check-build-memory.sh .` | 0 violations, 6 warnings (all pre-existing; orient stale-token warning resolved) |
| `check-build-memory.sh . --staged` | 0 violations — 27 record dates, 1,073 protected lines judged |
| `check-append-only.mjs --base a2bf831` (tree + `--staged`) | OK — PHASE LOG/GATE DECISIONS prefixes intact; all DEFERRALS rows + cell text survive; Plan extensions only grew |
| `check-append-only.mjs --selftest` | OK — fails on a deleted DEFERRALS row and on an edited PHASE LOG line |
| `check-backlog.sh` | 6 issues (was 8 at base; both BL-49 home-closed resolved) — remainder is REC.1's backlog-ratification scope; parser caveat recorded in `runs/MAINT.2.md` |
| `git diff --check` | clean |
| LEDGER byte counts per section | recorded in `runs/MAINT.2.md` § Evidence (−8,597 B; PHASE LOG + GATE DECISIONS identical) |
| Archive verbatim check | every moved base line `grep -qxF`-matched in the archive file |

## Notes / limitations

- The six re-assessed P1 deferral rows stay PARTIAL by design — each still owes at least one live leg;
  the dated notes name the round-3 owner (STB.5a/5b, OPS.1, H7).
- The upstream `check-backlog.sh` parser gap + the PHASE LOG rotation proposal are recorded in OPEN
  FINDINGS and the run ledger; `~/agent-skills` is untouched.
- PR is operator-held (`mergePolicy: OPERATOR`); do not merge.
- Pre-existing warnings unchanged: 130 manifest rows outside round banners, `nextTicket` vs the
  deferred GATE-G2, 44 oversized legacy PHASE LOG entries, 18 legacy BUILD_INDEX status values,
  3 pre-guard readouts, 85 run ledgers without `Harness:` headers.

Run ledger: `docs/build/runs/MAINT.2.md` (plan, evidence, byte counts, self-review, gap analysis,
check-backlog output + parser caveat).

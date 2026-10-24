## Summary

R6CNT.1 — launch content prep (REQ-LCH-2; spec `docs/round-6-draft-spec.md` §4.2; manifest row 183).
Prepares the three launch-blocking content decisions under `GD-CONTENT.R6` ("Block: agent prepares")
and `GD-SHOWCASE.R6` ("Public-domain essay") so HUMAN-H11 only approves or picks. **Nothing is seeded
or signed off here** — this PR ships evidence + proposals; R6CNT.2 applies whatever H11 decides.

## What changed (docs only — no product code)

- `docs/build/reports/2026-10-21_R6CNT.1/h4-venue-evidence.md` — H4: every seeded venue row checked
  against its live venue page (URL + verbatim cap + proposed `verified_at`). **PLOS ONE ≤300 matches
  verbatim**; the six op-ed outlet rows are **flagged as drifted** (live: NYT 800–1,200 typical,
  WaPo ≤800, WSJ 400–1,000, LAT 750–1,000, USA Today 550–750, Globe ~800 target); Memo silent-read
  is shape-only. 3 outlets' own pages fetched directly; 3 fetch-blocked (403/402) — quoted via each
  outlet's own-page text from search index and flagged, never silently fixed.
- `docs/build/reports/2026-10-21_R6CNT.1/h5-showcase-shortlist.md` — H5: five public-domain Essay
  candidates with measured word counts on fetched Gutenberg texts: **Wells "The Extinction of Man"
  ≈1,640w (recommended)** · Poe "The Imp of the Perverse" ≈2,400w · Lamb "A Dissertation Upon Roast
  Pig" ≈2,700w · Swift "A Modest Proposal" ≈3,431w (flagged over) · Twain "Fenimore Cooper's
  Literary Offenses" ≈4,800w (flagged over). Each cites its dual-jurisdiction PD basis and ≥1
  candidate contradicted Tier-1 claim with fetched modern-source URLs (e.g. Wells's six-foot
  Paradoxides → largest trilobite specimen is 72cm; "swept away… bison" → NPS: recovered, national
  mammal 2016).
- `docs/build/reports/2026-10-21_R6CNT.1/sample-dossier-proposal.md` — REQ-POS-3-shaped
  `SampleDossier` draft on the recommended pick (real deep URLs replace today's homepage-level
  fetches), contingent on H11's essay choice.
- `docs/build/runs/R6CNT.1.md` — run ledger. `docs/tickets/DEFERRALS.md` — dated notes appended to
  D-P1.21-1 / D-P1.17-1 / D-PRB.01-2 (all stay OPEN — H11 decides, R6CNT.2 applies).

## Verification

`pnpm turbo build lint typecheck` — 135/135 · `pnpm test` — 508 files, **5,978 pass / 0 fail** · all
six `check:*` green · `check-build-memory.sh` 0 violations · `check-append-only.mjs --base f2226f6` OK.
$0 spent; fetch-only public web research; no production mutations; no secrets.

## Acceptance criteria → evidence

| AC | verdict | evidence |
|---|---|---|
| Every venue row has evidence or a flagged mismatch | met | `h4-venue-evidence.md` — 8/8 rows carry URL + quoted cap; 1 match / 6 flagged / 1 shape-only; proposed `verified_at: 2026-10-21` on the matching row |
| Each shortlisted essay: PD basis + ≥1 contradicted Tier-1 claim w/ URL | met | `h5-showcase-shortlist.md` — 5 candidates × (PD basis + claim + fetched URL) |
| Universal phase-gate | met | this table + ledger `Gap table`/`Evidence log`; REQ-LCH-2 stamped |

Requirement ids: **REQ-LCH-2**.

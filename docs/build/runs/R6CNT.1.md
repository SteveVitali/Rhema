# Run ledger — R6CNT.1 (launch content prep: H4 venue evidence, PD Showcase shortlist, sample dossier; REQ-LCH-2)

- **Spec:** `docs/tickets/183_R6CNT.1__launch-content-prep.md` (manifest row 183; spec `docs/round-6-draft-spec.md` §4.2 REQ-LCH-2)
- **Base:** `f2226f6` (stevevitali/r6for-2-rls-exposure-forensics)
- **Branch:** `stevevitali/r6cnt-1-launch-content-prep` · PR base: `stevevitali/r6for-2-rls-exposure-forensics` (OPERATOR merge policy)
- **Config:** full rigor — ledger, self-review, gap-analysis, tests (docs-only; existing suites must pass), live verification = fetch-only public web research, evidence report
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** e981ec5
- **Started:** 2026-10-21T19:36Z
- **Closed:** 2026-10-21T20:10Z

## Deferrals read

- `D-P1.21-1` OPEN — H4 venue-table verification (real `verified_at` seed). This ticket supplies the research; the seed change + operator sign-off are REQ-LCH-4 / HUMAN-R6H2. Row stays OPEN.
- `D-P1.17-1` OPEN — H5 real Showcase essay seed (GD-SHOWCASE.R6: public-domain essay, agent shortlists, operator picks). This ticket supplies the shortlist; R6CNT.2 owns the seed build. Row stays OPEN.
- `D-PRB.01-2` OPEN — operator content sign-off for `SAMPLE_DOSSIER` (HUMAN H3). This ticket proposes the content set; operator signs off in R6H2. Row stays OPEN.
- `D-R6FOR.1-1` OPEN — ADR-119 implementation. NOT this ticket's scope; untouched.
- Gate decisions: `GD-CONTENT.R6` ("Block: agent prepares"), `GD-SHOWCASE.R6` ("Public-domain essay").

## Requirements

- REQ-LCH-2(a): every seeded venue/outlet row → live page URL + quoted cap + proposed `verified_at`; diffs flagged, never silently fixed. Rows: PLOS ONE abstract ≤300; Op-ed outlet table NYT 400–1200 / WaPo ≤750 / WSJ 600–1200 / LAT ~750 / USA Today 650–900 / Globe ≤700; Memo silent-read row shape (no cap to verify — shape only).
- REQ-LCH-2(b): 3–5 public-domain essays (~2,000 words, Essay protocol); each: PD basis (death date or pub date + jurisdiction), candidate contradicted Tier-1 claims + modern source URLs.
- REQ-LCH-2(c): proposed sample-dossier content set (REQ-POS-3 shape).
- Deliverables committed under `docs/build/reports/2026-10-21_R6CNT.1/` for HUMAN-H11.
- Constraints: $0; offline + fetch-only; no production mutations; no seeding (R6CNT.2); ~300 changed-line budget; truthfulness invariant 9; secrets never.

## Acceptance criteria

- [ ] Every venue row has evidence or a flagged mismatch (deterministic)
- [ ] Each shortlisted essay: PD basis + ≥1 candidate contradicted Tier-1 claim with source URL (deterministic)
- [ ] Universal phase-gate AC (green verify, REQ ids stamped, DEFERRALS notes dated, BUILD_INDEX+LEDGER, clock dates, CI read, no living-record pins, protected records appended-only, gate words verbatim, harness recorded)

## Plan

1. Fetch each venue's live guideline page; record quoted cap verbatim + URL + propose `verified_at: 2026-10-21` where live value matches; flag mismatches/unfetchable.
2. Fetch candidate essay texts (Gutenberg/Wikisource) → measure word counts, extract candidate Tier-1 claims; fetch modern sources contradicting those claims.
3. Draft sample-dossier content set in REQ-POS-3 shape (`SampleDossier` interface: title/slug/letter/claims/findings).
4. Write `docs/build/reports/2026-10-21_R6CNT.1/` (H4 evidence, H5 shortlist, dossier proposal).
5. Verify → self-review → gap table → closeout (PR body, CI boundary, BUILD_INDEX, LEDGER, DEFERRALS notes).

## Test matrix

Docs-only deliverable — no new runtime behavior. Invariants asserted by existing suites (`protocols.test.ts` venue-row shape, `sample-dossier.test.ts` REQ-POS-3 shape, `assertShowcaseFixture`) remain unchanged; every report claim carries a fetched-URL evidence cell.

## Progress

- Branch `stevevitali/r6cnt-1-launch-content-prep` cut at `f2226f6`; DEFERRALS/GD-CONTENT.R6/GD-SHOWCASE.R6/anchors re-confirmed.
- Venue rows inventoried: `packages/protocols/src/protocols.ts` — Academic table: PLOS ONE `abstractMaxWords:300` (`as_of`); Op-ed table: 6 outlet rows (`as_of`); Memo `silent-read` (no cap row — shape verification only); Essay `venue_bar.table` empty (own-archive kind).
- H4 research done: PLOS ONE matches verbatim; 6 outlet rows drifted from live guidance (NYT 800–1,200 / WaPo ≤800 / WSJ 400–1,000 / LAT 750–1,000 / USAToday 550–750 / Globe ~800); 3 fetch blocks (403/402) — evidence via each outlet's own-page text in search-index quotes, flagged not guessed.
- H5 research done: 5 candidates, all dual-jurisdiction PD (pre-1930 pub + author dead >70yr); word counts measured on fetched Gutenberg texts; each carries ≥1 contradicted Tier-1 claim w/ fetched source URL(s).
- Dossier proposal drafted in `SampleDossier` shape for the recommended pick (Wells), contingent on H11's essay choice.

## Gap table

| item (spec §) | required layer | achieved layer | status | evidence | if not met |
|---|---|---|---|---|---|
| REQ-LCH-2a venue rows → URL + quoted cap + verified_at | engineered | engineered | met | `reports/2026-10-21_R6CNT.1/h4-venue-evidence.md` — all 8 rows carry URL + quoted cap; verified_at proposed `2026-10-21` | — |
| REQ-LCH-2a flagged mismatches (never silent fix) | engineered | engineered | met | 6 rows FLAGGED, no seed touched (diff tree is reports+ledger only) | — |
| REQ-LCH-2b 3–5 PD essays w/ basis + contradicted Tier-1 + URLs | engineered | engineered | met | `h5-showcase-shortlist.md` — 5 candidates w/ PD basis, word counts, ≥1 contradicted claim + URL each | — |
| REQ-LCH-2c sample-dossier content set (REQ-POS-3 shape) | engineered | engineered | met | `sample-dossier-proposal.md` — `SampleDossier`-shaped draft, REQ-POS-3 contradicted Tier-1 + fetched URLs | — |
| Deliverables under `reports/2026-10-21_R6CNT.1/` | engineered | engineered | met | 3 files committed | — |
| AC1 venue evidence/flagged per row | deterministic | engineered (fetch-verified, no code) | met-engineered (row stays OPEN for H11 sign-off + R6CNT.2 application — posture unchanged) | h4-venue-evidence.md table | — |
| AC2 essay PD basis + ≥1 contradicted claim w/ URL | deterministic | engineered | met | h5-showcase-shortlist.md per-candidate rows | — |
| universal phase-gate AC | agentic | — | pending closeout | verify + CI + ledger advance below | — |

## Evidence log

- PLOS ONE submission guidelines fetched 2026-10-21: Abstract section — "Not exceed 300 words" (matches seed 300 verbatim).
- NYT help-center guest-essays page fetched: "a word count typically from 800 to 1,200 words" (seed 400–1,200 → flag).
- LAT op-ed page fetched: "Most published articles are about 750 to 1,000 words in length." (seed ~750 → flag).
- Globe "Meet Globe Opinion" (apps.bostonglobe.com) fetched: "About 800 words is a good target length." (seed ≤700 → flag; older Globe pages still say 700 — conflict recorded).
- WaPo/WSJ/USAToday own pages: 403/402 to fetcher; quoted caps from each outlet's own page text via search index (800 / 400–1,000 / 550–750) — flagged, never silently trusted.
- Essay texts fetched from Project Gutenberg (#17508 Wells, #2148 Poe, #10343 Lamb, #1080 Swift, #3172 Twain); body word counts measured: 1,640 / 2,397 / ~2,700 / 3,431 / ~4,800.
- Contradiction sources fetched live: NPS bison page; Wikipedia Isotelus + Paradoxides (72cm/37cm); BMC Psychiatry Teismann 2020 (open access, quotes Hames 2012 misinterpreted-safety-signal); CMU Encyclopedia of the History of Science phrenology ("pseudoscience", 1840s elite abandonment); History Ireland (1731 official count 2,010,000; Connell 2.79M 1712; Dickson 2–2.3M); OUP DOI resolved (Murray 2020 — Lamb's "Chinese manuscript" germ traced to Porphyry). Fetch-gated: jfcoopersociety.org (anti-robot), cambridge.org abstract, pubmed — recorded as gated, corroborated by fetched secondary pages.

## Evidence report

- **PR:** https://github.com/SteveVitali/Rhema/pull/204 (head `5c2c1eb`)
- **Deliverables:** `reports/2026-10-21_R6CNT.1/` — h4-venue-evidence.md (8/8 rows: URL + quoted cap + proposed `verified_at`; 1 verbatim match, 6 flagged drifted, 1 shape-only) · h5-showcase-shortlist.md (5 PD candidates, PD basis + measured word counts + contradicted Tier-1 claims w/ fetched URLs; Wells recommended, Swift/Twain length-flagged) · sample-dossier-proposal.md (REQ-POS-3 `SampleDossier` shape; real deep URLs).
- **Verification:** `pnpm turbo build lint typecheck` 135/135 · `pnpm test` 508 files / **5,978 pass / 0 fail / 4 skipped** · six `check:*` green · ci-boundary: **pass #204@5c2c1eb** (run 39666869828, all seven legs + ci-pass anchor; `logs/ci-R6CNT.1.json`).
- **Deviations:** size ~300 → +326/−3 (docs-only: reports 198, run ledger 79, PR body 44, DEFERRALS notes 5) — recorded honestly; 4 source URLs fetch-gated for this fetcher (wsj.com, washingtonpost.com helpcenter, usatoday.com, jfcoopersociety.org, cambridge.org, pubmed/europepmc) — recorded inline on each row and corroborated via fetched secondary pages or each outlet's own-page text in the search index; nothing unverifiable was asserted.
- **Deferrals:** none opened/closed; dated notes appended to D-P1.21-1 / D-P1.17-1 / D-PRB.01-2 — posture unchanged, HUMAN-H11 decides.
- **$ spend: $0.** Fetch-only research; zero prod mutations; nothing seeded; no secrets written.
- **ci:** `ci: pass #204@5c2c1eb (ci-pass anchor 39666869828; integration; images; contracts; public-safe; typecheck/lint/unit; fast-path)`

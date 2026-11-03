# R7DEM.3b — Snapshot projector: dossier, run report, timeline, replayed runs (S-9), figure image DTO (S-7), card facts and counts

- **Sequence:** 218a of 254 · **Phase:** round 7 (R7a) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:**
  - 218_R7DEM.3: the projector core, per-essay index, regeneration command and the contract/drift
    harness this ticket registers its kinds into.
  - 213_R7COPY.0: the pure record-composed run-card composer (REQ-COPY-4) and the single
    REQ-SYNC-2 count rule, both **called** on snapshot data here, never re-implemented.
- **Run:** `implement-spec spec=docs/tickets/218a_R7DEM.3b__projector-runs-figures-counts.md`
- **Gate status:** none (synthetic fixture only; REQ-CORPUS-14)
- **Live stage:** Stage A only ($0; offline). No owned preview (`GD-PREVIEW.R7`); this ticket has no
  Stage-B AC.
- **Production mutations:** none
- **Size budget:** ~450 changed lines excl. fixtures and generated snapshots (Phase-4 Split
  decision 2).

## Goal
Project the **run and record side** of each essay into DTO snapshots: the dossier, the run report,
the timeline, replayed runs that show only what the delivered files and PROVENANCE support (and
leave everything else "not recorded"), imported figures as images with no fabricated provenance,
and the hub-card facts and counts. This ticket is the **sole owner** of card facts and counts
(P4-6): one pure function, built on 213's count rule, emits structured numbers that 221a renders
and asserts equal; no other ticket re-derives them.

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md` §3.1 `GD-DEMO-RUNS.R7`, `GD-DEMO-ROLES.R7`; §3.2 ADR-126; §3.3 S-6,
  S-7, S-9, S-10, S-13; §4.1 REQ-CORPUS-7; §4.3 REQ-DWEB-15; §4.4 REQ-TOUR-1 (card fields and the
  counts example); §4.14 REQ-SYNC-2; §8.
- `R3-serving-and-demo-mode.md` §1 (the dossier/run/timeline/figure rows of the DataSource method
  table).
- `R2-converter-feasibility.md` §7 R2 ("not recorded", never "not fetched").
- `REVIEW-round-7-draft-spec.md` RV-8, RV-29 (counts snapshot-derived; status-bar word count),
  RV-30 (card counting rule; retitle).
- Anchors (re-confirm at build time): `packages/api-client/src/index.ts` — `DossierDto`,
  `TimelineDto`, `RunReportDto`, `FigureVersionDto`, `FigureCardDto`, `FigureProvenanceDto`;
  `apps/web/src/data.ts` (`DossierData = DossierViewData`); `apps/web/src/dossier-view.tsx`
  (`DossierViewData` — the dossier twin shape, which lives in the app, not a package);
  `packages/findings-core/src/run-card.ts` (`RunCardInput`), `run-report.ts` (`RunReportView` —
  numeric money fields); `packages/editor/src/meters.ts` (`statusMeters` — the one word-count rule
  the status bar uses); 213's composer and count-rule exports; the 214 PROVENANCE facts schema and
  version metadata; 218's harness registration seam and index schema.

## In scope — deliverables
1. **Dossier, timeline and run-report projectors** in `packages/demo-corpus/src/project/*` (pure),
   one snapshot per R3 §1 key, added to 218's per-essay index and chunked one file per artifact.
   *(REQ-CORPUS-7 timeline projection)*
2. **Replayed runs** (REQ-DWEB-15, S-9): a run per reviewed round, badged "Replayed from the
   agent-discourse record".
   - Phases are present iff their artifact exists (the S-9 mapping), each labelled "inferred from
     the delivered files".
   - A gate or approval appears only from a PROVENANCE fact; otherwise "approvals not recorded".
   - Time, credits and model are "not recorded".
   - The snapshot carries the delivered-record facts (artifact list, phase set) and the "What it
     delivered" block produced by **calling** 213's pure record-composed run-card composer
     (REQ-COPY-4).
3. **No fabricated numbers.** Wherever a DTO field is a number this record does not hold (e.g.
   `RunReportView` credits), the snapshot uses a replay variant that omits the field and marks it
   not recorded, rather than serializing `0`. The variant is additive to `@rhema/api-client`: no
   existing field's type is narrowed or changed. *(spec §8.2; REQ-DWEB-15)*
4. **Figure image DTO variant** (S-7, RV-8): an additive read-only variant for imported images —
   `specKind:"image"`, provenance "imported", `versions` = v1 and v2 when regenerated, the asset
   reference resolving to the REQ-DWEB-17 route shape. No vega/mermaid spec, run provenance or
   generated SVG is invented. Draft image links resolve to the same route shape. The card render is
   220a_R7DEM.4b's (P4-21).
5. **Card facts and counts — sole owner** (REQ-TOUR-1 data, REQ-SYNC-2 demo half; P4-6). One pure
   exported function `demoCardFacts(snapshot)` derives each essay's card facts:
   - title/subtitle and the retitle note from version metadata; publish date;
   - body word count via `statusMeters` on the Published markdown, so the card equals the status
     bar;
   - arc steps;
   - counts by category (e.g. "6 major · 12 minor · 6 strengths · 27 claims checked"). Finding and
     claim counts **call** 213's single REQ-SYNC-2 count rule; this ticket owns only the demo-card
     bucket selection on top of it (the one thing restates a major and is not counted twice).
   - It emits **structured numbers** (no formatted strings) into a card-facts snapshot. 221a
     renders them and asserts equality against this function; it never recomputes.
6. **Import-rule labels and "not published" markers** carried into every DTO field this ticket
   emits that displays a converter-assigned value or references an excluded file (REQ-CONV-14,
   REQ-CORPUS-4 data half). Role vocabulary follows S-10.
7. **Harness registration**: each new kind registered into 218's contract/drift harness —
   compile-time `satisfies`, runtime structural validator, drift test. The dossier snapshot is
   checked against `DossierViewData` by a colocated test in `apps/web`, because a package may not
   import from an app.
8. **Synthetic snapshots** for these kinds, committed beside 218's, produced by 218's regeneration
   command (extended, not forked).

## Out of scope
- Editor docs, versions, diffs, what-changed, files tree, artifact pages, chunking and the harness
  core: 218_R7DEM.3.
- The record-composed run-card composer and the REQ-SYNC-2 count rule themselves: 213_R7COPY.0
  (called here, not modified).
- Rendering replay badges, "not recorded", import-rule labels and "not published" non-links:
  221_R7DEM.5. Rendering the hub cards: 221a_R7DEM.5b. Rendering the imported-figure card and the
  asset route: 220a_R7DEM.4b / 220_R7DEM.4.
- Real snapshots: 219_R7DATA.1.

## Acceptance criteria
- [ ] Every dossier/run-report/timeline/figure snapshot-backed method in R3 §1 has a synthetic
      snapshot per key; a missing key is a projector error *(deterministic · layer:
      fixture-verified)*
- [ ] Contract harness: every kind this ticket adds passes compile-time `satisfies` and runtime
      structural validation; the `apps/web` dossier test passes against `DossierViewData`
      *(deterministic · layer: fixture-verified)*
- [ ] Replay: phases equal exactly the set implied by the fixture's delivered files; a fixture
      round with no PROVENANCE approval fact yields "approvals not recorded"; time/credits/model
      are absent-and-marked, never numeric; "What it delivered" equals 213's composer output on
      the same record *(deterministic · layer: fixture-verified)*
- [ ] Figure variant: the fixture image projects with `specKind:"image"` and imported provenance
      and no spec/SVG; existing figure consumers still typecheck unchanged *(deterministic ·
      layer: fixture-verified)*
- [ ] Counts: card word count equals `statusMeters` on the same markdown; finding/claim counts
      equal 213's count rule on the same record (a test fails if the projector counts
      independently); the one thing is not double-counted; `demoCardFacts` is the only exported
      card-count function in the repo (a grep test) *(deterministic · layer: fixture-verified)*
- [ ] Generated labels pass `lintCopy`; no "author" for an agent *(deterministic · layer:
      fixture-verified)*
- [ ] Drift test: re-projection is byte-identical to the committed synthetic snapshots
      *(deterministic · layer: fixture-verified)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-DWEB-15, REQ-CORPUS-7 (timeline projection), REQ-TOUR-1 (card data and counts only; rendering
is 221a), REQ-SYNC-2 (snapshot-derived counts, the demo half). It contributes to REQ-CORPUS-4
(marker data, run side) and REQ-CONV-14 (label carriage, run side).

## Cross-cutting invariants
- Manifest § Cross-cutting invariants 1, 7 and 14 (no fabricated money or time figure), 6 (the
  record is never embellished), 12 (no client bundle carries snapshot data), 17 (context budget),
  18 (demo isolation: build-time snapshots, no API/DB read; no real-corpus byte), 19 (truthful
  demo: no invented time/money/model; import-rule labels; S-10 roles).
- Spec §8.1, §8.2 (no number not in the record), §8.3, §8.5, §8.7.

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`; the gap table has one row per clause.

## Notes
- **Owns** (recorded as dated notes under ADR-126): the replay variant shape for run report and
  run card; the imported-figure DTO variant; **card facts and counts** (`demoCardFacts` and the
  demo-card bucket selection over 213's count rule) — the single owner per P4-6. Each additive DTO
  change is listed in the PR with its consumer ticket.
- **Consumes:** 218's harness, index and regeneration command (owner 218); 214 PROVENANCE facts and
  version metadata (owner 214); 213's run-card composer and count rule (owner 213). If 213 has not
  merged on the stack when this ticket runs, PAUSE rather than write a stand-in rule.
- **Consumers:** 219_R7DATA.1 (real snapshots through the same command), 220_R7DEM.4 (serves the
  snapshots), 220a_R7DEM.4b (figure image card, P4-21), 221_R7DEM.5 (replay/label rendering),
  221a_R7DEM.5b (card render + equality assertion), 222_R7DEM.6a (tour counts).
- **Imported-figure card.** P4-21 resolved: 220a_R7DEM.4b renders it (recorded in the manifest
  § Decomposition decisions); 242 preserves the `specKind:"image"` variant in R7b.
- **No preview.** `GD-PREVIEW.R7`: this row has no B-evidence REQ and opens no staging D-row.
- **DEFERRALS:** none expected. If a DTO cannot represent "not recorded" without a non-additive
  change, open a D-row and PAUSE for a ruling rather than serializing a placeholder number.

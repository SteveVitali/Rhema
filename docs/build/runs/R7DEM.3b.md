# Run ledger — R7DEM.3b (row 218a)

- **Spec:** `docs/tickets/218a_R7DEM.3b__projector-runs-figures-counts.md`
- **Base:** `stevevitali/r7dem-3-snapshot` @ `4ac1d13` · **Branch:** `stevevitali/r7dem-3b-runs`
- **Config:** implement-spec full rigor; Stage A only ($0, offline, synthetic fixture); no preview/Stage-B
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** local checkout `~/agent-skills`
- **Started:** 2026-11-04T03:58Z

## Deferrals read

`docs/tickets/DEFERRALS.md` read in full. OPEN rows touching R7 (D-R7RO.1-1, D-R7FIX.1-1,
D-R7COPY.0-1/-2, D-R7DEM.2c-1) are all gated on 224_R7DEP.1's preview/Stage-B legs or owned by
253_R7REC.1 — none unblocked by this Stage-A synthetic projector ticket. None closed; none opened
expected (ticket: "If a DTO cannot represent 'not recorded' without a non-additive change, open a
D-row and PAUSE" — the additive variant route exists, so no pause).

## Requirements (from ticket Goal + In-scope)

1. Dossier/timeline/run-report projectors in `packages/demo-corpus/src/project/*` (pure), one
   snapshot per R3 §1 key, added to the per-essay index, one file per artifact.
2. Replayed runs (REQ-DWEB-15, S-9): one per reviewed round; phases iff artifact exists, labelled
   "inferred from the delivered files"; approvals only from PROVENANCE facts else "approvals not
   recorded"; time/credits/model "not recorded"; "What it delivered" via 213's composer.
3. No fabricated numbers — replay variant omits numeric fields and marks them not recorded;
   additive to `@rhema/api-client` only.
4. Figure image DTO variant (S-7): `specKind:"image"`, provenance "imported", versions v1 (+v2 when
   regenerated), assetUri in REQ-DWEB-17 route shape; draft image links resolve the same shape.
5. `demoCardFacts` — sole owner of card facts/counts: title/subtitle/retitle note, publish date,
   `statusMeters` word count on Published markdown, arc steps, counts via 213's count rule +
   demo-card buckets; structured numbers only.
6. Import-rule labels + "not published"/"not recorded" markers on every DTO field emitted (S-10).
7. Harness registration: `satisfies` + runtime validators + drift test; dossier checked against
   `DossierViewData` by a colocated `apps/web` test.
8. Synthetic snapshots committed; produced by 218's regeneration command (extended).

## Acceptance criteria

(from ticket — verbatim in PR body; all `deterministic · fixture-verified`)

## Plan

- `packages/findings-core`: new `replayed.ts` — `ReplayedRunCardView`, `ReplayedRunSummaryView`,
  `ReplayedRunReportView`, `ReplayedReportPhase`, `ReplayedApprovalFact`, `ReplayedNotRecorded`.
- `packages/api-client`: `DemoMarkersDto.notRecorded?`, `DemoDossierDto`, `DemoTimelineDto` +
  `ReplayedTimelineRunDto`/`DemoTimelineRoundDto`, `DemoRunReportDto`, `FigureImageCardDto`,
  `DemoCardFactsDto`, `DemoArcStepDto`. All additive.
- `packages/demo-corpus/src/project/`: `replay.ts` (run/dossier/report/timeline/figure/card
  projectors + `demoCardFacts` + run-kind validators/registration), `project.ts` (emit new
  chunks; `facts` input), `model.ts` (additive kinds/DTO map/envelope bytes), `harness` reuse.
- `tools/demo-corpus/project.mjs`: read `<corpus>/_rules/facts.json`, pass slug facts.
- `apps/web/src/demo-dossier-snapshot.test.ts`: committed dossier snapshot ↔ `DossierViewData`.
- Snapshots regenerated via `RHEMA_REGEN_SNAPSHOTS=1` + `project.mjs`; `_rules` allowlist updated.
- ADR-126 dated note records the owned decisions (replay variant, figure variant, card buckets).

## Test matrix

- emitted chunk set incl. dossier/run-report/timeline/card-facts/figures; missing key → error.
- `satisfies` compile-time + per-kind validators + drift byte-equality.
- replay: phases == delivered-file set exactly (v1: 7 phases; v2: 2); no-fact round → "approvals
  not recorded"; no numeric time/credits/model anywhere; delivered == composer output.
- figure: `specKind:"image"`, provenance imported, no spec/svg; draft `figures/` links → asset route.
- counts: card words == `statusMeters(published)`; findings/claims == `deliveredRecordCounts` on the
  same record; one_thing counted once; `demoCardFacts` sole exported card-count fn (grep test).
- labels pass `lintCopy`; no "author" for an agent.
- dossier snapshot satisfies `DossierViewData` shared-field projection (apps/web test).

## Progress · ## Gap table · ## Evidence log · ## Evidence report

_(filled at phase transitions)_

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

## Progress

- Phase 0–2: ticket/Load docs/DEFERRALS read; AC–test matrix above; branch forked at chain tip.
- Phase 3 (implementation): `findings-core/replayed.ts`, api-client additive DTOs,
  `project/replay.ts` + `project.ts`/`model.ts`/`dtos.ts`/`index.ts` wiring, `project.mjs`
  facts feed, `replay.test.ts` + `project.test.ts` extensions, `apps/web` dossier test,
  committed snapshots regenerated, COVERAGE.md + ADR-126 dated note.
- Phase 4 (verify): turbo build/lint/typecheck 138/138 · `pnpm test` 6,515 pass/6 skip/0 fail
  · pkg vitest 236/236 · web dossier test 3/3 · `check:demo-corpus` 0 viol · append-only OK.
- Phase 5 (records): run ledger, PR body, ADR-126 note; commit `2d00c83`; PR #251 created
  (base `stevevitali/r7dem-3-snapshot`); push; BUILD_INDEX row 252 + LEDGER (closeout commit).
- Phase 6 (close): CI read at pushed head via `ci-boundary` → `logs/ci-R7DEM.3b.json`.

## Gap table

| Requirement | Where met | Proof |
|---|---|---|
| Projectors per R3 §1 key, pure, one file per artifact | `replay.ts` + `project.ts` | `replay.test.ts` emitted-set leg |
| Replayed run per reviewed round, badge data | `replayedRunCard` (`replayed:true`,`recordSource`) | replay.test replayed-run legs |
| Phases iff artifact exists + inferred label | `inferRun` S-9 map, `phaseSource` | phase-set legs (v1 7, v2 2) |
| Approvals only from PROVENANCE else not recorded | `approvalsFor` | no-fact leg |
| No numeric time/credits/model | variant omits fields; validator rejects forgery | forged-field leg |
| Delivered == composer output | `composeDeliveredSummary` call | equality leg |
| Figure image DTO S-7 + asset route + draft links | `figureImages`, `demo.assetRefs` | figure legs + closed-world leg |
| `demoCardFacts` sole owner; words==statusMeters; counts==count rule | `demoCardFacts` | parity/equality/grep legs |
| Registration seam | `registerRunKinds` | harness leg + unregistered-kind pin |
| Dossier ↔ `DossierViewData` | colocated apps/web test | `demo-dossier-snapshot.test.ts` |
| Committed snapshots + drift | regenerated tree | byte-identical legs (both test files) |
| lintCopy / no "author" | labels leg | `lintCopy` assertion |

## Evidence log

- Commit `2d00c83` — 28 files: replay.ts/test, findings-core/replayed.ts, api-client DTOs,
  project wiring, snapshots (dossier/run-report/timeline/card-facts/figures + drafts/index),
  apps/web dossier test, ADR-126 note, COVERAGE.md, run ledger, PR body.
- Local verify numbers above; zero production mutations; $0.

## Evidence report

CI at head `152ddb0` read **fail** on `public-safe`: gitleaks `generic-api-key` false-positive on
`SnapshotFile` `key` fields (`figure_1_signal_map`, `v3-published`) in the generated snapshots
dir. Fix `ee79bae`: dated path allowlist in `.gitleaks.toml` (same class as `docs/` — generated
corpus-derived data; the corpus gate is `check:demo-corpus`). Local re-verify: `gitleaks dir`
on the snapshots tree clean; `check:no-cookies`/`check:protocol-markers`/`check:licenses` all OK.
Head read on `ee79bae`: **pass #251** (run 41775621123 — fast-path 39 s, typecheck/lint/unit
22 m 8 s, contracts 20 s, public-safe 30 s, integration 2 m 28 s, images, all legs + `ci-pass`
anchor; `logs/ci-R7DEM.3b.json`). Deferrals: none opened, none closed. Unmerged (OPERATOR).

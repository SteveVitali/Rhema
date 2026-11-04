# R7DEM.3b — Snapshot projector: dossier, run report, timeline, replayed runs (S-9), figure image DTO (S-7), card facts and counts

- **Ticket:** `docs/tickets/218a_R7DEM.3b__projector-runs-figures-counts.md` (manifest row 218a)
- **Base:** `stevevitali/r7dem-3-snapshot` @ `4ac1d13` · **Branch:** `stevevitali/r7dem-3b-runs`
- **ADR:** ADR-126 dated note 2026-11-04 records every owned variant/derivation decision.
- **Stage A only** — synthetic fixture, $0, offline, deterministic. No preview, no Stage-B
  criterion, no production mutation, no real corpus bytes (REQ-CORPUS-14/HUMAN-H14).

## What this does

Extends 218's pure projector with the run/record side of the snapshot set:

- **Replayed runs (S-9; REQ-DWEB-15).** One replayed run per reviewed round
  (`v1-review`, `v2-review`), `replayed:true` + `recordSource:"agent-discourse"` (the badge's
  data). Phases are inferred iff the mapped artifact exists — v1 carries all seven
  (`intake/verification/discourse/argument/craft/second_read/letter`), v2 carries
  `verification`+`letter` — each labelled via `phaseSource:"inferred_from_delivered_files"`.
  Approvals carry only verbatim `_rules/facts.json` `approvals` facts, else `"not_recorded"`.
  The replayed card/report **omit** every numeric the record does not hold (time, credits,
  model, estimate, usage) and name them in `notRecorded` — a forged zero is unrepresentable
  and rejected by the kind's validator (spec §8.2).
- **Dossier** (`dossier/<round>.json`): the delivered record verbatim — letter sections,
  findings (`buildFindingView`), claims with the recorded ledger ids (`C7b`, `III16`-style —
  S-6 deep-link vocabulary), rubric, `priorRubric` on the re-review, `findingObligations` from
  the response ledger. `rigor`/`accessReport`/`fetchLog` stay absent/`[]` and are named in
  `demo.notRecorded` — never "not fetched". Checked against `DossierViewData` by the colocated
  `apps/web/src/demo-dossier-snapshot.test.ts` (a package may not import from an app).
- **Run report** (`run-report/<round>.json`): `kind:"ok"` + the replayed report — inferred
  phases, the ledger's own `{checked, verified}` claim counts, every money/usage figure
  omitted.
- **Timeline** (`timeline.json`): rounds per reviewed version (newest first), `producedN`
  derived honestly (v1 round → v2; the v2 round produced none — v3 is writer-directed),
  `originChip` from v1's `drafted_from_outline`, `nextStep` `none` with `estimateCredits:null`.
- **Figure image DTO** (S-7): one card per `index.json` image artifact —
  `specKind:"image"`, `provenance:"imported"`, `assetUri` in the REQ-DWEB-17 route shape
  (`/bff/demo/asset/:essay/:file`, corpus-relative `:file`). No spec/SVG/run provenance field
  exists on the variant. Draft `demo.assetRefs` resolve every inline `figures/` link to the
  same route — an unresolvable link fails projection closed.
- **`demoCardFacts` — sole card-count owner (P4-6; REQ-TOUR-1).** Structured numbers only:
  title/subtitle/retitle (from version metadata), publish stamp + verbatim label + URL,
  `statusMeters` on Published markdown (status-bar parity, asserted), the arc steps, and
  counts — `deliveredRecordCounts` called on the same record (never re-implemented), with the
  declared demo-card bucket split (major+one_thing letter slots → majors; the one thing counted
  once; roadmap/considered_rejected → minors; unfiled → severity fallback).

`composeDeliveredSummary` + `deliveredRecordCounts` (213's REQ-SYNC-2 rule) are **called** on
snapshot data at every projection site — a test recomputes both from the same facts and
asserts equality, so independent counting fails loudly.

## Harness

`registerRunKinds()` plugs `dossier`/`run-report`/`timeline`/`card-facts`/`figure-image` into
218's `registerSnapshotKind` seam with per-kind structural validators that also assert the
omitted-numerics rule (`spentCredits` etc. must not be serializable). `KindDtoMap`,
`RUN_SNAPSHOT_KINDS`, `ENVELOPE_BYTES`, and `EssayIndex.chunks` extend additively; an
unregistered kind stays a validation failure (existing pin).

## Committed snapshots

`snapshots/the-borrowed-commons/` regenerated additively via
`RHEMA_REGEN_SNAPSHOTS=1 pnpm exec vitest run packages/demo-corpus/src/project` (the drift
legs pin bytes) — the same output `tools/demo-corpus/project.mjs` produces end-to-end.
`drafts/*.json`/`index.json` re-emitted (new `demo.assetRefs` + chunk tables); no document-side
DTO changed.

## Acceptance criteria — all `deterministic · fixture-verified`

1. **Emitted chunk set** — one snapshot per R3 §1 run/record key; a missing key is a projector
   error. ✅ `replay.test.ts` (emitted set + missing-letter/image-ref legs).
2. **Kind registration** — `satisfies` + validators + drift byte-equality; unregistered kind
   still rejected. ✅
3. **S-9 replay** — phases == delivered-file set exactly; no-fact round → "approvals not
   recorded"; no numeric time/credits/model anywhere; `delivered` == composer output. ✅
4. **Figure variant** — `specKind:"image"`, imported provenance, no spec/SVG; draft links →
   asset route. ✅
5. **Card counts** — words == `statusMeters(published)`; strengths/claims ==
   `deliveredRecordCounts`; one_thing counted once; `demoCardFacts` sole exported card-count
   fn (grep test). ✅
6. **Labels** — every generated label passes `lintCopy`; no "author" for an agent. ✅
7. **Dossier ↔ `DossierViewData`** — colocated `apps/web` test on the committed snapshot. ✅
8. **Snapshots committed + deterministic** — re-projection byte-identical both ways. ✅

## Verification

- `pnpm turbo build lint typecheck` — **138/138 green**.
- `pnpm test` — **545 files, 6,515 pass, 6 skip** (docker legs env-skipped as usual).
- `pnpm exec vitest run packages/demo-corpus/src` — **236/236** (22 new run/record legs).
- `apps/web/src/demo-dossier-snapshot.test.ts` — **3/3**.
- `pnpm check:demo-corpus` — **0 violations** across 4 corpus dirs.
- No live/preview evidence is claimed; nothing deployed.

## Carries / notes for 220–221a

- `DemoDossierDto` is deliberately *not* `DossierViewData` — the replayed dossier omits
  `rigor`/`accessReport`/`runSummary` fields the record does not hold; 221 owns the replayed
  render branch (badge, "not recorded", "inferred from the delivered files" labels) and the
  app-side union wiring (recorded under ADR-126's note).
- Replayed run id is the correspondence round key (`v1-review`); dossier/run-report keys match.
- `nextStep.verb:"none"` — no next run exists in the record; `estimateCredits` stays `null`.

## Commit order

Implementation commit, then the build-memory closeout (index/ledger) — the two-commit split.
mergePolicy OPERATOR; this run never merges.

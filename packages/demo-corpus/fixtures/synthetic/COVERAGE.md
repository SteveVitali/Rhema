# Synthetic fixture coverage — `the-borrowed-commons` (REQ-CORPUS-15, S-12)

An invented essay (~1.5k words across v1–v3; all names invented: Averly parish, Mirella Ondatje,
Steven Marsh, Tomas Ekwueme). `source/` is the exporter's input layout with excluded-file decoys;
`corpus/` is its committed golden output (`corpus/_rules/` exercises the real `_rules` reader).
Converter goldens and synthetic snapshots (215–218a) land beside `corpus/` additively.

## Artifact shapes (R1 §1 allowlist)

| Shape                            | Fixture file(s)                                                                                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draft versions `drafts/vN.md`    | `drafts/v1.md`, `v2.md`, `v3.md` (v3 writer-directed, retitled)                                                                                                |
| Figure images                    | `drafts/figures/figure_1_signal_map.png` (EXIF/XMP/tEXt/private/tIME chunks), `figure_2_load_curve.png`                                                        |
| Correspondence dossier           | `correspondence/v1-review/00-piece-brief`, `01-claim-ledger`, `02-discourse-report`, `03-argument-notes`, `04-craft-notes`, `05-second-read`, `editors-letter` |
| Response letters + drafting note | `correspondence/v1-response.md`, `v1-drafting-note.md`, `v2-response.md`                                                                                       |
| Second-round review              | `correspondence/v2-review/{01-claim-ledger,editors-letter}.md`                                                                                                 |
| Response ledgers                 | `agents/author/ledgers/v1-response-ledger.md` (moves WITH `Discharges`), `v2-response-ledger.md` (without)                                                     |
| Drafting dossier                 | `agents/author/drafting/v1/00..06` (brief, voice brief, structure plan, drafter claim ledger H3-bullets, draft ledger, fidelity audit)                         |
| Research indices + source notes  | `agents/{author,editor}/research/index.md`; `sources/` 5 notes (labelled + free-form `freeform-gazette-note.md`)                                               |
| Published post                   | `published.md` (front-matter url/fetched/sha256 + verbatim credit line)                                                                                        |
| Companion artifact               | `drafts/taxonomy_reference_sheet.md` (kept per REQ-CORPUS-11 ruling)                                                                                           |

## Excluded-file decoys (all excluded with recorded reasons)

`manifest.md`, `.ds-store` (dotfile decoy — the real tree's `.DS_Store` hits the same rule),
`agents/editor/notes.md`, `agents/author/voice-charter.md`,
`agents/author/outline/01-outline.md`, `drafts/short-v1.md`, `drafts/figures/values-table.png`,
`agents/author/drafting/v1/draft-part1.md`, `ledger-sliceA.md`,
`agents/author/research/index-sliceA.md`, `correspondence/v2-review/01-claim-ledger-{A,B}.md`.

## Parse variants (R2 §1)

| Variant                                             | Fixture file                                                                                                                                                                      |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Section-style ids                                   | `III4`, `IV2-scope`, `P4`, `X11`, `II6`, `VII3-scope` (claim ledgers)                                                                                                             |
| Lettered sub-claims                                 | `C7b` (v1 ledger)                                                                                                                                                                 |
| Parenthetical after ID                              | `V3 (reuse C2, fix checked)`                                                                                                                                                      |
| Tier qualifiers                                     | `Tier 2, escalated to Tier 1` (C7b); `Tier 2 (escalated: reputationally protective)` (IV2-scope); `Tier 1 (epigraph)` (P4)                                                        |
| Free-text verdicts                                  | `Verified (reuse confirmation)` (V3); `Contradicted in one clause (major escalation); the rest Substantially accurate` (C9); `Substantially accurate on substance; …` (IV2-scope) |
| Non-verdicts                                        | `Skipped` / `(not scored — evaluative)` (X11)                                                                                                                                     |
| Tier-1 Contradicted with a source (S-6 proof shape) | `C7b` — escalated Tier 1, source URL (v1 ledger)                                                                                                                                  |
| H2 appendices that must not glue                    | `## Reuse confirmations`, `## References checked`, `## Skipped` (v1 ledger)                                                                                                       |
| `inventoryCount` ≠ row count                        | "Claims inventoried: 24" vs 7 headings (v1 ledger)                                                                                                                                |
| Moves table with `Discharges`                       | `v1-response-ledger.md` (M1–M3)                                                                                                                                                   |
| Moves table without                                 | `v2-response-ledger.md` (M1–M3)                                                                                                                                                   |
| Mixed/unmapped dispositions                         | `§3.B accept; the volume point **rebut**`, `operational`, `(causes are F1, F3)`, `decline`, `escalate`, `awaiting the writer` (v1 ledger)                                         |
| Free-form source note                               | `freeform-gazette-note.md` (no labels, bare URL bullet, "Accessed …" sentence)                                                                                                    |
| Prose plan / roadmap OQs                            | letter `## Revision roadmap`, `## Considered and rejected`                                                                                                                        |
| Scorecard                                           | 8 dimensions, both letters; `cap` Basis text on v1 rows                                                                                                                           |
| `published.md` front-matter                         | `published.md` (url, fetched, sha256 of body)                                                                                                                                     |

## Sanitizer / gate positive controls (fixture `_rules/`)

| Control                                                                                                       | File                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| File-targeted rewrite (workflow "operator" → "the writer")                                                    | `ledgers/v1-response-ledger.md:3`, `drafting/v1/04-draft-ledger.md:12`                                                 |
| File-targeted rewrite (utm prose → "a deep-research tracking parameter")                                      | `drafting/v1/00-commissioning-brief.md:9`                                                                              |
| Generic: persona path, persona slug, Desktop path, utm URL strip, r.jina.ai unwrap, `figures/` image-path fix | `01-voice-brief.md`, ledgers, `editors-letter.md`, `ekwueme-commons-2019.md`, `ondatje-ledger-2024.md`, `drafts/v1.md` |
| Line-allowlist (verbatim Published credit line hits `~/`)                                                     | `published.md:12` via `_rules/line-allowlist.json`                                                                     |
| Content-sense "operator" untouched                                                                            | `drafts/v1.md` (in-test)                                                                                               |
| Excluded-ref markers                                                                                          | `drafts/v1.md` → outline + `manifest.md` refs; `v1-drafting-note.md` → outline ref                                     |

Denylist negative controls are synthesized in-test (`src/denylist.test.ts`), never committed.

## Converter goldens (215_R7DEM.2a, added 2026-11-04)

`goldens/the-borrowed-commons/` holds the converter's committed outputs for both review rounds:
`correspondence/{v1,v2}-review/01-claim-ledger.json` (the `claimLedgerSidecar` the real
`parseSidecar` accepts) + `labels.json` (0-based ordinal → source id, REQ-CONV-4), and
`anchor-histogram.json` (per-file anchor-rung counts, REQ-CONV-11). Canonical JSON — regenerated
with `RHEMA_REGEN_GOLDENS=1 pnpm exec vitest run packages/demo-corpus/src/convert/claim-ledger.test.ts`
and byte-compared in the same test.

**216_R7DEM.2b (added 2026-11-04):** `correspondence/{v1,v2}-review/` gains `findings.json` +
`rubric.json` (the `findingsSidecar`/`rubricSidecar` the real `parseSidecar` accepts — letter +
second read through the R2 §2.2/§2.3 rules), `findings-anchor-histogram.json` (per-review
finding anchor-rung counts), and `labels.json` grows to the review-level file
`{version, claims, findings, importRule, roles}` — `findings[]` carries the corpus source ids
(`Major n`, `Strength n`, `Minor n`, `Line note n`, `CaR n`, `OQ n`, `SR n` with `SR` aliases on
merged majors), `importRule` the per-field "assigned by import rule" markers (REQ-CONV-14), and
`roles` the S-10 role vocabulary. Regenerated with
`RHEMA_REGEN_GOLDENS=1 pnpm exec vitest run packages/demo-corpus/src/convert/findings.test.ts`.

Two dated corrections to the table above, recorded 2026-11-04 at converter build time (the rows
overclaimed): the v1 ledger's H2 appendices are `## Reuse confirmations`, `## References checked`
and `## Summary` (there is no `## Skipped`; the skip variant is the `### X11 · Tier 3 · Skipped`
heading, which is what the row's grammar exercises), and the `Tier … (epigraph)` qualifier reads
`Tier 2 (epigraph)` on `P4`, not Tier 1 — its sibling row (`escalated:` on `IV2-scope`) is Tier 2
as stated. `verdict-rescore` overrides are exercised by synthesized rows in-test: the synthetic
ledgers reconcile, so no `convert-overrides.json` is needed here; 219 authors the real
`corpus/<slug>/convert-overrides.json`.

**217_R7DEM.2c (added 2026-11-04):** additive extension only — `source/` and `corpus/` copies of
`agents/author/ledgers/v1-response-ledger.md` gained a trailing `## Discharge evidence` section
(`- **F1/F2/F5:**` quotes verbatim from `drafts/v2.md`; every pre-existing byte untouched, the
exporter regenerated `corpus/`, `index.json`, `PROVENANCE.md` and `export-manifest.json`). The
new `overrides/the-borrowed-commons/convert-overrides.json` holds one `minor-finding` row (G1 →
"The one thing") — it lives outside `corpus/` because that tree is the exporter's own golden;
219 authors the real `corpus/<slug>/convert-overrides.json`. `disposition`/`move-link` override
kinds are exercised by synthesized rows in-test: the fixture's only mixed cell sits on a
raw-table-only row (`CL C7b`), and no spec amendment authorizes a hand-authored move map.

**218_R7DEM.3 (added 2026-11-04):** additive only — `snapshots/` is the projector's committed
output (canonical-JSON `SnapshotFile` chunks + per-essay `index.json` + `projects.json`),
byte-pinned by the drift leg of `src/project/project.test.ts`; regenerate with
`RHEMA_REGEN_SNAPSHOTS=1` (or `tools/demo-corpus/project.mjs`, the corpus→convert→project
command 218a extends and 219 reuses). `snapshots/_rules/line-allowlist.json` covers the
published-mirror line embedded verbatim (source row `la-published-mirror`); positions are
regenerated-file positions — a moved hit or stale entry fails `check:demo-corpus` by design.

**218a_R7DEM.3b (added 2026-11-04):** additive only — `snapshots/<slug>/` gained the run/record
side: `dossier/<round>.json` + `run-report/<round>.json` per reviewed round, `timeline.json`,
`card-facts.json`, and `figures/<figure>.json` per index.json image artifact (the S-7 imported
`specKind:"image"` variant). `dossier`/`run-report` carry the replayed-run DTO variant (S-9:
phases inferred iff the artifact exists; approvals only verbatim from `_rules/facts.json`
`approvals`, else `"not_recorded"`; no numeric time/credits/model is ever serialized). Draft
editor docs gained `demo.assetRefs` (inline `figures/` links → the REQ-DWEB-17 route shape).
Same regen commands as 218; the drift legs pin bytes.

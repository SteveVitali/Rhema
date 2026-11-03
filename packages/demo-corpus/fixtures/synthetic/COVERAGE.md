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

`manifest.md`, `.DS_Store`, `agents/editor/notes.md`, `agents/author/voice-charter.md`,
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

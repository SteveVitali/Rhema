# R7DEM.2b — Converter: editor's letter, findings, second read, rubric, import-rule labels, demo defaults

- **Spec:** `docs/tickets/216_R7DEM.2b__convert-letters-findings.md` (seq 216 of 254; manifest row 216)
- **Base:** `stevevitali/r7dem-2a-claim-ledgers` @ `42d2009` (chainTip; stack rides unmerged PRs #240–#247, OPERATOR)
- **Branch:** `stevevitali/r7dem-2b-letters`
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** e981ec5
- **Started:** 2026-11-04T01:47Z
- **Config:** Stage A only ($0). No preview (GD-PREVIEW.R7). Synthetic fixture only — the real
  export (HUMAN-H14 SIGNED 2026-11-03, digest `19861a06…`) is never an input here (REQ-CORPUS-14;
  S-12). Size budget ~650 changed lines excl. fixtures and goldens.
- **Closed:** —
- **ci:** —

## Deferrals read

- Round-7 OPEN rows scanned: `D-R7OPEN.1-1`, `D-R7KIT.1-1`, `D-R7RO.1-1`, `D-R7FIX.1-1`,
  `D-R7COPY.0-1/-2` — all Stage-B/preview legs owed at 224's phase preview; a Stage-A library
  ticket does not unblock them. Pre-round OPEN rows are earlier-phase live legs; none scoped to
  this ticket or its prerequisite (215).
- `D-R6OSS.1-1` OPEN — the public-flip row; H14 is signed but the visibility flip stays
  operator-owned. Not closed here.
- Ticket Notes: "DEFERRALS: none expected."

## Requirements

From the ticket's deliverables (REQ ids per the stamp list):

1. `src/convert/letter.ts` — typed letter: verdict, the one thing, strengths, majors
   (Where/Problem/Why/Direction), minors, line notes, roadmap open questions,
   considered-and-rejected, scorecard; absorbs R2 §1 letter variants. (REQ-CONV-7)
2. `src/convert/second-read.ts` — objections/strengths/verdict; SR strengths are not findings.
   (REQ-CONV-7)
3. `src/convert/reconcile.ts` — override file authoritative; overlap heuristic runs as a lint;
   heuristic/override disagreement → build warning in diagnostics; adds the `reconciliation`
   override kind to the 215 mechanism. (REQ-CONV-8)
4. `src/convert/findings.ts` — the R2 §2.2 table: declared kind/severity/origin rules; `body` =
   Problem + Why + Direction verbatim, truncated only by the declared 4096 rule with "…";
   `rubricDims`; `evidence.urls`; `suggestion` never emitted. (REQ-CONV-7)
5. `src/convert/rubric.ts` — explicit eight-name map; `cap` only where Basis states one; no
   aggregate computed or emitted. (REQ-CONV-9)
6. `src/convert/demo-defaults.ts` — the REQ-CONV-16 default set as one declared constant set
   (owner: this ticket; 217/218/218a import, never restate): one thing `major` + `one_thing`; no
   `blocking` anywhere; strengths `note`/`strength`; dossier-answering response rows raw-table-only
   (consumed by 217). (REQ-CONV-16)
7. `src/convert/labels.ts` — extend `labels.json` with a per-field "assigned by import rule"
   marker for every converter-assigned field (severity, kind, origin/reconciliation, plus 215's
   `stance`/`accessedAt`); generated label text uses S-10 roles and passes `lintCopy`.
   (REQ-CONV-14)
8. `src/convert/raw-only.ts` — the R2 §6 list as a declared `RAW_ONLY` constant by artifact path
   pattern (218 consumes); plus the verbatim-invariant test (every emitted title/body is a
   substring of the sanitized source, apart from declared truncation). (REQ-CONV-13)
9. Validation: every findings/rubric sidecar passes `parseSidecar`; any `failed` aborts. R2
   negative controls for rubric names and `letterSection:"minor"` return `failed`. (REQ-CONV-2)
10. Synthetic goldens for findings + rubric + majors' `Where` anchors through the 215 ladder
    (section-heading fallback included). (REQ-CONV-12 amended, this part)

## Acceptance criteria

| # | AC | Required layer |
|---|---|---|
| 1 | Every letter/second-read variant in the coverage table parses; majors carry all four parts | fixture-verified |
| 2 | Findings + rubric `parseStatus:"ok"`; R2 negative controls (`"Thesis & contribution"`, `"Voice & audience fit"`, `letterSection:"minor"`) return `failed` | fixture-verified |
| 3 | REQ-CONV-16: zero `blocking`; one thing `major`/`one_thing`; strengths `note`/`strength` | fixture-verified |
| 4 | Verbatim invariant: every title/body a source substring or declared truncation | fixture-verified |
| 5 | Every converter-assigned field has an import-rule marker in `labels.json`; a field without one fails | fixture-verified |
| 6 | Reconciliation: override wins; planted heuristic disagreement → diagnostic warning; unused reconciliation override fails | fixture-verified |
| 7 | No aggregate rubric score anywhere in output | fixture-verified |
| 8 | Canonical-JSON goldens byte-equal on re-run | fixture-verified |
| 9 | Optional local smoke on withheld real export (aggregate counts only) — if 214b produced it | engineered |
| 10 | Universal phase-gate AC | agentic |

## Plan

- New modules under `packages/demo-corpus/src/convert/` per R2 §5: `letter.ts`,
  `second-read.ts`, `reconcile.ts`, `findings.ts`, `rubric.ts`, `demo-defaults.ts`,
  `raw-only.ts`, `labels.ts`; `overrides.ts` gains the `reconciliation` kind (additive);
  `index.ts` re-exports.
- `labels.json` grows to the review-level file `{version, claims?, findings?, importRule, roles}`
  — one writer per golden file: the findings test owns `labels.json`; `claim-ledger.test.ts` keeps
  in-memory label assertions (no second writer).
- Goldens under `fixtures/synthetic/goldens/the-borrowed-commons/correspondence/{v1,v2}-review/`:
  `findings.json`, `rubric.json`, `labels.json` (merged) + findings anchor rungs into
  `anchor-histogram.json` (regenerated, byte-compared).

## Test matrix

- `letter.test.ts` — both fixture letters parse; majors carry all four parts; mixed `- `/`1. `
  lists; v2 minimal variant; problem-label-variant rule (non-Where/Why/Direction = problem).
- `second-read.test.ts` — objections/strengths/verdict; unlabeled headings reported.
- `reconcile.test.ts` — heuristic merge thresholds; override wins; disagreement warning; stale
  override fails; explicit rejection wins over merge.
- `findings.test.ts` — R2 §2.2 table per row class; demo defaults; verbatim invariant;
  `parseSidecar` ok; negative controls; goldens byte-equal; majors' `Where` anchors incl. section
  fallback; evidence.urls; suggestion never emitted; labels.json importRule coverage + lintCopy.
- `rubric.test.ts` — eight-name map; cap only on Basis-stated caps; no aggregate; raw-name
  negative controls.
- `raw-only.test.ts` — fixture corpus classification (raw-only paths vs converted artifacts).

## Progress

- 2026-11-04T01:47Z — Branch cut off `stevevitali/r7dem-2a-claim-ledgers` @ `42d2009`; Load docs
  read (R2 §1 letter/second-read taxonomy, §2.2/§2.3 normative, §5 module rows, §6 raw list, §7
  R1/R8, Requirements + open questions; spec §3.1 GD-DEMO-CONV.R7, §3.3 S-10/S-12, §4.2, §8;
  anchors re-confirmed: findingRowSchema, rubricSidecarSchema, LETTER_SECTIONS, FINDING_ORIGIN/
  RECONCILIATION, SLOT_PATTERNS/parseLetterSections, lintCopy/BANNED_STRINGS); deferrals read;
  ledger seeded.

## Gap table

| Item (spec §) | Required | Achieved | Status | Evidence |
|---|---|---|---|---|
| D1 letter parser (REQ-CONV-7) | fixture-verified | fixture-verified | met | `letter.ts`; `letter.test.ts` — both letters, four-part majors, problem-variant rule |
| D2 second-read parser (REQ-CONV-7) | fixture-verified | fixture-verified | met | `second-read.ts`; `letter.test.ts` — objections/strengths/verdict, strengths not findings |
| D3 reconciliation + override kind (REQ-CONV-8) | fixture-verified | fixture-verified | met | `reconcile.ts`, `overrides.ts`; override wins, `reconcile_disagreement` warn, unused fails |
| D4 findings converter (REQ-CONV-7) | fixture-verified | fixture-verified | met | `findings.ts`; `findings.test.ts` — the §2.2 table per row class |
| D5 rubric converter (REQ-CONV-9) | fixture-verified | fixture-verified | met | `rubric.ts` — eight-name map, Basis-stated caps only, no aggregate |
| D6 demo defaults (REQ-CONV-16) | fixture-verified | fixture-verified | met | `demo-defaults.ts` `DEMO_DEFAULTS`; defaults asserted on emitted rows |
| D7 import-rule labels (REQ-CONV-14) | fixture-verified | fixture-verified | met | `labels.ts`; `labels.json` markers for all assigned fields; `lintCopy` clean |
| D8 `RAW_ONLY` + verbatim invariant (REQ-CONV-13) | fixture-verified | fixture-verified | met | `raw-only.ts`; classification test + `includes()` invariant test |
| D9 parseSidecar gate + negative controls (REQ-CONV-2) | fixture-verified | fixture-verified | met | gate inside both converters; rubric-name + `letterSection:"minor"` controls |
| D10 synthetic goldens (REQ-CONV-12) | fixture-verified | fixture-verified | met | `goldens/…` findings/rubric/labels/histogram byte-equal on re-run |
| AC9 real-export smoke (optional) | engineered | engineered | met | not run — the withheld `corpus/` export stays unused; aggregates ride 219 |
| Universal phase-gate AC | agentic | agentic | met | turbo 138/138 · `pnpm test` 6401/6 skip/0 fail · `check:demo-corpus` 0 viol |

**Decisions (owned; no spec deviation — no ADR, same basis as R7DEM.2a):** (1) `labels.json` is
the review-level file `{version, claims, findings, importRule, roles}`, one writer per golden
(`findings.test.ts`); (2) major `body` = contiguous verbatim slice of the non-Where bullets,
markers kept; (3) `override_unconsumed` checks are kind-scoped so one OverrideBook flows through
the pipeline's passes; (4) scorecard cite grammar accepts bare `Major n` alongside `Major
issue n`/`MI n`; (5) ~1.1k changed lines excl. fixtures/goldens vs the ~650 estimate — the
R2 §2.2 table is wide; recorded here rather than stretched.

## Evidence log

- `pnpm turbo build lint typecheck` — 138/138 green.
- `pnpm test` — 6,401 pass / 6 skip / 0 fail (540 files).
- `pnpm exec vitest run packages/demo-corpus` — 15 files / 125 tests (27 new) green.
- `RHEMA_REGEN_GOLDENS=1 vitest run …/findings.test.ts` — goldens regenerated; plain re-run
  byte-equal (`findings.json`, `rubric.json`, merged `labels.json` ×2, `findings-anchor-histogram.json`).
- `pnpm check:demo-corpus` — clean (3 dirs, 0 violations) incl. the new goldens.
- Fixture results: v1 → 14 findings (one_thing, 2 majors `both`+`kept` w/ SR aliases, 5
  strengths, 2 minors incl. `claim` kind + `evidence.verdict` on the C7b cite, 2 line notes,
  1 CaR, 1 OQ); v2 → 1 finding; rubric 8 dims, cap on `evidence_accuracy` only.

## Evidence report

**What shipped.** The letter/second-read → `findingsSidecar` + `rubricSidecar` half of the
converter: `letter.ts` (typed letter absorbing the R2 §1 variants), `second-read.ts`,
`reconcile.ts` (override-authoritative reconciliation + `reconciliation` override kind),
`findings.ts` (the R2 §2.2 table verbatim — merged objections flip majors to `both`+`kept` with
`SR n` label aliases for 217's `Source`-cell join; verbatim bodies, 4096-rule truncation;
`suggestion` never emitted; `evidence.verdict` only on single-ledger-row claim minors),
`rubric.ts` (explicit name map; Basis-stated caps only; no aggregate), `demo-defaults.ts`
(`DEMO_DEFAULTS` — the one REQ-CONV-16 owner), `labels.ts` (`labels.json` grown to
`{version, claims, findings, importRule, roles}` — per-field "assigned by import rule" markers
+ S-10 roles + `lintCopy`), `raw-only.ts` (`RAW_ONLY` — the R2 §6 list for 218). Overrides gain
the `reconciliation` kind; `override_unconsumed` checks are kind-scoped per pass.

**Requirement ids.** REQ-CONV-2 (findings + rubric), REQ-CONV-7, REQ-CONV-8, REQ-CONV-9,
REQ-CONV-12 (synthetic findings/rubric goldens), REQ-CONV-13, REQ-CONV-14, REQ-CONV-16.

**Deferrals:** none opened, none closed. **Deviations:** the five recorded decisions — no spec
deviation, no ADR.

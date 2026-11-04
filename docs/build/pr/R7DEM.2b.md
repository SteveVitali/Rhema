# R7DEM.2b — Converter: editor's letter, findings, second read, rubric, import-rule labels, demo defaults

- **Spec:** `docs/tickets/216_R7DEM.2b__convert-letters-findings.md` (seq 216 of 254)
- **Base:** `stevevitali/r7dem-2a-claim-ledgers` · **Stage A only ($0)**, synthetic fixture
  (REQ-CORPUS-14; S-12; no preview per GD-PREVIEW.R7)
- **Requirements:** REQ-CONV-2 (findings + rubric), REQ-CONV-7, REQ-CONV-8, REQ-CONV-9,
  REQ-CONV-12 (synthetic findings/rubric goldens), REQ-CONV-13, REQ-CONV-14, REQ-CONV-16

## Summary

Extends the 215 converter: the editor's letter and the blind second read become a
`findingsSidecar` and a `rubricSidecar` that pass the real `parseSidecar` validators. Every
severity/kind/origin/reconciliation follows the declared R2 §2.2/§2.3 rules and is labelled as
an import-rule assignment in the grown `labels.json`. The operator's accepted demo defaults
(GD-DEMO-CONV.R7 "Accept all defaults") hold everywhere — no `blocking` anywhere, the one thing
is `major`/`one_thing`, strengths are `note`/`strength` rows — and no corpus text is paraphrased:
every emitted title/body is a verbatim substring of the sanitized source, apart from the
declared 4096 truncation (`slice(0,4093) + "…"`).

## What changed

- `src/convert/letter.ts` — typed letter parser: verdict, `**The one thing:**`, strengths,
  `### n.` majors with all four parts (every non-Where/Why/Direction bullet is problem text —
  the R2 §1 label-variant rule), minors, line notes, roadmap open questions,
  considered-and-rejected with lead-in-paragraph origins, scorecard (explicit `RUBRIC_NAME_MAP`,
  cap flag, major cites).
- `src/convert/second-read.ts` — objections (labelled H3s), strengths (never findings), verdict.
- `src/convert/reconcile.ts` — R2 §2.2 reconciliation: explicit rejection > explicit mention >
  0.15/2×-margin overlap heuristic > standalone. The `reconciliation` override kind (new in
  `overrides.ts`) is authoritative; a heuristic/override disagreement warns in diagnostics;
  an unused row fails.
- `src/convert/findings.ts` — the §2.2 table verbatim: merged objections flip their major to
  `both`+`kept` (with `SR n` aliases in labels for 217's join); body = verbatim Problem+Why+
  Direction slice, bold labels kept; `evidence.verdict` only on claim-kind minors citing one
  ledger row; `suggestion` never emitted; anchors through the 215 ladder.
- `src/convert/rubric.ts` — explicit name map; `cap` only where Basis states one
  (`at=min(score,4)`, reason = Basis verbatim, `entailedByFindingOrdinal` = first cited major);
  no aggregate computed or emitted.
- `src/convert/demo-defaults.ts` — `DEMO_DEFAULTS`, the one constant set owning REQ-CONV-16
  (217/218/218a import, never restate).
- `src/convert/labels.ts` — `labels.json` → `{version, claims, findings, importRule, roles}`:
  per-field "assigned by import rule" markers for every converter-assigned field (severity,
  kind, origin, reconciliation, + 215's `stance`/`accessedAt`); S-10 `roles`; `lintGeneratedLabels`
  runs `lintCopy`.
- `src/convert/raw-only.ts` — `RAW_ONLY`, the R2 §6 list as declared path patterns (218 consumes).
- `overrides.ts` + `claim-ledger.ts` — `reconciliation` kind; the unconsumed-override check is
  now kind-scoped so one OverrideBook flows through the pipeline's passes.
- Tests: `letter.test.ts`, `findings.test.ts`, `overrides.test.ts` (+reconciliation legs);
  `claim-ledger.test.ts` drops its `labels.json` golden write (the review-level file is now
  owned by findings.test.ts — one writer per golden).
- Goldens under `fixtures/synthetic/goldens/the-borrowed-commons/`: `findings.json`,
  `rubric.json`, merged `labels.json` ×2 reviews, `findings-anchor-histogram.json`
  (`RHEMA_REGEN_GOLDENS=1` regenerates, byte-compared).

## Design decisions (owned; no spec deviation)

1. `labels.json` is review-level (claims + findings + importRule + roles in one file); one
   writer per golden — `findings.test.ts` owns it.
2. Major `body` is the contiguous verbatim slice covering the non-Where bullets — `- `/bold
   markers kept (the strongest reading of "bold labels kept" + the verbatim invariant).
3. Per-kind `override_unconsumed` scoping so a shared OverrideBook serves every pass; the
   pipeline's end-of-run check still catches any row no pass consumed.
4. Rubric cites accept bare `Major n` (fixture Basis) alongside `Major issue n`/`MI n`.
5. ~1.1k changed lines excl. fixtures/goldens vs ~650 estimate — the R2 §2.2 table is wide;
   recorded here rather than silently stretched.

## Acceptance criteria → evidence

| AC | Layer | Evidence |
|---|---|---|
| Letter/SR variants parse; majors carry all four parts | fixture-verified | `letter.test.ts` (8) — both fixture letters + the multi-part-problem variant |
| findings/rubric `parseStatus:"ok"`; negative controls `failed` | fixture-verified | `findings.test.ts` — per-round gate + `"Thesis & contribution"`, `"Voice & audience fit"`, `letterSection:"minor"` controls |
| REQ-CONV-16 defaults | fixture-verified | zero `blocking`; one_thing `major`/`one_thing`; strengths `note`/`strength` — asserted |
| Verbatim invariant | fixture-verified | every title/body `includes()` on the sanitized source (truncation exempted) |
| Import-rule markers | fixture-verified | every `CONVERTER_ASSIGNED_FIELDS` row → `"assigned by import rule"`; `lintGeneratedLabels` clean |
| Reconciliation | fixture-verified | override wins; planted disagreement → `reconcile_disagreement` warning; unused row fails |
| No aggregate rubric score | fixture-verified | sidecar keys are exactly `{dimensions, sidecar, version}` |
| Canonical-JSON goldens byte-equal | fixture-verified | `findings.json`/`rubric.json`/`labels.json`/histogram re-run equal |
| Optional real-export smoke | engineered | not run — the withheld `corpus/` export stays unused here (aggregates would ride 219's goldens) |
| Universal phase-gate | agentic | turbo 138/138 · `pnpm test` 6401 pass / 6 skip / 0 fail · `check:demo-corpus` 0 viol |

## Verification

`pnpm turbo build lint typecheck` 138/138 · `pnpm test` 6401 pass / 6 skip / 0 fail · package
vitest 125 (27 new) · `pnpm check:demo-corpus` clean incl. the new goldens · goldens byte-equal
on re-run.

## Deferrals

None opened, none closed.

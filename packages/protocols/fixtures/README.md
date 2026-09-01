# Parser / serializer golden set (P0.04, ledger F10)

The bootstrap golden corpus for the sidecar parsers (`../parsers`) and the write-back serializers
(`../serializers`). Each project directory holds the structured-output sidecars derived from the three
real dossiers in `~/agent-discourse/agent-scratch/projects` — `the-politics-of-visibility`,
`structure-of-political-difference`, `constitution-of-reason`.

## What each file is

- `01-claim-ledger.json`, `findings.json`, `rubric.json` — read-only sidecars: parsed to typed rows, never
  serialized (the review never edits them as rows). Claim texts, verdicts, URLs, and stances are taken from
  the real `01-claim-ledger.md` dossiers.
- `response-ledger.json`, `structure-plan.json`, `cut-list.json` — the three **write-back** artifacts
  (REQ-SPEC-9): a gate edit serializes rows → `.md (+ .json)`, and the round-trip test asserts
  `parse(serialize(rows)) ≡ rows` for each on all three projects (AC1).

### Provenance and hand-authored twins

The `response-ledger.json` twins are derived from the real `agents/author/ledgers/v*-response-ledger.md`
files (their findings tables and dispositions). The `the-politics-of-visibility` `structure-plan.json` is
derived from that project's real `02-structure-plan.md` spine. The remaining `structure-plan.json` and every
`cut-list.json` are **hand-authored plausible twins**: `cut_to_length` and (for two of the three projects)
the Drafter's `structure-plan` are Phase-1/full-IDE workflows (P1.10 / P1) that have not been run on these
dossiers, so no upstream artifact exists yet. They match the established P0.02 convention of hand-authored
twins and exist to exercise the serializer/parser inverse; byte offsets in anchors are illustrative.

## `_cases/` — edge-case fixtures

- `two-source-claim.json` — a claim with two `sources[]` stance edges (REQ-OBJ-18); the singular `url`
  equals `sources[0]` **of the verdict-determining stance** (here the *supports* edge, which is not the
  global `sources[0]`), so the parser's derivation is tested precisely (AC4).
- `two-source-claim-inconsistent.json` — the same claim with `url` pointing at the contradicting source;
  the parser must return `parseStatus: failed` (REQ-OBJ-18 invariant violated).
- `invalid-claim-ledger.json`, `invalid-structure-plan.json` — schema-invalid sidecars; the parser must
  return `parseStatus: failed`, never a partial row set (REQ-SPEC-12 / REQ-DATA-7 amended — AC3).

## The golden set grows automatically

This is only the seed. Per §11.1 and ledger F10, **every green nightly dossier becomes a parser fixture**:
the nightly runner (P0.15) copies each delivered run's validated `.rhema/*.json` sidecars (those that
passed delivery validation with `parseStatus = ok`) into a project directory here, so the corpus grows with
real, verified output instead of only these hand-seeded twins. The round-trip and parse suites glob this
tree, so new fixtures are picked up with no test edits. P0.15 owns wiring that copy step; P0.04 owns the
mechanism (the glob-driven suites) and this seed.

# R7DEM.2a — Converter: claim ledgers + the anchor ladder (synthetic fixture)

Implements `docs/tickets/215_R7DEM.2a__convert-claim-ledgers.md` (manifest row 215; Round-7 R7a).
Stage A only ($0): unit + golden tests on the committed **synthetic** fixture (REQ-CORPUS-14, S-12)
— the real export (H14 signed, digest `19861a06…`) is never an input.

## Summary

`packages/demo-corpus/src/convert/` — the pure markdown→sidecar converter base 216/217 extend
(never fork): shared markdown readers, the quote-fragment extractor, the R2 §3 anchor ladder, the
claim-ledger converter, the source-note index, the `labels.json` side-table and the
`convert-overrides.json` mechanism.

## What changed

- **`md/sections.ts` + `md/quotes.ts`** (REQ-CONV-1): heading sections where an H3 body stops at
  ANY H1/H2 (appendices never glue); `**Label:**` and `- Label:` bullets with continuations;
  table (`\|`-safe) and list readers; link extraction; quoted-span fragments split on ellipses/
  editorial brackets; locator strip + `(l.N)` hints.
- **`anchor.ts`** (REQ-CONV-11): `splitMarkdownBlocks` on the sanitized draft; ladder
  exact(1.0) → exact-multi(0.85) → normalized(0.9) → fuzzy(`min(0.8,0.8·cov)`; hint-agreement floor
  0.75) → line(0.5) → section(0.4) → none (anchor omitted); References blocks excluded except
  `Ref [n]` claims; emitted offsets are block-relative so every anchor round-trips through
  `resolveAnchor`.
- **`claim-ledger.ts`** (REQ-CONV-2/3/5): the R2 §1 heading grammar (section ids, lettered
  sub-claims, parentheticals, tier qualifiers, free-text verdicts, `Skipped`/`(not scored)` →
  `unverifiable`); qualifiers preserved verbatim in `note`; final tier on escalation;
  `kind`/`sourceCheck` omitted; `sources[]` at the verdict-determining stance with `url =
  sources[0]` (REQ-OBJ-18 by construction); `accessedAt` = the ledger `Checked` date T00:00:00Z
  (declared approximation, R2 §7 R2); `inventoryCount` from the header; the summary-count check as
  a diagnostic; unmapped verdict / unparseable heading / `parseSidecar` `failed` all abort
  fail-closed.
- **`source-note.ts`** (REQ-CONV-5): `{slug,title,url?,accessed?}` index covering labelled and
  free-form notes; bodies stay raw.
- **`overrides.ts`** (REQ-CONV-6): typed `convert-overrides.json` reader — every row cites
  `<file>:<line>`; per-row consumption tracking; the `verdict-rescore` kind; an unconsumed row
  fails.
- **`labels.json`** (REQ-CONV-4): `{version:1, claims:[{ordinal,id}]}` — 0-based ordinal ↔ source
  id (`C7b`, `III4`, `VII3-scope`) for display.
- Goldens `fixtures/synthetic/goldens/the-borrowed-commons/` (both review ledgers + labels +
  `anchor-histogram.json`), canonical-JSON byte-compared; `RHEMA_REGEN_GOLDENS=1` regenerates.
  COVERAGE.md gains the goldens table + two dated corrections; package `AGENTS.md` layout row;
  package deps `@rhema/{contracts,findings-core,protocols}` + tsconfig refs.

## Design decisions (recorded in `runs/R7DEM.2a.md` §Decisions)

`labels.json`/override schema shapes (ticket-owned); the `- Label:` bullet form added alongside
`**Label:**`; longest-keyword-first for `Misleading in context`; heading parentheticals + tier
qualifiers preserved verbatim in `note`; the drafter `03-claim-ledger.md` stays raw per R2 §6; no
fixture `convert-overrides.json` (exporter byte-identity) — mechanism proven on synthesized rows.

## Requirement ids

REQ-CONV-1, REQ-CONV-2 (claim ledgers), REQ-CONV-3, REQ-CONV-4, REQ-CONV-5, REQ-CONV-6, REQ-CONV-11,
REQ-CONV-12 (synthetic claims goldens), REQ-CORPUS-10 (synthetic S-6 shape), REQ-CORPUS-15 (consumer).

## Acceptance criteria → evidence

| AC | Layer | Evidence |
|---|---|---|
| 100% heading parse, zero unmapped; each coverage-table variant tested | fixture-verified | `claim-ledger.test.ts` — v1: 7/7, v2: 2/2, `unmappedVerdicts:[]`; per-variant assertions (`v1 emits every heading variant`) |
| `parseStatus:"ok"`; negative controls fail | fixture-verified | sidecars parse ok; `"Misleading"`/`"Skipped"`/`"Verified (reuse confirmation)"` raw → failed; non-determining `url` → failed (REQ-OBJ-18) |
| Rungs/confidences R2 §3; anchors re-resolve; histogram pinned | fixture-verified | `anchor.test.ts` (15) + `anchor-histogram.json` golden + `resolveAnchor` round-trip leg |
| Summary-count check reproduces the fixture summary | fixture-verified | `summaryReconciled === true` both rounds |
| Stale override fails; consumed re-score applies | fixture-verified | `override_unconsumed` leg + III4→contradicted apply leg |
| Canonical-JSON goldens byte-equal | fixture-verified | `fixtures/synthetic/goldens/` + byte-equality test |
| Optional real-export smoke (aggregates) | fixture-verified | 267/267 headings, 0 unmapped — `runs/R7DEM.2a.md` §Progress; nothing real-derived committed |
| Universal phase-gate | agentic | turbo 138/138 · `pnpm test` 6,374 pass / 6 skip / 0 fail · `check:demo-corpus` clean · records below |

## Verification

`pnpm turbo build lint typecheck` 138/138 · `pnpm test` 6,374 pass / 6 skip / 0 fail · package
vitest 97/97 (64 new) · `pnpm check:demo-corpus` 0 violations (goldens dir included) ·
`check-build-memory` + `check-append-only` run at close. mergePolicy OPERATOR — unmerged.

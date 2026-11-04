# R7DEM.2a — Converter: claim ledgers + the anchor ladder (synthetic fixture)

- **Spec:** `docs/tickets/215_R7DEM.2a__convert-claim-ledgers.md` (seq 215 of 254; manifest row 215)
- **Base:** `stevevitali/r7dem-1b-local-export` @ `37a96f4` (chainTip; stack rides unmerged PRs #240–#246, OPERATOR)
- **Branch:** `stevevitali/r7dem-2a-claim-ledgers`
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** e981ec5
- **Started:** 2026-11-04T01:1xZ
- **Config:** Stage A only ($0). No preview (GD-PREVIEW.R7). Synthetic fixture only — the real export
  (HUMAN-H14 SIGNED 2026-11-03, digest `19861a06…`) is never an input here (REQ-CORPUS-14; S-12).
  Size budget ~600 changed lines excl. fixtures and goldens.
- **Closed:** 2026-11-04T01:30Z
- **ci:** pending #247@`fa9c91e` (bounded read at the closeout head: `fast-path` pass 41 s,
  `typecheck / lint / unit` still running at ~13 min on run 41754376664; the next boundary read
  decides — same posture as R7RO.1/R7DEM.1b)

## Deferrals read

- Round-7 OPEN rows: `D-R7OPEN.1-1` (224-phase records), `D-R7KIT.1-1`, `D-R7RO.1-1`,
  `D-R7FIX.1-1`, `D-R7COPY.0-1/-2` — all Stage-B/preview legs owed at 224's phase preview; a
  Stage-A library ticket does not unblock them. Pre-round OPEN rows are earlier-phase live legs;
  none scoped to this ticket or its prerequisite (214).
- `D-R6OSS.1-1` OPEN — the public-flip row; H14 is signed but the visibility flip stays
  operator-owned. Not closed here.
- Expected opens: none (ticket Notes: a residual the fixture cannot exercise opens a D-row naming
  219 as the unblock).

## Requirements

From the ticket's deliverables (REQ ids per the stamp list):

1. `src/convert/md/sections.ts` + `md/quotes.ts` — shared markdown readers: H3 bodies stop at any
   H1/H2; bold-bullet, table and list readers; quote fragments. (REQ-CONV-1)
2. `src/convert/anchor.ts` — the R2 §3 ladder + confidence constants; `splitMarkdownBlocks` on the
   sanitized draft; References blocks excluded except for `Ref [n]` claims; line hints;
   section-heading fallback; unresolved claim → anchor omitted; emitted anchors round-trip through
   `resolveAnchor`. (REQ-CONV-11)
3. `src/convert/claim-ledger.ts` — the R2 §1 heading grammar at 100%; explicit verdict table with
   qualifiers in `note`; final tier on escalation; `kind`/`sourceCheck` omitted; `sources[]`/`url`
   per R2 §2.1 (REQ-OBJ-18 by construction); `inventoryCount` from the header; summary-count check
   as a diagnostic; unmapped verdict fails. (REQ-CONV-3, REQ-CONV-5)
4. `labels.json` side-table schema: 0-based `ordinal` + source id. (REQ-CONV-4)
5. `src/convert/source-note.ts` — `{slug, title, url?, accessed?}` index; bodies raw. (REQ-CONV-5)
6. `src/convert/overrides.ts` — typed `convert-overrides.json` reader, each row cites its source
   line, per-row consumption tracking; the `verdict-rescore` kind; unconsumed row fails.
   (REQ-CONV-6)
7. Validation gate: every emitted claim-ledger sidecar through `parseSidecar`; `failed` aborts, no
   partial output. (REQ-CONV-2, claim-ledger half)
8. Pure + deterministic: `(markdown, ctx) → {sidecar, labels, diagnostics}`; no I/O, no clock,
   sorted keys, stable ordinals. (REQ-CONV-1)
9. Synthetic goldens (claim ledgers + anchor-rung histogram) under the 214 layout; R2 §5 (i)–(vi)
   for claims; R2 header negative controls; `assertShowcaseFixture` on the Tier-1 Contradicted
   claim (S-6 shape, REQ-CORPUS-10). (REQ-CONV-12 amended, claims part)

Out of scope: letters/findings/second-read/rubric/import labels (216); response ledgers, structure
plan, draft ledgers, what-changed, pipeline golden harness (217); DTO projection (218/218a); real
corpus goldens/overrides (219); editing `packages/protocols/fixtures/*` (never).

## Acceptance criteria

| # | AC | Required layer |
|---|---|---|
| 1 | Heading parse rate 100% on the synthetic fixture, zero-unmapped verdict list; each R2 §1 variant in the coverage table has a test | fixture-verified |
| 2 | Every emitted sidecar `parseStatus:"ok"`; negative controls (`"Misleading"`, `"Skipped"` raw; `url` not first determining source) return `failed` | fixture-verified |
| 3 | Anchor rungs/confidences match R2 §3; every emitted anchor resolves through `resolveAnchor` to the same block; histogram golden-pinned | fixture-verified |
| 4 | Summary-count check reproduces the fixture's ledger summary | fixture-verified |
| 5 | Stale override row fails; a consumed re-score applies | fixture-verified |
| 6 | Canonical-JSON goldens byte-equal on re-run | fixture-verified |
| 7 | Optional local smoke on the withheld real export (aggregate parse rates only) — only if 214b produced it | engineered |
| 8 | Universal phase-gate AC (verification green, tests, REQ stamps, BUILD_INDEX/LEDGER, operating clauses) | agentic |

## Plan

- New modules under `packages/demo-corpus/src/convert/` (per R2 §5): `md/sections.ts`,
  `md/quotes.ts`, `anchor.ts`, `claim-ledger.ts`, `source-note.ts`, `overrides.ts`, `index.ts`
  (exports + `canonicalJson`). Pure functions; tests own file I/O against
  `fixtures/synthetic/corpus/` (the already-sanitized golden).
- package.json gains `@rhema/contracts`, `@rhema/findings-core`, `@rhema/protocols` deps; tsconfig
  gains the three project references; `src/index.ts` re-exports the convert API.
- Goldens at `fixtures/synthetic/goldens/the-borrowed-commons/correspondence/{v1,v2}-review/`
  (`01-claim-ledger.json`, `labels.json`) + `anchor-histogram.json`; generated via the committed
  canonical-JSON writer (regen env), byte-compared in tests.
- Decisions recorded: (a) the fixture's `- Source:`/`- Fix:` plain-label bullets are read alongside
  R2's `**Label:**` bold form (fixture's own shape; bold reader stays the R2 contract);
  (b) heading parentheticals/tier qualifiers/verdict remainders all prepend to `note` verbatim;
  (c) `03-claim-ledger.md` (drafter ledger) renders raw per R2 §6 — not converted here;
  (d) no `convert-overrides.json` inside `fixtures/synthetic/corpus/` (it would break the exporter
  byte-identity golden); the mechanism is exercised by synthesized rows in-test.

## Test matrix

- `md/sections.test.ts` — H3-stops-at-H2; bold bullets + continuations; label bullets; table reader
  (escaped `\|`); list reader; links (markdown + bare).
- `md/quotes.test.ts` — quoted-span fragments, ellipsis/bracket splits, word floors, locator strip,
  `(l.N)` hint.
- `anchor.test.ts` — every rung incl. References exclusion / `Ref [n]` inclusion, section fallback,
  resolveAnchor round-trip.
- `source-note.test.ts` — labelled + free-form notes → index.
- `overrides.test.ts` — typed read, missing-cite/unknown-kind rejects, consumption tracking.
- `claim-ledger.test.ts` — fixture: 100% parse, zero unmapped, per-variant assertions, REQ-OBJ-18,
  summary reconcile, labels, histogram, goldens byte-equal, `assertShowcaseFixture` (S-6 shape),
  negative controls, override apply/stale.
  - Coverage-table claim rows → tests: section-style ids / lettered sub-claims / ID parenthetical /
    tier qualifiers / free-text verdicts / non-verdicts / Tier-1-Contradicted-with-source /
    H2-appendix non-gluing / inventoryCount≠row count.

## Progress

- 2026-11-04T01:1xZ — Branch cut off `stevevitali/r7dem-1b-local-export` @ `37a96f4`; Load docs
  read (R2 §1/§2.1/§3/§5/§7, spec §3.3 S-12 §4.1 §4.2 §8, RV-5, prototypes, anchors); deferrals
  read; ledger seeded.
- Implemented `src/convert/{md/sections,md/quotes,anchor,claim-ledger,source-note,overrides,
  result,index}.ts` + tests (64 new tests, 97 package total green); package deps + tsconfig refs;
  goldens regenerated + committed under `fixtures/synthetic/goldens/`; COVERAGE.md additive rows +
  dated corrections; package AGENTS.md layout line.
- **AC7 optional smoke (withheld real export, aggregates only — nothing real-derived committed):**
  all 5 real claim ledgers convert `ok` — entries 267/267 (100%, = R2 §1's table), unmapped
  verdicts 0. Anchor rungs: exact 209, exact-multi 1, normalized 2, fuzzy 50, line 3, section 1,
  none 1 (R2's table: 208/0/2/51/3/0/3 — deltas are the new section-fallback rung absorbing 1 of
  R2's `none`s and exact-multi now counted separately). Summary reconciliation false on all five —
  expected: it needs the real `convert-overrides.json` (219) and GM v2 never reconciles (R2 §1).

## Gap table

| Item (spec §) | Required | Achieved | Status | Evidence |
|---|---|---|---|---|
| D1 shared md readers (REQ-CONV-1) | fixture-verified | fixture-verified | met | `src/convert/md/sections.ts`, `md/quotes.ts`; `md/sections.test.ts` (8), `md/quotes.test.ts` (11) |
| D2 anchor ladder + constants (REQ-CONV-11) | fixture-verified | fixture-verified | met | `src/convert/anchor.ts`; `anchor.test.ts` (15) — every rung, References excl/`Ref [n]` incl., line hints, section fallback, resolveAnchor round-trip |
| D3 claim-ledger converter (REQ-CONV-3/5) | fixture-verified | fixture-verified | met | `src/convert/claim-ledger.ts`; `claim-ledger.test.ts` (17) — 100% parse, zero unmapped, qualifiers→note, final tier, kind/sourceCheck omitted, REQ-OBJ-18, inventoryCount, summary diagnostic, unmapped fails |
| D4 `labels.json` schema (REQ-CONV-4) | fixture-verified | fixture-verified | met | `ClaimLedgerLabels` in claim-ledger.ts; labels goldens + assertions |
| D5 source-note index (REQ-CONV-5) | fixture-verified | fixture-verified | met | `src/convert/source-note.ts`; `source-note.test.ts` (3) — labelled + free-form notes |
| D6 override mechanism (REQ-CONV-6) | fixture-verified | fixture-verified | met | `src/convert/overrides.ts`; `overrides.test.ts` (10) + stale/consume legs in claim-ledger.test.ts |
| D7 parseSidecar gate, fail-closed (REQ-CONV-2) | fixture-verified | fixture-verified | met | gate inside `convertClaimLedger`; sidecar_failed leg; negative controls |
| D8 purity/determinism (REQ-CONV-1) | fixture-verified | fixture-verified | met | no I/O/clock in modules; `canonicalJson` sorted keys; golden byte-equality test |
| D9 goldens + (i)–(vi) + negative controls + S-6 shape (REQ-CONV-12/CORPUS-10) | fixture-verified | fixture-verified | met | `fixtures/synthetic/goldens/`; claim-ledger.test.ts goldens + `assertShowcaseFixture` leg |
| AC7 real-export smoke (optional) | engineered | fixture-verified | met | aggregates in §Progress (267/267, unmapped 0); nothing committed |
| Out-of-scope untouched | — | — | met | no letter/findings/rubric/response/structure/draft-ledger/what-changed/DTO modules; `packages/protocols/fixtures/*` untouched (`git status` clean there) |
| Cross-cutting: no real corpus byte (CORPUS-14/S-12) | — | — | met | only `fixtures/synthetic/**` committed; `check:demo-corpus` 0 violations over new goldens dir |
| Cross-cutting: stance/accessedAt declared approximations (invariant 14, R2 §7 R2) | — | — | met | `accessedAt` = `Checked` session date T00:00:00Z; one stance per claim per declared rule — documented in module header |

## Decisions (owned; no spec deviation — no ADR, same basis as R7DEM.1b)

1. `labels.json` shape `{version:1, claims:[{ordinal,id}]}` and `convert-overrides.json` shape
   `{version:1, overrides:[{kind:"verdict-rescore",claim,verdict,cite,note?}]}` — the ticket
   delegates both schemas to this ticket; recorded here + in module docstrings.
2. `labelBullets` reads `- Label:` (fixture form) alongside R2's `**Label:**` form — additive, the
   bold reader unchanged.
3. `misleading in context` longest-keyword-first so the qualifier remainder is not a spurious
   "in context".
4. Heading parenthetical + tier qualifier + verdict remainder all prepend to `note` verbatim
   (R2 §2.1 names only the verdict remainder; the others are corpus text that would otherwise
   drop — kept, never paraphrased).
5. `03-claim-ledger.md` (drafter ledger) renders raw per R2 §6 — not converted in this ticket.
6. No `convert-overrides.json` inside `fixtures/synthetic/corpus/` — it would break the exporter's
   byte-identity golden; the mechanism is exercised by synthesized rows in-test (COVERAGE.md row).
7. IV2-scope fuzzy anchors at 0.48 to a neighbour block (the claim text is a paraphrase; the
   declared 0.6 floor rule resolves honestly — the low confidence records the weak match).

## Evidence log

- `pnpm exec vitest run packages/demo-corpus` — 13 files / 97 tests pass (64 new).
- `RHEMA_REGEN_GOLDENS=1` regenerated goldens; plain re-run byte-equal (claim-ledger.test.ts).
- `pnpm check:demo-corpus` — clean over the new `fixtures/synthetic/goldens` dir (explicit `--dir` leg).
- `pnpm turbo lint typecheck --filter=@rhema/demo-corpus...` — green.
- Full-repo `pnpm turbo build lint typecheck` + `pnpm test` — see §Evidence report.

## Evidence report

**What shipped.** `packages/demo-corpus/src/convert/` — the pure corpus→sidecar converter base for
216/217: `md/sections.ts` (H3 bodies stop at any H1/H2; bold/plain-label bullets; table and list
readers), `md/quotes.ts` (quote fragments, locator strip, `(l.N)` hints), `anchor.ts` (the R2 §3
ladder + confidence constants; References excluded except `Ref [n]`; line hints; section fallback;
block-relative offsets that round-trip through `resolveAnchor`), `claim-ledger.ts` (R2 §1 heading
grammar at 100%; explicit verdict table, qualifiers verbatim in `note`; final tier on escalation;
`kind`/`sourceCheck` omitted; `sources[]`/`url` per R2 §2.1 so REQ-OBJ-18 holds by construction;
`inventoryCount` from the header; the summary-count check as a diagnostic; `parseSidecar` gate
inside the conversion — `failed` aborts with no partial output), `source-note.ts`
(`{slug,title,url?,accessed?}` index; bodies raw), `overrides.ts` (typed
`convert-overrides.json` reader, `file:line` cites, per-row consumption, `verdict-rescore`;
unconsumed fails). Package deps `@rhema/{contracts,findings-core,protocols}` + tsconfig refs.
Committed goldens under `fixtures/synthetic/goldens/the-borrowed-commons/` (sidecar + labels per
round + `anchor-histogram.json`), canonical-JSON via `canonicalJson`, byte-compared in tests
(`RHEMA_REGEN_GOLDENS=1` regenerates).

**Verification.** `pnpm turbo build lint typecheck` 138/138 · `pnpm test` 6,374 pass / 6 skip /
0 fail · package vitest 97/97 (64 new) · `pnpm check:demo-corpus` clean incl. the new goldens dir ·
goldens byte-equal on re-run · every emitted anchor re-resolves via `resolveAnchor` · AC7 smoke on
the withheld real export: 267/267 headings, 0 unmapped (aggregates only — §Progress).

**Requirement ids.** REQ-CONV-1, REQ-CONV-2 (claim ledgers), REQ-CONV-3, REQ-CONV-4, REQ-CONV-5,
REQ-CONV-6, REQ-CONV-11, REQ-CONV-12 (synthetic claims goldens), REQ-CORPUS-10 (synthetic S-6
shape), REQ-CORPUS-15 (consumer).

**Deferrals:** none opened, none closed. **Deviations:** the seven recorded decisions in §Decisions
— no spec deviation; no ADR (schemas are the ticket's owned deliverables, recorded in code +
COVERAGE.md + this ledger; same basis as R7DEM.1b).

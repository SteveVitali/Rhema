# R7DEM.1 — Corpus exporter, sanitizer, denylist gate, PROVENANCE, synthetic fixture, licence carve-out

Implements `docs/tickets/214_R7DEM.1__corpus-export-sanitize.md` (manifest row 214; Round-7 R7a).
Stage A only ($0): repo-only, no network, and **no real corpus byte anywhere in the diff**
(REQ-CORPUS-14 — the real export is 214b's LOCAL job; sign-off is 214c HUMAN-H14; committed corpus
is 219).

## Summary

- **`@rhema/demo-corpus` package** per add-a-package + R4 §3 checklist: `type: module`,
  build/typecheck/lint, tsconfig extends base, root `tsconfig.json` reference, root `AGENTS.md`
  work-area row + scoped `packages/demo-corpus/AGENTS.md` (layout + "corpus is data, never TS
  literals" + dated decisions).
- **Allowlist-only ingest** (`src/allowlist.ts`): R1 §1 globs + the REQ-CORPUS-11 ruling table
  (RV-37). Exclusions (incl. outline/**, manifest.md, editor notes.md, voice-charter, dotfiles,
  short-v1, values-table*.png, GM fragments, `01-claim-ledger-{A,B}`) carry recorded reasons;
  anything un-ruled fails the export.
- **Sanitizer** (`src/sanitize.ts`): rewrites only, each recorded (rule → replacement, file, line,
  reason). URL guards (`[?&]utm_*` strip, `r.jina.ai` unwrap) run before any `normalizeUrl`
  consumer. Drafts change only for the `figures/` image-path fix. File-targeted rewrites are data
  via the typed `_rules/` reader (`src/rules.ts`); workflow-sense "operator" → "the writer" (S-10)
  comes from authored rows — content-sense lines untouched.
- **Denylist gate** (`src/denylist.ts` + self-contained `tools/demo-corpus/check-corpus.mjs`):
  hard fail over every corpus-derived dir (`corpus/`, `snapshots/`, `goldens/`, incl. fixture
  copies). Bare `Steven`/`Desktop`/`claude`/`operator`/`@example.com` not gated. Line-allowlist =
  file:line only; stale rows fail. Exposed as `pnpm check:demo-corpus`, wired **always-run** into
  CI `public-safe` (the .mjs needs no install). Patterns single-sourced in
  `denylist-patterns.json`; a parity test pins the two implementations.
- **PNG sanitization** (`src/png.ts`): chunk-strip EXIF/XMP/tEXt/private chunks, keep the render
  set with CRCs verified; bytes (never files) copied → no xattrs. Exported image byte-pinned.
- **Per-artifact output + PROVENANCE** (`src/export.ts`): one file per artifact under
  `corpus/<slug>/` + `index.json`, `versions.json` (labels, title/subtitle so the retitle is data,
  "Writer-directed edit (not reviewed)" on v3, Published node `Published · <host> · fetched
  <date>` origin `imported` with url/fetched/sha256 verified), `excluded-refs.json` (REQ-CORPUS-4
  markers, text never deleted), `corpus/PROVENANCE.md` (source identity = HEAD context + sha256
  input-tree digest, export date, allowlist+counts, redaction table, excluded set, Published,
  round/approval facts block — the only facts S-9 may cite) + `export-manifest.json` (per-file
  sha256 + one digest).
- **Deterministic CLI** `tools/demo-corpus/export.mjs` via a private `tools/demo-corpus`
  workspace member resolving `@rhema/demo-corpus` (no relative cross-package import); default
  output = withheld `corpus/`; no clock except the recorded `--date`.
- **Synthetic mini-corpus** `fixtures/synthetic/` (S-12, REQ-CORPUS-15): invented essay
  "The Borrowed Commons" (~1.5k words, non-real names) in source layout with 12 excluded-file
  decoys + the exporter's committed golden + `corpus/_rules/` fixture rules + `COVERAGE.md`
  variant→file table covering every artifact shape and R2 §1 parse variant (section ids,
  lettered sub-claims, parentheticals, tier qualifiers, free-text verdicts, non-verdicts, mixed
  dispositions, moves tables with/without Discharges, free-form source note, a Tier-1 Contradicted
  claim with source, writer-directed version, published.md, figure PNGs).
- **Licence carve-out** (REQ-DOPS-3, ADR-127 filled+Accepted): `LICENSE` (CC BY-NC-ND 4.0 legal
  code + scope preamble), `license: "MIT AND CC-BY-NC-ND-4.0"`, `"type":"asset"` entry in
  `licenses.exceptions.json`, appended `LICENSES.md` "Content outside the MIT grant" section
  (licensor "S. J. Sebastian"). `check:licenses` + `licenses-doc.test.mjs` green.
- **Withholding tripwire**: `.gitignore` withholds `corpus/`, `snapshots/`, `goldens/` with the
  dated "withheld until HUMAN-H14; 219_R7DATA.1 removes" comment; a test fails on any tracked
  withheld path while the marker is present (guards `git add -f`).

## AC → evidence

| AC | layer | evidence |
|---|---|---|
| package builds/lints/typechecks in turbo graph | engineered | `turbo build lint typecheck` 138/138 |
| corpus-location test fires outside the package | engineered | `corpus-location.test.ts` (path-pattern + sha256 legs, planted legs asserted) |
| allowlist: decoys excluded w/ reasons; un-ruled fails | fixture-verified | `allowlist.test.ts`; export log "kept 34, excluded 12" |
| denylist: negatives fail; bare tokens pass; file:line allowlist; stale fails | fixture-verified | `denylist.test.ts` (in-test synthesized negatives + parity with check-corpus.mjs) |
| redaction: rewrites recorded; `_rules` applied; operator→the writer; content untouched; drafts only image-path fix | fixture-verified | `sanitize.test.ts`; golden `PROVENANCE.md` redaction table |
| PNG: no EXIF/XMP/tEXt; still decodes; byte-pinned | fixture-verified | `png.test.ts` |
| published.md → Published node + writer-directed label | fixture-verified | `export.test.ts`; `versions.json` golden |
| re-run byte-identical; manifest digest stable | fixture-verified | `export.test.ts` (fresh tmp export ≡ committed golden incl. digest) |
| withholding tripwire fails on force-added path | engineered | `withholding.test.ts` |
| licence carve-out ×4; check:licenses + doc test green | engineered | LICENSE, package.json, exceptions entry, LICENSES.md §; both checks green |
| `check:demo-corpus` in CI public-safe, green on fixture | engineered | ci.yml always-run step; `node tools/demo-corpus/check-corpus.mjs` → "0 violations" |
| `git ls-files corpus snapshots` empty at head | engineered | `withholding.test.ts` leg 2 |

## Verify

`pnpm turbo build lint typecheck` 138/138 · `pnpm test` 531 files / 6,293 pass / 6 skip /
0 fail · `pnpm check:licenses` OK (822 pkgs) · `licenses-doc.test.mjs` green ·
`check:demo-corpus` clean · `check-build-memory.sh .` 0 violations (15 pre-existing warnings) ·
append-only vs `stevevitali/r7copy-0-run-card` verified at close · gitleaks = CI's always-run
(the fixture commits no credential-shaped bytes; invented names only).

## Requirement ids

REQ-CORPUS-1, -2, -3, -4 (data half), -5, -6, -7 (facts half), -8 (data half), -9 (corpus half),
-10 (fixture row only), -11, -12 (data shape), -13, -15; REQ-DOPS-1 (corpus half), REQ-DOPS-3.

## Design decisions / deviations

- `_rules/` schema (this ticket owns it): `rewrites.json` (id+file+line+literal pattern→
  replacement+reason), `line-allowlist.json` (file:line only), `facts.json` (per-slug
  sourceCommit + writerDirected + approvals). A stale row fails closed.
- `published.md` front-matter shape (214b's fetch writes it): `---\nurl|fetched|sha256\n---` where
  sha256 covers the stored body; the exporter verifies it before sanitizing.
- The `~/agent-scratch/...` source path is never written into PROVENANCE (it would trip the gate);
  source identity = descriptive root + slug + HEAD context + input-tree sha256.
- **Size deviation:** the diff runs ~2.1k changed lines excl. fixture/licence/generated vs the
  ~750 M-upper note — dominated by ~500 lines of tests and ~700 of exporter modules. The ticket's
  own (a)/(b) split cut was not taken because the deliverables interlock (gate + provenance +
  versions all proven on the same fixture run); reported here for the operator rather than
  silently stretched.

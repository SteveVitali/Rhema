# R7DEM.1 — Corpus exporter, sanitizer, denylist gate, PROVENANCE, synthetic fixture, licence carve-out

- **Spec:** `docs/tickets/214_R7DEM.1__corpus-export-sanitize.md` (seq 214 of 254; manifest row 214)
- **Base:** `stevevitali/r7copy-0-run-card` @ `4d3ae09` (chainTip; stack rides unmerged PRs #240–#244, OPERATOR)
- **Branch:** `stevevitali/r7dem-1-corpus-export`
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** e981ec5
- **Started:** 2026-11-03T22:41Z
- **Config:** Stage A only ($0). No preview (GD-PREVIEW.R7), no network, never reads the real
  corpus (REQ-CORPUS-14 — real export is 214b's LOCAL job; corpus sign-off is 214c HUMAN-H14;
  committed-corpus is 219). Size budget ~750 changed lines excl. fixture/licence/generated.
- **Closed:** 2026-11-04T00:09Z
- **ci:** pass #245@`ad1906d` (run 41740742054 — all legs + `ci-pass` anchor; `logs/ci-R7DEM.1.json`).
  Two earlier heads read red (`709e7e7`, `b228456`): the fixture golden was `.gitignore`-swallowed —
  `corpus/` matched `fixtures/*/corpus/` — fixed by root-anchoring the withheld patterns
  (`/corpus/` `/snapshots/` `/goldens/`) and renaming the dotfile decoy to `.ds-store` (the root
  `.gitignore` swallows `.DS_Store` itself).

## Deferrals read

- `D-R6OSS.1-1` OPEN — repo public, history permanent → the withholding tripwire lands before any
  real export exists (this ticket's deliverable 14). The row itself is operator-owned (flip +
  per-class dispositions); this ticket does not close it.
- `D-R7OPEN.1-1`, `D-R7KIT.1-1`, `D-R7RO.1-1`, `D-R7FIX.1-1`, `D-R7COPY.0-1/-2` OPEN — Stage-B legs
  at 224's phase preview; unaffected by a repo-only corpus ticket.
- Expected opens: a Stage-B row only if an AC leg cannot be proven repo-locally; all ACs here are
  deterministic/fixture-verified → likely none, or one carry note.

## Requirements

1. `@rhema/demo-corpus` package per add-a-package rules + R4 §3 checklist (REQ-CORPUS-6,
   REQ-DOPS-3): `type: module`, build/typecheck/lint, tsconfig extends base, root tsconfig ref,
   root AGENTS work-area row + scoped AGENTS (layout + "corpus is data, never TS literals").
2. Corpus location: content only in `packages/demo-corpus`, never `apps/web/src/spa`, `copy.ts`,
   `docs/`; test fails on a planted corpus file outside (path pattern or manifest sha256)
   (REQ-DOPS-1 corpus half).
3. Allowlist-only ingest: R1 §1 globs + REQ-CORPUS-11 ruling table (RV-37); excluded decoys with
   recorded reasons; un-ruled file fails (REQ-CORPUS-1, REQ-CORPUS-11).
4. Sanitizer: rewrites only, each recorded (rule → replacement, file, line, reason); URL guards
   (utm strip, r.jina.ai unwrap) before any normalizeUrl consumer; drafts change only for the SPD
   `figures/` image-path fix; file-targeted `_rules/` data via typed reader; fixture carries its
   own rules (REQ-CORPUS-3 as amended by S-10).
5. Denylist gate (hard fail) over every corpus-derived output with R1 patterns; bare
   `Steven`/`Desktop`/`claude`/`operator`/`@example.com` not gated; line-allowlist names file:line
   only; stale entry fails; `pnpm check:demo-corpus` + CI `public-safe` always-run (REQ-CORPUS-2).
6. Image sanitization: PNG chunk-strip EXIF/XMP/tEXt beyond render needs; xattrs never travel
   (bytes not files); exported fixture image byte-pinned; no new dep (REQ-CORPUS-5).
7. Excluded-reference markers detected + recorded for the renderer ("not published" non-links;
   text never deleted) (REQ-CORPUS-4 data half).
8. One output file per source artifact + an index (REQ-CORPUS-9 corpus half).
9. `PROVENANCE.md` writer: source identity (HEAD context + sha256 input-tree digest), export
   date, allowlist+counts, redaction table, excluded set, Published entries, round/approval facts
   block; plus `export-manifest.json` (per-file sha256 + digest) (REQ-CORPUS-7 facts half, 11).
10. Version metadata + Published data shape: labels, title/subtitle (retitle is data, RV-30),
    origin, "Writer-directed edit (not reviewed)" (S-10); `published.md` → Published node
    (`Published · host · fetched YYYY-MM-DD`, origin `imported`, URL link) through the same
    sanitize+denylist path (REQ-CORPUS-13; REQ-CORPUS-12 data shape; REQ-CORPUS-8 data half).
11. `tools/demo-corpus/export.mjs`: deterministic CLI (no clock except recorded date input,
    sorted, byte-stable); private `tools/demo-corpus` workspace member resolves
    `@rhema/demo-corpus` (REQ-CORPUS-11).
12. Synthetic mini-corpus `fixtures/synthetic/` (S-12, REQ-CORPUS-15): invented essay ~1.5k words,
    non-real names, source layout with decoys + exported golden; covers every artifact shape and
    every R2 §1 parse variant; committed coverage table; denylist negatives synthesized in-test.
13. Licence carve-out (REQ-DOPS-3, ADR-127): LICENSE (CC BY-NC-ND 4.0), license field,
    `"type":"asset"` in licenses.exceptions.json, appended LICENSES.md section; ADR-127 filled.
14. Withholding tripwire: `.gitignore` withholds `corpus/**` incl. `_rules/`, `snapshots/**`,
    real goldens w/ dated comment; test fails if any withheld path is tracked while marker present.

## Test matrix

- `corpus-location.test.ts` — planted corpus file outside package fails (path + sha256 legs).
- `allowlist.test.ts` — every fixture decoy excluded with reason; tmp un-ruled file fails export.
- `denylist.test.ts` — in-test negatives for every hard pattern; bare Steven/Desktop/claude/
  operator/@example.com pass; file:line allowlist passes exactly its line; stale entry fails;
  parity with the self-contained `check-corpus.mjs` CLI.
- `sanitize.test.ts` — each rewrite recorded; `_rules/` rows applied; workflow "operator" → "the
  writer", content sense untouched; drafts change only by image-path fix.
- `png.test.ts` — EXIF/XMP/tEXt dropped beyond allowlist; output decodes (chunk CRCs valid);
  exported image byte-pinned.
- `export.test.ts` — re-run on synthetic source is byte-identical to committed golden;
  manifest digest stable; `published.md` → Published node (URL/date/sha256/origin imported);
  writer-directed label; excluded-refs recorded; index/versions emitted.
- `withholding.test.ts` — withheld-path force-add fails while marker present.

## Plan

See `## Requirements` order; files per deliverable list. Modules: `src/{allowlist,sanitize,rules,
denylist,png,provenance,versions,export,index}.ts` + `denylist-patterns.json` (single pattern
source for both the TS gate and the self-contained `tools/demo-corpus/check-corpus.mjs` — parity
test pins them). `check-corpus.mjs` is dependency-free so `pnpm check:demo-corpus` can be
always-run in `public-safe` without an install.

## Progress

- 2026-11-03 — context loaded: ticket, spec §3.1/3.2/3.3/4.1/4.17/8, R1 (allowlist, denylist
  census, sizes, requirements), R2 §1 taxonomy + §7 R6, R4 §3 + §5 + REQ-DEMO-OPS-1, REVIEW
  RV-5/RV-30/RV-37; anchors (pnpm-workspace tools/* glob, root tsconfig, tokens shape, vitest
  `packages/**` discovery, licences files + doc test, gitleaks, ci public-safe, copy-containment);
  ADR-127 shell + GATE DECISIONS Round-7 rows + LEDGER/BUILD_INDEX/run-ledger formats. Branch cut
  at 4d3ae09.

## Gap table

| item (spec §) | required | achieved | status | evidence |
|---|---|---|---|---|
| 1 package + wiring (REQ-CORPUS-6, DOPS-3) | engineered | engineered | met | turbo 138/138; root tsconfig ref; AGENTS rows |
| 2 corpus-location test (REQ-DOPS-1 corpus half) | engineered | engineered | met | `corpus-location.test.ts` — path + sha256 legs; planted legs asserted |
| 3 allowlist ingest (REQ-CORPUS-1/11) | fixture-verified | fixture-verified | met | `allowlist.test.ts`; 12 decoys excluded w/ reasons; un-ruled tmp source fails |
| 4 sanitizer + `_rules` (REQ-CORPUS-3, S-10) | fixture-verified | fixture-verified | met | `sanitize.test.ts` 6 legs; PROVENANCE redaction table |
| 5 denylist gate + check script + CI (REQ-CORPUS-2) | engineered | engineered | met | `denylist.test.ts` (negatives, bare-token pass, file:line, stale) + mjs parity leg; ci.yml step |
| 6 PNG strip (REQ-CORPUS-5) | fixture-verified | fixture-verified | met | `png.test.ts`; dropped [tEXt,eXIf,iTXt,caNv,tIME]; byte-pinned |
| 7 excluded-ref markers (REQ-CORPUS-4) | fixture-verified | fixture-verified | met | `excluded-refs.json` golden; `export.test.ts` |
| 8 per-artifact files + index (REQ-CORPUS-9 corpus half) | fixture-verified | fixture-verified | met | `index.json` golden (34 artifacts, sha256 each) |
| 9 PROVENANCE + manifest (REQ-CORPUS-7/11) | fixture-verified | fixture-verified | met | `PROVENANCE.md` golden; digest-stable manifest |
| 10 versions + Published node (REQ-CORPUS-13/12/8) | fixture-verified | fixture-verified | met | `versions.json`: retitle as data, writer-directed label, Published node url/date/sha256/imported |
| 11 deterministic CLI (REQ-CORPUS-11) | fixture-verified | fixture-verified | met | byte-identical re-run leg in `export.test.ts` |
| 12 synthetic fixture (REQ-CORPUS-15, S-12) | fixture-verified | fixture-verified | met | `fixtures/synthetic/` + `COVERAGE.md` table |
| 13 licence carve-out (REQ-DOPS-3, ADR-127) | engineered | engineered | met | LICENSE + field + exception + LICENSES.md; ADR-127 filled |
| 14 withholding tripwire (REQ-CORPUS-14) | engineered | engineered | met | `.gitignore` marker + `withholding.test.ts` |
| universal phase-gate AC | agentic | engineered | met | verification green; ids stamped; ADR-127 written; records appended |

## Evidence log

- `pnpm turbo build lint typecheck` → 138/138 tasks green.
- `pnpm exec vitest run packages/demo-corpus` → 30/30 pass.
- `pnpm test` → 531 files, 6,293 pass / 6 skipped / 0 failed.
- `pnpm check:licenses` → OK (822 packages); `licenses-doc.test.mjs` → 4/4.
- `node tools/demo-corpus/check-corpus.mjs` → "clean — 1 corpus dir(s) scanned, 0 violations".
- `node tools/demo-corpus/export.mjs --source fixtures/synthetic/source --slug the-borrowed-commons --corpus fixtures/synthetic/corpus --date 2026-11-03` → "kept 34, excluded 12, redactions 12, published yes; gate passed".
- `check-build-memory.sh .` → 0 violations, 15 pre-existing warnings.
- `git ls-files packages/demo-corpus/corpus packages/demo-corpus/snapshots packages/demo-corpus/goldens` → empty.

## Evidence report

See `docs/build/pr/R7DEM.1.md` (the committed PR body) — AC table, verification summary, design
decisions and the recorded size deviation are there verbatim.

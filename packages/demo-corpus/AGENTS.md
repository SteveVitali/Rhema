# AGENTS.md — @rhema/demo-corpus

## Purpose

- The public demo corpus: the allowlist exporter, the sanitizer, the denylist gate, the
  PROVENANCE writer, and the committed synthetic mini-corpus every later demo test uses.
- Root `AGENTS.md` applies. Corpus content is **data, never TS literals** (REQ-CORPUS-6): essay
  and dossier text ships as committed markdown/PNG/JSON files so product-copy lint, launch-surface
  lint and `COPY` checks never see it. A rule that needs a regex over corpus text is a bug sign.

## Layout (decided 2026-11-03, R7DEM.1)

- `corpus/` — real export output. `corpus/<slug>/` mirrors the source artifact layout;
  `corpus/PROVENANCE.md`, `corpus/export-manifest.json`, `corpus/_rules/` (file-targeted
  rewrites, denylist line-allowlist, per-slug facts). **All withheld** until HUMAN-H14;
  219_R7DATA.1 removes the `.gitignore` entries and commits the real export.
- `snapshots/`, `goldens/` — real derived data, withheld the same way.
- `fixtures/synthetic/` — committed. `source/<slug>/` is the invented source tree (with
  excluded-file decoys); `corpus/` is the exporter's own committed golden (its `_rules/` exercises
  the real reader); `COVERAGE.md` maps every artifact shape and parse variant to its fixture file.
  215–218a may add files additively and update COVERAGE.md; they never edit a source file's
  existing bytes.
- `src/` — exporter modules (allowlist, sanitize, rules reader, denylist gate, png, provenance,
  versions, export orchestrator). Pure Node; no network, no clock (the export date is an input).
- `denylist-patterns.json` — single pattern source shared by `src/denylist.ts` and
  `tools/demo-corpus/check-corpus.mjs` (self-contained so `check:demo-corpus` is always-run in CI).

## Critical rules

1. **No real corpus byte in this repo before HUMAN-H14** (REQ-CORPUS-14, D-R6OSS.1-1 — public
   history is permanent). The exporter's real run is a LOCAL act by 214b; tests prove the gates on
   the synthetic fixture only. Denylist negative controls are synthesized in-test, never committed
   as literal identity tokens.
2. **Fail closed.** An un-ruled source file fails the export; an unlisted denylist hit fails the
   gate; a stale rewrite or allowlist row fails. Never widen the allowlist to keep a run green.
3. **`_rules/` are data, not code.** Rewrites and line-allowlist entries name file:line and carry
   no quoted private text. The schema is owned here (rewrites.json, line-allowlist.json,
   facts.json); 214b authors the real rows.
4. **`pnpm check:demo-corpus`** gates every corpus-derived dir (`corpus/`, `snapshots/`,
   `goldens/` incl. under `fixtures/*/`); it must run before any corpus commit.
5. **Licence carve-out (ADR-127, REQ-DOPS-3).** `corpus/**` (and corpus-derived snapshots/goldens)
   are CC BY-NC-ND 4.0 by "S. J. Sebastian"; package code is MIT. See `LICENSE` and LICENSES.md.

# R7DEM.1b — Published fetch, local real export and the HUMAN-H14 review packet

Implements `docs/tickets/214b_R7DEM.1b__published-fetch-real-export.md` (manifest row 214b; Round-7
R7a). Stage A only ($0): one pre-authorized read-only fetch plus repo-local work. **No real corpus
byte, `_rules/` row, path:line or redaction row is committed** (REQ-CORPUS-14, rule 6) — the real
export lives only at the withheld, gitignored `packages/demo-corpus/corpus/` and is handed to the
operator as the H14 review packet.

## Summary

- **`tools/demo-corpus/fetch-published.mjs`** (REQ-CORPUS-12 fetch half, REQ-CORPUS-8 fetch half):
  a one-time operator-run fetch converting each live post to markdown via turndown+gfm and writing
  `published.md` in 214's front-matter shape (url / fetched / sha256-of-body) under the withheld
  `agent-scratch/` source root. The four post URLs are a committed constant; `resolvePost` refuses
  anything else. GET only (`redirect:"error"` — a redirect is a fifth URL); headers are exactly
  `accept` + `user-agent`; `assertOutDir` refuses any repo-internal output; `main()` runs only on
  direct CLI invocation.
- **The one pre-authorized run (spec §6 / GD-RATIFY.R7 / GD-DEMO-PUBLISHED.R7):** run once on
  2026-11-04 — four GETs, one per post, no credentials/cookies, output only to the withheld path.
  Conditions held; see `docs/build/runs/R7DEM.1b.md`.
- **Real `_rules/` data authored (withheld `corpus/_rules/`)**: 96 file-targeted rewrite rows
  (workflow-sense "operator" → "the writer" per S-10 — statutory/telecom senses untouched;
  reader-proxy annotations → "a reader proxy"; utm prose → "a deep-research tracking parameter";
  private scratch paths → migrated draft paths), 3 denylist line-allowlist entries for the
  Published credit lines only (S-11), and per-slug `facts.json` (round/approval facts for S-9;
  SPD v3/v4 + CoR v4 marked writer-directed per REQ-CORPUS-13).
- **The local real export + all gates green**: kept 962, excluded 43, redactions 151, published
  4/4. Sanitizer inline, `pnpm check:demo-corpus` 0 violations, `gitleaks dir` 0 leaks.
- **The H14 packet** = the withheld export + `PROVENANCE.md` + `export-manifest.json`; the run
  record maps every 214c checklist item to packet files.

## Real-data defects fixed in 214's code (synthetic tests first, per the ticket's defect clause)

- `identity-vitali` bare-substring false-fired on scholarly "revitalization" prose →
  `vitali(?![a-z])` (all real token forms still fail: Vitali/stevenvitali/SteveVitali/*-vitali).
- The denylist gate line-scanned re-encoded PNG binary (`~/` byte pairs in IDAT) → `.png` output
  is never text-scanned (TS gate + self-contained checker, parity tested).
- `_rules` rewrite `file` is project-relative but projects share paths (e.g.
  `correspondence/v1-response.md` exists in three) → optional `slug` scope on `FileRewrite`;
  unscoped rows still apply to every project (backward compatible).

## Requirement IDs

REQ-CORPUS-12 (fetch half; the data shape was 214's), REQ-CORPUS-8 (fetch half), REQ-DOPS-4.

## Verification

- `pnpm turbo build lint typecheck` → 138/138 tasks green.
- `pnpm test` → 532 files, 6,309 pass / 6 skipped / 0 failed.
- `pnpm exec vitest run tools/demo-corpus/fetch-published.test.mjs` → 13/13 (fixtures: conversion,
  front matter + sha256 contract through 214's real parser, URL refusal, GET/no-credential request
  shape, out-dir guard, non-OK failure, never-invoked scan ×3).
- `pnpm check:demo-corpus` → clean, 2 corpus dirs, 0 violations.
- `gitleaks dir packages/demo-corpus/corpus --config .gitleaks.toml` → no leaks found (~5.50 MB).
- Digest reproducibility: two clean exports → identical
  `19861a06c4401b8f9e1798751fe7dd6ab0e03b8670e974a4aab638c542116c91`.
- `git ls-files packages/demo-corpus/corpus packages/demo-corpus/snapshots
  packages/demo-corpus/goldens` → empty; `agent-scratch/` still gitignored upstream.

## AC → evidence

| AC | layer | evidence |
|---|---|---|
| Fetch unit tests on fixtures (conversion, front matter, refusal, no creds) | fixture-verified | 13/13 in `fetch-published.test.mjs` |
| Never-invoked test | engineered | scan legs fail on any script/CI/test reference |
| Pre-authorized fetch ran once; conditions held; PROVENANCE records url/date/sha256 | live-executed | run log + withheld PROVENANCE "Published" ×4 |
| Real export; sanitizer+denylist+`gitleaks dir` pass; aggregates-only records | live-executed | counts above; packet withheld |
| Second run reproduces manifest digest | engineered | identical digest over two clean exports |
| Packet answers 214c items + map | engineered | checklist → file map in `runs/R7DEM.1b.md` |
| `git ls-files` withheld paths empty; no published.md/_rules tracked | engineered | verified empty; `/corpus/` ignored |
| Universal phase-gate | — | build/lint/typecheck/test green; REQ ids stamped |

## The H14 packet (what the operator signs)

- **Path:** `packages/demo-corpus/corpus/` (withheld; regenerate deterministically from the same
  inputs if removed).
- **export-manifest digest:** `19861a06c4401b8f9e1798751fe7dd6ab0e03b8670e974a4aab638c542116c91`
  (978 entries).
- **Per-slug input tree digests** and Published (url, fetched 2026-11-04, sha256) are in
  `corpus/PROVENANCE.md`.
- This ticket ends at the packet: 214c_HUMAN-H14 is the operator's sign-off; 219 commits only
  bytes whose digest matches the signed one.

# R7DEM.1b — Published fetch, local real export and the HUMAN-H14 review packet

- **Spec:** `docs/tickets/214b_R7DEM.1b__published-fetch-real-export.md` (seq 214b of 254; manifest row 214b)
- **Base:** `stevevitali/r7dem-1-corpus-export` @ `fdbdb3b` (chainTip; stack rides unmerged PRs #240–#245, OPERATOR)
- **Branch:** `stevevitali/r7dem-1b-local-export`
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** e981ec5
- **Started:** 2026-11-04T00:15Z
- **Config:** Stage A only ($0). No preview (GD-PREVIEW.R7). ONE pre-authorized network act: the
  Substack fetch (spec §6; GET only, exactly the four post URLs, no credentials/cookies, output to
  the withheld path only, never wired into build/test/runtime). Every other act is repo-local.
  No real corpus byte is committed (REQ-CORPUS-14; 214c_HUMAN-H14 → 219_R7DATA.1). Size budget
  ~300 changed lines excl. withheld data.
- **Closed:** 2026-11-04T00:36Z
- **ci:** pending #246@`99f66a3` (fast-path pass; typecheck/lint/unit pending at bounded read, run 41747225729; `logs/ci-R7DEM.1b.json`). Closeout-commit head `f6e240c` re-runs CI; the next boundary read decides.

## Deferrals read

- `D-R6OSS.1-1` OPEN — repo public, history permanent → the gates run here on withheld output
  before any commit. Operator-owned row; not closed by this ticket.
- `D-R7OPEN.1-1`, `D-R7KIT.1-1`, `D-R7RO.1-1`, `D-R7FIX.1-1`, `D-R7COPY.0-1/-2` OPEN — Stage-B
  legs owed at 224's phase preview; a local corpus ticket does not touch them.
- Expected opens: none, unless a post fetch fails (`D-R7DEM.1b-1` per the ticket's own deferral
  note: withholds REQ-CORPUS-12 for that essay; unblocked by a successful re-run under the same
  pre-authorization).

## Pre-authorization conditions (spec §6 / ticket Gate status) — each held

| # | Condition | Held |
|---|---|---|
| 1 | GET only | ✅ — `buildRequest` fixes `method:"GET"`, `redirect:"error"` (a redirect is a fifth URL, refused by construction); the run log shows exactly four GETs, one per post |
| 2 | Exactly the four post URLs | ✅ — `POSTS` committed constant (4 sjsebastian.substack.com URLs); `resolvePost` refuses anything else; no URL taken from argv/env/config |
| 3 | No credentials, no cookies | ✅ — request headers are exactly `accept` + `user-agent`; no env/keychain/config read; test asserts the header set |
| 4 | Output only to the withheld path | ✅ — written to `<source>/<slug>/published.md` under `agent-scratch/` (gitignored upstream, verified at `origin/main:.gitignore:3`); `assertOutDir` refuses any repo-internal target |
| 5 | Never wired into build/test/runtime | ✅ — no package.json script, CI workflow or test references the tool (the never-invoked test scans tracked files and fails on any new reference); `main()` runs only on direct CLI invocation |

The one pre-authorized run: `node tools/demo-corpus/fetch-published.mjs --date 2026-11-04` on
2026-11-04 → four posts fetched once each, `published.md` written under the withheld source root.
No other network act in the run.

## Requirements

1. `tools/demo-corpus/fetch-published.mjs`: one-time operator-run fetch of each live post →
   markdown (turndown precedent), written as `published.md` in 214's front-matter shape
   (url, fetched, sha256). The four URLs are a committed constant; any other URL refused.
   GET only; no cookie/credential header. Never invoked by build/test/runtime (a test asserts
   no package.json script, CI workflow or test references it). (REQ-CORPUS-12 fetch half,
   REQ-CORPUS-8 fetch half)
2. Unit tests on local HTML fixtures, no network: conversion, front matter, URL refusal,
   absence of cookie/credential headers.
3. The one pre-authorized run: run once; output to the withheld path only; record that each
   condition held.
4. Real file-targeted `_rules/` data (withheld `corpus/_rules/`): rewrites covering R1 §2's
   per-pattern rules incl. workflow-sense "operator" → "the writer" (S-10); denylist
   line-allowlist entries for the Published credit lines only (file:line, S-11). Prefer
   sanitizer stripping over `.gitleaks.toml` entries.
5. The local real export over the four projects + fetched `published.md`; then the gates on
   the withheld output: sanitizer (inside the export), `pnpm check:demo-corpus` (denylist),
   `gitleaks dir` over the output path. All pass. (REQ-DOPS-4)
6. The HUMAN-H14 review packet = the withheld export + PROVENANCE.md + export-manifest.json,
   answering every 214c checklist item; re-running the exporter reproduces the manifest digest;
   the run record commits only aggregate counts, the input tree digest, the export-manifest
   digest, the exporter SHA and the packet's local path — no corpus line, path:line or
   redaction row.

## Acceptance criteria (from the ticket)

1. fetch unit tests pass on local HTML fixtures: conversion, front matter (url/date/sha256),
   non-listed-URL refusal, no cookie/credential header (deterministic · fixture-verified)
2. a test fails if any package.json script, CI workflow or test references fetch-published.mjs
   (deterministic · engineered)
3. pre-authorized fetch ran once for the four posts; url, fetch date, sha256 in local
   PROVENANCE; run record states the conditions held (agentic · live-executed)
4. real export run locally; sanitizer + denylist + `gitleaks dir` pass on withheld output;
   record commits only aggregate counts, input tree digest, manifest digest, exporter SHA —
   no corpus line/path:line/redaction row (agentic · live-executed)
5. a second exporter run reproduces the recorded export-manifest digest (deterministic · engineered)
6. the packet answers every 214c checklist item; run record has checklist-item → packet-file
   map, file names only (agentic · engineered)
7. `git ls-files packages/demo-corpus/corpus packages/demo-corpus/snapshots` empty at PR head;
   no published.md or _rules/ file tracked (deterministic · engineered)
8. universal phase-gate AC (agentic)

## Plan

1. Write `tools/demo-corpus/fetch-published.mjs` (turndown + gfm, declared in the tools
   package — already licence-checked in `apps/convert`) with importable pure functions for
   tests and a `main()` guarded to CLI invocation only.
2. `tools/demo-corpus/fetch-published.test.mjs` + committed synthetic HTML fixtures.
3. `pnpm install` to link `turndown`/`turndown-plugin-gfm` into `tools/demo-corpus`.
4. Run the ONE fetch (4 GETs, `redirect:"error"`, no cookie/authorization headers) writing
   `<source>/<slug>/published.md` under the gitignored `agent-scratch/` root.
5. Scan the real source for R1 §2 rewrite classes (denylist-gated leftovers via a dry export,
   plus proactive scans for non-gated prose classes); author `corpus/_rules/rewrites.json`,
   `line-allowlist.json` (Published credit lines only), `facts.json`.
6. Export → `check:demo-corpus` → `gitleaks dir`; iterate `_rules/` until all green (each
   residual gate hit becomes a rewrite or, only for S-11 credit lines, an allowlist row).
7. Digest reproducibility: clean re-export twice, compare digests.
8. Self-review → gap table → verification → commit (records + tool only) → PR → CI read →
   BUILD_INDEX/LEDGER close.

## Test matrix

- `fetch-published.test.mjs`: fixture conversion (headings/links/lists/emphasis), front-matter
  shape + sha256 == body digest, POSTS constant = exactly the four posts, non-listed URL/slug
  refused, stubbed fetch sees GET + no cookie/authorization headers + redirect:"error",
  out-dir guard refuses repo-internal path, non-OK response fails naming the slug, and the
  never-invoked scan (no package.json script / CI workflow / other test references the tool).

## Progress

- 2026-11-04 — context loaded: ticket, spec §3.1/§3.3 (S-9–S-12)/§4.1 (REQ-CORPUS-8/11/12/14)/
  §4.17 (REQ-DOPS-4)/§6 (pre-authorized acts; H14)/§8, R1 §1/§2/§6/Requirements, R4 §3 gitleaks
  + §5 D-R6OSS.1-1, 214c checklist, demo-corpus AGENTS + runs/R7DEM.1.md; anchors confirmed:
  `export.mjs`, `check:demo-corpus`, `.gitignore` + withholding tripwire, turndown in
  `apps/convert/package.json`, `.gitleaks.toml`, gitleaks 8.30.1 (≥8.19).
- 2026-11-04 — source root confirmed: `~/agent-discourse/agent-scratch/projects/` holds the four
  slugs; `agent-scratch/` gitignored at `~/agent-discourse/.gitignore:3` AND in
  `origin/main:.gitignore` (fetched 2026-11-04 — upstream still ignores it). agent-discourse HEAD
  `c3b434d7feec9ef341c425997d72b703e1358701`. Branch cut at `fdbdb3b`.

## Gap table

| item (spec §) | required | achieved | status | evidence |
|---|---|---|---|---|
| 1 fetch tool: constant, refusal, GET, no creds, withheld out, front-matter shape (REQ-CORPUS-12/-8 fetch halves) | fixture-verified | fixture-verified | met | `fetch-published.test.mjs` 13 legs on committed fixtures |
| 2 never-invoked test (package.json/CI/tests) | engineered | engineered | met | `fetch-published.test.mjs` last describe (3 legs) |
| 3 one pre-authorized run, conditions held, PROVENANCE entries | live-executed | live-executed | met | run log above; PROVENANCE "Published" ×4 (withheld) |
| 4 real `_rules/` data: rewrite rows (S-10/R1 §2) + credit-line allowlist (S-11) | live-executed | live-executed | met | withheld `corpus/_rules/` (96 rewrites, 3 allowlist, 4-slug facts); export applied all 96 (stale check would fail otherwise) |
| 5 real export + sanitizer + denylist + `gitleaks dir` all pass; aggregates only in records | live-executed | live-executed | met | export gate passed inline; `check:demo-corpus` 0 violations (2 dirs); `gitleaks dir` 0 leaks over 5.50 MB |
| 6 digest reproducibility | engineered | engineered | met | two clean exports → identical `export-manifest.json` digest |
| 7 H14 packet answers each 214c item + map | engineered | engineered | met | map below; packet = withheld `packages/demo-corpus/corpus/` |
| 8 `git ls-files` withheld paths empty | engineered | engineered | met | 0 tracked; `git check-ignore` matches `/corpus/` |
| universal phase-gate AC | agentic | engineered | met | turbo 138/138; vitest 6,309/0 fail; memory checks below |

Defects found on real data and fixed in 214's code with synthetic tests first (ticket's defect clause):
- `identity-vitali` bare-substring false-fired on scholarly "revitalization" prose → pattern
  `vitali(?![a-z])` (every real token form still fails); `denylist.test.ts` leg.
- The gate line-scanned re-encoded PNG binary → `~/` byte pairs false-fired in IDAT; `.png` output
  is never text-scanned (denylist.ts + check-corpus.mjs, parity); `denylist.test.ts` legs.
- `_rules` rewrite `file` is project-relative but projects share paths
  (`correspondence/v1-response.md` ×3) → optional `slug` scope on `FileRewrite`
  (rules/sanitize/export); `sanitize.test.ts` leg. Backward compatible (unscoped = every project).
- bublitz source note has `https://r.jina.ai/` inside a prose annotation (not URL-prefix form) →
  covered by an authored rewrite row, not a code change.

## Evidence log — committed aggregates only (no corpus byte, path:line or redaction row lands here)

- Fetch run (2026-11-04): 4 GETs, one per post; `published.md` ×4 written under the withheld
  source root; sha256 of each body recorded in the file's front matter (and PROVENANCE).
- Real export: `export.mjs --slug <4> --date 2026-11-04` → kept 962, excluded 43, redactions 151
  (96 authored rows + 55 generic applications), published 4/4; manifest 978 entries.
- `pnpm check:demo-corpus` → "clean — 2 corpus dir(s) scanned, 0 violations".
- `gitleaks dir packages/demo-corpus/corpus --config .gitleaks.toml` → "no leaks found" (~5.50 MB).
- Reproducibility: two clean exports → identical digest
  `19861a06c4401b8f9e1798751fe7dd6ab0e03b8670e974a4aab638c542116c91`.
- Per-slug allowlisted input tree digests (sha256): constitution-of-reason
  `313fb05c3e0821f240d3dba904291adcf6f34c6e2b4a43a96a6503e65a0b511e` ·
  structure-of-political-difference `21f535682c7a41a49ba1288c7c75aaff4dc3068deea77a3bc9973f8f531fbb9f` ·
  the-governable-mind `637899ba0254d2e0e0799b4dd4af5c1d007ba6d6295a320b9d3965382a3401e6` ·
  the-politics-of-visibility `718d6e4890ae05bf9f90749abe03697e29c1c1d04f82984c01b71551fa3c2592`.
- Published sha256 per essay is recorded in `corpus/PROVENANCE.md` (withheld) — reproduced in
  `docs/build/pr/R7DEM.1b.md` as the only per-essay digests committed.
- Exporter SHA: the export ran on this branch's worktree (base `fdbdb3b` + this ticket's diff);
  the canonical code reference is the PR head SHA (recorded at close).
- **H14 packet local path:** `/Users/stevenvitali/Rhēma/packages/demo-corpus/corpus/` (withheld —
  `packages/demo-corpus/.gitignore` `/corpus/`; regenerate deterministically with
  `export.mjs --slug <4> --date 2026-11-04` from the same inputs if removed).
- Verification: `pnpm turbo build lint typecheck` 138/138 · `pnpm test` 532 files, 6,309 pass /
  6 skip / 0 fail · `fetch-published.test.mjs` 13/13 · package vitest incl. new denylist/sanitize
  legs green · `check:demo-corpus` 0 violations · gitleaks clean.

## H14 packet — 214c checklist → packet-file map (file names only)

| 214c checklist item | Packet file(s) |
|---|---|
| Allowlist with counts per essay | `PROVENANCE.md` (per-slug "Allowlist" tables) · `<slug>/index.json` |
| Redaction table | `PROVENANCE.md` ("Redactions applied") · `_rules/rewrites.json` |
| Excluded set with reasons | `PROVENANCE.md` ("Excluded") · `<slug>/excluded-refs.json` (dangling refs marked) |
| Round/approval facts (S-9) | `PROVENANCE.md` ("Round and approval facts") · `_rules/facts.json` |
| Published entries (url, date, sha256) | `PROVENANCE.md` ("Published") · `<slug>/published.md` · `<slug>/versions.json` |
| Pen-name scope (S-11) | `_rules/line-allowlist.json` (3 credit-line rows only) · `PROVENANCE.md` |
| Gate evidence | this run record + `PROVENANCE.md` + `export-manifest.json` |
| Sign-off digest | `export-manifest.json` `digest` (978 files) + per-slug input digests in `PROVENANCE.md` |

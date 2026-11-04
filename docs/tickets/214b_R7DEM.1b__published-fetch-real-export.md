# R7DEM.1b — Published fetch, local real export and the HUMAN-H14 review packet

- **Sequence:** 214b of 254 · **Phase:** round 7 (R7a) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 214_R7DEM.1 (the `@rhema/demo-corpus` package, `tools/demo-corpus/export.mjs`,
  the sanitizer and its `_rules/` reader, the denylist gate, the PROVENANCE writer, the
  `published.md` data shape and the withholding tripwire this ticket runs against the real source)
- **Run:** `implement-spec spec=docs/tickets/214b_R7DEM.1b__published-fetch-real-export.md`
- **Gate status:**
  - [x] **Pre-authorized by spec §6** (ratified `GD-RATIFY.R7`; ruling `GD-DEMO-PUBLISHED.R7`): ONE
    run of `tools/demo-corpus/fetch-published.mjs`, a read of the operator's own four public
    Substack posts. Conditions: GET only, of exactly the four post URLs; no credentials, no cookies;
    output written only to the withheld local path; never wired into a build, test or runtime
    path. **Any other network act, or any failed condition → PAUSE for the operator.**
  - No real corpus byte is committed by this ticket (REQ-CORPUS-14; 214c_HUMAN-H14 → 219_R7DATA.1).
- **Live stage:** Stage A only ($0): unit tests on local HTML fixtures, plus local runs of the
  exporter and gates over the withheld real export. The single pre-authorized read-only fetch above
  costs $0. No preview (`GD-PREVIEW.R7`) and no other network act.
- **Production mutations:** none
- **Size budget:** ~300 changed lines of code, tests and records (the fetch tool, its tests, the
  run-record evidence). Excludes the withheld real data (`corpus/**`, `_rules/`, `published.md`),
  which is never committed here.

## Goal
Run the corpus tools against the real source for the first time, locally, and hand the operator a
complete, reproducible review packet. This ticket adds the one-time Published fetch and runs it once
under its pre-authorization. It authors the real file-targeted redaction data and the credit-line
allowlist entries as withheld data, then exports the four essays with 214's deterministic
exporter. It proves that the sanitizer, the denylist and `gitleaks dir` pass on that output, and
records the `export-manifest.json` digest that HUMAN-H14 signs. Nothing real enters git history.

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md`: §3.1 rows `GD-DEMO-PUBLISHED.R7`, `GD-DEMO-REDACT.R7`,
  `GD-DEMO-BYLINE.R7`/`-SCOPE.R7`; §3.3 S-9, S-10, S-11, S-12; §4.1 REQ-CORPUS-8, REQ-CORPUS-11,
  REQ-CORPUS-12, REQ-CORPUS-14; §4.17 REQ-DOPS-4; §6 (pre-authorized acts; HUMAN-H14); §8.
- `docs/build/planning/2026-11-03_r7-demo/R1-corpus-census.md` §1 (allowlist + excluded set), §2
  (the denylist census and the per-pattern rule; this is the checklist for the real file-targeted
  rewrites, with the S-10 amendment: workflow "operator" → "the writer"), §6 (Published risk per
  essay), § Requirements emitted (REQ-DEMO-CORPUS-8).
- `R4-acceptance-deploy-conventions.md` §3 gitleaks (sanitizer stripping over allowlisting) and the
  REQ-DEMO-OPS-4 text; §5 row D-R6OSS.1-1.
- `docs/tickets/214c_HUMAN-H14__corpus-sign-off.md` (the checklist the packet must answer).
- 214's `packages/demo-corpus/AGENTS.md` (layout, `_rules/` schema, `published.md` shape) and its
  run record.
- Anchors (re-confirm at build time): `tools/demo-corpus/export.mjs`; `pnpm check:demo-corpus`;
  `packages/demo-corpus/.gitignore` and the tripwire test; `apps/convert/package.json`
  (`turndown`, already licence-checked); `.gitleaks.toml`; local `gitleaks` ≥ 8.19
  (`gitleaks dir`). Source root: `~/agent-discourse/agent-scratch/projects/<slug>`. Re-confirm
  that `agent-scratch/` is still gitignored upstream (it was on 2026-11-03), so that a source
  commit alone does not identify the input bytes.

## In scope — deliverables
1. **`tools/demo-corpus/fetch-published.mjs`** (REQ-CORPUS-12 fetch half, REQ-CORPUS-8 fetch half).
   - A one-time, operator-run fetch of each live post, converted to markdown (`turndown` is the
     precedent), written as `published.md` in 214's front-matter shape: URL, fetch date, sha256.
   - The four post URLs are a committed constant. Any other URL is refused. The tool sends GET
     only, with no cookie or credential header.
   - It is never invoked by build, test or runtime. A test asserts that no `package.json` script,
     CI workflow or test imports or runs it.
   - Unit tests run on local HTML fixtures, with no network: the conversion, the front matter, the
     URL refusal and the absence of the cookie/credential headers.
2. **The one pre-authorized run.** Run the tool once under the Gate-status pre-authorization. The
   output goes to the withheld path only. The run record states each condition and that it held:
   GET only, the four URLs, no credentials or cookies, the withheld output.
3. **Real file-targeted redaction data** under the withheld `corpus/_rules/` path, in 214's
   schema. Each row holds an id plus file:line, the replacement and the reason. Cover R1 §2's
   per-pattern rules (e.g. the workflow-sense "operator" → "the writer" lines, S-10), plus the
   denylist line-allowlist entries for the Published credit lines only (file:line, S-11). Prefer
   sanitizer stripping to any `.gitleaks.toml` entry. (REQ-CORPUS-3 data, consumed; REQ-CORPUS-2
   credit-line entries, consumed)
4. **The local real export** with `tools/demo-corpus/export.mjs` over the four projects plus the
   fetched `published.md` files. Then run the pre-commit gates locally on the withheld output: the
   sanitizer, `pnpm check:demo-corpus` (denylist), and `gitleaks dir` over the output path. All
   pass. (REQ-DOPS-4)
5. **The HUMAN-H14 review packet.** It is the withheld export itself, `PROVENANCE.md` and
   `export-manifest.json`, organized so that each 214c checklist item can be read directly: the
   allowlist with counts; the redaction table; the excluded set with reasons; the round/approval
   facts (S-9); the Published entries (URL, fetch date, sha256); the pen-name scope; the gate
   evidence. Re-running the exporter reproduces the same manifest digest. The run record commits
   **only** aggregate counts, the input tree digest, the export-manifest digest, the exporter SHA
   and the packet's local path. It commits no corpus line, path:line or redaction row.

## Out of scope
- The package, exporter, sanitizer and `_rules/` reader, denylist gate, image sanitization,
  PROVENANCE writer, version metadata and the `published.md` data shape, the synthetic fixture,
  the licence carve-out and the tripwire: 214_R7DEM.1. This ticket changes none of their
  behaviour. A defect found on real data is fixed in 214's code with a synthetic test first, or the
  ticket PAUSEs.
- The operator's sign-off: 214c_HUMAN-H14.
- Committing any real corpus byte, `_rules/` row, golden or snapshot: 219_R7DATA.1 after H14.
- Markdown → sidecar conversion: 215–217. Projection: 218/218a.

## Acceptance criteria
- [ ] `fetch-published.mjs` unit tests pass on local HTML fixtures: markdown conversion, front
      matter (URL, fetch date, sha256), refusal of any non-listed URL, and no cookie or credential
      header sent *(deterministic · layer: fixture-verified)*
- [ ] A test fails if any `package.json` script, CI workflow or test references
      `fetch-published.mjs` *(deterministic · layer: engineered)*
- [ ] The pre-authorized fetch ran once for the four posts; URL, fetch date and sha256 recorded in
      the local PROVENANCE; the run record states the conditions held *(agentic · layer:
      live-executed)*
- [ ] Real export run locally: sanitizer, denylist and `gitleaks dir` all pass on the withheld
      output; the run record commits **only** aggregate counts, the input tree digest, the
      export-manifest digest and the exporter SHA — no corpus line, path:line or redaction row
      *(agentic · layer: live-executed)*
- [ ] A second exporter run over the same inputs reproduces the recorded export-manifest digest
      *(deterministic · layer: engineered)*
- [ ] The packet answers every 214c checklist item, and the run record has a checklist-item →
      packet-file map (file names only, no content) *(agentic · layer: engineered)*
- [ ] `git ls-files packages/demo-corpus/corpus packages/demo-corpus/snapshots` is empty at the PR
      head, and no `published.md` or `_rules/` file is tracked *(deterministic · layer: engineered)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-CORPUS-12 (fetch half; 214 stamps the data shape), REQ-CORPUS-8 (fetch half), REQ-DOPS-4

## Cross-cutting invariants
- Manifest § Cross-cutting invariants 3 (no private/eval text in public artifacts), 10 (no raw page
  text in events/telemetry), 15 (scoped authority: exactly the one pre-authorized read), 17
  (context budget), 18 (demo isolation: no real-corpus byte merges before HUMAN-H14).
- Spec §8.3 (essay content is data; S-10 roles; pen name per S-11), §8.5 (`licenses`, `no-cookies`
  and the other checks stay green), §8.6 (records append-only), §8.7 (sizing).

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`; the gap table has one row per clause.
  Rule 6 binds hard here: no corpus text, path:line or identity material in any committed record.

## Notes
- **Owns:** the fetch tool and its URL constant; the real `_rules/` rows (withheld until 219
  commits them); the H14 packet and the digest it records.
- **Consumes:** 214's tools, layout, schemas and gates (owner 214).
- **Consumers:** 214c_HUMAN-H14 reads the packet and signs the digest. 219 re-exports, verifies the
  digest, and commits. 215–217 may smoke the withheld export for aggregate counts only.
- **Why the real data is authored here, before H14** (P4-27). The redaction rows and the
  credit-line allowlist entries sit inside the export the operator reads, so H14 reviews them
  before anything enters public history. 219 keeps them as ids plus file:line, with no quoted
  prose.
- **DEFERRALS:**
  - D-R6OSS.1-1 (repo public, history permanent) is why the gates run here, on withheld output,
    before any commit.
  - If the live fetch is blocked for an essay (e.g. the post host refuses), open
    `D-R7DEM.1b-1`: it withholds REQ-CORPUS-12 for that essay, is unblocked by a successful re-run
    under the same pre-authorization, and the packet records that essay as "not fetched".
  - No Stage-B AC, so no phase-preview row.

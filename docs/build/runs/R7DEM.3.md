# R7DEM.3 — Snapshot projector core: corpus + sidecars → lazy DTO snapshots + contract/drift harness

- **Spec:** `docs/tickets/218_R7DEM.3__snapshot-projector.md` (seq 218 of 254; manifest row 218)
- **Base:** `stevevitali/r7dem-2c-ledgers` @ `d1d6ddd` (chainTip; stack rides unmerged PRs #240–#249, OPERATOR)
- **Branch:** `stevevitali/r7dem-3-snapshot`
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** e981ec5
- **Started:** 2026-11-04T03:31Z
- **Config:** Stage A only ($0; offline). No preview (GD-PREVIEW.R7); no Stage-B AC. Synthetic
  fixture only (REQ-CORPUS-14; S-12) — the real export stays withheld. Size budget ~400 changed
  lines excl. fixtures and generated snapshots (Phase-4 Split decision 2; the run/figure/count
  half is 218a_R7DEM.3b).

## Deferrals read

- Round-7 OPEN rows scanned: `D-R7OPEN.1-1`, `D-R7KIT.1-1`, `D-R7RO.1-1`, `D-R7FIX.1-1`,
  `D-R7COPY.0-1/-2`, `D-R7DEM.2c-1` — all Stage-B/preview legs owed at 224's phase preview or
  the BL-100 parser fix owned by 253_R7REC.1. A Stage-A projector ticket unblocks none of them.
- `D-R6OSS.1-1` OPEN — the public-flip row; operator-owned. Not closed here.

## Requirements

From the ticket's deliverables (REQ ids per the stamp list):

1. Projector core `packages/demo-corpus/src/project/*` (pure; build script owns I/O): for each
   essay, one snapshot per **document-side** R3 §1 snapshot-backed method and key —
   `listProjects`, `getEditorDoc` (per draft incl. Published), `resolveEditorDraft`,
   `getVersions`, `getVersionDiff` (`n:m`), `getWhatChanged`, `getFiles`, `getArtifactPage`
   (raw markdown). (REQ-CORPUS-12/13 projection)
2. Lazy chunking + per-essay index (REQ-CORPUS-9): one file per artifact/draft/source note;
   small index whose schema 218a extends; size test = one artifact + declared envelope; source
   notes load on demand.
3. Essay keys only — no `demo~` slugs (220 owns the registry).
4. Import-rule labels (REQ-CONV-14) + "not published" excluded-file markers (REQ-CORPUS-4 data
   half) carried on document-side DTOs; S-10 role vocabulary; labels pass `lintCopy`.
5. Contract/drift harness: compile-time `satisfies` vs `@rhema/api-client` types; per-kind
   structural validators with a registration seam 218a plugs into; drift test byte-compares
   committed snapshots vs fresh projection.
6. Synthetic snapshots committed under the 214 layout (`fixtures/synthetic/snapshots/`) + one
   regeneration command (`tools/demo-corpus/project.mjs`: corpus → convert → project).

## Acceptance criteria

| # | AC (ticket) | Required layer |
|---|---|---|
| 1 | Every document-side snapshot-backed method in R3 §1 has a synthetic snapshot per key; missing key = projector error | fixture-verified |
| 2 | Contract harness: `satisfies` + runtime structural validation pass per kind; a new kind registers without editing the core | fixture-verified |
| 3 | Size test: snapshot ≤ its one artifact + declared envelope; no SPA module imports snapshot JSON | fixture-verified |
| 4 | Version rail carries Published (origin `imported`) + "Writer-directed edit (not reviewed)" exactly as 214 metadata declares | fixture-verified |
| 5 | Generated labels pass `lintCopy`; no "author" for an agent | fixture-verified |
| 6 | Drift test: re-projection byte-identical to committed synthetic snapshots | fixture-verified |
| 7 | universal phase-gate AC | agentic |

## Plan

- `src/project/model.ts` — `SnapshotFile {format,kind,essay,key,dto}` envelope, kind constants,
  per-essay `EssayIndex` (chunks per kind + `resolve` table + head), declared envelope bytes.
- `src/project/versions.ts` — 214 `versions.json` → `DemoVersion[]`: n assignment (published =
  V+1 head), declared origin mapping (imported / writerDirected→human_revision / prior response
  →response_to_review / drafting dir →drafted_from_outline / else human_upload), reviewed =
  `<v>-review/` dir, answered = response exists, claimsPendingVerification = !reviewed,
  createdAt = export manifest date (published: fetched date).
- `src/project/dtos.ts` — EditorDocDto for drafts (markdown, index.json sha256, lock null,
  findings rail from findings.json+labels.json for reviewed versions, blockIdMap via
  `buildBlockIdMap`, meters via `statusMeters`, demo markers) and raw artifact pages
  (every markdown artifact incl. sidecar'd files — raw ALONGSIDE the structured twin,
  REQ-CONV-13).
- `src/project/views.ts` — VersionRailDto (derived ⚑ obligations: majors split by response
  disposition status, addressed set = prod's), VersionDiffDto (`diffMarkdown` + the 217
  artifact's move/entry join lifted onto fresh hunks, entries enriched with finding
  title/severity/id), WhatChangedDto per adjacent pair, resolve table.
- `src/project/files-tree.ts` — FilesDto sections via `browserSectionFor`/`artifactPolicy`
  (kind map corpus-path→ArtifactKind, declared), draft rows, "working fragments not shown" note
  from PROVENANCE excluded "fragment" reasons.
- `src/project/project.ts` — orchestrator: corpus files + convert outputs + meta →
  `Map<relpath, canonicalJson>` (per-essay chunks + index + `projects.json`); missing expected
  key → fail-closed projector error.
- `src/project/harness.ts` — `registerSnapshotKind` seam + structural validators; loaders in
  tests `satisfies` the api-client DTOs.
- Additive DTOs in `packages/api-client`: `DemoMarkersDto` + optional `demo` carrier on the
  document-side DTOs; `label` on `VersionRailDto.drafts[]`; `versionLabel`/`artifactKind`/
  `artifactPath` on `EditorDocDto` (the last two formalize fields the api already returns).
  Consumers: 220 (serve), 220a/221 (render).
- Deps added to `@rhema/demo-corpus`: `@rhema/api-client` (types + runtime types only),
  `@rhema/editor` (`statusMeters` — the one word-count rule; never a fork).
- `tools/demo-corpus/project.mjs` — corpus root → `convertProject` → `projectProject` → writes
  snapshots (+ `--write-goldens` for the full corpus→convert→project chain).
- Committed synthetic snapshots under `fixtures/synthetic/snapshots/`; drift/size/harness tests;
  `pnpm check:demo-corpus` over the new tree; `check-corpus.mjs` already scans `snapshots/` dirs.
- ADR-126 dated note: owned decisions (layout, index schema, artifact/draft id scheme, origin
  mapping, chip derivation, markers carriage, envelope constants).

## Test matrix

- project.test.ts: outputs exist for every expected key (AC1); index covers every artifact +
  draft + pair; missing-key lookup throws; resolve table working/n/absent.
- versions/labels: rail drafts exact order/origins/states incl. Published + writer-directed;
  obligations derivation.
- dtos: editor doc markdown == corpus bytes; findings rail populated for reviewed versions only;
  artifact page per markdown file (RAW_ONLY + sidecar'd); notPublishedRefs on the right files.
- views: diff pairs 1:2, 2:3, 3:4(published) with moves/Unlinked honest (M1/M3 linked h3; v2-v3
  all-unlinked); what-changed per artifact; view strip == artifact summary.
- files-tree: sections/rows/kinds; "not shown" note; sealedCount for H kinds if any.
- harness.test.ts: structural validators pass every emitted kind; bogus payload fails; a new
  kind registers + validates without core edit; `satisfies` typechecks (compile-time leg).
- drift: `RHEMA_REGEN_SNAPSHOTS=1` writes; default run byte-compares committed snapshots (AC6).
- size: each snapshot ≤ its declared carried-artifact bytes + envelope (AC3); no `apps/web/src`
  module imports snapshot paths or `@rhema/demo-corpus` (AC3 second half).
- labels: `lintCopy` over every generated label/marker string; "author" never for agents (AC5).

## Progress

- Baseline green: `pnpm exec vitest run packages/demo-corpus/src` → 196/196 at base `d1d6ddd`.

## Gap table

| item (spec §) | required layer | achieved layer | status | evidence |
|---|---|---|---|---|
| AC1 snapshots per key; missing key = error | fixture-verified | fixture-verified | met | `project.test.ts` "every document-side method" — 41 chunks incl. all artifact pages; missing-file throw leg |
| AC2 harness satisfies + structural + seam | fixture-verified | fixture-verified | met | `satisfies` at each projection site (`dtos.ts`, `views.ts`); `harness.ts` validators all-green; test-card registration leg |
| AC3 size bound; no SPA import | fixture-verified | fixture-verified | met | `ENVELOPE_BYTES` + `carriedBytes` test; `apps/web/src` scan leg |
| AC4 rail Published + writer-directed verbatim | fixture-verified | fixture-verified | met | `versions.json` rail leg — labels asserted verbatim |
| AC5 labels lintCopy; no "author" for agents | fixture-verified | fixture-verified | met | labels leg — every importRule/role/sourceLabel/label string through `lintCopy` |
| AC6 drift: re-projection byte-identical | fixture-verified | fixture-verified | met | committed-snapshot byte-equality leg + second-run determinism; `project.mjs` CLI diff-verified |
| AC7 universal phase-gate | agentic | agentic | met | this ledger + PR + records |
| Deliverable 3: essay keys only, no `demo~` | engineered | fixture-verified | met | `row.slug === essay`; `JSON.stringify(row)` no `demo~` leg |
| Operating rules 1–10 | agentic | agentic | met | dates from `date -u`; CI read at head; layers stated; append-only records; verbatim gate words; harness header; no living-record pins; no post-confirm ledger push; no full-CI claims |

No deviations from the spec; owned decisions recorded as the 2026-11-04 dated note on ADR-126.

## Evidence log

- `pnpm turbo build lint typecheck --filter=@rhema/demo-corpus...` — 7/7 tasks green (api-client, editor, contracts, findings-core, protocols included).
- `pnpm exec vitest run packages/demo-corpus/src` — 214/214 (projector: 18 new legs).
- `pnpm exec vitest run packages/api-client` — included, 228 total pass.
- `pnpm check:demo-corpus` — clean, 4 corpus dirs scanned, 0 violations (snapshots `_rules/line-allowlist.json` covers the verbatim published-mirror line).
- `node tools/demo-corpus/project.mjs --corpus fixtures/synthetic/corpus --snapshots /tmp/snap-test --slug the-borrowed-commons --overrides-dir fixtures/synthetic/overrides` — 41 chunks + projects.json; `diff -r` vs committed snapshots = identical.
- 41 snapshot files emitted for `the-borrowed-commons`: index, versions, files, 4 drafts (v1–v3 + published), 3 diffs (1:2, 2:3, 3:4), 3 what-changed, 28 artifact pages.
- No live surface (Stage A only; GD-PREVIEW.R7) — no Stage-B leg exists to run or defer.

## Evidence report

### Acceptance criteria → evidence

| AC | required | achieved | verdict | evidence |
|---|---|---|---|---|
| 1 | fixture-verified | fixture-verified | met | project.test.ts chunk-set + missing-key legs |
| 2 | fixture-verified | fixture-verified | met | satisfies + validators + registration-seam leg |
| 3 | fixture-verified | fixture-verified | met | envelope size leg + SPA-import scan |
| 4 | fixture-verified | fixture-verified | met | rail labels verbatim leg |
| 5 | fixture-verified | fixture-verified | met | lintCopy leg over all generated strings |
| 6 | fixture-verified | fixture-verified | met | byte-identical committed snapshots + determinism leg |
| 7 | agentic | agentic | met | this record |

### Gaps found and closed

- `files.has()` on directory probes never matched (map keys are files) — found by the rail/findings legs failing; fixed with a trailing-`/` prefix probe.
- VersionDiffDto.responseId/reviewId initially linked writer-directed pairs — corrected: a pair links only when the after-version is the response's product.
- `ProjectRow.title` initially took the oldest titled version — corrected to Published's H1 (the retitle is data, RV-30).
- Denylist gate caught the verbatim published-mirror line inside generated JSON — resolved by `snapshots/_rules/line-allowlist.json` (5 file:line rows citing `la-published-mirror`), not by altering corpus bytes.

### Verification summary

Unit/integration: turbo build+lint+typecheck 7/7; vitest 214/214 package (18 projector legs); check:demo-corpus clean; regen CLI diff-identical. Live: not applicable ($0 Stage A, no runtime surface). Deviations: none (owned decisions on ADR-126). CI: see `ci:` line in header.

# R7DEM.3 — Snapshot projector core: corpus + sidecars → lazy DTO snapshots + contract/drift harness

Implements `docs/tickets/218_R7DEM.3__snapshot-projector.md` (manifest row 218, round 7 R7a).
Requirement ids: **REQ-CORPUS-9** (snapshot half), **REQ-CORPUS-4** (marker data, document side),
**REQ-CORPUS-12**, **REQ-CORPUS-13**, **REQ-CONV-13**, **REQ-CONV-14** (document side).
Stage A only ($0; offline); synthetic fixture only (REQ-CORPUS-14; S-12). mergePolicy OPERATOR.

## Summary

`packages/demo-corpus` gains `src/project/*` — a pure projector that turns each essay's
sanitized corpus tree + the converter's canonical-JSON outputs into the lazy DTO snapshots the
demo data source serves for every **document-side** snapshot-backed method in R3 §1:
`listProjects` rows, `getEditorDoc` per draft (versions + the Published node),
`resolveEditorDraft`, `getVersions`, `getVersionDiff` keyed `n:m`, `getWhatChanged`, `getFiles`,
and `getArtifactPage` raw-markdown reads. One `SnapshotFile` chunk per artifact/draft/pair plus a
small per-essay `index.json` (resolve table + `kind → key → file` chunk map 218a extends).
A contract/drift harness (`harness.ts`) proves every snapshot satisfies its DTO (`satisfies` at
each projection site + registered per-kind structural validators + a kind-registration seam 218a
plugs into) and that committed snapshots equal a fresh projection.

## What changed

- `src/project/model.ts` — `SnapshotFile` envelope, `EssayIndex`, `SNAPSHOT_KINDS`,
  `ENVELOPE_BYTES` (the declared AC3 size bound).
- `src/project/versions.ts` — the 214 version metadata → `DemoVersion[]` (declared origin
  mapping, reviewed/answered/claimsPendingVerification, Published head).
- `src/project/dtos.ts` — `EditorDocDto` for drafts (markdown verbatim, index.json sha256,
  findings rail from findings.json+labels.json, `buildBlockIdMap`, `statusMeters`) and raw
  artifact pages (every markdown artifact — RAW_ONLY plus sidecar'd files' raw twins).
- `src/project/views.ts` — `VersionRailDto` (derived ⚑ chip: blocking/major findings split by
  response disposition, prod's closed-state set), `resolveTable`, `pairSnapshots` — the 217
  what-changed join lifted onto fresh `diffMarkdown` hunks (stale hunk ids fail closed).
- `src/project/files-tree.ts` — `FilesDto` via `browserSectionFor`/`artifactPolicy` + the
  declared corpus-path → ArtifactKind map; `demo.fragmentsNote` from PROVENANCE.
- `src/project/project.ts` — `projectEssay` orchestrator; `tools/demo-corpus/project.mjs` — the
  single corpus→convert→project regeneration command (218a extends, 219 reuses).
- `src/project/harness.ts` — the contract/drift harness + registration seam.
- `packages/api-client` additive DTO carriers (consumers in parens): `DemoMarkersDto` +
  optional `demo` on EditorDoc/VersionRail/VersionDiff/WhatChanged/Files (220a/221 render the
  import-rule labels and "not published" non-links); `VersionRailDto.drafts[].label` (221 rail);
  `EditorDocDto.versionLabel` (220a/221 Page banner); `artifactKind`/`artifactPath` (220 — they
  formalize fields `/artifacts/:id/page` already returns).
- Committed synthetic snapshots under `fixtures/synthetic/snapshots/` (+ `_rules/` denylist
  line-allowlist rows for the verbatim published-mirror line).
- Deps added to `@rhema/demo-corpus`: `@rhema/api-client` (DTO contract), `@rhema/editor`
  (`statusMeters` — the one word-count rule, never forked).

## Design decisions (dated note on ADR-126)

Essay-keyed ids (draftId = version key/`published`; artifactId = corpus path; no `demo~`
slugs); Published = head (`working`), origin `imported`; writer-directed = `human_revision`;
`responseId`/`reviewId` only when the after-version is the response's product; createdAt =
export-manifest date; `provenance`/`dischargeLines` empty rather than invented.

## Verification

- `pnpm turbo build lint typecheck --filter=@rhema/demo-corpus...` — 7/7 green.
- `pnpm exec vitest run packages/demo-corpus/src` — 214/214 (18 projector legs).
- `pnpm check:demo-corpus` — clean, 0 violations over the new snapshot tree.
- `tools/demo-corpus/project.mjs` end-to-end — 41 chunks byte-identical to committed snapshots.
- No runtime surface exists yet (220 serves the snapshots) — no live leg to run.

## Acceptance criteria → evidence

| AC | required | achieved | verdict | evidence |
|---|---|---|---|---|
| 1 snapshots per key; missing key = error | fixture-verified | fixture-verified | met | chunk-set + missing-file legs |
| 2 harness: satisfies + validators + seam | fixture-verified | fixture-verified | met | validators all-green; test-card registration leg |
| 3 size bound + no SPA import | fixture-verified | fixture-verified | met | envelope bound + `apps/web/src` scan |
| 4 rail Published + writer-directed verbatim | fixture-verified | fixture-verified | met | rail label assertions |
| 5 labels pass lintCopy, no "author" for agents | fixture-verified | fixture-verified | met | lintCopy leg over all generated strings |
| 6 drift: byte-identical re-projection | fixture-verified | fixture-verified | met | committed-vs-fresh byte equality + determinism |
| 7 universal phase-gate | agentic | agentic | met | `runs/R7DEM.3.md` |

Deferrals: none opened, none closed. ci: read at head in the closeout.

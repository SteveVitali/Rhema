# Corpus provenance

- Export date: 2026-11-03
- Exporter: `@rhema/demo-corpus` (`tools/demo-corpus/export.mjs`; deterministic re-run)
- This file is authored, never rendered from excluded manifests (REQ-CORPUS-7 facts half).

## the-borrowed-commons

### Source identity
- Source tree: the untracked agent-discourse scratch projects root, project `the-borrowed-commons`
- agent-discourse HEAD (context): synthetic fixture (invented; no upstream HEAD)
- Allowlisted input tree digest (sha256): `34e83ecb7f93aa11bbdac918118d9bfa8fa5fc51f0a03991b62781e78b4f35fe`
- Export date: 2026-11-03

### Allowlist (keep rules → admitted files)
- `k-draft` (essay version): 3
- `k-figure` (referenced figure image): 2
- `k-taxonomy` (companion artifact cited by the draft (§VII; REQ-CORPUS-11 ruling)): 1
- `k-correspondence` (review/response correspondence): 12
- `k-author-ledger` (response ledger): 2
- `k-drafting` (drafting dossier): 6
- `k-research-index` (research index): 2
- `k-source-note` (source note): 5
- `k-published` (Published post (REQ-CORPUS-12)): 1

### Excluded (file → reason)
- `.ds-store` — dotfile (OS junk)
- `agents/author/drafting/v1/draft-part1.md` — working fragment; the merged draft is canonical
- `agents/author/drafting/v1/ledger-sliceA.md` — working fragment; the merged ledger is canonical
- `agents/author/outline/01-outline.md` — deep-research outline (GD-DEMO-REDACT.R7)
- `agents/author/research/index-sliceA.md` — working fragment; the merged index is canonical
- `agents/author/voice-charter.md` — persona internals (REQ-CORPUS-11 ruling; GD-DEMO-PROCESS.R7)
- `agents/editor/notes.md` — editor's private notes (GD-DEMO-REDACT.R7)
- `correspondence/v2-review/01-claim-ledger-A.md` — part file; the merged ledger is canonical (R2)
- `correspondence/v2-review/01-claim-ledger-B.md` — part file; the merged ledger is canonical (R2)
- `drafts/figures/values-table.png` — unreferenced screenshots (REQ-CORPUS-11 ruling)
- `drafts/short-v1.md` — a different piece, not a version (REQ-CORPUS-11 ruling)
- `manifest.md` — round log carrying writer-edit notes (GD-DEMO-REDACT.R7)

### Redactions applied (rule → replacement, file:line, reason)
- `rw-utm-prose` → a deep-research tracking parameter — `agents/author/drafting/v1/00-commissioning-brief.md:9` — prose mention of a tracking parameter normalized (R1 §2)
- `persona-path` → the persona profile — `agents/author/drafting/v1/01-voice-brief.md:5` — persona profile path becomes its published label (R1 §2)
- `rw-operator-writer-2` → by the writer "go ahead" — `agents/author/drafting/v1/04-draft-ledger.md:12` — workflow-sense role vocabulary — 'operator' becomes 'the writer' (S-10), never 'the author'
- `rw-operator-writer` → by the writer "approved, — `agents/author/ledgers/v1-response-ledger.md:3` — workflow-sense role vocabulary — 'operator' becomes 'the writer' (S-10), never 'the author'
- `persona-slug` → the S. J. Sebastian corpus — `agents/author/ledgers/v1-response-ledger.md:3` — persona slug becomes the corpus label (R1 §2)
- `utm-strip` → (utm_* stripped) — `agents/author/research/sources/ekwueme-commons-2019.md:3` — tracking parameters are stripped from URLs (R1 §2 guard)
- `jina-unwrap` → (unwrapped URL) — `agents/author/research/sources/ondatje-ledger-2024.md:4` — reader-proxy prefix unwrapped to the direct URL (R1 §2 guard)
- `desktop-path` → the writer's Substack package — `correspondence/v1-review/00-piece-brief.md:3` — operator-local path becomes its published label (R1 §2, S-10)
- `desktop-path` → the writer's Substack package — `correspondence/v1-review/editors-letter.md:3` — operator-local path becomes its published label (R1 §2, S-10)
- `png-strip` → dropped: tEXt,eXIf,iTXt,caNv,tIME — `drafts/figures/figure_1_signal_map.png:0` — EXIF/XMP/tEXt and non-render chunks stripped (REQ-CORPUS-5); bytes copied, xattrs never travel
- `png-strip` → dropped: tEXt — `drafts/figures/figure_2_load_curve.png:0` — EXIF/XMP/tEXt and non-render chunks stripped (REQ-CORPUS-5); bytes copied, xattrs never travel
- `figure-path` → figures/<name>.png — `drafts/v1.md:19` — image links carry the figures/ prefix (R1 §2 normalisation; the only draft-prose change)

### Published
- `https://sjsebastian.example.org/p/the-borrowed-commons` — fetched 2026-09-01 — sha256 `20383d0d9f4c9a3948dc1fe829eaa17e91bd69169fd37124bad9bbfc8575508c`

### Round and approval facts (the only facts S-9 may cite)
- v1 review: revision plan approved — recorded in the round log
- v2 review: approved to publish

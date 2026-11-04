# Corpus provenance

- Export date: 2026-11-04
- Exporter: `@rhema/demo-corpus` (`tools/demo-corpus/export.mjs`; deterministic re-run)
- This file is authored, never rendered from excluded manifests (REQ-CORPUS-7 facts half).

## constitution-of-reason

### Source identity
- Source tree: the untracked agent-discourse scratch projects root, project `constitution-of-reason`
- agent-discourse HEAD (context): c3b434d7feec9ef341c425997d72b703e1358701
- Allowlisted input tree digest (sha256): `313fb05c3e0821f240d3dba904291adcf6f34c6e2b4a43a96a6503e65a0b511e`
- Export date: 2026-11-04

### Allowlist (keep rules → admitted files)
- `k-draft` (essay version): 3
- `k-correspondence` (review/response correspondence): 8
- `k-author-ledger` (response ledger): 1
- `k-research-index` (research index): 2
- `k-source-note` (source note): 15
- `k-published` (Published post (REQ-CORPUS-12)): 1

### Excluded (file → reason)
- `agents/author/voice-charter.md` — persona internals (REQ-CORPUS-11 ruling; GD-DEMO-PROCESS.R7)
- `manifest.md` — round log carrying writer-edit notes (GD-DEMO-REDACT.R7)

### Redactions applied (rule → replacement, file:line, reason)
- `rw-001` → `drafts/v2.md` — `correspondence/v2-review/00-piece-brief.md:3` — private scratch path becomes the migrated draft path (R1 §2)
- `rw-002` → `drafts/v2.md` — `correspondence/v2-review/editors-letter.md:3` — private scratch path becomes the migrated draft path (R1 §2)

### Published
- `https://sjsebastian.substack.com/p/the-constitution-of-reason` — fetched 2026-11-04 — sha256 `572a0636a0471525cd3551dc4e4088f5a6b17c6423b890762a14869d08fc11dc`

### Round and approval facts (the only facts S-9 may cite)
- v2 review: major revisions
- v2 response: revision delivered (v3) — 30 accept / 4 adapt / 1 rebut / 2 defer / 4 escalate
- v4: writer-directed edit (not reviewed) — unrecorded edit pass over v3

## structure-of-political-difference

### Source identity
- Source tree: the untracked agent-discourse scratch projects root, project `structure-of-political-difference`
- agent-discourse HEAD (context): c3b434d7feec9ef341c425997d72b703e1358701
- Allowlisted input tree digest (sha256): `21f535682c7a41a49ba1288c7c75aaff4dc3068deea77a3bc9973f8f531fbb9f`
- Export date: 2026-11-04

### Allowlist (keep rules → admitted files)
- `k-draft` (essay version): 4
- `k-figure` (referenced figure image): 6
- `k-taxonomy` (companion artifact cited by the draft (§VII; REQ-CORPUS-11 ruling)): 1
- `k-correspondence` (review/response correspondence): 8
- `k-author-ledger` (response ledger): 1
- `k-research-index` (research index): 2
- `k-source-note` (source note): 57
- `k-published` (Published post (REQ-CORPUS-12)): 1

### Excluded (file → reason)
- `.DS_Store` — dotfile (OS junk)
- `agents/author/voice-charter.md` — persona internals (REQ-CORPUS-11 ruling; GD-DEMO-PROCESS.R7)
- `drafts/.DS_Store` — dotfile (OS junk)
- `drafts/figures/values-table-sm.png` — unreferenced screenshots (REQ-CORPUS-11 ruling)
- `drafts/figures/values-table.png` — unreferenced screenshots (REQ-CORPUS-11 ruling)
- `drafts/short-v1.md` — a different piece, not a version (REQ-CORPUS-11 ruling)
- `manifest.md` — round log carrying writer-edit notes (GD-DEMO-REDACT.R7)

### Redactions applied (rule → replacement, file:line, reason)
- `rw-003` → the writer must attach the public link — `agents/author/ledgers/v1-response-ledger.md:106` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `rw-004` → (the writer has overridden this — `agents/author/research/sources/sjsebastian-venue-style.md:3` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `rw-005` → (The writer has overridden this — `agents/editor/research/sources/sjsebastian-substack-style.md:10` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `rw-006` → **The writer must attach the public link at publication** — `correspondence/v1-response.md:13` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `rw-007` → link needed from the writer — `correspondence/v1-response.md:75` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `rw-008` → writer-specified — `correspondence/v1-review/00-piece-brief.md:4` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `rw-009` → per the writer's [n] refactor request — `correspondence/v1-review/00-piece-brief.md:68` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `desktop-path` → the writer's Substack package — `correspondence/v1-review/00-piece-brief.md:3` — operator-local path becomes its published label (R1 §2, S-10)
- `rw-010` → The writer has overridden — `correspondence/v1-review/04-craft-notes.md:3` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `rw-011` → the writer requires `[n]` bracket citations — `correspondence/v1-review/04-craft-notes.md:55` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `rw-012` → writer-specified venue — `correspondence/v1-review/editors-letter.md:4` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `rw-013` → **Writer constraints for v2:** — `correspondence/v1-review/editors-letter.md:7` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `rw-014` → - Writer requirement: — `correspondence/v1-review/editors-letter.md:89` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `desktop-path` → the writer's Substack package — `correspondence/v1-review/editors-letter.md:3` — operator-local path becomes its published label (R1 §2, S-10)
- `png-strip` → dropped: tEXt — `drafts/figures/figure_1_five_questions.png:0` — EXIF/XMP/tEXt and non-render chunks stripped (REQ-CORPUS-5); bytes copied, xattrs never travel
- `png-strip` → dropped: tEXt — `drafts/figures/figure_2_ches_correlations.png:0` — EXIF/XMP/tEXt and non-render chunks stripped (REQ-CORPUS-5); bytes copied, xattrs never travel
- `png-strip` → dropped: tEXt — `drafts/figures/figure_2_ches_correlations_v2.png:0` — EXIF/XMP/tEXt and non-render chunks stripped (REQ-CORPUS-5); bytes copied, xattrs never travel
- `png-strip` → dropped: tEXt — `drafts/figures/figure_3_system_axis.png:0` — EXIF/XMP/tEXt and non-render chunks stripped (REQ-CORPUS-5); bytes copied, xattrs never travel
- `png-strip` → dropped: tEXt — `drafts/figures/figure_4_public_lexicon.png:0` — EXIF/XMP/tEXt and non-render chunks stripped (REQ-CORPUS-5); bytes copied, xattrs never travel
- `png-strip` → dropped: tEXt — `drafts/figures/figure_5_illustrative_profiles.png:0` — EXIF/XMP/tEXt and non-render chunks stripped (REQ-CORPUS-5); bytes copied, xattrs never travel
- `figure-path` → figures/<name>.png — `drafts/v1.md:19` — image links carry the figures/ prefix (R1 §2 normalisation; the only draft-prose change)
- `figure-path` → figures/<name>.png — `drafts/v1.md:70` — image links carry the figures/ prefix (R1 §2 normalisation; the only draft-prose change)
- `figure-path` → figures/<name>.png — `drafts/v1.md:166` — image links carry the figures/ prefix (R1 §2 normalisation; the only draft-prose change)
- `figure-path` → figures/<name>.png — `drafts/v1.md:230` — image links carry the figures/ prefix (R1 §2 normalisation; the only draft-prose change)
- `figure-path` → figures/<name>.png — `drafts/v1.md:256` — image links carry the figures/ prefix (R1 §2 normalisation; the only draft-prose change)
- `figure-path` → figures/<name>.png — `drafts/v2.md:19` — image links carry the figures/ prefix (R1 §2 normalisation; the only draft-prose change)
- `figure-path` → figures/<name>.png — `drafts/v2.md:148` — image links carry the figures/ prefix (R1 §2 normalisation; the only draft-prose change)
- `figure-path` → figures/<name>.png — `drafts/v2.md:183` — image links carry the figures/ prefix (R1 §2 normalisation; the only draft-prose change)
- `figure-path` → figures/<name>.png — `drafts/v2.md:244` — image links carry the figures/ prefix (R1 §2 normalisation; the only draft-prose change)
- `figure-path` → figures/<name>.png — `drafts/v2.md:267` — image links carry the figures/ prefix (R1 §2 normalisation; the only draft-prose change)
- `figure-path` → figures/<name>.png — `drafts/v3.md:19` — image links carry the figures/ prefix (R1 §2 normalisation; the only draft-prose change)
- `figure-path` → figures/<name>.png — `drafts/v3.md:148` — image links carry the figures/ prefix (R1 §2 normalisation; the only draft-prose change)
- `figure-path` → figures/<name>.png — `drafts/v3.md:183` — image links carry the figures/ prefix (R1 §2 normalisation; the only draft-prose change)
- `figure-path` → figures/<name>.png — `drafts/v3.md:244` — image links carry the figures/ prefix (R1 §2 normalisation; the only draft-prose change)
- `figure-path` → figures/<name>.png — `drafts/v3.md:267` — image links carry the figures/ prefix (R1 §2 normalisation; the only draft-prose change)
- `figure-path` → figures/<name>.png — `drafts/v4.md:19` — image links carry the figures/ prefix (R1 §2 normalisation; the only draft-prose change)
- `figure-path` → figures/<name>.png — `drafts/v4.md:148` — image links carry the figures/ prefix (R1 §2 normalisation; the only draft-prose change)
- `figure-path` → figures/<name>.png — `drafts/v4.md:183` — image links carry the figures/ prefix (R1 §2 normalisation; the only draft-prose change)
- `figure-path` → figures/<name>.png — `drafts/v4.md:244` — image links carry the figures/ prefix (R1 §2 normalisation; the only draft-prose change)
- `figure-path` → figures/<name>.png — `drafts/v4.md:273` — image links carry the figures/ prefix (R1 §2 normalisation; the only draft-prose change)

### Published
- `https://sjsebastian.substack.com/p/the-structure-of-political-difference` — fetched 2026-11-04 — sha256 `f99c4ef3c6d3b2505e53af10358b09df07734eb7dbce8f4370ed0225adad2975`

### Round and approval facts (the only facts S-9 may cite)
- v1 review: major revisions
- v1 response: revision delivered (v2)
- v3: writer-directed edit (not reviewed) — retitle plus intro replacement and section-name passes
- v4: writer-directed edit (not reviewed) — profile roster revision and copyedits

## the-governable-mind

### Source identity
- Source tree: the untracked agent-discourse scratch projects root, project `the-governable-mind`
- agent-discourse HEAD (context): c3b434d7feec9ef341c425997d72b703e1358701
- Allowlisted input tree digest (sha256): `637899ba0254d2e0e0799b4dd4af5c1d007ba6d6295a320b9d3965382a3401e6`
- Export date: 2026-11-04

### Allowlist (keep rules → admitted files)
- `k-draft` (essay version): 3
- `k-correspondence` (review/response correspondence): 17
- `k-author-ledger` (response ledger): 2
- `k-drafting` (drafting dossier): 7
- `k-research-index` (research index): 2
- `k-source-note` (source note): 622
- `k-published` (Published post (REQ-CORPUS-12)): 1

### Excluded (file → reason)
- `agents/author/drafting/v1/draft-part1.md` — working fragment; the merged draft is canonical
- `agents/author/drafting/v1/draft-part2.md` — working fragment; the merged draft is canonical
- `agents/author/drafting/v1/draft-part3.md` — working fragment; the merged draft is canonical
- `agents/author/drafting/v1/draft-part4.md` — working fragment; the merged draft is canonical
- `agents/author/drafting/v1/draft-part5-refs.md` — working fragment; the merged draft is canonical
- `agents/author/drafting/v1/ledger-sliceA.md` — working fragment; the merged ledger is canonical
- `agents/author/drafting/v1/ledger-sliceB.md` — working fragment; the merged ledger is canonical
- `agents/author/drafting/v1/ledger-sliceC.md` — working fragment; the merged ledger is canonical
- `agents/author/drafting/v1/ledger-sliceD.md` — working fragment; the merged ledger is canonical
- `agents/author/drafting/v1/ledger-sliceE.md` — working fragment; the merged ledger is canonical
- `agents/author/drafting/v1/ledger-sliceF.md` — working fragment; the merged ledger is canonical
- `agents/author/outline/the-governable-mind-pass-iii-article-spec.md` — deep-research outline (GD-DEMO-REDACT.R7)
- `agents/author/research/index-sliceA.md` — working fragment; the merged index is canonical
- `agents/author/research/index-sliceB.md` — working fragment; the merged index is canonical
- `agents/author/research/index-sliceC.md` — working fragment; the merged index is canonical
- `agents/author/research/index-sliceD.md` — working fragment; the merged index is canonical
- `agents/author/research/index-sliceE.md` — working fragment; the merged index is canonical
- `agents/author/research/index-sliceF.md` — working fragment; the merged index is canonical
- `agents/author/research/index-sliceG.md` — working fragment; the merged index is canonical
- `agents/author/research/index-sliceH.md` — working fragment; the merged index is canonical
- `agents/author/research/index-sliceI.md` — working fragment; the merged index is canonical
- `agents/author/research/index-sliceJ.md` — working fragment; the merged index is canonical
- `agents/author/research/index-sliceK.md` — working fragment; the merged index is canonical
- `agents/author/research/index-sliceL.md` — working fragment; the merged index is canonical
- `agents/author/research/index-sliceM.md` — working fragment; the merged index is canonical
- `agents/author/research/index-sliceN.md` — working fragment; the merged index is canonical
- `agents/author/voice-charter.md` — persona internals (REQ-CORPUS-11 ruling; GD-DEMO-PROCESS.R7)
- `agents/editor/notes.md` — editor's private notes (GD-DEMO-REDACT.R7)
- `correspondence/v2-review/01-claim-ledger-A.md` — part file; the merged ledger is canonical (R2)
- `correspondence/v2-review/01-claim-ledger-B.md` — part file; the merged ledger is canonical (R2)
- `manifest.md` — round log carrying writer-edit notes (GD-DEMO-REDACT.R7)

### Redactions applied (rule → replacement, file:line, reason)
- `rw-015` → a deep-research tracking parameter — `agents/author/drafting/v1/00-commissioning-brief.md:6` — prose mention of a tracking parameter normalized (R1 §2)
- `persona-slug` → the S. J. Sebastian corpus — `agents/author/drafting/v1/00-commissioning-brief.md:8` — persona slug becomes the corpus label (R1 §2)
- `persona-path` → the persona profile — `agents/author/drafting/v1/00-commissioning-brief.md:10` — persona profile path becomes its published label (R1 §2)
- `persona-slug` → the S. J. Sebastian corpus — `agents/author/drafting/v1/01-voice-brief.md:3` — persona slug becomes the corpus label (R1 §2)
- `rw-016` → a deep-research tracking parameter — `agents/author/drafting/v1/03-claim-ledger.md:46` — prose mention of a tracking parameter normalized (R1 §2)
- `persona-slug` → the S. J. Sebastian corpus — `agents/author/drafting/v1/04-draft-ledger.md:4` — persona slug becomes the corpus label (R1 §2)
- `rw-017` → as the writer's outline named them — `agents/author/ledgers/v1-response-ledger.md:106` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `rw-018` → are the writer's, named in the outline — `agents/author/ledgers/v1-response-ledger.md:260` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `rw-019` → as the writer's outline named them — `agents/author/ledgers/v1-response-ledger.md:376` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `persona-slug` → the S. J. Sebastian corpus — `agents/author/ledgers/v1-response-ledger.md:5` — persona slug becomes the corpus label (R1 §2)
- `persona-slug` → the S. J. Sebastian corpus — `agents/author/ledgers/v2-response-ledger.md:5` — persona slug becomes the corpus label (R1 §2)
- `rw-020` → via a reader proxy — `agents/author/research/index.md:311` — reader-proxy access annotation normalized (R1 §2)
- `rw-021` → via a reader proxy — `agents/author/research/index.md:334` — reader-proxy access annotation normalized (R1 §2)
- `rw-022` → via a reader proxy — `agents/author/research/sources/alegre-2017-rethinking-freedom-of-thought.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-023` → via a reader proxy — `agents/author/research/sources/alegre-2020-regulating-around-forum-internum.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-024` → via a reader proxy — `agents/author/research/sources/anthropic-position-open-weights.md:12` — reader-proxy access annotation normalized (R1 §2)
- `rw-025` → via a reader proxy — `agents/author/research/sources/anthropic-redeploying-fable-5-2026-06-30.md:14` — reader-proxy access annotation normalized (R1 §2)
- `rw-026` → via a reader proxy — `agents/author/research/sources/axios-trump-ai-framework-open-models-2026-08-04.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-027` → via a reader proxy — `agents/author/research/sources/axios-trump-openai-gpt-5-6-2026-06-25.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-028` → via a reader proxy — `agents/author/research/sources/bublitz-2026-what-is-thought.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-029` → via a reader proxy’s text extraction — `agents/author/research/sources/chatrie-v-united-states-slip-opinion.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-030` → via a reader proxy — `agents/author/research/sources/cnbc-openai-limits-gpt-5-6-2026-06-26.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-031` → via a reader proxy’s text extraction — `agents/author/research/sources/crs-lsb11429-ai-fourth-amendment.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-032` → via a reader proxy — `agents/author/research/sources/decock-2026-forum-interstitiale-working-paper.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-033` → via a reader proxy — `agents/author/research/sources/doj-kim-letter-2026-06-17.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-034` → via a reader proxy — `agents/author/research/sources/iaisr-2026-web-page.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-035` → via a reader proxy — `agents/author/research/sources/kim-order-2026-06-22.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-036` → via a reader proxy — `agents/author/research/sources/mccarthy-jones-walmsley-2025-forum-externum-thought.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-037` → a reader proxy — `agents/author/research/sources/natlawreview-20m-logs.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-038` → via a reader proxy — `agents/author/research/sources/openai-ai-policy-window.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-039` → via a reader proxy — `agents/author/research/sources/openai-ai-policy-window.md:11` — reader-proxy access annotation normalized (R1 §2)
- `rw-040` → from a reader proxy — `agents/author/research/sources/openai-ai-policy-window.md:18` — reader-proxy access annotation normalized (R1 §2)
- `rw-041` → via a reader proxy — `agents/author/research/sources/openai-help-daybreak-tac.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-042` → via a reader proxy — `agents/author/research/sources/openai-help-daybreak-tac.md:9` — reader-proxy access annotation normalized (R1 §2)
- `rw-043` → via a reader proxy — `agents/author/research/sources/openai-helping-people-when-they-need-it-most.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-044` → through a reader proxy — `agents/author/research/sources/openai-hf-incident-road-ahead.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-045` → via a reader proxy — `agents/author/research/sources/openai-hf-incident-third-party-impact.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-046` → via a reader proxy — `agents/author/research/sources/openai-hf-joint-statement-jul-2026.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-047` → via a reader proxy — `agents/author/research/sources/openai-hugging-face-incident-road-ahead-2026-08-26.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-048` → via a reader proxy — `agents/author/research/sources/openai-hugging-face-incident-road-ahead-2026-08-26.md:11` — reader-proxy access annotation normalized (R1 §2)
- `rw-049` → via a reader proxy — `agents/author/research/sources/openai-hugging-face-model-evaluation-security-incident-2026-07.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-050` → via a reader proxy — `agents/author/research/sources/openai-pacing-model-development.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-051` → via a reader proxy — `agents/author/research/sources/openai-previewing-gpt-5-6-sol-2026-06-26.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-052` → via a reader proxy — `agents/author/research/sources/openai-response-to-nyt-data-demands.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-053` → via a reader proxy — `agents/author/research/sources/openai-trusted-access-for-cyber.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-054` → via a reader proxy — `agents/author/research/sources/pin-2026-freedom-of-thought-conscience-ai.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-055` → a reader proxy — `agents/author/research/sources/pymnts-heppner-ruling.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-056` → via a reader proxy — `agents/author/research/sources/radsch-2026-battle-for-cognitive-liberty.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-057` → via a reader proxy — `agents/author/research/sources/richards-2015-intellectual-privacy-book.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-058` → via a reader proxy — `agents/author/research/sources/stein-order-20m-logs-2026-01-05.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-059` → via a reader proxy — `agents/author/research/sources/techcrunch-openai-revoked-cyber-access-2026-08-19.md:10` — reader-proxy access annotation normalized (R1 §2)
- `rw-060` → via a reader proxy — `agents/editor/research/sources/anthropic-claude-mythos-page-2026.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-061` → via a reader proxy — `agents/editor/research/sources/anthropic-position-open-weights-2026-07-27.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-062` → via a reader proxy — `agents/editor/research/sources/axios-trump-ai-framework-open-models-2026-08-04.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-063` → via a reader proxy — `agents/editor/research/sources/china-generative-ai-interim-measures.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-064` → via a reader proxy — `agents/editor/research/sources/cnbc-chinese-model-openai-attack-2026-07-24.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-065` → via a reader proxy — `agents/editor/research/sources/cnbc-zuckerberg-huang-slowdown-2026-09-15.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-066` → via a reader proxy — `agents/editor/research/sources/nyt-v-openai-preservation-order-2025-05-13.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-067` → via a reader proxy — `agents/editor/research/sources/nyt-v-openai-preservation-order.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-068` → via a reader proxy — `agents/editor/research/sources/nyt-v-openai-stein-order-2026-01-05.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-069` → via a reader proxy — `agents/editor/research/sources/openai-ai-policy-window-2026-09.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-070` → via a reader proxy — `agents/editor/research/sources/openai-help-daybreak-common-issues.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-071` → via a reader proxy — `agents/editor/research/sources/openai-helping-people-when-they-need-it-most-2025.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-072` → via a reader proxy — `agents/editor/research/sources/openai-hf-incident-and-misalignment.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-073` → via a reader proxy — `agents/editor/research/sources/openai-hf-incident-road-ahead-2026-08-26.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-074` → via a reader proxy — `agents/editor/research/sources/openai-hf-model-evaluation-security-incident-2026-07-21.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-075` → via a reader proxy — `agents/editor/research/sources/openai-previewing-gpt-5-6-sol-2026-06-26.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-076` → via a reader proxy — `agents/editor/research/sources/openai-trusted-access-for-cyber-page.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-077` → via a reader proxy — `agents/editor/research/sources/roanoke-times-snapchat-my-ai-conviction-2024-10-20.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-078` → via a reader proxy — `agents/editor/research/sources/rte-zuckerberg-incentive-2026-09-16.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-079` → via a reader proxy — `agents/editor/research/sources/us-v-heppner-rakoff-memorandum-2026-02-17.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-080` → via a reader proxy — `agents/editor/research/sources/us-v-rinderknecht-criminal-complaint-2025-10-08.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-081` → via a reader proxy — `agents/editor/research/sources/wired-lowell-white-house-expand-ai-policy-2026-08-12.md:2` — reader-proxy access annotation normalized (R1 §2)
- `rw-082` → (the writer's "Pass III article specification") — `correspondence/v1-drafting-note.md:6` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `rw-083` → a deep-research tracking parameter — `correspondence/v1-drafting-note.md:77` — prose mention of a tracking parameter normalized (R1 §2)
- `rw-084` → If the writer — `correspondence/v1-drafting-note.md:179` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `persona-slug` → the S. J. Sebastian corpus — `correspondence/v1-drafting-note.md:3` — persona slug becomes the corpus label (R1 §2)
- `rw-085` → as the writer's outline named them — `correspondence/v1-response.md:12` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `persona-slug` → the S. J. Sebastian corpus — `correspondence/v1-response.md:5` — persona slug becomes the corpus label (R1 §2)
- `persona-path` → the persona profile — `correspondence/v1-review/00-piece-brief.md:4` — persona profile path becomes its published label (R1 §2)
- `persona-slug` → the S. J. Sebastian corpus — `correspondence/v1-review/00-piece-brief.md:4` — persona slug becomes the corpus label (R1 §2)
- `rw-086` → a reader proxy — `correspondence/v1-review/01-claim-ledger.md:32` — reader-proxy access annotation normalized (R1 §2)
- `persona-path` → the persona profile — `correspondence/v1-review/editors-letter.md:4` — persona profile path becomes its published label (R1 §2)
- `persona-slug` → the S. J. Sebastian corpus — `correspondence/v1-review/editors-letter.md:4` — persona slug becomes the corpus label (R1 §2)
- `persona-slug` → the S. J. Sebastian corpus — `correspondence/v2-response.md:5` — persona slug becomes the corpus label (R1 §2)
- `persona-path` → the persona profile — `correspondence/v2-review/00-piece-brief.md:5` — persona profile path becomes its published label (R1 §2)
- `persona-slug` → the S. J. Sebastian corpus — `correspondence/v2-review/00-piece-brief.md:5` — persona slug becomes the corpus label (R1 §2)
- `rw-087` → the writer's title under autonomy — `correspondence/v2-review/04-craft-notes.md:39` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `persona-path` → the persona profile — `correspondence/v2-review/editors-letter.md:4` — persona profile path becomes its published label (R1 §2)
- `persona-slug` → the S. J. Sebastian corpus — `correspondence/v2-review/editors-letter.md:4` — persona slug becomes the corpus label (R1 §2)

### Published
- `https://sjsebastian.substack.com/p/the-governable-mind` — fetched 2026-11-04 — sha256 `f03138af0727fba6d509ab326e010530bdb903bebf6d6334eb5194dc01ab1289`

### Round and approval facts (the only facts S-9 may cite)
- v1 review: major revisions
- v1 response: revision delivered (v2) — 88 ledger rows: 36 accepted, 31 adapted, 3 rebutted, 1 deferred, 6 escalated
- v2 review: major revisions
- v2 response: revision delivered (v3) — 87 ledger rows: 42 accepted, 27 adapted, 3 rebutted, 3 deferred or declined, 5 escalated

## the-politics-of-visibility

### Source identity
- Source tree: the untracked agent-discourse scratch projects root, project `the-politics-of-visibility`
- agent-discourse HEAD (context): c3b434d7feec9ef341c425997d72b703e1358701
- Allowlisted input tree digest (sha256): `718d6e4890ae05bf9f90749abe03697e29c1c1d04f82984c01b71551fa3c2592`
- Export date: 2026-11-04

### Allowlist (keep rules → admitted files)
- `k-draft` (essay version): 2
- `k-correspondence` (review/response correspondence): 9
- `k-author-ledger` (response ledger): 1
- `k-drafting` (drafting dossier): 7
- `k-research-index` (research index): 2
- `k-source-note` (source note): 176
- `k-published` (Published post (REQ-CORPUS-12)): 1

### Excluded (file → reason)
- `agents/author/outline/1_article_sketch_and_outline.md` — deep-research outline (GD-DEMO-REDACT.R7)
- `agents/author/voice-charter.md` — persona internals (REQ-CORPUS-11 ruling; GD-DEMO-PROCESS.R7)
- `manifest.md` — round log carrying writer-edit notes (GD-DEMO-REDACT.R7)

### Redactions applied (rule → replacement, file:line, reason)
- `rw-088` → a deep-research tracking parameter — `agents/author/drafting/v1/00-commissioning-brief.md:5` — prose mention of a tracking parameter normalized (R1 §2)
- `rw-089` → a deep-research tracking parameter — `agents/author/drafting/v1/00-commissioning-brief.md:172` — prose mention of a tracking parameter normalized (R1 §2)
- `persona-slug` → the S. J. Sebastian corpus — `agents/author/drafting/v1/00-commissioning-brief.md:6` — persona slug becomes the corpus label (R1 §2)
- `persona-slug` → the S. J. Sebastian corpus — `agents/author/drafting/v1/01-voice-brief.md:3` — persona slug becomes the corpus label (R1 §2)
- `persona-path` → the persona profile — `agents/author/drafting/v1/01-voice-brief.md:5` — persona profile path becomes its published label (R1 §2)
- `persona-slug` → the S. J. Sebastian corpus — `agents/author/drafting/v1/01-voice-brief.md:6` — persona slug becomes the corpus label (R1 §2)
- `rw-090` → by the writer "approved, proceed." — `agents/author/drafting/v1/04-draft-ledger.md:55` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `persona-slug` → the S. J. Sebastian corpus — `agents/author/drafting/v1/04-draft-ledger.md:4` — persona slug becomes the corpus label (R1 §2)
- `rw-091` → outline.md`. The writer — `correspondence/v1-drafting-note.md:5` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `rw-092` → a deep-research tracking parameter — `correspondence/v1-drafting-note.md:71` — prose mention of a tracking parameter normalized (R1 §2)
- `persona-slug` → the S. J. Sebastian corpus — `correspondence/v1-drafting-note.md:3` — persona slug becomes the corpus label (R1 §2)
- `rw-093` → a writer-approved shape — `correspondence/v1-response.md:8` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `rw-094` → without the writer's input — `correspondence/v1-response.md:8` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `rw-095` → the writer's standing question — `correspondence/v1-response.md:8` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `rw-096` → (the writer's standing question — `correspondence/v1-response.md:94` — workflow-sense role vocabulary — ‘operator’ becomes ‘the writer’ (S-10), never ‘the author’
- `persona-slug` → the S. J. Sebastian corpus — `correspondence/v1-review/00-piece-brief.md:5` — persona slug becomes the corpus label (R1 §2)
- `persona-slug` → the S. J. Sebastian corpus — `correspondence/v1-review/03-argument-notes.md:156` — persona slug becomes the corpus label (R1 §2)
- `persona-path` → the persona profile — `correspondence/v1-review/editors-letter.md:4` — persona profile path becomes its published label (R1 §2)
- `persona-slug` → the S. J. Sebastian corpus — `correspondence/v1-review/editors-letter.md:4` — persona slug becomes the corpus label (R1 §2)

### Published
- `https://sjsebastian.substack.com/p/the-politics-of-visibility` — fetched 2026-11-04 — sha256 `23c5ad860155dce89e8dd3b7068f0d1950992ffacf9466187d46b24f3376cf61`

### Round and approval facts (the only facts S-9 may cite)
- v1 drafting: structure approved by the writer at the Phase 2 drafting gate
- v1 review: major revisions
- v1 response: revision delivered (v2) — 49 findings: 28 accepted, 12 adapted, 3 rebutted, 1 declined, 2 escalated to the conservative default; the appendix bold-tier labels stay an open question for the writer

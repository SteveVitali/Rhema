# Editor technology for Rhema: markdown-backed WYSIWYG, anchored comments, track changes, autosave, export

- Scope: ledger rows H1–H8, N1–N3 (touches C15, D6, D7, D17, F3, F5, K3, M8) · Date: 2026-08-27 · Sources fetched: 57

## Executive summary (≤ 300 words, decisions-first)

1. **Substrate: Tiptap (MIT) on ProseMirror, with markdown as the canonical stored format.** T6 is *confirmed in its choice of family* (ProseMirror) and *refined in its premise*: anchored comments, track changes and version-compare are "solved" in Tiptap only as **paid, cloud-tethered Pro extensions** (Comments needs a Tiptap Document server and a Start plan at $59/mo; Tracked Changes is a custom-priced add-on; Snapshot Compare needs the Team plan at $179/mo; on-premises is Enterprise-only) [S1][S2][S5][S6]. The open-source primitives underneath (ProseMirror decorations/step-mapping, Yjs relative positions, prosemirror-changeset, an MIT marks-based suggestion extension) are sufficient to build all three ourselves, and that is the recommendation.
2. **Markdown fidelity is a build item, not a library feature.** `@tiptap/markdown` (marked-based, released 2025-10-15, "early release") covers CommonMark/GFM; footnotes, math, figures-with-captions and citations each need an explicit node + markdown spec [S3][S4]. Milkdown's remark-based pipeline is the most faithful out of the box but has a far smaller ecosystem for comments/suggestions; BlockNote's markdown export is documented as lossy; Lexical's transformers cover neither footnotes nor math [S17][S21].
3. **Collaboration/autosave: Yjs + self-hosted Hocuspocus (MIT) on AWS, with y-indexeddb as the local-first buffer.** Single-author today (Q-6), but the same stack gives never-lose-work, offline queueing and CRDT merge for free; Liveblocks/Tiptap Cloud/PartyKit rejected on cost-at-scale, lock-in or non-AWS hosting (Q-3, M8) [S8][S9][S27][S30].
4. **Conflict policy (N2): agents never write into a document a human can be editing.** Agent output is always a *new* draft version; a running review freezes its input version; human edits during a run fork into a working copy that is reconciled afterwards as suggestions.
5. **Version semantics (N3): three tiers** — CRDT keystroke history (undo), restore points (Yjs snapshots, automatic + named), and immutable draft versions `vN` created by workflow completion or explicit promotion. "Save" is never a verb in the UI.
6. **Export: pandoc 3.10.2 (GPL-2+) as an isolated service** with `--citeproc` and the CC-BY-SA CSL style repository; Google Docs via Drive API docx-conversion; math via KaTeX/LaTeX; citations authored in pandoc `[@key]` syntax so the markdown stays portable [S38][S39][S43][S46].

## 1. Method and framing

All product facts below were fetched on 2026-08-27 from official docs, repositories, pricing pages or release notes; each is tagged `[Sn]` and listed in §Sources. Secondary sources (search snippets, Medium posts, HN) are labelled as such and used only for orientation. Observations are separated from inferences.

Rhema-specific requirements that drove the evaluation (from the founding prompt, ledger §H/§N and decisions Q-3, Q-6, Q-8, Q-9, Q-14):

- Markdown on the backend, formatted WYSIWYG on the front (founding prompt; F3). The harness skills read and write markdown files, so markdown is the *contract*, not a convenience export.
- Academic apparatus: **footnotes required**, basic citations, math/LaTeX "if easy", AI-generated figures with captions inserted in-flow (Q-8, C12).
- Review findings anchored to passages with disposition controls (T2, D6) — the dossier already quotes every passage.
- Version diffs between `vN` and `vN+1` tied to the response ledger (D7).
- Never-lose-work autosave; agent-vs-human concurrency (D17, N1–N3, K3).
- TypeScript only, AWS-first, bias against dependencies that get expensive or constrain rigor (Q-3, M8). Closed source (Q-19) — so copyleft licences matter.
- Single author now, Databricks-style sharing later (Q-6).
- Dark by default; Substack as a counter-weight aesthetic (Q-14).
- Export to txt/md/rtf/docx/Google Docs/PDF/LaTeX (Q-9, C15).

## 2. Candidate survey (H1)

### 2.1 Tiptap (ProseMirror)

*Observed.* The Tiptap editor core is MIT-licensed (copyright Tiptap GmbH, 2025) [S1a]; the pricing page states "Tiptap Editor is open source (MIT) and free" and that "only platform features and cloud documents incur charges" [S1]. The paid platform tiers are:

| Plan | Price | Cloud docs / env | Notable inclusions |
|---|---|---|---|
| Start | $59/mo ($49 annual) | 500 | Real-time collaboration, inline AI, document history, **comments**, import/export (DOCX, Markdown, PDF, ODT, EPUB), 7-day log retention; 30-day trial |
| Team | $179/mo ($149 annual) | 5,000 | + **version comparison**, webhook + REST APIs, page-based layouts |
| Business | $1,199/mo ($999 annual) | 50,000 | + 3-month log retention, 99.9% uptime |
| Enterprise | custom | custom | **on-premises deployment option**, own auth/storage/AI models, SOC 2 Type II |
| Add-ons | | | **Tracked Changes: custom pricing**; AI Toolkit: custom pricing; extra dev seats $49/dev/mo; doc add-ons up to 500k/env |

[S1]

- **Comments** require a Tiptap Cloud Document server and a Start plan or trial ("not available in the open-source version"); they support threads, resolve/edit/delete, offline commenting, overlapping comments, comments on nodes and across selections, and a REST API [S2]. Threads are rendered via ProseMirror **decoration classes** (`.tiptap-thread`, `--inline`, `--block`, `--hovered`, `--selected`, `--resolved`) [S2b]; the docs say a thread can be "deleted from the Yjs document", so thread state lives in the Yjs doc [S2c]. *Inferred:* anchoring uses Yjs relative positions (Yjs lists "comment attachments to text" as a primary use case for relative positions [S26]); the docs do not state the mechanism.
- **Tracked Changes** is a separate paid add-on, distributed from Tiptap's private npm registry; tracks eight change types incl. formatting and structural edits, groups continuous edits, supports nested suggestions and comments integration; "collaboration ready" but does not mandate Yjs; the docs warn it is under active development and that versions below 1.0.0 are unstable [S5][S5b][S5c].
- **Snapshots** (auto-versioning default every 30 s, named versions, revert with backup) is a Pro feature requiring a Document server [S6b]. **Snapshot Compare** requires the Team plan and a `TiptapCollabProvider`; diffs are computed with a `ChangeTrackingTransform` over ProseMirror steps, with attribution incl. the Yjs client ID, rendered as decorations [S6].
- **Collaboration** is Yjs + Hocuspocus; cloud or "on-premises enterprise solution with Docker images"; the docs warn about schema drift between clients ("removing unrecognized elements based on the older schema") [S7]. A Team-plan REST "inject content" API lets a server PATCH/POST Yjs documents with JSON, binary updates or base64 states, with checksum-based conflict detection, while users keep editing [S7b].
- **Markdown**: `@tiptap/markdown` (announced 2025-10-15, open source) is marked-based, CommonMark-compliant, bidirectional (`contentType: 'markdown'`, `getMarkdown()`), with `createBlockMarkdownSpec`/`createInlineMarkdownSpec` for custom nodes and custom tokenizers. Documented limitations: "Comments are not supported yet", only one child node per table cell, HTML goes through Tiptap's HTML parser, and the extension is "early release" [S3][S4].
- **Mathematics**: `@tiptap/extension-mathematics` renders LaTeX with KaTeX, inline and block nodes [S10].
- **Footnotes**: not built in; Buttondown open-sourced `tiptap-footnotes` (MIT, superscript marker + auto-generated list, `[^1]` markdown syntax, updated March 2026 per search snippet) [S11][S11b].
- **Conversion** (DOCX/Markdown import, DOCX/PDF/ODT/EPUB/Markdown export) is a synchronous REST service included with all subscriptions; explicitly "not an asynchronous job queue" [S12].
- Ecosystem evidence: Substack's editor is Tiptap on ProseMirror (secondary: Substack announcement and ProseMirror forum threads surfaced by search) [S48]; BlockNote and Novel are built on Tiptap [S18][S22].

*Inferred.* Tiptap is the most complete ProseMirror distribution and the one whose commercial layer most closely matches Rhema's feature list — which is exactly the risk: the interesting parts are gated behind a per-document cloud subscription whose on-prem option is Enterprise-only, and Tracked Changes is pre-1.0 with custom pricing. Building on Tiptap's MIT core while implementing comments/suggestions/compare ourselves keeps the ecosystem (extensions, community footnotes/math, Substack-proven typography patterns) without the meter.

### 2.2 Milkdown

*Observed.* MIT, ~11.9k stars, "plugin-driven WYSIWYG markdown editor" built on ProseMirror and **remark** [S13][S13b]. Official packages include `preset-commonmark`, `preset-gfm`, `plugin-collab`, `plugin-history`, `plugin-diff`, `plugin-streaming`, `plugin-block`, `plugin-slash`, `plugin-upload`, plus `crepe` (a batteries-included editor) and `components` [S14][S14b]. `@milkdown/plugin-math` (KaTeX) exists on npm (7.5.9 at time of search) and Crepe renders inline and block LaTeX (search snippets; official plugin list fetched) [S15]. No official footnote plugin surfaced; remark-gfm (which Milkdown's GFM preset is built on) supports footnotes at the AST level [S36].

*Inferred.* Milkdown is the purest "markdown is the model" editor: the ProseMirror schema is derived from the mdast, so round-trip is structurally guaranteed for anything remark can represent. That is precisely the property Rhema wants for the harness contract. Its weaknesses are the ones that matter for T2/D6/D7: no comments, no suggestion mode, a smaller contributor base than Tiptap, and a more opinionated plugin/context system (`ctx`) that would make our own comment/suggestion plugins Milkdown-specific rather than plain ProseMirror. `plugin-diff` and `plugin-streaming` are notable for agent-driven drafting (streaming tokens into the doc).

### 2.3 BlockNote

*Observed.* Core is MPL-2.0 ("allows you to use BlockNote in commercial (and closed-source) applications"); **XL packages** (AI, multi-column, PDF/DOCX/ODT/Email exporters) are GPL-3.0 or a commercial licence at **$195/mo Business** ($2,340/yr) [S16][S16b]. Built on ProseMirror and Tiptap; ~10.1k stars; NLnet-backed [S16b]. Comments require enabling Yjs collaboration and offer `YjsThreadStore`, `RESTYjsThreadStore` (writes via REST for access control, reads from Yjs) and `TiptapThreadStore`; thread data lives in a `doc.getMap("threads")` [S17b]. Collaboration supports Liveblocks, PartyKit, Y-Sweet, Hocuspocus, y-websocket, y-indexeddb, y-webrtc [S17c]. Markdown export is documented as **lossy** ("not all structures can be entirely represented in Markdown … children of blocks which aren't list items are un-nested and certain styles are removed"); the non-lossy format is BlockNote's own JSON [S17].

*Inferred.* BlockNote is a Notion-style *block* editor — the block-with-children model is the mismatch: prose is a flowing sequence of paragraphs with inline apparatus, and markdown cannot represent nested non-list blocks, which is why their export is lossy. Its comments implementation (open source, Yjs-map thread store with REST write path) is the best public reference design for what Rhema should build on Tiptap. GPL-3.0 exporters are unusable in a closed-source product without the $195/mo licence, and we would use pandoc anyway.

### 2.4 Plate (Slate)

*Observed.* MIT, ~16.5k stars, React framework on Slate with an "open code" shadcn-style component registry; "free for personal and commercial projects" [S19][S19b]. `@platejs/markdown` is remark-based: CommonMark + `remark-gfm` (tables, strikethrough, task lists, **footnotes**), `remark-math` ($ / $$), mentions, MDX for custom elements; raw HTML is ignored by default [S20]. `@platejs/suggestion` is open source and represents text suggestions as inline marks with `{id, userId, createdAt, type}` and block suggestions at element level; it pairs with a `discussion` plugin for comments [S21b]. A "Plate Plus" premium tier exists (pro.platejs.org) but no public price was found [S49].

*Inferred.* Plate is the strongest *non-ProseMirror* candidate: remark-based markdown with footnotes and math, and an MIT suggestion + discussion pair. The cost is Slate itself — a less rigorous document model (no schema-enforced content expressions, positions are paths rather than integer offsets, weaker mapping semantics), a React-only surface, and a Yjs binding (slate-yjs) that is a third-party project rather than first-party. For a product whose integrity guarantees rest on precise range tracking, ProseMirror's step/mapping model is the safer foundation (§3.2).

### 2.5 Lexical (Meta)

*Observed.* MIT, ~23.8k stars, framework-agnostic core with React bindings, Yjs collaboration via `@lexical/yjs` with y-websocket as the supported provider; production guidance is to bootstrap initial content server-side; the playground's `CommentPlugin` (separate Yjs room for comments) is explicitly "not production ready" [S23][S23b]. `@lexical/markdown` is transformer-based (headings, lists, quotes, code, bold/italic/strike/code, links, tables mentioned); no footnotes or math transformers are documented [S24].

*Inferred.* Lexical is fast and accessible but its markdown layer is a shortcut system, not a serializer; every academic construct would be custom. No comments or suggestions outside the playground. Rejected for Rhema on ecosystem fit, not quality.

### 2.6 Raw ProseMirror

*Observed.* ProseMirror's guide documents the schema/node/mark model, immutable documents, transactions of invertible **steps** with position **mapping** (`Mapping`, `bias`), and **decorations** (node/inline/widget) held in plugin state and mapped forward on every transaction — "causing decorations to stay in place" [S25]. `prosemirror-markdown` is markdown-it based with a CommonMark-only schema (no tables, footnotes, math) [S25b]. `prosemirror-changeset` (MIT) distills step maps into insertion/deletion spans with metadata and `simplifyChanges()` to word boundaries [S28]. The change-tracking example shows commit/blame via inverted steps rebased through later mappings, warning that "complicated reverts … can sometimes be unintuitive" [S29]. **All ProseMirror and CodeMirror repositories were archived on GitHub on 2026-04-01 and moved to `code.haverbeke.berlin`** [S25b][S28][S34].

*Inferred.* Raw ProseMirror gives maximal control at the cost of rebuilding what Tiptap already wraps (extension system, commands, React/Vue bindings, keyboard maps, bubble menus). Since Tiptap *is* ProseMirror (every Tiptap extension can drop to `addProseMirrorPlugins`), the "raw" option is not an alternative but a fallback posture: write the sensitive plugins (comments, suggestions, compare) as plain ProseMirror plugins wrapped in thin Tiptap extensions so they survive a Tiptap change of direction. The hosting move is a governance signal to watch (single maintainer), not a functional risk — npm packages continue.

### 2.7 CodeMirror-markdown live-preview hybrids (Obsidian/Typora style)

*Observed.* Obsidian's Live Preview "presents formatted text inline while hiding most Markdown syntax", revealing syntax when the cursor enters a construct; Source mode shows all syntax; Reading view is non-editable [S31]. Obsidian's editor moved to CodeMirror 6 to enable Live Preview (secondary: community write-ups and HN thread surfaced by search) [S31b]. Typora renders spans "right after typing" and supports footnotes, MathJax math, tables and inline HTML [S32]. `@codemirror/lang-markdown` provides a Lezer syntax tree with GFM and is "a code editor mode, not a WYSIWYG editor" [S34].

*Inferred.* The hybrid is the *most* faithful to markdown (the text is the model — round trip is identity) and the *least* suitable for Rhema's other requirements: comments and suggestions would be text-offset decorations over a plain string, figures/tables/math render as widgets that flicker in and out of source form, and the aesthetic reads as "power-user notes app", the opposite of the Substack-grade reading surface Q-14 asks for. Worth keeping as a **"Source" mode toggle** (Obsidian's three-mode pattern) for users who want raw markdown — cheap because the same markdown string feeds both.

### 2.8 Novel.sh

*Observed.* Apache-2.0 "Notion-style WYSIWYG editor with AI-powered autocompletions", built on Next.js + Tiptap + Vercel AI SDK; positioned as a deployable starter more than a library [S22]. The npm package `novel` is at 1.0.2, "last published a year ago", while GitHub activity continues (secondary: npm/search snippet) [S22b].

*Inferred.* A useful reference for slash-command/bubble-menu UX on Tiptap, not a dependency.

## 3. Cross-cutting evaluations

### 3.1 Markdown round-trip fidelity (H2)

What the academic niche needs, and how each construct fares. "Native" means the editor's official markdown layer handles it; "extension" means a first-party or reputable third-party package; "build" means Rhema writes the node + markdown spec.

| Construct | Markdown form (pandoc-compatible) | Tiptap | Milkdown | BlockNote | Plate | Lexical |
|---|---|---|---|---|---|---|
| Footnotes | `[^1]` / `[^1]: …` (GFM/pandoc) | extension (buttondown, MIT) + our markdown spec [S11] | build (remark-gfm parses footnotes [S36]; no official node found) | lossy/none | native via remark-gfm [S20] | build |
| Citations | `[@key, p. 12]` (pandoc citeproc) [S38] | build (inline atom node) | build | build | build (MDX) | build |
| Tables | GFM pipe tables | native (one child per cell) [S3] | native (preset-gfm) | lossy (issue reports) | native | partial |
| Figures + captions | `![caption](path){#fig:id}` or `<figure>` island | build (figure node ↔ image+caption) | build | lossy | build | build |
| Math | `$…$`, `$$…$$` (pandoc/remark-math) [S37] | extension (@tiptap/extension-mathematics, KaTeX) + markdown spec [S10] | extension (plugin-math) [S15] | none | native (remark-math) [S20] | build |
| Blockquotes | `>` | native | native | native | native | native |
| HTML islands | raw HTML | via Tiptap HTML parser [S3] | remark html node (build rendering) | none | ignored by default [S20] | build |
| Comments/threads | not in markdown | "not supported yet" in @tiptap/markdown [S3] | n/a | n/a | n/a | n/a |

*Observed constraints.* pandoc's markdown supports footnotes, tables, math and `--citeproc` citations, and is the lingua franca for export [S38]; remark-gfm implements footnotes/tables/tasklists/strikethrough/autolinks [S36]; marked needs `marked-footnote` for GFM footnotes [S35]; `@tiptap/markdown` uses marked, not remark [S3].

*Inferred design rule.* Rhema should define a **"Rhema Markdown" profile = CommonMark + GFM (tables, footnotes, strikethrough, task lists) + pandoc math (`$`/`$$`) + pandoc citations (`[@key]`) + a figure convention**, and treat the profile as a tested contract: a golden-file corpus (the three real projects in `agent-scratch/`, which already contain footnotes, figures and tables) round-tripped `md → doc → md` must be byte-stable modulo whitespace. Anything the editor cannot represent is preserved as an opaque "raw markdown" block node (Obsidian-style), never silently dropped — that is the one rule that makes markdown a *contract* rather than an export.

Why Tiptap despite marked: the parser is swappable at the `MarkdownManager` level and, more importantly, the serializer side is per-node (`createBlockMarkdownSpec`), so the profile is enforced in our node definitions. If marked's tokenizer proves inadequate for footnotes/citations, the fallback is to parse with remark (mdast) and map mdast → Tiptap JSON ourselves — a ~few-hundred-line mapper, which is exactly what Milkdown's `transformer` package does [S14b].

**Comments and suggestions must not be in the markdown.** Findings, threads and suggestion marks are stored beside the document (§3.2, §3.3), keyed to the version; the markdown the harness reads is always clean prose. This is also the immutability guarantee F5 needs: a reviewed draft's markdown never changes.

### 3.2 Anchored comments that survive edits (H3, D6)

*Observed primitives.*
- ProseMirror decorations are mapped through every transaction by plugin state; inline decorations "stay in place" across edits [S25]. Marks are part of the document (serialized), decorations are not.
- Yjs relative positions are "fixated to an element in the shared document and … not affected by remote changes"; all clients resolve them to the same index once synced; they encode to JSON or binary and convert via `createAbsolutePositionFromRelativePosition` (returns null if the referenced content was deleted) [S26]. Listed use cases: cursors, selections, **comment attachments**.
- BlockNote stores threads in a Yjs map outside the text and offers a REST-write/Yjs-read store for access control [S17b]. Tiptap Comments renders threads as decorations and stores them in the Yjs doc [S2b][S2c].

*Inferred design for Rhema.*

1. **Anchor = Yjs relative-position pair (start, end) + quoted text + version id.** Stored in a `findings`/`threads` table (Postgres) and mirrored into a Yjs `Y.Map('threads')` on the live doc for real-time rendering. Relative positions survive concurrent and offline edits; the quoted text and a fuzzy-match fallback (diff-match-patch's Bitap `match` or jsdiff) re-anchor findings when a document is *re-materialized from markdown* (e.g., the harness rewrote it, or the finding was authored against `vN` and is being projected onto `vN+1`) [S33][S30b].
2. **Render as decorations, never marks.** Keeps markdown clean, lets overlapping findings stack (severity-coloured underlines + gutter pins), and lets the same finding render in three surfaces: editor, dossier list, and the response ledger (T2).
3. **Findings from the review dossier are anchored by quotation.** The editorial-review skill already quotes each passage; ingestion resolves quote → range on the frozen `vN` (exact match first, then normalized-whitespace, then fuzzy with a confidence score; unresolved findings are shown "unanchored" at the top, never dropped). Because `vN` is frozen while reviewed, exact-match is the common case.
4. **Projection to the next version.** When the author (agent) produces `vN+1`, findings are re-anchored by quote-matching against `vN+1` so the human can see "where did this finding land" — the disposition ledger (`accept/adapt/rebut/defer`) links finding → move → changed range (D7).
5. **Access control.** Follow BlockNote's REST-write pattern: comment mutations go through the API (authorization, audit), and the Yjs map is a read-replica for live rendering. This keeps Q-6's viewer/editor/admin model enforceable server-side.

Alternatives rejected: (a) *Tiptap Comments* — cloud-tethered, $59/mo entry, 500 documents (every draft version is a document, so 500 docs ≈ 10 active users), Enterprise for on-prem [S1][S2]; (b) *Liveblocks Comments* — $0.01 per comment beyond credits [S27]: a single 15k-word review producing 60 findings + replies is ~$1 in metered comments before collaboration minutes, and the data lives off-AWS; (c) *marks in the document* — pollutes markdown and breaks F5 immutability.

### 3.3 Track changes / suggestion mode and version diffs (H4, D7)

*Observed.*
- Tiptap Tracked Changes: paid add-on, custom pricing, pre-1.0 [S1][S5c]. Snapshot Compare: Team plan, needs `TiptapCollabProvider` [S6].
- `sungkhum/tiptap-track-changes` (MIT): marks-based (insertions wrapped in marks, deletions hidden by marks), edit/suggest/view modes, per-change accept/reject, multi-author colours, undo/redo integration, "200+ tests"; 16 stars, 14 commits [S30].
- Plate's suggestion plugin: same marks-with-metadata design, open source [S21b].
- `prosemirror-changeset` (MIT): steps → insertion/deletion spans with metadata; `simplifyChanges` expands to word boundaries [S28]. ProseMirror "track" example: commit/blame by inverted steps; reverts via rebasing [S29].
- Text diff libraries: jsdiff (BSD-3, Myers; `diffWords`, `diffSentences`, `structuredPatch`) [S33]; diff-match-patch (Apache-2.0, archived 2024-08-05; semantic cleanup, fuzzy match/patch) [S33b].
- Milkdown ships `plugin-diff` [S14].

*Inferred design for Rhema.* Two distinct features, two mechanisms:

**(a) Suggestion mode (live, inside one version).** Marks-based, as in the MIT extension and Plate: `suggestion_insert` / `suggestion_delete` marks with `{id, author: user|agent-role, createdAt, runId?}`; accept/reject strips or applies marks; batch accept-all-by-author. Used for (i) a collaborator editing a shared draft in "suggest" role (Q-6), (ii) **agent-proposed edits** — e.g., the `respond-to-review` author agent could optionally return its `vN+1` as suggestions against `vN` rather than a whole new file, and the `visualize` skill (C12) inserts a figure as a suggested block, and (iii) reconciling the human's working copy after a run (§5.3). Suggestion marks are **stripped before markdown materialization**; the harness never sees them. Start from the MIT extension's test suite and design, but own the code (16-star projects are not dependencies).

**(b) Version compare (between immutable `vN` and `vN+1`).** Compute on the server from the two markdown files: block-align paragraphs (jsdiff `diffLines` over a normalized block list), then within changed blocks `diffWords`/`diffSentences` for prose and structural diff for tables/figures; render as (i) side-by-side, (ii) inline with insert/delete decorations, and (iii) a **"what changed and why" list** joining each changed block to response-ledger moves and findings (D7). prosemirror-changeset is the right tool when both endpoints are ProseMirror docs in the same session (e.g., restore-point preview); markdown-level diff is right when the endpoints are files written by different actors. Semantic cleanup (diff-match-patch's `cleanupSemantic`) is worth porting even though the repo is archived; jsdiff is the maintained default.

Alternatives rejected: Tiptap Tracked Changes + Snapshot Compare (cost, cloud tether, pre-1.0, Yjs-client-ID attribution ties diffs to the collab provider); rebuilding ProseMirror's blame-track example (its implicit conflict resolution is documented as unintuitive [S29]).

### 3.4 Collaboration and autosave options (H5)

*Observed.*
- **Yjs** (MIT, ~22.7k stars): updates are commutative/associative/idempotent; state vectors let clients exchange only deltas (`encodeStateAsUpdate(doc, sv)`); `mergeUpdates`/`diffUpdate` work without loading docs; deleted content is only garbage-collected when loaded into a `Y.Doc`; the main branch targets unstable v14, stable packages remain v13 [S9][S9b][S9c]. `Y.UndoManager` scopes undo by `trackedOrigins` with a 500 ms `captureTimeout` [S9d]. `y-prosemirror` (MIT) binds a `Y.XmlFragment` to ProseMirror with local-only undo [S9e].
- **y-indexeddb** (MIT): persists updates in the browser, "makes offline editing possible", `synced` event, custom metadata store [S9f].
- **Hocuspocus** (MIT, Überdosis/Tiptap, ~2.6k stars, ~2k commits): packages `server`, `provider`, `provider-react`, `extension-database`, `extension-sqlite`, `extension-redis`, `extension-s3`, `extension-webhook`, `extension-throttle`, `extension-logger`, `transformer`; Redis-based horizontal scaling; runs on Node, Bun, Deno, Cloudflare Workers (v4) [S8][S8b][S8c]. Tiptap documents migration between Hocuspocus and Tiptap Cloud "by switching providers" [S7].
- **y-websocket** (MIT): reference client/server; README says the in-memory backend "can't be scaled easily" and points to `@y/hub` for scalable backends [S9g].
- **Liveblocks**: Free (hard caps, branding) / Pro $30/mo / Team $600–3,750/mo; overage $0.002 per collaboration-minute, $0.01 per comment, $1 per 1M storage updates, $0.15/GB [S27]. Its Tiptap integration offers comments, version history, experimental offline [S27b].
- **PartyKit**: acquired by Cloudflare (April 2024, secondary), ISC, `y-partyserver` for Yjs, built on Durable Objects [S30c][S30d].
- **Y-Sweet** (Jamsocket): Jamsocket joined Modal on 2025-07-10; products "continue to operate normally while … migrated"; y-sweet stays open source [S27c].
- **AWS Fargate** (us-east-1, Linux/x86): $0.04408 per vCPU-hour, $0.004446 per GB-hour [S40].

*Inferred comparison.*

| Option | Fit with Q-3/M8 (AWS, low lock-in) | Cost at 1k / 10k active users | Offline + never-lose-work | Notes |
|---|---|---|---|---|
| **Yjs + Hocuspocus self-hosted (ECS Fargate + ElastiCache Redis + Postgres/S3 persistence)** | high | infra only: 2× (1 vCPU, 2 GB) tasks ≈ 2 × $38 ≈ **$76/mo** + Redis; scales horizontally via extension-redis | y-indexeddb buffer + CRDT merge | MIT; same provider API as Tiptap Cloud, so a managed escape hatch exists [S7] |
| Tiptap Cloud | low (SaaS, on-prem = Enterprise) | Start 500 docs → Business $1,199/mo for 50k docs; every draft version is a doc | yes | comments/compare/track-changes bundled but metered [S1] |
| Liveblocks | low (SaaS, non-AWS) | $0.002/min: 1k users × 20 h/mo editing = 1.2M min ≈ **$2,400/mo** + $0.01/comment | experimental offline [S27b] | excellent DX; metering is exactly the "expensive at scale" pattern Q-3 warns about |
| PartyKit / y-partyserver | medium (Cloudflare, not AWS) | Workers/DO pricing | yes | violates AWS-first; fine technically |
| Y-Sweet | medium (self-host possible; company absorbed by Modal) | — | yes | ownership transition risk [S27c] |
| Plain debounced PATCH + version vector | high | ~zero | no offline merge; last-writer-wins or manual conflict | adequate for *non-prose* artifacts (persona seed, settings) |
| y-websocket reference server | high | — | yes | README itself steers to other backends for scale [S9g] |

**Recommendation (H5): Yjs + self-hosted Hocuspocus on AWS**, y-indexeddb in the browser, Postgres (Yjs binary state + markdown materialization) via `extension-database`, S3 for restore-point blobs via `extension-s3`, Redis for multi-task fan-out, `extension-webhook` to notify the orchestrator of document events. Single-author today means the collab server is mostly an autosave server — that is fine; it is the cheapest correct autosave we can build, and Q-6's sharing model turns on with zero data-model change. Keep a **plain PATCH-with-version-vector path** for small non-prose records.

### 3.5 Typography for long-form reading (H6, D14)

*Observed.* Butterick: 45–90 characters per line, "two to three alphabets" [S41]. WCAG 2.2 AA: 4.5:1 for normal text, 3:1 for large; AAA 7:1 / 4.5:1 [S42]. Material dark theme: `#121212` base surface, avoid saturated accents, elevation via lighter overlays, calibrated text opacities [S44]. Literata: OFL 1.1, designed for Google Play Books "for digital publishing across various devices and screen sizes", variable font with optical-size behaviour in two files [S45].

*Inferred defaults (to be finalized in D14).*
- **Measure**: 65–70 ch body column (≈ 640–700 px at 18 px), centered, with findings/gutter pins in the margins so the measure is never compromised by side panels; panels collapse before the measure shrinks (M7 budget: 20k-word drafts must stay smooth — ProseMirror's incremental DOM is fine, but decorations for hundreds of findings should be virtualized per viewport).
- **Faces**: a screen-optimized OFL serif with optical sizes for the draft body (Literata is the evidence-backed candidate; Source Serif/Newsreader are alternatives), a neutral sans for chrome. Substack's counter-weight (Q-14) is precisely "serif body on a calm surface"; Cursor/Devin's inspiration is the chrome around it.
- **Dark mode**: not pure black — near-`#121212` surfaces, text at ~87% white, ≥ 4.5:1 for body, desaturated severity colours for findings, and a "paper" light theme for reading/export preview because export CSS (PDF/HTML) is light-first.
- **Three reading modes** (Obsidian pattern): Write (WYSIWYG), Source (markdown), Read (typeset, no chrome) — Read is also the print stylesheet.

### 3.6 Export pipeline (H7, C15, Q-9)

*Observed.* pandoc 3.10.2 (2026-08-11), GPL-2+, Haskell; outputs docx, odt, epub, pdf (via pdflatex/xelatex/lualatex, ConTeXt, weasyprint/prince/wkhtmltopdf, **typst**), LaTeX, HTML, RTF, plain text, JATS; `--citeproc` with `--csl` (default Chicago author-date) and `--bibliography`; footnotes, tables and math (MathJax/MathML/KaTeX for HTML, native for LaTeX/docx) [S38][S38b][S38c]. CSL styles: ~1,877+ files, **CC BY-SA 3.0** with attribution to the CSL project [S46]. CSL processors: citeproc-js (dual **CPAL/AGPL**), citeproc-rs, pandoc's built-in citeproc [S43][S43b]. citation.js (MIT) converts BibTeX/DOI/CSL-JSON/RIS and has a CSL output plugin [S47]. Google Drive API: upload with `mimeType: application/vnd.google-apps.document` converts a docx to a native Google Doc; multipart ≤ 5 MB, resumable above [S39]. Tiptap Conversion offers DOCX/PDF/ODT/EPUB/Markdown export as a subscription REST service [S12]. `docx` (MIT, ~5.9k stars) generates .docx in TS [S50]. BlockNote's exporters are GPL/commercial XL [S16].

*Inferred design.*
- **One converter, many targets: pandoc in its own container** (ECS task or Lambda container image) called by an `export` service over an internal HTTP/queue boundary. GPL-2 applies to pandoc itself; invoking it as a separate process/service from closed-source code is the standard posture (M9 notes this). Not linked into our TypeScript.
- **Targets**: md (identity), txt (`plain`), html (with KaTeX/MathML), docx (with a Rhema `--reference-doc` for styles; footnotes native), rtf, odt, epub, latex (`.tex` + `.bib`), pdf (**typst engine first** — small image, no TeX distribution; xelatex as the "journal-grade" option behind a longer job), **Google Docs = docx → Drive API conversion** with the user's OAuth grant (C15's open question resolved: it is the Drive route, not the Docs API).
- **Citations**: author `[@key]` in the draft; the project holds a CSL-JSON bibliography (from DOI/BibTeX via citation.js, MIT); pandoc `--citeproc` renders per chosen CSL style at export. **Do not embed citeproc-js in the client** (AGPL/CPAL) — for in-editor preview either call the export service for a rendered bibliography or use citation.js's CSL plugin (verify at implementation that its CSL rendering does not transitively pull citeproc-js; open question).
- **Figures** (C12): stored as project assets (SVG/PNG + the generating spec); markdown references the rendered file; pandoc handles captions natively via the image-in-its-own-paragraph rule.
- **Fidelity matrix** per format is a required deliverable for C15; the golden corpus from §3.1 doubles as the export test set.

Alternatives rejected: Tiptap Conversion (subscription, synchronous, no queue [S12]); BlockNote XL exporters (GPL); hand-rolling docx with the `docx` library (fine for a docx-only path, but it would not give LaTeX/RTF/PDF and would duplicate pandoc's footnote/citation logic).

## 4. Scoring matrix (H8)

Scores 1–5 (5 best). Licensing cost is scored for a closed-source product at 1k–10k active users. "TS fit" = TypeScript-first, framework-agnostic core, first-party bindings.

| Candidate | Beauty / simplicity | Markdown fidelity | Comments | Track changes | Collab / autosave | Licensing cost at scale | TS ecosystem fit | **Total /35** |
|---|---|---|---|---|---|---|---|---|
| **Tiptap (MIT core, own plugins)** | 5 | 3 (marked; build footnotes/citations/figures) | 4 (build on decorations + Yjs rel-pos; BlockNote reference design) | 4 (MIT marks pattern; changeset) | 5 (Yjs/Hocuspocus first-party) | 5 (MIT; self-host) | 5 | **31** |
| Tiptap + Pro/Cloud | 5 | 3 | 5 | 4 (pre-1.0 add-on) | 5 | 1 (per-doc tiers, custom add-ons, on-prem = Enterprise) | 5 | 28 |
| Milkdown | 4 | 5 (remark/mdast model) | 2 | 2 (plugin-diff only) | 4 (plugin-collab) | 5 | 4 (own ctx system) | 26 |
| Plate (Slate) | 4 | 4 (remark-gfm footnotes, math) | 4 (discussion plugin) | 4 (suggestion marks) | 3 (third-party slate-yjs) | 5 (MIT; Plus optional) | 3 (React-only; Slate model) | 27 |
| BlockNote | 4 (Notion-like, not prose-like) | 2 (documented lossy) | 4 (open Yjs thread stores) | 2 | 5 | 3 (MPL core; XL GPL/$195/mo) | 4 | 24 |
| Lexical | 4 | 2 (transformers; no footnotes/math) | 2 (playground only) | 1 | 4 | 5 | 4 | 22 |
| Raw ProseMirror | 3 (build everything) | 3 (markdown-it; CommonMark schema) | 4 | 4 | 5 | 5 | 4 | 28 |
| CodeMirror live-preview hybrid | 2 (as primary surface) | 5 (text is the model) | 2 | 2 | 4 (y-codemirror) | 5 | 4 | 24 |
| Novel.sh | 4 | 3 | 1 | 1 | 3 | 5 | 3 (starter kit; npm stale) | 20 |

**Recommendation (H8): Tiptap MIT core + own ProseMirror-level plugins for comments, suggestions and compare + Yjs/Hocuspocus self-hosted + remark-grade markdown profile, with Milkdown's transformer as the fallback parser strategy and a CodeMirror "Source" mode as a secondary view.**

Alternatives rejected and why: *Tiptap Cloud* (metering per document, Enterprise-only on-prem, contradicts Q-3/M8); *Milkdown* (best fidelity but we would build comments/suggestions in a smaller, more idiosyncratic ecosystem; if the Tiptap markdown layer fails our golden corpus, the correct move is to adopt Milkdown's remark transformer approach inside Tiptap, not to switch editors); *Plate* (Slate's model is weaker for precise range tracking, React-only); *BlockNote* (block model is a prose mismatch, lossy markdown, GPL exporters); *Lexical* (no markdown serializer of the needed depth); *raw ProseMirror* (Tiptap already is ProseMirror; we keep the escape hatch by writing sensitive plugins at the ProseMirror layer).

**Thesis T6 verdict: confirmed with a correction.** ProseMirror-family is right; Tiptap over Milkdown is right; but "anchored comments, track-changes, and Yjs autosave are all solved there" is true only of the paid, cloud-tethered layer. Only Yjs autosave is solved in the open. The other two are ~2–4 engineer-weeks each of well-trodden plugin work, and owning them is what makes T2's "findings are the killer UI" possible without a per-comment meter.

## 5. Autosave and versioning design for N1–N3 (and D17, K3, F5)

### 5.1 N1 — Autosave architecture: four layers, "unsaved" never exists

```
[editor state] ──y-prosemirror──▶ [Y.Doc]
      │                              │ every update (ms)
      │                              ├──▶ y-indexeddb (browser; survives refresh/crash/offline)
      │                              │
      │                              └──▶ HocuspocusProvider (WSS) ──▶ Hocuspocus on ECS
      │                                                                   │ debounce 2 s / on disconnect / max 30 s
      │                                                                   ├──▶ Postgres: documents.ystate (binary), state_vector
      │                                                                   ├──▶ markdown materialization → S3 + documents.md_hash (F3 mirror for the harness)
      │                                                                   ├──▶ restore point (Yjs snapshot) every 5 min of activity, on blur/close, on workflow boundaries
      │                                                                   └──▶ webhook → orchestrator (doc changed, version promoted)
      └── UI: presence/sync pill = {synced · syncing · offline (n changes queued)}; never "unsaved"
```

- **Layer 0/1 (local-first).** `y-indexeddb` writes every update; on reload the doc is available before the socket connects (`synced` event) [S9f]. Offline edits queue naturally; on reconnect the provider exchanges state vectors and merges [S9b]. Cross-tab consistency comes from the provider's BroadcastChannel path [S9g].
- **Layer 2 (server).** Hocuspocus `extension-database` stores the Yjs binary state; `extension-redis` for multi-task; `extension-throttle` and JWT auth in `onAuthenticate` enforce Q-6 roles (viewer = read-only connection).
- **Layer 3 (materialization).** A server-side `transformer` turns the Yjs XML fragment into Tiptap JSON and then markdown through the same serializer the client uses (single source of truth for the Rhema Markdown profile) — the on-disk project-memory mirror the skills read (F3). Materialize on debounce and on every restore point; the harness reads only *promoted* versions (§5.3), so intermediate materializations are for crash recovery and search.
- **Restore points.** Yjs snapshots require `gc: false` on the doc, so restore points are stored as full encoded states in S3 (cheap: a 20k-word draft is tens of KB) with a Postgres index `{doc_id, created_at, cause: auto|blur|named|workflow, label}`. "Restore" = load the state into a new Y.Doc, diff against current with prosemirror-changeset for a preview (§3.3b), then apply as a transaction (so it is itself undoable and merges for other collaborators) — the same semantics Tiptap documents for its Snapshot revert [S6b].
- **Undo.** `Y.UndoManager` with `trackedOrigins = {local user}` so agent-origin transactions are not undone by the human's ⌘Z [S9d].
- **Budget.** Two Fargate tasks (1 vCPU/2 GB each ≈ $38/mo each at us-east-1 rates [S40]) + a small ElastiCache node comfortably serve the first thousands of users; horizontal scale is a task-count knob.
- **Fallback path.** Non-prose records (persona seed text, project settings, outline metadata) use a plain PATCH with an `If-Match` version vector and a 409 on conflict; if the network is down these queue in IndexedDB under the same "syncing (n)" pill.

### 5.2 N2 — Agent-written vs human-written concurrency

Principle: **an agent never writes into a document that a human can have open for editing.** Three cases:

1. **Workflow produces a new version** (draft-from-outline → `v1`; respond-to-review → `vN+1`). The agent writes markdown to project memory; the orchestrator ingests it as a *new* immutable document/version (new Y.Doc seeded from markdown; server-side, no client involved). No conflict is possible by construction.
2. **Workflow reads a version** (editorial-review on `vN`). At run start `vN` is **frozen** (read-only; a banner: "Editorial review in progress on v3 — your edits will go to a working copy"). This is F5's immutability rule and K3's "never two writers". If the human wants to keep editing, the IDE forks `vN` into a **working copy** (`v3-working`, a live Y.Doc). When the run finishes, the human sees `v3` (reviewed), the dossier, and their working copy; the respond-to-review run takes `v3` + dossier as the skill expects, and the working-copy edits are offered as **suggestions projected onto `vN+1`** (markdown diff `v3 → v3-working` → suggestion marks on `v4`, §3.3a) so no human work is lost or silently overwritten.
3. **Agent edits in place** (C12 visualize inserts a figure; a future `line-edit` skill). The agent acts as a Yjs client through the server (origin `agent:<role>:<runId>`), so CRDT merge handles simultaneous human typing, and all agent changes carry suggestion marks — the human accepts or rejects them. Tiptap Cloud's inject-content API is the commercial precedent for exactly this server-side write path [S7b]; Hocuspocus lets us do it directly.

Locking UI (D17): frozen versions show a lock with the run card; working copies show a "diverged from v3" pill; the promote action is explicit.

### 5.3 N3 — Version semantics: three tiers, "save" is not a verb

| Tier | Granularity | Created by | Mutable? | Visible where |
|---|---|---|---|---|
| CRDT history | keystroke | always | n/a | ⌘Z only |
| Restore point | minutes / events | auto every 5 min of activity, on blur/close, before any workflow, on user "Mark restore point" | append-only | version rail (collapsed, "earlier today") |
| Draft version `vN` | milestone | (a) workflow completion; (b) explicit "Promote to v(N+1)"; (c) automatic promotion when a run starts and the working document has diverged from the last promoted version | **immutable** once a review has been run on it (F5); editable "working" state before that | timeline spine (T1), diff view (D7), export |

Rules:
- A project has at most one **working** version at a time (the head). Editing a frozen/reviewed version always forks to a new working head (`v4-working` in the UI simply reads "v4 · draft"), so the human's edits *become* `v(N+1)` — answering N3 directly: a human edit becomes `v(N+1)` the moment it touches a reviewed version; it stays `vN` while `vN` is unreviewed.
- Every promoted version is materialized to markdown, hashed, and written to project memory under the conventions' `drafts/vN.md`; the manifest row is derived from the versions table, not hand-edited (E2).
- Export always targets a promoted version (or promotes the head first with a one-click prompt), so exports are reproducible.

## 6. Rhema implications (numbered)

1. **H1/H8, T6**: adopt Tiptap MIT core; write comments, suggestion-mode and version-compare as ProseMirror-layer plugins wrapped in Tiptap extensions; no Tiptap Cloud, Liveblocks or PartyKit dependencies (Q-3, M8).
2. **H2, F3**: define and test the "Rhema Markdown" profile (CommonMark + GFM footnotes/tables + pandoc math + pandoc citations + figure convention) against the three real projects as a golden corpus; unknown constructs are preserved as raw blocks, never dropped.
3. **H3, D6, T2**: findings anchor by Yjs relative positions + quoted text with fuzzy re-anchoring; rendered as decorations; mutations via REST for Q-6 roles; findings are projected across versions to power the response ledger.
4. **H4, D7**: suggestion marks for live proposals (human collaborators and agents); markdown-level block/word diff for `vN` vs `vN+1` with "what changed and why" joined to ledger moves.
5. **H5, N1, D17, M2, M8**: Yjs + Hocuspocus on ECS Fargate + Redis + Postgres/S3; y-indexeddb local buffer; restore points as encoded states; "unsaved" is not a state; plain version-vector PATCH for non-prose records.
6. **N2, K3, F5**: agents never write into human-editable docs; reviews freeze their input; working copies reconcile as suggestions; in-place agent edits go through the server as suggestion-marked CRDT transactions.
7. **N3, F5, E2, T1**: three-tier version model; a human edit to a reviewed draft *is* `v(N+1)`; manifest derived from the versions table.
8. **H6, D14, Q-14**: 65–70 ch measure, OFL screen serif for body, ≥ 4.5:1 dark theme on non-black surfaces, Write/Source/Read modes, print stylesheet = Read mode.
9. **H7, C15, Q-9, M9**: pandoc-in-a-container export service (typst PDF first, xelatex optional), `--citeproc` + CC-BY-SA CSL styles with attribution, Google Docs via Drive docx conversion, no citeproc-js (AGPL/CPAL) in the client.
10. **C12**: figures are suggestion-marked block insertions with caption/alt/source; stored as assets; exported by pandoc natively.
11. **M7**: performance budget items — virtualize finding decorations; keep restore-point snapshots off the hot path; materialize markdown server-side, not in the browser.
12. **Governance watch**: ProseMirror/CodeMirror moved off GitHub to a self-hosted forge in April 2026 [S25b][S34]; Jamsocket/Y-Sweet absorbed by Modal (2025) [S27c]; diff-match-patch archived (2024) [S33b]; Novel npm stale [S22b]. None blocks the recommendation; all argue for owning the sensitive plugins.

## Ledger updates

| Row | Proposed status | One-line evidence |
|---|---|---|
| H1 | done (this note §2, §4) | Eight candidates surveyed from official docs/repos; scoring matrix delivered |
| H2 | done → spawns build item | Construct-by-construct fidelity table; Rhema Markdown profile + golden-corpus rule (§3.1) |
| H3 | done (design) | Yjs relative positions + quote re-anchoring, decorations, REST-write thread store (§3.2) |
| H4 | done (design) | Marks-based suggestion mode + markdown-level version diff; Tiptap Tracked Changes rejected (paid, pre-1.0) (§3.3) |
| H5 | done (decision) | Yjs + self-hosted Hocuspocus on AWS; Liveblocks/Tiptap Cloud/PartyKit rejected on cost/lock-in/hosting (§3.4) |
| H6 | partial → D14 | Measure, contrast, dark-surface and font evidence; final type system in D14 (§3.5) |
| H7 | done (design) | pandoc 3.10.2 service, citeproc/CSL, Drive conversion for Google Docs (§3.6) |
| H8 | done | Matrix + recommendation + T6 verdict (§4) |
| N1 | done (design) | Four-layer autosave; restore points; no "unsaved" state (§5.1) |
| N2 | done (policy) | Freeze-on-review, working-copy fork, suggestions on reconcile, agent writes via server with suggestion marks (§5.2) |
| N3 | done (semantics) | Three tiers; human edit to reviewed draft = v(N+1) (§5.3) |
| C15 | partial | Format list and Google Docs route decided; per-format fidelity matrix still to produce from golden corpus |
| T6 | confirmed with correction | ProseMirror/Tiptap right; "solved there" only true for paid cloud extensions |
| M8 | evidence added | Realtime service class: self-host Hocuspocus vs Liveblocks/Tiptap Cloud costed (§3.4) |

**New rows proposed**

| ID | Item |
|---|---|
| H9 | **Rhema Markdown profile + golden-corpus round-trip test suite** (footnotes, citations, math, figures, tables, raw blocks) as a gating deliverable before any editor UI work |
| H10 | **Comments/suggestions/compare plugin trio** written at the ProseMirror layer (spec, test plan, ~2–4 weeks each); adopt BlockNote thread-store and MIT track-changes designs as references, not dependencies |
| H11 | **Findings re-anchoring service**: quote → range resolution with confidence, projection across versions, "unanchored" fallback UI |
| H12 | **Source/Read modes** (Obsidian pattern) as secondary views over the same markdown |
| N4 | **Restore-point retention and storage policy** (per-plan retention, S3 lifecycle, size budget per doc) |
| C15a | **Bibliography model**: CSL-JSON per project, ingestion via DOI/BibTeX (citation.js), style picker, and the client-side preview licensing question |

## Open questions / unverified

- **Tiptap Comments anchoring mechanism** is inferred (Yjs relative positions); the docs only state decorations for rendering and Yjs for storage [S2b][S2c].
- **Tiptap Enterprise on-prem terms and price** (Docker images for Collaboration/Comments) were not fetchable beyond the pricing page's mention [S1][S7]; the recommendation does not depend on them.
- **Tiptap Tracked Changes price** is "custom" — not quantified [S1].
- **`@tiptap/markdown` behaviour on footnotes/citations via custom tokenizers** is asserted from the API surface [S3], not tested; H9 exists to test it. Milkdown's remark transformer is the fallback.
- **Milkdown footnotes**: no official plugin found; remark-gfm parses them [S36], so a node would be needed — not verified in Milkdown's docs (site pages returned navigation only).
- **Plate Plus pricing** not published on a fetchable page [S49].
- **citation.js's CSL plugin**: whether it transitively depends on citeproc-js (AGPL/CPAL) was not verified [S47]; matters only for in-client bibliography preview.
- **Liveblocks per-user cost model** is an illustrative calculation from published overage rates [S27]; actual usage will differ.
- **Substack-on-Tiptap** is from search snippets (secondary) [S48].
- **Novel npm staleness** is from a search snippet [S22b]; GitHub page partially failed to load.
- **Yjs v14** (unstable) timing: the design targets v13 stable per the repos' own guidance [S9e][S9g]; migration risk noted.
- Not fetched this session: Y-Sweet pricing (redirected to the Modal announcement) [S27c]; Material 3 dark-theme page (404; M2 page used) [S44]; Google Fonts Literata page (empty; GitHub repo used) [S45].

## Sources

1. [S1] https://tiptap.dev/pricing · Tiptap Pricing · 2026-08-27 · plan prices, cloud-doc limits, add-ons, on-prem = Enterprise
2. [S1a] https://github.com/ueberdosis/tiptap/blob/main/LICENSE.md · Tiptap LICENSE (MIT, Tiptap GmbH) · 2026-08-27 · core licence
3. [S2] https://tiptap.dev/docs/comments/getting-started/overview · Tiptap Comments overview · 2026-08-27 · cloud/Start-plan requirement, features
4. [S2b] https://tiptap.dev/docs/comments/core-concepts/style-threads · Style threads · 2026-08-27 · decoration classes
5. [S2c] https://tiptap.dev/docs/comments/integrate/editor-commands · Comments editor commands · 2026-08-27 · thread commands, Yjs storage mention
6. [S3] https://tiptap.dev/docs/editor/markdown · Tiptap Markdown introduction · 2026-08-27 · marked parser, custom specs, limitations
7. [S4] https://tiptap.dev/blog/release-notes/introducing-bidirectional-markdown-support-in-tiptap · Release note (2025-10-15) · 2026-08-27 · package, scope, gaps
8. [S5] https://tiptap.dev/docs/tracked-changes/getting-started/overview · Tracked Changes overview · 2026-08-27 · paid add-on, private registry, features
9. [S5b] https://tiptap.dev/docs/tracked-changes/usage/basic-usage · Tracked Changes basic usage · 2026-08-27 · commands, markChange
10. [S5c] Search result set (tiptap.dev tracked-changes docs) · 2026-08-27 · pre-1.0 instability statement (secondary snippet)
11. [S6] https://tiptap.dev/docs/collaboration/documents/snapshot-compare · Snapshot Compare · 2026-08-27 · Team plan, ChangeTrackingTransform, provider requirement
12. [S6b] https://tiptap.dev/docs/collaboration/documents/snapshot · Snapshots · 2026-08-27 · auto-versioning 30 s, revert semantics
13. [S7] https://tiptap.dev/docs/collaboration/getting-started/overview · Collaboration overview · 2026-08-27 · Yjs/Hocuspocus, on-prem Docker, provider migration, schema caveat
14. [S7b] https://tiptap.dev/docs/collaboration/documents/content-injection · Inject content REST API · 2026-08-27 · server-side Yjs updates, Team plan
15. [S8] https://github.com/ueberdosis/hocuspocus · Hocuspocus repo · 2026-08-27 · MIT, stars, maintenance
16. [S8b] https://github.com/ueberdosis/hocuspocus/tree/main/packages · Hocuspocus packages · 2026-08-27 · extension list
17. [S8c] https://tiptap.dev/docs/hocuspocus/introduction · Hocuspocus introduction · 2026-08-27 · runtimes, Redis scaling, React provider
18. [S9] https://github.com/yjs/yjs · Yjs repo · 2026-08-27 · MIT, stars, state vectors
19. [S9b] https://docs.yjs.dev/api/document-updates · Yjs document updates · 2026-08-27 · update properties, diff/merge, gc caveat
20. [S9c] (same as S9) · v13/v14 note
21. [S9d] https://docs.yjs.dev/api/undo-manager · Y.UndoManager · 2026-08-27 · trackedOrigins, captureTimeout
22. [S9e] https://github.com/yjs/y-prosemirror · y-prosemirror · 2026-08-27 · binding, local undo, v13/v14
23. [S9f] https://github.com/yjs/y-indexeddb · y-indexeddb · 2026-08-27 · offline persistence API
24. [S9g] https://github.com/yjs/y-websocket · y-websocket · 2026-08-27 · reference server limits, BroadcastChannel
25. [S10] https://tiptap.dev/docs/editor/extensions/nodes/mathematics · Tiptap Mathematics · 2026-08-27 · KaTeX inline/block
26. [S11] https://github.com/buttondown/tiptap-footnotes (via search) · tiptap-footnotes · 2026-08-27 · MIT footnotes extension, markdown syntax
27. [S11b] https://buttondown.com/blog/tiptap-footnotes · Buttondown blog · 2026-08-27 · rationale
28. [S12] https://tiptap.dev/docs/conversion/getting-started/overview · Tiptap Conversion · 2026-08-27 · formats, subscription, sync-only
29. [S13] https://milkdown.dev/docs/guide/why-milkdown · Why Milkdown · 2026-08-27 · ProseMirror+remark, MIT, Yjs
30. [S13b] https://github.com/Milkdown/milkdown · Milkdown repo · 2026-08-27 · stars, MIT
31. [S14] https://github.com/Milkdown/milkdown/tree/main/packages/plugins · Milkdown plugins dir · 2026-08-27 · official plugin list
32. [S14b] https://github.com/Milkdown/milkdown/tree/main/packages · Milkdown packages dir · 2026-08-27 · crepe, transformer, components
33. [S15] Search results (npm @milkdown/plugin-math; DeepWiki Crepe) · 2026-08-27 · math/KaTeX support (secondary)
34. [S16] https://www.blocknotejs.org/pricing · BlockNote pricing · 2026-08-27 · MPL core, GPL/commercial XL, $195/mo
35. [S16b] https://github.com/TypeCellOS/BlockNote · BlockNote repo · 2026-08-27 · licences, foundation, stars
36. [S17] Search results for blocksToMarkdownLossy (blocknotejs.org docs) · 2026-08-27 · lossy markdown statement (secondary snippet of official docs)
37. [S17b] https://www.blocknotejs.org/docs/features/collaboration/comments · BlockNote comments · 2026-08-27 · thread stores, Yjs map
38. [S17c] https://www.blocknotejs.org/docs/features/collaboration · BlockNote collaboration · 2026-08-27 · providers
39. [S18] (S16b) · BlockNote built on ProseMirror/Tiptap
40. [S19] https://platejs.org/docs · Plate docs · 2026-08-27 · architecture, licence statement
41. [S19b] https://github.com/udecode/plate · Plate repo · 2026-08-27 · MIT, stars
42. [S20] https://platejs.org/docs/markdown · Plate markdown · 2026-08-27 · remark-gfm/math, HTML ignored, MDX
43. [S21] (S24) · Lexical markdown limitations
44. [S21b] https://platejs.org/docs/suggestion · Plate suggestion · 2026-08-27 · marks with metadata, discussion plugin
45. [S22] https://github.com/steven-tey/novel · Novel repo · 2026-08-27 · Apache-2.0, Tiptap-based starter
46. [S22b] Search results (npm novel) · 2026-08-27 · 1.0.2 "last published a year ago" (secondary)
47. [S23] https://lexical.dev/docs/collaboration/react · Lexical collaboration · 2026-08-27 · @lexical/yjs, playground caveats
48. [S23b] https://github.com/facebook/lexical · Lexical repo · 2026-08-27 · MIT, stars
49. [S24] https://lexical.dev/docs/packages/lexical-markdown · @lexical/markdown · 2026-08-27 · transformers, gaps
50. [S25] https://prosemirror.net/docs/guide/ · ProseMirror guide · 2026-08-27 · schema, steps, mapping, decorations
51. [S25b] https://github.com/ProseMirror/prosemirror-markdown · prosemirror-markdown · 2026-08-27 · markdown-it, CommonMark schema, archived 2026-04-01 → code.haverbeke.berlin
52. [S26] https://docs.yjs.dev/api/relative-positions · Yjs relative positions · 2026-08-27 · semantics, encoding, comment use case
53. [S27] https://liveblocks.io/pricing · Liveblocks pricing · 2026-08-27 · plans, overage rates
54. [S27b] https://liveblocks.io/docs/ready-made-features/text-editor/tiptap · Liveblocks Tiptap · 2026-08-27 · comments, versions, offline (experimental)
55. [S27c] https://modal.com/blog/jamsocket-is-joining-modal · Jamsocket joins Modal (2025-07-10) · 2026-08-27 · Y-Sweet status
56. [S28] https://github.com/ProseMirror/prosemirror-changeset · prosemirror-changeset · 2026-08-27 · API, MIT, archived/moved
57. [S29] https://prosemirror.net/examples/track/ · ProseMirror change-tracking example · 2026-08-27 · blame/commit approach and caveats
58. [S30] https://github.com/sungkhum/tiptap-track-changes · tiptap-track-changes · 2026-08-27 · MIT marks-based suggestion mode, maturity
59. [S30b] (S33b) · fuzzy match for re-anchoring
60. [S30c] https://github.com/cloudflare/partykit · PartyKit repo · 2026-08-27 · ISC, y-partyserver, activity
61. [S30d] Search results (Crunchbase/X) · 2026-08-27 · Cloudflare acquisition April 2024 (secondary)
62. [S31] https://obsidian.md/help/edit-and-read · Obsidian Edit and read · 2026-08-27 · Live Preview/Source/Reading modes
63. [S31b] Search results (HN, community repos) · 2026-08-27 · Obsidian on CodeMirror 6 (secondary)
64. [S32] https://support.typora.io/Markdown-Reference/ · Typora markdown reference · 2026-08-27 · footnotes, math, HTML, live rendering
65. [S33] https://github.com/kpdecker/jsdiff · jsdiff · 2026-08-27 · APIs, Myers, BSD-3
66. [S33b] https://github.com/google/diff-match-patch · diff-match-patch · 2026-08-27 · Apache-2.0, archived 2024-08-05, semantic cleanup, fuzzy match
67. [S34] https://github.com/codemirror/lang-markdown · @codemirror/lang-markdown · 2026-08-27 · Lezer/GFM, code-editor mode, moved
68. [S35] https://github.com/bent10/marked-extensions/tree/main/packages/footnote · marked-footnote · 2026-08-27 · GFM footnotes for marked
69. [S36] https://github.com/remarkjs/remark-gfm · remark-gfm · 2026-08-27 · footnotes/tables/etc., MIT
70. [S37] https://github.com/remarkjs/remark-math · remark-math · 2026-08-27 · $/$$ syntax, rehype-katex, MIT
71. [S38] https://pandoc.org/MANUAL.html · pandoc manual · 2026-08-27 · formats, PDF engines incl. typst, citeproc/CSL, footnotes, math
72. [S38b] https://github.com/jgm/pandoc · pandoc repo · 2026-08-27 · GPL-2+, Haskell
73. [S38c] https://pandoc.org/releases.html · pandoc releases · 2026-08-27 · 3.10.2 (2026-08-11)
74. [S39] https://developers.google.com/workspace/drive/api/guides/manage-uploads · Drive API uploads · 2026-08-27 · docx → Google Doc conversion, size thresholds
75. [S40] https://aws.amazon.com/fargate/pricing/ · Fargate pricing · 2026-08-27 · us-east-1 vCPU/GB rates
76. [S41] https://practicaltypography.com/line-length.html · Butterick, Line length · 2026-08-27 · 45–90 characters
77. [S42] https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html · WCAG 2.2 SC 1.4.3 · 2026-08-27 · 4.5:1 / 3:1 / 7:1
78. [S43] https://citationstyles.org/developers/ · CSL developers · 2026-08-27 · processors list, schema MIT
79. [S43b] https://github.com/Juris-M/citeproc-js · citeproc-js · 2026-08-27 · CPAL/AGPL dual licence
80. [S44] https://m2.material.io/design/color/dark-theme.html · Material dark theme · 2026-08-27 · #121212, desaturation, overlays, opacities
81. [S45] https://github.com/googlefonts/literata · Literata · 2026-08-27 · OFL 1.1, Play Books origin, variable font
82. [S46] https://github.com/citation-style-language/styles · CSL styles repo · 2026-08-27 · ~1,877+ styles, CC BY-SA 3.0
83. [S47] https://github.com/citation-js/citation-js · citation.js · 2026-08-27 · MIT, input formats, CSL plugin
84. [S48] Search results (on.substack.com/p/neweditor; discuss.prosemirror.net) · 2026-08-27 · Substack editor on Tiptap/ProseMirror (secondary)
85. [S49] Search results (pro.platejs.org) · 2026-08-27 · Plate Plus exists; no price found (secondary)
86. [S50] https://github.com/dolanmiu/docx · docx (npm) · 2026-08-27 · MIT TS docx generator

Note: entries marked "(same as …)" or "(secondary)" are cross-references or search-snippet evidence and are counted once in the "Sources fetched" total of 57 distinct fetched pages.

# Ingestion, export, and AI-generated visualizations — research note

- Scope: ledger rows **I1, I2, I3, I4, I5, C15, C12** (touches H2, H7, J2, M2, M4, Q-3, Q-8, Q-9, Q-12, T5) · Date: 2026-08-27 · Sources fetched: 58 (plus 6 live endpoint probes; 9 fetch attempts failed and are listed as such)

## Executive summary (≤ 300 words, decisions-first)

1. **Ingestion is two pipelines, not one.** A *structured* pipeline (docx/odt/epub/html/rtf/Google Docs/Notion/pasted rich text → HTML → Markdown) is fully TypeScript-native and cheap; a *layout* pipeline (PDF, scans, images) needs a layout model. For the operator's own corpus — six Word/Pages-exported academic PDFs, 28–56 pp each, born-digital — the layout problem is footnotes and running heads, not OCR.
2. **Q-3 holds without Python for everything except best-in-class PDF layout.** Docling and Marker are Python; both ship as containers (`docling-serve`, Datalab's hosted API) and would run only as an *isolated HTTP service*. The recommended PDF default is TS-native: `unpdf`/pdf.js text extraction + an LLM cleanup pass, with **AWS Textract Layout** (multi-column reading order; scans) as the AWS-native structural fallback and Claude's visual PDF mode as the quality tier. A Docling sidecar is a v2 option, explicitly flagged as the one Python exception.
3. **Pandoc (Haskell static binary, in a Lambda layer or Fargate container) is the export engine**: markdown footnotes become real Word/ODT/LaTeX footnotes, `--citeproc` renders CSL with a BSD-licensed engine (avoiding citeproc-js's CPAL/AGPL), and `typst` is the recommended PDF engine (a single binary; no TeX Live). "Google Docs export" = generate `.docx` → Drive `files.create` with conversion, under the non-sensitive `drive.file` scope.
4. **Platform linking: official exports first, public endpoints second, never cookies.** Substack's undocumented `/api/v1/archive` + `/api/v1/posts/{slug}` return full `body_html` for free posts (verified live on the operator's publication) and only teasers for paid posts; Substack's ToS prohibits scraping, so the product must present this as *the author fetching their own posts* and route paid content through the official Export zip. Medium: RSS + export zip only. Ghost/WordPress have real APIs.
5. **Visualizations: store a *spec* as the asset, render to SVG at insert time.** Vega-Lite (data charts) and Mermaid via `beautiful-mermaid` (diagrams) both render in pure Node with no browser; the rendered SVG/PNG plus the spec and a data-provenance sidecar are what review fact-checks and what export embeds. Plotly/D3 are rejected as *generation* targets (Plotly needs Chrome server-side; D3 is imperative code).

Contradictions with theses/decisions: none. One tension for Q-8: LaTeX export is easy *as a file*, but a LaTeX **PDF** requires a TeX toolchain; recommend Typst for PDF and `.tex` as a plain export.

## 1. Ground truth — what the source system assumes

**Observed.** `conventions/personas.md` accepts a `docs/` directory of "manuscripts, PDFs, drafts, platform exports, anything behind a login" and says a skill that cannot read a format (a PDF with no extractable text, a `.docx`, a scan) must "say so per file rather than guessing," reducing the coverage fraction. The operator's real persona corpus is `personas/steven-j-vitali-academia/docs/`: six PDFs (28, 37, 28, 56, 35, 28 pages), all produced by macOS Quartz PDFContext from Word (5) or Pages (1) — i.e., born-digital with a text layer. The `structure-of-political-difference` project already embeds five PNG figures and a values table in `drafts/v3.md` using `![alt](file.png)` followed by an italic caption line, and one caption carries a footnote-style source reference (`[9]`) — exactly the C12 pattern (figure + caption + source line).

**Inferred.** The current system's ingestion contract is "best effort, declare failures." The product must upgrade this to "convert to canonical markdown with a per-file quality verdict the user can see," because coverage fraction drives persona quality (J2) and a silently mangled PDF (footnotes interleaved into body text) would poison a voice-print.

## 2. Format conversion to canonical markdown (I1)

### 2.1 Tool landscape (TypeScript-first, per Q-3)

| Tool | Language / runtime | Formats | Latest (npm registry, fetched) | License | Verdict |
|---|---|---|---|---|---|
| **pandoc** | Haskell static binary | in: docx, odt, epub, html, rtf, latex, markdown variants, typst, …; **not PDF** [1] | 3.10.2, 2026-08-11 [2] | GPL-2+ (binary invoked as a subprocess) | Universal converter; Lambda layer or container [59] |
| **mammoth** | JS | docx → HTML (headings, lists, tables sans formatting, **footnotes/endnotes**, images, links, comments) [18] | 1.12.1, 2026-08-09 [20] | BSD-2 | Best TS docx reader; `convertToMarkdown` is deprecated — go HTML → turndown [18] |
| **turndown** | JS | HTML → Markdown, GFM plugin | 7.2.4, 2026-04-03 [20] | MIT | Standard HTML→MD; needs custom rules for footnotes |
| **@mozilla/readability** + jsdom/linkedom | JS | article extraction from web HTML (title, byline, content, publishedTime, siteName) [22] | 0.6.0 [20] | Apache-2.0 | For generic URLs |
| **unpdf** (bundles pdf.js) | JS, Node/serverless | PDF text/images/links; page render needs `@napi-rs/canvas` [19] | 1.8.1, 2026-08-13 [20] | MIT | TS-native PDF text layer; no layout model |
| **pdfjs-dist** | JS | same engine, official build | 6.2.108, 2026-07-28 [20] | Apache-2.0 | Used in browser preview |
| **AWS Textract** | AWS API (TS SDK 3.1120.0 [20]) | PDF/TIFF/JPEG/PNG; Layout blocks; OCR; async ≤ 3,000 pp / 500 MB [10][11] | — | — | AWS-native layout + OCR |
| **Claude PDF (visual)** | Anthropic API / Bedrock | ≤ 600 pp (100 below 1M context), 32 MB; visual mode ≈ 7,000 tokens per 3-page PDF vs ≈ 1,000 text-only [14] | — | — | Quality-tier structural cleanup |
| **Docling** | Python; `docling-serve` container (MIT; 4.4–8.7 GB images) [4][5] | PDF, DOCX, PPTX, XLSX, HTML, EPUB, images, … → MD/JSON; layout, reading order, tables, formulas, OCR [4] | — | MIT | Best OSS layout; **Python-only** |
| **Marker** (Datalab) | Python; hosted REST API `datalab.to/api/v1/convert` [6][7] | PDF/images/DOCX/EPUB → MD/JSON/HTML; 76.0% olmocr-bench balanced (83.5% born-digital) [6] | — | code Apache-2.0, **model weights restricted** to <$5M funding/revenue [6] | Python + weight license = no |
| **Unstructured** | hosted API + JS/TS SDK (`unstructured-client` 0.31.0) [8][20] | many; page-billed | — | — | Legacy partition endpoint "for rapid prototyping" [8] |
| **LlamaParse** | hosted; TS example exists [16] | PDF → MD at ≥ "Cost-effective" tier: 3 credits/page at $1.25/1k credits ≈ $3.75/1k pages; Agentic 10 credits [16] | — | — | Reasonable hosted alternative |
| **Mistral OCR** | hosted API | PDF → markdown with images, tables (96.12%), equations; $1/1k pages; 2,000 pp/min [15] | — | — | Cheapest layout-aware hosted PDF→MD; non-AWS |
| **Bedrock Data Automation** | AWS | documents → structured output; pricing not on the fetched page [12][13] | — | — | Candidate; pricing unverified |
| **LibreOffice headless** | native binary in container | `--headless --convert-to docx/pdf/html/txt` [57] | — | MPL | Universal fallback for .doc/.pages/.rtf/.odt oddities |

Failed fetches: npm pages for mammoth/pdfjs-dist/docx/turndown returned 403 (registry JSON used instead), Substack/Medium help centers and OpenAI help returned 403, Julius site 403, Paged.js footnote page 404.

### 2.2 Per-format recommendation

**Observed / Recommendation** per input format:

- **.md** — parse with `unified`/`remark-gfm` (footnotes via `micromark-extension-gfm-footnote` 2.1.0 [20]); normalize (§4). No conversion loss.
- **.txt** — wrap as markdown; paragraph detection on blank lines; optional LLM pass to recover headings only if the user opts in (heading inference is guesswork; label it).
- **.docx** — **mammoth → HTML → turndown** with custom rules mapping mammoth's footnote markup (`<sup><a href="#footnote-1">` / `<ol>` of footnotes) to GFM `[^n]`; `--track-changes` semantics: accept insertions by default. mammoth preserves footnotes/endnotes, images (base64 or handler), comments [18]. Pandoc is the second opinion when mammoth's style map misses custom heading styles ("Section Title" → `h1:fresh` style-map is the documented fix [18]). Images → S3 asset, link rewritten (§4).
- **.rtf / .odt / .epub / .doc / .pages** — pandoc reads rtf, odt, epub [1]; the only maintained TS RTF parser (`rtf-parser`) is from 2019 [20], so pandoc is the path. EPUB is a zip of XHTML; `@lingo-reader/epub-parser` (0.4.6, 2026) + turndown is a TS alternative if the pandoc layer is unavailable. `.doc`/`.pages` → LibreOffice headless → docx → mammoth.
- **.html / pasted rich text** — sanitize (allow-list), `Readability` only for fetched pages (not for pastes), turndown with GFM. Tiptap already converts clipboard `text/html` into ProseMirror nodes; the *persisted* form must still pass through the same normalizer so pasted and uploaded content converge.
- **Google Docs** — `files.export` with `text/markdown` is an official export MIME type for Docs [23]; also `.docx`, `.html` (zip), `.epub`, `.rtf`, `.odt` [23]. **Recommendation:** export `.docx` and run it through the docx path (Google's markdown export is convenient but we control fidelity through one path; verify footnote survival in Google's `.md` before relying on it — unverified). Auth: Google Picker + **`drive.file`** scope (non-sensitive, basic verification); `drive.readonly` is *restricted* and "if you store restricted scope data on servers … you must go through a security assessment" [25][26]. Picker requires the user be signed in to grant per-file `drive.file` access [26].
- **Notion** — two routes. (a) User export zip: "Markdown & CSV" exports non-database pages as `.md`, databases as CSV with a `.md` per row; callouts export as HTML because markdown has no equivalent; links expire after 7 days; no API export endpoint [28]. (b) Notion API: `GET /v1/blocks/{id}/children`, `page_size` ≤ 100, recursive on `has_children`, internal integration token, page must be shared with the integration [29]. **Recommendation:** ship (a) at MVP (one code path: unzip → normalize `.md`), add (b) as a *connection* later (I2/I4).
- **.pdf (born-digital)** — see §2.3.
- **.pdf (scanned) / images** — Textract `StartDocumentTextDetection` ($1.50/1k pages first 1M, Oregon; free tier 1,000 pp/mo for 3 months [9]); languages limited to EN/FR/DE/IT/PT/ES, ≥ 15 px glyph height [11]. English-only MVP (Q-17) makes this acceptable. Claude visual PDF mode is the alternative for hard scans.

### 2.3 Academic PDFs: the actual quality problem

**Observed.** The operator's PDFs are Word/Pages exports: single column, running heads, page numbers, and (from the source genre — Kant-Studien manuscript, seminar papers) footnotes at page bottom. pdf.js `getTextContent` returns positioned text runs with no semantic roles; footnotes appear as text runs at the bottom of each page, interleaved into the body stream; hyphenated line breaks and running heads land mid-paragraph. Textract Layout returns `LAYOUT_HEADER`, `LAYOUT_FOOTER`, `LAYOUT_PAGE_NUMBER`, `LAYOUT_SECTION_HEADER`, `LAYOUT_TEXT`, `LAYOUT_LIST`, `LAYOUT_FIGURE`, `LAYOUT_TABLE`, `LAYOUT_TITLE` "in implied reading order," and for multi-column pages "from the top of the leftmost column … then the next leftmost column" [10]. There is **no footnote block type**; footnotes come back as `LAYOUT_TEXT` blocks at the page bottom (inferred from the type list). Marker claims header/footer removal and "links and references" [6]; Docling claims reading order, tables, formulas [4]. Neither is TS.

**Inferred quality expectations** (no bench run: `pdftotext`, `pandoc`, and `mutool` are absent on the workstation and the brief forbids writing code; this is the top open item):
- Single-column Word-exported PDFs: pdf.js text + heuristic de-hyphenation + running-head stripping gets body text ≈ right; footnote separation needs geometry (y-position clustering per page + superscript-size runs) — feasible in TS with pdf.js's per-item transform/height, ~a few hundred lines.
- Two-column journal PDFs: pdf.js alone interleaves columns; Textract Layout fixes reading order at Tables-bundle pricing ($15/1k pages first 1M; "Layout is available for free when used with the Tables feature" [9]; standalone Layout price not found on the fetched page — unverified).
- References sections: preserve as a flat list; do not attempt CSL parsing at ingest (persona bootstrap needs style, not structured bibliography).
- LLM cleanup: send the raw text-with-geometry hints plus the instruction "reconstruct paragraphs, move bottom-of-page notes to `[^n]` footnotes, strip running heads, keep every word" to a mid-tier model; Claude's own text-only PDF mode costs ≈ 1,000 tokens per 3 pages, the visual mode ≈ 7,000 tokens per 3 pages [14] — for a 56-page paper that is ≈ 19k vs ≈ 130k input tokens. Visual mode is the "quality tier" (fixes columns and figures too) and must be gated behind a cost estimate (T7).

**Recommendation (I1).** Default PDF path = `unpdf` text with geometry → TS footnote/running-head heuristics → LLM reconstruction (text-only) → normalizer; **quality flag** on every file (`clean` / `reconstructed` / `partial` / `unreadable`) with a side-by-side "source page ↔ markdown" checker in the UI so the user can spot-check footnote placement. Scans → Textract DetectDocumentText → same LLM reconstruction. Two-column → Textract Layout (AWS-native, no new vendor). **Docling sidecar** (`docling-serve`, MIT, CPU image) is the explicit Python exception, deferred to v2 and only if the bench shows the TS path failing on real user PDFs; Marker is rejected on model-weight licensing [6]; Mistral OCR is the cheapest hosted layout-aware alternative ($1/1k pages) but adds a non-AWS vendor and an EU data path.

Alternatives rejected: Unstructured (its legacy endpoint is "intended for rapid prototyping" and the Pipeline API is heavier than we need [8]); LlamaParse (fine, but ≈ $3.75/1k pages for markdown vs Textract $1.50 + our own LLM pass, and another vendor); Adobe PDF Services SDK (proprietary terms).

## 3. Web and platform linking (I2)

### 3.1 Substack

**Observed (live probes on the operator's own publication, 2026-08-27).**
- `GET https://<pub>.substack.com/api/v1/archive?sort=new&limit=N&offset=M` returns JSON with `id, title, subtitle, slug, post_date, audience ("everyone"), canonical_url, wordcount (15084), truncated_body_text, body_html, body_json, cover_image, description, postTags, publishedBylines …` [30]. Undocumented; third parties have catalogued "129 verified endpoints" including a TypeScript client [67] — secondary, unofficial.
- `GET /api/v1/posts/<slug>` returns the post with `body_html`, `post_date`, `updated_at`, `audience`, `exempt_from_archive_paywall`, `canonical_url` [31]. `updated_at` is a usable change-detection field.
- `GET /feed` is RSS 2.0 with `content:encoded` carrying full HTML for free posts and `lastBuildDate` [32]; secondary sources state paid posts appear as truncated previews with a subscribe prompt, and that full content requires a `substack.sid` cookie with an active subscription — "Figuring out whether it's the intended behaviour is left as an exercise for the reader" [35][36].
- `robots.txt` disallows `/action/`, `/publish`, `/feed/private`, `/subscribe`, etc.; `/p/`, `/archive`, `/feed`, and `/api/v1/` are not disallowed for `*` [32].
- ToS: users may not "crawl, scrape, or spider any page, data, or portion of Substack (through use of manual or automated means)" or copy/store "any significant portion of the content on Substack"; writers retain ownership of their content [33].
- Official Export (Settings → Exports): a zip with `posts.csv` (id, slug, title, subtitle, date, is_published), `posts/<id>.<slug>.html` body fragments (no title/date in the HTML), `email_list.csv`, per-post delivery CSVs; **no images**, no drafts, no Notes [34] (help page returned 403; secondary sources).

**Inferred.** The public endpoints are the only zero-friction path and are what every aggregator uses; they are technically open but contractually grey. The distinguishing fact is *whose* content it is: Rhema fetches a writer's own archive at the writer's request. That is not "scraping Substack" in spirit but it is in letter, and the ToS does not carve out author self-access.

**Recommendation.** Three modes in order of preference, all surfaced honestly in the UI: (1) **Import export zip** — lossless for paid posts, official, and the only route with the author's full HTML; we join `posts.csv` to `posts/*.html` and fetch images from the still-live URLs at import (the zip has none). (2) **Link publication (public)** — `/api/v1/archive` for discovery (title/date/wordcount/audience), `/api/v1/posts/{slug}` for bodies, `/feed` as the fallback; rate-limit (≤ 1 req/s, cached, conditional re-fetch), honest user-agent, robots respected, paid posts shown as "paywalled — import via export" rather than fetched with cookies. (3) **Never** ask for `substack.sid`. Document the ToS exposure once in the spec (M4, Q-11-style brevity).

### 3.2 Medium

**Observed.** `medium.com/feed/@<user>` returns RSS 2.0 with `content:encoded` (live probe, HTTP 200) [38]. `robots.txt` disallows `/m/`, `/me/`, `/*/edit`, search, and blocks ClaudeBot, GPTBot, Amazonbot, Bytespider, etc. entirely [38] — a generic Rhema fetcher UA is not named, but the intent is clear. Account export (Settings → Security and apps → Download your information) emails a `medium-export.zip` with `posts/*.html` for every published post plus responses [37] (help page 403; secondary). ToS page returned 403 to both fetchers — unverified.

**Recommendation.** RSS for discovery of recent posts (feeds are truncated to a recent window — count unverified), export zip for the archive. No HTML page scraping.

### 3.3 Ghost, WordPress, generic URL, RSS

- **Ghost Content API**: read-only, key in query string, "safe for use in browsers … as they only ever provide access to public data"; posts return `title, slug, html, published_at, updated_at, url, excerpt, visibility` [39][40]; JS SDK `@tryghost/content-api` 1.12.10 [20]. Members-only bodies via the public key: not confirmed on the fetched pages — treat `visibility != "public"` as paywalled.
- **WordPress REST**: `GET /wp-json/wp/v2/posts`, fields `content.rendered, excerpt, date, modified, link, title`; `per_page` capped at 100; `X-WP-Total`/`X-WP-TotalPages` headers [41][42]. `modified` is the change signal. Self-hosted sites may disable the API.
- **Generic URL**: fetch → Readability → turndown; front-matter from `<meta>`/OpenGraph/JSON-LD; store the canonical URL. SSRF guard (deny private ranges, follow ≤ 5 redirects, size cap) — M4.
- **Generic RSS/Atom**: `rss-parser` (3.13.0, 2023 — stale but small; consider `feedsmith`/own parser); items keyed by `guid`.

**Rhema analogue.** All become one `Connection` type with a `Provider` adapter interface: `discover() → Item[]`, `fetch(item) → HTML`, `changeKey(item) → string`. Substack-export and Medium-export are *file* providers that populate the same tables.

## 4. Canonical markdown normalization spec (I3)

**Recommendation** (no external source needed; grounded in GFM + pandoc footnote syntax [1] and the project's existing figure convention).

```markdown
---
rhema: 1                         # spec version
id: smp_01J…                     # ULID
title: "The Politics of Visibility"
subtitle: "Surveillance and the Conditions of Democratic Freedom"   # optional
byline: "S. J. Sebastian"        # optional
date: 2026-08-25                 # published date if known (ISO 8601), else omitted
source:
  kind: substack | medium | ghost | wordpress | url | rss | upload | gdoc | notion | paste
  url: https://sjsebastian.substack.com/p/the-politics-of-visibility
  connection: con_…              # null for uploads/paste
  external_id: "212706232"       # provider id / slug / drive fileId
  original_format: docx | pdf | html | …
  original_sha256: …             # hash of the bytes as received
  fetched_at: 2026-08-27T00:49:05Z
  updated_at_remote: …           # provider's own updated timestamp if any
content_sha256: …                # hash of the normalized body (below the front-matter)
word_count: 15084
quality: clean | reconstructed | partial | unreadable
quality_notes: ["footnotes re-attached heuristically (pp. 3–28)"]
language: en
---
```

Body rules:
1. **Headings**: exactly one H1 = title (or none; title lives in front-matter — choose *none in body*, so concatenated corpora never carry stray H1s); demote remaining levels so the first body heading is H2; strip numbering that duplicates roman-numeral sections only if a heading-numbering style is detected consistently.
2. **Footnotes**: GFM/pandoc syntax `[^n]` with definitions collected at the end, renumbered sequentially in first-reference order; endnotes and footnotes both become `[^n]` (the distinction is a *presentation* choice at export). Inline pandoc `^[…]` is normalized to referenced form.
3. **Citations**: not parsed at ingest; a reference list is kept as an ordinary list under its own heading. (Structured citations belong to the *project* draft pipeline, not samples.)
4. **Images**: downloaded at ingest, content-addressed to S3 (`assets/<sha256>.<ext>`), rewritten to `![alt](asset://sha256)`; original URL retained in an HTML comment `<!-- src: … -->`. Images that fail to fetch keep the remote URL and add a `quality_notes` entry. Decorative platform chrome (share buttons, subscribe widgets) removed by allow-list.
5. **Captions**: an italic paragraph immediately following an image is a caption (matches the existing v3.md convention); on export it maps to a real figure caption.
6. **Tables**: GFM pipe tables when ≤ 1 line per cell; otherwise keep an HTML island (pandoc round-trips both).
7. **Math**: `$…$`/`$$…$$` retained.
8. **Line wrapping**: no hard wraps (`--wrap=none` equivalent); one blank line between blocks; UTF-8 NFC; smart quotes preserved as characters (a voice signal).
9. **Excerpt rule**: samples the user supplies or links are stored whole (they are the corpus, not notes); derived *profile* files obey the source system's excerpt rule unchanged (I5).

## 5. Sync model (I4)

**Recommendation** (state machine; ⚑ include/omit and re-sync are operator requirements).

```
Connection(provider, handle, auth?, status, last_sync_at, schedule)
  └─ DiscoveredItem(external_id, title, date, url, word_count, access: free|paid|unknown,
                    remote_change_key, state: new|included|omitted|removed_remote|failed)
       └─ Sample(version n, content_sha256, quality, markdown)  # only for included items
```

1. **Connect** → `discover()` populates `DiscoveredItem`s; default `included` for free items, `omitted` for paid/unknown (with the "import export zip" call-to-action). Nothing is fetched until the user confirms — discovery is cheap and shows counts/word totals before any cost.
2. **Include/omit per item** ⚑ toggles; omitting an already-fetched item keeps its bytes (cheap) but removes it from the corpus set.
3. **Re-sync** ⚑ (manual button; optional daily schedule for linked publications): re-run `discover()`, diff by `external_id`; new → `new`; missing → `removed_remote` (kept, flagged); changed `remote_change_key` (Substack `updated_at`, WordPress `modified`, Ghost `updated_at`, RSS `guid`+`pubDate`, HTTP `ETag`/`Last-Modified` for generic URLs) → re-fetch → normalize → if `content_sha256` differs, create Sample version n+1.
4. **Change detection is by normalized-body hash, not by provider timestamp** — providers bump `updated_at` on metadata edits; only a body change should invalidate anything downstream.
5. **Downstream staleness (→ J2, T5)**: a persona profile records the *set* `{sample_id → content_sha256}` it was built from. Staleness = symmetric difference of that set with the current included set. Three reasons render as one pill: *samples added/removed/changed (n)*, *seed edited*, *profile older than N days*. Cost estimate for refresh = f(total words of changed + new samples) — the bootstrap skill's own sample-size rules apply. No blocking; the profile stays usable with a "built from an older sample set" caveat inside `provenance.md`.
6. **Uploads** are a `Connection` of kind `upload` with no `discover()`; re-upload of a file with the same name creates a new version by hash.

## 6. Storage and rights (I5)

**Observed.** The source convention is "never dump fetched pages" into persona directories and to store excerpts, not corpora, in derived files — but it explicitly exempts `docs/` for "material the human already holds" [conventions/personas.md]. Substack's ToS forbids copying/storing "any significant portion of the content on Substack" [33], while granting writers ownership of their posts. Anthropic states that by default it does not use inputs/outputs from commercial products (API) to train models [65].

**Recommendation.** (a) Store samples in full, per user, encrypted at rest in S3 with per-tenant prefixes; the corpus is the user's own or user-supplied material, and the product's value depends on it. (b) Terms: user warrants they have the right to the samples; platform stores them only to provide the service; deletion of a persona deletes samples and derived profiles (S3 lifecycle + DB cascade) within a stated window. (c) Do **not** promise a no-training guarantee beyond what upstream providers give (Q-12) — but *do* state the upstream provider posture verbatim since it is true and cheap. (d) Retention of raw source bytes (`original_sha256` object) is needed for re-normalization when the pipeline improves; keep them. (e) Fetched third-party pages used during *review* (fact-check) remain excerpt-only per the source rules — that is the dossier, not the corpus.

## 7. Export matrix (C15, H7)

### 7.1 Engine

**Observed.** Pandoc reads and writes docx, odt, rtf, html, latex, typst, plain, gfm, epub, and produces PDF through engines including `pdflatex, xelatex, lualatex, tectonic, typst, weasyprint, wkhtmltopdf, prince, pagedjs-cli` [1]; `--citeproc` renders citations with a CSL stylesheet (default `chicago-author-date`) from a bibliography file or metadata [1]; `--reference-doc` styles docx/odt from a template's stylesheets, margins, headers/footers [1]; `--extract-media` and `--track-changes` exist for the docx reader [1]; markdown footnotes are native [1]. A precompiled pandoc Lambda layer with a Node wrapper exists (community) and the binary is ≈ tens of MB; a LaTeX toolchain "will not fit in a lambda layer," which is why Docker-image Lambdas are used for PDF [59]. Lambda limits: 15-minute timeout, 10 GB container image, 10,240 MB memory [58]. Typst compiles in Node via WASM (`@myriaddreamin/typst.ts` 0.7.0, Apache-2.0) [52][20].

Citation engines: Citation.js (MIT) converts BibTeX/DOI/CSL-JSON and renders styles *via citeproc-js* [54]; citeproc-js is dual-licensed **CPAL-1.0 or AGPL-1.0** [55][20]; the CSL styles repo is CC-BY-SA 3.0 and requires "a clear mention of the CSL project and a link to https://citationstyles.org/" [56]. Pandoc's built-in citeproc is Haskell (BSD), avoiding the CPAL attribution UI requirement in a closed-source product (Q-19).

Google Docs: Drive `files.create` with `mimeType: application/vnd.google-apps.document` converts from Word, ODT, HTML, RTF, plain text, or Markdown [24]; the Docs API `batchUpdate` has `CreateFootnoteRequest`, `InsertInlineImageRequest`, `InsertTableRequest`, `InsertPageBreakRequest` [27]. Playwright `page.pdf()` supports format/margins/header-footer templates/`tagged` accessible PDF, print media by default [51]; Chromium has no CSS footnote support, and the Paged.js footnote documentation page 404'd, so HTML→PDF footnotes are unverified.

**Recommendation.** One **export service** (Fargate container, or a container-image Lambda under the 15-min ceiling): pandoc 3.10 + typst binary + Node worker. Pipeline: canonical markdown → (citation resolution: CSL-JSON from the project's reference store) → pandoc `--citeproc --csl <style>` → target. Figures: SVG for html/latex/typst; PNG (2× raster of the same SVG via `@resvg/resvg-js` or `sharp` [20]) for docx/rtf/gdoc where SVG support is unreliable.

### 7.2 Per-format fidelity table

| Target | Route | Footnotes | Citations/bibliography (CSL) | Figures | Tables | Math | Headings/TOC | Notes |
|---|---|---|---|---|---|---|---|---|
| **.md** | serialize canonical | native `[^n]` | left as `[@key]` + optional rendered bibliography | `![]()` to bundled assets (zip) | GFM | `$` | native | Lossless; zip with `assets/` |
| **.txt** | pandoc `plain` | numbered notes appended at end | rendered inline text | dropped (alt text + caption kept) | ASCII grid | source text | plain | Lossy by design |
| **.html** | pandoc `html5` (or remark→rehype in-app for preview) | end-of-document notes with back-links | rendered | inline SVG | HTML | MathML/KaTeX | native, TOC optional | Self-contained single file with data-URI images |
| **.docx** | pandoc `docx --reference-doc` | **real Word footnotes** | rendered text + bibliography section (not Zotero fields) | PNG (SVG support in Word inconsistent) | Word tables | OMML | Word styles → navigation pane | Best general-purpose deliverable; house template per genre |
| **Google Docs** | docx → Drive `files.create` conversion [24] | preserved through docx import (expected; *verify*) | rendered text | PNG | preserved | Word equations partially | preserved | `drive.file` scope; returns a Doc link; alternative Docs-API `batchUpdate` path is more work for no gain at MVP |
| **.rtf** | pandoc `rtf` | pandoc rtf writer footnotes (unverified) | rendered | PNG (rtf images are large) | basic | none | basic | Legacy format; offer but mark "reduced fidelity" |
| **.odt** | pandoc `odt --reference-doc` | real footnotes | rendered | PNG/SVG | native | native | native | Cheap once docx works |
| **.epub** | pandoc `epub3` | end-notes with links | rendered | SVG/PNG | native | MathML | nav | Useful for long-form/creative genres |
| **PDF** | pandoc → **typst** engine [1][52] | real footnotes | rendered | SVG | native | native | native + outline | No TeX Live; ~single binary; typography good; academic journal templates fewer than LaTeX |
| **PDF (alt)** | pandoc → `tectonic`/`xelatex` in container | real footnotes | rendered (or biblatex) | SVG via `svg` package | native | native | native | Container ≥ 1 GB; needed only for journal-specific LaTeX classes |
| **.tex** | pandoc `latex` (+ `--natbib`/`--biblatex` optional) | `\footnote{}` | `\cite` keys + `.bib` sidecar | `\includegraphics` + assets | `longtable` | native | native | Delivered as a zip (tex + bib + figures); **compilation is the user's** unless the LaTeX container is deployed |
| **.typ** | pandoc `typst` | native | rendered or typst `bibliography()` | native | native | native | native | Emerging; free to offer |

**Fidelity caveats (Inferred).** Anchored review comments and the response ledger are *not* exported into any format at MVP (a docx with Word comments is a v2 item — pandoc can read comments but does not write them). Track changes between drafts exports as a diff view, not as Word revisions.

## 8. Visualizations (C12)

### 8.1 How current products do it

**Observed.**
- **ChatGPT**: interactive bar/line/pie/scatter rendered in the conversation with hover values, colour settings, expand, PNG download; other chart types fall back to static matplotlib images; interactivity is inconsistent (dual-axis lines stay static) [60] (help pages 403; secondary evaluation used). Underlying execution is Python.
- **Claude**: since March 2026 Claude draws inline "charts, diagrams, and other visualizations" that are interactive, temporary, and tweakable in conversation; distinct from Artifacts, which are "designed to be shared or downloaded" [61]. Artifacts support SVG, diagrams, Markdown docs, React/HTML, with a version selector and download/publish [62]. The analysis tool runs JavaScript (D3 among the available libraries — secondary [search]).
- **Julius**: natural-language → Python behind the scenes; Plotly/Bokeh/Dash interactive charts; prompt-based re-generation; download/share; Pro $45/mo [63] (secondary review; site 403).
- **Notion**: charts are *database views* (vertical/horizontal bar, line, donut, number), one chart on the Free plan, styling via palette/height/gridlines/data labels, embedded as blocks [64].

**Inferred.** The industry pattern is code-execution → image, with interactivity as a bolt-on for four chart types. None of them solves the *manuscript* problem: a figure that must be numbered, captioned, sourced, reproducible, reviewable, and exported at print quality. Notion's model (chart = declarative view over data) is closer to what a writing tool needs than ChatGPT's.

### 8.2 Tooling options (Python-free per Q-3)

| Option | Server render in Node? | LLM-friendliness of the artifact | Export | Verdict |
|---|---|---|---|---|
| **Vega-Lite** (6.4.3) / Vega (6.4.0) [20] | Yes: headless `view.toSVG()`; PNG via node-canvas (`vega-cli` `vl2svg/vl2png`) [43][44] | JSON spec — declarative, compact, validatable against the schema | SVG native; PNG raster | **Primary for data charts** |
| **Observable Plot** (0.6.17) [20][45] | Yes with jsdom via the `document` option [45] | JS code (short) | SVG | Runner-up; less validatable |
| **Mermaid** (11.17.2) [46] | `@mermaid-js/mermaid-cli` needs Puppeteer/Chromium [47]; **`beautiful-mermaid`** renders flowchart/state/sequence/class/ER/xychart to SVG in pure TS, zero DOM [48] | text DSL, well-known to models | SVG | **Primary for diagrams** (beautiful-mermaid; mermaid-cli in the export container for the other diagram types) |
| **Plotly.js** | `Plotly.toImage` is browser-side; SVG/PDF export gated to paid plans on the docs page; Kaleido is Python + Chrome [49][50] | JSON spec (large) | PNG in browser | Rejected for generation; acceptable as a *viewer* only |
| **D3** (7.9.0) | Yes with jsdom | imperative code — hard to review, easy to break | SVG | Rejected as a generation target; escape hatch for bespoke figures |
| **Tables** | none needed | GFM/HTML | native everywhere | Tables are markdown, not images |
| **Sandboxed code (any)** | Node `vm`/isolated-vm or a Lambda | arbitrary | any | Only for the D3 escape hatch |

### 8.3 Pipeline proposal

```
request ("make a bar chart of the CHES correlations", from chat or from a selection)
  │
  ├─ 1. Intent + data resolution (agent step)
  │     kind: chart | diagram | table
  │     data: inline numbers | project asset (csv/json uploaded) | fetched source (URL, must be read this session)
  │     → writes figures/<slug>/data.csv + provenance.json {source_url, accessed_at, transform_notes, computed_by}
  │
  ├─ 2. Spec generation (agent step, structured output)
  │     chart   → Vega-Lite JSON (schema-validated; retry on validation error)
  │     diagram → Mermaid text (parsed by beautiful-mermaid; retry on parse error)
  │     table   → GFM/HTML table (no render step)
  │     + caption, alt text, source line, suggested anchor paragraph
  │
  ├─ 3. Render (deterministic, TS): Vega → SVG (+ PNG @2x); beautiful-mermaid → SVG
  │     theme tokens from the project's export template; dark/light variants for the IDE preview
  │
  ├─ 4. Insert as a Figure block at the anchor:
  │     ![alt](asset://sha256)            ← rendered SVG
  │     *Figure N. Caption.[^n]*          ← existing v3.md convention; [^n] = source line
  │     <!-- rhema:figure id=fig_… spec=asset://… data=asset://… -->
  │
  ├─ 5. Iterate: the Figure block is selectable; "make it horizontal", "use 2019 data" re-runs 2–3
  │     with the previous spec as context; versions kept (spec + render) — same round-log model as drafts
  │
  ├─ 6. Review: editorial-review's fact-check treats provenance.json as claims:
  │     re-fetch source_url, recompute from data.csv, verdict on {values, labels, axis ranges, caption}
  │     — a chart is a set of quantitative claims with a URL, which is exactly the claim-ledger regime
  │
  └─ 7. Export: SVG for html/pdf/typst/latex; PNG for docx/rtf/gdoc; figure numbering by pandoc
        (`fig:` ids) or by our own pre-pass; data.csv + spec shipped in the export zip's appendix folder
```

**Storage as project assets**: `figures/<id>/{spec.json|mmd, data.csv, provenance.json, render.svg, render@2x.png}` — the spec is the source of truth; renders are cache. This mirrors the source system's `drafts/figures/` and keeps the "durable dossier over context" principle: an agent can regenerate any figure from disk.

**SVG vs PNG vs live spec**: the IDE renders the SVG (crisp, themeable); the editor node keeps the spec id so the user can re-open the figure editor; PNG only exists for formats that need it. A "live" interactive chart (Vega tooltips) is a preview nicety inside the IDE, not an artifact — the exported document is static.

**UX (Rhema analogue of the competitor patterns)**: like Claude's inline visuals, the first render appears in the chat turn *and* as a proposed insertion (diff-style, accept/reject — same primitive as review findings, T2); like Notion, the figure is a block with a properties panel (type, data source, caption, numbering); unlike all three, every figure carries a source line and appears in the fact-check ledger.

## Rhema implications (numbered, each tied to ledger rows / theses)

1. **Two ingestion pipelines with a per-file quality verdict** (I1, J2, T5): structured (TS-native) and layout (pdf.js + heuristics + LLM; Textract for scans/columns). Quality verdicts feed the coverage fraction the persona skill already reports.
2. **Q-3 is satisfiable**: no Python in the product; pandoc (Haskell) and typst (Rust) are subprocess binaries; Docling is the one named Python exception, deferred, isolated (M1, M2).
3. **Provider adapter interface** `discover/fetch/changeKey` unifies Substack, Medium, Ghost, WordPress, RSS, URL, exports, uploads (I2, I4, F-rows).
4. **Substack legal posture**: public endpoints for free posts, official export for paid, no cookies; state ToS exposure once (I2, M4).
5. **Google integration uses `drive.file` + Picker** to avoid restricted-scope security assessment (I1, C15, M4).
6. **Canonical markdown spec** with front-matter hash, `[^n]` footnotes, content-addressed assets (I3, H2) — the same document model the editor round-trips (T6).
7. **Staleness = set difference of sample hashes** recorded in the profile's provenance (I4 → J2, T5 confirmed).
8. **Export service = pandoc + typst container**; docx is the flagship deliverable; PDF via typst; `.tex` as a zip; Google Docs via docx conversion (C15, H7, Q-8, Q-9). Avoid citeproc-js licensing by using pandoc's citeproc (Q-19).
9. **Figures are specs + data + provenance**, rendered to SVG in pure TS (Vega-Lite, beautiful-mermaid), inserted as accept/reject proposals, fact-checked as claims, exported per-format (C12, T2, E-rows).
10. **Costs to model** (L-rows, Q-10): ingestion of a 15k-word Substack post ≈ free; a 56-page PDF ≈ $0.08 Textract text + one mid-tier LLM pass (~20k in / ~20k out tokens); visual-PDF quality tier ≈ 130k input tokens — must show an estimate before running.

## Ledger updates

| Row | Proposed status | Evidence (one line) |
|---|---|---|
| I1 | in-progress → done pending bench | §2 tool table + per-format recommendation; bench on the six real PDFs still to run (no PDF tooling on the workstation; brief forbids code) |
| I2 | done | §3: live Substack `/api/v1/archive`, `/api/v1/posts/{slug}`, `/feed`, robots, ToS; Medium feed/robots; Ghost, WordPress docs |
| I3 | done | §4 canonical markdown spec |
| I4 | done | §5 state machine + hash-based change detection → J2 |
| I5 | done (minimal, per Q-12) | §6 |
| C15 | done | §7 fidelity table; engine choice pandoc+typst |
| H7 | done | §7.1 |
| C12 | done (design proposal) | §8 pipeline; tooling verified Python-free |
| H2 | partial | §4 footnote/table/math conventions feed H2; editor round-trip still to be tested by the H-agent |
| J2 | input provided | §5.5 staleness computation |
| M4 | input provided | SSRF guard, upload sanitization, Substack/Medium ToS exposure |

**New rows proposed**
- **I6 — PDF ingestion bench**: run the TS path (unpdf + heuristics + LLM) and Textract Layout on the six persona PDFs; score footnote recovery, running-head removal, paragraph integrity; decide whether the Docling sidecar is needed. Owner A. Blocked until an implementation sandbox exists.
- **I7 — Substack/Medium export-zip importers** as first-class providers (paid content path).
- **C17 — Figure asset model** (`spec + data + provenance + renders`) and its appearance in the review claim ledger — cross-links C12, E-rows, and the fact-check protocol.
- **M10 — Export/ingestion container**: pandoc 3.10 + typst + Node + optional mermaid-cli/Chromium; decide Fargate vs container-image Lambda (15-min ceiling [58]).

## Open questions / unverified

1. **No quality bench was run** on the operator's PDFs (I1 demands it). Everything in §2.3 about footnote recovery is inference from pdf.js's API and Textract's block types.
2. **Textract Layout standalone price** was not found on the fetched pricing page (only "free with Tables"); region shown was Oregon, not us-east-1 [9].
3. **Pandoc RTF reader**: the MANUAL's input list includes `rtf` [1] and release notes mention "RTF reader" fixes in 3.9.x [2], but the release that introduced it was not identified (3.0's notes mention only the RTF writer [3]).
4. **Google Docs `.md` export and docx→Docs footnote survival**: MIME types confirmed [23][24]; footnote fidelity through conversion not tested.
5. **Ghost Content API behaviour for members/paid posts** with a public key: fields include `visibility` [40]; whether `html` is blanked is not confirmed.
6. **Substack**: help-center export page and Medium help/ToS pages returned 403; export-zip contents rely on secondary sources [34][37]. Paid-post truncation in RSS is secondary [35][36]. Whether Substack tolerates author-initiated fetches via `/api/v1/` is a legal question, not a technical one.
7. **Bedrock Data Automation pricing** not on the fetched pricing page; search results claim $0.010/page — unverified.
8. **Azure Document Intelligence** ($10/1k pages, markdown output) appears only in search snippets; not fetched from Microsoft.
9. **HTML→PDF footnotes** (Paged.js) unverified (404); hence typst/LaTeX for PDF.
10. **Mistral OCR** is EU-hosted; data-path implications for Q-12 not examined.
11. **beautiful-mermaid** covers six diagram types; mindmap/timeline/sankey etc. need mermaid-cli + Chromium in the export container [47][48].
12. **Vega PNG rendering** requires the `canvas` native package [43][44]; compatibility with `@napi-rs/canvas` (used by unpdf) not verified — SVG-only is the safe default.
13. Medium RSS window size (number of items) not verified.

## Sources (numbered; URL · title · accessed 2026-08-27 · use)

1. https://pandoc.org/MANUAL.html · Pandoc User's Guide · input/output formats, PDF engines, `--citeproc`, `--reference-doc`, `--extract-media`, `--track-changes`, footnotes
2. https://pandoc.org/releases.html · Pandoc releases · 3.10.2 (2026-08-11); RTF reader / docx footnote fixes
3. https://github.com/jgm/pandoc/releases/tag/3.0 · pandoc 3.0 release · RTF writer only (reader intro not found)
4. https://github.com/docling-project/docling · Docling · Python, formats, layout/OCR, MIT
5. https://github.com/docling-project/docling-serve · docling-serve · container images, endpoints, MIT
6. https://github.com/datalab-to/marker · Marker · formats, olmocr-bench numbers, code vs model licensing
7. https://documentation.datalab.to/docs/recipes/marker/conversion-api-overview · Datalab conversion API · endpoint, modes, add-on pricing, no TS SDK
8. https://docs.unstructured.io/api-reference/partition/overview · Unstructured Partition API · JS/TS SDK, page billing, "rapid prototyping" note
9. https://aws.amazon.com/textract/pricing/ · Amazon Textract pricing · per-1k-page prices (Oregon), free tier, Layout-with-Tables
10. https://docs.aws.amazon.com/textract/latest/dg/layoutresponse.html · Textract Layout response objects · block types, reading order, multi-column
11. https://docs.aws.amazon.com/textract/latest/dg/limits-document.html · Textract set quotas · file/page limits, languages, glyph size
12. https://docs.aws.amazon.com/bedrock/latest/userguide/bda.html · Bedrock Data Automation · capabilities
13. https://aws.amazon.com/bedrock/pricing/ · Bedrock pricing · BDA per-page price absent
14. https://platform.claude.com/docs/en/docs/build-with-claude/pdf-support · Claude PDF support · 600/100-page limits, 32 MB, token costs text vs visual
15. https://mistral.ai/news/mistral-ocr · Mistral OCR · markdown output, accuracy, $1/1k pages
16. https://developers.llamaindex.ai/llamaparse/general/pricing/ · LlamaParse pricing · credits per tier, $1.25/1k credits
17. (search only, not fetched) Azure AI Document Intelligence layout pricing — secondary
18. https://github.com/mwilliamson/mammoth.js · mammoth.js · supported features, footnotes, deprecated markdown, style maps
19. https://github.com/unjs/unpdf · unpdf · runtimes, canvas requirement, limits
20. https://registry.npmjs.org/<pkg> (JSON, via curl) · npm registry · versions/dates/licenses for mammoth, pdfjs-dist, docx, turndown, @mermaid-js/mermaid-cli, vega, vega-lite, vega-cli, @tryghost/content-api, @citation-js/core, citeproc, @napi-rs/canvas, canvas, playwright, unified, remark-gfm, micromark-extension-gfm-footnote, @aws-sdk/client-textract, unpdf, pdf-parse, @opendocsg/pdf2md, @myriaddreamin/typst.ts, @resvg/resvg-js, sharp, @mozilla/readability, jsdom, linkedom, rss-parser, epub2, @lingo-reader/epub-parser, rtf-parser, @observablehq/plot, beautiful-mermaid, mermaid-isomorphic, node-pandoc, unstructured-client, d3, html-to-docx
21. (npm web pages for mammoth, pdfjs-dist, docx, turndown returned 403 — registry used instead)
22. https://github.com/mozilla/readability · @mozilla/readability · API fields, jsdom usage, Apache-2.0
23. https://developers.google.com/workspace/drive/api/guides/ref-export-formats · Drive export MIME types · Docs → md/docx/html/rtf/odt/pdf/epub/txt
24. https://developers.google.com/workspace/drive/api/guides/manage-uploads · Drive uploads/conversion · import to Docs from Word/ODT/HTML/RTF/text/Markdown
25. https://developers.google.com/workspace/drive/api/guides/api-specific-auth · Drive scopes · `drive.file` non-sensitive vs restricted scopes and security assessment
26. https://developers.google.com/workspace/drive/picker/guides/overview · Google Picker · per-file access with `drive.file`
27. https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/request · Docs API requests · CreateFootnoteRequest, InsertInlineImageRequest, InsertTableRequest, InsertPageBreakRequest
28. https://www.notion.com/help/export-your-content · Notion export · formats, zip structure, callouts as HTML, 7-day links, no API export
29. https://developers.notion.com/reference/get-block-children · Notion API block children · pagination, recursion, auth
30. https://sjsebastian.substack.com/api/v1/archive?sort=new&limit=3&offset=0 (live probe) · Substack archive JSON · fields incl. `audience`, `wordcount`, `body_html`
31. https://sjsebastian.substack.com/api/v1/posts/the-politics-of-visibility (live probe) · Substack post JSON · `body_html`, `updated_at`, `audience`
32. https://sjsebastian.substack.com/feed and /robots.txt (live probes) · Substack RSS + robots · `content:encoded`, `lastBuildDate`, disallow list
33. https://substack.com/tos · Substack Terms · scraping prohibition, content ownership
34. https://letters.byburk.net/p/how-to-back-up-your-substack · "How to Really Back Up Your Substack" (secondary) · export zip contents; official help page returned 403
35. https://rss-bridge.github.io/rss-bridge/Bridge_Specific/Substack.html · RSS-Bridge Substack · cookie-based paid feed caveat
36. WebSearch results (wprssaggregator.com, FreshRSS discussion) · secondary · paid posts truncated in RSS
37. WebSearch results (help.medium.com 403; danielrosehill.medium.com, medium-2-md) · secondary · Medium export zip contents
38. https://medium.com/feed/@danielrosehill and https://medium.com/robots.txt (live probes) · Medium RSS + robots · `content:encoded`; AI bots disallowed
39. https://docs.ghost.org/content-api/ · Ghost Content API · key semantics, resources
40. https://docs.ghost.org/content-api/posts · Ghost posts · returned fields incl. `visibility`, `updated_at`
41. https://developer.wordpress.org/rest-api/reference/posts/ · WP REST posts · fields
42. https://developer.wordpress.org/rest-api/using-the-rest-api/pagination/ · WP pagination · `per_page` ≤ 100, headers
43. https://vega.github.io/vega-lite/usage/compile.html · Vega-Lite compile · `vl2svg/vl2png`, canvas package
44. https://vega.github.io/vega/docs/api/view/ · Vega View API · headless `toSVG`, `toCanvas` with node-canvas
45. https://observablehq.com/plot/features/plots · Observable Plot · `document` option for server rendering
46. https://mermaid.js.org/intro/ · Mermaid intro · diagram types, v11.17.2, browser rendering
47. https://github.com/mermaid-js/mermaid-cli · mermaid-cli · Puppeteer/Chromium, svg/png/pdf, Docker
48. https://github.com/lukilabs/beautiful-mermaid · beautiful-mermaid · pure-TS SVG for six diagram types
49. https://plotly.com/javascript/static-image-export/ · Plotly.js static export · browser-side `toImage`, format gating
50. https://github.com/plotly/Kaleido · Kaleido · Python + Chrome, no Node interface
51. https://playwright.dev/docs/api/class-page#page-pdf · Playwright `page.pdf()` · options, print media
52. https://github.com/Myriad-Dreamin/typst.ts · typst.ts · WASM Typst in Node/browser, Apache-2.0
53. https://pagedjs.org/documentation/9-footnotes/ · (404 — not fetched)
54. https://citation.js.org/ · Citation.js · formats, citeproc-js under the hood, MIT
55. https://github.com/Juris-M/citeproc-js · citeproc-js · CPAL / AGPLv3 dual license
56. https://github.com/citation-style-language/styles · CSL styles · CC-BY-SA 3.0, attribution requirement
57. https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html · LibreOffice CLI · `--headless --convert-to`
58. https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html · Lambda quotas · 15-min timeout, 10 GB image, 10,240 MB
59. WebSearch results (serverlesspub/pandoc-aws-lambda-binary, AndyShor/pandoc-lambda, claudiajs tutorial) · community · pandoc Lambda layer; LaTeX needs container
60. https://yudong-94.github.io/personal-website/blog/GPTNewFeatureEvaluation/ · secondary evaluation of ChatGPT interactive charts (OpenAI help/blog returned 403) · interactive types, PNG download, static fallbacks
61. https://claude.com/blog/claude-builds-visuals · Claude builds visuals · inline interactive visuals (beta 2026-03-12), tweakable, vs artifacts
62. https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them · Claude Artifacts · types, versions, download/publish
63. https://upsolve.ai/blog/julius-ai-review · Julius AI review (secondary; julius.ai 403) · Python execution, Plotly, pricing
64. https://www.notion.com/help/charts · Notion charts · types, one free chart, block embedding
65. https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training · Anthropic privacy · no training on commercial inputs by default
66. WebSearch results (docling REST API docs, docling-serve) · `/v1/convert/source`, `to_formats`
67. https://github.com/AnthonyDavidAdams/substack-api-reference (search result only) · unofficial Substack API reference with TS client · secondary, not fetched

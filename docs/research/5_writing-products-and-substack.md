# Writing products, the academic niche, Substack (web vs. app), anchored-comment UX, and deep-research chat — what a *writer* expects from Rhema

- Scope: ledger rows **B2.1, B2.2, B2.3, B2.4, B2.5**; **D19** exemplar study (Substack web vs. mobile app); inputs to **D6, D9, D14, D16, H6, C15, C16, L3** and theses **T2, T6, T7** · Date: 2026-08-27 · Sources fetched: 62 (58 fetched and read this session; 4 fetch attempts failed and are listed under *Open questions / unverified*)

## Executive summary (≤ 300 words, decisions-first)

1. **Design direction (Q-14): "Substack reading calm inside a coding-IDE shell, dark by default."** Substack's writer-facing surface is deliberately narrow — one serif body preset (Lora on `on.substack.com`, measured), a ~600–760 px measure, 15–16 px body, no custom fonts, and a reader-controlled Auto/Dark/Light appearance. Coding IDEs supply the *chrome* (panes, palette, run timeline, diffs); Substack supplies the *page*. Rhema should not blend the two into one texture — it should nest a light-or-dark *paper* editor with a serif measure inside a dark IDE frame, and let the paper follow the app theme by default (dark) with a one-key override.
2. **T2 confirmed and sharpened.** Every product surveyed converges on the same three anchored-annotation primitives — a range-anchored comment thread (Google Docs, Notion, Figma), a range-anchored *proposed change* with accept/reject (Docs Suggesting, Word Track Changes, Gemini in Docs, Cursor), and a margin/sidebar list with filters and resolve state. Review findings should be rendered as *comments that can carry a proposed change*, with the disposition vocabulary (accept / adapt / rebut / defer / escalate) replacing "resolve".
3. **Provenance is the writing world's emerging integrity primitive** (Grammarly Authorship, iA Writer Authorship, ICMJE/COPE disclosure norms). Rhema already has per-artifact provenance in its data model (D8); it should also track *per-span* authorship (human / author-agent / pasted) and export an optional provenance report. No competitor ties this to a review dossier — a differentiator for the academic niche.
4. **Pricing anchors (for L3):** consumer AI writing sits at **$8–22/mo** (Type, Sudowrite, Lex, Novelcrafter, Grammarly Pro $12, Wordtune $9.99); academic tools at **$12–50/mo** (Paperpal $12–25, SciSpace $12–70, Scite $20–50, Elicit $49–169); all meter "credits" or "uses/day". Rhema's $50–100/run (Q-10) is an order of magnitude above every per-month price here — it must be sold as *runs*, not seats (T7 confirmed).
5. **Mobile (D19):** Substack's split (web = full editor/settings/scheduling; app = read, notes, chat, stats, and a *reduced* text+image editor that cannot edit published posts or schedule) is the right template. Rhema mobile = read drafts and findings, dispose findings, approve gates, chat, notifications, light edits — never run configuration or persona generation.

## 1. AI writing products (B2.1) — inline-suggestion UX, "voice", pricing

### 1.1 Observed: pricing and metering (all fetched 2026-08-27)

| Product | Price (USD) | Meter | Voice/style feature | Source |
|---|---|---|---|---|
| Lex | Pro **$18/mo or $145/yr** (post-May-2024 price; page itself hides figures) | "Unlimited Checks" on Pro; free tier historically 30 checks/mo (secondary) | *Document Context*: "custom instructions to the AI about what you're writing, who your audience is, and what your goal is" | [1][2][3] |
| Type.ai | Free; Basic **$8/mo** (500k credits); Pro **$16/mo** (1.5M); Max **$64/mo** (6M); 33% off annual; 150k-word doc cap | credits | "custom writing rules to help amplify the quirks that make your writing unique"; Notes memory; models from Anthropic/OpenAI/Google | [4][5] |
| Sudowrite | Hobby **$10/mo** (225k credits); Professional **$22/mo** (450k/mo, 1M annual); Max **$44/mo** (2M, 12-mo rollover) | credits | "Write… suggests the next 300 words in your voice"; Story Bible; own model "Muse 1.5… built just for fiction"; *Feedback* = "five actionable areas to improve" | [6][7] |
| Novelcrafter | Scribe **$4**, Hobbyist **$8**, Artisan **$14**, Specialist **$20** /mo; 2 months off annual | BYOK on all but Scribe (OpenAI, Anthropic, Gemini, Llama, Mistral, OpenRouter, LM Studio, Ollama) | Codex (story bible), Workshop chat, custom prompt library, scene beats, writing/review modes | [8][9] |
| Jasper | Pro **$69/mo/seat** ($59 annual); Business custom, 12-mo min | seats | Pro: 2 Brand Voices, 5 Knowledge assets, 3 Audiences; Business: Style Guide with "x-ray view" in editor | [10] |
| Wordtune | Free (10 rewrites/day); Advanced **$6.99/mo** (30/day); Unlimited **$9.99/mo** | rewrites/day | tone/rewrite only | [11] |
| Grammarly | Free (100 AI prompts/mo); Pro **$12/mo** (2,000 prompts); Enterprise custom | prompts/month | *Voice profile* auto-detected, editable, "Rewrite in my voice"; *Authorship* provenance report | [12][13][14] |
| Notion AI | Free/Plus trial; full AI on Business **$20/member/mo**; Custom Agents "$10 per 1,000 monthly Notion credits" | credits (agents) | "Edit with AI" on selection → accept / discard / try again | [15][16] |
| Google Docs Gemini | needs "an eligible Google Workspace or Google AI plan" | plan-gated | selection toolbar: More formal / More casual / Rephrase / Shorten / Elaborate / Bulletize / Summarize; doc-level "Help me write" with *Accept suggestion / Accept all / Reject all* | [17] |
| Word Copilot | "eligible Microsoft 365 subscription and/or Microsoft Copilot license" | plan-gated | left-margin Copilot icon; *Auto Rewrite* with *Replace / Insert below / Regenerate*, editable suggestion box; tone options Neutral / Casual / Concise (secondary); *Draft* with *Keep it / Regenerate / Discard*; `/` references up to 20 files | [18][19][20] |

### 1.2 Observed: the inline-suggestion grammar

Across all ten products there are exactly four surfaces for AI output, and every product uses a subset:

1. **Selection popover** (Docs Gemini, Word Copilot, Notion, Grammarly, Wordtune): select text → floating toolbar → canned verbs (rephrase/shorten/elaborate/tone) → result shown *in place* with **accept / reject / regenerate** (Docs: "Accept suggestion", "Accept all", "Reject all" [17]; Word: "Replace… Insert below… Regenerate" and you can "begin typing directly within the suggestion box" [18]; Notion: "accept, discard, or ask it to try again" [16]).
2. **Cursor-position generation** (Word "Draft with Copilot", Notion space-key, Sudowrite *Write*): output inserted at caret with Keep/Regenerate/Discard [15][19][7].
3. **Side chat with document context** (Type: "Write and chat in one place… No more copy-pasting between tools" [5]; Novelcrafter Workshop; Lex AI Feedback).
4. **Document-level "checks"/feedback list** (Lex *Checks*: "suggest changes to optimize for brevity, readability, grammar" [3]; Sudowrite *Feedback* "five actionable areas" [7]; Grammarly suggestion cards).

Nobody in the consumer set renders a *multi-phase review* as anchored findings; Sudowrite's Feedback and Lex's Checks are flat lists. That is the gap T2 targets.

### 1.3 Observed: "voice"

- Grammarly: "automatic detection of a user's writing style… keeps separate voice profiles for documents and messages"; the profile is shown with an AI-generated description and the user can "remove the communication style elements… by clicking on them and selecting No, remove it"; rewrite is invoked as "Rewrite in my voice" [13]. Available on Pro and up [13].
- Sudowrite: voice is implicit ("in your voice") — inferred from the manuscript and Story Bible [7].
- Type.ai: explicit *rules* ("custom writing rules") [5]. Jasper: brand voices as first-class objects, quantity-capped per tier (2 on Pro) [10]. Lex: a per-document context prompt [3].

**Inferred:** the market has two voice models — *learned profile* (Grammarly, Sudowrite) and *authored rules* (Type, Jasper, Lex). Rhema's persona (J-rows) is both: an authored seed plus an expensive bootstrapped profile. Grammarly's editable, element-by-element profile card is the closest UI precedent for surfacing the *profile* without exposing the full generated scaffold, and for T5's staleness pill (Grammarly says its profile "updates… continuously as you write" — which Rhema cannot afford; hence the explicit Refresh).

### 1.4 Observed: provenance

- Grammarly Authorship "records your actual writing process — typed, pasted, AI-assisted", produces a shareable, color-coded report with a replay "from the first ideas to the last keystroke", opt-in ("Grammarly doesn't auto-send it to your professor") [14].
- iA Writer Authorship: text pasted from "Claude, Gemini, ChatGPT" is detected and "bursts onto the page in a rainbow"; human text black; reference/boilerplate dimmed; per-document authors list with character counts; metadata stored "at the end of a file" and "automatically strips author metadata on export to Markdown, HTML, PDF and MS Word" [21][22][23]. iA changed from grey to rainbow because grey "was too quiet" [22].

**Rhema analogue (B2.1):** Rhema's editor should support the selection popover (verbs: *tighten / expand / rephrase in persona / cite this / mark as claim*), cursor generation only inside the chat-to-outline flow (not in drafts, where whole-draft generation is a *run*), and — uniquely — span-level provenance (human / author-agent vN / pasted / research-chat) persisted as ProseMirror marks and exportable as a provenance appendix (ties to D8 provenance badges, C15 export, E-rows). Reject: Jasper-style seat pricing (Rhema is single-author, Q-6) and Wordtune-style per-day caps (runs are the natural unit).

## 2. Academic niche (B2.2) — citations, reviewer simulation, integrity norms

### 2.1 Observed: pricing and features

| Product | Price | What it does that Rhema must reckon with | Source |
|---|---|---|---|
| Overleaf | Free; Student **$8.25/mo**; Standard **$16.75/mo**; Pro **$33.25/mo** (annual rates) | "LaTeX-fluent AI Assistant"; AI metered as "5 AI uses per day" (Free/Student), 10 (Standard), "fair usage" (Pro); track changes and >24 h history paid-only | [24] |
| Paperpal | Prime **$25/mo or $144/yr ($12/mo)** | citation generator "10,000+ styles"; plagiarism + AI detection; *reference check* to "fix… AI-hallucinated references"; draft "grounded in your sources"; "add your guidelines, reviewer notes, or outline"; ISO 42001 | [25][26] |
| SciSpace | Premium **$20/mo ($12 annual)**; Advanced **$70/mo** (Deep Review); Teams $8–18/seat (secondary) | literature review tables, AI writer, paraphraser, journal templates | [27] (secondary) |
| Elicit | Basic free; Pro **$49/mo** ($588/yr); Scale **$169/mo**; Enterprise custom | Research Reports from "up to 135 data sources" (Pro) / 200 (Scale); systematic review screening 5,000 papers; "PRISMA-grade" (Enterprise); 138M papers | [28] |
| Consensus | Free (3 Deep Searches/mo); Pro **$10/mo**; Deep **$45/mo** (200 Deep Searches) — official pages 403'd; secondary | Consensus Meter, Deep Search | [29] (secondary) |
| Scite | Basic **$20/mo**; Pro **$50/mo** (annual) | Smart Citations classify how later work "supported, challenged, or discussed" a paper; "every claim… links back to the specific sentence in the specific paper"; runs "inside Claude, ChatGPT, and any MCP-compatible assistant, plugs into Zotero" | [30][31] |
| Zotero | free | field-code citations that stay live; "Unlink Citations" is irreversible before submission; Google Docs "performance degrades… with 100+ citations"; drag-moving a citation unlinks it | [32][33] |

### 2.2 Observed: reviewer-simulation products

A 2026 category exists: thesify ("simulate parts of reviewer-style critique"), Reviewer3 ("multiple specialized reviewers to assess study design, statistical approaches…"), q.e.d Science (claims vs. supporting data), PaperReview.ai (CS, "grounds its review in related work"), Manusights (citation verification, "journal-specific readiness scoring") [34] (vendor blog — secondary). Paperpal's Prime sells "Submission Readiness Checker" [25]. None of the pages fetched shows *anchored* findings or a response-letter workflow; the closest is Paperpal's "reviewer notes… draft with suggestions grounded in your sources", i.e. an input, not a dispositioned ledger.

### 2.3 Observed: integrity norms

- ICMJE: "Chatbots… should not be listed as authors"; journals "should require authors to disclose whether they used AI-assisted technologies"; "Humans are responsible for any submitted material"; "appropriate attribution of all quoted material, including full citations" [35].
- COPE: "AI tools cannot be listed as an author"; disclose "in the Materials and Methods (or similar section)… how the AI tool was used and which tool was used"; "Authors are fully responsible" [36].
- Reviewer side (secondary summary of COPE guidance): "reviewers should not upload manuscripts into AI tools because of confidentiality… risks" [34].

**Inferred:** the norms are (a) disclosure of *which tool, how*, (b) human responsibility, (c) real citations. Rhema's fact-check ledger ("nothing may be cited that wasn't fetched") already satisfies (c) better than any product here; (a) is trivially satisfiable if every run records tool + model + phase — which the run model (K-rows) does anyway.

**Rhema analogue (B2.2):**
- **Citations (Q-8, H2, C15):** adopt Zotero's lesson in reverse — keep citations *structured* (CSL-JSON items + inline cite nodes) in the markdown/ProseMirror model and render footnotes from them; only "unlink" at export. Do not build a reference manager; import BibTeX/CSL-JSON/Zotero export and offer CSL styles at export. Reject Paperpal's "10,000+ styles" claim as a target — the academic MVP needs ~10 styles (APA, MLA, Chicago N-B and A-D, Harvard, Vancouver, IEEE, Nature, OSCOLA, ACS).
- **Hallucinated-reference check:** Paperpal and Scite both sell it; Rhema's fact-check phase should surface "reference verified against fetched source" per citation as a badge — a first-class integrity artifact (D6, E-rows).
- **Reviewer simulation:** Rhema's editorial-review is *not* persona theater (README: "no persona review-board theater"); position it against Reviewer3-style "multiple specialized reviewers" as *independence* (fresh-context second read) — a marketing line for D15 and a candidate `peer-review-simulation` skill (C16) that emits journal-style R1/R2 letters *from the same dossier*, not a separate review.
- **Disclosure export:** auto-generate an ICMJE/COPE-compliant "AI use statement" from run history (new row proposed, §Ledger updates).

## 3. Editors and publishing platforms (B2.3) — the beauty bar, and Substack in depth

### 3.1 Substack — deep dive

#### Observed: the web editor
- Substack's own feature page describes the editor as a "Rich text editor (TipTap/ProseMirror-based) with headings, bold/italic/strikethrough", "LaTeX support (both inline and block math)", footnotes, "Code blocks with syntax highlighting", "Drafts with autosave", "Version history with restore", "Post templates", "Paywall insertion… anywhere in a post", "Headline A/B testing", "Post scheduling", SEO/social metadata [37]. (This page may be partly AI-generated marketing copy; the TipTap claim is consistent with the `.ProseMirror`/`pencraft` classes seen in the fetched HTML but I could not independently confirm TipTap vs. bare ProseMirror.)
- The 2018 editor post documents paste-to-embed for tweets/YouTube/Spotify/Gists, buttons, block quotes, footnotes, and the constraint "Posts can only be emailed out once" [38].
- **What it deliberately omits:** no custom fonts (a "few different font styles" only [39][40]; secondary sources say "Substack does not currently support the use of custom fonts" [41]); no track changes or comments for co-editing; no plugins; two homepage layouts; colors + logo + wordmark + cover are the whole brand kit [40][42].

#### Observed: typography, measured from `on.substack.com` HTML/CSS (fetched with curl, 2026-08-27) [43]
- Body and heading font preset on that publication: `font_preset_body: fancy_serif` → **Lora** (`font_family_body_preset: Lora`, `font_family_headings_preset: Lora`); UI font `null` → system stack (`-apple-system, "Segoe UI", Roboto, Helvetica, Arial`).
- Size tokens: `--font-size-15: 15px`, `--font-size-16: 16px`, per-publication `--font_size_body_offset: 1px` (i.e. body renders ≈16–17 px on this publication); line-height tokens 20/24/28/32 px; `.markup p… line-height: 1.42em` for thread/comment text; subtitle `19px/28px`.
- Headings are multiples of body: h1 `2em`, h2 `1.625em`, h3 `1.375em`, h4 `1.125em`, scaled by a per-publication `--font_size_headings_multiplier`.
- Measure: `.post { max-width: var(--dt-post-content-max-width, 760px) }`; `--page-width: 600px` and `--embed-width: 700px` in the post viewer; CSS bundles contain repeated `max-width: 640px / 650px / 660px` content containers. **Inference:** Substack's reading column is ≈ 600–660 px of text with 700–760 px for embeds — at 16–17 px Lora that is roughly **65–75 characters per line**.
- Dark mode: the CSS contains a `.dark-mode` root class (e.g. `.dark-mode .viewer-… { box-shadow: … }`), i.e. web dark mode is a class toggle, not only `prefers-color-scheme`.

#### Observed: reader experience and dark mode
- The 2022 web Reader (substack.com/inbox): "no pop-ups, auto-playing videos, or whirring gadgets"; J/K navigation, E archive, S save, L like; RSS import; "Dark mode" listed as standard [44].
- Appearance is reader-controlled: profile picture → Appearance → Auto / Dark / Light for the feed; a sun/moon toggle at bottom-right of a publication page; the app has the same setting (secondary summaries of Substack support pages, which returned 403 to direct fetch) [45][46].

#### Observed: mobile app feature split (D19 exemplar)
- Launch (2024-07-25): "the most requested feature from creators has been an in-app post editor"; v1 = "simple text and image publishing functionality"; missing at launch: draft sync with web, editing published posts, scheduling, preview, video/podcast posts, most embeds/buttons [47][48]. Buttons and image links added 2024-08-15; "reach your subscribers in just a couple of taps" [49].
- Current (mirror of the support article, secondary): app editor supports "size, bold, italics, strikethrough, and code", lists, block quotes, images, dividers, links, undo/redo, audience selection, autosave; still web-only: "Posts can't be edited in the app after publishing", scheduling, previews, "certain embeds and buttons", comment settings [50]. Earlier search summary indicates drafts now sync web↔app and video/button/paywall blocks exist in the app [51] — treat the exact current block list as unverified.
- App is reader-first: inbox (classic vs. compact), Notes, Chat, podcasts/video, "View Creator Stats" (subscribers, revenue, charts), notification controls, dark mode [52][53].

**Inferred — Substack's design thesis:** *one calm reading column, a small typographic palette chosen for you, a reader-owned theme, and a full-power web editor paired with a mobile app whose editor is deliberately a subset.* The app is where you **read, react, and glance at stats**; the web is where you **compose, configure, and schedule**.

### 3.2 Medium, Ghost, WordPress (observed)
- Medium: membership **$5/mo / $50/yr**; Friend of Medium **$15/mo / $150/yr** (help-center pages 403'd; secondary aggregate) [54]. Editor = single-column, minimal toolbar (not fetched this session; not relied upon).
- Ghost: Pro **$18 / $29 / $199 /mo** (annual); editor is "Medium-like", "cards" via `+` or `/`, "All post content in Ghost is stored in Lexical… rendered into its final form depending on the delivery destination" — i.e. a JSON document model with multi-target rendering [55][56].
- WordPress Gutenberg: blocks, slash inserter, List View + Outline (word count, reading time, heading tree), Cmd+K command palette, *Distraction free* and *Spotlight mode* ("all blocks are greyed out except for the one you're working on"), fullscreen by default, visual vs. code editor toggle [57].

### 3.3 Scrivener, Ulysses, iA Writer (the beauty bar)
- Scrivener 3: **$59.99**; "ring-binder metaphor", corkboard, outliner, "snapshots of older versions", "Distraction-free full-screen mode", Compile [58].
- Ulysses: **$5.99/mo or $39.99/yr**; markup editor, "beautiful PDFs, Word documents, ebooks", publishes to "WordPress, Ghost, Medium and Micro.blog", built-in grammar/style check, goals/deadlines [59][60].
- iA Writer: pay-once per platform; three custom typefaces (Mono/Duo/Quattro); Focus Mode "fades out everything… other than the line or paragraph you're working on"; Syntax Highlight (parts of speech); Authorship (§1.4) [21].

**Rhema analogue (B2.3):**
- **Editor substrate (T6):** Substack (ProseMirror family) and Ghost (Lexical) both ship JSON document models with markdown-ish input; Rhema's markdown-backed ProseMirror plan is consistent with the strongest publishing editors. Ghost's "render per destination" is precisely C15's export matrix.
- **Beauty features to copy:** Spotlight/Focus mode (WordPress, iA, Scrivener composition mode) as a Rhema *Focus* view that hides panes; WordPress's Outline (headings + word count + reading time) as the artifact browser's per-draft outline; Scrivener snapshots ≈ Rhema draft versions (D7) — but Rhema's versions are *reviewed* immutable vN, not ad-hoc.
- **Deliberate omissions to copy:** no font picker beyond 2–3 presets; no theme editor; no plugins. Substack proves a mass audience accepts a curated palette.
- **Publishing:** Q-9 says no publishing; but Ulysses/Type-style *export to DOCX/PDF/view-only URL* [5][59] is the expectation, and a "Send to Substack/Ghost/WordPress draft" is a cheap later integration since Ghost/WordPress have write APIs (not fetched; open). Rejected for MVP.

## 4. Anchored-comment and track-changes UX (B2.4) — the model for review findings (T2)

### 4.1 Observed
| System | Anchor | Proposed change? | Controls | List/sidebar | Source |
|---|---|---|---|---|---|
| Google Docs comments | text/image/cell selection | no | @mention, "Assign to", Resolve, Re-open, emoji reactions | "Show all comments" panel | [61] |
| Google Docs Suggesting | range | yes — "change in a new color… deleted… crossed out" | per-suggestion Accept/Reject; Tools → Review suggested edits → preview with/without → "Accept all"/"Reject all"; comment attached to a suggestion | review box | [62] |
| Word Track Changes | range | yes | Simple Markup (red margin line) / All Markup / No Markup / Original; balloons vs inline; accept/reject each or all; "Just Mine"; Lock Tracking with password | Reviewing pane | [63] |
| Notion | selection across blocks; page-level | no | resolve ✔️ (reopenable), threads, @mentions, filter by person/status, "minimal comment icons" display option | comments pane 💬 | [64] |
| Figma | pinned point or region inside a frame; "comments follow their anchored objects when moved, but don't attach to nested layers" | no | C to enter comment mode, threads, @mentions, images in comments | sidebar (separate article) | [65] |
| Cursor (agent diffs) | file hunk | yes | inline red/green diff, Accept/Reject per hunk/file/all; "diff view shows changes as they happen"; Review → Find Issues | review panel | [66][67] (docs + forum, secondary) |
| Lex | range | "Track Changes: Coming soon" | keyboard-navigable comments | — | [1] |

### 4.2 Inferred design rules (verified across ≥3 systems each)
1. **Two anchored kinds, one list.** Comments (opinion) and suggestions (proposed text) are visually distinct but live in the same margin list; Docs lets a suggestion carry a comment.
2. **Three view modes** (Word): margin-line-only, full markup, clean. Reviewers toggle constantly; a *Simple Markup* default avoids "red ink" fatigue.
3. **Bulk with preview**: "preview the document with or without changes before selecting Accept all" (Docs) — never bulk-accept blind.
4. **Anchors survive edits or degrade gracefully** (Figma: follow the frame; Zotero: dragging unlinks). ProseMirror/Yjs relative positions handle this (H3).
5. **Resolve is reopenable and filterable** (Notion, Docs).
6. **Lock** (Word "Lock Tracking"): a document under review cannot silently stop tracking — Rhema's analogue is the immutability of a reviewed vN (D7).

**Rhema analogue (D6, T2 — confirmed):**
- A finding = anchored comment (quoted passage → range) with severity, evidence URL, phase-of-origin badge (fact-check / discourse / second read / craft), and *optionally* a proposed edit rendered as a suggestion.
- Disposition controls replace Resolve: **accept / adapt / rebut / defer / escalate** — each writes the response-ledger row. "Adapt" opens the suggestion for editing in place (Word's editable suggestion box [18] is the precedent).
- Views: *Margin* (Word Simple Markup: one tick per finding), *Full* (inline highlights + cards), *Clean*. Filters by severity, phase, disposition, reviewer-vs-second-read, and "rejected by reconciliation (shown to author)".
- Bulk: "Accept all copy-edits" only after a diff preview.
- Reject alternatives: (a) a separate dossier tab with links back — loses the anchoring that every product above has converged on; (b) full track-changes for *every* agent edit in respond-to-review — a vN→vN+1 diff (D7) is the right grain; word-level track changes across 15k words is noise (Cursor's own forum shows users demanding per-hunk review *and* others demanding it off [67]).

## 5. Deep-research chat UX (B2.5) — the bar for the in-IDE chat and "official outline"

### 5.1 Observed
- **ChatGPT deep research:** OpenAI's launch page 403'd; a secondary (Yahoo/Engadget, 2025-04-25) gives limits: Free 5 lightweight/mo; Plus/Team 10 full + 15 lightweight; Pro 250/mo; lightweight runs on o4-mini and "will usually be shorter"; automatic fallback to lightweight when the full quota is exhausted [68]. (Duration and clarifying-question behavior not verified this session.)
- **Claude Research:** "conducts multiple interconnected searches… determines exactly what to investigate next"; Google Workspace integrations; "easy-to-check citations"; early beta on Max/Team/Enterprise at the time of the post [69].
- **Perplexity Deep Research:** official blog 403'd; secondary: "performing numerous searches and analyzing hundreds of sources in 1-2 minutes" (launch 2025-02-14/15); reports "exportable as PDFs or shareable via Perplexity Pages"; free 5/day, Pro up to 500/day at $20/mo [70][71].
- **Gemini Deep Research:** "Gemini presents [a research plan] to you, and you can refine it"; outputs multi-page report, Audio Overview, Canvas, "Export capability to Google Docs"; can browse Workspace content [72].

### 5.2 Inferred: the four UX conventions
1. **Plan-before-run** (Gemini, and ChatGPT's clarifying questions per public reports): show an editable plan and a cost/time estimate, then run. This *is* Rhema's human gate (Q-7).
2. **Progress as a step feed** with the sources being read; **report with inline citations** as output.
3. **Quota as a visible counter with a lighter fallback** (OpenAI) — maps to Rhema's model routing (G13): a "quick" phase set vs. full.
4. **Export the report into a durable document** (Gemini → Docs; Perplexity → Page/PDF).

**Rhema analogue (D9, C16):** the in-IDE chat is a research session whose *terminal artifact* is an Outline. Concretely: (a) a persistent "Promote to outline" action on any assistant message or on the whole thread; (b) the promoted outline is a typed artifact (`outline.md` with front-matter: thesis, venue, audience, target length, sections with claim bullets, sources with URLs fetched in-session); (c) promotion is itself a light run (`outline-from-research`, cost class S) that writes the artifact and a "sources ledger" — exactly the fact-check input the review needs later; (d) the chat shows a Gemini-style plan card *before* expensive research bursts, with Rhema's estimate. Reject: a free-form "export chat to markdown" — it discards structure and leaves the draft-from-outline skill guessing.

## 6. Design-inspiration recommendation (Q-14, D14, H6)

**Recommendation: "Paper in a dark shell."** Rhema's IDE chrome (sidebars, run timeline, chat, findings list, palette) is dark-by-default in the Cursor/Devin idiom: dense, monochrome, sans-serif UI at 13–14 px, keyboard-first. The *editor surface* is a Substack-style page: a single centered column with a serif body, generous leading, and a curated 2-preset font choice. In dark mode the paper is a very dark warm gray (not pure black) with off-white text; in the optional light mode it is Substack-white. The two textures are separated by a subtle inset, never blended.

Why this and not the alternatives:
- *Pure Cursor look* (rejected): monospace/sans density is hostile to reading 15k words of prose; Substack's numbers (16–17 px serif, ~65–75 cpl) exist because readers abandon anything else.
- *Pure Substack look* (rejected): Substack has no place to put a run timeline, findings, diffs, or cost meters; it is single-surface by design.
- *Light-by-default with dark option* (rejected, Q-14 binding): but light mode is a one-key toggle because reviewing on paper-white remains a common academic preference; the theme follows the app by default and can be pinned per project ("paper: light / dark / follow app").

Concrete design-system inputs (D14):
- **Two paper presets:** *Serif* (body: Lora or Source Serif 4 / Literata; headings same family, weights 600) and *Sans* (body: Inter or IBM Plex Sans). No font picker beyond these; no custom fonts (Substack proves acceptance).
- **UI type:** Inter/system sans 13–14 px, tabular figures for cost/word counts; mono only for citation keys and diff hunks.
- **Focus mode:** hides all panes, keeps margin ticks for findings (Word Simple Markup) so review context is never lost.
- **Motion:** streaming text and run-phase progress only; no decorative animation on the paper.

## 7. Typography and measure recommendations (H6, D14)

Observed standards: Practical Typography — "45–90 characters or 2–3 alphabets" per line [73]; WCAG 1.4.8 (AAA) — a mechanism for ≤ 80 characters per line, line spacing ≥ 1.5 within paragraphs, paragraph spacing ≥ 1.5× line spacing, text resizable to 200% without horizontal scroll, user-selectable colors [74]; iA — body size "depends on reading distance", Georgia 16 px as a benchmark, ~140% line height, adaptive (not liquid) column widths [75]; Substack measured: 16–17 px serif, ~600–660 px text column, headings 2/1.625/1.375/1.125 em [43].

**Recommendation (numbers):**
- Body **17 px** serif preset / **16 px** sans preset; line-height **1.55** (≈26 px), paragraph spacing 1.0 em (WCAG's 1.5× rule is satisfied via a ≥1.5 line-height plus block spacing; we choose paragraph *spacing* over indents because findings cards interleave).
- **Measure 68 ch** target (≈ 620–660 px at 17 px Lora), hard max **80 ch** (WCAG AAA), min **45 ch** on narrow panes; when the editor pane is narrower than 45 ch, the layout must collapse side panes rather than reflow below the minimum.
- Heading scale from body: h1 2.0 / h2 1.625 / h3 1.375 / h4 1.125 (Substack's ratios; they read well and keep headings inside the measure).
- Findings margin: a **240–320 px** gutter to the right of the column at ≥ 1280 px viewport; below that, findings collapse to margin ticks + a drawer (Notion's "minimal comment icons" pattern).
- Dark paper: background ≈ `#141311`–`#1a1917` warm dark, text `#e8e4dc` at ~87% (contrast ≥ 10:1), links and severity colors tuned to ≥ 4.5:1; avoid pure `#000`/`#fff` to reduce halation for long reads (inferred from iA's rationale for reading comfort; not a fetched claim — flagged in open questions).
- Provide a reader-controlled size stepper (±2 px, three steps) and Auto/Dark/Light (Substack's exact trio).
- Print/export CSS: 11 pt serif, 1.4 leading, 6.5 in measure for PDF (C15) — a sensible default, not a fetched standard.

## 8. Mobile feature-split proposal (D19, Q-18)

Substack's split, restated as a rule: **the app is for consuming, reacting, and glancing; the web is for composing and configuring.** Its editor exists but is a strict subset, and it launched *without* editing published posts, scheduling, preview, or draft sync [47][48][50].

| Capability | Web IDE | Mobile (v1) | Rationale |
|---|---|---|---|
| Read drafts vN, outline, editor's letter, rubric | ✓ | ✓ (reader-mode, Substack-quality typography, dark) | this is the "inbox" use case; runs take minutes–hours (D16) |
| Findings list + anchored view; disposition accept/adapt/rebut/defer/escalate with a short note | ✓ | ✓ (list-first; tap to see passage) | the app's *Notes*-like quick interaction; dispositions are small, high-value inputs |
| Approve/decline a human gate; see cost estimate | ✓ | ✓ | Q-7 gates are the mobile killer feature: "approve the $60 review from the train" |
| Chat with the project agent (research chat) | ✓ | ✓ (text; promote-to-outline disabled) | Substack Chat/Notes precedent; cheap to support |
| Notifications: run finished, gate waiting, run failed | ✓ | ✓ push | D16 |
| Usage glance (this month's spend, per project) | ✓ | ✓ read-only ("View Creator Stats" pattern) | L-rows; no plan changes on mobile |
| Light edits to a *non-reviewed* draft (typo, sentence) | ✓ | ✓ limited (bold/italic/links/lists — Substack's app set), autosave + sync | mirror Substack's v1 editor; never on immutable reviewed vN |
| Start runs (draft-from-outline, review, respond) | ✓ | only "run next step with defaults" | configuration surface is too large |
| Persona editing/generation, sample ingestion | ✓ | ✗ | expensive, config-heavy (J-rows) |
| Run configuration, model choice, phase opt-outs | ✓ | ✗ | |
| Version diffs vN/vN+1 | ✓ | read-only side-by-side ✗ / "what changed" summary ✓ | diff on a phone is unreadable; the response-ledger summary is not |
| Billing, plan changes, exports | ✓ | ✗ (link out) | app-store payment rules; Substack keeps these on web |

Platform: the reading/dispositions/gates/chat surface is document- and list-shaped and needs push notifications — a **PWA is insufficient for reliable iOS push and background sync** (not verified this session; evaluate in D19/A-rows), so plan **Expo/React Native sharing the design tokens**, with the editor kept to Substack-v1 scope to avoid porting the ProseMirror stack. Rejected: full IDE on mobile (Substack explicitly avoided this and took ~a year to add even draft sync); mobile-first (the buyer sits at a desk with 15k words).

## Rhema implications (numbered)

1. **D6/T2 — confirmed.** Findings = anchored comments that may carry a suggestion; dispositions replace resolve; three markup views; bulk-with-preview; anchors on relative positions. (§4)
2. **D8/E — new: span-level provenance.** Persist human/agent/pasted marks; export a provenance appendix and an ICMJE/COPE "AI use statement" from run history. (§1.4, §2.3)
3. **D9/C16 — "Promote to outline" is a run, not an export**; add `outline-from-research` (cost class S) writing `outline.md` + sources ledger; plan card before research bursts. (§5)
4. **D14/H6 — numbers fixed:** 17/16 px, lh 1.55, 68 ch target/80 ch max, Substack heading ratios, two font presets, Auto/Dark/Light, size stepper. (§7)
5. **Q-14 — "paper in a dark shell"**; the paper can be pinned light per project. (§6)
6. **D19 — split table above**; Expo/RN with a Substack-v1-scope editor; gates + dispositions + chat + notifications are the mobile core. (§8)
7. **L3/T7 — confirmed.** Every comparable meters credits/uses/prompts; monthly prices $8–50; Rhema's per-run cost forces run-priced tiers with visible estimates (Overleaf's "N AI uses per day" and OpenAI's quota-with-lighter-fallback are the two UX precedents for limits). (§1.1, §2.1, §5.1)
8. **H2/C15/Q-8 — citations structured in-model (CSL-JSON items + cite nodes)**, footnotes rendered from them, ~10 CSL styles at export, BibTeX/CSL-JSON/Zotero import; per-citation "verified against fetched source" badge. (§2)
9. **D3 — Focus mode with margin ticks**; per-draft outline with word count/reading time (WordPress). (§3.2–3.3)
10. **J/T5 — Grammarly's editable profile card** is the precedent for surfacing a persona profile summary without exposing the scaffold; the staleness pill is Rhema's substitute for "continuous update". (§1.3)
11. **D15 positioning** — "independent second read, not reviewer theater" against Reviewer3-style multi-persona products; "nothing cited that wasn't fetched" against Paperpal/Scite reference-check add-ons. (§2.2)
12. **G13** — a "quick" phase set as the lighter fallback when a user's run allowance is exhausted (OpenAI pattern). (§5.2)

## Ledger updates

| Row | Proposed status | Evidence (one line) |
|---|---|---|
| B2.1 | done | §1; sources [1]–[23]; pricing table verified on live pages 2026-08-27 (Lex figures via vendor newsletter [3]) |
| B2.2 | done (Consensus/SciSpace prices secondary) | §2; [24]–[36]; ICMJE + COPE fetched |
| B2.3 | done | §3; Substack typography measured from live CSS [43]; support.substack.com 403 — mirrored/secondary for app editor list [50] |
| B2.4 | done | §4; Docs/Word/Notion/Figma official help fetched [61]–[65] |
| B2.5 | done (OpenAI/Perplexity official pages 403; secondary) | §5; Claude [69] and Gemini [72] official |
| D19 | in-progress → proposal delivered (§8); platform choice (Expo vs PWA push) still open | §8 |
| D6 | in-progress — interaction spec inputs delivered (§4.2) | |
| D9 | in-progress — "promote to outline" design (§5) | |
| D14 / H6 | in-progress — numeric typography recommendations (§7) | |
| L3 | in-progress — competitor price anchors (§1.1, §2.1) | |
| H2 / C15 | in-progress — citation-model recommendation (§2) | |

**New rows proposed**
- **E6 — Span-level provenance & AI-use statement**: track human/agent/pasted spans; export provenance appendix and ICMJE/COPE disclosure text from run history. (Owner A/P) Evidence: [14][21]–[23][35][36].
- **C17 — `outline-from-research` skill**: promote a research chat to a typed `outline.md` + sources ledger; plan card + estimate before research bursts. (Owner R/P) Evidence: [69][72].
- **D20 — Findings view modes & bulk-with-preview**: Margin / Full / Clean; "Accept all copy-edits" gated on a diff preview. (Owner D) Evidence: [62][63].
- **D21 — Paper theme policy**: dark shell + paper that follows app theme by default, pin light/dark per project, Auto/Dark/Light + size stepper. (Owner D) Evidence: [43][44][45].
- **I6 — Citation import formats**: BibTeX, CSL-JSON, Zotero RDF/export; ~10 CSL styles at export. (Owner A) Evidence: [32][33].

## Open questions / unverified

- **Fetch failures (403/404) — cited only via secondary or not at all:** all `support.substack.com` articles (Cloudflare challenge even with a browser UA); `scispace.com/pricing`; `consensus.app` pricing and help center; `openai.com/index/introducing-deep-research`; all `perplexity.ai` hub/help pages; `help.medium.com`; `medium.com/blog`; `literatureandlatte.com` (bot check); `docs.sudowrite.com/feedback`; `publicationethics.org` (COPE quoted via a library mirror [36]); Nature's AI policy (login redirect). Product facts from these are labeled *secondary* above and should be re-verified before the spec quotes prices.
- Substack's **current** app editor block list (paywall/button/video in-app; draft sync) conflicts between the 2024 launch posts [47][48] and 2026 search summaries [51]; the mirror [50] is the best available. Verify on-device.
- Substack's **font preset list** (names beyond Lora) and exact body size defaults across publications: only one publication was measured; presets are named `fancy_serif` etc. in CSS variables, list not fetched.
- Whether Substack's editor is TipTap vs. bare ProseMirror: the claim comes from Substack's own feature page [37], consistent with CSS classes seen, but not independently confirmed.
- ChatGPT deep research duration/clarifying-question behavior and Claude Research's *current* plan availability (the post reflects launch-time beta) — not verified this session.
- Dark-paper color values and the halation rationale in §7 are design inference, not fetched research; a contrast/readability study (e.g., on dark-mode reading speed) should be fetched for D14.
- iOS PWA push/background-sync limitations (basis for the Expo recommendation) not fetched this session.
- Lex pricing figures are from Lex's 2024 newsletter [3]; the live pricing page hides numbers [1]; a third-party review claims $18/$14.99 [2] — treat as approximately current.
- Contradiction check against theses/decisions: none found. T2, T6, T7 supported. Q-14 (dark by default) is honored with a light-paper override — the operator may want to confirm that the *paper* may default to dark rather than only the shell.

## Sources

1. https://lex.page/pricing · Lex Pricing · 2026-08-27 · Pro features, Teams add-on, page hides prices
2. https://www.creatorstackclub.com/software/lex · Lex Review (2026) (secondary, via search) · 2026-08-27 · $18/mo, $14.99 annual claim
3. https://buttondown.com/lex/archive/lex-reminder-early-bird-pricing-ends-tomorrow/ · Lex newsletter 2024-04-29 · 2026-08-27 · $18/mo / $145/yr, Checks, Document Context
4. https://type.ai/pricing · Type pricing · 2026-08-27 · tiers, credits, 150k-word cap
5. https://type.ai/ · Type home · 2026-08-27 · write+chat integration, custom rules, export
6. https://www.sudowrite.com/pricing · Sudowrite pricing · 2026-08-27 · tiers/credits
7. https://www.sudowrite.com/ · Sudowrite home · 2026-08-27 · Write/Rewrite/Describe/Story Bible/Muse/Feedback
8. https://www.novelcrafter.com/pricing · Novelcrafter pricing · 2026-08-27 · tiers, BYOK
9. https://www.novelcrafter.com/ · Novelcrafter home · 2026-08-27 · Codex, Workshop, prompts, BYOK providers
10. https://www.jasper.ai/pricing · Jasper pricing · 2026-08-27 · Pro $69/seat, Brand Voices, Style Guide x-ray
11. https://www.wordtune.com/pricing · Wordtune pricing · 2026-08-27 · per-day rewrite caps
12. https://www.grammarly.com/plans · Grammarly plans · 2026-08-27 · Free/Pro $12/Enterprise, prompt quotas
13. https://support.grammarly.com/hc/en-us/articles/23153676821773-Introducing-voice-features · Grammarly voice features · 2026-08-27 · voice profile, Rewrite in my voice, plan availability
14. https://www.grammarly.com/authorship · Grammarly Authorship · 2026-08-27 · provenance report
15. https://www.notion.com/pricing · Notion pricing · 2026-08-27 · AI on Business, agent credits
16. https://www.notion.com/help/guides/notion-ai-for-docs · Notion AI for docs · 2026-08-27 · Edit with AI accept/discard/try again
17. https://support.google.com/docs/answer/13447609 · Help me write with Gemini in Docs · 2026-08-27 · refine verbs, Accept all/Reject all, plan requirement
18. https://support.microsoft.com/en-us/word/copilot/rewrite-text-with-copilot-in-word · Rewrite with Copilot in Word · 2026-08-27 · Auto Rewrite, Replace/Insert below/Regenerate, editable box
19. https://support.microsoft.com/en-us/office/draft-and-add-content-with-copilot-in-word-069c91f0-9e42-4c9a-bbce-fddf5d581541 · Draft with Copilot in Word · 2026-08-27 · Keep it/Regenerate/Discard, / references, licensing
20. Search summary of support.microsoft.com "Rewrite text with Copilot" (tone options Neutral/Casual/Concise) · 2026-08-27 · secondary
21. https://ia.net/writer · iA Writer · 2026-08-27 · Focus Mode, Syntax Highlight, Authorship, fonts, pricing model
22. https://ia.net/topics/see-what-ai-wrote · See What AI Wrote (2025-11-06) · 2026-08-27 · rainbow AI text, rationale
23. https://ia.net/writer/support/editor/authorship · iA Writer Authorship support · 2026-08-27 · marking, authors list, export stripping
24. https://www.overleaf.com/user/subscription/plans · Overleaf plans · 2026-08-27 · prices, AI uses/day, track changes
25. https://paperpal.com/ · Paperpal home · 2026-08-27 · features, reference check, ISO 42001
26. https://support.paperpal.com/support/solutions/articles/3000126443-what-is-the-price-for-paperpal-paid-subscriptions- · Paperpal price · 2026-08-27 · $144/yr, $25/mo
27. Search summary (scispace.com/typeset-pricing, top50aitools, softwaresuggest) · SciSpace pricing · 2026-08-27 · secondary; official page 403
28. https://elicit.com/pricing · Elicit pricing · 2026-08-27 · tiers, data-source limits
29. https://costbench.com/software/ai-research-tools/consensus/ · Consensus pricing (secondary, verified 2026-06-11 by the page) · 2026-08-27 · Free/Pro $10/Deep $45
30. https://scite.ai/pricing · scite pricing · 2026-08-27 · Basic $20/Pro $50, MCP credits
31. https://scite.ai/ · scite home · 2026-08-27 · Smart Citations, Assistant, integrations
32. https://www.zotero.org/support/word_processor_integration · Zotero word processor plugins · 2026-08-27 · live citations, supported editors
33. https://www.zotero.org/support/google_docs · Zotero Google Docs · 2026-08-27 · field codes, unlink, limits
34. https://www.thesify.ai/blog/ai-tools-academic-peer-review · AI tools for academic peer review (vendor blog, secondary) · 2026-08-27 · reviewer-simulation product list, COPE reviewer norm
35. https://www.icmje.org/recommendations/browse/roles-and-responsibilities/defining-the-role-of-authors-and-contributors.html · ICMJE authorship & AI · 2026-08-27 · disclosure, responsibility
36. https://jpl-nasa.libguides.com/blog/Authorship-and-AI-Tools · COPE position statement (mirror) · 2026-08-27 · AI not an author; M&M disclosure
37. https://substack.com/features · Substack features · 2026-08-27 · editor feature list, TipTap claim, mobile creator tools
38. https://on.substack.com/p/how-to-use-the-substack-editor · How to use the Substack editor (2018-04-26) · 2026-08-27 · embeds, footnotes, buttons, email-once
39. https://on.substack.com/p/new-publication-themes · New publication themes (2021-01-08) · 2026-08-27 · "a few different font styles", two layouts
40. https://faq.substack.com/p/creating-a-visual-identity-for-your · Creating a visual identity · 2026-08-27 · theme controls, logo/wordmark/cover
41. Search summary (substackcourse.com, wordscr.com) · Substack fonts · 2026-08-27 · secondary: no custom fonts, 16 px default
42. Search summary of support.substack.com custom-theme/fonts articles · 2026-08-27 · secondary (direct fetch 403)
43. https://on.substack.com/p/mobile-editor (HTML + linked substackcdn.com CSS bundles, fetched via curl) · 2026-08-27 · measured: Lora preset, 15/16 px tokens, heading multipliers, page/embed widths, `.dark-mode` class
44. https://on.substack.com/p/new-web-reader · Substack Reader (2022-09-26) · 2026-08-27 · calm-reading design, shortcuts, dark mode
45. Search summary of support.substack.com "How can I navigate my Substack on desktop" · 2026-08-27 · Appearance Auto/Dark/Light, sun/moon toggle (secondary)
46. https://github.com/victor-david/substack-reader and https://addons.mozilla.org/en-GB/firefox/addon/dark-mode-for-substack/ (search results, not fetched) · evidence that reader-side theme override demand exists · secondary
47. https://on.substack.com/p/mobile-editor · Introducing a new way to publish from the app (2024-07-25) · 2026-08-27 · v1 scope and omissions
48. https://techcrunch.com/2024/07/25/substack-writers-can-now-draft-and-publish-posts-in-ios-app · TechCrunch (secondary) · 2026-08-27 · launch omissions
49. https://on.substack.com/p/substack-bulletin-7 · Substack bulletin (2024-08-15) · 2026-08-27 · buttons/image links in app
50. https://www.substacktools.com/en/help/post/how-to-publish-a-post-from-the-substack-app · Mirror of Substack support article (secondary) · 2026-08-27 · app editor capabilities and web-only list
51. Search summary of support.substack.com "How to publish a post from the Substack app" · 2026-08-27 · draft sync, video/button/paywall in app (secondary, unverified)
52. https://substack.com/app · Substack app page · 2026-08-27 · marketed features
53. Search summary of support.substack.com "Getting started on the Substack app" · 2026-08-27 · inbox modes, Creator Stats, dark mode (secondary)
54. Search summary (help.medium.com, medium.com/blog, trustradius) · Medium membership prices · 2026-08-27 · secondary; official pages 403
55. https://ghost.org/pricing/ · Ghost(Pro) pricing · 2026-08-27 · tiers
56. https://docs.ghost.org/publishing · Ghost editor · 2026-08-27 · cards, Lexical storage, render-per-destination
57. https://wordpress.org/documentation/article/wordpress-block-editor/ · WordPress block editor (updated 2026-07-31) · 2026-08-27 · Outline, command palette, Distraction free, Spotlight
58. https://apps.apple.com/us/app/scrivener-3/id1310686187?mt=12 · Scrivener 3 (App Store) · 2026-08-27 · $59.99, feature quotes
59. https://ulysses.app/ · Ulysses home · 2026-08-27 · markup, export, publishing targets, proofreader
60. https://ulysses.app/pricing/ · Ulysses pricing · 2026-08-27 · $5.99/mo, $39.99/yr
61. https://support.google.com/docs/answer/65129 · Google Docs comments · 2026-08-27 · add/assign/mention/resolve/reopen/reactions
62. https://support.google.com/docs/answer/6033474 · Google Docs Suggesting mode · 2026-08-27 · colors/strikethrough, accept/reject, Review suggested edits preview
63. https://support.microsoft.com/en-us/office/track-changes-in-word-197ba630-0f5f-4a8e-9a77-3712475e806a · Word Track Changes · 2026-08-27 · markup modes, balloons, Just Mine, Lock Tracking
64. https://www.notion.com/help/comments-mentions-and-reminders · Notion comments · 2026-08-27 · inline/page comments, resolve, pane filters
65. https://help.figma.com/hc/en-us/articles/360041068574-Comment-on-files · Figma comments · 2026-08-27 · pin/region anchoring, threads, mentions
66. https://cursor.com/docs/agent/review · Cursor: Reviewing and testing code · 2026-08-27 · diff view, Review → Find Issues
67. https://forum.cursor.com/t/bring-back-per-change-apply-inline-diff-review-you-re-throwing-away-your-best-ux-advantage/160856 (search result, secondary) · 2026-08-27 · per-hunk accept/reject demand
68. https://tech.yahoo.com/ai/articles/openai-expands-access-lightweight-deep-150703772.html · OpenAI lightweight deep research (2025-04-25, secondary) · 2026-08-27 · quotas, o4-mini fallback
69. https://claude.com/blog/research · Claude Research · 2026-08-27 · agentic search, citations, plan availability
70. https://alternativeto.net/news/2025/2/perplexity-introduces-deep-research-for-ai-driven-research-automation · Perplexity Deep Research (secondary) · 2026-08-27 · 1–2 min, PDF/Pages export, 5/day free, Pro 500/day
71. Search summary of perplexity.ai/hub/blog/introducing-perplexity-deep-research · 2026-08-27 · "2-4 minutes", dozens of searches (secondary; official page 403)
72. https://gemini.google/overview/deep-research/ · Gemini Deep Research · 2026-08-27 · editable plan, report, Docs export, Audio Overview
73. https://practicaltypography.com/line-length.html · Butterick, Line length · 2026-08-27 · 45–90 characters
74. https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html · WCAG 2.2 SC 1.4.8 · 2026-08-27 · 80 characters, 1.5 leading, 200% resize
75. https://ia.net/topics/responsive-typography-the-basics · iA, Responsive typography · 2026-08-27 · reading distance, 16 px Georgia, ~140% leading

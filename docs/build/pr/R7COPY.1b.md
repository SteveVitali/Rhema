# R7COPY.1b — one sanitized markdown renderer (+ the chat render-seam closure)

Row 245 · REQ-COPY-3, REQ-TALK-2 (rendered-markdown clause), REQ-KIT-5 · findings UXC-28, C8, D2, G2, I3, P4-7.

## What lands

- **`packages/ui/src/markdown-prose.tsx` — the ONE sanitized markdown renderer** over the canonical
  profile (`parseCanonical` → mdast → React nodes; no second parser). Never `dangerouslySetInnerHTML`:
  `html` nodes render as escaped code text, `javascript:`/`data:`/`vbscript:`/`file:` hrefs render text
  without an anchor, externals get `target="_blank" rel="noopener noreferrer"`, images never auto-load
  (safe src → labelled link; `asset:`/unsafe → literal `![alt](src)` text). Bare-URL text >48 ch
  truncates with the full URL in `title`; `.ui-md a, .ui-md-url { overflow-wrap: anywhere }`.
- **Sites on the one renderer:** finding bodies + collapsed-rejected bodies (`findings.tsx`), evidence
  URLs via `SafeUrlLink` (C8), dossier letter + finding bodies (`dossier.tsx`), response letters
  (`letter.tsx`), what-changed hunks (`what-changed.tsx` — the `<pre>` mono face is gone, diff tint
  kept), proposal cards (`page-strip.tsx`), the converted import pane (`conversion.tsx`), inbox notice
  bodies ×5 (`inbox.tsx`), the figures pending-proposal block (`figures.tsx`), the voice-sample preview
  (`voices.tsx`), and the chat seam.
- **Chat seam closed (P4-7 / D-R7TALK.1a-2):** `renderAssistantText` now returns `<MarkdownProse>` —
  assistant/user/optimistic bubbles render sanitized markdown. The `chat-brief` `<pre>` is also prose —
  through the renderer. D-R7TALK.1a-2 closed in DEFERRALS with the dated note.
- **Mono exemptions (recorded):** conversion source pane (raw bytes), voice-measures JSON, reseed diff,
  figures CSV/spec/tableSource, PmPreview `<pre>`s (frontmatter/code/link-def/html source constructs),
  the onboarding paste TextArea (source input). Prose is typeset; code stays code.
- **REQ-KIT-5:** `@rhema/markdown` marked `sideEffects:false`; the renderer + unified/remark stack lands
  in the `markdown-prose-*.js` async chunk (~37.6 kB gz) reachable only from leaf chunks —
  `check-spa-entry-graph` now DENIES the markdown stack in the shell entry graph (a leak fails CI).
  `data-md-block` declared in `dom-contract.ts` (`shared`).

## AC evidence (engineered / deterministic; Stage B owed)

- Renderer tests: `markdown-prose.test.tsx` — `*Paradoxides*` italic (no asterisks), lists, paragraphs,
  `<script>`/`<img onerror>`/`javascript:` neutralized (incl. reference links + control-char smuggling),
  heading clamp, tables, images-as-links, parse fallback.
- Per-site component legs: `dossier-surfaces.test.tsx` (FindingCard body + evidence URL + LetterView),
  `what-changed.test.tsx` (hunk reading face), `chat-panel.test.tsx` (seam swap — escaping still green),
  `inbox.dom.test.tsx` (security notice → paragraphs + real list), `page.test.ts` (proposal card),
  `figures.dom.test.tsx` (pending-proposal block).
- DOM legs: `markdown-prose.dom.test.tsx` — an assistant bubble renders italic/list/safe-link through
  `data-md-block` with zero raw HTML; the 320 px card leg pins truncation + `title` + the `uiCss` wrap
  rule.
- `check:dom-contract` OK · `check:spa-budget` OK (entry **+17.2 kB** vs `04a4e98b` — ticket increment
  **+0.0 kB**; the running GD-KIT3A-BUDGET deficit is unchanged) · `check:spa-env` OK ·
  `check:protocol-markers` OK · `check:spa-entry-graph` OK · `uiCss()` inside the 24 kB bound.
- Full `apps/web/src` sweep **1616/1616** · `packages/ui` **176/176** · turbo build · typecheck ·
  eslint 0 errors (1 pre-existing warning).
- **Stage B owed → `D-R7COPY.1b-1` (250_R7DEP.2):** finding card w/ emphasis + wrapped URL, the inbox
  security notice, a what-changed passage, a chat bubble — screenshots at 250's preview SHA. Owed,
  never green here (`GD-PREVIEW.R7`).

## Spend / live

$0 — Stage A only. No preview, no production mutation, no money-mode change.

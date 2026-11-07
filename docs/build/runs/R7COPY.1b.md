# Run ledger — R7COPY.1b (row 245)

- **Spec:** `docs/tickets/245_R7COPY.1b__error-copy-markdown.md`
- **Base:** `stevevitali/r7copy-1a-labels` @ `7af98708`
- **Branch:** `stevevitali/r7copy-1b-markdown`
- **Harness:** devin-desktop/swe-2-high/subagent
- **Started:** 2026-11-07T02:30Z
- **Closed:** 2026-11-07 (Stage A)
- **Config:** full (ledger/self-review/gap-analysis/tests; live_verification = fixture-verified only — Stage A $0, no preview per GD-PREVIEW.R7)

## Deferrals read

Round-7 sections read at run start. `D-R7TALK.1a-2` (OPEN — "Markdown in the bubble renderer",
unblocked by this ticket) is **closed here** with the dated note citing the bubble DOM test.
Stage-B walks owned by 250 stay OPEN. New row: `D-R7COPY.1b-1` (Stage-B renderer walk → 250).

## Requirements

1. REQ-COPY-3 — one sanitized markdown renderer for finding bodies, inbox notices, response
   letters, what-changed passages, chat assistant bubbles. No raw HTML; safe link protocols only;
   externals open safely.
2. REQ-TALK-2 (the rendered-markdown bubble clause; P4-7) — plug the renderer into 232's
   `renderAssistantText` seam; no second parser; 232's sanitizer test stays green;
   `D-R7TALK.1a-2` closed.
3. REQ-COPY-3 — no monospace prose outside Source mode: proposal previews, what-changed hunks,
   converted-import pane, voice sample preview render the reading face. Genuinely code/data
   stays mono with recorded reasons.
4. REQ-COPY-3 (C8) — long URLs wrap/truncate: `overflow-wrap` + truncation with the full URL in
   `title`.
5. REQ-KIT-5 — renderer never enters the shell entry graph; entry delta ≤ 15 kB gz reported.

## Plan

- `packages/ui/src/markdown-prose.tsx` (new): `MarkdownProse` — a `@rhema/ui` component over the
  canonical profile (`parseCanonical` from `@rhema/markdown`), walking the mdast to React nodes.
  Never `dangerouslySetInnerHTML`; `html` nodes render as escaped code text; `javascript:`/`data:`/
  `vbscript:`/`file:` hrefs render link text without an anchor; external `http(s)` links get
  `target="_blank" rel="noopener noreferrer"`. Bare-URL link text >48 ch truncates with `title=`
  the full URL; `.ui-md a { overflow-wrap: anywhere }` in `uiCss()`. `SafeUrlLink` shares the
  same safe/truncated anchor for the finding-card evidence rows. Parse failure falls back to
  escaped plain paragraphs.
- `@rhema/markdown` gains `"sideEffects": false` (pure modules — lets the leaf chunks drop the
  unused normalizer/front-matter code).
- Sites: `chat-panel.tsx` (`renderAssistantText` seam + the `brief` `<pre>`), `findings.tsx`
  (card body, collapsed-rejected body, evidence URL → `SafeUrlLink`), `dossier.tsx` (letter +
  finding bodies), `letter.tsx` (paragraphs), `what-changed.tsx` (`BlockText` hunks →
  `.ui-md-side--before/after` classes, diff tint kept), `page-strip.tsx` (proposal `<pre>`),
  `conversion.tsx` (converted pane typeset; source pane stays mono — raw source bytes),
  `spa/surfaces/inbox.tsx` (five `ui-inbox-body` sites), `spa/surfaces/figures.tsx`
  (`data-proposal-block`), `spa/surfaces/voices.tsx` (`data-sample-preview`).
- Mono exemptions (recorded): conversion source pane (raw bytes), voices `data-voice-measures`
  (JSON), `data-reseed-diff` (diff), figures CSV/spec/tableSource (data), PmPreview `<pre>`s
  (frontmatter/code/link-def/html-block — source constructs), onboarding paste TextArea
  (source input).
- `check-spa-entry-graph` — the markdown stack (unified/remark/micromark/mdast + the renderer
  module) joins `DENIED_SOURCE_PATTERNS` with a per-pattern hint: a renderer leak into the entry
  graph fails CI, not just the budget report.
- DOM contract: `data-md-block` declared in `shared`.

## Test matrix

- `markdown-prose.test.tsx`: emphasis/lists/paragraphs (the `*Paradoxides*` case — no asterisks);
  `<script>`/`<img onerror>`/`javascript:` legs neutralized; safe links (rel/target); code stays
  mono; headings clamp; table; html → escaped; unparseable input falls back to escaped text.
- `markdown-prose.dom.test.tsx` (happy-dom): an assistant bubble through `ChatDesk` shows
  italic/list/safe-link with no asterisks/raw HTML; the 320 px card leg — long-URL anchor is
  truncated + `title` + `overflow-wrap` rule pinned against `uiCss()`.
- Per-site component legs: `dossier-surfaces.test.tsx` (FindingCard body, DossierView letter +
  finding body, LetterView paragraphs), `what-changed.test.tsx` (hunk in the reading face),
  `chat-panel.test.tsx` (seam swap — renderer assertions), `inbox.dom.test.tsx` (notice →
  paragraphs + list), `spa-journey-hooks.test.tsx` (converted pane typeset — updated leg),
  `page.test.ts` (proposal card rendered markdown), voices/figures dom legs (sample preview /
  proposal block).
- `check-spa-entry-graph.test.mjs`: markdown sources denied in entry.

## Progress

- 2026-11-07T02:30Z — Phase 0/1 done; implemented + verified.

## Gap table

| # | Requirement | Disposition | Evidence |
|---|---|---|---|
| 1 | REQ-COPY-3 renderer (emphasis/lists/paragraphs; XSS legs; URL wrap) | met | markdown-prose.test.tsx + .dom.test.tsx |
| 2 | REQ-TALK-2 seam + D-R7TALK.1a-2 closure | met | chat-panel.test.tsx seam swap + bubble DOM legs; D-row closed |
| 3 | no monospace prose outside Source mode | met | per-site legs (findings/letter/dossier/what-changed/inbox/page-strip/conversion/figures/voices); exemptions recorded |
| 4 | long URLs wrap/truncate (C8) | met | 320px DOM leg: title+truncate+uiCss overflow-wrap pinned |
| 5 | REQ-KIT-5 entry delta + entry-graph guard | met | entry +17.2 kB (increment +0.0); markdown stack DENIED in entry |
| — | Stage-B walk (4 surfaces at the preview) | met-engineered(D-R7COPY.1b-1) | DEFERRALS row, owner 250 |
| — | universal phase-gate AC | met | see Evidence report |

## Evidence log

- `pnpm turbo build --filter=@rhema/web...` — 13/13; `markdown-prose-*.js` async chunk ~37.6 kB gz (leaf-only).
- `pnpm --filter @rhema/ui typecheck` + `@rhema/web typecheck` — green.
- `pnpm --filter @rhema/ui lint` — green after the no-control-regex fix; web lint 0 errors (1 pre-existing warning).
- vitest: packages/ui 176/176 · apps/web/src sweep 1616/1616.
- `pnpm check:dom-contract` OK (data-md-block declared) · `check:spa-budget` OK (entry +17.2 kB, increment +0.0 vs parent) · `check:spa-env` OK · `check:protocol-markers` OK · `check:spa-entry-graph` OK.

## Evidence report

- AC layers: every in-ticket criterion met at the engineered layer (unit + DOM + per-site component legs); the Stage-B walk is `met-engineered(D-R7COPY.1b-1)` owner 250.
- Deferrals: closed `D-R7TALK.1a-2`; opened `D-R7COPY.1b-1` (Stage-B → 250).
- Entry delta: **+17.2 kB** vs `04a4e98b` — ticket increment **+0.0 kB** (renderer in leaf chunks; GD-KIT3A-BUDGET deficit unchanged).
- $0 — Stage A only; no preview, no production mutation.

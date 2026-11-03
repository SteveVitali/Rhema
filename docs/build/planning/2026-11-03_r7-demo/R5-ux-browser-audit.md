<!-- R5 — prod UX browser audit (2026-11-03, Claude in Chrome, operator account, read-only except one scratch project created+archived). Severity: P0 broken / P1 charter-violating & visible / P2 polish. -->
# Prod UX audit log — rhema.tools — 2026-11-03 (operator account, read-only walk)

Viewport: 1440x757 unless noted. Renderer marker check: window.__m survives ⇒ SPA nav.

## /app (Projects)
- A1 P1: All projects collapsed by default under "▸ QUIET · 5 — 5 Unfiled · 0 with a Voice · Show". A new/returning user lands on a page with NO visible projects; must discover a tiny "Show" link. "QUIET" is internal attention-bucket jargon shown as an ALL-CAPS heading.
- A2 P1: Native unstyled controls on dark theme: "Search", "Apply"(×2) white system buttons; native <select>s (Group by / Protocol / Sort) with system chrome. Clashes with styled "New project" pill.
- A3 P1: Filter UI is a form with explicit Apply buttons (SPA, no reload — OK) but 3 rows of controls (search, group-by, protocol, sort, show archived, show recently deleted, voice chips) for 5 projects. Heavy, admin-console feel; should be instant filters / a single compact toolbar + command palette.
- A4 P2: H1 "Your projects" renders with a full-width focus outline box (programmatic focus on route change shows focus ring) — looks like a bug.
- A5 P1: Top nav: "14,855 cr" pill, Voices + Settings as blue underlined default links, "Sign out" plain grey — inconsistent link styling; no "Projects"/Inbox/Usage nav; wordmark only. No app sidebar (Claude/Codex/Cursor all have a persistent left rail of projects/threads).
- A6 P2: Content column narrow (≈ 850px) centered while header spans full width; big empty canvas; footer just "Rhēma".
- A7 P2: Each row has a filled primary CTA (Review / Revise using your edits) — 5 primary buttons stacked; plus "Unfiled" chip on every row (noise), "Sheet" chips (unclear meaning), status dots without legend (red = last run failed).
- A8 P2: Filter "Apply" puts params in URL (?protocol=&sort=recent) — empty params noise.

## /p/my-first-project (IDE, 1440x757)
- B1 P0: Opening Files panel (⌘1) shifts the document card right and it slides UNDER the fixed right Timeline panel — headline "What This Thread Actually Supplie|" clipped. Panels overlay rather than reflow. (Operator-reported; confirmed.)
- B2 P0: The "Desk" (tabs Chat / Live feed / Findings / Claims + "Close Desk") sits at y≈729–760, entirely BEHIND the status bar (elementFromPoint at its tabs returns the statusbar/Theme button). Chat/Findings/Claims are effectively unreachable/invisible at this viewport.
- B3 P1: Two left rails: a 56px icon rail (⌂ Home, ◎ Inbox, ▤ View, ⚙ Settings — icons unlabeled, no tooltips visible, glyph-font icons) + a second 36px rail with a single Files icon. Cryptic, no project name/breadcrumb anywhere in chrome.
- B4 P1: Project actions rendered as blue underlined serif hyperlinks inside the document card ("Import a draft · Run review · Export · Edit source") — product chrome typeset as document content; no toolbar.
- B5 P1: Frozen-version notice "v8 is frozen — your edits here open a new revision." is styled as a bordered box identical to a text input → reads as an editable field.
- B6 P1: Internal identifiers leak in Timeline: workflow keys "chat_turn", "research_burst", "outline"; artifact kinds as chips "draft_ledger", "consolidation_notes", "commissioning_brief", "sidecar"; "partial (0/1 phases) — committed work kept"; "16 / 5 cr" (spent > estimate shown without explanation).
- B7 P1: Raw unstyled system buttons on dark: Timeline "×" close (white square), "Retry".
- B8 P2: "Draft ▾ / Review ▾ / Revise ▾" chips have dropdown carets but are plain links to /run?workflow=… (false affordance).
- B9 P2: Timeline runs are a long undifferentiated scroll of cards, each with "WHAT IT DELIVERED" caps label; failed runs dominate; approvals as plain text lines "approved by you at 07:13".
- B10 P2: Files panel: dense 11–12px text, lock glyphs on every draft, "System · review run · verification" provenance lines; grouping OUTLINE / DRAFTS / ROUNDS fine but no icons/hover; "×" close.
- B11 P2: Document card has its own border/background inside the canvas (page-in-page) with a large empty gutter; "synced ✓" pill and "Source" chip float without alignment.
- B12 P0: Focus mode (View ▸ Focus) hides ALL chrome incl. the View menu; Esc does nothing; no hover-reveal; mode is persisted server-side so a reload keeps you trapped. Only exit: undiscoverable ⌘⇧F (packages/ide/src/keymap.ts:83).
- B13 P1: Keymap collides with browser-reserved chords: ⌘1/⌘2 (Chrome tab switch — Files/Timeline), ⌘⇧T (reopen tab — triage), ⌘⇧R (hard reload — run-next), ⌘⇧D (bookmark all — draft sheet), ⌘⇧C (devtools inspect — compare), ⌘⇧M (profile), ⌘⇧V (paste plain — revise sheet). Need an app-safe keymap (Cursor/VS Code-web style) + visible cheat sheet.
- B14 P1: Hard load of /p/:project: blank dark screen ~1.1 s (TTFB 233ms, handoff POST 352→531ms THEN /bff/p 533→1122ms serial waterfall); no skeleton/shell chrome painted first.
- B15 P2: Paper theme inconsistent between visits: first SPA nav showed dark paper; reload shows light (cream) paper on dark canvas. H1 project title again gets a visible focus box on load.
- B16 P1: Desk (⌘J) opens as a full-width bottom drawer over the document AND timeline (≈45% height). Chat tab: history shows only status lines ("turn · failed · 16/5 cr · base") not the conversation; native white <textarea> with monospace placeholder + resize grip, raw "Send" button, native radio buttons "Base / Balanced / Frontier"; meter "0/40 credits · 0/5 searches · 0/10 fetches"; "Pinned 0 pins · footprint 0". Nothing like Claude/Codex chat UX.
- B17 P1: Desk Findings tab "No findings yet." and Claims "No claims yet." on a project whose Files list a delivered claim ledger + editor's letter — empty states contradict the record (probably version-scoped to v8 but not explained).
- B18 P2: Clicking into a frozen version places an editable caret in the text (frozen notice says edits open a new revision) — accidental-fork risk with no confirmation.
- A9 P2: Returning to /app re-collapses the QUIET group (disclosure state not remembered) — projects hidden again every visit.

## /p/showcase + dossier
- C1 P1: /p/showcase is server-rendered (renderer=ssr, forced for showcase) — clicking "Open the delivered review" is a FULL DOCUMENT RELOAD into the SPA dossier (window marker lost). Every showcase hop flips renderers.
- C2 P1: Read-only Showcase still shows "Import a draft · Run review · Export · Edit source" + timeline "Review v2 est. 4,095 cr ~28–53 min" + Draft/Review/Revise sheets; dossier shows Apply/Accept/Adapt/Rebut/Defer/Escalate + note field — all of which 409 on use. Read-only should hide/disable with explanation.
- C3 P0 (trust): Run card "WHAT IT DELIVERED" is an LLM-ish auto summary that is factually wrong and leaks internals: "While no delivered artifacts are currently listed in the system… consuming 3860 credits total. The intake phase (120 credits)… second_read (390 credits)… The review determined that zero claims were verified…" — contradicts the 6-claim ledger on the same screen. Appears both in timeline and dossier.
- C4 P1: Dossier's embedded run card says "Created · 0 / 5,850 cr", phases unchecked ○, "0 cr spent" while the Timeline card for the same run says "Completed 3,860 / 5,850 cr" all ✓. State desync.
- C5 P1: Count mismatch: timeline "6 findings" vs dossier rail "5 findings · 2 Major".
- C6 P1: Timeline chips "Letter / 6 findings / 6 claims / Response" are styled as pills but are non-interactive <li> (dead clicks). The only route to the dossier is a small underlined "Open the delivered review" link further down.
- C7 P1: Dossier layout: the letter (the product) is pushed below a welcome banner + full run card + summary; the letter body sits in a ~300px column beside a "CONTENTS" TOC inside a cream card, inside a dark canvas, next to a findings rail + a colored-dot minimap + the Timeline — 5 columns at 1440. Poor measure for the core reading surface.
- C8 P1: Finding card renders markdown literally ("scaled off *Paradoxides*"); evidence URL overflows the card edge; severity "Blocking" in red text + black "discharged" pill + black disposition pills (Accept/Adapt/Rebut/Defer/Escalate) + blue "Apply" + black note input on a white card — mixed visual language; unlabeled color-dot strip (finding minimap) at the rail top.
- C9 P2: Claim ledger: ordinals start at [0]; verdict shown twice ("Contradicted" + red "Contradicted · Tier 1" badge); "Tier 1" chips; otherwise the strongest-designed surface (fetched-source chips with stance + date are good).
- C10 P2: "Duplicate it" is a raw system button inside the welcome banner; h1 "Showcase — a worked example" gets a visible focus box on load.
- C11 P2: Estimates inconsistent across projects/screens: "Review v8 est. 8,535 cr ~1–2 min" vs "Review v2 est. 4,095 cr ~28–53 min".
- C12 P2: Phase names mix internal lowercase keys (intake, craft, verification, discourse, argument, letter) with a title-cased "Second read (independent)".

## Inbox / Settings / Voices / Usage / Billing
- D1 P1 NAV: Four different top-bar variants observed: /app → "14,855 cr · Voices · Settings · Sign out"; /app/inbox → "All projects · Billing"; /app/settings, /voices, /usage → "All projects" only; /p/* → no top bar at all (IDE icon rail). Credits balance, Inbox, Usage, Voices are each reachable from only some pages. Wordmark → "/" (marketing) from app pages.
- D2 P1: Inbox security notice renders as one unbroken wall of text — markdown list items inline (" - voice/persona profiles… - project details…"), no paragraphs; raw "Mark all read" button; "Waiting on your call: 0" jargon; item "Open" links include /inbox and /usage paths.
- D3 P1: Settings: native form layout (inline "Name:" labels, small bare inputs, raw Save / Send confirmation link / Revoke buttons); sub-nav tabs are underlined text links; sessions list shows raw User-Agent strings ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 …", "curl/8.4.0") instead of "Chrome on macOS · this device"; internal copy leaks ("the shared session contract the mobile app uses too").
- D4 P2: Voices: plain list; "New voice" underlined link; meta line "4 samples · paste · substack_export · upload · built Sep 26" leaks provider enum keys (substack_export).
- D5 P1: /usage hard load shows header-less grey skeleton bars for >1 s (no app chrome), then content. Copy bugs: "4,000 of 2,000 included credits left", "4,000 Plan credits credits expire 2026-11-25" (doubled word); Recent runs table lists date/workflow/state/spent but not the PROJECT; workflow keys lowercase raw (review, revise).
- D6 P1: /billing → unstyled "Not found / That page doesn't exist. / Go home" with no chrome (billing actually lives at /app/settings/billing); 404 page has no nav, focus box on h1.
- D7 P2: Every page's h1 shows a full-width focus rectangle on load (route-focus management without :focus-visible discipline).
- D8 P1: Settings › Billing: plan cards OK-ish but each uses a native <select> (Monthly) + raw system button ("Choose Free / Choose Studio / Cancel plan / Join the waitlist"); value framing "≈0.7 essay Reviews on Base · ≈0.3 on Balanced · ≈0.1 on Frontier" for the $20 Writer plan reads as "less than one review per month".

## Run sheet (/p/:project/run)
- E1 P1: Modal "Run the Editor" shows floating-point garbage in the estimate explainer: "624 words × 0.023000000000000003 cr = 14"; two near-duplicate pricing paragraphs; native radio buttons (Quick/Standard/Full board); jargon "Scope approval — a blocking gate opens at launch; proceeds as proposed after 2 hours", "0 open obligations will be checked", "▸ essay · Frontier · Change". Headline "≈ $85.35 · never more than $128.03 · refining…" for a 624-word piece (sticker shock, pricing clarity).
- E2 P1: Behind the run modal the Timeline says "No runs yet — the round log appears here." for a project with ~8 runs (route-scoped timeline desync).

## Responsive (window resized; min window width ≈500 so ≤480 phones untested here)
- F1 P0: 1024w dossier: Timeline panel overlays the dossier (letter + run card clipped at right) and the findings rail disappears entirely.
- F2 P0: 820w (tablet) project page + dossier: Timeline docks as a bottom sheet covering ~70% of the viewport; the document shows ~200px; the findings rail is clipped at the right edge (slivers visible). No adaptive collapse of side panels.
- F3 P1: 1280w dossier: 5 columns compressed — letter column ~240px, findings rail ~230px.
- F4 P2: At ~500w a phone layout appears ("← Home" + title bar): project actions become styled pill BUTTONS here but are underlined LINKS on desktop — inconsistent component per breakpoint; timeline/findings/chat entry points absent on phone layout.

## Versions / Compare / Export / Outline
- G1 P1: Compare (v1→v2 side-by-side) shows paragraph-level tinting only — no word/phrase-level change marks (e.g. "auk, bison, and dodo" → "auk and dodo — and very nearly the bison —" unmarked); two ~380px columns inside the paper card; "7 unchanged passages" collapsed OK.
- G2 P1: "What changed and why" on the Showcase (the flagship trace) reports "No revision answers this pair — every change below is an unlinked edit (the coherence read)" / "0 obligations addressed · 0 rebutted · 1 still open · 0 moves"; changed passages render in a MONOSPACE code font with markdown asterisks visible (*Paradoxides*).
- G3 P1: Sub-routes (/run, /export, /v/…/diff, 404) show the Timeline as "No runs yet — the round log appears here." even when the project has runs.
- G4 P2: Nonexistent version (/v/7/diff/8 when v7 doesn't exist — Files lists v1–v6, v8) renders "Not found / Go home" inside the paper card (no guidance to existing versions). Version numbering has a gap (v7 missing) with no explanation.
- G5 P1: /p/:project/outline leaves the IDE entirely (different chrome: bare top bar with wordmark only, no nav) and says "This project has no outline yet." while the IDE Files panel lists "Outline · 1084 words". Contradiction + chrome switch.
- G6 P1: Export: native radios/select/checkbox + raw "Export" button; the AI-use statement leaks internal workflow and phase keys: "15 review, 2 outline, 1 figure, 3 chat_turn, 3 research_burst, 2 draft … phases on record: intake, craft, verification, discourse, argument, letter, harvest, data, spec, render, caption, answer, plan, voice, classify, spine, gaps, grounding, draft, consolidation, audit, delivery".

## Public pages (logged-out HTML fetched credentials:'omit', rendered in an iframe)
- H1 P1: Signed-in users cannot view /pricing or /showcase — both redirect into the app (/app, /p/showcase/review/…). Pricing must be reachable from the app (upgrade decisions happen while signed in).
- H2 P1: Landing is a long text-only stack of h2 + paragraph sections ("The author's seat", "A register, not a person", "Runs you can watch", "Stay on the frontier", "Show your work", …) — no product imagery or recording (charter §15.1 / REQ-GROWTH-3 called for a looping real-product recording), sans-serif display headline (charter: serif display), underlined link CTAs ("Start with a draft · Upload an outline · Start from scratch").
- H3 P1: Internal jargon in public copy: Changelog "What's live now: the full editor, the public funnel, and the Showcase."; "Have an invitation? Sign in" (invite-era copy after open signup).
- H4 P2: Landing sample dossier is dark-themed sans; the in-app dossier is a cream serif paper — two visual languages for the same artifact. FAQ uses native <details> triangles.
- H5 P2: Pricing teaser "Essay · 5,000 words · 20 claims — Review 2,600 – 11,730 credits" (credits not dollars; 4.5× range) next to a run sheet that quotes "$85.35" for 624 words.

## New project → import → edit (scratch project "UX audit scratch — safe to delete", created by the audit)
- I1 P1: /app/new: yet another header variant (wordmark + tagline + "All projects"); protocol cards contain bare native radio dots; Voice is a native white <select>; no protocol preselected; identical "~28–53 min" on every protocol; internal note "Venue bounds as of 2026-09-01 — not yet re-verified".
- I2 P0: A freshly created empty project shows NO writing surface: a giant grey "Untitled project" placeholder heading ABOVE the real title ("UX audit scratch — safe to delete") — two titles; three entry cards; "Empty"; "Next step: Start in Chat…"; link row; then a full admin form — Approval policy radios, a 12-row "Deadlines by approval" table of native selects (Confirm the cost 168 h, Approve the cut list 2 h, Resume from the partial 720 h…), Standing notes, Voice select + Save, Decisions. The first-run experience is a settings page, not a blank page you can type into (Claude/Cursor: blinking cursor in an empty doc).
- I3 P1: Import: native "Choose File" button; pasted markdown "# Scratch essay" H1 was silently DROPPED by conversion while the preview said "Everything converted cleanly."; preview is monospace; source pane shows the placeholder "(the uploaded source — already converted)"; CTAs "Create and fix later" / "Fix now" are confusing for a clean conversion.
- I4 P1: An imported draft is immediately frozen ("v1 is frozen — your edits here open a new revision."): the very first keystroke forks v2 ("Editing v2 · findings from v1 follow your text"). Users never get a plain editable working draft; versioning semantics leak into basic writing.
- I5 P1: The project page appends "A note for the next revision" textarea + raw "Add note" button + the whole Approvals admin form BELOW the document body, inside the same paper card — the doc never ends cleanly.
- I6 P1: Editor has no formatting toolbar; the selection menu (Ask · Visualize · Fact-check · Review this section · greyed "Line edit isn't available yet" · "Cut to length isn't available yet") opens BELOW the selection, covering the very lines being edited; Esc does not dismiss it; no Bold/Italic/Link/Heading/Quote items (⌘B works silently). Shipping disabled "not available yet" items.
- I7 P1: "Edit source" link does NOT open source mode — it navigates to /v/working (a version page with v1🔒/v2● pills, "Compare with previous", "Restore points ▾", raw "Revise using your edits" button). The actual source toggle is the tiny "Source" chip.
- I8 P1: Source mode (CodeMirror): no soft wrap — prose lines run off the right edge of a ~360px pane and are clipped; monospace prose.
- I9 P2: Estimates: "Review v1 est. 3,221 cr ~28–53 min" for a 43-word draft (≈$32) — cost floor is shocking for small pieces; status bar shows "v1" on the project page while the banner says "Editing v2".
- A10 P1: The project I had just created and edited also landed in the collapsed "QUIET" group. Every project is QUIET unless something is "waiting on your call", so the default list is visually empty for normal use.
- A11 P2: Row "⋯" menu: Archive gave no visible feedback (menu stayed open, row stayed until reload); menu mixes lifecycle verbs with paid actions (Run review / Run fact-check) without cost hints; disabled items shown ("Change voice", "Run revise"). "Show archived" URL encodes as ?archived=%221%22.

## Cross-cutting summary (auditor's judgement)
1. No single app shell: 5+ chrome variants (marketing nav, /app top bar, inbox/settings/voices/usage minimal bars, IDE icon rails, phone title bar, bare 404). Users lose their place; credits/inbox/usage/voices/pricing discoverability depends on the page.
2. Styling coverage is partial: the IDE paper and claim ledger are designed; everything with a form control (filters, settings, billing, chat composer, run sheet, export, approvals, import) falls back to native browser controls on a dark theme.
3. Layout engine for panels is broken: side panels overlay rather than reflow (Files+Timeline occlude the page at 1440; Timeline occludes at 1024; bottom-sheet takeover at 820; Desk hidden behind status bar). Needs a real resizable split-pane layout with breakpoint collapse rules.
4. Internal vocabulary and system state leak into UI: workflow keys (chat_turn, research_burst), artifact kinds (draft_ledger, sidecar), enum keys (substack_export), float noise (0.023000000000000003), raw user agents, "QUIET", "obligations", "gates", "the coherence read", "public funnel", and an auto-generated run summary that contradicts the record.
5. State desync between surfaces: Timeline vs dossier run card, 6 vs 5 findings, Files lists an outline the Outline page denies, Findings/Claims empty while a delivered review exists, sub-routes show "No runs yet".
6. Writing-first promise unmet: new project = admin form; imported drafts frozen on arrival; no formatting toolbar; selection menu occludes text; Focus mode trap; "Edit source" mislabeled; source mode has no wrap.
7. SPA gaps: showcase forced-SSR pages hard-reload on every hop; first paint is blank (~1.1 s serial waterfall); /usage shows chrome-less skeleton; most in-app nav IS SPA (verified by window marker on /app→/p, filters, inbox, new project, import, edit source).
8. Keyboard model collides with browser chords (⌘1/⌘2/⌘⇧T/⌘⇧R/⌘⇧D…) and is undiscoverable (no visible shortcuts, no cheat-sheet affordance seen).
9. Responsive: tablet widths unusable for the IDE; phone layout exists (~500w) but drops timeline/findings/chat entry points.
10. Focus-ring-on-h1 on every route load; markdown rendered literally in finding cards and inbox notices; monospace used for prose in import preview and "what changed".

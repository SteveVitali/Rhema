# Review 12 — Product and UX, adversarial read of the design spec

- **Reviewer stance:** fresh-context; a senior product designer who has shipped consumer AI tools. I read `docs/3_rhema-design-spec.md` (v1.0, 2026-08-27) end to end and `docs/1_founding-prompt.md`. I did not read the eight design documents or the research notes, and I did not fetch anything; every product comparison below is labeled *(from memory)* and should be treated as recollection, not citation.
- **Scope:** product and UX only. Systems sections (§11–13) were read for what they imply about the user's experience (latency, gates, immutability) and are otherwise out of scope.
- **Verdict in one paragraph:** the spec is unusually strong on *mechanism* — the run sheet, the estimate-and-cap contract, dispositions as the response ledger, the boundary attestation, computed staleness — and these are genuinely ahead of what the coding IDEs offer. It is weaker on *the writer's minute-to-minute experience*: the findings surface has no answer for volume, the "accept" verb does not apply a fix, the cheapest gate blocks the most common run, the run sheet exposes nine three-way choices, the trial cannot deliver what the landing page promises, and the MVP carries several features that will each cost a quarter of engineering without moving activation. Fix the eight majors below and this becomes a product I would use for my own long-form work; ship it as written and the first hundred users will tell you the same things in less polite language.

Severity key: **blocker** — ship-stopping or contradicts a promise the product makes; **major** — most users will hit it and it will cost conversion, retention, or trust; **minor** — polish, naming, or a cheap fix.

Counts: **4 blockers · 15 majors · 13 minors** (32 findings), followed by the five ideas to protect.

---

## A. Is the IDE genuinely powerful, or a next-step pipeline with decoration?

**Short answer:** it is genuinely powerful *in its grammar* — any workflow from anywhere, scoped runs, variants, phase-subset runs, gates as first-class objects, and the "what changed and why" diff are all real power (§3.3) and are more than a pipeline. Where it falls short of the frontier coding IDEs is in the *tight loop*: the coding IDEs' magic is that the agent's proposal lands **in the file, now, for free, and you accept it with one key.** Rhema's equivalent (a finding with a suggestion) lands as a ledger row that a later paid run applies. That is the single largest gap, and it is fixable.

### 1. "Accept" on a finding does not change the text — it queues a paid run — **blocker** (§5.7, §10.3)

**Problem.** A finding may carry `suggestion.replacement` and the Margin's *Full* view shows it as a track-change preview. But the disposition verbs write ledger rows; §10.3 is explicit that Accept "records the disposition (the proposed edit is applied at revision time by the Revise run, never immediately)", and nothing in §5.7 says web behaves differently. So a writer who sees 40 `note`-severity copy-edits with concrete replacements cannot fix them without launching a C2–C4 Revise run (2k words: 220–990 credits). Every user who has used Cursor, Google Docs suggestions, or Grammarly will press Accept, see the text not change, and conclude the product is broken or the "accept" is bait for a paid run. *(From memory: Cursor's inline diff — Tab / ⌘Y — and Google Docs' suggestion checkmark both apply immediately; that expectation is now universal.)*

**Recommended change.** Split the verb for findings that carry a suggestion:
- **Apply** (free): writes the replacement into the working head as a `suggestion_accepted` provenance span, forking to v(N+1) `origin=human_revision` if vN is frozen (the spec already permits typing to fork), and records the disposition as `accept · status: done · by: user · moveId: human`. The next Revise run treats it as a made move (§6.3 already has this path via "Revise using your edits").
- **Accept (Drafter applies)**: the current behaviour, for findings that need rewriting rather than replacement.
- For `note`-severity findings with a suggestion, **Apply** is the primary button. Keep the "never two writers" rule: Apply is disabled while a writer-run holds the lock, with the queue explanation.
- Corollary: *Accept all notes* (§5.7 bulk) becomes *Apply all notes* with one consolidated diff preview, not "a per-item diff preview sheet" — see finding 3.

### 2. The MVP chat is not "a fully-fledged ChatGPT or Claude session" — **blocker against the founding prompt** (§7.1, §3.2 rows 7/28, §11.3)

**Problem.** The founding prompt asks for long-context chat "able to do web research natively … essentially … a fully-fledged ChatGPT or Claude session … ChatGPT-level deep research". The spec's Assistant is capped at 40 credits / 5 searches / 10 fetches per turn and must stop and emit a plan card beyond that (REQ-CHAT-10). The plan card's *Run as background research* is "a `discourse-map`-class run card" — but *Map the field* (`discourse-map`) is **v1, not MVP** (§3.2 row 28), and open question §16.3.7 leaves `/research`'s backing unresolved. `research_burst` exists as a `WorkflowKey` (§11.3) but has no row in §6.2 and no phase manifest. Net: at MVP the scratch path has *no* deep-research capability, and the scratch cohort is one of the three entry points on the landing page.

**Recommended change.** Promote a minimal **Research** run (`research_burst`: question → search plan → fetch and note ≤N sources → distilled research note with source cards; no originality verdict, no thesis choice) to MVP with its own §6.2 row, cost class C1–C2, no gate. Make it the target of the plan card's *Run as background research* and of the `/research` verb at MVP; Map the field extends it in v1. Also state explicitly whether attachments (PDF/image drop into chat) are in scope; the founding prompt's "fully-fledged" implies yes and the spec is silent.

### 3. The findings surface has no design for volume — **blocker** (§5.7, §5.1, §13.5)

**Problem.** The one number that matters here is in the spec's own wireframes: "41 findings, 6 major" on a 2k–5k essay, "49 findings" in round 1. A 15k-word Academic Full-board review will produce 120–200. Against that, §5.7 offers: cards beside passages (a 280-px Margin cannot hold four cards next to one paragraph), `J/K` linear traversal, a rationale field **required** for rebut/defer/escalate, and bulk actions "only for safe classes … each through a per-item diff preview sheet". Do the arithmetic: 150 findings × ~25 s each = an hour of undifferentiated clicking before a writer can start revising, and *Defer all minor* opening 60 per-item previews is not a bulk action. §13.5's "dossiers with 200+ findings render the Margin lazily" acknowledges the load but only as a rendering concern. There is no triage progress indicator, no grouping by section, no "start with what matters" mode, and the Desk Findings list is described as a sortable table (and the screen-reader surface) rather than a triage queue. *(From memory: GitHub's PR review at 100+ comments is the cautionary tale — "Viewed" checkboxes and file-level collapsing were added precisely because linear comment lists collapse under volume; Linear's triage inbox is the model that works: one item at a time, keyboard verbs, visible count.)*

**Recommended change.**
- **Triage mode** (`⌘⇧T` or the primary button on a fresh dossier): the Desk Findings list becomes a queue — grouped by section, sorted blocking → major → minor → note within section, with a progress pill "23 / 150 decided" and *Next undecided*. One finding at a time in the Margin with the passage scrolled into view; the five verbs and `J/K` already exist.
- **Margin clustering:** when >1 finding anchors within one paragraph, render one stacked chip ("4 findings · 1 major") that expands on focus. Cards-beside-passages is the display for ≤ ~30 findings; ticks + clusters above that, automatically.
- **Rationale rules:** required for *rebut* and *escalate* only; *defer* defaults to "Not this round" (editable). Accept/adapt never require text.
- **Bulk with one preview:** *Apply all notes*, *Defer all minor*, *Accept all in §III* open **one** consolidated preview (a list with unchecks, plus a single diff for applied suggestions), not per-item sheets. Keep "no blind accept-all".
- **Let the Drafter go first by default:** the spec already has the Revise run propose dispositions and the Approve-triage card show them with escalations pinned. Make that the *advertised* path on large dossiers ("150 findings — let the Drafter propose a triage, then you decide the 6 it can't"), with the card's primary button "Approve proposals" (one click; §6.4 mechanics already support this) and per-row overrides. Pre-triage stays available for people who want to read everything first.
- Severity budget: the Quick notch should cap findings (e.g. ≤40, rest folded into the letter's roadmap) so trial users never meet the 150 case.

### 4. Confirm scope blocks the most common run for up to two hours — **major** (§6.4, §5.5)

**Problem.** Every Review at Standard or Full board pauses after *Reading the piece* (~2 min in) at *Confirm scope*, deadline 2 h, then proceeds. The stated purpose is "to catch a misreading cheaply" and the re-priced estimate. But the spec also guarantees that auto-proceed can never spend beyond the consented cap, so the gate protects nothing financial; and a writer who launches a 25–40-minute review and walks away will return to find it spent 38 minutes at the gate and has 25 minutes to go. That is the "waiting" a 2026 consumer feels most. Gate resume also costs a fresh task launch (p95 ≤ 60 s). *(From memory: Claude Code's plan mode and Cursor's agent both ask *before* starting work and then run; neither pauses two minutes in by default.)*

**Recommended change.** Make *Confirm scope* **non-blocking by default**: the run proceeds immediately, and the piece brief appears as an *informational* card ("Here is what the Editor thinks you're writing — wrong? Stop and correct") for the remainder of the run. It becomes a blocking gate only when (a) the re-priced estimate exceeds the consented cap (already specified), (b) the protocol changed since the last review, or (c) the user's policy is *Wait for me at each*. Keep the editable fields (stage, venue, scope narrowing) on the run sheet, where they already are.

### 5. The run sheet is a control panel, not a launcher — **major** (§5.6)

**Problem.** Before the button, the sheet presents Protocol, Venue, Stage, Rigor (3), Model (3, with multipliers and model-family names), Voice, Guidance, standing notes, the estimate box, then Advanced with five toggles, budget cap, approvals policy (3), variants, and a consent checkbox. §4.3 says Model tier is "Advanced disclosure only"; §5.6 says "Rigor and Model are the first-class levers" — the spec disagrees with itself. Every cost-bearing action in the product (palette verb, Assistant `start_workflow`, selection popover, mobile "run with defaults") lands here, so this density is paid on every run. *(From memory: Cursor's composer exposes one model dropdown and one mode toggle; everything else lives in settings. Devin's session start is a text box and a repo picker.)*

**Recommended change.** Two-tier sheet. **Top:** title line ("Review v2 · 5,180 words · 21 claims"), the Rigor segmented control with its one-line "what's off", the estimate box, and the button. **One collapsed row** summarising everything else — "Academic · LRB · near-final · Balanced · S. J. Sebastian ▸ Change" — that expands to today's full sheet. Model tier moves under that row (resolving the §4.3/§5.6 conflict in favour of §4.3); the Guidance field becomes a "+ Add a note to the Editor" affordance. Keep *Why this estimate?* visible; it is the trust feature.

### 6. Nine three-way toggles — **major** (§4.3, §5.1, §5.5, §5.7, §5.9, §6.4, §6.5)

**Problem.** Rigor (Quick/Standard/Full board) · Model (Base/Balanced/Frontier) · Plan (Free/Writer/Studio…) · Approval policy (Named/Wait/Run to end) · Stage (early/near-final) · Feed density (Summary/Normal/Verbose) · Margin view (Margin/Full/Clean) · Page mode (Write/Source/Read) · Paper theme (follow/light/dark), plus autonomy for Run rounds (checkpoint/manual/auto). REQ-PROD-6's disjoint-vocabulary lint is exactly the right instinct and also the tell: a product that needs a lint to keep its toggles distinguishable has too many. Writers will not learn the difference between Rigor and Model, or between Margin view and Page mode.

**Recommended change.** Collapse: Model tier is a *consequence* of Rigor for everyone outside Advanced (the table in §6.5 already binds them). Feed density becomes two states (Summary / Details) with Verbose as a developer flag. Margin view and Page mode merge into one *View* menu (Write · Read · Focus · Source) where Margin cards are on/off within Write and Read. Stage moves into the protocol defaults and the Confirm-scope card. That leaves Rigor, Approvals, View, Theme — four the user can hold in their head.

### 7. Editing a reviewed draft leaves the findings on the old version — **major** (§5.4, §6.3, §11.3)

**Problem.** Typing on a reviewed vN forks to v(N+1) "without a confirm", and "the Findings UI stays anchored to vN with a banner ('You are editing v3 (your copy). The Editor's findings refer to v2')". So the moment a writer starts fixing things, the findings they are fixing are attached to a document they are no longer looking at. `Finding.projections[]` (§11.3) exists precisely to re-anchor findings onto later drafts, but the UI does not use it by default. The result is the coding-IDE anti-pattern of lint on a stale buffer.

**Recommended change.** After the fork, the Margin shows findings **projected onto v(N+1)** by default (quote re-anchoring is already specified, with confidence), with a small "from Review of v2" label on each card; findings whose anchor is lost move to *Whole piece* with "passage changed — still applies?". The banner becomes "Editing v3 · findings from v2 follow your text". Pair this with finding 1 so Apply works in place.

### 8. Trial cannot deliver "Your first review is included" — **blocker** (§14.3, §15.1, §6.2, §5.6 item 8)

**Problem.** The hero says "No card. Your first review is included." The trial is 600 credits, Base only, 6,000-word cap, Quick default. From §6.2's own price cards (Base), a 5k-word Standard review is ≈1,300 credits and Full board ≈2,520; even Quick at 5k is ≈560, and 8k Quick is ≈1,240. The modal upload is a 4–8k draft. So the first thing most trial users see on their first run is the *insufficient balance* resolution panel ("This run's cap (840) is more than your spendable balance (600)") — on a product whose landing page just said the review was included. R4's rationale ("the activation moment is the full dossier with a second read") is only true for ≤3k-word pieces. Meanwhile "Confirm and run" needs a second click on nearly every trial run because 25 % of a 600-credit balance is 150.

**Recommended change.** Make the trial an **entitlement, not a balance**: "One review of up to 6,000 words, Standard rigor, on us" plus a small credit pocket (≈150) for chat, figures and a Quick Voice. The sheet on a trial account shows *Included* in place of the estimate box (no dollars, no cap arithmetic, no consent second click), and the entitlement's COGS is bounded by the word cap and Base tier (≈$9–13 list at 6k Standard; if that breaks the ≤$4 ceiling in §14.3, cap the entitlement at Quick + full fact-check, and change the hero copy to say exactly that). Whatever the choice, the landing copy and the trial mechanics must be the same sentence. Raise trial projects from 1 to 3 (finding 24).

### 9. Approve-with-deadline: will users hate it? Mostly no — with three fixes — **major** (§6.4, §5.11)

What is right: waiting costs nothing; the countdown pauses while reading; spend gates never auto-proceed; the do-nothing outcome is one sentence on the card. That is better than any coding product's gate. *(From memory: Devin's blocked-on-you state and Claude Code's permission prompts both simply wait; none of them run a clock, which is why a clock will feel novel and slightly hostile at first.)* Where users will hate it:
- **Auto-proceed is invisible.** "Approval auto-proceeded on deadline" is in-app only (§5.11). A user who launched a Draft on Monday evening and forgot will find a $9 draft appeared Tuesday evening with no email. Make auto-proceed **email on by default** with the decision and cost; it is a spend event by another name.
- **The clock is the wrong default when the user is present.** Add a per-session "I'm here" affordance: while the user has the project open in a focused tab, a gate that would auto-proceed shows a **10-minute** timer instead of hours ("proceeding in 9:40 unless you say otherwise"); closing the tab reverts to the long deadline. This is the coding-IDE feel — the agent waits for you briefly, then gets on with it — without risking the walk-away case.
- **Prefill the answer.** §15.3 says approvals are "pre-filled with the recommended answer" for onboarding; make that universal — every card's primary button is the agent's recommendation, so Approve is one click, and *Approve, run autonomously* is a secondary action that stays out of the way.

**"Triage waits by default" is right** and should be protected (see Protect list, idea 1). Its cost is entirely the volume problem in finding 3; fix that and the wait is the feature, not the bug.

### 10. "Revise" is disabled until the letter has been opened — **minor** (§6.3)

Gating a verb on having opened a document is defensible (the letter is the product) but it must be one click, and the palette must not show *Revise* as disabled with a lecture. Make the next-step card "Read the Editor's letter" (primary) with *Revise* directly beneath it, enabled the instant the letter route has been visited — never on scroll depth.

### 11. Command grammar is a CLI for writers — **major** (§7.2, §5.12)

**Problem.** `/review @section:III --tiers 1 --no-second-read` and `/rounds --until minor|rubric>=4 --max 3 --budget 6000` are terminal syntax. The "one parser serves the chat composer, the palette, the selection popover and the context menu" principle is excellent as an *implementation* rule; as a *user* grammar, `--flags` will be typed by developers and nobody else. *(From memory: Notion, Linear, and Slack all use `/verb` with a structured picker after the verb; none expose flags. Cursor's `@` scope pills are the right precedent for scopes.)*

**Recommended change.** Keep the parser. In the UI, `/verb` opens a **structured row** — verb, then a scope pill (`@section`, `@selection`, `@finding`) picked from a menu, then lever *chips* (Quick · No second read · Protocol: Essay) — and free text after. Flags remain accepted for people who type them, and the palette's completion turns them into chips. Never show `--` in any default surface, help card, or empty-state chip.

### 12. Time-to-value inside a run: the waits that remain — **minor** (§5.6 item 1, §12.4, §14.2)

Run button disabled up to 5 s for the claim pre-pass; provisioning p95 45 s; gate resume p95 60 s; trial concurrency 1 (a second run queues behind a 40-minute review). All defensible, but the sheet should show the estimate *immediately* from word count (the pre-pass then refines the number in place — "≈ 560, refining…") rather than blocking the button; and the run card's "starts when a slot frees" should show the ETA range the spec already computes for phases.

---

## B. "Paper in a dark shell" and reading quality

### 13. Default the paper light — **major** (§5.9, §1.3 principle 7)

**Problem.** Principle 7 ("the two textures nest, never blend") is the best visual idea in the spec, but the default paper theme is *follow app*, and the app defaults dark (Q-14). So by default the paper is `#17161a` warm-dark with `#e8e4dc` text — which is a dark editor, not paper in a dark shell. Long-form reading and editing on dark ground for hours is the minority preference among writers; the metaphor's whole point is the light sheet inside the dark studio. *(From memory: iA Writer and Ulysses ship light paper by default even with dark chrome; Substack's reader is light; Bear's dark themes are the ones users switch to, not from.)* The dark landing page (Q-14) is a separate, correct decision.

**Recommended change.** Paper default = **pinned Light** inside the dark shell (`[data-paper="light"]` is already tokenised); *follow app* becomes the option. Keep Auto for the shell. Reconsider the `[data-paper="light"]` inset border-and-shadow so the sheet reads as a sheet.

### 14. Seven regions at 1440 px do not fit — **minor** (§5.1)

Rail 56 + Browser 240 + Page 660 + Margin 280 + Timeline 320 = 1,556 px > 1,440. It works only because the Browser defaults collapsed (36 px → 1,352). State the rule: opening the Browser at <1,600 px collapses the Margin to ticks; the Timeline is the last pane to yield. Also, two persistent right-hand vertical panes (Margin, Timeline) plus a bottom drawer plus a left tree is one more pane than Cursor shows by default; consider Timeline-as-overlay (`⌘2`) below 1,600 px rather than 1,280.

### 15. Reading mode is right; the letter's information design is under-specified — **minor** (§5.7, §5.9)

Literata 17/1.55 on a 68-ch measure, Read mode as the print stylesheet, sticky mini-TOC on the letter, no decorative motion on the paper — this *is* Substack-grade and should be protected. Two gaps: (a) the letter opens "on the Page in Read mode" but the Margin is defined as findings-beside-*draft*; specify what the Margin shows while the letter is on the Page (the referenced finding cards, so a passage link and its finding are visible together). (b) The rubric view has "eight bars, no total" — specify the bar rendering so it cannot be read as a score out of 40 (e.g. dot scales with the cap's reason inline, not stacked bars).

### 16. Naming: "Browser", "Desk", "Rail" — **minor** (§5.1, §5.13)

"Browser" in a product whose Editor *browses the web* will collide the first time a support ticket says "the browser is empty". Call the pane **Project** or **Files**. "Desk" for a bottom drawer that holds Chat, Live feed, Findings and Claims is charming but non-descriptive; "Drawer" or tab-named ("Chat ▾") is clearer. "Rail" is fine as an internal name; users never need it.

### 17. Disposition hotkeys `A D R F E` on a page that is also a text editor — **minor** (§5.7, §5.12)

Single-letter verbs must be scoped to Margin/Findings focus, and the spec should say so; otherwise typing "a" in the Page disposes a finding. Also `⌘⇧A` for Revise (Answer) collides with a common select-related chord in several editors *(from memory)*; consider `⌘⇧V` for reVise and move feed density elsewhere.

---

## C. Voices and staleness for a non-technical writer

### 18. Five update verbs for one intent — **major** (§9.3)

**Problem.** The pill and its eight states are understandable ("Description changed", "2 samples changed", "Untested voice", "Tested — badly off"); the diff-of-inputs popover is excellent. But the actions are **Re-synthesize · Refresh · Run calibration · Rebuild everything · Upgrade to Full Profile**, each mapped to a `persona.refresh scope:` value. A newsletter writer cannot tell Re-synthesize from Refresh, and the popover leaks method ("⚠ over the 25 % rule", "seed hash").

**Recommended change.** One verb, **Update voice (≈ 310 cr · ~12 min)**, that always runs the cheapest sufficient action and states what it will do in one plain sentence ("Reads your 2 new pieces and re-tests the profile"). *Rebuild everything* stays as a secondary link; the scope names live in Advanced and the Runs tab. Remove "25 % rule" and hash language from the popover; say "Your samples grew a lot since Aug 20".

### 19. Leading with "Content: wrong" — **minor** (§9.4)

The calibration report is the honesty artifact and should stay first, but the verdict line ("prose machinery mostly right; content wrong") reads as a failed purchase after a 760-credit build. Reframe as capability: "Trust it for: how your sentences sound, how you shape a piece. Don't trust it for: what you'd argue." Same facts, no verdict word.

### 20. "Untested voice" forever on trial — **minor** (§9.2, §9.3)

Trial and Free get Quick Voice only, whose pill is permanently *Untested voice*. If that pill uses the needs-you amber, every project chip nags. Render `unfalsified` in a neutral tone with the priced *Run calibration* as its action, and never treat it as "stale" in the Inbox or weekly digest.

### 21. Approve sample card jargon — **minor** (§9.4, §6.4)

"reserved hold-out count and dates (not titles)" is measurement-methods language. On the card: "We'll keep 2 pieces aside (Feb 2024, Jul 2025) to test the profile against writing it hasn't seen."

---

## D. Mobile split

### 22. The split is sane; the MVP gap is not — **major** (§10.1, §5.1, §5.11, §17)

The rule ("inputs smaller than a paragraph, or reading") is the right one and the feature table follows it. But the app ships **v1.x**, while approve-with-deadline, triage-on-the-train, and the 15-minute-then-email escalation ship at MVP. At MVP the off-desk channel is email only, and IDE routes below 768 px render a **reader-only layout with an "Open in the Rhema app" banner** for an app that does not exist. So the "approve the $60 run from the train" job (§2.2 #7) is unservable at launch, and the banner advertises vapour.

**Recommended change.** (a) At MVP, the phone-width web layout must support the mobile rule's inputs: Approve / Wait for me / Stop on the gate card, the five dispositions with a note, and chat — it is the same `findings-core` and gate contracts the app will consume, rendered in the responsive web. (b) Approval emails carry signed one-click **Wait for me** and **Open** links (never Approve — matching REQ-MOBILE-10). (c) The app banner appears only once the app exists.

### 23. Biometric step-up above 50 credits on mobile — **minor** (§10.3)

50 credits is $0.50. Step-up on every approval will train users to swipe past it. Raise the default to the web consent threshold (500) and tie it to the same user-settable value.

---

## E. Onboarding, trial, and conversion

### 24. One project on trial — **major** (§14.2)

Trial: "Projects / voices: 1 / 1". The three entry points are the segmentation, and a user who dropped a draft and then wants to try *Start from scratch* (or has two pieces) is blocked on day one. Allow **3** projects on trial; the cost is bounded by the credit/entitlement, not by project count.

### 25. Hero drop-zone vs Showcase-first — **minor** (§15.3, §2.4, §15.1)

§15.3 says the first screen after signup is the Showcase timeline; §15.1 says a hero-dropped file routes to a new project with the draft ingested. State precedence: dropped file wins, and the Showcase is the second row in the project list with its "Worked example" label — do not make a user who just dropped their manuscript read someone else's essay first.

### 26. The first paywall moment is an arithmetic lesson — **major** (§5.6, §14.4, §15.3)

Even after finding 8, the *second* run is where conversion happens, and today's sheet shows "Estimate ≈ 560 credits ($5.60) · Cap 840 ($8.40) · Balance 1,430 → 590 after cap". Three numbers and a subtraction. Show one number by default — **"≈ $5.60 · never more than $8.40"** — with balance-after in the tooltip the spec already has; credits-first display is for the usage dashboard, dollars-first for the decision moment (§14.1 already says dollars-first on marketing pages; extend it to the button). The upgrade sheet reached from an insufficient balance should open with the cheapest fitting change pre-selected (the spec says this) *and* show the plan that would have covered it in one line, not a plan table.

### 27. "Confirm and run" second click on 25 % of balance — **minor** (§5.6 item 5)

For balances under ~2,000 credits nearly every run trips the 25 % rule. Apply the percentage rule only above an absolute floor (e.g. > 200 credits) so small accounts do not double-click everything.

---

## F. Over-engineered for MVP; under-specified against the founding prompt

### 28. MVP carries features that do not move activation — **major** (§3.2, §17)

Each of these is well designed and each is a quarter of engineering; none is on the drop → review → finding → letter → revise path that the metrics in §3.5 measure. Move to v1.x: **parallel variants and the compare view** (row 23; also open question 17 is unresolved); **Figure** as a workflow with Vega-Lite + Mermaid + provenance + fact-check propagation (row 40 — keep chat-produced GFM tables at MVP); **Cut to length** (row 26; the over-cap chip can offer it later); **Source mode** (CodeMirror) and **span-level provenance marks with the Authorship overlay** (row 39; the AI-use statement is v1 anyway); **seat profile pages** (§6.6 item 4 — the trust chip on the dossier carries the message); **queued guidance with section-boundary delivery and batched inline comments** (§6.5 — open question 4 says the mechanism is unverified; ship Stop + a single "note for the next phase" at MVP); **LaTeX export** (docx + pdf cover the academic path at launch). Keep Outline and Fact-check: Outline is the scratch hand-off and Fact-check is the cheapest legible trial product. Four protocols is a QA stretch the risk register already flags; if one must go, it is Memo (its "no web fetch of user data" rule is a distinct verification path).

### 29. Under-specified things the founding prompt clearly wanted — **major** (§5.2, §7.1, §7.3, §5.4)

- **"Create, re-organize" projects:** there is grouping by attention and by voice, archive, duplicate — but no folders, tags, or drag-to-reorder. Specify tags (MVP-cheap) or state the deferral.
- **The outline editor:** the outline is the one agent-produced *editable* artifact and "the outline editor is web-only", but nothing says what it is — the Page in Write mode over `outline/1` front-matter? A structured spine/section editor like the Approve-plan card? Given that Draft reads the spine, the structured editor is the right answer and needs a wireframe.
- **Chat attachments and images:** silent (finding 2).
- **Upload conversion preview:** "shows a conversion preview with warnings before Create" (§5.3) — for a 40-page .docx with footnotes, tables and citations this preview is the make-or-break moment of the Upload-a-draft path and has no spec beyond one sentence. Specify: side-by-side, footnote/citation/figure counts, "N spans could not be converted", and *Fix later* vs *Fix now*.
- **Persona ↔ project change** was answered thoroughly (soft lock, fork, adopt) — that one is good.

### 30. The Inbox has three doors — **minor** (§5.2, §5.11, §6.8)

Needs-you group on `/app`, the Inbox page, the Timeline cards, plus *Decisions* from response letters and stall escalations from Run rounds. They share a row component, which is correct, but the Rail badge counts "approvals waiting + unread finished runs" and the Inbox also lists stale voices and decisions. Define one ordering and one badge rule (approvals and decisions count; finished runs and stale voices do not) so the badge means "something is blocked on you".

### 31. Streaming provisional findings invite premature dispositions — **minor** (§5.5, §5.7)

Findings stream into the Margin as dashed cards during a review and are finalised at delivery, and the second-read reconciliation may later mark some *rejected*. State that provisional cards have no disposition controls, and that a finding rejected in reconciliation after a user pre-triaged it surfaces the conflict rather than silently dropping the disposition.

### 32. "Fetched ✓" on every URL is the right chip; explain it once — **minor** (§5.7, §8.4)

The transparency floor is a differentiator, but a writer seeing "fetched ✓" on every link will wonder what the alternative was. The first-run inline explainer (the spec's once-per-surface coaching) should say it: "Every link here was actually opened and read by the Editor during this run — never quoted from memory."

---

## G. The five best ideas — protect these

1. **Dispositions write the response ledger, and the ledger explains the diff (§5.7, §5.8).** accept / adapt / rebut / defer / escalate replacing "resolve", the frozen ledger at delivery, and *What changed and why* joining every hunk of vN→vN+1 to the move and the finding that caused it. No coding IDE closes this loop; a PR's "resolved" conversation has no link to the commit that resolved it. It is also why *Approve triage waits* is right: the ledger is the author's decisions, and the product's integrity claim ("You decide. The agent revises. The letter records why.") depends on a human having actually decided. Everything in finding 3 is in service of keeping this idea alive at volume.

2. **The estimate-and-cap contract as the only paywall (§5.6, §14.4).** Firm estimate, guaranteed 1.5× cap as a database constraint, hold/debit/release visible in plain words, failed phases refunded, one `<Paywall>` mount, and a run report whose *flags* explain cost in sentences ("Fact-check was 62 % of this run: 71 claims verified"). This is a stronger money promise than any coding product makes *(from memory: Cursor and Devin both bill after the fact against opaque request/ACU units)*, and it is the reason a writer will let an agent spend $40. Do not let anyone "simplify" it into post-hoc metering.

3. **Integrity as a feature: input-scoped second read, cited ⇒ fetched, boundary attestation as a chip (§5.7, §8.4, §12.6).** The second reader that receives only the draft; a delivery that *fails validation* if a cited URL was never fetched; "The Editor never saw the Drafter's notes — verified by access log · 52 URLs fetched" on every dossier; and the reconciliation view that shows what the Editor *rejected*. This is the positioning ("independent second read, not a panel of personas") made mechanically true, and it is un-copyable by a prompt-only competitor. Protect the *visible* half especially — the chips and the rejected-findings group — because engineering will be tempted to keep the enforcement and drop the display.

4. **Staleness as a computed state with a diff-of-inputs and a priced partial refresh (§9.3).** No stored "stale" flag; eight states from four facts; a popover that says exactly what changed and what catching up costs; refresh that reads only the changed pieces because corpus notes are content-addressed; and — crucially — *never blocking*. This is the correct answer to the founding prompt's hardest UX question, and it generalises (the same pattern should govern "protocol changed since v2 was reviewed" and "drafting note describes v1 as delivered"). Finding 18 asks only that its five verbs become one; the model underneath is right.

5. **The $0 Showcase and inference-free activation (§2.4, §15.3), sitting on the pure project-state function (§6.3).** A worked example with a real dossier, opened on its timeline with the first finding selected, so the killer UI is seen inside 60 seconds at zero COGS — and every next-step card, palette verb, notification and project-list pill derived from one `state(project)` function rather than stored opinion. The first is the cheapest activation design in the spec; the second is why the product will never show two contradictory "next steps". Both are easy to erode quietly (a "quick tour" modal; a stored `status` column); the spec forbids both, and should keep forbidding them.

*Honourable mentions:* "Save is not a verb" with the four-layer autosave and restore points that never touch correspondence (§5.10); runs produce versions and never edit the user's document (§6.1); the attention-first project list with a model-written status line (§5.2); the Quick-notch profile shared by trial and paid tiers so trial is a smaller product, not a different one (§6.5).

---

## H. Summary table

| # | Severity | Section | Finding |
|---|---|---|---|
| 1 | blocker | §5.7, §10.3 | Accept does not apply a suggestion; add free *Apply* |
| 2 | blocker | §7.1, §3.2 | No deep research at MVP; promote `research_burst` |
| 3 | blocker | §5.7 | No design for 150 findings; triage mode, clustering, one-preview bulk |
| 4 | major | §6.4 | Confirm scope blocks every Review for up to 2 h; make it informational |
| 5 | major | §5.6 | Run sheet density; two-tier sheet; Model under the fold |
| 6 | major | §4.3 et al. | Nine three-way toggles; collapse to four |
| 7 | major | §5.4, §6.3 | Findings stay on vN after fork; project onto v(N+1) by default |
| 8 | blocker | §14.3, §15.1 | Trial cannot honour "first review included"; entitlement, not balance |
| 9 | major | §6.4, §5.11 | Deadlines: email auto-proceed; "I'm here" short timer; prefilled answer |
| 10 | minor | §6.3 | Revise gated on opening the letter; keep it one click |
| 11 | major | §7.2 | `--flags` grammar; chips and pills in UI, parser underneath |
| 12 | minor | §5.6, §12.4 | Estimate should not block the button; show queue ETA |
| 13 | major | §5.9 | Paper defaults dark; pin light paper in the dark shell |
| 14 | minor | §5.1 | Pane widths overflow at 1440 with Browser open |
| 15 | minor | §5.7 | Margin behaviour with the letter on the Page; rubric bars not a score |
| 16 | minor | §5.1, §5.13 | Rename "Browser"; "Desk" is non-descriptive |
| 17 | minor | §5.7, §5.12 | Scope single-letter hotkeys; `⌘⇧A` collision |
| 18 | major | §9.3 | Five refresh verbs; one *Update voice* |
| 19 | minor | §9.4 | "Content: wrong" framing |
| 20 | minor | §9.2 | "Untested voice" must not nag |
| 21 | minor | §9.4 | Hold-out jargon on Approve sample |
| 22 | major | §10.1, §5.1 | Mobile app is v1.x but MVP flows need a phone; responsive web must approve/dispose; email actions |
| 23 | minor | §10.3 | Biometric step-up at 50 credits is too low |
| 24 | major | §14.2 | One trial project; allow three |
| 25 | minor | §15.3 | Dropped file vs Showcase precedence |
| 26 | major | §5.6, §14.4 | Dollars-first single number at the decision moment |
| 27 | minor | §5.6 | 25 % consent rule needs an absolute floor |
| 28 | major | §3.2, §17 | MVP cuts: variants, Figure workflow, Cut, Source mode, provenance overlay, seat pages, steering, LaTeX |
| 29 | major | §5.2, §7.3, §5.3 | Under-specified: tags/re-organize, outline editor, chat attachments, conversion preview |
| 30 | minor | §5.11 | Three inbox doors; one badge rule |
| 31 | minor | §5.5, §5.7 | Provisional findings and reconciliation conflicts |
| 32 | minor | §5.7 | Explain "fetched ✓" once |

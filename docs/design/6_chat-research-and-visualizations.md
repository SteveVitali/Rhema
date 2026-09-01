# Design 6 — The chat/research session, commands anywhere, gates and steering, and AI-generated visualizations

- Scope: ledger rows **D9 + G9** (in-IDE chat/research and its relationship to workflows and project memory), **C12** (visualizations end-to-end), **C4** (what makes the experience powerful beyond next-step-only), **C7** (human-gate policy and guidance capture), **K5** (steering mid-run) · Date: 2026-08-27
- Evidence base read in full: research notes 2 (source-system extraction), 4 (coding-agent UX part 2), 5 (writing products, deep-research chat), 7 (execution harness), 9 (ingestion/export/visualization); plus 10 §5 (credits, estimates, caps), 11 §3–4 (run state machine, gates table, event catalogue), 12 §2 (v1 skill specs), the ledger §Q and change log, and `~/agent-discourse/conventions/*.md`.
- Pane vocabulary: this document uses the D3 names — **Artifact browser** (left), **Paper** (the editor, centre), **Companion pane** (right; tabs *Chat* / *Findings* / *Run*), **Timeline rail**, **Command palette** (`⌘K`), **Inbox**. The IDE shell (design/2) owns their layout and may rename them; nothing here depends on their geometry.
- Requirement families: `REQ-CHAT-n` (chat, threads, tools, outline promotion, commands/palette), `REQ-GATE-n` (gates, guidance capture, steering), `REQ-VIZ-n` (visualizations).

## Summary of decisions (≤300 words)

1. **The chat is a fourth agent-type, "assistant", on the same harness as the workflows** (Claude Agent SDK, note 7 §7), not a lighter loop. It owns `agents/assistant/`, reads the shared record and — because the user *is* the author (note 2 §3) — the author's notebook read-only; it **never** reads `agents/editor/*`. It reaches the pipeline through exactly two typed conduits: the **outline artifact** and **guidance**. No `ask_editor_role` tool exists; an editor's opinion is always a run.
2. **"Generate official outline" is a run** (`outline-from-research`, C1–C2, note 12 §2.3) ending in a mandatory approval card; it writes `agents/author/outline/<slug>.md` with a provenance header and moves the project S0→S1, which is what unlocks *Draft from outline*.
3. **One command grammar everywhere**: `/verb [@scope] [--levers]`, identical in the chat composer, the palette, the selection popover, and artifact menus. Every invocation lands on the same **run sheet** (estimate, guaranteed 1.5× cap, levers). Scoped variants (`/review @section:III`, `/factcheck`, `/cut --target 900`) and **parallel variants** (`--variants`) are first-class because Review is keyed by (version, run).
4. **Gates are approve-with-deadline cards at three named points** — structure plan, review scope, triage — parked at zero compute. The user edits *decisions* (structured fields, dispositions); the agent keeps authorship of *prose*. Every edit is captured as a `Guidance` record that feeds the skills' existing `guidance` input.
5. **Steering = five primitives at section/phase granularity**: pause, stop-keep-partials, queued guidance (delivered at the next section or phase boundary, editable until then), batched inline comments, and side questions. Nothing steers by editing private memory.
6. **Figures are specs + data + provenance**, rendered to SVG in TypeScript (Vega-Lite / beautiful-mermaid / GFM tables), previewed in a figure card, inserted as an accept/reject proposal with caption, alt text, and source line, and **fact-checked as Tier-1 claims** by review. A figure without provenance renders with an `[unverified data]` badge.
7. **Cost is visible per chat turn** in cent-credits; deep research from chat is a background run card, never an uncapped chat turn.

---

## 1. The chat/research session (D9, G9)

### 1.1 What the session is for, and what it is not

The founding prompt asks for "a fully-fledged ChatGPT or Claude session from the IDE itself" whose output, at some point, becomes "an official 'outline' doc". Research note 5 §5 establishes the bar every deep-research product has converged on: plan-before-run, progress as a step feed of sources, a report with inline citations, and **export into a durable document**. Note 4 §5 (matrix row "Agent panel / chat") and §4.6 (Amp's Puck, "Later — Rhema's in-IDE chat already is this") settle the role: the chat is the *overlay orchestrator* for the project, the place where the writer thinks aloud, researches, asks about artifacts, and launches work.

Two things it is deliberately **not**:

- **Not the correspondence.** The correspondence record (`correspondence/*`) is the formal, immutable exchange between author-agent, editor-agent, and human (T1; note 2 §2.1). Chat is a working conversation: ephemeral by default, never cited by a skill, never part of any dossier. Run cards appear inside chat threads, but the runs themselves live on the Timeline rail. This keeps T3's guarantee legible: "the editor never saw the author's rationalizations" must include *the author's chat*.
- **Not a place where the draft gets written.** Whole-draft generation is a run (`draft-from-outline`), for the reasons note 2 §1.1 records ("a piece written by five contexts has five voices"; drafting is one long single context, rule B18). Chat may produce an outline, a figure, a paragraph-sized suggestion, a research note — never `drafts/vN.md`.

*Alternatives rejected.* (a) A separate lightweight chat loop on the Vercel AI SDK (note 7 §3.6): correct for tool-less turns, but it would give Rhema two provenance models, two cost meters, and two fetch disciplines; note 7 §7 recommends the same harness with a distinct agent-type, and that recommendation is adopted. (b) Roles-as-personas-in-one-chat (D5 option b): rejected because the editor must not share a context with the author's deliberations — there is no way to have "the editor" answer in the author's chat without contaminating one side.

### 1.2 The `assistant` agent-type

The assistant is a fourth role alongside author, editor, and bootstrap (F2's generalized agent-type model). Its configuration, in the shape F2 will formalize:

```ts
type AgentType = 'author' | 'editor' | 'bootstrap' | 'assistant';

const assistant: AgentTypeConfig = {
  id: 'assistant',
  seat: 'author-side',                    // sits on the author's side of the wall (note 2 §3)
  read: [
    'manifest', 'drafts/**', 'correspondence/**', 'assets/**',   // shared record
    'agents/author/outline/**', 'agents/author/research/index.md',
    'agents/author/research/sources/*.md', 'agents/author/voice-charter.md',
    'agents/author/ledgers/*.md',                                // the user's own notebook, read-only
    'agents/assistant/**',
    'persona/<linked>/profile/{index,exemplars,positions,continuity,audience-and-venue}.md',
  ],
  write: ['agents/assistant/**'],         // and nothing else, ever
  deny:  ['agents/editor/**', 'persona/*/profile/corpus/HOLDOUT-*'],
  tools: ['search', 'fetch', 'read_artifact', 'start_workflow', 'propose_outline',
          'visualize', 'elicit', 'measure'],
  model: 'per-thread tier (default Standard)',
  budget: { perTurnCredits: 40, perTurnSearches: 5, perTurnFetches: 10 },  // above these → plan card (§1.5)
};
```

Why the assistant may read the author's notebook but the author-agent never reads the assistant's: note 2 §3 shows every design statement in the source system places the human in the author's chair, so `agents/author/*` is "the user's own assistant's notebook" and is inspectable in the UI anyway (E3). Letting the chat *read* it costs no integrity. Letting the author-agent read *chat* would — a drafting run that inherits an hour of brainstorming inherits its half-decisions and its unfetched claims, which is precisely the failure the outline-from-research skill exists to prevent (note 12 §2.3: outlines "produced with a research assistant … [are] exactly where fabricated and misattributed references live"). Hence the two-conduit rule below.

**REQ-CHAT-1.** The platform defines an `assistant` agent-type with the read/write/deny sets above, enforced by the same role-filtered mounts and `PreToolUse` hook as the other roles (note 11 §5, F4). Acceptance: an assistant session attempting `Read agents/editor/research/index.md` is denied and the denial appears in the run's boundary audit; `boundary.attested` for chat sessions reports `violations: 0`.

**REQ-CHAT-2 (two-conduit rule).** Nothing in `agents/assistant/**` is ever mounted into an author or editor run. Chat content reaches the pipeline only as (a) the outline artifact written by an `outline-from-research` run in the author seat, or (b) a `Guidance` record (§3.4) the user explicitly promotes. Acceptance: the mount manifest for `draft-from-outline` and `respond-to-review` runs contains no `agents/assistant` path.

**REQ-CHAT-3.** The assistant never writes to `drafts/`, `correspondence/`, `agents/author/**`, or persona profiles. Anything it produces that should become durable is produced *by a run it starts* (`propose_outline` → `outline-from-research`; `visualize` → `visualize` run), which writes in the author seat.

### 1.3 Namespace and threads

```
<project>/agents/assistant/
  threads/<thread-id>/
    session/                # SDK transcript chain, mirrored via SessionStore to S3 (note 7 §3.1)
    brief.md                # regenerated at every compaction (§1.6); ≤ 600 words
    pins.json               # pinned artifact ids + 300-token summaries (§1.6)
  research/
    index.md                # one line per note — same format as the other roles
    sources/<slug>.md       # distilled source notes from chat research (never raw pages)
  figures/<figure-id>/      # working figures not yet inserted (§5.6); promoted to assets/ on insert
```

A project has one default thread ("Project chat") and any number of named threads (Claude Code sessions / Amp threads pattern, note 4 §3.2, §4.3). Threads are per project; there is no cross-project chat in v1 (persona-level chat is a J-row question for later). Threads are private to the project's owner; with C13 roles, *editor*-role collaborators see threads they started, never others' (Amp's shared-by-default was rejected in note 4 §4.6 #10).

**REQ-CHAT-4.** Threads: create, rename, archive, delete; the default thread cannot be deleted. Deleting a thread deletes its session transcript and brief; source notes in `agents/assistant/research/` survive (they are the persisted fruit, per project-memory §source notes). Acceptance: after deletion, `read_artifact` on the thread returns not-found and the research index is unchanged.

**REQ-CHAT-5.** The assistant's research notes are written in the convention's source-note format and are surfaced in the Artifact browser under *Research → Chat sources*, visible and read-only (E6 transparency floor: "sources actually fetched with URLs").

### 1.4 The toolset

Each tool below is an in-process MCP tool exposed to the assistant session (note 7 §7). The list resolves the assignment's `ask_editor_role?` question in the negative.

| Tool | What it does | Visible effect in the UI | Cost/guard |
|---|---|---|---|
| `search(query, {domains?})` | Anthropic web search (note 7 §4) | `search.performed` row in the turn's activity strip: the query and result count | counts against the per-turn search budget |
| `fetch(url)` | Web fetch → page text/PDF; writes a distilled source note if the assistant judges the page worth keeping | `source.read` source card (title, URL, accessed) — clickable | counts against per-turn fetch budget; URL allow/deny (hold-outs, paywall policy — note 2 B9/B10) |
| `read_artifact(ref)` | Reads any artifact in the assistant's read set by typed reference (`@v3`, `@review:v2`, `@outline`, `@finding:v2/17`, `@claim:v2/41`, `@figure:fig_…`) | The referenced artifact chip appears in the turn header; the Paper scrolls to the anchor when the chip is clicked | free beyond tokens; large artifacts are read by section on request (§1.6) |
| `start_workflow(workflow, scope, levers)` | Prepares a run — **never launches it**; returns a run sheet the user must confirm (§2.3) | Run-sheet card inline in the thread; on confirm, a run card that mirrors the Timeline rail | consent thresholds from note 10 §5.5 apply exactly as from the palette |
| `propose_outline(thread, {thesis?, venue?, length?})` | Prepares an `outline-from-research` run over the current thread | Outline run sheet (§1.7) | C1–C2 |
| `visualize(request, {selection?, data?})` | Prepares a `visualize` run (§5) | Figure card | C1 |
| `elicit(questions[])` | Renders a short structured interview (the `elicit-from-author` skill, note 12 §2.4) whose answers become `Guidance` | Interview card with one question per row; answers saved as guidance records | C0 |
| `measure(text)` | Deterministic prose metrics from the TS measurement service (note 2 §6 item 9) — word counts, sentence stats, reading time, hazard-word scan | Inline metric chips | free |

**Why no `ask_editor_role`.** The editor's value is *independence* (note 2 §1.5: three independence gates share one mechanism — fresh context, enumerated inputs). A chat-invoked "quick editor opinion" would either (a) run in the author-side chat context, which is not independent, or (b) be a fresh editor-seat context — which is a run. Option (b) already exists as `fact-check-only` (C2–C3), `steelman` (editor seat), and a scoped `/review @section` (§2.2). The chat therefore offers "Ask the editor" as a *button that prepares the appropriate run*, and the run's deliverable comes back as a card. Alternative rejected: a stateless "second opinion" call with only the passage as input — it would be a fourth pseudo-review with no dossier, no claim ledger, and no place in the correspondence; cheap, but it teaches users that a two-second answer is what an editorial opinion costs.

**REQ-CHAT-6.** `start_workflow`, `propose_outline`, and `visualize` are *preparatory*: they return a run sheet and cannot bypass the consent gate. Acceptance: no run row is created by a tool call; run rows are created only by the user's confirm action (or, for runs under the user's "don't ask under N credits" threshold, by the confirm action being auto-applied and logged as such).

**REQ-CHAT-7.** Every `fetch` in chat is subject to the same URL policy service as workflow runs (note 2 B9–B10; note 7 G15 proposal): persona hold-outs are denied per project, robots/paywall policy applies, and every fetched URL is logged so the E6 attestation covers chat.

**REQ-CHAT-8.** `read_artifact` references are typed and resolvable from the Command palette's `@` picker (§2.1); an unresolvable reference is an error shown to the user, never silently substituted by model memory.

### 1.5 Turn anatomy, research bursts, and cost display

A turn in the Chat tab:

```
┌ Chat · Project chat ─────────────────────────────────────── Frontier · Fable 5 ▾ ┐
│                                                                                  │
│  You                                                                   14:02     │
│  Is the "nothing to hide" argument still the standard framing in privacy law,    │
│  or has the harms-based account displaced it? @outline                           │
│                                                                                  │
│  Assistant                                                       12 cr · 14:03   │
│  ▸ Read @outline (§2, §4)   ▸ 3 searches   ▸ 4 sources read                      │
│  ┌ Sources ───────────────────────────────────────────────────────────────────┐  │
│  │ Solove, "I've Got Nothing to Hide" (2007) · ssrn.com · read 14:03          │  │
│  │ Citron & Solove, "Privacy Harms" (2022) · bu.edu · read 14:03              │  │
│  │ … 2 more                                                                   │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│  Both are live. The harms-based account has displaced it as the *doctrinal*      │
│  framing in the post-2019 literature, but "nothing to hide" survives as the     │
│  *public* framing that the doctrinal work responds to. Your §2 treats them as   │
│  sequential; the sources suggest they are concurrent. [1][2]                    │
│                                                                                  │
│  ↳ Promote to outline   ↳ Save as guidance   ↳ Ask the editor…   ↳ Pin           │
│                                                                                  │
├──────────────────────────────────────────────────────────────────────────────────┤
│  ⌘K /  @                                                    Thread: 148 cr today │
│  Ask, research, or type / for a command…                                        │
└──────────────────────────────────────────────────────────────────────────────────┘
```

The **activity strip** (`▸ Read … ▸ 3 searches ▸ 4 sources read`) is the transcript's collapsed-tool-call row (note 4 §1 run grammar), driven by the K2 event catalogue (note 11 §4.2: `search.performed`, `source.read`, `source.rejected`) — never by model free-text. Expanding it shows queries and source cards; it never shows prompts or raw page text.

**Cost per message.** Each assistant turn shows its credits (`12 cr`) in tabular figures at the turn header; hover shows tokens in/out/cache-read, searches, and the tier. The number comes from the SDK per-turn `result` usage × the 1.4 platform rate (note 10 §5.1), rounded up to the credit; note 7 §8.3 warns SDK figures are estimates, so the ledger of record reconciles nightly and the UI labels the per-turn figure as a meter, not an invoice. The composer footer shows the thread's spend for the day and, on hover, the month's balance.

**Research bursts and the plan card.** A chat turn is synchronous and, unlike a run, has no pre-run estimate. Note 5 §5.2 makes plan-before-run the convention for expensive research. Rhema's rule: the assistant runs freely within a per-turn budget (40 credits, 5 searches, 10 fetches — REQ-CHAT-1 defaults, user-adjustable); when the assistant judges a request needs more, it must stop and emit a **plan card** rather than spend:

```
┌ Research plan ───────────────────────────────────────────────────────┐
│ Map the post-2019 privacy-harms literature and its critics          │
│ 1. Survey law-review treatments of Citron & Solove (≈ 8 searches)   │
│ 2. Read the four most-cited responses (≈ 6 fetches, 2 PDFs)         │
│ 3. Summarize positions with quotes ≤ 40 words and URLs              │
│ Estimate ≈ 95 credits · cap 145 · ~4 min                            │
│ [ Run as background research ]  [ Do the first step only ]  [ Edit ]│
└──────────────────────────────────────────────────────────────────────┘
```

"Run as background research" launches a `discourse-map`-class run (`/research`, §2.1) backed by the SDK's `/deep-research` workflow where appropriate — a run card, because that workflow "cannot take mid-run input" (note 7 implication 10). "Do the first step only" keeps it a chat turn inside budget.

**REQ-CHAT-9.** Every assistant turn displays its credit cost; the thread displays daily spend; the composer exposes the tier picker. Acceptance: the sum of turn costs in a thread equals the thread's `usage_records` sum within rounding.

**REQ-CHAT-10.** A chat turn may not exceed the per-turn budget without a plan card; the plan card shows an estimate and a cap; accepting it creates a run (subject to the note 10 §5.5 consent thresholds). Acceptance: no single chat turn's `usage_records` exceed the per-turn budget × 1.5.

**REQ-CHAT-11.** Source cards for every fetched page appear in the turn; clicking one opens the assistant's source note if written, else the URL. No raw page text is stored (project-memory "never persist" rule).

### 1.6 Long-session context management

A project on disk is ≈ 350k tokens of durable text (note 2 §2.2 counts), a thread can run for days, and the SDK auto-compacts (note 7 §3.1). Three mechanisms keep long sessions coherent without pretending the context is infinite:

1. **Compaction brief.** A `PreCompact` hook (note 7 §3.1 hooks) writes `brief.md`: the thread's standing question, decisions the user has made (with the turn they were made in), open threads, sources read (slugs), and pinned artifact ids — ≤ 600 words, template-generated from structured turn metadata plus a bounded model summary. `PostCompact` re-injects it. The user can open the brief ("What the assistant remembers") and correct it; corrections are guidance-style edits, appended with actor provenance.
2. **Pinned artifacts.** The user (or the assistant, on request) pins an artifact — the outline, a review letter, a section of a draft, a figure. Pinned items keep a 300-token summary permanently in context (`pins.json`) and are re-read in full via `read_artifact` only when the turn needs them; the turn header shows which pins were actually read. Pins survive compaction. Precedent: Claude Code's `@`-referenced files and Windsurf's checkpoint mentions (note 3 §2, B1.5 row), adapted so that a 14k-word draft is never re-sent on every turn (note 10 §4: cost is ≈ 75% cache-read of re-sent context — pins are the single biggest lever on chat cost).
3. **Section-scoped reads.** `read_artifact` for drafts and dossiers is section-addressed by default (`@v3 §II`); whole-document reads require an explicit `@v3 --all` and show their token cost on the chip.

**REQ-CHAT-12.** Compaction produces a user-visible brief; the user can view and correct it; corrections are recorded with provenance. Acceptance: after forced compaction, the assistant answers "what did I decide about the venue?" from the brief.

**REQ-CHAT-13.** Pins: at most 12 per thread; each shows its summary-token footprint; unpinning is immediate. Acceptance: a pinned outline is referenced correctly 50 turns later without an explicit `@outline`.

**REQ-CHAT-14.** The tier picker (`Standard · Sonnet 5 / Pro · Opus 5 / Frontier · Fable 5`, note 10 §5.4 naming; Q-4 curated choice; note 4 impl. 4 "notches, not model names" — Rhema shows both: notch first, model in small type) is per thread; changing it mid-thread applies to subsequent turns and is logged in the activity strip. Research tools stay on Anthropic-hosted models in v1 (note 7 §8.2 capability gating); if a non-Anthropic model is later offered under a notch, the picker greys the research tools for that notch and says why.

### 1.7 "Generate official outline"

This is the founding prompt's explicit hand-off and note 5 §5's central recommendation ("'Promote to outline' is a run, not an export"). The flow:

1. **Trigger.** Any of: the `↳ Promote to outline` action on a turn (scopes the harvest to that turn and its ancestors), *Promote thread* in the thread menu, `/outline` in the composer or palette, or the assistant proposing it when it detects a stable thesis ("I can draft an outline from what we have — 2 sections are still thin").
2. **Run sheet** (§2.3): workflow `outline-from-research`, scope = thread or turn, levers: thesis (prefilled from the thread), venue, target length, genre protocol (C5), persona (linked or none); estimate C1–C2 (mostly re-fetching the thread's URLs to confirm them — note 12 §2.3 phase 0). Confirm.
3. **Run** in the author seat: harvest → classify claims into commitment / advice / material / alternatives → spine (5–12 claims) and section map with per-bullet provenance → gaps list. Live run card shows the phase, the URLs re-fetched, and any URL that failed re-fetch (each becomes a `[unverified]` bullet, never silently dropped).
4. **Outline approval card** — a gate of kind `approve_outline` (§3), mandatory (note 12: "the outline is the last cheap moment"). The card shows the outline in its structured form (below), the gaps list, the count of unverified bullets, and the *next* estimate ("Draft from outline on Pro ≈ 940 credits"). Actions: **Approve**, **Edit in outline editor**, **Back to chat with notes** (queues the notes as guidance and reruns the cheap plan step).
5. **On approval** the run writes `agents/author/outline/<slug>.md` and migrates the thread's source notes into `agents/author/research/` (author seat; note 12 §2.3). The project moves S0→S1 (note 2 §4.2) and the Timeline rail's next-step card becomes *Draft from outline*. The chat turn that triggered it gets a permanent "→ Outline v1" chip.

**The outline artifact.** It is the one artifact that is both agent-produced and *surfaced-editable* (note 2 §2.1 #12: it is the user's own document). Its structure, which the outline editor renders as a form-and-prose hybrid and `draft-from-outline` consumes as markdown:

```markdown
---
rhema: outline/1
project: prj_…            slug: privacy-harms-after-solove
provenance:
  thread: thr_…           promoted_from_turn: 47
  run: run_…              generated_at: 2026-08-27T14:41:00Z
  sources_refetched: 11   sources_unverified: 1
thesis: "The harms-based account has not replaced 'nothing to hide'; it answers it, and privacy law needs both."
venue: "law review / general"   audience: "…"   target_length: 6000
persona: sjs-academic (profile 2026-07-02)   protocol: academic
---
## Spine (claims the piece must establish, in order)
1. … [commitment] (src: solove-2007 §I; citron-solove-2022 p. 4)
2. … [material]
## Sections
### I. …  (~900 words)
- Function: … · Entry: … · Exit: …
- Claims: 1, 2 · Material: [3 bullets with source slugs]
## Alternatives considered (and why not)
## Gaps only the author can fill
- …  ← each becomes an `elicit` question on demand
## Sources (fetched during the session; slugs resolve to agents/author/research/sources/)
```

Editing after v1 exists is versioned (`outline v2`), and the drafting note of v1 continues to reference outline v1 (note 2 §4.4 item 4 needs this rule). Deleting the outline is disallowed once a draft cites it.

**REQ-CHAT-15.** Promotion to outline is a run with a mandatory approval gate; it cannot complete without a human approve action (no deadline auto-continue for `approve_outline`, because nothing downstream is waiting and the artifact is the user's own commitment).

**REQ-CHAT-16.** The outline artifact carries the provenance header above; every source bullet resolves to a source note; bullets whose URL failed re-fetch are marked `[unverified]` and counted on the approval card.

**REQ-CHAT-17.** Approval transitions project state S0→S1 and enables *Draft from outline* in the next-step card; on a project already in S2+ (a draft exists), promotion produces `outline vN+1` and offers `/draft @section` (§2.2) rather than a whole new draft.

**REQ-CHAT-18.** Mobile: chat is available; *Promote to outline* and the outline editor are web-only (note 5 §8 split); the approval card is viewable and approvable on mobile.

### 1.8 Chat about a draft, findings, and runs ("Ask about this draft")

When a project has drafts, the chat's most frequent job is reading, not researching (Devin's side chat, note 4 §1.6: "read-only Q&A that doesn't touch the run"). Selecting a passage in the Paper and pressing `⌘J` (or the popover's *Ask*) opens the composer with an `@v3 ¶…` anchor attached; the assistant's answer can carry an anchored **suggestion** (a proposed replacement rendered in suggestion mode) which the user accepts or rejects in the Paper — the same primitive as review findings (T2; note 5 §4.2). Accepting writes to the working copy (human edit path, N3), tagged with span provenance `assistant`. Whole-section rewrites are refused with a pointer to `/lineedit @section` or `/respond`.

**REQ-CHAT-19.** Assistant suggestions are anchored, accept/reject, ≤ 1 paragraph, and carry span provenance; the assistant cannot write to a draft except through this path.

**REQ-CHAT-20.** `/btw`-style side questions during a running run (§4.5) are ordinary assistant turns that may `read_artifact` the run's *committed* artifacts and its event feed, never its in-flight session.

---

## 2. Commands anywhere — the grammar that makes the product powerful (C4)

The founding prompt calls next-step-only "far too impoverished". Note 4 §5 shows every coding product exposes a palette plus verbs, and §4.5 (Warp) supplies the key prose idea: *the plan is a versioned document you can execute section-by-section*. Note 12 §2.5 gives twelve v1 skills. C4 is satisfied by making all of them reachable, scoped, and parallelizable through one grammar.

### 2.1 Grammar

```
/<verb> [@scope …] [--lever value …] [free text → guidance]
```

**Verbs (v1)** — each maps to a workflow (seat, cost class from note 12 §2.5):

| Verb | Workflow | Seat | Class | Default scope |
|---|---|---|---|---|
| `/draft` | draft-from-outline | author | C4 (C2 per section) | whole outline; `@section:II` drafts one section into a working copy |
| `/review` | editorial-review | editor | C4 | latest unreviewed draft; `@section` restricts findings to the range; `--protocol academic\|essay\|oped\|memo` |
| `/respond` | respond-to-review | author | C4 | latest unanswered review; `@finding:…` subset |
| `/factcheck` | fact-check-only | editor | C2–C3 | latest draft or `@section`/selection; `--tiers 1\|all` |
| `/cut` | cut-to-length | author | C1 | latest draft; `--target 900` or `--venue nyt-oped`; `--protect @section:IV` |
| `/lineedit` | line-edit | author | C1 | `@section` or selection |
| `/title`, `/abstract` | title-and-deck, abstract-and-keywords | author | C0–C1 | latest draft |
| `/outline` | outline-from-research | author | C1–C2 | current thread (§1.7) |
| `/research` | discourse-map | author | C3 | question text; `--strata academic\|general\|all --depth N` |
| `/steelman` | steelman | editor | C2–C3 | latest draft or `@outline` |
| `/visualize` | visualize | author | C1 | selection or free text (§5) |
| `/reverse-outline` | reverse-outline | either | C1 | latest draft |
| `/interview` | elicit-from-author | author | C0 | outline gaps or draft open questions |
| `/rounds` | loop-to-convergence | orchestrator | K×2×C4 | `--until minor\|rubric>=4 --max 3 --budget 6000` (gated every round; note 12 §2.2) |
| `/refresh-persona`, `/export`, `/compare @v2 @v3` | persona refresh (J), export (C15), version diff (D7) | — | — | designed in their own sections; listed so the verb set is complete |

**Scopes** (`@`-references, shared with `read_artifact`): `@v3`, `@v3 §II`, `@section:"The Harms Turn"`, `@selection` (implicit from the Paper), `@outline`, `@review:v2`, `@finding:v2/17`, `@claim:v2/41`, `@figure:fig_x`, `@thread`. The `@` picker in any composer lists them with type icons.

**Levers** are the run-sheet controls (§2.3) made typeable: `--tier standard|pro|frontier`, `--stage early|near-final`, `--no-discourse`, `--no-second-read`, `--no-factcheck`, `--variants …`, `--wait` (hard gates for this run), `--auto` (skip named gates for this run — only when the plan tier allows; loop rounds excepted).

**Free text** after the levers becomes the run's `guidance` — the same input the skills already accept (note 2 §1). "`/review @section:III --stage early` the stats in this section are placeholders; ignore them" is a complete, valid command.

**REQ-CHAT-21.** One parser serves the chat composer, the palette, and the selection popover; every verb, scope, and lever is discoverable by typing `/` or `@` and by browsing the palette; unknown verbs are suggested-corrected, never guessed.

**REQ-CHAT-22.** Every verb is available from at least four surfaces — chat composer, palette (`⌘K`), Paper selection popover (context-appropriate subset: *Ask, Visualize, Fact-check, Line-edit, Cut, Review this section*), and the artifact/timeline context menu — and all four produce an identical run sheet.

### 2.2 Scoped variants — review one section, fact-check only, cut to length

Scoping is what turns a $50 button into a $4 one, and note 2 §4.4 item 2 identifies the schema change it needs: Review keyed by (version, run), so one version can carry many reviews (proposed row F9). With that:

- **`/review @section:III`** runs the full protocol with `scope` as an input: Phase 0 still reads the whole draft for the piece brief (an editor cannot judge §III without the thesis), but the claim inventory, discourse pass, craft critique, and second read are restricted to the range; findings anchor only inside it; the letter is a *section letter*. Dossier path: `correspondence/v3-review-2/` with `scope: §III` in the piece brief. Estimate scales by the section's share of words and claims, plus a fixed intake cost.
- **`/factcheck`** is the `fact-check-only` skill (note 12 §2.3): Phase 0 + Phase 1, claim ledger as the deliverable, no letter, no gate; the trial product. Scoped by section or selection; `--tiers 1` checks only Tier-1 claims. Deliverable renders as the claims table with per-claim verdict badges in the Paper margin.
- **`/cut --target 900`** is `cut-to-length`: reverse-outline → per-section budget → **cut list gate** (approve the cut list before it is applied — a fourth gate kind, `approve_cutlist`, using the same card) → apply → seam read. Output: a working copy (not a `vN` until the user registers it; N3) plus `cut-list.md` so a later round can restore a cut.
- **`/respond @finding:v2/3,v2/9`** responds to a subset — legal because the response ledger enumerates every finding anyway; un-addressed findings are recorded `deferred` with the reason "not in scope of this response", which the next review reads (note 2 §1.2 re-review rule).
- **`/draft @section:II`** drafts one section from the outline into a working copy, with the plan gate reduced to that section's row; used for filling a gap after `elicit`, or for a variant (below). It never overwrites a reviewed `vN`.

**REQ-CHAT-23.** `scope` is a first-class run input for review, fact-check, line-edit, draft, respond; scoped runs write to distinct correspondence paths keyed by (version, run); the piece brief records the scope; the UI labels scoped dossiers ("Section review · §III").

**REQ-CHAT-24.** Scoped estimates: the run sheet shows the scoped estimate and, beside it, the whole-draft estimate, so the user sees what scoping saves.

### 2.3 The run sheet (one launcher for everything)

Every command lands here before anything runs — the Codex/Claude-Code plan-approval prompt reshaped for prose, and the place note 10 §5.5's rules live.

```
┌ Editorial review · v3 · §III "The Harms Turn" ───────────────────────────────┐
│ Protocol  Academic ▾      Stage  early ▾      Tier  Pro · Opus 5 ▾            │
│ Phases    ☑ Fact-check (41 claims → 12 in scope)  ☑ Discourse map             │
│           ☑ Independent second read (different model: Fable 5)               │
│ Gates     ● Three named gates (project default) ○ Wait for me at each ○ None │
│ Guidance  ┌──────────────────────────────────────────────────────────────┐   │
│           │ The stats in ¶4 are placeholders; ignore them.               │   │
│           └──────────────────────────────────────────────────────────────┘   │
│ Variants  none ▾  (run the same scope under Essay protocol in parallel?)     │
│                                                                              │
│ ≈ 410 credits ($4.10) · cap 615 · ~9 min          whole draft would be ≈1,300 │
│ Balance after: 1,590 of 2,000                                                │
│ [ Run review ]                                     [ Don't ask under 1,000 ] │
└──────────────────────────────────────────────────────────────────────────────┘
```

Rules carried in from research: estimate from actual word count and a claim count (note 10 §5.5 #1); **cap = 1.5× estimate, guaranteed** (#2); consent required above 500 credits or 25% of balance (#3), with the one-click threshold (#3); insufficient balance offers tier / phase / top-up (#5); the three phase toggles are the rigor levers note 4 implication 4 insists must be visible, not hidden inputs.

**REQ-CHAT-25.** The run sheet is the only way a run is created; it always displays estimate, cap, balance-after, and the phase toggles; the cap is passed to the run as `max_usd` (note 11 §3.4 cost guardrails).

### 2.4 Parallel variants

Note 3's proposed D20 ("draft N variants", from Cursor `/best-of-n`) and note 4 §5 ("parallel review variants … both write to distinct correspondence paths so no conflict; never two writers of one draft") define the envelope. Variants are runs that differ in exactly one lever and share a scope:

- `/review --variants academic,essay` → two reviews of the same `vN` hash, two dossiers, a **compare view** listing findings side by side with "both / only A / only B" grouping (the second-read reconciliation UI generalized). Each variant is its own run card; the pair is grouped on the Timeline rail.
- `/draft @section:II --variants 3` or `--variants standard,pro,frontier` → three working copies of §II, a three-column compare, *Pick* (replaces §II in the working copy, tagged with the variant's run id) or *Merge by paragraph*. This is the one place variant drafting is allowed: **whole-draft variants are refused** (rule B18 and the five-voices problem); a section is the largest variant unit.
- Concurrency: variants count against the plan's concurrent-run limit (note 10 §5.2); if the limit is lower than the variant count, the sheet says which will queue.

**REQ-CHAT-26.** `--variants` is accepted by `/review`, `/factcheck`, `/draft @section`, `/title`, `/abstract`, `/cut`; refused by `/draft` (whole) and `/respond`. Variants share `input_snapshot` and appear as a grouped run set with a compare view.

**REQ-CHAT-27.** The Timeline rail groups runs by state (Needs you / Running / Ready to read / Done — note 4 §3.8) and shows variant sets as one row that expands.

### 2.5 The palette (`⌘K`)

The palette is the grammar with a picker UI: type a verb or a noun. Sections: *Run* (verbs with the next-step suggestion pinned first: "Review v3 — ≈1,300 cr"), *Go to* (artifacts, sections, findings by number), *Recent runs*, *Threads*, *Settings*. Selecting a Run item opens the run sheet prefilled; `⌘↵` skips straight to the sheet's Run button when the consent threshold does not apply. Keyboard map is design/2's; the palette contributes `⌘K` (palette), `⌘J` (ask about selection), `/` in any composer.

**REQ-CHAT-28.** The palette's first *Run* item is always the project's "natural next step" from the state machine (note 2 §4.2), with its estimate — so next-step-only remains the zero-thought default while everything else is one keystroke away.

---

## 3. Gates (C7, Q-7)

### 3.1 Policy

Q-7 fixes gates on by default; note 4 §6.1 shows every product defaults to *soft* gates with a timer and recommends approve-with-deadline "never as blocking modals"; note 11 §3.3 step 5 makes waiting free (the task exits; zero compute) and §3.5 rule 5 notes the one real cost (the run holds the project's writer lock). The design follows from those three facts:

- **Three named gates**, each a card: **Structure plan** (`approve_plan`, after `draft-from-outline` Phase 2), **Review scope** (`approve_scope`, after `editorial-review` Phase 0), **Triage** (`triage_findings`, after `respond-to-review` Phase 2). Two more kinds reuse the card: `approve_outline` (§1.7, no deadline) and `approve_cutlist` (§2.2). `confirm_cost` is the run sheet, not a card.
- **Approve-with-deadline.** A gate card carries a deadline and states, in one sentence, what happens if the user does nothing: the skill's own conservative default (draft-from-outline: proceed with the plan as written; respond-to-review: "conservative option + flag at the top of the letter", note 2 §1.3; editorial-review: run the scope as estimated). Defaults: Structure plan **24 h**; Review scope **2 h** (only Phase 0 is invested); Triage **24 h**. Note 4 §4.6 #7 asked for "minutes, not 30 s — prose gates are read, not skimmed"; hours rather than minutes because the buyer "sits at a desk with 15k words" (note 5 §8) and may approve from the train the next morning (mobile, note 5 §8 row 3).
- **Per-project gate policy** (Factory's principle that autonomy is orthogonal to planning, note 4 §4.4): *Three named gates* (default) / *Wait for me at each* (no deadline; Devin's "Wait for my approval") / *Run to completion* (no named gates; consent gate and cost cap still apply; `/rounds` ignores this setting and gates every round regardless — note 12 §2.2). A per-run `--wait` / `--auto` overrides the project default.
- **Why Review scope is a gate at all.** The source `editorial-review` has no gate (note 2 §1.2). Adding one after Phase 0 buys two things: the estimate is re-priced from the editor's *actual* claim inventory rather than a cheap pre-pass (note 10 §5.5 #1), and the user sees "here's what the editor thought you were writing" (the piece brief, note 2 §2.1 #6) before $40 is spent on a misreading — the same cheap-moment logic as the outline gate.

**REQ-GATE-1.** Gates of kind `approve_plan`, `approve_scope`, `triage_findings`, `approve_outline`, `approve_cutlist` exist in the `gates` table (note 11 §3.2); each opens a card in the Companion pane's Run tab, the Inbox, and (D19) mobile; `gate.opened` is a user-visible event.

**REQ-GATE-2.** A gate card shows: the artifact under decision, the deadline (relative and absolute), the do-nothing outcome in one sentence, the run's cost so far and the remaining estimate, and the actions in §3.2. Acceptance: a gate with no user action resolves at `expires_at` with `decision.kind = "expired"` and the run proceeds per the stated default — except `approve_outline`, which waits indefinitely.

**REQ-GATE-3.** Gate policy is a project setting with three values plus per-run override; changing the policy while a gate is open does not alter that gate's deadline.

**REQ-GATE-4.** A parked run (`waiting_on_human`) consumes no compute and holds the writer lock; the project home shows the lock reason and a *Cancel run* release (note 11 §3.5 rule 5).

### 3.2 The gate card and what the user can edit before approving

The principle: **the user edits decisions; the agent keeps authorship of prose.** Note 2 §2.1 #15 leaves "edit the plan vs supply guidance" to C7; note 2 §9 item 3 and B16 warn that hand-editing derived files "is how a profile starts lying about its own provenance". The skills only read `guidance`. So:

**Structure plan (draft-from-outline).** The card renders the plan's structured parts as editable fields — spine claims (reorder, strike, add with a note), section map rows (order, target words, function), cut list (restore/keep toggles), apparatus budget — and the plan prose read-only beside them. Every field change is diffed into a `Guidance` record ("Operator changes to the structure plan: move §IV before §III; raise §II budget to 1,200; restore cut item 'the Bentham aside'"). On **Approve**, the run resumes with that guidance and performs one bounded *re-plan* step (the skill's Phase 2 re-entry, capped at one iteration — note 2 B19 asks for a cap on the uncapped loop) that writes `02-structure-plan.md` v2 with a "revised on operator guidance" header; the fidelity audit later compares against v2. Actions: **Approve** · **Approve and wait at every phase** (Claude Code's "manually approve edits", note 4 §3.3) · **Keep planning** (queues the guidance and re-runs Phase 2 without proceeding) · **Cancel run**.

```
┌ Structure plan · Draft v1 · waiting for you · auto-continues in 23 h 12 m ───────┐
│ If you do nothing: the draft is written from this plan as shown.                 │
│ Spent 61 cr · remaining ≈ 880 cr (cap 1,410)                                     │
│                                                                                  │
│ Spine                              Sections                     words           │
│ 1 ☰ The harms turn answers, not …  I  Opening: the nothing-to-hide…   700 ▾     │
│ 2 ☰ Solove's taxonomy was …        II The harms turn                 1,200 ▾    │
│ 3 ☰ ✕ (struck: "the EU detour")    III ☰ Doctrine after Citron        1,100 ▾    │
│ + add a claim…                     IV ☰ Why both framings survive    900 ▾      │
│                                                                                  │
│ Cut list   ☑ the Bentham aside (restore)   ☐ the 2014 survey                     │
│ Promise/payoff · Apparatus budget · Deviations from the outline   (read-only ▸)  │
│                                                                                  │
│ Guidance to the author  ┌────────────────────────────────────────────────────┐   │
│  (3 changes captured)   │ Keep §I under 700; the Bentham aside is load-bearing│  │
│                         └────────────────────────────────────────────────────┘   │
│ ☐ Remember "keep openings under 700 words" for this project                     │
│                                                                                  │
│ [ Approve ]  [ Approve, wait at every phase ]  [ Keep planning ]  [ Cancel run ] │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Review scope (editorial-review).** The card shows the piece brief's thesis-as-read, the claim inventory count by tier, the research agenda, the venue bar the editor inferred, and the re-priced estimate. Editable: stage, phase toggles, venue/audience corrections, `concerns` (free text; the skill's own input), scope narrowing. Approve resumes Phases 1–6.

**Triage (respond-to-review).** The card *is* the disposition UI (T2; note 5 §4.2): each finding with the agent's proposed disposition (accept / adapt / rebut / defer / escalate) and rationale; the user may change any disposition and add a note; escalations are listed first as "decisions only you can make" (note 2 C18 standing-escalation proposal). Here direct edits are legitimate — the response ledger is the human's decisions by design (precedence: guidance > charter > persona) — so each overridden row carries `actor: operator` provenance, and the ledger is frozen at delivery (B14). Bulk actions ("accept all copy-edit findings") require a preview (note 5 §4.2 #3). Approve resumes Phase 3 with the edited ledger.

**REQ-GATE-5.** Gate cards render structured fields for editing and prose read-only; structured edits on `approve_plan` and `approve_scope` produce `Guidance` records, never direct file edits; on `triage_findings`, disposition overrides write ledger rows with actor provenance.

**REQ-GATE-6.** After approval with changes, the run performs at most one bounded re-plan (plan gate) or none (scope, triage); the resulting artifact version is recorded and the card's history shows "approved with 3 changes".

**REQ-GATE-7.** Every gate card has *Approve*, *Approve and wait at every phase*, *Keep planning / Send back*, and *Cancel run*; on mobile, *Approve* and *Cancel* plus disposition changes for triage (note 5 §8).

### 3.3 Notifications and the Inbox

`gate.opened` notifies in-app, by email (SES), and by push (D19) with the card's one-line summary and the deadline; a reminder fires at 1 h remaining. The Inbox lists open gates first (Codex "Scheduled inbox" pattern, note 4 §2.5). The project home row reads "Needs you · structure plan · 23 h".

**REQ-GATE-8.** Gate notifications carry the do-nothing outcome and a deep link to the card; a reminder is sent at 1 h before expiry; expiry emits `gate.resolved{decision:"expired"}` and a notification.

### 3.4 Guidance capture

`guidance` is the only human input the skills take at any point after launch (note 2 §1), and the precedence chain "human guidance > voice charter > persona > default" is stated in three places in the source system (note 2 §1.5). Rhema makes it an object:

```ts
type Guidance = {
  id: string;
  projectId: string;
  scope: 'run' | 'project';               // 'project' = standing guidance, applied to every future run of the listed workflows
  workflows?: Workflow[];                  // for standing guidance
  source: 'run_sheet' | 'gate_edit' | 'gate_text' | 'inline_comment' | 'queued_message' | 'chat_promote' | 'interview';
  text: string;                            // what the skill receives, verbatim
  anchors?: ArtifactAnchor[];              // passage / plan row / finding the guidance is about
  createdBy: UserId; createdAt: string;
  consumedBy?: { runId: string; phase: string }[];   // which run/phase actually received it
  active: boolean;                          // standing guidance can be retired, never deleted
};
```

Sources, in the order a user meets them: the run sheet's guidance box (§2.3); gate-card field edits (diffed into text) and the gate's free-text box; inline comments on plan rows, streaming draft passages, or findings (§4.3, batched); queued messages (§4.2); *Save as guidance* on a chat turn (§1.5 — the second conduit of REQ-CHAT-2); interview answers (`elicit`). **Standing guidance** ("remember for this project") is the prose analogue of Claude Code's "Yes, and don't ask again" scoped to the repo (note 4 §3.8) and of Warp Rules; it is listed in project settings with per-workflow applicability and a retire toggle. Guidance is rendered into the skill's `guidance` input as a dated, sourced list; the run's delivery report already names how guidance was honored (note 2 §1), and the UI links each guidance record to the phase that consumed it (`consumedBy`).

Guidance is **not** written into `voice-charter.md` or any agent artifact by the user (E3: "add guidance rather than direct edit", note 2 §2.1 #22); the author-agent updates the charter itself when it honors guidance, keeping provenance clean.

**REQ-GATE-9.** `Guidance` records exist with the schema above; every gate edit, run-sheet text, inline comment batch, queued message, and promoted chat turn creates one; the skill input is generated from them; `consumedBy` is populated from the phase that received the text.

**REQ-GATE-10.** Standing guidance: create from any gate/run sheet via a checkbox; list, edit, retire in project settings; shown on every run sheet as "3 standing notes apply ▸".

**REQ-GATE-11.** Guidance never edits `agents/**` artifacts directly; the drafting note / response letter's account of guidance is the user-visible confirmation it was honored.

---

## 4. Steering mid-run (K5)

Note 4 §6.2 finds three universal primitives (interrupt, queue, comments-into-next-turn) and two advanced ones (edit the plan mid-run; editable queued messages) and recommends all five at phase granularity; note 11 §3.3–3.4 gives the mechanics (phase-boundary commits, `AbortController`, partials committed, resume from files). Prose adds one unit of granularity coding lacks: **the section**. Drafting and revising phases proceed section by section with the ledger updated per section (note 2 §1.1 Phase 4, B18), so "the next section boundary" is a real, cheap delivery point inside a phase.

### 4.1 Pause and stop

- **Pause** (`⎋` in the Run tab; *Pause* on the run card) requests a stop at the next safe point — the next section boundary in drafting/revising phases, the next tool-batch boundary elsewhere — commits what can be committed (source notes, ledger rows; never a half-written `vN.md`, note 11 §3.4), mirrors the session, and parks the run at zero compute like a gate. The card shows *Paused at §III (2 of 6 sections drafted)* with **Resume**, **Resume with a note** (queued guidance), and **Stop**.
- **Stop** = cancel-keep-partials (note 11 §3.4 cancellation): partial artifacts stay inspectable, marked `partial (3/6 phases)` with **Resume** (K6/K7 resumability — note 3's K7 proposal: no wall-clock kill) — a stopped review that finished fact-check has a real claim ledger.

**REQ-GATE-12.** Pause is available whenever a run is `running`; it resolves within 60 s at a safe point; the card names the point and the committed artifacts. Resume re-enters from committed artifacts (note 11 §3.3 step 5 pattern).

**REQ-GATE-13.** Stop keeps partial artifacts and cost; partial dossiers are labelled and resumable; nothing half-written reaches `drafts/`.

### 4.2 Queued messages

A message typed into the Run tab (or `/tell` in chat) while a run is running is **queued guidance**: it shows above the composer with its planned delivery point ("→ delivered at start of §IV, ≈ 3 min" or "→ delivered at phase 4, Verify new claims"), is editable and deletable until delivered (Devin Desktop's editable queue, note 4 §1.2; Claude Code's `Up` to retrieve, §3.2), and becomes a `Guidance{source:'queued_message'}` record when consumed. Delivery mechanism: at the delivery point the orchestrator injects the guidance via the session's streaming input (note 7 §3.1 streaming input mode) with a fixed template ("Operator guidance received mid-run: …"); within a single-context phase like drafting, the skill's own section loop reads it at the next section. Messages queued during a phase that cannot honor them (e.g., the second read, which must receive only the draft — B6) are held to the next eligible phase and the UI says so.

**REQ-GATE-14.** Queued messages display their delivery point, are editable until delivered, and are never delivered into input-scoped independence contexts (second read, fidelity audit, gap analysis).

### 4.3 Inline comments, batched

Note 4 §3.2 (Claude Code web: comments "queue up until you send your next message, then they're bundled"), §4.5 (Warp: "the agent receives your entire batch of feedback, applies the changes in one iteration") and §5 (matrix row "Interrupt / steer": *comment on a finding or passage as the steering unit*) define this. In Rhema, comments can be left on:

- **Streaming draft text** in the Paper while `draft-from-outline` or `respond-to-review` is writing (the Paper is read-only during a writer run — note 11 §3.5; comments are allowed, edits are not). Each comment anchors to a passage; the batch is delivered at the next section boundary as guidance ("Comments on §II ¶3: 'this is the wrong Solove paper — the 2007 one'").
- **Plan rows** during drafting (K7 "edit the plan mid-run", note 4 §4.5): a comment on a section row is delivered before that section starts; a comment on an already-drafted section is delivered at consolidation (Phase 5). Rows are not editable mid-run — the plan is frozen after the gate (note 2 §2.1 #15); comments are the mid-run form of the same guidance.
- **Findings and ledger rows** during a response run (Phase 3+): a comment on a finding whose move has not yet been applied changes its handling; on one already applied, it is delivered to gap analysis as a check ("the operator disputes the discharge of finding 12") — gap analysis receives guidance by design (note 2 §1.3 Phase 5 inputs).

A comment drawer shows the pending batch with "delivers at …" and a **Send now** that forces delivery at the next tool-batch boundary (cost: a mid-section adjustment, warned).

**REQ-GATE-15.** Comments on streaming text, plan rows, and findings are batched and delivered at the stated boundary as one `Guidance{source:'inline_comment'}` record listing anchors; the Paper stays read-only for the human during writer runs.

**REQ-GATE-16.** Comment delivery points are shown before the comment is submitted; comments that arrive after their natural point are re-routed (consolidation / gap analysis) and the drawer says where.

### 4.4 Editing the plan or ledger mid-run (K7)

Resolved by §4.3 and §3.2: the plan and the triage ledger are edited *at their gates*; after approval they are frozen artifacts and steering happens through comments and queued guidance. Note 4 §4.5's Warp behaviour ("editing the plan mid-run is honoured") is reproduced in effect — a plan-row comment is honoured before the section is written — without ever rewriting an agent-authored artifact in place. This is a deliberate narrowing of K7 and is recorded in §Ledger updates.

### 4.5 Side questions

`/btw <question>` in chat, or *Ask about this run* on the card, is an ordinary assistant turn (REQ-CHAT-20) that reads committed artifacts and the event feed — "how many claims have failed so far?", "which sources has it read for §II?" — and never the live session. Claude Code's `/btw` and Devin's side chat are the precedents (note 4 §1.6, §3.2).

### 4.6 What steering never does

It never edits `agents/<role>/**`; it never lets the human write into the draft a run is writing (working copy instead, reconciled as suggestions — note 8's N-design, ledger turn 10); it never delivers into an independence context (B6–B8). These are enforced, not advised (F4).

---

## 5. AI-generated visualizations end-to-end (C12, Q-8)

### 5.1 The object

Note 9 §8.3 fixes the pipeline and note 12 §2.3 adds the invariant that matters most: numbers come from a provenance-bearing source "never numbers the model 'remembers'". A figure is therefore a *claim-bearing asset*, and it lives in the shared record because both seats must read it (the editor to fact-check it; the author to revise it):

```
<project>/assets/figures/<figure-id>/
  spec.vl.json | diagram.mmd | table.md     # source of truth
  data.csv                                  # the numbers, exactly as plotted
  provenance.json                           # where every number came from
  render.svg, render.dark.svg, render@2x.png# cache; regenerable
  versions/<n>/…                            # every iteration keeps spec+data+provenance
```

```ts
type FigureAsset = {
  id: string; projectId: string; kind: 'chart' | 'diagram' | 'table';
  title: string; caption: string; alt: string;         // alt required, ≤ 250 chars
  sourceLine: string;                                    // "Source: CHES 2019, authors' calculation." → footnote/caption on export
  spec: VegaLiteSpec | MermaidText | GfmTable;
  data?: { rows: number; columns: string[]; csvSha256: string };
  provenance: {
    kind: 'selection' | 'claim_ledger' | 'asset_upload' | 'fetched' | 'user_typed' | 'none';
    refs: Array<{ url?: string; accessedAt?: string; claimId?: string; assetId?: string; transform?: string }>;
    computedBy: 'assistant' | 'author' | 'user';
    verification: 'unverified' | 'verified' | 'contradicted' | 'unverifiable';   // set by review
  };
  anchor?: { draftVersion: number; blockId: string };   // where it is / is proposed to go
  versions: Array<{ n: number; request: string; specSha256: string; createdAt: string; cost: number }>;
};
```

Storage as a project asset mirrors the operator's own `drafts/figures/` precedent (note 2 §2.3 item 4; note 9 §1) and gives assets a home the convention lacks. `assets/` is readable by every role and written only by author-seat runs.

**REQ-VIZ-1.** Figures are stored as spec + data + provenance + cached renders under `assets/figures/<id>/`, versioned; renders are regenerable from spec and data; deleting a render never loses the figure.

**REQ-VIZ-2.** `alt` and `sourceLine` are required fields; a figure cannot be inserted without both (the assistant drafts them; the user may edit).

### 5.2 Entry points

1. **From chat**: "make a bar chart of the CHES correlations by party family" → `visualize` tool → figure card in the thread (§5.4). Data resolution asks before assuming (§5.3).
2. **From a selection in the Paper**: select a paragraph or table → popover *Visualize* → composer opens with `@selection` attached and a prompt hint ("add a chart of X here"); the resulting proposal's anchor defaults to *after the selection*.
3. **`/visualize`** anywhere with `@claim:…`, `@asset:…` (an uploaded CSV), or free text.
4. **From an existing figure block**: *Edit figure* opens the card with the current spec loaded; iteration is a spec edit (§5.5).
5. **From a review finding** of class "would benefit from a figure" (craft notes): the finding's *Visualize* action pre-scopes to the passage.

**REQ-VIZ-3.** The four launch surfaces above produce the same figure card; a figure launched from a selection carries the selection as `provenance.kind = 'selection'` and the block id as the default anchor.

### 5.3 Data resolution (the honesty step)

Before any spec is generated, the run classifies where the numbers come from and *tells the user*:

| Source | How it is obtained | Provenance recorded | Badge |
|---|---|---|---|
| Numbers in the selection or the draft | parsed from the passage | `selection` + block id; each value's text span | none (they are the draft's own claims — the review will check them either way) |
| A claim-ledger row | `@claim:v2/41` → its value and URL | `claim_ledger` + claim id + URL | `verified` inherited if the ledger says so |
| An uploaded CSV/JSON | project asset picker / drag-drop onto the card | `asset_upload` + asset id + sha | none |
| A URL the run fetches now | `fetch` inside the run; table extracted; the URL must be readable this session | `fetched` + URL + accessed_at + extraction note | none |
| The user types them | inline data grid on the card | `user_typed` + user id | `author-supplied` |
| The model "remembers" | **refused**: the card says "I don't have a source for these numbers" and offers the four routes above; if the user insists ("sketch it anyway") the figure is created with `provenance.kind = 'none'` | `none` | **`[unverified data]`** — persistent, visible in the Paper, and exported as a caption note unless resolved |

**REQ-VIZ-4.** A figure with `provenance.kind = 'none'` renders with an `[unverified data]` badge in the Paper and in the figure card; the badge is removed only by attaching provenance (re-running data resolution) or by a review verdict.

**REQ-VIZ-5.** Data resolution shows the data table before rendering; the user can correct cells; corrections are recorded as `user_typed` overrides per cell.

### 5.4 Spec generation, rendering, and the figure card

Tooling per note 9 §8.2 (Python-free, Q-3): **Vega-Lite** for data charts (JSON spec, schema-validated, retry on validation error), **Mermaid via `beautiful-mermaid`** for the six supported diagram types (flowchart, state, sequence, class, ER, xychart), **GFM/HTML tables** for tables (no render step). Rendering is deterministic TS: Vega `view.toSVG()`; both a light and a dark SVG (the Paper follows the app theme — note 5 §6), themed from design/2's tokens (the `dataviz` conventions apply: one neutral palette, ≥ 4.5:1 labels, no decorative animation). PNG@2x is produced lazily for formats that need it (§5.8). Unsupported diagram types are declined with a suggestion ("mindmaps aren't supported in v1; a nested list or a flowchart?").

```
┌ Figure · v2 ────────────────────────────────────────────────── 6 cr ┐
│ ┌────────────────────────────────────────────────────────────────┐  │
│ │        Correlation of GAL–TAN position with …                  │  │
│ │  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇ 0.71  Radical right                          │  │
│ │  ▇▇▇▇▇▇▇▇▇ 0.42        Conservative                            │  │
│ │  ▇▇▇▇ 0.18             Liberal                                  │  │
│ │  ▇ 0.04                Social democratic                        │  │
│ └────────────────────────────────────────────────────────────────┘  │
│ Type   ● Bar  ○ Line  ○ Dot  ○ Table       Theme  ● follows paper  │
│ Caption  Figure 2. Correlation of party-family GAL–TAN position …   │
│ Alt      Horizontal bar chart of four party families; radical …     │
│ Source   CHES 2019 (chesdata.eu), authors' calculation.  ✓ fetched  │
│ Data ▸ (4 rows · from @claim:v3/28, v3/29)   Spec ▸   Versions ▸ (2)│
│                                                                     │
│ Insert after ¶ "The pattern is starkest among…" (§III) ▾            │
│ [ Insert as proposal ]   [ Iterate… ]   [ Discard ]                 │
└─────────────────────────────────────────────────────────────────────┘
```

The card lives in the chat thread (when launched from chat) and in a floating panel over the Paper (when launched from a selection); it is the same component.

**REQ-VIZ-6.** Chart specs are Vega-Lite and validated against the schema before render; diagrams are Mermaid parsed by beautiful-mermaid; validation failures retry up to 3 times inside the run, then surface as an error with the spec visible.

**REQ-VIZ-7.** The figure card renders light and dark variants, exposes type chips (bar/line/dot/table for charts; flowchart/state/sequence for diagrams), editable caption/alt/source, and Data/Spec/Versions disclosures; a table figure shows the table itself.

**REQ-VIZ-8.** Rendering runs in the export/ingestion container (note 9's M10 proposal) or a sandboxed render worker — never in the browser for the persisted render — so the IDE, review, and export see byte-identical SVG.

### 5.5 Iterate

"Make it a bar chart", "use the 2019 data", "drop the liberal row", "log scale" — each is a turn that re-runs steps 2–3 of the pipeline with the previous spec as context (note 9 §8.3 step 5) and creates version n+1 (spec, data if changed, provenance if changed, render). The Versions disclosure shows a thumbnail strip with the request that produced each; any version can be restored. Type chips are the common iterations made one click (a chip click is a spec edit, no model call, 0 credits). Iterations cost C0–C1 and show on the card. Data changes re-run data resolution (§5.3); a request that would need numbers the run does not have triggers the refusal path.

**REQ-VIZ-9.** Every iteration creates a new figure version with the request text; restoring an older version is one click; chip-driven type changes are local spec edits with no credit cost.

### 5.6 Insert as a proposal

Insertion is an **accept/reject proposal block** in the Paper — the suggestion primitive shared with review findings and assistant suggestions (T2; note 9 §8.3 step 4; note 5 §4.2 rule 1). The anchor defaults to: after the selection (selection-launched), or the paragraph the run identifies as containing the figure's claims (chat-launched: it searches the draft for the claim ids / values), shown as "Insert after ¶ …" with a picker. The proposal renders the figure at final size with its caption and source line so the user judges it in place; **Accept** writes the block; **Reject** discards the proposal and keeps the figure in the assistant's working figures for later.

In the document model (H9's Rhema Markdown profile), the block is:

```markdown
![Horizontal bar chart of four party families; radical right highest at 0.71](asset://fig_01J…)
*Figure 2. Correlation of party-family GAL–TAN position with the harms index.[^12]*
<!-- rhema:figure id=fig_01J… version=2 -->

[^12]: Source: CHES 2019 (chesdata.eu, accessed 2026-08-27), authors' calculation from `data.csv`.
```

This is the operator's existing convention (image, italic caption, footnote source — note 9 §1) made machine-readable by the trailing comment. Figure numbering is derived at render/export time from document order, never typed. If the draft is a reviewed `vN`, accepting forks `v(N+1)` with `origin=human-revision` (N3; note 2 §4.5) and the figure's data is marked *pending verification* for the next review.

**REQ-VIZ-10.** Figures enter drafts only as accept/reject proposals at a stated anchor; acceptance writes the figure block in the H9 profile form; rejection keeps the figure asset.

**REQ-VIZ-11.** Figure numbers are computed from document order; renumbering on move/delete is automatic; captions never contain a hard-coded number in the stored markdown (the editor displays "Figure 2." as a rendered label).

**REQ-VIZ-12.** Inserting into an immutable `vN` forks `v(N+1)` and marks the figure's claims pending verification.

### 5.7 How review fact-checks a figure

A chart "is a set of quantitative claims with a URL, which is exactly the claim-ledger regime" (note 9 §8.3 step 6). In `editorial-review`, Phase 0's claim inventory includes each figure block as one or more Tier-1 claims (values, labels, axis ranges, and any comparative claim in the caption), sourced from `provenance.json` and `data.csv`; Phase 1 re-fetches `source_url`, recomputes from `data.csv`, and issues the standard six-way verdict; the finding anchors to the figure block, and the figure card's provenance panel shows the verdict badge. A figure with `provenance.kind='none'` is inventoried as *Unsupported* by construction and produces a finding automatically. `fact-check-only` behaves identically. In `respond-to-review`, a finding against a figure is dispositioned like any other; *adapt* opens the figure card for iteration.

**REQ-VIZ-13.** Review runs inventory figure blocks as claims (values, labels, caption claims) with the figure's provenance as the source; verdicts propagate to `provenance.verification` and to a badge on the figure.

**REQ-VIZ-14.** The claims table in the Findings tab groups figure-derived claims under the figure's number; clicking scrolls the Paper to the figure.

### 5.8 Export

Per note 9 §7.2's fidelity table: **SVG** for HTML/PDF (typst)/LaTeX/typst; **PNG@2x** for docx/rtf/Google Docs; tables as native tables everywhere; `.txt` keeps alt + caption + source and drops the image. Alt text maps to the format's image description (docx alt-text field); the source line exports as a footnote where footnotes exist and as caption text otherwise; `[unverified data]` becomes a caption note in every format until resolved. The `.md` export zip carries `assets/figures/<id>/{spec, data.csv, provenance.json}` in an appendix folder so the figure is reproducible outside Rhema. Dark renders never export (print/light theme only).

**REQ-VIZ-15.** Export embeds SVG or PNG per the format table, writes alt text into the format's alt field, exports the source line as footnote or caption, and includes spec + data + provenance in the `.md` and `.zip` exports.

### 5.9 Cost, limits, and the trial

`visualize` is C1 (note 12 §2.5): a first render typically 5–15 credits, iterations 2–8, chip edits 0. The card shows the cumulative credits for the figure. Data resolution that fetches a URL shows the fetch in the activity strip. Trial accounts can create figures (they are cheap and the "aha" is strong) but export only md/txt (note 10 §5.2 trial row).

**REQ-VIZ-16.** Each figure version shows its credit cost; figure creation is permitted on trial; the export gate follows the plan's export rules.

---

## 6. Empty states and the first five minutes (start from scratch)

Note 6 (ledger turn 6) sets the activation rule: first value must be inference-free where possible, and time-to-first-value ≤ 10 min; note 4 §5 (onboarding row) sets "connect nothing; choose entry". The scratch path is the one that runs through this document.

### 6.1 Project creation

```
┌ New project ──────────────────────────────────────────────────────────┐
│  Title  ________________________   Persona  Unfiled ▾   Genre  Essay ▾│
│                                                                       │
│  ┌ Start from scratch ┐  ┌ Upload an outline ┐  ┌ Upload a draft ┐    │
│  │ Think and research │  │ .md .docx .pdf …  │  │ .md .docx .pdf │    │
│  │ with the assistant;│  │ → Draft from      │  │ → Review, or   │    │
│  │ promote to outline │  │   outline         │  │   Quick Review │    │
│  └────────────────────┘  └───────────────────┘  └────────────────┘    │
└───────────────────────────────────────────────────────────────────────┘
```

### 6.2 The scratch IDE, empty

The Paper shows a quiet placeholder ("Your outline will appear here once you promote it from the chat. Nothing is drafted until you ask."); the Companion pane opens on **Chat** with the composer focused and four chips: *Research a question* · *I have a thesis* · *Interview me* (`/interview`: the assistant asks what only the author can supply — audience, venue, the claim you most want to make, what you refuse to argue) · *Paste my notes*. The Artifact browser shows *Outline (none)*, *Drafts (none)*, *Research → Chat sources (0)*. The Timeline rail shows one card: *Next: promote an outline from chat — free until you research*.

### 6.3 The first five minutes (script; Pro tier, Standard notch, credits ≈)

| t | User does | System does | Credits |
|---|---|---|---|
| 0:00 | Creates "Privacy harms after Solove", Essay, Unfiled | Empty IDE as above | 0 |
| 0:30 | Clicks *I have a thesis*; types two sentences | Assistant restates the thesis in one line, asks two questions (venue, length), lists what it would need to check | 2 |
| 1:30 | "Is the harms account really new? check" | Within budget: 3 searches, 4 fetches; source cards; a three-paragraph answer with quotes ≤ 40 words and URLs | 14 |
| 3:00 | "Map the critics too" | Exceeds per-turn budget → **plan card** (≈ 95 cr); user picks *Do the first step only* | 22 |
| 3:45 | Clicks *Promote to outline* on the thread | Outline run sheet (≈ 30 cr) → confirm → run: harvest, classify, spine, sections, gaps; 7 URLs re-fetched, 1 unverified | 30 |
| 4:30 | Outline approval card | Edits one section title; approves | 0 |
| 4:45 | — | Outline v1 written; state S0→S1; Paper shows the outline; next-step card: *Draft from outline ≈ 400 cr (Standard) · 940 (Pro)*; the gaps list offers *Interview me* for the two author-only questions | — |
| **≈ 5:00** | | **Total ≈ 70 credits ($0.70)**; nothing drafted; everything cited was fetched | |

The scratch path never spends more than the trial's 600 credits before the first gate, and every artifact created is the user's own (outline, source notes, guidance).

### 6.4 Other empty states

- **Draft uploaded, no chat yet**: Chat tab opens with "Ask about this draft" chips — *What is my thesis, as read?* (a `measure` + read turn), *Which claims will an editor check?* (a cheap inventory pass, ≈ 5 cr), *Fact-check §…*, *Review this draft (≈ … cr)*.
- **Review delivered, nothing dispositioned**: the triage gate card is the empty state of the Findings tab.
- **Thread with no messages**: the four chips; a note "This thread is private to you and never read by the editor."
- **No figures yet**: `/visualize` in the palette shows a one-line example; the Paper popover shows *Visualize* only when a selection contains numbers or a table (otherwise it is under *More*).

**REQ-CHAT-29.** The scratch entry opens the Chat tab with the four chips and an empty Paper placeholder; the palette's first item is *Promote to outline* once a thread has ≥ 3 assistant turns.

**REQ-CHAT-30.** The first-five-minutes path must be completable on Trial within its credit grant, with the outline approval as the first gate encountered; instrument this as the activation event for the scratch cohort (C11).

---

## 7. Wireframes not shown above

### 7.1 Command palette

```
┌ ⌘K ───────────────────────────────────────────────────────────────┐
│ > review @section:III                                             │
├───────────────────────────────────────────────────────────────────┤
│ Run                                                                │
│  ▶ Review §III "The Harms Turn" · Academic · ≈ 410 cr        ⏎    │
│  ▶ Review v3 (whole) · next step · ≈ 1,300 cr                     │
│  ▶ Fact-check §III · ≈ 120 cr                                     │
│  ▶ Review §III as 2 variants (Academic, Essay) · ≈ 820 cr         │
│ Go to                                                              │
│  § III in v3 · Finding v2/17 · Outline v1                          │
│ Threads                                                            │
│  Project chat · "critics of the harms account"                     │
└───────────────────────────────────────────────────────────────────┘
```

### 7.2 Run card with steering (Companion pane · Run tab)

```
┌ Draft from outline · v1 · running · phase 4/7 Draft · §III of 6 ─────────┐
│ ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▯▯▯▯▯▯▯▯▯▯▯▯  ≈ 11 min left · 512 of ≈ 880 cr (cap 1,410) │
│ ▸ 2 sources read for §III  ▸ claim ledger: 31 rows, 27 verified          │
│ Queued for §IV: "keep the Bentham aside to one paragraph"  [edit] [✕]    │
│ 2 comments pending → delivered at start of §IV                           │
│ [ Pause ]  [ Stop, keep partials ]  [ Tell the author… ]  [ Ask (/btw) ] │
└──────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Compare view for parallel review variants

```
┌ v3 · Review A (Academic) ‖ Review B (Essay) ─────────────────────────────┐
│ Verdict   major revisions ‖ minor revisions                              │
│ Findings  both (14) · only A (9) · only B (3)      filter ▾  severity ▾  │
│ #  Passage (§¶)         A                  B                  → respond   │
│ 1  §II ¶3 "…"           major · thesis     major · thesis     [both]      │
│ 2  §III ¶1 "…"          major · evidence   —                  [A only]    │
│ …                                                                        │
│ [ Respond to A ]  [ Respond to B ]  [ Respond to the union ]             │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Data and event additions this design needs

- **Tables**: `threads` (project, name, session_store_key, brief_key, archived_at); `guidance` (schema §3.4); `figures` (schema §5.1) with `figure_versions`; `runs.scope JSONB` and `runs.variant_group_id`; `reviews` keyed (version, run) (F9). `gates.kind` gains `approve_outline`, `approve_scope`, `approve_cutlist`.
- **Events** (K2 additions, all `visibility: user`): `chat.turn.completed{thread_id, credits, searches, fetches}`, `guidance.captured{source, anchors_count}`, `guidance.delivered{run_id, phase}`, `steer.paused{point}`, `steer.queued{delivery_point}`, `figure.rendered{figure_id, version, kind}`, `figure.proposed{anchor}`, `figure.accepted`, `gate.expired`.
- **Skill inputs** (harness-neutral additions to the ported skills, in the spirit of note 7 G14's `phase` input): `scope` (section ids / anchor ranges) for editorial-review, respond-to-review, draft-from-outline, line-edit, fact-check-only; `guidance` already exists everywhere; `visualize` and `outline-from-research` are new skills per note 12.

---

## 9. Departures and tensions, stated once

- **Assistant reads the author's notebook.** The convention's allowlist says an agent reads only its own namespace. Rhema lets the assistant (author-side, read-only) see `agents/author/*` because the user is the author and sees those files in the UI anyway (note 2 §3). The wall that carries value — editor ↔ author, and the persona hold-out — is untouched. This is a narrowing of the rule for a role the convention did not have, not a breach of the rule it has. Q-20 presumption: the operator should confirm (Open question 1).
- **K7 narrowed.** Plans and ledgers are edited at their gates, not rewritten mid-run; mid-run intent is comments and queued guidance. Warp's behaviour is matched in effect, not mechanism, to keep artifact provenance honest (B16).
- **Whole-draft variants refused** despite Cursor's `/best-of-n` precedent: the source system's single-context drafting rule (B18) and the five-voices problem outweigh the demo value. Section variants deliver the benefit.
- **`ask_editor_role` not built.** Editorial independence is the product; the chat can *commission* the editor, never *consult* it.
- **Gate deadlines in hours, not seconds/minutes.** Departs from the coding-tool norm for the reasons in §3.1; waiting is free on this architecture.

---

## Ledger updates

| Row | Status | Evidence (one line) |
|---|---|---|
| D9 | done | §1: assistant agent-type, threads, toolset, compaction brief + pins, per-turn cost, tier picker, outline promotion flow (REQ-CHAT-1…20) |
| G9 | done | §1.2–1.4: same harness, fourth role with `agents/assistant/` namespace, two-conduit memory boundary, tool list; `ask_editor_role` rejected with reasons |
| C4 | done | §2: one grammar `/verb @scope --levers`, twelve v1 verbs, scoped variants keyed by (version, run), parallel variants, run sheet, palette (REQ-CHAT-21…28) |
| C7 | done | §3: three named gates + outline/cut-list kinds as approve-with-deadline cards; per-project policy; "edit decisions, not prose"; `Guidance` object and standing guidance (REQ-GATE-1…11) |
| K5 | done | §4: pause/stop/queued guidance/batched comments/side questions at section and phase granularity; never into independence contexts (REQ-GATE-12…16) |
| K7 (proposed, note 4/3) | done (narrowed) | §4.4: plans/ledgers edited only at gates; mid-run intent via comments and queued guidance |
| C12 | done | §5: figure asset model, data-resolution honesty step, card, iterate, proposal insert, review as Tier-1 claims, export per format (REQ-VIZ-1…16) |
| C17 (note 9: figure asset model) | done | §5.1 schema and `assets/figures/` location in the shared record |
| C17 (note 5: `outline-from-research`) | done (design) | §1.7 flow, artifact schema, mandatory gate |
| D20 (variant drafting) | done (scoped) | §2.4: section-level variants only; whole-draft variants refused |
| F9 (Review keyed by version, run) | required | §2.2 depends on it for scoped and variant reviews |
| B3.3 / D18 (first five minutes) | input | §6.3 scratch-path script and credit envelope |
| E3 / T3 | input | §1.2: assistant is author-side; editor memory remains the hidden half |

**New rows proposed**

- **D22 — Chat threads & compaction brief**: thread lifecycle, `brief.md` regeneration at compaction, pins with token footprint, user-correctable memory. Owner D/A. (§1.3, §1.6)
- **C19 — `Guidance` object**: schema, sources, standing guidance, `consumedBy` linkage, rendering into skill input. Owner A/D. (§3.4)
- **K8 — Delivery points for mid-run guidance**: section-boundary vs phase-boundary semantics per workflow; the "held to next eligible phase" rule for independence contexts. Owner A. (§4.2–4.3)
- **F10 — `assets/` shared-record directory**: readable by all roles, written by author-seat runs; home for figures, uploaded data, companion documents (note 2 §2.3 item 4). Owner A. (§5.1)
- **G18 — `scope` input for the ported skills**: harness-neutral addition alongside G14's `phase`. Owner A. (§2.2, §8)
- **M13 — Render worker for figures**: Vega/beautiful-mermaid in the export container or a sandboxed worker; SVG only by default (note 9 open question 12 on canvas). Owner A. (§5.4)

## Open questions

1. **Assistant read access to `agents/author/*`** (§1.2, §9): an operator call under Q-20. The fallback is shared-record-only, which costs the chat the outline provenance and the voice charter as context.
2. **Gate deadline defaults** (24 h / 2 h / 24 h): chosen by reasoning, not evidence; instrument time-to-approve and revise after the first hundred gates.
3. **Per-turn chat budget** (40 credits / 5 searches / 10 fetches) is a starting point; the right number depends on C14's measured cost per fetched page.
4. **`/deep-research` workflow** backing `/research`: note 7 records it cannot take mid-run input — confirm it can honour the URL policy service (hold-outs) and the per-run cap before relying on it; otherwise `/research` runs the `discourse-map` skill directly.
5. **Vega PNG rendering** needs a canvas native package whose compatibility with `@napi-rs/canvas` is unverified (note 9 open question 12); if it fails, docx/Google Docs export falls back to `resvg`-rasterized SVG (note 9 §7.1 already suggests `@resvg/resvg-js`).
6. **Variant concurrency vs tier limits**: whether queued variants should count as one run for the concurrency limit (user-friendly) or N (cost-honest).
7. **Comment delivery inside a single-context drafting phase** relies on the SDK's streaming-input mode being safe to use mid-`query()`; note 7 §3.1 documents the mode but not this pattern under load — needs a spike alongside G14/G15.
8. **Trial figure quota**: figures are cheap but a runaway iteration loop is a support hazard; consider a per-day figure-version cap on Trial.

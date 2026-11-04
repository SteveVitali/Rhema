# IDE core UX — information architecture, project management, layout, live runs, agent roles, findings, versions, artifact browser, design system, notifications, autosave

- Scope: ledger rows **D1, D2, D3, D4, D5, D6, D7, D8, D14, D16, D17** (touches C7, K1–K6, E1–E4, N1–N3, D20/D21 proposals) · Date: 2026-08-27
- Evidence base read in full: research notes 2 (source-system extraction), 3 and 4 (coding-agent UX), 5 (writing products + Substack), 8 (editor technology); notes 6 and 10 skimmed for trial/usage touchpoints; `~/agent-discourse/conventions/{project-memory,personas}.md`; founding prompt; ledger §0 theses, §Q decisions, change log.
- Citation form: `[N§x]` = research note N, section x; `Q-n` = operator decision; `T-n` = thesis; ⚑ = operator requirement from the founding prompt.

## Summary of decisions (≤ 300 words)

1. **IA is three levels deep and URL-addressable**: `/app` (workspace: Projects, Personas, Inbox, Usage, Settings) → `/p/:project` (the IDE) → `/p/:project/{v/:n | r/:run | a/:artifact}` (a draft version, a run, an artifact). Every gate, finding and version has a stable URL so notifications and mobile can deep-link (D1, D16, D19).
2. **The project list groups by attention, not persona, by default** — Needs you / Running / Ready to read / Quiet — with persona as a first-class filter, chip and optional grouping. This departs from the ⚑ "organise by persona by default"; reasoning in §3.3. New projects still land persona-less ("Unfiled") ⚑.
3. **The IDE is a dark shell around a paper page**: five named panes — Rail, Browser, Page (+ Margin), Timeline, Desk — with a three-tier disclosure policy (Default / On demand / Advanced). The Page never yields below a 45-ch measure; panes collapse first [5§7].
4. **The round timeline *is* the runs list** (T1 reconciled per [3§6.13]): one card per round, run cards with orchestrator-driven phase progress, a streaming research feed with a Summary/Normal/Verbose density toggle, live credits/elapsed against the cap, and five steering primitives. Gates are **approve-with-deadline** cards at three named gates — Structure Plan, Review Scope, Triage — default 30-minute deadline, conservative auto-path on expiry (Q-7, [4§6.1], [2§5 B20]).
5. **Agent roles are authorship, not navigation** (D5): no role tabs, no persona theatre. Roles appear as provenance badges on artifacts, as speaker labels on the timeline, and as a profile page (boundary, configuration, inspectable memory, spend). The user *is* the author [2§3]; the Editor's private memory is sealed and shown as a sealed count plus fetched URLs (T3 narrowed).
6. **Findings are anchored comments that may carry a suggestion**; dispositions (accept / adapt / rebut / defer / escalate) replace "resolve" and *write the response ledger*; bulk actions only behind a diff preview; second-read reconciliation shows corroborated and rejected findings (T2, [5§4]).
7. **Versions are immutable milestones on a rail**; the vN→vN+1 diff is annotated by response-ledger moves; a human edit to a reviewed draft *is* v(N+1) [8§5.3].
8. **Autosave has no "unsaved" state** (four layers); agents never write into a document a human can edit [8§5.1–5.2].

---

## 1. Design principles carried into every surface

| # | Principle | Source |
|---|---|---|
| P1 | The spine is the round log: outline → v1 → review → response → v2. Everything else hangs off a round. | T1; [2§4]; [3§6.13] |
| P2 | One run grammar everywhere: transcript-with-collapsed-tools + gating plan artifact + "what changed" surface + state-grouped run list. Swap the content types for prose. | [4 exec 1], [4§5] |
| P3 | Gates are soft by mechanism, on by policy: approve-with-deadline, never a blocking modal. | Q-7; [4§6.1] |
| P4 | The user is the author. The Author agent's memory is the user's own notebook; only the Editor's undelivered deliberations and persona hold-outs are sealed. | [2§3], [2§2] |
| P5 | Progress comes from the orchestrator's phase model, never from an agent-authored checklist. | [4§3.2], [4 impl. 9] |
| P6 | Never surprise on money: estimate + cap before, live meter during, run report after. Failed phases are not charged. | [10§5.5], [3§2.2] |
| P7 | Paper in a dark shell: dense sans chrome around a serif page with a 68-ch measure; the two textures are nested, never blended. | Q-14; [5§6–7] |
| P8 | "Save" is not a verb. Restore never deletes correspondence. Reviewed drafts are immutable. | [8§5.3]; [3§4.5]; [2§5 B13] |
| P9 | Show integrity as a feature: sealed memory, sources actually fetched, checks passed — as chips, not directories. | T3; [2§6 E6]; [4§3.8] |
| P10 | Three verbs at the input — Draft, Review, Respond — plus chat. Everything else lives in the palette. | [3§1.3] |

---

## 2. Information architecture and URL scheme (D1)

### 2.1 Navigation model

```
Workspace (app shell, dark)                       IDE (project scope)
┌───────────────────────────────┐                  ┌──────────────────────────────────┐
│ Rail: Projects · Personas ·   │  open project →  │ Rail (same) + project switcher   │
│       Inbox · Usage · Settings│                  │ Browser │ Page+Margin │ Timeline │
│ Main: list / detail pages     │  ← back          │ Desk (drawer)         Status bar │
└───────────────────────────────┘                  └──────────────────────────────────┘
```

- The **Rail** (56 px icon column) is the only persistent global chrome and is identical in both scopes, so leaving a project is one click and the Inbox badge is always visible [3§3.2 "session pill"].
- Workspace pages are *lists and detail pages*; the IDE is a *pane layout*. Nothing else. Persona surfaces (D10/D11), usage (D12) and settings (D13) are workspace pages designed by other rows; this note fixes their addresses and how the IDE links to them.

### 2.2 URL scheme

| Path | Surface | Notes |
|---|---|---|
| `/app` | Projects list (workspace home) | default landing after sign-in |
| `/app/inbox` | Inbox: gates waiting, runs finished, persona stale | D16 |
| `/app/personas`, `/app/personas/:persona` | Persona library, persona detail | D10 |
| `/app/usage`, `/app/usage/runs/:run` | Usage dashboard, run cost drill-down | D12 |
| `/app/settings/{profile,notifications,billing,…}` | Settings | D13 |
| `/p/:project` | IDE, opens the **current** draft version with the Timeline at the latest round | slug + short id (`/p/politics-of-visibility-8f3k`) |
| `/p/:project/v/:n` | IDE with draft `vN` on the Page (`/v/working` = the editable head) | D7 |
| `/p/:project/v/:n/diff/:m` | Compare `vN` → `vM` | D7 |
| `/p/:project/r/:run` | IDE with the run card expanded; `#gate` fragment focuses the gate card | D4; notification deep-link target |
| `/p/:project/a/:artifactId` | Any artifact opened on the Page (letter, claim ledger, plan, source note…) | D8 |
| `/p/:project/f/:findingId` | Page scrolled to the finding, Margin card open | D6; mobile deep link |
| `/p/:project/chat[/:thread]` | Desk drawer open on chat | D9 |
| `/p/:project/agents/:role` | Agent profile page (Author / Editor) | D5 |
| `/p/:project/settings` | Project settings: persona link, venue, gate policy, rigor default, paper theme | C7, D21 |

Rules: ids are short, immutable, and never encode state; the pane arrangement is *not* in the URL (it is per-user local state); `?focus=1` toggles Focus mode for shareable reading links (C13 later).

**REQ-IDE-1** Every project, version, run, gate, finding and artifact has a stable deep-linkable URL; opening one restores the IDE with the target focused and the rest of the layout from the user's last state.
**REQ-IDE-2** The Rail is identical in workspace and IDE scope and carries the Inbox badge count (gates waiting + unread finished runs).

---

## 3. Project management (D2)

### 3.1 The project list

```
/app                                                  [Search ⌘K]  [+ New project]
┌ Group by: Attention ▾ · Persona: All ▾ · Genre: All ▾ · Sort: Recent ▾ · ☐ Archived ┐
│
│ NEEDS YOU (2)
│  ● The Politics of Visibility     v2 · Triage waiting · auto-continues in 18 min   [Open gate]
│    Persona: sjs-substack · est. 1,240 cr · "12 accept / 4 adapt / 2 escalate proposed"
│  ● Structure of Political Difference   v4 · Review finished · 41 findings, 6 major  [Read]
│
│ RUNNING (1)
│  ◐ Constitution of Reason   Review of v2 · Fact-check 23/56 claims · 412 / 1,860 cr · 14 min
│
│ READY TO READ (1)
│  ○ …
│
│ QUIET (5)                                                     ▸ collapsed by default
│    Unfiled (3) · sjs-academic (2)
└
```

- **Row = project card** with: state icon (animated = running, amber = needs you, green = ready, grey = quiet, red = failed), title, current version, a one-line model-written status (Haiku-class, ≤ 120 chars) [4§3.2 agent view], persona chip (or "Unfiled"), and one primary action that matches the state [4§5 workspace row].
- **Attention groups** (Needs you / Running / Ready to read / Quiet) mirror the state grouping every studied product converged on [4§3.2], [3§6.13]. "Ready to read" = a run finished and its deliverable has not been opened.
- **Search** (⌘K from the list) matches titles, persona, venue, and *text inside drafts and letters* (server-side index on materialised markdown).
- **Row actions** (⋯): Open · Rename · Duplicate (drafts + outline + persona link; never correspondence — a duplicate starts a fresh round log with `origin=duplicate` recorded) · Change persona (policy in §3.4) · Export… · Archive · Delete (soft, 30 days).
- **Archive** = terminal state *Archived* from [2§4.4]; archived projects are read-only and hidden by default. **Accepted / Exported** show as end-of-round chips, not groups.
- **Templates**: MVP ships *genre templates* only (Academic article, Essay, Blog post, Report, Fiction chapter), each pre-setting venue bar, protocol variant (C5) and default rigor notch; user templates are v1.1.

**REQ-IDE-3** Project rows render state, version, a ≤120-char model summary, persona chip and one state-matched primary action; state derives from the run/version tables (P5), never from stored opinion.
**REQ-IDE-4** Quiet projects are collapsed by default; Needs-you rows sort by soonest gate deadline.

### 3.2 New-project flow — three entry points ⚑

```
[+ New project]
┌──────────────────────────────────────────────────────────────┐
│  Start from…                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │  Scratch    │  │  An outline  │  │  A draft             │ │
│  │  chat +     │  │  upload/paste│  │  upload/paste .md    │ │
│  │  research   │  │  .md .docx   │  │  .docx .pdf .txt     │ │
│  └─────────────┘  └──────────────┘  └──────────────────────┘ │
│  Title  [__________________]   Genre template [Essay ▾]      │
│  Persona [Unfiled ▾]  (change any time before v1)            │
│                                             [Create]         │
└──────────────────────────────────────────────────────────────┘
```

Numbered interaction:

1. User picks an entry point; the drop-zone accepts multi-format files (ingestion per note 9) and shows a conversion preview with warnings before Create.
2. Persona defaults to **Unfiled** ⚑; the picker lists the user's personas with their staleness pill (T5) and "Bootstrap a persona…" at the bottom.
3. Create → project enters state S0/S1/S2 from [2§4.2] and the IDE opens with the **next-step card** at the head of the Timeline: *Scratch* → Desk open on chat with the three research chips ("Research this", "Propose a structure", "Make an outline") [6§5.2]; *Outline* → outline on the Page, "Draft v1 from this outline" card with estimate; *Draft* → draft on the Page as `v1 (imported)`, "Review v1" card with estimate.
4. The fourth entry point from [2§4.3] — draft + existing dossier (the COR path) — is exposed as an *Import review* action inside the project, not on the create dialog (rare; keeps the dialog to three ⚑).

**REQ-IDE-5** New-project dialog offers exactly three entry points ⚑ plus title, genre template and persona (default Unfiled ⚑); creation lands the user on a Timeline whose head is the correct next-step card for the resulting state.

### 3.3 Grouping by persona — argued, and kept as secondary

⚑ says "perhaps the projects should by default also be organized by persona, though the default location for new projects should be the persona-less case." Q-20 makes this defeasible. **Decision: attention is the default grouping; persona is a filter, a chip on every row, and an alternative grouping one click away.** Reasons:

1. *Every* coding-agent product studied groups its home list by *what needs the human* (Claude Code agent view, Devin Command Center, Replit board, Codex inbox) [4§3.2], [4§1.2], [3§4.4]; the founding prompt names these as the inspiration set, and the reason they converged is that runs are long and asynchronous — the user returns to find out what happened, not to browse a taxonomy. Rhema's runs are longer still (minutes to hours, Q-10).
2. For a single author (Q-6) the persona distribution is degenerate: most projects will be Unfiled or under one or two personas [2§2.2 — three personas, three projects in the source system], so persona grouping produces one large "Unfiled" bucket and adds a level of hierarchy without discrimination.
3. Persona grouping hides the state signal — a "Needs you" project under a collapsed persona group is exactly the failure Codex's inbox and Claude's "2 awaiting input" title exist to prevent.
4. The operator's underlying intent — *persona as an organising identity* — is honoured three ways: the persona chip on every row, `Persona: ▾` as the first filter, and `Group by: Persona` (remembered per user). Inside the persona detail page (D10) the "Projects written under this persona" list is the persona-first view.

If usage data later shows multi-persona users dominate (journalists with house styles, ghostwriters), the default flips per user via a setting, not a redesign.

**REQ-IDE-6** Group-by defaults to Attention; Persona grouping and filtering are available and persisted per user; new projects default to Unfiled ⚑.

### 3.4 Change-persona policy (UI half of J5)

- Before v1 exists: freely changeable from the project header persona chip.
- After v1 exists: the chip shows a lock; the menu offers **Fork under another persona** (duplicate with new persona, drafts copied, correspondence not) and explains why ("the voice charter for this piece names sjs-substack; switching would silently conflict" [2§4.4 item 8]). This matches the operator's lean ⚑ and the convention's precedence chain.

**REQ-IDE-7** Persona is editable until the first draft version exists; afterwards only "Fork under another persona" is offered, with the reason stated inline.

---

## 4. The IDE layout (D3)

### 4.1 Named panes

```
┌──┬────────────────┬──────────────────────────────────────────┬───────────────────────┐
│R │ BROWSER        │ PAGE                         │ MARGIN    │ TIMELINE              │
│A │ ▸ Outline      │ ┌──────────────────────────┐ │ ┌───────┐ │ ● Round 2 · running   │
│I │ ▾ Drafts       │ │ The Politics of          │ │ │▲ major│ │   Review of v2        │
│L │   v2 ● current │ │ Visibility               │ │ │ claim │ │   ├ Intake ✓          │
│  │   v1 🔒        │ │                          │ │ │ unsup.│ │   ├ Fact-check 23/56  │
│  │ ▾ Rounds       │ │ I. The visible and the   │ │ └───────┘ │   ├ Discourse map ◐   │
│  │   Round 1 ✓    │ │ seen…                    │ │           │   └ …                 │
│  │ ▸ Research     │ │   ~~~~~~~~~~ (finding)   │ │ ┌───────┐ │ ○ Round 1 · done      │
│  │ ▸ Persona      │ │                          │ │ │ minor │ │   v1 → review → v2    │
│  │ ▸ Assets       │ └──────────────────────────┘ │ └───────┘ │ ▸ Outline             │
│  │                │  68ch serif column, centred  │           │ [Draft] [Review] [Respond]
├──┴────────────────┴──────────────────────────────┴───────────┴───────────────────────┤
│ DESK ▴  Chat · Live feed · Findings list · Claims                                    │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ status: v2 · working · synced ✓ · 2,146 words · est. read 9 min · Round 2: 412/1,860 cr │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

| Pane | Purpose | Default | Toggle |
|---|---|---|---|
| **Rail** | Global nav + project switcher + Inbox badge | visible | never hides (Focus mode excepted) |
| **Browser** | Typed artifact sections (§9) | **collapsed** to a 36-px strip with section icons | `⌘1` |
| **Page** | The reading/writing surface (draft, letter, plan, any artifact) | visible, always | — |
| **Margin** | Finding cards/ticks beside the Page (§7) | visible when the open version has findings; ticks-only below 1280 px | `⌘3` cycles Margin / Full / Clean |
| **Timeline** | Round log = runs list, gate cards, next-step card, three verbs (§5) | visible | `⌘2` |
| **Desk** | Bottom drawer with tabs: Chat (D9), Live feed (§5.4), Findings list, Claims table | **closed**; auto-opens on Live feed when a run starts, on Chat for scratch projects | `⌘J` |
| **Status bar** | version · sync pill · word count · reading time · live credit meter for the active run | visible | — |

Widths at 1440 px: Rail 56 · Browser 240 (when open) · Page 660 + Margin 280 · Timeline 320. The Page column is *fixed to the measure* (§10.2); Margin and Timeline absorb width; below 1280 px the Margin collapses to ticks and the Timeline becomes an overlay; below 1024 px the layout is single-column with the Timeline as a sheet (mobile is D19's Expo app, but the web must degrade).

**Resizing**: Browser and Timeline have drag handles with snap points; the Page never resizes below 45 ch and never above 80 ch [5§7]; drags that would violate this collapse the adjacent pane instead.

**Focus mode** (`⌘⇧F`): hides Rail, Browser, Timeline, Desk and status bar; keeps the Page and finding *ticks* in a thin margin so review context is never lost [5§6]; `Esc` exits.

**Reading modes** on the Page (`⌘⇧M` cycles): Write (WYSIWYG) · Source (markdown, CodeMirror) · Read (typeset, no editing chrome; also the print stylesheet) [8§3.5].

### 4.2 Progressive-disclosure policy

Three tiers, applied to every control in the IDE:

| Tier | Rule | Examples |
|---|---|---|
| **Default** (visible on first open) | What a writer needs to read, write, run the next step, and answer a gate | Page, Timeline with next-step card and the three verbs, Margin, status bar, sync pill, cost meter |
| **On demand** (one keystroke or one click, discoverable via the palette) | Anything that inspects or configures | Browser, Desk tabs, claims table, run report, rigor notch, gate policy, version diff, Source mode |
| **Advanced** (behind an explicit "Advanced" disclosure, remembered per user) | Anything that exposes mechanism | raw token counts [10§7.6], model names behind rigor notches [4§4.3], agent memory file lists, restore-point list older than today, Verbose feed density |

Rules: (a) nothing in Advanced is required to complete any workflow; (b) nothing in Default has a cost attached except the three verbs, which always show an estimate first; (c) the first run of each verb opens a one-time inline explainer card on the Timeline instead of a modal tour.

**REQ-IDE-8** The IDE has exactly the seven named regions above; Browser and Desk are closed by default, Margin appears only when findings exist; all pane state is per-user, per-project and restored on reopen.
**REQ-IDE-9** The Page column width is clamped to [45 ch, 80 ch] with a 68-ch target; panes collapse before the clamp is violated.
**REQ-IDE-10** Every control is classified Default / On demand / Advanced; Advanced controls are hidden behind a persisted disclosure and never gate a workflow.

---

## 5. The round timeline as the runs list (D4, K1–K6)

### 5.1 Anatomy

The Timeline pane is a vertical list, newest at top, of **round cards**. A round card contains, in order, the artefacts and runs of that round: `vN` chip → review run → response run → `v(N+1)` chip. Above the newest round sits the **next-step card**; below the oldest sits the **Outline** chip (or "Imported draft"). This is the manifest round log rendered as a list of run rows [2§2 #1], which is how T1 is reconciled with the sessions-first reality of every coding product [3§6.13].

```
┌ TIMELINE ───────────────────────────────────┐
│ [Draft ▾] [Review ▾] [Respond ▾]     ⌘⇧R    │   ← the three verbs; each opens the launch sheet
│─────────────────────────────────────────────│
│ NEXT  Review v3 · est. 1,240 cr · Standard  │   ← next-step card (state machine [2§4.2])
│─────────────────────────────────────────────│
│ ROUND 2                                      │
│  ◐ Review of v2                 14 min · 412/1,860 cr │  ← run card (expanded)
│     ✓ Intake · piece brief                    │
│     ⏸ Review scope — approve · 18:42 left     │  ← gate card inline
│     ◐ Fact-check     23 / 56 claims           │
│     ○ Discourse map                          │
│     ○ Argument & substance                   │
│     ○ Craft                                  │
│     ○ Second read (independent)              │
│     ○ Editor's letter + rubric               │
│     [Pause] [Cancel…] [Steer ▾]  [Live feed]  │
│  ● v2  ·  human-revised  ·  12,350 words     │
│─────────────────────────────────────────────│
│ ROUND 1                                    ▸ │  ← collapsed: "v1 → review (49 findings) → response (14 moves) → v2"
│─────────────────────────────────────────────│
│ ▸ Outline · 10,125 words · uploaded          │
└─────────────────────────────────────────────┘
```

### 5.2 Run card states and content (K1)

Run state machine (orchestrator-owned): `queued → running(phase i/n) → waiting(gate) → running … → completed | failed(phase i) | cancelled(phase i)`; every state carries the list of artefacts emitted so far.

| State | Card shows | Primary action |
|---|---|---|
| queued | position, "starts when Round-1 response finishes" or "starts when credits reset" [4§3.8] | Cancel |
| running | phase list with ✓/◐/○, live counters per phase (`23/56 claims`, `6 sources read`, `2/3 audit walks`), elapsed, **credits spent / cap**, ETA band ("~20–35 min", from historical phase timings, K4) | Pause · Cancel… · Steer ▾ · Live feed |
| waiting (gate) | gate card (§5.5) with countdown | Approve (etc.) |
| completed | one-line model summary; deliverable chips (Letter · 41 findings · Claims 56 · Second read · Rubric); cost actual vs estimate; "Run report" link | Open deliverable |
| failed | phase where it died, partial artefacts kept and listed, credits refunded for the failed phase [3§2.2 fairness], "Resume from phase i" | Resume · Report |
| cancelled | same as failed minus the error; partial artefacts labelled *partial* | Resume |

Phase counters come from structured events (K2), not from parsing agent prose (P5). The phase list is the skill's own phase vocabulary [2§1.5] rendered with user-facing names:

| Skill | User-facing phases (in order) |
|---|---|
| Draft (draft-from-outline) | Intake · Voice · **Structure plan ⏸** · Grounding · Drafting (§ i/n) · Consolidation · Fidelity audit (walk i/6, iter i/3) |
| Review (editorial-review) | Intake · **Review scope ⏸** · Fact-check · Discourse map · Argument · Craft · Second read · Letter & rubric |
| Respond (respond-to-review) | Bootstrap · Verification · **Triage ⏸** · Revise (move i/n) · Verify new claims · Gap analysis (iter i/3) · Deliver |

Opt-out phases (grounding, audit, fact-check, discourse, second read, research, gap analysis) appear in the phase list *greyed with "off"* when the rigor notch disabled them, so the user always sees what was skipped [4 exec caveat on T4].

**REQ-IDE-11** Run cards render orchestrator-emitted phase state, per-phase counters, elapsed time, credits spent against the cap, and an ETA band; no progress element derives from agent-authored text.
**REQ-IDE-12** Skipped opt-out phases are listed as "off" on the run card and in the run report.

### 5.3 The launch sheet (the three verbs)

Each verb opens a sheet, not a page (D18's single paywall location [6§5.3]):

```
┌ Review v2 ────────────────────────────────────────────┐
│ Target   v2 (working head will be promoted to v2)      │
│ Rigor    ○ Quick  ● Standard  ○ Elite     [what's this]│
│ Phases   ☑ Fact-check (~740 cr) ☑ Discourse map (~210) │
│          ☑ Second read (~160)                          │
│ Stage    ○ early  ● near-final     Venue  [LRB ▾]      │
│ Concerns [free text → `concerns` input]                │
│ Gates    ● Three named gates  ○ Every phase  ○ None    │
│──────────────────────────────────────────────────────  │
│ Estimate  ≈ 1,240 cr ($12.40) · cap 1,860 · you have 3,410 │
│ [Run review]                             [Cancel]      │
└────────────────────────────────────────────────────────┘
```

- Estimate/cap semantics per [10§5.5]; the rigor notch bundles model tier + effort + second-read model [4§4.3]; toggling a phase updates the estimate live [10 impl. 4].
- Launching a Review or Respond on the working head first **promotes** it to `vN` (§8), shown inline ("will be promoted to v2").
- Insufficient balance swaps the primary button for "Add credits" / "Switch to Quick"; nothing else changes [6§5.3 item 6].

**REQ-IDE-13** Every run is launched from a sheet showing target version, rigor notch, phase toggles with credit deltas, gate policy, estimate, cap and balance; the primary button is the only paywall.

### 5.4 Streaming research feed (K2)

The Desk's **Live feed** tab renders the run's event stream. Three densities (`⌘⇧V` cycles), borrowed from Claude Code's Normal/Verbose/Summary [4§3.8]:

| Density | Shows |
|---|---|
| Summary | phase cards only (start/finish, counters) |
| Normal (default) | phase cards + notable events: `source read` (title, domain, favicon), `claim checked` (short claim → verdict chip), `finding emitted` (severity + first 80 chars), `artifact written` (chip), `subagent started/finished` (e.g. "Second read (fresh context, draft only)"), `check passed 3/3` |
| Verbose (Advanced) | every search query and fetch, blocked-domain notices, retry notices |

Event schema (the contract G7 must serve; nothing here carries prompt text or private-memory content):

```ts
type RunEvent =
  | { t: "phase.start" | "phase.end"; run: RunId; phase: PhaseId; at: ISO; counters?: Record<string, number> }
  | { t: "search"; run: RunId; phase: PhaseId; query: string }                 // Verbose only
  | { t: "source.read"; run: RunId; phase: PhaseId; url: string; title?: string; sourceNoteId?: Id }
  | { t: "claim.verdict"; run: RunId; claimId: Id; verdict: Verdict; url?: string }
  | { t: "finding.emitted"; run: RunId; findingId: Id; severity: Severity; kind: FindingKind }
  | { t: "artifact.written"; run: RunId; artifactId: Id; type: ArtifactType; partial: boolean }
  | { t: "subagent"; run: RunId; phase: PhaseId; label: string; inputScope: string[]; state: "start" | "end" }
  | { t: "check"; run: RunId; phase: PhaseId; name: string; passed: number; total: number }
  | { t: "gate.open" | "gate.resolved"; run: RunId; gate: GateId; deadline?: ISO; decision?: GateDecision }
  | { t: "cost"; run: RunId; credits: number; cap: number }                       // ≤ 1 s cadence
  | { t: "run.state"; run: RunId; state: RunState; reason?: string };
type Verdict = "verified" | "substantially_accurate" | "misleading_in_context" | "unsupported" | "contradicted" | "unverifiable";
```

Finding events are *also* pushed into the Margin as they arrive when the reviewed version is open (the "first finding visible in < 90 s" activation moment [6§5.2]); they render as *provisional* (dashed border) until the run delivers, because the letter may fold or reconcile them (§7.4).

**REQ-IDE-14** The live feed renders `RunEvent`s in three densities; Verbose is Advanced-tier; no event type carries prompt text, agent reasoning, or private-memory content.
**REQ-IDE-15** Findings stream into the Margin as provisional cards during a review run and are finalised at delivery.

### 5.5 Gate cards — approve-with-deadline at three named gates (C7, Q-7)

Gates are cards inside the run card, mirrored to the Inbox and to push (D16). Every gate has the same skeleton; the *artifact* differs.

```
┌ ⏸ Review scope · approve ─────────────────────────────── 18:42 ┐
│ The Editor read v2 and proposes to check 56 claims (46 Tier-1),│
│ map the discourse around "visibility as jurisdiction", and     │
│ hold the piece to the LRB essay bar. Revised estimate 1,310 cr.│
│ [Open piece brief]   [Add concerns…]                           │
│ (● Approve)  (Approve & gate every phase)  (Keep planning ▾)   │
│ ○ Wait for my approval (disable the timer)                     │
└────────────────────────────────────────────────────────────────┘
```

| Gate | Skill / phase | Artifact shown on the Page | On approve | On "Keep planning" | Auto-path on deadline |
|---|---|---|---|---|---|
| **Structure plan** | Draft, after Phase 2 [2§1.1] | `02-structure-plan.md` + commissioning brief + voice brief; open questions listed | proceed to Grounding | user supplies guidance (text) or comments on the plan; agent re-plans (capped at 3 re-plans — the uncapped 2↔3 loop [2§5 B19] gets a cap here) | proceed, open questions resolved conservatively and flagged in the drafting note (skill's own rule) |
| **Review scope** | Review, after Phase 0 intake | `00-piece-brief.md`: thesis as the editor read it, claim inventory with tiers, research agenda, venue bar; **revised estimate** | proceed to Fact-check/Discourse/Craft in parallel | user edits concerns / de-scopes claims (uncheck rows) / changes stage; agent re-intakes | proceed as proposed |
| **Triage** | Respond, after Phase 2 [2§1.3] | the **triage ledger** rendered as the Findings list with the agent's proposed disposition per finding (§7.6) | proceed to Revise | user overrides dispositions and adds guidance; agent re-triages | proceed with proposals; escalations resolved conservatively and flagged at the top of the response letter (skill's own rule) |

Mechanics:

1. Deadline default **30 minutes** (prose gates are read, not skimmed [4§4.6 item 7]); per-project policy offers 10 min / 30 min / 2 h / *Wait for my approval* (no timer). Trial preview runs pre-approve the structure-plan gate [6§5.2].
2. The countdown pauses while the user has the gate artifact open (activity within 60 s), so a slow reader is never timed out mid-read.
3. **"Approve & gate every phase"** converts the remaining run to phase-by-phase gating (Claude Code's "Yes, manually approve edits" analogue [4§3.3]).
4. **Standing guidance**: any gate can be answered with "…and don't ask this again for this project" (scoped rule, [4§3.8]); listed and revocable in project settings.
5. The gate decision is recorded as a `GateDecision {gate, decision, by: user|deadline, guidanceText?, at}` and shown on the round card permanently ("approved by you at 14:02" / "auto-continued at 14:32").
6. A **spend gate** is a fourth, unnamed gate that any run can open: "this run will exceed its cap by ≈ 20 % — continue?" (L6). Its deadline is *wait indefinitely*, because the alternative is silent billing [10§2.5].

Steering (K5), available from `Steer ▾` on a running card — the five primitives from [4§6.2] at phase granularity:

| Primitive | Behaviour |
|---|---|
| Pause | finishes the current tool batch, then holds; the Page is unfrozen for reading only |
| Queue guidance | text delivered at the next phase boundary; editable until delivered [4§1.2] |
| Comment on a passage/finding | inline comment on the Page or a finding card; batched into the next phase boundary (Warp/Claude batching [4§4.5]) |
| Edit the plan mid-run | structure plan (during Drafting) and triage ledger (during Revise) are editable; the agent is notified at the next section/move boundary (K7) |
| Cancel (keep partials) | confirm sheet lists which artefacts survive; refund of the cancelled phase |

**REQ-IDE-16** Three named gates (Structure plan, Review scope, Triage) render as approve-with-deadline cards with a 30-minute default, pause-while-reading, "Wait for my approval" opt-out, and a recorded decision; the deadline auto-path is the skill's conservative path, flagged in the deliverable.
**REQ-IDE-17** The spend gate never auto-continues.
**REQ-IDE-18** Running cards expose Pause, Queue guidance, Comment, Edit-plan and Cancel-keep-partials; cancelled/failed phases are refunded.

### 5.6 Round walkthrough and run report (D20 proposal)

> **Amended 2026-11-03 (ADR-130, GD-UX-WALKTHROUGH.R7 "Retire it"; 213 R7COPY.0).** The ≤200-word
> model-written Walkthrough is retired: the R5 audit found it factually wrong and leaking internals
> (C3). The run card's "What it delivered" is now **composed deterministically from the delivered
> record** — the letter's verdict line quoted verbatim, the finding/claim counts (one rule), and the
> dossier/letter/ledger links. Nothing generated, no model call, no retry surface. The **Run report**
> is unchanged. D20's model-summary arm is closed by this amendment.

On completion the run card gains two links: **Walkthrough** (≤ 200 words, model-written: what was delivered and the one thing to read first — Antigravity's walkthrough [4§4.2]) and **Run report** (phase timings, credits by phase × role, flags such as "fact-check dominated 62 % — 71 claims", unmet targets, and *suggested guidance for next round* — Devin Session Insights [4§1.2]). The run report is the D12 drill-down's leaf; tokens are Advanced-tier.

**REQ-IDE-19** ~~Completed runs expose a ≤200-word walkthrough and~~ a run report (phase × role credits, flags, suggested guidance); raw tokens are behind the Advanced disclosure. *(Amended 2026-11-03, ADR-130: the walkthrough arm retires — see the banner above; REQ-COPY-4 replaces it with the record-composed block.)*

---

## 6. Agent roles from first principles (D5, T1)

### 6.1 The question, and what the evidence constrains

The founding prompt asks whether separate agent roles should be represented in the IDE "if this even makes sense to begin with." Four options were on the table: (a) roles as tabs/panels, (b) roles as personas in one chat, (c) roles as authors of artifacts on the timeline, (d) hidden entirely.

Constraints from the evidence:

- The roles are *real* in the data model: the boundary rule (author ↔ editor never cross-read) is "what keeps rounds honest" and the product's integrity guarantee [conventions/project-memory §boundary; 2§3]. Hiding it (d) would discard the one thing a marketing page can say that Reviewer3-style products cannot: "independent second read, not reviewer theatre" [5§2.2].
- The user *is* the author [2§3]: `guidance` outranks the charter, escalations go to the human, the outline is the human's file. So "Author agent" is the user's own assistant, not a peer — a tab labelled *Author* next to one labelled *Editor* would misstate the relationship.
- Coding IDEs put agents in a side panel and files in the centre; every product has since become *session*-first [3§6.13]. But none has two agents with *asymmetric memory* — the closest analogue is Amp's "oracle" (a second model for a second opinion) [4§4.3], surfaced as a badge, not a tab.
- Chat-with-personas (b) is the README's explicitly rejected "persona review-board theater" [5§2.2]; it also blurs the memory boundary — who is speaking determines what may be read.

### 6.2 Decision

**Roles are authorship and boundary, not navigation.** Concretely:

1. **On the Timeline**, each run card and each deliverable carries a role badge: *Author* (drafts, drafting notes, response letters) or *Editor* (dossiers, letters, second reads). Runs are named by verb ("Review of v2"), not by agent ("Editor session"), because the user thinks in rounds (P1).
2. **In the Browser**, provenance badges (§9) name the role and run that produced each artifact.
3. **In chat** (D9), there is one assistant voice, "Rhema", with *author-scope* access: it may read the shared record and the Author's memory and never the Editor's. It does not role-play the editor; asking "what would the editor say?" launches (or suggests) a review. This keeps the boundary mechanical.
4. **Agent profile pages** (`/p/:project/agents/author|editor`) exist, reached from any badge, and are where configuration, memory and spend live. They are on-demand tier.
5. **No tabs, no panel per role, no persona theatre.**

Naming: keep **Author** and **Editor** (the conventions' names; they map to the human roles a writer already understands). The composite "editorial board" is marketing language for the Editor run's phases (fact-checker, discourse mapper, second reader are *phases and subagents*, shown as such in the feed), not additional roles. Future roles (steelman, discourse-mapper, C16) are new verbs whose runs carry a new badge — the model extends without new navigation.

### 6.3 What an agent profile page shows

```
/p/politics-of-visibility/agents/editor
┌ Editor ────────────────────────────────────────────────────────────┐
│ Boundary   Reads: drafts · correspondence · persona (structure,     │
│            venue, positions, continuity — never voice files)        │
│            Never reads: the Author's notebook  ✓ enforced by runtime│
│ Config     Protocol: Academic essay · Rigor default: Standard       │
│            Second read: independent model  ·  Venue bar: LRB        │
│ Memory     Sealed working notes (2 rounds)  ·  Sources fetched: 52  │
│            [View fetched URLs]         (deliberations never shown)  │
│ Spend      This project: 2,710 cr across 2 runs  ▁▃▆   [Usage →]   │
│ Runs       Review of v1 · 49 findings · 1,450 cr · 31 min           │
│            Review of v2 · running                                   │
└────────────────────────────────────────────────────────────────────┘
```

| Section | Author page | Editor page | Source |
|---|---|---|---|
| Boundary | readable/writable sets as prose + "enforced by runtime" chip (replaces self-attestation; F4) | same | [2§5 B1–B2, B21] |
| Config | model/rigor default, protocol variant, register (for composites), standing guidance list | same | F2, [4§4.3] |
| Memory | inspectable list: outline, drafting dossiers per version, research index (124 notes), voice charter, response ledgers — each opens read-only on the Page; "Add guidance" instead of edit on the charter | *sealed*: counts only + **fetched URLs list** (E6 transparency floor) | [2§2 #12–23]; T3 narrowed |
| Spend | credits by run, sparkline, link to usage drill-down | same | T7, D12 |
| Runs | run rows filtered to this role | same | [3§3.2] |

**REQ-IDE-20** Roles appear as badges on runs and artifacts and as profile pages; there are no role tabs or per-role chat personas.
**REQ-IDE-21** The Author profile lists inspectable memory artifacts opening read-only; the Editor profile shows only counts and fetched URLs; both show boundary, config, spend and runs.
**REQ-IDE-22** The chat assistant operates with author-scope access and cannot read Editor memory.

---

## 7. The findings surface end-to-end (D6, T2)

### 7.1 The finding object

```ts
type Severity = "blocking" | "major" | "minor" | "note";     // note = copy-edit / line-level
type FindingKind = "claim" | "discourse" | "argument" | "structure" | "craft" | "voice" | "continuity";
type Origin = "editor" | "second_read" | "both";               // both = corroborated in reconciliation
type Disposition = "accept" | "adapt" | "rebut" | "defer" | "escalate";

interface Finding {
  id: Id; reviewId: Id; versionId: Id;                          // Review keyed (version, run) — F9
  kind: FindingKind; severity: Severity; origin: Origin;
  reconciliation?: "kept" | "rejected";                         // second-read findings the editor did not adopt
  anchor: { quote: string; start?: RelPos; end?: RelPos; confidence: number } | null;   // null = unanchored
  title: string; body: string;                                  // markdown, short
  evidence?: { claimId?: Id; verdict?: Verdict; urls: { url: string; accessed: ISO }[] };
  suggestion?: { replacement: string };                         // optional proposed text
  rubricDims: RubricDim[];                                      // which of the 8 dimensions it bears on
  letterSection?: "one_thing" | "major" | "strength" | "roadmap" | "considered_rejected";
  disposition?: { value: Disposition; rationale: string; by: "user" | "author_agent"; at: ISO; moveId?: Id; frozen: boolean };
}
```

Anchoring follows [8§3.2]: quote → range on the frozen `vN` (exact → normalised → fuzzy with confidence); unanchored findings are never dropped — they head the list under "Whole piece". Findings render as **decorations, never marks**, so the markdown stays clean and reviewed drafts stay immutable [8§3.1–3.2].

### 7.2 Three surfaces, one list

The same `Finding[]` powers: the **Margin** beside the Page; the **Findings list** in the Desk (sortable table); the **Triage ledger** at the gate (§5.5). Selecting a finding in any of them highlights it in the others.

```
PAGE                                         MARGIN
…the state does not merely watch; it         ┌ ▲ MAJOR · claim · unsupported ──────┐
adjudicates who may be seen, and the          │ "the 2019 Home Office guidance…"    │
2019 Home Office guidance made this           │ No such guidance located; closest    │
explicit when it ~~~~~~~~~~~~~~~~~~~~~~~      │ is the 2020 …  [gov.uk ↗] [wayback ↗]│
                                              │ Editor · Fact-check · corroborated ✓ │
                                              │ [Accept] [Adapt] [Rebut] [Defer] [⋯] │
                                              └──────────────────────────────────────┘
```

**Highlight styling**: underline weight and hue encode severity (blocking = solid 2 px, major = solid 1.5 px, minor = dotted, note = faint); hue by kind (claim = amber, discourse = violet, argument = blue, craft = teal, voice/continuity = rose); overlapping findings stack as multiple underlines and a numbered tick. Colours are desaturated in dark mode and all meet 3:1 against the paper [8§3.5].

**Margin views** (`⌘3` cycles; Word's Simple/All/No Markup [5§4.2]):
- *Margin*: cards beside their passages; one tick per finding.
- *Full*: cards + inline severity bars in the text + the suggestion rendered as a track-change preview.
- *Clean*: ticks only.

**Filters** (Desk list and Margin share them): severity, kind, origin (editor / second read / corroborated / rejected-by-reconciliation), disposition state, section, "has evidence URL", "has suggestion".

### 7.3 Evidence

Claim findings show the verdict chip from the six-verdict vocabulary [2§1.5] and every URL the editor fetched for it with its accessed date; clicking opens the source in a new tab and, if a source note exists, the note in the Page's side sheet. Because B11 requires every cited URL to appear in the run's fetch log, the card can show a **"fetched ✓"** chip per URL — the transparency floor made visible (E6).

### 7.4 Second-read reconciliation

The independent second read [2§1.2 Phase 5] produces its own findings against the draft alone. The editor reconciles. The UI shows:

- **Corroborated** (origin = both): a ✓✓ chip "also raised independently" — the strongest signal a finding carries.
- **Second read only, kept**: origin = second_read.
- **Rejected by reconciliation**: shown to the author (the ledger's own "considered and rejected" section [2§2 #5]) in a collapsed group at the bottom of the list, with the editor's reason. They carry no disposition controls but can be **promoted** ("I want to address this anyway"), which creates a user-origin ledger row.

**REQ-IDE-23** Findings render as decorations on the frozen reviewed version with severity/kind styling; unanchored findings are listed, never dropped.
**REQ-IDE-24** Margin, Desk list and Triage gate share one `Finding[]` with linked selection and common filters.
**REQ-IDE-25** Claim findings display verdict, evidence URLs with accessed dates and a per-URL "fetched" chip derived from the run's fetch log.
**REQ-IDE-26** Reconciliation states (corroborated / second-read-only / rejected) are visible; rejected findings are shown collapsed with reason and can be promoted.

### 7.5 Dispositions write the response ledger

The five verbs map one-to-one onto the response ledger's disposition column [2§1.3]. Interaction:

1. Click a verb on the card → an inline rationale field appears (required for rebut/defer/escalate; optional for accept; for **adapt** an editable suggestion box opens pre-filled with the agent's suggestion if any — Word's editable suggestion box [5§1.2]).
2. Enter → the card collapses to a one-line dispositioned state with the verb chip; the Desk list updates; the ledger row is written as `status: proposed, by: user`.
3. Dispositions made **before** a Respond run is launched are *pre-triage*: the launch sheet shows "you pre-triaged 14 of 41; the Author will honour these as guidance" and passes them with highest precedence (human guidance > charter [conventions/personas §precedence]).
4. Dispositions made **at the Triage gate** override the agent's proposals row by row.
5. At delivery the ledger is **frozen** (B14): cards show a lock; changing a disposition after delivery is impossible — the next round's review reads the response letter and re-raises if warranted.
6. Each frozen ledger row links forward to its **move** (§8.3) and the changed range in v(N+1).

Keyboard: `J/K` next/previous finding, `A/D/R/F/E` = accept/adapt/rebut/defer/escalate, `Enter` open, `Esc` collapse (Substack Reader's J/K precedent [5§3.1]).

**REQ-IDE-27** Each disposition writes a response-ledger row with verb, rationale and author; rows are editable until the Respond run delivers, then frozen and linked to their move.
**REQ-IDE-28** Pre-triage dispositions are passed to the Respond run as highest-precedence guidance and shown as such on the launch sheet.

### 7.6 Bulk actions with preview

Bulk verbs exist only for classes that are safe to batch: *Accept all notes (copy-edits)*, *Accept all in section*, *Defer all minor*. Each opens a **preview sheet**: a diff of the affected suggestions applied to a scratch copy (suggestion marks, [8§3.3a]) with per-item checkboxes; Confirm writes the rows. There is no blind "accept all" (Docs' "preview with/without changes" rule [5§4.2 item 3]).

**REQ-IDE-29** Bulk dispositions are limited to note/minor classes and always pass through a per-item diff preview.

### 7.7 Rubric view

The rubric is 8 dimensions scored 1–5 with entailment caps and **no aggregate** [2§1.2]. The Desk's Findings tab has a *Rubric* sub-view:

```
Dimension            Score   Cap    Why capped / findings
Thesis & originality  4      —      3 findings ▸
Evidence              2      ≤2     capped: 2 Contradicted claims (F-07, F-19) ▸
Argument              3      —      …
…
```
Each row lists the findings that bear on it (`rubricDims`); the cap reason links to the capping findings. No summary number is ever shown (the skill forbids one; rendering one would misstate the protocol).

### 7.8 Editor's letter view

The letter (`editors-letter.md`) opens on the Page in Read mode with a sticky mini-TOC of its sections (Verdict · The one thing · Majors · Strengths · Roadmap · Considered and rejected · Attestation). Every passage reference in the letter ("§XI ¶2 …") is resolved at ingest into a link to the finding/anchor; hovering shows the quoted passage. The verdict and "one thing" are also lifted into the round card summary. The attestation section is replaced by the runtime's generated access report chip ("boundary held ✓ · 52 URLs fetched · second read: draft only") [2§5 B21].

**REQ-IDE-30** The rubric view shows per-dimension scores, caps with reasons and linked findings, and never an aggregate.
**REQ-IDE-31** The editor's letter renders with resolved passage links and a runtime-generated attestation chip.

---

## 8. Versions and diffs (D7, N3)

### 8.1 Version rail

A horizontal rail at the top of the Page (or in the Browser's Drafts section):

```
Outline → v1 🔒 → v2 🔒 → v3 ● working        [Compare ▾] [Restore points ▾]
          Author   human-revised  human
          review ✓ review ✓       —
```

Each chip: version, origin (`drafted-from-outline | response-to-review | human-upload | human-revision | duplicate`), reviewed/answered flags, word count, date. 🔒 = immutable (reviewed or responded to, B13). The working head is the only editable version and is labelled "vN · draft" [8§5.3].

Restore points (tier 2 of [8§5.3]) live in a dropdown grouped "Earlier today / Yesterday / Before Review of v2 (workflow) / Named"; picking one previews (prosemirror-changeset diff) and *Restore* applies as an undoable transaction; restore never touches correspondence or agent memory [3§6.5].

### 8.2 Immutability signals

- Opening a locked version shows a lock in the rail and a banner: "v2 was reviewed on 26 Aug — edits will start v3". Typing forks immediately to the working head (no confirm; the banner turns into the working chip) [8§5.3 rule 1].
- During a review run the input version is **frozen**; a banner offers "keep editing in a working copy" (§11.3).
- Human-revised versions carry a **"claims pending verification"** chip: text added by the human since the last reviewed version is marked as unverified for the next review (N4 proposal, [2§4.5]).

### 8.3 Diff annotated by response-ledger moves

`Compare ▾` opens `/p/:project/v/:n/diff/:m`. Three layouts (tab): **Side-by-side**, **Inline** (insert/delete decorations), and **What changed and why** — the list view that is the deliverable's review surface:

```
WHAT CHANGED · v2 → v3 · 14 moves · 6 accepted · 5 adapted · 2 rebutted · 1 deferred
┌ Move 3 · Replace the Home Office example ─────────── discharges F-07 (major, claim) ┐
│ accept · "The 2019 guidance could not be located; replaced with the 2020 …"        │
│ §II ¶4  −2 sentences  +3 sentences                                     [Jump] [▸]   │
└────────────────────────────────────────────────────────────────────────────────────┘
┌ Move 9 · Tighten §V transition ───────────────────── adapts F-22, F-23 (minor, craft) ┐
…
┌ Unlinked changes (2) ──────────── edits not tied to a finding (coherence read) ─────┐
```

Mechanics: the server computes a block-aligned markdown diff (jsdiff lines → words) [8§3.3b]; each changed block is joined to ledger moves via the move's discharge evidence (section + quote) with the same quote-resolution service as findings (H11). Hunks with no move are grouped as *Unlinked* — the honest residue. Inline comments on any hunk become `guidance` for the next Respond run (Claude Code's bundled diff comments [4§3.8]).

Rebutted findings appear in the list too, with the rebuttal rationale and no hunk — so "what did not change and why" is one screen away.

**REQ-IDE-32** The version rail shows origin, immutability and review state per version; editing a locked version forks the working head without a confirm.
**REQ-IDE-33** The vN→vM compare offers side-by-side, inline and a "what changed and why" list joining hunks to ledger moves and findings, with an Unlinked group; hunk comments become next-round guidance.
**REQ-IDE-34** Restore points preview before applying, apply as undoable transactions, and never alter correspondence or agent memory.

---

## 9. The artifact browser (D8, E1–E4)

### 9.1 Typed sections, not a tree

The convention's directories are an implementation detail; the user sees **typed sections** (Codex's Chats/Code reviews/… tabs [4§2.5]; matrix "Drafts / Reviews / Responses / Research"):

| Section | Contains | Visibility class [2§2] |
|---|---|---|
| **Outline** | the outline (as given; versioned if edited after v1 — a new outline version, `origin=human-edit`) | SE |
| **Drafts** | version rail entries; working head; companion docs and figures (assets) | SE until locked → SR |
| **Rounds** | per round: drafting note · piece brief · claim ledger (table) · discourse report · second read · editor's letter · response letter · response ledger (via findings) · run reports | SR (rendered as structured views) |
| **Research** | Author's source library (index + notes, 124 in the real project) as a searchable list; Editor's **fetched URLs only** | I / H-with-URLs |
| **Persona** | linked persona summary card, staleness pill, voice charter (read-only + "Add guidance"), which member/register was used | SR / I |
| **Assets** | figures (C12), uploaded files, bibliography (CSL-JSON) | SE |
| **Advanced** (disclosure) | drafting dossiers per version (commissioning brief, voice brief, structure plan, author claim ledger, fidelity audit), consolidation notes are *not* listed (hidden, process residue) | I |

Hidden entirely (never listed): Editor working notes and research note bodies; persona hold-out identity before calibration; corpus notes [2§2 #23, #37].

### 9.2 Provenance badges and lock states

Every artifact row and Page header carries:

- **Provenance badge**: `Author · Draft run 12 · Drafting` / `Editor · Review run 14 · Letter` / `You` / `You (edited from Author v2)` / `Imported (.docx)` / `Corrected` (calibration corrections, persona) — Copilot's commit↔session linkage [3§3.2]; clicking opens the run card (D21 proposal).
- **Lock state icon**: ✎ editable · 🔒 immutable (reviewed/delivered) · 👁 inspect-only (agent memory; opens read-only with "Add guidance" where applicable) · ⛔ sealed (count only).
- **Freshness** where relevant: "drafting note describes v1 as delivered; v1 has since been edited" (the silent-staleness caveat in [2§4.5]).

Opening any artifact puts it on the Page in Read mode with the rail showing the artifact's own versions (ledgers are append-only; letters have one version). Span-level provenance marks (human / author-agent vN / pasted / chat) are recorded in drafts and surfaced as an optional "Authorship" overlay in the Page (E6 proposal from [5§1.4]) — the overlay is Advanced-tier; the AI-use statement export is C15's.

**REQ-IDE-35** The Browser presents seven typed sections; no filesystem paths are ever shown; hidden artifacts are absent, sealed ones show counts and fetched URLs.
**REQ-IDE-36** Every artifact shows a provenance badge linking to its producing run and phase, a lock-state icon, and a freshness note when a describing artifact is stale relative to its subject.
**REQ-IDE-37** Agent-memory artifacts open read-only; the voice charter offers "Add guidance" instead of editing.

---

## 10. Design system (D14)

### 10.1 Tokens

Two textures, one token set. Shell tokens are neutral cool-dark; paper tokens are warm.

```css
:root {
  /* shell (dark default) */
  --shell-bg: #0f1114; --shell-surface: #161a1f; --shell-raised: #1d2229; --shell-border: #2a3039;
  --shell-fg: #e6e8eb; --shell-fg-muted: #9aa3ad; --shell-fg-faint: #5f6873;
  --accent: #8ab4f8;            /* one accent; links, focus, primary buttons */
  /* paper (dark variant) */
  --paper-bg: #17161a; --paper-fg: #e8e4dc; --paper-fg-muted: #b8b2a7; --paper-rule: #2b2a2e;
  /* semantic */
  --sev-blocking: #ff7b72; --sev-major: #f0b24a; --sev-minor: #6cc4a1; --sev-note: #8d97a5;
  --kind-claim: #f0b24a; --kind-discourse: #b48ef2; --kind-argument: #8ab4f8; --kind-craft: #5fd1c8; --kind-voice: #f28ea8;
  --state-running: #8ab4f8; --state-needs-you: #f0b24a; --state-ready: #6cc4a1; --state-failed: #ff7b72;
  /* spacing 4-pt: --s1 4 --s2 8 --s3 12 --s4 16 --s6 24 --s8 32 --s12 48 */
  --radius-1: 4px; --radius-2: 8px; --radius-3: 12px;
  --shadow-1: 0 1px 2px rgb(0 0 0 / .4); --shadow-2: 0 8px 24px rgb(0 0 0 / .5);
}
[data-theme="light"] {
  --shell-bg: #f6f7f9; --shell-surface: #ffffff; --shell-raised: #ffffff; --shell-border: #e3e6ea;
  --shell-fg: #1a1d21; --shell-fg-muted: #5c6670; --shell-fg-faint: #99a2ab; --accent: #2f6fdb;
  --paper-bg: #fffdf8; --paper-fg: #1d1c1a; --paper-fg-muted: #5a5750; --paper-rule: #e8e4dc;
  /* severity/kind hues re-tuned to ≥ 4.5:1 on #fffdf8 */
}
[data-paper="light"] { /* paper pinned light inside a dark shell: paper tokens from the light set */ }
```

Contrast: shell body text ≥ 7:1, paper body ≥ 10:1, all chips ≥ 4.5:1, non-text severity marks ≥ 3:1 [8§3.5 WCAG]. No pure black or white anywhere (halation on long reads; [5§7], flagged there as inference — carried as a rule, not a finding).

### 10.2 Typography

| Role | Face | Size / leading | Notes |
|---|---|---|---|
| Paper body — Serif preset (default) | Literata (OFL, optical sizes) with Lora fallback | **17 px / 1.55** | Substack measured 16–17 px Lora [5§3.1]; Literata evidence [8§3.5] |
| Paper body — Sans preset | Inter | 16 px / 1.55 | the only other preset; no font picker beyond two [5§3.3] |
| Paper headings | same family, weight 600 | h1 2.0 · h2 1.625 · h3 1.375 · h4 1.125 em | Substack's ratios [5§7] |
| Paper measure | — | **68 ch** target, 45 min, 80 max | WCAG 1.4.8; Butterick 45–90 [5§7] |
| Paragraph spacing | — | 1.0 em, no indent | findings interleave [5§7] |
| Shell UI | Inter / system sans | 13 px (dense lists) · 14 px (cards, inputs) · 12 px (chips) | tabular figures for counts and credits |
| Mono | JetBrains Mono / SF Mono | 13 px | citation keys, Source mode, diff hunks only |
| Reader controls | — | size stepper ±2 px, three steps; Auto/Dark/Light | Substack's trio [5§7] |
| Print / export CSS | serif | 11 pt / 1.4, 6.5 in measure | C15 default |

### 10.3 Theme policy (D21 proposal)

- App theme: Dark (default, Q-14) · Light · Auto. Detected from the OS on first run, remembered, identical across landing → app [6§5.1].
- Paper theme: *follow app* (default) · pinned Light · pinned Dark, per project, one key (`⌘⇧L`). The light theme is a real theme (every token defined), not an inversion.
- The paper sits inset in the shell with a 1-px `--shell-border` and `--shadow-1`; textures never blend (P7).

### 10.4 Density and layout tokens

4-pt spacing scale; lists at 32-px rows (dense) / 44-px rows (touch); cards 12-px radius; one accent colour; icons 16 px stroke; the Timeline and Browser use 13-px type, the Desk 14-px.

### 10.5 Motion

| Context | Motion | Duration |
|---|---|---|
| Streaming draft text into the Page | append with a 120-ms opacity fade per block; caret pulse | continuous |
| Phase progress | ✓ check draws in; counters tween | 160 ms |
| Finding arrives | card slides in from the margin edge; tick pulses once | 200 ms |
| Gate countdown | numeric only; colour shifts amber at 5 min | — |
| Pane open/close | width transition | 160 ms ease-out |
| Paper | **no decorative motion ever** | — |
| `prefers-reduced-motion` | all transitions → instant; streaming text appears per paragraph | — |

### 10.6 State catalogue

| State | Treatment |
|---|---|
| Empty project (S0) | Timeline shows three entry cards; Page shows a quiet serif title field and "Start writing, drop a file, or open chat (⌘J)" |
| Empty findings | Margin absent; Desk Findings tab: "No review yet · Review v1 ≈ N cr" |
| Streaming | Page block-level shimmer for the section being written; run card counters live; sync pill "syncing" |
| Loading | skeleton rows in shell surfaces (never spinners in the paper) |
| Error — run failed | run card red state with phase and reason, partials listed, refund line, Resume; Inbox item |
| Error — sync offline | status pill "offline · 3 changes queued"; editing continues; no modal |
| Error — conflict | see §11.4; inline banner on the Page, never a modal |
| Insufficient balance | launch-sheet primary button swaps; nothing else changes |
| Frozen version | lock banner on the Page (§8.2) |

### 10.7 Accessibility (WCAG 2.2 AA, targeting AAA for reading)

- Contrast as above; focus rings 2 px `--accent` on every interactive element; no colour-only encoding (severity always has an icon/weight; run states have icons).
- Full keyboard operation (§13); findings and gates are ARIA landmarks with `aria-live="polite"` announcements for new findings and gate openings, `assertive` for spend gates.
- Text resizable to 200 % without horizontal scroll (the measure clamp guarantees it); reader size stepper.
- Reduced-motion honoured; animations never carry information.
- Screen-reader path for findings: the Desk list (table) is the primary a11y surface; margin decorations are `aria-hidden`, with the underline exposing `aria-describedby` to the finding title.

**REQ-IDE-38** Token set as §10.1 with dark default and a complete light theme; paper theme independently pinnable per project.
**REQ-IDE-39** Paper typography: 17-px Literata/Lora (serif preset) or 16-px Inter (sans preset), 1.55 leading, 68-ch target measure, Substack heading ratios, size stepper.
**REQ-IDE-40** Motion limited to streaming, progress and pane transitions; none on the paper; reduced-motion honoured.
**REQ-IDE-41** All states in §10.6 are designed; no state uses a blocking modal except Cancel-run confirmation.
**REQ-IDE-42** WCAG 2.2 AA throughout; findings and gates announced via live regions; the Desk list is the screen-reader surface for findings.

---

## 11. Autosave, offline and conflict UX (D17, N1–N3, K3)

### 11.1 The four layers, as the user sees them

[8§5.1]: keystrokes → Y.Doc → y-indexeddb (survives refresh/crash) → Hocuspocus (server) → materialised markdown + restore points. The only user-visible artefact of all this is the **sync pill** in the status bar:

| Pill | Meaning | Colour |
|---|---|---|
| `synced ✓` | server acknowledged within 2 s | muted |
| `syncing…` | pending updates | muted, subtle spinner |
| `offline · n changes queued` | socket down; IndexedDB has everything | amber |
| `read-only` | viewer role (C13) or frozen version | muted with lock |

There is **no "Save" button, no "unsaved changes" dialog, no beforeunload prompt** — refresh, tab close and crash all resume from IndexedDB; the pill is the whole story (P8). `⌘S` is mapped to *Mark restore point* (named), which is the closest honest meaning.

### 11.2 Restore points

Auto every 5 minutes of activity, on blur/close, and before any workflow; named on `⌘S`; listed in the version rail dropdown; preview then undoable restore (§8.1). Retention per plan (N4 storage row).

### 11.3 Agent-vs-human concurrency (N2, K3)

Three cases, each with its UI:

1. **A run produces a new version** (Draft → v1; Respond → v(N+1)): the new version is ingested server-side; the Page shows a toast "v3 delivered · Open" and the rail gains a chip. The human's working head, if any diverged, is handled by case 2.
2. **A run reads a version** (Review of vN): at launch the head is promoted to vN and **frozen**; the Page banner reads "Review in progress on v2 — your edits will go to a working copy". Typing forks `v2-working`. When the run delivers, the human sees v2 (reviewed, locked), the dossier, and the working copy "diverged from v2 (+312 words)". Launching Respond then offers: "carry your working-copy edits into v3 as suggestions" (default on) — the diff `v2 → v2-working` becomes suggestion marks on v3 for accept/reject [8§5.2 case 2]. No work is lost or silently merged.
3. **An agent edits in place** (C12 figure insertion, future line-edit): the agent is a Yjs client with origin `agent:<role>:<run>`; every change lands as suggestion marks; the Page shows a small "3 suggestions from Author" chip; `⌘Z` never undoes agent-origin changes [8§5.1 undo].

Rule enforced by the runtime, shown as a banner rule: **never two writers of one draft**. A second run targeting a version already frozen by a running review is queued with "starts when Review of v2 finishes" (K3).

### 11.4 Conflicts

With CRDT merge, text conflicts do not exist; the only conflicts are *semantic*:

| Situation | UX |
|---|---|
| Same user, two devices, both editing the head | merges silently; the pill shows "synced" on both; presence dots (later, C13) |
| Non-prose record (settings, persona seed) edited in two places | `If-Match` 409 → inline banner "Updated elsewhere · Reload / Keep mine (overwrites)" on that form only [8§5.1 fallback] |
| User edits a version that became frozen while offline | on reconnect, the queued edits are applied to a **new working head** (fork), banner explains: "v2 was frozen for review while you were offline; your 14 edits are now in v3 · draft" |
| Human edits + agent suggestions overlap | suggestion marks render over the human's text; accept/reject per suggestion; no dialog |

**REQ-IDE-43** The status bar sync pill is the only autosave UI; there is no Save action, unsaved dialog, or beforeunload prompt; `⌘S` marks a named restore point.
**REQ-IDE-44** Launching a review freezes the target version with a banner; human typing forks a working copy; at Respond launch the working-copy diff is offered as suggestions on v(N+1).
**REQ-IDE-45** Agent in-place edits arrive as suggestion marks with a count chip and are excluded from the human's undo stack.
**REQ-IDE-46** Offline edits to a version frozen meanwhile are applied to a new working head on reconnect with an explanatory banner; non-prose 409s are inline, per form.

---

## 12. Notifications and async (D16)

Runs take minutes to hours; the user leaves. Notification design follows "gate opened + run finished, nothing finer by default" [3§1.2], [3§6.10].

### 12.1 Events and channels

| Event | In-app (Inbox + Rail badge + toast) | Push (mobile, D19) | Email | Default |
|---|---|---|---|---|
| Gate waiting (with deadline) | ● | ● | ● if not acted on within 10 min | on |
| Spend gate | ● | ● | ● | on, cannot be turned off |
| Run finished (deliverable ready) | ● | ● | ● | on |
| Run failed / cancelled by system | ● | ● | ● | on |
| Gate auto-continued on deadline | ● | ○ | ○ | on (in-app only) |
| Persona stale (T5) | ● | ○ | weekly digest | on |
| Credits 50/80/100 % (L6) | ● | ○ | ● | on |
| Finding streamed / phase finished | ○ | ○ | ○ | off (Advanced: opt-in per project) |

Rules: one notification per event per channel; all notifications deep-link (`/p/:project/r/:run#gate`, `/p/:project/f/:id`); a run's notifications collapse into one Inbox item that updates in place; OS notifications only when the project is not focused (Claude Desktop's "unviewed" rule [4§3.2]).

### 12.2 Inbox

`/app/inbox`: the cross-project attention list — the same row component as the project list's Needs-you group, sorted by deadline, with inline **Approve** for gates (opens the gate artifact in a side sheet so the user can read before approving) and **Read** for deliverables. "Ready to read" clears when the deliverable is opened. Codex's Scheduled inbox with unread indicator is the precedent [4§2.2].

### 12.3 Returning to a finished run

Opening a project with an unread finished run lands on the **walkthrough** (§5.6) as a dismissible card at the top of the Timeline, with the deliverable on the Page (letter for reviews; diff "what changed" for responses; v1 for drafts).

**REQ-IDE-47** Notifications fire for gate waiting, spend gate, run finished, run failed, deadline auto-continue, persona stale, and credit thresholds — each deep-linked, collapsed per run, OS-level only when unfocused; finer events are opt-in.
**REQ-IDE-48** The Inbox lists cross-project gates and unread deliverables with inline approve/read; returning to a project with an unread run shows the walkthrough card first.

---

## 13. Keyboard and command-palette map

### 13.1 Global

| Keys | Action |
|---|---|
| `⌘K` | Command palette (search projects, artifacts, findings, commands; `/` prefixes verbs) |
| `⌘1` / `⌘2` / `⌘J` | Toggle Browser / Timeline / Desk |
| `⌘3` | Cycle Margin view: Margin → Full → Clean |
| `⌘⇧F` | Focus mode |
| `⌘⇧M` | Cycle Page mode: Write → Source → Read |
| `⌘⇧L` | Cycle paper theme: follow app → light → dark |
| `⌘⇧V` | Cycle feed density |
| `⌘S` | Mark restore point (named) |
| `⌘⇧R` | Run next step (opens the launch sheet for the state-machine's next verb) |
| `⌘⇧D` / `⌘⇧E` / `⌘⇧A` | Draft / Review (Edit) / Respond (Answer) launch sheets |
| `⌘G` | Go to gate (focuses the oldest open gate) |
| `⌘I` | Open Inbox |
| `⌘,` | Project settings |
| `?` | Shortcut cheat sheet |

### 13.2 Findings and versions

| Keys | Action |
|---|---|
| `J` / `K` | Next / previous finding (in Page or list) |
| `A` `D` `R` `F` `E` | Accept / Adapt / Rebut / Defer / Escalate the focused finding |
| `Enter` / `Esc` | Open / collapse the finding card |
| `⌥J` / `⌥K` | Next / previous *major or blocking* finding |
| `⌘⇧C` | Compare current version with previous |
| `[` / `]` | Previous / next version on the rail |
| `⌘Z` / `⌘⇧Z` | Undo / redo (own edits only) |

### 13.3 Palette verbs (`⌘K` then type)

`/draft`, `/review`, `/respond`, `/run next`, `/compare v2 v3`, `/open letter`, `/open claims`, `/open plan`, `/go v2`, `/find "quoted text"`, `/export docx|pdf|md|latex|gdoc`, `/persona`, `/refresh persona`, `/restore`, `/theme light|dark|auto`, `/paper light|dark|follow`, `/focus`, `/source`, `/read`, `/gate` (jump to open gate), `/pause`, `/cancel`, `/steer "text"` (queue guidance), `/agent author|editor`, `/usage`, `/settings`. Verbs that cost credits always open the launch sheet — the palette never launches a run directly.

**REQ-IDE-49** The shortcut map in §13 is implemented with a discoverable cheat sheet (`?`) and palette verbs; no palette verb launches a run without the launch sheet.

---

## 14. Data contracts this note fixes for F/K rows

```ts
interface Project { id; slug; title; personaId?: Id; personaLockedAt?: ISO; genreTemplate; venue?: string;
  gatePolicy: "three" | "every" | "none"; gateDeadlineMin: 10 | 30 | 120 | null; rigorDefault: "quick" | "standard" | "elite";
  paperTheme: "follow" | "light" | "dark"; state: "s0" | "s1" | "s2" | "s3" | "accepted" | "exported" | "archived"; }
interface DraftVersion { id; projectId; n: number; origin: "outline" | "response" | "upload" | "human_revision" | "duplicate";
  producedByRunId?: Id; locked: boolean; lockedReason?: "reviewed" | "responded"; words: number; mdHash: string;
  claimsPendingVerification: boolean; }
interface Run { id; projectId; verb: "draft" | "review" | "respond" | "persona" | "outline"; role: "author" | "editor" | "system";
  targetVersionId?: Id; rigor; phasesEnabled: PhaseId[]; state: RunState; phase?: PhaseId;
  estimateCredits: number; capCredits: number; spentCredits: number; startedAt; endedAt?; summary?: string; }
interface Gate { id; runId; kind: "structure_plan" | "review_scope" | "triage" | "spend"; artifactId?: Id;
  openedAt; deadlineAt?: ISO; pausedWhileReading: boolean; decision?: GateDecision; }
interface GateDecision { value: "approve" | "approve_gate_every_phase" | "keep_planning" | "cancel" | "auto_continue";
  guidance?: string; standingRule?: boolean; by: "user" | "deadline"; at: ISO; }
interface Artifact { id; projectId; type: ArtifactType; section: "outline" | "drafts" | "rounds" | "research" | "persona" | "assets" | "advanced";
  visibility: "SE" | "SR" | "I" | "H"; producedBy: { role; runId?; phase? } | "user" | "import";
  lock: "editable" | "immutable" | "inspect" | "sealed"; staleRelativeTo?: Id; }
```

**REQ-IDE-50** The contracts above are the minimum the IDE needs from F1/F5/K1/K2; the architecture rows may extend but not rename these fields.

---

## 15. Alternatives considered and rejected (consolidated)

| Area | Rejected | Why |
|---|---|---|
| Home grouping | Persona-first groups (⚑ default) | degenerate for single authors; hides attention state; see §3.3 |
| Layout | Chat-left / artifact-right (Lovable/v0 builders) [3§4.5] | chat is not Rhema's primary input; the round timeline is; chat is a drawer |
| Layout | Per-role panels (Author panel, Editor panel) | misstates the user-is-author relationship; adds navigation without information (§6) |
| Gates | Blocking modals | kill async/mobile use [4§6.1] |
| Gates | 30-s auto-proceed (Devin) | prose plans are read, not skimmed; 30 min with pause-while-reading |
| Progress | Agent-authored checklist | retired by Claude Code for current models; orchestrator phases instead [4§3.2] |
| Findings | Separate dossier tab with links back | loses anchoring every product converged on [5§4.2] |
| Findings | Full track-changes for every agent edit in Respond | noise across 15k words; block/word diff joined to moves is the right grain [5§4.2] |
| Findings | "Resolve" | dispositions are the ledger; resolve loses the rationale |
| Versions | Branching histories | linear with explicit forks (duplicate / fork-under-persona) keeps the round log readable [3§4.5] |
| Browser | Filesystem tree | exposes convention paths; typed sections + provenance carry the same information [2§2] |
| Autosave | Save button / unsaved dialog | contradicts the four-layer model; "unsaved" is not a state [8§5.1] |
| Theme | Light default | Q-14 binding; market has moved light, so dark is a differentiator with a real light theme [6 exec] |
| Motion | Decorative animation on the paper | reading surface; Substack's calm is the counter-weight [5§6] |

---

## Ledger updates

| Row | Status | Evidence |
|---|---|---|
| D1 | done | §2 — IA, navigation model, URL scheme (REQ-IDE-1–2) |
| D2 | done (⚑ departure on default grouping, argued §3.3) | §3 — list, attention groups, search/archive/duplicate/templates, three-entry-point flow, persona change policy (REQ-IDE-3–7) |
| D3 | done | §4 — seven named regions, widths/clamps, focus and reading modes, three-tier disclosure; §13 keyboard map (REQ-IDE-8–10, 49) |
| D4 | done | §5 — timeline = runs list, run card states, phase vocabularies, launch sheet, event schema, feed densities, three gates with deadlines, steering, walkthrough/run report (REQ-IDE-11–19) |
| D5 | done | §6 — roles as authorship/boundary, no tabs, profile page contents (REQ-IDE-20–22) |
| D6 | done | §7 — finding object, margin/list/gate, evidence, reconciliation, dispositions→ledger, bulk-with-preview, rubric, letter (REQ-IDE-23–31) |
| D7 | done | §8 — version rail, immutability signals, moves-annotated diff, restore points (REQ-IDE-32–34) |
| D8 | done | §9 — typed sections, provenance badges, lock states, hidden/sealed policy (REQ-IDE-35–37) |
| D14 | done | §10 — tokens, type scale, theme policy, motion, state catalogue, accessibility (REQ-IDE-38–42) |
| D16 | done | §12 — event/channel matrix, Inbox, return-to-run (REQ-IDE-47–48) |
| D17 | done | §11 — sync pill, restore points, freeze/fork/suggestions, conflict table (REQ-IDE-43–46) |
| C7 | design delivered | §5.5 — three named gates + spend gate; deadline policy; standing guidance |
| K1, K2, K5 | UI contract delivered | §5.2, §5.4, §5.5 — RunState, RunEvent, steering primitives |
| E1–E4 | UI policy applied | §6.3, §9 — visibility classes rendered as lock states; editor memory sealed with URLs |
| T1 | confirmed as reconciled | §5.1 — timeline rows are run rows |
| T2 | confirmed | §7 |
| T3 | narrowed form applied | §6.3, §9.1 |

**Proposed new rows (adopting research proposals where this note depends on them):**
- **D20 Round walkthrough & run report** — specified §5.6; needs the model-written summary service.
- **D21 Provenance linkage** — specified §9.2; every artifact → run/phase link.
- **D22 Paper theme policy** — specified §10.3 (was proposed as D21 in note 5).
- **D23 Findings view modes & bulk preview** — specified §7.2, §7.6 (was D20 in note 5).
- **K7 Editable plan mid-run** — UI in §5.5 steering; orchestrator semantics still open.
- **K8 Gate deadline policy** — pause-while-reading, per-project defaults, deadline decision recording (§5.5).
- **H11 Findings re-anchoring service** — required by §7.1, §8.3.
- **F9 Review keyed by (version, run)** — required by §7.1 `reviewId`.
- **N4 Human-revision "claims pending verification"** — required by §8.2.

## Open questions

1. **Gate deadline default** (30 min) is a design judgement from [4§4.6]; no product studied uses minutes. Validate with the operator and with first-user telemetry (median time-to-approve).
2. **"Operator reachable"** for the Respond gate [2 open q.] is here defined as "a deadline exists and the user has notifications enabled"; confirm this is acceptable as the policy.
3. **Editor's `03/04` working notes** — this note treats them as Advanced/inspectable per [2§2 #9]; if the operator prefers them sealed, only §9.1's Advanced section changes.
4. **Chat memory boundary** — §6.2 fixes author-scope for the chat assistant; D9/G9 must confirm the chat's own memory is *not* written into `agents/author/*` without provenance.
5. **Mobile web** below 1024 px is specified only as "degrades to single column"; D19 owns the app; the web breakpoint behaviour needs a pass once D19 lands.
6. **Span-level provenance overlay** (§9.2) depends on the E6 proposal being adopted; the marks must be excluded from markdown materialisation like suggestion marks.
7. **Severity vocabulary** (blocking/major/minor/note) is this note's normalisation of the letter's "majors" + craft notes; the ported editorial-review protocol must emit it explicitly (G4 port item).
8. **Halation / no-pure-black rule** is carried from [5§7] as inference; a fetched dark-mode readability source should back it before D14 is final.

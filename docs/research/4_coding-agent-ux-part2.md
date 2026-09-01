# Coding-agent UX, part 2 — Devin, Codex, Claude Code, the long tail, and the surface→prose matrix

- Scope: ledger rows **B1.2** (Devin web + desktop), **B1.3** (OpenAI Codex), **B1.4** (Claude Code), **B1.8** (Jules / Antigravity, Amp, Factory, Warp scan), **B1.9** (cross-product synthesis matrix) · Date: 2026-08-27 · Sources fetched: 62 (see §Sources; 4 fetch failures are listed in §Open questions)
- Conventions: *Observed* = read on the cited page this session; *Inferred* = my reading of it; *Recommendation* = a design position with alternatives rejected. Ledger row IDs (`D4`, `K5`, …) and decisions (`Q-7`) are referenced inline. Secondary sources (blogs, aggregator pricing pages) are labeled **[secondary]** and used only where the primary page could not be fetched.

## Executive summary (decisions-first)

1. **Every product studied has converged on the same run-visualization grammar: a chat transcript with collapsed tool calls + a separate "what changed" surface (diff) + a plan artifact that gates execution + a list of parallel runs grouped by state.** Devin (Progress tab + IDE/Shell/Browser panes), Codex (task list with `+31 −1` diff stats, summary + diff), Claude Code (transcript with Normal/Verbose/Summary view modes, diff pane with inline comments, plan-approval prompt, agent view grouped Needs input / Working / Ready for review / Completed), Antigravity (Artifacts: implementation plan, walkthrough, recordings), Jules (activity feed with mini-diffs, plan approval with auto-approve timer) all instantiate it. Rhema should adopt the grammar and swap the *content types*: the diff becomes **draft vN→vN+1 with response-ledger moves**, the plan becomes the **structure plan / piece brief / triage ledger**, the tool log becomes a **research feed of sources fetched and claims checked** (confirms T1, T2, D4, K2).
2. **Human gates are converging on "plan → approve → autonomy level for execution", with a timed auto-proceed as the escape hatch.** Devin waits 30 s then proceeds unless "Wait for my approval" is pressed; Jules auto-approves plans on a timer if you navigate away; Claude Code's plan-approval offers "Yes, and use auto mode / Yes, manually approve edits / No, keep planning"; Factory Spec Mode → approve → pick Autonomy Level; Antigravity has an artifact review policy (Always Proceed vs request review). Rhema's `Q-7` gates-on-by-default should be implemented as **approve-with-deadline** at three named gates (structure plan, review scope, triage ledger), never as blocking modals (C7, K1).
3. **Steering mid-run is a solved UX with three primitives: interrupt (Esc), queue a message to be delivered at the next tool-batch boundary, and inline comments on the output batched into the next turn.** Claude Code, Codex CLI, Jules, Warp, Antigravity, and Devin (editable queued messages) all ship these. Rhema needs the same three at *phase* granularity (K5), plus a fourth prose-specific one: **comment on a finding/passage** as the steering unit.
4. **Billing has bifurcated into (a) subscription tiers with rolling 5-hour + weekly windows and (b) an abstracted compute unit (ACU / credit / token-credit) purchasable as overage.** Claude Pro $20 / Max $100–$200 with 5-hour session + weekly windows and usage credits at API rates ($2,000/day cap); Codex Plus $20 / Pro $100–$200 with 5-hour windows and token credits per model; Devin Pro $20 / Max $200 / Teams $80-min with daily+weekly quotas and never-expiring on-demand credits; Amp $20 / $200 with "at least $X of included usage" at provider prices; Warp $20 / $200 with 1,500 / 18,000 credits; Factory $20 / $100 / $200. **Rhema's T7 (credits under subscription tiers) is confirmed; the $20 / $100–$200 anchor points are industry-wide** (L3, D18).
5. **Three ideas from the long tail are worth stealing outright:** Antigravity's *Artifacts with review policies* (a typed deliverable with per-type Always-proceed / Request-review), Devin's *Session Insights* (post-run ACU / message-count / issue-timeline / improved-prompt analysis) and Claude Code's `/usage` *attribution breakdown* (usage attributed to skills, subagents, MCP servers with behavior flags such as "long context" at ≥10 %). Together they are the template for Rhema's **run cost drill-down at the right level of detail** (D12, L5).

Contradictions with theses/decisions: none hard. One caution against T4's "port skills nearly verbatim": every product now exposes an *autonomy dial* (Factory Off/Low/Medium/High, Amp Low/Medium/High/Ultra, Claude Code Manual/Accept edits/Plan/Auto), which means the skill's opt-out flags (`fact-check`, `discourse-map`, `second-read`) must be surfaced as a **rigor dial** rather than hidden inputs — a product-level decision, not a porting detail (C4, C5).

---

## 1. Devin — web app + desktop (B1.2)

### 1.1 Surface inventory

*Observed.* Devin ships as: the **web app** (sessions, Ask Devin, Devin Review, Session Insights, playbooks, knowledge, org/enterprise settings) [S1, S2, S6, S7, S8]; **Devin Desktop** (the former Windsurf editor, rebranded: Cascade agent, "arena mode" parallel sessions, Agent Command Center, Spaces, Quick Review, Previews) [S9, S10, S11]; **Devin CLI** (local agent harness shared with Desktop) [S9]; **Devin MCP server** and API [S5]; GitHub PR-comment entry points and URL shortcuts for Devin Review [S8].

*Inferred.* The Desktop docs are Windsurf's docs re-labeled (Cascade, `~/.devin/plans/plan-<session>.md`, prompt credits vs ACUs) — the merged product has two billing vocabularies (ACUs for cloud sessions, prompt credits for the legacy editor) that the docs are still reconciling [S9, S12]. This is a cautionary tale for Rhema: **one usage unit from day one** (L3).

### 1.2 Run/session visualization

*Observed.* A session page has a chat column plus "Devin's computer" — three concurrent tools: **Shell** ("watch commands being executed and view output logs", read-only until toggled writable), **IDE** (embedded VS Code; "watch Devin make edits in real-time"), **Browser/Desktop** (interactive browser for CAPTCHAs, MFA, testing) [S2, S3]. The **Progress tab** "consolidates all session activity in one unified view"; clicking any step in the chat jumps to that step's shell/IDE/browser detail [S3]. **Side chats** are read-only Q&A panels that don't interrupt the main work ("Devin can search and read the codebase to answer your questions, but it cannot edit files") [S3].

**Planning.** "When you initiate a session, Devin conducts rapid codebase analysis and presents: relevant files, key findings from its initial assessment, implementation questions", then a detailed plan with code citations that deep-link into the IDE. "By default, Devin will wait thirty seconds for feedback from you before automatically proceeding with its plan"; "Wait for my approval" forces a hard gate; the default is adjustable in Settings › Customization [S4]. A release note adds a confidence-gated variant: when Devin is not 🟢-confident it waits for approval; when 🟢 it proceeds automatically [S13 — search snippet from docs.devin.ai release notes; page itself not fetched]. The first-run guide recommends "start with Ask mode to plan out the task" before Agent mode, and sizes tasks: "if a task would take you three hours or less, Devin can most likely do it" [S2].

**Desktop (Agent Command Center).** "A Kanban board organized by status columns" so you can "quickly tell what is in flight, what needs your attention, and what is finished"; sessions "are locked while their agent is running: they appear greyed out and are read-only until the agent finishes"; "a message queued while the agent is working can be edited before it sends"; "Add to chat" sends selected transcript text to the input; "Duplicate session" branches a conversation [S10].

**Post-run: Session Insights.** After completion a modal shows four KPIs — **ACU usage**, **user messages** ("high counts suggest the need for frequent course corrections"), **session size** (XS–XL, from ACU or message count), **category** (auto-classified: feature / bug / review) — and three tabs: **Issue Timeline** (issues detected, color-coded by severity on a chronological timeline), **Actionable Feedback** ("an improved prompt with interactive highlighting" + config recommendations), **Knowledge Usage** (which knowledge items helped or hindered) [S7].

*Inferred.* Devin's insight is that the *post-mortem* is a first-class surface, not a log. Nothing else in the study offers "here is the prompt you should have written."

### 1.3 Human-in-the-loop gates and steering

*Observed.* Gate = plan approval with 30 s auto-proceed [S4]. Steering = intervene via the Progress tab, "intervene early", **take over** the IDE/shell (docs: "make sure that Devin is paused before taking over the IDE to avoid simultaneous, conflicting changes"; "always tell Devin about any changes you made when taking over") [S3]. Devin Review is a separate review surface for PRs: "smart diff organization" that "groups changes logically, putting related edits together instead of alphabetical order", an Analysis sidebar with **Bugs** (severe / non-severe, labelled by confidence), **Security** (CWE-classified, critical / warning), and **Flags** (investigate / informational); reviewers can comment, approve, request changes, merge — "all within Devin Review, synced to GitHub" [S8].

### 1.4 Billing, quotas, org dashboards

*Observed (primary, docs.devin.ai).* Self-serve plans: **Free** (1 member, "limited Devin usage"), **Pro $20/mo**, **Max $200/mo**, **Teams $80/mo minimum** (full seats $40/mo each with Pro-equivalent quota; flex seats free, drawing on shared on-demand credits). Pro and Max include "a daily and weekly usage quota that covers Devin sessions, Devin CLI, and Devin Desktop"; Max has "a significantly larger weekly usage quota (with no daily cap)". On-demand credits "roll over month-to-month. Purchased credits never expire", are "the same dollar value as the ACUs you're used to", and on Teams are "shared across all members, with no per-member balance" [S12]. Enterprise is billed in ACUs "at the rate set in their order form" [S14]. Usage "accrues based on the work Devin actually performs in a session"; Windows sessions cost "approximately 9 % more" than Linux [S15]. Enterprise **usage policies** cap each member's monthly ACUs across local + cloud surfaces ("a single per-user limit"); "new work is blocked on all surfaces once the limit is reached"; members get warnings at ~⅔, then persistent banners, then a blocked state with a request-more-ACUs approval workflow (manual / auto-approve / efficiency-based) [S16]. Any user sees per-session usage in Session Insights; self-serve users see consumption under Settings › Plans; enterprise has Consumption / Consumption Analytics pages and a personal "My analytics" page [S15, S11]. Desktop analytics adds "Percent of Code Written (PCW) by AI, total lines of code written, total tool calls, credit consumption" [S11].

*Secondary (devin.ai/pricing returned HTTP 429 on four attempts).* Aggregators consistently report the older Core plan at **$20/mo + $2.25/ACU**, Team at **$500/mo incl. 250 ACUs ($2.00/ACU)**, and "one ACU ≈ 15 minutes of active autonomous work" [S17 secondary]. Given the primary docs now describe Pro/Max/Teams with quotas rather than Core/Team with ACUs, **treat the $2.25/ACU figure as legacy** until the pricing page can be read.

### 1.5 Trial mechanics

*Observed.* A Free plan exists (1 member, limited usage) [S12]. Desktop-side: promotional trials are "occasionally" offered and are **not** available to prior users of Windsurf/Devin/Codeium, "users predicted unlikely to purchase Pro", or flagged accounts; "eligibility is automatic and non-appealable" [S9]. *Inferred:* Devin uses ML-scored trial eligibility — an anti-abuse pattern worth knowing about for L8.

### 1.6 Rhema analogue

| Devin surface | Rhema analogue |
|---|---|
| Devin's computer (Shell / IDE / Browser) | **Agent's desk**: Research pane (sources fetched, live), Draft pane (the artifact being written, streaming), Ledger pane (claim ledger / response ledger rows filling in). Same 3-pane concurrency; different content (D3, D4). |
| Progress tab with step→detail deep links | **Round timeline** step → phase detail (e.g. "fact-check: 41 claims, 37 verified") (D4, K2) |
| 30-s auto-proceed plan gate | **Structure-plan gate** with a countdown and "Wait for my approval" toggle (C7, `Q-7`) |
| Session Insights (ACU, messages, issue timeline, improved prompt) | **Run report**: cost, phase timings, unmet targets, "what to tell the author next time" — one screen (D12, K6) |
| Devin Review (grouped diff + analysis sidebar with confidence-labelled findings) | **Editorial dossier view**: findings grouped by section, severity + confidence labels, accept/adapt/rebut/defer controls (D6 — direct T2 confirmation) |
| Side chat (read-only Q&A, doesn't touch the run) | **"Ask about this draft"** side panel that can read the shared record but never writes (D9, E3) |
| Usage policies (per-user cap, ⅔ warning, banner, blocked → request) | **Budget caps** per project/user with the same three-stage escalation (L6) |
| Take over the IDE (pause first) | **Take over the draft**: human edits mid-run are only allowed when the run is paused; K3/N2 locking rule |

---

## 2. OpenAI Codex — cloud tasks, CLI, IDE, app (B1.3)

*Note on the source.* `developers.openai.com/codex/*` now 308-redirects to `learn.chatgpt.com/docs/*`, and the docs describe "ChatGPT Work" as the umbrella with Codex as the coding surface. I fetched the redirected pages [S18–S27].

### 2.1 Surface inventory

*Observed.* Cloud web app, CLI, IDE extension, desktop app (macOS / Windows / Linux), GitHub integration (code review + PR workflows), Slack, SDK, and **Automations** (scheduled or Gmail/Slack/GitHub-event-triggered runs) [S18]. Cloud tasks can start "from GitHub pull requests, GitLab merge requests and issues, Linear issues, or Slack channels and threads" [S19].

### 2.2 Run visualization

*Observed.* **Cloud task list**: chronological rows with task description, date, repo path, branch, and status (merged / closed / in-progress) with diff statistics such as `+31 −1`; tabs for **Chats, Code reviews, Security reviews, Archive** [S19]. Review flow: "Review the summary and diff. Ask Codex to make follow-up changes, or open a pull request when the work is ready" [S19]. IDE: "Read the summary, inspect a focused diff, and follow up in the same chat"; "Keep quick iterations local, or connect Codex web when a task needs more time and room"; "Create Git checkpoints before and after a task so you can revert changes" [S22]. Desktop app: "run projects in parallel, work with files, use your computer, and keep long-running work moving from one desktop workspace"; opens "documents, spreadsheets, images, and other files in the same workspace" [S21]. Automations: results land in a **Scheduled** section that "functions as your inbox … an unread indicator shows when a run needs your attention" [S23]. CLI changelog (Aug 20–27, 2026): an interactive `codex agents` dashboard for "searching, starting, and managing tasks"; `codex queue` to message existing local/remote sessions; `Interrupt` hooks that fire "when an active top-level turn is interrupted"; auto-generated descriptive titles for unnamed tasks; read-only **shared thread snapshots** from the desktop app with workspace scope; fixes for "duplicate sub-agent activity display" [S24].

### 2.3 Gates, permissions, steering

*Observed.* Permission **profiles** `:read-only`, `:workspace` ("allows writes inside the active workspace roots and system temp directories"), `:danger-full-access`; "If the selected policy cannot be enforced by the platform sandbox, Codex refuses to run the command instead of silently running it unsandboxed" [S25]. Approval policies: **on-request** (default for the Auto preset), **never**, **untrusted** (auto-runs safe reads, prompts for state-mutating commands); an **auto-review** reviewer agent (`approvals_reviewer = "auto_review"`) classifies risk low / medium / high / critical, checks "data exfiltration, credential probing, and destructive actions", and "denies critical-risk actions"; protected paths `.git`, `.codex`, `.agents` stay read-only in every mode; network off by default with a domain allowlist proxy where "deny always wins" [S26]. CLI steering: "steer the active turn by typing mid-session and interrupt execution with Esc"; `/status` shows "current session configuration and rate-limit information"; delegate "focused work to specialized agents, then bring their findings back" [S20].

### 2.4 Billing, limits, trial

*Observed (learn.chatgpt.com/docs/pricing, accessed today).* Individual: **Free $0** ("explore Codex capabilities on quick coding tasks"), **Go $8**, **Plus $20**, **Pro from $100** ("5x or 20x more Codex usage than Plus"); Business **$20/user/mo annual ($25 monthly, 2+ users)**; Enterprise/Edu custom. Limits are a **five-hour rolling window shared across local messages and cloud chats**; per-window estimates are published as ranges per model (e.g. GPT-5.6 Sol: Plus 10–100, Pro 5x 50–500, Pro 20x 200–2,000, Business 10–100; the cheaper GPT-5.6 Luna tier: Plus 250–2,000 … Pro 20x 5,000–40,000). **Token-based credits** for overage are priced per model per million tokens (GPT-5.6 Sol 100 in / 10 cached / 500 out; Terra 50 / 5 / 300; Luna 5 / 0.5 / 30) and "GPT-5.6 usage averages 5–30 credits per message" [S27]. The help-center article on Codex with ChatGPT plans returned 403 [see §Open questions]; a secondary source dates the switch to token-based billing for Plus/Pro/Business at April 2, 2026 [S28 secondary].

*Inferred.* Codex's published *ranges* ("10–100 messages per window") are a deliberate honesty device: they refuse to promise a number because cost per message varies 10× with task shape. Rhema faces the same variance (a 1,500-word blog review vs a 15k-word, 70-citation academic review — `Q-10`) and should publish **ranges per workflow per tier**, not a single count (L3, C14).

### 2.5 Rhema analogue

| Codex surface | Rhema analogue |
|---|---|
| Task list with status + `+31 −1` | **Run list** with status + "`v2 → v3 · 14 moves · 6 accepted / 5 adapted / 2 rebutted / 1 deferred`" (D4, D7) |
| Chats / Code reviews / Security reviews / Archive tabs | **Drafts / Reviews / Responses / Research / Archive** as run-type filters — maps 1:1 to the correspondence directory (D8) |
| Summary + focused diff, then follow up in chat | **Response letter + vN→vN+1 diff**, follow-ups in the same thread (D7) |
| Scheduled section as inbox with unread indicator | **Inbox** for finished runs and waiting gates (D16) |
| Permission profiles enforced by sandbox; "refuses rather than silently unsandboxed" | **Boundary enforcement** for `agents/<role>/` at the runtime (F4) — the same "refuse, never degrade" posture |
| Auto-review risk classifier | **No direct analogue** for prose safety; the closest is a *cost classifier* ("this phase will exceed the estimate — approve?") (L6) |
| Published usage ranges per model per window | **Published run-cost ranges per workflow per tier** (L3) |

---

## 3. Claude Code — CLI, desktop, web, plan mode, permissions, hooks, subagents, usage (B1.4)

### 3.1 Surface inventory

*Observed.* CLI; VS Code / JetBrains extensions; **Desktop** (Code tab of the Claude app, with Chat and Cowork tabs alongside) [S32]; **web/cloud sessions** at claude.ai/code and in the mobile app [S33, S34]; Remote Control (expose a local session to the web); Routines (cloud-scheduled); Claude in Slack; Agent SDK; GitHub Actions. Features requiring a claude.ai subscription rather than an API key: web, mobile, Slack, Desktop, Routines, Ultrareview, Code Review (Team/Enterprise), Remote Control, Chrome extension, Computer use (Pro/Max), Artifacts, Voice dictation [S35].

### 3.2 Run visualization

*Observed.*
- **CLI transcript**: streaming tool log; `Esc` "stop the current response or tool call mid-turn so you can redirect. Claude keeps the work done so far"; **queued messages** are listed above the input and delivered "as soon as those tool calls finish, within the same turn"; `Up` takes queued messages back for editing; `/btw` side questions run "even while Claude is processing a response"; a **session recap** ("one-line recap of what happened … once at least three minutes have passed since the last completed turn and the terminal is unfocused", capped at 400 chars) [S36]. The task list (Ctrl+T) is empty by default on Opus 4.8 / Sonnet 5 / Fable 5 because those models "keep track of multi-step work without a written checklist" [S36] — *inferred*: the visible to-do list is being retired in favour of model-internal planning, so Rhema should not build its progress UI on an agent-authored checklist but on **orchestrator-known phases** (K1, K2).
- **Desktop**: panes "chat, diff, browser, terminal, file, plan, tasks, and subagent" arranged by drag-and-drop; a `+12 −1` diff-stats indicator opens a diff viewer with file list left / changes right; click any line to comment, submit all comments at once, "Claude reads your comments and makes the requested changes, which appear as a new diff"; **Review code** button asks Claude to review its own diff, focusing on "compile errors, definite logic errors, security vulnerabilities, and obvious bugs … not style"; PR status with Auto-fix / Auto-merge toggles; **view modes** Normal (tool calls collapsed into summaries) / Verbose (every tool call) / Summary (only final responses and changes); a **usage ring** next to the model picker showing context usage (per session) and plan usage (shared across surfaces); parallel sessions each in a git worktree; side chats (`Cmd+;`), a tasks pane listing subagents / background shells / workflows; OS notification when a session finishes while unviewed [S32].
- **Web**: sidebar of sessions; diff indicator `+42 −18` → diff view; inline comments "queue up until you send your next message, then they're bundled with it"; Create PR (full / draft / GitHub compose); the session stays live after the PR; sessions persist when the tab closes; share with Private / Public (Pro/Max) or Private / Team visibility; archive / delete; `--cloud` shows "a live checklist of setup steps" while provisioning and queues messages typed meanwhile; `--teleport` pulls a cloud session into the terminal [S33, S34].
- **Agent view** (background sessions): rows with a state icon (animated = working, yellow = waiting, green = done, red = failed), name, a one-line summary "generated by a Haiku-class model so the row can tell you what the session is doing, what it needs, or what it produced without opening the transcript", age, PR badge coloured by CI state; grouped **Pinned / Ready for review / Needs input / Working / Completed** "with the most urgent at top"; `Space` opens a peek panel ("Most of the time the peek panel is enough"); terminal title shows `2 awaiting input`; filters `s:blocked`, `#1234` [S37].

### 3.3 Plan mode and permissions (the gate system)

*Observed.* Permission modes: **Manual** (`default`), `acceptEdits`, `plan`, `auto` (a classifier "reviews actions instead of you"), `dontAsk`, `bypassPermissions`; "On Pro, Max, and Team plans, the built-in starting permission mode is auto mode"; `Shift+Tab` cycles; status bar shows `⏸ plan mode on`, `⏵⏵ auto mode on`, etc. [S38]. **Plan mode**: "Claude reads files, runs shell commands to explore, and writes a plan, but does not edit your source … edits stay blocked until you approve the plan." The approval prompt offers **"Yes, and use auto mode"**, **"Yes, manually approve edits"**, **"No, keep planning"**; `Ctrl+G` opens the plan in your editor; an optional first option "approves the plan and clears the planning context" [S38]. **Auto mode** blocks "anything that escalates beyond your request, targets unrecognized infrastructure, or appears driven by hostile content Claude read"; a stated boundary in chat ("don't push") is honoured as a block signal "until you lift it in a later message"; after 3 consecutive or 20 total blocks auto mode pauses and prompting resumes [S38]. Permission prompts: "Yes / Yes, and don't ask again / No" with the saved rule scoped to the repo; you can attach a comment when answering; some prompts offer only one-time approval "when the prompt can show you everything they would allow" [S39]. Actions no mode auto-approves include explicit ask rules, tools that "require user interaction" (`AskUserQuestion`), and `rm` of critical paths [S38].

### 3.4 Hooks

*Observed.* 30+ lifecycle events, including `SessionStart`, `UserPromptSubmit`, `PreToolUse` (can block), `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolBatch`, `Notification`, `SubagentStart/Stop`, `TaskCreated/Completed`, `Stop`, `StopFailure`, `PreCompact/PostCompact`, `Elicitation`, `SessionEnd`; `Notification` matchers include `permission_prompt`, `idle_prompt`, `agent_needs_input`, `agent_completed`, `quota_auto_resume_fired`. Hook types: **command** (deterministic), **prompt** (a Haiku-class model returns `ok` / `reason`), **agent** (a subagent with tools, 60 s / 50 turns, e.g. "verify tests pass before allowing Claude to stop"), **HTTP** [S40].

*Inferred.* The hook taxonomy is a ready-made **event schema** for Rhema's K2: phase-start/stop, tool-call pre/post, gate opened, notification. The prompt/agent-hook idea maps onto the skills' own *fresh-context* checks (second read, fidelity audit, gap analysis) — they are `Stop`-hooks in Claude Code vocabulary (G5, G6).

### 3.5 Subagents

*Observed.* Markdown + YAML frontmatter (`name`, `description`, `tools`, `disallowedTools`, `model`, `permissionMode`); "each subagent runs in its own context window and doesn't see your conversation history"; background subagents run concurrently, "surface every permission prompt in your main session and name the subagent that is asking"; resumable with full history; built-ins Explore (read-only), Plan (read-only), General-purpose; forks inherit the parent conversation; initial context = system prompt + task + CLAUDE.md + git status + preloaded skills + sibling roster [S41]. Agent teams (experimental) "use approximately 7× more tokens" when teammates run in plan mode [S42].

### 3.6 Usage, `/usage`, limits, credits

*Observed.* Enterprise averages: "around $13 per developer per active day and $150–250 per developer per month, with costs remaining below $30 per active day for 90 % of users" [S42]. `/usage` (the old `/cost`) shows a Session block (`Total cost: $0.55 … Usage by model: … 1.2k input, 5.3k output, 940.0k cache read, 50.0k cache write`), and on subscription plans **plan usage bars plus an attribution breakdown**: "recent usage attributed to skills, subagents, plugins, and individual MCP servers, each shown as a percentage"; **behavior flags** "such as long context or cache misses, flagged when one accounts for 10 % or more of recent usage"; **Loops** rows for scheduled tasks; `d`/`w` toggles 24 h / 7 d; when the usage endpoint is rate-limited it shows "last-known usage" with age [S42]. `/insights` writes an HTML report on "what you work on, friction points such as misunderstood requests or buggy code, and suggestions" from up to 200 sessions [S42]. Limits: a five-hour session window and a weekly window, shared across chat / Code / Cowork; when hit, Claude Code can "wait in the open session and continue the task on its own after the limit resets" (`Usage limit reached · continuing automatically at 3:45pm · esc to cancel`), re-arming at most twice [S36, S42]. **Usage credits** (Pro/Max): billed "at standard API rates", $2,000/day redemption cap, monthly spend limit, auto-reload, "a clear notification when approaching and reaching your included usage limits, with a confirmation that you'll continue with usage credits" [S43]. Plan prices: Pro $17/mo annual ($20 monthly); Max 5x $100, Max 20x $200; Team Standard $20/seat annual ($25 monthly), Premium $100 ($125), 2–150 seats; Enterprise "$20/seat plus usage at API rates" [S44, S45, S46]. Cache lifetime "is an hour on a subscription and drops to five minutes once you're drawing on usage credits" [S42].

### 3.7 Team / enterprise dashboards

*Observed.* claude.ai/analytics/claude-code (Team/Enterprise): lines of code accepted, suggestion accept rate, DAU and sessions, PRs with CC, a leaderboard (top 10), CSV export; contribution metrics via a GitHub app, attributing merged PRs to sessions within "21 days before to 2 days after" the merge, excluding lock files / generated code / lines > 1,000 chars, and labelling PRs `claude-code-assisted`; "deliberately conservative" [S47]. Console dashboard (API customers): lines accepted, accept rate, activity, daily spend, per-user "Spend this month / Lines this month" [S47]. Org **spend report** CSV: per-user, per-model tokens and `total_net_spend_usd`, "refreshes daily and has a one-day delay"; MTD / last month / 90 days windows; Enterprise Analytics API on Enterprise only [S48]. Spend caps: usage credits with limits "at the organization, group, or individual member level" [S42].

### 3.8 Rhema analogue

| Claude Code surface | Rhema analogue |
|---|---|
| Transcript view modes Normal / Verbose / Summary | **Feed density toggle**: Summary (phase cards), Normal (phase cards + notable events: source read, claim verdict, finding emitted), Verbose (every fetch/search) (D4, K2, E6) |
| Plan mode → approval prompt with three options | **Structure-plan gate**: "Approve and run autonomously / Approve, gate each phase / Keep planning" (C7) |
| `Esc` interrupt + queued messages + `/btw` | **Pause phase**, **queue guidance for next phase**, **side question** (K5, D9) |
| Diff pane with inline comments bundled into next message | **vN→vN+1 diff with comment-to-guidance**: comments on passages become `guidance` for the next respond-to-review run (D7) |
| Agent view grouped by state with Haiku one-liners | **Project home**: runs grouped Needs you / Running / Ready to read / Done, each with a one-line model-written summary (D2, D16) |
| Permission rule "Yes, and don't ask again" scoped to repo | **Standing guidance** scoped to project ("always skip discourse-map for this blog") (C7) |
| Auto mode classifier + stated boundaries | **No analogue** for safety; *partial* analogue as a **spend classifier** and as honouring stated constraints ("don't cut section III") which the response ledger already models as `escalate` (L6) |
| Hooks (`Stop`, `SubagentStop`, prompt/agent hooks) | **Phase-exit checks** = the skills' fresh-context audits (fidelity audit, gap analysis); expose as "checks passed 3/3" chips per phase (K2, G5) |
| `/usage` attribution + behavior flags | **Run cost drill-down**: cost by phase → by agent role → flags ("fact-check dominated: 62 % — 71 claims") (D12, L5) |
| Usage credits at API rates with monthly cap + auto-reload | **Overage credits** with cap + reload (L2, L3, L6) |
| Wait-and-auto-continue at limit reset | **Queued run** that auto-starts when quota resets (K1, L6) |
| Session sharing Private / Public / Team | **Share a review** read-only link (C13) |
| Checkpoints + `/rewind` (restore code / conversation / both / summarize) | **Draft restore points** for human edits; for agent output, immutability of `vN` makes rewind = "discard vN+1 and its response" (D7, F5, N3) |
| Contribution metrics, leaderboard | **No analogue** in MVP (single author, Q-6); later: team "pieces published with Rhema" |

---

## 4. Long-tail scan: Jules / Antigravity, Amp, Factory, Warp (B1.8)

### 4.1 Google Jules

*Observed.* Task = repo + branch + prompt; "Once you submit a task, Jules will generate a plan. You can review and approve it before any code changes are made"; the plan shows "a natural language description … step-by-step breakdowns … any assumptions or setup steps", with expandable steps and chat-based revision; **"If you navigate away, Jules will eventually auto-approve the plan, which is set on a timer"** [S49, S50]. While running: an **activity feed** "as each step completes" with "inline explanations of each change" and "a mini diff preview for each file", expandable to a full-screen diff editor; "send feedback to Jules while it's working … Jules will respond and, if needed, replan"; **pause** button ("Jules won't do any work, and will wait for your next set of instructions"); completion summary with files changed, runtime, lines, branch; Publish branch / Publish PR [S51, S52]. Limits: Free 15 tasks / rolling 24 h, 3 concurrent, Gemini 2.5 Pro; Pro 100 / 15 concurrent; Ultra 300 / 60 concurrent [S53]. Paid tiers come via Google AI Pro / Ultra; the plans page shows "/mo" placeholders without dollar figures in the fetched render [S54].

*Novel idea:* **task-count quotas** (not tokens) as the consumer-facing unit — "15 tasks per day" is legible in a way "10–100 messages per 5 hours" is not. Rhema's analogue: **"N reviews / month"** as the headline, tokens underneath (L3).

### 4.2 Google Antigravity

*Observed.* Product surfaces: Agent Manager (orchestrate subagents, background workflows), Editor, CLI, SDK; Antigravity 2.0 adds "Projects, workspaces, and scheduled automation" [S55]. **Artifacts**: "a structured deliverable created by the agent to accomplish its task and communicate its progress and thinking to the human user" — rich markdown plans, code diffs, architecture diagrams, images, browser recordings; users "provide inline text feedback to steer the agent's thinking in the proper direction before it modifies any local files"; a **review policy** ("Always Proceed" vs request review) per artifact type; 2.0 has "a visual sidebar and review pane specifically optimized for displaying, organizing, and managing rich Artifacts"; the CLI has "a fast, keyboard-driven review panel" with status-bar notifications when files need approval [S56]. **Implementation plan**: the agent "requests user review before proceeding with changes, unless the artifact review policy is configured to Always Proceed"; approve via a **Proceed** button in the conversation or artifact header; comments on the plan can adjust scope, stack, or decisions; a **Review** mode toggle to examine all feedback before sending [S57]. **Walkthrough**: "a concise summary of the changes … to remind the user of what has happened", often with screenshots and recordings, generated on completion for users who "may not have monitored the entire conversation" [S58]. Quotas: baseline quota for all, "refreshed every five hours" on Pro/Ultra "until weekly limit reached", weekly refresh on free; AI-credit overages with an "AI Credit Overages" setting of **Never** (wait) or **Always** (auto-consume) [S59].

*Novel idea (the best in the scan):* **typed artifacts with per-type review policy**, and a **walkthrough** artifact for the returning user. Rhema's artifacts are already typed by the conventions (piece brief, claim ledger, discourse report, second read, editor's letter, response ledger, drafting note) — the product move is to give each a **review policy** (gate / notify / silent) and to auto-generate a **round walkthrough** ("what changed in v3 and why, in 200 words") (D4, D8, E1).

### 4.3 Amp

*Observed.* Threads are "conversations with the agent, containing all your messages, context, and tool calls", with visibility **Private / Workspace-shared / Group-shared / Unlisted** ("visible to anyone on the internet with the link"); "threads created in workspace-owned projects are shared by default with your workspace members, while personal threads are private by default"; thread links in code reviews give reviewers context [S60]. Four **agent modes** on a dial — Low (GLM-5.2, oracle GPT-5.6 Sol), Medium (GPT-5.6 Sol medium effort, oracle Sol high), High (Sol max effort, oracle Claude Fable 5, "approximately twice the processing time of medium"), Ultra (Fable 5, oracle Sol) — chosen with Ctrl+S or a web mode picker; "every mode has an oracle for second opinions" [S61]. **Puck** is an overlay assistant that starts/monitors/messages agents, "can split a request across several agents and gather their reports", and uses "the thread or project you are viewing as context" [S62]. Pricing: Megawatt $20/mo ("at least $20 of included agent usage", low/medium modes, 750 h of small orbs), Gigawatt $200/mo (all modes, 1,000 h of xxlarge orbs), overage "for the actual model and tool usage in each thread" with no markup for individuals, enterprise usage costs 50 % more, purchased credits expire after 12 months, Amp Free gives "approximately $10 in daily free usage" now ad-free but being "paused for some less-active users" [S63, S64].

*Novel ideas:* (1) the **dial couples model + effort + oracle** into one consumer choice with a one-sentence "when to use" per notch — this is exactly how Rhema should expose G13's curated models: **rigor notches, not model names**; (2) the **oracle** pattern (a second, different model reviews) is an off-the-shelf justification for the skills' *independent second read* being a *different model* — a cheap, marketable trust feature (G5, E6); (3) "at least $X of included usage at provider prices" is a transparent phrasing worth copying (L3).

### 4.4 Factory

*Observed.* Surfaces: desktop app, CLI, web + mobile at app.factory.ai with "cloud session sync"; "Droid runs the same everywhere" [S65]. **Interaction modes**: Normal, **Spec Mode** ("Droid researches the repo, reads relevant files, and proposes a concrete implementation plan"; must not edit files, commit, or write to external systems; on approval you "return to Normal Mode … choose a higher Autonomy Level for implementation, or keep iterating"; approved plans are saved as dated Markdown), **Mission Mode** (an orchestrator for ~1–500 features; "Missions are not fire-and-forget. The orchestrator is an agent, and you can talk to it") [S66, S67]. **Autonomy Level**: Off (reads + allowlisted commands) / Low ("file edits plus low-risk commands") / Medium ("reversible workspace changes" incl. install, commit) / High (push, migrations, `docker compose up`); each command carries a risk level and runs automatically "when the risk is at or below your Autonomy Level"; org policy caps the maximum; Ctrl+L cycles [S68]. Pricing: Pro $20, Plus $100 ("~5× the usage of Pro"), Max $200 ("~10×"), Business (≤150 seats, SSO/SCIM, ZDR), Enterprise [S69].

*Novel idea:* **autonomy is orthogonal to planning** — Spec Mode decides *what*, Autonomy Level decides *how much asks*. Rhema should keep the two axes separate: (a) which gates are on, (b) how deep the rigor is (C7 vs C5).

### 4.5 Warp

*Observed.* Warp Agent runs "in a real terminal", with "approval gates before command execution and file edits" and "parallel agent execution with management panel tracking"; team features "share agent sessions, review agents' actions, and steer running tasks, regardless of who started them" [S70]. **Planning**: plans live in "a native rich text editor" with "clickable file paths"; users "reorganize steps, or refine details"; "each agent modification creates a new version" with compare/rollback; you `@`-reference a plan to execute "the full set of steps or only a specific section"; editing the plan mid-run is honoured ("notify it directly; the agent will adjust") [S71]. **Interactive Code Review**: "Select any changed line or block and add a comment … add as many comments as you need before submitting them"; "the agent receives your entire batch of feedback, applies the changes in one iteration, and returns an updated diff" — also works over Claude Code / Codex / OpenCode [S72]. Automation Platform (formerly Oz): trigger → tracked task → run → outputs, "watch or steer a live run with session sharing" [S73]. Pricing: Free; Build $20/mo ($18 annual) with "1,500 credits ($20 of included agent usage at API rates)"; Max $200 with 18,000 credits ("12× the included usage of Build"); Business $50/user (≤25 seats, 1,500 credits/seat, BYO keys); Enterprise custom [S74].

*Novel idea:* **the plan is a versioned document you can execute section-by-section.** Rhema's outline / structure plan is *already* a document; make it executable by section ("draft section II only") and versioned (C4, D9).

### 4.6 Scan summary — ideas ranked for Rhema

| # | Idea | Source | Rhema row | Verdict |
|---|---|---|---|---|
| 1 | Typed artifacts with per-type review policy + auto walkthrough | Antigravity | D4, D8, E1 | **Adopt** |
| 2 | Post-run insights with "improved prompt" | Devin | D12, K6 | **Adopt** (as "guidance suggestions for next round") |
| 3 | Rigor dial coupling model + effort + oracle with one-line "when" | Amp | C5, G13 | **Adopt** |
| 4 | Task-count quota as headline unit | Jules | L3 | **Adopt** for trial/entry tier; tokens/credits for Pro+ |
| 5 | Plan executable by section, versioned | Warp | C4, D9 | **Adopt** |
| 6 | Autonomy ⊥ planning | Factory | C7 | **Adopt** as a design principle |
| 7 | Timed auto-approve of plans | Devin, Jules | C7 | **Adopt** with a longer default (minutes, not 30 s — prose gates are read, not skimmed) |
| 8 | Overlay orchestrator assistant (Puck) | Amp | D9, G9 | **Later** — Rhema's in-IDE chat already is this |
| 9 | Overage setting Never / Always | Antigravity | L6 | **Adopt** |
| 10 | Shared-by-default workspace threads | Amp | C13 | **Reject** for MVP (single author; sharing must be explicit for manuscripts) |

---

## 5. Cross-product synthesis matrix (B1.9)

Columns: what the surface is in the coding products (with the strongest instance), then the **Rhema prose-domain analogue** or an explicit *no analogue* with the reason, then ledger rows. Where the analogue is a *renaming*, it is flagged; where it is a *new object*, it is described.

| Common surface | Coding-agent instance (best) | Rhema analogue | Type | Rows |
|---|---|---|---|---|
| **Landing page** | Devin / Cursor / Claude marketing sites (studied under B3.1, not here) | Landing page for writers; proof = a real editor's letter on a real draft | same | D15 |
| **Onboarding / first run** | Claude Code web: connect GitHub → Default environment → first task → review diff → PR [S33]; Devin first-run: Ask mode → Agent mode [S2] | Connect *nothing* (no GitHub); choose entry: blank / outline / draft; first run = **one editorial review at reduced depth** on an uploaded draft; time-to-first-value target ≤ 10 min | adapted | B3.3, D18 |
| **Workspace / project list** | Claude Code agent view grouped by state [S37]; Devin Agent Command Center Kanban [S10] | **Project home** grouped **Needs you / Running / Ready to read / Idle**, each row with a one-line model summary; secondary grouping by persona (⚑) | adapted | D2, T1 |
| **Editor** | VS Code / Devin IDE / Codex IDE; agent edits stream into the same file the human can edit | **Prose editor** (T6) that streams agent drafts; locked read-only while an agent writes `vN+1`; human edits to a reviewed `vN` fork a new version | new object | D3, D17, H1–H5, N2, N3 |
| **Agent panel / chat** | Claude Code transcript with Normal / Verbose / Summary; Devin chat + side chat; Codex chat | **Correspondence thread**: one thread per project where author-agent, editor-agent and human speak; density toggle; `/btw` side questions read-only | adapted | D5, D9, T1 |
| **Run / timeline** | Devin Progress tab [S3]; Jules activity feed [S51]; Claude Code `/tasks` + subagent pane [S32] | **Round timeline** (outline → v1 → review → response → v2 …) with **run cards** showing phase i/n, live counters ("41 claims · 33 verified"), ETA, cost so far | new object | D4, K1, K2, K4 |
| **Plan artifact + approval** | Claude Code plan mode prompt [S38]; Devin 30-s plan [S4]; Antigravity implementation plan + Proceed [S57]; Factory Spec Mode [S66]; Warp versioned plan [S71] | Three plan-like gates: **structure plan** (draft-from-outline), **review scope** (which phases, venue bar, stage), **triage ledger** (respond-to-review dispositions before revision). Each is a versioned document, editable inline, with Approve / Approve-and-gate-each-phase / Keep planning, and a countdown auto-proceed that the user can disable | new object | C7, `Q-7`, D6 |
| **Diff review** | Claude Code diff pane + inline comments → next message [S32, S33]; Warp batched review [S72]; Codex summary + focused diff [S19] | **Draft vN→vN+1 diff annotated by response-ledger moves**: each hunk links to the finding it discharges and its disposition (accept / adapt / rebut / defer); inline comments on hunks become `guidance` for the next round; "what changed and why" is derivable, not prose | new object (T2 core) | D6, D7 |
| **Findings / review comments** | Devin Review analysis sidebar with confidence-labelled bugs / security / flags [S8]; Claude Desktop "Review code" comments in the diff [S32] | **Editor's findings anchored to passages** with severity, evidence URL, confidence; rubric caps visible; second-read reconciliation shows rejected findings; disposition controls *are* the response ledger | new object | D6, T2 |
| **Checkpoints / restore** | Claude Code `/rewind` restore code / conversation / both / summarize [S75]; Codex "Git checkpoints before and after" [S22] | **Restore points on human edits** (autosave history); **immutability** of reviewed `vN` means agent "rewind" = discard the un-reviewed `vN+1` and its response; no rewind of delivered dossiers (they are the record) | adapted | D17, F5, N1, N3 |
| **Parallel runs / worktrees** | Claude Desktop worktree per session [S32]; Codex parallel environments [S19]; Devin managed Devins [S5] | **Parallel review variants** (two protocols on the same `vN`) and **parallel sections** (draft section II and IV concurrently) — both write to distinct correspondence paths so no conflict; never two writers of one draft | adapted | C4, K3 |
| **Command palette** | Codex CLI `/status`, `/permissions`; Claude Code slash commands; Amp Ctrl+O; Puck Ctrl+/ | **Command palette** with workflow verbs (`Review`, `Respond`, `Draft section`, `Refresh persona`, `Export`) and artifact jumps | same | D3 |
| **Settings** | Claude Code `/config`, settings.json precedence; Codex config profiles | Account / project / persona settings; **model = rigor notch**, not model name | adapted | D13, G13 |
| **Rules / memory** | CLAUDE.md, AGENTS.md, Warp Rules, Devin Knowledge, Factory memories | **Persona (cross-project prior)** + **voice charter (per-piece contract)** + **standing guidance** per project; agents' private memory hidden by default, inspectable, never editable in place (T3) | adapted | E3, J1–J8 |
| **MCP / tools / integrations** | MCP servers, connectors, GitHub app | **Sources**: Substack / Medium / RSS / URL / file ingestion; web research tools are platform-provided, not user-configured; *no user-facing MCP in MVP* | reduced | I1–I5, G3 |
| **Permission prompts / autonomy modes** | Claude Code Manual / Accept edits / Plan / Auto [S38]; Factory Off–High [S68]; Codex on-request / never / untrusted [S26] | **Gate policy** per project: *Gate every phase* / *Gate the three named gates* (default, `Q-7`) / *Run to completion*; plus a **spend gate** ("pause if run exceeds estimate by 25 %"). Safety classifiers have **no analogue** — prose agents don't `rm -rf`; the only irreversible actions are spend and overwrite, both already gated | adapted + no-analogue | C7, L6 |
| **Interrupt / steer** | Esc + queued messages + comments-into-next-turn (all products) | **Pause phase / cancel run (keep partial artifacts)**, **queue guidance for the next phase**, **comment on a finding or passage** as the steering unit | adapted | K5, K6 |
| **Notifications / inbox** | Codex Scheduled inbox with unread indicator [S23]; Claude Desktop OS notifications [S32]; Devin native notifications [S10] | **Inbox**: gate waiting, run finished, persona stale; email + push + in-app; mobile approves gates and reads findings (Q-18) | same | D16, D19 |
| **Usage dashboard** | Claude Code `/usage` attribution + flags [S42]; Devin Session Insights + Consumption Analytics [S7, S15]; Warp/Amp credit balances | **Three zoom levels** (T7): account period bars → project → run; run drill-down by phase → agent role with flags ("fact-check dominated 62 %", "long draft: 15k words"); post-run **Run report** with guidance suggestions | adapted | D12, L4, L5 |
| **Billing / plans** | $20 / $100 / $200 tiers with 5-h + weekly windows and API-rate credits (Claude, Codex, Amp, Warp, Factory, Devin) | **Free trial** (task-count, e.g. 1 full review or 3 light reviews), **Writer $20** (N light reviews or credits), **Pro $100**, **Studio $200**; **overage credits at cost + margin** with monthly cap, auto-reload, and Never / Always overage switch | adapted | L2, L3, D18 |
| **Team / org** | Claude analytics dashboard + spend CSV [S47, S48]; Devin usage policies [S16]; Amp workspace threads [S60] | **Deferred** (Q-6): viewer / editor / admin on a project; per-user budget caps; *no leaderboard* (writing is not a lines-of-code sport) | reduced | C13 |
| **Session sharing** | Claude Code web Private / Public / Team [S34]; Amp Unlisted threads [S60]; Codex read-only thread snapshots [S24] | **Share a review dossier** read-only by link (for a human co-reviewer or advisor); never default-shared | adapted | C13 |
| **Scheduling / automations** | Claude Routines, Codex Automations, Warp Automation Platform, Devin scheduled sessions | **No analogue in MVP** — writing rounds are author-initiated; *later*: "re-check claims monthly" (discourse moves) and persona refresh on corpus growth | no analogue (now) | C16, J2 |
| **Post-run insight** | Devin Session Insights [S7]; Claude `/insights` [S42]; Antigravity walkthrough [S58] | **Round walkthrough** + **run report** (cost, timings, unmet targets, suggested guidance) | new object | D4, D12 |
| **Browser / computer use** | Devin Desktop tab, Claude Desktop Browser pane, computer use | **No analogue** — the agent's "browser" is the research feed (sources fetched); the user never needs to see a browser | no analogue | K2, E6 |
| **PR / merge** | Create PR, auto-fix, auto-merge (Claude, Codex, Jules, Devin Review) | **Export** (Q-9: md / docx / pdf / LaTeX / Google Docs) is the terminal action; "merge" = **promote `vN+1` to current** (implicit on delivery) | adapted | C15, H7 |
| **Environment config** | Codex environments, Claude cloud environments with setup scripts | **No user-facing analogue** — the harness environment is platform-owned; *partial*: project-level "venue bar / audience / draft stage" is the equivalent configuration the runs need | reduced | C5, G8 |
| **Code review bots** | Devin Review, Claude Code Review (Team/Enterprise), Codex GitHub review | **This is the product** — `editorial-review` is the bot; no separate surface | identity | — |

*Inferred, matrix-level.* Of 27 surfaces, 6 are *new objects* specific to prose (round timeline, three gates, ledger-annotated diff, anchored findings, run report, prose editor with agent locking), 14 are *adapted*, 4 are *reduced*, and 3 have *no analogue* (safety classifiers, browser/computer use, scheduling in MVP). The design work concentrates in the 6 new objects; the rest can borrow interaction patterns wholesale.

---

## 6. Pattern catalogue (cross-cutting observations)

### 6.1 Gates
*Observed.* Every product with a plan step defaults to *soft* gating: Devin 30 s auto-proceed [S4], Jules timer auto-approve [S50], Claude Code's plan prompt is a prompt not a block but the default session mode is auto [S38], Antigravity's review policy can be "Always Proceed" [S57]. Hard gates are opt-in ("Wait for my approval"). *Recommendation.* Rhema keeps `Q-7` (gates on) but implements gates as **approve-with-deadline**: the gate card shows the plan, a "Approve" button, and "auto-continues in 10 min unless you pause". Alternatives rejected: (a) blocking modal — kills async use and mobile; (b) fully autonomous default — contradicts `Q-7` and the $50–100/run cost (`Q-10`) which makes a wrong direction expensive.

### 6.2 Steering
*Observed.* Three universal primitives (interrupt, queue, comment-into-next-turn), and two advanced ones: **edit the plan mid-run and the agent adapts** (Warp [S71]) and **editable queued messages** (Devin Desktop [S10]). *Recommendation.* Implement all five; the "edit the plan mid-run" primitive maps onto editing the structure plan while drafting or editing the triage ledger while revising (K5).

### 6.3 Billing
*Observed.* $20 / $100 / $200 is the universal price ladder (Claude, Codex, Amp, Warp, Factory, Devin Pro/Max); rolling 5-hour + weekly windows are the universal rate-limit shape (Claude, Codex, Antigravity, Devin daily+weekly); overage is API-rate credits with a cap (Claude $2,000/day, Amp/Warp "at API rates"). Task-count quotas exist only at Jules. *Inferred.* Rate windows exist to smooth GPU demand for chat-style usage; Rhema's runs are few, long, and expensive, so a **5-hour window is the wrong shape** — a monthly run-credit pool with per-run estimates (T7) fits better, with concurrency (not rate) as the tier lever (Devin: 10 concurrent sessions on Core [S17 secondary]; Jules 3 / 15 / 60 [S53]).

### 6.4 Trial
*Observed.* Free tiers everywhere but thin (Codex Free "quick coding tasks" [S27]; Jules 15 tasks/day [S53]; Amp ~$10/day being throttled [S64]; Devin Free "limited usage" [S12]); ML-scored trial eligibility at Devin Desktop [S9]. *Recommendation.* Rhema's trial = **one full editorial review** (the flagship, ≈ the "aha") at a capped draft length (e.g. ≤ 4,000 words) plus unlimited chat at a small daily token grant, with email verification and a device/IP fingerprint (L8). Alternative rejected: time-boxed 7-day trial — a writer may not have a draft ready within 7 days.

### 6.5 Usage transparency
*Observed.* Claude Code's attribution breakdown (skills / subagents / MCP as % with behavior flags) [S42] and Devin's Session Insights (ACU + messages + issue timeline) [S7] are the two most informative usage UIs; Codex `/status` and Warp/Amp show balances only. *Recommendation.* Rhema's D12 "right level of detail" = **phase × role × flags**, never raw tokens by default; raw tokens under an "advanced" disclosure for BYO-key users (L7).

---

## Rhema implications (numbered)

1. **Adopt the universal run grammar with prose content types** (transcript + plan + diff + state-grouped list): confirms T1 and T2; drives D3, D4, D6, D7. The 6 new objects in §5 are the design agent's priority list.
2. **Gates = approve-with-deadline at three named gates** (structure plan, review scope, triage ledger), each a versioned, editable document (Warp/Antigravity pattern). Satisfies `Q-7` without blocking async/mobile use (C7, D19).
3. **Steering primitives at phase granularity**: pause / cancel-keep-partials / queue guidance / comment-on-finding / edit-plan-mid-run (K5, K6). Comments on diff hunks become next-round `guidance` — the response ledger already has the vocabulary.
4. **Rigor dial, not model picker**: expose C5 protocol variants and the skills' opt-out phases as Low / Standard / Elite notches with model + effort + second-read-model bundled (Amp's dial), satisfying `Q-4` curated choice and G13 (C5, G10, G13).
5. **Billing**: subscription tiers at $20 / $100 / $200 anchors, included **run credits** (not 5-hour windows), overage at API cost + margin with a monthly cap, auto-reload, and a Never / Always overage switch; trial = one capped full review. Confirms T7; feeds L2, L3, L6, D18. Publish **cost ranges per workflow per tier**, Codex-style.
6. **Usage UI = account bars → project → run → phase × role × flags**; plus a post-run **Run report** with "suggested guidance for next round" (Devin insights) and a **round walkthrough** (Antigravity). D12, L5, K6.
7. **Boundary enforcement posture**: Codex's "refuse rather than silently run unsandboxed" and Claude Code's "permission rules are enforced by Claude Code, not by the model" are the right postures for F4 — the `agents/<role>/` allowlist must be enforced by the runtime, with an attestation the UI can show as a trust chip (E6).
8. **Event schema**: borrow Claude Code's hook event taxonomy as K2's starting vocabulary (phase start/stop, tool pre/post, gate opened, notification, subagent start/stop, compaction); the skills' fresh-context audits are `Stop`-hooks (G5, G6).
9. **Do not build progress UI on an agent-authored to-do list** — Claude Code has retired it for current models; progress must come from the orchestrator's phase model (K1, G4 hybrid strategy).
10. **No analogue, explicitly**: safety classifiers (replace with a spend gate), browser/computer-use panes (replace with the research feed), leaderboards, user-configured MCP, environment config, scheduling in MVP. Each is a scope cut the spec can justify by citation.
11. **Persona ⇄ rules/memory**: coding products keep one memory file per repo; Rhema has three layers (persona prior, per-piece voice charter, standing guidance) with different mutability — surface the precedence rule "human guidance > charter > persona > default" in the UI (J1–J8, E3, T3, T5).
12. **One usage unit from day one** — Devin's ACU vs prompt-credit split after the Windsurf merger is the cautionary case (L3, L4).

## Ledger updates

| Row | Proposed status | Evidence (one line) |
|---|---|---|
| B1.2 | done | §1; S1–S17 (devin.ai/pricing unreachable — see open questions) |
| B1.3 | done | §2; S18–S28 (help-center plan article 403; pricing from learn.chatgpt.com/docs/pricing) |
| B1.4 | done | §3; S32–S48 |
| B1.8 | done | §4; S49–S74 |
| B1.9 | done (draft matrix; D to refine) | §5 matrix, 27 surfaces → analogue / no-analogue |
| C7 | in-progress → propose "approve-with-deadline at 3 named gates" | §6.1 |
| K5 | in-progress → five steering primitives named | §6.2 |
| L3 | in-progress → $20/$100/$200 ladder, run credits not rate windows, published ranges | §6.3, implication 5 |
| D18 | in-progress → trial = one capped full review | §6.4 |
| D12 / L5 | in-progress → phase × role × flags + run report | §6.5, implication 6 |
| K2 | in-progress → adopt hook-event taxonomy | implication 8 |
| T1, T2, T7 | confirmed | §5 matrix; §6.3 |
| T4 | confirmed with caveat | opt-out phases must surface as a rigor dial (implication 4) |

**New rows proposed**

| ID | Item | Owner |
|---|---|---|
| D20 | **Round walkthrough & run report**: auto-generated ≤200-word "what changed and why" per round + cost/timing/unmet-target report with suggested guidance (Antigravity walkthrough + Devin Session Insights) | D/A |
| D21 | **Artifact review policy**: per artifact type, Gate / Notify / Silent; defaults per gate policy (Gate every phase / Three gates / Run to completion) | D/P |
| C17 | **Rigor dial**: Low / Standard / Elite notches bundling protocol phases, model, effort, and second-read model; per-notch cost range | P/A |
| L10 | **Overage switch** (Never / Always) + monthly cap + auto-reload semantics, with the queued-run-on-reset behaviour | P/A |
| K7 | **Editable-plan-mid-run** semantics: which plan documents (structure plan, review scope, triage ledger) may be edited while their run is in flight and how the agent is notified | A/D |

## Open questions / unverified

- **devin.ai/pricing** returned HTTP 429 on four attempts (with and without `www`); the ACU dollar rate ($2.25 / $2.00) and "≈15 min per ACU" come only from **secondary** aggregators [S17] and may be stale given the docs now describe Pro/Max/Teams with quotas. Re-fetch before the spec cites a Devin ACU price.
- **help.openai.com** Codex plan article returned 403; the April 2, 2026 token-billing switch date is **secondary** [S28]. The learn.chatgpt.com pricing page is primary for current numbers.
- **Jules / Antigravity dollar prices**: the Google AI plans page rendered "/mo" placeholders; Pro/Ultra prices not captured.
- **Devin release-note claims** (confidence-gated 🟢🟡🔴 plan approval; Desktop plan mode with `~/.devin/plans/plan-<session>.md`) come from a search snippet of docs.devin.ai release notes, not a fetched page [S13].
- Claude Code **weekly-limit magnitudes** (hours/messages per plan) are not published on the pages read; only the window shape (5-hour + weekly) and multipliers (Max 5×/20× per session; Team Premium 6.25× Pro) are documented [S44–S46].
- Codex **best-of-N** task attempts and container caching were not found on the fetched cloud page; not claimed here.
- Screenshots were not captured (WebFetch returns text); the visual bar (D14) must be judged from the design agent's own visits.
- Whether Antigravity's review policy is configurable per artifact *type* or globally is stated loosely in the docs ("configured as Always Proceed") — verify before designing D21 on it.

## Sources

Accessed 2026-08-27 unless noted. Primary unless marked [secondary].

1. https://docs.devin.ai/get-started/devin-intro — Devin intro (session, Shell/IDE/Browser)
2. https://docs.devin.ai/get-started/first-run — Your First Session (Ask vs Agent mode, task sizing, Session Insights)
3. https://docs.devin.ai/work-with-devin/devin-session-tools.md — Session tools (Progress tab, take over, side chats)
4. https://docs.devin.ai/work-with-devin/interactive-planning — Interactive Planning (30-s auto-proceed, Wait for my approval)
5. https://docs.devin.ai/work-with-devin/advanced-capabilities.md — Advanced capabilities (managed Devins, session analysis, scheduled sessions)
6. https://docs.devin.ai/_llms/en.md — Devin docs index (page discovery)
7. https://docs.devin.ai/product-guides/session-insights.md — Session Insights (ACU, messages, size, issue timeline, improved prompt)
8. https://docs.devin.ai/work-with-devin/devin-review.md — Devin Review (grouped diff, bugs/security/flags)
9. https://docs.devin.ai/desktop/accounts/usage.md — Desktop plans/usage (prompt credits, trial eligibility)
10. https://docs.devin.ai/desktop/agent-command-center.md — Agent Command Center (Kanban, locked sessions, editable queue)
11. https://docs.devin.ai/desktop/accounts/analytics.md — Desktop analytics (PCW, tool calls, My analytics)
12. https://docs.devin.ai/admin/billing/self-serve — Self-serve plans (Free / Pro $20 / Max $200 / Teams $80 min; credits never expire)
13. WebSearch snippet of docs.devin.ai release notes (confidence-gated approval; Desktop plan mode) — **not fetched**
14. https://docs.devin.ai/admin/billing.md — Billing overview (self-serve vs enterprise ACUs)
15. https://docs.devin.ai/admin/billing/usage.md — Usage metering (accrual, Windows +9 %, where usage is shown)
16. https://docs.devin.ai/enterprise/features/usage-policies.md — Per-user ACU limits (tiers, ⅔ warning, blocked → request)
17. [secondary] https://www.usecarly.com/blog/devin-pricing/ and https://www.lindy.ai/blog/devin-pricing via WebSearch — Core $20 + $2.25/ACU, Team $500/250 ACUs, ACU ≈ 15 min (devin.ai/pricing returned 429)
18. https://learn.chatgpt.com/docs — Codex surfaces overview
19. https://learn.chatgpt.com/docs/cloud — Codex cloud (task list, diff stats, tabs, entry points)
20. https://learn.chatgpt.com/codex/cli — Codex CLI (permissions, Esc, steering, `/status`, subagents)
21. https://learn.chatgpt.com/codex/app — Codex desktop app
22. https://learn.chatgpt.com/codex/ide — Codex IDE extension (focused diff, delegate to web, checkpoints)
23. https://learn.chatgpt.com/codex/automations — Automations (Scheduled inbox, unread indicator)
24. https://learn.chatgpt.com/docs/changelog — Changelog Aug 20–27 2026 (codex agents, codex queue, Interrupt hooks, thread snapshots)
25. https://learn.chatgpt.com/docs/permissions — Permission profiles (read-only / workspace / danger-full-access; refuse-if-unenforceable)
26. https://learn.chatgpt.com/docs/agent-approvals-security — Approvals (on-request / never / untrusted; auto-review risk classes; protected paths)
27. https://learn.chatgpt.com/docs/pricing — Plans and usage (Free/Go $8/Plus $20/Pro $100+/Business $20; 5-h window ranges; credits per model)
28. [secondary] https://uibakery.io/blog/openai-codex-pricing via WebSearch — token-billing switch date (help.openai.com article 11369540 returned 403)
29. https://ampcode.com/manual — redirect notice only
30. https://docs.factory.ai/ — Factory docs landing (surfaces)
31. https://antigravity.google/product — Antigravity product page (Agent Manager, CLI, IDE, SDK)
32. https://code.claude.com/docs/en/desktop — Claude Code Desktop (panes, diff comments, Review code, view modes, usage ring, worktrees, side chat, Dispatch)
33. https://code.claude.com/docs/en/web-quickstart — Web quickstart (onboarding, permission modes on web, review & iterate, Create PR)
34. https://code.claude.com/docs/en/claude-code-on-the-web — Web reference (`--cloud`, `--teleport`, sharing, archive, auto-fix, rate limits)
35. https://code.claude.com/docs/en/feature-availability — Feature availability by plan/provider
36. https://code.claude.com/docs/en/interactive-mode — Interactive mode (Esc, queue, `/btw`, task list, recap, wait-for-limit-reset)
37. https://code.claude.com/docs/en/agent-view — Agent view (state groups, Haiku summaries, peek panel)
38. https://code.claude.com/docs/en/permission-modes — Permission modes, plan approval options, auto-mode classifier
39. https://code.claude.com/docs/en/permissions — Permission rules and prompt behaviour
40. https://code.claude.com/docs/en/hooks-guide — Hooks (event table, prompt/agent/HTTP hooks)
41. https://code.claude.com/docs/en/sub-agents — Subagents
42. https://code.claude.com/docs/en/costs — Costs (`/usage` attribution, $13/day averages, credits, limits, team controls)
43. https://support.claude.com/en/articles/12429409-extra-usage-for-paid-claude-plans — Usage credits ($2,000/day cap, spend limit, auto-reload)
44. https://claude.com/pricing — Plans (Pro $17/$20, Max $100/$200, Team $20–$125/seat, Enterprise)
45. https://support.claude.com/en/articles/9266767-what-is-the-team-plan — Team plan (seat multipliers, 2–150 seats)
46. https://support.claude.com/en/articles/11049741-what-is-the-max-plan — Max plan (5-hour reset, weekly limit)
47. https://code.claude.com/docs/en/analytics — Team/Enterprise and Console analytics dashboards
48. https://support.claude.com/en/articles/12883420-view-usage-analytics-for-team-and-enterprise-plans — Spend report CSV, daily refresh
49. https://jules.google/docs — Jules getting started (plan approval, notifications)
50. https://jules.google/docs/review-plan/ — Plan review (timer auto-approve)
51. https://jules.google/docs/code/ — Reviewing code (activity feed, mini diffs, publish)
52. https://jules.google/docs/running-tasks/ — Running tasks (steer mid-task, pause)
53. https://jules.google/docs/usage-limits/ — Usage limits (15/100/300 tasks; 3/15/60 concurrent)
54. https://one.google.com/about/google-ai-plans/ — Google AI plans (Jules/Antigravity entitlements; prices not rendered)
55. https://antigravity.google/docs/getting-started — Antigravity docs index (Projects, artifact pages)
56. https://antigravity.google/docs/artifacts/ — Artifacts (definition, feedback before edits, review policy, review pane)
57. https://antigravity.google/docs/implementation-plan/ — Implementation plan (Proceed, comments, Always Proceed)
58. https://antigravity.google/docs/walkthrough/ — Walkthrough artifact
59. https://antigravity.google/docs/plans/ — Antigravity plans and quotas (5-hour refresh, overage Never/Always)
60. https://ampcode.com/docs/collaborate/thread-sharing — Thread sharing (visibility levels, defaults)
61. https://ampcode.com/news/the-dial — Agent modes Low/Medium/High/Ultra with oracles
62. https://ampcode.com/docs/puck — Puck overlay assistant
63. https://ampcode.com/docs/pricing — Megawatt $20 / Gigawatt $200, overage at provider prices, credits expire 12 months
64. https://ampcode.com/news/amp-free-is-ad-free — Amp Free (~$10/day, throttling)
65. https://docs.factory.ai/ (surfaces) and https://docs.factory.ai/docs/missions/overview — Missions ("not fire-and-forget")
66. https://docs.factory.ai/cli/user-guides/specification-mode — Spec Mode / Mission Mode
67. WebSearch snippet of docs.factory.ai Interaction Modes — corroborating [S66]
68. https://docs.factory.ai/autonomy-and-safety/auto-run — Autonomy Level Off/Low/Medium/High, risk classes, org cap
69. https://factory.ai/pricing — Pro $20 / Plus $100 / Max $200 / Business / Enterprise
70. https://docs.warp.dev/agents/ — Warp agents overview (approval gates, management panel, session sharing)
71. https://docs.warp.dev/agents/capabilities/planning/ — Planning (rich-text versioned plan, execute by section)
72. https://docs.warp.dev/agents/local-agents/interactive-code-review/ — Interactive Code Review (batched comments)
73. https://docs.warp.dev/platform/overview/ — Automation Platform (formerly Oz)
74. https://www.warp.dev/pricing — Free / Build $20 (1,500 credits) / Max $200 (18,000) / Business $50
75. https://code.claude.com/docs/en/checkpointing — Checkpointing and `/rewind` options

Fetch failures this session: devin.ai/pricing (429 ×4), help.openai.com article 11369540 (403), ampcode.com/manual (moved), docs.warp.dev/agents/agent-management (404), support.claude.com article 11145838 fetched but contained no numeric limits.

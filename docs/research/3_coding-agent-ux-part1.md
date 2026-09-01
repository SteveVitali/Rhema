# Coding-agent UX, part 1 — Cursor, Windsurf/Cascade, GitHub Copilot coding agent, and the web-native builders (Lovable, v0, Bolt, Replit Agent)

- Scope: ledger rows **B1.1**, **B1.5**, **B1.6**, **B1.7** (feeds B1.9, D3, D4, D6, D7, D12, D16, D17, D18, K1–K6, L3–L6, N3) · Date: 2026-08-27 · Sources fetched: 74 primary pages + 8 secondary (see §Sources)

Every product fact below was read from the cited page on 2026-08-27 unless flagged *secondary* (search-result summaries or third-party guides) or *unverified*. Fetch failures are listed in §Open questions. Labels: **Observed** (on the page), **Inferred** (my reading), **Recommendation** (with alternatives rejected).

## Executive summary (decisions-first)

1. **Billing has converged on "subscription + dollar-denominated included usage + metered overage at API list price."** Cursor (two token pools, on-demand at API rates), Windsurf/Devin (daily+weekly quotas, extra usage at API list), GitHub Copilot (AI Credits, 1 credit = $0.01, from 2026-06-01), v0 ($-credits), Replit (effort-priced checkpoints against monthly $ credits) all now expose a *dollar* meter. Only Lovable (abstract credits, ~0.5–2.0 per message) and Bolt (raw tokens) keep an opaque unit. **T7 is confirmed with a refinement: the unit should be dollars (or a $-pegged credit), not requests and not raw tokens.** Rhema's pricing (L3) should follow the $-credit pattern with per-*run* price cards, because Rhema's runs are $5–$100 events, not $0.02 chats.
2. **"Plan, then build, behind an approval gate" is now universal** (Cursor Plan Mode, Cascade planning agent + Todo list, Copilot plan-before-PR, Lovable Plan mode at a flat 1 credit, Replit Plan mode → "Start building"). Q-7 (gates on by default) is industry-standard, not a Rhema-specific tax. Lovable's flat-priced plan messages and Replit's read-only plan mode are the closest analogues to Rhema's outline/structure-plan gate.
3. **Checkpoints are automatic, per-turn, and restore files but never chat.** Cursor, Cascade, Lovable, Bolt, v0 and Replit all: auto-snapshot per agent turn; "revert restores project, not conversation"; linear history after restore (v0 explicitly never branches). Replit is the outlier that also restores agent memory and (optionally) the database. Rhema's version rail (D7/N3) should adopt "restore never deletes correspondence" and treat `vN` drafts as named checkpoints.
4. **Run visualization is an activity card + expandable timeline of tool calls, not a log.** Lovable's "activity card → Details (Timeline / Changes tabs)", Copilot's "session log shows reasoning + tools, with token usage and session length", Replit's four-column task board (Drafts / Active / Ready / Done). This is the model for K2/D4.
5. **Trials are quota-shaped, not time-shaped.** Every web-native builder gives a perpetual free tier with a *daily* grant (Lovable 5 build credits/day up to 30/mo; Bolt 300K tokens/day, 1M/mo; v0 7 messages/day + $5/mo; Replit "daily agent credits") and gates *capabilities* (code editing, custom domains, private projects) rather than time. Cursor is the only one in scope with a time-boxed Pro trial (≈2 weeks, *secondary*). Rhema's D18 trial should be "N cheap runs at reduced depth + one full run", capability-gated, not a 14-day clock.
6. **Contradicts thesis T1 mildly:** every product in scope is *agent-centric* (Cursor 3's Agents Window, GitHub's Agents tab, Replit's task board) — the agent session is the primary object, files are secondary. Rhema should still make the *round timeline* the spine (T1), but the coding tools show that a "sessions list" with live status is what users return to. The reconciliation: Rhema's timeline **is** the sessions list, one row per run.

## 1. Cursor (B1.1)

### 1.1 Surface inventory

**Observed.**

| Surface | What is there (source) |
|---|---|
| Landing / pricing | Hobby ($0, "no credit card required", "limited Agent requests"), Pro $20/mo, Pro+ $60/mo, Ultra $200/mo, Teams $40/user/mo, Enterprise custom with "pooled usage" [S1, S3, S11]. Note: cursor.com/pricing renders Pro+/Ultra as "$20/mo base" in its HTML; the docs state $60 and $200 [S3, S11]. |
| Trial | No trial mentioned on the pricing page [S1]. A ≈2-week Pro trial for new users is reported by third-party guides (*secondary*, [S19]); could not verify on an official page. |
| Editor + agent panel | VS Code-fork editor; agent panel with modes rotated by **Shift+Tab** (Agent / Plan / Ask / Debug / Design) [S5]. |
| Plan Mode | "Agent asks clarifying questions… researches your codebase… creates a comprehensive implementation plan"; plan is a markdown file editable in chat or on disk; stored in home dir by default with "Save to workspace" for sharing; "Click to build the plan when ready" [S5]. |
| Diff review | Live "diff view that shows changes as they happen"; stop with **Cmd+Shift+Backspace**; post-hoc **Review panel** with accept/reject per file or per hunk, plus accept-all / undo-all; `@Branch` self-review; automatic **Agent Review** after completion [S7]. |
| Checkpoints | Auto-created "before making significant changes, capturing the state of all modified files"; click any checkpoint in the chat timeline to preview then restore; **"Restoring a checkpoint reverts files only; it does not remove messages from the conversation"**; stored locally, separate from git [S6]. |
| Cloud agents | Started from desktop, cursor.com/agents, iOS app / Android PWA, Slack `@cursor`, GitHub/Bitbucket PR comments, Linear, API. Run in isolated VMs with `.cursor/environment.json`; push to a branch and open PRs with "screenshots, videos, logs"; shared read-only URLs; billed at API price; "Users must set initial spend limits" [S8]. Aug 2026 changelog: **Subscriptions** (agents watch PRs/Slack threads/schedules), **custom modes** with pinned skills, **subagents on isolated VMs**, `/goal` for long-lived objectives, "non-interrupting steering", **Origin** (Cursor-hosted repos), "start from scratch, without a repo" (2026-08-27) [S2]. |
| Parallel agents | Worktrees via `.cursor/worktrees.json`; `/best-of-n` runs the same task across models (`sonnet,gpt,composer`) each in its own worktree; `/apply-worktree` merges; default max 25 worktrees [S10]. |
| Agents Window | Cursor 3 (2026-04-02): agent-first window opened via Cmd+Shift+P; unified list of local/cloud/SSH agents; diffs view with PR management; `/in-cloud`, `/babysit` [S18]; three-region layout (central prompt, top-left agent pane, right inspection panel) per *secondary* write-ups [S78]. |
| Mobile | iOS app: follow the chat stream live, send follow-ups, read full diffs, merge/close PRs; push "when an agent finishes a turn"; Live Activities / Dynamic Island for up to eight agents; Apple Pencil "Design Mode" markup; "Remote Control" handoff from desktop [S12]. |
| Rules / memory | `.cursor/rules/*.mdc`, `AGENTS.md` (nested), user rules, team rules from dashboard; four triggers (Always / Intelligently / glob / manual `@rule`); precedence Team → Project → User [S9]. |
| Hooks / MCP / skills | `hooks.json` at project/user/team/enterprise; events `sessionStart`, `preToolUse`, `postToolUse`, `beforeShellExecution`, `afterFileEdit`, `beforeSubmitPrompt`, `stop`, `subagentStop`; hooks can `deny`, rewrite inputs, inject context, trigger follow-ups [S13]. MCP, skills, plugins all in one "Customize" surface [S4]. |
| Bugbot | PR-diff reviewer posting inline comments with a check status; usage-based billing; rule cap 100k chars per review [S17]. |
| Usage dashboard | "Spending" dashboard shows both pools, remaining allowance, on-demand charges; usage resets monthly, "unused usage does not roll over"; at the cap "you'll see a notification in the editor" then choose pay-as-you-go or upgrade [S14]. |
| Spend alerts & limits | Alerts are email, team- or member-level, "based on on-demand spend only"; limits stop AI features "for that specific user until the next billing cycle"; team default with member/group overrides; "Only Admins Can Edit Usage Settings" toggle; Enterprise Admin API + audit logs [S15, S16]. |
| Billing model | Tokens (input / cache write / cache read / output) priced per million; **two pools** — "Cursor Models" (Grok 4.6 / 4.5, Composer 2.5, "significantly more included usage") and "Other Models" (third-party at API price + $0.25/M "Cursor Token Rate" when routed by Auto); Auto has Cost / Balance / Intelligence sub-modes billed "at the list price of the model each request is routed to"; overage "billed monthly at the same rates" [S3, S11, S14]. |
| Team | Centralized billing, team rules/skills marketplace, shared cloud-agent context, usage analytics, privacy mode, SSO; Enterprise pooled usage, SCIM, MCP/model access controls, audit logs [S1]. |

### 1.2 What to steal

- **The two-pool usage meter.** Users see one bar for "house" models and one for "premium/third-party" models. For Rhema this maps cleanly onto Q-4 (curated model choice): a cheaper "Rhema-routed" pool and a "frontier model" pool, each with its own included dollars. *Inferred:* the pool split is Cursor's way of steering users to its margin-positive models without hiding the frontier ones — exactly the G13 problem.
- **Checkpoint-in-the-chat-timeline with preview-before-restore**, and the invariant that restore never deletes messages. Direct analogue for Rhema's round log.
- **Plan as an editable markdown file that lives beside the chat** rather than as ephemeral chat text; "Save to workspace" to make it a shared artifact. This is literally Rhema's outline / structure plan (D4 gate) — the plan file *is* the artifact.
- **Spend limit as an onboarding requirement for cloud agents** ("must set initial spend limits") — apply to any Rhema run above the L6 threshold.
- **`/best-of-n`** — run the same task with N models and compare. A prose analogue is strong: "draft this section with three personas / three models, pick one." Cheap to specify, unusual value for writers.
- **Notification granularity: "when an agent finishes a turn."** Rhema's D16 should notify on *gate opened* and *run finished*, and nothing finer by default.

### 1.3 What to avoid

- **Pricing-page opacity.** The official pricing page gives no numbers ("limited", "extended", "3x", "20x"); numbers live three clicks deep. Third-party guides fill the vacuum with community-reported figures. Rhema's pricing page (D15/L3) should print the included dollars and a per-run price card.
- **Two currencies on one bill** (included pool dollars + on-demand dollars + Bugbot reviews billed separately). Keep Rhema to a single meter.
- **Feature sprawl in the agent surface**: five modes, hooks, skills, plugins, subscriptions, goals, subagents in one dropdown. Rhema should expose at most three verbs at the input (Draft / Review / Respond) plus chat.

### 1.4 Rhema analogue

- Agent panel + Plan Mode → Rhema's **project chat with `/outline`, `/review`, `/respond` verbs** (D9); plan file → **outline/structure-plan artifact** shown in the editor pane with an "Approve & draft" button (D4, Q-7).
- Review panel with per-hunk accept/reject → **findings dossier with per-finding disposition** (D6, T2) and, for `respond-to-review`, a **per-move accept/adapt/rebut** diff (D7).
- Checkpoints → **draft versions `vN` as named checkpoints; restore = "make vN the working draft"** without deleting correspondence (N3).
- Cloud agents + mobile follow-along → Rhema's runs are already cloud-native; the mobile analogue is **read findings + approve gates + get "turn finished" push** (D19).
- Rules/AGENTS.md → **persona + voice charter + project brief** (E, J); hooks → no user-facing analogue at MVP (internal orchestration only, G).
- Worktrees/best-of-n → **"draft N variants in parallel"** (new row proposed, §Ledger updates).

## 2. Windsurf / Cascade — now "Devin Desktop" (B1.5)

**Observed (identity):** windsurf.com/pricing now 308-redirects to devin.ai/pricing and docs.windsurf.com redirects to docs.devin.ai/desktop/… [S20]. Cognition has folded Windsurf into the Devin brand; the docs say "Memories apply to the legacy Cascade agent only" and point users to the newer "Devin Local" agent and to skills instead [S21]. Treat Cascade as a legacy-but-documented surface.

### 2.1 Surface inventory

| Surface | What is there |
|---|---|
| Modes | Code and Chat; `Cmd/Ctrl+L` opens Cascade; selected editor/terminal text auto-included [S20]. |
| Planning / todos | "A specialized planning agent continuously refines the long-term plan while your selected model focuses on taking short-term actions"; Todo lists auto-generated for complex tasks, user-editable by request; plans updated when Memories are discovered [S20]. Wave 10 Planning Mode with a persistent `plan.md` (*secondary*, [S26]). |
| Diff review | Accept/reject diffs; **revert by hovering a prompt and clicking the revert arrow — "Reverts are currently irreversible, so be careful!"**; a "table of contents" of steps to jump back to [S20]. |
| Checkpoints | "Named snapshots of project states"; conversation "@-mention earlier conversations to retrieve relevant summaries and checkpoints" [S20]. (Dedicated checkpoints page 404'd — see Open questions.) |
| Memories & rules | Auto-generated + user-requested memories stored locally in `~/.codeium/windsurf/memories/`, workspace-scoped, cost no credits; rules at global (6,000 chars, always on), workspace `.devin/rules/*.md` (12,000 chars/file), and enterprise system dirs; triggers `always_on` / `model_decision` / `glob` / `manual`; managed via a "Customizations" icon with Edit buttons [S21]. |
| Tools | Search, Analyze, Web Search, MCP, Terminal; auto-detects and installs packages; **up to 20 tool calls per prompt with an Auto-Continue setting**; queued messages; voice input; "Send to Cascade" from editor problems; linter auto-fix with **credit discounts for fixing its own lint errors** [S20]. |
| Parallel | Multiple Cascades from a dropdown, with a warning that simultaneous edits race; worktrees recommended [S20]. |
| Previews / deploys | App Deploys to Netlify at `<name>.windsurf.build`; Free: 1 deploy/day, 1 unclaimed site; Pro: 10/day, 5 unclaimed [S24]. |
| Sharing | Teams/Enterprise can share "trajectories" (conversation transcripts) [S20]. |
| Billing (2026) | Credits abolished March 2026 → **daily + weekly quotas that refresh automatically**, measured in tokens; "Free models don't count against your quota"; daily allowance "exceeds one-seventh of the weekly budget"; when exhausted, Free waits for reset, paid buys extra usage "at API list prices"; visible via "the usage meter in Devin Desktop, or on your plan page" [S23]. Legacy pages still describe credits (default message = 1 credit, add-ons "$120 for 1000 pooled credits", auto-refill with a $160 default monthly cap) and Enterprise ACUs [S22]. Plan ladder Free / Pro $20 / Max $200 / Teams $40/user / Enterprise (*secondary*, [S25, S26]; devin.ai/pricing returned 429 twice). |
| Trial | "Trials are promotional offers for eligible new customers. Previous Windsurf, Devin, or Codeium users are generally ineligible" [S22]. |

### 2.2 What to steal

- **Daily + weekly quota with a visible reset time.** *Inferred:* this is a throttle disguised as a plan, and it is the best anti-abuse shape for a free tier (L8): a daily grant that cannot be banked. Rhema's free tier should be "X credits/day, Y/month", like Windsurf and Lovable.
- **"Failed operations don't consume credits"** [S22] — an explicit fairness rule Rhema should copy verbatim into K6 (partial-result runs) and L3.
- **Credit discount for fixing your own mistakes** [S20]. Analogue: a `respond-to-review` pass that only fixes findings the editor raised should be cheaper than a fresh draft — argue for a lower price class.
- **Trajectory sharing** (a run transcript as a shareable object). For Rhema, "share the editorial exchange" is a natural viral loop and fits C13.
- **Tool-call budget per prompt (20) with Auto-Continue.** A bounded-step-with-continue-gate is a clean way to expose K5 (steer mid-run) without a full interrupt model.

### 2.3 What to avoid

- **Irreversible reverts.** Rhema's restore must itself be undoable (N1 restore points).
- **Brand/URL churn.** Every Windsurf doc URL now redirects; third-party guides are stale. Keep Rhema's docs and pricing at stable URLs.
- **Running two billing vocabularies simultaneously** (quota pages and credit pages both live). When Rhema changes pricing, retire the old page.

### 2.4 Rhema analogue

- Planning agent + auto-Todo → Rhema's **phase list inside a run card** (K1/K2): "Fact-check (12/31 claims) → Discourse map → Craft → Second read → Rubric". The Todo list is the honest version of a progress bar.
- Memories (hidden, local, inspectable via Customizations) → **T3 confirmed in practice**: private agent memory is not surfaced in the main UI; there is an inspect/edit door. Rhema should copy the "Customizations" door but keep memory read-only in place (E1–E4).
- Rules with character limits and trigger modes → **persona charter (always-on) + project brief (always-on) + genre rules (model-decision)**, each with a stated size cap so users understand context budgets (J, E).
- Quotas → **L3 free tier**.

## 3. GitHub Copilot coding agent (formerly Workspace) (B1.6)

**Observed (history):** Copilot Workspace (technical preview April 2024) was sunset 2025-05-30 and its task → plan → implement → PR flow became the coding agent, GA since September 2025 (*secondary*, [S39]). Everything below is the current "cloud agent".

### 3.1 Surface inventory

| Surface | What is there |
|---|---|
| Entry points | Agents panel "available from any page on GitHub" via a nav-bar button; github.com/copilot/agents full page; Issues (assign to Copilot); `@copilot` in PR comments; VS Code; Copilot app; enterprise schedules/events [S27, S35]. Repository **Agents tab** (2026-01-26) [S36, S34]. Since 2026-04-23, issues show a **"session pill"** header listing sessions; clicking opens a sidebar to "view progress, review logs, or steer the agent"; project boards show sessions by default [S38]. |
| Task form | Text box + repository + branch picker; "recent tasks… with real-time status"; "View all tasks" [S35]. |
| Execution | "Its own ephemeral development environment, powered by GitHub Actions"; **single repo, 59-minute max session, GitHub-hosted repos only** [S27]. |
| Plan → PR | "Researches the repository, creates implementation plans, makes code changes on a branch, then awaits your review before creating a pull request" [S27]; some entry points open the PR automatically, others let you "create a pull request when Copilot finishes work, from the session logs" [S31]. |
| Session view | "Session log and overview, where you can monitor the agent's progress, **token usage, and session length**"; logs "show Copilot's internal reasoning and the tools it used"; **each commit message links to the session log** for audit; Stop session preserves pushed commits; follow-up prompt box under the log; archive; cloud sessions shared by default, local sessions unshared [S29, S34]. |
| Review loop | PR body summarizes work; iterate by `@copilot` review comments or pushing commits; **Actions do not auto-run on Copilot pushes — "Approve and run workflows"** must be clicked; **your approval of a Copilot PR doesn't count** toward required reviews; thumbs up/down feedback [S32]. |
| Customization | Custom instructions, MCP servers, Copilot Memory (Pro/Pro+/Max) [S27]. Copilot app sessions have modes **Interactive / Plan / Autopilot**, model and reasoning-effort pickers, sidebar grouped by repo [S37]. |
| Billing (from 2026-06-01) | **AI Credits, 1 credit = $0.01**, consumed by token usage at published API rates; completions and next-edit suggestions stay unmetered [S33, S79]. Plans: Free $0 (2,000 completions, Haiku 4.5 / GPT-5 mini); Pro $10 with "$15 monthly total" credits; Pro+ $39 with $70; Max $100 with $200; Business $19/user and Enterprise $39/user with pooled allowances ($19/$39, promo $30/$70 June–Sept 2026) [S28, S33]. "Set a dollar budget for additional usage" at $0.01/credit [S28]. Coding agent: one request per session + one per steering comment under the old PRU model; "Each steering message consumes AI credits" under the new one [S30, S29]. "Preview bill" experience in the Billing Overview [S33]. Legacy PRU rules: 300/1,500 per month, $0.04 overage, **no rollover**, reset on the 1st UTC [S30]. |
| Team | Org/enterprise budgets at enterprise, cost-center, and user level; admins choose whether overage is allowed [S33]. |

### 3.2 What to steal

- **Commit ↔ session-log linkage.** Every artifact Rhema's agents write should carry a link back to the run and phase that produced it (provenance badges, D8). This is cheap and is the trust feature for T2/T3.
- **Token usage + session length on the session overview**, not just at billing time. Rhema's run card should show elapsed time and $ spent live (K4, D12).
- **"Awaits your review before creating a PR."** The default is a gate. Also: Copilot's own approval doesn't count — an explicit "the agent cannot approve itself" rule. Rhema's analogue: **a reviewed draft cannot be marked "final" by the author agent**; only the human closes a round (C7).
- **Steering costs one credit and is visible.** Rhema should price mid-run redirects (K5) explicitly rather than absorbing them.
- **Session pill on the issue** — the run status shows up wherever the *object* lives. Rhema: run status pills on the project card, on the draft header, and in the timeline, all the same component.
- **Pooled credits with per-user budgets and a "preview bill"** — the C13/L6 pattern for teams.

### 3.3 What to avoid

- **Two billing regimes in one year** (PRUs → AI Credits) with plan prices unchanged and included usage silently redefined; the change drew visible backlash (*secondary*, [S79]). Rhema should pick $-credits from day one (L3) and never re-denominate.
- **59-minute hard session cap** as an architectural limit. Rhema runs can legitimately exceed an hour (Q-10); K1 must support checkpoint-and-resume rather than a wall-clock kill.
- **Model-dependent multipliers hidden behind "one request"** — the reason PRUs failed. Price by dollars.

### 3.4 Rhema analogue

- Agents panel / Agents tab → **workspace-level "Runs" list** (D1/D2) plus per-project timeline (D4), same row component.
- Session log with reasoning + tools → **run activity feed** (K2) — but Rhema hides prompts/private memory (T3), showing phase, search, source read, finding emitted.
- PR = deliverable → **draft `vN+1` + response ledger** as the deliverable of `respond-to-review`; "approve and run workflows" → **"Approve outline" / "Approve triage" gates** (Q-7).
- AI Credits → **L3 unit = $-pegged credit**.

## 4. Web-native builders (B1.7)

These matter because Rhema is a web app: the question is how a browser-native product does preview/edit split, checkpoints, credit metering, and trial gating.

### 4.1 Lovable

| Surface | What is there |
|---|---|
| Layout | Chat on the left, live preview on the right by default; **Preview toolbar** overlaid on the preview with four modes: *Select elements* (credits), *Edit text inline* ("free up to a daily limit of 100 edits per user"), *Draw annotation* (credits), *Add a comment* (free; sending a thread to AI costs credits); toolbar is draggable, minimizable, remembers position; Auto/Light/Dark theme [S42]. Code editor: left file panel, tabs, Cmd+Shift+F search; **read-only on Free with an "Upgrade" prompt**; each save creates a version; "Reference in chat" and per-line `+` to cite lines; `@filename` [S50]. |
| Modes | **Plan mode: 1 credit per message flat**; produces a structured plan document in a dedicated Plan view (fullscreen option); plan editable as markdown or by highlighting; "Each edit costs one credit"; lives at `.lovable/plan.md`, archived to `.lovable/plan/<date>` on approval; approval switches to Build mode [S48]. **Build mode**: activity cards show "current step… files being modified, tools being used"; Details view with **Timeline** and **Changes** tabs; stop keeps completed work, undo reverts; self-verification via build errors, console, network, browser testing; **"Credit check-ins pause work at predetermined thresholds"**; follow-ups picked up "at its next natural stopping point" [S49, S41]. |
| Versions | Every change creates a version; History panel (top bar toggle or message menu) with All / Bookmarks tabs; click to view a snapshot; preview in new tab; view diffs; jump to originating chat message; **"Reverting restores your project's code only"** (not DB); **revert doesn't destroy chat**; "Revert and resend" to branch; **Published badge** on the live version [S43]. |
| Credits | Unified credits across Build, Cloud (hosting), AI gateway. Build costs vary: "Make the button gray" 0.50, "Remove the footer" 0.90, "Add authentication" 1.20, "Build a landing page with images" 1.70–2.00 [S40, S46]. Free: **5 build credits/day up to 30/month** (reset 00:00 UTC), 20 Cloud credits/mo, 4 AI credits/mo [S45, S46]. Pro from $25/mo for 100 credits up to $2,250/mo for 10,000; Business $50/mo for 100 up to $4,300/mo for 10,000; annual ≈16% off [S45]. Top-ups $0.30/credit (Pro), $0.60/credit (Business), valid 12 months; monthly credits expire 2 months after issue; daily credits expire nightly [S46, S40]. At zero: building stops, deployed AI features fail, backend pauses, published sites keep serving [S46]. Usage: Settings → Plans & credit usage; quick credit bar under the workspace name; breakdown by project, person, time range [S46]. |
| Team | Unlimited members, **no per-seat pricing**, shared pool, per-member monthly credit caps (row menu or CSV), roles Owner / Admin / Editor / Viewer / External collaborator; invites 30 days; Free workspaces limited to 5 invites/day [S40, S47]. |
| Gating | Free: read-only code, no custom domain, public projects; Pro unlocks editing/domains; Business adds RBAC, SSO, no-training; Enterprise adds SCIM, audit logs [S45]. |

### 4.2 v0 (Vercel)

| Surface | What is there |
|---|---|
| Layout | Chat + live preview; Design mode "overlays the design tools on top of your running app in the Preview tab" with layers, selection, property panel and a natural-language box; **Apply** produces a new chat version that is "diffable, reviewable, and revertable"; not on read-only chats or mobile viewports [S55]. Cmd+K command palette, floating design toolbar, annotations mode, clarifying-questions-as-form, tool approvals grouped in one panel, redesigned sidebar with chats grouped by project (Jun–Aug 2026 changelog) [S56]. |
| Versions | "Each time v0 updates a code block from a message, it creates a new version"; direct code edits do **not** create versions; version dropdown top-right; ↩ on a message restores; **restore creates a new latest version — linear, never branches**; deploy uses latest [S54]. Forking a chat from a version is an API-level concept [S80 *search*]. |
| Credits | Free $0 with **$5 monthly credits and 7 messages/day**; Plus $30/user with $30 credits + **$2 free daily credits on login**; Business $100/user, same credits, training opt-out; Enterprise custom [S51]. Credits map to tokens per model (v0 Mini $0.20/$1.20 per M in/out … v0 Max Fast $10/$50) [S51]. "When credits are used up, generation pauses"; monthly credits **roll over and expire after 65 days**; purchased credits last one year; on Plus+, individual credits drain first, then the team's shared pool; Usage dashboard grouped by project or chat, team-wide by member [S52, S56]. Older tiers ("Premium $20") still appear in docs and third-party guides — treat as stale [S52, S81]. |

### 4.3 Bolt (StackBlitz)

| Surface | What is there |
|---|---|
| Layout | Default "chat and a preview"; **`<>` toggle** top-center switches Preview ↔ Code View; file tree with right-click create/delete; Ctrl+S auto-builds; **target files / lock files / highlight-and-Ask-Bolt** to scope the agent; Safari code view is read-only [S60]. Direct edits in Code View cost no tokens [S58]. |
| Versions | Auto-saved timeline via a clock-icon "View history"; rename backups; bookmark; "Restore this version" + confirm → success message in chat; also restore from chat history, manual download, GitHub; **"Restoring… will not change your current Bolt or Supabase databases"** [S59]. Undo has been criticized as reverting multiple steps at once (*secondary*, GitHub issue [S76]). |
| Tokens | Free **300K tokens/day, 1M/month**, Bolt branding, 10MB uploads; Pro $25/mo for 10M tokens, no daily cap; Teams $30/member; Enterprise [S57]. "Most of your token usage comes from Bolt reading, understanding, and syncing your project files" [S58]. Paid tokens roll over "for one additional month… valid for up to two months in total", FIFO; reloads only on top monthly Pro or annual plans, **$20 per 10M** (*secondary* for the price, [S77]), reloaded tokens never expire; balance under My Subscription [S57, S58]. |

### 4.4 Replit Agent

| Surface | What is there |
|---|---|
| Layout | Project editor with chat input carrying a **Plan-mode toggle**, output-type selector (web app, mobile app, slides, design, data visualization…), voice; modes panel Free / Power / Max ("Turbo" optional); Design Canvas for mockups; Preview tab with device presets, Eruda dev tools, element selection, iOS/Android simulators [S74, S73]. |
| Plan vs Build | Plan mode is read-only exploration producing "structured task lists with priorities and dependencies"; **"Start building"** switches to Build; Plan mode is **gated to Core+** [S72, S69]. |
| Task system | Tasks run "in isolated project copies"; four-column board **Drafts / Active / Ready / Done**; review then apply or dismiss; Agent resolves merge conflicts; **Core: 1 active background task; Pro: up to 10**, extra tasks queue [S71]. |
| Checkpoints | Auto at milestones; capture **code, AI conversation history, database, environment, agent memory**; rollback from the Agent tab with warnings; optional dev-DB restore; **non-destructive preview**; rolling forward only if later checkpoints exist — edits after rollback create an alternate history [S64]. |
| Billing | **Effort-based checkpoints** (rolled out to new users immediately, existing Core/Teams 2025-07-01): one checkpoint per completed request, "typically costing less than $0.25" for simple changes, more for bundled complex work; hover the usage icon in the Agent tab to see per-checkpoint cost; usage dashboard; spend alerts in Account → Billing [S62, S67]. Plans: Starter free with "daily agent credits", 1 published app (auto-unpublished after 30 days), 2GB, Lite build only; Core $20/mo ($17 annual) "$20 towards most powerful models", 2 parallel agents; Pro $100/mo ($95 annual) $100 credits, 10 parallel agents, 15 collaborators, 28-day DB rollback; Enterprise [S61, S69, S70]. Usage page filters by date/resource/project/workspace/member; usage limits block paid services; separate **service-shutdown limit**; org limits in $500 increments; auto-reload [S68]. Free Mode settings show allowance and reset time; **⌘+Shift+I** cycles modes [S66]. Complaints that price is unknown until after the task and that failed tasks are still billed (*secondary*, [S75]). |

### 4.5 Cross-builder observations (preview/edit, checkpoints, credits, trial)

**Observed.**

1. **Preview/edit split**: all four default to *chat left, artifact right*, with a toggle (Bolt `<>`, Lovable Dev Mode, v0 Code tab) to swap the artifact from rendered to source. All four now overlay a **toolbar on the rendered artifact** (Lovable preview toolbar, v0 design mode + annotations, Replit element selection, Bolt highlight-and-Ask) so users point at the thing they want changed instead of describing it.
2. **Free direct edits vs. paid AI edits** is universal: inline text edits (Lovable, free to 100/day), Code View edits (Bolt, no tokens), direct code edits (v0, no version created), all cost nothing; only agent work is metered.
3. **Checkpoints** are per agent turn, auto-named, bookmarkable (Lovable, Bolt), previewable before restore (Lovable, Replit, Cursor), and **never delete chat** (Lovable, Cursor, v0 by construction). Databases are the universal exception (Lovable, Bolt exclude; Replit optional). History is linear after restore (v0 explicit; Replit "alternate history" warning).
4. **Credit metering**: three shapes — abstract credit with variable cost per message (Lovable 0.5–2.0; Replit effort-priced checkpoint), $-credits at API cost (v0, Copilot, Cursor), raw tokens (Bolt). All show a *balance bar* in the shell and a *per-action cost* near the action (Replit hover; Lovable credit check-ins; Copilot session overview). Only Lovable pauses work at "predetermined thresholds" for consent to continue.
5. **Trial gating**: perpetual free tier + daily grant (Lovable 5/day, Bolt 300K/day, v0 7 msgs/day + $2/day on paid, Replit daily credits, Windsurf daily quota) + *capability* gates (code editing, custom domains, private projects, Plan mode on Replit, publishing beyond one app). None uses a card-required time trial except Cursor (unverified). Free-tier abuse control is the daily cap plus workspace-level invite limits (Lovable 5/day).
6. **Expiry**: monthly credits expire 60–65 days after issue (Lovable 2 months, v0 65 days, Bolt 2 months FIFO); top-ups 12 months (Lovable, v0) or never (Bolt). Copilot legacy PRUs: no rollover.

## 5. Cross-product comparison matrix

Legend: ● present · ◐ partial/limited · ○ absent · ? unverified. "Rhema" column gives the analogue or "no analogue".

| Surface | Cursor | Windsurf/Cascade | Copilot agent | Lovable | v0 | Bolt | Replit | Rhema analogue |
|---|---|---|---|---|---|---|---|---|
| Landing/pricing shows numbers | ○ (docs only) | ◐ (redirects) | ● ($ credits/plan) | ◐ (docs) | ● | ● (tokens) | ◐ | Print included $ + per-run price cards (D15, L3) |
| Time-boxed trial | ? (≈2 wk, secondary) | ◐ promo, ex-users ineligible | ○ | ○ | ○ | ○ | ○ | Quota-shaped trial, capability-gated (D18) |
| Perpetual free tier w/ daily grant | ◐ (limits unspecified) | ● daily+weekly quota | ◐ (completions only) | ● 5/day, 30/mo | ● 7 msg/day, $5/mo | ● 300K/day, 1M/mo | ● daily credits | Free: N light runs/day + 1 full review/mo |
| Workspace/project list | ● Agents Window (sessions) | ◐ | ● Agents tab/panel | ● dashboard, groups | ● sidebar by project | ● | ● workspaces | Projects grouped by persona + runs list (D1, D2) |
| Editor | ● VS Code | ● VS Code | ○ (GitHub PR) | ● code + preview | ● code + preview | ● code + preview | ● editor + preview | Prose WYSIWYG + findings overlay (H, D3) |
| Agent panel/chat | ● side | ● side | ● session log | ● left | ● left | ● left | ● left | Correspondence pane (T1, D5) |
| Plan/todo display | ● Plan Mode file | ● planning agent + Todos | ● plan before PR | ● Plan view, 1 credit | ◐ clarifying Qs form | ○ | ● task list, Core+ | Outline/structure plan as artifact + gate (D4, Q-7) |
| Run visualization | ● live diff, chat stream | ● TOC of steps | ● log + tokens + length | ● activity card → Timeline/Changes | ◐ screenshots in chat | ◐ | ● task board | Run card phases + activity feed (K1, K2) |
| Diff review accept/reject | ● per-hunk | ● accept/reject | ◐ via PR review | ◐ Changes tab | ● diffable versions | ◐ | ◐ apply/dismiss task | Findings dispositions + per-move diff (D6, D7) |
| Checkpoints/restore | ● files only, keeps chat | ● irreversible revert | ○ (git) | ● keeps chat, code only | ● linear, keeps chat | ● + bookmarks, no DB | ● incl. chat, memory, DB | vN drafts as checkpoints; restore never deletes correspondence (N3, D7) |
| Background/cloud agents | ● VMs, PR handoff | ◐ | ● Actions, 59 min cap | ● (all cloud) | ● | ● | ● background tasks | All runs are cloud; no analogue needed for "local vs cloud" |
| Parallel agents | ● worktrees, best-of-n | ◐ multiple Cascades | ● multiple sessions | ○ | ○ | ○ | ● 1 (Core) / 10 (Pro) | "Draft N variants" (new row); concurrency rules K3 |
| Command palette/shortcuts | ● Shift+Tab modes, Cmd+Shift+P | ● Cmd+L | ◐ | ◐ | ● Cmd+K | ○ | ● ⌘⇧I modes | Cmd+K palette with /verbs (D3) |
| Rules/memory files | ● .cursor/rules, AGENTS.md | ● rules w/ size caps + memories | ● custom instructions, Memory | ◐ (plan.md) | ○ | ○ | ◐ agent memory in checkpoint | Persona/charter/brief; memory inspectable not editable (E, J, T3) |
| MCP/tools | ● + hooks, skills | ● | ● | ● connectors | ● + tool approvals panel | ○ | ● integrations | Research tools internal; user-facing MCP = later (G) |
| Settings | ● Customize hub | ● Customizations | ● | ● Settings → Plans | ● | ● My Subscription | ● Settings → Usage | D13 |
| Notifications | ● editor + push "turn finished" | ◐ | ● session pill, PR | ◐ credit check-ins | ○ | ○ | ● spend alerts | Gate-opened + run-finished only (D16) |
| Usage dashboard | ● two pools, Spending | ● usage meter, reset time | ● session tokens + Billing Overview | ● by project/person/time | ● by project/chat/member | ◐ balance | ● filterable, per-checkpoint | Three zoom levels: period → project → run/role (D12, L5) |
| Billing unit | tokens → $ | tokens → quota | $ credits ($0.01) | abstract credits | $ credits | raw tokens | effort-priced checkpoint ($) | $-pegged credit, per-run card (L3, T7) |
| Overage | on-demand at API rate | extra usage at API list | budget at $0.01/credit | top-up $0.30/$0.60 | buy credits | reload $20/10M | pay-as-you-go + limits | On-demand at list + hard cap default (L6) |
| Spend alerts/limits | ● email, team/member | ◐ auto-refill cap | ● org budgets | ● per-member caps | ◐ | ○ | ● limits + shutdown limit | L6 |
| Team model | seats + pooled (Ent.) | seats, pooled overage | seats + pooled credits | **no seats**, shared pool | seats + shared pool | seats | collaborators/plan | Single author first; Databricks roles later (C13) |

## 6. Rhema implications

1. **Adopt a $-pegged credit and print per-run price cards** (L3, T7, D12, D15). Every $-denominated product (Copilot, v0, Cursor) exposes the same meter; Lovable's abstract credits require a table of example prompts to explain. Rhema's runs are large enough that "an editorial review of a 6,000-word essay costs about 8 credits ($8)" is the honest, legible unit. *Alternatives rejected:* abstract credits (Lovable) — obscure and require re-explaining when model costs shift; raw tokens (Bolt) — meaningless to writers; per-request (legacy Copilot) — failed publicly in 2026.
2. **Pre-run estimate + mid-run "credit check-in"** (K4, L6, K5). Lovable pauses at thresholds; Cursor forces an initial spend limit; Replit is criticized for revealing cost only afterwards. Rhema should show an estimate band before every run, a hard per-run cap defaulted from the estimate, and a consent gate if the run will exceed it. *Rejected:* post-hoc effort pricing (Replit) — generated backlash.
3. **Free tier = daily grant + capability gates, not a countdown** (D18, L8). Copy Lovable/Windsurf: e.g. free users get a small daily chat/research allowance, one reduced-depth review per month, exports gated, personas limited to one. *Rejected:* 14-day full trial (Cursor) — invites abuse for a product whose single run costs $50.
4. **Plan artifact as the gate** (D4, Q-7). Cursor's plan file, Lovable's `.lovable/plan.md` with 1-credit flat edits, Replit's read-only plan mode: all treat the plan as a cheap, editable document with an Approve button. Rhema's outline / structure plan should be exactly this, priced in a cheap class.
5. **Checkpoint semantics** (D7, N1, N3): auto-checkpoint per agent turn; named checkpoints = `vN` drafts; preview before restore; restore never deletes correspondence; restore is itself undoable (fixing Cascade's irreversibility); history stays linear with "revert and resend" for branching (Lovable). Databases-excluded is the coding tools' wart — Rhema's analogue is *persona/memory state*: restoring a draft should not rewind agent memory unless the user opts in (Replit-style option).
6. **Run visualization** (K1, K2, D4): activity card with current phase + counts, expandable to a Timeline tab (phases, searches, sources read, findings emitted) and a Changes tab (artifacts written), plus elapsed time and $ so far (Copilot). Hide prompts and private memory (T3).
7. **Findings review = per-hunk accept/reject generalized** (D6, T2). Cursor's Review panel and Lovable's Changes tab confirm the per-item disposition UI is the expected idiom; Rhema adds *rebut/defer* and writes the ledger.
8. **Agent cannot close its own round** (C7). Copilot's "your approval of a Copilot PR won't count" is the rule to copy.
9. **Provenance links** (D8): every artifact and version records run id + phase; Copilot links commits to session logs.
10. **Notifications** (D16, D19): push/email on "gate opened" and "run finished" only; mobile = read findings, approve gates, follow-ups (Cursor iOS pattern).
11. **Teams later, but design the pool now** (C13, L6): every product pools credits with per-member caps; Lovable's no-seat model is worth considering for Rhema's collaborative tier.
12. **Rhema-specific: "Draft N variants"** (new row). Cursor `/best-of-n` and Replit's parallel tasks have an obvious prose analogue with no coding-tool baggage.
13. **T1 stands, amended.** The coding tools have gone agent-first (sessions list as home). Rhema keeps the round timeline as the spine but each round *is* a run row with live status; the global "Runs" list is the cross-project inbox.

## 7. Ledger updates

| Row | Proposed status | Evidence (one line) |
|---|---|---|
| B1.1 Cursor | done | §1; 18 official pages incl. pricing, usage-limits, checkpoints, review, cloud agents, worktrees, hooks, Agents Window, changelog to 2026-08-27 |
| B1.5 Windsurf/Cascade | done (note rebrand) | §2; docs.devin.ai Cascade, memories, quota, usage, app-deploys; pricing page 429'd twice — plan ladder from secondary |
| B1.6 Copilot coding agent / Workspace | done | §3; Workspace sunset 2025-05-30 (secondary); AI Credits since 2026-06-01 (official blog); agents panel, session logs, review loop |
| B1.7 Lovable / v0 / Bolt / Replit | done | §4; pricing + docs for all four; checkpoint, credit, trial patterns tabulated |
| B1.9 synthesis | in progress | §5 matrix covers 7 products; needs Devin/Codex/Claude Code columns from parts 2–3 |
| T7 | confirmed, refined | Unit = $-pegged credit; estimate-before and actuals-after seen in Lovable/Cursor/Copilot |
| T1 | confirmed with amendment | Sessions-list-as-home is universal; timeline rows = run rows |
| T3 | confirmed | Cascade memories hidden behind Customizations; Replit memory only surfaced via checkpoint |
| D18 | evidence added | Quota-shaped trial + capability gates across all web-native builders |
| L3 | evidence added | Full price/quota table in §4–5; recommend $-credit with per-run cards |
| L6 | evidence added | Spend limits (Cursor), check-ins (Lovable), shutdown limit (Replit) |
| K5 | evidence added | Steering priced per message (Copilot), queued follow-ups at "natural stopping point" (Lovable), Auto-Continue (Cascade) |
| N3 / D7 | evidence added | Checkpoint semantics §4.5 (3) |

**New rows proposed**

| ID | Item |
|---|---|
| D20 | **Variant drafting** ("best-of-n" for prose): run `draft-from-outline` for a section/whole with N models or personas in parallel, side-by-side compare, pick/merge; concurrency + cost rules |
| L10 | **Fairness rules for metering**: failed/cancelled phases not charged (Windsurf), cheaper class for "fix-my-own-findings" passes, no re-denomination of the credit unit ever |
| K7 | **Run resumability**: no wall-clock kill (Copilot's 59-min cap is an anti-pattern for $50 runs); phase checkpoints + resume |
| D21 | **Provenance linkage**: every artifact/version carries run id + phase; "why this changed" opens the run timeline (Copilot commit → session log) |

## 8. Open questions / unverified

- **devin.ai/pricing** returned HTTP 429 twice; the Free / Pro $20 / Max $200 / Teams $40 (or "$80 base + $40/seat") ladder is from secondary guides only [S25, S26]. Needs a re-fetch.
- **Cursor Pro trial** (≈2 weeks) and Hobby numeric limits (≈2,000 completions, ≈50 slow requests) are community-reported [S19]; the official pricing page says only "limited". Cursor's pricing HTML also showed "$20/mo base" for Pro+ and Ultra, contradicted by docs ($60/$200) — treat docs as authoritative.
- **Cascade dedicated pages** for checkpoints and planning mode 404'd at the guessed URLs; behavior taken from the Cascade overview page and secondary write-ups of Wave 10.
- **Copilot included credits**: plans page shows Pro "$15 monthly total" while the April blog says "$10/month" included — likely the blog quoted a pre-launch figure; plans page taken as current. Whether coding-agent sessions still cost a fixed "1 request" under AI Credits is unclear; the tracking doc only says steering "consumes AI credits".
- **Replit** exact Starter daily credit amount, Core/Pro monthly credit amounts (pricing page says "$20 towards most powerful models" / "$100"), and current effort-pricing rollout to legacy users not confirmed on docs.
- **Bolt** reload price $20/10M is from secondary sources; official page confirms mechanics but not the price.
- **v0** "Premium $20" tier appears in the docs pricing page but not on the live pricing page; treated as stale.
- Not researched here: Cursor Origin hosting details, Copilot Spaces/Memory, Lovable security view — out of scope for UX analogues.

## Sources

Primary unless marked *secondary*. All accessed 2026-08-27.

1. S1 https://cursor.com/pricing · Cursor Pricing · plan ladder, team/enterprise features
2. S2 https://cursor.com/changelog · Cursor Changelog · Aug 2026 entries (cloud agents, Origin, subscriptions, subagents)
3. S3 https://cursor.com/docs/account/pricing · Models & Pricing · two pools, Auto billing, token rate
4. S4 https://cursor.com/docs/llms.txt · docs index · sub-page URLs
5. S5 https://cursor.com/docs/agent/modes · Agent modes / Plan Mode · plan file, Shift+Tab
6. S6 https://cursor.com/docs/agent/chat/checkpoints · Checkpoints · restore semantics
7. S7 https://cursor.com/docs/agent/review · Review · per-hunk accept/reject, Agent Review
8. S8 https://cursor.com/docs/cloud-agent · Cloud Agents · entry points, VMs, PR handoff, spend limit
9. S9 https://cursor.com/docs/context/rules · Rules · locations, triggers, precedence
10. S10 https://cursor.com/docs/configuration/worktrees · Worktrees · parallel agents, /best-of-n
11. S11 https://cursor.com/help/account-and-billing/pricing · Pricing help · plan prices, Hobby, Auto
12. S12 https://cursor.com/docs/cloud-agent/mobile · Cursor for iOS · push, Live Activities, PR review
13. S13 https://cursor.com/docs/hooks · Hooks · events, capabilities
14. S14 https://cursor.com/help/models-and-usage/usage-limits · Usage and limits · cap behavior, dashboard
15. S15 https://cursor.com/docs/account/billing/spend-alerts · Spend alerts
16. S16 https://cursor.com/help/account-and-billing/spend-limits · Spend limits
17. S17 https://cursor.com/docs/bugbot · Bugbot
18. S18 https://cursor.com/docs/agent/agents-window · Agents Window
19. S19 *secondary* https://www.verdent.ai/guides/cursor-free-trial-free-plan · Cursor trial/Hobby (community-reported numbers)
20. S20 https://docs.devin.ai/desktop/cascade/cascade · Cascade overview · modes, planning, revert, tools, parallel
21. S21 https://docs.devin.ai/desktop/cascade/memories · Memories & Rules · storage, limits, triggers, legacy note
22. S22 https://docs.devin.ai/desktop/accounts/usage · Usage · legacy credits, add-ons, trial eligibility
23. S23 https://docs.devin.ai/desktop/accounts/quota · Quota-Based Usage · daily/weekly quota
24. S24 https://docs.devin.ai/desktop/cascade/app-deploys · App Deploys · limits per plan
25. S25 *secondary* https://www.cloudzero.com/blog/windsurf-pricing/ · Windsurf plan table
26. S26 *secondary* web search results (releases.sh, verdent.ai, baeseokjae.github.io) · Wave 10 planning mode, March 2026 quota change
27. S27 https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent · About cloud agent · limits, flow
28. S28 https://github.com/features/copilot/plans · Copilot plans · prices, credits, $0.01/credit budget
29. S29 https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/track-copilot-sessions · Track sessions
30. S30 https://docs.github.com/en/copilot/concepts/billing/copilot-requests · Premium requests (legacy) · PRU rules
31. S31 https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-a-pr · Start sessions
32. S32 https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/review-copilot-prs · Review Copilot PRs
33. S33 https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/ · AI Credits announcement
34. S34 https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/manage-and-track-agents · Managing agent sessions
35. S35 https://github.blog/news-insights/product-news/agents-panel-launch-copilot-coding-agent-tasks-anywhere-on-github/ · Agents panel launch
36. S36 https://docs.github.com/en/copilot/concepts/agents/cloud-agent/agent-management · Agent management
37. S37 https://docs.github.com/en/copilot/how-tos/github-copilot-app/agent-sessions · Copilot app sessions
38. S38 https://github.blog/changelog/2026-04-23-view-and-manage-agent-sessions-from-issues-and-projects/ · session pill
39. S39 *secondary* web search (javacodegeeks, buildmvpfast, github.blog changelogs) · Workspace sunset 2025-05-30
40. S40 https://lovable.dev/pricing · Lovable pricing · credit examples, free grants, expiry, team model
41. S41 https://docs.lovable.dev/features/modes · Modes
42. S42 https://docs.lovable.dev/features/visual-edit · Preview toolbar
43. S43 https://docs.lovable.dev/features/projects/history · Version history
44. S44 https://docs.lovable.dev/llms.txt · docs index
45. S45 https://docs.lovable.dev/introduction/subscription-plans.md · Subscription plans · tier prices, gating
46. S46 https://docs.lovable.dev/introduction/credits-and-usage.md · Credits and usage · top-ups, expiry, zero-balance behavior
47. S47 https://docs.lovable.dev/features/people.md · People · roles, per-member caps
48. S48 https://docs.lovable.dev/features/plan-mode.md · Plan mode
49. S49 https://docs.lovable.dev/features/agent-mode.md · Build mode · activity card, check-ins
50. S50 https://docs.lovable.dev/features/code-mode · Code editor · read-only on Free
51. S51 https://v0.app/pricing · v0 pricing
52. S52 https://v0.app/docs/pricing · v0 credits docs · rollover 65 days, shared pool
53. S53 https://v0.app/docs · v0 docs overview
54. S54 https://v0.app/docs/versions · Versions · linear restore
55. S55 https://v0.app/docs/design-mode · Design mode
56. S56 https://v0.app/changelog · v0 changelog May–Aug 2026
57. S57 https://bolt.new/pricing · Bolt pricing
58. S58 https://support.bolt.new/account-and-subscription/tokens · Tokens
59. S59 https://support.bolt.new/building/using-bolt/rollback-backup · Version history & restore
60. S60 https://support.bolt.new/building/using-bolt/code-view · Code View
61. S61 https://replit.com/pricing · Replit pricing
62. S62 https://replit.com/blog/effort-based-pricing · Effort-based pricing
63. S63 https://docs.replit.com/billing/about-usage-based-billing · Usage-based billing (publishing/DB)
64. S64 https://docs.replit.com/features/version-control/checkpoints-and-rollbacks · Checkpoints & rollbacks
65. S65 https://docs.replit.com/llms.txt · docs index
66. S66 https://docs.replit.com/features/agent/agent-modes.md · Agent modes
67. S67 https://docs.replit.com/billing/ai-billing.md · AI billing
68. S68 https://docs.replit.com/billing/managing-spend.md · Managing spend
69. S69 https://docs.replit.com/billing/plans/starter-plan.md · Starter plan
70. S70 https://docs.replit.com/billing/plans/replit-core.md · Core plan
71. S71 https://docs.replit.com/core-concepts/agent/task-system.md · Task system
72. S72 https://docs.replit.com/learn/plan-vs-build-mode.md · Plan vs Build
73. S73 https://docs.replit.com/features/editor/preview.md · Preview
74. S74 https://docs.replit.com/features/agent/overview.md · Agent overview
75. S75 *secondary* web search (usecarly.com, emergent.sh, serenitiesai.com) · effort-pricing complaints
76. S76 *secondary* https://github.com/stackblitz/bolt.new/issues/7814 (via search) · undo granularity complaints
77. S77 *secondary* web search (jetadmin.io, costbench.com) · Bolt reload $20/10M
78. S78 *secondary* web search (dev.to, digitalapplied.com, learncursor.dev) · Agents Window layout, Cursor 3 date
79. S79 *secondary* web search (visualstudiomagazine.com, gapvelocity.ai, tokenmix.ai) · AI Credits allocations 1,500/7,000/20,000 and backlash
80. S80 *secondary* web search · v0 fork-chat API, design mode
81. S81 *secondary* web search (nocode.mba, uibakery.io) · v0 legacy "Premium $20" tier

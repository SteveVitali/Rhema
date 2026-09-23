# Rhema — research & design ledger (v2 — complete, 2026-08-27)

Auditable decomposition of the [founding prompt](1_founding-prompt.md) into
research investigations, design investigations, and decisions. This is the work list
the long-running orchestration will execute; the output of that orchestration is one
comprehensive **product + UI/UX + technical systems & software design spec**.

- **Status vocabulary:** `open` → `in-progress` → `done` | `blocked-on-operator` | `dropped (reason)`.
  Every row must end `done` with **evidence** — a path into the spec, a source actually
  fetched, or an explicit decision + rationale. Nothing is cited that was not read.
- **Owner vocabulary (for the orchestration):** `R` research agent (web + reading),
  `D` design agent (UI/UX reasoning, mockups), `A` architecture agent (systems/data/software),
  `P` product agent (scope, pricing, positioning), `S` synthesis (spec writing).
- **Ground truth read this session:** `~/agent-discourse/README.md`, `conventions/{personas,project-memory}.md`,
  all four `skills/*/SKILL.md` frontmatters, `agent-scratch/{projects,personas}` layouts, both
  2026-08-20 notes. Full SKILL bodies + `references/` + per-skill READMEs still to be read closely (A1).
- **Operator constraints already fixed by the prompt** are marked ⚑ and are *not* re-litigated,
  though each may be critiqued once in the spec if the analysis warrants (the prompt asks for that).

## 0. Working theses (to be tested, not assumed)

These are the design agent's starting hypotheses from the first read. Each is a row later
in the ledger; they are collected here so the orchestration knows what it is trying to
confirm or refute.

- **T1 — The unit of the IDE is the *project* and its *timeline*, not the agent.** Coding
  IDEs are file-centric with agents in a side panel; a prose harness's natural spine is the
  round log (outline → v1 → review → response → v2 …). The agent roles (author / editor) are
  probably better surfaced as *voices in the correspondence* than as top-level UI tabs. (D4, D5)
- **T2 — Review findings are the killer UI.** Every finding in the dossier quotes its passage;
  that maps directly onto anchored inline comments in the editor (à la Google Docs / Cursor's
  diff review), with disposition controls (accept / adapt / rebut / defer) that *are* the
  response ledger. This turns two markdown files into one interactive surface. (D6)
- **T3 — Private agent memory should be hidden by default, inspectable on demand, never
  editable in place.** The boundary rule is the product's integrity guarantee; the UI should
  make it visible as a *feature* ("the editor never saw the author's rationalizations") rather
  than expose the directories. (E1–E4)
- **T4 — Execution should start on a hosted, mature harness (Claude Agent SDK / Claude Code
  in a sandbox) with the skills ported nearly verbatim, and be wrapped by a thin durable
  orchestration layer we own** (run/step/event model, cost meter, gates). Hand-rolling the
  research loop is the wrong place to spend the first year. (G1–G9)
- **T5 — Persona drift is a *staleness* problem with three inputs** (seed text, sample set,
  profile date) and should be rendered as a single status pill with a diff-of-inputs explanation
  and a cost-estimated "Refresh" action — never as a blocking error. (J1–J8)
- **T6 — Markdown-backed WYSIWYG with a ProseMirror-family editor** (Tiptap or Milkdown) is
  the right substrate because anchored comments, track-changes, and Yjs autosave are all
  solved there; Lexical/BlockNote/Plate are the alternatives to evaluate honestly. (H1–H8)
- **T7 — Billing should be credit/usage-metered under subscription tiers** (the Cursor/Devin
  pattern), with per-run cost *estimates before* and *actuals after* each workflow, and spend
  attribution by project → run → agent role, exposed at three zoom levels. (L1–L9)

## A. Ground truth: the source system (`~/agent-discourse`)

| ID | Item | Owner | Status | Evidence |
|---|---|---|---|---|
| A1 | Close-read all four `SKILL.md` bodies + every `references/*.md` + per-skill `README.md` rationale; extract per skill: phases, inputs, human gates (`autonomous: false` pause points), subagent usage, files read/written, opt-out flags | R | done | docs/research/2_source-system-extraction.md |
| A2 | Enumerate the *complete* artifact inventory: every file the conventions define across project memory (`manifest`, `drafts/`, `correspondence/*`, `agents/{author,editor}/*`) and persona profiles (`PERSONA.md`, `docs/`, `profile/*`, `corpus/*`, composite extras) with: producer, consumers, mutability rule, size class | R | done | docs/research/2_source-system-extraction.md |
| A3 | Verify the inventory against the three real projects and three personas in `agent-scratch/` (ground truth of how conventions are actually used; note deviations, e.g. `drafts/figures/`, `taxonomy_reference_sheet.md`, `HOLDOUT-*` corpus notes) | R | done | docs/research/2_source-system-extraction.md |
| A4 | Extract the formal state machine implied by the conventions: what "next workflow" is, given (outline?, drafts, reviews, responses); enumerate every legal entry point (start from scratch / upload outline / upload draft) and every dead-end | A | done | docs/research/2_source-system-extraction.md |
| A5 | Extract every boundary/allowlist rule and every persist-vs-recompute rule into a table that the backend must enforce mechanically (today they are normative prose) | A | done | docs/research/2_source-system-extraction.md |
| A6 | Catalogue what each skill assumes of the *harness*: file R/W, web search+fetch, subagents with fresh context, long context, compaction survival, PDF reading; this becomes the harness requirements list for G | A | done | docs/research/2_source-system-extraction.md |
| A7 | Estimate current per-run cost/latency envelope from the operator's Claude Code usage (tokens, wall-clock, # searches) — needed for pricing (L) and progress UI (K). **Ask operator for observed numbers** | P/A | done | docs/research/10_pricing-billing-auth.md (parametric model calibrated to Q-10; one instrumented run still needed to pin cache-read share); Q-10: $50–100/run at the extreme; see C14 |
| A8 | Read `agent-scratch/notes/*` fully for prior decisions and known defects (e.g. `draft-from-outline` had never been executed as of 2026-08-20; self-review findings) | R | done | docs/research/2_source-system-extraction.md |
| A9 | Roadmap skills (`steelman`, `discourse-map`, loop orchestration to convergence, structured dialogue) — decide which enter the platform spec as v1/v2 features | P | done | docs/research/2_source-system-extraction.md; fuller decision in 12_skills-genres-personas.md ; product form: docs/design/9_product-scope-genres-and-workflows.md |

## B. Competitive & analogical UX research

Rigor rule: each product studied gets a one-page structured note (surface inventory, information
architecture, run-visualization pattern, billing/usage pattern, onboarding, what to steal, what to
avoid), with screenshots/URLs actually visited, dated. Notes live under `docs/research/` as numbered files (`1_…`, `2_…`).

### B1. Coding-agent IDEs and harnesses (the explicit ⚑ inspiration set)

| ID | Product | Focus | Owner | Status | Evidence |
|---|---|---|---|---|---|
| B1.1 | Cursor (editor, agent panel, background agents, Bugbot, pricing/usage dashboard, request-based → usage-based billing history) | full | R | done | docs/research/3_coding-agent-ux-part1.md |
| B1.2 | Devin (web app + desktop; sessions, plans, "Devin's computer" panes, playbooks, ACU billing, org dashboard) | full | R | done | docs/research/4_coding-agent-ux-part2.md |
| B1.3 | OpenAI Codex (cloud tasks UI, CLI, IDE extension, task list, diffs, environment config, rate limits by plan) | full | R | done | docs/research/4_coding-agent-ux-part2.md |
| B1.4 | Claude Code (CLI, desktop, web/cloud sessions, plan mode, permissions, hooks, subagents, usage limits, `/cost`, team/enterprise dashboards) | full | R | done | docs/research/4_coding-agent-ux-part2.md |
| B1.5 | Windsurf / Cascade (flows, memories, rules, credits) | medium | R | done | docs/research/3_coding-agent-ux-part1.md |
| B1.6 | GitHub Copilot coding agent & Copilot Workspace (task → plan → implementation → PR; premium-request billing) | medium | R | done | docs/research/3_coding-agent-ux-part1.md |
| B1.7 | Web-native agent builders: Lovable, v0, Bolt, Replit Agent (relevant because *ours is a web app*: how they do preview/edit split, checkpoints, credits, trial gating) | medium | R | done | docs/research/3_coding-agent-ux-part1.md |
| B1.8 | Google Jules / Antigravity, Amp, Factory Droid, Warp agent — scan for novel run-visualization or usage-UI ideas only | light | R | done | docs/research/4_coding-agent-ux-part2.md |
| B1.9 | Cross-product synthesis: a matrix of common surfaces (landing, onboarding, workspace/project list, editor, agent panel, run/timeline, diff review, checkpoints/restore, command palette, settings, rules/memory, MCP/tools, usage dashboard, billing, team) → for each, the **prose-domain analogue or explicit "no analogue"** | D | done | docs/research/4_coding-agent-ux-part2.md (surface → prose-analogue matrix) |

### B2. Writing-domain products (what a *writer* expects)

| ID | Product | Why | Owner | Status | Evidence |
|---|---|---|---|---|---|
| B2.1 | Lex, Type.ai, Sudowrite, Novelcrafter, Jasper, Wordtune, Grammarly (Authorship/Pro), Notion AI, Google Docs Gemini, Microsoft Copilot in Word | AI-writing UX conventions, inline suggestion patterns, "voice" features, pricing | R | done | docs/research/5_writing-products-and-substack.md |
| B2.2 | Overleaf, Paperpal, SciSpace, Elicit, Consensus, Scite, Zotero | academic niche: citations, bibliography, reviewer-simulation products, integrity norms | R | done | docs/research/5_writing-products-and-substack.md |
| B2.3 | **Substack (web + mobile app — operator-named counter-weight inspiration, Q-14/Q-18)**, Medium, Ghost, WordPress editors; Scrivener, Ulysses, iA Writer | editor beauty bar; web-vs-app feature split; publishing platform APIs/export formats for ingestion (I) | R | done | docs/research/5_writing-products-and-substack.md |
| B2.4 | Google Docs comments/suggesting mode, Word Track Changes, Notion comments, Figma comments | anchored-comment and track-changes UX as the model for review findings (T2) | R | done | docs/research/5_writing-products-and-substack.md |
| B2.5 | ChatGPT deep research, Claude research, Perplexity, Gemini deep research | the in-IDE chat/research experience bar; what "official outline" export could look like | R | done | docs/research/5_writing-products-and-substack.md |

### B3. Landing pages, onboarding, pricing pages (frontier consumer AI bar)

| ID | Item | Owner | Status | Evidence |
|---|---|---|---|---|
| B3.1 | Study landing pages of Cursor, Devin, Codex/OpenAI, Claude, Linear, Lex, Granola, Arc/Dia, Raycast — structure, hero, motion, proof, CTA, pricing-page patterns; capture design tokens/typography trends | D | done | docs/research/6_landing-onboarding-trials.md |
| B3.2 | Trial mechanics survey: free tier limits, credit grants, "one free review," email-verify gating, paywall moments; conversion best practice | P | done | docs/research/6_landing-onboarding-trials.md |
| B3.3 | Onboarding flows: first-run in Cursor/Devin/Lex; time-to-first-value; what the first 5 minutes of Rhēma must be | D | done | docs/research/6_landing-onboarding-trials.md |

## C. Product definition

| ID | Item | Owner | Status | Evidence |
|---|---|---|---|---|
| C1 | Product name/brand (working name **Rhēma**), tagline, positioning statement; naming of agent roles, workflows, tiers | P | done | docs/design/9_product-scope-genres-and-workflows.md; Q-1: name = Rhema |
| C2 | Target users & JTBD per genre: academic (MVP ⚑), journalism, blog/Substack, creative, business, marketing; for each: venue bar, artifacts they already have, integrity norms, willingness to pay | P | done | docs/research/12_skills-genres-personas.md; |
| C3 | Feature matrix: MVP / v1 / later — every feature in the prompt plus proposed additions (see C6) | P | done | docs/design/9_product-scope-genres-and-workflows.md; |
| C4 | The "far too impoverished" critique ⚑: define what makes the experience *powerful* beyond next-step-only — e.g. any workflow anywhere, ad-hoc agent asks against any artifact, partial/targeted re-review of one section, parallel review variants, "what changed and why" views, human gates as first-class | P/D | done | docs/design/6_chat-research-and-visualizations.md; |
| C5 | Genre-specific editorial protocols: how the academic `editorial-review` generalizes — a protocol = rubric + venue bar + phase toggles + calibration language; define the variant set and what differs per genre | P/R | done | docs/research/12_skills-genres-personas.md; ; product form: docs/design/9_product-scope-genres-and-workflows.md |
| C6 | Proposed additional features (each argued for or dropped): outline-from-chat, steelman pre-write, discourse map, convergence loop ("run rounds until score ≥ X"), citation manager/export, plagiarism/self-repetition check via `continuity`, reading-time & venue-length meters, export to docx/pdf/latex/Substack-md, share-to-reviewer link, templates | P | done | docs/design/9_product-scope-genres-and-workflows.md; |
| C7 | Human-in-the-loop policy: which gates default on (structure plan approval; triage before revise), how interruption/redirect works mid-run, how guidance is captured | P/D | done | docs/design/6_chat-research-and-visualizations.md; Q-7: gates ON by default (decided); design the gate UX |
| C8 | Publishing stance: `agent-discourse` never publishes; decide whether the platform ever pushes to Substack/Medium or stays export-only | P | done | Q-9: export-only, no publishing; see C15 |
| C9 | Persona ethics as product policy: which `Mode`s (`self`/`consented`/`house`/`study`) are offered to consumers, with what UI friction and ToS language | P | done | Q-11: no ethics gating; Mode kept as metadata only |
| C10 | Collaboration scope: single author only vs. shared projects, human co-reviewers, org/team | P | done | docs/design/3_visibility-policy-and-data-model.md (roles) + design/9 (Team v1.x); Q-6: single-author first, Databricks-style roles; see C13 |
| C11 | Success metrics & analytics plan (activation, first review, round-2 rate, retention, gross margin per run) | P | done | docs/design/9_product-scope-genres-and-workflows.md; |

## D. UI/UX design (the IDE and its surfaces)

Deliverable per row: wireframe-level description (ASCII/mermaid acceptable) + interaction spec +
rationale + alternatives rejected. A design-system section (tokens, type, color, motion, density,
dark/light) is D14.

| ID | Item | Owner | Status | Evidence |
|---|---|---|---|---|
| D1 | Information architecture: app shell → workspace (projects, personas, usage, settings) → project IDE; navigation model; URL scheme | D | done | docs/design/2_ide-core-ux.md |
| D2 | Project management: list/grid, grouping by persona ⚑ (default: persona-less "Unfiled" ⚑), search, archive, duplicate, templates, new-project flow with three entry points ⚑ | D | done | docs/design/2_ide-core-ux.md |
| D3 | IDE layout: panes (artifact browser / editor / agent-chat / run-timeline / findings), resizable, focus modes, command palette, keyboard map; what is visible by default vs. progressive | D | done | docs/design/2_ide-core-ux.md |
| D4 | **Project state & live process representation ⚑**: the round timeline (outline → v1 → review → response …), run cards with phase progress, streaming activity feed, ETA/cost, cancel/pause/redirect; what "next" affordance looks like | D | done | docs/design/2_ide-core-ux.md |
| D5 | **Agent roles in the UI ⚑ (first principles)**: options — (a) roles as tabs/panels, (b) roles as personas in a single chat, (c) roles as authors of artifacts on the timeline, (d) hidden entirely. Argue and choose; define what an agent "profile" page shows (config, memory summary, spend) | D | done | docs/design/2_ide-core-ux.md |
| D6 | **Review dossier as anchored findings** (T2): findings anchored to passages in the editor, severity, evidence/URL, rubric view, editor's letter view, second-read reconciliation ("rejected findings shown to author"), disposition controls that write the response ledger | D | done | docs/design/2_ide-core-ux.md |
| D7 | Draft versions: version rail, side-by-side and inline diff between vN/vN+1, "what changed and why" tied to response ledger moves, immutability signals for reviewed drafts | D | done | docs/design/2_ide-core-ux.md |
| D8 | Artifact browser: tree vs. typed sections (Drafts / Correspondence / Research / Persona), per-artifact view/edit/locked states, provenance badges (agent-made, human-edited, human-corrected) | D | done | docs/design/2_ide-core-ux.md |
| D9 | In-IDE chat/research session ⚑: ChatGPT-class long-context chat with web research; slash-commands/tools that trigger workflows; "Generate outline" → official artifact; how chat history relates to project memory | D | done | docs/design/6_chat-research-and-visualizations.md; |
| D10 | Persona surfaces: library, persona detail (seed editor, samples manager, profile viewer, calibration report), **drift/staleness status + refresh UX** (T5), link-to-project, change-persona policy UI | D | done | docs/design/8_personas-and-ingestion-ux.md |
| D11 | Writing-sample ingestion UX: upload (multi-format), paste, URL, link Substack/Medium/RSS; sync status, omit/include per article, re-sync, conversion warnings | D | done | docs/design/8_personas-and-ingestion-ux.md |
| D12 | Usage & billing surfaces: plan page, usage dashboard (period, per-project, per-run, per-agent role), run cost drill-down with the *right* level of detail (no token-soup by default), estimates before runs, limits/overage prompts | D | done | docs/design/4_growth-and-billing-surfaces.md |
| D13 | Account/settings: profile, model preferences (if exposed), notifications (run finished / gate waiting), integrations, data export/delete | D | done | docs/design/4_growth-and-billing-surfaces.md |
| D14 | Design system: typography for reading prose (measure, serif/sans choice), density, tokens, dark/light, motion, empty states, loading/streaming states, error states; accessibility (WCAG AA) | D | done | docs/design/2_ide-core-ux.md |
| D15 | Landing page + pricing page + signup/onboarding flow (B3 → design) | D | done | docs/design/4_growth-and-billing-surfaces.md |
| D16 | Notifications & async: runs take minutes–hours; email/push/in-app; returning to a finished run; mobile read-only view of findings? | D | done | docs/design/2_ide-core-ux.md |
| D17 | Autosave/offline/conflict UX ⚑: never-lose-work guarantees, "saved" indicators, restore points, agent-vs-human concurrent edit locking rules (agent writing vN+1 while human edits vN) | D | done | docs/design/2_ide-core-ux.md |
| D18 | Trial experience: what the limited trial can do (e.g. one review at reduced depth), and how paywalls are placed without breaking flow | D/P | done | docs/design/4_growth-and-billing-surfaces.md; research: docs/research/6_landing-onboarding-trials.md (capped reverse trial); design in phase 3 |

## E. Artifact visibility & editability policy ⚑ (surfaced / inspectable / hidden — and why)

| ID | Item | Owner | Status | Evidence |
|---|---|---|---|---|
| E1 | For every artifact in A2, decide: **Surfaced-editable** / **Surfaced-read-only** / **Inspectable on demand** / **Hidden (harness-only)**; record the reason: UX simplicity, integrity (boundary rule), secret sauce, or immutability | D/A | done | docs/design/3_visibility-policy-and-data-model.md |
| E2 | Shared record (`drafts/`, `correspondence/`, `manifest`) — presumably surfaced; decide edit rules (drafts editable until reviewed; letters read-only; manifest derived, not a file) | D/A | done | docs/design/3_visibility-policy-and-data-model.md |
| E3 | Private memory (`agents/author/*`, `agents/editor/*`): argue whether the *user* (who is the author) may see the author-agent's memory, the editor-agent's memory, both, or neither; and whether "user edits the voice charter" is a supported action | D/A | done | docs/design/3_visibility-policy-and-data-model.md |
| E4 | Persona profile files: which are user-facing (calibration report, exemplars?) vs. internal (voice-print rates, lexicon); how "corrections belong in PERSONA.md" becomes a UI rule | D/A | done | docs/design/3_visibility-policy-and-data-model.md |
| E5 | Secret-sauce analysis: what in the skills/references is competitive IP (rubrics, protocols, prompts) and must never be exposed as text; what is safely shown as *outputs* | P/A | done | docs/design/3_visibility-policy-and-data-model.md |
| E6 | Transparency floor: what must be exposed for trust (sources actually fetched with URLs, claim verdicts, attestation that boundaries held, model used) | D/A | done | docs/design/3_visibility-policy-and-data-model.md |

## F. Data model

| ID | Item | Owner | Status | Evidence |
|---|---|---|---|---|
| F1 | Core entities: User, Org/Workspace (if C10), Project, Document (typed artifact) + DocumentVersion, Draft (vN), Correspondence items, Run, Step/Phase, Event, AgentType + AgentInstance (per-project memory namespace), Persona (+ members for composite), Sample/Source, SyncConnection, Gate/Decision, UsageRecord, Subscription/Plan | A | done | docs/design/3_visibility-policy-and-data-model.md |
| F2 | Generalized **agent-type** model ⚑: identity, allowed read/write namespaces, toolset, model config, skills, knowledge bases; how author/editor become instances; extensibility to future roles (steelman, discourse-mapper) | A | done | docs/design/3_visibility-policy-and-data-model.md |
| F3 | Storage strategy: markdown as canonical text ⚑ (object store or DB text), versioned; metadata in Postgres; whether to keep an on-disk project-memory mirror for the harness (likely yes — the skills speak files) and how to sync the two faithfully | A | done | docs/design/3_visibility-policy-and-data-model.md |
| F4 | Boundary enforcement in data: per-agent namespaces enforced by the runtime (sandbox mounts / scoped file APIs), not by prompt norms; audit log of every path touched (the "attestation" becomes verifiable) | A | done | docs/design/3_visibility-policy-and-data-model.md |
| F5 | Immutability rules encoded (reviewed drafts, delivered dossiers); how user edits to a reviewed draft spawn a new version | A | done | docs/design/3_visibility-policy-and-data-model.md |
| F6 | Persona drift model: hashes/timestamps of seed, sample set, profile; staleness computed, not stored as opinion | A | done | docs/design/3_visibility-policy-and-data-model.md |
| F7 | Run/cost model: per-run token/cost/latency by phase and by agent role; roll-ups to project and user; retention | A | done | docs/design/3_visibility-policy-and-data-model.md |
| F8 | Schema draft (ERD + key tables + indexes), migration/versioning approach | A | done | docs/design/3_visibility-policy-and-data-model.md |

## G. Execution harness & agent runtime ⚑ (reuse vs. hand-roll)

| ID | Item | Owner | Status | Evidence |
|---|---|---|---|---|
| G1 | Option survey (each: capabilities vs. A6 requirements, hosting model, cost, licensing/ToS for resale, maturity, lock-in): Claude Agent SDK (headless Claude Code); Claude Code in a per-run sandbox (E2B / Modal / Daytona / Fly Machines / Cloudflare Sandboxes); OpenAI Agents SDK + Codex; Vercel AI SDK hand-rolled loop; LangGraph / Mastra / Inngest AgentKit; managed agent platforms | R/A | done | docs/research/7_execution-harness-options.md; |
| G2 | **Licensing/ToS check**: whether consumer Claude Code / ChatGPT subscriptions can be used to serve third parties (almost certainly not) → API-key-based execution; cost implications | R | done | docs/research/7_execution-harness-options.md; |
| G3 | Deep-research capability: Anthropic web search/fetch tools, OpenAI deep research API, Perplexity Sonar, Exa, Tavily, Firecrawl, Jina Reader — quality, cost, rate limits, citations fidelity; PDF reading | R | done | docs/research/7_execution-harness-options.md; |
| G4 | Skill porting strategy: run `SKILL.md` verbatim inside the harness vs. compile phases into orchestrated steps we control; hybrid (harness runs a phase, orchestrator sequences phases and persists artifacts) | A | done | docs/research/7_execution-harness-options.md; ; design: docs/design/5_execution-and-platform-architecture.md |
| G5 | Subagent/fresh-context primitive: required by second read, fidelity audit, gap analysis, hold-out calibration — how each candidate harness provides it | A | done | docs/research/7_execution-harness-options.md; |
| G6 | Durable orchestration layer we own: run/step state machine, resumability after crash/compaction, cancellation, human gates (`autonomous:false` pause points → UI decisions), retries, idempotency; candidates: Temporal, Inngest, Trigger.dev, Restate, home-grown on Postgres queue | A | done | docs/research/11_platform-orchestration-aws.md; |
| G7 | Streaming: harness events → server → client (SSE/WebSocket), event schema that powers D4 without leaking prompts | A | done | docs/research/11_platform-orchestration-aws.md; |
| G8 | Sandbox & security: tenant isolation, per-agent filesystem scoping (F4), secrets, egress control, prompt-injection from fetched web content, content-safety | A | done | docs/research/11_platform-orchestration-aws.md; |
| G9 | The in-IDE chat ⚑: same harness with a "general assistant" agent-type + tools (`start_workflow`, `read_artifact`, `create_outline`), or a separate lighter loop; context management for long sessions; memory boundary for chat | A/D | done | docs/design/6_chat-research-and-visualizations.md; options: docs/research/7_execution-harness-options.md; design in phase 3 |
| G10 | Model strategy: single provider (Anthropic) vs. multi; per-phase model routing for cost; user-visible model choice? | A/P | done | docs/research/7_execution-harness-options.md; Q-4: Anthropic first, multi-provider, curated user choice; see G13 |
| G11 | Observability/evals: tracing (Langfuse/Braintrust/OpenTelemetry), run replay, quality evals for each workflow (regression on the three real projects) | A | done | docs/research/7_execution-harness-options.md; |
| G12 | Recommendation memo: chosen architecture, with the migration path from "mature harness" to "own more of the loop" | A/S | done | docs/design/5_execution-and-platform-architecture.md |

## H. Document editor technology ⚑ (markdown-backed, beautiful WYSIWYG)

| ID | Item | Owner | Status | Evidence |
|---|---|---|---|---|
| H1 | Candidate evaluation: Tiptap (ProseMirror), Milkdown, BlockNote, Plate (Slate), Lexical, ProseMirror direct, CodeMirror-markdown hybrid (Obsidian/Typora-style live preview), Novel.sh | R | done | docs/research/8_editor-technology.md |
| H2 | Markdown round-trip fidelity (footnotes, citations, tables, figures, math/LaTeX, block quotes, HTML islands) — the academic niche needs footnotes and math | R/A | done | docs/research/8_editor-technology.md |
| H3 | Anchored comments/findings on ranges that survive edits (ProseMirror decorations/marks; Tiptap Comments; Yjs relative positions) | A | done | docs/research/8_editor-technology.md |
| H4 | Track changes / suggestion mode & diffs between versions (prosemirror-changeset, Tiptap Pro track-changes, text-level diff libs) | A | done | docs/research/8_editor-technology.md |
| H5 | Collaboration & autosave: Yjs/Hocuspocus/Liveblocks/PartyKit vs. simple debounced PATCH + version vector; offline queue | A | done | docs/research/8_editor-technology.md |
| H6 | Typography & reading experience: measure, fonts, print/export CSS | D | done | docs/research/8_editor-technology.md |
| H7 | Export pipeline: md → docx/pdf/latex/html (pandoc service), citation styles (CSL) | A | done | docs/research/8_editor-technology.md |
| H8 | Recommendation memo with a scoring matrix | S | done | docs/research/8_editor-technology.md |

## I. Writing-sample & document ingestion ⚑

| ID | Item | Owner | Status | Evidence |
|---|---|---|---|---|
| I1 | Format coverage: .md .txt .docx .pdf (text + scanned/OCR) .rtf .odt .html .epub, Google Docs link, Notion export, pasted text; conversion tools (pandoc, Docling, Marker, unstructured, mammoth, pdf.js) with quality bench on the operator's real PDFs in `personas/steven-j-vitali-academia/docs/` | R/A | done | docs/research/9_ingestion-export-visualization.md |
| I2 | Web/platform linking: Substack (archive/RSS/API, paywalled posts), Medium (RSS/export), Ghost, WordPress, generic URL & RSS; auth'd sources via user export; robots/ToS compliance | R/A | done | docs/research/9_ingestion-export-visualization.md |
| I3 | Canonical markdown normalization spec: front-matter (title, date, url, source, hash), heading normalization, footnote handling, image policy | A | done | docs/research/9_ingestion-export-visualization.md |
| I4 | Sync model: connection → discovered items → include/omit per item ⚑ → re-sync ⚑ → change detection → downstream staleness (J) | A/D | done | docs/research/9_ingestion-export-visualization.md |
| I5 | Storage & rights: "notes, not corpora" rule vs. the platform *must* store user-supplied samples; retention, deletion, no-training guarantee | A/P | done | docs/research/9_ingestion-export-visualization.md |

## J. Persona system ⚑

| ID | Item | Owner | Status | Evidence |
|---|---|---|---|---|
| J1 | Map `bootstrap-persona` (bootstrap / refresh / compose, calibration hold-out, usage mode, sample size) onto the platform's Run model; what inputs the UI collects | A | done | docs/research/12_skills-genres-personas.md; |
| J2 | Drift/staleness design (T5): inputs → status (fresh / seed-changed / samples-changed / aged / never-built) → explanation → estimated refresh cost → action; partial refresh vs. full rebuild | A/D | done | docs/research/12_skills-genres-personas.md; |
| J3 | Custom description optional ⚑: what a generated seed looks like when the user writes nothing; how user corrections flow into `PERSONA.md` not into derived files | D/A | done | docs/research/12_skills-genres-personas.md; |
| J4 | Composite personas: whether the MVP exposes them; register routing UI | P/D | done | docs/research/12_skills-genres-personas.md; |
| J5 | Project ↔ persona linking ⚑; grouping projects by persona ⚑; **change policy** — hypothesis: freely changeable before v1 exists, locked after (⚑ operator's lean) with an explicit "fork project under new persona" escape hatch; research whether locking is right | P/D | done | docs/research/12_skills-genres-personas.md; |
| J6 | Persona profile viewer: which profile sections are user-facing (E4), calibration report as a trust feature | D | done | docs/research/12_skills-genres-personas.md; |
| J7 | Multi-persona per user, sharing house personas (venue styles) as platform-provided library? | P | done | docs/research/12_skills-genres-personas.md; |
| J8 | Cost control: sample caps, previews, "quick voice" (cheap) vs. "full profile" (expensive) tiers | P/A | done | docs/research/12_skills-genres-personas.md; |

## K. Live workflow state, runs, and process representation ⚑

| ID | Item | Owner | Status | Evidence |
|---|---|---|---|---|
| K1 | Run state machine: queued → running(phase i/n) → waiting-on-human(gate) → completed / failed / cancelled; sub-steps; artifacts emitted per phase | A | done | docs/design/3_visibility-policy-and-data-model.md |
| K2 | Event schema for the UI (phase started, search performed, source read, artifact written, finding emitted, gate opened) — designed so the feed is *interesting and trustworthy* without exposing prompts | A/D | done | docs/design/3_visibility-policy-and-data-model.md |
| K3 | Concurrency rules: which runs may overlap (review of vN while user edits a scratch copy; never two writers of the same draft), locking and queueing UX | A/D | done | docs/design/3_visibility-policy-and-data-model.md |
| K4 | Progress/ETA/cost estimation model (from historical phase timings) | A | done | docs/research/11_platform-orchestration-aws.md; |
| K5 | Interrupt/redirect mid-run (Cursor/Claude Code-style "steer"): supported? at which phases? | A/D | done | docs/design/6_chat-research-and-visualizations.md; docs/research/11_platform-orchestration-aws.md; |
| K6 | Failure/retry/partial-result semantics (a review that completed fact-check but died in craft critique still has value) | A | done | docs/research/11_platform-orchestration-aws.md; |

## L. Accounts, billing, usage & pricing ⚑

| ID | Item | Owner | Status | Evidence |
|---|---|---|---|---|
| L1 | Auth provider evaluation (Clerk, WorkOS, Auth.js, Supabase Auth, Better Auth); email + Google/Apple; orgs later | R/A | done | docs/research/10_pricing-billing-auth.md; |
| L2 | Billing stack: Stripe Billing + meters vs. Lago/Orb/Metronome; subscription tiers + included credits + overage; trials; proration; invoices | R/A | done | docs/research/10_pricing-billing-auth.md; |
| L3 | Pricing model design: tiers (Free trial / Pro / Max-style), what a "credit" is (abstract units vs. $), included quotas, per-workflow price cards, rate limits; margin model against A7 | P/R | done | docs/research/10_pricing-billing-auth.md; Q-5: delegated to deep research — elevated priority |
| L4 | Usage attribution pipeline: harness token usage → run → phase → agent role → project → user; near-real-time meter | A | done | docs/research/10_pricing-billing-auth.md; |
| L5 | Usage dashboard & spend drill-down (D12) data contracts; "how much detail" policy ⚑ | A/D | done | docs/design/4_growth-and-billing-surfaces.md |
| L6 | Hard limits / soft limits / budget caps per project; pre-run estimate consent above a threshold | P/A | done | docs/research/10_pricing-billing-auth.md; |
| L7 | BYO-API-key option? (common in coding tools; affects margin and support) | P | done | docs/research/10_pricing-billing-auth.md; Q-4: platform-billed usage primary; BYO keys optional mode to decide |
| L8 | Refund/abuse/fraud, free-trial abuse controls | P | done | docs/research/10_pricing-billing-auth.md; |
| L9 | Tax/legal: Stripe Tax, ToS, privacy policy, DPA; content ownership; no-training clause | P | done | docs/research/10_pricing-billing-auth.md; |

## M. Platform architecture, infra, security, ops

| ID | Item | Owner | Status | Evidence |
|---|---|---|---|---|
| M1 | Stack recommendation (frontend framework, API layer, DB, object storage, queue/orchestrator, sandbox provider, hosting) with alternatives and rationale; align with operator preferences | A | done | docs/research/11_platform-orchestration-aws.md; Q-3: TypeScript, no Python, AWS-first; see M8 |
| M2 | Service decomposition: web app, API, orchestrator/worker, harness sandbox, ingestion service, export service, billing webhooks, sync scheduler | A | done | docs/research/11_platform-orchestration-aws.md; |
| M3 | Multi-tenancy & isolation; secrets; data residency; backups; retention/deletion | A | done | docs/research/11_platform-orchestration-aws.md; |
| M4 | Security review: prompt injection via fetched sources, sandbox escape, SSRF in link ingestion, file upload safety, PII | A | done | docs/research/11_platform-orchestration-aws.md; |
| M5 | Observability, SLOs, cost monitoring, incident playbooks | A | done | docs/research/11_platform-orchestration-aws.md; |
| M6 | Dev workflow: monorepo layout, env/CI, preview deploys, evals in CI (G11), seed data from the three real projects | A | done | docs/research/11_platform-orchestration-aws.md; |
| M7 | Performance budgets: editor with 20k-word drafts, streaming feeds, large dossiers | A | done | docs/research/11_platform-orchestration-aws.md; |

## N. Autosave, persistence, and never-lose-work ⚑

| ID | Item | Owner | Status | Evidence |
|---|---|---|---|---|
| N1 | Autosave architecture (H5) — local-first buffer (IndexedDB) + server sync + conflict policy; restore points; "unsaved" is never a user-visible state | A | done | docs/research/8_editor-technology.md |
| N2 | Agent-written vs. human-written concurrency (D17/K3) | A | done | docs/research/8_editor-technology.md |
| N3 | Version semantics: "save" vs. "new draft version" — when a human edit becomes `v(N+1)` | A/D | done | docs/research/8_editor-technology.md |

## O. Spec synthesis & review process

| ID | Item | Owner | Status | Evidence |
|---|---|---|---|---|
| O1 | Spec skeleton agreed (proposed): 1 Vision & positioning · 2 Users & JTBD · 3 Product scope & phasing · 4 Information architecture · 5 IDE UI/UX (per surface) · 6 Workflows & agent roles · 7 Artifact visibility policy · 8 Persona system · 9 Ingestion · 10 Data model · 11 Execution architecture · 12 Platform/infra/security · 13 Billing & usage · 14 Landing/onboarding/growth · 15 Risks & open questions · 16 Roadmap · Appendices (research notes, competitor matrix, editor scoring, harness scoring) | S | done | docs/rhema-design-spec.md |
| O2 | Every claim in the spec cites a research note or a decision row; no unread sources (repo rule) | S | done | docs/rhema-design-spec.md |
| O3 | Adversarial self-review of the spec (fresh context): consistency, over-engineering, missing surfaces, MVP realism | S | done | docs/design/11–13 (reviews) → spec v0.2, Appendix E dispositions |
| O4 | Where the spec lives: `~/Rhēma/docs/rhema-design-spec.md`; git init decision | S | done | Q-13: single doc in `~/Rhēma` git repo; intermediates gitignored; git init done |
| O5 | Opened in Zed for operator review at each turn ⚑ | S | done | every turn |

## Q. Operator decisions register (answers received 2026-08-27, turn 2)

Each answer is now a binding input (still negotiable per Q-20: presumption in favor of the
operator's spec, defeasible only by strong reasoning/evidence stated in the spec).

| ID | Question (abridged) | Decision | Unblocks / new rows |
|---|---|---|---|
| Q-1 | Product name | **Rhema** (product name; "Rhēma" only as working-dir spelling). Role/tier naming left to design. | C1 → open |
| Q-2 | Who builds, when | Built with agents. Sequence: (1) **this session → canonical design spec**; (2) later session hardens it into an agent-ready design+implementation spec split into tickets, implemented via chained `~/agent-skills/skills/implement-spec` runs. No calendar dates. | C3, M6; new O6 |
| Q-3 | Stack | **No Python.** TypeScript backend acceptable (operator's native preference is Scala + Bazel — a compromise, so keep a typed, rigorous style). **AWS** for storage/compute/deploy. Supabase/Vercel/etc. undecided: operator wants a judgment balancing convenience, cost-at-scale, control/granularity, scalability, with a bias against 3rd-party dependencies that get expensive or constrain rigor. No Stripe account yet; Anthropic/OpenAI/AWS accounts exist under the operator's Google account. | M1 → open; new M8 |
| Q-4 | Models | Anthropic first, **multi-provider by design**; users select from a curated model range. Platform handles routing + inference billing and charges for usage; BYO keys *possibly* supported in addition — decide in spec. | G10, L7 → open |
| Q-5 | Pricing | **Delegated to deep research**: derive optimal model + price points from industry norms for comparable products. | L3, D18 → open; L3 elevated |
| Q-6 | Collaboration | Single-author to start; design for basic multi-user on the **Databricks-notebook sharing model** (per-user access control: viewer / editor / admin). | C10 → open; new C13 |
| Q-7 | Human gates | **On by default** (steps are long and expensive). | C7 → decided |
| Q-8 | Academic apparatus | Basic citation management, thoughtfully but not ocean-boiling; **footnotes required**; LaTeX/PDF export if easy; **AI-generated visualizations** requested in-flow, auto-inserted at the right spot, iterable — a first-class feature with careful UX. | C2, H2, H7 → open; new C12 |
| Q-9 | Publishing | **No publishing.** Export to txt / rtf / md / Word / Google Docs / PDF / LaTeX etc. | C8 → decided; new C15 |
| Q-10 | Run costs | Extreme case: 15k words, 70+ citations, Fable 5 in Claude Code → **$50–100 per run** for each of draft-from-outline / editorial-review / respond-to-review. Scaling with length/model unknown → must be modeled. | A7 → open (model the curve) |
| Q-11 | Persona ethics | **No ethics gating**; full freedom to build custom personas. (Spec may keep the `Mode` field as metadata only, and must still note legal/ToS exposure once, briefly.) | C9 → decided |
| Q-12 | Privacy | Reasonable posture; **do not concede more than necessary** (no-training guarantee not assumed); no compliance ocean-boiling. | L9, M3 → open (minimal) |
| Q-13 | Spec location | **Single doc in a new git repo** (`~/Rhēma/docs/rhema-design-spec.md`); intermediate research notes under `docs/research/`, gitignored to start. `git init` approved. | O4 → done this turn |
| Q-14 | Design taste | **Dark by default**. **Substack** as a deliberate counter-weight inspiration to Cursor/Devin/Codex; research further and choose. | D14 → open; B2.3 elevated |
| Q-15 | Genres | MVP offers **more than academic**; default genre/persona set to be derived from market research. | C2, C5 → open |
| Q-16 | Roadmap skills | **In v1 spec**, fully specified (content/structure/mechanism), plus **invent new skills** with rigorous grounding. | A9 → open; new C16 |
| Q-17 | Languages | English-only MVP. | C2 |
| Q-18 | Mobile | Support mobile; consider a **platform-independent mobile app** with a substantially limited feature set; Substack web vs. app as the exemplar. | D16 → open; new D19 |
| Q-19 | Open source | `agent-discourse` stays public; **Rhema closed-source**, but repo/docs structured so flipping to public is frictionless. | E5 → open; new M9 |
| Q-20 | Negotiability | Everything negotiable; presumption in favor of the operator's spec, defeasible by strong reasoning/evidence. | all ⚑ rows |

### New rows introduced by the answers

| ID | Item | Owner | Status | Evidence |
|---|---|---|---|---|
| C12 | **Visualizations**: user asks for a chart/figure/table/diagram (in chat, or from a selection in the editor); agent generates it (data-driven charts, conceptual diagrams, tables), inserts it at the right location with caption/alt/source line, and supports iteration ("make it a bar chart", "use the CHES data"). Research: generation tooling (Vega-Lite/Plotly/Mermaid/D3 in a sandbox, image vs. SVG vs. live spec), storage as project assets, how figures behave in review (fact-check of chart data) and export (H7). Note real precedent in `structure-of-political-difference/drafts/figures/`. | P/D/A | done | docs/design/6_chat-research-and-visualizations.md; tooling: docs/research/9_ingestion-export-visualization.md (spec+data+provenance → SVG via Vega-Lite/Mermaid, proposals, fact-checked); UX in phase 3 |
| C13 | **Sharing & roles** (Databricks-notebook model): project-level viewer / editor / admin; invite by email; what each role can do with runs, gates, spend; org/workspace entity deferred or minimal | P/A | done | docs/design/3_visibility-policy-and-data-model.md |
| C14 | Workflow invocation cost model: derive cost curves by length × citation density × model tier from the $50–100 upper bound; drives pricing (L3), estimates (K4), model routing (G10) | P/A | done | docs/research/10_pricing-billing-auth.md; |
| C15 | **Export matrix**: txt, md, rtf, docx, Google Docs, PDF, LaTeX, HTML; footnotes/citations/figures fidelity per format; pandoc-based service; "Google Docs" = Drive API export vs. docx download | A | done | docs/research/9_ingestion-export-visualization.md |
| C16 | **Skill invention & full specification of roadmap skills**: `steelman`, `discourse-map`, loop-to-convergence orchestration, structured dialogue, plus candidates to research and argue for/against — e.g. `outline-from-research` (chat → outline), `sharpen-thesis`, `fact-check-only`, `line-edit`, `cut-to-length`, `title-and-deck`, `abstract-and-keywords`, `peer-review-simulation` (journal-style R1/R2), `literature-map` (academic), `reader-test` (audience simulation), `retitle/repackage-for-venue`, `translate-register` (academic → essay under a composite persona), `visualize` (C12). Each: purpose, phases, inputs, artifacts, gates, cost class, research grounding. | R/P | done | docs/research/12_skills-genres-personas.md; ; product form: docs/design/9_product-scope-genres-and-workflows.md |
| D19 | **Mobile app**: platform-independent (React Native/Expo vs. PWA — evaluate); limited feature set (read drafts & findings, approve gates, chat, notifications, light edits?); Substack's web-vs-app split as exemplar | D/A | done | docs/design/7_mobile-companion.md |
| G13 | **Multi-provider model routing**: provider abstraction (Anthropic, OpenAI, Google, others), curated user-facing model list, per-phase routing defaults, capability gating (which phases need web-search/subagents and which providers supply them), cost pass-through; optional BYO keys as a mode | A/P | done | docs/research/7_execution-harness-options.md; |
| M8 | **Build-vs-buy policy on AWS**: for each managed service class (auth, DB, object storage, queue/orchestration, realtime, email, billing, sandbox), compare AWS-native / self-hosted vs. 3rd-party SaaS on cost-at-scale, control, lock-in; produce a recommendation consistent with "avoid expensive-at-scale, low-control dependencies" | A | done | docs/research/11_platform-orchestration-aws.md; |
| M9 | **Open-source-ready repo hygiene**: no secrets in repo, licenses, public-safe docs, protocol IP separated so that flipping public is a switch | A | done | docs/research/11_platform-orchestration-aws.md; |
| O6 | **Spec hand-off contract**: the design spec must be written so a later session can harden it into an agent-ready implementation spec and ticket set for `implement-spec`; include requirement IDs, acceptance criteria hooks, and explicit open-decision markers | S | done | docs/rhema-design-spec.md |

## Change log

- 2026-08-27 — v0 created from the founding prompt + first read of `~/agent-discourse`. Q-1…Q-20 posed to operator.
- 2026-08-27 (turn 2) — v1: all 20 questions answered; §Q converted to a decisions register; rows C12–C16, D19, G13, M8, M9, O6 added; blocked rows unblocked; `git init` performed on `~/Rhēma`.
- 2026-08-27 (turn 3) — relocated to `docs/` with numbered prefixes (`1_founding-prompt.md`, `2_research-and-design-ledger.md`); research notes go to `docs/research/<n>_<slug>.md`; final spec will be `docs/rhema-design-spec.md`. Orchestration phase 1–2 launched.
- 2026-08-27 (turn 4) — Note 2 (source-system extraction) closed A1–A6, A8, A9. Key corrections carried forward: T3 strong form refuted (the user *is* the author → most `agents/author/*` inspectable; only editor memory + persona hold-outs harness-only); T5 restated (staleness inputs = seed change [new], corpus growth, age); project state machine lacks human-revised / accepted-exported / archived states; 21 boundary rules need runtime enforcement (mounts, URL allow/deny, input-scoped subagents); Q-11 requires disabling `usage=study` default at port time; `orchestrate-build` is the template for loop-to-convergence.
- 2026-08-27 (turn 5) — Note 3 (coding-agent UX part 1) closed B1.1, B1.5, B1.6, B1.7. Carried forward: T7 confirmed & refined (unit = $-pegged credit + per-run price cards; overage at API list price is the norm); Q-7 gates are industry standard (plan-then-build behind approval everywhere); checkpoints auto per turn, restore files only, never delete chat; trials are quota-shaped (daily grants), not time-shaped; T1 mildly contradicted — products are sessions-first → reconcile by making Rhema's round timeline *be* the runs list. Windsurf now rebranded Devin Desktop. Proposed new rows to adopt at synthesis: D20 variant drafting, L10 metering fairness, K7 run resumability, D21 provenance linkage.
- 2026-08-27 (turn 6) — Note 6 (landing/onboarding/trials) closed B3.1–B3.3; D18 in-progress. Carried forward: market is light-default (11/12) → dark default is a differentiator, ship a real light theme, serif display on dark; hero as drop-zone ("drop a draft, get a Quick Review"); pricing on homepage; first value must be inference-free (seeded showcase project with anchored findings = $0 activation event for T2); signup Google + magic link, verification deferred to first paid run; trial = capped reverse trial (14-day Pro window, ≤$4 grant, one reduced-depth Quick Review ≤3k words, daily micro-grant, paywall at run-launch estimate sheet). Grant sizing depends on C14 cost curve.
- 2026-08-27 (turn 7) — Note 5 (writing products + Substack) closed B2.1–B2.5; D19 exemplar study done (design pending phase 3). Carried forward: Substack measured (Lora serif, 15–16px body, ~600–660px column ≈ 65–75 cpl, `.dark-mode` class) → "paper in a dark shell": dark IDE chrome + serif page (17px, lh 1.55, 68ch target), paper theme pinnable per project; T2 sharpened — findings = comments that may carry a suggestion, dispositions replace "resolve", bulk-accept only with preview, filterable margin list; new E-row: span-level AI provenance + auto-generated AI-use statement (Grammarly Authorship / iA Writer / ICMJE precedent); pricing anchors $8–22/mo consumer, $12–169/mo academic, all use-metered → sell Rhema as runs; D19 mobile scope = read/dispose/approve gates/chat/notify/light edits, never run config or persona generation; Expo/RN over PWA.
- 2026-08-27 (turn 8) — Note 9 (ingestion/export/visualization) closed I1–I5, C15; C12 tooling settled, UX pending phase 3. Carried forward: no-Python satisfiable end-to-end (mammoth/turndown, pandoc binary, TS-native PDF path + Textract Layout tier + Claude visual PDF tier; Docling as the one deferred isolated exception); Substack public `/api/v1/archive` + `/api/v1/posts/{slug}` verified live for free posts, official Export zip for paid, never session cookies (ToS forbids scraping); export engine = pandoc 3.10 + Typst (real docx/odt footnotes, BSD citeproc, PDF without TeX Live), Google Docs via docx → Drive `drive.file` scope; figures stored as spec + data + provenance, rendered to SVG headless, inserted as accept/reject proposals and fact-checked as quantitative claims; staleness = set difference of normalized-body content hashes (confirms T5). New row I6: PDF quality bench on the six real academic PDFs (deferred to implementation).
- 2026-08-27 (turn 9) — Note 4 (coding-agent UX part 2) closed B1.2–B1.4, B1.8, B1.9; Note 10 (pricing/billing/auth) closed L1–L4, L6–L9, C14, A7. Carried forward — UX: one run grammar everywhere (transcript w/ collapsed tool calls + gating plan artifact + "what changed" surface + run list grouped Needs-input/Working/Ready/Done); gates are universally *soft* (auto-proceed timers) → implement Q-7 as approve-with-deadline at three named gates; steering = interrupt + queued message + batched inline comments; publish cost *ranges* per workflow per tier (Codex precedent); opt-out phases must surface as a user-facing rigor dial (Amp precedent), not hidden inputs; progress UI must be orchestrator-driven (K1). Pricing: cost ≈ 75% cache-read of re-sent context; citation count is the dominant driver (~$0.80/verified claim on Fable, $0.17 on Sonnet); per-phase routing beats model downgrades; unit = cent-credit (1 credit = $0.01); recommended ladder Trial 600 credits no-card / Pro $20 = 2,000 / Max $100 = 12,000 / Max $200 = 26,000 / Team $40 seat pooled; usage rated at list × 1.4; pre-run estimate with guaranteed 1.5× cap (no competitor does this); 52% GM at 60% utilization. Stack: Stripe Billing/Checkout/Portal/Tax + in-house Postgres credit ledger (not Stripe Meters; Metronome/Orb rejected on cost/opacity, Lago fallback); auth = Better Auth self-hosted on AWS + WorkOS SSO later (Clerk ~$19k/mo at 1M MAU).
- 2026-08-27 (turn 10) — Note 8 (editor technology) closed H1–H8, N1–N3. Carried forward: T6 confirmed with correction — Tiptap MIT core is right, but comments/track-changes/snapshot-compare are paid Tiptap Cloud features (on-prem Enterprise-only) → build own ProseMirror-layer plugins (comments via Yjs relative positions + quote re-anchoring; suggestion mode via marks; version compare via markdown block/word diff + prosemirror-changeset in-session). Collab/autosave: Yjs + self-hosted Hocuspocus on ECS Fargate + Redis + Postgres/S3, y-indexeddb local buffer, restore points as encoded states; Liveblocks/Tiptap Cloud/PartyKit rejected (Q-3/M8). New row H9: Rhema Markdown profile (footnotes, math, `[@key]` citations, figure nodes) + golden-corpus round-trip suite. N-design: four-layer autosave ("unsaved" never exists); agents never write into human-editable docs — runs freeze their input version, human edits fork to a working copy reconciled as suggestions; a human edit to a reviewed draft *is* v(N+1). Governance note: ProseMirror moved off GitHub (Apr 2026).
- 2026-08-27 (turn 11) — Note 7 (execution harness) closed G1–G5, G10, G11, G13; G9 pending design. Carried forward: T4 confirmed with amendments — Claude Agent SDK (TS) in a per-run container we own scores 42/45 vs ≤29 for every alternative (only option with file-scoped tools, verbatim SKILL.md loading, documented fresh-context subagents); host the SDK under our brand, never "Claude Code"; Claude Managed Agents is a credible second engine. ToS: consumer Claude/ChatGPT plans may not serve third parties (cited); API-key/Marketplace execution only. **Q-3 vs Q-4 tension:** Anthropic web search/fetch are not on Bedrock → use Claude Platform on AWS Marketplace (Anthropic-operated, CCU billing); Bedrock only for non-Anthropic models. Compute ≈ 0.1% of run cost → choose sandbox for isolation/AWS fit. SDK `total_cost_usd` is an estimate → L4 must reconcile to the Usage & Cost API. Multi-provider routing phase-gated: research phases stay Anthropic in v1; BYO keys deferred.
- 2026-08-27 (turn 12) — Note 11 (AWS platform/orchestration) closed M1–M9, G6–G8, K4–K6 (K1–K3 being finalized in design/3). Carried forward: own the run ledger in Postgres + pg-boss (MIT) for execution; Temporal only if step graphs go non-linear (Inngest SSPL / Restate BSL conflict with Q-19); one Fargate task per run running the TS Agent SDK with no direct internet — egress only via a key-injecting proxy; T4 refined: "mature harness" = *self-hosted* Agent SDK, not Managed Agents (beta, not ZDR-eligible; F4/Q-4 need us to own the container); boundary enforced three ways (role-filtered mounts, PreToolUse hooks + audit log, write-back diff at phase commit → verifiable `boundary.attested` event); append-only `run_events` with seq → resumable SSE + Redis fan-out, event catalogue split `visibility: user|internal`; stack = React Router SSR on ECS (Next.js rejected for self-host tax), Aurora Serverless v2, Better Auth, S3, SES, Stripe → idempotent queue, pnpm + Turborepo (not Bazel), SST stages for PR previews, Hocuspocus for collab. Proposed new rows M10–M12, K7, G14, I6 to adopt at synthesis.
- 2026-08-27 (turn 13) — Note 12 (skills/genres/personas) closed C2, C5, C16, J1–J8 (UI design pending). Carried forward: a genre is a *protocol object* (rubric + venue bar + phase toggles + calibration language + length/apparatus + integrity norms + intake expectations), never a skill fork; MVP genre set = Academic, Essay, Op-ed, Memo (fiction/journalism/marketing deferred with reasons); twelve v1 skills — outline-from-research, fact-check-only, cut-to-length, visualize, line-edit, title-and-deck, abstract-and-keywords, invented `reverse-outline` and `elicit-from-author`, steelman, discourse-map, loop-to-convergence (gated; unbounded loops degrade); `reader-test` reframed as k assigned-stance second reads labeled as forecast (silicon-sample inference fails); T5 amended: staleness has four inputs (seed hash excl. build note, sample set, age/growth, calibration status incl. `unfalsified`); partial refresh cheap via persisted per-piece notes; persona policy = soft-lock after v1 with "fork under new persona" / "adopt refreshed profile"; composites schema in MVP, UI v1.x; one-line impersonation notice at persona creation (Anthropic AUP exposure). Do not cite the "8.4M Substack paid subs" figure.
- 2026-08-27 (turn 14) — Design/2 (IDE core UX) closed D1–D8, D14, D16, D17; REQ-IDE-1…50. Decisions: round timeline = runs list (T1 reconciled), orchestrator-driven run cards, 3-density feed, `RunEvent` schema fixed; gates = approve-with-deadline at Structure plan / Review scope / Triage (30-min default, countdown pauses while reading, "wait for me" opt-out) + a spend gate that never auto-continues; agent roles = authorship + boundary badges, not navigation (no role tabs/chat personas); findings = anchored comments that may carry suggestions, dispositions write the ledger, pre-triage dispositions = highest-precedence guidance; "what changed and why" diff joined to ledger moves; paper-in-dark-shell tokens with real light theme, 68ch/17px Literata-or-Lora page; no Save state, sync pill only. **Departure from ⚑ (Q-20):** project list groups by *attention* (Needs you / Running / Ready / Quiet) by default; persona is a filter/chip/alternate grouping; new projects still Unfiled.
- 2026-08-27 (turn 15) — Design/4 (growth & billing) closed D12, D13, D15, D18, L5 (REQ-GROWTH-1…17, REQ-BILL-1…19, REQ-ACCT-1…4): estimate sheet is the single paywall/consent gate (point estimate + 1.5× cap as DB constraint, rigor dial Quick/Standard/Full board orthogonal to model tier Standard/Balanced/Frontier, confirm above 500 credits or 25% of balance); ladder Trial 600cr 14d no-card / Reader $0 / Pro $20=2,000 / Max $100=12,000 / Max+ $200=26,000 / Team $40 seat waitlist; usage in four zoom levels, tokens behind Advanced; nightly reconciliation user-favourable only; Google + magic link, showcase project = $0 activation; Stripe Checkout/Portal/Tax + owned ledger, overage off by default, failed runs auto-refund. Departures from research (not operator): Reader gets 10-credit daily chat allowance; trial may run Full board within 6,000-word cap. Design/3 (visibility + data model) closed E1–E6, F1–F8, C13, K1–K3 (REQ-VIS-1…11, REQ-DATA-1…44): visibility = code-owned function of artifact kind (46 kinds); author memory inspectable, only editor memory / persona hold-outs / process residue / run transcripts hidden; protocol text never shown, outputs always; transparency floor incl. mechanical "cited ⇒ fetched" check; content-addressed S3 + Postgres artifact store, three draft tiers (CRDT / restore points / immutable vN), findings/claims/dispositions as rows parsed from skill markdown; harness mirror = cache with signed sync contract (materialize → run → harvest → transactional delivery); immutability as state (freeze on first run-read), human edit to frozen draft = v(N+1) `origin=human_revision`; nine run states; roles viewer/editor/admin. Note conflict to resolve at synthesis: design/3 locks persona after v1 (operator lean) vs research/12 soft-lock with fork/adopt flows.
- 2026-08-27 (turn 16) — Design/7 (mobile companion) closed D19 (REQ-MOBILE-n): scope rule = sub-paragraph inputs + reading only (dispositions, gates, chat, notifications, usage glance MVP; light edits + "run next with defaults" v1.1; never run config/persona generation/diffs/bulk-accept/billing/export); Expo/RN over PWA on the gate use case (actionable native push); shared TS contracts/tokens/findings core, never React components or ProseMirror/Yjs; light edits as server-side block patches via headless ProseMirror behind Hocuspocus; lock-screen actions Open / Wait-for-me only, Approve requires gate screen + biometric above spend threshold; no IAP or prices in app. Flag for synthesis: triage gate should default to *wait*, not auto-proceed. Proposed rows D22 (reader-only mobile-web breakpoint), M15 (verify app-store rules).
- 2026-08-27 (turn 17) — Design/8 (personas & ingestion UX) closed D10, D11 (REQ-PERSONA-1…27, REQ-INGEST-1…14): "Voice" is the UI word; library groups Your voices / House styles (read-only, forkable) / Shared (later); creation needs only a name; Quick Voice (≤3 samples, ~60–150 cr, always Untested) vs Full Profile (~310/760/1,510 cr at 50k words), monotone upgrade; staleness = one pill, eight computed states from four stored facts, panel = literal diff of inputs with cheapest sufficient priced action first, never blocks; project chip `newer-profile-available` → Adopt refreshed profile; profile viewer leads with Calibration report, voice measures read-only behind Advanced with Method column hidden (IP), only edit affordance = "Correct this in your description"; samples = Connection → DiscoveredItem → Sample(version), 11 providers, discovery before fetch, hash change detection, paid posts via export zip only; free voice change until v1, soft lock after with Fork / Adopt hatches (adjudicates the design/3 vs research/12 conflict toward soft lock); composites schema-only + Register selector. Refinement: voice-grouping defaults Flat while user has ≤1 voice.
- 2026-08-27 (turn 18) — Design/5 (execution & platform architecture) closed G12, finalized G4 and M2 (REQ-ARCH-1…40, REQ-RUN-1…18): hybrid skill port — SKILL.md verbatim as single source of truth, orchestrator runs one phase per `query()` with completion detected by the phase's declared artifact, one harness-neutral `phase` input as the only upstream change; gates are orchestrator states with per-kind `on_expiry`, sandbox exits while waiting; opt-outs → Quick/Standard/Full rigor dial; durable unit = phase + committed artifacts on S3, Postgres run ledger + pg-boss with idempotent Temporal-shaped activities keyed (run_id, step_key, attempt); three-layer boundary enforcement + per-subagent directories → `boundary.attested`; sandbox egress only via a TypeScript key-injecting proxy with per-run URL policy; feed text template-only (injection can't reach UI); two cost ledgers (SDK live meter; Usage & Cost API nightly reconcile), credit hold at cap before launch. Housekeeping for synthesis: research notes assigned conflicting proposed IDs (G14, M10) — renumber at synthesis.
- 2026-08-27 (turn 19) — Design/6 (chat/research + visualizations) closed D9, G9, C4, C7, C12, K5 (REQ-CHAT-1…30, REQ-GATE-1…16, REQ-VIZ-1…16): chat = fourth `assistant` agent-type on the same harness owning `agents/assistant/`, reads shared record + author notebook read-only, never editor memory; reaches the pipeline only via the outline artifact and `Guidance` records; can *commission* the editor (a run), never consult it; "Generate official outline" = `outline-from-research` run with mandatory no-deadline approval; one grammar `/verb @scope --levers` (12 verbs) → single run sheet; scoped reviews + parallel `--variants` (whole-draft variants refused); gate deadlines structure 24h / review scope 2h / triage 24h at zero compute, users edit decisions not prose, every edit → Guidance; figures = spec + data + provenance, Tier-1 fact-checked, `[unverified data]` badge otherwise. Departure flagged for operator: assistant reading `agents/author/*` narrows the convention's own-namespace rule. Gate-deadline conflict with design/2 (30-min) → adjudicate at synthesis (hours).
- 2026-08-27 (turn 20) — Design/9 (product scope/genres/workflows) closed C1, C3, C6, C11; product form for C5, C16, A9 (REQ-PROD-1…16, REQ-WF-1…17, REQ-GENRE-1…7): seats named Drafter / Editor / Assistant (never "Author" — the user is the author; ICMJE/COPE); workflows are verbs (Outline · Draft · Review · Revise · Profile voice + v1 set); gates = Approvals; Rigor dial Quick / Standard / Full board; tiers Free / Writer $20 / Studio $100 / Studio Max $200 / Team (naming conflict with design/4's Reader/Pro/Max/Max+ → adjudicate at synthesis); 16 run kinds with launch sheets, ≤1 Approval each, credit ranges per rigor notch; genre = versioned Protocol object (9 fields), Academic/Essay/Op-ed/Memo spelled out, Essay is Unfiled default; 11 derived lifecycle states, Suggested-next never the only path, Run rounds converge on external signals with hard caps + stall detection; 74-row feature matrix. Q-20 departures argued: soft persona lock; mobile after web MVP; structured dialogue specified not shipped; no Approval on proposal-producing C0/C1 workflows. Proposed rows C20–C22, K8, N4. **Phase 3 complete; phase 4 synthesis launched.**
- 2026-08-27 (turn 21) — **Phase 4 complete:** `docs/rhema-design-spec.md` written (~53k words, 17 sections + 4 appendices, 368 design REQ IDs + 5 REQ-SPEC). Rulings: soft persona lock w/ Fork/Adopt; attention-first project grouping (Q-20 departures both); per-gate deadlines (plan 24h, scope 2h, triage *waits*, outline waits, spend always waits); trial may run Full board ≤6k words on Base; tier names Free/Writer/Studio/Studio Max/Team, model tiers Base/Balanced/Frontier; seats Drafter/Editor/Assistant with `agents/author/` kept as namespace; Assistant reads Drafter notebook (flagged for operator). O1, O2, O6 closed. Phase 5 adversarial review (O3) launched.
- 2026-08-27 (turn 22) — **Phase 5 complete; ledger closed.** Three fresh-context reviews (design/11 consistency & coverage, 12 product/UX, 13 architecture & feasibility) produced 133 findings (12 blocker · 65 major · 53 minor · 3 section-level); revision → `docs/rhema-design-spec.md` **v0.2 — post-review** (75,030 words; Appendix E: 128 fixed, 2 kept with rationale, 1 deferred, 2 no-action). Headline fixes: free "Apply" verb + volume-ready findings triage; trial as an entitlement (one review ≤6k words, ~$5.70 COGS at Base/Standard); one gate-deadline rule set; 62-kind artifact visibility enum; gate-edit write-back serializers; run token out of model-reachable env; 1.5× cap metered at the egress proxy with per-run key allowlist; structured findings/claims sidecar contract (parse failure = run failure); guarantee-preservation table vs source conventions; scope estimate 52–67 person-months incl. Phase 0a. **Items needing operator confirmation are listed in spec §16.2/§16.3** (notably: Assistant reads Drafter notebook; attention-first project grouping; soft persona lock; mobile after web MVP; structured dialogue specified but not shipped).
- 2026-09-10 — build memory committed under `docs/build/` (build-memory v2; ADR-004); `.agents/scratch/` retired. Extends the Q-13 git-init decision: the machine ledger + per-ticket run ledgers now live in git with the chain tip, not in a gitignored scratch dir.

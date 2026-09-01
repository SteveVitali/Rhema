# Execution harness options — reuse vs. hand-roll, deep research, routing, observability

- Scope: ledger rows G1, G2, G3, G4, G5, G9, G10, G11, G13 (touches G6, G7, G8, F4, L4, L7, M1, M8) · Date: 2026-08-27 · Sources fetched: 68 entries in §Sources (66 primary pages read this session + 2 secondary; 7 fetch failures listed at the end of §Sources)

## Executive summary

**Decision-grade findings, in order of consequence:**

1. **T4 is confirmed with two amendments.** Start on the **Claude Agent SDK (TypeScript)** running in a per-run container we own on AWS, with the four `agent-discourse` skills loaded as `SKILL.md` files nearly verbatim, and a thin durable orchestration layer (run/phase/event model, cost meter, gates) wrapping it. Amendment A: the thing we host is the *Agent SDK library* under our own branding, not "Claude Code" — Anthropic's legal page forbids reselling or intermediating usage for a hosted *Claude Code* product, while the Commercial Terms plus the SDK overview explicitly permit powering our own product on our own API key [S1][S2][S10]. Amendment B: **Claude Managed Agents** (beta, $0.08/session-hour + tokens, web search/fetch/skills/multiagent built in, self-hosted sandbox option) is a credible second candidate that the thesis did not name; we design the orchestration layer so it can target either [S12][S13][S14].
2. **Consumer subscriptions are off the table, with citations.** Anthropic: "Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users" [S1]. OpenAI's consumer terms could not be fetched (403), but Codex's own auth docs scope plan-based automation to "trusted scripts, schedulers, and private CI runners" in Enterprise workspaces, and OpenAI staff have declined to bless third-party use [S24][S26]. Execution is API-key/Marketplace-billed, full stop.
3. **AWS-first + Anthropic-first collide on Bedrock.** Anthropic web search and web fetch are **not available on Amazon Bedrock** [S6][S7]; the research phases need them. The resolution is **Claude Platform on AWS** (Anthropic-operated, AWS Marketplace billing in CCUs at $0.01, same-day feature parity, supported by the Agent SDK via `CLAUDE_CODE_USE_ANTHROPIC_AWS=1`) [S17][S11]. Bedrock stays useful for *non-Anthropic* models (it now lists OpenAI GPT-5.x, Mistral, Qwen) [S19].
4. **Compute is a rounding error; tokens dominate by 10–100×.** A 45-minute run costs $0.03–$0.15 in sandbox time on any provider surveyed versus the operator's observed $50–100 in Fable 5 tokens (Q-10). Choose the sandbox for isolation, TypeScript ergonomics, and AWS residency, not price [S9].
5. **Client-side cost numbers are estimates.** `total_cost_usd` is computed from a bundled price table and Anthropic says "Do not bill end users … from these fields" [S4]. L4 must reconcile against the Usage & Cost Admin API; the SDK figure drives the live meter only.
6. **Multi-provider (Q-4) is phase-gated, not global.** Only Anthropic and OpenAI expose first-party search+fetch inside an agent loop; the fact-check, discourse, and grounding phases stay Anthropic (or OpenAI deep research) in v1; critique/drafting/second-read phases can be routed through the Vercel AI SDK provider layer later. BYO keys: defer to v2.

## 1. What the skills demand of a harness (A6 restated as requirements)

*Observed* (from `~/agent-discourse/skills/*/SKILL.md` and `conventions/project-memory.md`, read this session):

| Req | Requirement | Evidence in skills |
|---|---|---|
| H1 | File read/write inside a project directory with a strict per-role allowlist (`drafts/`, `correspondence/`, `manifest.md`, own `agents/<role>/`); no recursive listing over project root | project-memory.md §Boundary rule; every SKILL.md restates the allowlist for subagents |
| H2 | Web search + web fetch, "dozens of searches" per run, "hundreds of fetched pages" in fact-check/grounding; every verdict cites a URL "fetched and read this session" | editorial-review L80, L213, L237; draft-from-outline L71, L174, L194 |
| H3 | Fresh-context subagent primitive for: second read (ER Phase 5), fidelity audit (DFO Phase 6), gap analysis (RTR Phase 5), hold-out calibration and corpus fan-out (BP Phase 0/4); explicit sequential fallback where absent | editorial-review L219–226, L391, L412; draft-from-outline L178–186, L418–425; respond-to-review L196, L296–300; bootstrap-persona L125, L294 |
| H4 | Long context: a 15k-word draft + dossier + persona profile + research notes routinely exceed 200k tokens | Q-10 extreme case; conventions on persisted research notes |
| H5 | Compaction survival: "files are the only inter-phase interface, so the regimen survives compaction"; crash-resume points | README §Design principles; respond-to-review L125; bootstrap-persona L118 |
| H6 | PDF reading (persona corpora in `docs/`, cited papers) | bootstrap-persona corpus input; personas.md |
| H7 | Human gates (`autonomous: false`) that pause after structure plan / after triage and resume with guidance | draft-from-outline L316; respond-to-review L247 |
| H8 | Parallel subagents for research fan-out with per-subagent boundary prompt | editorial-review L221; bootstrap-persona L125 |
| H9 | Attestation: the harness must let us verify which paths were touched (F4 wants this mechanical, not normative) | project-memory.md L86–96 |

*Inferred:* H1 and H9 are the ones a generic chat harness cannot satisfy; they require either a filesystem-scoped sandbox per role or a hook layer that denies out-of-allowlist paths. H3 is the discriminating capability among frameworks.

## 2. Licensing and ToS (G2)

### 2.1 Anthropic — *Observed*

- Consumer Terms (effective 8 Oct 2025): "You may not share your Account login information, Anthropic API key, or Account credentials with anyone else"; users may not "resell the Services"; automated access is prohibited "Except when you are accessing our Services via an Anthropic API Key" [S8].
- Claude Code legal page: "Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users. Moreover, developers may not collect, store, or intermediate Claude.ai credentials or session tokens." Also: "Advertised usage limits for Pro and Max plans assume ordinary, individual usage of Claude Code and the Agent SDK." [S1]
- Same page, on hosting Claude Code itself: "preinstalling or running Claude Code in your products or services (e.g. in hosted sandboxes or other agent infrastructure) requires agreeing to our Commercial Terms of Service" and "Customers may not pay for, resell, or intermediate Claude usage on their end users' behalf. Each end user must authenticate with their own Anthropic API key, Claude subscription plan credentials, or 3P inference provider credential." [S1]
- Agent SDK overview: "Use of the Claude Agent SDK is governed by Anthropic's Commercial Terms of Service, including when you use it to power products and services that you make available to your own customers and end users." Branding: "Claude Code" naming is not permitted; "{YourAgentName} Powered by Claude" is [S2].
- Commercial Terms (effective 17 Jun 2025), §A.1: "Anthropic gives Customer permission to use the Services, including to power products and services Customer makes available to its own customers and end users." §D.4: customers may not "resell the Services except as expressly approved by Anthropic" [S10].

*Inferred:* The two "may not resell/intermediate" clauses live in different regimes. The Claude Code page governs offering *the Claude Code product* (unmodified binary, user signs in themselves). The Agent SDK/Commercial Terms regime governs *a product powered by Claude* — which is what Rhema is: our brand, our API key, usage billed to us, priced into our subscription. That is the ordinary API-customer model. **Recommendation:** build on the Agent SDK under Commercial Terms, never expose Claude login or Claude Code branding, and get one counsel read of §D.4 "resell" versus §A.1 "power products" before launch (L9). Do not offer a "sign in with Claude" BYO-subscription mode; BYO *API key* is a separate question (§8.4).

### 2.2 OpenAI — *Observed / partially unverified*

- `openai.com/policies/terms-of-use` and `row-terms-of-use` returned HTTP 403 this session; I could not read the consumer terms directly. A search hit on OpenAI's Teacher Access Terms carries the same phrasing ("Automatically or programmatically extract data or Output"; may not "share your account credentials") [S25], which suggests the consumer text is similar, but that is secondary evidence.
- Codex auth docs: two sign-in modes, ChatGPT plan ("subscription access") vs API key ("usage-based"). Non-interactive plan-based use is scoped: "In ChatGPT Enterprise workspaces, admins can grant the access token permission so permitted members can create Codex access tokens for trusted, non-interactive Codex local workflows … intended for trusted scripts, schedulers, and private CI runners." No language permits third-party or multi-user product use [S24].
- A GitHub discussion (secondary) shows an OpenAI maintainer declining to interpret ToS for third-party "Sign in with ChatGPT" use, with follow-ups through Aug 2026 unanswered [S26].

*Recommendation:* treat ChatGPT-plan credentials exactly like Claude subscriptions: never. OpenAI execution, if any, goes through the API (Responses / Agents SDK / Codex SDK with an API key).

**Cost implication of API-only execution (G2):** at Anthropic list prices [S9] the operator's $50–100 extreme-case run is what the *platform* pays per run before margin; there is no subscription arbitrage. This is the single biggest input to L3 and C14.

## 3. Option survey (G1)

Scoring rubric for §10: each requirement H1–H9 scored 0 (absent) / 1 (possible with substantial work) / 2 (supported with configuration) / 3 (native, documented). Plus TypeScript fit, AWS fit, ToS clarity, lock-in, maturity.

### 3.1 Claude Agent SDK (TypeScript), self-hosted in our container

*Observed* [S2][S3][S4][S5][S11][S15][S16][S20][S21][S22][S23]:

- Package `@anthropic-ai/claude-agent-sdk`; bundles the Claude Code binary; `query()` spawns a `claude` subprocess and streams `SDKMessage`s over stdio. Node 18+ [S11][S5].
- Built-in tools: Read/Write/Edit/Bash/Glob/Grep/WebSearch/WebFetch, MCP, Skills, Agent (subagents), Workflow [S2][S3].
- Options of interest: `cwd`, `env` (replaces the subprocess env in TS — spread `process.env`), `settingSources`, `skills`, `agents` (programmatic `AgentDefinition` with `tools`, `model`, `effort`, `maxTurns`, `background`, `skills`), `hooks`, `permissionMode`, `allowedTools`/`disallowedTools`, `maxTurns`, `maxBudgetUsd`, `effort`, `taskBudget` (alpha), `resume`/`forkSession`/`sessionStore`, `outputFormat` (JSON schema), `includePartialMessages`, `sandbox` (SandboxSettings), `abortController` [S3].
- Skills: loaded from `<cwd>/.claude/skills/**/SKILL.md` (and parents to repo root, plus `additionalDirectories`) when `settingSources` includes `project`; "The SDK doesn't provide a programmatic API for registering them"; `skills: [...]` scopes which are invocable; `/skill-name` in the prompt dispatches by name [S20].
- Subagents: "its context window starts fresh, with no parent conversation"; receives only its system prompt + the Agent tool prompt + project CLAUDE.md + tools; parallel by default; caps via `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` (default 3), `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` (default 20), `maxBudgetUsd`; subagent transcripts persist separately and can be resumed; output is scanned for instruction-shaped patterns since v2.1.210; "Claude Opus 5 delegates to subagents more readily" [S3].
- Hooks: `PreToolUse` can return `permissionDecision: allow|deny|ask|defer`, `updatedInput` (e.g., rewrite `file_path`); `PostToolUse` can replace tool output; events include `SubagentStart/Stop`, `PreCompact/PostCompact`, `PermissionRequest`, `SessionStart/End`, `StopFailure` [S22].
- Sessions: JSONL transcripts on local disk; `SessionStore` adapter (`append`/`load` + optional list/delete/`listSubkeys`) with reference S3/Redis/Postgres adapters; dual-write, best-effort mirror with `mirror_error` events; subagent transcripts mirrored under `subagents/agent-<id>`; after auto-compaction `getSessionMessages` returns the post-compaction chain [S16][S23].
- Cost: per-step usage on assistant messages, `modelUsage` per model on the result (includes subagents; `usage` excludes them), `total_cost_usd` is "client-side estimates, not authoritative billing data … Do not bill end users or trigger financial decisions from these fields" [S4].
- Hosting guidance: 1 GiB RAM / 5 GiB disk / 1 CPU per agent as floor; "A minimally provisioned container runs roughly $0.05 per hour, while a single long agent session can spend dollars in tokens"; multi-tenant isolation checklist (`settingSources: []`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, per-tenant `CLAUDE_CONFIG_DIR` and `cwd`, per-tenant egress at proxy); no top-level session timeout; no per-subagent wall-clock deadline; wide fan-outs can hit rate limits [S5].
- Security: sandbox-runtime (bubblewrap/Seatbelt) for filesystem+network allowlists; containers with `--network none` + Unix-socket proxy; gVisor/Firecracker tiers; credential-injecting proxy via `ANTHROPIC_BASE_URL`; "Web search summarization: Search results are summarized rather than passing raw content directly into the context" [S15].
- Observability: OTel metrics + log events (GA) and traces (beta, `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`); spans `claude_code.interaction` / `llm_request` / `tool` / `hook`; subagent spans nest under parent tool span; W3C trace context propagated from the host app; end-user attribution via `OTEL_RESOURCE_ATTRIBUTES=enduser.id=…,tenant.id=…`; prompt/tool content off by default [S21].
- Auth for SDK apps: API key, Bedrock (`CLAUDE_CODE_USE_BEDROCK=1`), **Claude Platform on AWS (`CLAUDE_CODE_USE_ANTHROPIC_AWS=1` + `ANTHROPIC_AWS_WORKSPACE_ID`)**, Vertex, Foundry. "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products" [S11].
- Headless CLI (`claude -p --output-format stream-json --bare`) is the same harness for non-TS callers; `--bare` skips hooks/skills/MCP discovery and "never reads OAuth credentials" [S18].
- Dynamic workflows (`Workflow` tool, TS SDK ≥0.3.149): a JS script orchestrating up to 16 concurrent / 1,000 total agents per run, replayable, with a bundled `/deep-research` workflow that "fans out web searches … cross-checks the sources … votes on each claim, and returns a cited report"; no mid-run user input; runs approved in SDK via permission rules [S3][S30].

*Inferred:*

- H1/H9 are satisfiable without touching the skills: a `PreToolUse` hook denies Read/Glob/Grep/Bash/Write whose `file_path`/`command` resolves outside the role's allowlist, and logs every allowed path — this is the mechanical enforcement F4 wants, and it produces the attestation as data rather than as a self-report. Belt-and-braces: mount only the allowed directories into the container (`agents/editor/` absent from the author's mount).
- H2: WebSearch is summarized inside Claude Code (good for injection resistance, but it means the *search* result is not the cited text; the skill's "fetched and read this session" rule is satisfied by WebFetch, which returns page content). We should verify in G3 evals that citation URLs in ledgers are fetch-derived, not search-snippet-derived.
- H3: native. The skills' "where the harness supports subagents" branch is taken. Boundary propagation into subagent prompts is already in the skills; the hook applies to subagents too because they run in the same process tree.
- H5: partially native — compaction happens automatically; files persist; but a *crash* of the subprocess loses in-memory state and the transcript is local unless `sessionStore` is set. Our orchestration layer restarts the phase from files (the skills are designed for exactly this), so we should treat SDK `resume` as an optimization, not a durability primitive.
- H7: `autonomous:false` gates are *not* a harness feature; they are prompt behavior. Two implementations: (a) run each gated phase as its own `query()` and stop; the orchestrator opens a gate; the next `query()` gets `guidance` (the skills already accept it as input) — robust; (b) `AskUserQuestion` handled in-loop via `canUseTool`/streaming input — keeps one session but ties gate latency to a live subprocess. Choose (a).
- Cost-per-run is unchanged from the operator's Claude Code experience (same harness, same model) — except caching TTL: on API keys cache TTL defaults to 5 min; set `ENABLE_PROMPT_CACHING_1H` for long gaps [S4].

**Rhema analogue:** the execution engine. Row G1 primary candidate.

### 3.2 Claude Managed Agents (cloud sandbox, or self-hosted sandbox on our AWS)

*Observed* [S12][S13][S14][S9][S17]:

- Beta (`managed-agents-2026-04-01`), enabled by default for API accounts. Objects: Agent (model, system prompt, tools, MCP, **skills**), Environment (cloud or self-hosted), Session, Events (SSE stream; history persisted server-side). Built-in tools: bash, file ops, **web search and fetch**, MCP; multiagent orchestration (threads); memory stores; outcomes; scheduled deployments; session budgets (dollar-denominated) [S12][S14].
- Pricing: tokens at list + **$0.08 per session-hour of `running` status** (idle not billed); web search $10/1k; no Batch discount [S9].
- Limits: create endpoints 300 RPM, read 1,200 RPM; not ZDR/BAA eligible (stateful); on Claude Platform on AWS, autonomous sessions require a user event every 6 hours [S14][S17].
- Self-hosted sandbox: an "environment worker" you run polls a work queue and executes tools locally; guides listed for AWS Lambda microVMs, Docker, Kubernetes, E2B, Fly, Modal, Cloudflare, Vercel; only outbound HTTPS needed; SDK worker in Python/TypeScript/Go; self-hosted qualifies for ZDR/BAA [S13].
- Not available on Bedrock/Vertex/Foundry; available on Claude Platform on AWS [S17][S12].

*Inferred:* Managed Agents removes the subprocess-hosting problem entirely (no containers, no session store) and gives us server-side compaction, budgets, and event history for free. Costs against it: beta status; skills/tool semantics differ slightly from Claude Code (no `Agent` tool; multiagent is a roster of agents, so the skills' "where the harness supports subagents" branch needs a small adapter); cloud sandbox is Anthropic infrastructure, which cuts against Q-3's AWS/control preference unless we use the self-hosted worker on Lambda microVMs or Fargate. The 6-hour reauth rule on the AWS Marketplace flavor is irrelevant for our 30–90-minute phases.

**Rhema analogue:** alternate execution engine; the same run/phase/event contract must map to session events (`agent.tool_use`, `session.usage`, `agent.thread_context_compacted`) as to SDK messages. Row G1 secondary candidate; G12 migration path stage 4.

### 3.3 Claude Code headless CLI in a third-party sandbox

Functionally identical to §3.1 (the SDK *is* the CLI); the difference is who runs the container. Survey of sandbox providers, all *Observed* from pricing/docs pages this session:

| Provider | Unit prices | Session cap | TS SDK | Notes | Source |
|---|---|---|---|---|---|
| E2B | 2 vCPU $0.000028/s (~$0.10/h) + $0.0000045/GiB/s (~$0.016/GiB/h); Pro $150/mo | Hobby 1 h, Pro 24 h; 20/100 concurrent | yes | Firecracker microVMs; $100 one-time free credits | [S31] |
| Modal Sandboxes | $0.00003942/core/s (~$0.142/core/h) + $0.00000667/GiB/s (~$0.024/GiB/h); $30/mo free | default 5 min, up to 24 h; filesystem snapshots | yes (JS/Go too) | Sandbox tier priced ~3× Modal functions | [S32][S33] |
| Daytona | $0.0504/vCPU/h + $0.0162/GiB/h + $0.000108/GiB/h disk; $200 free | "sub 90 ms" creation claim; snapshots/volumes; WebSocket state stream | yes (`@daytona/sdk`) | per-second billing | [S34][S35] |
| Fly Machines | shared-cpu-2x/1 GB $0.0092/h; performance-1x/2 GB $0.0447/h; volumes $0.15/GB-mo | none stated; subsecond start/stop | REST API | cheapest, but we operate images/health | [S36][S37] |
| Cloudflare Sandboxes | CPU $0.000020/vCPU-s (~$0.072/h), mem $0.0000025/GiB-s, on Workers Paid ($5/mo); instances up to 4 vCPU/12 GiB | not stated | yes (`@cloudflare/sandbox`) | Durable-Object-bound containers; egress controls | [S38][S39] |
| AWS Bedrock AgentCore Runtime | $0.0895/vCPU-h + $0.00945/GB-h, 1-s minimum, **CPU not billed while waiting on I/O**; instances: EC2 + 12% | microVMs up to 8 h; Instances up to 14 days; per-session microVM, memory sanitized after | framework- and model-agnostic; any HTTP/WebSocket server (Node OK) | persistent filesystem across stop/resume; built-in identity, observability (CloudWatch pricing) | [S40][S41] |

*Inferred:* For a 45-minute phase with 1 vCPU / 2 GiB: E2B ≈ $0.06, Modal ≈ $0.14, Daytona ≈ $0.06, Fly ≈ $0.01–0.03, Cloudflare ≈ $0.06, AgentCore ≈ $0.02–0.08 (CPU mostly idle waiting on the model). None of these is material next to $5–100 of tokens. The choice reduces to: (i) AWS residency and IAM (AgentCore, or ECS Fargate/Lambda we run ourselves — M8), (ii) per-session microVM isolation (AgentCore, E2B), (iii) TypeScript SDK maturity (E2B, Daytona, Cloudflare, Modal all fine), (iv) ops burden (Fly and self-run Fargate are the most burden). Given Q-3's bias against expensive-at-scale third parties and for AWS, **AgentCore Runtime microVMs or ECS Fargate** are the AWS-native picks; E2B/Daytona are acceptable if AgentCore's Node story is rough in practice (unverified — see §Open questions).

### 3.4 OpenAI Agents SDK (TypeScript) + Codex SDK

*Observed* [S27][S28][S29][S24]:

- Agents SDK JS: agents, tools, handoffs, guardrails, tracing, hosted tools (web search, file search, code interpreter, image, computer/shell), sessions (`MemorySession`, `OpenAIConversationsSession`), human-in-the-loop guides; "Limited to OpenAI models" in practice, with a `Model` interface for extension [S27].
- Codex SDK: TypeScript and Python; TS "manages local Codex agent threads"; threads resume by ID; auth via ChatGPT sign-in or API key; no structured-output section; documented use cases include CI/CD and "application embedding" [S28][S24].
- Deep research API: `o3-deep-research`, `o4-mini-deep-research` on the Responses API; requires at least one data source (`web_search_preview`, file search, remote MCP "search/fetch"); background mode "strongly recommended" — "tens of minutes"; output carries `annotations` (URL, title, start/end index); MCP tools must be `require_approval: "never"` [S29].
- Web search tool: "$10.00 / 1k calls + Search content tokens billed at model rates"; preview on non-reasoning models "$25.00 / 1k calls + Search content tokens are free"; gpt-5 $1.25/$10, gpt-5-mini $0.25/$2, gpt-5-pro $15/$120 per MTok; deep-research model prices not listed on the fetched page [S29b].

*Inferred:* The Agents SDK lacks a filesystem-scoped, skills-loading, compaction-managing harness — the skills would have to be re-expressed as handoffs and custom tools (i.e., hand-rolling). The Codex SDK is the closest OpenAI analogue to the Agent SDK, but it is a *coding* harness with a shell-centric tool set and no documented web-fetch-with-citations story. The genuinely valuable OpenAI asset for Rhema is the **deep research API as a research-phase provider** (§4), not as a harness.

**Rhema analogue:** no harness analogue for v1; deep research as an optional G3 provider and a G13 routing target for the discourse-map phase.

### 3.5 Google ADK (TypeScript) / Gemini

*Observed* [S42][S43]: ADK ships Python, TypeScript (`@google/adk`, Apache-2.0), Go, Java, Kotlin; agent types include sequential/loop/parallel workflow agents; built-in Google Search tool; sessions, state, "context compression"; deployment on Agent Runtime, Cloud Run, GKE; model support "almost any generative AI model" via adapters (Claude, OpenAI, LiteLLM listed in FAQ). No explicit alpha/beta/GA marker on the JS repo.

*Inferred:* GCP-centric deployment and Gemini-centric grounding (Google Search returns grounding chunks, not fetched pages) fit neither AWS-first nor the skills' fetch-and-quote discipline. Not a harness candidate; Gemini remains a *model* candidate via the AI SDK provider layer for non-research phases.

### 3.6 Vercel AI SDK hand-rolled loop

*Observed* [S44][S45][S46][S47]: `ToolLoopAgent` with `stopWhen`/`maxSteps`; subagents are "not a first-class primitive" but a documented pattern (agent-as-tool with a fresh context window, `toModelOutput` to shape what returns to the parent); Anthropic provider exposes web search (`webSearch_20250305`), web fetch (`webFetch_20250910`), code execution, caching, adaptive thinking, PDF input; Bedrock provider exposes Claude/Nova/Llama/Mistral/DeepSeek etc. with caching, 1M context, but "Files API and MCP Connector remain unsupported".

*Inferred:* Everything the skills need is *buildable* here — but file tools, allowlist enforcement, compaction, session persistence, skill loading, and the research loop become our code. The provider tool type strings the AI SDK documents (`webSearch_20250305`, `webFetch_20250910`) lag Anthropic's current `_20260318` variants with dynamic filtering [S6][S7], so the newest research features would trail. This is the "hand-roll" branch T4 argues against for year one. It *is* the right substrate for §8 provider-neutral phases and the in-IDE chat's lightweight turns.

### 3.7 LangGraph.js, Mastra, Inngest AgentKit

*Observed* [S48][S49][S50][S51]:

- LangGraph.js: "low-level orchestration framework and runtime for building, managing, and deploying long-running, stateful agents"; persistence, human-in-the-loop interrupts, streaming; LangSmith Deployment for hosting. Checkpointer/licensing details were not on the fetched overview page.
- Mastra: TypeScript agents/tools/workflows; model routing via `provider/model` strings; workflow suspend/resume with snapshots that "persist across deployments and application restarts"; storage backend names not on the fetched pages.
- Inngest AgentKit: agents, networks, routers, tools, shared state; adapters for OpenAI, Anthropic, Gemini; durable execution via Inngest steps; human-in-the-loop via event waiting; E2B/Browserbase integrations.

*Inferred:* These are orchestration substrates, not harnesses: none ships the filesystem/skills/compaction/subagent bundle. Their proper place is **G6** (durable orchestration we own) — Inngest in particular overlaps with the Temporal/Trigger.dev/Restate shortlist and can wrap Agent SDK `query()` calls as durable steps with `waitForEvent` gates. Mastra's suspend/resume is the same idea with a framework attached we would not otherwise use.

### 3.8 AWS Bedrock Agents / AgentCore

*Observed* [S40][S41][S19]: AgentCore Runtime is "framework agnostic", "works with any Large Language Model", per-session microVMs, 8-hour sessions, persistent filesystem across stop/resume, bidirectional streaming, built-in identity and tracing; Gateway $0.005/1k invocations; Memory $0.25/1k events. Bedrock model catalog now includes Claude 5.x (Opus 5, Sonnet 5, Fable 5, Mythos 5), OpenAI GPT-5.4/5.5/5.6, Mistral, Qwen, DeepSeek, MiniMax, Kimi, xAI Grok.

*Inferred:* AgentCore is a *hosting* answer (§3.3), and Bedrock is a *multi-provider inference* answer for non-Anthropic models (§8). Neither supplies the harness. The legacy "Bedrock Agents" (action groups, knowledge bases) is a different product built around Converse-API tool use with no filesystem or skills — not evaluated further because the Agent SDK on Bedrock docs state Claude Code "uses the Amazon Bedrock Invoke API and does not support the Converse API" and "The WebSearch tool is not available on Amazon Bedrock" [S11].

## 4. Deep research capability (G3)

*Observed* pricing and behavior, all fetched this session:

| Provider | What it is | Price | Citations | PDF | Limits / notes | Source |
|---|---|---|---|---|---|---|
| Anthropic web search (`web_search_20260318`) | server tool inside the Messages loop; dynamic filtering runs search inside code execution (free when paired) | **$10 / 1k searches** + tokens; results count as input tokens on later turns | always on; `cited_text` ≤150 chars, `url`, `title`; citation fields not billed; "citations must be included" when shown to end users | n/a | `max_uses`, `allowed/blocked_domains`; errors are 200 with `error_code`; `pause_turn`; **not on Bedrock**; basic only on Vertex | [S6] |
| Anthropic web fetch (`web_fetch_20260318`) | server tool; full page text or PDF (base64 → document block) | **no charge** beyond tokens; ~2.5k tokens/10 kB page, ~125k tokens for a 500 kB PDF | optional `citations.enabled` with `char_location`/page locations | yes | only URLs already in context (`url_not_in_prior_context`); no JS rendering; `max_content_tokens`; `use_cache:false` for fresh; `url_not_allowed` for robots/private; **not on Bedrock or Vertex** | [S7] |
| Claude Code `WebSearch`/`WebFetch` tools (Agent SDK) | same capability inside the harness; search results are summarized before entering context | tokens (search billed as above — inferred, not stated on SDK pages) | fetch returns page text | yes via fetch | WebSearch unavailable on Bedrock | [S15][S11] |
| Claude Code `/deep-research` workflow | bundled multi-agent workflow: fan-out searches, fetch, cross-check, vote, cited report | tokens × many agents; ≤16 concurrent | report cites sources per claim; unverifiable claims marked unverified | via fetch | SDK-runnable; no mid-run input | [S30] |
| OpenAI deep research | `o3-deep-research` / `o4-mini-deep-research` on Responses, background mode | model tokens (not on fetched pricing page) + web search $10/1k calls (+content tokens) | `annotations` with URL + char offsets | via file search vector stores | "tens of minutes"; background retains data ~10 min (no ZDR) | [S29][S29b] |
| Perplexity Sonar | answer engine API | sonar $1/$1 per MTok + $5–12/1k requests; sonar-pro $3/$15; **sonar-deep-research** $2/$8 + citation tokens $2/M + reasoning $3/M + $5/1k searches; Search API $5/1k | citations in response | — | | [S52] |
| Exa | neural search + contents | $7/1k searches; deep $12/1k; deep-reasoning $15/1k; contents $1/1k pages; $20 free + $10/mo | URLs + text | contents endpoint returns text | up to 1,000 results (enterprise) | [S53] |
| Tavily | search/extract/crawl API | 1,000 free credits/mo; PAYG $0.008/credit; basic search 1 credit, advanced 2; extract 1 credit/5 URLs (advanced 2); research 4–250 credits | URLs + snippets/raw | extract | plan tiers $30–500/mo | [S54][S55] |
| Firecrawl | scrape/crawl/search to markdown | 1 credit/page; **PDF 1 credit/page**; search 2 credits/10 results; free 1,000; $16–$599/mo | URLs | yes, auto-detected | concurrency 2–100 by plan; JS-rendered pages | [S56][S57] |
| Jina Reader | URL → LLM-ready text (`r.jina.ai`), SERP (`s.jina.ai`) | token-priced; 10M free tokens on key | URL/title/content/timestamp | yes | 500 RPM with key; 20 RPM without | [S58] |

*Inferred, mapped to the skills' verification discipline:*

- The skills' rule is *fetch-and-quote*, not *search-and-trust*. That makes **fetch quality** the decisive axis, and Anthropic's fetch is free, returns full text or PDF bytes, and offers char-level citations — but it cannot fetch arbitrary model-constructed URLs and cannot render JS. Firecrawl (JS rendering, PDF, markdown) and Jina (cheap, fast, PDF) are the natural **fallback fetchers**, exposed to the harness as an MCP tool or a custom tool the hook layer can audit. Since Claude's fetch only works on URLs already in context, a search→fetch chain is required anyway; a fallback fetcher does not change the skill's discipline.
- Cost envelope per run at Anthropic prices: 100 searches = $1.00; 200 fetches at ~5k tokens each = ~1M input tokens = $10 on Fable 5, $2 on Sonnet 5, $0.20–1.00 if cache-read. The *token* cost of fetched pages, not search fees, is the lever — which is exactly what dynamic filtering (`_20260318` variants) and `max_content_tokens` address. G3 evals should measure tokens per verified claim under both basic and dynamic-filtering variants.
- OpenAI deep research is a *black-box report*, not a claim ledger with per-claim URLs read in-session; it fits the discourse-map phase (originality audit, reception forecast) as an *input*, not the fact-check phase. Perplexity deep research likewise. Both are candidate G13 routes for "discourse map" only.
- Exa/Tavily are search-layer substitutes if Anthropic search proves weak on academic sources; their per-1k prices are the same order as Anthropic's ($5–15 vs $10). Not needed for v1.
- PDF: Anthropic fetch handles PDFs natively but at ~250 tokens/kB — a 40-page paper is ~50–125k tokens per read. For persona corpora (I1), pre-convert to markdown once (Firecrawl PDF at 1 credit/page, or our own pandoc/Docling pipeline — I1's remit) and let the harness Read the markdown; do not let the harness re-fetch PDFs on every round (project-memory's "never persist raw pages" rule applies to *web* pages; corpus files are user uploads and are stored anyway).

**Rhema analogue:** the "research" pane's source cards come straight from `web_fetch_tool_result` (`url`, `retrieved_at`) and the skills' `agents/<role>/research/sources/*.md` notes; the transparency floor E6 ("sources actually fetched with URLs") is satisfied by logging every fetch tool call in the hook layer.

## 5. Fresh-context subagent primitives per option (G5)

| Option | Primitive | Isolation guarantee | Parallel | Boundary propagation | Fit for second read / fidelity audit / gap analysis / hold-out |
|---|---|---|---|---|---|
| Claude Agent SDK | `Agent` tool with `agents:{...}` definitions; `fork` variant inherits context (avoid); `Workflow` for large fan-outs | documented: "starts fresh, with no parent conversation"; receives only its prompt + CLAUDE.md + tools | yes; default cap 20, depth 3 | prompt-level (skills already do it) + our `PreToolUse` hook applies in-process; per-agent `tools` list can drop Write/Bash for read-only auditors | native; define `second-reader`, `fidelity-auditor`, `gap-analyst`, `holdout-calibrator` as `AgentDefinition`s with `tools:["Read","WebFetch","WebSearch"]`, `model`/`effort` per role |
| Managed Agents | multiagent session: coordinator + roster (`{type:"self"}` or other agent IDs); threads with `thread_message_*` events | separate threads; roster agent can be a cheaper model | yes | per-agent toolset config; self-hosted worker enforces paths (`--unrestricted-paths` off) | supported with adapter prompt; hold-out secrecy relies on the coordinator not passing the piece |
| OpenAI Agents SDK | handoffs / agent-as-tool | new run, fresh input | yes | custom | buildable |
| Vercel AI SDK | agent-as-tool pattern; `toModelOutput` | fresh context by construction | yes (Promise.all) | custom | buildable; no built-in file tools to scope |
| LangGraph.js / Mastra / AgentKit | subgraph / sub-workflow / network agent | fresh state if you construct it so | yes | custom | buildable |
| Claude Code CLI headless | same as SDK (`--agents <json>`) | same | same | same | same |

*Inferred:* The four fresh-context checks the skills require are the *quality* differentiator of the product (the second read is "~a third of findings" per the README). Only the Agent SDK and Managed Agents give this as a documented, isolation-guaranteed primitive with per-agent tool restriction. That, more than any other row, decides G1.

One hazard: the SDK's subagent output scan (v2.1.210+) inserts `[harness: …]` markers if a subagent's final message contains control-tag or turn-marker patterns. Our second-read and gap-analysis outputs are markdown files written to disk, not the returned message, so this is benign — but the orchestrator should read the *file*, not the tool result string.

## 6. Skill porting strategy (G4)

Three options were considered:

1. **Verbatim `SKILL.md` in the harness** — the SDK loads them from `<cwd>/.claude/skills`; dispatch with `/editorial-review` in the prompt; inputs as natural language (the skills are written for this). Pros: zero rewrite, keeps the operator's proven behavior, the skills already implement compaction-proof file discipline and subagent fallbacks. Cons: one `query()` per whole skill means gates are awkward, phase boundaries are invisible to the UI except via file writes, and cost attribution per phase is by inference.
2. **Compile phases into orchestrated steps** — our orchestrator runs each phase as its own `query()` (or Managed Agents turn) with a phase-specific prompt built from the same `references/*.md`. Pros: gates are natural, per-phase cost/latency/model routing, clean K1/K2 events. Cons: forks the skills' text; every skill edit must be re-ported; risk of drifting from the tested regimen.
3. **Hybrid (recommended, and the one T4 implies)** — keep the skill text as the single source of truth, but run it *phase by phase*: the orchestrator invokes the skill with an explicit phase instruction and `guidance`/`autonomous` inputs (the skills already accept these), the harness executes that phase's regimen against project memory, and phase completion is detected by the artifact the phase must write (e.g., `correspondence/v1-review/claim-ledger.md`). The skills' own "files are the only inter-phase interface" principle makes this cheap: each phase is a fresh context that reads what the previous one wrote.

*Inferred requirements for the hybrid:* (a) a small, upstream-safe addition to each skill: an optional `phase` input ("run only Phase N; stop after writing its artifact") — this is harness-neutral and keeps `agent-discourse` public-repo-clean (Q-19); (b) a phase→artifact manifest owned by Rhema (private) that the orchestrator uses for completion detection and UI (K1/K2); (c) the boundary hook (§3.1) as the mechanical F4 enforcement so we can drop the normative "attest at delivery" paragraph from consumer-facing runs. Never modify `~/agent-discourse` in this research phase; the `phase` input is a proposal for the spec.

## 7. The in-IDE chat (G9)

*Observed:* The Agent SDK supports long-lived sessions via streaming input mode with per-turn `result` messages and running `total_cost_usd`; `/clear` and `/compact` are dispatchable; `resume` + `sessionStore` reconstruct across hosts; `getSessionMessages` returns the post-compaction chain [S4][S20][S23][S16]. Managed Agents sessions are natively long-lived and stateful with server-side history [S12].

*Inferred design:* Same harness, distinct agent-type ("assistant") with: read access to the *shared record only* (never `agents/*`), `WebSearch`/`WebFetch`, and three custom tools (`start_workflow`, `read_artifact`, `create_outline`) exposed as an in-process MCP server. The chat's memory boundary is simplest if the assistant is a fourth role with its own `agents/assistant/` namespace under the existing allowlist rule. A lighter loop (Vercel AI SDK) is the right choice only for cheap, tool-less turns (rename, summarize a paragraph); keeping the research-capable chat on the same harness means one provenance model and one cost meter. The `/deep-research` workflow is the obvious backing for "research this question" from chat, but it cannot take mid-run input — surface it as a background run card (D4), not as a chat turn.

## 8. Multi-provider routing (G10, G13, L7)

### 8.1 Provider abstraction options — *Observed*

- **Vercel AI SDK provider layer**: one interface over Anthropic, OpenAI, Google, Bedrock, xAI (example uses Grok), with provider-specific tools exposed as typed options; Bedrock provider covers Claude + Nova + Llama + Mistral + DeepSeek and lacks Files API/MCP connector [S44][S45][S46].
- **OpenRouter**: "you pay the same rate as you would directly with the provider"; 5.5% ($0.80 min) on Stripe credit purchases; BYOK 5% over a $25k/month free allowance; zero prompt logging by default; its own `openrouter:web_search` server tool [S59][S60].
- **LiteLLM** is Python (excluded by Q-3); Anthropic's own docs list it only as a credential-injecting gateway option [S15].
- **Amazon Bedrock**: Claude 5.x, GPT-5.4/5.5/5.6, Mistral, Qwen, DeepSeek, Kimi, Grok in one IAM/billing plane; regional endpoints +10% [S19][S9].
- **Claude Platform on AWS**: Anthropic-operated, AWS Marketplace billing (CCU = $0.01), full feature parity incl. web tools, Managed Agents, Skills; Start-tier rate limits, no self-serve limit increases; `inference_geo:"us"` ×1.1 [S17][S9][S61].

### 8.2 Capability gating per phase — *Inferred*

| Phase class | Needs | Providers that can run it *inside the harness* today |
|---|---|---|
| Research-heavy (fact-check, grounding, discourse map, persona corpus ingest) | search + fetch + PDF + fresh-context fan-out + file R/W | Anthropic (Claude API / Claude Platform on AWS) natively; OpenAI via deep research as an *external report*, not in-loop |
| Read-and-judge (second read, fidelity audit, gap analysis, argument/craft critique) | long context + file read; no web | Anthropic; OpenAI/Google/Bedrock-hosted models via AI SDK "lite loop" with a Read tool — feasible v2 |
| Generate (draft sections, revise, letters) | long context + file write + voice targets | same as above |
| Chat turns without tools | tokens only | any |

Rule: the *run* is Anthropic-harnessed; a *phase* may be delegated to another provider only if its requirement row is satisfied. The user-facing "model" choice (Q-4) therefore becomes a curated **model profile** per workflow — e.g. "Best (Fable 5)", "Balanced (Opus 5)", "Economy (Sonnet 5 main / Haiku 4.5 subagents)" — and a per-phase override that the routing table validates. Subagent `model`/`effort` fields in `AgentDefinition` make per-phase Anthropic routing free [S3].

### 8.3 Cost pass-through — *Inferred*

Meter = SDK `modelUsage` (per model, includes subagents) × our price table + `server_tool_use.web_search_requests` × $0.01, attributed to run→phase→role via the `parent_tool_use_id` chain (K2/L4). Reconcile nightly to the Anthropic Usage & Cost API (or AWS Marketplace CCU line) because SDK numbers are estimates [S4]. For non-Anthropic phases, the AI SDK returns `usage` per step. Charge users in credits derived from list price × margin; never expose raw tokens by default (D12).

### 8.4 BYO keys — *Recommendation*

Defer to v2. Reasons: (i) support burden and rate-limit failures land on us while billing lands on the user; (ii) BYO Anthropic keys shift the org's rate limit tier and the ZDR/retention regime per user; (iii) it is the only mode where the Consumer-vs-Commercial confusion of §2 can leak in (users pasting OAuth tokens). If offered later, it is per-provider API keys only, validated at entry, with our meter still recording usage (for K4 estimates) but not charging.

## 9. Observability and evals (G11)

*Observed:*

- Agent SDK/Claude Code emit OTel metrics and log events (`claude_code.*`), traces in beta, with `session.id`, W3C trace-context inheritance from our app span, end-user/tenant attributes, and opt-in content flags `OTEL_LOG_USER_PROMPTS`, `OTEL_LOG_TOOL_DETAILS`, `OTEL_LOG_TOOL_CONTENT`, `OTEL_LOG_RAW_API_BODIES` [S21].
- Managed Agents emit `span.model_request_*` with `model_usage`, `session.usage`, and compaction events on the session stream [S14].
- OTel GenAI semantic conventions moved to `open-telemetry/semantic-conventions-genai`; still under development (no stable marker on the fetched pages); operations include inference, agent, execute_tool; Anthropic/Bedrock provider pages listed in the index [S62][S63].
- Langfuse cloud: Hobby free 50k units/mo, Core $29, Pro $199, Enterprise $2,499; $8/100k additional units; self-host "for free"; JS SDK and OTel ingestion [S64]. Braintrust: free $10 model credits + 1 GB/mo + 14-day retention; Pro $249/mo; enterprise self-hosted data plane [S65].
- AgentCore observability bills at CloudWatch rates [S40].

*Inferred:* The harness already speaks OTLP; our collector is the integration point. For Q-3's control bias, **self-hosted Langfuse on AWS** (OTLP in, Postgres/ClickHouse we run) is the fit; Braintrust is the alternative when evals-as-a-product matter more than trace ownership. Replay: we get it for free at two levels — SDK JSONL transcripts mirrored to S3 via `SessionStore`, and the artifact files themselves; a "replay" UI reads the transcript chain and the artifact diffs, never re-executes. Evals (M6): run the three real projects in `agent-scratch/` as golden runs; score with the skills' own measurable outputs (claim verdict counts, rubric caps, word-budget deltas, voice-feature counts) before adding LLM-judge scores. Keep content flags off in production telemetry by default (E5, L9): the raw API bodies contain the private memory.

## 10. Scoring matrix

Scale 0–3 per column (see §3 rubric). "Own" = our orchestration layer must supply it.

| Option | H1 file R/W + allowlist | H2 search+fetch | H3 fresh subagents | H4 1M ctx | H5 compaction/resume | H6 PDF | H7 gates | H8 parallel fan-out | H9 attestation | Skills verbatim | TS fit | AWS fit | ToS clarity | Lock-in (3 = low) | Maturity | Total /45 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Claude Agent SDK (TS) in our container | 3 (hooks + mounts) | 3 | 3 | 3 | 2 (auto-compact; resume needs SessionStore) | 3 | 2 (own, phase-split) | 3 | 3 (hook log) | 3 | 3 | 2 (Fargate/AgentCore; Claude Platform on AWS for inference) | 3 | 1 | 3 | **42** |
| Claude Managed Agents (self-hosted sandbox on AWS) | 2 (worker `workdir` guard; bash unconstrained) | 3 | 2 (multiagent roster) | 3 | 3 (server-side) | 3 | 2 (session idle + user event) | 3 | 2 | 2 (skills supported, no `Agent` tool) | 3 | 2 | 2 (beta; no ZDR unless self-hosted) | 1 | 1 (beta) | **34** |
| Claude Code CLI headless in 3P sandbox | 3 | 3 | 3 | 3 | 2 | 3 | 2 | 3 | 3 | 3 | 2 (JSON over stdio) | 1–2 (provider-dependent) | 3 | 1 | 3 | 40 (same engine as row 1; loses only on ergonomics/AWS) |
| OpenAI Agents SDK + Codex SDK | 1 (Codex shell tools; own scoping) | 2 (search tool; fetch via deep research/MCP) | 2 | 2 | 1 | 2 | 2 | 2 | 1 | 0 | 3 | 1 | 2 | 1 | 2 | 24 |
| Google ADK (TS) | 1 | 1 (grounding, not fetch) | 2 | 2 | 1 | 1 | 2 | 2 | 1 | 0 | 2 | 0 | 2 | 1 | 1 | 19 |
| Vercel AI SDK hand-rolled | 1 (own) | 2 (provider tools, lagging versions) | 1 (pattern) | 3 | 0 (own) | 2 | 2 | 2 | 1 (own) | 0 | 3 | 3 | 3 | 3 | 2 | 28 |
| LangGraph.js / Mastra / AgentKit + AI SDK | 1 | 2 | 1 | 3 | 2 (checkpoints/suspend) | 2 | 3 | 2 | 1 | 0 | 3 | 2 | 3 | 2 | 2 | 29 (as G6 substrate, not harness) |
| Bedrock AgentCore Runtime (as host for row 1) | — | — | — | — | 2 (persistent FS across stop/resume) | — | — | — | — | — | 2 | 3 | 3 | 2 | 2 | n/a (hosting only) |

*Reading:* the gap between row 1 and everything non-Anthropic is entirely H1/H3/H9/skills-verbatim — the things that make the product's editorial rigor real. The hand-rolled options score well on lock-in and TypeScript and nothing else; that is the T4 argument in numbers.

## 11. Recommendation memo (G12) — testing T4

**Thesis T4** (ledger §0): "Execution should start on a hosted, mature harness (Claude Agent SDK / Claude Code in a sandbox) with the skills ported nearly verbatim, and be wrapped by a thin durable orchestration layer we own (run/step/event model, cost meter, gates). Hand-rolling the research loop is the wrong place to spend the first year."

**Verdict: confirmed, with amendments.**

Confirmed because: (1) the Agent SDK is the only surveyed option that satisfies H1–H9 with configuration rather than code; (2) the skills load verbatim from `.claude/skills` and their file-as-interface design is exactly what makes phase-splitting and crash-resume cheap; (3) fresh-context subagents with per-agent tool restriction are a documented guarantee; (4) hooks give F4 mechanical enforcement without touching the skills; (5) compute cost is negligible, so "hosted in a sandbox" costs nothing meaningful; (6) hand-rolling forfeits dynamic filtering, `/deep-research`, compaction, session mirroring, and the subagent output scan — each of which would be months of our year.

Amendments:

- **A1 (branding/ToS):** say "Claude Agent SDK under Commercial Terms with our API key/Marketplace billing", never "Claude Code in a sandbox as a product". No Claude login, no Claude Code name (§2).
- **A2 (AWS):** "hosted" resolves to **Claude Platform on AWS** for inference (Bedrock lacks web tools) and **ECS Fargate or AgentCore Runtime microVMs** for the container; Bedrock only for non-Anthropic models (§3.3, §8).
- **A3 (second candidate):** Managed Agents is close enough that the orchestration layer's engine interface must be written against an abstract `Engine` (start phase, stream events, gate, cancel, usage) with two implementations planned: `AgentSdkEngine` (v1) and `ManagedAgentsEngine` (when beta exits and if ZDR/self-hosted sandbox on Lambda proves out).
- **A4 (durability is ours):** SDK `resume` and `SessionStore` are optimizations; the durable unit is *phase + artifact on S3*. The orchestrator (G6 — Temporal/Inngest/Restate/home-grown to be decided there) restarts a phase from files, never from a transcript.
- **A5 (cost meter is an estimate):** live meter from SDK `modelUsage`; ledger of record from the Anthropic Usage & Cost API / Marketplace (L4).

**Alternatives rejected and why:** OpenAI Agents/Codex (no filesystem/skills harness; fetch-and-cite only via deep research black box; ToS for plan auth murkier than Anthropic's); Google ADK (GCP/Gemini-centric, grounding ≠ fetch); Vercel AI SDK hand-roll (everything H1/H3/H5/H9 becomes our code; provider tool versions lag); LangGraph/Mastra/AgentKit as harness (orchestration, not harness — reconsidered for G6); OpenRouter as primary (adds a 5.5% fee and a third party in the request path for no capability we need; Anthropic server tools do not pass through).

### Migration path ("mature harness" → "own more of the loop")

| Stage | What runs where | Trigger to move on | Ledger rows |
|---|---|---|---|
| **0 — Verbatim** (MVP) | One `query()` per skill run inside a per-run Fargate/AgentCore container; skills as `.claude/skills`; hook allowlist; `maxBudgetUsd`, depth 1, concurrency ≤5; S3 `SessionStore`; OTLP → Langfuse | Gates (Q-7) and per-phase UI (D4) need phase boundaries | G1, G4, G8, F4 |
| **1 — Phase-split hybrid** | Orchestrator runs each phase as its own `query()` with a `phase` input; completion detected by artifact; gates are orchestrator states; per-phase model/effort routing via `AgentDefinition` | Need cheaper read-and-judge phases or user model choice beyond Anthropic | G4, G6, G7, K1, K2, G10 |
| **2 — Provider-neutral phases** | Read-and-judge and generate phases optionally on AI SDK "lite loop" (Bedrock-hosted GPT-5.x/Gemini via Vertex-less route TBD) with a Read/Write tool bound to the same allowlist; research phases stay Anthropic | Evidence from G11 evals that quality holds at lower cost | G13, L3, C14 |
| **3 — Custom tool surface** | Replace raw filesystem semantics with an artifact-store MCP server (typed `read_artifact`/`write_artifact` with role scoping) so the same skills run against S3-backed memory with no local mirror; the hook layer becomes redundant | Multi-host resume, sharing (C13), and audit demands outgrow the file mirror | F3, F4, C13 |
| **4 — Engine choice** | `ManagedAgentsEngine` for cloud-sandboxed runs if beta exits with ZDR on self-hosted; or keep SDK | Beta exit, pricing, and ops burden comparison | G1, M8 |

At no stage do we rewrite the research loop. The thing we increasingly own is the *boundary* (tools and storage), not the *loop*.

## Rhema implications

1. **Engine interface first (G6/G7):** define `Engine.startPhase(runId, role, phase, inputs) → AsyncIterable<RunEvent>` before choosing Temporal vs Inngest; both SDK messages and Managed Agents events must map to K2's event schema (`phase.started`, `search.performed` from `WebSearch` tool_use, `source.read` from `WebFetch`, `artifact.written` from `Write` on an allowed path, `gate.opened`). Ties to T4, K1, K2.
2. **Boundary enforcement is a hook plus a mount (F4, E1–E4, T3):** the `PreToolUse` allowlist hook is the mechanical rule; the audit log it writes is the "attestation" E6 wants to display ("the editor never saw the author's notes — verified: 0 denied reads, 214 allowed reads").
3. **Inference on Claude Platform on AWS, not Bedrock (M1, M8, Q-3/Q-4 tension):** record the reason (no web search/fetch on Bedrock) in the spec's risk register; Start-tier limits and no self-serve raises on the Marketplace flavor mean an early account-rep conversation.
4. **Cost model inputs (C14, L3, L4):** tokens dominate; search fees are ~1–2% of a run; sandbox ~0.1%. Client-side `total_cost_usd` for the live meter, Usage & Cost API for the invoice of record. Cache TTL 1h on long phases.
5. **Model profiles, not raw model pickers (D13, G13):** curated profiles per workflow with per-phase validation against the capability table; research phases cannot leave Anthropic in v1.
6. **BYO keys deferred (L7):** API-key-only if ever; never subscription/OAuth.
7. **`phase` input proposal for `agent-discourse` (A1/G4, Q-19):** a harness-neutral addition; Rhema's phase→artifact manifest stays private.
8. **Persona corpora pre-converted (I1, J8):** never let runs re-fetch PDFs; fetch cost is ~250 tokens/kB.
9. **Telemetry privacy default (E5, L9, M3):** content flags off; traces carry ids and counts only.
10. **`/deep-research` as a background run, not a chat turn (D9, G9):** no mid-run input in workflows.
11. **Subagent caps are product settings (K4, L6):** depth 1, concurrency 5, `maxBudgetUsd` from the pre-run estimate; Opus 5's eagerness to delegate is a cost risk without them.
12. **Branding (C1):** "Powered by Claude" is allowed; "Claude Code" is not.

## Ledger updates

| Row | Proposed status | Evidence (one line) |
|---|---|---|
| G1 | done | §3, §10: Agent SDK (TS) primary, Managed Agents secondary; sandbox provider table [S2–S5, S12–S14, S31–S41] |
| G2 | done | §2: Anthropic prohibits plan-credential routing for third parties [S1]; OpenAI plan auth scoped to trusted CI/Enterprise tokens [S24]; API/Marketplace-only |
| G3 | done | §4: pricing/limits table for 9 providers [S6, S7, S29, S29b, S52–S58]; fetch quality is the axis; fallback fetcher = Firecrawl/Jina |
| G4 | done | §6: hybrid phase-split with a `phase` input; artifact-completion detection |
| G5 | done | §5: only Agent SDK and Managed Agents give documented isolation + per-agent tool restriction [S3, S14] |
| G9 | done (design input) | §7: same harness, "assistant" role with own namespace + 3 custom tools; `/deep-research` as background run |
| G10 | done | §8.2: phase-gated routing; research phases Anthropic-only in v1 |
| G11 | done | §9: OTLP from harness → self-hosted Langfuse; replay from S3 transcripts + artifacts; evals on the three golden projects |
| G13 | done | §8: provider abstraction = AI SDK for non-Anthropic phases; Bedrock for GPT-5.x/others; Claude Platform on AWS for Anthropic; BYO deferred |
| G12 | in-progress → S | §11 memo + 5-stage migration path; needs G6 decision to finalize |
| G6 | open (input provided) | §3.7, §11 A4: durable unit is phase+artifact; Inngest AgentKit overlaps; decide Temporal/Inngest/Restate there |
| G8 | open (input provided) | §3.1, §3.3: container `--network none` + proxy pattern, gVisor/microVM tiers, per-tenant `CLAUDE_CONFIG_DIR`/`cwd`/egress [S5, S15] |
| F4 | open (input provided) | §3.1: `PreToolUse` allowlist hook + role-scoped mounts = mechanical boundary + audit log |
| L4 | open (input provided) | §8.3: SDK `modelUsage` for meter; Usage & Cost API for record [S4] |
| L7 | open → decision proposed | §8.4: defer BYO keys to v2; API keys only |
| M1/M8 | open (input provided) | §3.3, §8.1: Claude Platform on AWS for inference; Fargate or AgentCore for containers |

**New rows proposed:**

- **G14 — `phase` input for `agent-discourse` skills**: specify a harness-neutral optional input ("run only Phase N and stop after its artifact"), plus Rhema's private phase→artifact manifest. Owner A. Rationale §6.
- **G15 — Engine abstraction**: `Engine` interface with `AgentSdkEngine` (v1) and `ManagedAgentsEngine` (later); event mapping table to K2. Owner A. Rationale §11 A3.
- **G16 — Boundary hook + audit log spec**: allowlist evaluation for Read/Write/Edit/Glob/Grep/Bash/WebFetch (URL allow/deny per role), denial semantics, log schema feeding E6's attestation widget. Owner A.
- **G17 — Fallback fetcher**: Firecrawl/Jina as an audited custom tool for JS-rendered pages and PDFs Anthropic fetch rejects; policy on robots/`url_not_allowed`. Owner A/R.
- **L10 — Counsel read of Commercial Terms §D.4 vs §A.1** for a Claude-powered paid product; confirm no "resale" characterization. Owner P.

## Open questions / unverified

1. **OpenAI consumer Terms of Use** (`openai.com/policies/terms-of-use`, `row-terms-of-use`, `usage-policies`) returned HTTP 403; the account-sharing/automation clauses are inferred from Codex auth docs, a sibling OpenAI terms page, and a GitHub discussion (secondary). The conclusion (no plan-credential use for third parties) is robust because Codex docs never permit it, but the verbatim consumer clause is unread.
2. **OpenAI deep research model pricing** was not on the fetched pricing page (only o-series and gpt-5 family were). Fetch `developers.openai.com/api/docs/models/o3-deep-research` in a later pass.
3. **Whether Claude Code's `WebSearch` tool is billed at the $10/1k API rate** when run via the Agent SDK on an API key — not stated on the SDK pages I read; assumed yes (server tool).
4. **AgentCore Runtime + Node/TypeScript ergonomics**: the runtime is framework-agnostic and speaks HTTP/WebSocket, and Agent SDK requires a long-lived subprocess with local disk; I did not find a first-party AgentCore + Claude Agent SDK guide. Needs a spike (M8).
5. **Cloudflare Containers max instance duration** and **Modal JS SDK details** were summarized from pages that did not state limits explicitly; treat as "unstated".
6. **Langfuse license split** (MIT core vs enterprise-licensed modules) not on the pricing page; verify before self-hosting.
7. **Anthropic support article on Pro/Max Claude Code usage** was thin; the binding text is the Claude Code legal page [S1].
8. **Google ADK JS maturity** (alpha/beta/GA) not marked on the repo page.
9. **Claude Platform on AWS Managed Agents feature gaps** beyond the 6-hour reauth and memory-store restriction were not enumerated in full (page truncated at 84 kB; sections read via grep).
10. **Search quality for academic sources** (Anthropic vs Exa vs Tavily) is untested; G11 evals should include a citation-recovery benchmark on the three real projects.
11. **`web_search`/`web_fetch` availability on Claude Platform on AWS is stated as "available"** [S6][S7][S17]; confirm rate limits for the Start tier suffice for parallel fact-check fan-outs (2M ITPM on Opus 5 at Start tier looks adequate for ~10 concurrent runs; unverified under load).

## Sources

All accessed 2026-08-27.

- [S1] https://code.claude.com/docs/en/legal-and-compliance · Claude Code legal and compliance · ToS for hosting Claude Code, OAuth vs API key policy, branding.
- [S2] https://code.claude.com/docs/en/agent-sdk/overview · Agent SDK overview · capabilities, Commercial Terms applicability, branding, claude.ai login prohibition.
- [S3] https://code.claude.com/docs/en/agent-sdk/subagents (and TypeScript reference https://code.claude.com/docs/en/agent-sdk/typescript) · subagent isolation, `AgentDefinition`, caps, Workflow tool, `query()` options.
- [S4] https://code.claude.com/docs/en/agent-sdk/cost-tracking · cost fields are estimates; `modelUsage` includes subagents; cache TTL env vars.
- [S5] https://code.claude.com/docs/en/agent-sdk/hosting · subprocess model, resources, $0.05/h container, multi-tenant isolation, known limitations.
- [S6] https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool · $10/1k searches, citations, dynamic filtering, not on Bedrock.
- [S7] https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool · free beyond tokens, PDF, URL-in-context rule, not on Bedrock/Vertex, token examples.
- [S8] https://www.anthropic.com/legal/consumer-terms · Consumer Terms (eff. 2025-10-08) · credential sharing, resale, automated access clauses.
- [S9] https://platform.claude.com/docs/en/about-claude/pricing · model prices, cache multipliers, web tools, Managed Agents $0.08/session-hour, CCU on AWS.
- [S10] https://www.anthropic.com/legal/commercial-terms · Commercial Terms (eff. 2025-06-17) · §A.1 power products for end users; §D.4 resale.
- [S11] https://code.claude.com/docs/en/amazon-bedrock and https://code.claude.com/docs/en/agent-sdk/quickstart · Bedrock env, WebSearch unavailable on Bedrock, Mantle, Invoke-only; SDK auth methods incl. `CLAUDE_CODE_USE_ANTHROPIC_AWS`.
- [S12] https://platform.claude.com/docs/en/managed-agents/overview · Managed Agents concepts, tools, beta, ZDR ineligibility.
- [S13] https://platform.claude.com/docs/en/managed-agents/self-hosted-sandboxes · environment worker, platforms (AWS Lambda microVMs, Docker, K8s, E2B, Fly, Modal, Cloudflare), ZDR eligibility.
- [S14] https://platform.claude.com/docs/en/managed-agents/reference · event types incl. compaction and usage spans, rate limits, branding.
- [S15] https://code.claude.com/docs/en/agent-sdk/secure-deployment · isolation tiers, proxy/credential pattern, web search summarization.
- [S16] https://code.claude.com/docs/en/agent-sdk/session-storage · `SessionStore` interface, S3/Redis/Postgres adapters, dual-write, subagent subpaths.
- [S17] https://platform.claude.com/docs/en/build-with-claude/claude-platform-on-aws · Anthropic-operated on AWS, Marketplace billing, parity table vs Bedrock, Managed Agents on AWS (6-hour reauth).
- [S18] https://code.claude.com/docs/en/headless · `claude -p`, `--bare`, stream-json, subagent forwarding, SIGTERM semantics.
- [S19] https://docs.aws.amazon.com/bedrock/latest/userguide/model-cards.html · Bedrock catalog incl. Claude 5.x and OpenAI GPT-5.x.
- [S20] https://code.claude.com/docs/en/agent-sdk/skills · skill discovery via `settingSources`, `skills` option, `/name` dispatch, `/compact`.
- [S21] https://code.claude.com/docs/en/agent-sdk/observability · OTel signals, span names, end-user attributes, content flags.
- [S22] https://code.claude.com/docs/en/agent-sdk/hooks · hook events and `permissionDecision`/`updatedInput` outputs.
- [S23] https://code.claude.com/docs/en/agent-sdk/sessions · continue/resume/fork, cross-host resume options.
- [S24] https://learn.chatgpt.com/docs/auth · Codex auth: ChatGPT sign-in vs API key; Enterprise access tokens for "trusted scripts, schedulers, and private CI runners".
- [S25] https://openai.com/policies/education-terms/ (via search) · sibling OpenAI terms with "Automatically or programmatically extract" and credential-sharing clauses — secondary evidence.
- [S26] https://github.com/openai/codex/discussions/8338 · OpenAI maintainer declines ToS interpretation for third-party ChatGPT sign-in — secondary.
- [S27] https://openai.github.io/openai-agents-js/ · OpenAI Agents SDK JS primitives and hosted tools.
- [S28] https://learn.chatgpt.com/docs/codex-sdk · Codex SDK languages, threads, use cases.
- [S29] https://developers.openai.com/api/docs/guides/deep-research · deep research models, tools, background mode, annotations.
- [S29b] https://developers.openai.com/api/docs/pricing · web search $10/1k (+tokens), preview $25/1k, gpt-5 family, file search.
- [S30] https://code.claude.com/docs/en/workflows · dynamic workflows, `/deep-research`, limits (16 concurrent, 1,000 agents), SDK availability.
- [S31] https://e2b.dev/pricing · E2B per-second compute, session caps, concurrency.
- [S32] https://modal.com/pricing · Modal sandbox CPU/memory rates, free credits.
- [S33] https://modal.com/docs/guide/sandbox · Modal Sandboxes JS/Go SDKs, 24 h max, snapshots.
- [S34] https://www.daytona.io/pricing · Daytona rates, $200 free, sub-90 ms claim.
- [S35] https://www.daytona.io/docs/en/typescript-sdk/ · `@daytona/sdk`, lifecycle ops.
- [S36] https://fly.io/docs/machines/ · Fly Machines overview.
- [S37] https://fly.io/docs/about/pricing/ · Fly Machines prices, volumes, egress.
- [S38] https://developers.cloudflare.com/sandbox/ · Cloudflare Sandbox SDK capabilities.
- [S39] https://developers.cloudflare.com/containers/pricing/ · Containers instance types and rates.
- [S40] https://aws.amazon.com/bedrock/agentcore/pricing/ · AgentCore Runtime/Gateway/Memory pricing.
- [S41] https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agents-tools-runtime.html · AgentCore Runtime: framework/model agnostic, per-session microVM, 8 h/14 d, persistent FS.
- [S42] https://adk.dev/ · Google ADK languages, tools, deployment, model support.
- [S43] https://github.com/google/adk-js · `@google/adk`, Apache-2.0.
- [S44] https://ai-sdk.dev/docs/agents/overview · `ToolLoopAgent`, `stopWhen`.
- [S45] https://ai-sdk.dev/providers/ai-sdk-providers/anthropic · Anthropic provider tool support (web search/fetch versions, caching, PDF).
- [S46] https://ai-sdk.dev/providers/ai-sdk-providers/amazon-bedrock · Bedrock provider models/features/limits.
- [S47] https://ai-sdk.dev/docs/agents/subagents · subagents as a pattern with fresh context.
- [S48] https://docs.langchain.com/oss/javascript/langgraph/overview · LangGraph.js positioning.
- [S49] https://mastra.ai/docs · Mastra overview and model routing.
- [S50] https://mastra.ai/docs/workflows/suspend-and-resume · suspend/resume snapshots persist across restarts.
- [S51] https://agentkit.inngest.com/overview · AgentKit primitives, adapters, durable steps, HITL.
- [S52] https://docs.perplexity.ai/getting-started/pricing · Sonar and deep research pricing.
- [S53] https://exa.ai/pricing · Exa search/contents prices and free credits.
- [S54] https://www.tavily.com/pricing · Tavily plans and PAYG.
- [S55] https://docs.tavily.com/documentation/api-credits · Tavily credit costs per operation.
- [S56] https://www.firecrawl.dev/pricing · Firecrawl plans, credits, concurrency.
- [S57] https://docs.firecrawl.dev/features/scrape · Firecrawl PDF support, 1 credit/PDF page, JS rendering.
- [S58] https://jina.ai/reader/ · Jina Reader pricing, PDF, rate limits.
- [S59] https://openrouter.ai/docs/api-reference/limits · OpenRouter limits and fallback routing.
- [S60] https://openrouter.ai/docs/faq · OpenRouter fees (5.5%), BYOK 5%, price parity, logging policy.
- [S61] https://platform.claude.com/docs/en/api/rate-limits · tiers, spend caps, ITPM/OTPM, Claude Platform on AWS limit handling.
- [S62] https://opentelemetry.io/docs/specs/semconv/gen-ai/ · GenAI conventions relocated; section index.
- [S63] https://github.com/open-telemetry/semantic-conventions-genai · GenAI conventions repo (development status; Anthropic/Bedrock sections listed).
- [S64] https://langfuse.com/pricing · Langfuse cloud tiers, self-host, SDKs/OTel.
- [S65] https://www.braintrust.dev/pricing · Braintrust tiers.
- [S66] https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan · shared plan limits; no third-party guidance (thin).
- [S67] https://code.claude.com/docs/en/sandboxing · Claude Code Bash sandbox (macOS Seatbelt, Linux bubblewrap), read via grep of the saved page.

Fetch failures this session (not cited): `openai.com/policies/terms-of-use`, `openai.com/policies/row-terms-of-use`, `openai.com/policies/usage-policies` (403); `code.claude.com/docs/en/agent-sdk/sandbox` (404); `help.openai.com/.../using-codex-with-your-chatgpt-plan` (403); `github.com/.../gen-ai-spans.md` (404); `developers.cloudflare.com/containers/limits/` (404).

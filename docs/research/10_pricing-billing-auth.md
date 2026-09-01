# Pricing, billing stack, auth, and cost modeling for Rhema

- Scope: ledger rows L1–L9, C14, D12 (data needs), A7 (cost envelope), G10 (model routing input), T7 · Date: 2026-08-27 · Sources fetched: 41 (32 primary pages read; 9 secondary/aggregator, labeled)

## Executive summary (≤ 300 words, decisions-first)

1. **Pricing model (L3, Q-5, T7 confirmed):** subscription tiers with *dollar-denominated credits* ("1 credit = $0.01 of Rhema usage"), included monthly credits ≈ the tier price, pay-as-you-go top-ups, and a **firm pre-run estimate with a price cap**. Tiers: Free trial (600 credits, no card), **Pro $20/mo** (2,000 credits), **Max $100/mo** (12,000), **Max $200/mo** (26,000), **Team $40/seat** (pooled 4,000/seat). Credits roll over one month (Bolt/Lovable norm). Usage is rated at list API cost × **1.4** and converted to credits; the sensitivity table (§5.6) shows 52% blended gross margin at 60% credit utilization, 24% at 100%.
2. **What a credit is:** not an abstract unit (Devin ACU, Lovable, Sudowrite) but a cent of metered usage, displayed as credits *and* dollars, with per-model multipliers visible. Every complaint cluster we found (Cursor June-2025, Replit Agent 3, Lovable) is about *unpredictability and surprise charges*, not about paying for usage per se.
3. **Cost model (C14, A7):** a parametric model calibrated to Q-10 ($50–100/run at 15k words / 70 citations on Fable 5) reproduces $49 / $69 / $53 for draft / review / respond. Cost is **~75% cache-read (context re-sent per tool turn)**, not output; it scales roughly linearly in citations and words, and drops 2× on Opus 5, ~4.7× on Sonnet 5. A 2k-word blog loop (draft+review+respond) costs $4.29 (Sonnet 5) to $19 (Fable 5); an 8k academic paper loop $19–$88.
4. **Billing stack (L2):** Stripe Billing + Checkout + Customer Portal + Stripe Tax for money movement; **an in-house append-only credit ledger in Postgres** for real-time burndown. Not Stripe Meters (invoice-time reconciliation only; Stripe now steers new usage-based integrations to Metronome), not Metronome/Orb at MVP (0.8% of billings + $0.04/1k events; opaque custom pricing). Lago is the self-host fallback when enterprise contracts arrive.
5. **Auth (L1):** **Better Auth** (TypeScript, self-hosted on Postgres in AWS, $0/MAU; Auth.js has merged into it) with WorkOS SSO ($125/connection) added when the first enterprise asks. Clerk rejected on cost-at-scale and lock-in; Cognito on DX; Supabase Auth on stack coupling.
6. **BYO-key (L7, Q-4):** offer on paid tiers from v1.1, charging 15% of list-equivalent usage as "platform credits" (min 10/run) to cover sandbox, search, and harness costs.

## 1. Method and rigor notes

Every product fact below carries the URL read this session (2026-08-27). Pages that returned 403/429 are noted and replaced with labeled secondary sources (ChatGPT plans, Perplexity, Devin ACU pricing). The cost model is a *parametric estimate* calibrated to one operator data point (Q-10); its shape parameters are stated so the synthesis agent can re-tune when real run telemetry exists (A7).

Terminology: *Observed* = read on the page; *Inferred* = my reasoning; *Recommendation* = a choice with rejected alternatives.

## 2. Industry survey: how comparable products price AI usage

### 2.1 Coding-agent IDEs and harnesses (the ⚑ inspiration set)

| Product | Tiers & price | Included usage | Unit | Overage | Annual | Team | Source |
|---|---|---|---|---|---|---|---|
| **Cursor** | Hobby $0; Pro $20; Pro+ $60 ("3× Pro limits"); Ultra $200 ("20× Pro"); Teams $40/user; Enterprise custom | Two pools: "Cursor Models" and "Other Models"; usage "charged at the model's API price"; third-party models add "a Cursor Token Rate of $0.25 per million tokens" | dollars at API list rates | "Add on-demand usage: continue at the same API rates with pay-as-you-go billing"; "billed monthly" | not shown | $40/user Standard; Premium "5× Standard" | [1][2] |
| **Devin / Windsurf → Devin Desktop** | Core $20 (PAYG, ACU $2.25); Team $500/mo (250 ACU, extra $2.00); Enterprise custom. Windsurf (rebranded Devin Desktop June 2026) replaced credits with **daily+weekly quotas** on 2026-03-19: Free, Pro $20, Max $200, Teams $40 | ACU = "normalized measure of the compute Devin uses — VM time, model inference and bandwidth… roughly 15 minutes of active work" | abstract (ACU) / quotas | per-ACU | n/a | $500 flat pool | [3] (secondary: devin.ai 429'd twice; windsurf.com/pricing 308→devin.ai) |
| **ChatGPT / Codex** | Free $0; Go $8; Plus $20; Pro $100 (5× Plus) and $200 (20× Plus); Business $20/seat annual, $25 monthly (2-seat min; cut from $25/$30 on 2026-04-02) | multiplier-of-Plus limits; Pro $200 ≈ "250 Deep Research tasks" | opaque message/task caps | none (hard caps) | Business only | Business/Enterprise | [4] (secondary: openai.com and help.openai.com 403'd) |
| **Claude + Claude Code** | Free; Pro $20 ($17 annual, $200 up front); Max "from $100" (5× or 20× Pro); Team Standard $20 annual/$25 monthly, Premium $100/$125 ("5× more usage"); Enterprise "seat price + usage at API rates" | Pro/Max limits "shared across Claude and Claude Code"; rolling 5-hour window + weekly window (Team/Enterprise doc) | opaque usage bars (% of window) | **Usage credits "billed at standard API rates"**, prepaid ("Add funds"), monthly spend cap, auto-reload, "$2000" daily redemption max | Pro $17 vs $20 | seats | [5][6][7][8] |
| **GitHub Copilot** | Free; Pro $10; Pro+ $39; Max $100; Business $19/seat; Enterprise $39/seat | "1 AI credit = $0.01 USD"; Pro "$15 monthly total credits" (incl. "$5 flex allotment"); Pro+ $70 ($31 flex); Max $200 ($100 flex); Business 1,900 credits; Enterprise 3,900. Legacy: Pro 300 premium requests, Pro+ 1,500 | **cents** (and legacy "premium requests" with model multipliers; code review "13 premium requests") | "$0.04/request" legacy; budget control; "Unused requests… do not carry over" | n/a | per seat | [9][10][11] |
| **Lovable** | Free (5 build credits/day, ≤30/mo); Pro; Business (prices not rendered) | "Credits are units Lovable uses to measure and pay for usage"; examples 0.5–1.7 credits/task; monthly credits "expire two (2) months after they're issued"; top-ups last 12 months | abstract credit | top-up packs | yes (annual credits) | "priced by the credits they include, not by seats" | [12] |
| **v0 (Vercel)** | Free $0 ($5 credits); Plus $30/user ($30 credits + "$2 of free daily credits on login"); Business $100/user ($30 credits); Enterprise | **dollars**; token prices per model tier published (v0 Mini $0.20/$1.20 per MTok … v0 Max $5/$25) | dollars | "Purchase additional credits… shared across your team" | not shown | per user | [13] |
| **Bolt** | Free (300K tokens/day, 1M/mo); Pro $25 ("Start at 10M tokens per month"); Teams $30/member; Enterprise | **raw tokens**; paid tokens "roll over for one additional month… valid for up to two months" | tokens | reloads (price not shown) | "Save up to 28%" | per member, no pooling | [14] |
| **Replit** | Starter free; Core $20 ($17 annual, "$20 towards most powerful models"); Pro $100 ($95 annual, "$100 towards…"); Enterprise | dollars; Agent billed per *effort-based checkpoint* (replaced flat "$0.25 per checkpoint" July 2025) | dollars / per-checkpoint | usage billing | "Up to 15% off" | 2 vs 10 parallel agents | [15][16] |

### 2.2 Writing and research products

| Product | Tiers & price | Included usage | Unit | Source |
|---|---|---|---|---|
| **Lex** | Pro (monthly option), Teams add-on; prices not on FAQ page; 30-day refund promise ("If you don't love Lex after a month… refund") | premium models "GPT 4.1 and Claude 4 Opus & Sonnet" | opaque | [17] |
| **Sudowrite** | Hobby $10 (225,000 credits/mo); Professional $22 (450,000/mo); Max $44 (2,000,000/mo, "rollover for 12 months"); "Up to 50% off" annual | abstract credits (undefined on page) | abstract | [18] |
| **Jasper** | Pro $69 ($59 annual, "Save ~20%"), 1 seat; Business custom, 12-month min; 7-day trial | no usage limits shown | seat | [19] |
| **Grammarly** | Free (100 AI prompts); Pro $12 (2,000 AI prompts/member/mo); Enterprise unlimited | prompts | count | [20] |
| **Perplexity** | Pro ~$20; Max $200/mo or $2,000/yr; Max "10,000 monthly Computer credits" | credits + searches | mixed | [21] (secondary; perplexity.ai 403'd) |
| **Elicit** | Basic free; Pro $49/user/mo or $588/yr (35% off); Scale $169 or $2,028/yr (39% off), "5× usage"; Enterprise | "Standard usage" / "5× usage"; caps on papers screened (5,000 / 40,000), columns, sources | multiplier-of-standard | [22] |

### 2.3 API list prices used in the cost model (all primary, 2026-08-27)

| Provider / model | Input | Cache write (5m) | Cache read | Output | Search | Source |
|---|---|---|---|---|---|---|
| Anthropic Fable 5 | $10 | $12.50 | $1.00 | $50 | $10/1k searches; web fetch free | [23] |
| Anthropic Opus 5 / 4.8 | $5 | $6.25 | $0.50 | $25 | same | [23] |
| Anthropic Sonnet 5 | $2 | $2.50 | $0.20 | $10 (introductory price now permanent per note on page) | same | [23] |
| Anthropic Sonnet 4.6 | $3 | $3.75 | $0.30 | $15 | same | [23] |
| Anthropic Haiku 4.5 | $1 | $1.25 | $0.10 | $5 | same | [23] |
| OpenAI gpt-5.6-sol / terra / luna | $4 / $2 / $0.20 | — | $0.40 / $0.20 / $0.02 | $20 / $12 / $1.20 | "$10.00 / 1k calls + search content tokens" | [24] |
| OpenAI gpt-5.5 / 5.4 | $5 / $2.50 | — | $0.50 / $0.25 | $30 / $15 | same | [24] |
| Google Gemini 3.7 Flash | $0.75 (→$1.50 on 2027-01-01) | — | $0.075 | $3.75 (→$7.50) | Grounding "$14 per 1,000 requests" after 5,000 free/mo | [25] |
| Google Gemini 3.1 Pro | $2 (>200k: $4) | — | $0.20 | $12 (>200k: $18) | same | [26] (secondary; ai.google.dev page lists only Flash/2.5 rows) |

Other pricing facts that matter for the model: Anthropic batch = 50% off, 1M context at flat rate, **tokenizer for Claude 4.7+ produces "approximately 30% more tokens for the same text"** [23]; Managed Agents session runtime $0.08/hour [23]; Claude Code enterprise average "$13 per developer per active day and $150-250 per developer per month… below $30 per active day for 90% of users" [8]; Anthropic's own marketplace unit is the **CCU: "100 CCU represents $1.00 USD"** [23] — a cent-denominated credit, the same convention as Copilot's "1 AI credit = $0.01".

### 2.4 Observed industry-norm patterns

*Observed*

1. **The $20 / $100 / $200 price ladder is universal** (Cursor, ChatGPT, Claude, Replit, Windsurf/Devin Desktop, Perplexity Max, Copilot Max). Team seats cluster at $40 (Cursor, Windsurf) or $20–25 (Claude, ChatGPT Business).
2. **Included usage ≈ subscription price at nominal rates** (Cursor $20→$20 at API rates; Replit $20→$20; v0 $30→$30; Copilot $10→$15 incl. $5 "flex"). Margin comes from hidden rate markups (Cursor's $0.25/MTok "Cursor Token Rate"), from cheaper in-house/"Auto" models, and from breakage.
3. **Three unit families:** (a) *dollars at API rates* — Cursor, v0, Replit, Claude extra usage, Copilot's cent-credit; (b) *abstract credits* — Devin ACU, Lovable, Sudowrite, Perplexity "Computer credits"; (c) *opaque multiplier caps* — ChatGPT/Claude "5×/20× Plus", Elicit "5× usage", Windsurf's 2026 daily+weekly quotas. The trend in 2025–26 moved from (b) toward (a) (Copilot: requests → cents; Cursor: requests → dollars) and from (b) toward (c) for consumer chat (Windsurf: credits → quotas).
4. **Rollover is now the norm for paid credits** (Bolt 1 extra month; Lovable 2 months; Sudowrite 12 months); **Copilot and ChatGPT do not roll over**.
5. **Overage is opt-in, prepaid, capped**: Claude's usage credits are prepaid with a monthly spend cap and $2,000/day ceiling; Copilot has a budget setting; Cursor requires enabling on-demand usage.
6. **Annual discounts are 15–20%** (Claude $17 vs $20; Replit 15%; Jasper ~20%; Bolt up to 28%; Elicit 35–39% is the outlier).
7. **Usage display:** Cursor exposes per-request model/token/cost tables; Claude shows percentage bars per 5-hour and weekly window and hides dollars unless usage credits are on; Copilot shows a credit count; Replit shows a dollar figure per checkpoint; Claude Code's `/usage` attributes spend "to skills, subagents, plugins, and individual MCP servers, each shown as a percentage" [8] — the closest analogue to Rhema's phase/role attribution (L4).

### 2.5 What customers complain about (secondary sources, labeled)

- **Cursor, June 16 – July 4, 2025** (primary post-mortem [27], TechCrunch [28]): Pro changed from "500 fast responses" to "$20 in monthly API-rate billing"; "unlimited" applied only to Auto mode; users "ran out… after just a few prompts when using Anthropic's new Claude models" and were "unexpectedly charged" because they "hadn't set spending limits". Cursor: "Our recent pricing changes… were not communicated clearly, and we take full responsibility"; full refunds for the window. *Lesson: the unit change was fine; the failure was (i) no visible burn rate for expensive models, (ii) overage on by default, (iii) ambiguous "unlimited".*
- **Replit Agent 3, September 2025** (The Register [29], primary blog [16]): effort-based checkpoints replaced flat $0.25; users reported "$1,000 in a week" vs "$180-200 monthly" and "$70 in one night". Recurrent complaint: "You do not know the cost until after the task runs. The Agent decides the effort, so you cannot see a price before committing… charging for failed attempts." *Lesson: agentic runs need a pre-run estimate, a cap, and refunds on failure.*
- **Claude weekly limits, August 28, 2025** (aggregators [30]): weekly caps introduced for "<5% of subscribers"; later relaxed (5-hour limits doubled 2026-05-06; weekly run 50% above published since 2026-05-13). A July 2026 incident: "$100 Fable 5 credits… quietly enabled usage credits for many Pro users, who were then billed past their plan limits instead of being rate-limited" [30]. *Lesson: never flip a user from "rate-limited" to "billed" silently.*
- **Lovable** (dev.to [31]): credits "disappear", "hard to plan your budget". *Lesson: abstract credits without a visible exchange rate breed distrust.*

**Rhema analogue (all four):** Rhema's runs are *longer and more expensive* than a coding prompt ($5–$100 each), so surprise is proportionally worse. The design must front-load the price (estimate + cap), keep the unit legible (cents), and default overage to *off*.

## 3. Pricing literature: hybrids, credits vs dollars, value metrics

*Observed* (Growth Unhinged 2025 survey, primary [32]): flat-fee fell 29%→22%, seat-based 21%→15%, **hybrid rose 27%→41%** in twelve months; "internal costs and margins" is the top factor cited for pricing AI capabilities; only 5% use outcome-based pricing today, 25% expect to by 2028. Aggregator summaries of Poyar's 2026 survey (secondary [33]) put hybrid at 37–41% and credit-based adoption "growing 126% year over year"; Poyar frames credits as "sitting in the middle of the spectrum between charging for access and charging for outcomes… a unit the buyer can budget". Margin benchmarks (secondary [34]): ICONIQ's Jan-2026 average AI product gross margin 52% (41% in 2024, 45% in 2025); AI-native companies target 50–60% vs 80–90% for classic SaaS.

*Inferred* — three design principles for Rhema:

1. **Hybrid is the default, not a choice.** Subscription for predictability and identity (a writer "has a Rhema plan"), metered credits because per-run COGS spans 20× between a Sonnet blog review and a Fable dissertation chapter.
2. **Value metric ≠ cost metric, but they must be *legibly linked*.** The buyer's value metric is "pieces taken through a round" (draft, review, response). The cost driver is tokens × model. The credit must be the bridge: quoted per run in the buyer's terms ("review of this 5,200-word draft ≈ 560 credits ≈ $5.60"), rated internally in tokens.
3. **Cent-credits beat abstract credits.** Copilot and Anthropic's CCU both settled on $0.01. The abstract-credit advantage (hiding provider price changes and markups) is real but is exactly what Lovable/Sudowrite users resent; the dollar-metering advantage (auditability) is what Cursor/Claude users accept. A cent-credit with a published per-model multiplier retains both: the markup is a *published* rate table, and provider price changes propagate as rate-table versions with notice.

## 4. Cost model (C14, A7, G10)

### 4.1 Structure

A run is an agentic loop of *T* turns. Per turn the harness re-sends the whole context (skill files + draft + accumulated tool results), almost all of it as **cache reads** at 0.1× input price; new material (tool results, model output) is written once as **cache writes** at 1.25×; the model emits **output** (text + thinking); each **web search** costs $10/1k (web fetch free, but fetched pages become input tokens, ~2,500 tokens per 10 kB page [23]).

Parameters (per workflow): searches `S = s0 + sPer·C`; fetches `F = f0 + fPer·C`; fetch size 6k tokens (assumes `max_content_tokens` cap); turns `T = turns0 + 0.7·(S+F)` (0.7 = parallel tool calls); base context `B = 25k + 1.75·W` (skills/system + draft; 1.75 tok/word for the 4.7+ tokenizer, 1.35 for Sonnet 4.6-era); average context `min(B + R/2, 300k)` where `R = 6k·F` (300k = assumed compaction/context-editing ceiling); cache reads `T·avgCtx`; cache writes `B·rereads + R + outText` (rereads = subagents that reload the draft: second read, fact-check, gap analysis); output `outText·(1+think)` with `think` = thinking multiplier. Per-workflow shapes:

| Workflow | s0 | sPer | f0 | fPer | turns0 | outWords(W,C) | think | rereads |
|---|---|---|---|---|---|---|---|---|
| draft-from-outline | 15 | 0.9 | 8 | 0.9 | 25 | 1.6·W + 40·C | 2.0 | 2 |
| editorial-review | 20 | 1.4 | 10 | 1.2 | 30 | 0.9·W + 60·C | 2.5 | 3 |
| respond-to-review | 12 | 0.9 | 8 | 0.9 | 40 | 1.4·W + 50·C | 2.2 | 3 |
| bootstrap-persona (W = corpus words) | 5 | 0 | 0 | 0 | 25 | 0.25·W + 4,000 | 2.0 | 2 |
| research chat (one deep-research turn batch) | 8 | 0 | 6 | 0 | 12 | 1,500 | 1.5 | 1 |

### 4.2 Calibration against Q-10 (15,000 words, 70 citations, Fable 5)

| Workflow | Model cost | of which cache read | cache write | output | search | turns | output tokens |
|---|---|---|---|---|---|---|---|
| draft-from-outline | **$49.18** | $34.17 | $7.19 | $7.03 | $0.78 | 129 | 141k |
| editorial-review | **$69.48** | $53.52 | $9.36 | $5.42 | $1.18 | 178 | 108k |
| respond-to-review | **$52.97** | $37.58 | $7.78 | $6.86 | $0.75 | 142 | 137k |

All three land inside the operator's $50–100 band without forcing (respond was tuned up once from $33 because it re-verifies load-bearing findings). Full loop ≈ **$172 on Fable 5**.

*Key structural finding:* **~75% of cost is cache-read of re-sent context**, not generation (review 8k/45: read 74.8%, write 15.8%, output 7.4%, search 2.0%). Sensitivity to the context ceiling: review 15k/70 costs $42.7 / $69.5 / $75.4 at a 150k / 300k / 600k ceiling. **Implication for G-rows:** aggressive context editing (`clear_tool_uses`), subagent isolation of fetch-heavy phases, and 1-hour cache TTL are worth more than model downgrades for a given quality bar; a harness that keeps 600k of tool results in context pays 1.8× a harness that compacts at 150k.

### 4.3 Cost curves (editorial-review, $ at list, by model)

| Words / citations | Fable 5 | Opus 5 | Sonnet 5 | GPT-5.6 sol | Gemini 3.1 Pro |
|---|---|---|---|---|---|
| 2,000 / 5 | 7.83 | 4.05 | 1.78 | 3.03 | 1.78 |
| 2,000 / 15 | 13.27 | 6.84 | 2.98 | 5.20 | 2.99 |
| 5,000 / 15 | 14.77 | 7.59 | 3.28 | 5.66 | 3.25 |
| 5,000 / 30 | 25.54 | 13.08 | 5.60 | 9.94 | 5.59 |
| 8,000 / 40 | 36.09 | 18.43 | 7.83 | 13.99 | 7.77 |
| 8,000 / 60 | 57.85 | 29.45 | 12.40 | 22.64 | 12.36 |
| 15,000 / 70 | 69.48 | 35.33 | 14.84 | 27.23 | 14.85 |
| 15,000 / 120 | 102.96 | 52.42 | 22.10 | 40.60 | 22.20 |
| 25,000 / 150 | 126.66 | 64.48 | 27.17 | 49.72 | 27.24 |

Research intensity alone (5k essay, review): C = 0 / 10 / 20 / 40 / 80 → Fable $6.94 / 11.83 / 18.03 / 34.36 / 72.57; Sonnet 5 $1.55 / 2.64 / 3.99 / 7.48 / 15.57. **Citation count is the stronger driver than length** once W > 5k: each verified claim costs ≈ $0.80 (Fable) / $0.17 (Sonnet). Opting out of fact-check (review 8k/45, Fable) drops cost from $41.04 to $8.29 — the skill's "proportional rigor" opt-outs are the user's biggest price lever and must be surfaced in the estimate UI (K4, D12).

### 4.4 Typical runs (list-price COGS, $)

| Piece | Model | draft | review | respond | full loop |
|---|---|---|---|---|---|
| 2k blog, 5 cites | Sonnet 5 | 1.34 | 1.78 | 1.17 | **4.29** |
| | Opus 5 | 3.07 | 4.05 | 2.72 | 9.84 |
| | Fable 5 | 5.94 | 7.83 | 5.31 | 19.08 |
| 5k essay, 20 cites | Sonnet 5 | 2.87 | 3.99 | 2.24 | **9.11** |
| | Opus 5 | 6.68 | 9.26 | 5.28 | 21.22 |
| | Fable 5 | 13.04 | 18.03 | 10.34 | 41.41 |
| 8k academic, 45 cites | Sonnet 5 | 5.92 | 8.87 | 4.15 | **18.94** |
| | Opus 5 | 13.96 | 20.94 | 9.82 | 44.71 |
| | Fable 5 | 27.36 | 41.04 | 19.27 | 87.67 |
| 15k academic, 70 cites | Sonnet 5 | 10.46 | 14.84 | 7.01 | 32.31 |
| | Opus 5 | 24.98 | 35.33 | 16.74 | 77.05 |
| | Fable 5 | 49.18 | 69.48 | 52.97 | 171.63 |

Bootstrap-persona (corpus 20k / 50k / 100k words): Fable $5.82 / 10.76 / 19.00; Opus $2.93 / 5.41 / 9.52; Sonnet $1.20 / 2.19 / 3.84. One deep-research chat batch (≈8 searches, 6 fetches): $2.44 / $1.26 / $0.55. Anthropic Managed Agents runtime would add $0.08/session-hour [23] — negligible (<1% of a run).

### 4.5 Model-routing implication (G10)

Per-phase routing is where the cost model pays out: the fact-check ledger and discourse map are fetch-heavy, judgment-light phases; running them on Sonnet 5 while keeping intake, argument critique, editor's letter, and the second read on Opus/Fable cuts review cost by ~50–60% (fact-check ≈ 80% of review turns) with the frontier model still authoring every verdict the user reads. The curated model menu (Q-4) should therefore be **three quality tiers, not a raw model list**: *Standard* (Sonnet 5 everywhere), *Pro* (Opus 5 judgment / Sonnet 5 research), *Frontier* (Fable 5 judgment / Opus 5 research), with credit multipliers ≈ 1× / 2.2× / 4.5× shown on the price card.

## 5. Recommended pricing (L3, L6, L7, D12)

### 5.1 The credit

**Recommendation:** `1 credit = $0.01 of Rhema usage`. Rhema usage for a run = (provider list cost of every token and search in the run) × **1.4** platform rate, rounded up to the credit. The 1.4 is published in the docs as "Rhema rates are provider list rates plus 40% for hosting, research tooling, and the editorial harness." Rate tables are versioned; changes take effect with 30 days' notice (the Cursor lesson [27]).

*Rejected:* (a) **abstract credits** (Devin ACU / Lovable) — hide markup but breed the "credits disappear" complaint and make the pre-run estimate un-auditable; (b) **raw tokens** (Bolt) — meaningless to writers; (c) **runs as the unit** (flat per-workflow price) — variance of 20× within a workflow (§4.3) makes a flat price either unprofitable or punitive; retained only as the *price-card format* (§5.4); (d) **dollars with zero markup** (Cursor Pro) — leaves margin to breakage alone, which the sensitivity table shows is negative at full utilization.

### 5.2 Tiers

| Tier | Price | Included credits / mo | Model access | Concurrency | Rollover | Overage | Notes |
|---|---|---|---|---|---|---|---|
| **Trial** | $0, no card | 600 one-time (expire 14 days) | Standard only | 1 run | — | none | ≈ one 2k-blog full loop or one 5k-essay review on Standard (§4.4 ×1.4). 1 project, 1 persona, exports watermark-free (prose can't be watermarked; limit exports to md/txt on trial). |
| **Pro** | $20/mo · $17/mo annual | 2,000 | Standard + Pro; Frontier at 4.5× | 2 runs | 1 month (max balance 2× monthly) | opt-in top-ups | The Cursor/Replit/Claude anchor. Covers ≈ 3 essay loops/mo on Standard, ≈ 1.4 on Pro tier. |
| **Max 5×** | $100/mo · $85 annual | 12,000 (20% bonus) | all incl. Frontier | 5 runs | 1 month | opt-in | ≈ one 8k academic loop on Frontier (12,300 cr) or four on Pro tier. Priority queue. |
| **Max 20×** | $200/mo · $170 annual | 26,000 (30% bonus) | all | 8 runs | 1 month | opt-in | ≈ one 15k/70-cite Frontier loop (24,000 cr). |
| **Team** | $40/seat/mo | 4,000/seat, pooled | all | 3/seat | 1 month | admin-controlled | Databricks-style roles (Q-6); centralized billing; per-member caps. |
| **Top-up packs** | $10 → 1,000; $50 → 5,250 (5% bonus); $200 → 22,000 (10% bonus) | expire 12 months | | | | | Prepaid only (Claude's model [7]); never post-paid on card by default. |

*Inferred rationale:* The included-credits ≈ price convention (§2.4 #2) is kept at Pro (buyer parity with Cursor/Replit) and sweetened upward at Max (Copilot Max gives $200 credits for $100 — but with a $100 "flex" overage that is billed; we keep it prepaid). Bonus credits at higher tiers are cheaper than discounts because they are consumed at 1.4× markup and subject to breakage.

### 5.3 Margin model and sensitivity (target gross margin)

Fees assumed 5% of revenue (Stripe card 2.9% + $0.30 [35], Billing 0.7% [35], Tax 0.5% [36], plus dunning/refund slack). Gross margin on **Pro** as a function of platform rate *m* and credit utilization *u* (share of included credits consumed):

| rate \ utilization | 40% | 60% | 80% | 100% |
|---|---|---|---|---|
| 1.0× (Cursor-style parity) | 55% | 35% | 15% | **−5%** |
| 1.25× | 63% | 47% | 31% | 15% |
| **1.4× (recommended)** | 66% | **52%** | 38% | 24% |
| 1.6× | 70% | 57% | 45% | 33% |
| 2.0× | 75% | 65% | 55% | 45% |

Overage/top-up gross margin by rate: 1.0× −5%, 1.25× 15%, **1.4× 24%**, 1.6× 33%, 2.0× 45%.

*Recommendation:* target **blended gross margin ≥ 50%** (ICONIQ 2026 average 52% [34]) via 1.4× and an expected utilization of 55–65% (Cursor: "the vast majority of Pro users do not run out" [28]). Guardrails: if measured utilization on Pro exceeds 80% for two months, raise Pro's included credits' *effective* cost by moving the Standard tier to per-phase routing (§4.5) before touching the rate. Not included in gross margin: sandbox compute (Managed Agents at $0.08/h ≈ 0.3% of a run) and storage — both < 2% of revenue at this scale.

### 5.4 Per-workflow price cards (what the plan page and the pre-run dialog show)

Credits (list × 1.4), rounded; "Standard / Pro / Frontier" quality tiers approximated by Sonnet 5 / Opus 5 / Fable 5 (per-phase routing will land Pro and Frontier ~20–30% lower than shown):

| Piece | Draft from outline | Editorial review (full board) | Respond to review | Full round |
|---|---|---|---|---|
| Blog post, ~2k words, ~5 claims | 190 / 430 / 830 | 250 / 570 / 1,100 | 220 / 510 / 990 | **650 / 1,500 / 2,900** |
| Essay, ~5k words, ~20 claims | 400 / 940 / 1,830 | 560 / 1,300 / 2,520 | 450 / 1,060 / 2,070 | **1,410 / 3,290 / 6,420** |
| Academic paper, ~8k words, ~45 claims | 830 / 1,950 / 3,830 | 1,240 / 2,930 / 5,750 | 900 / 2,140 / 4,220 | **2,970 / 7,030 / 13,790** |
| Long paper, ~15k words, ~70 claims | 1,460 / 3,500 / 6,890 | 2,080 / 4,950 / 9,730 | 1,570 / 3,760 / 7,420 | **5,110 / 12,200 / 24,030** |
| Persona bootstrap, 50k-word corpus | 310 / 760 / 1,510 | | | |
| Review, fact-check off (8k paper) | | 330 / 780 / 1,160 | | |

Price cards on the marketing page show *ranges* ("Essay review: 550–2,500 credits depending on quality tier and research depth"); the in-app estimate shows a *point estimate and a cap*.

### 5.5 Estimates, consent thresholds, caps (L6, K4, D12)

*Recommendation:*

1. **Every run shows an estimate before start** computed from the model in §4 with the piece's actual word count and a claim count from a cheap Haiku pass over the draft (≈ 5 credits). Displayed as "≈ 1,240 credits ($12.40) · cap 1,860" plus the three levers: quality tier, fact-check on/off, discourse map on/off, second read on/off.
2. **Price cap = 1.5× estimate, guaranteed.** If a run exceeds the cap, Rhema absorbs the difference (the harness also receives the cap as a task budget and finishes gracefully). This is the direct answer to the Replit complaint ("cannot see a price before committing") and is cheap: the model's variance is mostly in citation count, which the estimate already sees.
3. **Consent gate** (Q-7 gates on by default): explicit confirm when estimate > 500 credits *or* > 25% of remaining balance; one-click "don't ask under 1,000 credits" per user.
4. **Budget caps:** per-project monthly cap (default: none on Pro, admin-set on Team), per-run hard cap (the price cap), account monthly spend cap on top-ups (default $0 — overage off, the Cursor/Claude lesson), soft alerts at 50/80/100% of included credits (in-app + email).
5. **Insufficient balance:** if balance < cap, offer (a) switch to Standard tier, (b) turn off a phase, (c) top up — never silently bill.
6. **Rate limits** are concurrency-based (§5.2), not request-based; a daily ceiling of 40 runs/account on Pro exists only as a fraud tripwire.

### 5.6 BYO-key mode economics (L7, Q-4)

*Observed:* Cursor charges "$0.25 per million tokens" on top of third-party API rates [2]; Claude enterprise is "seat price + usage at API rates" [5]; Anthropic's Managed Agents session runtime is $0.08/h [23].

*Recommendation:* offer BYO keys (Anthropic, OpenAI, Google) on all paid tiers from v1.1, not MVP. When a run uses the user's key: inference and provider web search are billed by the provider; Rhema meters the same usage and charges **platform credits at 15% of the list-rate equivalent (min 10 credits/run)**, covering sandbox/runtime, persistence, and the harness. On an 8k-paper Frontier loop that is ≈ 1,840 credits vs 13,790 — a 7.5× cheaper path that keeps a ~85% margin on what Rhema does bill. Support cost is bounded by surfacing provider errors verbatim (rate limits, insufficient funds) and disabling estimates' cap guarantee in BYO mode (we cannot absorb someone else's bill). *Rejected:* free BYO (cannibalizes Max entirely; sandbox costs uncovered); BYO-only (Q-4 says platform-billed is primary).

### 5.7 Trial allowance and conversion mechanics (L8)

600 credits (≈ $4.30 COGS at list, $0 fees) is enough for one complete Standard-tier loop on a blog post — the "aha" is seeing the review dossier with quoted findings and verified claims (T2). Daily-grant models (Lovable 5/day, v0 $2/day on login) are rejected for MVP: they optimize habitual return for builders, whereas a writer's cadence is per piece. Revisit if activation data shows abandonment before the first review.

## 6. Billing stack (L2, Q-3)

### 6.1 Options and cost at scale

Assume $100k MRR (≈ 4,000 Pro-equivalents), ~2M usage events/month (≈ 500 API calls per run × 4,000 runs).

| Stack | Monthly cost at $100k MRR | Real-time credit burndown | Control / lock-in | Verdict |
|---|---|---|---|---|
| **Stripe Billing (subscriptions) + Checkout + Portal + Stripe Tax + own ledger** | Payments 2.9% + $0.30 ≈ $3,200; Billing 0.7% = $700 (or $620/mo Starter plan) [35]; Tax Basic 0.5% = $500 or $0.50/txn API [36] → **≈ $4,400** | yes (own ledger) | Own the ledger; Stripe only moves money. Meters still usable for invoice-time reconciliation ("up to 100M events per month included" [35]) | **Recommended** |
| Stripe Billing + **Meters** for usage | same + $0 | **no** — "Credits are only reconciled at invoice time. Customers can exceed their balance during the cycle" [37]; Stripe: "Unless you're maintaining an existing Billing Meters integration, use Metronome" [38] | medium | Rejected for prepaid credits |
| Stripe + **Metronome** (now Stripe's "primary usage-based billing platform") | + "0.8%" of billing volume = $800 + "$0.04/1k ingest events" = $80 [39]; Checkout "Limited³" (custom API + webhooks), no Stripe Dashboard support [37] | yes ("real-time credit burndown") | vendor pricing, Checkout friction | Defer until enterprise contracts/commits/ramps are needed |
| **Orb** | custom; "based on two key metrics: billings and events" [40] | yes | opaque pricing — exactly Q-3's warning | Rejected |
| **Lago** (open source; cloud/self-host "Premium" undisclosed) [41] | $0 license self-hosted + ops (~1 small ECS/RDS footprint ≈ $150–300/mo) | yes | maximum control; extra service to run | Fallback when invoicing/contract complexity exceeds the in-house ledger |

### 6.2 Recommendation

- **Stripe Billing for subscriptions, Checkout for card capture, Customer Portal for plan changes/invoices, Stripe Tax for calculation and (later) filing; prepaid top-ups as one-time Checkout payments.** Stripe handles proration on tier changes; annual plans as Stripe prices.
- **Credits live in Rhema's Postgres as an append-only ledger** (§7). Stripe webhooks (`invoice.paid`, `checkout.session.completed`) create credit grants in *our* ledger; Stripe's Billing Credits object is *not* the source of truth (it applies "only at the time of finalization" and only to metered prices [37]).
- Reasons this satisfies Q-3: no percentage-of-revenue vendor besides Stripe itself; no Python; runs on AWS RDS; billing logic is TypeScript we own; flipping to Lago/Metronome later is a ledger export, not a rewrite.
- Costs to model in the spec: Stripe Tax registration thresholds (US economic nexus, EU OSS) — Tax Basic 0.5% only "where you're registered to collect taxes" [36]; register US + EU/UK at launch.

## 7. Usage attribution pipeline (L4, L5, D12)

*Recommendation (sketch, TypeScript-owned):*

1. **Capture.** Every provider call returns `usage` (`input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens`, `server_tool_use.web_search_requests`) [23]. The harness adapter emits one `usage_event` per call with: `event_id, ts, user_id, org_id, project_id, run_id, phase_id (intake|fact_check|discourse|second_read|argument|craft|letter|…), role (author|editor|researcher|persona|chat), agent_instance_id (main|subagent-n), provider, model, speed, inference_geo, tokens{…}, searches, fetches, rate_table_version`.
2. **Rate.** A versioned `rate_table` (provider list prices × cache multipliers × platform rate 1.4) rates the event to `list_cost_usd` and `credits` (ceil to 1 credit per *run*, not per event, to avoid rounding inflation).
3. **Ledger.** Append-only `credit_ledger` rows: `grant` (subscription cycle, top-up, promo, refund), `hold` (reservation of the run cap at start), `debit` (per event or per phase batch), `release` (unused hold at run end), `expire`. Balance = sum; a materialized `balance` per account is refreshed transactionally. Idempotency on `event_id`.
4. **Near-real-time meter.** Debits are written as events arrive (≤ 1 s lag); the run panel shows "spent so far / cap" via the run's event stream (no polling of the ledger). Per-phase and per-role rollups are `GROUP BY phase_id, role` on the run's events — no separate meter tables.
5. **Reconciliation.** Nightly job compares ledger `list_cost_usd` per model to the provider's usage/cost report (Anthropic Console usage page; Admin usage/cost API is "raw HTTP only" per the SDK docs) and alerts on > 2% drift; also drives the utilization metric that governs §5.3.
6. **Dashboard data contracts (D12).** Plan page: balance, included vs top-up, rollover expiring, next reset. Usage page: period selector; totals in credits *and* dollars; table by project → run → phase → role, each with credits, model tier, duration; a "why did this cost what it cost" explainer per run (claims verified × cost/claim, words, tier) — **tokens hidden behind an "advanced" disclosure** (L5 ⚑ "no token-soup"). Claude Code's `/usage` attribution list (skills/subagents as percentages) [8] is the precedent.
7. **Stripe sync.** Monthly: nothing to sync for included credits; top-ups are prepaid; Team invoices attach a CSV usage report generated from the ledger.

## 8. Refunds, abuse, trial abuse (L8)

*Observed norms:* no-card free tiers everywhere (Cursor, Lovable, v0, Bolt, Replit, Claude); Cursor refunded unexpected charges wholesale [27]; Lex offers a 30-day money-back promise [17]; Anthropic caps usage-credit redemption at $2,000/day [7].

*Recommendation:*

- **Failed or refused runs auto-refund** the debited credits (provider refusal, harness error, cap exceeded by our estimate error). Partial outputs stay available. This removes the Replit "charging for failed attempts" complaint at the ledger level.
- **Completed-run refunds** are discretionary, 7-day window, one per account per quarter without review; beyond that, support review. Subscription refunds: pro-rated on request within 14 days of first charge (EU consumer law requires a withdrawal right anyway).
- **Trial abuse:** no card, but require OAuth (Google/Apple) *or* verified email + phone; block disposable domains; device fingerprint + IP ASN scoring; one trial per fingerprint; trial runs Standard-only, 1 concurrent, no BYO, export limited. Trial credits expire in 14 days (Lovable daily grants "expire at the end of each day" [12]; Jasper 7-day trial [19]).
- **Payment abuse:** Stripe Radar rules; top-ups > $200/day require 3DS; new accounts' first-month top-ups capped at $100; chargeback → account suspension and ledger clawback (credits already consumed are a loss — hence prepaid-only).
- **Content abuse** (Q-11 posture): no persona ethics gating, but the AUP forbids using the platform to impersonate a living person for deception and requires rights in uploaded samples; enforcement is complaint-driven, not pre-emptive.

## 9. Auth provider evaluation (L1)

Cost at 10k / 100k / 1M MAU (computed from fetched price pages):

| Provider | Price basis | 10k MAU | 100k MAU | 1M MAU | Orgs / SSO | AWS fit & control | Source |
|---|---|---|---|---|---|---|---|
| **Better Auth** (OSS core; optional managed infra) | "free and open source"; managed Pro $20/mo; SSO/Directory "1 connection included, then $50/month per additional" | $0 | $0 | $0 (+ our Postgres) | orgs plugin; SSO via managed infra or own | Runs in our TypeScript backend on RDS; full control of the user table; Auth.js "is now part of Better Auth" | [42][43] |
| **Auth.js** | free OSS; library only, "now part of Better Auth" | $0 | $0 | $0 | DIY | same | [43] |
| **Clerk** | Free to 50,000 MRU; Pro $25/mo ($20 annual); "$0.02/mo each" beyond 50k (to $0.012 at 10M+); B2B auth add-on $100/mo; SAML "$75/mo each" beyond 1 | $0 | $25 + 50k×$0.02 = **$1,025** | ≈ **$19k/mo** before volume steps | add-ons | Hosted, best DX; hosted user store off-AWS | [44] |
| **WorkOS AuthKit** | "First 1M MAUs Free"; "$2,500/mo" per additional 1M; SSO/Directory "$125/ea" (1–15 connections) | $0 | $0 | $0 (next 1M $2,500) | $125/connection | Hosted; strong enterprise story; user store off-AWS | [45] |
| **Supabase Auth** | Pro $25/mo incl. 100,000 MAU, "$0.00325 per MAU" beyond; SSO "$0.015 per MAU" | $25 | $25 | ≈ $2,950 | yes | Couples us to Supabase Postgres (undecided, Q-3) | [46] |
| **Amazon Cognito** | Essentials: 10,000 MAU free, then "$0.015" per MAU; Lite from $0.0055; Plus $0.020; SAML/OIDC $0.015 | $0 | $1,350 | $14,850 | federation | Native AWS; weak DX/UI; Hosted UI limits | [47] |

*Recommendation:* **Better Auth**, self-hosted, email + Google + Apple at launch, organizations plugin for Team (Q-6 roles map to org roles), passkeys later; **WorkOS** SSO/Directory Sync bolted on per enterprise connection ($125/connection, passed through in Enterprise pricing). *Rejected:* Clerk — best DX but $1k–19k/month at scale and a hosted user store outside our AWS boundary (Q-3 bias); Cognito — AWS-native but per-MAU cost above 10k and poor developer/UX ergonomics; Supabase Auth — cheapest hosted, but it is a bet on Supabase for the whole data layer, which M1/M8 has not made; Auth.js — merged upstream. Risk with Better Auth: we own session security and email deliverability (SES) — acceptable for a TypeScript team, and it keeps the auth table next to the ledger for attribution joins (§7).

## 10. Minimal legal set (L9, Q-11, Q-12)

*Recommendation* (minimal, no ocean-boiling):

1. **Terms of Service** — account, plans, credits (credits are prepaid service, non-transferable, non-cash, expire per §5.2; Stripe's own rules forbid stored-value/gift-card semantics [37], so the ToS must say the same), price-change notice (30 days), refund policy (§8), acceptable use, termination.
2. **Content ownership** — user owns inputs (drafts, samples, outlines) and outputs (drafts, dossiers, personas); Rhema receives a limited license to host, process, and display them to the user and their collaborators; no publication rights (Q-9).
3. **Privacy policy** — data categories, processors (AWS, Stripe, model providers by name), retention (note: Fable 5 requires 30-day provider retention and is unavailable under zero-data-retention — disclose), export and deletion on request.
4. **Model-training posture (Q-12):** state that Rhema does not train models on user content and passes user content to model providers under those providers' commercial API terms; **do not** promise "never used for training" beyond what each provider's terms guarantee (not verified this session — flagged in §12). Offer a per-account "exclude from product analytics" toggle rather than a DPA at MVP.
5. **Persona / AUP note (Q-11):** one clause: users warrant they hold rights to uploaded samples and will not use personas to deceive as to authorship of a living person; `Mode` stays metadata.
6. **Tax:** Stripe Tax handles calculation; register where thresholds are crossed; VAT on B2C digital services in EU/UK from day one.
7. **DPA / SOC 2:** deferred to first Team/Enterprise customer; design logs and retention so it is possible.

## Rhema implications (numbered, tied to ledger rows / theses)

1. **T7 confirmed with a refinement (L3):** credit/usage metering under subscription tiers is the norm — but the winning *unit* is the cent-credit with published multipliers, not an abstract unit. Rhema should copy Copilot/CCU semantics, Claude's prepaid-only overage, and Bolt/Lovable rollover.
2. **The estimate-and-cap contract is the product differentiator (L6, K4, D12):** no competitor guarantees a price before an agentic run; Replit's backlash shows the demand. It costs Rhema ~1.5× variance headroom, which the cost model shows is affordable because citation count (the main driver) is observable pre-run.
3. **Cost is context re-reads, not output (C14 → G-rows):** compaction ceilings and subagent isolation are the primary margin levers; per-phase routing (Sonnet for research phases) halves review cost at the same author-facing quality — G10 should adopt a three-tier quality menu rather than a raw model list.
4. **Opt-out phases are price levers (K4, D12):** fact-check off cuts an 8k review 5×; the estimate dialog must expose the three heavyweight toggles with their credit deltas.
5. **Own the ledger, rent the payment rail (L2, M1):** Stripe Billing + Tax with an in-house Postgres ledger; no Metronome/Orb at MVP; Lago as the self-host fallback — consistent with Q-3.
6. **Better Auth + WorkOS-on-demand (L1, M1):** zero per-MAU cost, TypeScript, on-AWS user table, orgs for Q-6 roles.
7. **Free trial = one complete Standard-tier loop on a blog (L8, B3):** the activation moment is the dossier, so the trial must fund a full review, not just a chat.
8. **BYO keys at 15% platform rate from v1.1 (L7):** protects Max revenue while giving power academics an escape valve.
9. **Usage UI shows credits and dollars, phases and roles; tokens behind "advanced" (L5, D12):** matches Claude Code's attribution list and Cursor's per-request tables without token-soup.
10. **Never flip a user from limited to billed silently (L6, L8):** overage default off, prepaid top-ups only — the one lesson every 2025–26 backlash shares.

## Ledger updates

| Row | Proposed status | Evidence |
|---|---|---|
| L1 | done → decision proposed | §9: Better Auth self-hosted + WorkOS SSO; cost table at 10k/100k/1M MAU from [42]–[47] |
| L2 | done → decision proposed | §6: Stripe Billing/Checkout/Portal/Tax + in-house ledger; Meters/Metronome/Orb/Lago compared with fetched prices [35]–[41] |
| L3 | done → decision proposed (Q-5 answered) | §5: cent-credit, tiers, price cards, 1.4× rate, sensitivity table |
| L4 | done (sketch) | §7 pipeline and event schema |
| L5 | in-progress | §7.6 data contracts; "advanced" token disclosure policy — needs D12 design pass |
| L6 | done → decision proposed | §5.5 estimate + 1.5× cap, consent > 500 cr or > 25% balance, caps and alerts |
| L7 | done → decision proposed | §5.6 BYO at 15% platform credits from v1.1 |
| L8 | done → decision proposed | §8 refunds, trial, fraud controls |
| L9 | done (minimal) | §10 ToS/privacy/content/no-training posture per Q-12 |
| C14 | done (model v1) | §4 parametric model, calibrated to Q-10, curves and typical runs; parameters listed for re-tuning |
| A7 | in-progress | model exists; needs real telemetry (turn counts, tool-result sizes) from one instrumented Claude Code run |
| D12 | in-progress (data needs delivered) | §5.4 price cards, §5.5 dialog content, §7.6 dashboard contracts |
| G10 | input delivered | §4.5 three-tier quality menu and per-phase routing |

**New rows proposed:**

- **L10** — Rate-table governance: versioned provider list prices × platform rate; 30-day notice policy; automated diff against provider pricing pages. (P/A)
- **L11** — Estimate service: Haiku claim-count pre-pass, estimator calibrated from ledger telemetry, cap guarantee accounting (variance reserve). (A)
- **L12** — Context-cost budget per workflow (compaction ceiling, tool-result `max_content_tokens`, subagent isolation) as a first-class cost control with target $/run per tier. (A; links G-rows)
- **M10** — Stripe Tax registrations and consumer-law refund rights by launch geography. (P)

## Open questions / unverified

1. **Devin ACU pricing** ($2.25 Core / $2.00 Team, 250 ACUs for $500) is from aggregators; devin.ai/pricing returned 429 twice and cognition.com/pricing 404. Windsurf's March-2026 move to daily/weekly quotas is likewise secondary.
2. **ChatGPT plan prices and Deep Research limits** (Go $8, Plus $20, Pro $100/$200, Business $20/$25 after the 2026-04-02 cut) — openai.com and help.openai.com returned 403; secondary aggregators used.
3. **Perplexity** prices/limits — 403; secondary.
4. **Gemini 3.1 Pro** rates ($2/$12, $4/$18 > 200k) — ai.google.dev rendered only Flash/2.5 rows; secondary.
5. **Lago's license and cloud price** — pricing page shows no numbers; license not verified (do not assume AGPL/MIT).
6. **Provider training/retention terms** — not fetched this session; §10 posture deliberately does not rely on them.
7. **Cost model shape parameters** (turns per claim, 6k tokens/fetch, thinking multipliers 2–2.5×, 300k context ceiling) are calibrated to a single operator data point; the model reproduces Q-10 but could do so with different internal splits. One instrumented run (A7) will pin the cache-read share, which drives the routing and compaction recommendations.
8. **Cursor's exact included dollar amount** — the docs page describes "pools" and API-rate charging; the "$20 of usage" figure comes from Cursor's June-2025 post [27] and TechCrunch [28], not the current pricing page.
9. **Claude Pro/Max numeric limits** (messages per 5-hour window) are not published on the fetched support pages; only the multiplier framing is primary.
10. **Utilization assumption (55–65%)** is inferred from Cursor's "vast majority do not run out"; Rhema's runs are lumpier, so utilization may be *bimodal* (many users far under, a few at 100%) — the margin table should be re-run on the measured distribution, not the mean.

## Sources (numbered; URL · title · accessed 2026-08-27 · used for)

1. https://cursor.com/pricing · Cursor Pricing · tiers, Pro/Pro+/Ultra/Teams prices
2. https://cursor.com/docs/account/pricing · Cursor docs: Pricing · pools, API-rate charging, $0.25/MTok Cursor Token Rate, on-demand usage
3. (secondary) https://www.usecarly.com/blog/devin-pricing/ , https://vp0.com/blogs/devin-ai-pricing-plans-2026 , https://www.nocode.mba/articles/windsurf-pricing , https://devtoolsreview.com/pricing/windsurf-pricing/ · Devin/Windsurf pricing aggregators (devin.ai 429, cognition.com 404)
4. (secondary) https://www.cloudzero.com/blog/how-much-does-chatgpt-cost/ , https://theaicareerlab.com/blog/chatgpt-pricing-plans-explained , https://www.aipricing.guru/chatgpt-subscription-pricing/ · ChatGPT plan prices/limits (openai.com 403)
5. https://claude.com/pricing · Claude pricing · Free/Pro/Max/Team/Enterprise prices and multipliers
6. https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan · Claude Code on Pro/Max · shared limits, extra usage at API rates
7. https://support.claude.com/en/articles/12429409-extra-usage-for-paid-claude-plans · Extra usage for paid Claude plans · prepaid usage credits, spend cap, auto-reload, $2,000/day
8. https://code.claude.com/docs/en/costs · Claude Code: Manage costs · $13/dev/day, $150–250/mo, `/usage` attribution, 5-hour + weekly windows, usage credits UX
9. https://github.com/features/copilot/plans · Copilot plans · 1 credit = $0.01, Pro/Pro+/Max credits and flex
10. https://docs.github.com/en/copilot/concepts/billing/copilot-requests · Copilot premium requests · 300/1,500 allowance, $0.04 overage, multipliers, no carry-over
11. https://docs.github.com/en/copilot/get-started/plans · Copilot plans (docs) · Business $19 / Enterprise $39 seats, 1,900 / 3,900 credits
12. https://lovable.dev/pricing · Lovable pricing · credit definition, daily grants, expiry rules
13. https://v0.app/pricing · v0 pricing · $ credits, per-model token prices, daily login credits
14. https://bolt.new/pricing · Bolt pricing · token allotments, rollover policy, annual discount
15. https://replit.com/pricing · Replit pricing · Core/Pro credits, annual discount, parallel agents
16. https://replit.com/blog/effort-based-pricing · Replit: Introducing effort-based pricing · replaced $0.25/checkpoint; display per checkpoint
17. https://lex.page/pricing · Lex FAQ · Pro/Teams, refund promise (no prices rendered)
18. https://www.sudowrite.com/pricing · Sudowrite pricing · credit tiers, 12-month rollover, annual discount
19. https://www.jasper.ai/pricing · Jasper pricing · Pro $69/$59, Business custom, 7-day trial
20. https://www.grammarly.com/plans · Grammarly plans · Free/Pro prompts, $12
21. (secondary) https://www.finout.io/blog/perplexity-pricing-in-2026 , https://pricepertoken.com/subscriptions/perplexity · Perplexity Pro/Max (perplexity.ai 403)
22. https://elicit.com/pricing · Elicit pricing · Pro/Scale prices, multiplier usage, caps
23. https://platform.claude.com/docs/en/docs/about-claude/pricing · Anthropic pricing · all model rates, cache multipliers, batch, web search $10/1k, web fetch free, tokenizer +30%, CCU, Managed Agents $0.08/h
24. https://developers.openai.com/api/docs/pricing · OpenAI API pricing · GPT-5.x rates, web search $10/1k calls, batch/flex 50%
25. https://ai.google.dev/gemini-api/docs/pricing · Gemini API pricing · 3.7 Flash and 2.5 rates, grounding $14/1k after 5,000 free
26. (secondary) https://devtk.ai/en/models/gemini-3-1-pro/ , https://www.aipricing.guru/models/gemini-3-pro/ · Gemini 3.1 Pro rates
27. https://cursor.com/blog/june-2025-pricing · Cursor: Clarifying our pricing · post-mortem, refunds, communication commitments
28. https://techcrunch.com/2025/07/07/cursor-apologizes-for-unclear-pricing-changes-that-upset-users/ · TechCrunch · user complaints and CEO quote (secondary press)
29. https://www.theregister.com/2025/09/18/replit_agent3_pricing/ · The Register · Replit Agent 3 cost complaints with figures (secondary press)
30. (secondary) https://explainx.ai/blog/claude-usage-limits-2026-timeline-explained , https://ccforeveryone.com/guides/claude-code-limits-and-pricing , https://apidog.com/blog/weekly-rate-limits-claude-pro-max-guide/ · Claude limit timeline and the July-2026 usage-credit incident
31. (secondary) https://dev.to/momen_hq/the-hidden-costs-of-vibe-coding-a-practical-look-at-lovables-credit-usage-3cec · Lovable credit complaints
32. https://www.growthunhinged.com/p/2025-state-of-b2b-monetization · Growth Unhinged: State of B2B monetization 2025 · hybrid 27→41%, cost-driven AI pricing, outcome-based 5%
33. (secondary) https://schematichq.com/monetizing-ai/kyle-poyar-the-state-of-ai-pricing-in-2025 , https://credyt.ai/blog/tokens-vs-credits-vs-hybrid-pricing · Poyar on credits as budget units
34. (secondary) https://jeffbrokaw.com/blog/ai-gross-margins/ , https://www.getmonetizely.com/blogs/the-economics-of-ai-first-b2b-saas-in-2026 · ICONIQ 52% AI gross margin, 50–60% targets
35. https://stripe.com/billing/pricing · Stripe Billing pricing · 0.7% PAYG, $620+ plans, 2.9%+30¢, Meters 100M events included, Metronome pointer
36. https://stripe.com/tax/pricing · Stripe Tax pricing · 0.5%/txn or $0.50 API; Tax Complete from $90/mo
37. https://docs.stripe.com/billing/subscriptions/usage-based/compare-metronome · Stripe: compare basic UBB and Metronome · invoice-time credit reconciliation, feature matrix, Checkout "Limited"
38. https://docs.stripe.com/billing/subscriptions/usage-based · Stripe: basic usage-based billing · "use Metronome" guidance for new integrations
39. https://metronome.com/pricing · Metronome pricing · 0.8% billing volume, $0.04/1k events
40. https://www.withorb.com/pricing · Orb pricing · custom, billings + events basis
41. https://getlago.com/pricing · Lago pricing · OSS + Premium (no numbers)
42. https://www.better-auth.com/pricing · Better Auth pricing · OSS core free; managed infra tiers, SSO $50/connection
43. https://authjs.dev/ · Auth.js · free OSS, "now part of Better Auth"
44. https://clerk.com/pricing · Clerk pricing · 50k MRU free, $25/mo, $0.02/MRU, add-ons, SAML $75
45. https://workos.com/pricing · WorkOS pricing · 1M MAU free, $2,500 per additional 1M, SSO $125/connection
46. https://supabase.com/pricing · Supabase pricing · Pro $25, 100k MAU, $0.00325/MAU, SSO $0.015
47. https://aws.amazon.com/cognito/pricing/ · Cognito pricing · Lite/Essentials/Plus, 10k free, $0.015/MAU
48. https://docs.stripe.com/billing/subscriptions/usage-based/billing-credits · Stripe billing credits · grant semantics, finalization-time application, prohibited stored-value uses

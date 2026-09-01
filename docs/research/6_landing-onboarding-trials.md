# Landing page, onboarding, and trial design for Rhema

- Scope: ledger rows **B3.1, B3.2, B3.3, D18** (touches D15, L3, L7, T2, T7, Q-5, Q-10, Q-14) · Date: 2026-08-27 · Sources fetched: 55 (see §Sources; 14 targets could not be fetched and are listed in §Open questions)

## Executive summary (≤ 300 words, decisions-first)

1. **Landing page:** build a dark-default, serif-display / sans-body page whose hero *is* the product: a drop-zone ("Drop a draft, get a board review") plus a looping, real product recording. The 2026 survey evidence is that AI landing pages without an interactive or recorded demo "converted worse" and that 60%+ of new SaaS/AI landing pages are dark-dominant [52]. Every coding-agent landing we fetched (Cursor, Claude Code, Cognition, Lovable) is now *light*-default; Linear and Vercel are the dark exemplars. Q-14 (dark by default) is therefore a differentiating choice, not the herd choice — keep it, but ship a real light theme.
2. **Signup:** Google + email magic-link, no password, no form fields beyond email; email verification is deferred **until the first inference-bearing action** (never before the user has seen value). Every product studied lets a user into the app in one screen; none of them asks a question before showing the product except Notion.
3. **Time-to-first-value without inference:** seed every new account with a finished **showcase project** (outline → v1 → full review dossier → v2 + response letter) so the killer finding UI (T2) is visible in < 60 s at $0 marginal cost. Lex seeds six welcome docs; Cursor's first prompt is "explain this codebase" — the pattern is "let them read before they spend."
4. **Trial (D18):** a **reverse trial** (Verna) — 14 days of Pro-tier *features* with a hard **$-denominated credit grant** (target ≤ $4 expected inference per free signup), a single **"one free Quick Review"** on a ≤ 3,000-word draft at reduced depth, then a persistent free tier that can *read, edit, and inspect* everything but not run heavyweight passes. No credit card at signup; card required only to exceed the grant. Reject pure freemium (2–5 % conversion cannot pay for $5–100 runs) and reject card-wall trials (highest conversion, but kills top-of-funnel for a new category).
5. **Paywall placement:** at the **run-launch moment** (the cost-estimate confirmation sheet, cf. Cursor's "enable on-demand or upgrade" notification), never mid-run and never on reading/editing.

Contradictions with theses/decisions: none with Q-14 (dark) but note the market has moved light; T7 (credit-metered under tiers) is confirmed by every product fetched (Cursor pools, Devin quotas + on-demand credits, v0 dollar credits, Lovable credits, Codex 5-hour windows + $0.04 credits).

---

## 1. Method and rigor notes

All product claims below were read from the live page on 2026-08-27 unless labeled *(secondary)* or *(search snippet)*. Devin's marketing site (devin.ai, devin.ai/pricing) returned HTTP 429 on four attempts including via a proxy; Devin facts come from `docs.devin.ai` and `cognition.com`. OpenAI's `openai.com/codex` and `help.openai.com` returned 403; Codex facts come from `learn.chatgpt.com/docs/*` and `chatgpt.com/pricing`. Perplexity's site and help center returned 403; its free-plan numbers are from a help-center search snippet plus a secondary source and are labeled. WebFetch converts pages to text, so *motion, typography, and color* observations are inferred from asset names, theme variants, and textual cues; where a page's visual design is only inferred, that is stated.

---

## 2. Landing-page survey (B3.1)

### 2.1 Per-product observations

Format for each: **Observed** page structure → **Inferred** design/motion → **Rhema analogue**.

#### Cursor (cursor.com) [1]
- **Observed.** Hero: "Cursor is your coding agent for building ambitious software." CTAs: "Download for macOS", "Get started", "Request a demo". Order: (1) hero with *interactive demo* of desktop + CLI; (2) logo wall; (3) multiple interactive feature demos (agent, Mission Control, cloud agents, Slack/GitHub integration); (4) six testimonials (YC, NVIDIA CEO, OpenAI President, Stripe CEO, shadcn, Karpathy's Eureka Labs); (5) "Stay on the frontier" model-selection section; (6) "over half of the Fortune 500" trust line; (7) changelog; (8) careers; (9) blog; (10) footer. **No free-tier or trial language on the landing page** — pricing is one click away.
- **Inferred.** Light default with dark mode; spring-based animation; sans display. The page is a sequence of *product recordings*, not marketing illustrations.
- **Rhema analogue.** The "interactive demo in the hero" and "changelog on the homepage" (signals velocity) both transfer. The "Stay on the frontier" model section maps directly to Q-4 (curated multi-provider model choice) — a small strip of model logos is cheap credibility.

#### Cognition / Devin (cognition.com; devin.ai unreachable) [32]
- **Observed.** Hero: "Cognition operates Devin, the first autonomous software engineer." CTA "Get a Demo". Order: hero → logos → careers → blog (13+ posts) → footer. Numbered sections ("01"–"04"). No pricing/trial on page.
- **Inferred.** Light default, enterprise-sales posture (demo-first). Devin's product landing at devin.ai could not be fetched (429 ×4).
- **Rhema analogue.** Negative example for a self-serve consumer product — "Get a demo" as primary CTA is the sales-led motion; Rhema's must be self-serve.

#### OpenAI Codex (learn.chatgpt.com/docs; openai.com/codex 403) [37]
- **Observed.** Docs landing headline: "Start with a goal, idea, or task. ChatGPT can gather context, take action, and produce something useful." Primary CTA "Quickstart"; secondary "Explore use cases". Surface-choice first (desktop app / web / CLI / cloud).
- **Inferred.** The Codex marketing page itself is behind a 403 for automated fetch; observations are from the developer docs hub only.
- **Rhema analogue.** "Choose your surface before you begin" is the wrong first question for Rhema (web-only MVP); the "goal, idea, or task" framing maps to Rhema's three entry points (scratch / outline / draft).

#### Claude (claude.com) and Claude Code (claude.com/product/claude-code) [8][10]
- **Observed (claude.com).** Hero "Think fast, build faster" / "Brainstorm in chat, build in Cowork"; CTA "Try Claude". **Pricing table directly below the hero** (Free / Pro / Max) then a 3-question FAQ, then footer. No logos, no testimonials, no video on the homepage.
- **Observed (Claude Code page).** Hero "Claude Code" + "Work with Claude directly in your codebase…"; CTA "Download for macOS" plus terminal/web/iOS/Android/GitHub/VS Code/JetBrains/Slack entry points; then a live code example, logos (Zapier, Notion, Stripe), **pricing on the product page** (Pro $17/mo, Max 5x $100, Max 20x $200), feature announcements, use cases, platform availability, testimonials (Ramp, Intercom, Notion), CLI integrations, FAQ, footer.
- **Inferred.** Light default, generous whitespace, static screenshots rather than autoplay video.
- **Rhema analogue.** Anthropic puts **pricing on the homepage**, which is unusual and worth copying for a product whose core objection is "how much will this cost me per run?" (Q-10). Pricing-above-the-fold-ish reduces the surprise of usage-based billing.

#### Linear (linear.app) [12]
- **Observed.** Hero "The product development system for teams and agents" / "Purpose-built for planning and building products. Designed for the AI era." CTA points to a new-feature announcement ("New Loops →"), i.e., the hero doubles as a changelog. Order: hero → product screenshot → three value cards → four feature sections → changelog highlights → testimonials (OpenAI, Ramp, Opendoor) → "40,000+ product teams" → final CTA → footer.
- **Inferred.** **Dark default** (dark image variants referenced), restrained motion, dense sans typography. This is the canonical dark-mode SaaS landing.
- **Rhema analogue.** Linear is the closest structural template for a dark, craft-signaling product page: hero → one big product shot → three "why" cards → feature deep-dives → changelog → testimonials → stat → CTA.

#### Lex (lex.page) [14][15][16]
- **Observed.** Hero "Write something great today." / "Collaborative documents, with powerful AI editing tools." CTA "Start writing" (→ signup) + "Login". Then "Loved by over 300,000 writers", a logo carousel (Berkeley, BuzzFeed, Canva, FT, Google, Harvard, NYT, Stanford, Stripe, Yale…), one testimonial (Amanda Natividad, SparkToro), **eight icon-led feature tiles** (AI Feedback, Comments, Versions, Mobile Web, Live Collaboration, Publishing, Commands, Title Ideas; "Track Changes — Coming Soon"), second CTA (signup + demo request), footer. Both light and dark asset variants shipped. The pricing page describes "Lex Pro" benefits (premium models, early features, priority support) but **renders no prices server-side**.
- **Inferred.** Minimal, writer-first aesthetic; the testimonial literally praises "the minimalist interface".
- **Rhema analogue.** Lex is the nearest *category* neighbor. Its AI Feedback tile ("honest critique … rather than empty praise" per secondary [50]) is a one-feature version of Rhema's review dossier. Rhema should lead with the *depth* of review (claim ledger, discourse map, second read) as the differentiator Lex does not have.

#### Granola (granola.ai) [17][18][19][20]
- **Observed.** Hero "The AI notepad for back-to-back meetings" / "Notes, actions and memory. Without a meeting bot." CTA "Download for free" (repeated). Order: hero → **Before / During / After the meeting** three-stage strip → logos (PostHog, Intercom, Figma, Brex, Ramp) → feature sections → testimonials (Karri Saarinen/Linear, Guillermo Rauch/Vercel) → MCP connector showcase → pricing.
- **Inferred.** Light default, nature imagery, "approachable" typography.
- **Rhema analogue.** The **Before/During/After** strip is the best pattern for explaining a *workflow* product in one screen; Rhema's version is **Outline → Draft → Review → Respond**, one column each, one real screenshot each.

#### Arc / Dia (diabrowser.com) [21]
- **Observed.** Hero "A browser you won't dread opening"; CTA "Download" with the line **"Includes 14 day free trial of Better Days"** (the paid plan) right under the button; a "Watch the scream" trailer link. Order: hero → "Dia reads between the tabs" (3 features) → "Built for how you actually work" (6 features) → privacy toggles → final CTA.
- **Inferred.** Playful, sticker/illustration-led; trial length stated at the CTA.
- **Rhema analogue.** Stating the trial terms *under the primary button* is a cheap trust move ("Includes one free Quick Review — no card").

#### Raycast (raycast.com) [22][23]
- **Observed.** Hero "Your shortcut to everything." with an interactive keyboard visual; the first CTA link is to a hardware keyboard product. Order: hero → "It's not about saving time" → extension categories (Productivity, Engineering, Design, **Writing**) → AI section → social proof → automation (Snippets, Quicklinks, Hotkeys) → built-in tools carousel → community → developer section → CTA/footer. Pricing: Free $0; Pro $10/mo ($8 annual); Advanced AI add-on +$8/mo; "Eligible new accounts can start a free Pro trial with access to Pro models."
- **Inferred.** Light default with dark accents; 3D cube motif; hero interaction as the demo.
- **Rhema analogue.** "Eligible new accounts" trial language is a template for a fraud-gated reverse trial (see §5).

#### Substack (substack.com — operator's counter-weight, Q-14) [24]
- **Observed.** Logged-out homepage hero "Make money doing the work you believe in"; CTA "Start your Substack" + "Learn more". Order: nav → hero → **live feed of recent posts** → "You made it, you own it" → featured posts → "Great discussions" → login/signup. Static, no video. Email-first signup; no social buttons visible on that view (the dedicated `/sign-up` route returned 404 to fetch).
- **Inferred.** Light, black/white/grey, sans on the marketing surface (the serif is inside the reading product, not on this page). The homepage sells the *network*, not the editor.
- **Rhema analogue.** The "feed as proof" pattern does not transfer (Rhema has no public network, Q-9). What transfers from Substack is the *reading* aesthetic (serif body, wide measure, calm chrome) inside the IDE, not the landing.

#### Notion (notion.com) [25][26][48]
- **Observed.** Hero "Where teams and agents Think together." / "Capture context, find answers, and automate tasks with AI built for your team." CTAs "Get Notion free" + "Request a demo"; video play button in hero. Order: hero → "Trusted by 98% of the Forbes Cloud 100" logos → three-column features → use cases → testimonials (Cursor, Faire, Ramp) → footer. Pricing: Free $0 (AI "Limited Trial"), Plus $10, Business $20 (full Agent), Enterprise.
- **Inferred.** Light default; "free" in the CTA verb.
- **Rhema analogue.** "Get Rhema free" as the CTA verb is the freemium/reverse-trial signal; Notion's onboarding questionnaire (see §3) is the personalization exemplar.

#### Vercel (vercel.com, v0.app) [27][28][29]
- **Observed (vercel.com).** Hero "Agentic Infrastructure" / "For coding agents to ship apps and agents automated by agents."; CTAs "Deploy now" + "Talk to sales"; case-study sections (Notion, Zapier, Mintlify); "recently shipped"; final CTA. Light/dark variants shipped. Pricing: Hobby $0 with explicit per-resource caps; Pro $20/mo with **"$20 included credit to use across resources"**; "If you have a free Hobby account, you are limited to the usage caps and cannot purchase additional usage."
- **Observed (v0.app/pricing).** Free "$0/month" with **"$5 of included monthly credits"** and "7 message/day limit"; Plus $30 with "$30 of included monthly credits" + "$2 of free daily credits on login"; Business $100.
- **Inferred.** Dark-leaning, monochrome, geometric; the canonical "engineering-craft" look with Linear.
- **Rhema analogue.** Vercel/v0 are the clearest examples of **dollar-denominated credits** with a *daily login grant* (habit loop) and a **free tier that cannot buy overage** (forces the upgrade decision). Both transfer to L3.

#### Lovable (lovable.dev, via text proxy) [30][31]
- **Observed.** Hero "Build something Lovable" / "Bring a new product, internal tool, or entire company to life."; **the primary CTA is a prompt box** ("Ask Lovable to create a landing page for my…" + "Build"). Order: hero/prompt → "One platform. Endless possibilities" → real-time building demo → bug-tracking → design/deploy → infra features → logos → customer stories with metrics → "Millions count on Lovable" → final CTA. Credits: free plan "daily grant of 5 build credits (up to 30 a month), plus monthly grants of 20 Cloud credits"; daily grants "expire at the end of each day and don't roll over"; paid credits expire two months after issue.
- **Inferred.** Light default; the prompt box *is* the demo.
- **Rhema analogue.** The prompt-box-as-hero pattern becomes, for Rhema, a **drop-zone-as-hero** ("Drop your draft") — the user's own document is the demo. Daily-expiring micro-grants are a proven retention mechanic for cheap actions (Rhema: chat/light edits), while heavyweight passes stay on monthly credits.

#### Perplexity (site 403; help-center snippet + secondary) [51][S-3]
- **Observed (search snippet from the official help center).** "free accounts have access to five Pro Searches per day"; Pro $20/mo. Secondary [51] adds that Deep Research/Labs are "effectively a Pro feature".
- **Rhema analogue.** The "N heavy actions per day, unlimited light actions" shape is exactly the trial shape Rhema needs (light = chat/edit; heavy = a workflow pass).

### 2.2 Cross-cutting patterns (Observed across the set)

| Pattern | Who does it | Count of 12 core targets |
|---|---|---|
| Real product recording/interactive demo in or right under the hero | Cursor, Linear, Notion (video), Lovable (live prompt), Raycast (interactive), Claude Code (live example) | 6 |
| Logo wall as second or third section | Cursor, Linear, Lex, Granola, Notion, Cognition, Lovable, Claude Code | 8 |
| Named-person testimonials | Cursor, Linear, Lex, Granola, Notion, Claude Code | 6 |
| Pricing on the homepage | Claude, Claude Code, Granola | 3 |
| Changelog / "recently shipped" on the homepage | Cursor, Linear, Vercel, Claude Code | 4 |
| Trial terms stated at the CTA | Dia ("Includes 14 day free trial"), Granola ("Download for free"), Notion ("Get Notion free") | 3 |
| Dark default | Linear, Vercel (leaning) | 2 |
| Light default | Cursor, Claude, Claude Code, Cognition, Lex, Granola, Dia, Raycast, Substack, Notion, Lovable | 11 |

**Design-token trends (Observed from surveys, not from the pages themselves).** Landdding's *State of Landing Pages 2026* (2,257 hand-reviewed submissions; typography observations explicitly qualitative) reports **"60%+ of new SaaS and AI landing pages … used a dark-dominant palette, roughly double the share in 2023"**, names the recurring high-craft faces (PP Neue Montreal, Aeonik, GT Super, Migra, Söhne, ABC Diatype, JetBrains Mono as display; Inter as the engineering default), and states that "AI companies without an interactive demo or recorded playground on the landing page converted worse" [52]. Hostinger's 2026 trend list (Aug 6, 2026) adds oversized/experimental typography, dark mode, micro-interactions, gradients-as-light, and grain textures [53]. A search-snippet-level claim (not fetched in full) is that "italic Instrument Serif headlines plus muted dark canvas reads as 'enterprise-ready'" for B2B AI [S-6].

**Inferred synthesis.** Two distinct visual dialects exist in 2026: (a) the *light, friendly, screenshot-led* dialect (Cursor, Claude, Notion, Granola, Lovable) and (b) the *dark, monochrome, craft* dialect (Linear, Vercel). Q-14 chooses (b) for the app; the landing should match the app (a dark landing that opens into a dark IDE avoids a jarring theme flip at signup — the Linear pattern). The Substack counter-weight is best honored with **serif display type** on dark, which none of the coding-agent pages do and which reads as "the written word" rather than "the terminal".

---

## 3. Signup and first-run survey (B3.3)

### 3.1 Observed first-run flows

- **Cursor** [3]: download → "Open the app and sign in" → "pick a folder and start with a small task" → open Agent (Cmd+I) and ask it to explain the codebase; the docs call this "one of the fastest ways to get oriented in an unfamiliar codebase." Three steps to the first agent action; the first prompt is *read-only* (explain), not *write*.
- **Claude Code** [11]: install → `claude` → browser login → "what does this project do?" → "add a hello world function" (asks approval before each change in the first session; auto mode becomes the default from the second session on Pro/Max/Team). Requires a paid plan or Console credits — **no free path**.
- **Codex** [39]: choose surface (desktop app recommended; web for long cloud tasks) → sign in with ChatGPT account → "select where ChatGPT should work" (chat, project, or folder) → pick Work / Codex / Chat mode → "describe your goal and add any files or context."
- **Devin** [33][49 secondary]: sign up at app.devin.ai with Google or GitHub, "pick a plan, and you're in"; GitHub OAuth under Settings → Integrations; secondary walkthrough (Apr 11 2026) says setup "takes under ten minutes" and the session UI shows "three tabs — Terminal, Editor, and Browser"; Ask Mode (no cost, read-only) vs Agent Mode (consumes usage). Official docs: Free plan has "Limited Devin usage" plus Devin Review and DeepWiki [34].
- **Lex** [S-4 secondary]: "no onboarding wizard, no tutorial flow… you are in a blank document immediately"; new accounts are "welcomed by 6 documents in their library, which explain different aspects of the product."
- **Granola** [20]: SSO (Google/Microsoft) → calendar auto-sync → microphone/system-audio permission → notification one minute before the first meeting → "Enhance notes" at the end; "Setup takes under 5 minutes." Value cannot arrive until the next meeting — Granola's time-to-value is bounded by the user's calendar, so the app front-loads *preparation* (calendar view) as the first screen.
- **Notion** [48 secondary]: profile (name/photo) → email-domain workspace detection → use-case survey (individual / team / enterprise; function) → UI "morphs in real-time" as choices are made → name the workspace → adaptive guided tour; the survey drives a shortlist of ~5 templates.

### 3.2 Signup friction and email verification (Observed + labeled evidence quality)

- Every product surveyed offers **Google (and often GitHub/Microsoft/Apple) sign-in**; Substack is email-first; none of the fetched flows required a password to be created before entering the product (Substack's and Lex's dedicated signup routes 404'd to fetch, so their field lists are unverified).
- Quantitative claims on passwordless conversion are **vendor-sourced and not independently validated**. Baytech's review cites "Increase in sign-up completion: 40–60%" (MetaCTO) for passwordless and explicitly warns "the vast majority of these strong quantitative claims come directly from authentication vendors" [46]. Search-snippet claims of "magic links achieve 70–85% completion vs 35–55% for email+password" [S-2] are of the same provenance and should be treated as directional only.
- Authgear's guide recommends "letting users into the app immediately after sign-up and verify email in the background or later" and against confirm-password fields [47].
- **Inferred rule for Rhema:** verification should be tied to the first *cost-bearing* action, not to entry. This is also an abuse control: a free inference grant behind an unverified email is a bot magnet (see §5.4).

### 3.3 Activation benchmarks (Observed)

Userpilot's 2025 benchmark (62 companies; their own definition of activation): median activation ≈ 37%, PLG ≈ 34.6%, sales-led ≈ 41.6%, **AI/ML products 54.8%** (highest category), FinTech 5% (lowest); "A 25% increase in your activation rate translates to a 34% increase in MRR over 12 months" [43]. The AI/ML figure is the relevant prior: users who arrive at an AI product expect to *see the model do something* in session one.

---

## 4. Trial and pricing mechanics survey (B3.2)

### 4.1 Observed mechanics, product by product

| Product | Free/entry | Paid entry | Unit of metering | Trial | Overage | Source |
|---|---|---|---|---|---|---|
| Cursor | Hobby: "No credit card required", "Limited Agent requests", Auto model; "Cursor no longer publishes a fixed public Hobby quota" (secondary) | Pro $20; Pro+ $60 ("3x Pro limits"); Ultra $200 ("20x"); Teams $40/user | Two pools ("Cursor Models" vs "Other Models"); "Every plan includes a set amount of model usage" | Two-week Pro trial exists per forum threads (2024) and secondary 2026 guides ("150 premium model credits", no card); **not on the official pricing page** | "enable on-demand usage (pay-as-you-go) or upgrade"; Spending tab shows real-time usage, remaining allowance, reset date | [2][5][6][7][54] |
| Devin | **Free** plan: "Limited Devin usage" + Devin Review + DeepWiki (legacy Core users migrated to Free) | Pro $20/mo; Max $200/mo; Teams $80/mo min | "daily and weekly usage quota" (Pro/Teams); Max "weekly allowance only"; Enterprise in ACUs ("ACU consumption scales with the inference used and the model selected") | Free plan *is* the trial | "On-demand credits are prepaid usage credit… Roll over month-to-month. Purchased credits never expire"; legacy ACU price $2.25 (secondary) | [34][35][36][S-5] |
| Codex / ChatGPT | Free $0: "Limited Codex access", Codex "for quick coding tasks" | Go $8 (limited Codex); Plus $20 (full); Pro $100 (5x) / $200 (20x) | Messages per **five-hour window** by model (Plus: 10–100 Sol, 25–200 Terra, 250–2,000 Luna) plus weekly caps; credits priced per 1M tokens | None; free tier is the trial | Buy credits (secondary: $0.04/credit) | [38][40][S-7] |
| Claude | Free $0 with usage limits (chat, web search, files…) ; Claude Code **requires Pro+** | Pro $20 ($17 annual); Max $100 "5x" / $200 "20x" | "more usage", 5x/20x multipliers; Enterprise "seat price + usage at API rates" | None | Not stated on page | [9][11] |
| Linear | Free "for everyone": 2 teams, 250 issues, unlimited members | Basic $10/user; Business $16/user | Seats + issue cap | None | n/a | [13] |
| Lex | Free: "30 monthly AI checks" (secondary), standard models | Pro $18/mo or $145/yr (official 2024 newsletter); secondary 2026 sources $18–$24.99 | AI checks; Pro "unlimited" | 5-day (secondary) | n/a | [16][50][S-1] |
| Granola | Basic $0, **history-limited** ("last 30 days" on one official blog, "past 14 days" on another; older third-party "25 meetings lifetime" claim is stale per Granola's own search snippet) | Business $14/user; Enterprise $35/user | Retention window, not count | Free is perpetual | n/a | [18][19][20][55] |
| Raycast | Free $0 (no AI) | Pro $10 ($8 annual); Advanced AI +$8 | Feature gate | "Eligible new accounts can start a free Pro trial" | n/a | [23] |
| Notion | Free $0, AI "Limited Trial" | Plus $10; Business $20 (full Agent) | Seats + block cap; AI gated | Built into Free | n/a | [26] |
| Vercel / v0 | Hobby $0 with hard caps and **cannot buy overage**; v0 Free "$5 of included monthly credits", "7 message/day limit" | Pro $20 with "$20 included credit"; v0 Plus $30 with "$30 of included monthly credits" + "$2 of free daily credits on login" | **Dollar credits** | None | Pro: pay-as-you-go "uncapped" | [28][29] |
| Lovable | Free: "5 build credits" daily "(up to 30 a month)" + "20 Cloud credits" monthly; daily credits "don't roll over" | Paid plans (prices not server-rendered) | Credits (build / Cloud / AI features) with expiry rules | Free is the trial | Top-ups last 12 months | [31] |
| Perplexity | Free: "five Pro Searches per day" (help-center snippet); Deep Research effectively Pro (secondary) | Pro $20 | Heavy-action count per day | Free is the trial | n/a | [51][S-3] |
| Substack | Free to publish; 10% of paid-subscription revenue (secondary) | n/a | Revenue share | n/a | n/a | [S-8] |

### 4.2 Observed conversion benchmarks (all secondary; provenance noted)

- Appcues (citing a Tunguz/Redpoint survey and unnamed "SaaS benchmark sources"): opt-in trial **8–25 %**, opt-out (card) trial **50–75 %**, freemium **2–5 %** [44].
- Artisan (citing OpenView-via-Userpilot and 1Capture 2025, "10,000+ SaaS companies"): freemium 1–10 % ("most land 2–5%"), freemium-to-trial (reverse-trial hybrid) ~8 % median, no-card trial ~18 % median, card-required ~25 % median; developer tools "at the upper end of the freemium range" [45].
- Elena Verna (Amplitude): a reverse trial "puts customers in a freemium experience with a timed free trial with access to paid capabilities which reverts to a traditional freemium product after the free trial ends"; she frames it as capturing the "15% conversion rate of the free trial model" *plus* the users who "continue on a freemium plan"; no fixed length — "analyze product usage to understand when users typically need more advanced features and how long it takes them to develop stickiness with paid features" [41]. Her fuller configuration taxonomy is paywalled [42].

**Inferred.** The benchmark spread is wide and definitional, but the ordering is stable across sources: card-wall > no-card trial > reverse trial > freemium. What none of these sources model is a product where the *free action itself* costs the vendor $5–100 (Q-10). That is the constraint that decides Rhema's design.

---

## 5. Recommendations

### 5.1 Landing-page structure and content outline (B3.1 → D15)

**Recommendation.** One long page, dark default with full light theme, twelve sections. Alternatives rejected: (a) the Claude "pricing-first, no proof" page — too thin for a new category that must *explain* itself; (b) the Cognition "Get a demo" page — sales-led, wrong motion; (c) a Lovable-style pure prompt-box hero without narrative sections — Rhema's value (a multi-phase review) cannot be demonstrated in one prompt.

| # | Section | Content | Pattern source |
|---|---|---|---|
| 1 | **Nav** | Product · Workflows · Pricing · Changelog · Docs · Sign in · **Get Rhema free** | Notion CTA verb |
| 2 | **Hero** | Serif display headline (candidate: *"An editorial board for everything you write."*), one-line sub (*"Outline, draft, review, and revise with agents that verify every claim."*). **Drop-zone CTA**: "Drop a draft (.md, .docx, .pdf) — get a Quick Review free" + secondary "Start from scratch". Under the button, Dia-style: "No card. One free review included." Behind it, a looping recording of a real dossier opening with findings anchored to quoted passages (T2). | Lovable prompt-hero; Cursor interactive demo; Dia trial line |
| 3 | **Workflow strip** | Four columns: **Outline → Draft → Review → Respond**, each with one real screenshot and one sentence; the last column shows the response ledger (accept / adapt / rebut / defer). | Granola Before/During/After |
| 4 | **The dossier** (feature deep-dive 1) | Claim ledger with verdicts and fetched URLs; discourse map; fresh-context second read "worth ~a third of findings"; anchored rubric. This is the section that answers "why not ChatGPT". | Linear feature sections |
| 5 | **The author's seat** (deep-dive 2) | Respond-to-review: ordered moves, response letter, voice guard. | — |
| 6 | **Personas** (deep-dive 3) | Upload samples / link a Substack → persona profile; staleness indicator. (J rows) | — |
| 7 | **Live runs** | Timeline/round log with phase progress and cost meter — the "IDE" shot. (K rows) | Cursor Mission Control |
| 8 | **Models** | "Stay on the frontier" strip: curated models, platform-billed (Q-4). | Cursor |
| 9 | **Proof** | Named testimonials (writers/editors/academics) and, once available, venue/institution logos. At launch: substitute *measured* claims ("every finding quotes its passage; every verdict carries a fetched URL"). | Lex / Linear |
| 10 | **Pricing** | Full table on the homepage (Free / Pro / Max) with a **per-workflow cost card** ("A full review of a 5,000-word essay ≈ N credits"). | Claude, Claude Code |
| 11 | **Changelog + FAQ** | Three most recent shipped items; 5-question FAQ (cost per run, privacy Q-12, export formats Q-9, models, what the free review includes). | Cursor, Linear, Claude |
| 12 | **Final CTA + footer** | Repeat drop-zone. | all |

**Typography / color / motion recommendation.** Display: a high-contrast serif (GT Super / Instrument Serif class, per [52][S-6]) for headlines only; body/UI: a neutral grotesk (Inter or Söhne class); mono for cost/usage figures. Palette: near-black ground with warm paper-toned text (not pure white) to honor the Substack reading counter-weight; a single accent. Motion: scroll-triggered reveals ≤ 200 ms, one looping product recording per section (recordings, not illustrations — [52]), `prefers-reduced-motion` respected. Dark/light: detect system, remember the choice, and keep the same theme across landing → app (Linear pattern).

### 5.2 Onboarding: three entry points and the first five minutes (B3.3)

**Recommendation — signup.** Google + email magic link; no password; no questionnaire before the product (reject Notion-style survey up front: Rhema's three entry points *are* the segmentation, and the choice happens in-product). Ask nothing else. Alternatives rejected: card-at-signup (kills top-of-funnel for a new category; the Appcues 50–75 % figure is conversion *of those who survive the wall*), and password-first (highest documented friction, [46][47]).

**Recommendation — the first sixty seconds are inference-free.** Every new workspace ships with a **showcase project** ("Welcome — a worked example"): a short essay's outline, v1, full review dossier with a claim ledger and second-read reconciliation, and v2 with the response letter. The user's first screen is the *timeline* of that project (T1) with the dossier open (T2). Cost to Rhema: zero per user (pre-computed once). Precedent: Lex's six welcome documents; Cursor's "explain this codebase"; Devin's Ask Mode. This converts the T2 thesis into the activation event: *opened a finding and saw its anchor*.

**Recommendation — the first five minutes, per entry point.** Common frame: an empty-state card with three buttons — **Start from scratch · Upload an outline · Upload a draft** — and a small "Or explore the worked example" link.

| Minute | Start from scratch | Upload an outline | Upload a draft |
|---|---|---|---|
| 0–1 | Click "Start from scratch" → a chat pane opens *inside* the empty project (the research agent, Q-4 model default). Placeholder: "What are you writing, for whom, and what's the venue?" First reply is cheap (no web research until asked). | Drop .md/.docx/.pdf → ingested to markdown (I rows) → rendered in the editor with a right-rail "Outline detected: 7 sections, ~4,200 target words". | Drop the draft → ingested → rendered → right-rail "Draft detected: 3,100 words, 12 citation-like spans". |
| 1–3 | Guided by three chips: "Research this", "Propose a structure", "Make an outline". Web research is flagged as costing credits *before* it runs ("~2 credits"). | One primary button: **"Draft v1 from this outline"** with a cost estimate and a persona picker (default: none, J rows). Because draft-from-outline is heavyweight, the trial offers **"Draft the first section (free preview)"** instead of the full draft. | One primary button: **"Quick Review (free)"** — reduced-depth editorial review (see §5.3); secondary "Full board review" shows cost and the upgrade path. |
| 3–5 | User clicks "Make an outline" → outline artifact appears in the timeline; the next-step button becomes "Draft v1". | First section streams into the editor; timeline shows the run; the gate (Q-7) appears as an inline "Approve structure plan" card, pre-approved for the trial preview to avoid a first-run stall. | Findings stream in as cards anchored to quoted passages; the first finding is visible in < 90 s (intake + craft pass first, heavyweight phases skipped or deferred). |
| Verification | Email verification is requested at the moment the first credit-bearing run is launched (magic-link click completes it). | same | same |

**Empty-state and gate design rules (Inferred from Claude Code's "asks before each change in the first session" and Devin's Ask/Agent split):** the first session is *maximally interruptible* (every gate on, Q-7) but every gate is pre-filled with the recommended answer so a single click continues; "Ask" (read-only, cheap) actions are visually distinct from "Run" (cost-bearing) actions everywhere.

### 5.3 Trial design for a $5–100-per-run product (D18, Q-10, L3)

**The constraint, quantified (Inferred; A7 must replace these with measured numbers).** Q-10 gives $50–100 for the extreme run (15k words, 70+ citations, frontier model). Assume cost scales roughly with words × citations × model rate. A ≤ 3,000-word draft with ≤ 10 citations, heavyweight phases (fact-check, discourse map, second read) *off*, on a mid-tier model, plausibly lands at **$1–4**; the same draft with all phases on at the frontier model perhaps $8–15. These are estimates, not measurements.

**Why pure freemium fails here.** At freemium's 2–5 % conversion [44][45], each paying customer costs 20–50 free signups. If each free signup consumes even $5 of inference, that is **$100–250 of trial inference per paying customer**, i.e., 5–12 months of a $20/mo plan before the trial is paid back — before any other CAC. Either the per-signup inference cost must be ≤ ~$3–4 or conversion must be ≥ ~10 %. The reverse-trial figures (8 % median as a hybrid [45]; Verna's "15% + freemium tail" framing [41]) are the only benchmark family that makes a $3–4 grant pencil out.

**Recommendation — a capped reverse trial with one showcase run.**

1. **Grant.** On signup: 14-day Pro-feature window + a **dollar-denominated credit grant** sized so expected inference per free signup ≤ **$4** (v0's "$5 of included monthly credits" is the closest precedent [29]). Credits are shown as credits, but the internal unit is dollars at cost (T7; Vercel/v0 precedent) so pricing tiers can change without re-denominating.
2. **One free Quick Review.** A single reduced-depth editorial review on a draft ≤ 3,000 words: intake, argument critique, craft critique, editor's letter and rubric; fact-check limited to the 5 most load-bearing claims; discourse map and second read **off** (the skill's own opt-out design makes this a configuration, not a fork). Presented honestly as "Quick Review — the full board adds fact-checking of every claim, a discourse map, and an independent second read." This is the "one free X" pattern (Perplexity's five Pro Searches/day, Lex's 30 checks, Notion's "Limited Trial") applied to the flagship.
3. **Preview, not full, for generation.** Draft-from-outline in trial = first section only (capped ~800 words); persona bootstrap = not available in trial (it is the most expensive and least visible run; show a static example instead).
4. **Cheap actions on a daily grant.** Chat, research questions, and inline edits draw from a small **daily-expiring** allowance (Lovable's "5 build credits" per day, expiring nightly [31]) so a returning user always has *something* to do at low cost to Rhema.
5. **After 14 days: persistent free tier** that can create projects, edit, import, export (Q-9), inspect any artifact, and re-read old dossiers — but cannot launch heavyweight passes without credits. Nothing is deleted; the loss-aversion lever is *capability*, not *data* (Granola's history-window gate is the data-hostage variant; rejected as hostile to writers).
6. **Paywall placement.** Exactly one place: the **run-launch sheet**. Every run shows an estimate ("Full board review · ~5,200 words · est. 9–14 credits · you have 3"), and the sheet's primary button becomes "Upgrade to Pro" or "Add credits" when the estimate exceeds the balance (Cursor's "enable on-demand usage or upgrade" notification [5]). Never interrupt a run in progress; if a run overruns its estimate, finish it and reconcile (Cursor bills Auto at the routed model's list price [4]; Rhema should absorb overruns of its *own* estimates in the trial).
7. **Card policy.** No card at signup. Card required to (a) buy credits, (b) subscribe, or (c) exceed the free grant — never to start. Hobby-style rule from Vercel: the free tier *cannot* buy overage without becoming Pro [28], which keeps the upgrade decision binary.
8. **Upgrade prompts.** Three, all contextual, none modal-on-load: (i) the run-launch sheet; (ii) a "Quick Review found 14 issues — the full board typically finds ~a third more from the second read alone" card at the end of the free review (uses the skill's own empirical claim; must be re-measured in-product before shipping); (iii) day-12 email "your Pro features end in 2 days" (Appcues strategy #10 [44]).
9. **Rejected alternatives.** *Card-wall opt-out trial* — highest conversion of survivors [44] but suppresses signups for an unproven category and forecloses the persona/sample-upload habit loop. *Time-boxed trial with unlimited runs* — a single motivated user can burn $500 in a day; unbounded liability. *Pure freemium with tiny credits and no Pro-feature window* — users never see the full dossier and the T2 killer UI stays hidden. *BYO-key trial* (L7) — viable later as an escape hatch for power users, but it moves the first-run experience onto the user's API console; keep as an optional mode, not the trial.

### 5.4 Abuse and cost controls the trial depends on (new ledger row proposed)

Observed precedents: Raycast gates the trial to "eligible new accounts" [23]; Cursor's forum shows users confused when the trial silently did or did not activate [7] — a warning about opaque eligibility. **Recommendation:** verified email + a device/IP signal before the first credit-bearing run; one free Quick Review per verified identity; hard per-account daily spend ceiling in trial; workspace-level kill switch; disposable-email domain list. State the rule on the pricing page in one line so eligibility is never a surprise.

### 5.5 Conversion best-practice citations (B3.2)

- Reverse-trial definition and rationale — Verna/Amplitude [41]; Verna's taxonomy of trial configurations (paywalled; partial) [42].
- Benchmarks — Appcues (opt-in 8–25 %, opt-out 50–75 %, freemium 2–5 %) [44]; Artisan citing OpenView/Userpilot and 1Capture (no-card ~18 % median, card ~25 %, reverse-trial hybrid ~8 %) [45].
- Activation — Userpilot 2025 (median ~37 %; AI/ML 54.8 %; "25% increase in activation → 34% MRR over 12 months") [43].
- Signup friction — Authgear (defer verification; no confirm-password; minimum fields) [47]; Baytech (passwordless "40–60%" lift is vendor-sourced; run your own A/B) [46].
- Trial strategies — Appcues' 12 strategies, notably contextual upgrade prompts (#6), trial-ending reminders (#10), and trial extension (#11) [44].
- Demo-in-hero — Landdding 2026: AI companies without an interactive/recorded demo "converted worse" [52].

---

## 6. Rhema implications (numbered, tied to ledger rows / theses)

1. **D15 / B3.1.** Adopt the twelve-section outline in §5.1; dark default with serif display (Q-14 confirmed, but as a *differentiator* — 11 of 12 surveyed products are light-default). Ship a real light theme because the market default is light.
2. **D15 / B3.1.** The hero CTA is a **drop-zone**, not a button; the user's own draft is the demo (Lovable pattern adapted).
3. **D15 / L3.** Put **pricing and a per-workflow cost card on the homepage** (Claude precedent) — the cost-per-run objection is Rhema's biggest, per Q-10.
4. **B3.3 / D18 / T2.** Seed every account with a **pre-computed showcase project** so first value costs $0 and the activation event is "opened a finding and saw its anchor."
5. **B3.3.** Google + magic-link signup, no password, no survey; email verification deferred to the first credit-bearing run.
6. **B3.3 / Q-7.** First-session gates are all on but pre-filled; "Ask" vs "Run" actions visually distinct everywhere (Devin Ask/Agent, Claude Code first-session approvals).
7. **D18 / L3 / T7.** Reverse trial: 14-day Pro-feature window + ≤ $4 expected inference grant + one free reduced-depth **Quick Review** (≤ 3,000 words) + daily-expiring micro-grant for chat/edits + persistent capability-gated free tier. T7 (credits under tiers) confirmed by every product fetched.
8. **D18.** Single paywall location: the **run-launch estimate sheet**; never mid-run; never on reading/editing/export.
9. **A7 / Q-10.** The trial economics hinge on measured per-run costs by length × citations × model × phases-enabled. The $1–4 Quick Review estimate in §5.3 is inferred and must be replaced by A7's measurements before the grant size is fixed.
10. **L7.** BYO-key is a later optional mode, not the trial path.
11. **New row (proposed, M-series).** Trial abuse controls: identity verification before spend, per-account daily ceilings, kill switch, disposable-domain list.
12. **C1.** Candidate positioning line for the hero, to be tested: "An editorial board for everything you write."

## Ledger updates

| Row | Proposed status | Evidence (one line) |
|---|---|---|
| B3.1 | done | §2 — 12 landing pages + 2 surveys fetched; structure table §2.2; outline §5.1 |
| B3.2 | done | §4 — 13 pricing/trial mechanics tabulated from live pages; benchmarks §4.2; recommendation §5.3 |
| B3.3 | done | §3 — 7 first-run flows observed; five-minute plan per entry point §5.2 |
| D18 | in-progress → design | §5.3 recommendation (reverse trial + Quick Review + run-launch paywall); blocked on A7 cost measurements for grant sizing |
| D15 | in-progress | §5.1 content outline and design tokens ready for mockup |
| L3 | in-progress | dollar-denominated credits under tiers confirmed (Vercel/v0/Cursor/Devin/Codex); per-workflow cost card recommended |
| L7 | open | BYO-key rejected as the trial path; keep as optional mode |
| A7 | open (elevated) | Trial grant cannot be sized without measured cost curve; see §5.3 |
| T2 | supported | Showcase project makes the finding UI the activation event |
| T7 | supported | Every surveyed product meters usage under subscription tiers |
| Q-14 | confirmed, with note | Dark default is now the *minority* choice among coding-agent landings (Linear/Vercel are the dark exemplars; Cursor/Claude/Lovable are light) |
| **New: M-x "Trial abuse & spend controls"** | open | §5.4 — verified identity before spend, daily ceilings, kill switch, disposable-email list |
| **New: D-x "Showcase project content"** | open | Author the worked example (outline, v1, dossier, v2, letter) shipped to every new workspace |
| **New: C-x "Quick Review configuration"** | open | Define the reduced-depth editorial-review profile (phases on/off, claim cap, word cap, model) used by the trial |

## Open questions / unverified

- **Unfetched (blocked):** devin.ai and devin.ai/pricing (HTTP 429 ×4); openai.com/codex, help.openai.com Codex plan article, chatgpt.com/codex/pricing (403); perplexity.ai and its help center (403); lovable.dev directly (403; text-proxy copy used); docs.lovable.dev pricing page (404); creatorstackclub Lex review (403); substack.com/sign-up and lex.page/signup (404); cognition.com/pricing (404); fontfabric trends (empty body). Lex's official pricing page renders no prices server-side; the only *official* price found is the April 2024 newsletter ($18/mo, $145/yr); 2026 secondary sources disagree ($18 vs $24.99).
- **Granola free-tier retention window** is stated as 30 days on one official blog post and 14 days on another; the "25 meetings lifetime" figure appears only in third-party posts and Granola's own search snippet calls such figures stale.
- **Cursor's two-week Pro trial** is documented only in forum threads and third-party guides, not on the official pricing or docs pages fetched; treat as "exists, terms unpublished."
- **Perplexity's "five Pro Searches per day"** comes from an official help-center search snippet, not a fetched page.
- **All conversion benchmarks are secondary** and definitionally inconsistent; the ordering (card-wall > no-card > reverse > freemium) is robust, the magnitudes are not.
- **Visual observations** (motion, typefaces, exact palettes) are inferred from text extraction and asset names, not rendered screenshots; a design agent should screenshot Cursor, Linear, Lex, and Vercel before D15 mockups.
- **The $1–4 Quick Review cost** is an extrapolation from Q-10, not a measurement (A7).
- **The "~a third of findings from the second read"** figure is the skill README's own claim and needs in-product measurement before it is used in an upgrade prompt.

## Sources (numbered; URL · title · accessed 2026-08-27 · used for)

1. https://cursor.com · Cursor landing · hero, section order, light default, no trial copy
2. https://cursor.com/pricing · Cursor pricing · Hobby/Pro/Pro+/Ultra/Teams; "Every plan includes a set amount of model usage"
3. https://cursor.com/docs/get-started/quickstart · Cursor quickstart · first-run steps
4. https://cursor.com/help/account-and-billing/pricing · Cursor plans help · Hobby description; Auto billing at routed model price
5. https://cursor.com/help/models-and-usage/usage-limits · Cursor usage limits · two pools; "enable on-demand usage or upgrade"; Spending tab
6. https://cursor.com/docs/models-and-pricing · Cursor models & pricing · Start (India) plan; "Daily Agent users: Typically $60–$100/mo"; Cursor Token Rate $0.25/M
7. https://forum.cursor.com/t/why-didn-t-i-get-the-free-two-week-pro-trial/18765 · Cursor forum (community, 2024) · two-week Pro trial existence and confusion
8. https://claude.com · Claude landing · pricing-below-hero structure
9. https://claude.com/pricing · Claude pricing · Free/Pro/Max/Team/Enterprise figures
10. https://claude.com/product/claude-code · Claude Code product page · structure; pricing on product page; testimonials
11. https://code.claude.com/docs/en/quickstart · Claude Code quickstart · install→login→first prompt; paid plan required; first-session approvals
12. https://linear.app · Linear landing · dark default; section order; "40,000+ product teams"
13. https://linear.app/pricing · Linear pricing · Free tier limits
14. https://lex.page · Lex landing · hero, "300,000 writers", eight feature tiles
15. https://lex.page/pricing · Lex pricing · Pro benefits; no prices rendered
16. https://buttondown.com/lex/archive/lex-reminder-early-bird-pricing-ends-tomorrow/ · Lex newsletter (official, 2024-04-29) · Pro $18/mo, $145/yr; redesign
17. https://granola.ai · Granola landing · Before/During/After strip; "Download for free"
18. https://www.granola.ai/pricing · Granola pricing · Basic $0, Business $14, Enterprise $35
19. https://www.granola.ai/blog/granola-free-vs-paid-features-each-plan · Granola blog · "last 30 days" history gate; upgrade trigger
20. https://www.granola.ai/blog/granola-free-trial-get-started · Granola blog · first-run flow; "under 5 minutes"; "past 14 days"
21. https://www.diabrowser.com · Dia landing · "Includes 14 day free trial" under CTA
22. https://www.raycast.com · Raycast landing · hero, section order
23. https://www.raycast.com/pricing · Raycast pricing · Free/Pro/Advanced AI; "Eligible new accounts can start a free Pro trial"
24. https://substack.com · Substack homepage · hero, feed-as-proof, email-first signup
25. https://www.notion.com · Notion landing · "Get Notion free"; structure
26. https://www.notion.com/pricing · Notion pricing · Free AI "Limited Trial"; Plus/Business
27. https://vercel.com · Vercel landing · structure; light/dark variants
28. https://vercel.com/pricing · Vercel pricing · Hobby caps; "$20 included credit"; Hobby cannot buy overage
29. https://v0.app/pricing · v0 pricing · "$5 of included monthly credits"; "7 message/day"; "$2 of free daily credits on login"
30. https://r.jina.ai/https://lovable.dev · Lovable landing (text proxy) · prompt-box hero; structure
31. https://r.jina.ai/https://lovable.dev/pricing · Lovable pricing (text proxy) · daily 5 build credits; expiry rules
32. https://cognition.com/ · Cognition landing · "Get a Demo"; structure
33. https://docs.devin.ai/get-started/devin-intro · Devin intro docs · signup at app.devin.ai; workspace tabs
34. https://docs.devin.ai/admin/billing/self-serve · Devin self-serve plans · Free/Pro $20/Max $200/Teams $80; quotas; on-demand credits roll over
35. https://docs.devin.ai/desktop/accounts/usage · Devin Desktop (Windsurf) plans & usage · ACU definition for enterprise
36. https://docs.devin.ai/admin/billing · Devin billing · enterprise ACU billing
37. https://learn.chatgpt.com/docs · ChatGPT/Codex docs hub · headline, CTA, surface choice
38. https://learn.chatgpt.com/docs/pricing · Codex pricing docs · plan table; five-hour window limits; credit token prices
39. https://learn.chatgpt.com/docs/quickstart · Codex quickstart · first-run flow
40. https://r.jina.ai/https://chatgpt.com/pricing · ChatGPT pricing (text proxy) · Free "Limited Codex access"; Go/Plus/Pro
41. https://amplitude.com/blog/reverse-trial · Verna, reverse trial · definition; "15%" + freemium tail; data-driven length
42. https://www.elenaverna.com/p/trial-configurations-explained · Verna, trial configurations (paywalled, partial) · trials vs freemium framing
43. https://userpilot.com/blog/user-activation-for-saas/ · Userpilot activation benchmarks · 37.5 % avg; AI/ML 54.8 %; MRR correlation
44. https://www.appcues.com/blog/free-to-paid-conversion-strategies · Appcues · trial-model benchmarks; 12 strategies
45. https://www.artisangrowthstrategies.com/blog/freemium-conversion-rate-benchmarks · Artisan (citing OpenView/Userpilot, 1Capture) · freemium 2–5 %; reverse-trial hybrid ~8 %; trial medians
46. https://www.baytechconsulting.com/blog/magic-links-ux-security-and-growth-impacts-for-saas-platforms-2025 · Baytech · passwordless claims and their vendor provenance
47. https://www.authgear.com/post/login-signup-ux-guide/ · Authgear · defer verification; minimal fields
48. https://www.candu.ai/blog/how-notion-crafts-a-personalized-onboarding-experience-6-lessons-to-guide-new-users · Candu (secondary) · Notion onboarding steps
49. https://r.jina.ai/https://medium.com/@nitinmatani22/your-first-devin-session-a-practical-walkthrough-for-developers-who-havent-tried-it-yet-f4be30695dd5 · Medium (secondary, 2026-04-11) · Devin first session; Ask vs Agent; "under ten minutes"
50. https://aitoolscoop.com/tool/lex/ · AIToolScoop (secondary) · Lex free "30 monthly AI checks"; AI feedback description
51. https://felloai.com/is-perplexity-ai-free/ · FelloAI (secondary, 2026-08-19) · Perplexity free limits; Pro $20
52. https://landdding.com/state-of-landing-pages-2026 · Landdding survey (2,257 pages) · 60 %+ dark-dominant; typefaces; demo-converts-better
53. https://www.hostinger.com/tutorials/web-design-trends · Hostinger (2026-08-06) · 2026 trend list
54. https://www.nxcode.io/resources/news/is-cursor-ai-free-plans-limits-worth-upgrading-2026 · NxCode (secondary, 2026-04-01) · "Cursor no longer publishes a fixed public Hobby quota"
55. https://get-alfred.ai/blog/granola-pricing · Alfred (secondary, 2026-06-28) · Granola plan restructuring

Search-snippet sources (result text read, page not fetched): S-1 Lex pricing search (aitools.fyi / ainewsandupdates: $18/mo, $145/yr, 30 checks) · S-2 passwordless completion-rate snippets (mojoauth, vendor) · S-3 Perplexity help center snippet "five Pro Searches per day" (perplexity.ai/help-center article 11187416) · S-4 Lex onboarding snippets ("6 documents", "no onboarding wizard") · S-5 Devin ACU $2.25 snippets · S-6 landing-trend snippet on Instrument Serif · S-7 Codex credit $0.04 and 5-hour-limit news snippets · S-8 Substack 10 % revenue-share snippets.

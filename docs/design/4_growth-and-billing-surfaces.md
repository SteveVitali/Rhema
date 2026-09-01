# Growth and billing surfaces — landing, pricing, signup/onboarding, trial, estimate sheet, usage, billing, settings

- Scope: ledger rows **D12, D13, D15, D18, L5** plus the pricing model as it will appear in the spec (refined from research note 10) · Date: 2026-08-27 · Evidence base: research notes 3, 4, 5, 6, 7, 10; ledger §0 theses and §Q decisions; `~/agent-discourse/conventions/*`.
- Requirement IDs: `REQ-GROWTH-n` (landing, pricing page, signup, onboarding, trial), `REQ-BILL-n` (estimate sheet, usage, credits, Stripe flows), `REQ-ACCT-n` (settings/account). Acceptance-criteria hooks are marked **AC:**.

## Summary of decisions (≤300 words)

1. **Landing page** is one long dark-default page with a real light theme, serif display type on a warm near-black ground, and a **drop-zone hero** ("Drop a draft. Get an editorial board.") backed by a looping real-product recording of a dossier opening with anchored findings. Pricing and per-workflow cost cards sit on the homepage. Motion is limited to product recordings and ≤200 ms reveals; `prefers-reduced-motion` disables both. (Note 6 §2.2, §5.1; Q-14.)
2. **Pricing** is the cent-credit ladder from note 10 with two refinements: tier names **Trial / Pro $20 / Max $100 / Max+ $200 / Team $40 per seat** (no "5×/20×" multiplier names, because 12,000/2,000 ≠ 5), and quality tiers renamed **Standard / Balanced / Frontier** so "Pro" means exactly one thing. Every price is shown as credits *and* dollars; the 1.4× platform rate is published.
3. **Signup** is Google or email magic link, no password, no questionnaire; verification is deferred to the first cost-bearing run. Every account is seeded with a pre-computed **showcase project** so the activation event ("opened a finding and saw its anchor") costs $0. (Note 6 §3, §5.2; T2.)
4. **Trial** is a capped reverse trial: 14 days of Pro features, 600 credits, Standard model only, runs capped at 6,000 words, then a persistent **Reader** tier that can read, edit, import, export and chat on a 10-credit daily allowance but cannot launch heavyweight runs. Exactly one paywall location: the **run-launch estimate sheet**.
5. **Estimate sheet** shows a point estimate, a guaranteed **1.5× cap**, a rigor dial (Quick / Standard / Full board), a model selector, and per-phase deltas; consent is explicit above 500 credits or 25% of balance. Overage is off by default; nothing ever flips a user from limited to billed silently.
6. **Usage** has four zoom levels (account → project → run → phase × role) with a "no token-soup" policy: tokens exist only behind an Advanced disclosure. Cost of record reconciles nightly to the provider Usage & Cost API; the live meter is the SDK estimate.
7. **Billing** rents Stripe (Checkout, Portal, Tax) and owns the credit ledger in Postgres. Failed runs auto-refund. Settings follow a minimal privacy posture (Q-12): export and delete, no DPA at MVP.

---

## 0. Shared vocabulary and conventions used below

| Term | Definition | Source |
|---|---|---|
| **credit** | 1 credit = $0.01 of Rhema usage. Usage = provider list cost of every token and search in a run × 1.4 platform rate, rounded up once per run. Displayed as `1,240 credits ($12.40)`. | Note 10 §5.1 |
| **Standard / Balanced / Frontier** | The curated model-quality tiers (Q-4): Sonnet 5 everywhere / Opus 5 judgment + Sonnet 5 research / Fable 5 judgment + Opus 5 research. Multipliers ≈ 1× / 2.2× / 4.5×. Renamed from note 10's "Standard / Pro / Frontier" to avoid colliding with the Pro plan. | Note 10 §4.5; note 7 §8.2 |
| **Rigor** | Which phases run: **Quick** (intake, argument, craft, letter + rubric; fact-check of the 5 most load-bearing claims; no discourse map, no second read), **Standard** (all phases, second read on), **Full board** (Standard + discourse map + second-read on a *different* model as an oracle). Rigor is orthogonal to model (Factory's "autonomy ⊥ planning" principle, note 4 §4.4). | Note 6 §5.3; note 4 §4.3, §4.6; note 10 §4.3 |
| **Run** | One workflow execution (draft-from-outline, editorial-review, respond-to-review, bootstrap-persona, outline-from-research, research burst). | Ledger K1 |
| **Ask vs Run** | Read-only, cheap actions ("Ask") are visually distinct from cost-bearing actions ("Run") everywhere: Ask = ghost button, no price; Run = filled button with a credit figure inline. | Note 6 §5.2; note 4 §1.2 (Devin Ask/Agent) |
| **Reader** | The persistent free tier after the trial window. | §4 below |

**REQ-BILL-1 (unit).** All user-facing prices, estimates, balances and usage rows display credits with the dollar equivalent, in that order in-app and reversed on marketing pages. Raw tokens never appear outside the Advanced disclosure (§6.4). **AC:** a snapshot test over every billing component asserts the `credits ($x.xx)` format and the absence of the string "tokens" outside `<AdvancedDisclosure>`.

**REQ-BILL-2 (no re-denomination).** The credit's dollar peg never changes. Provider price changes propagate as versioned rate tables with 30 days' notice (note 10 §5.1; the Copilot PRU→credit and Cursor June-2025 lessons, note 3 §3.3, note 10 §2.5). **AC:** `rate_table.version` is immutable and every `usage_event` carries the version it was rated under.

---

## 1. Landing page (D15, B3.1)

### 1.1 Positioning and the decision on visual dialect

Eleven of twelve surveyed product landings are light-default; Linear and Vercel are the dark exemplars (note 6 §2.2). Q-14 fixes dark-by-default. The landing page therefore matches the app (a dark landing that opens into a dark IDE avoids a theme flip at signup — the Linear pattern) and differentiates on **serif display type**, which no coding-agent page uses and which reads as "the written word" (note 6 §2.2 synthesis; Substack counter-weight, note 5 §6). A real light theme ships on day one because the market default is light and academics reviewing on paper-white is a common preference (note 5 §6).

*Rejected:* Claude's "pricing-first, no proof" page (too thin for a new category); Cognition's "Get a demo" page (sales-led); a pure Lovable prompt-box hero with no narrative sections (a multi-phase review cannot be shown in one prompt). (Note 6 §5.1.)

### 1.2 Content outline (twelve sections)

| # | Section | Purpose | Pattern source |
|---|---|---|---|
| 1 | Nav | Product · Workflows · Pricing · Changelog · Docs · Sign in · **Get Rhema free** | Notion CTA verb |
| 2 | Hero (drop-zone) | The user's own draft is the demo | Lovable prompt-hero; Cursor demo-in-hero; Dia trial line |
| 3 | Workflow strip | Outline → Draft → Review → Respond, one screenshot each | Granola Before/During/After |
| 4 | The dossier | Why not ChatGPT: claim ledger, discourse map, independent second read, anchored findings | Linear feature deep-dive |
| 5 | The author's seat | Respond-to-review: triage ledger, ordered moves, response letter, voice guard | — |
| 6 | Personas | Samples/Substack → profile; staleness pill; "a register, not a person" | — |
| 7 | Live runs | Round timeline with phase progress and the cost meter — the IDE shot | Cursor Mission Control |
| 8 | Models | "Stay on the frontier": Standard / Balanced / Frontier, platform-billed | Cursor model strip |
| 9 | Proof | Measured claims at launch; named testimonials when available | Lex / Linear |
| 10 | Pricing | Full tier table + per-workflow cost cards | Claude, Claude Code |
| 11 | Changelog + FAQ | Three shipped items; five questions | Cursor, Linear, Claude |
| 12 | Final CTA + footer | Repeat drop-zone | all |

### 1.3 Section-by-section wireframe and copy direction

**§2 Hero.** Two-column at ≥1024 px, stacked below.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Rhema        Product  Workflows  Pricing  Changelog  Docs     Sign in  [Get Rhema free] │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   An editorial board for                 ┌───────────────────────────────┐   │
│   everything you write.                  │  ▶ looping recording (12 s):  │   │
│   (serif display, 64–88 px)              │  dossier opens; findings fly  │   │
│                                          │  to quoted passages; a claim  │   │
│   Outline, draft, review and revise      │  verdict expands to its URL   │   │
│   with agents that verify every claim.   │                               │   │
│                                          └───────────────────────────────┘   │
│   ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐                                      │
│      Drop a draft (.md .docx .pdf)                                          │
│   │  or paste text — get a review     │   ← drop-zone, dashed, 100% width  │
│                                            of the left column               │
│   └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘                                      │
│   [ Start from scratch ]  [ Upload an outline ]                             │
│   No card. Your first review is included.                                   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

Behaviour: dropping a file *before* signup stores it client-side (IndexedDB, ≤10 MB), routes to `/signup?intent=review`, and after auth lands the user in a new project with the draft ingested (§3.4). The trial-terms line sits under the CTA (Dia pattern). The recording is a real product capture, not an illustration (Landdding 2026: AI landings without a recorded/interactive demo "converted worse", note 6 §2.2).

Copy direction: headline candidates to A/B — *"An editorial board for everything you write."* (note 6 §6 #12) vs *"Your draft, read like it matters."* Sub-line names the four verbs. Never say "AI writing assistant"; the category word is **editorial**.

**§3 Workflow strip.** Four equal columns, each: verb as serif h3, one real screenshot (300×200, dark and light variants), one sentence.

- *Outline* — "Research in chat, then promote it to an outline with a sources ledger."
- *Draft* — "A first draft written to your outline, in your register, with a structure plan you approve first."
- *Review* — "A full board: fact-check with fetched sources, discourse map, an independent second read."
- *Respond* — "Accept, adapt, rebut or defer each finding. The response letter writes itself from your decisions."

**§4 The dossier (deep-dive 1).** Left: 60% screenshot of the editor with margin findings; right: three proof bullets, each a *measurable* claim (E6 transparency floor): "Every finding quotes its passage." · "Every verdict carries a URL that was fetched and read." · "The second read never sees the first reader's notes." Position explicitly against reviewer-theater products: "Independent second read, not a panel of personas" (note 5 §2.2).

**§5 The author's seat (deep-dive 2).** Screenshot of the triage ledger with disposition chips; one line: "You decide. The agent revises. The letter records why."

**§6 Personas.** Screenshot of the persona card with a staleness pill; one line: "Upload samples or link a Substack. Rhema learns the register — and tells you when the profile is stale." (T5.)

**§7 Live runs.** Screenshot of the round timeline with a run card: phase 4/7, "41 claims · 33 verified", "spent 612 of cap 1,860 credits". This is the shot that makes the estimate-and-cap contract visible on the marketing page.

**§8 Models.** A single strip: three quality tiers with a one-line "when": Standard — "blog posts, newsletters, drafts you will rewrite"; Balanced — "essays and long-form; the default"; Frontier — "manuscripts, grant proposals, anything with a venue bar". Provider marks as small monochrome logos ("Powered by Claude" wording is permitted; "Claude Code" is not — note 7 §2.1).

**§9 Proof.** At launch, no logos: substitute four measured stats from the golden runs (e.g., "claims verified per review", "sources fetched", "findings per 1,000 words", "second-read additions"). Replace with named testimonials once available (note 6 §5.1 row 9). Never fabricate logos or quotes.

**§10 Pricing.** The full tier table (§2.2) and the cost-card strip (§2.3) rendered from the same data source as `/pricing` so the two never drift (**REQ-GROWTH-4**).

**§11 Changelog + FAQ.** Three most recent shipped items with dates (signals velocity, Cursor/Linear). FAQ: "How much does a review cost?" · "Which models?" · "Do you train on my writing?" (Q-12 answer: no; provider terms disclosed) · "What can I export?" (Q-9 list) · "What does the free review include?"

**§12 Final CTA.** Repeat the drop-zone with the trial line. Footer: Terms, Privacy, Pricing, Changelog, Status, Contact.

### 1.4 Design tokens for the landing (input to D14)

- **Display:** high-contrast serif (GT Super / Instrument Serif class) for headlines only. **Body/UI:** neutral grotesk (Inter class). **Figures:** tabular, mono for cost and counts. (Note 6 §5.1; note 5 §6–7.)
- **Ground:** warm near-black `#141311`–`#1a1917`; text `#e8e4dc` (paper-toned, not pure white); one accent. Light theme: paper-white ground, same accent, same type. (Note 5 §7.)
- **Theme rule:** detect system, remember the choice, carry it into the app (Linear pattern). The theme toggle sits in the nav; the landing and app share one token set (**REQ-GROWTH-2**).

### 1.5 Motion policy

**REQ-GROWTH-3.** (a) Only two kinds of motion: real product recordings (one per section, looping, muted, ≤15 s, ≤2 MB each as AV1/H.265 with poster frames) and scroll-triggered reveals ≤200 ms, translate ≤12 px, opacity only. (b) No parallax, no cursor-following, no auto-playing audio. (c) `prefers-reduced-motion` replaces recordings with poster frames and disables reveals. (d) Recordings load lazily; the hero recording is the only one above the fold and must start within 1.5 s on a 10 Mbps connection. **AC:** Lighthouse CLS < 0.05; hero LCP < 2.5 s on the mid-tier mobile profile; a reduced-motion browser shows zero `<video>` elements playing.

### 1.6 Landing requirements

- **REQ-GROWTH-1.** Hero drop-zone accepts `.md .txt .docx .pdf .rtf .odt .html` and pasted text; files are held client-side until signup completes, then ingested (I-rows) into a new project. **AC:** a dropped 8k-word `.docx` appears rendered in the editor within 20 s of signup completion, with word count and detected citation-like spans in the right rail.
- **REQ-GROWTH-2.** One theme token set shared by landing and app; system detection + remembered choice; no flash of wrong theme (inline script sets `data-theme` before paint).
- **REQ-GROWTH-3.** Motion policy as §1.5.
- **REQ-GROWTH-4.** Pricing table and cost cards on the homepage and `/pricing` render from a single versioned `pricing.json` served by the API. **AC:** a contract test compares both pages' rendered figures to the ledger's active rate table.
- **REQ-GROWTH-5.** Proof section contains only measured claims or attributed testimonials; a lint rule fails the build on placeholder logos.

---

## 2. Pricing page and the pricing model (D15, L3, Q-5)

### 2.1 Model as it will appear in the spec

Subscription tiers with dollar-denominated credits, included monthly credits ≈ price, prepaid top-ups, one-month rollover, a firm pre-run estimate with a guaranteed cap, and overage off by default. This is note 10's recommendation, confirmed by every product fetched in notes 3, 4, 6 (T7 confirmed thrice), with these refinements:

| Refinement | Decision | Why |
|---|---|---|
| Tier names | **Trial · Pro · Max · Max+ · Team** | Note 10 used "Max 5×/20×"; 12,000/2,000 = 6× and 26,000/2,000 = 13×, so multiplier names would be false. Named tiers plus printed credit numbers are the honest form (Cursor's "3×/20×" opacity was a stated avoid, note 3 §1.3). |
| Quality-tier names | **Standard · Balanced · Frontier** | Avoids "Pro" meaning both a plan and a model tier. |
| Team | Listed with price; CTA "Join the waitlist" at MVP | Q-6 single-author first; pricing shown so buyers can plan; no seat sold until C13 ships. |
| Reader tier | Added explicitly ($0, post-trial, capability-gated, 10 credits/day chat allowance) | Note 6 §5.3 recommended a persistent free tier and a daily micro-grant; note 10 §5.7 rejected daily grants. Decision: a *chat-only* micro-grant (no web research, no runs) bounded at ≈$0.07/day COGS, because a free tier that cannot do anything is churn, and the cost is negligible. Departure from note 10 stated in §Open questions. |
| Annual | 15% off (Pro $17, Max $85, Max+ $170), billed up front | Industry 15–20% (note 10 §2.4 #6). |

### 2.2 The tier ladder (rendered table)

| | **Trial** | **Reader** | **Pro** | **Max** | **Max+** | **Team** |
|---|---|---|---|---|---|---|
| Price | $0, no card | $0 | **$20/mo** · $17 annual | **$100/mo** · $85 annual | **$200/mo** · $170 annual | **$40/seat/mo** |
| Credits | 600, once, expire day 14 | 10/day, chat only, expire nightly | **2,000/mo** | **12,000/mo** | **26,000/mo** | 4,000/seat, pooled |
| Rollover | — | — | 1 month; balance ≤ 2× monthly | 1 month; ≤ 2× | 1 month; ≤ 2× | 1 month; pooled |
| Models | Standard | (chat: Standard) | Standard, Balanced; Frontier at 4.5× | all | all | all |
| Concurrent runs | 1 | 0 | 2 | 5 (priority queue) | 8 (priority queue) | 3/seat |
| Run word cap | 6,000 | — | none | none | none | none |
| Top-ups | no | no | yes | yes | yes | admin |
| Projects / personas | 1 / 1 | unlimited / 1 | unlimited | unlimited | unlimited | shared |
| Export | md, txt | md, txt | all (Q-9 list) | all | all | all |
| Sharing (C13) | — | — | read-only links | read-only links | read-only links | roles |
| What it covers | one full-board Standard review of a ≤3k-word piece, or one blog loop | reading, editing, inspecting, chatting | ≈3 essay loops on Standard, ≈1.4 on Balanced | ≈1 academic loop on Frontier or 4 on Balanced | ≈1 long-paper Frontier loop | pooled |

"What it covers" rows are computed from §2.3 and must be regenerated from `pricing.json`, never hand-edited (**REQ-GROWTH-4**).

Top-up packs (Pro and above): $10 → 1,000 · $50 → 5,250 · $200 → 22,000; expire 12 months; prepaid only. Top-ups drain *after* included credits (included credits expire first, so rollover math stays simple). (Note 10 §5.2; Claude's prepaid model.)

### 2.3 Per-workflow cost-range cards

Rendered as a strip of cards under the tier table. Each card is one *piece shape*; inside, one row per workflow; each row shows a **range** across quality tiers (Codex's honesty device — publish ranges, note 4 §2.4). Figures are note 10 §5.4 (list × 1.4, rounded); the Standard/Balanced/Frontier triple is the tooltip.

```
┌ Blog post · ~2,000 words · ~5 claims ──────────┐  ┌ Essay · ~5,000 words · ~20 claims ────────────┐
│ Draft from outline     190 – 830 cr  ($1.90–8.30) │  │ Draft from outline     400 – 1,830 cr          │
│ Editorial review       250 – 1,100               │  │ Editorial review       560 – 2,520             │
│ Respond to review      220 – 990                 │  │ Respond to review      450 – 2,070             │
│ Full round             650 – 2,900               │  │ Full round           1,410 – 6,420             │
│ ▸ Standard 650 · Balanced 1,500 · Frontier 2,900 │  │ ▸ 1,410 · 3,290 · 6,420                        │
└──────────────────────────────────────────────────┘  └────────────────────────────────────────────────┘
┌ Academic paper · ~8,000 words · ~45 claims ─────┐  ┌ Long paper · ~15,000 words · ~70 claims ──────┐
│ Draft from outline     830 – 3,830               │  │ Draft from outline   1,460 – 6,890             │
│ Editorial review     1,240 – 5,750               │  │ Editorial review     2,080 – 9,730             │
│   · fact-check off     330 – 1,160               │  │ Respond to review    1,570 – 7,420             │
│ Respond to review      900 – 4,220               │  │ Full round           5,110 – 24,030            │
│ Full round           2,970 – 13,790              │  │                                                │
└──────────────────────────────────────────────────┘  └────────────────────────────────────────────────┘
┌ Persona bootstrap · 50k-word corpus ────────────┐   Quick Review (trial default, ≤3k words, Standard):
│                        310 – 1,510               │   ≈ 180 credits (modeled; A7 to confirm)
└──────────────────────────────────────────────────┘
```

Under the strip, one sentence: "Ranges span Standard to Frontier quality at Standard rigor. Your exact estimate and a guaranteed cap appear before every run." (**REQ-GROWTH-6.**)

### 2.4 What is included (feature matrix beneath the ladder)

Grouped as writers think, not as engineers do: **Write** (editor, autosave, versions, export formats) · **Review** (rigor levels available, second-read oracle on Full board, claim ledger) · **Voice** (personas, samples, Substack/Medium linking, refresh) · **Run** (concurrency, priority queue, word caps) · **Account** (rollover, top-ups, sharing, roles). Trial and Reader columns are honest about what they cannot do; the gate is capability, never data (nothing is deleted at trial end — note 6 §5.3 #5).

### 2.5 FAQ — including "why does a review cost $X"

1. **Why does a review of my 8,000-word paper cost about $12?** "A full-board review reads your draft several times — once per phase and once in an independent second read that never sees the first reader's notes — and fetches and reads the sources behind every checkable claim. Most of the cost is re-reading context, not writing (about three-quarters). The biggest driver is the number of claims: each verified claim costs roughly **24 credits on Standard** and **112 on Frontier**. A 45-claim paper on Standard is therefore ≈1,240 credits; turning fact-check off drops it to ≈330." (Figures from note 10 §4.2–4.3 × 1.4.) The answer ends with a link to the estimate-sheet explainer.
2. **What is a credit?** "One cent of usage. We charge provider list rates plus 40% for hosting, research tooling and the editorial harness. The rate table is public and versioned; changes come with 30 days' notice."
3. **What if a run costs more than the estimate?** "You never pay more than the cap shown before you start (1.5× the estimate). If we underestimate, we absorb the difference."
4. **What happens when I run out?** "Runs pause at the estimate sheet, which offers a cheaper rigor or model, a top-up, or an upgrade. We never bill your card automatically unless you turn on auto-reload and set a monthly cap."
5. **Do failed runs cost anything?** "No. A run that fails or is refused refunds its credits automatically. Partial results stay."
6. **Do you train on my writing?** Q-12 posture: "No. Your content is processed by model providers under their commercial API terms, which we list in our privacy policy."
7. **Can I use my own API key?** "Not yet. Planned for v1.1 on paid plans at a 15% platform rate." (Note 10 §5.6; note 7 §8.4 says v2 — spec resolves to "after MVP, not before C13".)
8. **Who is eligible for the trial?** "New accounts with a verified Google login or email. One trial per person." (Stated once, in one line, so eligibility is never a surprise — note 6 §5.4.)

### 2.6 Pricing page requirements

- **REQ-GROWTH-6.** Cost cards show ranges on marketing pages and never a single number; the estimate sheet shows point + cap. **AC:** no marketing string matches `/^\d[\d,]* credits$/` without a range or the word "≈".
- **REQ-GROWTH-7.** Tier table includes Reader and Trial columns with explicit capability gates; Team shows price and a waitlist CTA until C13 ships.
- **REQ-GROWTH-8.** Annual toggle re-renders prices and shows the 15% saving in absolute dollars.
- **REQ-GROWTH-9.** The FAQ's "why does a review cost $X" answer is generated from the same cost model constants (`cost_per_verified_claim[tier]`) as the estimate service (L11), so marketing and product never disagree.

---

## 3. Signup and onboarding (D15, B3.3)

### 3.1 Signup

**Decision:** Google OAuth + email magic link. No password, no confirm-password, no questionnaire, no card. Apple Sign-In added when the mobile app (D19) ships. Auth is Better Auth, self-hosted (note 10 §9).

*Rejected:* Notion-style use-case survey before the product (Rhema's three entry points *are* the segmentation and happen in-product); card at signup (kills top-of-funnel for a new category; the 50–75% opt-out figure is conversion *of survivors*, note 6 §4.2, §5.2); password-first (highest documented friction, note 6 §3.2).

```
┌───────────────────────────────┐
│  Rhema                        │
│                               │
│  [ G  Continue with Google ]  │
│  ──────── or ────────         │
│  email@address                │
│  [ Send me a sign-in link ]   │
│                               │
│  No password. No card.        │
│  By continuing you agree to   │
│  the Terms and Privacy.       │
└───────────────────────────────┘
```

Magic-link screen after send: "Check your inbox — the link works for 15 minutes. Meanwhile, here's the worked example →" with a read-only, logged-out preview of the showcase dossier (so the wait is not empty).

### 3.2 Deferred verification

**REQ-GROWTH-10.** Google users are verified by OAuth. Magic-link users are verified by clicking the link (that *is* signup). No separate "verify your email" step exists. What *is* deferred is the **trial credit unlock**: credits become spendable at the first cost-bearing action, which triggers (a) disposable-domain check, (b) device/IP fingerprint and ASN score, (c) one-trial-per-fingerprint rule. Phone verification is requested only when the risk score exceeds a threshold. (Note 6 §3.2, §5.4; note 10 §8.) **AC:** a new account can read, edit and inspect the showcase project without any verification event; the first `Run` click on a non-showcase project emits `trial.unlock_attempted` and either `trial.unlocked` or `trial.challenge_required`.

### 3.3 The $0 activation: the showcase project

Every new workspace ships with **"Welcome — a worked example"**: a ~2,000-word essay's outline, v1, full-board review dossier (claim ledger with URLs, discourse report, second-read reconciliation, editor's letter, rubric), triage ledger, v2 and response letter. Pre-computed once; copied per account at $0 marginal cost. The first screen after signup is that project's **timeline** with the dossier open and the first finding selected, so the user sees a finding anchored to its passage within 60 seconds (T1, T2; note 6 §5.2).

Showcase rules: read-only artifacts (badge: "Worked example — can't be edited; duplicate to play"); "Duplicate" copies it as a normal project; runs on the showcase are blocked with an inline explanation; the showcase can be archived from the project list but not deleted (it is re-creatable from Settings → "Restore worked example"). (**REQ-GROWTH-11.**)

### 3.4 Three entry points

After the showcase, the empty-state card in the project list:

```
┌ New project ───────────────────────────────────────────────────────┐
│  [ Start from scratch ]   [ Upload an outline ]   [ Upload a draft ] │
│  chat & research first    draft v1 from it        get a review        │
│                                        Or explore the worked example →│
└────────────────────────────────────────────────────────────────────┘
```

A hero-dropped file skips this card and lands directly in "Upload a draft" with the file already ingested (§1.3).

### 3.5 First-five-minutes script

| Minute | Start from scratch | Upload an outline | Upload a draft |
|---|---|---|---|
| 0–1 | Chat pane opens *inside* the empty project (assistant role, Standard model). Placeholder: "What are you writing, for whom, and where will it appear?" First reply is tool-less (no research until asked). | File ingested → editor shows it; right rail: "Outline detected: 7 sections · ~4,200 target words". | File ingested → editor; right rail: "Draft detected: 3,100 words · 12 citation-like spans". |
| 1–3 | Three chips: **Research this** (shows "≈ 25 credits" before running), **Propose a structure** (Ask), **Make an outline** (Run, ≈ 15 credits). | One primary Run button: **Draft v1 from this outline** with estimate; persona picker (default none). Trial shows **Draft the first section (preview, ≈ 60 credits)** instead of the full draft. | One primary Run button: **Review this draft** → estimate sheet (§5) with rigor defaulted to Quick on trial, Standard on paid. |
| 3–5 | "Make an outline" → `outline-from-research` run (note 5 §5); outline artifact lands on the timeline; the next-step button becomes "Draft v1". | First section streams into the editor; the structure-plan gate appears as an inline card, **pre-approved for the trial preview** (no first-run stall), with a 10-minute auto-proceed on paid (C7). | Findings stream as margin cards; first finding visible in < 90 s (intake + craft first). |
| Verification/unlock | At the first Run click (§3.2). | same | same |

Rules (note 6 §5.2): the first session is maximally interruptible (every gate on, Q-7) but every gate is pre-filled with the recommended answer so one click continues; Ask and Run are visually distinct everywhere; no modal tours — coaching is inline, dismissible, and appears at most once per surface (**REQ-GROWTH-12**). **AC:** median time from signup-complete to "first finding rendered" on the Upload-a-draft path ≤ 4 minutes in the golden-run test; zero modals on first load.

---

## 4. Trial experience (D18)

### 4.1 Shape: a capped reverse trial

| Parameter | Value | Rationale |
|---|---|---|
| Window | 14 days of Pro features | Verna's reverse trial; Pro features expose the T2 killer UI (note 6 §4.2, §5.3) |
| Grant | 600 credits, one-time, expire day 14 | ≈ $4.30 list COGS — the ≤$4 ceiling that makes reverse-trial conversion pencil out (note 6 §5.3; note 10 §5.7) |
| Model | Standard only | 4.5× cost containment; Balanced/Frontier shown but locked with price |
| Rigor | Any, including Full board | **Departure from note 6** (which proposed reduced-depth only): the activation moment is the full dossier with a second read; cost is bounded by the word cap instead. A ≤3k-word Full-board Standard review ≈ 350 credits. Quick is the *default* on trial so a long draft still fits. |
| Word cap per run | 6,000 words | Bounds the worst case at ≈ 600 credits on Standard Full board |
| Draft-from-outline | first section only (≈ 800 words) | Preview, not full (note 6 §5.3 #3) |
| Persona bootstrap | not available; static example shown | Most expensive, least visible run |
| Concurrency | 1 | fraud tripwire + cost |
| Daily allowance | none during trial (the 600 covers chat) | — |
| After day 14 | **Reader** tier: read, edit, import, export md/txt, inspect any artifact, chat on 10 credits/day (nightly expiry, chat-only, no web research) | Loss-aversion lever is capability, never data (note 6 §5.3 #5); Granola's history-hostage gate rejected |
| Card | never required to start; required to buy credits, subscribe, or exceed the grant | Vercel Hobby rule: free cannot buy overage without upgrading (note 6 §4.1) |

### 4.2 Trial state machine

```
signup ──► trial_pending (credits locked) ──first Run click──► unlock check
                                                                │
                                   ┌── pass ──► trial_active (600 cr, day 0..14)
                                   └── challenge ──► phone/OTP ──► trial_active | trial_denied
trial_active ──credits = 0──► trial_exhausted (Pro features until day 14, no runs)
trial_active | trial_exhausted ──day 14──► reader
any ──subscribe──► pro | max | maxplus
```

The two exit banners:
- `trial_exhausted`: "You've used your trial credits. You can keep reading, editing and exporting; runs need a plan." [Upgrade to Pro — $20/mo] [Compare plans]
- Day-12 email and in-app card: "Your Pro features end in 2 days. Your projects stay." (Appcues strategy #10, note 6 §5.5.)

### 4.3 Paywall placement

**REQ-GROWTH-13.** The paywall exists in exactly one place: the **run-launch estimate sheet** (§5). When the estimate's cap exceeds the spendable balance, the sheet's primary button becomes **Upgrade to Pro** (Trial/Reader) or **Add credits** (paid), and the sheet offers cheaper alternatives first (lower rigor, Standard model, phase off). Never mid-run (a running run always finishes and reconciles); never on reading, editing, inspecting or exporting. **AC:** grep of the app for `<Paywall` finds exactly one mount point; an integration test starts a run with a 1.4× estimate error and asserts it completes without any user prompt.

### 4.4 Upgrade prompts (all contextual, none modal-on-load)

1. **The estimate sheet** (§4.3).
2. **End-of-review card** after a trial review: "Quick Review found 14 issues. The full board adds fact-checking of every claim, a discourse map and an independent second read — which typically finds about a third more." The "third more" figure is the skill README's own claim and **must be re-measured in-product before shipping** (note 6 §Open questions); until then the card says "adds …" without a number. (**REQ-GROWTH-14.**)
3. **Day-12 email + in-app card** (§4.2).
4. **Locked controls** in the estimate sheet: Balanced/Frontier and >6,000-word runs are visible with their price and a lock glyph, tooltip "Available on Pro". Locked controls are the only place a plan name appears in the IDE.

*Rejected:* interstitials on project open; a persistent "Upgrade" nav button (a small plan pill in the account menu suffices); nagging on export (export is a trust feature, Q-9).

### 4.5 Trial abuse controls

**REQ-GROWTH-15.** Verified identity before spend; disposable-domain list; device fingerprint + IP ASN scoring; one trial per fingerprint; trial runs Standard-only, 1 concurrent, ≤6,000 words; per-account daily spend ceiling in trial (600 by construction); workspace-level kill switch; the eligibility rule stated in one line on the pricing page. (Note 6 §5.4; note 10 §8.) **AC:** a second signup from the same fingerprint lands in `trial_denied` with the copy "This device has already used a trial"; the kill switch zeroes all trial balances within 60 s.

---

## 5. The run-launch estimate sheet (L6, K4, D12)

This is the single most important billing surface: it is the paywall, the consent gate, the rigor dial, and the place the estimate-and-cap contract is made. No competitor guarantees a price before an agentic run (note 10 implications #2; Replit backlash, note 3 §4.4, note 10 §2.5).

### 5.1 Wireframe (desktop; mobile shows the same sheet as a bottom drawer with the Advanced section collapsed)

```
┌ Review this draft ─────────────────────────────────────────────── ✕ ┐
│  v2 · 5,180 words · 21 checkable claims (found in 4 s)               │
│                                                                      │
│  Rigor       ○ Quick        ● Standard        ○ Full board           │
│              intake, craft, all phases,       + discourse map,       │
│              5 key claims   second read       second read on         │
│                                               a different model      │
│                                                                      │
│  Model       ● Standard     ○ Balanced        ○ Frontier   🔒 Pro    │
│              Sonnet-class   Opus-class judg.  Fable-class judgment   │
│              1×             2.2×              4.5×                   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  Estimate   ≈ 560 credits ($5.60)                            │    │
│  │  Cap        840 credits ($8.40) — you never pay more         │    │
│  │  Balance    1,430 credits → 590 after cap                    │    │
│  │  Time       ~25–40 min · you'll be notified                  │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ▸ Advanced: phases and budget                                       │
│     ☑ Fact-check every claim         −380 cr if off                  │
│     ☑ Discourse map                  +140 cr (Full board only)       │
│     ☑ Independent second read        −90 cr if off                   │
│     Venue bar   [ Essay for a general magazine      ▾ ]              │
│     Stage       [ Late draft — line-level welcome   ▾ ]              │
│     Budget cap  [ 840 ] credits (min = estimate; ≤ balance)          │
│     Gates       ● Three named gates  ○ Every phase  ○ Run to end     │
│     ☐ Don't ask me to confirm runs under 1,000 credits               │
│                                                                      │
│  ▸ Why this estimate?  21 claims × 24 cr ≈ 500 · 5,180 words ≈ 60   │
│                                                                      │
│                      [ Ask a question first ]   [ Run review · 560 ] │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.2 Interaction spec

1. **Open.** Any Run affordance (timeline "next step" button, command-palette verb, chat `/review`) opens the sheet. On open, the estimator runs a cached **claim-count pre-pass** (Haiku-class, ≈ 5 credits COGS, absorbed by Rhema, cached per draft version) and reads word count from the editor (note 10 §5.5 #1). Until it returns, the estimate shows a skeleton and the Run button is disabled (≤ 5 s).
2. **Levers.** Rigor and Model are the two first-class controls; each change re-computes estimate, cap, and time within 100 ms from the parametric model (note 10 §4). Advanced toggles show their **delta** next to them so the user sees the price of each phase (note 10 implications #4).
3. **Defaults.** Rigor: Quick on Trial, Standard on paid; Full board remembered per project once chosen. Model: the account default (§8.2) or the project override. Gates: "Three named gates" (Q-7; note 4 §6.1).
4. **Cap.** `cap = ceil(1.5 × estimate)`, editable *upward* only (a user may set a bigger budget) and never below the estimate. The cap is passed to the harness as `maxBudgetUsd` (note 7 §3.1) and to the ledger as a `hold`.
5. **Consent.** If `estimate > 500` or `estimate > 0.25 × spendable_balance`, the Run button is labelled "Confirm and run · 560" and requires a second click on a confirmation line ("This will hold 840 credits"). The per-user opt-out "Don't ask under 1,000 credits" removes the second click below that figure only (note 10 §5.5 #3).
6. **Insufficient balance** (`cap > spendable_balance`): the estimate box turns to a resolution panel with, in order: (a) **Lower the rigor** (shows new estimate), (b) **Use Standard model**, (c) **Turn off fact-check**, (d) **Add credits** / **Upgrade to Pro**. The primary button becomes the cheapest option that fits; the upgrade button is secondary unless nothing fits. Never silently bill (note 10 §5.5 #5).
7. **Run.** On click: ledger `hold(cap)`; the sheet closes; the run card appears on the timeline with "spent 0 / cap 840". The estimate, cap, rigor, model, and phase set are frozen on the run record and shown in the run report later (§6.3).
8. **"Why this estimate?"** expands to the formula in words: claims × cost-per-claim[model] + words × read-cost[model] + fixed phase costs, with the cost-per-claim constant shared with the pricing FAQ (**REQ-GROWTH-9**).
9. **Ask a question first** opens the side chat in read-only mode against the draft (Devin side-chat pattern, note 4 §1.2) without closing the sheet's state.
10. **Trial specifics.** Balanced/Frontier locked with prices; word cap enforced with the message "Trial runs are limited to 6,000 words — this draft is 7,900. Review the first 6,000 words, or upgrade." (Partial-review option keeps the flow alive.)

### 5.3 Estimate accounting and the cap guarantee

| Event | Ledger effect | User sees |
|---|---|---|
| Run starts | `hold(cap)` | "holding 840" in the balance chip tooltip |
| Each phase completes | `debit(actual_phase_cost)` against the hold | "spent 312 / cap 840" on the run card |
| Run ends under cap | `release(cap − actual)` | "cost 598 · 242 released" |
| Run exceeds cap (our estimate error) | debits stop at cap; `adjustment(absorbed, −overage)` internal | "cost 840 (capped) — you were not charged for the overrun" |
| Run fails / is refused / cancelled by us | `refund(debited)`; hold released | "refunded 312 credits; partial results kept" |
| User cancels mid-run | debit phases completed; release rest | "cost 312 for 3 completed phases" |
| Provider outage mid-run | phase retried from files (K7); no double debit (idempotent `event_id`) | run card shows "retrying phase 4" |

**REQ-BILL-3 (cap guarantee).** `sum(debits for run) ≤ cap` is a database constraint, not a UI rule. **AC:** a fault-injection test that inflates provider usage 3× produces debits equal to the cap and an `adjustment` row; the user's balance is unchanged beyond the cap.

**REQ-BILL-4 (consent thresholds).** Explicit confirm above 500 credits or 25% of spendable balance; per-user threshold override up to 1,000. **AC:** unit tests on the threshold function; an e2e test that a 501-credit estimate requires two clicks.

**REQ-BILL-5 (phase deltas).** Every toggle in Advanced shows a signed credit delta computed from the same estimator. **AC:** toggling fact-check off on the 8k/45 golden draft (Standard) changes the estimate from ≈1,240 to ≈330 ± 10%.

**REQ-BILL-6 (freeze).** The run record stores `estimate, cap, rigor, model_tier, phases[], rate_table_version, claim_count, word_count` at launch; the run report (§6.3) shows estimate vs actual.

**REQ-BILL-7 (estimator calibration).** The estimate service (L11) re-fits its parameters weekly from ledger telemetry per workflow × rigor × model; the cap multiplier stays 1.5 until the 95th-percentile actual/estimate ratio over the trailing 30 days is < 1.3, at which point it may drop to 1.35 (never below 1.25). Variance reserve accrues as `adjustment` rows and is reported in the margin dashboard (internal).

---

## 6. Usage dashboard (D12, L5, T7)

### 6.1 Detail policy: "no token-soup"

The policy has four levels; each level answers one question and nothing more. Tokens exist only at the bottom of level 4 behind an explicit disclosure. This mirrors Claude Code's `/usage` attribution (skills/subagents as percentages with behaviour flags at ≥10%) and Devin's Session Insights (four KPIs, three tabs), and rejects Cursor's per-request token tables as the default view (note 4 §3.6, §1.2, §6.5; note 10 §7.6).

| Level | Surface | Question answered | Shows | Never shows |
|---|---|---|---|---|
| 0 | **Balance chip** (app shell, always visible) | "Can I afford the next run?" | spendable credits, held credits on hover, days to reset | anything else |
| 1 | **Account** (`/usage`) | "What did this month cost me and where?" | period bars (included vs top-up vs held), totals in credits + $, by-project table, by-workflow donut, alerts | tokens, models, phases |
| 2 | **Project** (`/p/:id/usage`) | "What has this piece cost across rounds?" | runs list with cost/duration/status, cost by round, cost by agent role (author/editor/researcher/persona), per-project cap | tokens |
| 3 | **Run report** (`/p/:id/runs/:runId`) | "Why did this run cost what it cost?" | estimate vs actual, phase bars, role split, **flags**, claims verified × cost/claim, suggested guidance for next round | tokens (default) |
| 4 | **Phase × role drill-down** (inside the run report) | "Which phase, which agent, which model?" | table phase × role × model tier × credits × duration × searches × fetches; **Advanced** disclosure → tokens by kind and provider usage IDs | prompts, private memory, transcript text (E-rows, T3) |

**Flags** (level 3) are computed rules, shown as chips with one sentence each, when a cause accounts for ≥ 20% of a run's cost or the run deviates from its estimate by ≥ 25%:

- `fact_check_dominated` — "Fact-check was 62% of this run: 71 claims verified."
- `long_draft` — "This draft is 14,800 words; read cost scales with length."
- `discourse_map` — "The discourse map added 18%."
- `second_read_model` — "The second read ran on Frontier (oracle) — 21%."
- `over_estimate` — "Actual was 1.31× the estimate; the claim pre-pass found 21 claims but the reviewer verified 34."
- `under_estimate` — "Actual was 0.6× the estimate; 240 credits released."
- `retries` — "Phase 4 was retried once after a provider error; you were not charged twice."

### 6.2 Wireframes

**Level 1 — account usage**

```
┌ Usage ─────────────────────────────────────────────  This cycle ▾  Jul 28 – Aug 27 ┐
│ Included  ████████████████░░░░░░░░  1,410 / 2,000     Top-ups  ███░░░░  620 / 1,000 │
│ Held 840 (1 run in progress)   ·   Rolls over on Aug 28: up to 590   ·   Reset in 1 d │
│                                                                                     │
│ Spent 2,030 credits ($20.30)          ┌ by workflow ──────────┐                     │
│ ┌ by project ───────────────────────┐ │ Review 58% · Draft 27% │                     │
│ │ Structure of political difference │ │ Respond 11% · Chat 4%  │                     │
│ │   1,240 · 3 runs · 2 rounds      ▸│ └────────────────────────┘                     │
│ │ On bureaucracy (Substack)         │                                                 │
│ │     650 · 4 runs · 2 rounds      ▸│  Alerts: 50% ✓ sent Aug 12 · 80% — · 100% —   │
│ │ Chat (no project)         140    ▸│                                                 │
│ └───────────────────────────────────┘  [ Download CSV ]  [ Manage plan ]             │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Level 2 — project usage**

```
┌ Structure of political difference · Usage ─────────────────────────────────────────┐
│ Total 1,240 credits ($12.40) across 2 rounds     Cap this month: none  [set]        │
│ By role   Editor 64% · Author 29% · Researcher 5% · Persona 2%                       │
│ ┌ Runs ────────────────────────────────────────────────────────────────────────────┐ │
│ │ Aug 26  Review v2        Standard · Full board   598 (est 560, cap 840)  41 min ▸│ │
│ │ Aug 20  Respond v1→v2    Standard · Standard     412 (est 450)           33 min ▸│ │
│ │ Aug 14  Review v1        Standard · Standard     230 (est 250)           22 min ▸│ │
│ └──────────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Level 3/4 — run report**

```
┌ Review v2 · Aug 26 · Standard model · Full board ──────────────────────────────────┐
│ Cost 598 credits ($5.98)   Estimate 560   Cap 840   Released 242   Duration 41 min   │
│ Flags  [fact-check dominated 62% · 34 claims]  [over-estimate 1.07×]                 │
│                                                                                      │
│ Phases                                              Roles                            │
│ Intake          ▏   18                              Editor      ████████████  512     │
│ Fact-check      ████████████████  371               Researcher  ██  64               │
│ Discourse map   ████  92                            Second read ▏  22                │
│ Argument        ██  41                                                               │
│ Craft           ██  38                                                               │
│ Second read     ▏  22   (oracle: Balanced)                                           │
│ Letter + rubric ▏  16                                                                │
│                                                                                      │
│ What drove it   34 verified claims × ~11 cr = 371 · 5,180 words read 3× ≈ 90 · …    │
│ Next round      "12 findings were copy-edits; consider Quick rigor for v3."          │
│                                                                                      │
│ ▸ Advanced  phase × role × model · tokens in/cache-write/cache-read/out · searches · │
│             provider usage IDs · rate table v7                                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

Phase names are the orchestrator's (K1), never agent-authored checklists (note 4 implication #9). Role names are the agent-types (F2): author, editor, researcher (research subagents under either), persona (bootstrap), assistant (chat).

### 6.3 Data contracts (TypeScript)

```ts
// ---- capture (L4) ----------------------------------------------------------
type Role = 'author' | 'editor' | 'researcher' | 'persona' | 'assistant';
type QualityTier = 'standard' | 'balanced' | 'frontier';
type Rigor = 'quick' | 'standard' | 'full_board';
type Workflow = 'draft_from_outline' | 'editorial_review' | 'respond_to_review'
  | 'bootstrap_persona' | 'outline_from_research' | 'research_burst' | 'chat';
type PhaseId =
  // editorial-review
  | 'intake' | 'fact_check' | 'discourse' | 'argument' | 'craft' | 'second_read' | 'letter'
  // draft-from-outline
  | 'brief' | 'structure_plan' | 'grounding' | 'drafting' | 'fidelity_audit' | 'drafting_note'
  // respond-to-review
  | 'triage' | 'reverify' | 'revise' | 'gap_analysis' | 'response_letter'
  // persona / research / chat
  | 'census' | 'corpus_fanout' | 'profile' | 'calibration' | 'research' | 'outline' | 'turn';

interface UsageEvent {                     // one per provider call; append-only
  event_id: string;                        // idempotency key = provider request id
  ts: string;                              // ISO-8601
  account_id: string; org_id?: string; project_id?: string; run_id?: string;
  workflow: Workflow; phase_id: PhaseId; role: Role;
  agent_instance_id: string;               // 'main' | 'subagent-<n>'
  provider: 'anthropic' | 'openai' | 'google'; model: string; quality_tier: QualityTier;
  tokens: { input: number; cache_write: number; cache_read: number; output: number };
  searches: number; fetches: number;
  list_cost_usd: number;                   // rated from rate_table at capture
  credits: number;                         // list_cost_usd × platform_rate × 100, unrounded
  rate_table_version: number;
  source: 'sdk_estimate' | 'provider_report'; // §6.5 reconciliation
}

// ---- ledger (L2, L4) --------------------------------------------------------
type LedgerKind = 'grant' | 'hold' | 'debit' | 'release' | 'refund' | 'expire' | 'adjustment';
interface LedgerRow {
  row_id: string; account_id: string; ts: string; kind: LedgerKind;
  credits: number;                         // signed; integer
  bucket: 'included' | 'topup' | 'trial' | 'daily' | 'promo';
  expires_at?: string;                     // grants only
  run_id?: string; phase_id?: PhaseId;     // debits/holds/releases/refunds
  reason?: 'cap_absorbed' | 'run_failed' | 'run_refused' | 'cancelled' | 'support' | 'chargeback';
  stripe_ref?: string;                     // invoice / checkout session id for grants
}
interface Balance {                        // materialized per account, refreshed transactionally
  account_id: string; spendable: number; held: number;
  by_bucket: Record<LedgerRow['bucket'], { credits: number; expires_at?: string }>;
  cycle: { start: string; end: string; included_granted: number; included_spent: number };
  rollover_projection: number;             // min(unspent_included, monthly_included) capped so balance ≤ 2× monthly
}

// ---- estimate (L6, L11) -----------------------------------------------------
interface EstimateRequest {
  project_id: string; draft_version: number; workflow: Workflow;
  rigor: Rigor; quality_tier: QualityTier;
  phases: Partial<Record<PhaseId, boolean>>;  // advanced overrides
  venue_bar?: string; stage?: 'early' | 'late' | 'final';
}
interface Estimate {
  estimate_credits: number; cap_credits: number;     // cap = ceil(1.5 × estimate)
  time_minutes: [number, number];
  inputs: { word_count: number; claim_count: number; claim_count_source: 'prepass' | 'manual' };
  deltas: Array<{ phase_id: PhaseId; on: boolean; delta_credits: number }>;
  explain: Array<{ label: string; credits: number }>;   // "34 claims × 11", "5,180 words × 3 reads"
  consent_required: boolean; consent_reason?: 'over_500' | 'over_25pct_balance';
  affordable: boolean; alternatives?: Array<{ change: string; estimate_credits: number; cap_credits: number }>;
  rate_table_version: number; estimator_version: string;
}

// ---- dashboard read models (D12) --------------------------------------------
interface AccountUsage {                   // level 1
  period: { start: string; end: string };
  balance: Balance;
  spent_credits: number; spent_usd: number;
  by_project: Array<{ project_id: string | null; title: string; credits: number; runs: number; rounds: number }>;
  by_workflow: Array<{ workflow: Workflow; credits: number; share: number }>;
  alerts: Array<{ threshold: 50 | 80 | 100; sent_at?: string }>;
}
interface ProjectUsage {                   // level 2
  project_id: string; total_credits: number; rounds: number; monthly_cap?: number;
  by_role: Array<{ role: Role; credits: number; share: number }>;
  runs: Array<RunSummary>;
}
interface RunSummary {
  run_id: string; started_at: string; workflow: Workflow; rigor: Rigor; quality_tier: QualityTier;
  status: 'queued' | 'running' | 'waiting_gate' | 'completed' | 'failed' | 'cancelled' | 'refunded';
  estimate_credits: number; cap_credits: number; actual_credits: number; released_credits: number;
  duration_s: number;
}
interface RunReport extends RunSummary {  // level 3
  flags: Array<{ code: 'fact_check_dominated' | 'long_draft' | 'discourse_map' | 'second_read_model'
    | 'over_estimate' | 'under_estimate' | 'retries'; share?: number; text: string }>;
  phases: Array<{ phase_id: PhaseId; credits: number; duration_s: number; retried: boolean; quality_tier: QualityTier }>;
  roles: Array<{ role: Role; credits: number; share: number }>;
  drivers: Array<{ label: string; credits: number }>;         // "34 verified claims × ~11"
  claims: { found_prepass: number; verified: number; cost_per_claim: number };
  guidance_suggestions: string[];                              // Devin insights analogue (D20)
  advanced: RunAdvanced;                                       // fetched lazily on disclosure open
}
interface RunAdvanced {                    // level 4 — behind the disclosure
  cells: Array<{ phase_id: PhaseId; role: Role; agent_instance_id: string; model: string;
    credits: number; duration_s: number; searches: number; fetches: number;
    tokens: UsageEvent['tokens'] }>;
  provider_request_ids: string[]; rate_table_version: number;
  reconciliation: { status: 'pending' | 'matched' | 'drift'; drift_pct?: number; reconciled_at?: string };
}
```

### 6.4 Detail-policy requirements

- **REQ-BILL-8 (levels).** The four levels exist as separate routes/components; each level's read model contains only the fields listed in §6.1. **AC:** `AccountUsage` and `ProjectUsage` types have no `tokens` field; `RunReport.advanced` is loaded only on disclosure open (network test).
- **REQ-BILL-9 (flags).** Flags are computed server-side by the rules in §6.1; each has a one-sentence template with the numbers filled in. **AC:** golden run "review 8k/45 Standard" yields `fact_check_dominated` with share within ±5% of the parametric model.
- **REQ-BILL-10 (privacy of the drill-down).** No level exposes prompts, private agent memory, transcript text, or source-note bodies (E-rows, T3); the Advanced disclosure shows counts and identifiers only. **AC:** a redaction test on `RunAdvanced` serialization.
- **REQ-BILL-11 (export).** Levels 1–2 export CSV; Team invoices attach a ledger CSV (note 10 §7.7).
- **REQ-BILL-12 (mobile).** Levels 0–1 and the run report's header (cost, estimate, flags) are available read-only on mobile (D19); no plan changes on mobile (note 5 §8).

### 6.5 Estimate vs record: reconciliation

The SDK's `total_cost_usd` and `modelUsage` are client-side estimates; Anthropic states "Do not bill end users … from these fields" (note 7 §3.1, §11 A5). Therefore:

- The **live meter** (run card "spent X / cap") and same-day ledger debits are rated from SDK `modelUsage` with `source = 'sdk_estimate'`.
- A **nightly job** pulls the provider Usage & Cost report (Anthropic Admin usage/cost API or the AWS Marketplace CCU line for Claude Platform on AWS; AI SDK `usage` for other providers), matches by request id, and writes `provider_report` events. If per-run drift exceeds 2%, the run's `reconciliation.status = 'drift'` and an `adjustment` row corrects the ledger *in the user's favour only* (we never debit more after the fact; overs are absorbed, unders are refunded). Aggregate drift > 2% per model alerts engineering (note 10 §7.5).
- **REQ-BILL-13.** Nightly reconciliation with user-favourable-only adjustments; drift alerting. **AC:** an injected 5% under-report by the SDK yields a refund `adjustment` row the next morning and a `matched` status thereafter.

---

## 7. Billing (L2, L6, L8)

### 7.1 Stack and division of labour

Stripe Billing (subscriptions, proration, annual prices), Checkout (card capture, one-time top-ups), Customer Portal (plan changes, payment methods, invoices), Stripe Tax; credits live in Rhema's Postgres ledger; Stripe webhooks create grants. Not Stripe Meters, not Metronome/Orb at MVP; Lago is the self-host fallback (note 10 §6). Auth is Better Auth; the auth table sits beside the ledger for attribution joins (note 10 §9).

### 7.2 Flows

**Subscribe (Trial/Reader → Pro/Max/Max+).**
1. User clicks Upgrade (estimate sheet, plan page, or trial banner) → `/plans` with the chosen tier pre-selected and a monthly/annual toggle.
2. "Continue to payment" → Stripe Checkout (hosted; `customer_email` prefilled; Stripe Tax on; promotion codes allowed).
3. `checkout.session.completed` + `invoice.paid` → ledger `grant(included, expires_at = cycle_end + 1 month)`; account tier updated; return URL lands back where the user started (the estimate sheet re-opens with the same configuration if that is where they came from — **REQ-BILL-14**).
4. Trial remainder: unspent trial credits are forfeited on upgrade *unless* upgrading within the 14-day window, in which case they are converted to a `promo` grant with the original expiry (removes the "I lose my free credits by paying" objection).

**Change plan.** Customer Portal handles up/downgrade with proration. Upgrade mid-cycle: immediate grant of the *difference* in included credits pro-rated by days remaining. Downgrade: takes effect at cycle end; balances above the new tier's 2× cap expire at the next reset with a warning 7 days before.

**Top-up.** In-app sheet: three packs; one-time Checkout; `checkout.session.completed` → `grant(topup, expires_at = +12 months)`. First-month top-ups capped at $100 per new account; > $200/day requires 3DS (note 10 §8).

**Auto-reload (opt-in only).** Settings → Billing → "When my spendable balance falls below [500] credits, buy the [$10] pack, up to [$50] per month." Default: off. This is the *only* way a card is charged without a click, and it is bounded by the monthly cap the user typed (Claude's prepaid-with-cap model; the July-2026 silent-billing incident is the anti-pattern, note 10 §2.5).

**Cancel.** Portal; access continues to cycle end; included credits expire at cycle end; top-ups keep their 12-month expiry and remain spendable on Reader for chat only — or fully if the user resubscribes.

**Invoices.** Portal lists Stripe invoices; Rhema's `/billing` page mirrors them with a "usage this cycle" line linking to `/usage`; Team invoices attach the ledger CSV.

### 7.3 Rollover and expiry rules

| Bucket | Expiry | Order of consumption |
|---|---|---|
| trial | day 14 | 1 |
| daily (Reader chat) | nightly | 1 |
| promo | as granted | 2 |
| included (this cycle) | end of *next* cycle | 3 |
| included (rolled over) | end of this cycle | consumed before this cycle's included (FIFO) |
| topup | 12 months | 4 |

Balance cap: total `included` (current + rolled) ≤ 2× monthly grant; excess expires at reset with a 7-day warning. **REQ-BILL-15.** FIFO consumption and the 2× cap are ledger rules with tests.

### 7.4 Limits and alerts

| Control | Default | Where set | Behaviour |
|---|---|---|---|
| Per-run cap | 1.5× estimate | estimate sheet | hard; harness budget |
| Per-project monthly cap | none (Pro); admin-set (Team) | project settings, `/usage` level 2 | estimate sheet refuses runs whose cap would exceed it; shows remaining |
| Account monthly top-up cap | $0 (overage **off**) | Settings → Billing | auto-reload cannot exceed it |
| Soft alerts | 50 / 80 / 100% of included | Settings → Notifications | in-app + email; 100% also shows the Reader-style "runs need credits" banner |
| Concurrency | per tier | — | extra runs queue with "starts when a slot frees" |
| Daily run ceiling | 40/account (Pro) | — | fraud tripwire only; message directs to support |
| Team per-member cap | admin-set | Team settings | Devin usage-policy escalation: warning at ⅔, banner, blocked → request (note 4 §1.4) |

**Overage messaging.** There is no "overage" in the Cursor sense; the vocabulary is **credits**, **cap**, **top-up**. The three sentences the product is allowed to say when a run cannot start: (1) "This run's cap (840) is more than your spendable balance (590)." (2) "Lower the rigor, switch to Standard, or turn off fact-check to fit." (3) "Or add credits / upgrade." Never "you will be billed", never a spinner that resolves to a charge.

### 7.5 Failure states

| State | Trigger | User experience | Ledger |
|---|---|---|---|
| Card declined at Checkout | Stripe | stays on Checkout; no tier change | none |
| Renewal payment failed | `invoice.payment_failed` | Smart Retries (Stripe) for 7 days; banner "Payment failed — update your card" with Portal link; runs continue on remaining balance; **no new included grant** until paid; after 14 days tier → Reader (data untouched) | no grant |
| Chargeback | Stripe dispute | account suspended; `adjustment(chargeback, −granted)`; support flow | clawback |
| Run failed (harness/provider error after retries) | orchestrator | run card "failed — refunded"; partial artifacts kept and labelled | `refund` |
| Run refused (provider policy) | provider | "This run was refused by the model provider; refunded" + the provider's text verbatim | `refund` |
| Estimate service down | timeout > 5 s | sheet shows "Estimates are unavailable; runs are paused" — **runs do not start without an estimate** (the cap guarantee needs one) | none |
| Provider outage mid-run | phase error | phase retried from files; run card "retrying"; if > 3 retries, fail + refund | idempotent |
| Reconciliation drift in user's favour | nightly | silent refund; visible in run report advanced | `adjustment` |
| Ledger/Stripe webhook lag | webhook delayed | Checkout success page polls for the grant ≤ 30 s, then shows "your credits will appear within a few minutes" and emails when they do | eventual |

**REQ-BILL-16.** Every row above has an integration test; the "no run without estimate" rule is enforced server-side.

### 7.6 Refunds and fairness (L8, L10)

- Failed/refused runs auto-refund (§5.3).
- Completed-run refunds: 7-day window, one per account per quarter without review; otherwise support.
- Subscription refunds: pro-rated within 14 days of first charge (EU withdrawal right).
- "Fix-my-own-findings" passes: a respond-to-review run whose triage accepted only copy-edits (no re-verification) is estimated at the lower cost class automatically — the fairness rule from note 3 §2.2 realised through the estimator, not a discount code.
- Steering messages mid-run are priced as part of the run (they extend a phase), shown as a delta on the run card before send ("+≈ 15 credits") — Copilot's visible steering cost (note 3 §3.2).

---

## 8. Settings and account (D13)

Navigation: **Account** (profile, security) · **Preferences** (models, rigor, editor) · **Notifications** · **Integrations** · **Billing** (plan, credits, invoices, auto-reload, caps) · **Data** (export, delete, privacy) · **Team** (hidden until C13). Settings are a full-page surface reached from the account menu and `Cmd+,`; each section is a single scrolling column at 640 px max width (paper measure, note 5 §7), dark shell.

### 8.1 Account

Name, byline (used as the default persona byline), email (magic-link change with re-verification), avatar, connected sign-in methods (Google, Apple later, email), active sessions with revoke, delete account (moves to §8.6).

### 8.2 Preferences (model and rigor defaults)

- **Default model tier:** Standard / Balanced / Frontier — with the one-line "when" from §1.3 §8 and the multiplier. Default: Balanced on paid, Standard on Trial/Reader.
- **Default rigor per workflow:** Review: Standard · Draft: Standard · Respond: Standard. Quick and Full board are choices, not defaults.
- **Per-project overrides** live in project settings and win over these (precedence shown inline: "project > account default").
- **Confirmation threshold:** "Ask me to confirm runs over [500] credits" (max 1,000).
- **Gate policy default:** Three named gates / Every phase / Run to completion, with the auto-proceed deadline (default 10 min; Q-7; note 4 §6.1).
- **Editor:** paper theme (follow app / light / dark), font preset (Serif / Sans), text size stepper (note 5 §7). No raw model names anywhere in this section (note 4 §5 "model = rigor notch, not model name"); the provider list is in the FAQ and privacy policy.

### 8.3 Notifications

| Event | In-app | Email | Push (mobile) | Default |
|---|---|---|---|---|
| Gate waiting (approve-with-deadline) | ✓ | ✓ | ✓ | on |
| Run finished | ✓ | ✓ | ✓ | on |
| Run failed / refunded | ✓ | ✓ | ✓ | on |
| Persona profile stale | ✓ | weekly digest | — | on |
| Credits 50 / 80 / 100% | ✓ | ✓ | — | on |
| Trial ending (day 12) | ✓ | ✓ | — | on (not configurable during trial) |
| Payment failed | ✓ | ✓ | ✓ | on (not configurable) |
| Product updates | — | ✓ | — | off |

Granularity stops at "gate opened / run finished" (Cursor's "when an agent finishes a turn", note 3 §1.2; D16). Quiet hours for push. **REQ-ACCT-1.** Notification preferences are per event type with the two non-configurable rows enforced.

### 8.4 Integrations (Substack / Medium / Google Drive)

- **Substack:** paste a publication URL; Rhema uses the public archive API for free posts and the official Export zip for paid posts; never session cookies (note 9 findings carried in the ledger change log, turn 8). Shows: connected publication, last sync, items discovered, include/omit per item (I4), "Re-sync".
- **Medium:** RSS + user export zip; same card layout.
- **Google Drive:** OAuth with `drive.file` scope only (export docx → Docs); shows connected account and "Disconnect". Used for export only (Q-9), never for reading the user's Drive.
- Each card states what Rhema reads and what it never does ("We never post to your Substack").

**REQ-ACCT-2.** Integration cards follow one component with connect / status / items / disconnect; disconnect removes tokens immediately and keeps already-ingested samples (with a note) unless the user also chooses "remove ingested samples".

### 8.5 Billing (in Settings)

Plan card (tier, renewal date, annual/monthly, "Manage in Stripe" → Portal) · Credits card (level-0 balance expanded: by bucket with expiries, rollover projection) · Top-up packs · Auto-reload (off by default, with threshold, pack, monthly cap) · Caps (account monthly top-up cap; link to per-project caps) · Invoices list · Receipts email. Everything that moves money opens Stripe surfaces; everything that reads credits is Rhema's.

### 8.6 Data: export, delete, privacy (Q-12 minimal posture)

- **Export everything:** one click produces a zip: every project as its on-disk layout (`manifest.md`, `drafts/`, `correspondence/`, `agents/author/*` — the user is the author; `agents/editor/*` excluded per the boundary rule and the T3 correction), personas (`PERSONA.md`, `docs/`, `profile/` with the calibration report), samples as canonical markdown, and a ledger CSV. Emailed link, 7-day expiry. (Q-9 export-only posture makes this the *only* way out, so it must be complete.)
- **Delete account:** typed confirmation; 14-day grace with a cancel link; then hard delete of content and PII; ledger rows retained in anonymized form for accounting; Stripe customer retained per tax law. Provider-side retention is disclosed, not promised away (Fable 5's 30-day provider retention, note 10 §10).
- **Privacy toggles:** "Exclude my usage from product analytics" (default off); "Allow Rhema staff to view my projects for support (per request, 72 h)" (default off). No DPA, no SOC 2 badge at MVP; a one-line "Enterprise? Ask us about a DPA" link (note 10 §10 #7).
- **Training posture:** a static sentence, not a toggle: "Rhema does not train models on your content. Model providers process it under their commercial API terms: [list]."

**REQ-ACCT-3.** Export zip round-trips: importing it into a fresh account reproduces every project and persona (golden test on the three real projects). **REQ-ACCT-4.** Delete follows the 14-day grace and leaves no PII in Postgres, S3, Langfuse traces, or Stripe metadata beyond what tax law requires (checked by a deletion audit job).

---

## 9. Cross-cutting requirements

- **REQ-BILL-17 (overage off by default).** No account is ever charged without (a) an explicit Checkout, or (b) auto-reload turned on with a user-typed monthly cap. **AC:** the only code path that creates a Stripe PaymentIntent without a same-session user click is auto-reload, and it checks the cap.
- **REQ-BILL-18 (single vocabulary).** Credits, cap, top-up, plan. The words "overage", "on-demand", "ACU", "tokens" (outside Advanced), "unlimited" are banned in user-facing strings (lint rule). (Note 4 §1.1 Devin's two vocabularies; Cursor's "unlimited" ambiguity, note 10 §2.5.)
- **REQ-BILL-19 (rate-table transparency).** `/pricing/rates` publishes the current and previous rate tables with effective dates and the 1.4× platform rate; every run report links to the version it was rated under.
- **REQ-GROWTH-16 (Ask/Run distinction).** A single design-system component pair (`AskButton`, `RunButton`) is the only way to trigger agent work; `RunButton` requires an `estimate` prop. **AC:** a lint rule forbids calling the run API from any other component.
- **REQ-GROWTH-17 (theme parity).** Every surface in this document has light and dark variants with WCAG AA contrast (D14). **AC:** axe run on both themes in CI.

---

## 10. Alternatives considered and rejected (consolidated)

| Area | Rejected | Why |
|---|---|---|
| Unit | abstract credits (Devin ACU, Lovable); raw tokens (Bolt); per-run flat price; zero-markup dollars | opacity → distrust; meaningless to writers; 20× intra-workflow variance; negative margin at full utilization (note 10 §5.1) |
| Rate limits | 5-hour + weekly windows (Claude, Codex) | wrong shape for few, long, expensive runs; concurrency is the tier lever (note 4 §6.3) |
| Trial | card-wall; unlimited time-boxed; pure freemium; BYO-key trial | top-of-funnel; unbounded liability; T2 never seen; wrong first-run surface (note 6 §5.3 #9) |
| Trial rigor | Quick only (note 6) | full dossier is the activation; word cap bounds cost instead |
| Daily grant | none at all (note 10) | inert free tier after day 14; chat-only micro-grant costs ≈ $0.07/day and keeps the door open |
| Tier names | "Max 5×/20×" | multipliers are false at 6×/13× |
| Usage UI | Cursor per-request token tables as default; Claude's percentage bars with hidden dollars | token-soup; hidden dollars breed surprise (note 10 §2.4 #7) |
| Estimate | Replit post-hoc effort pricing; Lovable mid-run credit check-ins as the primary consent | backlash; consent belongs before the run, check-ins only at the cap (note 3 §4.4, §6) |
| Billing stack | Stripe Meters; Metronome/Orb; Clerk | invoice-time only; percent-of-revenue and opacity; $19k/mo at scale (note 10 §6, §9) |
| Paywall | interstitials, nav "Upgrade", export nag | breaks reading/editing; export is a trust feature (Q-9) |
| Settings | raw model picker | Q-4 curated choice; note 4 matrix "model = rigor notch" |

---

## Ledger updates

| Row | Status | Evidence |
|---|---|---|
| D12 | done | §5 estimate sheet, §6 four-level usage with detail policy, §7 billing surfaces; REQ-BILL-1…19 |
| D13 | done | §8 settings: account, preferences, notifications, integrations, billing, data; REQ-ACCT-1…4 |
| D15 | done | §1 landing (12 sections, wireframes, tokens, motion), §2 pricing page, §3 signup/onboarding; REQ-GROWTH-1…12, 16–17 |
| D18 | done | §4 capped reverse trial, state machine, single paywall, four upgrade prompts, abuse controls; REQ-GROWTH-13…15 |
| L5 | done | §6.1 detail policy table, §6.3 TypeScript contracts, §6.4 requirements, §6.5 reconciliation |
| L3 | done (refined) | §2.1–2.3 ladder with Reader tier, renamed tiers and quality tiers, annual pricing |
| L6 | done (design) | §5.2–5.3 consent thresholds, cap accounting, §7.4 limits table |
| L2 | done (design) | §7.1–7.3 Stripe flows, rollover/expiry, failure states |
| L8 | done (design) | §4.5, §7.6 |
| L4 | design input | §6.3 `UsageEvent`, `LedgerRow`; §6.5 reconciliation policy (SDK estimate vs provider report) |
| D16 | input | §8.3 notification matrix |
| C1 | input | headline candidates §1.3; tier and quality-tier names §2.1 |
| C13 | input | Team tier shown with waitlist; per-member caps §7.4 |
| D19 | input | §6.4 REQ-BILL-12 mobile scope for usage |

**Proposed new rows**

- **D22 — Showcase project content:** author the worked example (≈2k-word essay, full dossier, v2, letters) shipped to every account; refresh policy when skills change. (D/P) — from note 6's proposed D-x.
- **C18 — Quick Review profile:** the exact phase set, claim cap (5), word cap (6,000 on trial), model, and estimator constants for Quick rigor. (P/A) — from note 6's proposed C-x.
- **L11 — Estimate service** (already proposed in note 10): add the cap-multiplier adaptation rule from REQ-BILL-7 and the free cached claim pre-pass.
- **L13 — Reconciliation job:** nightly provider-report matching, user-favourable adjustments, drift alerting (REQ-BILL-13).
- **M11 — Trial abuse controls:** fingerprint/ASN scoring, disposable domains, kill switch, risk-triggered phone challenge (REQ-GROWTH-15) — from note 6's proposed M-x.
- **D23 — Lint rules for billing vocabulary and Ask/Run components** (REQ-BILL-18, REQ-GROWTH-16).

## Open questions

1. **Departures from research notes, for the operator to confirm:** (a) Reader tier gets a 10-credit/day chat-only allowance (note 10 rejected daily grants; note 6 recommended them); (b) Trial may run Full board rigor on Standard within a 6,000-word cap (note 6 proposed reduced depth only); (c) tier names Pro / Max / Max+ replace "Max 5×/20×"; (d) BYO keys stated as "after MVP" — note 10 says v1.1, note 7 says v2; the spec should pick one after C13 is scheduled.
2. **Grant and word-cap sizing depend on A7.** The 600-credit grant, the ≈180-credit Quick Review figure, and the 6,000-word trial cap are derived from note 10's parametric model calibrated to one operator data point; one instrumented run is needed before these are frozen.
3. **"A third more findings from the second read"** must be measured in-product before the end-of-review upgrade card may quote a number (REQ-GROWTH-14).
4. **Cap multiplier 1.5×:** the variance reserve it implies is affordable per note 10, but the adaptation rule in REQ-BILL-7 needs a margin owner to set the floor.
5. **Provider Usage & Cost API on Claude Platform on AWS:** note 7 confirms feature parity but not the shape of the cost report on the Marketplace flavour; §6.5's matching-by-request-id assumption needs verification.
6. **Team tier pricing shown before C13 ships:** showing a price and a waitlist is a product call; the alternative is "Contact us" with no price.
7. **Headline A/B and the proof section's launch stats** need the golden-run numbers from G11 evals.
8. **Stripe Tax registrations by launch geography** (M10 from note 10) affect whether prices display tax-inclusive in the EU/UK.

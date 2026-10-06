<!--
  docs/build/reports/2026-09-30_prod-design-review.md — round-3 planning input: an agentic critical design
  review of production (https://rhema.tools) by driving it in a real browser. Historical record — corrected by a
  dated note below, never by rewriting a finding. Screenshots: ./2026-09-30_prod-review/*.jpg.
  Findings map to docs/build/BACKLOG.csv rows (the `BL` column); new rows BL-50…BL-65 carry the `PR-*` ids.
-->
# Production design review — rhema.tools (2026-09-30)

## Method

- **Browser:** headless Google Chrome driven by Playwright scripts, one persistent profile per identity,
  desktop 1440×900 and phone 390×844 (dark scheme). Screenshots were read visually, and page text, console
  errors and HTTP failures were captured on every step.
- **Identities:**
  - **(a) A brand-new user** (`14stevevitali+rhema-review@gmail.com`), signed up through the real funnel: drop
    a draft on the landing page, then sign up with a magic link (read from Gmail with the operator's
    authorization).
  - **(b) The operator's own account**, a lived-in workspace with a Writer plan and 13,683 cr.
- **Spend:** one live paid run, a Review at Quick rigor on the Base tier of a planted-error test essay
  (1,003 words, original, with one deliberate error: "Library of Congress founded 1850"; it was 1800).
  - Charged 632 cr to the operator's promo credits.
  - The run report shows 1,625 cr on the Editor seat, which is likely the metered figure (≈ $11.60).
  - One chat turn was attempted and failed before inference.
- **Diagnosis:** prod logs were read-only via `gcloud logging read` (project `rhema-507501`). Code paths were
  cross-checked at chain tip `cf40f28`.
- **Prod state touched:**
  - one new account, plus its seeded Showcase project
  - two test projects ("The Library After Dark", "The Library After Dark (review test)")
  - one accidental Page note on the test project
  - one completed review
  - the operator's default-model-tier preference, set to Base and then **restored** to "Plan default"

  Nothing else was mutated. Cleanup is listed in BL-38.

## Verdict

Prod is live and the **pipeline underneath is real**: a review ran end to end in ~37 min, stayed under its cap,
and produced a genuinely good editorial letter.

But the **product a stranger meets is broken at almost every load-bearing step**. A new user:
- is promised a free first review that does not exist (J1)
- cannot buy credits (J2)
- sees what looks like an empty project list (J5)
- cannot edit (J4)
- cannot chat (J6)
- is shown a Showcase dossier that 500s (J3)

The paid review that does run skipped the product's defining act, checking claims against fetched sources
(Q1), and was priced well below its metered cost (E5). One confirmed cross-tenant read is live (S1).

**None of this was visible to the 3,496-test suite, the CAPSTONE, or the STB legs**, because none of them walks
the product as a user in a browser. Closing that gap is the most important structural change for round 3
(see "Process findings").

## Findings

Severity:
- **P0** — broken core journey, security, or money
- **P1** — honesty / correctness of a shipped surface
- **P2** — polish / IA

| id | sev | area | finding | evidence | BL |
|---|---|---|---|---|---|
| **PR-S1** | P0 | security | **Cross-tenant read on `/voices`.** A brand-new account lists another workspace's voices, "PRB16 Probe Voice" and "STB3 Probe Voice", under **YOUR VOICES**, with their sample counts and sources. The same two voices also appear in the new-project Voice dropdown and in the `/app` voice filter chips. Root cause: `apps/api/src/voice-routes.ts:349` (`select id from personas where deleted_at is null`) relies on RLS alone, and the prod api connects as `postgres` with `rolbypassrls=true`. This is the same class as the STB.2 dossier leak, which was patched only at its own route. | shot `04-crosstenant-voices.jpg`; code path | BL-08 |
| **PR-J1** | P0 | activation | **The promised free first review does not exist.** Landing: "No card. Your first review is included." Pricing: "One Review of up to 6,000 words, Standard rigor, Base — on us, plus a 150-credit pocket." A fresh account has spendable 0 cr (later 10 daily chat credits), the billing page says "Free — chat only, daily credits", and every run sheet blocks ("This run's cap … is more than your spendable balance"). No trial path appears at any rigor or tier. **Violates REQ-SPEC-8** (the sheet should show *Included*). | shot `05-runsheet-no-trial.jpg` | BL-50 |
| **PR-J2** | P0 | revenue | **Credits cannot be bought on prod.** Run-sheet **Add credits** posts to `/p/:slug/exhausted`, whose redirect to Stripe is blocked by the site's own CSP (`form-action 'self'`), so nothing happens. Billing → **Buy 1,000 credits** and **Choose Writer** both return "Billing is temporarily unavailable — try again in a moment." (`server.ts:2529/2542`: the api returned no checkout URL). Related: BL-09's undeployed Stripe fixes. | console CSP error; shot `06-billing-unavailable.jpg` | BL-51 |
| **PR-J3** | P0 | deliverable | **Dossier pages 500.** Both the new user's Showcase dossier (`/p/showcase/review/…`) and the operator's delivered STB.3 Memo dossier return HTTP 500 every time. Web log: `TypeError: Cannot read properties of undefined (reading 'length') at DossierPage`, at `apps/web/src/pages.tsx:2491` `f.evidence?.urls.length` (evidence present, `urls` absent). The new review's dossier renders only because its findings carry `urls`. Same row: the **walkthrough** job failed on the new review ("The walkthrough couldn't be written — retry when ready"; worker log `run.walkthrough … status:failed`). The Showcase failing breaks **REQ-POS-3**. | web stderr 16:54:57Z | BL-52 |
| **PR-J4** | P0 | editing | **No working edit path.** (a) `/assets/page.js` 404s on every project page: `apps/web/build-client.mjs` builds 5 bundles (editor, ide, **page**, outline, landing), but `server.ts:4960-4999` serves only 4, so the P1.02 Page editor island never mounts. (b) **Edit source** links to `/p/:slug/v/working`, which 404s whenever the project has no `working`-state draft, i.e. every freshly imported project (`editor-routes.ts` resolve). (c) The operator's `my-first-project` redirects to `/v/working`, so the 404 makes it **unopenable** from its own URL. **Violates REQ-IDE-44 / REQ-DATA-27** (typing on a frozen version forks a working copy). | HTTP 404s; code paths | BL-53 |
| **PR-J5** | P1 | navigation | **The project list looks empty.** Quiet projects are collapsed by default (REQ-IDE-4), and the Quiet group's `<summary>` has `list-style:none` and no chevron. A workspace whose projects are all Quiet (every new user; the operator today) therefore shows only "QUIET · 2 — 2 Unfiled · 0 with a Voice" over a blank page. Clicking the line expands it. Collapsing the *only* group defeats the rule's purpose. | shot `07-project-list-blank.jpg`; DOM (`details[data-collapsed-group]` closed) | BL-54 |
| **PR-J6** | P0 | chat | **Chat fails.** POST `/p/:slug/chat/turns` → **HTTP 502**, and no web/api log line matches (LB-level). At 1440×900 the chat **Send** button is also covered by the fixed status bar (`footer.ide-statusbar` intercepts the click). | 502; Playwright intercept | BL-55 |
| **PR-Q1** | P0 | core value | **The Review's fact-check did no web research.** The dossier opens: "no web-research tool was reachable this session: no `web_search` tool existed, and every `web_fetch` call was refused." Result: **16/16 claims Unverifiable, 0 verified.** The planted 1850/1800 error was caught only as "unconfirmed recollection — highest-priority re-check". The run's policy enables search (`authorWebToolPolicy`: `search:true`, budget ≥ 8), and the STB.3 Memo review (2026-09-26) verified 2/5, so this is a regression or a tier-specific failure (Quick → Base/Haiku) in the proxy's `ensureServerWebTools` path. The user was charged 632 cr for a review whose defining act did not happen, and the run still reports `completed`. | shot `10-dossier-no-web-research.jpg`; dossier text | BL-56 |
| **PR-E1** | P1 | estimate | **Estimates disagree across surfaces by 10–20×** for the same 1,003-word essay. **Pre-upload guesses:** the new-project protocol card says "Review ≈ 5,231 cr" before upload; the landing says a 5,000-word essay Review costs "600–2,680 cr". **Pricing page:** "a ≤3,000-word piece on Base: Quick ≈ 170 cr · Standard ≈ 280 cr". **Once the essay exists:** the Timeline says "Review v1 est. 3,721 cr", and the run sheet shows Standard/Balanced "$37.21 · never more than $55.82" or Quick/Base "$10.15 · never more than $15.23". **After confirm**, the sheet re-rendered "5,180 words · 21 claims · $15.97 · cap 2,396". **Actual:** 632 cr charged. "Why this estimate? 4 claims × 40 cr ≈ 440" is wrong arithmetic and doesn't sum to the total; the sheet counted 4 claims, the review inventoried 16. | page text | BL-57 |
| **PR-E2** | P1 | estimate | **Model tier is not user-controllable.** `normalizeTier("")` is always called with an empty value (`server.ts:3373,5099`), so the tier is always the rigor preset. Account Preferences → "Default model tier" and project settings → "Model tier default" are dead controls. Free users get **Balanced** despite "Base on Free", and the sheet advises "switch to Base" with no control to do it. | code path; live test | BL-58 |
| **PR-E3** | P1 | estimate | **Duration estimates vary**: sheet Standard/Balanced "~149–248 min", sheet Quick "~41–68 min", run card "~28–53 min"; actual ≈ 29 min of work plus 8 min blocked on a gate. | page text | BL-57 |
| **PR-E4** | P1 | cost | **The live meter is phase-granular.** Spend sat at 112 cr for 6+ min during verification. Spec principle 6 promises a live meter during the run (cf. the provisional `usage.tick` rendering, D-P0.08-2). | watcher log | BL-57 |
| **PR-E5** | P1 | economics | **Priced below cost.** 632 cr ($6.32) charged vs 1,625 cr on the Editor seat (≈ $11.60 metered at the platform rate). The operator's STB.3 Memo review: 447 charged vs 1,339 seat. Pricing-page claims (Writer $20 ≈ "3 essay loops on Base") cannot hold at measured COGS. | run reports | BL-13 |
| **PR-E6** | P1 | presets | **Quick ran Standard-tier phases.** The Quick/Base review ran discourse and the independent second read (the run report flags "The discourse map ran (a Standard-tier phase)"; the sheet's hidden `toggleKeys` at Quick = `fact_check,discourse,second_read`), while §6.5 defines Quick as discourse off, second read off, fact-check limited to 5 claims. The rigor presets do not match the spec, so Quick's measured cost overstates Quick. *(Identified by the round-3 Phase-4 review from this run's evidence.)* | run report; sheet form values | BL-13 |
| **PR-R1** | P1 | gates | **An "informational" gate blocks indefinitely.** The run sheet says "Scope approval — informational; the run proceeds." The card says "Informational — the run continues while you read," yet the run shows "Waiting for you — no deadline. If you do nothing: it waits for you." Project defaults set Approve scope = "wait for me" (spec R3/R15: informational by default at Quick/Standard). It sat blocked until clicked. | shot `09-informational-gate-blocks.jpg` | BL-59 |
| **PR-R2** | P1 | SLO | **Prod SLOs are red now, after DEF.1–3.** Worker `[slo] violation` at 17:07Z: `run_start_latency_p95_s` 473 (target 45), `gate_resume_latency_p95_s` 270 (target 60), `event_delivery_latency_p95_s` 6.0 (target 2), `proxy_vs_sdk_cost_runs_over5pct_1h` 1. | worker log | BL-07 |
| **PR-R3** | P1 | reporting | **The run report contradicts itself.** "632 cr spent" vs "SEATS Editor — 1,625 cr (100%)"; every phase "0 min"; "Advanced — per-request detail" is empty; the Showcase report shows fixture numbers as real. The seeded Showcase run appears in a new user's `/usage` history as "review · completed · 3,860 cr". | shot `11-run-report.jpg` | BL-57 |
| **PR-R4** | P1 | onboarding | **Import is slow and the held draft is lost.** A 1,003-word `.md` takes **3.5–5.6 min** to "convert" ("a cold start can take a few minutes"). A draft dropped on the landing page ("held on this device until you sign in") attaches only on the *first* post-login view; on any later visit the page says "Your held file is here — upload it to start" with an empty file input, and Continue → "Upload a file or paste the text." **Violates REQ-GROWTH-1** (held client-side until signup; ingested within 20 s). | timings; page text | BL-60 |
| **PR-R5** | P2 | import | **Import drops fidelity**: the H1 is demoted to H2, and imported drafts reference relative figure paths that 404 on the operator's `my-first-project` v1 (`figure_1_five_questions.png` …). | HTTP 404s | BL-64 |
| **PR-U1** | P2 | copy | **"Private beta" everywhere on an open-signup product**: the footer on every page, `/invite` "Rhēma is in private beta.", "Have an invitation? Sign in", and an "Invitation code (optional)" field that is the **first** field on signup/login. | page text | BL-61 |
| **PR-U2** | P2 | copy | **Build jargon in user copy**: "the fixture the Showcase ships", "Changelog — Phase 1 — the full IDE, the public funnel, and the Showcase launch together", "The Assistant lands here in a later pass." (while chat is live), "Tags land in 1.x", "Venue bounds as of 2026-09-01 — not yet re-verified". | page text | BL-61 |
| **PR-U3** | P2 | IA | **Unbuilt features are exposed.** Preferences → "Rigor per workflow" lists 22 workflows, including 1.x/never-built ones (Cut to length, Line edit, Titles, Abstract, Reverse outline, Interview, Steelman, Map the field, Run rounds). | page text | BL-61 |
| **PR-U4** | P2 | inbox | **The Inbox contradicts itself and is noisy.** "Waiting on your call: 0" above two "Partial-results decision is waiting on you" items; many "Run recovered" system notices; some items have no project name. | page text | BL-61 |
| **PR-U5** | P2 | layout | `/app/new` renders the IDE shell **unstyled/stacked** at desktop: the Files/Timeline/Desk panes are full-width blocks, and the rail icons show as raw glyphs. | shot `03-new-project-unstyled-shell.jpg` | BL-62 |
| **PR-U6** | P2 | responsive | **Pricing has phone overflow**: 535 px of content in a 390 px viewport (the comparison table), and the header is clipped. The table has all-dash rows ("Run word cap"), every paid CTA reads "Start free", and Team shows "$/mo Annual". | shot `02-pricing-phone-overflow.jpg` | BL-62 |
| **PR-U7** | P2 | responsive | **Phone project page**: the action row is wrapped underlined text links, not buttons; the floating "synced ✓" overlaps body text; most tap targets are < 32 px. | shot `12-project-phone.jpg` | BL-62 |
| **PR-U8** | P2 | brand/meta | Every page `<title>` is "Rhēma", with no meta description, OG/Twitter tags or favicon (the favicon 404s on every request). The landing has several `<h1>`s. `/showcase` 404s while the landing names "the Showcase". | report.json | BL-63 |
| **PR-U9** | P2 | email | **The magic-link email** is a single bare link "Sign in to Rhema" (no macron, no brand, no expiry or "didn't request this" text), and every sign-in email shares a subject, so Gmail threads them across recipients. | Gmail message | BL-63 |
| **PR-O1** | P2 | ops | **The notification digest query hits a missing column**: `packages/orchestrator/src/notifications.ts:1250` `r.finished_at` → Cloud SQL `ERROR: column r.finished_at does not exist` (the digest sweep fails every time). | cloudsql log 16:55:30Z | BL-65 |
| **PR-O2** | P2 | ops | **Suspected listener leak in the api**: continuous `MaxListenersExceededWarning: 11 close/error listeners added to [PassThrough]`. | api stderr | BL-65 |
| **PR-O3** | P2 | ops | **User-visible 5xx without a trail**: the chat 502 appears in no web/api/LB log (LB request logging off). | log search | BL-65 |

### What works (keep it)

- The **landing's sample dossier** is the most persuasive thing on the site, and the **paper-in-dark-shell** reading
  surface is handsome at both widths.
- **The run card** is the right design: seven named phases, pause/stop, and "never more than" cap copy. The
  **cap held** (632/1,523).
- **The editorial letter is genuinely good.** It found the argument's real weaknesses, conceded what was sound,
  gave "the one thing" to fix first, and was honest about its own research failure instead of papering over it.
- Magic-link delivery took seconds. The conversion preview is honest ("Everything converted cleanly"). Export
  offers 7 formats plus an AI-use statement. Settings are comprehensive and privacy-forward (support-access log,
  analytics opt-out).

## Process findings (for the next orchestrate-build round)

1. **No ticket ever walked the product as a user.**
   - Every PR-J defect is visible within 10 minutes of browser use, yet the chain shipped with 3,496 green tests.
   - STB.2's "headless battery" asserted HTTP 200s and DOM markers as the operator (with a lifted session
     token). It never checked that a card has text, a button is clickable, a bundle is served, or a dossier
     renders for a new tenant.
   - → Proposed invariant: a **scripted browser journey** (new user: signup → import → estimate → run → dossier
     → edit → buy) runs against the deployed stage as every Stage B's acceptance, and nightly against prod, with
     screenshots committed as evidence.
2. **Built ≠ served ≠ deployed.** `page.js` was built and tested but never routed, and the STB.4 Stripe fixes
   landed after the last deploy. → Invariants: an asset-manifest parity test (every built bundle has a route),
   and deploy provenance compared to chain tip at every close.
3. **Tests don't run as the prod database role.** The suite runs as a role that honours RLS, while prod connects
   as `postgres` with BYPASSRLS, so every RLS-only query is cross-tenant in prod and correct in tests. → Run the
   integration suite as the prod role, or make the prod role non-bypass.
4. **Data-shape drift between producers and renderers** (PR-J3): the web page assumes `evidence.urls`, but older
   and seeded findings lack it. → Contract tests over real prod-shaped fixtures, including the Showcase seed.
5. **Copy promises are not tied to entitlement code** (PR-J1, PR-E1): the landing, pricing and trial copy are
   free text that no test checks against what the account actually gets. → Copy claims about price/trial/limits
   should be rendered *from* the same config the entitlement and estimator use (the pricing page already claims
   "every number on this page is derived from the published rate card", but it is not).

## Corrections (append-only)

- **2026-09-30 (during the review):** an interim chat message named `/usage` as a second cross-tenant leak (a
  "review · completed · 3,860 cr" row on the new account). Verified afterwards: that row is the new
  workspace's **own seeded Showcase run** (its report shows exactly 3,860 cr). Not a leak; recorded as PR-R3's
  misleading-usage item instead.

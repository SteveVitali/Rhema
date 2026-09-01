# Round-2 workstream E — MVP philosophy: the Review beta (E1) and the Q-22 decision memo (E2)

Inputs: round-2 ledger §0/§E/Q-22 (`docs/5_round2-ledger.md`); external critique §12–13, §15 (`docs/4_…`);
crosswalk rows 13.1–13.4 and rank-2 of the top-10 (`docs/design/14_…`); spec §3.2, §3.5, §5, §12.1–12.4,
§14.2–14.3, §17 (`docs/3_rhema-design-spec.md`); review 13 §10–§11 (`docs/design/13_…`).
Status: **decision memo for Q-22** — the operator's call lands at v0.3 review (F1). Requirements here are
`REQ-BETA-n`; they bind only if Q-22 chooses the beta (or the sequenced hybrid of §3.5).

---

## 1. Framing: what is actually in dispute

The critique (§13) says the next MVP should prove the **review-revision loop**, not the entire IDE. The
crosswalk scores this DIVERGES (row 13.2) and ranks it the #2 most consequential item. The spec (§17)
builds the full Phase-1 IDE — four protocols, Voices with calibration, Assistant, figures, outline editor,
the full billing ladder — at **52–67 PM**, with **Phase 0 (18–23 PM) before any IDE pixel**.

Three facts bound the disagreement before any argument starts:

1. **Phase 0 is unavoidable and is not in dispute.** The engine — sandbox, proxy-as-meter, skill port
   with sidecars and completion oracles, ledger — *is* the validation instrument. All three of review 13
   §11's riskiest bets are Phase-0 work. No validation strategy skips it; every option below includes it.
2. **Phase 0 is technical validation, not market validation** (crosswalk 13.2's exact point). Its exit
   criterion is `violations = 0`, sidecars parsing, metered cost ±2% — it proves the loop *runs*, not
   that serious writers *want* it, repeat it, or pay for it.
3. **A large fraction of Phase 1 is needed regardless of philosophy.** The engine (9–11 PM), the port
   (most of 5–7), foundations (4–5), billing-core — ledger, holds, caps, proxy metering, estimator
   (roughly half of 4–5) — and a findings surface (the loop is invisible without one) are on every path.
   The dispute is only over the **other ~24–30 PM**: Voices with calibration and ingestion, the
   Assistant, figures, the outline editor, three of four protocols, the ProseMirror editor, the plan
   ladder and trial machinery, the landing/growth funnel — built before or after external evidence.

So Q-22, stated precisely: **after Phase 0, does the next ~10–14 PM ship a minimal instrumented Review
beta to ~20 design partners, or does the next ~34–44 PM complete Phase 1 for a public launch?**

---

## 2. E1 — The Review beta, concretely

### 2.1 What it is

A private, invite-only web product that runs critique §13's core flow end-to-end on real manuscripts,
instrumented to answer one question: *do serious writers repeatedly put important work through
review-revision rounds here, and will they pay?*

**REQ-BETA-1 (the flow).** The beta implements all nine steps of critique §13's core flow, each on the
spec's existing design (no new invention):

| # | Critique §13 step | Beta implementation (spec basis) |
|---|---|---|
| 1 | Import/paste manuscript | Entry point 3 only (§5.3): paste md/txt, upload md/docx (pandoc `convert` service). No scratch/outline entries. |
| 2 | Venue + draft stage | The run sheet's scope line (§5.6): protocol Essay, venue table, stage. Set at import, editable per run. |
| 3 | Deep editorial review | Ported `editorial-review`, all phases, Quick/Standard/Full board rigor (§6.2, §12.2). |
| 4 | Structured dossier | Editor's letter with mini-TOC, findings list, claim-ledger table with fetched-chips, rubric (8 dots, caps, no total), second read incl. rejected findings, discourse report (§5.7). |
| 5 | Dispositions | The five verbs with §5.7's rationale rules; triage-mode queue; pre-triage passes to Revise (REQ-WF-9). |
| 6 | Revise — agent or manual | Agent: ported `respond-to-review` with the Approve-triage gate. Manual: markdown source editing (§2.3 below) or re-upload of an edited copy as v(N+1). |
| 7 | Semantic diff + obligations discharged | Server-side diff vN→v(N+1) annotated by ledger moves (§5.8, "what changed and why"); an **open-obligations chip** derived from response-ledger rows (finding → disposition → move → hunk). Adopts B1's first-class obligation object if F1 lands it; the derived view ships regardless. |
| 8 | Second-round review | Re-review of v(N+1) reading the response letter first; "N carried, M closed, K new" (REQ-WF-7). |
| 9 | Before/after comparison | Rubric-delta view (two dot-columns side by side) + the carried/closed/new counts + both letters linked. Small new view; all inputs exist. |

**REQ-BETA-2 (north star for the beta period).** The beta's north star is the critique's, not the spec's:
**repeat review/revision cycles on important manuscripts** (a manuscript is "important" iff the author set
a venue and marked it headed-to-publication at import). "Pieces accepted per month" (§3.5) remains the
product's north star at public launch; this resolves crosswalk row 13.4 for the beta window only.

### 2.2 Included / excluded, against the Phase-1 feature matrix (§3.2)

**REQ-BETA-3 (inclusion rule).** A Phase-1 feature ships in the beta iff it is (a) on the nine-step flow,
(b) engine work needed regardless, or (c) required to keep external users safe and metered. Everything
else is deferred to the full IDE, not cancelled — the beta does not overturn Q-8/Q-15; it sequences them.

| Area | In the beta | Excluded (→ Phase 1 as specced) |
|---|---|---|
| Protocols | **Essay only**, with its venue table and safe-field stage/venue overrides. Aligns with the D1 Essay-led leaning; partners are selected to match. The protocol *object* (REQ-GENRE-1) ships — it is Phase-0 substrate. | Academic, Op-ed, Memo protocol rows and their nightly goldens (Q-15 honored at full launch). |
| Workflows | Review · Revise · **Fact-check** (phase-subset of Review, REQ-WF-13 — the most legible cheap run, §3.4). | Draft, Outline, Research, Figure, and everything 1.x. The beta's entry is an existing draft; `draft-from-outline` and its gates are not ported until Phase 1 completes. |
| Voices | **Optional inline Quick Voice**: paste 1–3 samples in a single field at first Revise; feeds the voice charter. No library page, no staleness machinery, no connectors. | Full Profile, calibration report, Substack/URL ingestion, staleness pill, Update voice, composite schema UI. |
| Assistant / chat | **None.** No chat, no research bursts, no "ask about this draft". | Entire §7. Honest cost: the critique's "time in dossier vs chat" metric is unmeasurable in-product (§2.4, gap row G). |
| Editor | Read-mode rendered Page with findings decorations + **markdown source editing** (CodeMirror) on the working head; Apply implemented as anchored string replacement in canonical markdown (the anchor of record *is* `(blockId, quote, offsets)` on canonical markdown — §5.7 — so this is the natural first implementation, and Source mode is already a planned 1.x feature, row 35: not throwaway). Naive whole-snapshot versions. | ProseMirror/Tiptap WYSIWYG, conversion preview, four-layer autosave, restore points, focus mode, footnote/citation/math node UX, figures. Frozen-vN immutability and fork-on-edit semantics are kept (they are data-model rules, not editor features). |
| Findings surface | Findings list as the triage queue (progress pill, next-undecided, J/K + verb keys), linked click-to-highlight on the rendered Page, five verbs + Apply, second-read reconciliation groups, rubric view, letter view, claim-ledger table, severity budget (Quick caps at 40). | Margin card stacking/clustering polish, bulk-with-one-preview, Drafter-proposes-first card (Revise still proposes triage; the fancy card UI is deferred), command palette, full keyboard map. |
| Runs & gates | Run sheet (two-tier, stateless estimate, dollars-first, cap, consent click), run cards with phase/spend, Confirm-scope and Approve-triage gates, stop-with-partials, run report. Email notifications: run finished, gate waiting, with signed *Wait for me* / *Open* links. | Round-timeline polish, walkthrough generation, Decisions inbox (escalations land in email + a flat list), artifact Browser (artifacts reachable by direct link), parallel variants, steering beyond stop/one-note. |
| Mobile | Beta surfaces are responsive-lite: dispositions with a note and gate actions usable at phone width (they are simple lists and buttons), so approval emails never dead-end (REQ-SPEC-20's intent at lower fidelity). | The app; the full phone-width contract (62a) ships with Phase 1. |
| Billing | See §2.5. Ledger, holds, caps, proxy metering, estimator, refund-on-failure — all of it (the cap guarantee is a Phase-0 bet, not a UI). | Stripe subscriptions, plan ladder, trial entitlement + abuse controls, four-level usage dashboard (one flat per-run cost list instead), top-up packs UI. |
| Export | md, txt, docx (pandoc container, no Typst). Export is on the loop: manual revision happens outside and comes back. | pdf/LaTeX/rtf/html, CSL styles, account export golden. |
| Growth | No landing funnel. One invite-gated signup page; a seeded **sample dossier** (the Showcase's ancestor) so partners see a finding before spending. | Landing page, pricing page, drop-zone hero, trial, onboarding tour, analytics-driven growth loop. |
| Security | Sandbox/proxy/uid separation (Phase 0), RLS tenancy tests, SSRF split (the fetcher runs), usercontent origin. Lighter external review; full pen-test before public launch. | — |

### 2.3 PM estimate, derived row-by-row from §17's table

Same basis as review 13 §10 (senior engineers, agent-assisted, verification included, calendar not
implied). **Honesty first:** rows 1–3 and the core of rows 8/11 shrink little or not at all — the engine
is the instrument, the port is the product, billing-core is the cap-guarantee bet, and a findings surface
is the loop's face. The savings are real but they live in the *other* rows.

| §17 row | Phase 1 | Beta | Why it shrinks (or doesn't) |
|---|---|---|---|
| Foundations | 4–5 | 4–5 | Unchanged. All of it is load-bearing for any external user. |
| Run engine | 9–11 | 9–11 | Unchanged — the three riskiest bets live here. |
| Skill port | 5–7 | 3.5–5 | Review + Revise + Fact-check subset + Quick Voice only; Draft/Outline/Research/Figure manifests, parsers and their gate write-backs deferred. Iteration-against-real-runs cost stays (it is mostly Review/Revise anyway). |
| Editor/collab | 6–8 | 1.5–2.5 | Rendered read view + CodeMirror source mode + import + anchor projection + Apply-as-replacement; no Tiptap schema, conversion preview, autosave layers, restore points. |
| IDE shell & surfaces | 9–11 | 4–5.5 | Findings/triage/rubric/letter/ledger + run sheet + run cards + flat project list + email/in-app notify; no palette, Browser, walkthrough, design-system depth; a11y basic-but-real on the triage queue. |
| Assistant + outline + figures | 4–5 | 0 | Excluded. |
| Voices + ingestion | 5–6 | 0.5–1 | Inline Quick Voice; paste/upload/docx only; no Substack, no PDF pipeline, no calibration UI. |
| Billing | 4–5 | 2–3 | Ledger/holds/caps/estimator/refunds kept in full; Stripe subscription flows, entitlement trial, abuse controls, usage levels deferred. Payment Links webhook ≈ days, not weeks. |
| Export | 2–3 | 0.5–1 | md/txt/docx only. |
| Landing, onboarding, Showcase, analytics, email | 2–3 | 0.5–1 | Invite page + sample dossier + the §2.4 event stream (analytics is *not* cut — it is the point). |
| Security hardening | 2–3 | 1.5–2 | All enforcement kept; external pen-test deferred to pre-public-launch. |
| **Total** | **52–67** | **≈ 27.5–37** | Of which Phase 0 ≈ 16.5–21 (slightly under §17's 18–23 because Draft's port defers). **UI-and-product layer on top of Phase 0 ≈ 10–15 PM.** |

**REQ-BETA-4.** The beta budget is **28–37 PM total (10–15 PM beyond Phase 0)**; first external
manuscript at roughly half the effort of Phase 1. The double-work tax when the full IDE follows is
estimated **3–5 PM** (simplified surfaces rebuilt on the design system; CodeMirror editing is *kept* as
1.x Source mode), so the beta path's total to the full IDE is ≈ 55–72 PM vs 52–67 direct — the beta
"costs" ~3–5 PM and buys market evidence ~25–30 PM earlier.

### 2.4 Instrumentation: critique §13's list mapped onto §3.5 / design-9 §7.2

**REQ-BETA-5.** The beta ships the full §3.5 event catalogue for the surfaces it has, plus the additions
below. Every event keeps the standard envelope; every run event carries `cost_actual, cost_estimate,
rigor` (REQ-PROD-15).

| | Critique §13 "instrument everything" item | Existing event(s) | Gap → addition |
|---|---|---|---|
| A | Finding accepted/rejected | `finding.disposed{disposition}` | Covered. |
| B | Reason | rationale required only for rebut/escalate (§5.7) | **Add** optional one-tap `reason_code` on every disposition (`wrong` · `stylistic_disagreement` · `already_knew` · `too_costly` · `not_this_round` · `other`) — never required text (REQ-BETA-6). |
| C | Whether author changed text | `draft.edited`, `finding.applied` | Covered. |
| D | Whether recommendation was materially adopted | ledger move ↔ diff hunk join (§5.8) | **Add** `revision.move_traced{finding_id, move_id, hunk_count, chars_changed}` emitted at Revise delivery and at manual-revision diff (REQ-BETA-7). |
| E | Whether change survives later review | finding lineage (§6.8, REQ-WF-7) | **Add** `rereview.lineage{carried, closed, new, reopened}` per re-review run (REQ-BETA-8). |
| F | Whether author requests another review | `run.launched{kind}` | **Add** `round.completed{ordinal, manuscript_id, important}` so repeat-cycles is a first-class counter, not a join (REQ-BETA-9). |
| G | Time in dossier vs chat | `surface` field exists; **no chat in the beta** | **Add** `surface.dwell{surface, ms}` heartbeat. The chat half is unmeasurable in-product — an accepted cost, partially recovered by asking partners in interviews whether they round-tripped through ChatGPT (and watching for paste-back patterns in imports) (REQ-BETA-10). |
| H | Subsequent manuscript upload | `project.created` | **Add** `draft.imported{origin, is_new_manuscript, venue_set}` (REQ-BETA-11). |
| I | Willingness to pay | `topup.purchased` (Phase 1) | **Add** `wtp.recorded{source: purchase | interview | survey, amount}` + `credits.exhausted_prompt{action_taken}` when house credits run out (REQ-BETA-12). |

**REQ-BETA-13 (the beta dashboard).** One weekly report, generated from the stream (REQ-PROD-16
applies): repeat-cycle rate on important manuscripts, round-2 rate, accept+adapt share, second-read
yield, rubric-delta distribution, reason-code histogram, per-run margin, and the §2.6 gate metrics.

### 2.5 Billing: manual invites + credits, with one real-money channel

**REQ-BETA-14.** No self-serve. Signup is invite-gated. Each partner workspace receives operator-granted
**house credits** ($150–300 COGS-equivalent) via an admin CLI writing ordinary ledger grants. Every run
goes through the real sheet — dollars-first estimate, cap, hold, consent click, proxy-metered debits,
auto-refund on failure — because the estimate-and-cap contract is itself under validation (bet #3).

**REQ-BETA-15.** WTP must be behavioral before the beta ends: when house credits are exhausted, the
prompt offers a **real purchase** via Stripe Payment Links (webhook → ledger grant; no subscription
machinery), at prices generated from the same estimator/rate table. In the final month, each partner is
offered a beta-priced monthly plan (target: the Writer $20 anchor, §14.2) — the conversion rate is a
§2.6 gate. No trial entitlement, no abuse controls beyond the invite gate and per-workspace caps.

### 2.6 Design-partner program and decision gates

**REQ-BETA-16 (who and how many).** 20–25 partners in three cohorts (≈8 each, two weeks apart, so
instrument bugs hit eight people not twenty-five). Profile (Essay-led, per critique §4 and the D1
leaning): serious newsletter/Substack essayists (1k–50k subscribers), policy/think-tank writers,
technical founders who publish essays, plus 2–3 working editors as calibration readers. Screening: a
real manuscript currently in flight, publishes at least quarterly, states up front a willingness to pay
for editing if it works. Sourced from the operator's network, targeted outreach on published essays
("we reviewed your last piece with it; here's the dossier" — with consent), and the two most engaged
segments of the upstream repo's audience.

**REQ-BETA-17 (the deal).** Partners are promised: free house credits; direct access (shared channel +
weekly office hours); their feedback triaged with the product's own five verbs in a visible ledger;
first-year price lock at beta pricing; drafts never used for training or marketing without written
consent, deletion on request. Partners commit to: ≥2 real manuscripts through ≥2 full rounds, permission
to instrument, a monthly 30-minute interview, and an end-of-beta WTP conversation with a real purchase
decision.

**REQ-BETA-18 (gates — decided before the beta opens, measured over ≥90 days with ≥15 active partners).**
- **Proceed to full IDE** if: ≥50% of partners take ≥1 important manuscript through ≥2 full rounds
  unprompted; accept+adapt ≥55% of dispositioned findings (§3.5's own bar); ≥60% import a second
  manuscript; ≥40% convert to real payment.
- **Pivot/iterate in place** if repeat-cycle behavior exists but conversion fails (pricing/packaging
  problem, not demand) or dispositions skew rebut/`wrong` (quality problem → back to protocols + C).
- **Stop-and-rethink** if round-2 rate <20%, partners visibly prefer exporting to chat (G-pattern), or
  median stated WTP <$20/mo. This is the outcome worth 25 PM to learn early.

---

## 3. E2 — Decision memo for Q-22

### 3.1 Option A: full-IDE Phase 1 as specced (52–67 PM, one public launch)

**For.** One undiluted launch moment: the trial (one full Standard review included, §14.3) plus the
drop-zone landing *is* a validation instrument at a scale no 25-person beta reaches, and §3.5's funnel
metrics are designed to read it. No double UI work, no throwaway, no cohort-management overhead. Honors
the operator's recorded breadth decisions (Q-8, Q-15) without re-litigating them. The spec is finished
to ticket-ready detail — the plan's execution risk is lowest when it is executed as designed. Voices,
figures and the Assistant are differentiators on launch day against a Grammarly-class feature response.
And the beta's sample is biased by construction (hand-picked, courted, free-credit-subsidized partners),
so its positive signal is weaker than it looks — only its *negative* signal is strong.

**Against.** 52–67 PM (≈9–17 months of team-time) before the first external user touches the loop, on
demand evidence that today is zero: no user has ever dispositioned a finding. The bear case (§15) is
explicitly a demand story — prefer-chat, human-editor preference, narrow base — and none of it is
testable from inside Phase 1. Every §3.5 target and price is a guess that launch-day reality re-bases
under public scrutiny instead of privately. The severity-budget, triage-volume and trial-size designs
all encode assumptions (40–50 findings is tolerable; $20 is right; Standard is the right default) that
20 partners would have falsified or confirmed for 1/40th the cost. If the loop disappoints, the launch
moment is not preserved — it is spent on the wrong product.

### 3.2 Option B: Phase 0 → Review beta → full IDE (28–37 PM to first users, ≈55–72 total)

**For.** Market evidence — repeat-cycle behavior, disposition patterns, reason codes, real payments —
arrives ~25–30 PM earlier, and re-prices every downstream bet: which of the deferred 24–30 PM to build
first, what the trial should include, whether the Drafter matters as much as Review (partners who never
ask for Draft are telling you something about the wedge). The beta's data seeds B2 (longitudinal model)
and hardens C's corpus with real dispositioned dossiers. Design-partner testimonials plus the C
benchmark become the launch's proof assets. And the beta is a genuine kill-gate: §2.6's stop condition
is the cheapest possible way to learn the bear case is right.

**Against — taken seriously, with mitigations.**
- *Burning the launch moment.* Real only if the beta is public. Mitigation (REQ-BETA-19): the beta is
  private and capped, no PR, no public pricing page, partners asked not to publish reviews of the
  product (light-touch, not NDA-heavy); the launch moment is reserved for the full IDE, now armed with
  a benchmark result and partner stories. Residual risk: leaks and a competitor reading the wedge —
  accepted; the wedge is already public in the upstream repo.
- *Slower revenue.* True and nearly costless: beta revenue was always going to be noise (25 partners ×
  ~$20–100/mo). The real cost is 3–6 months' later start on the *public* revenue ramp — priced against
  the risk of ramping a product with an unvalidated core loop.
- *Double UI work.* Quantified at 3–5 PM (§2.3), and reduced further by §3.5's hybrid construction;
  CodeMirror editing survives as 1.x Source mode.
- *Sample bias and over-fitting to 20 loud partners.* Mitigation: gates are behavioral (rounds, repeat
  imports, payments), not attitudinal; the full-IDE scope stays spec-governed — partner requests file
  as evidence into F1, they do not steer the roadmap directly.

### 3.3 Does workstream C's benchmark substitute for the beta?

**No — and it does not merely "partially de-risk" either; the two answer disjoint questions and compose
into a sequence.**

- The benchmark measures **supply**: is Rhema's review materially and repeatably better than a frontier
  one-shot, a generic iterative loop, Grammarly-class, and a human editor — on recall, false positives,
  anchoring, calibration, post-revision improvement (C1–C4)? It cannot measure whether anyone will
  route important work through the structured loop repeatedly, tolerate a 150-finding dossier, prefer
  the workflow to chat, or pay — there is no user in it.
- The beta measures **demand**: exactly those behaviors. It cannot measure lift — no blinded arms, no
  ground-truth annotations, n≈20 of hand-picked, subsidized, therefore agreeable users. A beta full of
  happy partners on a product that loses the benchmark is a feature, not a company (critique §15.3).
- **The composition is the point:** the benchmark needs only the Phase-0 engine — no UI. It therefore
  runs *during/immediately after Phase 0 on every path*, and is the cheaper, earlier gate. If the lift
  criterion (C4) fails, stop before building *any* UI — beta or IDE. If it passes, the entire residual
  risk is demand-shaped, which is precisely and only what the beta instruments. So the benchmark does
  not weaken the case for the beta; **a passed benchmark is what makes the beta the binding next
  question.**

**REQ-BETA-20.** Sequence gates: Phase 0 exit criterion (§17) → C benchmark lift gate → beta open →
§2.6 behavior gates → full-IDE completion → public launch. Each gate has a pre-registered threshold
before the work behind it starts.

### 3.4 The hybrid: private beta on phone-width surfaces while the IDE is built

Considered: let partners in via the phone-width web contract (62a: gate actions, dispositions, chat)
while the desktop IDE is built in parallel. **Rejected as literally stated** — the phone-width surfaces
cannot carry the loop's heavy steps (import, run sheet, dossier reading, diff, manual revision are all
desktop acts by the spec's own §10.1 rule), so partners would experience a crippled loop and the
"validation" would measure the crippling. But the hybrid's kernel is right and survives as:

### 3.5 The sequenced-Phase-1 construction (how to build B without a fork)

**REQ-BETA-21.** The beta is built as a **strict subset of Phase-1 epics, ordered loop-first**, not a
side product: same repo, same design system where it already exists, same contracts (`findings-core`,
gate contracts, run API), plus exactly two beta-only stopgaps (CodeMirror edit mode — later promoted to
Source mode; flat surfaces later replaced by the §5 shells). Ticketing (REQ-PROD-13) tags every epic
`beta` or `post-beta`; the beta ships when the `beta` set is done, and Phase-1 work *may* continue
during the beta window on post-beta epics that no gate could plausibly cancel (foundations-adjacent,
export, security) — but the 24–30 PM of demand-sensitive epics (Voices, Assistant, figures, protocols
2–4, growth funnel) start only after the §2.6 gate reads. This keeps the beta a **gate**, not a
preview; the failure mode to refuse is "beta as marketing preview while the full build barrels on,"
which spends the PM and collects none of the option value.

### 3.6 Recommendation and decision rule

**Recommendation: Option B, built as §3.5's sequenced Phase 1.** Phase 0 (≈16.5–21 PM) → C benchmark
gate → Review beta (**≈28–37 PM cumulative; 10–15 PM of product**) → §2.6 gates → complete Phase 1
(+≈28–35 PM incl. the 3–5 PM tax) → public launch with the benchmark, partner evidence, and telemetry-
tuned pricing. The full IDE as specced remains the destination on every branch; what changes is only
when the demand-sensitive 24–30 PM is spent, and the answer is: after evidence, not before.

**Decision rule (Q-22).** *Choose the beta if the largest risk still standing after Phase 0 and the
benchmark would be demand-shaped rather than quality-shaped.* Concretely — choose full-IDE-direct only
if **both**: (a) the C benchmark has met its lift criterion, **and** (b) demand is already evidenced
without a beta: ≥15 identified target-segment writers have committed, with money (pre-payment or signed
LOI at ≥ Writer price), to putting real manuscripts through the loop at launch. Today (a) is unrun and
(b) is zero, so the rule chooses the beta. It also states its own reversal: if the operator can produce
(b) — e.g., from the upstream repo's audience — the beta's information value collapses and the
undiluted launch is worth more. And if the benchmark *fails* its gate, neither option proceeds; that
decision belongs to C4, upstream of this one.

**REQ-BETA-22.** The Q-22 record in F1 states the chosen option, the decision rule above, and — if the
beta is chosen — the §2.6 gate thresholds verbatim, so the go/no-go to the remaining Phase-1 spend is
mechanical, not vibes.

---

## Ledger updates

- E1 **done** — beta designed: nine-step flow on existing spec designs (REQ-BETA-1), Essay-only /
  Review+Revise+Fact-check / no Assistant / source-mode editor / manual credits + Payment Links;
  28–37 PM total, 10–15 beyond Phase 0 (REQ-BETA-4); instrumentation deltas REQ-BETA-6…12.
- E2 **done** — decision memo above; recommendation: validation-first as a sequenced Phase 1
  (REQ-BETA-20/21), decision rule in §3.6. Q-22 remains the operator's call at v0.3 review (F1).
- Interaction recorded for C5: the benchmark is UI-free and gates the beta (§3.3); its lift criterion
  is upstream of Q-22's either branch.

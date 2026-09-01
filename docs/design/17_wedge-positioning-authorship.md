# 17 — Wedge, positioning, and authorship legibility (round-2 workstream D)

- Scope: round-2 ledger rows **D1, D2, D3, D4**; produces the recommendation memos for operator decisions **Q-21** and **Q-24** · Date: 2026-09-01 · Sources fetched this session: **0 new** (by design — every evidence claim below cites a source already fetched and recorded in the round-1 notes, or the spec itself; the external critique is engaged as *argument*, never cited as evidence, per round-2 framing §0). Claims that depend on the critique's unverified citations are marked **[pending research/13]** and argued conditionally.
- Inputs read in full: `5_round2-ledger.md`; critique (`4_…`) §§4–6, 9–11, 16; crosswalk (`design/14`) in full; spec (`3_…`) §§0–3, 5.4, 5.7, 6.1–6.2, 6.7, 8.3–8.4, 11.3 (provenance types), 12.5–12.7, 14.1–14.2, 15, 16, 17; `research/12` §1–2; `research/6` §§2, 4–6; `research/5` (provenance and pricing-anchor sections); founding prompt; round-1 ledger §Q.
- Requirements added here are **REQ-POS-n**. Nothing in this note modifies the spec; §3.4 and §4 below contain the ready-to-merge text for F1.

## Executive summary (decisions-first)

1. **D1 / Q-21 recommendation: Essay-led GTM.** The landing page, Showcase project, pricing-page lead card, and first-90-day acquisition all speak to the serious essayist / newsletter writer / public intellectual; **Academic ships complete at MVP** (all four protocols, per Q-15) but never headlines. This is where the critique's §4, our own research/12 §1, and — read carefully — the founding prompt itself converge: the founding prompt's "academic niche" sentence is a *capability* anchor ("this is what the existing editorial-review skill is tailored to"), not a GTM commitment, and its very next clause asks for all serious genres; Q-15 (binding) already moved the product past academic-only. The wedge decision is therefore narrative, not scope. §1.5 gives the full argument and the risks of being wrong.
2. **D2 / Q-24 recommendation: a four-slice MVP bundle at ≈1.25–2 PM (≈2–3% of the 52–67 PM plan)** — (S1) the generated AI-use statement, (S2) a block-level provenance appendix at export, (S3) a block-level Authorship overlay, (S4) span-granularity *capture* (write-only) for agent-originated transactions with a degrade-on-human-edit rule. The audit in §2.2 shows R14/F46 deferred the whole of matrix row 39 as one editor-scope item, but only the span-*rendering* half actually belongs to the F46 cost family; the statement and appendix are projections of data structures the spec already builds at MVP (REQ-GENRE-5, REQ-VIS-10, `provenance_map`, transaction origins). Span-level marks + overlay (S5) stay 1.x.
3. **D3 decision: the headline stays "An editorial board for everything you write."** The critique's "agentic development environment for arguments" is the correct *category thesis* and is adopted into §1.1's prose (ready-to-merge text in §3.4); it is the wrong *headline* — developer-native, benefit-free, and aimed at analysts rather than writers. **Draft demotes to supporting act in every narrative surface — never in product**: the hero and proof sections lead with Review; Draft keeps its full place in the workflow strip, the run catalogue, and the product. Hero copy rewrite in §3.5.
4. **D4: a ready-to-merge §1.6 "What compounds"** mapping the critique's eight defensibility assets to the spec, each with its section or an honest "not yet + when" (§4). Five of eight are built at MVP; the two that are not — the comparative evaluation corpus and the longitudinal author model — are exactly round-2 workstreams C (design/16) and B2 (design/15), and §1.6 says so rather than bluffing.

---

## 1. D1 — The wedge memo (input to Q-21)

### 1.1 The question, and the presumption stack

Both GTM narratives below assume the **identical product**: four protocols (Academic, Essay, Op-ed, Memo — §2.1, §6.7), the same trial entitlement (§14.3), the same feature matrix. Nothing in Q-21 changes scope; it chooses **who the launch speaks to first** — landing hero, Showcase content, pricing-page lead, channels, and the order of proof. Under the round-2 presumption rules: operator decisions (Q-15: "MVP offers more than academic") outrank spec v0.2, which outranks the critique's unverified claims. The founding prompt is engaged directly in §1.4.

### 1.2 Narrative A — Essay-led (recommended)

**The story.** "You publish under your own name, on your own cadence, and nobody edits you. Rhema is the editorial board you don't have: a full review of the piece you were about to post — every claim checked against sources actually fetched, an independent second read that never saw the first reader's notes, a verdict calibrated to *your* archive — and a revision process that keeps your voice because it measured your voice."

**Landing-page hero and copy direction.**
- Headline: **"An editorial board for everything you write."** (unchanged; §3.2 argues why). A/B candidate stays *"Your draft, read like it matters."* — note it is intrinsically Essay-led copy.
- Sub-line and proof order rewritten review-first (ready-to-merge text in §3.5): the hero never depicts prose generation; the looping recording remains the dossier opening (already specced, §15.1) — under Essay-led this is not just the best demo, it is the *positioning*.
- The voices section ("a register, not a person", staleness pill) moves up one slot, ahead of live runs: research/12 §1.2 found the voice profile is the differentiator no essay-market incumbent has (Sudowrite injects raw prose samples; Jasper generates an editable description from ≤8 samples; Grammarly offers tone, not a measured, hold-out-tested print) [research/12 §1.2, S43/S2/S3].
- Copy never promises publishing reach or growth (Rhema never publishes, Q-9); the promise is *survival of scrutiny* — the JTBD in the writer's own words is spec §2.2 #1.

**Showcase-project content.** An **Essay-protocol** showcase — a ~2,000-word essay's outline, v1, full-board dossier, triage ledger, v2 and response letter — exactly as §16.3 #21 already proposes (one of the three real projects, operator-licensed, anonymised voice). Under Essay-led this proposal is confirmed rather than revisited: the first finding a new user ever sees is anchored in an essay, and the dossier's discourse report ("is this new?") and reception forecast are the sections an essayist reads first. The Showcase's claim ledger should include at least one *contradicted* Tier-1 claim with its fetched URL — the sharpest 60-second proof that this is not chat.

**Pricing-page emphasis.** Lead with the **Essay cost card** (5k words: full round 1,410–6,420 cr; §15.2) and the Quick/Standard/Full-board ≈180/300/350 anchor; Writer $20 = "≈3 essay loops on Base" is the honest monthly story and sits inside the fetched consumer anchor band ($8–22/mo — research/5 §1; spec §2.1). The voice profile (310–1,510 cr) is priced visibly as the thing no competitor sells. The Academic card stays on the page, second position. The Op-ed protocol is the **trial's featured demo** — the spec already identifies it as "the cheapest full-regimen demo" (§2.1) and the trial-economics mitigation row names it (§16.4).

**First-90-day acquisition channels** (*Inferred* — recommendations, not evidence claims; every public number cited is from round-1 fetched sources):
1. **The operator's own archive as channel zero.** The founding session's source persona is a Substack essayist; publish 3–5 real pieces *with their (redacted-as-needed) dossiers* as the launch content — "here is the review this essay survived." This is the only channel that demonstrates the product without trusting a claim.
2. **Writer-network distribution** (Substack Notes, writer Twitter/X, writing-craft newsletters): the serious tail is small enough to reach directly — ~10k+ publications past 1,000 paid subscribers, ~100k earning anything [research/12 §1.2, S5 (secondary, labeled)] — and small enough that a 6% landing-conversion target (§3.5) on modest traffic is a real funnel.
3. **Drop-zone-first launch posts** wherever technical founders and analysts write (the critique's §4 segment list overlaps ours here): the hero *is* the CTA; "drop the essay you're about to publish."
4. **Op-ed cycle PR**: a 750-word op-ed reviewed end-to-end is the cheapest shareable full-regimen artifact; pitch the workflow, not the tool, to the op-ed-writing community.
5. **SEO/comparison pages** against generic chat review ("ChatGPT reviewed my essay vs. an editorial board") built only on measured claims (REQ-GROWTH-5).
- *Constraint to respect:* read-only dossier share links are 1.x (matrix row 58), so at MVP the shareable artifact is an **exported** dossier; the GTM should not assume viral in-product sharing. (Pulling row 58 forward is an S-cost option; flagged in Open questions, not required.)

**Risks of Essay-led.**
- **Lower per-seat willingness to pay** than academic per-piece urgency ($8–22/mo anchors vs. $12–169 academic tools; spec §2.1). Mitigation: the wedge is narrative — Studio/Studio Max and the Academic and Memo cards remain fully visible for the high-WTP tail; nothing about the funnel refuses an academic.
- **The authorship-culture blast radius is largest exactly here** — an essayist's reputation is the asset, and this segment is the most sensitive to "AI slop" association. The Substack AI-scanning claim that sharpens this risk is **[pending research/13]**; but the risk does not depend on that one feature existing — the platform-independent integrity norms round 1 verified (ICMJE/COPE for academic; Authors Guild disclosure guidance; KDP's AI-generated vs AI-assisted line [research/12 §1.2 S6/S10/S19]) show the norm forming across the writing world. This is why D2's MVP slice (§2) is a *precondition* of Essay-led GTM, and why the narrative demotion of Draft (§3.3) is not cosmetic.
- **Segment breadth temptation**: "essayist" can smear into general "AI writing," the one market the spec refuses (§1.1). Guardrail: the banned-strings list (Appendix D.2) and REQ-POS-5's measured-claims rule.
- **Seasonal/spiky demand is weaker** than academic deadline cycles — steadier but slower compounding.

### 1.3 Narrative B — Academic-led (the founding-prompt framing)

**The story.** "Your paper will be reviewed — brutally, anonymously, in nine months. Get the brutal review now, in an afternoon: every citation re-verified against the actual source, the field mapped, an independent second read, a verdict in R1's own vocabulary, and a disclosure statement generated from the run history so your integrity is legible."

**Landing-page hero and copy direction.** Headline would shift to survival framing — e.g. *"Survive review before you submit."* — with the sub-line naming the claim ledger and second read. "Editorial board" reads slightly *trade* to academics (journals have editors and referees, not boards), so the flagship line would weaken. The recording would open an Academic dossier: claim table with DOIs, rubric with entailment caps, reviewer-voice verdict (accept/minor/major/reject).

**Showcase-project content.** An Academic-protocol showcase — a short journal-article-shaped piece with a bibliography, so the claim ledger shows citation re-verification (the segment's sharpest pain: hallucinated/misquoted references) and the export dialog shows the generated ICMJE-shaped disclosure statement (REQ-GENRE-5). Cost note: an academic showcase is heavier to keep honest — cited URLs/DOIs must keep resolving (§16.3 #21's quarterly re-verification burden roughly doubles against paywalled sources).

**Pricing-page emphasis.** Lead with the **Academic card** (8k words: review 1,240–5,750 cr; full round 2,970–13,790), frame per-piece against the cost of a rejected submission cycle, and lead the ladder at **Studio $100** ("≈1 academic loop on Frontier") with Writer positioned as the light tier. The $12–169/mo academic-tool anchors (Elicit $49–169, Paperpal, SciSpace, Overleaf — research/5 §2) support the higher lead price.

**First-90-day acquisition channels** (*Inferred*): conference-deadline cycles (the natural spike marketing calendar); grad-student and post-doc communities; academic Twitter/Bluesky; SEO against Paperpal/SciSpace/Elicit comparison queries; the disclosure-statement generator marketed as an integrity feature to catch the policy tailwind (NIH/NSF/ICMJE norms verified in research/12 §1.2 S6/S7/S16); writing-center and advisor word-of-mouth.

**Risks of Academic-led.**
- **The crowding argument.** The critique's §2 claims academic tooling is the most crowded adjacent market, resting partly on an *uncited* 2026 survey **[pending research/13]** — but our own fetched evidence already shows a dense, price-anchored field (Elicit, Paperpal, SciSpace, Scite, Overleaf AI — research/5 §2) where Rhema would launch as a comparison-shopped item rather than a new category. The crosswalk (row 2.3) records that the spec never argued *against* this — Academic was chosen for willingness-to-pay, and the crowding objection went unengaged. This memo engages it: crowding is a *headline* problem, not a *shipping* problem. The protocol object makes academia a config row (REQ-GENRE-1); headlining it makes Rhema legible as "another AI paper checker."
- **The integrity regime cuts against the flagship demo.** Whole-draft generation — an MVP workflow — is close to a liability in this segment: NIH refuses applications "substantially developed by AI"; ICMJE requires disclosure and denies AI authorship [research/12 §1.2 S6/S7]. An Academic-led launch must *hide its own Draft workflow* harder than an Essay-led one, which is a strange posture for a launch narrative.
- **The voice differentiator goes quiet.** Academic register is venue-constrained; the measured voice profile — our only feature with no incumbent analogue — matters least here.
- **Buyer-structure drift**: institutional expectations (procurement, LaTeX depth, reference managers, statistical review) are exactly the tail the spec refuses to build (§3.4 "Do not build Zotero"; §1.5), so the segment's own pull works against the scope discipline.
- **Optics**: reviewer-side misuse (§16.4's policy risk) is most likely to surface here first, in the launch-coverage window.
- **Trial economics**: academic drafts cluster at the 6,000-word entitlement cap (worst-case ≈$5.70 list COGS per signup, §16.3 #23) where essays cluster at the $2–4 typical case.

### 1.4 The evidence, including the founding prompt

**The critique (§4).** Its wedge is *not* "essayists" narrowly — it is "high-stakes analytical or long-form nonfiction" where the author "already possesses an argument," and its segment list leads with serious Substack/newsletter writers, essayists, public intellectuals, technical founders, and analysts, while §2/§9 argue explicitly against academia as the first wedge. Two honesty notes: (a) the load-bearing citation for the anti-academia argument is the uncited 2026 survey **[pending research/13]** — so from the critique we take the *argument shape*, not the evidence; (b) the crosswalk (row 4.2) shows the critique's segments and the spec's already overlap almost completely; the only real deltas are Academic (spec adds, critique avoids) and Journalism (critique includes, spec defers with a recorded reason).

**Our own research (research/12 §1 — fetched, verified round 1).** Independently of the critique it found: Essay is "the operator's own use case; the default protocol for the persona-less 'Unfiled' project space should probably be *this*, not academic, because it has the fewest apparatus requirements and the widest audience" — and the spec adopted that (Essay is the Unfiled default, §2.1/§6.7). It found the essay segment is where the persona system is the differentiator, with no incumbent doing a measured, hold-out-tested voice profile. It found the academic JTBD real and paying, but wrapped in the strictest integrity regime of any genre. And it found Op-ed — an essayist-adjacent protocol — to be the cheapest full-regimen demo, which the trial design leans on.

**The founding prompt, read precisely.** The anchor sentence is: "The bare bones MVP **can** focus on the academic niche **as this is what the existing editorial-review agent skill is tailored to**, but **ideally we want to support all possible use cases**…" — a permission grounded in an engineering fact (where the skill started), immediately qualified by the ambition, and later superseded by the operator's own binding decision Q-15 ("MVP offers **more than academic**; default genre/persona set to be derived from market research"). The market research came back (research/12) and leaned Essay for the default. So Essay-led GTM does not overrule the founding prompt; it completes the derivation the founding prompt commissioned. The remaining force of the anchor — the editorial-review skill's academic tailoring — is honored in scope: Academic ships at MVP, complete, with its disclosure generator and venue tables.

**Where the three sources disagree.** The critique would *defer* Academic entirely (§9.4); research/12 and Q-15 keep it at MVP; the spec's own risk register says "if one must go it is Memo," not Academic (§16.4). This memo sides with the spec against the critique on scope (the protocol object makes the marginal genre a config row plus QA, and the willingness-to-pay evidence is real), and with the critique against spec v0.2 on *narrative* (v0.2's §2.1 lists Academic first and the pricing examples lead academic — small signals, but launch surfaces compound).

### 1.5 Recommendation (Q-21)

**Essay-led GTM. Academic ships complete but does not headline.** Concretely (requirements in §5): the hero, recording, Showcase, first cost card, and channels 1–4 speak to the serious essayist/public intellectual; §2.1's segment table reorders Essay first; the pricing page keeps all four cards with Essay leading; the Academic track runs from day one as product truth (protocol, disclosure generator, venue tables) plus quiet SEO — never as launch narrative.

Why this survives being wrong in each direction: if the essay segment converts poorly, the product has lost nothing — Academic, Op-ed, and Memo are whole, and the narrative can pivot with a landing-page change (copy is the cheapest layer in the stack; §17's PM table prices the entire landing/onboarding area at 2–3 PM). If instead we headline Academic and the crowding read is right, we spend the unrepeatable launch window being compared to reference-checkers. Asymmetric downside favors Essay-led. The decision should be revisited against telemetry at the 90-day re-base (§3.5): if drop-zone drafts skew heavily academic, the narrative follows the users.

---

## 2. D2 — Authorship legibility re-costed (input to Q-24)

### 2.1 What was deferred, and why

Matrix row 39 ships **block-level provenance from transaction origins** at MVP and defers, as one bundle to 1.x: **span-level provenance marks + Authorship overlay + provenance appendix + AI-use statement** [spec §3.2 row 39; R14; review 13 F46]. The deferral was engineering-driven: review 13 F46 priced the uncut editor at ~two front-end engineer-years, and R14 moved the review-12 cut list (including "span-level provenance marks") to 1.x wholesale. The crosswalk flagged the consequence (row 5.2): "the culturally load-bearing surfaces are post-MVP," and rank 5 of its consequential-items table already guessed the re-costing result: "AI-use statement + provenance appendix are S…; span-level marks are M."

The cultural stakes: round-1 *verified* evidence shows provenance becoming the writing world's integrity primitive — Grammarly Authorship records typed/pasted/AI-assisted with a shareable report; iA Writer marks AI-pasted text and strips author metadata on export; ICMJE/COPE require disclosure; the Authors Guild and KDP draw the generated/assisted line [research/5 §1.4, sources 14, 21–23, 35, 36; research/12 §1.2 S6/S10/S19]. The Substack reader-facing scanning claim would sharpen this from "norm" to "detection risk" for the Essay segment specifically — **[pending research/13]**; §2.5 shows the recommendation does not hinge on it.

### 2.2 The audit: what MVP already builds (this is what changes the costing)

Re-reading the spec's own provenance machinery, five facts move the estimate:

1. **The AI-use statement is fully specified and not span-dependent.** REQ-VIS-10: "generated (template + run facts: workflows, model tiers, dates, phases, approvals, human-revision versions); the user may append but not remove generated sentences" [§8.4]. Its artifact kind `ai_use_statement` is already in §11.3's enum; §8.4's transparency-floor table already lists its surfaces (export dialog; project settings). Its inputs are `run` rows — MVP tables. Nothing in it touches the editor.
2. **The Academic protocol already generates a disclosure statement at export, at MVP.** REQ-GENRE-5: "generated from run history at export — a service, never a gate" [§6.7]. So the generate-integrity-document-from-run-rows machinery is *already MVP scope*; the general AI-use statement is a second template over the same query, not new machinery.
3. **Block-level provenance capture is MVP**, recorded from transaction origins (human / human-mobile / Drafter run vN / pasted / Assistant / suggestion-applied) into `provenance_map` [§5.4]; the schema already models both granularities: `granularity: 'block' | 'span'` with `spans: Array<{blockId; from?; to?; source}>` and a typed `ProvenanceSource` union [§11.3]. What is missing at MVP is not the data — it is any user-facing projection of it.
4. **The rendering machinery for an overlay already exists at MVP**: findings render as *decorations from a sidecar* over stable block ids [§5.4, REQ-SPEC-19]. A block-level authorship overlay is the same technique with a different sidecar — not a new editor capability.
5. **The genuinely expensive part is narrower than row 39 implies.** What made review 13 price span features into the F46 family is position bookkeeping through live collaborative editing: spans must split/merge/rebase across every human transaction, survive autosave/restore and version materialization, and be *correct* — an integrity surface that overclaims is worse than none. That cost is real, but it attaches to span **maintenance and rendering**, not to statement generation, block-level projection, or even span **capture** at agent-transaction time (where the range is known exactly: the Apply verb and proposal-card Accept apply "a plain ProseMirror transaction with agent origin" [§5.4] whose mapped range is available in-transaction).

So the R14 assumption — that row 39 is one indivisible editor-cost item — was wrong for three of its four components. Verdict on the workstream's hypothesis: **confirmed**, and slightly better than hypothesized (a block-level overlay is also cheap, not just the statement + run-level provenance).

### 2.3 The slices, with cost classes

Engineering cost classes calibrated against §17's PM table (export area 2–3 PM total; editor-after-cut 6–8 PM; landing/onboarding 2–3 PM): **S ≤ 0.5 PM · M 0.5–2 PM · L > 2 PM.**

| # | Slice | What it is | Depends on | Cost | Phase (rec.) |
|---|---|---|---|---|---|
| S1 | **AI-use statement** | REQ-VIS-10 as written: template + run facts; export dialog + project settings; per-protocol templates share the REQ-GENRE-5 generator (the Academic disclosure becomes the `academic` template of the same service) | `run` rows (MVP) | **S** (~0.25–0.5 PM) | **MVP** |
| S2 | **Provenance appendix, block-level** | An export appendix projecting `provenance_map`: per section/block — human · Drafter run vN · pasted · suggestion-applied (finding id) · Assistant; plus a one-paragraph summary ("~62% typed by you; §3 drafted by Drafter run 12 and edited by you; 4 suggestions applied") in project settings; honest labeling: "block-level — a block edited by you after drafting is marked *mixed*" | `provenance_map` (MVP), export container (MVP) | **S–M** (~0.5–1 PM) | **MVP** |
| S3 | **Authorship overlay, block-level** | View-menu toggle (Advanced): tints block backgrounds/gutter by provenance class using the findings-decoration technique; read-only; no marks in stored markdown | S2's projection; decoration layer (MVP) | **S** (~0.5 PM) | **MVP** |
| S4 | **Span capture, agent-originated only (write-only)** | At Apply / proposal-Accept / any agent-origin transaction, record `{blockId, from, to, source}` at span granularity. **Degrade-on-edit rule:** a human transaction inside a recorded span converts that block's spans to block-level `mixed` (semantically correct — human editing *is* mixed authorship — and it eliminates the rebase problem: spans never need remapping because any human touch dissolves them; agent-transaction mapping within an untouched block is a bounded, in-transaction computation) | transaction-origin hook (MVP) | **S** (~0.25–0.5 PM) | **MVP** |
| S5 | **Span-level marks + span Authorship overlay + span export appendix** | Persistent span provenance surviving human edits (true split/rebase via position mapping), the fine-grained "see what AI wrote" rendering, cross-version span history, a11y pass, mobile ignore | S4; the 1.x suggestion-marks family (F46) | **M** (~1–2 PM), correctness-dominated | **1.x** (as specced) |

**MVP bundle S1–S4: ≈1.25–2 PM**, ~2–3% of the 52–67 PM plan; no new tables (S4 uses the existing span-capable schema), no change to the F46 editor cut (S3/S4 deliberately avoid marks and rebasing). Amend matrix row 39 and §8.4's floor table accordingly (the floor row "Span-level provenance for the current draft" becomes "Provenance for the current draft (block-level at MVP; span 1.x)" — the floor should never promise above what ships).

### 2.4 Recommendation (Q-24)

**Yes — put S1–S4 in MVP; keep S5 at 1.x.** Three reasons beyond price:
1. **It is a precondition of the D1 wedge.** Essay-led GTM courts the segment most exposed to authorship anxiety; "editorial augmentation, not authorship substitution" needs a *showable* artifact on day one — the statement and the appendix are that artifact, and they demo well ("export includes an authorship appendix" is one proof bullet).
2. **The integrity story is already half-shipped and asymmetric.** Academic gets a generated disclosure statement at MVP (REQ-GENRE-5) while the Essay writer — the launch segment — would get nothing until 1.x. S1 removes an incoherence, not just a gap.
3. **The trust posture compounds.** Principle 9 ("show integrity as a feature") and the transparency floor are the spec's brand; authorship legibility is the same posture pointed at the writer's *readers* instead of at the writer.

Guardrails: the statement and appendix are **services, never gates** (REQ-GENRE-5's rule generalizes — Rhema never forces disclosure); the user may append but never remove generated sentences (REQ-VIS-10 unchanged); block-level surfaces must label their granularity honestly and never present `mixed` as precision.

### 2.5 Conditionality on research/13 (A3)

- If the Substack reader-facing AI-scanning claim **verifies**, S1–S3 graduate from product hygiene to **launch marketing**: the Essay narrative gains a section ("show your work — an authorship record your readers can trust") and the reputational-risk mechanism (visible generation → platform flagging → reader distrust) justifies pulling S5 forward if 1.1 capacity allows.
- If it **fails verification**, the recommendation stands unchanged on the round-1 verified base (Grammarly/iA precedents; ICMJE/COPE/Authors Guild/KDP norms) — only the marketing weight drops: no scanning-related claim ever ships in copy (REQ-GROWTH-5 would forbid it anyway until verified).

---

## 3. D3 — Positioning language

### 3.1 The test

Two candidate formulations, tested against the D1-recommended wedge (serious essayist first) on five criteria:

| Criterion | "An editorial board for everything you write." | "An agentic development environment for arguments." |
|---|---|---|
| Audience language (essayist) | Names a human institution of judgment writers know and want | Developer-native; "agentic" and "environment" are vendor words; "IDE for X" is a metaphor for people who use IDEs |
| Benefit vs architecture | States the benefit (judgment applied to *your* writing) | Describes the architecture; benefit must be inferred |
| Category discipline (§1.1: "editorial, never AI writing assistant") | Carries the category word itself | Carries "agentic," the most commoditized word of 2026 |
| Honesty | Defensible: the board is the phase disciplines plus an enforced independent second read; the landing already disambiguates ("Independent second read, not a panel of personas") | Accurate as a thesis; as a headline it overpromises an argument-graph object the spec does not yet build (crosswalk 7.6) |
| Differentiation | No competitor can honestly say it (requires the enforced boundary + fetched-source floor to back the word "board") | Any agent-framework vendor can say it tomorrow |

**Decision: the headline stays "An editorial board for everything you write."** — for the Essay-led wedge and, §1.3 suggests, even for the Academic one. The critique's phrase wins exactly one context: explaining the *category* to analysts, investors, and technical readers — so it is adopted into §1.1's prose as the category thesis (below), never into the hero. The A/B alternate *"Your draft, read like it matters."* is retained (REQ-GROWTH copy testing already plans it, §15.1). On "everything you write" vs the narrowed genre scope (no fiction/marketing in year one, §1.5): kept — the sub-line and the four protocol cards scope it, and the founding ambition ("all possible use cases") is the trajectory the headline names.

### 3.2 Draft demotes to supporting act — in narrative, never in product

**Decision: yes.** Grounds: the crosswalk's row 5.1 (the one PARTIAL the spec cannot argue away — whole-draft generation as a *headline* workflow sits in tension with augmentation positioning, and v0.2 nowhere records the tension); the D1 wedge (the essayist's JTBD is §2.2 #1 — review — not #2 — draft); and the integrity norms of both launch-adjacent segments. Concretely, "supporting act in narrative" means:
- The **hero** never depicts or promises prose generation; its verbs are review-led (§3.5).
- The landing's **section order** swaps: the dossier deep-dive precedes the workflow strip; the strip itself keeps lifecycle order (Outline → Draft → Review → Revise — it is a truthful diagram, not a billboard) and Draft's one sentence always carries the authorship frame it already has ("written to your outline, in your register, with a structure plan you approve first" [design/4 §1.3]).
- The **proof section** and Showcase open on review artifacts (already true).
- **In product, nothing changes**: Draft keeps its entry point, run sheet, pricing card, and catalogue row. Demotion is a copy rule, not a feature flag.

### 3.3 What this note does *not* change

"Editorial" remains the category word; "AI writing assistant" and "writes like you" remain banned (Appendix D.2); §1.4's four against-paragraphs stand (they already carry the critique's own best arguments, per crosswalk rows 1.4/3.1).

### 3.4 Ready-to-merge: spec §1.1 positioning paragraph (replaces the second paragraph of §1.1)

> The one-line positioning, used on the landing page and nowhere contradicted in the product: **"An editorial board for everything you write."** The category word is *editorial*, never "AI writing assistant" [design/4 §1.3]. Underneath the line, the category thesis: Rhema is an **agentic environment for arguments and manuscripts** — the discipline coding agents brought to code, applied to written reasoning — in which claims, sources, findings, dispositions, revision moves and review rounds are first-class, inspectable objects rather than chat scrollback [§11; external critique §16, independently derived]. The order of the two formulations is deliberate: the writer meets the board; the board stands on the object graph. And the posture is **augmentation, never substitution**: Rhema reviews, verifies, and strengthens work the author owns — drafting from the author's outline in the author's measured register is a supporting act in every narrative surface, and authorship stays legible end to end (run-level AI-use statement, provenance appendix, Authorship overlay — §8.4). Marketing leads with the review loop; the product carries the full loop.

### 3.5 Ready-to-merge: spec §15.1 hero copy (replaces the hero's copy elements; layout, drop-zone behaviour, motion policy unchanged)

> - **Headline** (serif display, 64–88 px): `An editorial board for everything you write.`
> - **Sub-line:** `Every claim checked against sources actually fetched. An independent second read. Revisions that keep your voice.`
> - **Drop-zone:** `Drop a draft (.md .docx .pdf) or paste text — get a full review` · secondary buttons `[ Start from scratch ] [ Upload an outline ]` · trial line `No card. Your first review is included.`
> - **Recording (12 s, unchanged):** dossier opens; findings fly to quoted passages; a claim verdict expands to its URL.
> - **Section order:** nav · hero · **the dossier** (three proof bullets as specced) · workflow strip (lifecycle order; Draft's sentence keeps the authorship frame) · the author's seat · **voices** ("a register, not a person") · live runs · models · proof · pricing · changelog + FAQ · final CTA. (Dossier and voices each move up one; everything else as v0.2.)
> - **A/B candidates** (unchanged): `An editorial board for everything you write.` vs `Your draft, read like it matters.`
> - **Copy rule (new):** no hero or proof surface depicts prose generation; generation appears only inside the workflow strip and product screenshots, always with its approval gate visible.

---

## 4. D4 — Ready-to-merge: spec §1.6 "What compounds (the competitive-moat statement)"

> ### 1.6 What compounds (the competitive-moat statement)
>
> Frontier platforms will absorb every feature describable as a prompt. Rhema's defense is never prompt quality; it is the set of assets below, each of which either ships in this spec (with its section) or is named honestly as not yet built (with when, and by what). The two structural gaps have owners: the comparative evaluation program is round-2 workstream C (design/16) and the longitudinal author model is round-2 workstream B (design/15); this table is updated when they land.
>
> | # | Asset | Status | Where, honestly |
> |---|---|---|---|
> | 1 | **Editorial methodology** — encoded protocols, independence rules, calibration, revision semantics | **Built (MVP)** | Versioned, contract-tested protocol package (§6.7, REQ-SPEC-22); independence enforced at the kernel and attested per run (§12.6); "protocols are never text; outputs always are" (principle 10) |
> | 2 | **Evaluation corpus** — blind comparison vs frontier baselines and human editors | **Not yet** — regression evals exist (§13.5: fixtures, deterministic scorers, nightly goldens); the *comparative* corpus, blind arms, and lift criterion do not | Round-2 workstream C → evaluation-program section (design/16); target: comparative lift measured before marketing may claim it (REQ-GROWTH-5 already gates claims on measurement) |
> | 3 | **Longitudinal author model** — learning from accepted/rejected/rebutted findings across projects | **Not yet** — the rows are captured at MVP (dispositions with rationales, `applied` flags, finding lineage — §11.3, §6.8) but nothing consumes them across projects | Round-2 workstream B2 (design/15); staged capture-now/learn-later; privacy posture per Q-12/Q-26 |
> | 4 | **Manuscript/evidence graph** — claims, sources, findings, obligations, revision lineage as rows | **Built (MVP)** | §11 in full: sidecar-first structured output (REQ-SPEC-12), enforced `cited ⇒ fetched` (REQ-VIS-9), disposition → move → diff joins (§5.8). The *argument graph* is the one absent primitive — a v2-posture research spike (round-2 B3) |
> | 5 | **Venue and audience calibration** | **Partial (MVP)** | Venue bars, verdict vocabularies, `verified_at` venue tables per protocol (§6.7); *empirically grounded* profiles (acceptance/reception outcomes feeding back) await north-star telemetry — Later, explicitly |
> | 6 | **Workflow switching costs** — corpus, voices, source libraries, revision history, standing guidance | **Built (MVP), deliberately honest** | All accrue (§9, §11.6) — and whole-account export still round-trips into a fresh account (REQ-ACCT-3): the moat is accumulated value, never hostage data. That choice is load-bearing for asset 7 |
> | 7 | **Trust and brand** | **Mechanism built (MVP); brand accrues post-launch** | Attestation from facts the sandbox cannot touch (§12.6), fetched-✓ chips, the guaranteed price cap (§14.4), measured-claims-only marketing (REQ-GROWTH-5) |
> | 8 | **Open methodology + proprietary evaluations/data** | **Resolved differently, on purpose** | Rhema keeps protocols server-side (SS class, §8.4) and substitutes a **transparency floor of outputs** — every verdict, URL, score and finding shown — for open methodology as the audit story. The public upstream repo (`agent-discourse`, Q-19) remains harness-neutral and could serve as distribution; that half is an open strategic option, revisited at the first marketing push, not a commitment |
>
> The bear case this table answers (external critique §15, dispositioned in Appendix F): if Rhema were a bundle of prompts in a pretty editor it would be a feature, not a company. What a horizontal platform cannot replicate by prompting: the kernel-enforced independent second read with attestation (1), the metered estimate-and-cap contract at the wire (§12.7), the response-ledger and provenance data compounding under 3 and 4 — and, once workstream C lands, a published comparative benchmark (2) that either proves the lift or tells us to stop.

---

## 5. Requirements (REQ-POS-n)

- **REQ-POS-1 (Q-21).** GTM is Essay-led: the landing hero, hero recording, Showcase project, pricing-page lead card, and launch channels address the serious essayist / newsletter writer / public-intellectual segment. Academic, Op-ed, and Memo ship complete at MVP (Q-15 unchanged) and appear on every scope surface; no launch-narrative surface leads with Academic. Revisit at the 90-day metrics re-base (§3.5) against drop-zone protocol mix.
- **REQ-POS-2.** Spec §2.1's segment table reorders Essay first; Academic remains fully specified. Pricing page (§15.2) leads with the Essay cost card; Academic card second; Op-ed remains the trial's featured demo.
- **REQ-POS-3.** The Showcase project is Essay-protocol (§16.3 #21's proposal confirmed); its claim ledger must contain at least one contradicted Tier-1 claim with its fetched URL.
- **REQ-POS-4.** The positioning headline is "An editorial board for everything you write."; the category-thesis formulation ("agentic environment for arguments and manuscripts") appears in §1.1 prose, docs, and analyst-facing material only — never as a hero headline. §3.4's paragraph replaces §1.1's positioning paragraph.
- **REQ-POS-5.** Draft is a supporting act in every narrative surface, never in product: no hero or proof surface depicts or promises prose generation; the workflow strip keeps lifecycle order with Draft's authorship-framed sentence and visible approval gate; product scope, entry points, and the run catalogue are unchanged. Add to the copy-lint family (REQ-PROD-6 / Appendix D.2 mechanism).
- **REQ-POS-6 (Q-24).** The AI-use statement (REQ-VIS-10 as written) ships at **MVP**, implemented as templates over the REQ-GENRE-5 generator; per-protocol templates (ICMJE-shaped for Academic; a general statement for Essay/Op-ed/Memo). A service, never a gate.
- **REQ-POS-7.** A block-level **provenance appendix** ships at MVP in every export format that supports appendices, projected from `provenance_map`, with granularity labeled ("block-level; blocks edited by the author after drafting are marked *mixed*"). Off by default; one toggle in the export dialog.
- **REQ-POS-8.** A block-level **Authorship overlay** ships at MVP as a View-menu toggle (Advanced), rendered as sidecar decorations; read-only; never stored in markdown.
- **REQ-POS-9.** Agent-originated transactions (Apply, proposal-card Accept, any run write) record **span-granularity** provenance at capture time into `provenance_map`; a human transaction inside a recorded span degrades that block to block-level `mixed` (no span rebasing at MVP). Write-only at MVP; renderable retroactively when S5 ships.
- **REQ-POS-10.** Span-level provenance *marks*, the span Authorship overlay, and span-granular export remain **1.x** (matrix row 39 amended to move only these; §8.4's floor table row reworded to promise block-level at MVP).
- **REQ-POS-11.** §15.1 hero copy and section order per §3.5; the copy rule of §3.5's last bullet is enforced by the same review that enforces REQ-GROWTH-5.
- **REQ-POS-12.** §1.6 (per §4 above) is added to the spec; its rows 2 and 3 are updated when design/16 and design/15 land; no marketing claim may cite an §1.6 asset marked "not yet."
- **REQ-POS-13.** No marketing or product copy references AI-detection or platform scanning unless and until research/13 verifies the underlying claim; if verified, Essay-narrative copy may reference authorship legibility ("show your work") but never detection-evasion.

## Ledger updates (round-2 ledger)

- **D1** → done · evidence: this note §1; recommendation Essay-led filed for Q-21.
- **D2** → done · evidence: this note §2; MVP slice S1–S4 ≈1.25–2 PM filed for Q-24; matrix row 39 amendment drafted (REQ-POS-6…10).
- **D3** → done · evidence: this note §3; ready-to-merge §1.1 and §15.1 text.
- **D4** → done · evidence: this note §4; ready-to-merge §1.6.
- **A3 dependency noted:** §1.2 (risk), §2.5, REQ-POS-13 are written conditionally pending research/13.
- **Proposed for F1:** amend §2.1 segment order, §3.2 row 39, §8.4 floor table, §15.1, §15.2 card order, add §1.6; register Q-21/Q-24 outcomes; the Essay-led narrative choice should also add the crosswalk's rank-7 competitive-risk rows to §16.4 (frontier absorption, prefer-chat, human-editor preference) — S-cost documentation assigned to F1, flagged here so it is not lost.

## Open questions / unverified

1. **Substack AI-scanning feature** (critique §5): unverified here by instruction — **pending research/13** (A3). Everything above is written to survive either outcome (§2.5).
2. **"2026 survey of AI manuscript-review tools"** (critique §2, uncited) — pending research/13 (A1); the anti-academia *headline* argument in §1.3 rests on our own fetched market evidence, not on it.
3. **Read-only dossier share links at MVP** (matrix row 58 pull-forward): an S-cost lever the Essay-led channel plan would use but does not require; operator call at F1.
4. **Channel recommendations in §1.2/§1.3 are Inferred** (no fetched conversion evidence for writer-community channels); the 90-day plan should instrument per-channel signup source from day one (`landing.viewed` referrer dimension exists in §3.5's catalogue).
5. **S4's degrade-on-edit rule** trades span persistence for correctness; if operators of the 1.x span feature want AI-span survival through light human edits, S5 must add true position mapping — costed there, not at MVP.

## Sources

No external sources were fetched this session. Internal citations: `3_rhema-design-spec.md` (v0.2) §§1, 2, 3.2, 3.4, 3.5, 5.4, 5.7, 6.1–6.2, 6.7, 8.3–8.4, 11.3, 12.5–12.7, 14.1–14.3, 15, 16.1–16.4, 17, Appendix D.2; `4_external-chatgpt-product-business-critique.md` §§2, 4, 5, 9, 10, 11, 15, 16 (as argument, per round-2 rule §0); `design/14` crosswalk rows 2.3, 4.1–4.3, 5.1–5.4, 7.6, 10.1–10.8, 13.2, 15.1–15.3, part-2 ranks 5–7, part-3 items 3–4; `design/4` §1.3; `research/5` §§1.1, 1.4, 2 (sources 3, 12–14, 21–26, 35–36 therein, fetched 2026-08-27); `research/6` §§2.2, 4–6 (sources 41–45, 52 therein); `research/12` §§1.1–1.4, 2.5 (sources S2–S10, S16–S19, S24, S26, S30, S37, S40, S43 therein); `1_founding-prompt.md`; `2_research-and-design-ledger.md` §Q (Q-5, Q-7, Q-9, Q-14, Q-15, Q-19); `5_round2-ledger.md` §§0, D, Q.

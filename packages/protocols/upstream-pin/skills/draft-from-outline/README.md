# draft-from-outline — Outline to First Draft

The `draft-from-outline` skill (`SKILL.md`) takes the step before
`editorial-review` and `respond-to-review`: its input is **an outline, research
dossier, or pile of notes** (plus, optionally, a persona and the human's
decisions), and its output is **`drafts/v1.md` — a finished first draft — plus a
short drafting note** recording what was verified, what was cut, where the draft
departed from the outline, and what only the human can decide.

It is deliberately *not* a "write this up" prompt. The naive architecture —
walk the outline top to bottom, convert bullets to sentences — is a machine for
producing the specific artifact that wastes everyone's time: a document with the
shape of an essay, the argument of an outline, and inherited citations nobody
checked. This skill is built around three claims: that **structure is a decision
made before writing**, that **provenance is a property of each claim rather than
of the document**, and that **the draft must be audited by someone who did not
write it**.

This document explains the design: the failure classes, the literature and
practice behind each mechanism, and the limits.

---

## 1. The problem: what breaks when an agent drafts from an outline

Seven failure classes, none of which are capability failures:

1. **Outline-shaped prose.** Sections that restate their headings, paragraphs
   that are bullets in sentence clothing, transitions supplied by "Moreover."
   Long-form generation research names the general form of this failure
   precisely: *local fluency amid global incoherence* — passages that read well
   sentence by sentence while the piece has no through-line — or the opposite,
   deviation from the plan even when a plan exists ([Yang et al., DOC][doc],
   describing the failure modes of the strong Re3 baseline).
2. **Inherited structure.** The outline's order is the order in which research
   arrived, or in which a chat unfolded. Reproducing it as the reading order
   imports an organization nobody chose for a reader. McPhee's entire account of
   nonfiction craft treats structure as the writer's central problem, solved
   deliberately before drafting and chosen from the material at hand
   ([*Structure*, The New Yorker][mcphee]).
3. **Claim laundering.** The outline's citations arrive formatted and plausible
   and are largely unchecked. Measured fabrication rates in model-produced
   citations span **11.4%–56.8%** across ten deployed models and ~69.5k citation
   instances ([cross-model audit][audit]); GPT-4-era literature reviews
   fabricated **18%** of citations outright with **24%** of the real ones
   carrying substantive errors ([Walters & Wilder][walters]); fabrication
   *increases* with topic specialization and prompt specificity ([economics
   audit][econ]; [mental-health study][jmir]). An outline is therefore not
   evidence, and a draft that inherits it silently converts unchecked claims
   into published ones.
4. **Shaky links, not hallucinated facts.** Expert evaluation of outline-driven
   long-form generation found the dominant error class to be **red herrings —
   shaky links and over-association of unrelated facts — above factual
   hallucination**, together with *source bias transfer*: the draft adopting one
   source's framing wholesale ([Shao et al., STORM][storm]). Outlines juxtapose;
   prose asserts relations. The conversion is where unearned inferences enter.
5. **Length pathologies in both directions.** Models under-produce relative to
   instructions — effective output length is bounded by what was seen in
   supervised fine-tuning, with the familiar ~2,000-word wall
   ([LongWriter][longwriter]) — while research outlines over-promise, often by a
   factor of three to five. Unmanaged, a draft comes in thin where the argument
   is hard and bloated where the material was easy.
6. **Voiceless prose, and the homogenization it belongs to.** Writing with a
   feedback-tuned model measurably reduces lexical *and* key-point diversity,
   with the reduction attributable to the model's contributions rather than the
   human's ([Padmakumar & He, ICLR 2024][padmakumar]); generative-AI assistance
   makes individual outputs better and the collective more similar — a social
   dilemma in creative production ([Doshi & Hauser, *Science Advances*
   2024][doshi]). And the default register is now *detectable*: the arrival of
   LLM writing assistants produced an abrupt, unprecedented rise in specific
   **style words** in the literature ([Kobak et al.][kobak]). A draft with no
   voice does not read as neutral; it reads as machine-written.
7. **Invented specifics.** The most damaging thing a drafting agent can produce
   is not a weak argument but a fabricated scene, quotation, or first-person
   anecdote — plausible, unattributed, and fatal to the author's credibility on
   the day a reader checks it.

## 2. What the literature and practice say

### 2.1 Plan, draft, revise — and put the burden on the plan

The plan/draft/revise decomposition is both the human writing process
(pre-writing → drafting → revising, the frame STORM builds on) and the strongest
known architecture for machine long-form: Re3's Plan-Draft-Rewrite-Edit produced
substantially more coherent and premise-relevant stories than rolling-window
generation (+14% and +20% absolute in human pairwise judgments), and its
ablation shows the **plan module is the load-bearing part** ([Yang et al.,
Re3][re3]). DOC then showed that pushing *more* of the creative burden into a
detailed, hierarchical plan — and enforcing it during generation — beats Re3 by
22.5% on coherence and 28.2% on outline relevance ([DOC][doc]). AgentWrite's
plan carries a **target word count per unit** before any prose is written
([LongWriter][longwriter]).

**Design consequence:** Phases 0–2 are all planning, and Phase 2 is a gate. The
structure plan is not a table of contents: it is a spine of *claims*, and a
per-section contract of function, entry state, exit state, permitted material,
and word budget — the granularity DOC found necessary, expressed as prose
constraints rather than a token-level controller. Nothing is drafted before the
plan is on disk, and `autonomous=false` pauses exactly there, because it is the
last point at which the piece's shape is cheap.

### 2.2 The outline is materials; the reading order is a decision

McPhee's method is structure sheets before sentences, and his constraint is
strict: "what's there is what you deal with, and all you deal with… if something
is red and globular, you don't call it a tomato if it's a bell pepper"
([*Structure*][mcphee]). Two rules fall out — the plan may only promise what the
material supports, and the material's arrival order has no authority over the
reader's.

**Design consequence:** the Phase 0 four-way classification (**commitment /
advice / material / alternatives**) is the mechanism that makes "the outline is
materials" operational rather than an excuse to ignore the outline. Commitments
bind; editorial *advice* in the outline is weighed; alternatives get decided and
recorded. Sequence is the drafter's, and every departure is logged with a reason
in the draft ledger — with `fidelity: strict` available when the operator wants
the outline reproduced and its problems reported instead of fixed.

### 2.3 Verification belongs before the prose, claim by claim

Self-correction is reliable where **verification is easier than generation** —
checking a decomposed claim against a fetched source is the canonical favorable
case ([Kamoi et al.][kamoi]) — and the state of the art in long-form factuality
does exactly that: decompose the text into individual self-contained facts and
check each one against search results, a procedure that agrees with
crowdsourced annotators 72% of the time at 1/20th the cost
([Wei et al., SAFE/LongFact][safe]). Combined with §1.3's fabrication rates, the
conclusion for drafting is that the *claim*, not the document, is the unit of
trust.

**Design consequence:** Phase 3 runs before drafting, and its ledger carries per
claim: provenance class, tier, verdict from the closed
[`editorial-review`](../editorial-review/references/verification-protocol.md)
vocabulary, URL and accessed date, the source's actual wording, and a
**drafting instruction** (use as-is / rescoped / attributed / do not use). A
failed Tier-1 claim sends the run back to Phase 2 rather than into a hedge,
because a section whose premise is false is a structural problem. Claims born
during drafting are logged as written and verified or marked before the section
closes — the same anti-laundering rule `respond-to-review` applies to revision.

### 2.4 Unverified must be visible in the draft, not just the ledger

The tempting move — soften an unverified specific into a vague generality — is
the prose analogue of the "performative addressing" failure `respond-to-review`
is built against: it removes the *appearance* of the problem while making the
problem harder for the next reader to find.

**Design consequence:** rescope **and** mark. An unverified claim that ships
carries an inline `[unverified: …]` in the draft, appears in the drafting note's
unverified list, and thereby arrives at the editorial round already flagged. The
same rule covers the invention boundary: quotations, sources, attributions,
first-person experience, and scenes may never be manufactured, and an
illustrative or composite scene must say so *in the text*.

### 2.5 Length is planned, then reconciled

Because outlines over-promise and models under-produce, both errors are
systematic and neither is caught by reading the draft once. AgentWrite's
per-unit word budgets are the cheap fix ([LongWriter][longwriter]).

**Design consequence:** every section row carries a budget; budgets are totalled
against the target *before* drafting; actuals are recorded per section as it
closes; Phase 5 reconciles and cuts from the over-budget sections specifically —
never uniformly, since uniform trimming preferentially destroys the concrete
detail that makes prose worth reading. The cut list is a first-class artifact:
cuts are decisions the human can overrule and a companion piece can inherit.

### 2.6 Voice is bound by exemplars and measurements, not adjectives

Style descriptions ("erudite but accessible") are unfalsifiable and do not
constrain. What can be checked is: short exemplar passages held in view while
writing, measurable targets (sentence-length distribution, punctuation rates,
first-person policy, apparatus counts), a rationed list of the persona's
signature moves, and a hazard list of the model's own markers, drawn from the
excess-vocabulary evidence ([Kobak et al.][kobak]).

**Design consequence:** Phase 1 produces a voice brief consisting of exactly
those things, sourced from a persona profile where one exists
([`conventions/personas.md`](../../conventions/personas.md)) and derived and
labeled ad-hoc where it doesn't. Phase 5 measures the draft against the brief's
numbers, and Phase 6 measures again independently. The skill never asks the
model to "write in X's voice" and hope; it gives the model targets and then
counts.

### 2.7 The drafter is the wrong auditor of the draft

Evaluators favor and defend text that is already in their context, and
in-context recognition amplifies the effect ([Panickssery et al.][panick]). The
drafter knows what each sentence was *supposed* to do, which is precisely the
knowledge that makes outline-restatement invisible to it. Long runs also lose
state, which is why the artifacts are on disk in the first place
([Anthropic, long-running harnesses][harness];
[context engineering][context]).

**Design consequence:** Phase 6 runs in a fresh context given the draft, the
brief, the plan, the ledger, the voice brief, and the outline — and explicitly
*not* the deviation log or any account of how the draft was written. It rebuilds
the commitment list from the outline rather than from the brief (checking a
brief against its own extraction inherits its blind spots), applies the
six outline-restatement tests, audits asserted links against warrants (§1.4),
counts voice features, and ends with an unprimed first read. Closure is bounded
at three iterations, and anything still open goes into the drafting note in the
audit's own words.

## 3. Anatomy: phase → mechanism → grounding

| Phase | Mechanism | Grounding |
|---|---|---|
| 0 Intake | Full read; commitment/advice/material/alternatives classification; refusals; claim inventory with provenance classes; gaps; open questions | Outline-as-materials (§2.2); provenance per claim (§2.3); anti-drift into rejected theses |
| 1 Voice binding | Exemplars + measurable targets + signature ration + hazard list, from a persona profile or declared ad-hoc | Homogenization and detectability (§1.6, §2.6); persona convention |
| 2 Structure plan | Spine of claims; per-section function/entry/exit/material/budget; opening and ending specified; promise–payoff table; apparatus budget; cut list; deviations; human gate | Plan-carries-the-burden (§2.1); structure as decision (§2.2); budgeted length (§2.5) |
| 3 Grounding | Tier-1-first verification; re-verification of every outline citation; gap research; ledger with drafting instructions; source notes persisted | Verification-easier-than-generation and per-claim decomposition (§2.3); fabrication rates (§1.3) |
| 4 Draft | Section-by-section against contracts; ledger updated as each closes; new claims logged; no placeholders; register discipline | Detailed-outline control (§2.1); durable state (§2.7); register hazards (§2.6) |
| 5 Consolidation | Whole-draft read; seams; promise/payoff; thesis discipline; budget reconciliation; measured voice audit; provenance sweep | Global-before-local revision; length reconciliation (§2.5) |
| 6 Fidelity audit | Fresh context; coverage rebuilt from the outline; restatement tests; link-integrity walk; provenance spot-checks; measured voice; unprimed first read; bounded closure | Self-preference (§2.7); shaky-link failure class (§1.4) |
| Delivery | `drafts/vN.md`, frozen ledger, drafting note (decisions, deviations, cuts, unverified list, open questions), manifest bump | Inter-skill interface with `editorial-review`; project-memory convention |

## 4. Degrees-of-freedom calibration

- **Low freedom (exact protocol):** the four-way outline classification, the
  requirement that a plan exist on disk before drafting, the section-contract
  fields, budget accounting, the provenance classes and verdict-to-instruction
  mapping, the never-invent list, the in-text marking rule for unverified
  claims, the ledger and note formats, the audit's inputs and its
  rebuild-from-source rule, the phase order. These encode the anti-failure
  structure; a model under a helpfulness prior will not hold them unaided —
  especially not the ones that make it slower.
- **High freedom (judgment):** the reading order, what the piece's argument
  actually is, which material earns its place, how each section is written, what
  the opening does, where the voice should stretch. The skill supplies
  constraints and evidence; it does not supply the writing, and proceduralizing
  the writing would produce exactly the outline-shaped prose it is built to
  prevent.

The calibration mirrors the sibling skills: what a frontier model lacks is not
prose ability but **a plan it is accountable to, verified claims, and an audit it
cannot flatter** — properties of the run, not of the model.

## 5. Honest limitations

- **A first draft is a first draft.** The skill's success criterion is a whole,
  honest, well-structured draft — not a publishable piece. The review loop
  (`editorial-review` → `respond-to-review`) exists downstream, and the drafting
  note is written to make that round efficient rather than to preempt it.
- **Voice fidelity is bounded, and the bound is measured elsewhere.**
  Inference-time stylistic personalization improves trait-level and judge-level
  similarity while remaining *below* a cross-author baseline on trained
  authorship verification, with the common metrics barely correlated
  ([authorship-gap evaluation][gap]); stylometric analysis of GPT-4o imitating
  distinctive literary voices finds in-context examples help while imitations
  still cluster with generic model output ([stylometric imitation study][stylo]).
  The voice brief buys constraint and measurement, not identity.
- **The audit shares weights with the drafter.** Fresh context removes the
  strongest amplifier of self-preference, not weight-level correlation of taste
  ([Panickssery et al.][panick]). A human read remains stronger; the artifacts
  are designed to make that read fast.
- **Verification is bounded by access.** Paywalled or offline primary sources
  degrade to `unverifiable` — honestly recorded, but a human with library access
  would resolve more. And verification cannot rescue an outline whose *framing*
  is wrong: every claim can check out while the piece is still tendentious. That
  is the editorial round's job.
- **The cut list is where disagreement concentrates.** An agent cutting a
  section the human loved is the most likely reason a run needs redoing; the
  `autonomous=false` gate and the recorded cut list are the mitigations, and
  neither is a substitute for the human reading the plan.
- **Diversity loss is mitigated, not solved.** Persona conditioning pulls a draft
  away from the model's attractor; it does not exempt the output from the
  collective-homogenization dynamic ([Doshi & Hauser][doshi];
  [Padmakumar & He][padmakumar]). The honest framing is that the human's
  judgment — which structure, which cuts, which sentences survive revision — is
  what keeps the piece theirs.
- **Not yet eval-hardened.** Highest-signal observables for drift: sections whose
  first sentences announce their headings; ledgers with more `verified` rows than
  fetched URLs; drafts at 60% of target with a full cut list; register-hazard
  counts above zero at delivery; audits that find nothing. Iterate there first.

## 6. Portability and memory

Harness requirements: file read/write and **web search + fetch** (Phase 3);
optionally a subagent primitive (Phase 3 fan-out and Phase 6 independence, with
the sequential fallback discipline otherwise). Drafting itself is never fanned
out across parallel subagents — a piece written by five contexts has five voices
— which is also why the skill is usable on harnesses with no subagent primitive
at all.

All durable state follows
[`conventions/project-memory.md`](../../conventions/project-memory.md): the
outline in `agents/author/outline/`, the per-draft working dossier in
`agents/author/drafting/v<N>/`, source notes in `agents/author/research/`, the
draft in `drafts/`, and the drafting note in `correspondence/` — where the
editor may read it, and where the memory boundary keeps the author's working
deliberations private. Personas live outside project memory
([`conventions/personas.md`](../../conventions/personas.md)) because a voice
outlives any one piece. The full chain composes:
`bootstrap-persona → draft-from-outline → editorial-review → respond-to-review →
editorial-review …`

## References

- Yang, Tian, Peng & Klein — *Re3: Generating Longer Stories With Recursive Reprompting and Revision*, EMNLP 2022 — [ACL Anthology][re3]
- Yang, Klein, Peng & Tian — *DOC: Improving Long Story Coherence With Detailed Outline Control*, ACL 2023 — [arXiv:2212.10077][doc]
- Shao, Jiang, Kanell, Xu, Khattab & Lam — *Assisting in Writing Wikipedia-like Articles From Scratch with LLMs* (STORM), NAACL 2024 — [ACL Anthology][storm]
- Bai et al. — *LongWriter: Unleashing 10,000+ Word Generation from Long Context LLMs* (AgentWrite), ICLR 2025 — [arXiv:2408.07055][longwriter]
- Wei et al. — *Long-form factuality in large language models* (LongFact, SAFE), NeurIPS 2024 — [arXiv:2403.18802][safe]
- Kamoi et al. — *When Can LLMs Actually Correct Their Own Mistakes?*, TACL 2024 — [arXiv:2406.01297][kamoi]
- Panickssery et al. — *LLM Evaluators Recognize and Favor Their Own Generations*, NeurIPS 2024 — [arXiv:2404.13076][panick]
- Walters & Wilder — *Fabrication and errors in the bibliographic citations generated by ChatGPT*, Scientific Reports 2023 — [doi:10.1038/s41598-023-41032-5][walters]
- *How LLMs Cite and Why It Matters: A Cross-Model Audit of Reference Fabrication* — [arXiv:2603.03299][audit]
- *ChatGPT Hallucinates Non-existent Citations: Evidence from Economics* — [doi:10.1177/05694345231218454][econ]
- *Influence of Topic Familiarity and Prompt Specificity on Citation Fabrication*, JMIR Mental Health 2025 — [journal][jmir]
- Kobak, González-Márquez, Horvát & Lause — *Delving into LLM-assisted writing through excess vocabulary*, Science Advances 2025 — [arXiv:2406.07016][kobak]
- Padmakumar & He — *Does Writing with Language Models Reduce Content Diversity?*, ICLR 2024 — [OpenReview][padmakumar]
- Doshi & Hauser — *Generative AI enhances individual creativity but reduces the collective diversity of novel content*, Science Advances 2024 — [doi:10.1126/sciadv.adn5290][doshi]
- *Theory-Grounded Evaluation Exposes the Authorship Gap in LLM Personalization* — [arXiv:2604.26460][gap]
- *Beyond the surface: stylometric analysis of GPT-4o's capacity for literary style imitation*, DSH — [doi:10.1093/llc/fqaf035][stylo]
- John McPhee — *Structure*, The New Yorker, 14 January 2013 — [newyorker.com][mcphee]
- Gopen & Swan — *The Science of Scientific Writing*, American Scientist 1990 — [PDF][gopen]
- Anthropic — [Effective context engineering for AI agents][context]; [Effective harnesses for long-running agents][harness]

[re3]: https://aclanthology.org/2022.emnlp-main.296/
[doc]: https://arxiv.org/abs/2212.10077
[storm]: https://aclanthology.org/2024.naacl-long.347/
[longwriter]: https://arxiv.org/abs/2408.07055
[safe]: https://arxiv.org/abs/2403.18802
[kamoi]: https://arxiv.org/abs/2406.01297
[panick]: https://arxiv.org/abs/2404.13076
[walters]: https://doi.org/10.1038/s41598-023-41032-5
[audit]: https://arxiv.org/abs/2603.03299
[econ]: https://doi.org/10.1177/05694345231218454
[jmir]: https://mental.jmir.org/2025/1/e80371
[kobak]: https://arxiv.org/abs/2406.07016
[padmakumar]: https://openreview.net/forum?id=Feiz5HtCD0
[doshi]: https://doi.org/10.1126/sciadv.adn5290
[gap]: https://arxiv.org/abs/2604.26460
[stylo]: https://doi.org/10.1093/llc/fqaf035
[mcphee]: https://www.newyorker.com/magazine/2013/01/14/structure
[gopen]: https://courses.cs.duke.edu/spring11/cps262/pdf/gopen.1990.pdf
[context]: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
[harness]: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents

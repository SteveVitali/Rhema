# editorial-review — Draft to Elite Editorial Dossier

The `editorial-review` skill (`SKILL.md`) packs the full pre-publication review apparatus of an elite
publication — commissioning editor, peer reviewer, fact-checking department, line editor — into a
single agent run whose input is a **draft article or essay** and whose output is a **review dossier**:
an editor's letter with a calibrated verdict and ranked major issues, a claim-by-claim fact-check
ledger, a discourse report with an originality audit, an independent second read, an anchored rubric
scorecard, and an ordered revision roadmap.

It is deliberately *not* a "critique my essay" prompt. It is a review harness in prose: a phased
regimen with verification obligations, judgment-independence gates, and calibration rules, designed
around two bodies of evidence — how professional editorial review actually works, and how LLM
reviewers characteristically fail.

This document explains the design: what the practice and the literature say, how each phase responds,
and why the specific mechanisms chosen here are the right ones.

---

## 1. The problem: what breaks when you ask a model for editorial review

Asking a frontier model to "rigorously review this draft" produces something review-shaped. The
empirical literature on LLM-generated review says it predictably fails in six ways — and none of them
are capability failures fixed by a smarter model; they are structural failures of the *run*:

1. **Sycophancy / leniency drift.** Models trained on human preference align with the author's
   perspective and soften verdicts; surveys of LLM-assisted review flag sycophancy as a first-order
   integrity risk ([Ensuring peer review integrity in the era of LLMs][integrity]).
2. **Generic, portable feedback.** "Could be clearer," "consider more examples" — comments that fit
   any essay. LLM reviews are documented to "summarize manuscripts superficially, overlook
   methodological flaws, and fail to offer meaningful suggestions" ([LLM4SR survey][llm4sr]).
3. **Verbosity over depth.** Fine-grained comparisons find LLM reviewers emitting roughly **4×** the
   feedback units of human reviewers (~21 vs ~5.7), with the surplus being shallow
   ([fine-grained comparison][finegrained]).
4. **Fabricated sources.** LLM review output can include "fabricated but convincing information …
   including fictitious references" ([integrity survey][integrity]) — fatal in a document whose
   authority rests on verification.
5. **Summary-as-review.** The model proves it read the piece by paraphrasing it, not by finding what
   is wrong with it.
6. **Coverage ceiling of a single reading.** Liang et al.'s large-scale study found two *human*
   reviewers of the same paper overlap on only ~28–35% of their points — and an LLM reviewer overlaps
   with a human at about the same rate ([Liang et al. 2024][liang]). Any single reading, however
   good, misses most of what a second independent reading would find.

`editorial-review` is organized so that every phase either carries a verification obligation, runs
behind an independence gate, or is bound by an explicit calibration rule. The actual critical
intelligence — what is wrong with the argument, what the fix is — is left to the model's competence.

## 2. What professional practice and the literature say

### 2.1 Elite editorial review is four disciplines, not one

A generic "editorial review" prompt collapses four distinct professional traditions into one pass.
The skill keeps them separate, because each has its own method and failure standard:

- **The magazine fact-checking model.** In the New Yorker-style "magazine model," checkers verify
  every fact against sources, call back every source, and research "the factual context behind every
  evaluative claim," so that "no part of the published article can be objected to on factual grounds"
  ([KSJ Handbook, *The Three Models of Fact-Checking*][ksj]; [CUNY fact-checking guide][cuny]).
  Deadline checking is explicitly a **triage** discipline — effort ordered by how load-bearing and
  how contestable each claim is.
- **Academic peer review.** The stable criteria across venues are originality, significance,
  validity/soundness, and contextualization in prior work ([Li et al., *Developing a Criteria
  Framework for Peer Review*, 2025][li]; [Taylor & Francis reviewer checklist][tf]); the modern
  review form separates a comprehension-proving summary from soundness and presentation judgments
  ([NeurIPS reviewer guidelines][neurips]); and the craft norm for the report itself is major/minor
  separation, ranked, specific, and actionable ([constructive-review guides][conphys]).
- **The levels-of-edit taxonomy.** Professional editing proceeds developmental → line → copy, in
  that order, because polishing prose that won't survive structural surgery is wasted work
  ([Jericho Writers, *Types of Editing*][jericho]).
- **Argumentation theory.** Informal logic evaluates an argument by whether its premises are
  **acceptable**, **relevant**, and **sufficient** for the conclusion, and evaluates scheme-shaped
  arguments (analogy, authority, consequence) through their **critical questions** — the questions
  that, unanswered, defeat that argument form ([*Schemes, Critical Questions, and Complete Argument
  Evaluation*][walton]). This is a method; fallacy name-dropping is not.

**Design consequence:** the seven-phase regimen is these four disciplines in their professional
order, each with its own protocol and artifact. Phase 1 is the magazine model made executable
(`references/verification-protocol.md`: claim classes, triage tiers, sourcing standards, six-verdict
ledger). Phases 2–3 are peer review's originality/soundness split: discourse mapping produces an
explicit originality verdict and finds the strongest existing counterargument; the argument critique
reconstructs the piece's skeleton and tests each load-bearing inference against
acceptability/relevance/sufficiency and the scheme's critical questions. Phase 4 is the
levels-of-edit at three altitudes, with line-level depth scaled to draft stage — and the revision
roadmap orders the author's work the same way (structure before argument repairs before craft).

### 2.2 The failure modes get countermeasures, not warnings

The §1 failure classes are addressed as hard operating principles wired into every phase, not as a
"be rigorous" exhortation:

| Documented failure | Countermeasure in the skill |
|---|---|
| Sycophancy / leniency | Calibration pegged to the target venue's *published* bar; "a review in which nothing important is wrong is almost always a failed review"; verdict vocabulary mirrors journal decisions |
| Generic feedback | Every finding must quote or cite a specific passage; comments that would fit a different essay are explicitly banned |
| Verbosity | 3–7 ranked major issues, each developed in depth; everything else demoted to minor issues or pattern-level line notes |
| Fabricated sources | Nothing may be cited that was not fetched and read in-session; every ledger entry carries its URL; failed verification yields "unverifiable," never a guessed citation |
| Summary-as-review | The letter's "piece's project" section is a *steelman* the author should endorse — comprehension is proven by reconstruction, and the second read cross-checks that the thesis even transmits |
| Prosecution bias (the over-correction) | "Report against interest": findings that vindicate the piece get equal prominence — the review's authority depends on not being a prosecution |

### 2.3 Independence beats simulation

The tempting architecture is a simulated review board: persona reviewers (the harsh methodologist,
the prose stylist) debating under a lead editor. The evidence points the other way:

- Persona-based review simulation is a tool for **studying** reviewer bias, not adding rigor —
  [AgentReview][agentreview] (EMNLP 2024) uses LLM reviewer personas to quantify a 37.1% decision
  variation attributable to bias. Role assignment by itself re-skins one model's judgment; what
  measurably helps is directing attention to distinct named concerns, which the phase structure
  already does.
- What *does* add findings is an **uncontaminated second reading**: the ~30% inter-reviewer overlap
  result ([Liang et al.][liang]) means most of a second independent reviewer's value is in the
  points the first one missed.
- LLM evaluators favor and defend what is already in their context; self-preference persists across
  contexts but is amplified by in-context recognition ([Panickssery et al., NeurIPS 2024][panick]).
  The editorial analogue: a reader who has already formed findings reads the draft *through* them.

**Design consequence:** one orchestrating editor, three isolated delegations, no staged debate. The
second read (Phase 5) receives **only the draft** — no brief, no findings — and its output is
reconciled explicitly: overlap promotes confidence, divergence is evaluated on the merits, and
rejected findings appear in the letter's "considered and rejected" section so the author sees the
judgment. One diagnostic falls out for free: if the second read states a materially different
thesis, the piece is failing to transmit its own thesis — a major finding no single reading can
produce. Independence order matters twice more: the editor forms their own reading (Phase 0)
*before* researching what anyone else has said, and craft critique (Phase 4) is done before the
research reports are read back.

### 2.4 Research-heavy phases need isolation; the dossier is the coordination medium

Phases 1–2 fetch and read large volumes of web material. Anthropic's context-engineering guidance
identifies exactly this pattern — sub-agents for research-heavy subtasks, structured artifacts on
disk, compaction as a lossy last resort ([Effective context engineering for AI agents][context];
[Effective harnesses for long-running agents][harness]).

**Design consequence:** the review dossier (`<draft>-review/`: piece brief, claim ledger, discourse
report, second read, editor's letter) is written to disk as each phase completes, and phases
communicate **only through those files**. Where the harness supports subagents, Phases 1, 2, and 5
run in parallel isolated contexts while the editor does the craft pass; where it doesn't, the same
regimen runs sequentially with an explicit fallback discipline (downstream phases re-read the
on-disk reports, never rely on memory of producing them; the second read becomes a labeled
perspective-shift pass). Reports must be complete — the ledger contains every checked claim, not a
summary — because the files are simultaneously the inter-phase interface, the compaction-proof
state, and the author's inspectable evidence trail.

### 2.5 Verification is run in the regime where models are reliable

The self-correction literature's precise result: models generate unreliable feedback about outputs
when reasoning intrinsically, but perform well when **verification is easier than generation** —
checking a decomposable claim against a fetched citation is the canonical favorable case
([Kamoi et al., TACL 2024][kamoi]). Claim-checking research adds the triage layer: check-worthiness
is a ranking problem, and practical fact-checking prioritizes claims by importance and
contestability ([CLEF CheckThat! on check-worthiness][checkthat]).

**Design consequence:** Phase 1 is structured as a pure citation task — claim inventoried, tiered,
checked against a fetched source, verdict from a closed six-item vocabulary, URL recorded — never
"does this seem right." The tier system (load-bearing / supporting / color, with mandatory escalation
for surprising, damaging, or *too-good-to-check* claims) is the professional triage discipline made
explicit. The ledger's verdicts then feed the rubric mechanically (§2.6).

### 2.6 Rubrics summarize; they must not launder

Quantified quality scores invite two failures: leniency/central-tendency drift, and the aggregate
score that averages a fatal flaw against good prose. Review-form design at major venues anchors each
dimension to behavioral descriptions and keeps dimensions separate ([NeurIPS guidelines][neurips]).

**Design consequence** (`references/rubric.md`): eight dimensions on a 1–5 scale whose anchors are
absolute ("4 = publishable at the target venue after minor revision"); a **5 requires a named
published exemplar**; scores must be **entailed by findings** via explicit caps (a contradicted
load-bearing claim caps *Evidence & accuracy* at 2; an ignored strongest-counterargument caps
*Argument rigor* at 3; a second read that read a different thesis caps *Thesis & contribution* at 3);
and there is deliberately **no aggregate score** — the letter's verdict is the only summary judgment.

### 2.7 A body of work is context an editor has and a prompt doesn't

A venue editor knows the other pieces. That knowledge does two things a
draft-only review cannot: it replaces a *guessed* calibration bar with the venue's
actual published norms, and it exposes a finding class invisible from the draft —
the piece that contradicts a position the author published last year without
acknowledging it, re-argues ground an earlier piece settled, or silently
redefines a term of art the corpus established.

**Design consequence:** the optional `persona` input
([`conventions/personas.md`](../../conventions/personas.md)) gives the editor
*exactly* the profile files that job justifies — structure repertoire, venue and
audience notes, cited positions, and the continuity record — and deliberately
**not** the voice print. An editor holding a draft to a measured voice print is
running a conformity check, and conformity is not a quality criterion: "this
doesn't sound like you" is not a finding. Continuity findings are added to Phase
3 as a substantive class, anchored to both the persona file and the prior piece,
and a persona never softens a verdict. The persona library sits outside project
memory and is readable by every agent, because it holds published work and
observations about it — not either seat's private deliberations.

## 3. Anatomy: phase → mechanism → grounding

| Phase | Mechanism | Grounding |
|---|---|---|
| 0 Intake | Two readings; Piece Brief with steelmanned thesis, argument skeleton, claim inventory, research agenda | Summary-as-review countermeasure (§2.2); independence-before-influence (§2.3); review the piece the author is writing |
| 1 Verification | Tiered triage; primary-source checks; six-verdict claim ledger with URLs | Magazine model (§2.1); verification-easier-than-generation (§2.5); fabricated-source countermeasure (§2.2) |
| 2 Discourse mapping | Predecessor research; explicit originality verdict; strongest existing counterargument; misrepresentation check; reception forecast | Peer review's originality/contextualization criteria (§2.1); strawman check as fairness obligation |
| 3 Argument critique | Skeleton-based; acceptability/relevance/sufficiency per inference; critical questions for load-bearing analogies; scope-matching; significance; continuity with the body of work where a persona is given | Argumentation theory as method (§2.1); body-of-work context (§2.7) |
| 4 Craft critique | Three altitudes (structure / prose / voice); patterns-with-exemplars line notes; depth scaled to draft stage | Levels-of-edit ordering (§2.1); verbosity countermeasure (§2.2) |
| 5 Second read | Fresh context, draft only; reconciliation with promote/reject discipline; divergent-thesis diagnostic | Inter-reviewer overlap (§2.3); self-preference mitigation (§2.3) |
| 6 Synthesis | Editor's letter (verdict, "the one thing," 3–7 ranked majors, strengths-as-protection-orders); entailed rubric; ordered revision roadmap | Review-report craft norms (§2.1); rubric anti-laundering (§2.6) |
| Dossier | All phases write complete reports to `<draft>-review/`; files are the only inter-phase interface | Durable state and research isolation (§2.4) |

## 4. Degrees-of-freedom calibration

Specificity in the skill tracks fragility, not model capability:

- **Low freedom (exact protocol):** the claim-class list, triage tiers, verdict vocabulary, ledger
  entry format, rubric anchors and entailment caps, the letter template, the second-read
  instruction, the phase ordering. These are consistency-critical — they make dossiers comparable
  across runs and drafts, keep the verdicts honest, and encode the professional standards a model
  will not reliably re-derive under a helpfulness prior.
- **High freedom (judgment):** everything that constitutes the actual critique — which arguments
  matter most, what the disanalogy is, what the fix direction is, how to characterize a voice, what
  the reception will be. Frontier models do this better unconstrained; proceduralizing it would
  produce checklist criticism.

The calibration insight mirrors the sibling engineering skills: for a frontier model, the skill adds
almost no "how to think critically" content — it adds **verification obligations, judgment
independence, and calibration honesty**, the three properties a model cannot self-supply because
they are properties of the run, not of the model.

## 5. Honest limitations

- **The second read shares weights with the first.** Fresh context removes in-context anchoring —
  the strongest known amplifier — but not weight-level correlation of taste ([Panickssery et
  al.][panick]). A genuinely independent human editor or different-model read remains stronger; the
  dossier is designed to make that human read fast, not to replace it.
- **Absence of predecessors is not originality.** Phase 2's audit is bounded by open-web recall:
  paywalled scholarship, books, and unindexed discourse can hide the true nearest neighbor. The
  originality verdict is therefore stated as "none found," never "none exists."
- **The reception forecast is informed speculation.** It is grounded in the actual discourse mapped
  in Phase 2, but it predicts humans; it is labeled as forecast, not finding.
- **The elite bar is a stance, not a measurement.** There is no ground truth for essay quality; the
  anchors, caps, and named-exemplar rule bound leniency drift but cannot eliminate judgment
  variance between runs.
- **Fact-checking is bounded by access.** Primary sources behind paywalls or offline degrade
  verdicts to "unverifiable" — honestly recorded, but a human checker with library access would
  resolve more.
- **A persona profile is a dated observation.** Continuity findings are only as good as the profile's
  coverage and freshness; a stale or thin profile can produce a false "you already said this" or miss
  a real contradiction. The skill reports the profile's date and staleness verdict whenever it leans
  on one.
- **Not yet eval-hardened.** The highest-signal observables for drift: portable comments creeping
  into letters, thin ledgers on claim-dense drafts, and rubric rows whose scores are not entailed by
  any cited finding. Iterate there first.

## 6. Portability

The regimen is harness-agnostic prose. It requires of the harness: **web search and fetch**, **file
read/write**, and optionally a **subagent primitive**. Where subagents exist, Phases 1/2/5 run
isolated and parallel; where they don't, the sequential order and fallback discipline in the skill's
Execution model apply — the dossier files make the two paths equivalent in artifacts, differing only
in the second read's independence (which the dossier then labels). No assumptions about repo,
language, or toolchain; the output is a directory of markdown next to the draft — or, when the
piece has project memory ([`conventions/project-memory.md`](../../conventions/project-memory.md)),
a versioned dossier under its `correspondence/`, with the editor's own research persisted in
`agents/editor/` for reuse across review rounds and strict separation from the author agent's
memory (see the sibling `respond-to-review` skill for the other side of that boundary).

## References

- KSJ Science Journalism Handbook — [*The Three Models of Fact-Checking*][ksj]
- CUNY Craig Newmark Graduate School of Journalism — [Fact-checking your reporting][cuny]
- Nieman Storyboard — [*The New Yorker at 100: editor-writer relationships*](https://niemanstoryboard.org/2025/02/14/new-yorker-at-100-editor-writer-relationships/)
- Li et al. — *Developing a Criteria Framework for Peer Review*, Learned Publishing 2025 — [doi:10.1002/leap.2016][li]
- Taylor & Francis — [Reviewer checklist][tf]
- NeurIPS — [Reviewer guidelines][neurips]
- Oxford Conservation Physiology — [*Tips and tricks for writing constructive peer reviews*][conphys]
- Jericho Writers — [*Types of Editing: How to Choose*][jericho]
- *Schemes, Critical Questions, and Complete Argument Evaluation* — Argumentation (2020) — [Springer][walton]
- Liang et al. — *Can LLMs Provide Useful Feedback on Research Papers?*, NEJM AI 2024 — [arXiv:2310.01783][liang]
- Jin et al. — *AgentReview: Exploring Peer Review Dynamics with LLM Agents*, EMNLP 2024 — [arXiv:2406.12708][agentreview]
- *Large Language Models for Automated Scholarly Paper Review: A Survey* — [arXiv:2501.10326][llm4sr]
- *Impact of LLMs on peer review opinions from a fine-grained perspective* — [arXiv:2604.19578][finegrained]
- *Ensuring peer review integrity in the era of large language models* — [ScienceDirect][integrity]
- Kamoi et al. — *When Can LLMs Actually Correct Their Own Mistakes?*, TACL 2024 — [arXiv:2406.01297][kamoi]
- Panickssery et al. — *LLM Evaluators Recognize and Favor Their Own Generations*, NeurIPS 2024 — [arXiv:2404.13076][panick]
- CLEF CheckThat! Lab — *Detecting Check-Worthy Claims* — [arXiv:2109.12987][checkthat]
- Anthropic — [Effective context engineering for AI agents][context]; [Effective harnesses for long-running agents][harness]

[ksj]: https://ksjhandbook.org/fact-checking-science-journalism-how-to-make-sure-your-stories-are-true/the-three-models-of-fact-checking/
[cuny]: https://researchguides.journalism.cuny.edu/factchecking-verification/fact-check-your-work
[li]: https://onlinelibrary.wiley.com/doi/10.1002/leap.2016
[tf]: https://editorresources.taylorandfrancis.com/reviewer-guidelines/review-checklist/
[neurips]: https://neurips.cc/Conferences/2025/ReviewerGuidelines
[conphys]: https://pmc.ncbi.nlm.nih.gov/articles/PMC12702561/
[jericho]: https://jerichowriters.com/types-of-editing-how-to-choose/
[walton]: https://link.springer.com/article/10.1007/s10503-020-09512-4
[liang]: https://arxiv.org/abs/2310.01783
[agentreview]: https://arxiv.org/abs/2406.12708
[llm4sr]: https://arxiv.org/abs/2501.10326
[finegrained]: https://arxiv.org/abs/2604.19578
[integrity]: https://www.sciencedirect.com/science/article/pii/S3050577125000167
[kamoi]: https://arxiv.org/abs/2406.01297
[panick]: https://arxiv.org/abs/2404.13076
[checkthat]: https://arxiv.org/abs/2109.12987
[context]: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
[harness]: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents

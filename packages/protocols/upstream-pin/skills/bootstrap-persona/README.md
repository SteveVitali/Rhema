# bootstrap-persona — Description to Tested Persona Profile

The `bootstrap-persona` skill (`SKILL.md`) is the one-time (refreshable)
research pass that stands behind every other persona-aware skill in this repo.
Its input is **a paragraph of description plus pointers to a body of work**; its
output is a **structured, cited, dated persona profile** per
[`conventions/personas.md`](../../conventions/personas.md) — measured voice
print, structure repertoire, lexicon, positions, continuity record,
audience-and-venue notes, per-piece corpus notes, provenance — plus a
**calibration file** reporting how close the profile got on a piece it was never
allowed to see.

It exists because the alternative is worse in two directions. Asking a model to
"write like X" spends the corpus knowledge it does not have. Asking each skill to
research the corpus mid-run spends the same expensive pass every time, buries
reusable knowledge inside a per-piece context, and produces a different voice
each run.

---

## 1. The problem: what breaks when an agent "learns a voice"

1. **Style description substitutes for style.** Asked to characterize a voice, a
   model produces adjectives — "erudite yet accessible," "elegant and
   incisive" — that constrain nothing and can be satisfied by its own default
   register.
2. **Synthesis from summaries.** The cheapest way to build a profile is to read
   an archive page and a few excerpts. The result is a plausible fabrication:
   confidently specific, unfalsifiable, and trusted by everything downstream.
3. **Over-production of signatures.** Imitation fails loudest by excess. The
   move an author makes twice per essay appears nine times in the imitation, and
   the imitation reads as parody. Without measured rates there is nothing to
   ration against.
4. **Voice without mind.** A profile that captures cadence and nothing else
   produces fluent pieces that cite the wrong canon, re-argue what the corpus
   settled three years ago, or contradict it without noticing.
5. **Unfalsifiable self-assessment.** The agent that wrote the profile is the
   agent that grades it, and it will grade generously — the same self-preference
   dynamic documented for LLM evaluators, amplified when the object is already in
   context ([Panickssery et al.][panick]).
6. **Silent staleness.** A living corpus grows and voices move. A profile with no
   provenance dates and no coverage fraction cannot be known to be out of date,
   so it is trusted forever.
7. **Ethical drift.** "Learn this person's voice" is a short step from "publish
   as this person," and the artifact itself — a distilled model of how someone
   writes — invites the step. Nothing in a bare markdown file prevents it.

## 2. What the literature and practice say

### 2.1 The measurable gap: exemplars and descriptions help *different* things

The most direct evidence available on inference-time stylistic personalization
compares four methods across 50 authors and 1,000 generations, grounded in
authorship-verification theory. Its findings are unusually load-bearing for
design: every method — non-personalized, few-shot exemplars, extracted style
profile, contrastive — scored **below the cross-author floor** on a trained
authorship-verification model (0.484–0.508 vs. a 0.626 floor and a 0.756 human
ceiling), while the *rankings reversed* across metrics: few-shot led on
verification-model similarity, **profile extraction led on trait matching**
(0.542 vs. 0.433), and the three metric families correlated at |r| < 0.07
([authorship-gap evaluation][gap]). Stylometric analysis of a frontier model
imitating Hemingway and Shelley reaches the compatible conclusion: in-context
learning improves alignment, and the imitations still cluster with generic model
output ([stylometric imitation study][stylo]).

**Design consequence:** the profile carries **both** — short exemplar excerpts
(what few-shot conditioning consumes) *and* measured features plus described
traits (what a trait-matching consumer consumes) — because neither dominates and
they are improving different things. It also means the profile's promise is
scoped honestly: constraints and calibration targets, not a voice transplant.
That sentence appears in the convention, in this README, and in the skill's own
delivery instructions, because a persona system that oversells itself will be
trusted exactly where it is weakest.

### 2.2 A profile is a retrieval problem, not a context dump

Personalization research converged on retrieval for a mundane reason: user
profiles exceed context budgets, and not every item in a profile is relevant to
the current task — so selected items beat everything-at-once
([Salemi et al., LaMP][lamp]). The same logic governs a writing persona: a
drafter needs three exemplars and a punctuation target, not thirty corpus notes.

**Design consequence:** `profile/index.md` is a hub, and the convention specifies
**what loads when** per consumer — drafting takes voice print, structure,
lexicon, exemplars; the editor takes structure, venue, positions, continuity, and
deliberately *not* the voice print (a reviewer holding a piece to a voice print
is a conformity check, not a critique). The corpus notes stay on disk as the
evidence layer, read by a refresh rather than by every consumer.

### 2.3 Measurement is the only honest constraint

The features classical stylometry has used for a century — function-word
distributions and their kin — are exactly the ones a harness can count without
any model: sentence length, paragraph shape, punctuation rates, first-person
frequency, apparatus counts ([function-word stylometry, as used in the
authorship-gap evaluation][gap]). And counting is the regime where
self-correction is reliable: verification against an artifact is easier than
generation ([Kamoi et al.][kamoi]).

**Design consequence:** `references/voice-print.md` mandates that every line be
either a measurement with its sample and method, or a description with a quoted
instance. Signature moves carry **observed rates and rations** (§1.3), and the
anti-signature list carries zero-instance evidence. This is also what makes the
downstream audits possible: `draft-from-outline`'s Phase 5 and Phase 6 count the
same features and report numbers next to targets rather than impressions.

### 2.4 The hold-out is the falsification

If the profile is a set of predictions about how a piece by this author is
built, then a piece the profile never saw is a test — and a cheap one.

**Design consequence:** Phase 0 reserves one or two pieces *before any reading
begins* and forbids their fetch, including in every subagent prompt (a subagent
knows only its prompt, so the exclusion must be named there by URL). Phase 4
predicts the hold-out's opening from title and topic alone, then reads it,
compares measured features side by side, records the qualitative divergences, and
**corrects the profile**, logging each correction with evidence. The two failure
patterns the test reliably exposes — signature over-production and premature
thesis delivery — become rations and structural instructions rather than
observations. Refresh mode makes the newest piece the hold-out, so the same test
also detects drift.

The optional blind check is included with an explicit warning attached: a single
trial judged by a model sharing weights with the generator is one weak
observation, not a score ([Panickssery et al.][panick]). Its value is the stated
*reasons*, which name the tells.

### 2.5 A persona must carry the mind, not just the mouth

The reason `positions.md` and `continuity.md` exist is that most of what makes a
new piece belong to a body of work is not cadence: it is using the same
conceptual vocabulary in the same senses, keeping the same company of
interlocutors, not re-arguing what an earlier piece settled, and being able to
say "as I argued in *After Bureaucracy*" accurately.

**Design consequence:** the profile records recurring theses with quotations and
citations, distinguishes held positions from recurring preoccupations, and keeps
a chronological continuity record of what each piece established and what
vocabulary it introduced. Under any mode but `self`, these files are
quotation-bound — no extrapolated views — which is both an ethical rule and an
accuracy rule.

### 2.6 Derived artifacts must be regenerable, and provenance dated

Project memory in this repo already draws the line between what is expensive and
stable (persist) and what is cheap or perishable (recompute), and it never
persists raw fetched pages
([`conventions/project-memory.md`](../../conventions/project-memory.md)).
Persona knowledge sits on the same axis: distilled notes are the durable
currency; the corpus itself is re-fetchable by URL.

**Design consequence:** one directory per persona — the human-authored **seed**
(`PERSONA.md`) stays authoritative and is only appended to, with a marked note;
operator-supplied corpus files in `docs/` are read and never written; everything
under `profile/` is derived and regenerable. The directory is the unit precisely
because a persona accretes these layers, and a flat file would force a migration
the first time one arrives. Corrections that are authorial decisions
go to the seed; corrections that are findings go to `calibration.md`. And
`provenance.md` records the census, the sample, the exclusions with reasons, the
hold-out, and accessed dates — so `index.md` can carry a **staleness verdict**
(the convention's ~25%-corpus-growth / ~6-month rule) that consuming skills
report rather than guess at.

### 2.7 Persona conditioning is a mitigation for homogenization, not an exemption

Writing with a feedback-tuned model reduces lexical and key-point diversity, with
the loss traceable to the model's contributions rather than the human's
([Padmakumar & He][padmakumar]); generative-AI assistance raises individual
quality while making the collective output more similar — a social dilemma in
creative production ([Doshi & Hauser][doshi]). And the default register is
detectable: LLM assistants produced an abrupt, unprecedented rise in a specific
set of style words ([Kobak et al.][kobak]).

**Design consequence:** the anti-signature section ends with a **hazard
overlap** — the places where this author's genuine habits resemble the machine
register, named explicitly, because those are the sentences where a drafter
imitating the persona and a drafter falling into the default will produce the
same text. Naming them is what makes the ration enforceable instead of
excusable.

### 2.8 Ethics belongs in the artifact, not the operator's memory

A persona is a portable file that will be read by agents in future sessions with
no access to the conversation that created it.

**Design consequence:** `usage` is a required property with four values (`self`,
`consented`, `house`, `study`), it defaults to the **most restrictive** when
unstated, the default is reported prominently for the human to correct, and the
restrictions are written into `profile/index.md` where every consumer sees them
first. The convention adds the standing rules: no deceptive attribution, notes
and short excerpts rather than stored corpora, respect for paywalls and platform
terms, quotation-bound positions for non-`self` personas, and no publishing by
any skill in this repo.

### 2.9 One author's registers must not be averaged — hence composites

A writer with an academic corpus and an essayistic one has two distributions of
every measurable feature. Measuring across both yields a sentence-length
"target" that is the midpoint of two modes, an apparatus norm that matches
neither, and a signature-move rate averaged over pieces that make different
moves. The union is real — one author, one set of positions — but it is a union
of *substance*, not of style.

**Design consequence:** the convention's **composite persona** (members declared
in the seed) and this skill's `mode: compose`. A composite is built from its
members' profiles rather than from the corpus, owns only `positions.md`,
`continuity.md`, an optional all-members `shared-lexicon.md`, and a
`register-map.md`, and deliberately has **no voice files**: a consumer needing a
voice routes to exactly one member and states which. Its calibration test is
therefore about *routing* — predict which member a real piece belongs to from
title, venue, and date — because misrouting the register is a composite's
characteristic failure, the way over-producing a tic is a voice print's. Mode is
the most restrictive of the members', and members must be leaf personas so the
routing terminates.

The payoff is asymmetric across consumers, which is why the load table
differentiates them: an editor wants the union (contradiction and repetition do
not respect registers), while a drafter wants exactly one member.

## 3. Anatomy: phase → mechanism → grounding

| Phase | Mechanism | Grounding |
|---|---|---|
| 0 Resolve, consent, census | Seed resolution; `usage` settled (restrictive default); full corpus census; recency-weighted sample with recorded exclusions; **hold-out reserved and forbidden** | Ethics in the artifact (§2.8); coverage honesty (§2.6); falsification setup (§2.4) |
| 1 Close reading | One note per piece, read in full; observations not generalizations; ≤40-word purposeful excerpts | Anti-summary-synthesis (§1.2); excerpt rule (§2.8); evidence layer for §2.3 |
| 2 Voice print | Measured features with sample + method; register described with quoted instances; signature moves with rates and rations; anti-signature with zero-instance evidence; hazard overlap | Measurement as constraint (§2.3); over-production failure (§1.3); register detectability (§2.7) |
| 3 Positions, continuity, venue | Quotation-bound theses; chronological record of what each piece established; platform mechanics and norms | Mind not mouth (§2.5); non-`self` quotation bound (§2.8) |
| 4 Calibration | Predict the hold-out's opening from title alone; read; compare measured + qualitative; correct with evidence; optional blind check with caveat | Falsification (§2.4); verification-easier-than-generation (§2.3); self-preference (§1.5) |
| 5 Package | `index.md` hub with mode, coverage, staleness verdict, calibration result, load-order; marked note appended to the seed; honest operator report | Retrieval/progressive disclosure (§2.2); derived-vs-authored boundary (§2.6) |
| — Compose *(composite only)* | Members resolved (leaf-only); most-restrictive mode; register map with a default and named ambiguities; unioned positions/continuity keeping member + citation; cross-register relations; contradictions flagged, not smoothed; routing calibration | No-averaging rule (§2.9); mind not mouth (§2.5); staleness inheritance (§2.6) |

## 4. Degrees-of-freedom calibration

- **Low freedom (exact protocol):** read pieces in full (never synthesize from
  summaries); the hold-out reservation and its propagation into subagent prompts;
  measurement-or-quotation for every line; rates on every signature move; the
  restrictive `usage` default; the excerpt-length rule; the seed/derived
  boundary; provenance fields and the staleness verdict; the calibration
  comparison table. These are the properties a model will not self-supply,
  because each one costs effort or admits a limit.
- **High freedom (judgment):** which pieces best cover the range, what the
  distinctive moves actually are, how to characterize a register, which excerpts
  will help a drafter most, what the divergences in the calibration test mean.
  This is literary judgment, and constraining it would produce a profile that
  reads like a linter's report.

## 5. Honest limitations

- **The gap does not close.** §2.1's numbers are the ceiling this skill operates
  under: a profile improves trait-level fidelity and rations the tells; it does
  not make the model the author. Every consumer is instructed to report where it
  could not meet the targets.
- **One hold-out is one data point.** It exposes gross failures (over-produced
  signatures, wrong thesis placement, wrong opening move) reliably and subtle
  ones by luck. Two hold-outs on a larger corpus, and the refresh-mode test each
  round, are the available mitigations.
- **Small corpora produce small profiles.** Seven essays support a real structure
  repertoire and a rough voice print; they do not support claims about how the
  author handles genres they have not written. The `low-confidence` marker and
  the coverage fraction exist so downstream skills can discount rather than
  guess.
- **Paywalls truncate, and formats fail.** A piece read to its paywall cut-off
  yields structure and opening but not endings; the corpus note records where the
  cut fell, and ending-pattern claims are weakened accordingly. A `docs/` file the
  harness cannot extract text from is recorded as unread and counted against
  coverage rather than guessed at.
- **A composite is only as good as its members.** Composing over unbuilt member
  profiles produces a register map and little else, and the union inherits the
  worst member's staleness. Cross-register contradiction detection is also
  recall-limited: it finds what the member profiles recorded, not everything the
  corpora contain.
- **Measurement is not taste.** Everything countable here is a proxy. A profile
  can hit every number and still miss the thing that makes the writing worth
  reading — the choice of what to notice. That is irreducible, it is recorded as
  a known limit, and it is the reason the human stays the author.
- **A profile can ossify a voice.** Writers change, and a well-built profile is a
  conservative force: it encodes what has been done. The staleness rule, the
  drift record in refresh mode, and the precedence order (human guidance > voice
  charter > persona) are the counterweights.
- **Not yet eval-hardened.** Highest-signal observables for drift: profiles whose
  measurements lack samples; corpus notes that read like archive summaries;
  calibration files with no corrections (a test that found nothing was not a
  test); `usage: self` appearing without the human having said so. Iterate there
  first.

## 6. Portability

Harness requirements: file read/write and **web fetch** (or a local corpus);
optionally a subagent primitive for the Phase 1 fan-out and the Phase 4 blind
check, with sequential fallbacks specified. No scripts, no scrapers, no
dependencies: the profile is markdown, so it is readable by a human, diffable in
git, and portable to any harness — which matters because a persona is the
longest-lived artifact this repo produces.

Composition: `bootstrap-persona → draft-from-outline → editorial-review →
respond-to-review`, with the persona library shared across every project and the
project's `manifest.md` recording which persona (and which profile date) a piece
was written against.

## References

- *Theory-Grounded Evaluation Exposes the Authorship Gap in LLM Personalization* — [arXiv:2604.26460][gap]
- *Beyond the surface: stylometric analysis of GPT-4o's capacity for literary style imitation*, DSH — [doi:10.1093/llc/fqaf035][stylo]
- Salemi, Mysore, Bendersky & Zamani — *LaMP: When Large Language Models Meet Personalization*, ACL 2024 — [ACL Anthology][lamp]
- Kamoi et al. — *When Can LLMs Actually Correct Their Own Mistakes?*, TACL 2024 — [arXiv:2406.01297][kamoi]
- Panickssery et al. — *LLM Evaluators Recognize and Favor Their Own Generations*, NeurIPS 2024 — [arXiv:2404.13076][panick]
- Padmakumar & He — *Does Writing with Language Models Reduce Content Diversity?*, ICLR 2024 — [OpenReview][padmakumar]
- Doshi & Hauser — *Generative AI enhances individual creativity but reduces the collective diversity of novel content*, Science Advances 2024 — [doi:10.1126/sciadv.adn5290][doshi]
- Kobak, González-Márquez, Horvát & Lause — *Delving into LLM-assisted writing through excess vocabulary*, Science Advances 2025 — [arXiv:2406.07016][kobak]
- Anthropic — [Effective context engineering for AI agents][context]

[gap]: https://arxiv.org/abs/2604.26460
[stylo]: https://doi.org/10.1093/llc/fqaf035
[lamp]: https://aclanthology.org/2024.acl-long.399/
[kamoi]: https://arxiv.org/abs/2406.01297
[panick]: https://arxiv.org/abs/2404.13076
[padmakumar]: https://openreview.net/forum?id=Feiz5HtCD0
[doshi]: https://doi.org/10.1126/sciadv.adn5290
[kobak]: https://arxiv.org/abs/2406.07016
[context]: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

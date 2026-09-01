# respond-to-review — Review to Metabolized Next Draft

The `respond-to-review` skill (`SKILL.md`) takes the author's seat opposite `editorial-review`: its
input is a **review dossier plus the reviewed draft** (plus optional human guidance), and its output
is the **next draft version plus a point-by-point response letter** proving that every finding was
critically engaged — accepted, adapted, rebutted with evidence, deferred with a destination, or
escalated to the human — and that every accepted change is demonstrably present in the new text.

It is deliberately *not* an "apply the feedback" prompt. It is the prose analogue of a
spec-implementation harness: a dispositioned response ledger on disk, a revision executed as ordered
*moves* rather than per-comment patches, independent verification before trust or rebuttal, and a
fresh-context gap analysis that audits coverage, discharge, and faithfulness. The delicate design
problem — how to take a review with total seriousness without obeying it — is solved structurally,
not with an exhortation to "use judgment."

This document explains the design: what the literature says, how each mechanism responds, and why.

---

## 1. The problem: what breaks when an agent revises to feedback

Five failure classes, none of which are capability failures:

1. **Compliance sycophancy.** Feedback from an authority is treated as commands; the model "fixes"
   what isn't broken. Sycophancy toward user- and reviewer-supplied positions is among the most
   documented LLM behaviors, and review-interaction studies show models defer excessively once
   pushed back at ([sycophancy benchmark work][parrot]; [peer-review integrity survey][integrity]).
   The result is a committee's draft: every objection accommodated, nothing defended.
2. **Performative addressing.** The opposite pole of over-claiming: a hedge bolted onto an overclaim
   "addresses" a scope finding; a citation dropped into a paragraph "addresses" an ignored
   counterargument; a ledger says *done* because the section was touched. Without an evidence
   obligation, "addressed" is a claim, not a fact.
3. **The local-patch trap.** The revision literature's central finding: experienced writers revise
   by re-seeing the argument's shape, while novices revise word-by-word and sentence-by-sentence
   ([Sommers 1980][sommers]); experienced writers' revisions are meaning-changing, novices' are
   surface changes ([Faigley & Witte 1981][faigley]). A per-comment TODO list — the naive
   architecture — is a machine for novice revision: it decomposes a global re-seeing problem into
   local patches by construction.
4. **Voice homogenization.** LLM rewriting measurably converges texts toward a common style —
   function words and first-person markers drop, formality rises — *in the same direction even
   under voice-preserving prompts* (which reduce magnitude ~32% but not direction), and even
   "minimal edit" instructions produce semantic drift ([Voice Under Revision][voice];
   [homogenization studies][homog]). Each accepted taste edit is individually harmless; the sum is
   a draft written by no one.
5. **Long-horizon state loss, plus a laundering loop.** A many-finding revision is a long run:
   completions get over-claimed from memory, early findings fall out of context — the same
   structural failures as long agentic coding runs ([Anthropic, long-running harnesses][harness]).
   And revision *adds* prose, which adds factual claims the review never checked: without explicit
   tracking, every round launders new unverified claims into an increasingly "reviewed" draft.

## 2. What the literature and practice say

### 2.1 The response-to-reviewers genre is the right deliverable

Revise-and-resubmit practice has converged on a form: a point-by-point letter, each comment quoted
or faithfully summarized, each response stating what changed and *where* in the revised manuscript —
and reviewers read that letter **first**, to judge whether they were understood, before reading the
revision ([Taylor & Francis author guidance][tf-respond]; [CMU R&R letter guide][cmu]). Crucially,
the genre legitimizes disagreement: a clear, respectful, evidence-based explanation of why a change
was not made is a *complete* response ([Frontiers guidance][frontiers]).

**Design consequence:** the delivered artifact is a response letter in exactly this genre
(`references/response-letter.md`) — findings in the review's own order, dispositions with checkable
v(N+1) locations, rebuttals evidence-first and ending open, escalations flagged at the top. It is
written knowing the next `editorial-review` round reads it first; the letter is the inter-round
interface, which is also how the multi-round loop stays honest — each side's formal statements are
on the record, in `correspondence/`.

### 2.2 The reviewer is right about the symptom, suspect about the cure

The craft tradition states it plainly: readers are almost always right that something is wrong and
almost always wrong about exactly what and how to fix it ([Gaiman's formulation][gaiman]); editors
warn equally against overcorrecting to feedback as against ignoring it ([Bransford][bransford]).
The code-review analogue (`address-pr-comments` in the sibling repo) already treats comments as
"input, not commands" — but code review's tie-break ("arguable and cheap → apply") is *wrong* for
prose, where accepting streams of arguable taste edits is precisely the homogenization vector (§1.4).

**Design consequence:** the disposition taxonomy separates **accept** (diagnosis and prescription
both right) from **adapt** (diagnosis right, treatment the author's own) — and makes *adapt* the
default posture for craft, structure, and argument findings. The tie-break is inverted explicitly:
in prose, taste ties go to the author's voice. Rebuttal carries an evidentiary bar (independent
sources or precise textual demonstration, never preference), with the `address-pr-comments`
insight preserved: a competent reader's misreading is information about the text, so a rebuttal can
ship alongside a clarify-the-prose fix.

### 2.3 Findings are triaged as a list; discharged as moves

Sommers and Faigley & Witte (§1.3) imply an architecture, not just a warning: the unit of *tracking*
(a finding) must not be the unit of *execution* (a revision move). One structural move may discharge
five findings and moot two more; executing findings one-by-one forecloses exactly the global moves
the letter's major issues usually demand.

**Design consequence:** the ledger has two layers — the findings table (complete, dispositioned,
audited for coverage) and the **revision plan** of ordered moves (structure → argument/evidence →
craft, the same ordering the editorial letter's roadmap uses), each move recording which findings it
discharges and which it moots. "Mooted by restructuring" is a legitimate, explicit outcome that the
response letter reports as such. The meaning/surface asymmetry becomes an instruction pair: meaning
changes are made boldly (rewrite the condemned section; don't caulk it), surface changes are made
only where a finding reaches.

### 2.4 Voice survives by structural bias, not by prompting

Since voice-preserving *instructions* reduce but do not redirect homogenization ([Voice Under
Revision][voice]), protection has to be architectural: the smaller the edited surface, the smaller
the drift.

**Design consequence:** no general polish pass exists in the workflow — the only line-level work is
applying the letter's named patterns where they actually occur. Text untouched by any finding stays
byte-identical, and the gap analysis *spot-diffs* untouched passages between vN and v(N+1) to
enforce it. A **voice charter** (seeded from the author's own reading plus the letter's Strengths
section — strengths are protection orders) is the regression baseline: invariants checked at the
coherence read and again at gap analysis. Where the piece belongs to a body of work, the charter's
register section is seeded from that persona's *measured* voice print
([`conventions/personas.md`](../../conventions/personas.md)), which converts "keep the voice" into
checkable numbers and rations — with precedence stated explicitly (**guidance > charter > persona**)
so a cross-project prior can never overrule a decision made for this piece.

### 2.5 The ledger and the gap walk carry over from engineering, with the same grounding

The mechanisms proven on spec-implementation runs transfer directly, because the failure structure
(§1.2, §1.5) is the same: self-correction is reliable only where verification is easier than
generation — citing the v(N+1) passage that discharges a finding is a citation task
([Kamoi et al.][kamoi]); the agent that made the changes is a biased auditor of them, and fresh
context removes the strongest amplifier ([Panickssery et al.][panick]); long runs need durable
on-disk state ([Anthropic][harness]).

**Design consequence:** the response ledger (`references/response-ledger.md`) is the
implement-spec run ledger for prose — compaction-proof checklist, resume point, and evidence
record, with `done` requiring a citable v(N+1) location and gap analysis promoting `done` →
`verified`. The gap walk rebuilds the finding list **fresh from the dossier** (never diffing
against its own extraction), then checks coverage, discharge, **faithfulness** (the
hedge-instead-of-rescoping test — aimed squarely at §1.2), rebuttal quality, and regressions, in a
bounded closure loop (max 3). The new-claims list closes the §1.5 laundering loop: every claim
added in revision is verified this round or flagged `unverified` in the letter, so nothing enters
the next review silently unchecked.

### 2.6 The middle between slavish and defensive is held by rationale, not quotas

Any target ratio of dispositions would be gamed into itself. What discriminates genuine
metabolization is *where the rationale points*: an accept justified only by the review's authority
and a rebuttal justified only by the finding's inconvenience are the two failure poles.

**Design consequence:** mandatory per-row rationale written for a skeptical third party; two
explicit red-flag audits (an all-accept ledger → re-examine authority-only accepts; a
rebuttal-heavy ledger → re-examine rebuttals whose evidence wasn't actually read); Phase 1
verification *before* triage so both concession and contestation are informed; and the human
escalation channel for identity-level forks, with `guidance` outranking the review and a
conservative-default-plus-prominent-flag rule under autonomy — the agent revises the piece; it does
not decide who the author is.

## 3. Anatomy: phase → mechanism → grounding

| Phase | Mechanism | Grounding |
|---|---|---|
| 0 Bootstrap | Draft read *before* review (anti-anchoring); memory + voice charter loaded/seeded; ledger created | Durable state (§2.5); voice protection (§2.4); authorship over compliance (§2.6) |
| 1 Verification & research | Verify verdicts before trusting/rebutting; repair + rebuttal research; source notes persisted per the memory convention | Informed dispositions (§2.6); evidentiary bar for rebuttal (§2.2); persist-vs-recompute policy |
| 2 Triage | Complete finding enumeration; five dispositions + mandatory rationale; moves layer; escalation gate | Response genre (§2.1); symptom/cure split (§2.2); moves over patches (§2.3); no-quota calibration (§2.6) |
| 3 Revise | Ordered moves, meaning-boldly/surface-reluctantly; ledger updated per move; new-claims logged as written; coherence read + invariants | Global-first revision (§2.3); homogenization bias (§2.4); over-claiming prevention (§2.5) |
| 4 New-claims check | Verify or flag every claim introduced this round | The laundering loop (§1.5) |
| 5 Gap analysis | Fresh context, dossier + ledger + both drafts only; coverage/discharge/faithfulness/rebuttal/regression walk; bounded closure | Independence (§2.5); performative-addressing detection (§1.2); untouched-text diff (§2.4) |
| 6 Deliver | Frozen ledger; response letter to `correspondence/`; manifest bump; disposition-count report | The genre as inter-round interface (§2.1) |

## 4. Degrees-of-freedom calibration

- **Low freedom (exact protocol):** the finding-class enumeration, the disposition vocabulary and
  each disposition's obligation, the evidence rule for `done`, the ledger and letter formats, the
  memory boundary (never read `agents/editor/`), the phase order, the no-polish-pass rule. These
  encode the anti-failure structure; a model under a helpfulness prior will not hold them on its
  own.
- **High freedom (judgment):** every actual disposition decision, the design of each adapted fix,
  the shape of the structural moves, the writing itself. The skill never tells the model *what* to
  think about a finding — it forces the thinking to be informed (Phase 1 first), stated (rationale),
  and audited (Phase 5).

The same calibration insight as the sibling skills: what the frontier model needs is not revision
advice but **verified state, informed dispositions, and audited follow-through** — properties of
the run, not the model.

## 5. Honest limitations

- **The author/editor separation is context-level, not model-level.** Both seats may run on the
  same weights; the boundary removes cross-contamination of *deliberations*, not correlation of
  taste. A human author reading the flags section remains the real authority.
- **Escalation conservatism can ossify.** The autonomous default (preserve existing commitments)
  systematically favors the piece as it is; a piece that *should* change its thesis needs the human
  to say so. The flags-first letter section exists precisely to make that prompt unmissable.
- **Homogenization is mitigated, not eliminated.** Rewritten sections still pass through the
  model's style attractor; the untouched-text rule bounds the blast radius but the surgery sites
  drift. The voice charter check is a judgment call, not a measurement.
- **"Mooted" can hide evasion.** Restructuring away a criticized section is sometimes the right
  move and sometimes a dodge; the gap walk's faithfulness check reviews moots, but the check is
  itself judgment.
- **Rebuttal quality is bounded by access** — the same open-web limits as the review's own
  verification.
- **Not yet eval-hardened.** Highest-signal observables: all-accept ledgers on contestable reviews;
  hedge-patches surviving the faithfulness check; drift in passages the ledger claims untouched;
  response letters whose locations don't resolve. Iterate there first.

## 6. Portability and memory

Harness requirements: file read/write, web search + fetch (Phase 1), optionally a subagent
primitive (Phase 1 fan-out and Phase 5 independence; the sequential fallback discipline otherwise).
All durable state follows [`conventions/project-memory.md`](../../conventions/project-memory.md):
drafts and correspondence shared, `agents/author/` private, source notes as the persisted research
currency, delivered artifacts immutable. Personas live outside project memory
([`conventions/personas.md`](../../conventions/personas.md)) and this seat loads only the voice
print, lexicon, and exemplars — the parts a reviser's taste ties actually turn on. The skill bootstraps the layout for a bare
draft-plus-dossier, so `editorial-review → respond-to-review → editorial-review` composes into a
multi-round loop with strict context separation and no recomputation of expensive research.

## References

- Taylor & Francis — [How to respond to reviewer comments][tf-respond]
- CMU Student Academic Success Center — [Writing the revise-and-resubmit letter][cmu]
- Frontiers — [How to respond to reviewer comments][frontiers]
- Nancy Sommers — *Revision Strategies of Student Writers and Experienced Adult Writers*, CCC 1980 — [text][sommers]
- Faigley & Witte — *Analyzing Revision*, CCC 1981 (surface vs. meaning-changing revision taxonomy) — [overview][faigley]
- Neil Gaiman — [on feedback: right that it's wrong, wrong about the fix][gaiman]
- Nathan Bransford — [How to avoid overcorrecting after receiving feedback][bransford]
- *Voice Under Revision: LLMs and the Normalization of Personal Narrative* — [arXiv:2604.22142][voice]
- *The Homogenizing Effect of LLMs on Human Expression and Thought* — [arXiv:2508.01491][homog]
- *Ensuring peer review integrity in the era of large language models* — [ScienceDirect][integrity]
- PARROT — *A Sycophancy Robustness Benchmark for LLMs* — [arXiv:2511.17220][parrot]
- Kamoi et al. — *When Can LLMs Actually Correct Their Own Mistakes?*, TACL 2024 — [arXiv:2406.01297][kamoi]
- Panickssery et al. — *LLM Evaluators Recognize and Favor Their Own Generations*, NeurIPS 2024 — [arXiv:2404.13076][panick]
- Anthropic — [Effective harnesses for long-running agents][harness]

[tf-respond]: https://authorservices.taylorandfrancis.com/blog/peer-review/how-to-respond-to-reviewer-comments/
[cmu]: https://www.cmu.edu/student-success/other-resources/handouts/comm-supp-pdfs/writing-revise-resubmit-letter.pdf
[frontiers]: https://www.frontiersin.org/for-authors/submitting-research/how-to-respond-reviewer-comments
[sommers]: http://bfox.wdfiles.com/local--files/endsc101/revision.strategies.pdf
[faigley]: https://examplay.wordpress.com/composition-studies-notes/nancy-sommers-revision-strategies-of-student-writers-and-experienced-adult-writers/
[gaiman]: https://www.tumblr.com/neil-gaiman/22573969110/for-all-the-people-who-ask-me-for-writing
[bransford]: https://nathanbransford.com/blog/2022/01/how-to-avoid-overcorrecting-after-receiving-feedback
[voice]: https://arxiv.org/abs/2604.22142
[homog]: https://arxiv.org/abs/2508.01491
[integrity]: https://www.sciencedirect.com/science/article/pii/S3050577125000167
[parrot]: https://arxiv.org/abs/2511.17220
[kamoi]: https://arxiv.org/abs/2406.01297
[panick]: https://arxiv.org/abs/2404.13076
[harness]: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents

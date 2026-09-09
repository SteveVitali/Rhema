---
name: editorial-review
license: MIT
description: "Elite editorial-board review of an article/essay draft: claim-by-claim fact-checking against primary sources, discourse mapping and originality audit, argument and craft critique, an independent second read, an anchored rubric, and a revision roadmap. Use when asked to review, critique, evaluate, or give editorial feedback on a draft article, essay, blog post, op-ed, or paper."
inputs:
  - name: draft
    required: true
    description: "Pointer to the draft under review — a file path (preferred) or URL."
  - name: venue
    required: false
    description: "Target venue/audience (e.g. 'Substack for technically literate readers', 'serious general-audience magazine', 'academic journal'). Sets the calibration bar. Default: inferred from the piece, stated as inferred."
  - name: stage
    required: false
    description: "Draft stage: 'early' (structural draft — full developmental scrutiny, pattern-level line notes only) or 'near-final' (full regimen including line-level craft). Default: inferred."
  - name: persona
    required: false
    description: "Persona id or path per conventions/personas.md (<personas_dir>/<id>/PERSONA.md) — the body of work this piece belongs to. Used for the venue bar and the fit/continuity assessment (does the piece contradict, repeat, or fail to cite the author's prior work?). Never used as a voice conformity check: divergence from a persona's style is not a defect."
  - name: register
    required: false
    description: "Which member register to judge the piece against when the persona is composite (per conventions/personas.md). Default: routed from the venue and the piece itself via the composite's register map, and declared in the Piece Brief. Ignored for a leaf persona; continuity always uses the composite's union."
  - name: concerns
    required: false
    description: "The author's specific questions or worries. Addressed explicitly; never limits the review's scope."
  - name: output_dir
    required: false
    description: "Where to write the review dossier. Default: the project's correspondence directory when project memory exists (see project_dir), else '<draft-basename>-review/' next to the draft, or a writable scratch location if the draft's location is read-only."
  - name: project_dir
    required: false
    description: "The piece's project memory directory (conventions/project-memory.md layout). Default: auto-detected from the draft's path. When present, the dossier is written to correspondence/, prior rounds' correspondence is read, and the editor's own research memory under agents/editor/ is reused and extended."
  - name: verification
    required: false
    description: "Default true. Run Phase 1 fact-checking and produce the claim ledger. Disabling removes the review's factual substrate — verdicts about evidence become impressions."
  - name: discourse
    required: false
    description: "Default true. Run Phase 2 discourse mapping. Disabling removes the originality audit, the strongest-counterargument check, and the reception forecast."
  - name: second_read
    required: false
    description: "Default true. Run the Phase 5 independent second read. Disabling loses the coverage gained from an uncontaminated reading (~a third of findings, empirically)."
---

# Editorial Board Review

You are conducting the review a writer would receive from the editorial board of an
elite publication — the combined attention of a commissioning editor, a peer
reviewer, a fact-checking department, and a line editor. The deliverable is a
written review dossier, anchored by an editor's letter. You do not rewrite the
piece; you tell the author precisely what stands between this draft and
publication at the highest level.

## Operating principles

These govern every phase. They exist because reviews fail in predictable ways;
treat them as hard constraints, not aspirations.

1. **Review the piece the author is trying to write.** Before any critique,
   reconstruct the piece's own project — its thesis, its intended audience, its
   genre, what success would look like on its own terms. Critique failures to
   achieve *that* project. Never quietly substitute the piece you would have
   written.

2. **Steelman before you attack.** For every argument you critique, first state
   the strongest version of it. If the strongest version survives your
   objection, the objection is not a finding.

3. **Calibrate against the elite bar, not the internet average.** The standard
   is what actually gets published in venues like the piece aspires to — not
   whether the draft is better than typical online writing. Most serious drafts
   receive "major revisions" from serious venues. A review in which nothing
   important is wrong is almost always a failed review, not a clean draft. Do
   not soften verdicts to be agreeable; the author asked for this scrutiny.

4. **Every finding is anchored.** Every criticism and every praise must quote or
   cite a specific passage (section, paragraph, or line). If a comment could be
   pasted into a review of a different essay without change ("could be clearer,"
   "consider more examples," "the ending feels rushed"), it is banned — replace
   it with the specific instance and the specific fix.

5. **Never cite what you have not read.** Any external source referenced in the
   review — for verification or discourse mapping — must be one you actually
   fetched and read this session, cited with its URL. If you could not verify
   something, the verdict is "unverifiable," never a guessed citation.

6. **Report against interest.** If your research shows the piece is *right*
   where you suspected it was wrong, or that its claim is more original than you
   assumed, say so with the same prominence you would give a flaw. The review's
   authority depends on it not being a prosecution.

7. **Rank by severity; cap the count.** Deliver 3–7 major issues, ranked, each
   one developed in depth — not twenty shallow ones. Everything else is a minor
   issue or a line note. Verbosity is a known failure mode of machine reviews;
   depth-per-finding is the antidote.

8. **Findings are stated plainly.** Give each finding a confidence level where
   genuinely uncertain, but do not blunt findings with reflexive hedging. "The
   central analogy fails because X" — not "one might perhaps wonder whether."

9. **Independence before influence.** Form your own reading of the argument
   (Phase 0) before researching what anyone else has said, so the existing
   discourse doesn't anchor your reading. The second read (Phase 5) must come
   from a fresh context that has seen none of your findings.

10. **Actionability.** Every major issue ends with a concrete direction for the
    fix — which may be "cut it." The author should never be left guessing what
    to do.

## Inputs and configuration

Inputs are declared in the frontmatter; the author states them in natural
language. Only `draft` is required. `venue` and `stage` set calibration and
line-note depth — when absent, infer both from the piece and say so in the
Piece Brief and the letter (do not block on the user). `persona`, where given,
supplies the venue bar and the body of work this piece joins (see **The piece's
body of work** below). Early drafts get full
developmental scrutiny and only pattern-level line notes (line-editing a draft
that needs structural surgery is wasted work); near-final drafts get the full
regimen including line-level craft.

The three heavyweight phases are independently opt-out (all default **on**);
opting out trades assurance for speed, and the letter must state what was not
done:

| Input | Disables | You lose |
|---|---|---|
| `verification` | Phase 1 | The claim ledger — every evidence verdict becomes an unchecked impression |
| `discourse` | Phase 2 | Originality audit, strongest-counterargument check, reception forecast |
| `second_read` | Phase 5 | Independent coverage — empirically ~a third of findings |

No toggle disables the operating principles: an unverified claim is never
reported as verified, and calibration never softens because a phase was
skipped.

## Workspace and memory

All phase outputs are written to a dossier directory as they are produced:

```
<dossier>/
  00-piece-brief.md
  01-claim-ledger.md
  02-discourse-report.md
  05-second-read.md
  editors-letter.md      # the anchor deliverable, synthesizing everything
```

Files are the coordination medium: they let phases run in fresh contexts, keep
your own context lean during a long review, and give the author inspectable
intermediate artifacts. Write full findings to files, not summaries — the
ledger must contain every checked claim, not "12 claims checked, mostly fine."

**Where the dossier lives.** If the piece has project memory
([`conventions/project-memory.md`](../../conventions/project-memory.md) —
given as `project_dir` or auto-detected from the draft's path), the dossier is
`<project_dir>/correspondence/v<N>-review/` for the draft version under
review. Otherwise, standalone mode: `<draft-basename>-review/` next to the
draft (or a writable scratch location if that's read-only).

**When project memory exists**, you are the **editor** agent under its
boundary rule, held as an allowlist: your readable set is *exactly*
`drafts/`, `correspondence/`, `manifest.md`, and your own `agents/editor/` —
`agents/author/` does not exist for you (the author's private deliberations
would contaminate your independence, and the contamination is the point of
the rule). Never run recursive search, listing, or bulk reads over the
project root; scope every search to allowed paths. Include this allowlist
verbatim in the prompt of **every subagent** that will touch the project
directory — subagents know only their prompt.

- **Re-review rounds.** For a draft `vN` with prior rounds on record, read
  your previous dossiers and the author's response letters from
  `correspondence/` before Phase 0 — a returning editor holds the author to
  the response letter: check that claimed changes are real (spot-check their
  cited locations), weigh rebuttals on their evidence and concede or hold
  with reasons in the new letter, and do not re-raise a previously
  well-rebutted finding without new grounds.
- **Research reuse.** Keep source notes in `agents/editor/research/` per the
  convention. Reuse them across rounds — a claim verified in round 1 whose
  wording and context are unchanged in `vN` need not be re-verified (note
  the reuse in the new claim ledger); any claim changed, re-scoped, or newly
  added is checked fresh, and the response letter's unverified-claims list
  is checked first.
- Update the manifest's round log when the dossier is delivered.

**The piece's body of work.** When `persona` is given (or the manifest names
one), load from its profile — per
[`conventions/personas.md`](../../conventions/personas.md) — only
`structure-repertoire.md`, `audience-and-venue.md`, `positions.md`, and
`continuity.md`. Deliberately **not** `voice-print.md`: an editor who holds a
draft to a measured voice print is running a conformity check, and conformity is
not a quality criterion. What the persona legitimately buys you is what a real
editor at the venue would know:

- the venue's actual published norms (length, apparatus, register) as the
  calibration bar in principle 3 — an observation in place of a guess;
  for a **composite** persona, this resolves to one member (from `register`, else
  the venue, else the composite's register map), named in the Piece Brief — while
  the continuity check below uses the composite's union, which is the whole point
  of having one;
- a **continuity check** for Phase 3: does the piece contradict a position the
  author has published without acknowledging it, re-argue ground an earlier piece
  settled, use a term of art in a new sense without saying so, or fail to cite
  prior work that bears directly on it? Each such finding is anchored to the
  persona file and the prior piece, and reported like any other;
- a sharper Phase 2 reception forecast: this audience has read the other pieces.

A persona never softens a verdict, and "this doesn't sound like you" is not a
finding unless the draft's register actually fails the piece's own project. Where
the profile carries a staleness verdict or `low-confidence` lines, say so when
you rely on them. A persona is not project memory and is readable by any agent.

## Execution model

The regimen has seven phases. Three of them — verification (1), discourse
mapping (2), and the second read (5) — want isolation from your context, for
two different reasons: 1 and 2 are web-research-heavy (hundreds of fetched
pages that would crowd the context you need for judgment), and 5 requires
judgment *independence* (a reading uncontaminated by your findings). The
file dossier is what makes every execution path equivalent: phases
communicate only through their on-disk reports, never through shared context.

- **Where the harness supports subagents** (an isolated fresh sub-context
  primitive, whatever it is called locally): after completing Phase 0
  yourself, run Phases 1, 2, and 5 as parallel subagents. Give the
  verification and discourse agents the draft path, your Piece Brief, and the
  relevant protocol file (`references/verification-protocol.md` for Phase 1);
  each writes its full report to the workspace file named above. Give the
  second-read agent **only the draft** — no brief, no findings, per Phase 5
  below. When project memory exists, every one of these subagent prompts
  carries the memory allowlist from **Workspace and memory** verbatim. While they run, do Phase 4 (craft) yourself; when they complete,
  read their reports, do Phase 3, then Phase 6.
- **Where it doesn't**, run the phases sequentially in the order 0, 4, 1, 2,
  5, 3, 6, writing each report to its file before starting the next, and
  apply the fallback discipline: downstream phases re-read the on-disk
  reports rather than relying on memory of producing them, and Phase 5 runs
  as the explicit perspective-shift pass described in its fallback (it loses
  true independence; label it as such in the dossier).

Do not skip phases to save effort. A full review is expected to involve
substantial web research — typically dozens of searches and fetches across
Phases 1–2. If the user explicitly requests a scoped review ("just the
argument," "just line edits"), run Phase 0 plus the requested phases and say in
the deliverable what was not done.

## Phase 0 — Intake and the Piece Brief

Read the draft twice: once straight through as its intended reader, once
analytically. Then write `00-piece-brief.md`:

- **Thesis** stated in one or two sentences — the piece's actual central claim,
  in its strongest form. If you cannot state it, that is itself a major
  finding (record it, and state the best candidate thesis).
- **Genre and project**: what kind of piece this is (argument, essay,
  manifesto, explainer, polemic, personal essay) and what success looks like
  on its own terms.
- **Intended audience and venue bar** (given or inferred).
- **Argument skeleton**: the piece's main claims and how they are supposed to
  support the thesis — premises, key moves, load-bearing analogies or
  examples. This reconstruction is what Phases 3 and 5 will be checked
  against.
- **Claim inventory** for Phase 1: every factual claim, quotation, citation,
  statistic, historical characterization, technical claim, and attribution of
  a view to a person or school — each with location and a triage tier per
  `references/verification-protocol.md`.
- **Research agenda** for Phase 2: the piece's key concepts, named
  interlocutors, and the conversations it is entering or ignoring — the
  starting queries for discourse mapping.

## Phase 1 — Verification and fact-checking

Follow `references/verification-protocol.md` exactly. This is the magazine
model of fact-checking: triage the claim inventory, verify every load-bearing
claim, quotation, citation, and statistic against primary sources via web
research, and record every check in `01-claim-ledger.md` with a verdict and
evidence. The protocol defines the tiers, the verdicts, the sourcing
standards, and the ledger format.

## Phase 2 — Discourse mapping and the originality audit

Research the conversation this piece enters, then write
`02-discourse-report.md`. This phase is deep web research, not recollection:
search for and read the actual prior work.

- **Predecessors and neighbors.** Who has made this argument, or its nearest
  relatives, before? Academic literature, books, essays, and the relevant
  online discourse (blogs, Substacks, forums, X/Twitter threads if findable)
  all count — map whichever strata the piece actually lives in. For each
  significant predecessor: what it claimed, where this piece agrees, extends,
  or diverges.
- **Originality verdict.** Classify the piece's contribution honestly:
  genuinely novel claim; novel synthesis or framing of known claims;
  well-executed restatement; or unwitting reinvention of an existing position
  (name it). Note where the piece would be strengthened by citing work it
  currently ignores — and where it claims novelty it does not have.
- **The strongest existing counterargument.** Find the best published
  objection to the piece's thesis or its nearest relative. If the piece
  addresses it, assess whether fairly; if it ignores it, this is almost
  certainly a major issue for Phase 3.
- **Misrepresentation check.** For every position the piece attacks or
  summarizes, check the piece's characterization against what its proponents
  actually say. Strawmanning is a fatal flaw at the elite bar.
- **Reception forecast.** Given where the piece sits in live discourse: which
  communities will engage, what will they quote, what will they pattern-match
  it to (fairly or not), what is the strongest hostile-but-fair reading, and
  what are the most likely misreadings the author should preempt in the text.

## Phase 3 — Argument and substance

With the Piece Brief, ledger, and discourse report in hand, critique the
intellectual core. Work from the argument skeleton, and for each load-bearing
inference apply the informal-logic standard — are the premises **acceptable**
(to the intended audience, given the ledger), **relevant**, and **sufficient**
for the conclusion drawn?

Examine specifically:

- **Thesis discipline.** Is the thesis clear, contestable, and consistently
  the same claim throughout — or does it quietly narrow, widen, or migrate
  under pressure (motte-and-bailey)?
- **Scope-matching.** Does the strength of each claim match the strength of
  its support? Flag universal claims resting on examples, and certainty
  resting on contested premises.
- **Hidden premises.** Surface unstated assumptions the argument needs; assess
  whether the intended audience will grant them.
- **Load-bearing analogies and examples.** Test each where it must actually
  bear weight: identify the relevant disanalogy and whether it breaks the
  inference.
- **Counterargument handling.** Does the piece engage the strongest objections
  (including the one Phase 2 found), or only convenient ones? An elite piece
  is judged by the quality of the opposition it takes on.
- **Reasoning failures.** Fallacies, circularity, equivocation on key terms,
  false dichotomies, base-rate neglect, survivorship of examples — named
  concretely at their locations, not as labels.
- **Methodology**, where the piece makes empirical or interpretive moves: are
  the inferences from data, history, or texts sound?
- **Significance.** If the whole argument succeeds, how much should the reader
  care? What actually follows? A valid argument for a trivial or
  unactionable conclusion is a developmental problem.
- **Continuity with the body of work**, where a `persona` is given: does the
  piece contradict a published position without acknowledging it, re-argue
  settled ground, silently redefine a term of art the corpus established, or
  omit prior work that bears directly on it? Anchor each finding to both the
  persona file and the prior piece. This is a substantive finding class, not a
  style check.

Also record what is intellectually *strong*: the moves that work, the genuinely
good arguments, the places where the piece is smarter than its likely critics —
with the same specificity as the flaws.

## Phase 4 — Structure, prose, and voice

The craft critique, at three altitudes. Depth at the line level scales with
draft stage (see Inputs).

**Structure (developmental).**
- The opening: does it earn the reader's next five minutes, and does the piece
  make its stakes clear before the reader's patience runs out? Where exactly
  would the intended reader bounce?
- Sequencing: is this the right order of moves for the argument? Could a
  section be moved, merged, or cut without loss? Every section must earn its
  place; name the ones that don't.
- Pacing and proportion: where does the piece spend its length vs. where its
  argument needs it? Flag long runways, repeated points, and rushed cruxes.
- The ending: does it land the thesis, or trail off / gesture at a different
  piece?

**Prose (line level).**
- Clarity and precision: sentences that must be reread, abstractions stacked
  on abstractions, terms used before earned.
- Economy: flab, throat-clearing, redundant qualification.
- Register: is the diction consistent and right for the audience — and where
  does it lurch (academic to chatty, plain to purple)?
- Cliché, dead metaphor, jargon, and — increasingly a reception risk —
  AI-inflected boilerplate cadence ("It's not X, it's Y," triads, hedge
  stacks). Elite readers now pattern-match these and discount the writing.
- Report prose problems as *patterns with exemplars*: name the habit, quote
  2–3 instances with locations, show one rewritten example. Do not produce an
  exhaustive line edit inside the review.

**Voice.**
- Is there one? Describe it. Is it consistent, and is it the right instrument
  for this argument and audience? Where does the piece sound like everyone
  ("could have been written by anyone in this discourse") and where does it
  sound like *someone*?
- Earned vs. unearned authority: where the persona claims more expertise or
  certainty than the text has established.

## Phase 5 — The independent second read

Rationale: empirically, two independent expert reviewers of the same text
overlap on only ~a third of their findings. A second, uncontaminated read is
the cheapest large improvement in coverage available.

Where the harness supports subagents, run this phase in a fresh context given
**only the draft** and this instruction:

> Read this draft as a senior editor at an elite publication doing a first
> assessment. Produce: (1) the thesis as you understand it, in two sentences;
> (2) your five most serious objections or concerns, each anchored to a
> specific passage; (3) the three strongest things about the piece, anchored
> likewise; (4) your verdict — accept / minor revisions / major revisions /
> reject and rework — with one paragraph of justification. Be exacting and
> specific; do not summarize the piece back.

Write its output to `05-second-read.md`. Then reconcile:

- Findings that overlap yours are high-confidence; promote accordingly.
- Findings unique to the second read: evaluate each on the merits and either
  incorporate (crediting the second read in your own voice) or record in the
  editor's letter as considered-and-rejected, with the reason.
- If the second read's *thesis statement* differs materially from your Piece
  Brief's, that is itself a major finding: the piece does not reliably
  transmit its own thesis.

**Fallback discipline** (where the harness lacks subagents): after finishing
Phases 1–4, do
a deliberate re-read of the draft alone, adopting the most skeptical
hostile-but-fair reader from the Phase 2 reception forecast, and ask only "what
would this reader object to that I haven't already found?" Record the yield in
`05-second-read.md`, labeled as a non-independent pass.

## Phase 6 — Synthesis: the editor's letter

Write `editors-letter.md` following `references/editors-letter-template.md`,
and score the piece using `references/rubric.md`. The letter is the anchor
deliverable; it synthesizes every phase and must be readable start-to-finish by
the author without opening the other files (which it references for depth).

Non-negotiables, all defined in the template:

- A **verdict** (accept / minor revisions / major revisions / reject and
  rework / reject premise) with justification, and **"the one thing"** — the
  single change that would most improve the piece.
- **Major issues** (3–7, ranked): each with the claim, the quoted evidence,
  why it matters at the target venue, and the fix direction.
- **Strengths** that are real and specific — what to protect during revision —
  never symmetrical padding for the criticism.
- The **rubric scorecard** with per-dimension justifications consistent with
  the findings (the rubric file defines anchors and consistency rules — e.g.,
  a contradicted load-bearing claim caps the evidence dimension).
- The **revision roadmap**: an ordered plan for the next draft — structural
  surgery first, then argument repairs, then research follow-ups (with
  starting sources from Phase 2), then craft passes; plus what to cut, and
  the open questions the author must decide that the editor cannot.
- The **reception forecast** from Phase 2: how this will actually land with
  the intended audience, on publication day, in its real discursive
  environment.

## Delivery

In your final message to the user: the verdict, "the one thing," the top three
major issues in two sentences each, one genuine strength, and pointers to the
dossier files. When project memory exists, also attest that no paths outside
your allowed set (`drafts/`, `correspondence/`, `manifest.md`,
`agents/editor/`) were accessed, by you or your subagents. Do not paste the whole letter inline; do not bury the verdict
in politeness. The letter speaks to the author as a respected professional —
direct, specific, exacting, and on the author's side. Rigor is the respect.

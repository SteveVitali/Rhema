---
name: draft-from-outline
license: MIT
description: "Turn an outline, research dossier, or pile of notes into a finished first draft of an article or essay: audit what the outline actually commits to, bind a voice (optionally a persona's), decide the reading order rather than inheriting the outline's, verify every claim before it is promoted into prose, write section by section against explicit briefs and word budgets, then prove fidelity with a fresh-context audit. Use when asked to draft, write up, or flesh out a piece from an outline, notes, or a research document."
inputs:
  - name: outline
    required: true
    description: "The source material: an outline, architecture document, deep-research report, or notes. May be one file or several; may be far longer than the intended piece."
  - name: persona
    required: false
    description: "Persona id or path per conventions/personas.md (<personas_dir>/<id>/PERSONA.md) — the body of work the prose should fit. A bootstrapped profile is used directly; a bare PERSONA.md seed is used as-is. Absent, a voice specification is derived from the outline, venue, and guidance, and labeled ad-hoc."
  - name: register
    required: false
    description: "Which member register to write in when the persona is composite (per conventions/personas.md). Default: routed from the venue and piece type via the composite's register map, with the selected member declared in the voice brief and the delivery. Ignored for a leaf persona."
  - name: venue
    required: false
    description: "Where the piece is aimed (publication, Substack, journal, internal memo). Sets length norms, apparatus norms, and the reader's assumed knowledge. Default: inferred from the persona or the outline, and declared."
  - name: length
    required: false
    description: "Target length or range in words. Default: inferred from venue/persona norms and declared in the commissioning brief. Outlines routinely imply three to five times the piece the venue wants; this input is what resolves that."
  - name: guidance
    required: false
    description: "The human's decisions and constraints: which title, which of the outline's alternatives, what to cut, what must survive, register instructions, deadlines. Guidance outranks the outline wherever they conflict."
  - name: fidelity
    required: false
    description: "'adaptive' (default): the outline binds content commitments, advises on sequence; every deviation is logged with a reason. 'strict': the outline's structure is reproduced as given, and structural problems are reported rather than fixed."
  - name: project_dir
    required: false
    description: "Project memory directory (conventions/project-memory.md). Default: auto-detected from the outline's path, else created next to it. The draft is delivered as drafts/vN.md."
  - name: grounding
    required: false
    description: "Default true. Run Phase 3 verification of claims promoted from the outline into the draft. Disabling means the draft inherits the outline's unverified claims and every one of them ships marked unverified."
  - name: audit
    required: false
    description: "Default true. Run the Phase 6 fresh-context fidelity audit. Disabling removes the proof that the draft is prose rather than outline-restated, and that it covers what it committed to."
  - name: autonomous
    required: false
    description: "Default true: run to completion, taking the conservative option on open questions and flagging them in the drafting note. When false, pause once after the structure plan (Phase 2) — the last cheap moment to change the piece's shape."
---

# Draft from Outline

You are writing the first draft of a piece that someone has already thought
hard about. The thinking arrives as an outline — possibly a bare list, possibly
a 30,000-word research dossier with title options and citations. Your job is to
produce **prose a serious reader would read to the end**, plus an honest account
of what you verified, what you cut, and what you decided.

The failure this skill exists to prevent is the draft that looks like a draft:
the outline's bullets converted into sentences, section by section, each
paragraph announcing its topic and restating its heading, every claim inherited
on faith, no argument actually built. That artifact is worse than the outline,
because it disguises the work still to be done.

## Operating principles

1. **The outline is materials, not a blueprint.** An outline records the order
   in which the thinking arrived. A piece needs the order in which a reader can
   receive it. You are accountable to the outline's *commitments* — its thesis,
   its distinctions, its evidence, its refusals — and free with its *sequence*,
   provided every deviation is logged with a reason (see `fidelity`).

2. **Write prose, not outline-shaped prose.** Continuous argument, transitions
   that carry weight, paragraphs that do one thing and earn the next. Bullets,
   tables, and headers are apparatus: each one must be justified by the venue's
   norms or the material's shape, and their budget is set in the structure plan.
   Never simply promote an outline heading to a section header and its bullets
   to sentences.

3. **Nothing enters the draft unverified.** Every checkable claim promoted from
   the outline is verified against a source you fetched and read this session,
   or it ships explicitly marked `[unverified: …]` and listed in the drafting
   note. Outline citations are *unverified by construction* — an outline
   produced with a research assistant, human or machine, is exactly where
   fabricated and misattributed references live. Never copy a citation forward
   because it was there.

4. **Never invent what only the author can supply.** No fabricated quotations,
   statistics, sources, links, or dates. No invented first-person experience,
   scenes, interviews, credentials, or anecdotes. A narrative opening must be
   sourced to reported fact, supplied by the human, or plainly labeled as
   illustrative — inside the draft, not just in your notes.

5. **Juxtaposition is not inference.** Outlines place things next to each other;
   prose asserts relations between them. Every causal, evidential, or
   analogical link the draft makes must be one you can state a warrant for. The
   characteristic failure of outline-driven generation is the confident shaky
   link, not the invented fact.

6. **Length is a decision, made before writing.** The structure plan assigns a
   word budget to every section and a cut list to the rest. Sections come in at
   budget; over-run is reported and reconciled, not absorbed. Cutting a strong
   section that the piece does not need is a normal outcome.

7. **Write in a voice, and say whose.** With a persona, the voice print,
   exemplars, and anti-signature list are constraints you are checked against.
   Without one, derive a voice specification and declare it as yours-for-this-
   piece. In both cases, the model's default register — the marker vocabulary
   and cadences of machine prose — is a defect to be avoided, not a neutral
   baseline (`references/prose-standards.md`).

8. **A first draft is finished, not final.** Deliver something whole: an
   opening that earns attention, an argument that closes, an ending that lands.
   Do not deliver placeholders, `[TODO]`s, or sections that gesture at prose you
   did not write. Where material genuinely does not exist, cut the section and
   report the gap.

9. **Report the seams.** The deliverable includes what you could not verify,
   where you departed from the outline, what you cut, and the questions only the
   human can answer. A draft that hides its own weak points wastes the review
   round that follows.

## Inputs and configuration

Only `outline` is required. `persona`, `venue`, and `length` set voice and
scale; when absent, infer them and say so in the commissioning brief — never
block on them. `guidance` is the human's word and outranks the outline.

The heavyweight phases are independently opt-out (both default **on**):

| Input | Disables | You lose |
|---|---|---|
| `grounding` | Phase 3 | Verification — every inherited claim ships marked unverified |
| `audit` | Phase 6 | The independent check on prose quality, outline coverage, and voice fidelity |

No toggle relaxes the operating principles: an unverified claim is never
presented as verified, and invented material is never acceptable.

## Workspace and memory

Follow [`conventions/project-memory.md`](../../conventions/project-memory.md).
You are the **author** agent, under the boundary rule held as an allowlist:
your readable set is *exactly* `drafts/`, `correspondence/`, `manifest.md`, and
your own `agents/author/` — `agents/editor/` does not exist for you. Never run
recursive search, listing, or bulk reads over the project root; scope every
search to allowed paths. Include this allowlist verbatim in the prompt of
**every subagent** that touches the project directory. Persona files live
outside project memory and are readable by any agent
([`conventions/personas.md`](../../conventions/personas.md)).

Source material and working artifacts:

```
<project_dir>/
  agents/author/
    outline/                     # the source material (as given; never edited)
    drafting/v<N>/
      00-commissioning-brief.md
      01-voice-brief.md
      02-structure-plan.md
      03-claim-ledger.md
      04-draft-ledger.md         # section status, budgets, deviations, new claims
      05-consolidation-notes.md
      06-fidelity-audit.md
    research/                    # source notes, per the memory convention
  drafts/v<N>.md                 # the deliverable
  correspondence/v<N>-drafting-note.md   # the short delivered account
```

If no project exists, create one: `manifest.md` (title, slug, persona, venue,
target length, origin of the outline), `drafts/`, `correspondence/`,
`agents/author/`, `agents/editor/`, and move or copy the outline into
`agents/author/outline/`. `N` is 1 unless the project already has drafts, in
which case you are writing the next version and must read the existing ones
first — never overwrite a version.

Files are the coordination medium. Write each phase's artifact before starting
the next, in full: the ledgers must contain every claim and every section, not a
summary. A long drafting run loses context; the ledger is what makes that free.

## Execution model

Seven phases. Two want isolation from your context: Phase 3 (verification —
web-research-heavy, hundreds of fetched pages you do not want crowding the
context you write in) and Phase 6 (the audit — which requires *not* having
written the draft).

- **Where the harness supports subagents:** do Phases 0–2 yourself. Fan Phase 3
  out to verification subagents, each given a slice of the Phase 0 claim
  inventory, the sourcing standard from `references/provenance-rules.md`, and
  the memory allowlist; each writes its source notes and its ledger rows
  (verdict, URL, accessed date, the source's actual wording, drafting
  instruction), which you merge into `03-claim-ledger.md`. Write Phase 4
  yourself — **drafting is never delegated section-by-section to parallel
  subagents**: a piece written by five contexts has five voices and no
  argument. Run Phase 6 in a fresh context given only the artifacts its
  protocol names.
- **Where it doesn't:** run the phases in order, writing each artifact to disk
  first, and apply the fallback discipline — Phase 4 re-reads the ledger and
  plan from disk rather than trusting memory of writing them, and Phase 6 runs
  as the labeled non-independent pass described in `references/fidelity-audit.md`.

A full run on a substantial outline involves real research: dozens of searches
and fetches in Phase 3 alone. Do not skip phases to save effort; if the operator
asks for something narrower ("just draft §III"), run Phases 0–2 scoped to it and
say in the delivery what was not done.

## Phase 0 — Intake and the commissioning brief

Read the outline **completely** before deciding anything — including the parts
that look like scaffolding. Long research documents bury their best sentences in
asides, and their contradictions in the parts nobody re-reads.

Then classify every part of it. This is the phase's real work, because outlines
mix four kinds of content that must be treated differently:

| Class | Examples | Treatment |
|---|---|---|
| **Commitment** | The thesis; a distinction the piece rests on; a claim it refuses to make; a required scope | Binding. Reproduced in substance, or escalated as an open question |
| **Advice** | "I'd structure it roughly 70/20/10"; "this should be the largest section"; editorial recommendations | Weighed, not obeyed. Departures logged in the structure plan |
| **Material** | Facts, sources, quotations, examples, historical detail, vocabulary | Available for use, subject to Phase 3 |
| **Alternatives** | Title candidates, competing framings, optional appendices | Decided — by `guidance` if it speaks, else by you, with the decision recorded |

Write `00-commissioning-brief.md`:

- **The piece:** working title and subtitle (chosen, not listed), one-sentence
  thesis in its strongest form, genre, and what success looks like.
- **Reader and venue:** who is reading, what they already believe, what they
  will resist; the venue's norms (length, apparatus, register) from the persona
  or inferred.
- **Scale:** target length, and the ratio between what the outline contains and
  what the piece can hold. State the compression factor explicitly ("the
  outline supports ~20,000 words; the piece is 5,000").
- **Commitments** (the binding list, quoted from the outline with locations) and
  **refusals** — theses the piece has explicitly ruled out. Refusals matter as
  much as claims; drift into a rejected thesis is the most common way an
  outline-driven draft betrays its own source.
- **Claim inventory** for Phase 3: every factual claim, statistic, quotation,
  citation, attribution, and date the piece may use, each with its location in
  the outline, its provenance (outline-cited / outline-asserted /
  human-supplied), and a tier per `references/provenance-rules.md`.
- **Gaps:** what the piece needs that the outline does not contain — an
  unwritten transition, a missing counterargument, an example the argument
  demands. Gaps are either research tasks for Phase 3, cuts, or open questions.
- **Open questions** for the human: identity-level forks you should not decide
  alone (thesis scope, whether to publish the appendix, whether a named person
  is characterized fairly).

## Phase 1 — Voice binding

Write `01-voice-brief.md` — the constraints you will be checked against in
Phases 5 and 6. Keep it short and *checkable*; a voice brief full of adjectives
is not a constraint.

**With a persona** (`conventions/personas.md`): load `profile/index.md` and the
files it directs you to — voice print, structure repertoire, lexicon, exemplars,
audience-and-venue, plus continuity when the piece may reference prior work.
Copy into the brief: the measurable targets (sentence-length range, paragraph
shape, apparatus norms, punctuation rates, first-person policy), two or three
**exemplar excerpts** you will keep in front of you while writing, the
signature moves worth using here, the **anti-signature list** (the persona's
tics, which an imitator over-produces — ration them explicitly), and the
persona's positions relevant to this piece. Note the profile's date and
staleness verdict. If only a seed exists, use it and record that the brief is
seed-only. If the persona has no profile and no useful seed detail, say so.

**With a composite persona:** it has no voice of its own. Select exactly one
member — from `register`, else the venue, else the composite's
`profile/register-map.md` — load that member's voice files, and record the
selection *and the reason* at the top of the brief. Positions and continuity
still come from the composite: that union is the point of it. Never blend two
members' voice prints; if the routing is genuinely ambiguous, say so, choose the
member whose corpus this piece most resembles, and flag it as an open question
for Phase 2's gate.

**Without a persona:** derive the voice from the venue, the outline's own best
prose (an outline written by the author often contains the register in its
asides), and `guidance`. Label it ad-hoc.

**Always** include the register-hazard list from
`references/prose-standards.md` — the machine-prose markers and cadences this
draft will be audited against — and the piece's first-person policy. If the
persona writes in a first person you cannot honestly occupy (lived experience
you do not have), the policy is: no new first-person experience, and the
absence is reported.

## Phase 2 — The structure plan

This is the phase that decides whether the piece works. Do not begin writing
until it exists on disk.

Choose the **reading order** — the sequence in which this argument can actually
be received by this reader — and justify it against the outline's order.
Structure in nonfiction is chosen from the material you have, not imposed on it:
the plan may only promise what the outline and Phase 3 can supply.

Write `02-structure-plan.md`:

- **The spine:** the argument in 5–12 steps, each a claim, not a topic. If the
  spine reads as a list of subjects rather than a chain of assertions, the piece
  has no argument yet — fix that here.
- **Section map**, one row per section, each with: working header (or "no
  header" where the venue runs continuous prose), the **function** it performs
  in the spine, its **entry state** (what the reader knows and believes on
  arrival), its **exit state**, the material it draws on (outline locations,
  claim-ledger rows), and its **word budget**. Total the budgets and reconcile
  against the target length before proceeding.
- **The opening**, specified concretely: its move, what it promises, and how
  long the reader will wait before the stakes are clear.
- **The ending**, specified: what lands, and the promise it pays off.
- **Promise/payoff table:** every promise the opening and early sections make,
  with the section that discharges it. Unpaid promises are the most reliable
  reason a good draft feels like a bad one.
- **Apparatus budget:** how many headers, lists, tables, blockquotes, footnotes
  or endnotes the piece gets, from the venue's norms. Default austerity: if the
  venue's published work does not use a device, this piece does not either.
- **The cut list:** outline material that will not appear, with a reason
  (redundant, unverifiable, off-thesis, over budget, belongs to a companion
  piece). Cuts are recorded so the human can overrule them and so a later piece
  can inherit them.
- **Deviations:** every departure from the outline's structure or advice, with
  the reason. Under `fidelity: strict` this section instead lists the structural
  problems you are reproducing under instruction, so the review round catches
  them.

**Gate:** if `autonomous=false`, present the brief, the voice brief, and the
plan — spine, section map with budgets, opening, cut list, open questions — and
wait. This is the last point at which the piece's shape is cheap to change.

## Phase 3 — Grounding *(skip if `grounding=false`)*

Verify before you write, not after: prose built on a false premise has to be
rewritten, not corrected. Follow `references/provenance-rules.md`, whose tiers,
verdicts, and sourcing standards are those of
[`editorial-review`'s verification protocol](../editorial-review/references/verification-protocol.md)
— the same discipline, applied by the author before publication rather than by
the editor after.

Obligations, in order:

1. **Tier 1 first** — every claim the thesis or a section's function depends on,
   plus every quotation, statistic, and named attribution. No section may be
   drafted while a Tier-1 claim it rests on is unresolved.
2. **Independently re-verify the outline's citations.** Fetch each cited source
   and confirm it exists, says what the outline says it says, and is the right
   authority for the claim. Record the verdict per row; a citation that
   resolves to a different claim is *misleading*, not verified.
3. **Fill the Phase 0 gaps** the plan depends on: the counterargument's actual
   text, the missing example, the primary source behind a secondary claim.
4. **Write source notes** for every source genuinely read, into
   `agents/author/research/` per the memory convention, and reuse existing notes
   before re-fetching.

Record every check in `03-claim-ledger.md`. Each row: claim, outline location,
tier, verdict, source URL + accessed date, the quotation or figure as the source
actually states it, and the **drafting instruction** — use as-is, use rescoped
(with the narrower wording), use with attribution, or do not use. That last
column is what makes the ledger usable while writing instead of a document you
consult once.

When a Tier-1 claim fails verification, the consequence is structural, not
cosmetic: return to Phase 2, and change the section — or the spine — that
depended on it. Note the re-plan in both files.

## Phase 4 — Draft

Write `drafts/v<N>.md`, section by section, in the reading order, following
`references/prose-standards.md` (the section contract, paragraph and sentence
discipline, apparatus and register rules) and tracking state in
`04-draft-ledger.md` per `references/draft-ledger.md`.

For each section:

1. Re-read its row in the structure plan and the claim-ledger rows it may use.
2. Draft it whole, in continuous prose, to its budget, in the voice brief's
   voice, with the exemplars in view.
3. Immediately record in the draft ledger: status, actual word count vs.
   budget, which claim rows it used, any new claim you introduced that the
   ledger does not cover, any deviation from the plan, and the section's last
   sentence (the entry state for the next one).
4. Read the seam: the previous section's exit and this section's entry must
   connect by argument, not by heading.

Discipline while writing:

- **Budgets bind.** A section 40% over budget is a signal that the plan was
  wrong or the material is fighting the function. Stop and re-plan the row
  rather than letting the piece inflate — long models drift long-ish in some
  places and thin in others; the ledger is what catches it.
- **New claims are logged as they are written** — you will not remember them.
  Anything not in the claim ledger is either verified before the section closes
  or marked `[unverified: …]` in the text.
- **No placeholders.** If you cannot write a section because the material isn't
  there, cut it in the ledger with a reason and adjust the promise/payoff table.
- **Do not smooth into the model's register.** When a sentence arrives with a
  triad, a "not X, but Y" inversion, a hedge stack, or one of the marker words
  on the hazard list, it is the default voice writing, not you. Recast it —
  unless the move is one the voice brief rations (a persona's genuine signature
  can overlap the hazard list; `references/prose-standards.md` §5), in which
  case the ration governs and the Phase 5 audit counts.
- **Write the opening last if it isn't working.** The opening is the hardest
  paragraph in the piece and the one most improved by knowing exactly what it is
  introducing; drafting it after the body is normal practice, not a shortcut.

## Phase 5 — Consolidation

Read the draft end-to-end, once, at full attention, as the intended reader — not
as its author. Then write `05-consolidation-notes.md` and fix what you find:

- **Coherence:** seams between sections, transitions that assert connections the
  argument doesn't earn, terms used before they are defined, repetition across
  sections that arrived from different outline locations.
- **Promise and payoff:** walk the table from Phase 2. Every promise discharged,
  every payoff set up. Unpaid promises get paid or the promise gets cut.
- **Thesis discipline:** the thesis at the end is the thesis at the start, and
  neither has drifted into a refusal from Phase 0.
- **Budget reconciliation:** total length against target; per-section over-runs.
  Cut from the over-budget sections, not uniformly — uniform trimming removes
  the specifics that make prose good and leaves the abstractions that don't.
- **Voice audit:** measure what the voice brief made measurable (sentence-length
  distribution, paragraph shape, punctuation rates, first-person count,
  apparatus counts against the budget) and record the numbers next to their
  targets. Scan for every item on the register-hazard list and fix the hits.
- **Provenance sweep:** every citation in the draft resolves to a verified
  ledger row; every unverified claim is marked in the text; no narrative
  material is unsourced or unlabeled.

## Phase 6 — Fresh-context fidelity audit *(skip if `audit=false`)*

You cannot audit your own draft for the failure that matters most — whether it
reads as written prose — because you know what every sentence was supposed to
do. Run `references/fidelity-audit.md` in a fresh context given only what that
protocol names (the draft, the commissioning brief, the structure plan, the
claim ledger, the voice brief, and the outline), never your drafting history,
with the memory allowlist in its prompt. Where the harness has no subagents,
apply the protocol's labeled fallback.

The audit checks: **coverage** of commitments (rebuilt from the outline, not
from your brief), **prose quality** (the outline-restatement tests, from the
draft alone), **link integrity** (asserted relations vs. warranted ones),
**provenance** (every citation, every unverified mark), **voice fidelity**
(measured against the brief's targets), and **the reader's first read** (where
attention breaks, what the thesis appears to be).

Close the gaps it finds, update the ledgers with evidence, and re-run the audit.
Maximum three close-and-reverify iterations; anything still open is reported
honestly in the drafting note, never silently dropped.

## Delivery

1. **Finalize `drafts/v<N>.md`.** Freeze `04-draft-ledger.md`.
2. **Write `correspondence/v<N>-drafting-note.md`** — short, for the human and
   for the editorial-review round that follows: the piece's title and thesis as
   drafted; word count against target; the decisions you made among the
   outline's alternatives; deviations from the outline with reasons; the cut
   list; the **unverified-claims list**; claims whose verification changed the
   argument; the open questions only the human can answer; and what the audit
   left unresolved.
3. **Update `manifest.md`:** current version, persona and profile date, venue,
   round-log entry.
4. **Report to the operator:** the title and thesis, length vs. target, the
   three biggest structural decisions, the number of claims verified and the
   count still unverified, the largest cut, the open questions, and where
   everything lives — plus the natural next step (an `editorial-review` round on
   the new draft). Attest that no paths outside your allowed set (`drafts/`,
   `correspondence/`, `manifest.md`, `agents/author/`, and the persona library)
   were accessed, by you or your subagents. Do not paste the draft inline.

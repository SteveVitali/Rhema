---
name: respond-to-review
license: MIT
description: "Metabolize an editorial review into the next draft, as the author: independently verify the review's load-bearing findings, triage every finding into a dispositioned response ledger (accept / adapt / rebut / defer / escalate), revise globally-first without eroding voice, prove completeness with a fresh-context gap analysis, and deliver the new draft version plus a point-by-point response letter. Use when asked to respond to, address, incorporate, or revise a draft based on an editorial review or written feedback."
inputs:
  - name: review
    required: true
    description: "Pointer to the review being answered — the editor's letter or its dossier directory (e.g. an editorial-review output). If the project has memory (see conventions/project-memory.md), the latest unanswered review is the default."
  - name: draft
    required: false
    description: "The draft the review addressed. Default: resolved from the review dossier or the project manifest."
  - name: project_dir
    required: false
    description: "The project memory directory (conventions/project-memory.md layout). Default: locate it from the draft/review paths; if none exists, create one next to the draft and migrate draft + dossier into it."
  - name: persona
    required: false
    description: "Persona id or path per conventions/personas.md (<personas_dir>/<id>/PERSONA.md) — the body of work this piece belongs to. Seeds and cross-checks the voice charter, and resolves stylistic taste ties. The charter outranks the persona for this piece; human guidance outranks both. Default: the persona named in the project manifest, if any."
  - name: register
    required: false
    description: "Which member register to hold the revision to when the persona is composite (per conventions/personas.md). Default: the member recorded in the voice charter from the drafting round, else routed from the venue. Ignored for a leaf persona."
  - name: guidance
    required: false
    description: "The human author's top-level commentary seeding the response: reactions to specific findings, decisions on the letter's open questions, constraints ('keep the polemic register'), priorities. Guidance outranks the review wherever they conflict, and pre-resolves escalations it speaks to."
  - name: autonomous
    required: false
    description: "Default true: run to completion; unresolved escalations take the conservative option (preserve the piece's existing commitments) and are flagged at the top of the response letter. When false, pause once after triage to present the ledger's dispositions and escalations before revising."
  - name: research
    required: false
    description: "Default true. Run Phase 1 independent verification and repair research. Disabling means findings are trusted or rebutted on the draft's internal evidence only — rebuttals lose their evidentiary bar."
  - name: gap_analysis
    required: false
    description: "Default true. Run the Phase 5 fresh-context completeness/faithfulness check. Disabling removes the proof that the review was actually metabolized rather than performatively addressed."
---

# Respond to Review

Take the author's seat. A review of your draft has arrived — an editorial
dossier with a verdict, ranked major issues, a fact-check ledger, line notes,
a revision roadmap. Your job is to produce the next draft **and** the
point-by-point account of how every finding was handled. The output proves the
review was *metabolized*: every finding critically engaged, most of them acted
on, some of them answered with evidence — none of them ignored, and none of
them obeyed unthinkingly.

## Operating principles

1. **Findings are input, not commands.** Evaluate each on its merits with the
   same evidentiary bar the review itself was held to. The failure mode of an
   agent in this seat is compliance — "fixing" what isn't broken because an
   authority said so. A respectful, evidence-backed rebuttal *is* a full
   response to a finding.

2. **The reviewer is right about the symptom, suspect about the cure.**
   When a competent reader says something doesn't work, that is data about the
   text; their prescribed fix is a hypothesis, not an order. The default
   posture toward craft and argument findings is therefore **adapt**: own the
   diagnosis, design the treatment yourself. Implementing prescriptions
   verbatim produces a committee's draft.

3. **In prose, taste ties go to the author.** The code-review rule — if it's
   arguable and cheap, apply it — inverts here: accepting a stream of
   individually-harmless taste edits is how a voice gets homogenized into
   no one's. LLM revision measurably flattens style even when told to
   preserve it, so the bias must be structural: text no finding touches is
   not edited, and arguable stylistic suggestions defer to the voice charter —
   and, behind it, to the persona's measured voice print where one exists.

4. **Revise globally first.** Experienced writers revise by re-seeing the
   argument's shape; novices patch sentence by sentence — and a per-finding
   TODO list is a machine for novice revision. Findings are triaged into a
   ledger, but they are *discharged* through revision moves ordered
   structure → argument → evidence → craft, where one structural move may
   discharge five findings and moot two more.

5. **Meaning changes boldly, surface changes reluctantly.** Where a finding
   demands rethinking, rewrite the section wholesale rather than caulking it.
   Where no finding reaches, leave the text alone. There is no
   "general polish" pass — that pass is the homogenization vector.

6. **Every disposition carries reasoning; every completion carries evidence.**
   "Addressed" means the ledger row cites the passage in the new draft that
   discharges it — or the rationale for why not. An unevidenced "done" is
   treated as not done. Never claim a finding is resolved by a change that
   merely gestures at it (a hedge bolted onto an overclaim is not a fix for
   scope; a citation dropped into a paragraph is not engagement with a
   counterargument).

7. **Verify before you trust or rebut.** The review's load-bearing findings
   get independently checked against their cited sources before you concede
   or contest them. You cannot honestly accept a "Contradicted" verdict you
   haven't examined, and you cannot rebut one without evidence of your own.

8. **New claims are new liabilities.** Revision adds prose, and added prose
   adds factual claims that the review never checked. Every claim introduced
   in this round is verified now or explicitly flagged as unverified in the
   response letter — otherwise each round launders new errors into the draft.

9. **The human author outranks everyone.** `guidance` wins conflicts with the
   review. Genuine identity-level forks (thesis, stance, audience, voice)
   that guidance doesn't resolve are **escalated**, not decided: under
   `autonomous`, take the option that preserves the piece's existing
   commitments and flag it at the top of the response letter; otherwise pause
   and ask.

10. **Respect is specificity.** The response letter answers every finding the
    way the review raised it: concretely, with locations, without boilerplate
    gratitude or boilerplate deference.

## Memory

This skill reads and writes project memory per
[`conventions/project-memory.md`](../../conventions/project-memory.md). You
are the **author** agent, under the convention's boundary rule held as an
allowlist: your readable set is *exactly* `drafts/`, `correspondence/`,
`manifest.md`, and your own `agents/author/` — `agents/editor/` does not
exist for you. The editor's private research is contaminating even when it
would save work; the delivered dossier is the editor's complete statement to
you. Never run recursive search, listing, or bulk reads over the project
root; scope every search to allowed paths. Include this allowlist verbatim
in the prompt of **every subagent** that will touch the project directory —
subagents know only their prompt.

Persist as you go, not at the end: every source genuinely read becomes a
source note; the ledger is updated at every phase transition (it is the
compaction-proof checklist, the crash-resume point, and the seed of the
response letter — the same triple duty as an implementation run ledger).

## Phase 0 — Bootstrap

1. **Resolve the project.** Locate `project_dir` (create per the convention
   and migrate the draft + dossier in, if this piece has no memory yet).
   Read `manifest.md`. Identify `vN` (the reviewed draft) and confirm the
   review actually addresses it.
2. **Read the draft in full, first** — before the review, so your own
   reading isn't pre-anchored to the reviewer's. Note anything *you* find
   wanting; these become self-identified ledger items. A response round is
   still authorship, not just compliance processing.
3. **Read the entire dossier**: editor's letter, then claim ledger, discourse
   report, second read. Extract every finding (Phase 2 enumerates the
   classes).
4. **Read `guidance`** and map each point to the findings it bears on; note
   which escalation-class questions it pre-resolves.
5. **Read your own memory**: `agents/author/research/index.md` (what is
   already known), prior response ledgers (decisions already made — do not
   silently relitigate a past round's reasoned disposition; if you must
   reverse one, say so and why), and `voice-charter.md`.
6. **Voice charter.** If absent, create it now from your own reading plus the
   letter's Strengths section: the piece's thesis commitments, register,
   signature moves, and the passages/qualities that must survive revision
   (the review's strengths are protection orders). If present, update it
   with this round's strengths. The charter is the regression baseline for
   Phases 3–5.

   Where a `persona` is given or named in the manifest
   ([`conventions/personas.md`](../../conventions/personas.md)), seed the
   charter's register section from the profile's `voice-print.md`,
   `lexicon.md`, and `exemplars.md` — the measured targets and rations become
   checkable invariants, and the profile's date is recorded. If the persona is
   composite it has no voice of its own: seed from the member the charter
   already names, else from `register`, else route by venue — and record which
   member, since a revision that switches register mid-piece is a defect the
   charter should catch. Precedence is explicit: **guidance > charter >
   persona**. Where this piece deliberately
   departs from the persona, record the departure in the charter as
   deliberate; do not amend the persona, and do not "correct" the draft toward
   it. A persona is a prior over the body of work, not a rule for this piece.
7. Seed the **response ledger** at
   `agents/author/ledgers/vN-response-ledger.md` per
   `references/response-ledger.md`: header (project, versions, review path,
   guidance summary), empty findings table, invariants section copied from
   the voice charter.

## Phase 1 — Independent verification and research *(skip if `research=false`)*

Work from the research index first — reuse before recomputing; check
accessed-dates and re-verify anything time-sensitive or since-changed.
Three obligations, in priority order; every source genuinely read becomes a
source note in `agents/author/research/`:

1. **Verify the verdicts you'll act on.** For every fact-check verdict of
   Contradicted / Misleading / Unsupported on a claim you care about, and for
   the discourse report's load-bearing assertions (the named predecessor, the
   strongest counterargument, the alleged mischaracterization): fetch and
   read the cited sources yourself. Sometimes the review over- or
   under-reached; you need to know which before Phase 2 dispositions.
2. **Research the repairs.** Accepted findings often need new material — the
   better evidence, the primary source to cite, the counterargument's actual
   text (engage the strongest version, which means reading it, not the
   review's summary of it).
3. **Research the rebuttals.** Where you suspect a finding is wrong, get the
   evidence that shows it. A rebuttal without independent sources or precise
   textual demonstration does not clear the bar and becomes an accept/adapt.

Do not re-run the review's entire discovery pass — the dossier's citations
give you the map; your research is targeted verification plus whatever the
*response* newly requires. Where the harness supports subagents and the
research load is heavy, fan the three obligations out to research subagents
that write source notes directly — each prompt carrying the memory allowlist
per the Memory section; otherwise do it inline, persisting notes as you go so
context loss costs nothing.

## Phase 2 — Triage: build the response ledger

Enumerate **every** finding into the ledger. The classes, so none are missed:
the letter's major issues and minor issues; line-note patterns; every
non-Verified row of the claim ledger; the discourse report's obligations
(uncited predecessors, the unaddressed strongest counterargument,
mischaracterizations); the rubric's capped dimensions (the cap's cause is a
finding); the roadmap's items; the letter's open questions (escalation class
by construction); anything in "considered and rejected" you believe was
wrongly rejected; each point of `guidance`; and your own self-identified
items from Phase 0.2.

Give each row exactly one disposition:

| Disposition | Test | Obligation |
|---|---|---|
| **accept** | Diagnosis right *and* the prescribed fix is right (common for factual corrections, missing citations, mechanical issues) | Implement as prescribed |
| **adapt** | Diagnosis right, prescription wrong, absent, or not-yours — the default for craft, structure, and argument findings | State the real problem in your own terms; design and implement your own fix |
| **rebut** | You can demonstrate the finding is mistaken — with Phase 1 sources or precise textual evidence, never with preference | Response letter carries the rebuttal, evidence first, ending open ("happy to revisit if…"); the draft may still change if the *misreading* reveals unclear text — a misreading is information about the prose, so consider a clarify-the-text fix alongside the rebuttal |
| **defer** | Real, but belongs to a later round or a different piece (scope, length, a structural experiment too risky this round) | Record where it goes (next round's agenda in the manifest, or a named future piece); never silent |
| **escalate** | An identity-level fork — thesis, stance, audience, register — that is the human author's to make | Resolved by `guidance` if it speaks; else the `autonomous` rule (conservative option + prominent flag) or the pause |

Calibration — the deliberate middle between slavish and defensive:

- There are **no quotas**. A healthy ledger is not "80% accept" or "20%
  rebut"; the tell is whether each rationale engages the finding's *evidence*
  rather than its authority (for accepts) or its inconvenience (for rebuts).
- A ledger that accepts everything is a red flag for compliance without
  digestion — re-examine the accepts whose rationale is only "the review
  said so."
- A ledger heavy with rebuttals is a red flag for defensiveness — re-examine
  any rebuttal whose evidence you did not actually read in Phase 1.
- Ambiguous findings are not guessed at: disposition on your best reading,
  and say in the response letter what you took the finding to mean.
- **Mandatory rationale** on every row, one to three sentences, in terms a
  skeptical third party could evaluate.

Then derive the **revision plan** (also in the ledger): group accepted and
adapted rows into ordered revision *moves* — structural surgery first, then
argument and evidence repairs, then craft passes. Findings map many-to-one
onto moves; record which rows each move discharges, and mark rows a
structural move **moots** (the section it criticized no longer exists) as
such — mooted is a disposition outcome, not an evasion, and the response
letter says so.

**Gate:** if `autonomous=false`, or unresolved escalations exist and
`guidance` is silent and the operator is reachable — present the ledger
summary (dispositions + rationales + escalations + planned moves) and wait.
Otherwise proceed.

## Phase 3 — Revise: produce v(N+1)

Copy `drafts/vN.md` → `drafts/v(N+1).md` and execute the revision plan on the
copy, in order:

- **Structural moves**: re-outline before rewriting; cut, merge, move, or
  wholly rewrite sections. Boldness is correct here — caulking a section the
  letter condemned wastes the round.
- **Argument and evidence moves**: integrate Phase 1 research with real
  citations (URLs/titles per your source notes — never cite what you
  haven't read); fix scope-matching by changing the *claim*, not by
  sprinkling hedges; engage the strongest counterargument in the text where
  the argument needs it, not in a defensive footnote ghetto.
- **Craft moves**: apply line-note *patterns* across the draft (the letter
  gives exemplars; you own the instances) — but only where the pattern
  actually occurs. Honor principle 3: untouched text stays untouched.

Discipline while writing:

- Update each ledger row to `done` **when its move completes**, with the
  v(N+1) location (section/paragraph, short quote) — not in a batch at the
  end from memory.
- If a move invalidates later planned moves (structural change moots a craft
  fix), re-plan in the ledger before continuing; the ledger records the
  re-plan.
- Log every **new factual claim** you introduce in the ledger's new-claims
  list as you write it (principle 8) — you will not remember them later.
- Write in the piece's voice per the charter. When you notice yourself
  smoothing a sentence no finding touched, stop.

Then the **coherence read**: read v(N+1) end-to-end as the intended reader,
once, at full attention. Fix seams between rewritten and original text,
transition breaks, thesis drift, register lurches introduced by the surgery.
Check every invariant in the ledger: each protected strength still present
(cite it), voice charter honored, thesis still the thesis — or the change was
deliberate, escalated or guidance-backed, and recorded.

## Phase 4 — Verify the new claims

For each row of the new-claims list: verify per your Phase 1 sourcing
standards (source note required), or — where verification is genuinely out of
reach — mark it `unverified` in the ledger; the response letter must carry
the unverified list. Nothing added this round ships silently unchecked.

## Phase 5 — Fresh-context gap analysis *(skip if `gap_analysis=false`)*

Self-assessment of your own revision inherits your own blind spots — you
"know what you meant" by every change. Where the harness supports subagents,
run this in a **fresh context** given *only*: the editor's letter (and
dossier), `guidance`, the response ledger, `vN`, and `v(N+1)` — not your
revision history — with the memory allowlist in its prompt. Where it doesn't, apply the fallback discipline: re-read
the letter and both drafts in full from disk and argue every judgment from
what is actually there, never from memory of writing it.

The gap walk:

1. **Coverage** — rebuild the finding list *fresh from the dossier* (not from
   the ledger — a check against your own extraction inherits its blind
   spots); diff against the ledger. Every missing finding is a gap.
2. **Discharge** — for every `accept`/`adapt` row marked done: is the change
   actually present in v(N+1) at the cited location? Evidence is mandatory —
   an uncitable "done" reverts to open.
3. **Faithfulness** — does the change *resolve* the finding or perform at
   it? (The hedge-instead-of-rescoping test; the citation-without-engagement
   test.) Performative fixes are gaps.
4. **Rebuttal quality** — is each rebuttal evidence-first and responsive to
   what the finding actually said? A rebuttal that restates the draft's
   original position is a gap.
5. **Regressions** — protected strengths intact; passages untouched by any
   finding are actually untouched (spot-diff vN against v(N+1)); no new
   incoherence at the surgery seams; the new-claims list looks complete
   against the diff (claims added but never logged are gaps).

Close the gaps (real fixes, ledger updated with evidence), then re-walk.
Max 3 close-and-reverify iterations; anything still open after 3 is recorded
honestly in the response letter as unresolved, never silently dropped.

## Phase 6 — Deliver

1. **Freeze the ledger** (it is now the round's decision record; immutable).
2. **Write the response letter** to `correspondence/vN-response.md` per
   `references/response-letter.md`: escalations and flags first, the
   disposition summary, then the point-by-point account — every finding,
   verbatim or tightly summarized, with its disposition, its rationale, and
   its v(N+1) location or its rebuttal. Include the unverified-claims list
   and anything left unresolved. This letter is what the next
   editorial-review round reads; write it for that reader.
3. **Update the manifest**: current version → v(N+1), round-log entry; update
   the voice charter and research index if the round changed them.
4. **Report to the operator**: the disposition counts (accepted / adapted /
   rebutted / deferred / escalated / mooted), the escalations and how they
   were resolved, the two or three biggest moves made, any unverified claims
   or unresolved gaps, where everything lives — and the natural next step
   (an `editorial-review` round on v(N+1)). Attest that no paths outside your
   allowed set (`drafts/`, `correspondence/`, `manifest.md`,
   `agents/author/`) were accessed, by you or your subagents. Do not paste
   the letter inline.

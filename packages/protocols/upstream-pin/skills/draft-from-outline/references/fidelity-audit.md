# Fidelity Audit (Phase 6)

An independent pass over the finished draft. Its subject is not "is this essay
good" — that is `editorial-review`'s job, and duplicating it here wastes the
round. Its subject is whether **this draft is a faithful, written-through
realization of what it committed to**: coverage, prose, links, provenance, voice,
and the reader's actual experience.

## Setup

**Where the harness supports subagents:** run in a fresh context. Give it
exactly: `drafts/v<N>.md`, `00-commissioning-brief.md`, `02-structure-plan.md`,
`03-claim-ledger.md`, `01-voice-brief.md`, the outline, and — where project
memory exists — the allowed-path set verbatim (`drafts/`, `correspondence/`,
`manifest.md`, `agents/author/`, plus the persona library) with the
no-recursive-operations rule. Do **not** give it the draft ledger's deviation
log or any account of how the draft was written: the audit's value is that it
reads the draft as a document rather than as the residue of a process.

**Where it doesn't:** run the same protocol as an explicit perspective shift,
re-reading the draft and the outline in full from disk and arguing every
judgment from what is on the page, never from memory of writing it. Label the
audit non-independent in its report; a self-audit reliably passes the
outline-restatement tests it just failed.

Write `06-fidelity-audit.md`. Every finding quotes the passage it is about.

## Walk 1 — Coverage of commitments

Rebuild the commitment list **from the outline itself**, not from the
commissioning brief — checking a brief against its own extraction inherits that
extraction's blind spots. Then diff:

- Every commitment: present in the draft (cite the location), deliberately cut
  (is the cut in the plan's cut list?), or **missing** — a gap.
- Every refusal: has the draft drifted into a thesis the outline explicitly
  ruled out? Quote the drift.
- The thesis: state, from the draft alone, what the piece argues. If it differs
  materially from the brief's thesis, that is a major finding — the piece is not
  transmitting its own argument.

## Walk 2 — Prose, from the draft alone

Apply the six tests in `prose-standards.md` §2 (heading, bullet-ghost,
transition, specificity, proportion, re-derivation). For each failure, quote the
passage and name the test. Then:

- **Sections that are surveys, not arguments** — name them.
- **Paragraphs that could be cut with no argumentative loss** — list them; a
  draft with many is inflated rather than long.
- **The opening:** does it earn the next five minutes? Where exactly would this
  venue's reader stop?
- **The ending:** does it land the thesis, or does it end because the material
  ran out?

## Walk 3 — Link integrity

The characteristic failure of outline-driven generation is not the invented fact
but the **shaky link**: material juxtaposed in the outline appearing in the draft
as a causal, evidential, or analogical relation. Expert evaluation of
outline-driven long-form generation identified exactly this class — red herrings,
shaky links, and over-association — as the dominant problem, above factual
hallucination ([STORM, NAACL 2024][storm]).

For every asserted relation in the draft ("because", "which is why", "the same
logic", "this is how X becomes Y", "a pattern that"):

- Is there a stated warrant, or is adjacency doing the work?
- Does the cited evidence support the *relation*, or only the endpoints?
- Would a knowledgeable hostile reader accept the inference? If not, the draft
  either argues for it or weakens it.

Also check **source bias transfer**: where the draft's framing is inherited from
one source's framing without acknowledgment.

## Walk 4 — Provenance

- Every citation in the draft resolves to a claim-ledger row with an adequate
  verdict. Spot-check three at random against their URLs.
- Every unverified claim carries an in-text mark; every marked claim is in the
  ledger's list.
- No quotation, figure, date, or attribution appears that the ledger does not
  contain.
- No unlabeled scene, anecdote, or first-person experience (provenance rules §6).
  This check is not satisfied by the ledger — read the prose for it.

## Walk 5 — Voice fidelity

Measure, then judge:

- The voice brief's measurable targets: sentence-length distribution, paragraph
  length, first-person count, punctuation rates (em-dash, colon, semicolon,
  question), apparatus counts vs. the budget. Report the numbers next to the
  targets; a miss is a finding with a number, not an impression.
- The register-hazard list (`prose-standards.md` §5): count the hits, quote each.
- The persona's signature moves: used, and **rationed**? Over-production of a
  signature is the standard imitation failure — count them.
- Where a persona exists, the honest question: **would a regular reader of this
  body of work accept this as belonging to it?** Answer with two or three
  specific divergences, not a verdict. Personalization at inference time
  reliably shifts surface features while leaving authorship signals short of the
  real thing ([authorship-gap evaluation][gap]) — the audit's job is to say
  *where*, so the drafter can fix what is fixable and the note can report what
  isn't.

## Walk 6 — The reader's first read

Read the draft once, straight through, at reading speed, as the venue's reader.
Then, without re-reading, report:

- What you believe the piece argues.
- The three passages that landed.
- The point at which your attention first broke, and why.
- What you expected to be told and were not.
- Whether anything read as machine-written, and which sentence first suggested it.

## Closing gaps

Findings are ordered: coverage and provenance failures first (they are
correctness), then link integrity, then prose, then voice. The drafter closes
them with real fixes — a rewritten section, a cut, a restored context, a
verified source — updates the draft ledger with the evidence, and re-runs the
audit.

**Maximum three iterations.** What remains open is reported in the drafting note
under its own heading, with the audit's own words. An audit finding that is
silently dropped is worse than no audit: the next round trusts a document that
was already known to be wrong.

[storm]: https://aclanthology.org/2024.naacl-long.347/
[gap]: https://arxiv.org/abs/2604.26460

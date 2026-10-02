# Provenance Rules (Phases 0, 3, 4)

The author's pre-publication verification discipline: nothing enters the draft
whose provenance you cannot state. The tiers, sourcing standards, and verdicts
are deliberately those of
[`editorial-review`'s verification protocol](../../editorial-review/references/verification-protocol.md)
— read it for the claim classes, the escalation rules, and the sourcing bar.
This file adds what is specific to *writing* rather than reviewing: where the
claims come from, how they are marked in prose, and what may never be invented.

## 1. Why an outline's citations start at zero trust

An outline assembled with research assistance — a chat transcript, a
deep-research report, a co-author's notes — is precisely where broken citations
live, and they arrive formatted correctly and contextually plausible:

- Across 10 commercially deployed models and ~69.5k citation instances,
  fabrication rates spanned **11.4%–56.8%**, varying by model, domain, and
  prompt framing ([cross-model audit][audit]).
- GPT-3.5/GPT-4 literature reviews: **55% / 18%** of citations fabricated
  outright, and **43% / 24%** of the *real* ones carrying substantive errors
  ([Walters & Wilder, *Scientific Reports* 2023][walters]).
- Fabrication rises as prompts get more specific and topics get more specialized
  ([economics audit][econ]; [mental-health study][jmir]) — i.e. exactly in the
  narrow, load-bearing places an essay's argument leans hardest.

So: **provenance is a property of each claim, recorded, never assumed.** A URL
in the outline is a lead, not a source. A quotation in the outline is a
paraphrase until you have seen the original. Tell-tale traces of tooling in the
outline (tracking parameters such as `utm_source=chatgpt.com`, suspiciously
tidy citation strings, "according to" with no link) raise a claim's tier; they
never lower it.

## 2. Provenance classes

Tag every claim in the Phase 0 inventory:

| Class | Meaning | Default treatment |
|---|---|---|
| `outline-cited` | The outline gives a source | Fetch the source; verify existence, content, and fit |
| `outline-asserted` | Stated without a source | Find a source or do not use it |
| `human-supplied` | The operator asserted it (guidance, own experience, unpublished data) | Accepted on the human's authority; attributed in the text as the human's; never restated as third-party fact |
| `model-supplied` | Something you know but the outline doesn't say | Highest suspicion. Verify to primary sources or cut. Never let recall substitute for a check |
| `derived` | A number or comparison you computed from sources | Show the derivation in the ledger; state the basis in the text |

## 3. Verdicts and drafting instructions

Use the editorial-review verdict vocabulary — **Verified**, **Substantially
accurate**, **Misleading in context**, **Unsupported**, **Contradicted**,
**Unverifiable** — and pair each with the instruction the drafter needs:

| Verdict | Drafting instruction |
|---|---|
| Verified | Use as-is, at the strength the source supports |
| Substantially accurate | Use with the corrected detail (the ledger carries the corrected wording) |
| Misleading in context | Use rescoped, with the context restored — or cut. Never use the outline's framing |
| Unsupported | Cut, or use explicitly marked `[unverified]` **and** rescoped to a hedge the argument can carry |
| Contradicted | Cut. Then check whether the section's function survives; if not, return to Phase 2 |
| Unverifiable | Use only if the argument tolerates it, marked and attributed to its origin |

A ledger row without a URL and an accessed date is not a verification. A source
you did not open does not appear anywhere — not in the draft, not in the ledger.

## 4. Marking the unverified inside the draft

An unverified claim that ships must be visible in the draft itself, not only in
the ledger — the reviewer, and the human, read the draft:

```
Roughly a third of large police departments now hold contracts with such
vendors.[^unverified: figure from the outline; no source located — needs a
count from vendor disclosures or a survey]
```

Inline `[unverified: …]` (or the venue's footnote form) is required. Silent
hedging is the failure mode this rule exists to prevent: converting an
unverified specific into a vague generality ("many departments") launders it
into the draft and makes the review round unable to catch it. Rescope *and*
mark.

## 5. Citations in the draft

- Cite in the venue's form (inline links, `[n]` endnotes, footnotes) as
  recorded in the commissioning brief — one form throughout.
- Every citation resolves to a ledger row with a **Verified** or
  **Substantially accurate** verdict, or carries its own mark.
- Cite what supports the sentence it is attached to. A source that supports the
  paragraph's general area but not its specific claim is a misplaced citation,
  which reads as sloppiness to a checking reader and as fabrication to a hostile
  one.
- Prefer the primary source over the report of it, and prefer the source you
  read over the source it cites.
- Quotation is verbatim, from the original, with enough surrounding context
  checked that the quotation's context does not reverse it. Ellipsis never
  changes meaning.

## 6. What may never be invented

Absolute, regardless of how much better the prose would be:

- **Quotations.** No composed quotation, no "something like what X would say,"
  no tightening of a real quotation.
- **Sources, links, titles, dates, page numbers, figures.**
- **Attributions of position.** A named person or school holds only what you can
  cite them holding.
- **First-person experience.** No invented anecdote, memory, conversation,
  interview, visit, or credential — including the small ones ("a friend told
  me…", "when I was reporting in…"). If the persona's voice wants lived
  experience, the human supplies it or the draft does without and says so in the
  drafting note.
- **Scenes and narrative openings.** A scene must be (a) reported from sources
  in the ledger, (b) supplied by the human, or (c) labeled in the text as
  illustrative or composite — e.g. "Consider a plausible case, assembled from
  documented incidents:" — with the ledger recording which documented incidents.
  An unlabeled invented scene at the top of an essay is the single most
  reputationally damaging thing this skill could produce.
- **Consensus.** "Most scholars agree" / "critics have argued" needs either a
  survey, a review article, or named instances.

## 7. New claims introduced while drafting

Prose generates claims that no outline contained: the connective assertion, the
"which is why," the number you reach for while explaining. Log each in the draft
ledger as you write it, then before the section closes either verify it (source
note required) or mark it. The corresponding rule in
[`respond-to-review`](../../respond-to-review/SKILL.md) exists for the same
reason: without it, each round launders new unverified claims into an
increasingly official-looking document.

[audit]: https://arxiv.org/abs/2603.03299
[walters]: https://doi.org/10.1038/s41598-023-41032-5
[econ]: https://doi.org/10.1177/05694345231218454
[jmir]: https://mental.jmir.org/2025/1/e80371

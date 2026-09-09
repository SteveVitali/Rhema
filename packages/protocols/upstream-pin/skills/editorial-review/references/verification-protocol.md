# Verification Protocol (Phase 1)

The magazine model of fact-checking, adapted for an agent with web research:
every fact in the published piece should be traceable to a source, and no part
of the piece should be objectionable on factual grounds. You are checking the
draft, not defending it.

## 1. What counts as a checkable claim

From the Phase 0 claim inventory (build it there; refine it here), the
checkable classes are:

- **Quotations** — anything in quotation marks or presented as what someone
  said or wrote.
- **Citations and references** — named works, links, footnotes: does the
  source exist, and does it say what the piece uses it for?
- **Statistics and quantities** — numbers, percentages, rankings, dates,
  magnitudes ("most," "the majority," "almost no one" are quantities too).
- **Historical and biographical claims** — events, sequences, who did what
  when.
- **Technical and scientific claims** — how a system, mechanism, or field
  actually works.
- **Attributions of views** — "X argues," "the rationalists believe,"
  "critics say": does the named person or school actually hold the position
  as characterized? (Overlaps with the Phase 2 misrepresentation check;
  verify here, interpret there.)
- **Factual predicates of evaluative claims** — "this was the decade's most
  influential paper" is evaluative, but influence has checkable evidence.
  Check the predicate, not the taste.

Not checkable, and not your job here: pure value judgments, the author's own
experiences (flag only if implausible on their face), and predictions (assess
in Phase 3 as reasoning, not here as fact).

## 2. Triage

Deadline fact-checking is triage. Tier every claim:

- **Tier 1 — load-bearing.** If this claim is false, the thesis or a major
  section fails. **Check every one, to primary sources.**
- **Tier 2 — supporting.** Feeds an argument but the piece survives its loss.
  **Check all quotations, citations, statistics, and attributions regardless
  of tier; for the rest of Tier 2, check broadly and note anything skipped.**
- **Tier 3 — color.** Incidental texture. Spot-check; escalate anything that
  smells wrong.

Escalate to Tier 1 regardless of structural role: claims that are surprising,
contested, reputationally damaging to a named person, or **too good to check**
— the anecdote that fits the argument perfectly is the one most likely to be
apocryphal, and the one readers will most gleefully debunk.

## 3. Standards of verification

- **Primary over secondary.** Verify against the original paper, dataset,
  speech, or document, not a journalistic paraphrase of it. Secondary sources
  count only when the primary is unreachable — say so in the ledger.
- **Two independent sources for contested claims.** Independent means not
  citing each other or a common upstream source.
- **Quotations verbatim and in context.** Check the exact wording *and* that
  the surrounding context doesn't reverse or qualify the meaning the piece
  extracts.
- **Citations must be representative.** A real source accurately quoted can
  still be cherry-picked — if the cited work, or the literature it belongs
  to, on balance cuts against the use the piece makes of it, that is a
  finding ("misleading-in-context").
- **Numbers re-derived.** Check statistics at the source; recompute
  derived figures; check that the base and year match the piece's framing.
- **Currency.** A claim true in 2019 may be false now; check against the most
  recent authoritative data and note when the piece's evidence has aged out.
- **Record uncertainty honestly.** Where sources genuinely conflict, the
  verdict reflects that; do not force a clean verdict.

## 4. Verdicts

Every checked claim gets exactly one:

| Verdict | Meaning |
|---|---|
| **Verified** | Confirmed against sources meeting the standards above. |
| **Substantially accurate** | Right in essentials; detail off (number slightly stale, quote lightly paraphrased). Fix noted. |
| **Misleading in context** | Literally defensible but creates a false impression — cherry-picked, out of context, or scope-inflated. |
| **Unsupported** | No adequate source found after genuine effort; not affirmatively contradicted. |
| **Contradicted** | Reliable sources affirmatively refute it. |
| **Unverifiable** | Cannot be checked in principle or with available access; noted so the author can decide whether it belongs. |

A **Contradicted** or **Misleading in context** verdict on any Tier 1 claim is
automatically a major issue for the editor's letter. A pattern of
**Unsupported** Tier 2 claims is too.

## 5. The ledger

Write `01-claim-ledger.md`: a summary block, then one entry per checked claim.
Include every claim checked — the ledger is the evidence trail, not a
highlight reel.

```markdown
## Summary
- Claims inventoried: N (T1: n1, T2: n2, T3: n3)
- Checked: N — Verified: a · Substantially accurate: b · Misleading: c ·
  Unsupported: d · Contradicted: e · Unverifiable: f
- Major-issue escalations: [list]
- Skipped (with reason): [list]

## Ledger

### C1 · Tier 1 · Contradicted
> "exact quoted claim from the draft" (§/para location)
- **Finding:** what the sources actually show.
- **Evidence:** [Source title](url) — the relevant content, quoted or
  precisely characterized; second source where required.
- **Fix:** correct / cut / re-scope, concretely.
```

Every evidence entry must carry the URL of a source actually read this
session. No source you did not open appears anywhere in the ledger.

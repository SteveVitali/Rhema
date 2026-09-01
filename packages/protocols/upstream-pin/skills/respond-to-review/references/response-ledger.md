# Response Ledger (author's private working state)

Lives at `agents/author/ledgers/v<N>-response-ledger.md`. It is three things
at once: the compaction-proof checklist for the round, the crash/reset resume
point (a fresh session reads ledger + drafts + dossier and continues), and
the seed of the response letter. Keep it current at every phase transition;
freeze it at delivery. It is **not** shared with the editor — the response
letter is the delivered account.

```markdown
# Response ledger — <project> v<N> → v<N+1>

- **Review:** <path to dossier> · **Draft under revision:** drafts/v<N>.md
- **Guidance:** <one-line summary of the human author's seed commentary, or "none">
- **Phase status:** bootstrap | research | triage | gated | revising | verifying | gap-analysis | delivered

## Invariants (regression guards — from the voice charter + letter's Strengths)
- I1: <protected strength / voice commitment / thesis statement> — [intact | violated: …]
- …

## Findings

| ID | Source | Finding (tight summary) | Disposition | Status |
|---|---|---|---|---|
| F1 | Letter §Major 1 | Central analogy fails under X | adapt | done |
| F2 | Claim ledger C3 | Statistic contradicted | accept | done |
| F3 | Second read #4 | Ending reads as a different piece | escalate→guidance | done |
| F4 | Guidance | Keep the polemic register | constraint | honored |
| F5 | Self | §2 example is weaker than §4's | adapt | done |

### F1 · Letter §Major 1 · adapt · done
- **Finding:** <what the review actually said, faithfully>
- **Rationale:** <why this disposition — engaging the finding's evidence, 1–3 sentences>
- **Planned change:** <the real fix, in the author's terms> (move M2)
- **Evidence:** v<N+1> §3 ¶2 — "<short quote>" <what it now does>

<one block per row; rebut rows carry the evidence sources (source-note slugs);
defer rows carry where it goes; escalate rows carry who resolved it and how;
mooted rows name the move that mooted them>

## Revision plan (moves, in execution order)

| Move | Type | Description | Discharges | Moots | Status |
|---|---|---|---|---|---|
| M1 | structure | Merge §2 into §4; cut §5 | F6, F9 | F11, F14 | done |
| M2 | argument | Rebuild the analogy on Y; engage <counterargument> directly in §3 | F1, F7 | — | done |
| M3 | craft | Kill the hedge-stack pattern (letter's line-note 2) where it occurs | F12 | — | pending |

## New claims introduced this round

| Claim (quoted from v<N+1>) | Location | Verification | Source note |
|---|---|---|---|
| "<…>" | §3 ¶4 | verified | sources/<slug>.md |
| "<…>" | §6 ¶1 | unverified — flagged in letter | — |

## Gap-analysis log
- Walk 1 (<date>): <gaps found → closures made>
- …
```

Rules:

- **Every finding class enumerated** (majors, minors, line-note patterns,
  non-Verified claim-ledger rows, discourse obligations, rubric caps,
  roadmap items, open questions, guidance points, self-identified). The
  Phase 5 coverage check rebuilds this list fresh and diffs it — write the
  ledger knowing it will be audited.
- **Status vocabulary:** `open → done → verified` (gap analysis promotes
  done → verified; an uncitable done reverts to open). `mooted`, `deferred`,
  `escalated`, `honored` (constraints) are terminal.
- **Evidence is mandatory for done** — v(N+1) location plus a short quote.
  "I revised that section" is not evidence.
- Rationales are written for a skeptical third party, not for yourself.
- Never edit history: if a disposition changes (a rebuttal collapses under
  Phase 1 research; a structural move moots a fix), append the change and
  reason — the ledger is a decision record, and reversals are decisions.

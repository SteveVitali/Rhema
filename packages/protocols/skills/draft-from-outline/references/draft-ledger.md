# Draft Ledger (author's working state, Phase 4)

Lives at `agents/author/drafting/v<N>/04-draft-ledger.md`. It is three things at
once: the compaction-proof record of a long drafting run, the resume point after
a crash or reset (a fresh session reads plan + ledger + the draft so far and
continues), and the evidence base for the delivered drafting note. Update it
**as each section closes**, not at the end — a ledger written from memory is a
reconstruction, and reconstructions omit exactly the deviations that matter.

Freeze it at delivery. It is private to the author agent; the drafting note is
the delivered account.

```markdown
# Draft ledger — <project> v<N>

- **Outline:** agents/author/outline/<file> · **Plan:** 02-structure-plan.md
- **Persona:** <slug> (profile <date>) | none — ad-hoc voice
- **Target:** <N> words (<venue>) · **Current total:** <N>
- **Phase status:** intake | voice | plan | grounding | drafting | consolidation | audit | delivered

## Sections

| # | Section | Function (from plan) | Budget | Actual | Status | Claim rows used | Deviation |
|---|---|---|---|---|---|---|---|
| 1 | Opening — the Minneapolis scene | Make the abstraction concrete before naming it | 700 | 780 | verified | C3, C7, C9 | scene labeled composite (provenance rule §6) |
| 2 | The wrong picture | Displace the coup image | 900 | 870 | verified | C11–C14 | — |
| 3 | (cut) Vendor market history | — | 600 | — | cut | — | off-thesis; moved to cut list |

Status vocabulary: `planned → drafted → seams-read → verified` (verified =
survived the Phase 6 audit). `cut` and `deferred` are terminal.

## Deviations from the outline

| ID | Outline location | What the plan/draft does instead | Reason |
|---|---|---|---|
| D1 | §"Governing Analytical Sequence" (7 stages) | Four sections, stages 4–5 merged | Two stages shared one mechanism; separate sections repeated themselves |
| D2 | Editorial rec: "70–75% capacity material" | ~60% | Verification killed two capacity examples (C21, C24) |

## New claims introduced while drafting

| Claim (quoted from the draft) | Location | Verification | Source note |
|---|---|---|---|
| "<…>" | §2 ¶4 | verified | sources/<slug>.md |
| "<…>" | §5 ¶2 | unverified — marked in text, listed in note | — |

## Promise / payoff

| Promise (from the opening or an early section) | Where paid | Status |
|---|---|---|
| "what machinery an authoritarian American state would need" | §§3–6 | paid |
| "and what a citizen can do about it" | §9 | paid, thinly — flagged |

## Open questions for the human

| ID | Question | Conservative default taken |
|---|---|---|
| Q1 | Title: "The Politics of Visibility" vs. "The Machinery Before the Regime" | Kept the outline's philosophical option; flagged |

## Run log

- <date> — Phase 3: 41 claims checked; 4 contradicted → §4 re-planned
- <date> — Phase 5: total 6,400 vs. 5,500 target; cut §7 by 600, §3 by 300
- <date> — Phase 6 audit iteration 1: 3 gaps (2 closed, 1 reported)
```

Rules:

- **Every section has a row**, including cut ones — a cut recorded is a decision;
  a cut unrecorded is an omission the reviewer will find.
- **Budgets and actuals are both recorded.** The pattern of over-runs is the
  most useful diagnostic the ledger produces: it shows where the plan
  misjudged the material.
- **Deviations are written when taken**, with a reason a skeptical reader would
  accept. "Improved flow" is not a reason; "the outline's order requires the
  reader to hold two undefined terms for 900 words" is.
- **Never edit history.** If a section is re-planned after a failed
  verification, append the change and the reason; the ledger is a decision
  record and reversals are decisions.
- **The last sentence of each drafted section** belongs in the run log or the
  section row when it matters for the next section's entry state — it is the
  handoff a fresh context needs.

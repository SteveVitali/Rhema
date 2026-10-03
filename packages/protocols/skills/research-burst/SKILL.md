---
name: research-burst
license: MIT
description: "Rhema-authored (P1.11; §6.2 Research row): answer a research question as a bounded, sourced burst — plan the question into a fetch list, fetch the planned sources through the metered egress path under the run's URL policy, then distill ONE research note plus a source card per fetched source. The burst is the Assistant seat's background-research leg: it writes only under agents/assistant/research/ and never produces an outline, a thesis pick, or an originality verdict."
inputs:
  - name: question
    required: true
    description: "The research question, verbatim from the chat turn or the run sheet."
  - name: sources
    required: false
    description: "The source budget N from the plan card / sheet lever (default 5, hard cap 10). The fetch phase plans at most N sources and the proxy's per-run fetch budget enforces it."
  - name: burst_dir
    required: true
    description: "Rhema harness (P1.11): the per-run output directory under the assistant research namespace, supplied server-side as agents/assistant/research/burst-<runId>/ — every phase artifact lands inside it; per-source notes land in the project-level agents/assistant/research/sources/."
  - name: guidance
    required: false
    description: "Standing/pinned guidance delivered at the phase boundary (§6.5): promoted chat notes and corrections the burst must honor. Guidance outranks the plan where they conflict."
  - name: phase
    required: false
    description: "Rhema harness (REQ-ARCH-5): run one phase then stop. \"N\" runs only phase N; \"N+\" runs from N to the end; absent, the whole skill runs. Phase indices follow this skill's own fallback order (0, 1, 2)."
  - name: scope
    required: false
    description: "Rhema harness (REQ-ARCH-5): narrow the run to a phase subset."
  - name: changed_since
    required: false
    description: "Rhema harness (REQ-ARCH-5): the prior version this input was human-revised from."
  - name: prior_review
    required: false
    description: "Rhema harness (REQ-ARCH-5): explicit path of the review being answered/extended."
  - name: resume_from
    required: false
    description: "Rhema harness (REQ-ARCH-5, 1.x): section-granular resume point."
  - name: sidecar
    required: false
    description: "Rhema harness (REQ-ARCH-5, REQ-SPEC-4): when true, emit the structured-output sidecar twin of §11.1 under .rhema/ beside each markdown deliverable (research-result.json), and write .rhema/phase-result.json {status} at the end of every phase."
  - name: phase_output
    required: false
    description: "Rhema harness (REQ-ARCH-5): the exact dossier file(s) the pinned phase must write under burst_dir — supplied by the harness from the phase manifest so the write target never drifts from the completion oracle. When set, the pinned phase writes precisely these file(s) (comma-separated) before .rhema/phase-result.json."
---

# Research burst

You are the Assistant seat answering one research question as a bounded burst.
The output is exactly two things: **one distilled research note** the chat can
read back, and **one source card per fetched source** — never an outline, never
a thesis recommendation, never an originality verdict. Those belong to other
workflows (the two-conduit rule, REQ-SPEC-15): nothing you write may look like a
drafting input, because a Drafter/Editor run never mounts
`agents/assistant/**`.

Every fetch goes through the metered egress path under the run's URL policy.
When a fetch fails — paywall, robots, policy, timeout — you write the source
card marked `[unverified]` and move on; you never retry a failed URL in the same
burst, and you never widen the URL policy yourself.

## Phase 0 — Plan

Decompose `question` into a fetch plan: the sub-questions, and the ≤ `sources`
(N) candidate URLs or search queries you will fetch. Write the plan to
`agents/assistant/research/burst-<run>/00-plan.md` with one line per planned
source (`- [ ] <url-or-query> — why it answers the question`). A burst that
cannot decompose the question writes the plan with the sub-questions it could
form and reports `{"status":"blocked"}` — it never silently proceeds.

## Phase 1 — Fetch

Fetch the planned sources through the metered path, in bounded batches, under
the run's URL policy and fetch budget. For each fetched source write a source
card at `agents/assistant/research/sources/<slug>.md` — title, URL, a
two-sentence abstract, and the facts it attests — and record it in
`agents/assistant/research/burst-<run>/01-sources.md` (the fetch ledger: one
row per attempt, `fetched` or `[unverified]` with the deny/fail reason). A
failed fetch produces the `[unverified]` card, not a retry storm. Do not exceed
N fetched sources; when the plan's list is exhausted or the budget trips, stop
and note the bound you hit in the ledger.

## Phase 2 — Distill

Read the phase-1 source cards and distill the answer into ONE note at
`agents/assistant/research/burst-<run>/note.md`: the answer to `question` in
the fewest honest words, each load-bearing claim footnoted to its source card,
an `## Open questions` section for what the sources did not settle, and a
`## Sources` list mirroring the ledger. Then emit the `research-result.json`
sidecar (`status`, `notePath`, `sources[]`, `fetchedTokens`) beside it under
`.rhema/` and write `.rhema/phase-result.json {"status":"done"}`.

## Under the harness

The pinned phase writes exactly the file(s) `phase_output` names under
`burst_dir`, then `.rhema/phase-result.json {"status":"done"}`. With `sidecar:
true` the Distill phase also emits the `research-result.json` twin. The burst
writes nowhere outside `agents/assistant/` — a draft, an outline, or a
`correspondence/` file is a boundary violation, not an output.

# ADR-073: guided-retry guidance crosses into the scoped second read on the prompt channel only

- **Status:** Accepted
- **Date:** 2026-10-03
- **Ticket:** DEF.4
- **Requirement ids:** REQ-DATA-17, REQ-SPEC-24
- **Spec:** §12.6 (input-scoped subagents; the guided retry)

## Context
The second-read phase launches an *input-scoped* subagent: a `unshare`-confined process whose
mount set is exactly the declared `files` and whose only input channel is the query prompt in
its spec JSON. When the guided retry fires (a first read fails its predicate, the loop retries
with the failure text as guidance), the ordinary retry path merges that text into
`inputs.guidance` — but a scoped launch has no `inputs` object at all: the spec carries
`query.prompt`, `files`, and nothing else. Without a rule, a guided scoped retry silently drops
its guidance — the retry runs blind, which is the DEF.1 caveat this ticket owns — or worse,
someone "fixes" it by widening the mount set or smuggling the text through a file.

## Decision
The predicate-failure guidance is folded into `query.prompt` — appended on its own paragraph by
`scopedPromptWithGuidance(prompt, guidance)` at spec-build time — and **nowhere else**:
- the mount set stays exactly `launch.files`; no guidance file is added;
- run-scope/standing `inputs.guidance` records never cross (the scoped branch carries no inputs
  merge — only the loop's per-retry text may);
- the text never lands in an event payload; it lives in the tmpfs spec file only.

The merge happens in `buildScopedPhasePlan`, so the spec JSON the runner applies is the single
place the guidance exists for the scoped read.

## Consequences
A guided retry of a scoped phase reaches the second read verbatim — same semantics as the
non-scoped `inputs.guidance` path, through the one channel REQ-DATA-17 allows. The scoped
boundary stays exact: the mount-set test (`files` only) and the prompt-construction test pin
the rule, and a future change that adds a channel fails them. The spec file sits on tmpfs in
the run's config dir — no new persistence surface.

## Alternatives considered
- **A `guidance` file added to the mount set:** widens `files` — REQ-DATA-17's whole point is
  that the mount set is the contract; an extra file is a new input channel the scoped runner
  would have to read, doubling the surface for zero benefit.
- **`inputs.guidance` inside the scoped spec:** the scoped launch shape has no `inputs` stanza —
  adding one implies the scoped query consumes inputs generally, which it does not and must not.
- **Rewrite the prompt server-side:** the retry's guidance is generated in the loop (the pod),
  after the spec is issued; prompt-append at spec-build time is where the two meet.

## Revisit trigger
If the scoped launch shape grows a real `inputs` object (a spec change to §12.6), the guidance
should move onto it for parity with the non-scoped path and this ADR is superseded. Also revisit
if guidance ever needs per-file scoping rather than prompt text.

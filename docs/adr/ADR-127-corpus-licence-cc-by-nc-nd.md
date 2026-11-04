# ADR-127: Corpus content licence — CC BY-NC-ND 4.0 scoped to `packages/demo-corpus/corpus/**`

- **Status:** Proposed
- **Date:** 2026-11-03
- **Ticket:** R7OPEN.1 (shell); filled and accepted by **214 R7DEM.1**. The landing-recording
  asset declaration is **249a R7PUB.1**'s.
- **Requirement ids:** REQ-DOPS-3, REQ-CORPUS-1/11/12/14
- **Spec:** `docs/round-7-draft-spec.md` §3.2 (ADR-127 bullets), §4.1; `GD-DEMO-LICENSE.R7`

## Context

The repository is MIT. Committing the four operator-owned essays implies MIT unless they are
carved out. The operator ruled **"CC BY-NC-ND 4.0"** (GD-DEMO-LICENSE.R7). The carve-out is
scoped: the repo stays MIT; GD-SHOWCASE.R6's public-domain-only rule stays scoped to the
Showcase (GD-DEMO-SHOWCASE.R7 — a scope clarification, not a supersession).

## Decision

_(Shell — written by R7OPEN.1 from spec §3.2. 214 R7DEM.1 fills the decision: the
`packages/demo-corpus` LICENCE file + `LICENSES.md` note, the carve-out boundary, and how
exported/converted artifacts inherit the scope. 249a R7PUB.1 declares the landing-recording
asset's licence posture here.)_

## Consequences

_(Filled by the owners: public-repo permanence (REQ-CORPUS-14), the H14 sign-off's licence
review, redistribution boundaries for snapshots and goldens.)_

## Alternatives considered

_(Filled by the owners: all-rights-reserved vs CC BY-NC-ND vs MIT for the corpus; per-file
headers vs a directory-scoped LICENCE.)_

## Revisit trigger

The corpus licence changes, a non-operator-owned essay is added, the Showcase's
public-domain scope is revisited, or the recording asset needs a different grant.

# R6SOAK.1 — Worker right-size soak on a preview (0.5 vCPU / 512Mi)

- **Sequence:** 185 of 208 · **Phase:** round 6 · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 184_R6WRT.1
- **Run:** `implement-spec spec=docs/tickets/185_R6SOAK.1__worker-rightsize-soak.md`
- **Gate status:** none (D-COST.1-3 (a) conditional authorization — this ticket produces the condition)
- **Live stage:** an owned `pr-<n>` preview (≤ $8 resource-hours; destroyed at closeout)
- **Production mutations:** none
- **Size budget:** ~200 changed lines (soak driver + evidence)

## Goal
Determine with evidence whether the worker survives the cold-import path at 0.5 vCPU / 512Mi. The
soak must reproduce `D-P0.15h-3`'s throttled cold-import failure mode as its test condition. Green
unlocks R6INF.1's flip; red keeps 1 vCPU/1Gi with this soak as evidence.

## Load
- `docs/round-6-draft-spec.md` §4.1 REQ-ENG-7; DEFERRALS **D-COST.1-3** (a) + **D-P0.15h-3**;
  LEDGER batch-2 cost-lever ruling.
- Anchors (re-confirm): `scripts/live/preview-stack.mjs` (init → config → up → destroy),
  `infra/config/stages.ts` (`cloudRun.services.worker.resources`), the cold-import path
  (`apps/worker` import/convert handoff), `scripts/live/funded-window.mjs`-style evidence layout.

## In scope — deliverables
1. A preview at the chain-tip images, with the worker set to 0.5/512Mi via the preview's stage
   config only.
2. A soak driver that exercises the D-P0.15h-3 cold-import shape repeatedly (N stated in advance).
   Record its failure-mode signature.
3. A verdict (green/red) with evidence under `docs/build/reports/<date>_R6SOAK.1/`; preview
   destroyed and teardown verified (zero `rhema-pr-<n>*` orphans).

## Out of scope
- Any prod change (R6INF.1 flips only if this is green).

## Acceptance criteria
- [ ] The soak runs the pre-registered N iterations and its verdict is evidenced *(staging-verified)*
- [ ] Preview destroyed; orphan sweep clean; resource cost recorded *(staging-verified)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-ENG-7

## Cross-cutting invariants
- Round-6 spec §8 (preview hygiene) + manifest invariants.

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`.

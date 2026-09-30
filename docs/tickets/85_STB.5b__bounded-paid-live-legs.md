# STB.5b — Bounded paid live legs

- **Sequence:** 85 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** ops
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** STB.5a, JOURNEY.1, RES.1, ECON.1
- **Scope (one line):** the remaining paid, bounded live legs from BL-16–19, run cheapest-first on the JOURNEY.1 harness; any defect found is recorded, not fixed here.
- **Spec §§:** 12.2 (sidecars/phase manifests), 12.6 (engine invariants), 12.8 (fetch policy), 6.4 (gates)
- **REQ coverage:** the REQ ids of the source deferral rows (per BACKLOG.csv BL-16–19; stamp in the PR)
- **Absorbs (backlog):** BL-16, BL-17, BL-18, BL-19 (BL-20 and BL-24 moved to HUMAN-H7)
- **Run:** `implement-spec spec=docs/tickets/85_STB.5b__bounded-paid-live-legs.md`
- **Gate status:** none beyond the round-3 standing authorization (ADR-013)
- **Live stage:** Stage A: harness scripts + tests ($0). Stage B: the legs, ≤ $25 metered combined, cheapest first.


> **Amended 2026-09-30 (operator — round-3 spend limit: hard ≤ $200, target ≤ $100):** this ticket's Stage B metered spend cap is **≤ $25** (was ≤ $40); aim for ≈ $12. Run legs cheapest-first and stop once the acceptance evidence suffices; where a leg plan below sums past the new cap, drop the lowest-priority legs and record each dropped leg as a `D-STB.5b-<n>` row (never overspend). The orchestrator pauses the chain when round-3 cumulative metered spend reaches $100 and hard-stops at $200 (LEDGER GATE DECISIONS 2026-09-30, D6 revised).

## Goal
Close the four remaining paid live-verification rows with real evidence on prod. The rows are:
- **BL-16:** skill-input pins.
- **BL-17:** engine invariants.
- **BL-18:** fetch-policy legs.
- **BL-19:** workflow gate + finalize legs.

## Load (read these — do not re-read others)
- `docs/build/BACKLOG.csv` rows BL-16–19, and their source rows in `docs/tickets/DEFERRALS.md`.
- `docs/build/planning/2026-09-30_planning-ledger.md` (the standing authorization; metered caps).
- The JOURNEY.1 harness (`packages/journeys`) and its step registry.

## In scope — deliverables
1. **BL-16:** a sidecar-absent dry run and a mid-phase phase pin, run live.
2. **BL-17:** a 4th audit iteration ends `completed_partial`, and the post-commit high-water publish is asserted live.
3. **BL-18:** a Full-board Editor fetch through `fetchViaFetcher`, and a Memo user-source fetch denied, both live.
4. **BL-19:** structured `approve_plan` / `approve_outline` edits land in the next phase's file, and finalize runs, live.
5. For each leg: its cap stated in advance, its metered cost recorded, and its evidence in `docs/build/runs/STB.5b.md`.

## Out of scope
- **Fixing defects found:** each becomes a new DEFERRALS row routed to a round-4 ticket.
- **BL-20:** HUMAN-H7's product ruling.
- **BL-24:** an H7 operator key.

## Acceptance criteria
- [ ] Each BL-16–19 source deferral row is flipped DONE with live evidence, or stays OPEN with a sharpened residual and reason. *(agentic)*
- [ ] Combined metered spend ≤ $25; a leg that would exceed its cap stops and is recorded. *(agentic)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
Those of the BL-16–19 source rows.

## Cross-cutting invariants
- Manifest invariants 1–11.
- Round-3 invariants: 12 (journey acceptance), 13 (tenant isolation), 14 (money and research truthful).

## Notes
- The legs run cheapest first.
- A defect found becomes a `D-STB.5b-<n>` row; it is never fixed and re-run here.

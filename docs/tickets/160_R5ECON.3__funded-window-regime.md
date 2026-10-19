# R5ECON.3 — Funded-window regime + driver-build prerequisites

- **Sequence:** 160 · **Phase:** round 5 · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 159_R5ECON.2
- **Run:** `implement-spec spec=docs/tickets/160_R5ECON.3__funded-window-regime.md`
- **Gate status:** none — the window OPEN is 166_GATE-R5F's
- **Live stage:** none
- **Production mutations:** none (the funded tenant + purge exemption is scripted here, executed under the gate)
- **Size budget:** ~500 changed lines

## Goal
Encode the window-opening regime — caps, ordering, tenant, driver prerequisites — so
166_GATE-R5F's checklist is mechanically checkable and 167_FUNDED.1 is a leg-runner, not a
design exercise.

## Load
- `docs/post-spa-disposition-spec.md` §5.3/§5.5/§5.6 (REQ-ECON-9 caps verbatim, REQ-FND-6/7/8, the census table)
- `docs/research/r5_f1_funded-census.md` (the 21-leg registry census + non-registry items)
- `docs/research/r5_b3_cost-regime.md` (window checklist + ordering: T9 → launchers → riders → B19C last)
- `packages/journeys/src/{funded-window.mjs,registry.ts,steps/}`, `scripts/live/` (tenant seeding precedents)

## In scope — deliverables
1. **Per-leg caps in the registry** (REQ-ECON-9): the §5.3 table verbatim (basis: levered-expected,
   unlevered-measured fallback, floor $0.50) — B16 .50 · B17 1.00 · B18A/B 1.00 · B19A 3.50 ·
   B19B 1.50 · B19C 15.00 · N5 9.00 · N6 6.00 · N11 6.50 · R4 .50 · R6 4.50 · R9 .50 · CITE
   probes 9.00/probe.
2. **Round envelope** (ratified Q-ECON.f): the window opens against a re-authorized ~$60
   cumulative cap on the pinned-scope cumulative query; `--headroom <legCap>` enforced.
3. **Funded tenant** (REQ-FND-8 prep): `JOURNEY_FUNDED_STABLE_TAG` seeded tenant + purge
   exemption (ratified Q-6) — script lands, execution under the gate.
4. **REQ-FND-6 consolidations:** riders ride the window's own deliveries (T15←B19A/B
   `waiting_gate`; T16←seeded `persona_profiles` (FIX.1); R9←window deliveries).
5. **REQ-FND-7 driver builds:** committed drivers (or skeleton tickets) for the non-registry paid
   items — BL-20 `research_burst`/`chat` asserts, the R5ECON.2 OFF/ON lever pairs (D-ECON.2-2..4),
   the RES.3 retry-drain product change (D-RES.3-1) — each either lands a driver here or gets a
   named deferral citing the prerequisite.
6. **Window-runner script** (REQ-FND-8): `funded-window.mjs` gains the checklist ordering +
   the gate's verbatim thresholds as `--dry-run`-checkable assertions.

## Out of scope
- Running any paid leg → 167_FUNDED.1 · the gate itself → 166 · R5ECON.1/2's mechanisms

## Acceptance criteria
- [ ] Registry carries the verbatim cap table; dispatch validates headroom + cap presence *(deterministic)*
- [ ] Each non-registry paid item has a committed driver or a named prerequisite D-row *(deterministic)*
- [ ] `--dry-run` prints the §5.5 checklist as pass/fail rows *(deterministic)*
- [ ] verification green; BUILD_INDEX row + LEDGER advanced; operating clauses met. *(agentic — universal AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-FND-6 REQ-FND-7 REQ-FND-8 REQ-ECON-9(caps-in-registry half)

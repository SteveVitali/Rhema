# HUMAN-H9 — Production cost-posture ruling (~$50 target vs warm architecture)

- **Kind:** human · **Phase:** round 5
- **Blocks:** 164_COST.1 (all levers), partially 166_GATE-R5F's budget context
- **Owner:** operator   **Scheduled:** after D-OPS.2-1's billing-export flip (H8) so the ruling reads real bills, not list-price recomputation
- **Withheld until done:** any warm-architecture lever (min-instances, SQL tier, Redis, MIG, node posture)
- **Deferrals so far:** 0
- **Readout:** `docs/build/readouts/HUMAN-H9.md`

> **Operator ruling — NOT an `implement-spec` input.** D1-F7 (`r5_d1_cost-levers.md`): a ~$50/mo
> prod cannot run this architecture warm (ADR-082's revisit trigger). Ratified Q-POSTURE: the
> posture ruling precedes levers. The ruling picks: (a) keep ~$50 target → architecture change is
> required (cold floors, consolidation); (b) re-authorize a higher envelope → levers proceed
> per-change on preview evidence.

## Checklist
- [x] Ruling recorded: target-vs-posture decision + the lever pre-authorization granularity — **(a) keep ~$50 target → architecture change required; class-level pre-authorization** (operator, 2026-10-16 → `docs/build/readouts/HUMAN-H9.md`)

## Exit criterion
The ruling is recorded verbatim in the readout; 164_COST.1's skeleton expands or parks on it.

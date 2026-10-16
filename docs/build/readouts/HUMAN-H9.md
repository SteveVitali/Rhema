<!--
  docs/build/readouts/HUMAN-H9.md (BM-INDEX-03) — append-only gate readout for the round-5
  marker 163_HUMAN-H9__cost-posture-ruling.md. Operator cost-posture ruling: the ~$50/mo
  target vs warm architecture (D1-F7, Q-POSTURE).
-->
# HUMAN-H9 — production cost-posture ruling — readout

- **Criterion (verbatim, `163_HUMAN-H9__cost-posture-ruling.md`):** "D1-F7
  (`r5_d1_cost-levers.md`): a ~$50/mo prod cannot run this architecture warm (ADR-082's revisit
  trigger). Ratified Q-POSTURE: the posture ruling precedes levers. The ruling picks: (a) keep
  ~$50 target → architecture change is required (cold floors, consolidation); (b) re-authorize a
  higher envelope → levers proceed per-change on preview evidence." Checklist: "Ruling recorded:
  target-vs-posture decision + the lever pre-authorization granularity." Exit: "The ruling is
  recorded verbatim in the readout; 164_COST.1's skeleton expands or parks on it."

> An operator or authorized human record supplies the decision; an agent must not sign or assume
> silence is approval.

## Disposition — 2026-10-16: **RULED — option (a): the ~$50/mo target stands; architecture change is required**

The operator ruled on the orchestrator's dispatch question (2026-10-16T00:57Z session):

- **Posture decision:** **(a) keep ~$50 target** — "the ~$50/mo target stands → architecture
  change required (cold floors, consolidation). COST.1's skeleton expands toward redesign
  levers, not warm tuning."
- **Lever pre-authorization granularity:** **class-level authorization** — "pre-authorize
  classes of changes now (e.g. all scale-to-zero floors; all consolidation moves) — COST.1
  executes inside the classes without re-asking." Levers outside a pre-authorized class still
  stop for the operator.

### Consequences for 164_COST.1

- The skeleton expands toward **redesign levers** — cold floors / scale-to-zero posture,
  consolidation — not warm-architecture tuning. REQ-COST-1..6 levers are read through this lens.
- Class-level pre-authorization means the ticket's expansion names its lever **classes**
  explicitly; execution inside a named class needs no further pause. Anything outside the
  classes → pause for the operator (checkpoint).
- The D-OPS.2-1 billing-export flip (H8 checklist) stays owed for *measured* evidence; the
  ruling itself did not wait on it — the ratified D1-F7 analysis was sufficient for the
  target-vs-posture question. Measured levers still read real bills where the contract requires.
- GATE-R5F's budget context is unaffected in direction — the funded-window envelope (~$60) is
  unrelated to the prod posture target; H9's partial block on 166 resolves as "the $50 target
  stands."
- Prior authorization stands as context: the 2026-09-17 H6 ruling ("~$50/mo target authorized",
  honest floor ~$95/mo documented) — H9 confirms the target and routes the gap through
  architecture change rather than a raised envelope.

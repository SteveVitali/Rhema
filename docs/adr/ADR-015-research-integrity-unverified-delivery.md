# ADR-015: Research integrity — preflight the tools, keep a research floor, deliver zero-coverage Reviews *Unverified* and refunded

- **Status:** Accepted
- **Date:** 2026-09-30
- **Ticket:** RES.1 (preflight + floor + the regression fix), RES.2 (the *Unverified* delivery + refund + alert)
- **Requirement ids:** REQ-SPEC-31 (new), REQ-VIS-9 (reconciled), REQ-IDE-18, REQ-IDE-25, REQ-SPEC-11, REQ-SPEC-24(6)
- **Spec:** §12.8, §8.4, §14.4 (2026-09-30 notes); Appendix D.2; refines ADR-006 (Path B)

## Context

ADR-006 (Path B) made `cited ⇒ fetched` a delivery *downgrade and strip* rather than a rejection. That ruling
assumed research tools that work.

On 2026-09-30 a paid Quick/Base Review on prod ran all phases and delivered as `completed`. Its dossier opens: "no
`web_search` tool existed, and every `web_fetch` call was refused."
- The result was 16/16 claims Unverifiable, 0 verified.
- The planted factual error was caught only as recollection, and the user was charged.
- The run's authored policy enabled search (`authorWebToolPolicy`: `search:true`, budget ≥ 8), and a 2026-09-26
  Memo review verified 2/5 claims.

The likely cause is PRB.22's run-wide research budget, enforced at the proxy (`handler.ts` ~350–371): an exhausted
kind is dropped from `tools[]`, so earlier phases or subagents can starve verification. RES.1 confirms or refutes
this. Separately, Path B has no rule for the case where *no* research happened.

## Decision

Per REQ-SPEC-31:
1. **Preflight (RES.1).** Before the first research-bearing phase, the harness probes every model × server-tool
   pair the run will use (including research subagents, e.g. the Haiku tier) through the run's proxy. A failed
   preflight fails the run before any debit, with a platform-fault reason and an ops alert.
2. **Research floor (RES.1).** The run's research budget reserves verification's share; earlier phases and
   subagents cannot exhaust it. ECON.2 may cut research only above this floor.
3. **Zero-coverage delivery is *Unverified* (RES.2).** The trigger is coverage, not the run-wide fetch count: no
   checkable (Tier-1/Tier-2) claim has a successfully fetched source, while the inventory holds at least one.
   - The run delivers what it has, labelled *Unverified* above the verdict on the card, the dossier and the email.
   - Its verification and discourse debits are refunded as a **platform-fault refund**. This is a new class, carved
     out of REQ-SPEC-24(6)'s failed-run-only rule and never counted toward a user refund limit. A later
     re-verification is a new, normally-debited run.
   - An ops alert fires, and the run never counts as a success for SLOs, cohorts or claims.
   - A trial entitlement consumed by such a run is restored.
4. **Vocabulary.** *Unverified* is reserved in Appendix D.2 as a run-level label, distinct from the frozen claim
   verdict `unverifiable`.
5. **REQ-VIS-9 is reconciled.** Its "fails delivery validation" is read through Path B. Path B stands for partial
   gaps.

## Consequences

- A research outage costs the platform the research phases rather than silently costing users, and it is visible
  within one run.
- The preflight adds one small probe per research-bearing run (bounded, metered, and part of the run's cost).
- The refund class is the ledger's first platform-fault caller. DEF.4's user refund window reuses the plumbing
  under different limits.

## Alternatives considered

- **Fail the whole run closed and refund everything.** Discards a useful letter.
- **Keep Path B as is.** Charges for a missing core act.
- **Label without a refund.** Contrary to §14.4's refund-on-failure principle (REQ-IDE-18).
- **A run-wide zero-fetch trigger.** Misses the observed failure mode, in which other phases fetch while
  verification gets nothing.

## Revisit trigger

- More than 1% of Reviews in a week deliver *Unverified*.
- A provider web-tool change needs a different preflight.
- The operator rules that zero-coverage runs must fail closed.

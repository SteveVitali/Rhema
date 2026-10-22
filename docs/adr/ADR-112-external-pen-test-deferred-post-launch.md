# ADR-112: The external pen test moves after launch; a pre-launch adversarial security review gates the launch instead

- **Status:** Accepted
- **Date:** 2026-10-20
- **Ticket:** round-6 planning (operator ruling `GD-PEN.R6b`, superseding `GD-PEN.R6` — LEDGER § GATE
  DECISIONS ### Round 6)
- **Requirement ids:** REQ-SPEC-25, REQ-ARCH-21 (amended), REQ-ARCH-25/26/27, REQ-SPEC-30; P1.22's
  "criticals are launch-blocking" rule
- **Spec:** rhema-design-spec §12.8, §13.3, §17 (Phase-1 security row); `docs/security/pen-test-scope.md`

## Context

P1.22 made the external pen test a launch prerequisite: criticals are launch-blocking. The scope
doc, vendor package and triage runbook exist (`docs/security/`). The engagement has never been
procured (D-P1.22-3, BL-35). On 2026-10-20 the operator first ruled it launch-blocking (`GD-PEN.R6`,
"Block on criticals"), then reconsidered the same day. The vendor timeline (procure → test → report →
fix) would likely be the longest pole of the launch round.

Two facts weigh against launching on the deterministic suite alone:

- **Real cross-tenant leaks shipped.** `/voices`, the dossier GET and the chat/outline project
  lookup served cross-tenant from 2026-09-17 to 2026-10-01 (`docs/security/rls-exposure-since-0026.md`).
- **The 3,496-test suite did not catch them.** A browser-driven review did (ADR-013).

## Decision

Operator ruling 2026-10-20, **"Defer + agent review"**:

1. The **external pen test becomes a dated post-launch obligation.** The engagement must be complete
   **≤ 60 days after launch**, with criticals/highs hotfixed under the standard triage runbook. Owner:
   the operator (procurement). Trigger: launch date + 60 d.
2. A **pre-launch adversarial security review** is added to round 6 as an in-round ticket and
   **gates the launch:** zero open criticals/highs.
   - **Focus:** tenancy and authorization on every user-serving route (BFF twins, signed-URL minting,
     export/import, billing), the §12.8 injection controls on the live surface, the usercontent and
     cookie posture, and the money paths (purchase, refund, trial, metered settle).
   - **Method:** read the code against the controls list in `pen-test-scope.md`, then probe live on
     the deployed tip with `is_test` tenants (two-tenant probe extensions, planted fixtures).
   - **Findings** are classified with the pen-test triage runbook's severity scale.
3. **Honesty clause:** the review is **not independent.** It is the same model family that wrote the
   code. Launch copy and the security posture page make no claim of third-party testing until the
   external engagement reports.

## Consequences

- **Positive:** the launch no longer waits on a vendor's calendar. The pre-launch review targets the
  exact defect class that already shipped once. The external test still happens, on a fixed clock.
- **Negative / accepted:**
  - For up to 60 days the public product runs without independent security testing.
  - An agent review can share blind spots with the code it reviews.
  - A critical the external test finds after launch is a live-incident hotfix, not a pre-launch fix.
  - The `GATE-LAUNCH` threshold changes from "pen test zero open criticals/highs" to "adversarial
    review zero open criticals/highs".

## Alternatives considered

- **Keep the external test launch-blocking** (`GD-PEN.R6`): superseded by the operator. It is the
  strongest assurance, and the launch date becomes the vendor's.
- **Defer with no substitute:** rejected. The deterministic suite demonstrably missed shipped leaks.
- **An agent review as a permanent replacement:** rejected. It is not independent.

## Revisit trigger

- The external engagement is not complete at launch + 60 d. The obligation escalates to the operator
  as an overdue launch condition.
- The external test finds a critical/high in a class the agent review covered. The review method is
  revised before it is relied on again.
- Any confirmed cross-tenant read on prod after launch. Treated as a breach under the
  `GD-EXPOSURE.R6` rule, and the external test is expedited.

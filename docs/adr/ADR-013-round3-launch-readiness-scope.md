# ADR-013: Round 3 — a launch-readiness round built on the unmerged chain tip

- **Status:** Accepted
- **Date:** 2026-09-30
- **Ticket:** decompose-spec plan extension, round 3 (59 SEC.1 … 93 DOC.2; 85a HUMAN-H7)
- **Requirement ids:** REQ-SPEC-29, REQ-SPEC-30, REQ-SPEC-31, REQ-SPEC-32 (new); REQ-SPEC-8, REQ-IDE-13,
  REQ-SPEC-1, REQ-GROWTH-1 (amended); REQ-EVAL-15/16/19 (standing, unchanged)
- **Spec:** rhema-design-spec status line; §13.5, §14; Appendix A.9 (2026-09-30 note)

> **Amended 2026-09-30 (operator, same day):** D6's envelope is revised to **hard ≤ $200, target ≤ $100** of metered
> spend (infra included), with per-ticket caps lowered to match; the weekly paid journey is ≤ $5. The orchestrator
> pauses the chain when round-3 cumulative metered spend reaches $100 and never starts a leg that could pass $200.
> Recorded in LEDGER GATE DECISIONS (D6 revised) and the planning ledger's Budget note.

## Context

Rounds 1–2 executed the whole chain: the 50 original rows, the prod-launch inserts, the full IDE, the
CAPSTONE/RCN.1 ledger rows, STB.1–4 and DEF.1–3. PRs #1–#47 are merged; #48–#80 are open and stacked, and prod
runs code from those unmerged branches.

On 2026-09-30 a browser-driven review of rhema.tools (`docs/build/reports/2026-09-30_prod-design-review.md`) found
the product broken at almost every load-bearing step a new user takes:
- a live cross-tenant read on `/voices`
- dossiers returning 500
- no edit path
- no working purchase path
- the promised free first review absent
- a paid Review whose fact-check performed no web research

None of these were visible to the 3,496-test suite, the CAPSTONE, or the STB legs, because nothing walked the
product as a user. The standard v2 tail (CAP/GATE-ACCEPT/REC/DOC) had also never run.

## Decision

Round 3 is a **launch-readiness round**, not a feature round. It makes the shipped product true, reachable and
sellable, then runs the standard tail properly. The consolidated owed work is `docs/build/BACKLOG.csv` (65 rows,
every source in exactly one row); the partition is `docs/build/planning/2026-09-30_planning-ledger.md`.

Operator decisions, recorded 2026-09-30:
- **D1: no merge.** Round 3 stacks on the latest chain tip `stevevitali/stb-4-real-money-external`. REC.3 writes
  the integration plan; the operator merges later.
- **D2: security and hotfixes are chain tickets.** SEC.1 and HOT.1 are the first rows, driven downstream by
  orchestrate-build; nothing is fixed out-of-band.
- **D7: build-memory hygiene** is an early row (MAINT.2).
- **Feedback:** the operator's own product feedback is skipped this round; the agentic review stands in.

Delegated to Claude's judgment and recorded here:
- **D3:** pricing (ADR-014). The operator's instruction was to keep the free trial review.
- **D4:** research integrity (ADR-015).
- **D5: G2/H2 stay deferred.** They are not scheduled. G2 remains the HARD gate before §16.4 claims and any
  public launch, and the REQ-EVAL-19 launch-surface lint continues to enforce "no superiority claim".
- **D6: spend envelope.** At most $300 of live inference across the round, within per-ticket caps, plus a weekly
  paid journey run of at most $10.

**D6 standing authorization for downstream workers** (tightened after the Phase-4 review). Dollar caps are
measured on proxy-metered cost.

*Pre-authorized:*
- inference within a ticket's cap
- `pulumi up prod` of a chain-tip SHA whose preview shows zero replace or delete on stateful resources, whose
  migrations pass an additive-migration lint (no DROP, rename, type-narrowing, table rewrite or role change), and
  whose monthly cost delta is ≤ $15
- IaC-generated secrets for new roles only (never a rotation)
- OPS.1 creating and destroying its own `pr-<n>` stacks (never `prod`)
- the weekly paid journey run (≤ $10, ≤ 300 words), whose authorization ends when round 3 closes

*Still pauses for the operator:*
- real-money charges
- creating or rotating any third-party credential
- destroying or replacing stateful resources
- DNS changes
- `signup.mode` flips
- cost deltas > $15/month
- database role changes
- one-off prod data writes
- changes to what users are charged (the metered-debit flip, the trial going live, re-opening purchase)
- creating Stripe live-mode products, prices or webhooks
- any ADR that relaxes a spec target
- any Gate-status item

Two process invariants enter the manifest because their absence is what let round 2 ship broken: browser-journey
acceptance (REQ-SPEC-29, ADR-016) and tenant isolation in depth (REQ-SPEC-30, ADR-017).

## Consequences

- Prod keeps running unmerged code until the operator merges. Every round-3 ticket's close records deployed
  provenance against its chain-tip SHA (REQ-SPEC-29), so the eventual merge can be checked tree-for-tree.
- The standing authorization lets orchestrate-build run round 3 in `checkpoint` mode without pausing at every
  $0 deploy, but it widens what an unattended worker may do on prod. The pause list is the guard.
- No UI or marketing claim about efficacy ships this round (G2 deferred), so round 3 cannot produce "launch" in
  the §17 sense. It produces a product that is honest and working for the users who arrive anyway.
- The chain grows by 37 rows: one HUMAN marker, 27 implement-spec tickets (after the Phase-4 review's splits), and
  the 9-row tail (GATE-ACCEPT among them).

## Alternatives considered

- **Out-of-band hotfix first, then plan.** This was the faster route to harm reduction, and the operator
  declined it in favour of a single orchestrated path.
- **Merge #48–#80 first.** That is cleaner provenance, but the operator reserved merging for later.
- **A feature round (1.x items).** Rejected: every 1.x surface would inherit the broken journey and the
  money/research truthfulness gaps.

## Revisit trigger

- The operator merges the stack, which changes D1's base.
- H2 is funded, which reopens D5.
- Round-3 live spend reaches $100 (the pause) or $200 (the hard stop) with rows remaining, which reopens D6.
- A downstream worker's action under the standing authorization causes a prod incident, which narrows the
  authorization.

# ADR-071: the §14.4 refund window — one automatic refund per account per UTC calendar quarter; every refundable state is terminal

- **Status:** Accepted
- **Date:** 2026-10-03
- **Ticket:** DEF.4
- **Requirement ids:** REQ-SPEC-24, REQ-SPEC-30, REQ-SPEC-32, REQ-IDE-18, REQ-DATA-34, REQ-BILL-3
- **Spec:** §14.4 (fairness rules; the accounting table), §12.4 (stop/resume), §14.6

## Context
§14.4 grants a user refund window — "completed-run refunds have a 7-day window, one per quarter
without review" — beside REQ-SPEC-24(6)'s rule that refunds outside a platform fault apply
"otherwise only on failed runs". The ticket needed the concrete rule: which states qualify, what
"a quarter" means and against what scope, whether a refunded run may resume (the re-debit
requirement), how review escalation works, and how the user class stays disjoint from RES.2's
`platform_fault:*` refunds.

## Decision
- **Eligible states:** `completed`, `completed_partial`, `cancelled` — delivered runs and
  stopped-with-partials runs. `failed` is deliberately excluded: a failure settles through the
  platform's own refund classes (`platform_fault:*`, the failed-run refund) and never consumes the
  user's allowance. The 7-day window anchors on `runs.ended_at` (the real terminal timestamp —
  `finished_at` does not exist). Entitlement-covered runs and runs with no outstanding committed
  debit are ineligible.
- **Allowance:** one *automatic* refund per billing account per **UTC calendar quarter**
  (`YYYYQn`), counted only over durable `user_refund_requests.state='refunded'` rows. A second
  eligible request lands `pending_review` — no money moves — and pages ops via the stranded
  sweep's send-then-mark leg; the operator verb (`refund-review --approve|--deny`) decides it.
  Approval runs the identical refund episode (`refundPhases` + `cost.refunded`, episode key
  `user-refund:<runId>`); denial closes the row without a refund.
- **Resume:** discharged by construction. Every refundable state is terminal — `resumePausedRun`
  admits only `waiting_gate` — so a user-refunded run provably cannot resume and
  REQ-SPEC-24(6)'s "re-debit refunded phases first" can never be owed. `reDebitOnResume` remains
  the guard for the states that can resume.
- **Class disjointness:** user refunds write `reason='user_window'`; the allowance reads only the
  request table, so a platform-fault refund on the same account leaves the quarter's allowance
  untouched. The report's `refundWindow` block derives from ledger state, not `runs.spent_credits`.
- **Posture:** the feature ships flag-off (`REFUND_WINDOW_MODE=off` fails closed);
  `test_tenants` admits JOURNEY.1 `is_test` workspaces for the Stage-B evidence leg.

## Consequences
The user-facing refund path rides the existing `refundPhases` plumbing — no second refund code
path exists. The durable request row is simultaneously the audit, the replay anchor
(`unique(run_id)`), the allowance counter, and the review queue. A denied or pending request
consumes no allowance; an approval that finds nothing left to refund closes honestly instead of
recording a zero-credit grant. Refunding a `cancelled` run is safe only because cancelled is
terminal in this state machine — the claim is structural, not a convention.

## Alternatives considered
- **Rolling 30/90-day window instead of calendar quarter:** harder to explain, harder to index,
  and the spec says "per quarter" — calendar quarters are the honest reading and the indexed
  count is trivial.
- **Make refunded runs resumable with a user-refund re-debit:** a bigger change (state-machine
  edge out of terminal states) for a case the product ruling didn't ask for; the narrower
  invariant — refundable ⇒ terminal — is provable and keeps REQ-SPEC-24(6) intact by
  construction rather than by a second mechanism.
- **Count refunds from `credit_ledger` rows:** inferred state (a refund row proves money moved,
  not that a *request* was granted); the durable request table keeps the decision audit,
  review state, and allowance in one place — the RES.2 `trial_restorations` precedent.
- **A new table per request vs widening `admin_actions.action`:** the additive-migration gate
  makes CHECK-vocabulary widening a drop/re-add; a dedicated table carries richer per-request
  state (quarter, credits, review fields) without touching the admin vocabulary.

## Revisit trigger
A product ruling that lets a user-refunded run resume — then REQ-SPEC-24(6)'s re-debit path must
become real for the `user_window` class (today it is discharged by the terminal-state
invariant), and this ADR is superseded. Also revisit if the allowance should scope per
workspace or per user rather than per billing account.

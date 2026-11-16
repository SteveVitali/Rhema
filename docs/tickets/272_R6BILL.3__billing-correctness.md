# 272_R6BILL.3 — billing-correctness

**Status:** open · **Phase:** handoff inserts (mode=extend) · **Prereqs:** merged `main`; order per the handoff (266 first, then 267; billing items ahead of non-defect rows; 274 is a HUMAN row) · **Size:** M · **Origin:** operator handoff 2026-11-15 (`rhema-boilerplate-findings-handoff/findings-note.md`), findings re-verified at tip by the read-only pass — verdicts recorded in `docs/build/runs/rh-verify.md`.

## Scope (verified findings — the note's "agent-reported" items are re-confirmed in the verify run)

RH-11 webhook stranding (sweep on `processed_at is null`); RH-12 period tick honoring `cancel_at_period_end` (it actively writes `false` + grants — worse than audited); RH-13 portal carve-out for paying customers under `purchase_closed`; RH-14 `subscription.deleted` unresolvable → unprocessed not processed; RH-15 invoice period ≠ subscription period; RH-16 unverified request email → `customer_email`; RH-2 residual arm: `syncSubscription` tier from `metadata.plan` only — verify + fix Portal-side mapping

Every fix carries its own regression that fails pre-fix where a code test applies. Read the findings note's cited lines; treat each as a hypothesis — if code disagrees, STOP and report, don't deviate silently.

## Verify

Focused tests + `pnpm turbo build` on touched pkgs + typecheck/lint; `docs/build/runs/272_R6BILL.3.md` + `docs/build/pr/272_R6BILL.3.md`; DEFERRALS/BACKLOG rows named by the findings; BUILD_INDEX + LEDGER lines; `gh pr create --base main`; `ci-boundary.sh --pr`; `check-append-only --base origin/main`; `check-build-memory` (inherited classes — not yours). Never merge; $0 unless the ticket names a read-only prod check; secrets/user data never in records.

# 268_R6BILL.1 — stripe-version-basil

**Status:** open · **Phase:** handoff inserts (mode=extend) · **Prereqs:** merged `main`; order per the handoff (266 first, then 267; billing items ahead of non-defect rows; 274 is a HUMAN row) · **Size:** M · **Origin:** operator handoff 2026-11-15 (`rhema-boilerplate-findings-handoff/findings-note.md`), findings re-verified at tip by the read-only pass — verdicts recorded in `docs/build/runs/rh-verify.md`.

## Scope (verified findings — the note's "agent-reported" items are re-confirmed in the verify run)

RH-9 + RH-7: pin `Stripe-Version` + read post-basil field paths (`invoice.subscription`, `current_period_*`, `items[].plan.interval`); webhook `created` ordering guard + `livemode` check; FIRST do the read-only endpoint `api_version` + account-default check and report — renewals ~2026-11-28

Every fix carries its own regression that fails pre-fix where a code test applies. Read the findings note's cited lines; treat each as a hypothesis — if code disagrees, STOP and report, don't deviate silently.

## Verify

Focused tests + `pnpm turbo build` on touched pkgs + typecheck/lint; `docs/build/runs/268_R6BILL.1.md` + `docs/build/pr/268_R6BILL.1.md`; DEFERRALS/BACKLOG rows named by the findings; BUILD_INDEX + LEDGER lines; `gh pr create --base main`; `ci-boundary.sh --pr`; `check-append-only --base origin/main`; `check-build-memory` (inherited classes — not yours). Never merge; $0 unless the ticket names a read-only prod check; secrets/user data never in records.

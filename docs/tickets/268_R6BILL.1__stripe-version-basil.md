# 268_R6BILL.1 — stripe-version-basil

**Status:** open · **Phase:** handoff inserts (mode=extend) · **Prereqs:** merged `main`; order per the handoff (266 first, then 267; billing items ahead of non-defect rows; 274 is a HUMAN row) · **Size:** M · **Origin:** operator handoff 2026-11-15 (`rhema-boilerplate-findings-handoff/findings-note.md`), findings re-verified at tip by the read-only pass — verdicts recorded in `docs/build/runs/rh-verify.md`.

## Scope (verified findings — the note's "agent-reported" items are re-confirmed in the verify run)

RH-9 + RH-7: pin `Stripe-Version` + read post-basil field paths (`invoice.subscription`, `current_period_*`, `items[].plan.interval`); webhook `created` ordering guard + `livemode` check; FIRST do the read-only check and report BEFORE any code change (the handoff's RH-9 addendum, verbatim evidence):
- `stripe webhook_endpoints retrieve we_1UH99C2MLe3ETP9Sk4UQBKXs --live` (command already in `docs/ops/stripe-webhook-endpoint.md:65`) — read `api_version`; fallback: Dashboard → Developers → Webhooks → endpoint → "API version" (operator act if CLI creds unavailable).
- The endpoint + every API call uses the ACCOUNT DEFAULT version (no `api_version` recorded at creation, no `Stripe-Version` header sent).
- **First exposure = first live renewal of the 2026-10-27 Writer subscription, ~2026-11-27** (endpoint gained `invoice.*` events only 2026-10-28, so no `invoice.paid` has ever been delivered).
- If `basil` or later → fix + expedited operator-gated deploy BEFORE ~2026-11-27: read `invoice.parent.subscription_details.subscription` + `subscription.items.data[].current_period_*` with old-path fallback, pin `Stripe-Version` on every request, one fixture per payload shape.
- If older → nothing breaks today but still pin `Stripe-Version` (an account upgrade can't silently switch shape).

Every fix carries its own regression that fails pre-fix where a code test applies. Read the findings note's cited lines; treat each as a hypothesis — if code disagrees, STOP and report, don't deviate silently.

## Verify

Focused tests + `pnpm turbo build` on touched pkgs + typecheck/lint; `docs/build/runs/268_R6BILL.1.md` + `docs/build/pr/268_R6BILL.1.md`; DEFERRALS/BACKLOG rows named by the findings; BUILD_INDEX + LEDGER lines; `gh pr create --base main`; `ci-boundary.sh --pr`; `check-append-only --base origin/main`; `check-build-memory` (inherited classes — not yours). Never merge; $0 unless the ticket names a read-only prod check; secrets/user data never in records.

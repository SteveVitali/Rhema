# DEF.4 — Ledger integrity closeout + the §14.4 user refund window

Ticket: `docs/tickets/78_DEF.4__ledger-integrity-refund-window.md` · run ledger: `docs/build/runs/DEF.4.md`
Stacks on `stevevitali/ux-2-layout-responsive` (PR #99, `OPERATOR` merge policy).
**DO NOT MERGE.**

## Summary

> Money paths now do what §14.4 says. The balance-repair path runs under the
> `held >= 0` constraint with no manual DDL (the DEF.2 F4 defect, closed as
> D-DEF.2-1), fresh environments validate the same constraint production
> convalidated, a guided retry's feedback finally reaches the scoped second
> read, and `refundPhases` gains its first user-facing caller: a seven-day
> refund window on completed/partial/cancelled runs — one automatic refund per
> billing account per UTC calendar quarter, a review path for the second
> request, refund classes that never mix with `platform_fault:*`, and a flag
> that ships **off** (`REFUND_WINDOW_MODE`, fail-closed).

- **Reconcile write-order (ADR-072).** `reconcileBalances` step 1 appends the
  backfill holds as plain ledger inserts — `applyLedgerEntry`'s incremental
  counter maintenance is bypassed, because its `held +=` wrote an illegal
  intermediate on a negative fold (prod's −897 → −717). Step 2 writes each
  counter ONCE at the post-backfill fold. A regression test plants the exact F4
  shape under the re-added ACTIVE check and applies with no manual DDL; re-apply
  is a clean no-op.
- **Fresh-env parity.** Migration `0055` `validate constraint
  credit_balances_held_nonnegative` so every fresh database ends in the same
  VALIDATED state production reached by hand, and creates
  `user_refund_requests` (FORCE RLS; the user role gets SELECT+INSERT only —
  review transitions stay on the system pool; `alerted_at` is the send-then-mark
  page; the allowance index covers `(billing_account_id, quarter)` on refunded
  rows).
- **Scoped retry guidance (ADR-073).** The guided retry's predicate-failure
  text now reaches the scoped second read — appended to `query.prompt` in the
  tmpfs spec file, the only channel REQ-DATA-17 allows. The mount set stays
  exactly `files`; the text never lands in an event payload; standing
  `inputs.guidance` never crosses.
- **The §14.4 refund window (ADR-071).** `POST /runs/:id/refund` on the user
  pool: `completed`/`completed_partial`/`cancelled` runs inside 7 days of
  `ended_at`, not entitlement-covered, with committed debits outstanding —
  every committed phase refunded through `refundPhases` under
  `reason='user_window'` + one `cost.refunded` event + the durable request row
  (`unique(run_id)` makes replays verdict-repeats, never double-refunds). The
  first eligible request per billing account per UTC quarter auto-refunds; a
  second lands `pending_review` (202) and the stranded sweep's new leg G pages
  ops once (send-then-mark). `admin-cli refund-review --approve|--deny` decides
  on the system pool — approval runs the identical refund episode. `failed`
  runs and `platform_fault:*` refunds never touch the user allowance. Every
  refundable state is terminal, so REQ-SPEC-24(6)'s re-debit rule is discharged
  by construction.
- **Surfaces.** The report's `refundWindow` block is ledger-derived and appears
  ONLY while the flag admits the workspace; the web report renders the CTA on
  `eligible` and honest status lines otherwise; the plain-form POST re-reads the
  report on every outcome. The deterministic two-tenant probe now probes the
  write route — own run refunds, foreign run rejected, zero marker leaks.
- **Flag posture.** `REFUND_WINDOW_MODE`: `off` (default/unset/unknown ⇒
  `refund_closed` 403 + no affordance anywhere), `test_tenants` (server-set
  `is_test` workspaces — the JOURNEY.1 evidence posture), `open`. Prod ships
  `off`; go-live awaits the product ruling (D-DEF.4-3).
- **Journey R9** (red, paid, DEF.4): the delivered report's control → "Refunded
  N cr." + exact spendable movement → a second request "sent for review" moving
  nothing. Flips green on the Stage-B deploy evidence (≤$3).

## Verification

- **Deterministic:** `turbo build lint typecheck` **135/135** · `pnpm test`
  **433 files / 4,312 pass / 6 skip** · `check-additive-migrations` 0055 pass ·
  `check-build-memory` 0 violations.
- **New coverage:** refund-window domain 11/11 · api refund routes 7 (flag
  modes, refund/ledger/event/request-row, report block, pending-review +
  replay, ineligible classes, 401/404/409) · admin-cli refund-review · sweep
  leg G (send-then-mark, no re-page on decided rows, sink-failure retries) ·
  web report affordance · reconcile F4 regression under the ACTIVE check ·
  scoped-guidance prompt tests · R9 registry wiring · two-tenant refund-write
  probe.

## Deferrals

Closed: **D-DEF.2-1** (the reconcile defect — the deterministic fix this row
asked for), **D-P0.15d-2** (`refundPhases` live caller — the §14.4 path,
including the cancel-with-partials half via `cancelled` eligibility).
Opened: **D-DEF.4-1** (Stage-B deploy + R9 leg, ≤$3, operator-gated),
**D-DEF.4-2** (prod read-only checks — convalidated constraint, divergence
re-check, leg-G wiring), **D-DEF.4-3** (prod go-live ruling — flag stays off).

## Notes

- Stage B is operator-gated (ADR-013 path): deploy + R9 + the read-only prod
  checks ride D-DEF.4-1/-2; nothing in this PR moves money paths on prod — the
  feature ships flag-off.
- Pre-existing probe noise noted: three detail routes log `unlogged_5xx_response`
  on foreign-id probes (not a leak — the probe passed); a 404/403 hardening
  candidate for a follow-up.

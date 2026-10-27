# R6FIX.3 — F-R6DEP3-1 meter-race triage/fix + residual legs

**Branch `bug` — fix verdict: product-side committed-meter bug (fixed), not a
harness artifact — spend $0.**

## What this does

- **Triaged F-R6DEP3-1 against real prod rows** (canary
  `01M5Y4YQP827TCBXZHHV3AV4NC`, report Σ debits 505 cr vs card meter 502 cr):
  every `credit_ledger` debit landed BEFORE finalize (claim-floor arm of
  `incrementalMeteredDebit` — ECON.1 D-F semantics, the committed claim IS the
  charge), every `usage_records` proxy row landed BEFORE finalize (no late
  flush), zero refunds. The 505 charge is correct committed-mode billing; the
  defect is that `reconcileRunSpend` never looked at the ledger — the committed
  meter under-reported what was debited.
- **Fix:** `reconcileRunSpend` folds `netDebitedCredits` (Σ debit − Σ refund)
  into the monotone `greatest()` write — the terminal committed figure (run
  card, `cost.final`, every `spent_credits` read) now converges to the charge.
  Net-of-refund keeps a failed run's absorbed burn (not its refunded charge) as
  the floor. `packages/orchestrator/src/spend.ts`.
- **Tests:** 4 deterministic PGlite legs in `spend.test.ts` — the canary's exact
  shape (claims 464 / metered 502 / debited 505 → 505), refund netting, absorb
  rows never counting as debits, and a debit written inside the same tx being
  visible to the fold.
- **Residual legs live, $0 (jrn-a is_test):**
  - D-P1.20-1 **(c)** `admin support-access` — refusal arm (no grant → refused,
    zero rows) + grant arm (dual-write `support_access_log` + `admin_actions`).
  - D-P1.20-1 **(d)** export zip end-to-end (POST → worker → ready → session
    download → 58 KB zip, `reports/2026-10-27_R6FIX.3/account-export.zip`).
  - D-P1.20-1 **(f)** protocol-marker arm — `protocol_changed_at` stamped +
    `protocol_version` pinned on PUT (consume/clear arm owed: needs a paid
    Review launch).
  - **D-PRB.04-2 discharged** — 18 `data-obligation-state="open"` chips rendered
    on the canary's own-tenant dossier (`obligation-chips.png`); row's last
    residual.

## What it does not do

- **Does not merge or deploy.** The paid canary re-drive was refused by the
  REQ-ECON-9 weekly guard ($3.87 metered + $4.5 cap > $5 — honest stop, $0); a
  deployed re-proof (R6 leg going green end-to-end) rides the next DEP ticket.
  Agreement proven meanwhile: corrected formula over the real canary rows =
  505, the exact charged figure; the report's `committed` difference row
  already explains charged>metered.
- The `incrementalMeteredDebit` claim-floor charge itself is unchanged —
  whether 505-vs-502 over-debit should exist at all is the operator's
  metered-mode flip (ECON.1/R6MNY.1), not this ticket.

## Verify

`turbo build lint typecheck` 135/135 · vitest orchestrator+worker 633/633 ·
`check-build-memory` 0 violations · append-only vs `c1f20f5` OK · records:
`runs/R6FIX.3.md` + BUILD_INDEX 229 + LEDGER + DEFERRALS tails (D-P1.20-1,
D-PRB.04-2→DONE) + GATE-LAUNCH note · **spend $0** · `nextTicket` stays
`196a_HUMAN-H12` · mergePolicy OPERATOR — unmerged.

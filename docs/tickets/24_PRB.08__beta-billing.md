# PRB.08 — Beta billing: house credits, Stripe Payment Links, refunds, reconciliation

- **Sequence:** 24 of 50
- **Phase:** RB — Review beta
- **base_branch:** current checkout (stacked PR chain)
- **Depends on:** P0.11 (ledger ops), P0.07 (proxy rows), PRB.03 (sheet)
- **Run:** `implement-spec spec=docs/tickets/24_PRB.08__beta-billing.md`

## Goal
Real money at beta fidelity (REQ-BETA-14/15): operator-granted house credits via an admin CLI as
ordinary ledger grants, Stripe Payment Links as the one real-money channel at credit exhaustion,
refund surfacing, the nightly provider reconciliation job, and the behavioral-WTP instrumentation.

## Load
- Spec §17 beta row ("billing core in full — ledger, holds, caps, proxy metering, estimator,
  refunds — with operator-granted house credits and Stripe Payment Links as the one real-money
  channel"), REQ-BETA-14 (house credits $150–300 COGS-equivalent; every run through the real sheet),
  REQ-BETA-15 (purchases at exhaustion; final-month beta-priced plan offer at the Writer anchor;
  conversion as a gate metric), REQ-BETA-12 (`wtp.recorded`, `credits.exhausted_prompt`), §14.6
  (webhook discipline: verify → `stripe_events` unique id → enqueue → 200; failure states that
  apply at beta), §12.7 cross-check 2 / REQ-BILL-13 (nightly reconciliation, user-favourable-only,
  >2% drift alert), REQ-SPEC-24.7 (chargeback handling).

## In scope — deliverables
1. **Admin CLI** (operator-only): grant/void house credits per account as ordinary `grant` ledger
   rows with a `promo`-class bucket and expiry; grants audited.
2. **Stripe Payment Links:** top-up purchase at exhaustion; webhook intake per §14.6 discipline;
   `grant(topup)`; the exhaustion prompt UI with `credits.exhausted_prompt{action_taken}`;
   final-month beta plan offer surface (copy + link; no subscription machinery — that is P1.16).
3. **Refund surfacing:** failed/refused/cancelled run refunds visible on the run row ("refunded 312
   credits; partial results kept"); the three no-start sentences already on the sheet (PRB.03).
4. **Nightly reconciliation:** `usage.reconcile` matches provider Usage & Cost reports by request
   id, writes `provider_report` rows, adjusts only in the user's favour, alerts >2% drift,
   recalibrates the estimator inputs (REQ-BILL-13; REQ-ARCH-35).
5. **Chargeback path** (REQ-SPEC-24.7): suspend + clawback semantics wired to Stripe events.
6. **WTP events:** `wtp.recorded{source, amount}` from interviews (manual entry surface) and
   purchases (REQ-BETA-12).

## Out of scope
- Plans/subscriptions/Checkout/Portal/trial entitlement/usage dashboards (P1.16; usage level 0–1
  chips at beta come from PRB.12's dashboard needs — keep a balance chip here).
- Auto-reload (P1.16; opt-in machinery not offered at beta).

## Acceptance criteria
- [ ] House-credit grant via CLI → spendable balance; every beta run holds/debits through the real
      sheet + ledger path (REQ-BETA-14 ledger audit). *(deterministic)*
- [ ] Payment Link purchase (test mode) → webhook → idempotent `grant(topup)`; replayed webhook id
      is a no-op (§14.6). *(deterministic)*
- [ ] Exhaustion: a run whose cap exceeds spendable shows the resolution panel with the Payment
      Link; `credits.exhausted_prompt` fires with the action taken. *(deterministic)*
- [ ] Reconciliation fixture with a planted 3% drift: user-favourable adjustment written, alert
      raised (REQ-BILL-13). *(deterministic)*
- [ ] Chargeback fixture: account suspended; queued/parked runs cancelled with release; delivery
      withheld until non-negative (REQ-SPEC-24.7). *(deterministic)*

## Requirement IDs to satisfy and stamp in the PR
REQ-BETA-14, REQ-BETA-15, REQ-BETA-12, REQ-BILL-13, REQ-ARCH-35 (amended), REQ-SPEC-24 (item 7),
§14.6 webhook discipline.

## Cross-cutting invariants — re-check before opening the PR
- Never silent billing; a card is charged only by an explicit purchase (REQ-BILL-17's rule — no
  auto-reload exists at beta).
- Conversion is a *gate metric*, not a growth lever: no upsell surfaces beyond the two named ones
  (REQ-BETA-15/19).
- See 00_MANIFEST.md § Cross-cutting invariants.

## Notes
P1.16 replaces Payment Links with the full plan ladder and keeps this ticket's ledger paths,
webhook discipline, and reconciliation job unchanged.

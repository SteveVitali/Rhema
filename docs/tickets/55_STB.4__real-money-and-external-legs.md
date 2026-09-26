# STB.4 — Real-money + external legs

- **Sequence:** 55 · **Phase:** post-P1 closeout · **Tag:** ops
- **base_branch:** `main` (post-merge).
- **Depends on:** STB.1–STB.3 (a verified deployed platform) **and DEF.1–DEF.3** — the STB.3
  findings include delivery-blocking defects (F2 makes Memo reviews un-deliverable); spending real
  money over them is wrong. The operator's real-money call is a hard gate inside this ticket.
- **Scope (one line):** the legs that cost real money or external coordination — the live Stripe
  purchase round-trip, pen-test facilitation, and the Anthropic admin-key usage reconciliation.
- **Spec §§:** 14.2–14.6 (billing), 12.8 (security), 16.3 (open questions).
- **REQ coverage:** REQ-BILL-* live legs, D-P1.16-1, D-P1.22-3, D-PRB.08-1b.
- **Run:** `implement-spec spec=docs/tickets/55_STB.4__real-money-and-external-legs.md`
- **Gate status:** **operator hard gate** — real money and external procurement. Every leg below
  pauses for explicit operator approval at the point of spend.
- **Live stage:** this ticket IS the live work.

## Goal

Close the deferral rows that require real money or third parties — the last class of Stage B work.

## Legs

### Leg A — live Stripe billing round-trip (D-P1.16-1)

The deployed billing legs on a real payment instrument, **only on explicit operator go**:
- one Writer-month Checkout purchase (real card — the operator's call whether live or test-mode)
- one $10 top-up, auto-reload arm, Portal navigation, cancel path
- failed-invoice → grace → lapse → Free transition observation
- checkout-return delayed-webhook path
- live trial unlock leg + parked-run repricing leg
- **Cap: ≤$50 real money** (test-mode if the operator prefers — then the row stays PARTIAL with
  "test-mode only" recorded honestly).

### Leg B — pen-test facilitation (D-P1.22-3)

- The scope doc exists: `docs/security/pen-test-scope.md`.
- Operator procures the external test; this leg produces whatever the vendor needs
  (test account, scope letter, environment access) and files/triages findings back into tickets.
- The ticket's work ends at "findings triaged into the ledger"; remediation is follow-up tickets.

### Leg C — admin-key usage reconciliation (D-PRB.08-1b)

- The `anthropic-admin-key` secret exists; wire the real `AnthropicAdminReportSource` against the
  live Usage & Cost API and reconcile one window against `usage_records`/`credit_ledger`.
- $0 spend; needs the deployed worker.

## Acceptance

- **AC1** — Leg A closes D-P1.16-1 with real Stripe evidence (or PARTIAL test-mode with the reason
  recorded); Leg C closes D-PRB.08-1b with a reconciled window; Leg B leaves a triaged-findings
  artifact.
- **AC2** — no spend happens without the operator's explicit per-leg approval; the ticket stops
  at each gate rather than proceeding on inferred consent.
- **AC3** — every dollar reported; Stripe evidence cited by object id, never secrets.

## Verify

- Run ledger `docs/build/runs/STB.4.md` per-leg evidence; `check-build-memory.sh .` clean;
  LEDGER PHASE LOG + BUILD_INDEX row.

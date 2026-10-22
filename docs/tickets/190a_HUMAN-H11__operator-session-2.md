# HUMAN-H11 — Operator session 2 (post-deploy: browser/money legs + approvals)

- **Kind:** human · **Phase:** round 6
- **Blocks:** 194_R6CNT.2 (essay pick + content approvals), 197a_GATE-LAUNCH (legal approval, the
  money legs, the exposure notice if any)
- **Owner:** operator   **Scheduled:** after 186_R6DEP.1 lands; approvals once 180_R6LGL.1,
  182a_R6FOR.2 and 183_R6CNT.1 have delivered (target: before GATE-R6B)
- **Withheld until done:** each blocked ticket defers the named leg with "H11 pending"
- **Deferrals so far:** 0
- **Readout:** `docs/build/readouts/HUMAN-H11.md`

> **Operator work — NOT an `implement-spec` input.** Real-device, real-money and approval acts
> only the operator can do. Accounts used are `is_test`-flagged (the purchase allowlist).

## Checklist — browser / money legs
- [ ] Google sign-in interactive round-trip + 409 merge + revoked-grant (D-MAINT.4-1)
- [ ] Stripe **live** round-trip on a flagged tenant: hosted Checkout/Portal, 3DS/Radar, Tax
      (D-P1.16-1); real-money purchase → `grant(topup)` (D-BILL.3-1); Portal change-plan +
      pending-email (D-BILL.3-2)
- [ ] Safari/WebKit caret walking (D-EDIT.1-2); source-editor mode-switch + typed round-trip (D-PRB.07-1)
- [ ] Versions rail (D-P1.08-1); PUT override + standing note + dismiss + gate card (D-P1.09-1);
      settings walk on a throwaway account (D-P1.20-1); real-phone ~375–390 px legs (D-P1.19-2)
- [ ] EventSource live-feed chip on a live run (D-PRB.04-2 browser half)
- [ ] Leg-cap reconciliation (BL-69 item)

## Checklist — approvals
- [ ] Legal pages (R6LGL.1): placeholders filled (entity, jurisdiction, contact) and text approved
      verbatim → `approved: true` set by 194_R6CNT.2 from this readout's recorded words
- [ ] H4 venue stamps (R6CNT.1 (a)) approved
- [ ] Sample-dossier content (R6CNT.1 (c)) approved
- [ ] One public-domain Showcase essay picked (R6CNT.1 (b))
- [ ] Exposure notice text approved — **only if** R6FOR.2's verdict is yes (sent by 194_R6CNT.2)

## Exit criterion
Each item ticked in the readout with its date and evidence pointer. Approvals are recorded as the
operator's verbatim words.

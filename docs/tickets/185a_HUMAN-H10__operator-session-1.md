# HUMAN-H10 — Operator session 1 (acts only — start at ratification)

- **Kind:** human · **Phase:** round 6
- **Blocks:** 187_R6OPS.1 (alert sink), 189_R6POST.1 (invite consume), 190_R6POST.2 (`sk_test`),
  199_R6CLK.1 (billing actuals after the console flip; the admin-key reconcile)
- **Owner:** operator   **Scheduled:** at round-6 ratification (2026-10-20), parallel to rows 176–185
- **Withheld until done:** the claims each blocked ticket names — they defer that leg with "H10
  pending" rather than block
- **Deferrals so far:** 0
- **Readout:** `docs/build/readouts/HUMAN-H10.md`

> **Operator work — NOT an `implement-spec` input.** Every judgment call was ruled on 2026-10-20
> (LEDGER § GATE DECISIONS ### Round 6). This session is credentials and console acts only. Values
> never enter any ledger (`provided: yes/no`).

## Checklist
- [ ] D-OPS.2-1 — GCP console: `rhema-507501` → Billing export → enable the `rhema_cost_export` dataset
- [ ] Alert sink — bind a real operator channel (email/phone/webhook) to the prod notification
      channel used by `infra/pulumi/monitoring.ts` (REQ-DEP-2(d))
- [ ] Stripe **test-mode** secret seeded in nonprod Secret Manager for the Stripe-bearing preview
      stage (REQ-POST-6) — `provided: yes/no`
- [ ] `ANTHROPIC_ADMIN_KEY` seeded (D-ECON.1-1 / D-PRB.08-1) — `provided: yes/no`
- [ ] Invite mint for D-SEC.2-1 (the code handed to R6POST.1 out of band — never committed)
- [ ] *(Optional, post-launch clock — ADR-112)* start external pen-test procurement with
      `docs/security/pen-test-vendor-package.md`

## Exit criterion
Each item ticked in the readout with its date. Values are never recorded.

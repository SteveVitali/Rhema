# HUMAN-H8 — Round-5 operator session bundle (REQ-G1-5)

- **Kind:** human · **Phase:** round 5
- **Blocks:** 165_VERIF.2 (Resend seed), 164_COST.1 (posture ruling via H9 — see 163), 167_FUNDED.1 (window open via 166), merge sweep (BL-01 — gates BL-74 nightly-green close)
- **Owner:** operator   **Scheduled:** at operator convenience; V-2 and the funded window withhold until done
- **Withheld until done:** preview-leg evidence, funded-window execution, nightly-green provenance
- **Deferrals so far:** 0
- **Readout:** `docs/build/readouts/HUMAN-H8.md`

> **Operator work — NOT an `implement-spec` input.** Single-session prerequisite bundle per
> REQ-G1-5 (`docs/research/r5_g1_dispositions.md`). Code tickets proceed past open items only by
> opening D-rows that cite this row and name the claims they withhold.

## Checklist
- [ ] Merge sweep: bottom-up merge of the open stacked chain incl. #170/#171 + the round-5 stack (BL-01/BL-81)
- [x] Seed `rhema-nonprod-resend-api-key` (send-only Resend key — unblocks 165_VERIF.2's 15 preview legs) — **done 2026-10-16**: created in `rhema-507501` (us-central1, `goog-pulumi-provisioned` label convention), version 1 enabled, seeded from the operator-provided key file (orchestrator-executed under explicit delegation; value never printed/committed)
- [ ] BL-23 consumed-invite mint (if preview legs need a fresh invite code)
- [ ] BL-33 live-mode Stripe re-verify ruling
- [ ] BL-34 admin-key reconcile
- [ ] BL-35 external pen-test procurement disposition
- [ ] BL-37 exposure review
- [ ] BL-13 + BL-68 metered-pricing flip + unit-econ ruling (register-only, spec §10 Q-8)
- [ ] BL-30/BL-75 retro/refund rulings
- [ ] BL-50/BL-51 entitlement rulings
- [ ] BL-41/BL-42 H4/H5 deliverables
- [ ] D-OPS.2-1 billing-export console flip (gates COST.1's measured levers)
- [ ] D-MAINT.4-1 Google sign-in leg
- [ ] X-cite1-leg-cap-recon

## Exit criterion
Every checkbox ticked with a dated evidence pointer, or explicitly deferred/dropped in the
operator's own words recorded in the readout.

## DEFERRALS rule for tickets that run before this completes
Tickets touching a blocked claim open a D-row citing this HUMAN row and naming the withheld
claim; the row is never skipped by default.

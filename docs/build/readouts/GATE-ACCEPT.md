<!--
  docs/build/readouts/GATE-ACCEPT.md (BM-INDEX-03) — append-only gate readout for the round-3
  tail marker 88a_GATE-ACCEPT__accepted-deviations.md. Operator disposition of CAP.3's
  ACCEPTED-deviations list.
-->
# GATE-ACCEPT — operator signs the accepted-deviations list — readout

- **Criterion (verbatim, `88a_GATE-ACCEPT__accepted-deviations.md`):** the operator reviews the
  ACCEPTED-deviations list in `docs/build/CAPSTONE_CLOSURE.md` and signs each row as accepted, or
  sends it back to closure. A build of every executed chain row is not DONE while any proposed
  deviation is unsigned. The gate also refuses while any capstone-scoped OPEN `DEFERRALS.md` row
  remains.

> An operator or authorized human record supplies the decision; an agent must not sign or assume
> silence is approval.

## Disposition — 2026-10-04: **PASSED — all 13 rows signed ACCEPTED**

The operator reviewed the 13-row signature table (`docs/build/CAPSTONE_CLOSURE.md` §4) and signed
**ACCEPTED on every row** — no row sent back to closure.

| # | Deviation | Disposition |
|---|---|---|
| 1 | REQ-MOBILE-3 on responsive web (not a mobile app) | ACCEPTED |
| 2 | REQ-DATA-28 proposal cards; Yjs suggestion marks → 1.x | ACCEPTED |
| 3 | REQ-ARCH-24 `usercontent.rhema.tools` subdomain | ACCEPTED |
| 4 | REQ-ARCH-20 attestation = hydration manifest + proxy log + launch records | ACCEPTED |
| 5 | REQ-MOBILE-10 signed email actions Open/Wait-only | ACCEPTED |
| 6 | Reserved REQ-SPEC 5/23/26/28 merged into target ids | ACCEPTED |
| 7 | Fetcher grant stays `holdout-calibrator`-only | ACCEPTED |
| 8 | No `completed_partial` step-state; cap enforced at launch ledger | ACCEPTED |
| 9 | Emission audit verified catalogue-side only | ACCEPTED |
| 10 | REQ-IDE-1 layout restore = per-user client state | ACCEPTED |
| 11 | CAP.3's eight fixes verified build-time only; live legs ride D-CAP.3-1 | ACCEPTED |
| 12 | Whole tail's live/deploy obligations stay ledgered (D-CAP.2-1/-2 etc.) | ACCEPTED |
| 13 | Interim trial terms (ADR-014) remain in force | ACCEPTED |

## Capstone-scoped OPEN deferrals — disposition

- **D-CAP.2-1** (21 paid steps + paid new-visitor journey; weekly guard / funded window) —
  dispositioned by signature row 12: OPEN pending the ISO-week reset and the funded window.
- **D-CAP.2-2** (full JOURNEY.1 suite at the chain tip; Pulumi login owed) — dispositioned by
  signature row 12: OPEN pending the queued deploys; **Pulumi login completed by the operator on
  2026-10-04** — deploys unblocked.
- **D-CAP.3-1** (live re-verify of the eight CAP.3 fixes) — dispositioned by signature row 11:
  OPEN pending the deployed tip; rides D-CAP.2-2's post-deploy suite.
- **D-CAP.3-2** (`completed_partial` step-state product decision) — dispositioned by signature
  row 8: accepted as the operator's ruling that no step-state is added.

All four rows stay OPEN in `DEFERRALS.md` as tracking items carrying their unblock conditions;
they are **dispositioned, not blocking** — the operator's signature is their deferral ruling.

## Presented alongside (per the round-3 note)

- **HUMAN-H7 checklist:** test mailbox (DONE); notice timing, exposure review, test-data cleanup,
  live Stripe, admin key, pen test, golden budget, H3 revisit, BL-20 ruling, BL-24, real devices —
  all OPEN, operator-owned.
- **D5 (G2/H2):** deferred — §16.4 claims and efficacy marketing do NOT ship.
- **Interim trial terms (ADR-014):** in force (signed as row 13).
- **SLO re-basing:** none written; D-SLO.1-5..8 breaches stand as remediations.
- **Also pending operator rulings elsewhere in the ledger:** GD-RES.2-1 (historical refund/relabel),
  GD-ACT.1-1 (`approve_scope` on unattended trials), BL-30/D-DEF.4-3 (refund-window go-live),
  ECON.1's `debitMode=metered` flip + notice, and the CITE.1 leg-cap reconciliation.

**Verdict: PASSED.** Chain proceeds to `89_REC.1__backlog-and-readiness.md` (reconcile-build
mode=backlog). `projectStatus` stays IN_PROGRESS — the build is not DONE while OPEN rows remain.

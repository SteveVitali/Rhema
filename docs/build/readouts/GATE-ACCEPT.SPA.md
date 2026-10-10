<!--
  docs/build/readouts/GATE-ACCEPT.SPA.md — append-only gate readout for the round-4
  tail marker 143_GATE-ACCEPT.SPA__accepted-deviations.md. Operator disposition of
  SPACAP.3's ACCEPTED-deviations list (docs/build/CAPSTONE_CLOSURE.md §R4.4).
-->
# GATE-ACCEPT.SPA — operator signs the SPA accepted-deviations list — readout

- **Criterion (verbatim, `143_GATE-ACCEPT.SPA__accepted-deviations.md`):** the operator has
  reviewed the ACCEPTED-deviations list in `docs/build/CAPSTONE_CLOSURE.md` (from SPACAP.3)
  and signed each row as accepted, or sent a row back to closure. The frontend-spa build
  against `docs/frontend-spa-spec.md` is not DONE while any proposed deviation is unsigned.
  The gate also refuses while any `OPEN` row in `DEFERRALS.md` scoped to round 4 remains —
  the signature dispositions them (they stay OPEN as tracking items, not gate-blocking).

> An operator or authorized human record supplies the decision; an agent must not sign or
> assume silence is approval.

## Disposition — 2026-10-10: **PASSED — all 8 rows signed ACCEPTED**

The operator reviewed the 8-row signature table (`docs/build/CAPSTONE_CLOSURE.md` §R4.4)
and signed **ACCEPTED on every row** — no row sent back to closure.

| # | Deviation | Disposition |
|---|---|---|
| 1 | REQ-VFY-8's flip procedure amended post-deletion | ACCEPTED |
| 2 | REQ-SEQ-9's flag-off DOM-parity legs unexecutable | ACCEPTED |
| 3 | REQ-VFY-10's owed free steps still `expected:"red"` | ACCEPTED |
| 4 | REQ-VFY-6's journey-level axe leg still owed | ACCEPTED |
| 5 | REQ-SEQ-7's rollback drills never exercised live | ACCEPTED |
| 6 | REQ-SEQ-10's nightly pacing unproven until deploys run | ACCEPTED |
| 7 | G2's fix verified at build-time only | ACCEPTED |
| 8 | The whole live tail stays ledgered | ACCEPTED |

## Round-4-scoped OPEN deferrals — disposition

- **D-SPACAP.2-1** (full journey suite `--expect-renderer spa` on prod) — dispositioned by
  signature rows 6/8: OPEN pending the ordered merge/deploy per the §3.1 runbook.
- **D-SPACAP.2-2** (two-tenant BFF probe, X1 family + raw cookie-curl) — same unblock.
- **D-SPACAP.2-3** (public SSR regression) — PARTIAL: baseline captured green 2026-10-10;
  the post-deploy diff + `--expect-renderer ssr` leg owes its run to the same unblock.
- **D-SPACAP.2-4** (zero-CSP browser walk) — same unblock.
- **D-SPACAP.3-1** (live re-verify of the G2 showcase fix, three legs) — dispositioned by
  signature row 7: OPEN pending the deployed tip.
- The remaining round-4 rows (every `D-SPA.*-1/-2`, `D-SPAF.*-2/-3/-4`, `D-MAINT.6-1`,
  `D-OPS.1-1`, `D-SPA.6-1` — the live/preview/rollback/bake tail) are dispositioned by the
  signatures on rows 1–6/8: OPEN as tracking items carrying verbatim recipes + unblock
  conditions (the ordered merge/deploy + the non-prod Resend secret), not gate-blocking.

## Presented alongside

- **The merge/deploy runbook** (`docs/build/reports/SPACAP.2_COMPOSED_VERIFICATION.md` §3):
  the 15-segment bottom-up cadence — merge bottom-up, deploy each SPAF boundary, per-segment
  legs + ≥1 nightly green; the cleanup wave (#158–#163) merges+deploys only after the
  `editor` flip's bake. Operator-owned; Arm-B tip-deploy recorded with its consequence.
- **`rhema-nonprod-resend-api-key`** — still NOT_FOUND at signature time; the one-time
  secret seed unblocks all preview legs (`D-MAINT.6-1`, `D-OPS.1-1`, `D-SPA.6-1`).
- **Prod provenance** (verified 2026-10-10): web `6ebb1cb…`, api `0acd16d…` — pre-chain
  ancestors ~150 commits behind the tip; zero round-4 code deployed.

## Forward chain

- `nextTicket → SPAREC.1` (row 144 — backlog + operational readiness).
- `projectStatus` stays IN_PROGRESS until the manifest's tail rows land.

# ADR-031: Burn classification under `debitMode=metered`

- **Status:** Accepted
- **Date:** 2026-10-02
- **Ticket:** ECON.1
- **Requirement ids:** REQ-SPEC-32(a) (primary); REQ-SPEC-24 (5)(8); REQ-BILL-3; REQ-BILL-13
- **Spec:** §14.4 (event table: user stop mid-run, provider outage), §12.7 (meter of record), §14.6, A.9 (REQ-SPEC-32 + note)
- **Supersedes:** the D-PRB.16-5 (2026-09-22) "cap-meter only" ruling *for the charging terminal paths* — see the dated note on that DEFERRALS row

## Context

ADR-014 decided "charge what we meter" (REQ-SPEC-32(a)): a run's committed debits equal its
proxy-metered burn at the published rate, clamped at the cap, with exactly three absorbed kinds
(above-cap overrun, platform-fault refunds, the trial entitlement). The ground-truth pass
(`docs/build/runs/ECON.1.md` § Deliverable 1) found the launched committed-mode paths leave five
named divergences (D-A … D-F). What remained an owned decision: **which burn is chargeable under
`metered`**, reconciling REQ-SPEC-32(a)'s three absorbed kinds against:

- §14.4 "User stops mid-run — debit completed phases" and "Provider outage — idempotent debits";
- REQ-SPEC-24(8) — in-flight tokens on a stop are COGS;
- D-PRB.16-5's ruling — "cap-meter only: uncommitted burn does not debit the workspace".

## Decision

The charge target under `debitMode=metered` is, on every charging terminal path,
`min(Σ usage_records(source='proxy'), cap)` — exactly, to the credit.

| terminal path | metered-mode charge | classification |
|---|---|---|
| completed | `min(metered, cap)`; commits debit the metered remainder only (the pod claim is advisory, never a floor); a committed over-debit refunds as `metered_over_debit` | chargeable |
| user-cancelled mid-run | `min(metered, cap)` settled inside the hold **before** release — the burn happened and the partials are kept/resumable (§14.4's "debit completed phases" row, extended to the in-flight phase's metered burn) | chargeable |
| failed | net debits refund; the whole metered burn absorbs as platform COGS — identical to committed (a failure is the platform's, not the user's) | absorbed |
| platform-fault (RES.2 Unverified / RES.1 preflight) | refund + absorb under the platform-fault reason chain | absorbed |
| above-cap overrun | the debit clamps at cap (`min(actual, cap − Σ debits)`); the excess is `adjustment(absorbed)` | absorbed |
| trial entitlement | entitlement bucket, never `credit_ledger` | absorbed |
| late-arriving proxy rows after terminal settle | the stranded sweep's 72 h residue leg re-settles: a completed run tops up (and refunds over-debit under metered); cancelled runs settle the residue under metered; failed runs absorb it | chargeable where the path charges |
| in-flight tokens unrecoverable at a stop (REQ-SPEC-24(8)) | whatever the proxy metered is chargeable; burn the proxy never recorded cannot be charged at all — it is COGS by construction | absorbed by non-observability |

Reconciliations:

- **§14.4 "User stops mid-run — debit completed phases":** under metered the stop debits the whole
  metered burn (the in-flight phase's tokens are real cost the user caused; §14.4's row names the
  floor, not the ceiling — committed phases are the minimum). This is a SHOULD-level tightening:
  it charges *more* than the §14.4 row's letter, so it does not relax a spec target.
- **REQ-SPEC-24(8):** in-flight tokens are COGS only where the meter cannot see them; metered
  in-flight burn is the user's charge. The reserve already prices the unrecorded residue.
- **D-PRB.16-5 superseded under metered:** the 2026-09-22 "cap-meter only" ruling answered
  "should uncommitted burn debit?" for the committed-mode world — where commits were the invoice.
  Under `metered`, REQ-SPEC-32(a) makes the proxy meter the invoice, so that residue is chargeable
  on completed and user-cancelled runs. On failed runs the ruling's intent survives: terminal
  failure is platform fault, the burn absorbs, and the user is made whole.
- **Fail-closed flag:** `parseDebitMode` parses unknown/unset to `committed`; every stage ships
  `debitMode: "committed"` until the operator flip (the sequencing guard's other half — calibrated
  caps — is ADR-032).

Mechanics:

- `incrementalMeteredDebit` under `metered` returns `metered − debited` only (no pod floor).
- `settleMeteredDebit` (completed) is unchanged; `refundMeteredExcess` books
  `refund:<run>:settle:<attempt>` with reason `metered_over_debit` — a new refund reason.
- `cancelRun` settles + refunds inside the tenant tx **before** the hold release (post-release a
  debit cannot draw held buckets).
- `refundMeteredExcess` refuses when `metered = 0`: with zero proxy rows the meter is
  unobservable, not zero — refunding the claim there would consume the idempotency key and block
  the correct refund once the rows flush. The 72 h residue leg repairs it after the flush lands.
- `resettleRun` is idempotent (`greatest`-monotone reconcile, keyed debit/refund/adjust rows).

## Consequences

- The pod-claim floor's +N-credit over-debit (the `01M3SK62…` +2 shape) refunds automatically
  under metered; under committed it stays the charge — the committed figure is the consent basis.
- A user cancel no longer leaves metered burn uncharged-or-silently-absorbed: under metered it is a
  real, ledger-visible charge; under committed it absorbs as today.
- Σ debits − Σ refunds ≤ cap always (the DB trigger and the REQ-BILL-3 fault-injection test hold
  under both modes).
- `committed` behavior is byte-for-byte unchanged — every metered branch is behind the flag.

## Alternatives considered

- **Charge only completed phases on a user stop (§14.4's letter).** Writes off real metered burn
  the user caused; §14.4 names the floor. Rejected.
- **Debit uncommitted burn on failed runs too.** A failure is the platform's; charging for it
  violates "never a silent bill". Rejected.
- **Retro-fix committed-mode over-debits.** One-off prod writes stay operator-paused; the metered
  settle prevents the class going forward.
- **Metered-everything including the absorb classes.** Violates REQ-SPEC-32(a)'s own three
  absorbed kinds. Rejected.

## Revisit trigger

- Metered-mode `metered_over_debit` refunds exceed 1% of settled runs in a week (the pod-claim
  floor is systematically mis-sized — re-estimate instead of refunding).
- The residue leg re-settles a run older than 72 h (proxy flush lag longer than the window).
- REQ-SPEC-32(c) cap-death share misses ≤10% on the trailing window for two consecutive weeks
  (ECON.2's criterion) — the caps, not the mode, are then wrong.

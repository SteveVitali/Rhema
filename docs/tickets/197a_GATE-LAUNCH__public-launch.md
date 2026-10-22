# GATE-LAUNCH — Public launch of rhema.tools (round 6)

- **Kind:** gate · **Phase:** round 6
- **Readout:** `docs/build/readouts/GATE-LAUNCH.md`

> **Milestone gate — NOT an `implement-spec` input.** The chain STOPS here until the operator
> records the go. Never guessed past. ADR-111 permits the launch; this gate decides it.

## Criterion (verbatim from `docs/round-6-draft-spec.md` §6 — all must hold)
(1) zero launch-blocking OPEN DEFERRALS rows — the launch-blocking set is every row the §7
accounting tags `LB`; (2) REQ-SEC-3 (pre-launch adversarial review) zero open criticals/highs;
(3) REQ-LCH-1 `approved: true` on every page; (4) Showcase + sample dossier + H4 stamps signed off;
(5) REQ-DISC-3 golden green on all four protocols at the launch-candidate SHA; (6) REQ-GO-2 nightly
green on `main` == prod; (7) REQ-DEP-2 drills all PASS + alerts paging; (8) REQ-DEP-3 HA live;
(9) REQ-FOR-2 has no ledger defect; (10) REQ-FOR-4 exposure verdict recorded and, if yes, the
approved notice sent; (11) REQ-DISC-1 is complete or its refusal is dispositioned; (12) the
launch-surface lint is green; (13) the `debit-mode-flip.md` preconditions 1–3 hold (calibration
adopted with ≤ 10% cap reach, notice sent, effective date reached) — or the operator rules on the
recorded gap. The operator's go is recorded verbatim.

## Pre-registered thresholds
As stated in the criterion; each item carries its evidence pointer in the readout before
presentation. The orchestrator assembles the readout and never ticks an item without its evidence.

## DEFERRALS rule
This gate does not pass while any `LB`-tagged row (round-6 spec §7) remains OPEN without a
recorded operator disposition.

## Disposition
Recorded only from the operator's own words: the readout appends a Signature block with the
decision verbatim and flips its `Status:` line; the same words go in LEDGER GATE DECISIONS.

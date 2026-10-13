# ADR-105: GATE G3 read early — PROCEED to the full IDE on operator evidence; the REQ-BETA-18 window skipped — retro-fitted record

- **Status:** Accepted
- **Date:** 2026-09-23 (decision; recorded into the ADR set + folded into the spec by REC.2, 2026-10-04)
- **Ticket:** `28b_GATE-G3` (the decision; LEDGER § GATE DECISIONS 2026-09-23); REC.2 (the fold-back)
- **Requirement ids:** REQ-BETA-18 (window overridden), REQ-BETA-20, REQ-BETA-21, REQ-BETA-22, REQ-BETA-3
- **Spec:** rhema-design-spec §17 (addendum banner), Appendix A.13 (REQ-BETA-18 row marker + addendum)

> Retro-fitted by REC.2 (spec reconciliation) from the operator's 2026-09-23 GATE DECISIONS row.
> The decision was taken and acted on during the build; this ADR is its committed record.

## Context

REQ-BETA-18 pre-registers the beta gates: ≥90 days with ≥15 active partners before the full-IDE
ticket bodies are written. Two prior decisions hollowed the design's premise: H3 was **deferred in
part** (2026-09-16, ADR-008) — no partner recruitment, no REQ-BETA-17 deal, no house credits — and
G3 itself was deferred to "read on whatever real-world usage exists by then." A week later the
evidence that existed was: the platform live end-to-end on prod (signup → ingest → review →
deliver → billing), a Review delivered within a derived cap (`01M36663…`), and a measured cost
structure (~$7–10 metered per quick review with ±30% run-to-run variance vs sheet-advertised
sub-$1-era pricing — the PRB.22–25 chain). Twenty-two full-IDE skeletons (rows 29–50) sat waiting
on the read.

## Decision

**Read G3 early on operator evidence → PROCEED.** The ≥90-day / ≥15-active-partner window is
skipped entirely; the full-IDE ticket bodies may be written and the chain continues to P1.01.

**Recorded caveat (accepted, not hidden):** the read carries zero partner behavioral data — the
REQ-BETA-18 thresholds (round-2 rate, accept+adapt, second-import, conversion, stated WTP) were
never evaluated, so the read is statistically weaker by construction; and the cost/margin finding
(~$7–10/review vs the $20/mo WTP stop-threshold) would itself have been a **pivot** signal had the
gate run as designed. The gate row stays parked in the chain: the registered thresholds can still
be evaluated later against whatever real-world telemetry accumulates (the `beta-report` machinery
keeps the metrics accumulating against `BETA_GATE_THRESHOLDS`).

## Consequences

- **Positive:** the 22 full-IDE bodies were written and landed (PRs #55–#76) on evidence that
  existed, rather than a cohort that no longer did; the build reached its capstone trail and round
  3 instead of idling behind a gate whose design cohort was gone.
- **Negative / accepted:** the full IDE was built without the demand-side go/no-go the beta was
  ratified to produce; the pivot signal the cost data would have raised is carried as product risk
  (later partially remediated by the round-3 cost-truthfulness work — REQ-SPEC-32, ADR-014 — and
  still open as BL-13).

## Alternatives considered

- **Keep G3 parked ≥90 days on self-serve telemetry:** rejected — the gate was designed around a
  screened partner cohort that no longer exists; ninety days of unscreened-usage data would still
  not be the designed read, and the chain would idle meanwhile.
- **Recruit the partner cohort after all (un-defer H3):** rejected — re-opens the decision ADR-008
  already took (months of human pipeline; users pay their own way).
- **Read G3 as FAILED/STOP because thresholds were unmet:** rejected — the thresholds were never
  *evaluated*; reading a gate as failed because its measurement never ran falsifies the record.

## Revisit trigger

Revisit if (a) accumulated real-world telemetry lets the registered REQ-BETA-18 thresholds be
evaluated for real — the parked gate row reads then, and a failing read re-opens the
proceed/pivot/stop decision honestly; (b) the H3 partner program is revived — the designed cohort
returns and the gate can read as designed; or (c) the cost/margin question (BL-13) resolves adverse
enough to re-open the pivot option the recorded caveat preserved.

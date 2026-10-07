# ADR-038: Metered ≠ charged — the difference is stated per reason, in controlled sentences

- **Status:** Accepted
- **Date:** 2026-10-02
- **Ticket:** RPT.1
- **Requirement ids:** REQ-BILL-9 (primary); REQ-BILL-6; REQ-BILL-8; REQ-SPEC-32(a) (display half)
- **Spec:** §14.4 (the accounting table's "our error" precedent), §14.5 (report levels), REQ-SPEC-32's
  "never silently fold", Manifest #14
- **Consumes:** ADR-014 (absorbed kinds), ADR-031 (`debitMode=metered` classification), RES.2's
  `platform_fault` refund reasons

## Context

The design-review defect (PR-E5): the report said "632 cr spent" beside "SEATS Editor — 1,625 cr
(100%)" — the headline read `runs.spent_credits` (the committed claim) while the seat split summed
*every* `usage_records` source, and the two contradicted each other silently.

RPT.1 fixes the figures: `spent` = Σ `credit_ledger` debits − Σ refunds (the charged figure), the
seat split and `metered` line = Σ `usage_records(source='proxy')` (the meter of record). What
remained an owned decision: **how the report words a metered ≠ charged difference** — §14.4's
precedent is the sentence "you were not charged for the overrun", but the wording scheme, the gap
arithmetic, and the refund-reason vocabulary were unspecified.

## Decision

**Two ledgers, three sentences.** The report always states both figures when they differ —
`"{metered} cr metered · {charged} cr charged"` — and each reasoned difference is a list row whose
`key` is one of six controlled values, worded once in the copy table:

| key | when | the sentence's shape |
|---|---|---|
| `cap` | metered ran past `cap` while charged sat at the cap | "…metered past your cap — you were not charged for {n} cr of overrun." |
| `absorbed` | recorded `adjustment(reason='absorbed')` rows cover the gap | "{n} cr of metered usage was absorbed by the platform — not charged to you." |
| `refund` | per `credit_ledger(kind='refund')` row, with its `reason` translated | "{n} cr returned — {reason}" (the reason maps through a controlled label table; a raw ledger code never renders) |
| `entitlement` | `runs.entitlement_id` covered the charge | "{n} cr metered — covered by your included review, no charge." |
| `committed` | the charge sits above the meter, or metered burn went unpaid with no absorbed row | "Charged on the committed phase figures — {n} cr differs from the meter." |
| `cross_check` | `sdk_estimate` diverges >2% from the meter | "The agent's own estimate read {n} cr — the proxy meter is the figure of record." |

**The gap arithmetic** (`reportDifferences`) mirrors the ledger's absorb semantics — net of refund:

```
gap = metered − charged
attribution order: entitlement (covers the whole gap)
                 → cap (metered − cap, when charged is at the cap)
                 → absorbed rows (min(absorbed, remaining))
                 → refunds (each refund explains its own slice)
                 → committed (the residue — charged on committed figures either direction)
```

A `gap < 0` (charged above the meter — a pre-flip/claim-floor run) reports `committed` for
`charged − metered`. Because the gap is net-of-refund, a refunded failure that absorbed the whole
burn shows `absorbed` for the full metered figure *and* a `refund` line for each returned debit —
the two sentences name different halves of the same event, and both must be true.

**Server-computed, client-rendered.** Every difference's `credits`/`reason` is computed in
`buildRunReport` from reconciled inputs; the web's `differenceLabel` only templates the controlled
key. The UI never invents a reason, and the seat split's total equals the metered line by
construction (both sum the proxy rows). A Showcase run's report adds the `worked_example` label —
illustrative figures, never presented as the user's spend.

## Consequences

- The report cannot silently contradict the ledger: every credit of `|metered − charged|` lands on
  a named line, or the run's figures genuinely matched.
- New refund/absorb reasons need a `refundReasonLabel` row — a missing key renders the generic
  "…cr returned." rather than a raw code (fails closed).
- The `committed` key covers both directions of divergence — a live committed-mode run and a
  pre-flip artifact read the same way, so the ECON.1 flip needs no wording migration.

## Alternatives considered

- **Fold the difference into the headline only** (e.g. "632 cr · metered 1,625"): rejected — Manifest
  #14 requires the *reason*, not just the number; a bare gap reads as a bug.
- **One row per ledger entry**: rejected — a run with 30 debit rows would render 30 near-identical
  lines; the reasoned-grouping keeps the report readable while every credit is still attributed.
- **Client-side inference of the reason** (the UI comparing figures): rejected — REQ-SPEC-32's "the
  report is truthful about metered vs charged" means the reason is a server fact, not a client guess.

## Revisit trigger

Reopen if a new burn classification lands (a `credit_ledger` reason outside `absorbed`/the refund
reasons) or if the DEBT ledger gains a fourth row kind — the copy table + attribution order then
need a matching key.

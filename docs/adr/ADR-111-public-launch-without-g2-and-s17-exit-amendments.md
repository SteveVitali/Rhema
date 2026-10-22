# ADR-111: Public launch proceeds without the G2 LIFT read; §17 Phase-1 exit criteria amended

- **Status:** Accepted
- **Date:** 2026-10-20
- **Ticket:** round-6 planning (operator rulings `GD-LAUNCH-G2.R6`, `GD-S17.R6`, `GD-LAUNCH-MONEY.R6`
  — LEDGER § GATE DECISIONS ### Round 6)
- **Requirement ids:** REQ-EVAL-15, REQ-EVAL-16, REQ-EVAL-19, REQ-BETA-20, REQ-BETA-19 (amended), §17
  Phase-1 exit row
- **Spec:** rhema-design-spec §17 (2026-10-20 amendment banner), §16.4 (marketing block — unchanged), §18
- **Supersedes (in part):** ADR-104's clause "G2 stays a HARD gate before public launch" and ADR-008's
  "no public launch moment (reserved for the full IDE)". Every other clause of both ADRs stands.

## Context

The operator directed round 6 to end with "a fully production-ready public launch-ready deploy to
rhema.tools, with no remaining deferred work" (2026-10-20). Three ratified bars stood between the
built product and a launch:

1. **G2 as a launch gate** (ADR-104, GATE-G2 readout, ADR-013 D5). Wave 1 needs the H2 human
   pipeline — ≥24 commissioned drafts, two annotating editors, a senior adjudicator, the A6/A1 arms
   (≈$100k over about two quarters, Q-23). No single build round can finish it.
2. **§17's Phase-1 exit row** — "nightly golden runs green on all four protocols" (the operator
   declined the ~$150–300/night cadence on 2026-10-20, `GD-R5OPS.1-1`), and "a new user reaches a
   first finding in ≤4 minutes" (the synthetic cohort measured p50 460 s; the organic cohort is
   empty because real users have had no usable path yet).
3. **ADR-008's reservation of the launch moment** for the full IDE. The full IDE is now built (rows
   29–50 landed; round 4's SPA is deployed on prod via Arm B).

The existing reasoning in ADR-008 already separated two different things a launch could mean: a
quiet, paid self-serve product that makes **no efficacy claim** does not cross the G2 bar, while
**claiming the product beats its baselines** does.

## Decision

Operator rulings, 2026-10-20 (verbatim selections in LEDGER § GATE DECISIONS ### Round 6):

1. **Public launch is decoupled from G2** ("New ADR: launch w/o G2"). The public launch of
   rhema.tools may proceed without the wave-1 LIFT read. **Every §16.4 efficacy or superiority
   claim stays blocked on every surface until a pre-registered wave meets the REQ-EVAL-15
   criterion.** The block is still enforced by the REQ-EVAL-19 launch-surface lint
   (`COMPARATIVE_WAVE_MET = false`). G2/H2 continue as a **post-launch research program**, not a
   launch deferral. REQ-EVAL-16's pre-committed consequences still apply retroactively if a
   later wave fails.
2. **§17 Phase-1 exit criteria are amended** ("Amend both"):
   - "nightly golden runs green on all four protocols" → **"golden validation green on all four
     protocols at the launch SHA, re-run on every protocol-affecting deploy"** (the ≤ $300
     one-time validation, `GD-R5OPS.1-1`; the re-run rule becomes a standing ops rule).
   - "a new user reaches a first finding in ≤4 minutes" → a **post-launch target measured on the
     organic cohort** (REQ-OPS-4's committed query). The launch proceeds at the measured synthetic
     latency, and the post-launch read (launch + 14 d, `GD-WATCH.R6`) either meets the target or
     converts it to a standing, alert-backed SLO watch with a named owner.
   - "benchmark wave 1 (or a later wave) is dispositioned" is satisfied by this ADR's disposition
     (deferred to the post-launch research program). "No superiority claim … unless a
     pre-registered wave met its criteria" is **unchanged**.
3. **The launch moment is permitted** once round 6's `GATE-LAUNCH` passes. The money posture it
   executes (`GD-LAUNCH-MONEY.R6`), in this order: metered debit + user notice, purchase open,
   refund window open, then the trial opened to everyone behind the existing kill switch.

## Consequences

- **Positive:** the finished product can launch and earn without waiting months on a human
  procurement pipeline. Real-traffic evidence for the funnel, the economics and the first-finding
  target starts accumulating. The claims bar — the part of G2 that protects users from a false
  efficacy story — is fully preserved and still mechanically enforced.
- **Negative / accepted:** the product launches with its quality advantage **unproven**. Launch
  copy may describe what the product does, never that it is better than an alternative. If a
  later wave fails the LIFT criterion, REQ-EVAL-16's consequences apply to a public product, not a
  beta: marketing off, premium re-justified, an R&D freeze, and operator disposition on a second
  miss. First-finding latency at launch is about 7.7 min on the synthetic cohort, against a
  ≤4-min target, so early users may see a slower first result than the spec intends. The nightly
  golden regression net is replaced by per-release validation, which catches less between
  releases and costs far less.

## Alternatives considered

- **Keep G2 as the hard launch gate:** rejected by the operator. Round 6 would end "launch-ready
  pending G2", with the launch moment months away on H2.
- **Schedule H2 inside round 6:** rejected. The drive could not finish until a months-long human
  pipeline did.
- **Run a cheap proxy eval and call it G2:** rejected, as ADR-104 already recorded. A proxy read
  is not the pre-registered gate.
- **Keep the §17 criteria verbatim:** rejected. It needs about $4.5–9k/mo of recurring nightly
  goldens and a ≤4-min latency fix before any user can try the product.

## Revisit trigger

- Any §16.4 efficacy or superiority claim is proposed for any surface. It hard-blocks on a met,
  dispositioned LIFT exactly as before.
- The H2 corpus exists and wave 1 can be scored. G2 then reads for real.
- A wave fails the criterion. REQ-EVAL-16 applies.
- The post-launch organic first-finding p50 exceeds 4 min at the launch + 14 d read. The latency
  work becomes a named engineering ticket rather than a watch.
- A protocol-affecting deploy ships without its golden re-run. The per-release rule has failed
  and the cadence question reopens.

# GATE-ACCEPT.R6 — Round-6 accepted-deviations sign-off

- **Kind:** gate · **Phase:** round 6
- **Readout:** `docs/build/readouts/GATE-ACCEPT.R6.md`

> **Milestone gate — NOT an `implement-spec` input.** The operator signs (or rejects) the round-6
> accepted-deviations list R6CAP.3 drafted. Never guessed past.

## Criterion
The operator reads the proposed deviations and records accept/reject per item. Expected candidates:
launch without the G2 read (ADR-111); the external pen test post-launch (ADR-112); first-finding as
a post-launch target; the minimal golden cohort; the cost floor vs the ~$50 target; any owned
post-launch obligation still open at the R6WATCH.1 read.

## DEFERRALS rule
No round-6-scoped OPEN row blocks this gate unless it lacks either a signed deviation or an owned
post-launch obligation (owner + trigger).

## Disposition
The operator's words verbatim in the readout Signature block and in LEDGER GATE DECISIONS. This
gate is also where `GD-DEPLOY.R6` expires.

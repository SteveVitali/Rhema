# GATE-R6B — Funded window re-open (round 6)

- **Kind:** gate · **Phase:** round 6
- **Readout:** `docs/build/readouts/GATE-R6B.md`

> **Milestone gate — NOT an `implement-spec` input.** The chain STOPS here until the operator
> dispositions the readout. Never guessed past.

## Criterion (verbatim from `docs/round-6-draft-spec.md` §6)
"Funded window open — envelope ~$150 pinned-scope (ruled) with the cumulative measured < cap and ≥
the declared remaining caps + the Showcase run estimate; dry-run 9/9; deployed-tip provenance;
tenant + DSN; REQ-ENG-3 landed."

## Pre-registered thresholds
- Envelope: **~$150 pinned-scope lifetime** (`GD-ENV.R6`; $80.86 measured at 2026-10-16), on the
  pinned-scope query (flagged-tenant `source='proxy'`, seed exclusions live).
- Headroom ≥ the wave's declared Σ caps ($54.50 at R5) **plus** R6CNT.2's Showcase estimate;
  otherwise the operator rules at this gate.
- `funded-window.mjs --dry-run` prints 9/9 with `FUNDED_WINDOW_CAP_USD` at the ruled value.
- `check-deploy-provenance` all-PASS at the deployed tip.
- `JOURNEY_FUNDED_STABLE_TAG` tenant seeded + purge-exempt; `JOURNEY_DATABASE_URL` = the
  system-role DSN (`pg_roles` bypass proven).
- 178_R6ENG.3 landed and deployed.

## DEFERRALS rule
This gate does not pass while an `OPEN` row scoped to it lacks a disposition.

## Disposition
Recorded only from the operator's own words: the readout appends a Signature block with the
decision verbatim and flips its `Status:` line; the same words go in LEDGER GATE DECISIONS.

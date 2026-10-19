# GATE-R5F — Funded-window open (post-regime)

- **Kind:** gate · **Phase:** round 5
- **Readout:** `docs/build/readouts/GATE-R5F.md`

> **Milestone gate — NOT an `implement-spec` input.** The chain STOPS here until the operator
> dispositions the readout. Never guessed past.

## Criterion (verbatim from the spec §5.5)
"System-role DSN + `pg_roles` probe → cumulative < re-authorized round cap (⚑ Q-ECON.f) →
`--headroom` required → per-leg enforcement → ordering T9 → launchers → riders → B19C
last-and-conditional → `JOURNEY_FUNDED_STABLE_TAG` tenant + purge exemption → REQ-ECON-6
exclusions live first. Estimated window cost with levers: ~$20–40" — and the consumed-against
figure: $145.95 measured against the stale $150 bound on the OLD unfiltered query; the gate
re-measures on the pinned scope.

## Pre-registered thresholds
- Cumulative round cap: **~$60** (ratified Q-ECON.f re-authorization; measured on the
  pinned-scope cumulative query — flagged-tenant `source='proxy'` rows, seed exclusions live).
- Per-leg caps: the spec §5.3 table verbatim (levered-expected basis; floor $0.50).
- Ordering: T9 → launchers → riders → B19C last-and-conditional.
- The `testCheapRoute` arm live with per-leg opt-outs honored (B19C/N6/R4 pinned OFF).
- `JOURNEY_FUNDED_STABLE_TAG` tenant seeded + purge-exempt (ratified Q-6).

## DEFERRALS rule
This gate does not pass while any `OPEN` row in `DEFERRALS.md` scoped to this phase remains.

## Disposition
Recorded only from the operator's own words: the readout appends a Signature block with the
decision verbatim and flips its `Status:` line to PASSED | SKIPPED-BY-OPERATOR | NOT-PASSABLE;
the same words go in LEDGER GATE DECISIONS.

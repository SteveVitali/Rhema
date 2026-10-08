# GATE-ACCEPT.SPA — operator signs the SPA accepted-deviations list

> **Milestone gate — NOT an `implement-spec` input.** The chain STOPS here after SPACAP.3 until
> the operator dispositions the accepted-deviations list. Never guessed past.

- **Kind:** gate · **Phase:** capstone
- **Readout:** `docs/build/readouts/GATE-ACCEPT.SPA.md`

## Criterion (verbatim)
The operator has reviewed the ACCEPTED-deviations list in `docs/build/CAPSTONE_CLOSURE.md`
(from SPACAP.3) and signed each row as accepted, or sent a row back to closure. The
frontend-spa build against `docs/frontend-spa-spec.md` is not DONE while any proposed deviation is unsigned.

## DEFERRALS rule
This gate does not pass while any `OPEN` row in `DEFERRALS.md` scoped to round 4 remains
(DEFERRALS rule 4).

# ADR-109: The coverage-matrix gate validates the BM-VERDICT-01 verdict grammar — MET-ENGINEERED restores the two owed-leg re-verdicts

- **Status:** Accepted
- **Date:** 2026-10-10
- **Ticket:** SPAREC.1 (round-4 tail — backlog + operational readiness)
- **Requirement ids:** REQ-SPEC-31, REQ-ED-17 (the two rows re-verdicted); REQ-SPEC-29 (the matrix's owning requirement)
- **Spec:** BM-VERDICT-01 (`~/agent-skills/skills/build-memory/layout.md` §Status layers and verdicts)

## Context

Two validators disagreed about the `verdict` column's grammar:

- `scripts/check-coverage-matrix.test.mjs` (CAP.1's in-repo completeness gate, green-gate bound)
  admitted exactly five bare strings: `MET`, `MET-DIFFERENTLY`, `PARTIAL`, `MISSING`,
  `AT-RISK-INTEGRATION`.
- `check-backlog.sh` (the reconcile-build completeness check, BM-VERDICT-01) parses the full
  documented grammar — `MET-DIFFERENTLY(ADR-nnn)`, `MET-ENGINEERED(D-id)`, `WAIVED(ADR-nnn)` — and
  flags a `MET` row that cites an OPEN/PARTIAL deferral id as `met-with-owed-leg`.

REC.1 (2026-10-04) re-verdicted `REQ-SPEC-31` `MET` → `MET-ENGINEERED(D-RES.1-2)` correctly per
BM-VERDICT-01 — the row cited an OPEN live leg — which the five-value gate then rejected; MAINT.3
reverted it to `MET` as a gate-vocabulary workaround, recreating the `met-with-owed-leg`
inconsistency. SPACAP.1's round-4 rows added a second instance: `REQ-ED-17` `MET` citing the OPEN
`D-SPA.25-1` preview leg. Either way one validator had to lose: keeping `MET` was dishonest (an
owed leg sat inside a MET row); keeping the five-value gate made the honest verdict unwritable.

## Decision

The in-repo gate now validates the **BM-VERDICT-01 grammar**: the base name set { `MET`,
`MET-DIFFERENTLY`, `MET-ENGINEERED`, `PARTIAL`, `MISSING`, `AT-RISK-INTEGRATION`, `WAIVED`,
`N/A-RATIONALE` }, with the `NAME(params)` form allowed only for `MET-DIFFERENTLY`,
`MET-ENGINEERED`, and `WAIVED` (non-empty, closed parameter required). The nonblank-evidence rule
now applies to `MET`, `MET-DIFFERENTLY`, and `MET-ENGINEERED` base names. Both affected rows are
restated at their honest verdicts: `REQ-SPEC-31` → `MET-ENGINEERED(D-RES.1-2)` (the N6
planted-error leg rides the funded window) and `REQ-ED-17` → `MET-ENGINEERED(D-SPA.25-1)` (the T17
preview leg rides the Resend-secret unblock). Engineering-closed is unchanged (MET + MET-DIFFERENTLY
+ MET-ENGINEERED); requirement-satisfied drops by two to the honest 511/666.

## Consequences

- The two validators agree again: a MET row can never cite an OPEN leg, and the honest verdict is
  writable in-repo. `check-backlog.sh` reads `met-with-owed-leg`-clean at zero issues.
- MAINT.3's revert is superseded — its cause (the gate's narrower set) is fixed at the gate, not
  at the data.
- Any future `MET-ENGINEERED`/`WAIVED` verdict is writeable without a gate edit; the parameterized
  forms remain the only ones allowed to carry parameters.

## Alternatives considered

- **Flip both rows to `PARTIAL`** (writeable under the old gate): rejected — BM-VERDICT-01's
  `MET-ENGINEERED` is the precise verdict (all engineering built and verified; only
  live/operator/human acts remain), and `PARTIAL` would understate REQ-SPEC-31's live-proven
  mechanism and misclassify REQ-ED-17 as a mechanism gap.
- **Keep `MET` and drop the D-id citations** so the checker sees no owed leg: rejected — it games
  the exact check that exists to catch hidden owed legs; the debts stay tracked where they belong.
- **Patch `check-backlog.sh` upstream to stop flagging the class**: rejected — that weakens the
  BM-VERDICT-01 consistency check in the wrong direction; the in-repo gate was the narrower
  contract.

## Revisit trigger

If the matrix ever needs `WAIVED(ADR-nnn)` or `N/A-RATIONALE` rows, the gate already admits them —
revisit only if a new verdict *name* is introduced upstream (a BM-VERDICT-01 vocabulary change),
which would require the same grammar-level resync.

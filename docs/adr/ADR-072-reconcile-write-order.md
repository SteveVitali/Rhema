# ADR-072: `reconcileBalances` repairs by ledger-append-then-counter-fold — never an intermediate counter write

- **Status:** Accepted
- **Date:** 2026-10-03
- **Ticket:** DEF.4
- **Requirement ids:** REQ-SPEC-24, REQ-DATA-34, REQ-BILL-3
- **Spec:** §14.4, §14.6 (reconciliation drift)

## Context
The DEF.2 §F4 incident: prod carried a negative `held` fold (−897) for an account/bucket whose
ledger rows were internally consistent — a missing hold row left the counter below zero. The
repair path `reconcileBalances --apply` ran in two steps: (1) append backfill `hold` ledger rows
through `applyLedgerEntry`, (2) rewrite the denormalized `credit_balances` counter to the
post-backfill fold. But `applyLedgerEntry` also maintains the counter *incrementally* — on a
negative fold its `held += credits` wrote an intermediate `−717`, violating
`credit_balances_held_nonnegative` (CHECK, 0044 — validated for fresh environments by 0055). The
constraint is real and cannot be `DEFERRABLE` (Postgres), so the DEF.2 remediation had to drop
and re-add the constraint by hand — the documented repair could not run on a conforming
database.

## Decision
Step 1 of the repair appends the backfill ledger rows *directly* (plain
`insert into credit_ledger … on conflict (idempotency_key) do nothing`), bypassing
`applyLedgerEntry`'s counter maintenance. Step 2 then writes each divergent counter row **once**,
at the post-backfill fold — which is `held = 0` by construction for the repaired bucket. Every
counter write commits a `held >= 0` value; the ledger stays append-only throughout. The repair's
idempotency is preserved by the serialized `reconcile:held-backfill:<account>:<bucket>:<n>` key —
a replay finds the row already inside the fold and reports its id for the audit.

## Consequences
The documented balance repair runs under the constraint — no manual DDL, no operator-only
exception path — and `--apply` is safe to re-run. `applyLedgerEntry` remains the single write
seam for *normal* ledger traffic (hold/debit/release/refund all maintain the counter
incrementally and correctly there); the reconcile path is the one caller that must not use it,
because its whole job is to write a counter that disagrees with the incremental accumulation.
Fresh environments now validate `credit_balances_held_nonnegative` in migration 0055, so the
constraint is `VALIDATED` everywhere the migration set runs — parity with prod's convalidated
state.

## Alternatives considered
- **`DEFERRABLE INITIALLY DEFERRED` on the CHECK (the DEF.2 ticket's first option):** Postgres
  CHECK constraints cannot be deferred — only UNIQUE/FK constraints can. Not available.
- **Suppress the constraint during repair (session_replication_role / drop-and-re-add):** the
  incident this fixes — a repair that requires privilege escalation or DDL is a repair that
  rots. Ordering removes the need entirely.
- **Keep `applyLedgerEntry` but reorder the backfill so intermediate values stay ≥ 0:** the
  intermediate values depend on the *starting* counter, which is exactly what is broken —
  there is no append order that keeps a −897 counter non-negative while holds accrete.
- **A `reconcile` flag on `applyLedgerEntry` that skips counter maintenance:** same effect, but
  it widens the hot write seam's signature for one caller; a direct insert in the reconcile
  module keeps the exception local and greppable.

## Revisit trigger
A second caller that needs "append ledger without touching the counter" — then the bypass
deserves a named port method (e.g. `applyLedgerEntry(…, { counterMaintenance: 'skip' })`) rather
than a second direct-insert site. Also revisit if the counter stops being denormalized (a
derived view), which deletes the ordering hazard at its root.

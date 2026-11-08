# paid-u6-redispatch — funded-identity precheck under the 2026-11-08 re-dispatch ruling

## Summary

The operator's recorded 2026-11-08 ruling (verbatim **"approved, continue"** — LEDGER PHASE
LOG) re-authorizes the ONE paid U6 re-dispatch deferred as `D-R7DEP.2-1` (the first
authorized dispatch failed HTTP 402 — unfunded journey identity, metered $0.00). Per the
dispatch's own ordering, the **funded-identity precheck ran first** — and returned
**UNFUNDED**, so the authorized re-dispatch was **not burned**:

- jrn-a (`test+jrn-a@rhema.tools`, the identity the paid `R4` leg binds) — current
  workspace `01M6X4ZCSA4XV2ZGM3KFJZ79ZE` (`is_test`, 12 h fresh) → billing account
  `01M6X4ZCSAJSSXNMPVGFMJMAME` carries **zero `credit_ledger` and zero
  `credit_balances` rows**. Sibling jrn-b holds only the 10-cr daily allowance.
- Measured over the system-role DSN via the operator IAP tunnel
  (`rhema-prod-proxy-cptb` → `127.0.0.1:15433` → `10.46.0.3:5432`), read-only:
  `funded-tenant.mjs` dry-run + `funded-query.mjs` (`BEGIN READ ONLY … ROLLBACK`).
- ISO-week flagged-tenant proxy spend: **$3.34352 / 96 rows** (< $5) — unchanged from the
  first dispatch's read. Provenance re-read: `e578a767` on web + api `/healthz`.
- `F-R7DEP.2-17` (journey-identity funding seam) is un-fixed — outside the 250g insert's
  F-9…F-14 scope; the `admin-cli house-grant` seam stays the operator's act. No fixture or
  guard was mutated to force a green.

**Spend: $0.00. Zero prod writes.** The re-attempt authority stands unconsumed for the
funded retry; `D-R7DEP.2-1` stays OPEN with the dated disposition.

## Records

- `docs/build/runs/paid-u6-redispatch.md` — the full precheck ledger.
- `docs/tickets/DEFERRALS.md` — `D-R7DEP.2-1` dated note appended (OPEN, blocked on the
  fixture not the product).
- `docs/build/BUILD_INDEX.md` row 304 · LEDGER PHASE LOG `done` + `ci boundary` lines.
- `nextTicket`/`lastCompleted` unchanged (200_R6WATCH.1 clock-bound; R7REC.1 last).

**Not merged by the worker.** Base `stevevitali/r7rec-1-reconcile` @ `da233783`.
mergePolicy: OPERATOR.

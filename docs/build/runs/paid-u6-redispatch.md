# paid-u6-redispatch — the funded-identity precheck under the 2026-11-08 re-dispatch ruling

- **Spec:** orchestrator directive — the paid-U6 re-dispatch (`D-R7DEP.2-1`) under the
  operator's recorded 2026-11-08 ruling, verbatim **"approved, continue"** (LEDGER PHASE LOG
  2026-11-08 — "the paid-U6 re-dispatch authority under `GD-UX-PAIDLEG.R7` … re-attempt
  authorized"). The binding cap is the ruling's own verbatim: **"if we do a manual paid run,
  we must keep it under $10"** — `capUsd` $0.50 target, declared `--headroom`, one dispatch,
  spend measured at close, never estimated.
- **Normative loads:** `docs/tickets/DEFERRALS.md` `D-R7DEP.2-1` (+ `GD-UX-PAIDLEG.R7`'s
  verbatim cell); `docs/build/runs/R7DEP.2.md` (the first dispatch's exact command + the 402
  evidence); `packages/journeys/AGENTS.md` (paid-leg authority + spend guards);
  `packages/journeys/src/r7legs.ts` (`U6.chat`) + `src/steps.ts` (`R4` — the paid chat-turn
  row the U6 paid run rides) + `src/session.ts` (`stableIdentity` / `returningUser("a")` →
  `test+jrn-a@rhema.tools`) + `scripts/live/funded-tenant.mjs` (the committed
  funded-identity probe) + `scripts/live/funded-window.mjs` (the funded-stable-tenant
  contract — "fresh flagged tenants carry only the 10-cr daily allowance — their launches
  402").
- **Base:** `stevevitali/r7rec-1-reconcile` @ `da233783` (the chain tip).
- **Branch:** `stevevitali/paid-u6-redispatch` · **Harness:** devin-desktop/swe-2-high/subagent.
- **Started:** 2026-11-08T20:4xZ · **Closed:** 2026-11-08T21:0xZ.
- **Live stage:** prod, **read-only** — the funded-identity precheck is the scope; the paid
  dispatch was gated on it and **did not run**.
- **Production mutations:** none — IAP tunnel + `funded-tenant.mjs` dry-run (no `--execute`)
  + `funded-query.mjs` `BEGIN READ ONLY … ROLLBACK` reads only. No `admin-cli`, no seed
  writes, no fixture mutation (the funding seam is the operator's act, per the dispatch's
  own rule — never mutate the funded identity or its guards to force a green).

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). `D-R7DEP.2-1` is the row this run
verifies: its unblock condition is "a new operator ruling re-authorizing a paid dispatch
(and an owner fix making the journey identity fundable — `F-R7DEP.2-17`)". The ruling half
landed (LEDGER PHASE LOG 2026-11-08 "approved, continue"); the fixture half is what this
precheck measures. Adjacent rows: `D-R7DEP.2-2` (Stage-B reds → the 250g insert, F-9…F-14 —
**F-17 is not in that insert's scope**; BL-105 carries it under "defect/authority"),
`D-R7TOUR.2-1` prod arm (F-9 insert). No other OPEN row in blast radius.

## Verdict — UNFUNDED → STOP (the authorized dispatch was NOT consumed)

The funded-identity precheck ran first, per the dispatch: prod reads over the operator IAP
tunnel (`gcloud compute ssh rhema-prod-proxy-cptb --zone us-central1-b
--tunnel-through-iap -- -L 15433:10.46.0.3:5432`), system-role DSN
(`postgres`, `pg_roles` bypass probe PASS via `funded-tenant.mjs`'s own trust read —
D-STB.5b-1 honored exactly).

Measured 2026-11-08T20:5xZ:

| Row | Reading |
|---|---|
| `test+jrn-a@rhema.tools` user | `01M6X4ZCS4TXHN1CBZG6EW67FQ` (created 2026-11-08T08:39:07Z — the Stage-B mint) |
| Current workspace | `01M6X4ZCSA4XV2ZGM3KFJZ79ZE` — `is_test=true`, ~12.2 h old (FRESH inside the 26 h purge window) |
| Billing account | `01M6X4ZCSAJSSXNMPVGFMJMAME` |
| `credit_ledger` on that account | **0 rows** — no grant of any bucket (included/topup/trial_pocket/daily/promo) has ever landed |
| `credit_balances` on that account | **0 rows** — nothing to read; the wallet is empty by construction |
| `test+jrn-b@rhema.tools` (sibling, for census) | billing `01M6X58CKCX4SRTX05NMNSYHPV` — `daily` bucket **10 cr** only (the free daily allowance; not a funded identity either) |
| ISO-week flagged-tenant proxy spend (the guard's exact scope) | **$3.34352 / 96 rows** — unchanged since the first dispatch's read; < $5 `WEEKLY_PAID_CAP_USD` |
| `funded-pause.json` | absent (no cap_overrun sentinel; none created, none cleared) |
| Deployed SHA (provenance re-read) | `e578a767fbff5e8e0cfb7282541ba2bb3172744b` on web + api `/healthz` — unchanged |

**Reading:** the journey identity the `R4` leg binds (`returningUser("a")` →
`test+jrn-a@rhema.tools`, hardcoded in `steps.ts`) is **unfunded** — identical in kind to
the first dispatch's 402 state. `F-R7DEP.2-17` (journey identities get no credit path on
prod) is un-fixed: the 250g_R7FIX.7 insert covers F-9…F-14 only, and the funding seam is a
house-grant (`admin-cli house-grant`, printed verbatim by `funded-tenant.mjs` —
`--billing-account 01M6X4ZCSAJSSXNMPVGFMJMAME`) that only the operator executes. No ledger
row exists on the current billing account to stale-check; the workspace is purge-fresh, so
the blocker is the **absent grant**, not a stale tenant.

Per the dispatch's own stop rule — **the funded-identity verdict is UNFUNDED, so the ONE
authorized re-dispatch was not burned.** No browser launched, no `--paid` dispatch, no turn
POST. The re-attempt authority stands unconsumed; a funded fixture (or an operator ruling
on `F-R7DEP.2-17`'s disposition) is what re-arms it.

## What did NOT happen (and why it is honest)

- **No paid run.** Burning the one authorized re-dispatch into a foreknown 402 would spend
  the authority, not the dollars — the first dispatch already proved that outcome.
- **No fixture mutation.** `funded-tenant.mjs --execute` (the created_at freshness arm —
  unnecessary, the tenant is 12 h fresh) and `admin-cli house-grant` (the credit seam) were
  both left unexecuted: mutating the funded identity to force a green is exactly what the
  dispatch rules prohibit.
- **No second precheck path.** One tunnel, one DSN, the committed probes — no alternate
  measurement was needed; every read is reproducible verbatim above.

## Spend

**$0.00** — zero usage_records delta over the window (the ISO-week figure is the
pre-dispatch guard read, not spend this run caused). Infra: one IAP SSH tunnel, no billable
act beyond the existing proxy MIG. `GD-UX-PAIDLEG.R7`'s voided-by conditions unmet: no ≥$10
spend, no dispatch at all — the authorization stays intact for the funded retry.

## Disposition

- `D-R7DEP.2-1` — **OPEN** (dated note appended 2026-11-08): re-dispatch attempted under
  the recorded ruling; blocked on the fixture (identity still unfunded — `F-R7DEP.2-17`),
  not the product. The unblock condition now reads: the funded fixture (house-grant on
  jrn-a's current billing account, or the `F-17` owner fix) THEN the one authorized
  re-dispatch at `e578a767` (or the then-deployed SHA).
- `nextTicket` / `lastCompleted` — **unchanged** (200_R6WATCH.1 clock-bound ≥
  2026-11-11T04:0xZ; R7REC.1 last completed). This run is authorized chain work, not a
  manifest-order advance.

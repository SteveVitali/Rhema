# r6watch-early — the EARLY expedited R6WATCH.1 post-launch read at launch+12d (records)

Run-time insert under the operator's verbatim 2026-11-09 expedite ruling.
**Base: `stevevitali/r7fix-9-paid-leg-pin`.** mergePolicy=OPERATOR — never merge.

## Authorization

Operator ruling 2026-11-09, verbatim (recorded `docs/build/LEDGER.md` PHASE LOG):
*"clock rows? can we expedite these somehow? i want you to do everything remaining,
including prod deploy, etc."* — disposition (a): `200_R6WATCH.1` runs an EARLY expedited
read NOW at launch+12d; every datum records its exact timestamp + window-age honestly;
the contractual launch+14d read still runs ≥ `2026-11-11T04:0xZ`. **This PR's evidence is
disclosed interim evidence — NOT the REQ-WATCH-1 14-day artifact and not a substitute.**
The owed on-time read is `D-R6WATCH-ON-TIME`; `nextTicket` stays `200_R6WATCH.1`.

## What ran (prod read-only, $0)

Every committed R6WATCH.1 query verbatim over the IAP tunnel
(`rhema-prod-proxy-czpk` → `10.46.0.3:5432` via `127.0.0.1:15433`, system-role `postgres`,
`BEGIN READ ONLY`, collected 2026-11-09T21:1xZ, window-age ≈12.7 d) + BigQuery
`billing_export_prod` tableList + Cloud Logging `[slo] weekly`. Zero writes, zero prod
mutations, no paid dispatch, no preview, no deploy.

## Headline

**The organic cohort is still empty end-to-end at launch+12d** — zero organic signups
(all 60 in-window `signup.completed` rows are `test+*@rhema.tools` synthetics on `is_test`
workspaces), zero organic runs (the one non-test run is the named smoke's `01M60AR5…`,
`unverified`), zero organic admissible cost observations (3 exist — 1 named-smoke + 2
is_test workspaces). Raw anonymous traffic: `landing.viewed` n=1079, `landing.dropzone_used`
n=42 (bounded additive error per the committed cohort clause). All 11 named rows read
`not-yet-elapsed` at this window-age — recorded, never faked green; `GD-WATCH.R6`
dispositions are the on-time read's act. Machinery proven live: `slo.review.weekly` fired
today (ok6/breach0/empty7/unmeasured2), `billing.estimator-refit` ran 2026-11-01 + 11-08
(4 insufficient-sample report rows), `cost_card_cells` 48 @ `econ1@2026-11-08`;
`billing_export_prod` still zero tables.

## Requirement IDs

REQ-WATCH-1 (interim read under the expedite ruling — the requirement's 14-day artifact
stays owed via `D-R6WATCH-ON-TIME`)

## Records

`docs/build/runs/r6watch-early.md` (full per-row evidence) · `docs/tickets/DEFERRALS.md`
(new `D-R6WATCH-ON-TIME` + dated `not-yet-elapsed` tails on the 11 named rows) ·
`docs/build/BUILD_INDEX.md` row 309 · `docs/build/LEDGER.md` PHASE LOG + CURRENT STATE
(`nextTicket` stays `200_R6WATCH.1`, noted explicitly).

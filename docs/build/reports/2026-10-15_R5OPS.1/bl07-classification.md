# BL-07 classification — `unverified_review_rate_7d_pct` = 100

**Run:** R5OPS.1 (2026-10-15) · **Source:** prod `rhema` DB over the IAP tunnel, system role,
read-only (`begin read only … rollback`) + `gcloud logging read` on `rhema-prod-ops-alert-catcher`.

## The verdict: TEST-TRAFFIC-ON-AN-UNFLAGGED-WORKSPACE, n=1 — self-resolved by window aging

| fact | value |
|---|---|
| driving row | `runs.id = 01M41AE99M49Q5HNG4M9S6106Q` |
| workspace | `01M2V3PM11XSF05VJ9G01PM5ZB` — `is_test = false` (the operator's own workspace) |
| requested_by | `14stevevitali@gmail.com` (the operator's account) |
| ended_at | `2026-10-03T17:27:36.337Z` |
| label | `delivery->>'label' = 'unverified'` |
| marker in inputs | `changedSince.hunks[].after.text` carries `[autosave SLO probe — edit 1]` — an instrumented SLO-probe edit leg, i.e. chain/test traffic launched from a **non-test-flagged** workspace |

The probe (`packages/orchestrator/src/slo.ts`) counts completed `workflow='review'` runs on
non-test workspaces in the trailing 7 days: `100 × unverified / total`. Between
2026-10-03T17:27Z and 2026-10-10T17:27Z the window contained exactly **one** such run — the
operator's own probe-leg — and it was `unverified`, so the rate read **100** and paged the
catcher every ~5 min (verified in Cloud Logging: `ops_alert_received` `slo_violation`
`unverified_review_rate_7d_pct` value=100, every 5 min through `2026-10-10T17:26:17Z`).

At `2026-10-10T17:27Z` the driving row aged out of the 7-day window; the last page is
`2026-10-10T17:26:17Z` — the alert **stopped on its own** without remediation. Re-running the
probe verbatim now returns `rate = null` (`n = 0` — empty ⇒ `empty` status, not a breach).

## Classification

- **Not real-tenant degradation.** Zero real-user completed reviews exist in the window (the
  only non-test row is the operator's own instrumented leg; all other completed reviews are on
  `is_test` workspaces with `label = null`, which land in neither numerator nor denominator).
- **Not a probe defect requiring remediation.** The probe counted what it is specified to count;
  an n=1 window is thin but honest. The classification lesson: a chain-leg executed under the
  operator's real (non-`is_test`) workspace becomes SLO-visible real-tenant traffic — future
  instrumented legs should run on a flagged workspace.
- **Pre-remediation gate satisfied.** Per §7 BL-07 the classification landed from the rows
  before any remediation; no remediation is owed for this breach (it self-resolved; if organic
  unverified deliveries later drive it red, that is a real-user finding, not this artifact).

## Adjacent live datum (recorded, not fixed — scope-bound)

`ops_alert_received` at **2026-10-15T03:15:33Z** carried a NEW alert kind:
`{"kind":"balance_divergence","reportKey":"nightly-assertion","detail":[…6 billing accounts,
bucket="included", expectedAvailable=3860, actualAvailable=0, expectedHeld=-3860, actualHeld=0]}`.
Six accounts (incl. `01M4XHC47QCYYRE8ZG5XS442N5`, `01M4XRYK9N62274NC9MJNYPJHT`,
`01M4YDXNW5CN35HS7R5SBBA3MG`, `01M4YF8SQ79YSXQTY2XS8B9CY8`, `01M4YFJ75AR46J6WBR8YM4B67F`,
`01M4YG2K0CAYPTHST3DGGJQKMV`) read `expectedHeld=-3860`/`actual=0` — the nightly balance
assertion diverging on included-bucket accounts (likely the soak's test-tenant accounts — same
classification exercise owed). → LEDGER OPEN FINDINGS; owner: a BL-07-family follow-up.

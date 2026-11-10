# paid-u6-run — ruling arm (b): `house-grant` on jrn-a + the ONE re-authorized paid U6 dispatch (records)

Run-time insert (the R6DEP.2/3/4 + R7DEP.3 precedent — records-only PR). **Base:
`stevevitali/r7deploy-tip`** (chain tip `dc1ba197`).

## Authorization

Operator ruling 2026-11-08, verbatim (recorded `docs/build/LEDGER.md` PHASE LOG):
*"…And what do you mean 'fund jrn-a'? I just need to approve the cost to you? … Please proceed
with everything and keep me updated."* — disposition (b): `admin-cli house-grant` funds
`test+jrn-a@rhema.tools`, then the ONE authorized paid run fires at the deployed SHA under
`GD-UX-PAIDLEG.R7`'s cap (*"if we do a manual paid run, we must keep it under $10"* — exactly
one dispatch, `capUsd` $0.50 ∈ [$0.50,$10), declared `--headroom`, never nightly, consumed-once;
voided-by ≥$10 / a second run / revocation — none met). Merges remain the operator's
(`mergePolicy: OPERATOR`).

## What this PR carries (records only — no product code)

- `docs/build/runs/paid-u6-run.md` — the run ledger (precheck → grant → dispatch → evidence →
  dispositions).
- `docs/build/reports/2026-11-09_paid-u6-R4/` — the leg's `report.json` + `R4.png` at
  provenance-matched `b8307a40`.
- `docs/tickets/DEFERRALS.md` — `D-R7DEP.2-1` → **DONE** (dated tail); new row **D-PAIDU6-1**
  (F-PAIDU6-1, leg-side).
- `docs/build/BUILD_INDEX.md` row 306 · `docs/build/LEDGER.md` PHASE LOG done + ci-boundary
  lines · `docs/build/pr/paid-u6-run.md` (this body).

## The funded write + the ONE dispatch — facts

- **Precheck (read-only arms):** `funded-tenant.mjs` dry-run + `funded-query.mjs` over the
  operator IAP tunnel (`rhema-prod-proxy-czpk` → `127.0.0.1:15433`, `rhema-prod-proxy-database-url`
  system DSN — `pg_roles` bypass ✓): live jrn-a tenant `01M707G9FDAAJ1WJ8RYJCD359X` / billing
  `01M707G9FDM3GKWX2MCKY1TFVC` at **zero** (no `credit_ledger`/`credit_balances` rows). The
  ruling-named ws `01M6X4ZCSA4XV2ZGM3KFJZ79ZE` was purge-reaped (0 members) — the grant went to
  the identity's current tenant; recorded honestly.
- **`admin-cli house-grant`:** 10,000 promo cr, expires 2027-02-07 → billing
  `01M707G9FDM3GKWX2MCKY1TFVC` (ledger `01M70QMMRQJMVK1PXG2Y5SS1FM`, audit
  `01M70QMMXGVART75CAPGMCEW40`). Funded state re-verified: 10,000 available / 0 held on both
  arms. **Funded-state verdict: FUNDED.**
- **The ONE dispatch:** `--paid --steps R4 --headroom 0.5 --expect-sha b8307a40` —
  provenance match (web+api). The turn POST succeeded (no 402 — the F-R7DEP.2-17 funding seam
  is discharged by evidence): `chat_turn` run `01M70QP0XCS5BZ9TPPCYYVA0J8` **completed**
  (run_events seq 1–19; `answer` `predicatesPassed:true`; reply turn-result version
  `01M70QRA2SJMNEQ726JZGQ36DY`).
- **Money truth (REQ-SPEC-32):** hold 40 → debit **14 promo cr** → release 26 (`cost.final` 14;
  balance 9,986/0 held) — debits == proxy-metered credits == `spent_credits`. **Metered spend
  $0.092175** (8 `source='proxy'` `usage_records`; the `sdk_estimate` $0.1218 shadow recorded as
  the committed/metered activation class, not the meter of record). Under leg cap $0.50, ruling
  bound $10; ISO-week flagged-tenant total $0.0922 < $5.
- **Leg verdict: FAIL (honest red, recorded — not hidden).** The leg picked the R7b
  `data-chat-turn="optimistic"` placeholder row (`chat-panel.tsx:434`) and polled
  `/chat/turns/optimistic` to deadline — leg-side selector collision **F-PAIDU6-1 → D-PAIDU6-1**,
  not a funding or product defect. **No second dispatch** — the one-run authority is consumed;
  the re-proof rides the Monday `journeys.yml` paid arm once an owner fix lands.

## Dispositions

`D-R7DEP.2-1` → **DONE** (its named verification facts all evidenced) · `D-PAIDU6-1` **opened** ·
`nextTicket`/`lastCompleted` UNCHANGED (`200_R6WATCH.1`, clock-bound ≥ 2026-11-11).

## Harness

devin-desktop/swe-2-high/subagent

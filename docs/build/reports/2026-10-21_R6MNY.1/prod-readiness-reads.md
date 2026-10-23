# R6MNY.1 — prod read-only evidence (REQ-LCH-5 a, a′, b)

Read 2026-10-21 over the IAP tunnel (`rhema-prod-proxy-3ms6`, us-central1-c → 10.46.0.3:5432) with the
**system-role** DSN (`postgres`, password from `rhema-prod-alloydb-password` — never the app role;
FORCE RLS would read these tables empty). **No writes; no PII** — every figure below is a count or a
bucket-level aggregate. Tunnel closed after the reads.

## (a) Metered-notice dry-run

```bash
DATABASE_URL=postgres://…@127.0.0.1:15433/rhema EFFECTIVE_DATE=2026-12-01 \
  node scripts/live/send-metered-notice.mjs          # default = dry-run
```

- `mode=dry-run` — nothing written, nothing sent (the script's own close-out line).
- **recipients = 2** (active paid subscriptions / top-up holders; test tenants excluded).
- Because the count is **> 0**, the effective-date critical path binds: the notice `--send` (a
  `GD-PREAUTH-ACTS.R6` item for R6DEP.1, after deploy) must name an `EFFECTIVE_DATE` ≥ 30 days after
  the send, and flip 1 (`debitMode → metered`) must not precede that date (REQ-BILL-2 / ADR-014 §1;
  `docs/ops/debit-mode-flip.md` step 0). 2026-12-01 was the dry-run placeholder only — the send
  chooses the real date.
- The rendered copy (subject + text + html) is asserted claim-by-claim in
  `packages/ledger/src/metered-notice.test.ts` — charge-what-we-meter, cap-as-ceiling, refund
  classes, top-up carry-over, no figure literals.

## (a′) Calibration preconditions 1–2 — read on prod

Script: `node scripts/live/money-flip-readiness.mjs` (`integration/src/money-flip-readiness.ts`)
against the same DSN. Raw JSON: `readiness.json` in this directory.

| Table / signal | Prod value |
| --- | --- |
| `cap_calibration_reports` | **0 rows** — no adopted rows at all |
| `cost_observations` | 199 harvested; admissibility split: `no_proxy_rows` 116, `not_completed` 65, `pre_preset_fix` 18 → **admissible = 0** |
| `cost_card_cells` | 46 (incl. `review/standard/base/xs/completed` n=1 p95=919 cr; the 116-row `full_board/frontier/xs` cells are zero-credit fixture legs) |
| `estimator_cells` | **0** — no instrumented folds persisted; the shipped modeled specs are the live estimator |
| `usage_records` | 6,889 (6,425 `source='proxy'`) — the proxy meter is metering |
| `runs` terminal | 79 (completed 20, cancelled 26, failed 33) |
| `capFor` per paid surface | `null` on all five (review / revise / fact_check / draft / profile_voice) |

**Verdict — both runbook preconditions UNMET:**

- Precondition 1 (adopted cap rows for paid-surface cells): **unmet** — `cap_calibration_reports`
  has zero rows because zero `cost_observations` are admissible (admissibility = completed +
  verified + paid + proxy-metered on current presets). Paid traffic is the 2 accounts the notice
  counts.
- Precondition 2 (in-sample `cap_reach_pct ≤ 10%` on adopted buckets): **unmet** — vacuous; no
  adopted buckets exist to evaluate.

**An unmet precondition is a finding, never flipped past** — `debitMode → metered` stays gated on
this read until rows land; `docs/ops/launch-flips.md` flip 1 carries the gate.

**What the funded wave (REQ-DISC-1 / the carried funded-window legs) contributes:** paid, completed,
proxy-metered runs on current presets are exactly what `admissible` selects — each funded leg mints
an admissible observation. Once a cell reaches `CAP_REFIT_MIN_SAMPLE` (5) in the 30-day window,
`refitCapMultipliers` writes an adopted report row and `cap_reach_pct` becomes measurable; the
`cost_card_cells` p95s then bind the "what it covers" cross-check (below), and `estimator_cells`
folds turn the live estimator from modeled to instrumented.

## (b) "What it covers" recompute (GD-BL13.R6)

`planCoverageLine` now divides by the estimator's **raw** figure and floors to 0.1 — a plan never
promises loops its credits don't buy. Recomputed against prod `surfacePricer()` (modeled specs —
`estimator_cells` is empty):

- Writer (2,000 cr): `≈0.7 essay Reviews on Base · ≈0.3 on Balanced · ≈0.1 on Frontier`
- Studio (12,000 cr): `≈4.6 essay Reviews on Base · ≈2 on Balanced · ≈1 on Frontier`
- Studio Max (26,000 cr): `≈9.9 essay Reviews on Base · ≈4.5 on Balanced · ≈2.2 on Frontier`

Measured cross-check (`cost_card_cells` p95 for `review/standard/*/m-band/completed`): **no cells
exist yet** — the essay band 'm' (5,000 words) has no completed measured runs. The printed figures
are the modeled estimator's — consistent by construction (the page renders through the same
`surfacePricer()`), and no measured cell contradicts them. `overPromises: false` for every tier is
therefore "not contradicted", not "measured-verified" — the funded wave supplies the binding data
(finding above).

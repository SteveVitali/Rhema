# 255_R6WATCH.2 — early standing-watch re-read (the 11 GD-WATCH.R6 rows + unmet clock reads)

**Status:** open · **Phase:** R6 tail insert · **Prereqs:** merged `main` · **Size:** S–M (read-only + dispositions) · **Ruling:** operator 2026-11-11 — "others we can pick up now and ignore dates if it makes sense" (the 2026-11-25 re-read and the CLK-1/-2/-4/-5 clocks run early under this ruling; the paid-leg re-proof + the external pen test explicitly stay deferred).

## Run

Re-run the committed `GD-WATCH.R6` query set against PROD, read-only (the `200_R6WATCH.1` run's IAP-tunnel `BEGIN READ ONLY` pattern — read `docs/build/runs/R6WATCH.1.md` and `docs/build/runs/r6watch-early.md` first; `scripts/live/first-finding-latency.mjs` works directly post-#313).

1. Each of the 11 watch rows (owner `operator` · trigger `slo.review.weekly` · was re-read 2026-11-25T04:0xZ) gets a fresh datum with exact UTC timestamp + window-age: D-R5OPS.1-1, D-COST.1-2, D-SLO.1-5, D-SLO.1-7, D-SLO.1-8, D-ECON.1-3, D-ECON.1-4, D-ECON.2-5, D-ECON.2-6, D-ECON.2-7, D-P1.17-2.
2. The four unmet clock reads the §R6.3 deviation row names — CLK-1 (`D-BL38.1-2`), CLK-2 (`D-FIX.1-4`), CLK-4 (`D-COST.1-1` / `D-OPS.1-3`), CLK-5 (`D-ECON.1-1` / `D-PRB.08-1`) — run their committed reads where query-only; a carrier needing a live act beyond read-only is dispositioned, never faked.
3. Disposition honestly per `GD-WATCH.R6`'s rules: a row with matured evidence discharges; a still-empty cohort keeps the watch OPEN with a re-dated trigger — an empty cohort is a datum, not a failure.
4. Re-check the `usage.reconcile` daily-403 datum and `billing_export_prod` zero-tables datum (both surfaced 2026-11-11) — their owner tickets are 257/258; here you only re-read the datums for freshness.

## Verify

- Every query read-only via the committed scripts; exact timestamps recorded.
- `docs/build/runs/255_R6WATCH.2.md` + `docs/build/pr/255_R6WATCH.2.md`; DEFERRALS dated tails on every re-read row; BUILD_INDEX + LEDGER `done`/`ci boundary`; `gh pr create --base main`; `check-append-only --base origin/main`; `check-build-memory`.

## Constraints

Never merge; no prod writes; no paid dispatch; no preview/deploy. $0 spend expected.

# R6CLK.1 — dated clock reads (six verdicts) + the R6WATCH.1 expansion

**Requirements:** REQ-CLK-1 REQ-CLK-2 REQ-CLK-3 REQ-CLK-4 REQ-CLK-5 REQ-CLK-6 · manifest
row 199 · mergePolicy=OPERATOR (worker never merges) · $0 · prod read-only throughout
(system-role DSN, `BEGIN READ ONLY`; zero writes)

## Per-read verdicts

| Read | Verdict | Evidence |
|------|---------|----------|
| **CLK-1** `project.purge` `01M3SK380GQX41RKMD4KVFB34Q` | **not yet — 2026-10-30T21:41Z** | armed `pgboss.job` `57bbef6f`, `state=created`, `start_after=2026-10-30T21:41:10.952Z`; project still tombstoned |
| **CLK-2** first Monday digest claims the stale-voice persona exactly once | **not yet — next sweep 2026-11-02T04:45Z** | `notify.sweep.weekly` fired 10-26T04:45Z (job `da54ea2b`, all fan-out completed) and claimed **zero** — no stale persona; no `T16VOICE` substrate on prod (`persona_profiles` last built 09-26; funded wave parked) |
| **CLK-3** hand-dated tombstone destroyed + unreferenced `s3_key` objects | **CLOSED** | `pgboss.job` `357a8ba1` completed 2026-10-21T21:59:40.564Z; worker log `purged:true, deleted{projects:1}, objectsDeleted:0`; residue probe clean — `D-P1.04-2` flipped DONE |
| **CLK-4** billed actuals ≥ 24 h post console-flip | **not yet** | `billing_export_prod` holds **zero tables** (never populated); console-flip timestamp unrecorded; observed-side `billing-read.mjs` $256.65/mo appended (list-price, not actuals) |
| **CLK-5** green admin-key `usage.reconcile` | **not yet** | hourly job completes but `report=skipped, window=skipped` — `rhema-prod-anthropic-admin-key` still serves the placeholder; **the H10 "provided" attestation never reached the secret** |
| **CLK-6** T8 export 7-day expiry → 410 | **CLOSED** | live `GET /account/export/download?id=01M3D6BF8PT52GTP8KFQ5NMX22` → `HTTP 410 {"error":"export_link_expired"}` at 2026-10-28T05:39:45Z on the organic row (expired 10-02) — `D-P1.18-1` organic arm discharged |

## R6WATCH.1 expansion

`docs/tickets/200_R6WATCH.1__post-launch-read.md` expanded skeleton → full ticket:
launch `2026-10-28T04:0xZ` → window end `2026-11-11T04:0xZ`; the organic non-test cohort
clause (is_test + the two named smokes + synthetics); committed queries + per-row
sample thresholds for D-R5OPS.1-1, D-COST.1-2, D-SLO.1-5/-7/-8, D-ECON.1-3/-4,
D-ECON.2-5/-6/-7, D-P1.17-2; the `GD-WATCH.R6` close-or-alert contract. **The watch
read is explicitly not run** — `Run:` forbids starting before 2026-11-11T04:0xZ.

## Residuals (dated notes, not closures)

- **Nightly literal arm** (D-OBS.1-3/D-SPA.28-1, GATE-LAUNCH threshold 6): crons paused
  by R6CI.1 10-20 (ADR-115 D7), restored by the R6SWP.1 merge 10-27T22:49Z; last
  literal scheduled run 10-21 (failed); first post-restore firing due today 06:05Z
  (historically ~4–7 h late). Arm stays OWED; GATE-LAUNCH readout dated note appended.
- **Provenance:** `b953c55e` **is an ancestor of** `main` @ `73c1586` — `main` ⊋ prod
  by merge+ledger commits only (deploy-neutral).

## Pre-window organic-cohort glance (labeled, not a REQ-WATCH-1 claim)

~1.6 h post-launch: **zero organic signups, zero organic runs** — only the smoke
account and `test+j*` journey rows; `landing.viewed` n=4 post-launch (anonymous,
unexcludable). Recorded as the baseline snapshot for the 14-day read.

## Operator asks surfaced

1. `rhema-prod-anthropic-admin-key` — H10 recorded the admin key "provided" 10-21 but
   `versions/latest` still serves the placeholder; re-check what was actually seeded.
2. `billing_export_prod` — dataset exists but emitted zero tables since ~09-29;
   re-check the Billing→BigQuery export console config (+ record the flip date).
3. "Classes P1–P5" in CLK-4 was read as the top-five billed service classes — correct
   me if the intended classes differ.

## Verification

- Live-executed: all six reads probed prod read-only at the dated times; the 410 was
  re-executed (not carried from the earlier session).
- `check-build-memory.sh` · `check-append-only.mjs --base 73c1586` · `ci-boundary.sh`
  — recorded at final head (`logs/ci-R6CLK.1.json`).
- DEFERRALS dated tails on all eight touched rows; BUILD_INDEX row 234; LEDGER advanced
  to `200_R6WATCH.1`. No ADR (no deviations — one interpretation flag above).

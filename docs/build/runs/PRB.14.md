# PRB.14 — Run resilience + cost fidelity

- **Spec:** `docs/tickets/28e_PRB.14__run-resilience-and-cost-fidelity.md`
- **Base:** `stevevitali/prb-13-open-selfserve-signup` @ `13891cf`
- **Branch:** `stevevitali/prb-14-run-resilience-cost-fidelity`
- **Config:** implement-spec (deterministic only — no live/deploy/prod commands; the on-prod
  verification of every sweep/ledger/fold leg is `28h_PRB.17` per the ticket)
- **ADR:** none (no deviations — the ticket's own design is the run.reap-adjacent sweep, not the
  outbox; see "Decisions" below)

## Deferrals read

`docs/tickets/DEFERRALS.md` read at start. The ticket names the rows it discharges; each got a
dated evidence cell:

- **D-P0.08-4** — CODE-half DONE (the stuck-`provisioning` sweep landed + tested).
- **D-P0.10-2** — CODE-half DONE (the `queued`-stranded re-enqueue + parked-gate re-arm landed +
  tested).
- **D-P0.11-1** — CODE-half DONE (the three ledger call-sites are now *proven* by call-site tests).
- **D-P0.08-2** — CODE-half DONE (`renderCredits` bound at both production call-sites + the ±2%
  deterministic test).
- **D-P0.15k-1** — MACHINERY-half DONE (revise/profile_voice fixtures + fold call-site inputs).
- **D-P0.04-2** — CI-half DONE (`images` job stamps + asserts the real `PROTOCOLS_VERSION`).
- **D-P0.15d-2** — re-assessed, **left OPEN** with the dated note (below). No new rows appended.

## What landed

### 1. The stranded-run sweep — `packages/orchestrator/src/stranded-sweep.ts` (NEW, 194 lines)

One system-scoped pass (`sweepStrandedRuns`) covering both enqueue-after-commit crash windows the
heartbeat reaper can never see (a `provisioning`/`queued`/parked run has no heartbeat):

- **Leg A (D-P0.08-4):** `provisioning` runs whose `state_since` is older than the launch SLO
  (`STUCK_PROVISIONING_MS` = 15 min — the ≤3-attempt launch + cold launcher build fit inside it) are
  re-read under `for update` and driven through the ordinary `provisioning → failed` edge
  (`failure.code = "provisioning_timeout"`). The terminal transition clears the writer lock; the
  sweep then releases the hold (`release:<runId>`) and revokes minted credentials **in the same
  tenant tx** — a stuck launch settles money + lock + credential atomically.
- **Leg B (D-P0.10-2):** `queued` runs older than `STRANDED_QUEUED_MS` (60s — pg-boss picks a live
  job up in seconds) get their launch job re-sent, singleton-keyed on the run id so a still-active
  `run.start`/`run.resume` dedupes and a re-sweep is a no-op. `current_attempt > 1` sends
  `run.resume` (not `run.start`) so the worker's `reDebitOnResume` call-site still fires. A stranded
  consent (`awaiting_consent → queued` with a hold placed in the resolve tx) re-launches so its hold
  is *consumed by the run* — never leaked, never wrongly released.
- **Leg C (D-P0.10-2, consent half):** unresolved, unheld gates on parked
  (`waiting_gate`/`awaiting_consent`) runs whose effective deadline exists are re-armed via
  `scheduleGateExpiry` (deadline-keyed singleton — a healthy arming dedupes). This is the only
  arming site a `confirm_cost` 7-day expiry has: an overdue one fires `cancel` and releases the
  hold, so a stranded consent never holds credits forever.

Every mutation goes through the existing transitions/queue seams inside the run's own tenant
transaction — the sweep adds no new write path (the ticket's cross-cutting invariant).

### 2. Worker wiring — `apps/worker/src/{run-jobs,main}.ts`

`handleStrandedSweep` wraps `sweepStrandedRuns`; `WorkerRunDeps` gains the required `systemExec`
(the BYPASSRLS/system-scoped scan seam — bound like the parked sweep's, `systemDatabaseUrl` else the
main pool). `main.ts` runs it on the existing 1-min `run.reap` cron right after `handleRunReap`,
logging each outcome.

### 3. Ledger call-sites proven — `apps/worker/src/ledger-jobs.test.ts` (NEW)

The P0.15c note said the wiring existed; this ticket *proves* it against a real `SqlHoldLedger` on
PGlite (D-P0.11-1):

- `reDebitOnResume` — invoked from the `run.resume` consumer in `main.ts` after a successful
  `handleRunResume`, resolves the billing account itself, applies `resume:<runId>:<attempt>`.
  Tests: refund→resume re-debits the refunded phases; a same-attempt replay is a no-op; a second
  refund→resume **episode** re-debits again (per-episode key — the money-correctness point);
  no-refund resume is a no-op.
- `handleParkedSweep` — the hourly `run.sweep_parked` cron handler cancels an expired parked run
  through the ordinary transition and releases the hold (balances read back whole); a
  still-parked run is untouched.
- `capMultiplier` — `run-routes.ts` already consumes `deps.circuitBreaker` at creation
  (bound to `circuitBreakerState` in `server.ts`); new route test: a tripped breaker doubles the
  server-derived cap (estimate 1394 → cap 4182, overriding the crafted client cap as before).

### 4. Provisional `usage.tick` — D-P0.08-2 code half

Both production call-sites bind `rateTableCreditRenderer`: the pod harvest route
(`run-routes.ts` → `harvestStep`'s `renderCredits ?? rateTableCreditRenderer`) and the phase loop's
`PhaseLoopDeps.renderCredits`. New deterministic tests:

- `internal-api.test.ts` — drives the REAL `harvestStep` + renderer over a production-scale snapshot
  and asserts `provisionalCredits` lands within **±2%** of the proxy-priced figure
  (`platformCredits(listCostUsd(usage, RATE_TABLE_V1, TIER_MODEL.balanced))` — the deterministic half
  of §12.7 cross-check-1); the row is `sdk_stream`/`list_cost_usd=0` and the `usage.tick` carries
  `spentCredits + credits`.
- `phase-loop.test.ts` — the loop's provisional row equals `Math.round(proxy-priced)` exactly
  (display-round only; the proxy's `source:'proxy'` rows stay the meter — no double charge).

### 5. Estimator fold machinery for `revise` + `profile_voice` — D-P0.15k-1

- **Fixtures (seed):** each project's working draft now carries a head artifact_version
  (`<proj>_art2`/`<proj>_av2`, `drafts/v2.md`, mutable, placeholder sha `c`×64) — the revise target
  previously had *no materializable bytes*; plus a seeded author body-of-work for voice profiling
  (`per_seed` persona → `conn_seed` → three `included` `discovered_items` + `sample_versions`,
  placeholder `b`×64). Asserted in `seed.test.ts`.
- **Fixtures (live fixup):** `live-prepare-fixture.ts` repoints the three `<proj>_av2` working-draft
  heads AND the three `sv_seed*` sample rows to real uploaded prose (three original sample pieces) —
  same placeholder→real-bytes pattern as the `_av1` drafts.
- **Fold call-site:** `createDbInstrumentedFolder`'s facts query now measures `movesWithResearch`
  (the run's own `obligation_transitions` count — a revise estimator term) and falls back to the
  run's frozen §9.3 `corpus_size_at_build` for a voice run's `wordsRead` (a voice run has no
  draftId). `buildInstrumentedMeasurement` already maps `profile_voice` → its `quick`/`full`
  variant; the mapping tests + the new revise `movesWithResearch` assertion cover both workflows.

### 6. Real `PROTOCOLS_VERSION` in `images` provenance — D-P0.04-2 CI half

The `images` job already built `@rhema/protocols` + captured `compute-protocols-version.mjs --bare`;
added the missing **assertion step**: the job now fails unless
`provenance-artifacts/ci-<sha>.json` carries exactly the computed `0.4.0+<sha>` and never
`stub-0.0.0`. Verified locally end-to-end (`record-provenance.mjs` → artifact → grep): the artifact
stamps `0.4.0+64cbeef137b090c2` (26 trio files).

## AC-by-AC evidence

- **Stuck-`provisioning` sweep (D-P0.08-4):** `stranded-sweep.test.ts` — "fails a provisioning run
  past the launch SLO" asserts `failed` + `ended_at` + `failure.code=provisioning_timeout` + writer
  lock cleared + `release` op + credential `revoked_at` + the paired `run.state_changed`; the
  inside-SLO/live-run test asserts both are left alone (the tx re-reads under `for update`).
- **`queued`-stranded sweep (D-P0.10-2):** re-enqueue of a stale `queued` run as `run.start`
  (attempt 1) / `run.resume` (attempt >1); singleton dedup makes a re-sweep a no-op while the job is
  active; a fresh `queued` run (<60s) is left; a stranded consent's hold is consumed (no release
  op). Leg C: an overdue `confirm_cost` is re-armed then `handleGateExpiry` cancels + releases the
  hold; a not-yet-due gate re-arms at its deadline and dedupes on a second pass; held/resolved gates
  are skipped.
- **Ledger call-sites (D-P0.11-1):** `apps/worker/src/ledger-jobs.test.ts` (5 tests) +
  `run-routes.test.ts` (capMultiplier ×2) — all green; `boss.schedule(LEDGER_JOBS.sweepParked,
  "0 * * * *")` + the sweep inside the 1-min `run.reap` cron are the cron registrations.
- **Provisional `usage.tick` ±2% (D-P0.08-2):** `internal-api.test.ts` harvest test (above) +
  `phase-loop.test.ts` proxy-priced assertion.
- **revise + profile_voice fold machinery (D-P0.15k-1):** `seed.test.ts` (corpus + revise-target
  assertions), `instrumented-folder.test.ts` (revise `movesWithResearch`, voice variant mapping),
  `estimator.test.ts` (pre-existing `recordInstrumentedFold` over all four workflows stays green).
- **`images` provenance (D-P0.04-2):** the new CI step asserts `0.4.0+<sha>` and rejects
  `stub-0.0.0`; verified locally end-to-end.
- **Universal AC:** gates below; every new behavior has a failing-if-removed test; REQ ids stamped
  in the PR; deferral rows annotated; no ADR needed (no deviation — see Decisions).

## Verification

| Gate | Result |
| --- | --- |
| `pnpm turbo build lint typecheck` | 111/111 tasks green (1.7s cached pass after the systemExec fix) |
| `pnpm test` | 269 files / 1971 tests passed, 2 skipped (124s) |
| `pnpm check:licenses` | OK — 502 packages |
| `pnpm check:protocol-markers` | OK — 39 public-facing files, no markers |
| `pnpm exec tsx scripts/check-upstream-diff.mjs` | OK — 16 ported files reconcile with pin `5fef4165` |
| `check-build-memory.sh .` | no violations |

Focused evidence: `stranded-sweep.test.ts` 8/8 · `ledger-jobs.test.ts` 5/5 · `phase-loop.test.ts`
6/6 · `internal-api.test.ts` (incl. harvest ±2%) · `run-routes.test.ts` 16/16 · `seed.test.ts` 4/4 ·
`instrumented-folder.test.ts` 5/5.

## Decisions / deviations

- **Sweep, not outbox.** The ticket's own Notes bless the `run.reap`-adjacent scan over a
  transactional outbox ("the honest, small one the rows name"); no ADR needed.
- **Stranded consent's hold is consumed, not released.** Leg B re-launches the run so the hold pays
  for the work it consented to; the release path is leg C's overdue-`confirm_cost` cancel. Matches
  the ticket's "consumed or released" disjunction.
- **`attempt > 1` re-enqueues as `run.resume`.** Sending `run.start` for a resumed run would skip
  the worker's `reDebitOnResume` call-site — the sweep preserves the money path.
- **D-P0.15d-2 left OPEN (dated note).** No real reduced-commit/stop-ack path exists: the sweep
  settles pre-phase `provisioning`/`queued` runs (nothing committed to refund), and
  `completeCancellation` keeps every *committed* phase paid while releasing only the un-debited
  hold remainder (§12.4 — a stop discards the never-committed in-flight phase). `refundPhases`' true
  caller is a cancel-with-partials path that discards a committed phase (or the §14.4 7-day refund
  window) — neither exists; wiring a caller would be hollow, as the row's own rationale says.
- **`systemExec` made required on `WorkerRunDeps`** (mirroring `WorkerLedgerDeps`) — one construction
  site each in `main.ts` (already bound), the worker test, and the G21 harness; all updated.

## Live legs (all → `28h_PRB.17`)

The prod sweep recovery, a real refund→resume re-debit, a real breaker trip, the parked sweep on
prod, the live ±2% proxy-vs-SDK figure, the metered revise/profile_voice folds, and the prod
`deployments` row carrying the real `PROTOCOLS_VERSION` (PRB.15 deploys it).

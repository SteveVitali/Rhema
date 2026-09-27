# PRB.14 — Run resilience + cost fidelity: the stranded-run sweeps, ledger call-sites, provisional credits, estimator fold

**Spec:** `docs/tickets/28e_PRB.14__run-resilience-and-cost-fidelity.md` · REQ-SPEC-24.4/24.5/24.6,
REQ-RUN-9…17, REQ-ARCH-39, REQ-PROD-15, REQ-SPEC-16-adjacent estimator honesty, §12.7 cross-check-1
· **Base:** `stevevitali/prb-13-open-selfserve-signup` · **Stacked PR — do not merge
(mergePolicy=OPERATOR).**

## Summary

> A paying user's run must never silently strand, and the money path must be exactly metered.

Lands the **deterministic halves** of six deferral rows so the prod deploy is safe to open; every
**live** leg is named and deferred to `28h_PRB.17`.

**The stranded-run sweep** (`packages/orchestrator/src/stranded-sweep.ts`, new) — one system-scoped
pass on the worker's existing 1-min `run.reap` cron covering the crash windows the heartbeat reaper
cannot see:

- **Leg A (D-P0.08-4):** a `provisioning` run past the 15-min launch SLO is re-read under
  `for update` and driven through the ordinary `provisioning → failed` edge — writer lock, hold
  (`release:<runId>`), and minted credential all settle in the same tenant tx.
- **Leg B (D-P0.10-2):** a `queued` run older than 60s (the commit→enqueue crash window) gets its
  launch job re-sent, singleton-keyed on the run id so a still-live job dedupes and a re-sweep is a
  no-op. `current_attempt > 1` sends `run.resume` so `reDebitOnResume` still fires; a stranded
  consent's hold is *consumed by the relaunched run*.
- **Leg C (D-P0.10-2, consent half):** unresolved gates on parked runs get their expiry job re-armed
  — the only arming site a `confirm_cost` 7-day expiry has — so an overdue consent cancels and
  releases its hold rather than holding credits forever.

**Ledger call-sites proven** (D-P0.11-1): new worker call-site tests drive `reDebitOnResume`
(`resume:<runId>:<attempt>` per-episode key; a second refund→resume episode re-debits again) and
`handleParkedSweep` (expired parked run → cancelled + hold released) against a real `SqlHoldLedger`
on PGlite; a route test proves a tripped `circuitBreakerState().capMultiplier` doubles a new run's
server-derived cap.

**Provisional `usage.tick`** (D-P0.08-2): `rateTableCreditRenderer` is bound at both production
call-sites (pod harvest route + `PhaseLoopDeps.renderCredits`); the deterministic ±2% test drives
the real `harvestStep` + renderer at production scale against the proxy-priced figure, and the
phase-loop test proves the `sdk_stream` row is `Math.round(proxy-priced)` — display-round only, the
proxy stays the meter of record.

**Estimator fold machinery** (D-P0.15k-1): the seed gains the revise targets (each working draft now
has a materializable `drafts/v2.md` head — it previously had no bytes) and a seeded author
body-of-work (`per_seed` persona + three included samples); `live-prepare-fixture.ts` repoints all
of them to real prose; `createDbInstrumentedFolder` now measures `movesWithResearch` (the run's own
obligation transitions) and reads a voice run's `wordsRead` from its frozen §9.3
`corpus_size_at_build`.

**CI provenance** (D-P0.04-2): the `images` job now *asserts* the provenance artifact carries the
computed `0.4.0+<sha>` (`compute-protocols-version.mjs --bare` over the committed trio) and never
`stub-0.0.0` — verified locally end-to-end.

**D-P0.15d-2 stays OPEN** with a dated note: no real reduced-commit/stop-ack path exists (a stop
keeps committed phases paid and releases only the un-debited remainder; the sweeps settle pre-phase
runs), so `refundPhases` has no honest caller yet.

## Test plan

- `pnpm turbo build lint typecheck` — 111/111 green
- `pnpm test` — 1971 passed / 2 skipped (269 files)
- `pnpm check:licenses` — OK (502 pkgs) · `pnpm check:protocol-markers` — OK (39 files) ·
  `pnpm exec tsx scripts/check-upstream-diff.mjs` — OK (16 ported files) · build-memory check — clean
- New: `stranded-sweep.test.ts` (8), `ledger-jobs.test.ts` (5), the harvest ±2% +
  phase-loop proxy-priced assertions, the capMultiplier route test, the seed-corpus/revise-target
  assertions, the revise `movesWithResearch` mapping test.

## Out of scope (as specced)

Every live verification — prod sweep recovery, real refund→resume re-debit, real breaker trip,
parked sweep on prod, live ±2%, live revise/profile_voice folds — is `28h_PRB.17`. `refundPhases`'
reduced-commit call-site stays deferred (D-P0.15d-2). See `docs/build/runs/PRB.14.md` for the full
AC→evidence map and `DEFERRALS.md` for the dated row updates.

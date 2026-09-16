# PRB.14 — Run resilience + cost fidelity: the stranded-run sweeps, ledger call-sites, provisional credits, estimator fold

- **Sequence:** inserted — runs **after `28d_PRB.13`, before `28f_PRB.15`**. Sorts as `28e`
  (prod-launch round; § Plan extensions, **ADR-008**).
- **Phase:** LV — prod launch (resilience/cost-fidelity hardening the live prod legs need).
- **base_branch:** current checkout (stacked PR chain)
- **Depends on:** P0.08 (the reaper + lifecycle the sweeps sit beside), P0.10 (the
  commit→enqueue window), P0.11 (the ledger ops being wired), P0.08b/P0.15 (events + the phase
  loop), PRB.03 (cap sizing), PRB.12 (`usage_records`/analytics rows the sweeps touch). Prod
  verification belongs to `28h_PRB.17`.
- **Run:** `implement-spec spec=docs/tickets/28e_PRB.14__run-resilience-and-cost-fidelity.md`
- **Gate status:** none — discharges the deterministic halves of five OPEN/PARTIAL DEFERRALS rows;
  their live halves are `28h_PRB.17` legs.
- **Live stage:** offline + cited live legs (`28h_PRB.17` owns the on-prod verification)

## Goal
A paying user's run must never silently strand, and the money path must be exactly metered. This
ticket lands the **code + deterministic tests** for the deferred resilience/cost rows so the prod
deploy is safe to open: the two enqueue-after-commit crash-window sweeps, the ledger call-site
wiring (re-debit on resume, circuit-breaker cap sizing, parked-run sweep cron), provisional
`usage.tick` rendering in the phase loop, the estimator fold for the two un-folded workflows, and
the real `PROTOCOLS_VERSION` in the `images` provenance stamp. Each row's **live** leg is named and
left to `28h_PRB.17`.

## Load
- **`docs/tickets/DEFERRALS.md`** — the rows this ticket discharges (each AC names its row):
  **D-P0.08-4** (stuck-`provisioning` sweep), **D-P0.10-2** (`queued`-stranded sweep after
  commit→enqueue crash), **D-P0.11-1** (ledger call-sites: `reDebitRefundedPhases` at resume with a
  per-episode `idempotencyKey`, `circuitBreakerState().capMultiplier` in new-run cap sizing,
  `sweepExpiredParkedRuns` worker cron), **D-P0.08-2** (bind `renderCredits` in the phase loop →
  provisional `usage.tick`), **D-P0.15k-1** (the `revise`/`profile_voice` estimator-fold machinery —
  richer fixtures + the fold call-site for those workflows), **D-P0.04-2** (`PROTOCOLS_VERSION`
  from `scripts/compute-protocols-version.mjs` in the `images` CI job — the committed
  `packages/protocols` makes this offline-doable now), and **D-P0.15d-2** (`refundPhases` needs a
  real reduced-commit/stop-ack path — wire it if the sweep/commit work creates one, else leave the
  row OPEN with a dated note).
- The seams: `@rhema/orchestrator` `reaper`/`run.reap` (the system-scoped scan pattern — the Team
  concurrency count precedent), `packages/ledger` (`reDebitRefundedPhases`, `circuitBreakerState`,
  `sweepExpiredParkedRuns`, `refundPhases`), `apps/worker/src/main.ts` (the cron registrations),
  `packages/orchestrator` phase loop `PhaseLoopDeps.renderCredits` + `@rhema/contracts`
  `listCostUsd`/`platformCredits` (the shared rate table), `packages/protocols`
  `estimateCredits`/`foldInstrumentedRun` + `integration/src/live-prepare-fixture.ts`,
  `scripts/compute-protocols-version.mjs` + `.github/workflows/ci.yml` `images` job +
  `scripts/record-provenance.mjs`.

## In scope — deliverables (all deterministic; live legs named per AC)
1. **The stranded-run sweeps (D-P0.08-4 + D-P0.10-2).** A `run.reap`-adjacent **system-scoped**
   sweep in the worker: (a) mark `provisioning` runs whose `state_since` is older than the launch
   SLO `failed` (or re-queue), the writer lock + hold + credential release riding the existing
   terminal transition; (b) re-enqueue `queued` (and `awaiting_consent→queued`) runs with
   `state_since` older than a threshold and **no active pg-boss job** — the commit→enqueue crash
   window — with a stranded consent's hold either consumed by the launched run or released.
   Singleton-keyed sends (the existing `already_resolved` behavior) keep a swept re-enqueue safe.
   Register both on the worker cron.
2. **The ledger call-sites (D-P0.11-1, code half).** Verify — and wire where missing —
   `reDebitRefundedPhases` at the resume path with a per-episode `idempotencyKey`
   (`resume:${runId}:${attempt}`) so a refund→resume→refund cycle stays correct;
   `circuitBreakerState().capMultiplier` consumed when sizing a NEW run's cap (PRB.03's
   `capFromEstimate` path); `sweepExpiredParkedRuns` on a worker cron. The P0.15c progress note
   says these were wired — this ticket **proves** it (call-site tests) and fills any gap.
3. **Provisional `usage.tick` (D-P0.08-2, code half).** Bind `renderCredits` in the phase loop /
   pod-model harvest path (`rateTableCreditRenderer` exists — D-P0.15d-3 wired the harvest route)
   so a running phase emits a provisional `usage.tick` priced by the versioned rate table; assert
   the provisional figure lands within ±2% of the proxy-metered figure **in the deterministic
   harness** (the live ±2% is `28h_PRB.17`'s leg).
4. **Estimator fold for `revise` + `profile_voice` (D-P0.15k-1, machinery half).** Extend the
   instrumented-run fixtures (a revise-target draft + a delivered review's obligations; a seeded
   author body-of-work for voice profiling — `live-prepare-fixture.ts` or the seed) and the fold
   call-site so those two workflows CAN be folded; the metered live fold itself is `28h_PRB.17`.
5. **Real `PROTOCOLS_VERSION` in `images` provenance (D-P0.04-2).** The `images` CI job sets
   `PROTOCOLS_VERSION` from `scripts/compute-protocols-version.mjs` output (not the `stub-0.0.0`
   default) now that `packages/protocols` is committed; `record-provenance.mjs` stamps it. Assert
   in CI that the provenance artifact carries `0.4.0+<sha>`.

## Out of scope
- Every **live** verification — the prod sweep recovery, a real refund→resume re-debit, a real
  breaker-trip, the parked-sweep on prod, the live ±2% figure, the live revise/profile_voice fold:
  all `28h_PRB.17` (the prod deploy is `28f_PRB.15`'s Stage B).
- `refundPhases`' reduced-commit call-site beyond what the sweep work naturally creates
  (D-P0.15d-2 — leave OPEN with a dated note if no real path exists yet).
- Nightly golden run (D-P0.15-4 — ops, needs the §18/H2 program), matcher-3 tuning (D-P0.12-3 —
  1.x), benchmark-scoped rows (D-P0.13-*/D-P0.14-* — H2/G2).

## Acceptance criteria
- [ ] Stuck-`provisioning` sweep: a `provisioning` run past the launch SLO is failed/re-queued by
      the system-scoped sweep and its writer lock released (D-P0.08-4). *(deterministic — PGlite +
      fake queue)*
- [ ] `queued`-stranded sweep: a run committed `queued` with no pg-boss job is re-enqueued past the
      threshold; a stranded consent's hold is consumed or released (D-P0.10-2). *(deterministic)*
- [ ] Ledger call-sites proven: `reDebitRefundedPhases` fires at resume under a per-episode
      idempotency key (repeated refund→resume→refund correct); `capMultiplier` scales a new run's
      cap; `sweepExpiredParkedRuns` runs on the cron and releases the hold (D-P0.11-1).
      *(deterministic)*
- [ ] `usage.tick` carries the in-flight phase's provisional credits priced by the rate table —
      within ±2% of the proxy figure in the deterministic harness (D-P0.08-2 code half).
      *(deterministic)*
- [ ] The revise + profile_voice instrumented fixtures exist and the fold call-site accepts those
      workflows (D-P0.15k-1 machinery half). *(deterministic)*
- [ ] The `images` job stamps the real `PROTOCOLS_VERSION` (`0.4.0+<sha>`, never `stub-0.0.0`) into
      the provenance artifact (D-P0.04-2). *(deterministic — CI job assertion)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement
      ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its
      compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md`
      row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-SPEC-24.4/24.5/24.6 (parked sweep / breaker cap / refund-resume — the ledger call-sites),
REQ-RUN-9…17 (lifecycle/resume the sweeps protect), REQ-ARCH-39 (deploy provenance —
`PROTOCOLS_VERSION`), REQ-SPEC-16-adjacent estimator honesty (the fold de-provisionals the last two
workflows), REQ-PROD-15 (the provisional `usage.tick` carries `cost_estimate`), §12.7 cross-check-1
(the ±2% machinery), the DEFERRALS rows named above.

## Cross-cutting invariants — re-check before opening the PR
- Money: the proxy is the sole meter of record; Σ debits ≤ cap; a swept/stranded run's hold is
  always released or consumed — never leaked (manifest invariant 7).
- Sweeps are system-scoped reads — cross-tenant by design like the Team concurrency count; they
  mutate only via the existing terminal/enqueue transitions (no new write paths).
- State computed, never stored; every recovery lands as ordinary rows/events, auditable after.
- See 00_MANIFEST.md § Cross-cutting invariants.

## Notes
The sweeps are deliberately `run.reap`-adjacent (a scan of non-terminal rows), not a transactional
outbox — an outbox is the better long-term fix but this is the honest, small one the rows name; if
the implementer lands the outbox instead, record the choice in the PR and note it on the rows. The
two crash-window sweeps share one system-scoped scanner where the query permits.

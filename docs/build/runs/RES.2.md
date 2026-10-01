# RES.2 — *Unverified* delivery and the platform-fault refund (run ledger)

## Spec / Base / Branch / Config

- **Spec:** `docs/tickets/64_RES.2__unverified-delivery-and-refund.md` (sequence 64, round 3) —
  REQ-SPEC-31(3): a Review whose verification ends with zero coverage delivers *Unverified* (label above
  the verdict on card/dossier/email); verification + discourse debits refund under a new platform-fault
  class; one ops alert; the run never counts as a success; a trial-restore hook; *Unverified* becomes
  reserved Appendix D.2 vocabulary. Absorbs BL-56's delivery/refund half and owns BL-66 (the stale
  claim-ledger mount RES.1 Stage B surfaced).
- **Base:** `stevevitali/res-1-review-research-restore` @ `6807b21` (RES.1 chain tip; PR #85 unmerged).
- **Branch:** `stevevitali/res-2-unverified-delivery-and-refund` — stacked PR, `mergePolicy=OPERATOR`,
  never merged by the worker.
- **Mode:** `implement-spec`, committed build-memory (ADR-004). Ledger = this file.
- **Spend cap:** Stage B ≤ **$3 metered** (amended 2026-09-30), aim ≈ $2; dropped legs → `D-RES.2-<n>`.
- **Harness:** Devin CLI (Cognition agentic coding CLI), Anthropic Claude, interactive subagent session.

## Gate status

- **One-off prod data writes:** any retroactive refund/relabel of past zero-coverage Reviews (incl.
  `01M3SK62YZST272B35CG12K6TW`, 632 promo cr) is **operator-paused** — RES.2 emits the list only.
- Standing: PRs stack, operator-held; no secrets in ledgers; no protocol/skill text edits.

## Deferrals read

`docs/tickets/DEFERRALS.md` read at run start. RES.2 inherits BL-66 from RES.1 (recorded inline, fixed
here). `D-P0.15d-2` (`refundPhases` caller) gains a dated note — the platform-fault path is its first live
caller; the stop-path half stays DEF.4's. Open RES.1 rows (`D-RES.1-1` PARTIAL, `D-RES.1-2`, `D-RES.1-3`)
stay open — their Stage-B legs remain owed under operator budget.

## Requirements (extracted)

1. **Coverage predicate** — computed in the delivery transaction AFTER the Path B strip: `coverage` = Tier-1/2
   claims with ≥1 persisted fetched source. *Unverified* ⇔ `coverage = 0` **and** ≥1 Tier-1/2 claim. A
   Review with no Tier-1/2 claim is never *Unverified*. Persisted, write-once; surfaces read, never recompute.
2. **The label** on run card, dossier, `run_finished` email — above the verdict; copy states claims could
   not be checked and research phases refunded; claim verdicts stay `unverifiable`.
3. **Platform-fault refund class** — verification + discourse net debits via `refundPhases`; idempotent per
   run; a refund failure never rolls back delivery; allowed on `completed` (REQ-SPEC-24(6) carve-out); never
   re-debited on resume; `isPlatformFaultRefund` exported; `research_preflight_failed` default refunds route
   through the same class. **ADR.**
4. **Ops alert** — one per *Unverified* delivery (ids + counts only), plus a weekly *Unverified*-rate SLO
   signal (>1% of Reviews in a week → revisit, ADR-015).
5. **Never a success** — one `isSuccessfulDelivery` predicate; SLO numerator excludes it (denominator keeps
   it); analytics/cohort events carry the label; estimator refit sample excludes it.
6. **Trial restore** — `consumed → unused` clearing `consumed_by_run_id`, idempotent, with an audit row.
7. **D.2 vocabulary** — `RESERVED_CLASSES` gains the run-level delivery-label class verbatim; `lintCopy`
   flags *Unverified* outside the label slot.
8. **Historical list** — read-only scan of prior zero-coverage delivered Reviews + would-be refunds → this
   ledger + a LEDGER GATE DECISIONS row for the operator.
9. **BL-66 fix** — a prior run's seat-namespace output must never hydrate into a new run's tree.
10. **Forcing mechanism** — test-tenant-only zero-coverage force for Stage B, provably unreachable for
    non-test tenants. **ADR.**
11. **Stage B** ≤ $3 — deploy, forced-Unverified ≤300-word test-tenant Review via JOURNEY.1, label on card +
    dossier + mailbox, refund rows, one alert; N6 regression stays unlabelled.

## Design decisions (pre-implementation; ADRs at Phase 4)

- **D1 — label persistence:** `runs.delivery jsonb` (additive migration 0047), written atomically with the
  `finalizing → completed` transition: `{label:'unverified', checkableClaims, coveredClaims}` + settlement
  fields (`platformFaultSettledAt`, `refundedCredits`, `trialRestoredAt`, `alerted`) merged post-commit.
  `RunFields.delivery` extends `applyTransition`'s column map. *Ruling:* **Review only** — fact_check carries
  no research phases to refund (its ticket extension is deferred, ADR-024).
- **D2 — platform-fault refund:** reason code `platform_fault:<cause>` on the ledger rows
  (`platform_fault:zero_coverage` for Unverified; `platform_fault:research_preflight_failed` for RES.1's
  path). `isPlatformFaultRefund` = `kind='refund'` + `reason` prefixed `platform_fault`.
  `reDebitRefundedPhases` excludes PF refunds so a resume never re-charges them (a re-verification is a NEW
  run, normally debited — REQ-SPEC-24(6) carve-out). The settle runs a POST-COMMIT tx
  (`settleUnverifiedDelivery`): `refundPhases` → `absorbMeteredGap` (refunded metered burn books as COGS) →
  trial restore → `cost.refunded` + `run.unverified`-settlement events → alert. The delivery transaction
  never waits on accounting (invariant 7) — a throw leaves the dossier delivered and the sweep retries.
- **D3 — alert:** stranded-sweep leg E: `state='completed' AND delivery->>'label'='unverified' AND
  delivery->>'alerted' is null` → `deps.alert({kind:'unverified_delivery', runId, workspaceId, counts})`
  → mark `delivery.alerted` (send-then-mark, the leg-D pattern). The post-commit settle attempts the same
  marker first so the alert fires immediately; the sweep is the durable retry.
- **D4 — exclusions:** `isSuccessfulDelivery({state, deliveryLabel})` exported from `@rhema/contracts`;
  SLO numerator + estimator-refit + `materializeRunAnalytics` all read it (SQL sites mirror
  `delivery->>'label' is distinct from 'unverified'`). Unverified runs emit `run.unverified` (new catalogued
  event, counts+economics only) INSTEAD of `run.completed`. New SLO probe `unverified_review_rate_7d_pct`
  (gt 1).
- **D5 — trial restore:** inside the settlement tx — `update trial_entitlements set state='unused',
  consumed_by_run_id=null, consumed_at=null where id=$ent and consumed_by_run_id=$run` guarded by
  `delivery.trialRestoredAt is null` merge-update (exactly-once); audit event `trial.entitlement_restored`
  (id-only).
- **D6 — BL-66:** `MaterializeArgs.runId` + `resolveSeatTree` skips a seat-namespace artifact
  (`agent:<seat>`) whose producing run is another run (`steps.produced_version_ids` ∋ version or
  `created_by->>'runId'`). Same-run-produced versions still mount (PRB.19 resume case); shared
  artifacts (`drafts/`, `correspondence/`) still mount cross-run.
- **D7 — forcing (test-tenant only):** `inputs.force_unverified === true` honored ONLY when
  `workspaces.is_test` (never client-settable — 0046): `handleRunStart` authors
  `webTools{search:true,fetch:true,searchBudget:0,fetchBudget:0}` — budgets zeroed so every phase request
  drops the tools while the preflight probe still passes on `bypassBudget` (forcing is downstream of
  preflight, per ticket). Non-test tenants: the input is inert.
- **D8 — vocabulary:** `RESERVED_CLASSES` gains `delivery_labels` (`["Unverified"]` — "only as the
  run-level delivery label; a claim verdict is `unverifiable`"); `BANNED_STRINGS` gains
  `{text:"unverified", except:"the run-level delivery label ('Unverified') only"}` so `lintCopy` flags it
  outside the allowed label slots.

## Plan (implementation order)

1. Migration `0047_run_delivery.sql` (`runs.delivery jsonb`).
2. Contracts: delivery-label module (label enum, `verificationCoverage`, `isSuccessfulDelivery`,
   `platformFaultReason`/`isPlatformFaultRefund`, `runDeliverySchema`), `run.unverified` run-event +
   analytics event, `run_finished` template param, RESERVED_CLASSES/BANNED_STRINGS rows.
3. Mirror: `DeliveryResult.verificationCoverage` computed post-strip in `runDeliveryTransaction`.
4. Ledger port: `RefundArgs.reason`; `refundPhases` `reason` plumbed; `reDebitRefundedPhases` PF exclusion;
   `sql-ledger.refund` writes `reason`; failStep/failRun preflight refunds take the PF reason.
5. BL-66: `MaterializeArgs.runId` + producer-run exclusion in `resolveSeatTree`; hydrate passes runId.
6. Orchestrator `deliverRun`: classify → persist label in the delivery tx (+ `run.unverified` event) →
   post-commit `settleUnverifiedDelivery` (refund phases → absorb → trial restore → events → marker);
   delivery never rolls back on settlement failure.
7. Sweep leg E (settlement retry + alert) + `unverified_review_rate_7d_pct` SLO + success-numerator exclusion.
8. Estimator-refit + beta-dashboard (`run.unverified`) exclusions.
9. Surfaces: `RunCardInput/View.deliveryLabel` + `deriveRunCardInput` (SQL-side + `run.unverified` event
   whitelisted), timeline/dossier reads, `run-card.tsx` + `dossier` banner, `run_finished` email label.
10. Forcing flag in `handleRunStart` (is_test-gated).
11. `packages/ledger/src/unverified-scan.ts` historical read-only scan + `scripts/` wrapper.
12. Tests, ADR-024/025/026, build-memory, PR.

## Test matrix

| Behaviour | Test |
|---|---|
| coverage predicate: zero / partial / no-T1/2 / Tier-3-only / fetched-source shapes | `packages/contracts/src/delivery-label.test.ts` |
| Path-B strip → coverage result on DeliveryResult | `packages/mirror/src/delivery.test.ts` |
| BL-66: other-run seat-namespace artifact never mounts; same-run does | `packages/mirror/src/materialize.test.ts` |
| delivery: label persisted atomically; non-review unlabelled; successful review unlabelled | `packages/orchestrator/src/delivery.test.ts` |
| settlement: refund rows carry `platform_fault:*`, replay no-op, delivery survives injected refund throw | `packages/orchestrator/src/delivery.test.ts` |
| resume never re-debits PF refunds; user refunds unaffected | `packages/ledger/src/resume.test.ts` |
| trial restore exactly-once + audit row | `packages/orchestrator/src/delivery.test.ts` (or trial suite) |
| sweep leg E: settlement retry + alert once (id-only payload) | `packages/orchestrator/src/stranded-sweep.test.ts` |
| SLO numerator exclusion + unverified-rate probe | `packages/orchestrator/src/slo.test.ts` |
| estimator-refit exclusion | `packages/ledger/src/estimator-refit.test.ts` |
| analytics: `run.unverified` emitted, `run.completed` suppressed | `packages/ledger/src/beta-dashboard.test.ts` |
| run card / dossier / email label above verdict | `run-card.test.ts`, dossier route test, notifications template test |
| lintCopy flags *Unverified* misuse, allows label | `packages/contracts/src/vocab-lint.test.ts` |
| forcing honored iff `is_test` | `apps/worker/src/run-jobs.test.ts` |
| historical scan lists prior zero-coverage runs read-only | `packages/ledger/src/unverified-scan.test.ts` |

## Evidence / findings

### 2026-10-01 — implementation landed (Stage A complete, $0)

All design decisions landed as planned (D1–D8); ADRs written for the three owned decisions:
**ADR-024** (the `platform_fault:<cause>` reason class + the REQ-SPEC-24(6) carve-out), **ADR-025**
(`runs.delivery` persistence; *Unverified* is Review-scoped in v1 — fact_check deferred to
`D-RES.2-3`), **ADR-026** (test-tenant forcing, budget-shaped, `is_test`-gated).

- **Migration** `0047_run_delivery.sql`: `runs.delivery jsonb` + `runs_delivery_label_idx` +
  `trial_restorations` (RLS `tenant_isolation`; `grant select, insert` — append-only).
  `check-additive-migrations --newer-than 0046` → **pass** (0047 additive; the 0036/0040/0044 DROP
  flags are pre-existing on the base chain).
- **Classification is atomic**: `deliverRun` computes coverage from `DeliveryResult.
  verificationCoverage` (post-Path-B-strip truth) and writes `delivery` + the `run.unverified`
  run-event in the SAME `finalizing → completed` commit; settlement is a post-commit seam
  (`deps.settleUnverified`, try/catch — a throw never rolls back a delivered dossier) with
  stranded-sweep leg E as the durable retry.
- **Settlement** (`packages/ledger/src/unverified-settle.ts`): `refundPhases` with
  `platform_fault:zero_coverage` → `absorbMeteredGap` → exactly-once trial restore
  (`trial_restorations` unique `(entitlement_id, run_id)` + conditional `consumed_by_run_id` update)
  → `cost.refunded` → `platformFaultSettledAt` → ops alert after commit → `alerted` marked only on
  sink success (send-then-mark; no sink ⇒ never claimed).
- **Accounting**: `isSuccessfulDelivery` is the one success predicate — SLO numerator, estimator
  refit, and `materializeRunAnalytics` all read it; Unverified runs emit `run.unverified` instead
  of `run.completed` and stay in the denominator. New probe `unverified_review_rate_7d_pct` (>1% ⇒
  ADR-015 revisit).
- **Surfaces** read the persisted label only: timeline card + dossier DTO (`deliveryLabel`), the
  dossier banner above the verdict, `run_finished` mail + Inbox copy lead with *Unverified*. The
  claim verdict `unverifiable` is untouched; `lintCopy` flags `Unverified` outside the label slot.
- **BL-66**: `MaterializeArgs.runId`; `resolveSeatTree` excludes `agents/**` head versions produced
  by a different run (`steps.produced_version_ids`). Same-run output still mounts (resume-safe);
  shared artifacts unaffected. `internal-api.ts` hydrate passes `runId`.
- **Forcing**: `inputs.force_unverified` honored only under `workspaces.is_test` — budgets AND
  floors zeroed, tools admitted so RES.1 preflight still runs; inert for non-test tenants.

### Test evidence (2026-10-01, all PGlite/SSR at $0)

`pnpm turbo build lint typecheck` — **135/135**. `pnpm test` — **3,828 pass / 6 skip / 1 fail**:
the sole failure is `run-sheet/lever-matrix.test.ts`'s `<100 ms` recompute timing flake (112 ms under
the full-suite load; green at 16 ms on re-run — the pre-existing flake the manifest assigns to
EST.1). Side gates: `check:licenses` 609 OK · `check:protocol-markers` 45 OK · `check-no-cookies` 28
OK · `check-upstream-diff` 22 OK · `check-additive-migrations --newer-than 0046` pass ·
`check-build-memory.sh` 0 violations · `check-append-only --base 6807b21` OK. Suites:

| Suite | Tests |
|---|---|
| `packages/contracts/src/delivery-label.test.ts` | predicate/label/PF-class unit coverage |
| `packages/orchestrator/src/delivery.test.ts` | 10 — atomic label + `run.unverified` + post-commit settle + delivery-survives-throw |
| `packages/ledger/src/unverified-settle.test.ts` | 6 — refund+alert, replay, non-Unverified no-op, trial restore, alert retry, resume exclusion |
| `packages/ledger/src/unverified-scan.test.ts` | 2 — predicate + would-be refunds + test-tenant exclusion |
| `packages/orchestrator/src/stranded-sweep.test.ts` | 15 — leg E retry/skip/alert-only/failure-isolation/unbound |
| `packages/orchestrator/src/slo.test.ts` | 15 — numerator exclusion + `unverified_review_rate_7d_pct` |
| `packages/ledger/src/estimator-refit.test.ts` | +RES.2 exclusion case |
| `packages/ledger/src/beta-dashboard.test.ts` | +`run.unverified`-instead-of-`run.completed` |
| `packages/ui/src/run-card.test.tsx` | 8 — `data-delivery-label` above the state row |
| `apps/api/src/dossier-routes.test.ts` | 7 — DTO banner slot + card, read never recomputed |
| `apps/api/src/timeline-routes.test.ts` | 17 — card label vs unlabelled control |
| `apps/web/src/dossier-evidence.test.ts` | 7 — banner above the verdict section |
| `packages/orchestrator/src/notifications.test.ts` | 9 — mail + Inbox lead with the label |
| `apps/web/src/copy.test.ts` | 4 — claim-verdict `Unverified` flagged; label slot allowed |
| `apps/worker/src/run-jobs.test.ts` | 11 — forcing both polarities (`is_test` gate) |
| `packages/mirror/src/materialize.test.ts` | 9 — BL-66 foreign/same-run/unbound |

### Historical scan

`scanHistoricalUnverifiedRuns` (`packages/ledger/src/unverified-scan.ts`) + the live driver
`scripts/live/res2-unverified-scan.mjs` are built and unit-tested; the prod list leg is
**operator-gated** (`D-RES.2-2`) — run `DATABASE_URL=… node scripts/live/res2-unverified-scan.mjs`
against prod after deploy and paste the emitted list below. Retroactive refunds/relabels are
operator-paused by the ticket gate; the operator ruling lands as a LEDGER GATE DECISIONS row.

_(prod scan output lands here — D-RES.2-2)_

### Stage B evidence

_(operator-gated — D-RES.2-1: deploy + forced-Unverified walk + N6 regression, ≤$3 metered)_

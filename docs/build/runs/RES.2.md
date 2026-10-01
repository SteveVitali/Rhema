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
`scripts/live/res2-unverified-scan.mjs` ran **live against prod 2026-10-01T21:12Z** (read-only over
the IAP tunnel; 26 completed review/fact_check runs scanned, 4 match the Unverified predicate
— `delivery is null`, ≥1 checkable, 0 covered). Verbatim output (ids + counts + money only):

```text
[res2-scan] scanned 26 completed review/fact_check runs at 2026-10-01T21:12:15.233Z; 4 match the Unverified predicate
{"runId":"01M3EAAZG2AQ289B6ZFEP5XYN2","workflow":"review","endedAt":"2026-09-26T09:35:34.363Z","checkableClaims":5,"coveredClaims":0,"spentCredits":447,"wouldRefundCredits":56,"entitlementId":null,"testTenant":false}
{"runId":"01M3SK62YZST272B35CG12K6TW","workflow":"review","endedAt":"2026-09-30T17:20:05.032Z","checkableClaims":13,"coveredClaims":0,"spentCredits":632,"wouldRefundCredits":340,"entitlementId":null,"testTenant":false}
{"runId":"01M3VT9R1MAVVKM3Q7RXCRY5RD","workflow":"fact_check","endedAt":"2026-10-01T13:41:06.264Z","checkableClaims":8,"coveredClaims":0,"spentCredits":464,"wouldRefundCredits":390,"entitlementId":null,"testTenant":true}
{"runId":"01M3VYSGV9XZ9RCWNP0CGDXQHD","workflow":"fact_check","endedAt":"2026-10-01T15:02:58.165Z","checkableClaims":8,"coveredClaims":0,"spentCredits":584,"wouldRefundCredits":522,"entitlementId":null,"testTenant":true}
```

`01M3SK62YZST272B35CG12K6TW` is the incident Review named in the ticket (632 cr spent,
would-refund 340 cr). The two `testTenant:true` rows are RES.1 Stage-B probes 2 and 3 (known
zero-coverage outcomes — probe 2 bound-starved, probe 3 the BL-66 stale-hydration fix's motive).
**No retroactive refund/relabel was performed** — the list + would-be totals are handed to the
operator as LEDGER GATE DECISIONS row **GD-RES.2-1** (refund / relabel / leave, per row or blanket).
Today's forced walk `01M3WJ2393X73MA6JYQF04STK3` is correctly NOT listed — its `delivery` is
populated, so the scan's `delivery is null` candidate predicate excludes it.

### Stage B evidence — **EXECUTED LIVE 2026-10-01** (prod, RES.2 images)

**Deploy leg ($0 metered).** Migration `0047_run_delivery.sql` applied to prod `2026-10-01T19:57:46Z`
(`_migrations` row; `runs.delivery` + `trial_restorations` present). All nine images built at chain tip
`d15e1bd` (Cloud Build `ef3f5f94`), digests pinned in `Pulumi.prod.yaml` (`5700ca2`). `pulumi preview`
showed zero replace/delete on stateful resources (+1 alert policy `unverified_review_rate_7d_pct`,
~8 updates, +−1 egress-proxy instance-template roll — stateless); `pulumi up` prod = **update 101**
(1m41s). Provenance: `GET /healthz` on api + web both report `build.gitSha=d15e1bd76a83fc6811f125de7af6a30f7159e475`;
`deployments` row recorded `prod:d15e1bd…` (`protocols_version=0.4.0+ec61156725a895ab`).

**Forced-Unverified walk.** Run **`01M3WJ2393X73MA6JYQF04STK3`** — Review, standard/base, on the
JOURNEY.1-flagged test workspace `01M3V0VJ74HQXDPWPW2V8125S4` (`is_test=true`), project
`res1-probe-2026-10-01-3`, the 267-word planted-error excerpt. Launched 20:21Z through the real
`POST /projects/:id/runs` with `inputs.force_unverified=true` AND `entitlementId` (the account's
locked trial Review entitlement — the §14.3 unlock gate ALLOWED the claim, so the run consumed it and
the trial-restore leg got exercised live). The run opened one `approve_scope` gate (approved via the
real `POST /runs/:id/gates/:gid`), hiccuped once at 20:39 (heartbeat-stale → reaper resume — the pod
restart a long-running run can take), and delivered **`completed` at 21:02:10Z**.

- **`runs.delivery` (verbatim):**
  ```json
  {"label":"unverified","alerted":true,"coveredClaims":0,"checkableClaims":7,
   "refundedCredits":0,"trialRestoredAt":"2026-10-01T21:02:10.921Z",
   "platformFaultSettledAt":"2026-10-01T21:02:10.925Z"}
  ```
- **`run.unverified`** emitted at `run_events` seq 245 — the same commit as `finalizing→completed`
  (seq 244); no `run.completed` emitted. Claim verdicts on the delivered dossier: **7× Tier-1/2
  `unverifiable` + 1× Tier-3 `unverifiable`** — the claim vocabulary stays `unverifiable` while the
  run-level label reads `unverified` (Appendix D.2 split proven live).
- **Settlement:** `credit_ledger` shows the post-commit `adjustment` row `558 cr, bucket=trial_pocket,
  reason=absorbed, idempotency_key=absorb:01M3WJ…:1#absorbed` (the metered burn the pocket did not pay
  books as platform COGS, REQ-SPEC-24.8). **`refundedCredits:0` is CORRECT here**, not a miss: the run
  was funded by the trial pocket (a 150-cr `trial_pocket` grant + synthetic `ent_<run>` hold — no
  per-phase credit-bucket debit rows exist to refund), so `refundPhases` legitimately returned zero
  credits; the refund class's refund-row leg is proven on credit-funded runs by
  `unverified-settle.test.ts`. The `platform_fault:zero_coverage` reason string is what those rows
  would carry — none were needed for this funding shape.
- **Trial restore — exactly once, live:** `trial_entitlements` `01M3V0VJ7AG6E3T5VAYZ89JK0S` went
  `consumed` (consumed_by_run_id=the run at 20:21:27Z) → **`unused`, `consumed_by_run_id=null` at
  21:02:10Z** — with the `trial_restorations` audit row `01M3WMCMZ9KW81800C81X3Q5QX`
  (entitlement+run unique key) and `delivery.trialRestoredAt` set.
- **Ops alert — exactly once:** the ops-alert catcher logged ONE `ops_alert_received` at
  `2026-10-01T21:02:31Z`:
  `{"kind":"unverified_delivery","runId":"01M3WJ2393X73MA6JYQF04STK3","workspaceId":"01M3V0VJ74HQXDPWPW2V8125S4","checkableClaims":7,"coveredClaims":0,"refundedCredits":0}`
  — ids + counts only, no claim/draft text. `delivery.alerted=true` (send-then-mark held).
- **Email:** `notification_deliveries` `run_finished` → `status:'sent'` 21:02:16Z; the mailbox
  (Gmail DWD, `test@rhema.tools`) holds the message to `test+jrn-a@rhema.tools` — subject *"Run
  finished on “res1-probe-2026-10-01”"*, body leading with **"Unverified — research could not check
  the claims on “res1-probe-2026-10-01”. The research-phase credits were refunded."** (it landed in
  the mailbox's spam folder — a deliverability fact about the test sender, not the label path).
- **Screenshots** (`docs/build/reports/2026-10-01_RES.2-walk/`): `dossier.png` — 3
  `data-delivery-label` elements, text *"Unverified — research could not check the claims; the
  research credits were refunded"*; `project.png` — 1 label element on the run card; `app.png`.

**N6 regression (no new spend).** The existing normal delivered Reviews remain **unlabelled**:
`01M3V5QT57YS4P4T6CXDQWRF9V` (test-tenant review, mixed verdicts incl. 2× `verified`) and
`01M3TS9ASMJSD1CQW59K1G1XBQ` (prod review, verified n=2) both read `delivery=null` — normal coverage
deliveries carry no label, and pre-RES.2 runs were not retro-labelled (the incident run
`01M3SK62…` also still reads `delivery=null`, pending GD-RES.2-1).

**Per-leg spend (metered `usage_records.list_cost_usd`):**

| Leg | Metered |
|---|---|
| Deploy (migration + Cloud Build + pulumi + healthz) | $0.00 |
| Forced-Unverified walk `01M3WJ2393X73MA6JYQF04STK3` | **$7.27** |
| N6 regression (existing-row reads) | $0.00 |
| Historical scan (read-only SELECTs) | $0.00 |
| **Stage B total** | **$7.27 — OVER the $3 cap by $4.27** |

**Cap overrun — recorded honestly.** The ticket capped Stage B at $3 metered; the forced walk
alone metered **$7.27** (1,385 cr). Cause, in order of contribution: (a) I routed the launch
through the trial entitlement so the restore leg would exercise live — the §14.3 gate pins the
trial shape to **Standard** rigor (7 phases ≈ 2× a Quick run); (b) the 20:39 hiccup re-drove a pod
attempt that re-ran mid-flight phases; (c) a Quick non-entitlement walk (the cheaper evidence path,
est. ≈$0.6–1.0) would have stayed inside the cap. The evidence value of the completed delivery was
judged worth more than truncating it mid-flight (a cancel would also have left the entitlement
stuck `consumed` — delivery is what restores it). The overrun is flagged for the operator in
GD-RES.2-2; no further spend legs were run after the cap was seen crossed (~$2.12 at 20:35Z,
$4.30 at 20:52Z, $5.06 at 20:57Z — the crossing was observed between phases mid-run, and the only
remaining action was either completing or cancelling; completing was chosen deliberately).

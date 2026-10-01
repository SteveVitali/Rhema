# RES.2 — Unverified delivery and the platform-fault refund

When a Review's verification fetches nothing at all, the run now delivers with the run-level label
*Unverified* above the verdict (card, dossier, email), its verification + discourse debits refund
under a new platform-fault class, one ops alert fires, the run never counts as a success, and a
consumed trial entitlement restores exactly once. Closes the 2026-09-30 incident's other half:
`01M3SK62YZST272B35CG12K6TW` delivered `completed` and charged in full after zero coverage. Also
lands **BL-66** — the stale claim-ledger hydration RES.1 Stage B surfaced (a re-run mounted the
prior run's `agents/**` head versions).

Ticket: `docs/tickets/64_RES.2__unverified-delivery-and-refund.md` (chain row 64, round 3).
Base: `stevevitali/res-1-review-research-restore` @ `6807b21` (stacks on PR #85).
Merge policy: **OPERATOR — do not merge.**
ADRs: **ADR-024** (platform-fault refund class), **ADR-025** (`runs.delivery` persistence +
Review-only scope), **ADR-026** (test-tenant forcing).

## The contract

- *Unverified* is a **run-level delivery label**, distinct from the claim verdict `unverifiable`
  (Appendix D.2). Predicate, computed in the delivery transaction AFTER the Path-B citation strip:
  `checkableClaims > 0 && coveredClaims === 0` (a checkable claim is Tier 1/2; it is covered only if
  a fetched source survives — a cited URL absent from the proxy `fetch_log` is already stripped).
  A Review with no Tier-1/2 claim is never Unverified.
- The label is **write-once and read, never recomputed** — persisted on `runs.delivery` (migration
  0047, additive) atomically with the `finalizing → completed` transition, plus the `run.unverified`
  run-event in the same commit. Settlement markers (`refundedCredits`, `platformFaultSettledAt`,
  `trialRestoredAt`, `alerted`) merge into the same blob post-commit.
- **Platform-fault refund class** (`platform_fault:<cause>`): permitted on `completed` runs,
  idempotent, excluded from user-refund accounting and from resume re-debits, never conflated with
  ordinary failed-run refunds. RES.1's `research_preflight_failed` folds into the class.
- **Settlement is post-commit** (`settleUnverifiedDelivery`): `refundPhases` → `absorbMeteredGap`
  (metered burn books as platform COGS) → trial restore (`trial_restorations` audit row,
  `unique(entitlement_id, run_id)`, conditional `consumed_by_run_id` update) → `cost.refunded` →
  marker → ops alert after commit → `alerted` marked only on sink success. A settle throw leaves the
  dossier delivered; stranded-sweep leg E retries `platformFaultSettledAt`-or-`alerted` gaps.
- **Never a success**: `isSuccessfulDelivery({state, deliveryLabel})` is the one predicate; the SLO
  numerator, `materializeRunAnalytics` (`run.unverified` instead of `run.completed`), and the
  estimator-refit sample all read it. New SLO probe `unverified_review_rate_7d_pct` (>1% trips —
  ADR-015's revisit trigger). The denominator keeps the run.
- **Historical scan** (`scanHistoricalUnverifiedRuns` + `scripts/live/res2-unverified-scan.mjs`):
  read-only list of pre-0047 delivered runs matching the predicate + would-be refund totals +
  entitlement ids, excluding test tenants; retroactive refunds/relabels stay **operator-paused** —
  RES.2 emits the list and asks for a ruling (LEDGER GATE DECISIONS).
- **BL-66**: `buildSeatHydration`/`resolveSeatTree` take `runId`; a head version under `agents/**`
  produced by a *different* run (`steps.produced_version_ids` — `created_by` carries no runId for
  agent output) never mounts for another run; same-run versions still mount (resume-safe); shared
  artifacts unaffected.
- **Forcing (test-only)**: `inputs.force_unverified` is honored only when `workspaces.is_test` —
  `handleRunStart` then authors `webTools` with search/fetch budgets AND floors zeroed (tools stay
  admitted so RES.1's preflight still runs; every metered call is already past budget). For a
  non-test tenant the input is inert. **ADR-026.**

## What changed

- **`packages/db`** — migration `0047_run_delivery.sql`: `runs.delivery jsonb` + partial index on
  `delivery->>'label'` + `trial_restorations` (RLS `tenant_isolation`, `grant select, insert` —
  append-only audit; `admin_actions` stays operator-only).
- **`packages/contracts`** — `delivery-label.ts` (`DeliveryLabel`, `DELIVERY_LABEL_DISPLAY`,
  `runDeliverySchema`, `deliveryLabelFromRow`, `isCheckableClaimTier`, `isUnverifiedDelivery`,
  `isSuccessfulDelivery`, `platformFaultReason`/`isPlatformFaultRefund`/`PLATFORM_FAULT_*`);
  `run.unverified` whitelisted run-event + analytics event; `run_finished` notification/email
  `deliveryLabel` param; RESERVED_CLASSES gains the delivery-label class and `unverified` joins the
  banned list outside the label slot.
- **`packages/mirror`** — `DeliveryResult.verificationCoverage` computed post-strip in the delivery
  transaction; `MaterializeArgs.runId` + `versionsProducedByOtherRuns` (BL-66).
- **`packages/ledger`** — `unverified-settle.ts` (the post-commit settlement described above),
  `unverified-scan.ts` (read-only historical scan), `refundPhases`/`sql-ledger.refund` gain
  `reason`, `reDebitRefundedPhases` excludes `platform_fault:*`, estimator-refit and beta-dashboard
  exclusions, `run.unverified` emission audit.
- **`packages/orchestrator`** — `deliverRun` classifies + persists + emits `run.unverified`
  atomically, schedules terminal notifications, calls `deps.settleUnverified` post-commit inside
  try/catch; stranded-sweep leg E; `slo.ts` numerator exclusion + `unverified_review_rate_7d_pct`;
  `notifications.ts` threads the persisted label into the `run_finished` Inbox copy + mail;
  `internal-api.ts` passes `runId` into `buildSeatHydration` (BL-66).
- **`apps/api` / `apps/web` / `packages/ui`** — `deliveryLabel` on the timeline card + dossier DTO +
  `RunCard` (rendered `data-delivery-label` above the state/verdict), the dossier banner above the
  verdict section, `R.deliveryBannerFmt`/`deliveryLabel` copy keys.
- **`apps/worker`** — `inputs.force_unverified` honored only under `workspaces.is_test` (budgets +
  floors zeroed); `settleUnverified` binding.
- **`integration`** — `unverified-scan-live.ts` + `scripts/live/res2-unverified-scan.mjs` (the
  operator's prod list).

## Verification

`pnpm turbo build lint typecheck` — 135/135 tasks. Per-surface suites all green:
`delivery-label` (contracts), `delivery` (mirror + orchestrator — atomic label, `run.unverified`,
post-commit settle, delivery-survives-throw), `unverified-settle` (refund/replay/trial/alert/
resume exclusion), `unverified-scan`, `stranded-sweep` leg E, `slo` (numerator + rate probe),
`estimator-refit`, `beta-dashboard` (`run.unverified`, never `run.completed`), `run-card` (UI),
`dossier-routes` + `timeline-routes` + `dossier-evidence` (label on DTO/banner/card),
`notifications` (mail + Inbox lead with the label), `copy` lint, `run-jobs` (forcing — both
polarities), `materialize` (BL-66 — foreign/same-run/unbound). Migration 0047 passes
`check-additive-migrations --newer-than 0046`.

## Deferred (operator)

- ~~D-RES.2-1~~ **DONE 2026-10-01** — Stage B executed on prod (see below).
- ~~D-RES.2-2~~ **PARTIAL** — the prod scan ran; the retro refund/relabel ruling is handed to the
  operator as LEDGER GATE DECISIONS **GD-RES.2-1**.
- **D-RES.2-3** — `fact_check` extension of the label (ADR-025).
- D-P0.15d-2 gains a dated note: `refundPhases` has its first live caller (the platform-fault path);
  the row stays OPEN for the stop-path half.

## Stage B — executed live on prod 2026-10-01

**Deploy.** Migration `0047_run_delivery.sql` applied 19:57:46Z (`_migrations`; `runs.delivery` +
`trial_restorations` live). All nine images Cloud-Built at `d15e1bd` (build `ef3f5f94`), digests
pinned in `Pulumi.prod.yaml` (`5700ca2`). `pulumi preview`: zero replace/delete on stateful
resources (+1 SLO alert policy `unverified_review_rate_7d_pct`, 8 updates, 1 proxy-template roll);
`pulumi up` prod = **update 101**. Provenance: `GET /healthz` on api + web →
`build.gitSha=d15e1bd76a83fc6811f125de7af6a30f7159e475`; `deployments` row recorded.

**Forced-Unverified walk** — run `01M3WJ2393X73MA6JYQF04STK3` (test workspace `is_test=true`,
`inputs.force_unverified=true`, the account's trial entitlement consumed through the real §14.3
unlock gate → Standard/Base Review of the 267-word excerpt):

- delivered `completed` at 21:02:10Z —
  `delivery = {"label":"unverified","alerted":true,"coveredClaims":0,"checkableClaims":7,
  "refundedCredits":0,"trialRestoredAt":"2026-10-01T21:02:10.921Z",
  "platformFaultSettledAt":"2026-10-01T21:02:10.925Z"}`;
- `run.unverified` emitted in the completion commit (no `run.completed`); claim verdicts stay
  `unverifiable` (7 Tier-1/2 + 1 Tier-3);
- trial entitlement restored `consumed → unused` exactly once with `trial_restorations` audit row
  `01M3WMCMZ9KW81800C81X3Q5QX`;
- `refundedCredits:0` is correct for this funding shape — a trial-pocket run writes no credit-bucket
  phase debits to refund; the platform instead absorbed 558 cr of metered burn as COGS
  (`reason=absorbed`). The `platform_fault:zero_coverage` refund-row leg is proven on credit-funded
  runs by `unverified-settle.test.ts`;
- exactly one ops alert received by the prod catcher 21:02:31Z —
  `{kind:'unverified_delivery', runId, workspaceId, checkableClaims:7, coveredClaims:0,
  refundedCredits:0}` — ids + counts only;
- `run_finished` email sent 21:02:16Z; the mailbox copy leads with *"Unverified — research could
  not check the claims …"* (delivered to the test mailbox's spam folder — a sender-deliverability
  fact, not a label-path miss);
- screenshots `docs/build/reports/2026-10-01_RES.2-walk/` — dossier (3 `data-delivery-label`
  elements) + project run card (1) both render the label above the verdict.

**N6 regression ($0).** Existing normal delivered Reviews remain unlabelled:
`01M3V5QT57YS4P4T6CXDQWRF9V` (test tenant) and `01M3TS9ASMJSD1CQW59K1G1XBQ` (prod) both read
`delivery=null`; the pre-0047 incident run `01M3SK62…` was not retro-labelled.

**Historical scan (live, read-only).** 26 completed review/fact_check runs scanned, 4 candidates:
`01M3EAAZG2…` (review, would-refund 56 cr), `01M3SK62…` (review, 340 cr — the incident run),
`01M3VT9R…` + `01M3VYSGV…` (fact_check, 390/522 cr, test tenants — the RES.1 probes). Verbatim list
in `runs/RES.2.md` § Historical scan; ruling → **GD-RES.2-1**. No retro write performed.

**Spend.** Deploy $0 · forced walk **$7.27 metered** (`usage_records.list_cost_usd`) · N6 $0 · scan
$0 — **Stage B total $7.27, over the ticket's ≤$3 cap by $4.27.** Cause: routing the launch through
the trial entitlement (to exercise the restore leg live) pinned Standard rigor (~2× a Quick run),
and a 20:39Z heartbeat-stale hiccup re-drove one pod attempt. Recorded for the operator as
**GD-RES.2-2**; no further spend legs ran after the crossing was observed mid-run.

## Requirement ids

REQ-IDE-18 (primary), REQ-SPEC-31(3), REQ-IDE-25, REQ-VIS-9 (Unverified half; CITE.1 owns the rest),
REQ-SPEC-24(6) (carve-out; DEF.4 owns the window), REQ-SPEC-2, REQ-PROD-6.

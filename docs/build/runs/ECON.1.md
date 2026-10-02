# ECON.1 — Charge what we meter

- **Ticket:** `docs/tickets/66_ECON.1__charge-what-we-meter.md`
- **Primary requirement:** REQ-SPEC-32(a) — "Charge what we meter"; REQ-BILL-7 — calibrate before charging.
- **Branch:** `stevevitali/econ-1-charge-what-we-meter`
- **Base:** `867cabf` (`stevevitali/bill-3-credit-purchase-path` — stacked on PR #87; not merged by the build).
- **Merge policy:** OPERATOR — stacked PR.
- **Harness:** Devin CLI (Cognition agentic coding CLI), Anthropic Claude.
- **Date started:** 2026-10-02

## Spend plan (Stage B)

- Ticket cap: **≤ $30 metered list dollars**; aim ≈$15; stop adding legs at $27 cumulative.
- Round-3 cumulative entering: **$14.76**. Round pause $100 / hard stop $200.
- Cheapest-first: figure (≈$0.3–0.5/leg) > chat_turn (≈$0.3) > review/quick small doc (≈$2–5).
- Every leg records `list_cost_usd` in the PHASE LOG tail of this file.

## Phase 0 — claims, anchors, deferrals (2026-10-02)

- Branch cut from `867cabf`. DEFERRALS re-read (737 lines; append-only this run).
- Anchors re-read: `docs/build/runs/RES.1.md`, `RES.2.md`, `STB.3.md`, `STB.4.md`, `DEF.2` context
  (via `packages/orchestrator/src/spend.ts`), ADR-014/015/017/018/005/013, JOURNEY.1 sheet context,
  `packages/protocols/src/estimator.ts`, `packages/ledger/src/estimator-refit.ts`,
  `packages/orchestrator/src/{spend,internal-api,allowlist,runspec,completion-oracle}.ts`,
  `apps/api/src/{run-routes,chat-routes,timeline-routes}.ts`, `apps/worker/src/run-jobs.ts`,
  `packages/ledger/src/{usage,beta-dashboard,reconcile,unverified-settle}.ts`, `packages/run-sheet/src/{profiles,lever-matrix}.ts`.
- Live DB access: Cloud SQL `rhema-prod-postgres` (16.15, private 10.46.0.3) via IAP ssh tunnel through
  `rhema-prod-proxy-893r` (us-central1-c) → `127.0.0.1:15433`; `postgres` role (system pool).
  Read-only queries only.

## Deliverable 1 — ground truth (LIVE prod rows, 2026-10-02)

### Incident `01M3SK62YZST272B35CG12K6TW` (review/quick/base, completed 2026-09-30)

| figure | value | source |
|---|---|---|
| hold → release | 1523 → 889 (promo bucket) | `credit_ledger` |
| Σ ledger debits (7 phase commits) | **634** | `credit_ledger` rows `debit:<run>:<phase>:<attempt>` |
| Σ `usage_records` `source='proxy'` (138 rows) | **632 cr** / $4.5455 list | meter of record |
| Σ `sdk_estimate` (7 rows) | 553 cr ($3.9426) | crosscheck twin |
| Σ `sdk_stream` (7 rows) | 440 cr | display twin |
| `runs.spent_credits` | **632** | reconcile: `greatest(committed claims 440, proxy 632)` |
| seat-level L4 query ("Editor — …") | **1625** = 632+553+440 | `sum(credits)` over ALL sources |

**Verdict: the charge was already metered.** The account paid 634 (within +2 of the 632 proxy meter —
the pod-claim floor in `incrementalMeteredDebit` can over-debit by the claim-vs-residual delta).
The "1,625" is a **display/query divergence**: `usage_records` rows were summed across
`proxy`+`sdk_estimate`+`sdk_stream` — the same tokens metered three times. The completion settle
(`settleMeteredDebit`) correctly found no gap (634 ≥ 632). RES.2's `wouldRefundCredits=340` is the
orthogonal zero-coverage finding (Unverified/refund scan), not a debit gap; retroaction remains
operator-paused.

**Unfiltered-source aggregation sites (the "divergence path" class):**

1. `apps/api/src/timeline-routes.ts:564` — L4 usage buckets (`sum(u.credits)`, no `source` filter) →
   the reported "Editor — 1,625 cr" figure.
2. `apps/api/src/chat-routes.ts:240` (`turnUsage`) — the cost strip's per-turn credits.
3. `apps/api/src/chat-routes.ts:253` (`workspaceSpend`) — the strip's workspace total.
4. `packages/ledger/src/usage.ts:189` (`usageLevel4`) — the Advanced-disclosure drill-down.
5. `packages/ledger/src/beta-dashboard.ts:694` — per-run `cogs_usd` sums `list_cost_usd` across all
   sources (`sdk_estimate` rows carry list cost → COGS ~2× overstated).
6. `packages/journeys/src/spend-guard.ts:44` — the JOURNEY.1 weekly metered cap guard sums all
   sources → over-counts the $5/week test-tenant guard (legs refused too early / accounted high).

Correct already: `packages/orchestrator/src/spend.ts` (`reconcileRunSpend`, `meteredCredits`,
`settleMeteredDebit`, `absorbMeteredGap`), `slo.ts` (intentional crosscheck), `benchmark` economics
scorer, `usageCsv` (ledger-based), `reconcile.ts` (provider-report arm).

### STB.3 legs (all pre-DEF.2 deploy; `adjustment(absorbed)` rows: none exist)

| run | state | debited | metered (proxy) | spent_credits | uncharged residue |
|---|---|---|---|---|---|
| `01M3DC1V…` outline | cancelled | 0 | 231 | 231 | 231 unabsorbed |
| `01M3DE92…` figure | completed | 60 | 58 | 60 | −2 over-debit (claim floor) |
| `01M3DEKK…` chat_turn | failed (cap) | 0 | 43 | 43 | 43 unabsorbed |
| `01M3DETH…` research_burst | cancelled | 0 | 98 | 98 | 98 unabsorbed |
| `01M3DGGC…` draft | cancelled | 73 | 218 | 218 | 145 unabsorbed |
| `01M3DJ5V…` profile_voice | cancelled | 0 | 185 | **182** | 185 unabsorbed + 3 late-arrival |
| `01M3DKQR…` review | cancelled | 114 | 438 | 438 | 324 unabsorbed |
| `01M3DK07…` figure (pin) | completed | 24 | 27 | 27 | −3 under-debit (pre-settle) |
| `01M3DQ4A…` figure stop | cancelled | 0 | 6 | **0** | 6 unabsorbed + late-arrival |
| `01M3DQ59…` figure (gate expiry) | cancelled | 0 | 0 | 0 | clean |

### `01M36663QG1ZJ7VEZ036Y54NSG` (D-PRB.21-1; review, completed 2026-09-25)

Debits 586 (5 commits), release 514 → **net paid 586**; metered proxy **720**; `spent_credits`=720.
**134-credit completed-run undercharge** — the run predates `settleMeteredDebit` (DEF.2), so the
metered remainder was never caught up. `runs.spent_credits` is correct (reconciled to the meter);
the LEDGER charge is the short figure.

### Named divergence paths (each gets a reproducing test)

- **D-A (display triple-count):** usage surfaces sum `credits`/`list_cost_usd` across every
  `usage_records.source` → 632 + 553 + 440 = 1,625. Fix: `source='proxy'` filter (meter of record).
- **D-B (completed-run under-debit, pre-settle era):** `01M36663…` −134cr; fixed going forward by
  DEF.2's `settleMeteredDebit`; historical rows stay as found (no one-off prod writes; retroactive
  debit is operator-paused). ADR-014 dated correction note: completed runs did NOT always debit
  metered before DEF.2; the incident run's specific charge WAS metered.
- **D-C (cancelled-run uncommitted burn):** metered > debited residue on cancel — absorbed (COGS)
  under DEF.2 policy; STB.3's pre-DEF.2 rows were never booked absorbed (no backfill — one-off prod
  writes forbidden; recorded as an OPEN FINDING).
- **D-D (terminal-failure unbooked burn):** `01M3DEKK…` failed with 43 metered, 0 debited, 0
  refunded-needed, absorb not booked (pre-DEF.2).
- **D-E (late-arriving proxy rows post-settle):** `01M3DQ4A…` spent=0 vs proxy=6;
  `01M3DJ5V…` spent=182 vs proxy=185. `reconcileRunSpend` ran before the final proxy flush; nothing
  re-scans settled runs. Post-DEF.2 this residue also escapes `absorbMeteredGap` (already settled).
  Fix: a settle-sweep re-reconciles recently-ended runs (idempotent via `greatest` + fresh-gap
  absorb) — ECON.1.
- **D-F (pod-claim floor over-debit):** `incrementalMeteredDebit`'s `max(claim, metered−debited)`
  floor can debit above final metered (incident +2; `01M3DE92…` +2). Under `debitMode=metered` the
  settle must also REFUND the excess (charge = metered exactly); under `committed` the committed
  figure stands (current semantics — the committed claim is the charge).

## Plan

1. Fix D-A sites + tests (reproducing the 632/553/440 triple-count shape).
2. `debitMode` flag on `OrchestratorDeps` (`committed` default, `DEBIT_MODE` env), metered settle
   (exact-metered: top-up debit + over-debit refund), burn-classification ADR (ADR-031).
3. §6.5 Quick conformance: `QUICK_REVIEW_CLAIM_CAP=5` — estimator prices `min(claims,5)` for
   review/quick; freeze `inputs.claim_cap` server-side at creation; worker authors webTools budgets
   from the capped count; `claim_rows_gte_inventory` oracle honors the cap (`rows ≥ min(inventory,
   cap)`); run-sheet copy. Quick tier/discourse/second_read already correct in `profiles.ts`.
4. Durable calibration store: additive migration `cost_card_observations` + `cost_card_cells`
   (bucket = workflow×rigor×tier×size-band; admissibility flags; derived cells; user-role SELECT,
   system-pool write). APIs `costCard`/`capFor`/`foldObservation`; replaces `INSTRUMENTED_OVERRIDES`
   at the call sites. ADR-032 (schema/bands/admissibility) + ADR-033 (Quick claim-cap mechanism).
5. Calibrated caps: per-bucket `cap_multiplier` refit (floor 1.25, breaker 2× via existing circuit
   breaker; p95 evidence), cap deployment with `debitMode=committed`. Calibration report.
6. Notice template + recipient query + send CLI (`scripts/send-metered-debit-notice.mjs`,
   `--dry-run` default, `--send` gated) + flip/rollback runbook. Nothing sent; no flip.
7. Stage B: instrumented legs cheapest-first (figure → chat_turn → review/quick), per-leg
   `list_cost_usd`, deploy (preview: zero stateful replace/delete, additive lint, ≤$15/mo delta),
   provenance=chain tip SHA, F5 live proof (completed + user-cancelled instrumented run),
   JOURNEY.1 Quick-sheet walk.
8. Reconcile leg: admin-key Usage & Cost is H7-pending → `D-ECON.1-1` with the exact marker.
9. Closeout: self-review, gap analysis vs the full ticket, full verify, PR, LEDGER/BUILD_INDEX/
   DEFERRALS/ADR index.

## Test matrix (planned)

- `spend.test.ts`: metered-mode settle refunds over-debit; committed mode unchanged; late-arrival
  re-settle absorb; D-B/D-C/D-E reproductions.
- `usage`/`chat-routes`/`timeline-routes`/`beta-dashboard`/`spend-guard` tests: twin-source rows
  (proxy+sdk_estimate+sdk_stream) → reads show proxy only.
- `profiles`/`estimator`/`lever-matrix` tests: quick review prices ≤5 claims; `claim_cap` freeze;
  oracle `claim_rows_gte_inventory` under cap.
- `cost-cards` tests: fold/derive/capFor, admissibility, band bucketing, idempotent re-fold.
- `estimator-refit` tests: multiplier floor/ceiling, in-sample reach computation.

## Stage B legs — live spend log

(to be appended per leg)

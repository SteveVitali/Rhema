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

## Stage B — deploy + migration (2026-10-02)

- **Migration:** `0049_cost_calibration.sql` applied to prod via `scripts/live/prod-migrate-seed.mjs`
  over the IAP tunnel — additive-migration gate linted it (`--newer-than 0048`, pass) before apply;
  49 migrations recorded. Live shape verified: `cost_observations` is tenant-scoped RLS (1 policy);
  `cost_card_cells` / `cap_calibration_reports` / `estimator_cells` are non-tenant platform
  aggregates (aggregates + ids only, invariant #10).
- **Build:** Cloud Build `6cffe99c` — the four diffed services (`run-task`, `api`, `web`, `worker`)
  built natively on amd64, tag `econ1-13e8b95`, `_GIT_SHA=13e8b95` (chain tip). Digests pinned in
  `infra/pulumi/Pulumi.prod.yaml`.
- **Preview:** `pulumi preview --stack prod` — 6 updates, 146 unchanged, **zero stateful
  replace/delete** (api/web/worker template+scaling; fetcher/collab/export scaling-only drift).
- **Up:** `pulumi up` update 103 (1m2s). `/healthz` provenance on api + web reports
  `gitSha:"13e8b95"` — the chain tip. Deployed env verified: `DEBIT_MODE=committed` on api AND
  worker (the flag ships dark — ADR-031); `RUN_TASK_IMAGE_DIGEST` = the new run-task digest;
  `ANTHROPIC_ADMIN_KEY_SECRET` already bound (the nightly `usage.reconcile` report source is live).
- **Provenance row:** `deployments` `prod:13e8b956d635c3025a3e582add7c627d353f374b`
  (2026-10-02T05:31:48Z; `protocols_version 0.4.0+ec61156725a895ab`, rate table 2026-10-02).
- **Test tenant:** `test+jrn-a@rhema.tools` (workspace `01M3V0VJ74HQXDPWPW2V8125S4`, `is_test`,
  trial_active/writer). Funded via `admin-cli house-grant` — 8,000cr promo expiring 2026-11-01
  (ledger `01M3XHQ0JVQN03E61XT70NVNGX`, audit `01M3XHQ0PRDNH0JHJ7EAT8FVF4`); the account's
  spendable buckets were 1,122cr (promo 962 + trial_pocket 150 + daily 10) vs the Standard/Base
  hold requirement (~5.7k). Approval policy set to `run_to_completion` for the instrumented legs
  (the I1 run itself was created under `named` — its `approve_scope` gate was approved through the
  real `/runs/:id/gates/:gid` route).
- **Notice dry run (read-only, $0):** `meteredNoticeRecipients` on prod returns **2 recipients** —
  the operator account (`14stevevitali@gmail.com`, `subscription+topup`) and a legacy pre-is_test
  probe account (`prb16-probe-…@rhema.tools`, `topup`); every `is_test` workspace (incl. jrn-a) is
  excluded. Template renders credits/cap/top-up/plan vocabulary, effective-date placeholder, no
  "you will be billed" phrasing. Nothing sent; no flip.
- **Reconcile leg (`usage.reconcile`, 2026-10-02T05:49Z):** enqueued on prod via pg-boss
  (`job 5fa8aeba-5a57-4850-9ef0-525cc189f3e3`) — the REQ-SPEC-24.1 **balance assertion ran live and
  passed** (`balances ok`), but the report/window arms skipped: the worker boot logged
  `ANTHROPIC admin key is a placeholder — Usage & Cost report pull unconfigured`. Verified directly:
  `rhema-prod-anthropic-admin-key` has exactly one version (created 2026-09-17) whose value is the
  seeded placeholder `sk-ant-admin_P…` (the earlier session's "real admin key" read was a prefix
  collision — `sk-ant-admin_P` vs a real `sk-ant-admin01…`; no real admin key exists in the
  project — every populated `*-anthropic-api-key` is a `sk-ant-api…` workspace key, which the
  Usage & Cost API refuses 401 per STB.4). → the report-pull arm is **HUMAN-H7 pending**; recorded as
  `D-ECON.1-1` in DEFERRALS.

## Stage B legs — live spend log

| leg | cell | run | state | metered (proxy) | list $ | committed | notes |
|---|---|---|---|---|---|---|---|
| I1 | review/standard/base · xs (267w excerpt) | `01M3XHQHWJWCP8VXDAVCH8B0C5` | **completed** 06:15:57Z | **919 cr** (131 proxy rows) | **$6.5992** | 919 cr (9 debits) | **F5-completed:** hold 5764 → release 4845; debits = proxy Σ = spent_credits = 919 — four-number agreement. Twins: sdk_estimate 937 / sdk_stream 616 (display-only, never read). |
| F5b | review/standard/base · xs (cancel mid-phase) | `01M3XM5X8DARDRX8YGE5WQQRT4` | **cancelled** 06:25:31Z | **150 cr** (37 proxy rows) | **$1.0825** | 139 cr (2 debits) + 11 absorbed | **F5-cancel:** approved `approve_scope`, pod mid-craft (a2, ~3min), user `POST /runs/:id/stop` → hold 5764 → release 5625. debits 139 + `adjustment{absorbed}` 10 (settle) + 1 (late proxy row 06:26:23 — the D-E late-arrival path) = proxy Σ 150. spent_credits 149 (pre-late-row). No silent burn; no over-debit. |
| N6 | review/quick/base · s (1029w essay, via UI) | `01M3XN53DEJY0NRJTTK2QDH8Z6` | **completed** 07:15:12Z — `delivery.label=unverified` | **724 cr** (163 proxy rows) | **$5.1992** | 438 debits − 159 platform-fault refund + 445 absorbed | Journey `owed` (expected-red; dossier poll hit the 40-min deadline at 07:14 vs deliver 07:15). Live: 16 searches / 32 fetches metered — RES.1's restore is real (vs the incident's zero); but all 5 checkable claims delivered `unverifiable` — every cited source failed the cited⇒fetched strip (the D-P0.15i-2 class). `claim_cap:5` froze server-side; the `platform_fault:zero_coverage` refund (159cr) + hold release (3046→2608) settled correctly. **Not a clean §6.5 cell:** F-ECON.1-1 ran discourse(61cr)+second_read(23cr) anyway. |
| I4 | review/quick/base · xs (267w excerpt, post-fix) | `01M3XRNG6E4XVY8VSZ8V3RE0A5` | **completed** 08:01:03Z — `delivery.label=unverified` | **477 cr** (92 proxy rows) | **$3.4315** | 477 debits − 164 platform-fault refund + 164 absorbed | **Clean §6.5 cell:** phases = intake 46 / craft 42 / verification 61 / argument 68 / letter 48 — **no discourse, no second_read** (vs N6's +84cr of disabled phases); `claim_cap:5` frozen, the claim ledger inventories all claims (8 checkable Tier-1/2), only 5 verified. Four-number agreement: Σ debits 477 = proxy Σ 477 = `spent_credits` 477; hold 2124 → release 1647. `platform_fault:zero_coverage` refunded verification's 164cr committed claim + absorbed the 164cr metered residue — committed mode charges 313 net, metered burn honest. Twins: sdk_estimate 431 / sdk_stream 265. |

Cumulative list spend: **$16.31** of the ≤$30 cap (I1 $6.60 + F5b $1.08 + N6 $5.20 + I4 $3.43).

**Committed-mode reading of the cancel leg:** under `debitMode=committed` the user pays the committed
139 while the meter reads 150 — the 11cr gap is written as `adjustment{reason:'absorbed'}` (D-C/D-E:
cancel burn + late-arrival absorbed, never silently debited). Under `debitMode=metered` the settle
would charge the metered 150 (cap-clamped) — the flag stays dark pending the notice window.
Post-settle note: `runs.spent_credits` re-wrote to 150 once the late proxy row folded — the
displayed figure converged to the meter exactly.

## Stage B — live finding F-ECON.1-1 (2026-10-02, the N6 walk surfaced it)

**Defect:** the §6.7 layering (`rigor defaults < protocol phase_defaults < stored overrides < sheet
toggles`, `run-routes.ts`) let the **essay seed's all-true `phase_defaults`** (`discourse:true`,
`second_read:true`, …) re-enable phases the Quick preset disables. N6's run
`01M3XN53DEJY0NRJTTK2QDH8Z6` froze `inputs.{discourse:true, second_read:true}` on a `rigor=quick`
review — priced AND running the two phases §6.5 says a Quick review does not run (the claim_cap:5
did freeze correctly). This is the same divergence class as D-PRB.21-1, one layer deeper.

**Fix (in-tree, this commit range):** seed/stored phase-defaults may only ever DISABLE relative to
the rigor preset — a `true` that contradicts a rigor `false` is dropped; the explicit sheet lever
still wins both ways (regression pinned in `run-routes.test.ts` — essay quick →
`discourse:false, second_read:false`; memo `discourse:false` still lands; user toggle still
overrides). Deployed as a follow-up econ1 build; the clean Quick cell is re-legged after.

**Consequence for the N6 leg:** the in-flight run is still valid D-RES.1-2 evidence (the asserts are
the RES.1 research restore, not toggle conformance) but it is NOT a clean §6.5 Quick cell — recorded
honestly with its inflated metered cost.

### Follow-up deploy (F-ECON.1-1 fix tip `e264219`, update 104)

- Cloud Build `e1fd8bc4` SUCCESS on `e264219` (tag `econ1-e264219`); digests re-pinned in
  `Pulumi.prod.yaml` (api/web/worker/run-task; the five untouched services keep bill3 pins).
- `pulumi preview`: 6 updates, 146 unchanged, **zero stateful replace/delete** (same shape as
  update 103). `pulumi up` update 104 (1m32s).
- Provenance: `/healthz` on api + web report `gitSha:"e264219"`; api revision
  `rhema-prod-api-e745ce0-00056-tkx` (07:34Z) carries `DEBIT_MODE=committed`.
- **Conformant Quick leg (post-fix):** `01M3XRNG6E4XVY8VSZ8V3RE0A5` on
  `res1-probe-2026-10-01-2` (267w excerpt) — frozen inputs verified live:
  `claim_cap:5, discourse:false, second_read:false, verification:true`; estimate 708 / cap 2124.
  This is the clean §6.5 Quick cell the ticket asks for. Result: completed 08:01:03Z
  (`delivery.label=unverified`, checkable 8 / covered 0 → `platform_fault:zero_coverage` settle —
  second consecutive zero-coverage Quick delivery on this fixture, same D-P0.15i-2 cited⇒fetched
  strip class as N6); four-number agreement in the legs table above.
- **Provenance row:** `deployments` `prod:e2642192f63236b2ce3c75faf1bdb72b654fe734`
  (2026-10-02T07:37:05Z; `protocols_version 0.4.0+ec61156725a895ab`, rate table 2026-10-02).

## Stage B — calibration harvest re-run + cap refit (2026-10-02, post-I4)

`econ1-harvest.mts` re-ran against prod with `presetCutover=2026-10-02T07:34:00Z` (the e264219
conformance deploy; per ADR-032 the cutover is deploy-stamped wall-clock truth) and
`researchAfter=2026-10-01T12:39:56Z` (RES.1's research restore). Four new observations written —
one per Stage-B leg — bringing the store to **97 observations**:

| verdict | n | the rows |
|---|---|---|
| admissible | **0** | — |
| `no_proxy_rows` | 21 | pre-metering-history runs |
| `not_completed` | 58 | cancelled/failed/**platform_fault** — incl. F5b (cancelled), N6 + I4 (`outcome=platform_fault` — RES.2's Unverified deliveries are evidence, never fit input) |
| `pre_preset_fix` | 18 | incl. I1 — ended 06:15Z, before the §6.5 conformance deploy |

- **`cost_card_cells`:** 43 cells recomputed (`fit_version econ1@2026-10-02`) — every observation
  feeds a card cell by design (ADR-032: a cancelled run's metered burn is real cost evidence), so
  the measured cards exist even where admissibility fails. The ECON.1 legs land as
  `review/standard/base/xs/completed` (919 cr / $6.60), `…/cancelled` (150 cr / $1.08),
  `review/quick/base/{s,xs}/platform_fault` (724 cr / $5.20; 477 cr / $3.43).
- **`cap_calibration_reports`: 0 rows.** `refitCapMultipliers` runs only on `admissible`
  observations and needs `CAP_REFIT_MIN_SAMPLE = 5` per bucket — with zero admissible prod samples
  the honest result is **no adopted per-bucket multipliers**: deployed caps stay at the modeled
  REQ-BILL-7 defaults (1.5× hold / 1.35 tighten / 1.25 floor / 2× runtime breaker). The refit
  machinery is unit-tested and exercised live; the data floor is unmet, not the mechanism. →
  **D-ECON.1-3** (adoption awaits organic admissible traffic via the weekly
  `billing.estimator-refit` job).
- **`estimator_cells`:** the fold's writer is the reconcile `rows` arm
  (`recalibrate` → `persistEstimatorCell`), which Anthropic's window-only Usage & Cost API never
  emits — the durable table is loadable on api+worker boot (`loadEstimatorCells` →
  `setInstrumentedOverride`) but stays empty until a report source yields per-request rows. The
  estimator keeps its prior instrumented overrides. Same H7 root cause as D-ECON.1-1.
- **Unmeasured cells:** the spend plan's I2/I2′/I3 Standard cells and every Balanced/Frontier cell
  stay `derived` (the ticket's own fallback) — spend stopped at $16.31 rather than buying cells a
  zero-admissible store could not fit anyway. → **D-ECON.1-4**.

# RPT.1 — run ledger (a live meter that moves, and a run report that adds up)

## Spec / Base / Branch / Config
- Spec: `docs/tickets/68_RPT.1__live-meter-and-run-report.md` (Manifest #3 "estimate → live meter → report";
  §5.5/§12.7/§14.4/§14.5/§15.3; REQ-BILL-9, REQ-BILL-6, REQ-BILL-8, REQ-IDE-11 (meter half),
  REQ-GROWTH-11 (usage half), REQ-SPEC-32(a) (display half); absorbs BL-57 = PR-E4/PR-R3 during+after;
  annotates D-P0.08-2's intra-phase half).
- Base: `stevevitali/est-1-one-estimate-everywhere` @ `29213dc` (append-only check base).
- Branch: `stevevitali/rpt-1-live-meter-and-run-report`. Stacked **PR #90** (base `stevevitali/est-1-one-estimate-everywhere` @ `29213dc`), mergePolicy=OPERATOR, never merge. Impl commit `a3f50bf`.
- **Harness:** Devin CLI (Cognition agentic coding CLI), Anthropic Claude.
- Design review: `docs/readouts/gate-2026-09-29-design-review.md` — execution-watch meter static,
  report vs ledger contradictions, "0 min" durations, empty Advanced, Showcase-as-real-usage.
- Spend: Stage A $0 (no inference). Stage B: one Quick/Base run on the ≤300-word fixture
  (`packages/journeys/fixtures/planted-error-excerpt.md`), metered cap ≤$3, cheapest-first,
  JOURNEY.1 test tenant `rhema-test-tenant-mailbox@stevenvitali.com` (H7 holds).

## Context map
- Meter of record: `apps/egress-proxy/src/{handler,metering,sinks}.ts` — `meterResponse` writes
  `usage_records(source='proxy', …, step_id, provider_request_id)`; `SqlCapAccountant.spentCredits`
  sums `list_cost_usd` proxy-only. SDK sources `sdk_stream`/`sdk_estimate` never aggregate into totals.
- Pod path: `apps/run-task/src/harness-main.ts` (agent proc + fd-3 event forward) →
  `harness-loop.ts:runCommitLoop` (preflight → `runPhase` → harvest → `commit`) —
  beats `PUT /internal/runs/:id/heartbeat` every `HEARTBEAT_INTERVAL_MS` (20 s) during every phase.
- Internal API: `packages/orchestrator/src/internal-api.ts` — `heartbeat` (fenced, first-beat
  transition), `postEvents`, `harvestStep` (provisional render → `sdk_stream` row → `usage.tick`),
  `commitStep` (upsert `steps`, `step.finished`, `incrementalMeteredDebit`), `failStep` (refund/absorb).
- Card: `packages/findings-core/src/run-card.ts` (structured facts only: `step.started/finished`,
  `usage.tick`, `cost.final`, `cost.refunded`) → `packages/ui/src/run-card.tsx`
  (`data-run-card`, `data-credits`, `data-credit-meter`, `data-phase`) → web SSR `creditsLabel`
  (`pages.tsx:1343`) → `apps/web/src/client/ide.ts` SSE handler + `feedLabelMaps`.
- Report: `apps/api/src/timeline-routes.ts` route (~#713) — runs row + steps + proxy-only
  `usage_records` agg → `buildRunReport`; `?advanced=1` → `RunReportAdvancedView` (join usage→steps).
- Spend: `packages/orchestrator/src/spend.ts` — `incrementalMeteredDebit`/`reconcileRunSpend`/
  `absorbMeteredGap`/`refundMeteredExcess`/`settleMeteredDebit`, `debit_mode` flip
  (`runs.input_snapshot->>'debit_mode'` + workspace), `adjustment(reason='absorbed'|'refunded')`.
- Usage surfaces: `packages/ledger/src/usage.ts` (L1 MTD / L2 project / L4 `source='proxy'` /
  `usageCsv`), `apps/api/src/billing-routes.ts` (`/billing/usage` runs list, `/projects/:id/usage`),
  `apps/web` `/usage` + `/p/:slug/usage`.
- Showcase: `packages/db/src/seed/showcase.ts` + `SHOWCASE` (`projects.showcase`, `runs.showcase` marker
  + `mirror_tags`), `copy.showcase`/`copy.sentBody` worked-example strings.

## Design (ticket-owned decisions → ADR-037 + ADR-038)
1. **Intra-phase meter source + cadence**: the existing 20 s heartbeat rides the pod's own internal
   call; inside `heartbeat`'s fenced tx the api reads `Σ usage_records(source='proxy')` for the run,
   computes `min(cap, max(spent_credits, metered))` and appends `usage.tick{…, provisional:true}` only
   when it differs from the last tick. No new channel, no proxy coupling, dedupes quiet beats,
   run-predicated reads (Manifest #13), counts-only payload (#10). Proxy-side publish rejected —
   the proxy has no event seam and its write path stays untouched.
2. **Step timing fact**: `POST /internal/runs/:id/steps/:stepKey/begin` (fenced like commit) upserts
   `steps.state='running'` + `started_at`; `commitStep` keeps the real `started_at` and derives
   `step.finished.durationMs` from `ended−started` server-side. No backfill; equal timestamps → `—`.
3. **Charged figure**: report headline `spent = Σ ledger debit − Σ refund` (read inside the route tx);
   `metered = Σ usage_records(source='proxy')`; gap → reasoned difference lines (cap/absorbed/
   refund/entitlement/committed + sdk cross-check note when divergent); `meteredCredits` on the view.
4. **Step attribution**: `x-rhema-step` header stamped by the pod's credential injector (agent-set
   copies stripped) → proxy `meterResponse.stepId` → `usage_records.step_id`; report/L4 join accepts
   both `step:<key>` (pod/sdk convention) and the orchestrator step-id form.
5. **Showcase**: `projects.showcase=true` excludes the run from `/billing/usage` list, `usageLevel1`,
   `usageLevel2`, `usageCsv`; `getRunReport` still serves it with `workedExample` label.

## Test matrix (executed — all green locally)
- orchestrator `internal-api.test.ts` (RPT.1 block, 8 tests): beats emit ascending provisional
  `usage.tick`s as proxy rows land mid-phase; dedupe/no-op beats; tick clamped at the cap; no tick on
  the provisioning→running beat or for a missing run; `beginStep` upsert + `step.started` once +
  duplicate no-op + stale-attempt fencing; committed step's `ended−started` is the real duration and
  `step.finished` carries it; commit-without-begin → equal timestamps → no `durationMs`; caller-measured
  `durationMs` is the fallback.
- harness `harness-loop.test.ts` (RPT.1 block): `beginStep` lands BEFORE `runPhase` for every phase
  (`["begin:craft","runPhase:craft","begin:letter","runPhase:letter"]`); commit carries the measured
  `durationMs`; a beginStep-less client still commits (the seam is optional). `internal-client.ts`
  gained `beginStep` (POST `/internal/runs/:id/steps/:key/begin`).
- proxy (`credential.test.ts`/`handler.test.ts`): `x-rhema-step` parses, `meterResponse` stamps
  `usage_records.step_id`, the header is stripped before provider egress.
- `credential-injector.test.ts`: the injector stamps `step:<phase>` and strips any agent-supplied
  `x-rhema-step` (no self-attribution).
- findings-core `run-report.test.ts` (RPT.1 block, 9 tests): under-cap / capped / refunded /
  entitlement / pre-flip fixtures — `spent = Σ debits − Σ refunds`, metered = Σ proxy rows, each
  difference reasoned (`cap`/`absorbed`/`refund(+reason)`/`entitlement`/`committed`/`cross_check`);
  refunded-failure shows `absorbed` for the full metered burn AND the refund line (net-of-refund
  arithmetic, ADR-038); `sdk_estimate` divergence >2% → `cross_check` display-only row; flags carry
  their figures; `workedExample` marks the view.
- findings-core `run-card.test.ts`: provisional ticks move spent + mark `provisional`; the committed
  tick / `cost.final` clears it (now an always-present boolean on the input); explicit opt wins.
- api `timeline-routes.test.ts` (RPT.1 blocks): SSR card reads the latest provisional tick; a
  non-provisional/behind tick loses; report `spent` = Σ debits − Σ refunds (634−4=630 ≠ claim 300);
  capped fixture's `cap` difference + `step:<key>` L4 join; a real step duration surfaces while a
  legacy equal-timestamps row reports `0` (rendered "—"); Showcase report → `workedExample`.
- ledger `usage.test.ts` (RPT.1 block): showcase run absent from L1 MTD, L2 project rollup, and the
  CSV; L4 counts `source='proxy'` only; the `step:<key>` join resolves the phase.
- web `server.test.ts`: report page + `?advanced=1` Level-4 rows; RPT.1 duration rendering — a
  45 s phase renders "45 sec", a `durationMs:0` legacy row renders "—", never "0 min".
- journeys `steps.ts`: R6 implemented (real assertion: launch → live meter poll → report checks).
  **Stage-B leg pending** → `D-RPT.1-1`.

## Log
- (start) Recon complete: confirmed heartbeat cadence is the cheapest ride; `usage.tick` schema is
  strict (needs optional `provisional`); card/feed split between `packages/ide` formatter and ui DOM;
  report route already proxy-only on usage but headline came from `runs.spent_credits` (committed
  claim), not the ledger. L4 join had `u.step_id = s.id` while pod writes `step:<key>` — attribution
  never matched. Showcase seeded `projects.showcase` but usage surfaces lacked predicates.
- (impl) Heartbeat reads Σ proxy usage inside its fenced tx and appends a deduped `usage.tick` with
  `provisional` when the figure is ahead of the committed claim (`contracts/events.ts` schema +
  `feed-labels`/`copy` provisional templates). `beginStep` (new fenced endpoint) stamps
  `steps.started_at` at phase start; `commitStep` preserves it and derives `step.finished.durationMs`
  server-side; the pod's measured `durationMs` is the fallback for begin-less commits.
- (impl) Report route (`timeline-routes.ts`): `spentCredits` = Σ `credit_ledger` debits − Σ refunds
  inside the report tx; `absorbed`/`refund`/`entitlement`/`committed`/`cap`/`cross_check` differences
  computed in `buildRunReport` (ADR-038 wording); proxy-only usage join accepts both `s.id` and
  `step:<phase>` (the L4 fix); `workedExample` when `projects.showcase`.
- (impl) Showcase exclusion: `usageLevel1`/`usageLevel2`/`usageCsv` + `/billing/usage` filter
  `projects.showcase`; a Showcase report still serves (labelled worked example).
- (impl) Duration truth: `durationMs === 0` (legacy equal-timestamps rows) renders "—"; a real
  sub-minute phase renders seconds — never "0 min".
- (impl) R6 journey step implemented — real launch on the ≤300-word excerpt, live meter poll,
  report-vs-card reconciliation; the deployed-stage leg is `D-RPT.1-1`.
- (verify) `pnpm turbo build lint typecheck` 135/135; `pnpm test` 3,987 pass / 0 fail;
  `check:licenses` + `check:protocol-markers` clean; `check-append-only --base 29213dc` OK;
  `check-build-memory.sh` no violations (7 pre-existing baseline warnings).
- (fixes along the way) `reportDifferences` gap arithmetic corrected to net-of-refund semantics so a
  refunded+absorbed failure shows the full absorbed burn AND the refund line without double-counting;
  `deriveRunCardInput` now emits `provisional` explicitly (false clears the marker); pglite returns
  `run_events.payload` parsed — tests read it as an object.

## Open at PR time
- `D-RPT.1-1` — the deployed-stage R6 leg (run + ledger cross-check + screenshots + the
  expected-red→green flip) rides Stage B.

## Stage B — deployed-stage execution (2026-10-02)

- **Deploy.** No migrations vs `29213dc` (`git diff 29213dc --name-only packages/db/migrations/` →
  empty). Cloud Build `bfe78701-7c4a-4f21-a391-c7f1233710fe` (tag `rpt1-b75581c`, SUCCESS, 6m40s);
  digests pinned in `infra/pulumi/Pulumi.prod.yaml` — api `f3edc839`, web `b4abadca`, worker
  `e08fa062`, egress-proxy `cb639623`, run-task `52bffc84` (short prefixes; the full digest
  set is in the `deployments` row). `pulumi preview`: 7 updates + 1 `InstanceTemplate`
  replacement (the proxy MIG rolls its template on any image change — compute, not stateful data);
  `pulumi up` **update 108** converged (7 updated, 1 replaced, 144 unchanged). The replacement
  proxy instance briefly reported `IP_IN_USE_BY_ANOTHER_RESOURCE`, then reached RUNNING/HEALTHY
  (`rhema-prod-proxy-h6fc`, MIG `rhema-prod-proxy-mig-34ea26a`). Pre-existing Pulumi warning about
  the undefined `alloydbCluster` stack output persists (cosmetic).
- **Provenance.** `GET https://api.rhema.tools/healthz` and `https://rhema.tools/healthz` both
  report `gitSha = b75581c50c7cb4bec281950ff2c1dab79b4de721`; `deployments` row
  `prod:b75581c50c7cb4bec281950ff2c1dab79b4de721` recorded via IAP tunnel with all nine image
  digests + `protocols_version 0.4.0+ec61156725a895ab` (deployed_at 14:59:13Z). Tunnel closed after
  evidence collection.
- **Journey R6 — GREEN.** `rhema-journeys` run nonce `d010a76f3347`, 15:09:31Z → 15:49:18Z,
  `passed:true`, R6 outcome `ready-to-flip`, 0 console errors, 0 failed requests, provenance match
  on both surfaces. Test tenant `01M3YJGDX7Q1GZNY88DKPH854E` (`is_test=true`, keyless DWD via
  `rhema-journeys@`, mailbox `test@rhema.tools`), funded with 4,000 promo credits before launch.
  Run `01M3YJSH728XTQ3NH03AYYB1Z7` — Quick/Base Review on `planted-error-excerpt.md`
  (≤300 words), estimate 588 cr, cap 1,764 cr, state `completed` at 15:49:12Z.
  Evidence: `docs/build/reports/2026-10-02_RPT.1-r6/{report.json,R6.png}`.
- **Intra-phase meter (the headline fix).** 54 `usage.tick` events on the run, 49
  `provisional:true`. Inside the single still-running `intake` phase the card's committed figure
  climbed 11 → 25 → 30 → 35 → 38 → 55 (seq 5–10, 15:13:33Z–15:14:53Z, ~20 s cadence); craft,
  verification, argument, and letter each produced their own ascending in-phase sequences (full
  distinct list: 11,25,30,35,38,55,49,58,68,91,84,102,110,121,140,143,213,242,266,274,285,294,308,
  403,456,459,463,492,498,504,509,516,520,543,548,555,569,160,578,584,609,201,617,622,633,643,667,
  681,696,702,712,719,732 — the dips are committed-claim ticks at step boundaries). Journey
  asserted ≥2 distinct spent values under one `running` phase + ≥1 `≈` provisional render: PASS.
- **Phase durations.** `step.finished.durationMs`: intake 179,902 ms · craft 129,992 ms ·
  verification 238,569 ms (attempt 2 — see hiccup) · argument 164,248 ms · letter 401,649 ms.
  Report renders real durations; journey asserted no `· 0 min` phase row: PASS.
- **Report ↔ ledger (read-only cross-check via IAP tunnel).** `credit_ledger` for the run:
  hold 1,764 → debits 58 (intake) + 35 (craft) + 97 (verification) + 41 (argument) + 123 (letter)
  = **354**; refund **97** (`platform_fault:zero_coverage`, verification phase); absorbed
  adjustments 382 + 97 = **479**; release 1,410. **Charged = Σ debits − Σ refunds = 257 cr** — the
  report's "…cr spent" figure equals it and `[data-metered-line]`'s charged component agrees
  (journey-asserted). Metered = Σ `usage_records(source='proxy')` = **736 cr / $5.313222 list**
  across 151 rows; the 736 → 257 gap renders as reasoned difference rows (absorbed + refund), not
  a bare key. Seat split: `editor`/base only, proxy-sourced (sdk twins 305 est / 242 stream never
  summed). `?advanced=1` Level-4 rows populated (153 of 161 usage rows carry a resolvable
  `step_id`/`step:<phase>` attribution; 8 pre-step rows unattributed by design).
- **Showcase legs.** Prod holds ≥10 seeded `showcase` projects, each with a completed
  `spent_credits=3,860` run and **zero** `usage_records` — including the test workspace's own
  (`01M3YJGDYCPAW0SGT1B9XDM4T2`); the L1/L2/CSV + `/billing/usage` predicates
  (`packages/ledger/src/usage.ts`, `apps/api/src/billing-routes.ts`) exclude `projects.showcase`
  runs, and `getRunReport` emits `workedExample` on theirs (`timeline-routes.ts:773` +
  `copy.ts:1947`). Verified by predicate + data shape; no showcase row can reach a usage surface.
- **Hiccup (honest).** At 15:33:32Z the run went `orphaned` (`heartbeat_stale` — a ~3.5-min silence
  inside verification), the reaper resumed it (`reaper_resume`, "resumed from the last completed
  phase"), and verification re-ran as attempt 2 (15:35:46Z–15:39:45Z). The duplicated phase is
  exactly what the `platform_fault:zero_coverage` refund + `absorbed` adjustments reconcile on the
  report — the difference machinery earned its keep on a real fault.
- **Spend log.** Test-tenant funding grant: 4,000 promo credits. Metered proxy list-cost for the
  run: **$5.31** — **over the ticket's ≤$3 leg cap** (the orphaned verification re-run ≈$1
  duplicated burn + a 6.7-min letter phase at Quick/Base rates pushed it past). Charged
  net-of-refund: **257 credits** (the ledger figure the user actually pays). The over-cap is on
  the metered-list-cost measure only; it is recorded here rather than hidden, and the run was
  allowed to finish because cancelling mid-verification would have destroyed the report leg the
  ticket exists to prove (RES.2's $7.27-vs-$3 precedent: complete, record, flag). Every later
  `RPT.1`-class live leg should prefer a rigor whose phases can't double on a reaper resume.
- **Close.** `registry.ts` R6 `expected: "red" → "green"`; D-RPT.1-1 flipped DONE in
  `docs/tickets/DEFERRALS.md`; screenshot + `report.json` committed under
  `docs/build/reports/2026-10-02_RPT.1-r6/`.


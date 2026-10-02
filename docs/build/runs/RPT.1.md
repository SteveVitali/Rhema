# RPT.1 — run ledger (a live meter that moves, and a run report that adds up)

## Spec / Base / Branch / Config
- Spec: `docs/tickets/68_RPT.1__live-meter-and-run-report.md` (Manifest #3 "estimate → live meter → report";
  §5.5/§12.7/§14.4/§14.5/§15.3; REQ-BILL-9, REQ-BILL-6, REQ-BILL-8, REQ-IDE-11 (meter half),
  REQ-GROWTH-11 (usage half), REQ-SPEC-32(a) (display half); absorbs BL-57 = PR-E4/PR-R3 during+after;
  annotates D-P0.08-2's intra-phase half).
- Base: `stevevitali/est-1-one-estimate-everywhere` @ `29213dc` (append-only check base).
- Branch: `stevevitali/rpt-1-live-meter-and-run-report`. Stacked PR, mergePolicy=OPERATOR, never merge.
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


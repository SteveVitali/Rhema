# RPT.1 — A live meter that moves, and a run report that adds up

The run card's meter now advances **inside a phase** from provisional proxy-metered usage (labelled
`≈`, never above the cap); `steps.started_at` records the phase's real start so durations are true
(a committed step reports `ended − started`, a sub-minute phase renders seconds, a legacy
equal-timestamps row renders "—" — never "0 min"); the run report reconciles with the ledger —
`spent` is Σ debits − Σ refunds, the seat split and metered line sum `usage_records(source='proxy')`
only, and every metered-vs-charged gap carries a reasoned sentence; `?advanced=1` populates the
phase × seat × model-tier × token drill-down (the proxy's `step:<phase>` attribution now joins); and
the seeded Showcase run leaves a workspace's `/usage`, billing runs list, totals, and CSV while its
own report wears the "Worked example" label.

Ticket: `docs/tickets/68_RPT.1__live-meter-and-run-report.md` (chain row 68, round 3).
Base: `stevevitali/est-1-one-estimate-everywhere` @ `29213dc` (stacks on the EST.1 tip).
Merge policy: **OPERATOR — do not merge.**
ADRs: **ADR-037** (intra-phase meter source + cadence — the heartbeat reads the proxy ledger),
**ADR-038** (metered ≠ charged difference wording + the net-of-refund gap arithmetic).
Requirement ids: **REQ-BILL-9** (primary), **REQ-BILL-6**, **REQ-BILL-8**, **REQ-IDE-11** (meter
half), **REQ-GROWTH-11** (usage half), **REQ-SPEC-32(a)** (display half). Absorbs **BL-57**.
Annotates **D-P0.08-2** (the intra-phase half of the provisional-tick debt — dated note appended).

## The defects (2026-09-30 prod design review)

- **PR-E4** — the run card's spend sat at 112 cr for 6+ minutes of a running phase: `usage.tick`
  emitted only at harvest (phase end); the meter was phase-granular.
- **PR-E5** — the report read "632 cr spent" beside "SEATS Editor — 1,625 cr (100%)": the headline
  was `runs.spent_credits` (the committed claim) while the seat split summed every `usage_records`
  source (proxy + sdk_stream + sdk_estimate = the same tokens counted three ways).
- **Every phase "0 min"** — the commit upsert wrote `started_at` and `ended_at` from the same `now`.
- **Empty Advanced** — `usage_records.step_id` carries the pod-stamped `step:<key>`; the join only
  tried `s.id`, so nothing ever attributed.
- **PR-R3** — a fresh workspace's `/usage` listed the seeded Showcase run as real spend.

## What changed

**Live meter (ADR-037).** The pod's existing 20 s heartbeat — already fenced, attempt-checked, and
run-predicated — now sums `usage_records(source='proxy')` inside its transaction and emits
`usage.tick{spentCredits, capCredits, provisional:true}` **only when the figure or its marker
changed** (deduped on the durable `run_events` row). The figure is
`min(cap, max(spent_credits, metered))` — provisional exactly when ahead of the committed claim;
`cost.final` is never provisional. The timeline SSR reads the latest tick for non-terminal runs; the
web island's SSE handler patches `[data-credits]`/`data-credit-meter`/`data-provisional` and flips
`data-phase-status` on `step.started`/`step.finished`. Payloads carry counts and credits only
(Manifest #10); no new channel, no proxy coupling.

**Real durations.** New fenced `POST /internal/runs/:id/steps/:key/begin` (`beginStep`) upserts the
step `running` and stamps `started_at` at phase start — the pod's commit loop calls it before each
`runPhase` (best-effort, optional seam for old clients) and commits the measured `durationMs` as a
fallback. `commitStep` preserves the begin row and derives `step.finished.durationMs` from
`ended − started`. Report phase bars render seconds under a minute and "—" for a 0 ms row.

**Reconciled report (ADR-038).** The report route reads `credit_ledger` inside its transaction:
`spent = Σ debit − Σ refund`; `metered = Σ usage_records(source='proxy')`. `buildRunReport` derives
the difference rows — `cap` / `absorbed` / `refund` (per ledger row, reason translated) /
`entitlement` / `committed` / `cross_check` — with net-of-refund gap arithmetic that mirrors
`absorbMeteredGap` (a refunded failure books the whole metered burn as absorbed). Flags are computed
from the reconciled figures and rendered from templated sentences. `meteredCredits` and
`workedExample` ride the view; the estimate line stays the frozen `runs.estimate_credits`
(REQ-BILL-6).

**Level-4 attribution.** The pod stamps `x-rhema-step: step:<phase>` through the credential injector
(agent-supplied copies stripped); the proxy persists it as `usage_records.step_id`; the report's L4
join resolves both `s.id` and `'step:' || s.phase`. The Advanced disclosure now renders real rows —
phase × seat × model-tier × credits × searches × fetches × tokens × provider request ids (tokens
stay behind the Level-4 fold).

**Showcase exclusion (§15.3).** `usageLevel1`, `usageLevel2`, `usageCsv`, and `/billing/usage` all
filter `projects.showcase`; a Showcase project's own report still serves, labelled "Worked example —
the seeded Showcase run; these are illustrative figures, not your usage."

**Journey R6 (live-verified green on prod, 2026-10-02).** `packages/journeys/src/steps.ts` R6 ran
against the deployed `b75581c` stage on the flagged `is_test` tenant: run
`01M3YJSH728XTQ3NH03AYYB1Z7` (Quick/Base on the ≤300-word planted-error excerpt) completed;
54 `usage.tick` events (49 provisional) advanced the card's meter *inside* single phases (intake:
11→25→30→35→38→55); the report reconciled to the ledger (spent 257 = debits 354 − refund 97,
with the 736-cr metered gap reasoned as absorbed + `platform_fault:zero_coverage`); every phase
rendered a real duration (180 s / 130 s / 239 s / 164 s / 402 s — no "0 min"); `?advanced=1` listed
per-request rows; `passed:true`, `ready-to-flip`, registry flipped to `expected:"green"`. Evidence:
`docs/build/reports/2026-10-02_RPT.1-r6/`. Honest note: metered list-cost came to **$5.31** vs the
leg's ≤$3 cap — the verification step orphaned on a stale heartbeat, the reaper resumed it, and the
re-run plus a long letter phase doubled the burn; net charged was 257 cr. Recorded in
`docs/build/runs/RPT.1.md` § Stage B.

## Traceability

| Requirement | Where |
|---|---|
| REQ-IDE-11 (meter) | heartbeat tick + SSR/SSE card patch (`internal-api.ts`, `timeline-routes.ts`, `ide.ts`) |
| REQ-BILL-6 | `estimateCredits` untouched/frozen; `spent` = ledger debits − refunds |
| REQ-BILL-8 | proxy-only seat split + metered line + populated Level-4 |
| REQ-BILL-9 | server-computed flags/differences from reconciled figures, templated sentences |
| REQ-GROWTH-11 (usage) | `projects.showcase` excluded from L1/L2/CSV/billing surfaces |
| REQ-SPEC-32(a) (display) | metered-vs-charged stated per reason; provisional never conflated |

## Verification

- `pnpm turbo build lint typecheck` — 135/135 green.
- `pnpm test` — 3,987 pass / 0 fail (new: 8 orchestrator beginStep+tick tests, 9 report
  reconciliation fixtures, card provisional tests, proxy/injector attribution, ledger showcase+L4
  joins, web duration/provisional/advanced rendering).
- `pnpm check:licenses`, `pnpm check:protocol-markers` — clean (no new deps; ticks/events carry
  counts and credits only — no protocol text in payloads).
- `node docs/build/tools/check-append-only.mjs --base 29213dc` — OK; `check-build-memory.sh` — no
  violations.
- **Stage B — DONE (2026-10-02).** `b75581c` deployed via Pulumi update 108 (additive; no
  migrations; the proxy instance-template rolled as part of the MIG image update — compute only).
  Provenance `prod:b75581c50c7cb4bec281950ff2c1dab79b4de721` on api + web `/healthz`; `deployments`
  row recorded. R6 **green** on prod (see above); `D-RPT.1-1` closed DONE. Metered $5.31 vs the ≤$3
  leg cap — recorded honestly in `runs/RPT.1.md` § Stage B (orphan/reaper re-run; net charged 257 cr).

# R6ENG.3 — RES.3 verification-phase checkpointing + budget-aware retry gate (REQ-ENG-3)

Stacked on `stevevitali/r6eng-2-sse-finalize-wakeup` · `mergePolicy: OPERATOR` —
**do not merge; the operator merges the chain bottom-up.** Offline-only ticket;
$0; no live stage; zero prod contact — **no paid verification leg ran before
this landed** (the REQ-FND-7 precondition). `implement-spec
spec=docs/tickets/178_R6ENG.3__res3-verification-checkpointing.md` — manifest
row 178, depends on 177_R6ENG.2. ADR-117.

**Requirement ids stamped:** REQ-ENG-3

## The burn this closes (`D-RES.3-1`, BL-79)

Run `01M48VNKY6F263TCQRVBJ8JRQA` (RES.3 verification; 9 claims,
`searchBudget=17`, `fetchBudget=48`) drained its whole claim-scaled bound
across four executions because two holes compounded:

1. **Research is volatile** — a non-complete exec's produced `/work` files were
   never persisted (harvest only runs on `complete`), so every re-run mounted
   nothing and re-researched from zero. Exec 1 spent 12 searches + 12 fetches
   and wrote *no* `01-claim-ledger` artifact.
2. **The retry decision is budget-blind** — the in-pod guided retry and two
   stranded-queue re-drives each opened a fresh session against the same
   run-level bound; nothing consulted `usage_records`, so the proxy correctly
   granted headroom until it hit exactly 17/48. Only the final tool-less exec
   wrote the honest 9/9-`unverifiable` ledger → `platform_fault:zero_coverage`.

## What

Three coordinated mechanisms, all server-authored (ADR-117):

**1. `phase<N>` checkpointing** — `checkpointStep` +
`POST /internal/runs/:id/steps/:key/checkpoint` persists a research phase's
produced versions (content-addressed `persistHarvest`) on a non-complete
outcome; the run's own `steps.produced_version_ids` union remounts them
readwrite on the next hydration (BL-66 same-run exemption). Head-sha deduped
(identical replay mints no duplicate), accumulating unions, fenced `stale_task`
for superseded attempts, insert-before-`beginStep` supported, a checkpoint
after commit lands bytes but never rewrites the `done` row's attribution, and
`failStep` never clears the produced set. `phase.checkpointed` is internal
telemetry (paths + version ids — `run_events_internal`, never user SSE).

**2. The budget consult** — `researchBudgetConsult`
(`packages/orchestrator/src/research-budget.ts`):
`remaining = claimScaledBound − Σ usage_records{source='proxy'}` across **all
attempts** (D-RES.3-1 isolation — a fresh attempt/pod/session never resets the
envelope), `preflight`/`backfill` excluded for exact parity with the proxy's
`ResearchUsageTracker` (bypass + dedicated counter), bound read off the run's
latest active `proxy_credentials.context->'webTools'` with the proxy's 24/48
fail-safe defaults. `exhausted` = both axes at zero. Served at
`GET /internal/runs/:id/research-budget` and stamped on the run spec.

**3. The two-sided retry gate** (`runCommitLoop`):
- *Pre-exec* — a spec whose consult reads `exhausted` never spawns model
  traffic (the stranded re-drive arm): `inspectWork` reads the remounted `/work`
  with no agent run, and the step either checkpoint-commits when the phase's
  declared predicates pass on the checkpointed artifacts (`sdk_subtype
  "research_budget_exhausted"` — the REQ-SPEC-31 Unverified path; a fact_check
  rides it into `label:unverified` + refund at delivery) or fails terminal.
- *Retry boundary* — a non-complete research exec checkpoints its produced
  versions, then the loop consults the live route: `exhausted` ⇒ the same
  inspect-and-resolve, never a second `runPhase`; otherwise the existing guided
  retry proceeds unchanged. The consult call degrades fail-closed to the
  spec-stamped figure — never to an unbounded retry.
- `failStep{research_budget_exhausted}` terminalizes via
  `terminalPhaseFailure` → `running→failed` + refund + release + revoke — the
  crash loop can never re-enqueue into a dead bound.

**Seat contract (sanctioned inputs, zero skill text — REQ-ARCH-5):** research
phases carry `checkpoint_contract` (write the ledger skeleton early, rows
`unverifiable` until researched — a terminated attempt's last write IS the
checkpoint), `research_budget` (the remaining figure for pacing), and
`checkpoint` (the remounted resume paths when they exist).

Untouched: research floors (`searchFloor`/`fetchFloor`), preflight bypass,
CITE.1's `backfillFetchBudget`, non-research phases, the proxy's admission
authority (it stays the meter of record — the pod never self-reports).

## Evidence (deterministic)

- **D-RES.3-1 drain reproduced** — `harness-loop.test.ts` (8 RES.3 tests): exec
  1 fails `artifact_missing` with produced versions → checkpoint persists →
  consult exhausted → **zero further `runPhase` calls** → predicates unmet →
  terminal `research_budget_exhausted`. Plus: spec-stamped gate (re-drive never
  execs; checkpoint-commit when predicates pass; terminal when not), live-bound
  retry regression, accumulate-on-retry, non-research scoping, fail-closed
  consult fallback.
- `internal-api.test.ts` (8 new): checkpoint persistence + heads, internal
  event on `run_events_internal`, idempotent replay, pre-`beginStep` insert,
  stale-attempt fence, `done`-row late-arrival no-op, produced-set survival
  through `failStep`, `research_budget_exhausted` terminalization.
- `research-budget.test.ts` (7): all-attempt sums, `sdk_stream`/`sdk_estimate`
  and `preflight`/`backfill` exclusions, one-axis-alive ≠ exhausted, 24/48
  defaults, zero-usage = full.
- `runspec.test.ts` (4 new): consult + checkpoint + resume inputs stamped on
  research phases only; checkpointed head in the hydration manifest;
  cross-attempt spend drains the stamped figure.
- Full repo: **`pnpm test` — 504 files / 5,901 pass / 0 fail**; `pnpm turbo
  build lint typecheck` 135/135; all six `check:*` green;
  `check-upstream-diff.mjs` OK (no protocol text touched — inputs only);
  check-build-memory 0 violations; append-only vs `c9be2f2` OK.

## Deferrals

- **`D-RES.3-1` stays OPEN** on its paid live half — dated 2026-10-21 note
  names the funded-wave leg (the verbatim verification recipe: a fact_check
  whose first exec writes no ledger → the second exec finds the checkpoint
  remounted or the retry refused; `usage_records` must show no re-spend of a
  dead bound; a tool-less verification still delivers `label:unverified` +
  phase-scoped refund).
- **R6GLD.1 golden validation** — protocol-affecting per the ticket's note;
  the launch-candidate-SHA golden cohort covers this change (no paid leg ran
  here by design).

## Deviations

- Ticket size budget ~500 changed lines → ~1,000 (+~400 test lines). Splitting
  at the protocol/orchestrator seam was considered; the three mechanisms are
  one logical fix and the bulk is test + ledger mass — recorded, not split.
- `tools/system-pool-boundary.json` +1 audited file (`research-budget.ts`) —
  deliberate addition per the boundary rule (consult reads ride
  `systemTxRunner` like the preflight roster they mirror).

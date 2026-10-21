# R6ENG.3 — RES.3 verification-phase checkpointing + budget-aware retry gate — run ledger

- **Spec:** `docs/tickets/178_R6ENG.3__res3-verification-checkpointing.md` (manifest row 178, round 6 —
  Kind: ticket) — `implement-spec`; spec §4.1 `REQ-ENG-3`; DEFERRALS row **`D-RES.3-1`**; BL-79;
  ADR-015 (research integrity)
- **Base:** `stevevitali/r6eng-2-sse-finalize-wakeup` at **local** HEAD `c9be2f2` (the R6ENG.2
  boundary commit, deliberately unpushed — never reset to `origin/`, which lacks it)
- **Branch:** `stevevitali/r6eng-3-res3-verification-checkpointing` (PR base
  `stevevitali/r6eng-2-sse-finalize-wakeup`; mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** `REQ-ENG-3`
- **Live stage:** offline-only (no paid leg; the paid re-verify rides the funded wave after deploy —
  **no paid verification leg may run before this lands**, REQ-FND-7 prerequisite)
- **Production mutations:** none · **Gate status:** none
- **Started:** 2026-10-21
- **Closed:** 2026-10-21 — **PR #198** (`9f1240d` code head; ci: pass — run 39539400068,
  all seven legs + `ci-pass` anchor); unmerged, OPERATOR merges bottom-up

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol — AGENTS.md). The ticket's own row is
**`D-RES.3-1` (OPEN)** — live diagnosis of run `01M48VNKY6F263TCQRVBJ8JRQA` verbatim: 9 claims,
`searchBudget=17` (8+1/claim), `fetchBudget=48` (12+4/claim). Exec 1 researched (12 searches +
12 fetches, 313,753-token call) but wrote **zero** artifacts; the in-pod retry + two stranded-queue
re-drives re-ran verification with fresh sessions against the same per-run bound — searches hit
exactly 17, fetches exactly 48 — and only the final tool-less exec wrote the honest 9/9
`unverifiable` ledger → `platform_fault:zero_coverage`. ~$8.45 burned to reach honesty.
This run ships the deterministic half (checkpointing + retry gate + tests); the row **stays OPEN**
on its paid live half with a dated note naming the funded-wave leg. No other OPEN row is
unblocked by this ticket.

## Requirements (from the ticket)

1. `phase<N>` checkpoint artifacts for the verification phase — a retry resumes rather than
   re-researching.
2. The late-arrival contract (what a checkpoint written after a retry starts means).
3. A retry-gate consult: an exhausted research budget ends in an honest
   `research_budget_exhausted`-class outcome and the REQ-SPEC-31 Unverified path — never a
   silent re-drain.
4. Budget isolation per attempt as D-RES.3-1 specifies.
5. Deterministic tests reproducing the drained-budget sequence.

Out of scope: skill text edits (REQ-ARCH-5 — sanctioned inputs/outputs only); the paid live
verify; research-floor changes (RES.1).

## Phase 0 — diagnosis from the anchors

**The burn mechanism (no checkpoint, no consult):** `runCommitLoop`
(`apps/run-task/src/harness-loop.ts`) runs each phase once, then once more guided on
`artifact_missing|infra|provider_transient`. On any non-complete verdict it calls `failStep`
— **produced `/work` versions are never persisted on the failure path** (the `harvest` route
only runs on `complete`). A stranded-queue re-drive (`run.reap` → new pod → `fetchRunSpec`)
re-materializes `/work` from artifact heads only — exec N's partial work is gone. Nothing
consults `usage_records` before re-executing, so each re-drive burns the claim-scaled bound
against fresh sessions until the proxy itself drops the tools at remaining ≤ 0.

**What already exists (reused, not rebuilt):**
- `persistHarvest` (`@rhema/mirror`) — content-addressed versions + `artifacts.head_version_id`.
  A persisted produced version remounts on the next hydration **readwrite** (seat namespace
  `agents/editor/**` is a `readwrite` §12.6 mount) → the retry edits the checkpoint in place.
- BL-66 `versionsProducedByOtherRuns` — `agents/**` heads produced by *other* runs'
  `steps.produced_version_ids` never mount; this run's own failed-step versions DO mount.
- `steps.produced_version_ids` — the produced-set attribution column (commit writes it today).
- `terminalPhaseFailure` (`internal-api.ts`) — the failStep→`running→failed`+refund+release+
  absorb+revoke path (`research_preflight_failed` is the precedent for a named terminal code).
- `webTools` policy on `proxy_credentials.context->'webTools'` — already read in `runspec.ts`
  for `authorResearchPreflight` (via `deps.systemTxRunner`).
- `usage_records` `source='proxy'` rows with `searches`/`fetches`/`phase_class` — the meter of
  record (0056 stamps `phase_class`; `preflight` bypasses the bound and `backfill` draws its own
  allowance in the proxy's `ResearchUsageTracker` — the consult must exclude both classes).
- `evaluateOracle`/`createFactsEvaluator` — leg (c) predicates are evaluable without an exec.
- `buildPhaseOutputs` (`work-reader.ts`) — pure `/work`→`PhaseRunOutputs` (facts + versions +
  dossier) — the checkpoint-commit evaluator.
- The `checkpoint_contract`-class sanctioned input channel (`phase_output`, `sidecar_contract`,
  `phase_result_contract`, `research_fanout` precedents — `key=value` prompt lines, no skill text).

## Phase 1 — design (recorded before code; ADR lands with the implementation)

**The `phase<N>` checkpoint** = the phase's produced writable versions persisted durably on
non-complete outcomes, attributed to the step row (`steps.produced_version_ids`), which makes
them artifact heads → they remount on the next hydration/attempt at their real paths
(`agents/editor/…` incl. `.rhema/01-claim-ledger.json`). The `phase.checkpointed` internal
run-event is the durable marker. Checkpoint persistence rides a new fenced route
`POST /internal/runs/:id/steps/:key/checkpoint` → `checkpointStep` (fence → `persistHarvest` →
union `produced_version_ids` → event). The loop calls it for `phaseClass:"research"` on every
non-complete verdict with `versions.length > 0`, before the retry decision.

**Late-arrival contract:** checkpoints are attempt-fenced — a checkpoint write from a superseded
attempt is refused `stale_task` and never persisted. Materialization is a hydration-time snapshot
(never mid-phase): a checkpoint landing after a retry's hydration is invisible to that retry and
simply wins the head for the next hydration. Within an attempt, checkpoint calls are sequential
and accumulate (union semantics). A 'done' step row is never touched.

**The retry-gate consult** (`packages/orchestrator/src/research-budget.ts`):
`remaining = claimScaledBudget − Σ usage_records{source:'proxy', phase_class ∉ {preflight,backfill}}`
summed **per-run across all attempts** (a fresh attempt/pod/session never resets the bound — the
isolation the incident lacked). `exhausted` = searches ≤ 0 **and** fetches ≤ 0 (either axis alive
can still do honest fetch-only/search-only work — recorded decision). Consulted twice:
(a) at spec build — `spec.researchBudget` rides the runspec for research-class phases (catches
the stranded re-drive before any exec); (b) live via `GET /internal/runs/:id/research-budget`
before the in-pod guided retry. On exhausted:
- **checkpoint-commit** — `inspectWork` reads the mounted `/work` (no agent run); if every
  completion predicate passes on the checkpointed artifacts AND `produced_version_ids` are on
  record, the step commits `done` with `sdkSubtype:"research_budget_exhausted"` — then the run
  advances/delivers normally. For a final-phase research step (fact_check) delivery computes
  coverage → `label:unverified` + the phase-scoped refund — the REQ-SPEC-31 Unverified path.
- else **terminal fail** — `failStep("research_budget_exhausted")` →
  `terminalPhaseFailure` → `running→failed` + refund + release + absorb + revoke (the run can
  never re-enqueue into a dead budget — the crash-loop arm).

**Resume steering (sanctioned inputs, no skill text):** for research-class phases the spec adds
`checkpoint_contract` (skeleton-first: write every inventoried row early, update incrementally),
`research_budget` (`searches:<n> fetches:<n> remaining`), and — when a prior failed-step
checkpoint exists — `checkpoint` naming the remounted paths ("resume; do not re-research covered
claims").

**Budget isolation (deliverable 4):** one run-scoped claim-scaled envelope shared by all
attempts; per-attempt attribution stays on `usage_records.attempt`; `preflight`/`backfill`
classes stay isolated off the bound exactly as the proxy's tracker accounts them.

## Phase 1 — test matrix (engineered, deterministic)

`apps/run-task/src/harness-loop.test.ts` (in-process seams):
1. D-RES.3-1 drain sequence — research exec fails `artifact_missing` with produced versions →
   checkpoint called → live consult exhausted → **no second `runPhase`** → predicates unmet →
   `failStep{research_budget_exhausted}` → `failed`.
2. Re-drive gate — spec stamped `researchBudget.exhausted` + `checkpoint` ids → `runPhase`
   never called → `inspectWork` predicates pass → checkpoint-commit (`sdkSubtype` marker,
   produced ids) → advance/deliver.
3. Re-drive gate, no usable checkpoint → `inspectWork` predicates fail / seam unbound →
   terminal `research_budget_exhausted` failStep.
4. Consult non-exhausted → guided retry proceeds (regression: current behavior preserved).
5. Checkpoint on every non-complete research exec with versions; NOT called for non-research.
6. Final-phase (fact_check) checkpoint-commit → deliver with the checkpointed ledger dossier.

`packages/orchestrator/src/research-budget.test.ts` (PGlite):
7. `proxy`-source sums counted; `sdk_stream`/`sdk_estimate` excluded; `phase_class` `preflight`
   + `backfill` excluded; all attempts summed (isolation).
8. Exhaustion = both kinds spent; either-alive ≠ exhausted; policy defaults (24/48) absent
   credential context.

`packages/orchestrator/src/internal-api.test.ts` (+ runspec.test.ts):
9. `checkpointStep` persists versions (heads move), unions `produced_version_ids`, refuses a
   stale attempt (`stale_task`), never touches a 'done' row, emits `phase.checkpointed`.
10. `failStep("research_budget_exhausted")` terminalizes: `running→failed`,
    `failure.code='research_budget_exhausted'`, refund + release + revoke.
11. `buildHarnessRunSpec` on a checkpointed failed ordinal stamps `spec.researchBudget` +
    `spec.checkpoint` + `inputs.checkpoint`/`research_budget`/`checkpoint_contract`; the
    checkpointed artifact head appears in the hydration manifest.

## Phase 2 — what was built

- `packages/orchestrator/src/research-budget.ts` (NEW) — `readRunWebToolsPolicy` +
  `researchBudgetConsult`: run-scoped `usage_records{source='proxy'}` sums across all
  attempts, `phase_class ∈ {preflight,backfill}` excluded (exact parity with the proxy's
  `ResearchUsageTracker` — verified line-by-line vs `apps/egress-proxy/src/handler.ts`
  §§397–500), the bound off the latest active `proxy_credentials` (`attempt desc`), proxy
  fail-safe defaults 24/48. `exhausted` = both axes at zero.
- `internal-api.ts` — `checkpointStep` (fence → head-sha dedup → `persistHarvest` →
  union `produced_version_ids` → `phase.checkpointed` internal event; stale ⇒ `stale_task`;
  insert arm covers pre-`beginStep`; a `done` row's attribution is untouchable),
  `researchBudgetState` (the GET handler), `terminalPhaseFailure` +
  `research_budget_exhausted`.
- `runspec.ts` — `researchBudget` + `checkpoint` stamped on research-class phases only;
  `checkpoint_contract` / `research_budget` / `checkpoint` sanctioned prompt inputs.
- `events.ts` — `phase.checkpointed` (internal visibility + density; no content).
- `run-routes.ts` — `POST …/steps/:key/checkpoint` (harvest wire shape minus usage) +
  `GET …/research-budget`.
- `harness-loop.ts` — `checkpoint()`/`researchBudget()`/`inspectWork` client seams; the
  two-sided gate (pre-exec consult + post-checkpoint consult); checkpoint-commit marks
  `sdkSubtype:"research_budget_exhausted"`; terminal fail closes `running→failed`.
- `harness-main.ts` — `inspectWorkInPod`: materializes the manifest once (fresh pod), then
  reads `/work` live via the same `readWorkRoots`+`buildPhaseOutputs` the exec path uses.
- `internal-client.ts` — the token-authed wire methods.
- `tools/system-pool-boundary.json` — `research-budget.ts` audited (deliberate addition —
  the consult's credential read rides `systemTxRunner` like the preflight roster it mirrors).
- ADR-117 + regenerated index.

## Self-review + gap analysis

- [x] mechanical pass — `steps.produced_version_ids text[] not null default '{}'` (no NULL
  union hole); `unique (run_id, ordinal)` covers the upsert; `beginStep`'s `not in
  ('running','done')` update is a safe no-op over a checkpoint-created row; `commitStep`
  replaces `produced_version_ids` so the pod's reported set is always the checkpoint∪harvest
  union; `failStep` never touches the column (checkpoint survives a fail — tested);
  `postJson` throws on 409 ⇒ a stale checkpoint throw is swallowed as "no checkpoint"
  (write-safe: the stale attempt's commit/failStep get fenced anyway).
- [x] design pass — consult parity verified against `handler.ts` (preflight `bypassBudget`
  at admission AND settlement; backfill on the dedicated counter; unstamped `phase_class`
  counts — matching `coalesce(phase_class,'') not in (...)`); late-arrival ordering:
  checkpoints fence on the RUN's attempt, materialize is hydration-time only, 'done' rows
  immutable; `checkpoint-commit` re-evaluates the phase's own declared predicates via the
  same `createFactsEvaluator` — the oracle stays authoritative, "has files" never commits.
- [x] gap analysis vs every requirement/AC/invariant —
  AC1 drain reproduced deterministically ✓ · AC2 upstream-diff gate green ✓ · AC3 ADR-117 ✓
  · AC4 `D-RES.3-1` stays OPEN (leading token) with a dated note naming the funded-wave leg ✓
  · deliverables 1–5 all landed · invariant 7/8 (fences fail-closed; events split
  user/internal) · REQ-SPEC-31 honesty (Unverified via checkpoint-commit; `research_budget_exhausted`
  is terminal — never a silent re-drain) · REQ-SPEC-30 (audited boundary entry) · REQ-ARCH-5
  (zero skill text — sanctioned inputs only) · research floors/backfill budgets untouched.
- **Deviation:** ticket size budget ~500 → ~1,000 changed lines (+~400 tests); the three
  mechanisms are one fix — recorded in the PR body, not split.

## Verification evidence

- [x] `pnpm turbo build lint typecheck` — 135/135 tasks green
- [x] `pnpm test` — **504 files / 5,901 pass / 0 fail** (4 skips pre-existing; docker privsep
  suite green)
- [x] all six `check:*` — licenses / protocol-markers / no-cookies / spa-budget / spa-env /
  dom-contract all OK
- [x] `scripts/check-upstream-diff.mjs` — OK, 22 ported files reconcile (inputs-only deltas)
- [x] R6GLD.1 golden validation — protocol-affecting; rides the launch-candidate-SHA golden
  cohort per the ticket's note (no paid leg ran here by design — recorded in the PR body)
- [x] `check-build-memory.sh` — 0 violations (7 pre-existing warnings)
- [x] `check-append-only.mjs --base c9be2f2` — OK (first pass caught a DEFERRALS reorder —
  fixed to a pure append before commit)
- [x] PR boundary read verbatim — **`ci: pass #198@9f1240d`** (run 39539400068 — all seven
  legs: typecheck/lint/unit · integration · images+scan+pin · contracts · public-safe
  (gitleaks/markers/licence) · fast-path · `ci-pass` anchor). First read outlasted the 2700 s
  bound mid-unit; re-read at 5400 s → pass. Record: `ci-boundary.ULwaHw`.

## Closeout

- **Branch** `stevevitali/r6eng-3-res3-verification-checkpointing` · **PR #198** against
  `stevevitali/r6eng-2-sse-finalize-wakeup` (OPERATOR merges bottom-up — never this run).
- **Deferrals:** `D-RES.3-1` appended (stays OPEN — paid live half rides the funded wave,
  verbatim recipe preserved); no new rows opened.
- **Deterministic evidence totals:** research-budget 7/7 · internal-api 57/57 · runspec 40/40
  · harness-loop 36/36 · events 7/7 · system-pool-boundary 2/2; repo-wide 5,901/0-fail.

## Spend

- $0 — offline-only; no paid legs dispatched (the REQ-FND-7 precondition held: no paid
  verification leg ran before this landed).

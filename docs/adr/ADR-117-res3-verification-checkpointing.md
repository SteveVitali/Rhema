# ADR-117: Verification checkpointing + the budget-aware retry gate — retries consult the bound, dead bounds resolve honestly

- **Status:** Accepted
- **Date:** 2026-10-22
- **Ticket:** R6ENG.3
- **Requirement ids:** REQ-ENG-3
- **Spec:** `docs/tickets/178_R6ENG.3__res3-verification-checkpointing.md`; the live
  diagnosis `docs/build/runs/RES.3.md`; DEFERRALS row `D-RES.3-1` (per-attempt
  isolation); `BL-79` (the retry-drain defect)

## Context

Run `01M48VNKY6F263TCQRVBJ8JRQA` (the RES.3 verification leg: 9 claims,
`searchBudget=17`, `fetchBudget=48`) drained its entire claim-scaled web bound
across four executions because nothing durable carried partial research between
executions and nothing consulted `usage_records` before re-running the phase:

- exec 1 spent 12 searches + 12 fetches and wrote **zero** files — the phase's
  produced work was never persisted mid-flight, so every re-run started from an
  empty mount;
- the in-pod guided retry and two stranded-queue re-drives each opened a **fresh
  session** against the same run-level bound — sessions carry no memory, the
  proxy's admission is the only gate, and the proxy correctly grants headroom the
  bound still holds;
- the three re-executions consumed the remaining bound exactly (17/17 searches,
  48/48 fetches). Only the last attempt — running with the tools already removed
  — wrote the honest 9/9-`unverifiable` ledger, and the run settled
  `platform_fault:zero_coverage`.

So the defect is two coupled holes: **research is volatile** (nothing persists
until commit) and **the retry decision is budget-blind** (neither the pod loop
nor a fresh pod consults what the run has already spent).

Constraints that shaped the design:

- The proxy (`apps/egress-proxy`) stays the meter of record and admission
  authority — the pod must never be trusted to self-report its budget.
- The bound is **run-level**: `usage_records{source='proxy'}` summed across all
  attempts (`D-RES.1`'s claim scaling mints one envelope per run, not per
  attempt). `preflight` probes bypass admission and never consume it
  (`bypassBudget`); CITE.1 `backfill` rides its dedicated `backfillFetchBudget`
  (ADR-085). The consult must count exactly what the tracker counts.
- REQ-SPEC-31 demands honesty over coverage: a verification that could not
  research must say so — the honest output of a dead bound is an Unverified
  settlement, never a silent zero-tool re-burn and never a fabricated verdict.
- The completion oracle stays authoritative: a checkpoint commit must satisfy
  the phase's declared predicates on the mounted work, not merely "have files".

## Decision

Three coordinated mechanisms, all server-authored:

1. **`phase<N>` checkpointing** — `POST /internal/runs/:id/steps/:key/checkpoint`
   (`checkpointStep`, `internal-api.ts`) persists a research phase's produced
   writable versions on a non-complete outcome, attempt-fenced like harvest.
   Versions become content-addressed artifact heads; the run's own
   `steps.produced_version_ids` union (accumulating, never replacing) remounts
   them readwrite on the next hydration (the BL-66 same-run exemption).
   Deduped by head-sha so an unchanged replay mints no duplicate version; a
   checkpoint landing before `beginStep` upserts the row; a checkpoint arriving
   after commit lands the bytes but never rewrites the committed `done` row's
   attribution. Each call emits `phase.checkpointed` — internal telemetry
   (paths + version ids, no content, never on user SSE).

2. **The budget consult** — `researchBudgetConsult` (`research-budget.ts`)
   computes `remaining = claimScaledBound − Σ proxy-metered spend across all
   attempts`, excluding `phase_class ∈ {preflight, backfill}` for exact parity
   with the proxy's in-flight tracker, and falling back to the proxy's fail-safe
   defaults (24/48) when no authored policy exists. The bound itself is read off
   the run's latest active `proxy_credentials.context->'webTools'` — the same
   row the preflight roster reads, so consult and admission see one policy.
   `exhausted` requires **both** axes at zero: with either remaining a retry can
   still do honest work.

3. **The two-sided retry gate** in `runCommitLoop` (`harness-loop.ts`):
   - *Pre-exec (stranded re-drives / fresh pods):* `buildHarnessRunSpec` stamps
     `researchBudget` + `checkpoint` (the run's live produced set) on the spec.
     A pod whose consult reads `exhausted` never spawns model traffic — it
     inspects the remounted checkpoint (`inspectWork`, a `runPhase`-free read of
     `/work` + the same `buildPhaseOutputs` fact extractor) and either
     checkpoint-commits (predicates satisfied → `sdk_subtype
     "research_budget_exhausted"` marks the step honestly and the run advances —
     the fact_check Unverified path) or fails `research_budget_exhausted`
     (terminal; the run closes `failed`, never re-enqueued into a dead bound).
   - *Retry boundary (in-pod):* a non-complete research exec checkpoints its
     produced versions, then the loop calls `GET /internal/runs/:id/research-budget`.
     `exhausted` ⇒ the same inspect-and-resolve, never a second `runPhase`;
     otherwise the existing guided retry proceeds unchanged.
   - The consult call degrades fail-closed to the spec-stamped figure — never to
     an unbounded retry.

The seat-facing contract is carried as run-spec inputs (no skill text touched —
REQ-ARCH-5): `checkpoint_contract` (write the ledger skeleton early, rows
`unverifiable` until researched — a terminated attempt's last write IS the
checkpoint), `research_budget` (the remaining figure for pacing), and
`checkpoint` (the remounted resume paths when they exist).

## Alternatives considered

- **Attempt-scoped budgets** (each retry gets a fresh envelope): reproduces the
  drain — `D-RES.3-1` requires the logical run envelope to survive attempts.
- **Pod-reported remaining counts**: untrusted input driving a budget decision;
  the proxy's metered `usage_records` are the only authoritative figure.
- **Checkpoint only at harvest**: too late — a non-complete exec's files are
  exactly what was lost in the live burn; the checkpoint must precede the verdict.
- **Fail `research_budget_exhausted` unconditionally on a dead bound**: would
  have failed the live run even though its last-attempt ledger was honest — the
  checkpoint-commit arm is what turns a dead bound into an honest Unverified
  settlement rather than another fault.
- **`max_uses: 0` tool-less retry**: produces the same honest output as the
  checkpoint path but burns a paid model call to do it — the gate inspects
  mounted work for free and only spends where spend can produce.

## Consequences

- A retry or stranded re-drive against a dead bound costs **zero** model calls;
  the crash-loop the reaper would otherwise sustain terminalizes on first
  re-entry.
- The `research_budget_exhausted` code is terminal in `terminalPhaseFailure` —
  a dead-bound fail settles `failed` (hold released, credentials revoked), and a
  checkpoint-commit settles the phase `done` with the honest marker.
- Research floors (`searchFloor`/`fetchFloor`), preflight bypass, and the CITE.1
  backfill allowance are untouched — the consult mirrors the proxy's counting
  exactly.
- `tools/system-pool-boundary.json` gains `research-budget.ts` — an audited,
  reviewed addition (the consult's credential read rides `systemTxRunner` like
  the preflight roster it mirrors).
- Non-research phases are untouched: no checkpoint calls, no spec fields.

## Revisit trigger

Revisit if (a) a phase other than a research-class phase is observed burning
unbounded retries (extend the gate's phase scope), (b) the proxy's bound-tracker
counting changes (e.g. a new `phase_class` or a moved meter of record) — the
consult's parity in `research-budget.ts` must be re-derived and its tests
re-pointed, or (c) the funded-wave paid leg shows the checkpoint-commit arm
either over-committing (predicates satisfied by stale checkpointed work that a
fresh pass would have corrected — argue for a bounded tool-less correction pass)
or never firing (checkpoints absent — strengthen the `checkpoint_contract`
input or move skeleton-writing into the skill under the REQ-ARCH-5 process).

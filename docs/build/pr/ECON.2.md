# ECON.2 — COGS reduction: five named levers, flag-controlled and pre-registered

Ticket: `docs/tickets/83_ECON.2__cogs-reduction.md` · run ledger: `docs/build/runs/ECON.2.md`
Stacks on `stevevitali/cite-1-citation-completeness` (PR #104, `OPERATOR` merge policy).
**DO NOT MERGE.**

## Summary

> Charge-what-we-meter (ADR-014) means provider COGS is money: this PR lands the
> **mechanism** for REQ-SPEC-32(c) — five named cost levers, each behind its own
> boolean, resolved server-side at run creation, frozen into both
> `runs.inputs.cogsLevers` (consumption) and `input_snapshot.cogsLevers`
> (REQ-BILL-6 measurement record). With `COGS_LEVERS` unset the resolved set is
> **all-off and bit-identical to the pre-ECON.2 pipeline** — deploy is
> behavior-neutral until arms are adopted. Client-supplied lever values are
> honored only on `is_test` workspaces (the `force_unverified` precedent);
> production tenants always get the server-resolved set. **ADR-087**
> pre-registers the whole protocol — arms, OFF/ON shapes, adoption thresholds
> (ON < OFF × 0.75 for the 23% pair noise), cheapest-first order, and stop
> rules — before any paid leg runs.

## What landed

- **`CogsLevers` contract** (`@rhema/contracts`): five booleans
  (`l1PerPhaseWindow`, `l2FanoutShape`, `l3PhaseRouting`, `l4CacheTtl5m`,
  `l5ResearchEnvelope`), `resolveCogsLevers`/`sanitizeCogsLevers`/
  `parseCogsLeversEnv` (unknown keys dropped, non-booleans ignored, missing
  keys fill from defaults), and the shared arm constants.
- **L1 per-phase transcript window** — `settings.autoCompactWindow` per
  `phaseClass` (research stays at 80K — the subagent working-set floor; judge
  48K / generate 120K / package 64K). OFF = the flat 80K §12.2 default.
- **L2 fan-out shape** — `COGS_FANOUT_*` constants drive
  `maxConcurrentSubagents`, the `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION` env,
  and the `research_fanout` batch-size text (5/5 baseline ⇄ 8/3 tuned) — one
  source of truth, no drift.
- **L3 per-phase model routing** — `routeModelForPhaseClass(tier, phaseClass)`
  over `PHASE_CLASS_MODELS`, the §12.3 approved table verbatim; every routed
  cell is already on `MODELS_BY_TIER` and priceable (the roster×allowlist×
  rate-table test now iterates every (tier, class) cell — the F4 alignment).
  Scoped queries (the second reader) keep `mainModelForTier` — §12.6
  independence preserved.
- **L4 cache TTL** — ON omits `ENABLE_PROMPT_CACHING_1H` (the CLI's ≈5-minute
  default) and sets `cacheControlTtl:"5m"`; OFF keeps the 1-hour TTL. The arm
  is TTL-only — skill text and stable-prefix serialization are untouched.
- **L5 research envelope** — `authorWebToolPolicy({l5ResearchEnvelope})`
  halves above-floor headroom (fetch 80→60, search 32→24 on the 24-claim
  fixture) and cuts `fetchMaxContentTokens` 8,000→4,000. **RES.1's floors are
  absolute-preserved** (computed on the untuned budgets — 40/16 can never be
  tuned away); CITE.1's `backfillFetchBudget` stays a separate allowance on
  the untuned budget.
- **Plumbing** — api resolves+freezes at run creation; runspec sanitizes into
  `PhaseRequest.levers` and strips `cogsLevers` from model-facing inputs;
  the lever set rides the phase-spec JSON into `buildQueryOptions`; the
  worker reads `runs.inputs.cogsLevers` for the L5 proxy policy.
- **Offline accounting** — `integration/src/econ2-accounting.ts` +
  `scripts/live/econ2-accounting.mjs` ($0): the 6,000-word fixture claims, the
  untuned/tuned policy delta computed on the real `authorWebToolPolicy`,
  per-lever modeled bounds, and the restore readout. Committed fixture:
  `packages/journeys/fixtures/restore-eval-essay.md` (5,945 w synthetic).

## Restore evaluation (REQ-SPEC-8 — emit-only, verdict: NOT MET)

- Stateless estimate, Standard/Base 6,000-word Review: **2,835 cr ≈ $20.25**
  vs the ~$6 restore bound — gap ≈ $14.25.
- The five levers' modeled ceiling is ≈ **$0.29/run** — ~1.4% of the gap.
  The levers buy real but small margins; they cannot restore the trial alone.
- `pricing.json` untouched; the interim ~2,800-word terms stand; no
  `wordCap: 6000` staged. Candidates for the next round are named in the run
  ledger (envelope shrink beyond BASE_TOOLS, research-loop restructuring,
  Haiku-class research mains within §12.3, the 1-h-write rate-table
  amendment — Anthropic bills 2× while the v1 table prices all writes 1.25×;
  the proxy ledger stays the meter of record).

## Stage B — all paid legs deferred, $0 metered

Blocked by the same two environment facts as CITE.1, re-verified: the Pulumi
Cloud token 401s (prod still runs `b909fe9`; operator `pulumi login` owed)
and the weekly journey spend guard reads **$58.08 ≥ $5** until the ISO-week
reset. Deferrals: D-ECON.2-1 deploy+provenance · D-ECON.2-2 L5/L1/L2 legs ·
D-ECON.2-3 L3 leg · D-ECON.2-4 ON-arm non-regression + N4/C1 journey checks ·
D-ECON.2-5 L4 leg **pre-registered SKIPPED** (session-level model predicts
≈$0.30/run *worse* — inside pair noise; reopens only on later-leg evidence) ·
D-ECON.2-6 cost-card/pricing refit (zero admissible observations — no
hand-edit of the ECON.1 store) · D-ECON.2-7 restore re-check + staged config.

## Evidence (deterministic)

- `pnpm turbo build lint typecheck` — **135/135** green.
- `pnpm test` — **445 files / 4,504 pass / 4 skip / 0 fail**, incl. the
  ECON.2 additions: contracts cogs-levers 10, engine options 20 + roster 19 +
  scrubbed-env 11, orchestrator allowlist 41 + runspec 35, worker run-jobs 12,
  api run-routes 60, integration accounting 5.
- `pnpm check:licenses` OK · `pnpm check:protocol-markers` OK ·
  `check-build-memory.sh` clean after the ADR-index regeneration.
- §6.5 rigor/preflight/RES.1-floor/backfill tests unmodified and green; all-off
  arms pinned bit-identical to the shipped pipeline.

## Requirement IDs

REQ-SPEC-32(c) (primary) · REQ-SPEC-8 (restore flip, operator-paused) ·
REQ-BILL-6/7 · REQ-GROWTH-4 · REQ-ARCH-9 · REQ-SPEC-31 (floor invariants)

# ECON.2 — COGS reduction: named levers, measured on/off, with non-regression ACs (run ledger)

- **Status:** DONE — Stage A green (full repo verify below); Stage B PARTIAL — environmentally blocked
  (deploy credential + weekly spend guard), every paid leg deferred with a `D-ECON.2-<n>` row.
- **Ticket:** `docs/tickets/83_ECON.2__cogs-reduction.md` (manifest row 83)
- **Primary requirement:** REQ-SPEC-32(c); REQ-SPEC-8 (restore flip, operator-paused); REQ-BILL-7;
  REQ-GROWTH-4; REQ-ARCH-9.
- **Branch:** `stevevitali/econ-2-cogs-reduction` — base `stevevitali/cite-1-citation-completeness`
  @ `685f633608e72b06b7bdb6e96783eaae5bcc9b9b` (PR #104 open; merge policy OPERATOR — not merged by me).
- **Spend:** Stage A $0 (code + read-only prod reads). Stage B ≤ $30 metered, aim ≈$15, cheapest-first —
  **all legs deferred** (see Stage B ledger below).
- **Round-3 cumulative:** ≈ $71 entering this ticket (pause at ≈$100, hard stop $200 — 2026-09-30 ruling).
- **Harness:** Devin CLI (Cognition agentic coding CLI), Anthropic Claude.
- **Date started:** 2026-10-04

## Environmental state at start (re-verified 2026-10-04T02:4xZ)

- **Pulumi:** `pulumi whoami`/`preview` on `infra/pulumi` refuse non-interactively —
  `PULUMI_ACCESS_TOKEN must be set` / stored credential 401s (same block as D-CITE.1-1). No token
  source exists on the build machine; `pulumi login` is an operator act. **Deploy is owed.**
- **Prod provenance:** api+web `/healthz` report `build.gitSha b909fe9a802867064317b57ea573c018e6d83332`
  (the DEF.4/SEC.3-era build). CITE.1's images are built+pinned at `5baa666` in `Pulumi.prod.yaml` as
  declared-desired state but the `pulumi up` is owed (D-CITE.1-1) — prod does NOT run the CITE.1
  mechanism. The OFF-arm for ECON.2's levers is the pipeline CITE.1 *landed*, measured once its deploy
  (or an ECON.2 deploy stacking it) applies.
- **Weekly journey spend guard:** measured **$58.07792 ≥ $5** ISO-week cap (the guard's own
  `usage_records ⋈ workspaces.is_test, source='proxy'` query, live over the IAP tunnel, ISO week
  2026-09-28) — every flagged-tenant metered leg refuses until the Mon 2026-10-05 00:00 UTC reset.
  Re-measured before any paid leg; a refused leg is skipped + deferred, never re-capped.
- **Journey tenant:** jrn-a (`test+jrn-a@rhema.tools`) holds 7,472 promo credits (D-CITE.1-4 read) —
  the JOURNEY.1 house grant path funds the legs; **no new test-tenant grant needed**.

## Anchors re-read (Phase 0)

- Ticket + `docs/tickets/DEFERRALS.md` (whole file; CITE.1's D-CITE.1-1..5 carry the same two blocks).
- `docs/adr/ADR-014` (charge-what-we-meter; the restore condition), `ADR-015` (the floor),
  `ADR-016` (fixtures), `ADR-083..086` (CITE.1), `ADR-033` (ECON.1 claim cap), `docs/adr/_TEMPLATE.md`.
- `docs/build/runs/{ECON.1,CITE.1,RES.1,PRB.23,PRB.24}.md` — the OFF-arm pipeline, the store's
  admissibility rules, the probe costs ($3.31/$4.17 list on the 267-word excerpt), the request-envelope
  measurements (fixed envelope 119.3 KB → 65.1 KB post-BASE_TOOLS; ~40 verification requests averaging
  ~60K cache-read tokens pre-fan-out).
- `packages/engine/src/{options,scrubbed-env,roster,engine,agent-sdk-engine}.ts` — the §12.2 options
  surface: `TRANSCRIPT_COMPACTION_WINDOW_TOKENS = 80_000` (flag-tier `settings.autoCompactWindow`),
  `ENABLE_PROMPT_CACHING_1H` (env-realized 1-h TTL), `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION` (env),
  `mainModelForTier` (flat per-run model), `buildAgentRoster` (the five subagents), `PhaseRequest`.
- `packages/orchestrator/src/{runspec,allowlist,run-creation}.ts` — `research_fanout` text ("at most 5
  items each"), `authorWebToolPolicy` (claim-scaled search/fetch budgets + `searchMaxUses`/`fetchMaxUses`
  = budget÷`RESEARCH_PARALLELISM=4` + `authorResearchFloor` at share 0.5 + CITE.1's
  `backfillFetchBudget` + `FETCH_MAX_CONTENT_TOKENS=8000`), `authorResearchPreflight`,
  `MODELS_BY_TIER` (the proxy's exact-match model allowlist), `input_snapshot`/`inputs` freezing.
- `apps/worker/src/run-jobs.ts` — `handleRunStart` authors the run's allowlist + `webTools` policy at
  provisioning from `runs.inputs` (the L5 lever's effect point; `force_unverified` is the precedent
  for a test-tenant-gated frozen input).
- `apps/api/src/{run-routes,index}.ts` — `body.inputs` merge order + the server-authored frozen keys
  (`phaseFlags`, `claim_cap`, `urlPolicy`, …); the entitlement branch's `is_test` read is the gating
  precedent. `/internal/runs/:id/runspec` → `buildHarnessRunSpec` → `PhaseRequest` → pod.
- `apps/egress-proxy/src/url-policy.ts` + its tests — `ensureServerWebTools` enforces the RES.1 floor
  against `x-rhema-phase-class` (`research` draws the whole budget; non-research bound at
  `budget − floor`; `backfill` bound at `backfillFetchBudget` — never the floor).
- `packages/protocols/src/estimator.ts` + `packages/ledger/src/{cost-calibration,estimator-refit}.ts` —
  the instrumented fold, `estimator_cells` overrides, `cost_card_cells`, `cap_calibration_reports`,
  the 30-day/n≥5/p95 1.3 → 1.5/1.35/1.25 refit rule, `REFIT_MIN_SAMPLE=20` on the weekly multiplier.
- `packages/contracts/src/domain/{rates,trial-claims}.ts` + `pricing.json` — v1 rates (Sonnet $2/$10,
  Opus $5/$25, Fable $10/$50, Haiku $1/$5; cache read 0.1×, write 1.25×; search $0.01), the 2,800-word
  interim trial cap (deriveTrialWordCap largest-fit under $15), `costCardTerms` shape.
- `packages/protocols/manifests/*.ts` — every phase declares `phaseClass`
  (`research|judge|generate|package`) + `allowsSubagents`; Review = judge/intake, judge/craft,
  research/verification, research/discourse, judge/second_read, judge/argument, generate/letter.
- §12.3 table (design spec line ~2334): per-class model per tier — research: Sonnet/Haiku·sub,
  Sonnet, Opus; judge/generate/chat: Sonnet, Opus, Fable; package: Sonnet, Sonnet, Opus.
- `packages/journeys/src/spend-guard.ts` — `WEEKLY_PAID_CAP_USD=5`, flagged-tenant ISO-week metered
  read, `withinCap` refuses at ≥cap.

## Key pre-implementation findings (recorded before any code)

1. **The §12.3 routing table is fully inside `MODELS_BY_TIER`** — every per-class routed id (Sonnet,
   Opus, Fable, Haiku) is already on each tier's proxy allowlist, so L3 needs no allowlist change;
   the roster-allowlist test extends to per-phase ids instead (REQ-ARCH-9, F4 guard).
2. **L4 is TTL-only.** The stable-prefix *order* is assembled inside the vendored CLI (system prompt,
   tool schemas, roster, then the user message); the harness controls the input-set, not the
   serialization order. What the harness CAN verify offline: every lever-relevant request field
   (`tools`, `agents`, `settings`, `env`) is already phase-invariant, so the prefix is already stable.
   The measurable lever is the cache TTL choice (1 h vs the CLI default ≈5 m) — recorded in ADR-087.
3. **Cache-write metering gap (BL-13-adjacent, recorded honestly):** rate table v1 prices every
   cache-write at 1.25× input; Anthropic bills a 1-h-TTL write at 2×. `list_cost_usd` therefore
   understates the 1-h arm's true cost. The measurement script computes the TTL-adjusted figure
   alongside the proxy figure; the proxy stays the meter of record for the ledger (the gap is a
   candidate rate-table amendment, logged for the operator, not silently patched).
4. **Restore-condition arithmetic ($0, on the live estimator):** `buildEstimate` review/standard/base
   at 6,000 words → **2,835 cr ≈ $20.25 list**; even the measured-vs-modeled discount on recent runs
   leaves Standard/Base 6,000 w far above the $6 restore bound — see the restore evaluation section
   (emit-only; the interim terms stand; gap + next candidates recorded).
5. **BL-66 (RES.1's stale claim-ledger remount) is already fixed** (RES.2's `MaterializeArgs.runId`) —
   the ON-arm Review's *Contradicted* invariant can be judged on the planted error honestly.
6. **`inputs` vs `input_snapshot`:** `runs.inputs` is the frozen harness-consumed map (reaches
   `hyd.inputs` → runspec → PhaseRequest); `input_snapshot` is the REQ-BILL-6 measurement record.
   The resolved lever set freezes into BOTH (inputs for consumption, snapshot for measurement) —
   `cogsLevers` is stripped from the model-facing prompt inputs in runspec.

## Stage A — implementation landed (2026-10-04, $0 spend)

The lever mechanism per ADR-087: `CogsLevers` (5 booleans) resolved server-side at run creation,
frozen to `runs.inputs.cogsLevers` (consumption) + `input_snapshot.cogsLevers` (measurement
record); server default from env `COGS_LEVERS` (unset/malformed ⇒ all-off ⇒ byte-identical
pre-ECON.2 pipeline); client `inputs.cogsLevers` honored only on `is_test` workspaces.

| lever | flag | implementation | files |
|---|---|---|---|
| L1 | `l1PerPhaseWindow` | per-`phaseClass` `settings.autoCompactWindow` (`COGS_PHASE_COMPACT_WINDOWS`: research 80K / judge 48K / generate 120K / package 64K; research never <80K — the subagent working-set floor) | `packages/engine/src/options.ts`; constants `packages/contracts/src/domain/cogs-levers.ts` |
| L2 | `l2FanoutShape` | `COGS_FANOUT_*` constants → `maxConcurrentSubagents` + `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION` (env) + `research_fanout` batch-size text interpolated from the same constants | `packages/engine/src/options.ts`, `packages/orchestrator/src/runspec.ts` |
| L3 | `l3PhaseRouting` | `routeModelForPhaseClass(tier, phase.phaseClass)` — §12.3 verbatim (`PHASE_CLASS_MODELS`); scoped queries (second-reader/audits) keep `mainModelForTier` (independence invariant) | `packages/engine/src/roster.ts`, `options.ts` |
| L4 | `l4CacheTtl5m` | ON ⇒ `ENABLE_PROMPT_CACHING_1H` omitted from the scrubbed env (CLI ≈5-m default); OFF ⇒ §12.2 1-h; `cacheControlTtl` advisory mirrors; skill text untouched | `packages/engine/src/scrubbed-env.ts`, `options.ts` |
| L5 | `l5ResearchEnvelope` | `authorWebToolPolicy({l5ResearchEnvelope})`: floor computed on UNTUNED budgets (absolute-preserved), headroom halved (`COGS_L5_HEADROOM_SHARE=0.5`), `fetchMaxContentTokens` 8,000→4,000, backfill on untuned budget | `packages/orchestrator/src/allowlist.ts`; worker read `apps/worker/src/run-jobs.ts` |

Freeze path: `apps/api/src/run-routes.ts` (`resolveCogsLevers` — `isTestWorkspace` read fails
closed); env binding `apps/api/src/env.ts` + `server.ts`; consumption `runspec.ts`
(`sanitizeCogsLevers` → `request.levers`, stripped from prompt inputs) + `run-jobs.ts` (L5).

## Offline accounting ($0 — `scripts/live/econ2-accounting.mjs`, integration/src/econ2-accounting.ts)

Committed 6,000-word fixture: `packages/journeys/fixtures/restore-eval-essay.md` (5,945 words —
synthetic, real fact-checkable anchors, no user data). Canonical arm: Standard/Base, 24
provisional claims (0.004/word). Policy delta computed on the REAL `authorWebToolPolicy`:

- untuned: fetch 80 / search 32, floors 40 / 16, page cap 8,000, backfill 24
- tuned (L5): fetch 60 / search 24, **floors unchanged 40 / 16**, page cap 4,000, backfill 24

Per-lever modeled savings ranges (Anthropic list prices; upper bounds):

| lever | low | high | note |
|---|---|---|---|
| L1 | $0 | $0.036 | (60K resend − window) × ~20 judge/package requests; binds only past 48K |
| L2 | $0.004 | $0.036 | 5→3 researcher spawns × ~18K seed at Haiku rates |
| L3 | $0 | $0 | Base routes every §12.3 cell to Sonnet — no in-table win (the ticket's own prediction; the Balanced/Frontier arm is where it moves) |
| L4 | **−$0.30** | $0.17 | ADR-087 session-level model: 5m arm ≈$0.30/run WORSE (cross-phase expiry) — **leg pre-registered SKIPPED** (stop rule d) unless later evidence reopens |
| L5 | $0.024 | $0.048 | 4K page-cap savings ≈ ~40 fetches × 4K cache-read tokens |

**Modeled ceiling Σ high bounds: ≈ $0.29/run** at the canonical arm — cents, not the ~$14/run the
restore condition needs. Offline accounting therefore confirms the pre-registered expectation:
the five named levers cannot reach the $6 p90 target on their own; Stage-B legs measure what the
model cannot (in-session resend growth, real cache behavior, real coverage deltas).

## Stage-A test evidence (all passing, 2026-10-04)

- `packages/contracts` cogs-levers.test.ts — 10 tests (sanitize/resolve/env-parse/arm constants/
  §6.5 namespace disjointness).
- `packages/engine` options.test.ts — 20 tests (15 baseline + 5 ECON.2 lever arms, incl. off⇒
  bit-identical assertions); roster.test.ts — 19 tests (12-cell §12.3 table + base-no-cheaper-
  route); scrubbed-env.test.ts — 11 tests (L4 key omission, allowlist subset preserved).
- `packages/orchestrator` allowlist.test.ts — 41 tests (roster↔allowlist↔rate-table extended
  per-phaseClass; L5 tuned-envelope suite: floor absolute-preserved, headroom halved, page cap,
  backfill on untuned); runspec.test.ts — 35 tests (levers on request, prompt-strip, all-off
  resolution, L2 text interpolation 5⇄8).
- `apps/worker` run-jobs.test.ts — 12 tests (frozen `inputs.cogsLevers` → tuned proxy webTools;
  floors 12/5 preserved at 3 claims).
- `apps/api` run-routes.test.ts — 60 tests (freeze: server default on real tenants, client arms
  on is_test only, bogus keys dropped, snapshot carries resolved set; ECON.1 §6.5 preset test
  unmodified green).
- `integration` econ2-accounting.test.ts — 5 tests (the accounting's own guard rails).

**Full-repo verify at closeout (2026-10-04):** `pnpm turbo build lint typecheck` 135/135 ·
`pnpm test` 445 files / 4,504 pass / 4 skip / 0 fail · `pnpm check:licenses` OK (745 pkgs) ·
`pnpm check:protocol-markers` OK · `check-build-memory.sh` — ADR index regenerated for ADR-087;
remaining warnings are pre-existing ledger/manifest legacy. End-to-end plumbing verified:
`PhaseRequest.levers` rides the phase-spec JSON (`harness-main` `JSON.stringify` →
`agent-entry` `runAgentPhase` → `buildQueryOptions`) — no extra wire needed.

## Stage B — ledger of legs (all deferred; $0 metered to date)

Every paid leg is blocked by the same two environmental facts re-verified at closeout: the deploy
credential (Pulumi 401) keeps prod on the pre-CITE.1 build `b909fe9`, and the weekly journey guard
reads $58.08 ≥ $5 until the ISO reset. Legs are recorded with `D-ECON.2-<n>` rows in
`docs/tickets/DEFERRALS.md`:

| leg | arm | cap | status |
|---|---|---|---|
| deploy chain-tip images | — | $0 cloud / operator token | DEFERRED — operator Pulumi credential (also blocks D-CITE.1-1) |
| L5 pair (verification pin, excerpt) | OFF/ON | ≤$3 | DEFERRED — weekly guard + deploy |
| L4 pair | OFF/ON | ≤$3 | SKIPPED per pre-registration (offline ceiling predicts ≈$0.30/run WORSE — stop rule d) — may reopen only on later-leg evidence; recorded as skipped-not-run |
| L1 pair (letter pin) | OFF/ON | ≤$4 | DEFERRED |
| L2 pair (verification pin) | OFF/ON | ≤$4 | DEFERRED |
| L3 pair (verification pin, Balanced) | OFF/ON | ≤$5 | DEFERRED |
| ON-arm non-regression Review (planted-error-essay, Standard/Base) | adopted arms | ≤$12 | DEFERRED |
| restore confirm leg | — | ≤$9 | NOT RUN — restore evaluation NOT MET at Stage A (see below) |

**Metered to date: $0.** The legs are executable verbatim once (a) an operator runs the deploy,
(b) the ISO-week guard admits flagged-tenant spend, and (c) jrn-a's 7,472 promo credits hold.

## Restore evaluation (REQ-SPEC-8 — emit-only, operator-paused)

Condition: p90 metered list COGS of a Standard/Base 6,000-word Review ≤ **$6**.

- Stateless estimator (ECON.1 machinery, current `pricing.json`): 2,835 cr ≈ **$20.25** list.
- Refit store: ECON.1's `econ1@2026-10-02` fit — 97 observations / 43 cells, **zero admissible**
  for Standard/Base review at 6,000 w (no measured fold exists to re-derive against).
- Offline accounting (above): the five levers' modeled ceiling ≈ $0.29 — roughly 1.4% of the
  needed $14.25 reduction. Even if every lever's measured arm lands at its high bound, Standard/
  Base 6,000 w stays ≈$19.96 ≫ $6.

**Verdict: NOT MET.** The interim 2,800-word trial terms stand; no `wordCap: 6000` config change
is staged; `pricing.json` is unchanged (no admissible measured evidence exists to refit — a
hand-edit would violate the ECON.1 machinery rule). Recorded gap: ≈ $14.25 needed vs ≈ $0.29
modeled; next candidates (ADR-087 §restore): per-request envelope shrink beyond BASE_TOOLS,
research-loop restructuring (fewer per-claim round-trips), Haiku-class research main contexts
within §12.3, the 1-h cache-write rate-table amendment (correcting the metering gap changes the
measured baseline too), multi-week admissible samples for a real p90.

## Self-review + gap table (mechanical/design/requirement)

Mechanical: no cross-package relative imports (all `@rhema/*` + `.js` intra-package); no Python;
levers module duplicates `PhaseClass` as strings (contracts can't import protocols — documented);
`noUncheckedIndexedAccess` safe (table lookups `??`-guarded); scrubbed env stays inside the
allowlist both arms; no secret/telemetry-content change (counts only).

Design/security: levers are frozen run facts like `claim_cap`/`force_unverified` — client arms
reachable only on `is_test`; runspec strips `cogsLevers` from the prompt; the second-reader scoped
launch keeps `mainModelForTier` (§12.6 independence preserved); RES.1 floor tests unmodified
green; CITE.1 backfill unchanged; `MODELS_BY_TIER` allowlist covers every L3 cell (test-pinned).

| ticket AC / invariant | status | evidence |
|---|---|---|
| 5 named levers, each flag-controlled | DONE | CogsLevers keys; per-lever ON/OFF paths above |
| protocol defined before paid changes | DONE | ADR-087 committed before any leg |
| offline accounting before paid legs | DONE | econ2-accounting (this ledger) |
| transcript bounds (L1) | DONE (Stage A) | options+tests; measurement DEFERRED |
| verification fan-out (L2) | DONE (Stage A) | fanout constants+env+prompt text; measurement DEFERRED |
| per-phase routing (L3) | DONE (Stage A) | PHASE_CLASS_MODELS; allowlist alignment extended; measurement DEFERRED |
| skill-text/prompt caching (L4) | DONE (Stage A) | TTL arm; skill text untouched; paid leg pre-registered SKIPPED |
| research above RES.1 floor (L5) | DONE (Stage A) | tuned envelope, floor absolute-preserved; measurement DEFERRED |
| measure every lever on/off | DEFERRED | deploy + weekly guard (D-ECON.2 rows) |
| pricing/cost-card refit via ECON.1 store | BLOCKED honestly | no admissible observations; no hand-edit (D-ECON.2-n) |
| restore evaluation, emit-only | DONE | verdict NOT MET, gap + candidates recorded |
| §6.5 rigor presets unchanged | GREEN | ECON.1 §6.5 test unmodified; namespace disjointness pinned |
| research/citation/Unverified/second-read invariants | GREEN by test | floor guard, backfill, scoped launch, scrubbed env all pass |
| 6,000-word synthetic fixture | DONE | restore-eval-essay.md (5,945 w) |
| append-only semantics | DONE | no edits to landed artifacts |

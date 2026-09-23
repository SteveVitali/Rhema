# PRB.23 — Context-churn burn: the estimator's missing fixed-overhead term (run ledger)

- **Ticket:** `docs/tickets/28n_PRB.23__context-churn-estimate-model.md` (seq 28n — inserted
  2026-09-22; defect-repair, G3 stays parked).
- **Branch:** `stevevitali/prb-23-context-churn-estimate` (stacked on
  `stevevitali/prb-22-verification-burn-cap`, PR #51).
- **Targets:** **D-PRB.21-1** residual — the proxy meters every SDK request including repeated
  context; the estimator priced document/research work but never the fixed request envelope nor
  the per-turn transcript resend. **Stays OPEN** — Stage B remains operator-paused.
- **Stage B status:** PAUSED — no `pulumi up`, no live run, no credit spend, no cap raise.

## Requirements / acceptance criteria (Stage A)

1. Produce a per-request context-budget breakdown before choosing the fix (this file, § below).
2. Shrink the floor with an evidence-backed reduction, and/or model the residual honestly —
   the estimate gains a per-phase fixed-cost term so a derived cap can cover a completed run.
3. Deterministic tests for whatever bound/model lands; `turbo build lint typecheck` +
   `pnpm test` green; `check-build-memory.sh` clean.
4. Stage B is ONE bounded live verify later; do not run it here.

## Context-driver breakdown (measured — zero-credit local probe)

Method: a loopback mock Anthropic endpoint captured the real Messages-API request bodies emitted
by the vendored Agent SDK + CLI under the exact `toSdkOptions` the harness emits
(`apps/run-task/src/sdk-adapter.ts`), in Docker, `--network none`. No inference, no credits.

### Fresh-session fixed envelope (measured, phase-0 first request)

| component | bytes | ≈tokens | notes |
| --- | --- | --- | --- |
| built-in tool schemas | 77,848 | ~19.4K | **24 tools sent** — `allowedTools` is a permission gate only; it does NOT filter the schema payload. WebFetch/WebSearch/Cron*/DesignSync/Worktree/Workflow/etc. all ship. |
| skill body (`/editorial-review` expansion) | 31,566 | ~7.9K | the whole SKILL.md corpus inlined as the command message |
| agents-roster system reminder | 8,623 | ~2.2K | the five-subagent roster rendered into a system-role msg |
| system prompt + reminders | ~600 | ~0.15K | SDK-mode system prompt is tiny |
| **total request** | **119,323** | **~30K** | per request, every turn |

### Transcript resend (measured)

Every subsequent request resends the ENTIRE accumulated transcript (tool calls + tool results
incl. file bytes + Write inputs). Probe: one turn of 8 parallel `Read`s over a ~560KB mounted
corpus → the next request was **524,884 B** (~130K tokens). There is no bound inside a phase
session: context grows monotonically until the model's window; the CLI sends only a
`clear_thinking` context-management edit by default (no `clear_tool_uses`).

Also observed: the CLI issues per-tool-result `count_tokens` calls (single-message bodies, no
system/tools) — free at the meter but evidence the CLI sizes each result; file reads are
truncated at ~25K tokens/file by default (`PARTIAL view` reminder observed).

### Production mapping (run `01M35Q8M2A9YRCE66HZZPSP2X2`)

34 requests × ~151K-token avg context ≈ **5.14M cache-read tokens ≈ ~144 credits** — that is the
whole defect: `requests × context` was never priced. The per-turn resend means each phase's cost
is `Σ_i (envelope + transcript_i)`, quadratic-ish in tool I/O. Subagent sessions pay their own
envelope (~30K) + transcript (~66K avg observed).

### Runtime/estimate divergence (code-level defect found in this pass)

- `apps/web/src/server.ts` run POST froze `inputs: {}` — the sheet's toggles were used for the
  estimate but never persisted into the run's frozen inputs.
- `packages/orchestrator/src/runspec.ts` `isOptedOut` gates a phase on
  `inputs[optOutFlag] === false` — with `inputs:{}` nothing is ever opted out, so **a quick
  review ran all 7 phases** (discourse + second_read included) while the estimator priced only 5.
- `apps/api/src/run-routes.ts` re-derived the estimate with NO toggles → rigor defaults; the
  submitted `toggle.*` form fields were dropped entirely (HTML checkboxes submit nothing when
  unchecked, so an explicit off was indistinguishable from absent).

## Fix-shape ruling

Evidence-ranked, three legs — all landed:

1. **Cut the fixed envelope ~45% (verified):** the vendored SDK supports `Options.tools`
   (`sdk.d.ts` — "the base set of available built-in tools"; `[]` disables all). Restricting it
   to the 7 real built-ins the seat uses (`Agent Bash Edit Glob Grep Read Write`) drops the
   schema payload 77.8KB → 29.7KB — **119.3KB → 65.1KB per request, every request, measured in
   the probe**. This also physically removes the WebFetch/WebSearch schemas (P0.15i's intent was
   only enforced at the permission layer before).
2. **Freeze the toggle decision into run inputs:** the run POST now submits the rendered toggle
   set (a `toggleKeys` sentinel distinguishes an unchecked box from an absent field), the api
   resolves it against rigor defaults, feeds it to `buildEstimate` (price side) AND freezes
   `inputs[optOutFlag]` for every manifest-declared flag (runtime side). A quick review now
   actually omits discourse + second_read — 5 phase sessions instead of 7.
3. **Price the residual honestly:** `EstimatorTerms.perPhase` — the measured fixed-overhead
   model: phases × expected requests × expected context. `CONTEXT_CHURN_PER_PHASE_CREDITS = 50`
   (Base/Sonnet): measured run ≈ 151K tokens/request ≈ ~4.2 cr/request at cache-read rates;
   a completing phase session runs ~10–15 requests incl. subagent fan-out ⇒ ~40–65 cr/phase;
   50 is the mid-band, provisional like every other constant here. It rides inside the parametric
   form so tier scaling is right; the quick-rigor 0.6× multiplier discounts it too (documented
   simplification — phase count already carries most of the rigor signal).
   `buildEstimate` counts ACTIVE manifest phases from the same resolved toggle set, so estimate
   and runtime can never disagree again.
4. Advisory → enforced: `cacheControlTtl:"1h"` and `maxConcurrentSubagents` were dropped by the
   adapter (not real SDK fields). The real levers exist as CLI env vars in the vendored allowlist:
   `ENABLE_PROMPT_CACHING_1H=1` and `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION=5` now ride the
   scrubbed env (allowlist-extended, non-secret config keys).

Not taken: per-claim subagent isolation (research fan-out is intra-query; bigger surgery, Stage
B evidence first); prompt-corpus slimming (skill body ≈ 8K tokens — real but not dominant);
forced compaction (`CLAUDE_CODE_MAX_CONTEXT_TOKENS` exists in the CLI env surface but its
trigger could not be exercised deterministically in the mock — deferred, not claimed).

## Stage A — implementation

1. **Envelope cut (leg 1):** `packages/engine/src/options.ts` gains `BASE_TOOLS` — the seven
   real built-ins (`Agent Bash Edit Glob Grep Read Write`) — and a real `tools` field on
   `AgentSdkQueryOptions`; `apps/run-task/src/sdk-adapter.ts` forwards it to the vendored
   `Options`. `allowedTools`/`disallowedTools` unchanged (permission layer + cosmetic audit).
2. **Advisory → enforced (leg 4):** `buildAgentEnv` takes `maxConcurrentSubagents` and emits
   `ENABLE_PROMPT_CACHING_1H=1` + `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION=5` (both in the CLI's
   env allowlist; both non-secret; allowlist + `assertScrubbed` extended). `bootstrap.ts`
   passes the §12.2 cap constant.
3. **Toggle → flag bridge (leg 2):** `packages/run-sheet/src/profiles.ts` adds
   `TOGGLE_OPT_OUT_FLAG` (the toggle names diverge from the manifest flags —
   `fact_check`→`verification`, `repair_research`→`research`, `gap_check`→`gap_analysis`),
   `phaseFlagsForToggles` (manifest-driven: only declared `optOutFlag`s emitted), and
   `activePhaseCount` (mirrors `runspec.isOptedOut`). `packages/ui/src/run-sheet.tsx` emits a
   `toggleKeys` sentinel hidden input (an unchecked checkbox submits nothing — the sentinel is
   what lets an explicit OFF reach the server). `apps/web/src/server.ts` parses
   `toggle.*`/`toggleKeys`, re-renders the sheet from the submitted set, and sends `toggles`
   on the create-run DTO (`packages/api-client`). `apps/api/src/run-routes.ts` resolves
   rigor-default + submitted overrides once, feeds the SAME set to `buildEstimate`, and
   freezes `inputs[optOutFlag]` — server-authored, so a client cannot smuggle a flag through
   `inputs`.
4. **Honest residual (leg 3):** `EstimatorTerms.perPhase` +
   `EstimatorInputs.phases`; `CONTEXT_CHURN_PER_PHASE_CREDITS = 50` on the review / revise /
   fact_check bases; `buildEstimate` sets `inputs.phases = activePhaseCount(workflow, toggles)`.
   Quick review on the 701-word draft now prices `138 → 188` est / `207 → 282` cap; the
   runtime omits discourse + second_read for real (5 phase sessions, not 7).

## Verification (Stage A gate)

- `pnpm turbo build lint typecheck` — **111/111 successful**.
- `pnpm test` — **277 files / 2156 tests pass** (2 skipped; pre-existing).
- `pnpm check:licenses` — OK (502 pkgs); `pnpm check:protocol-markers` — OK (39 files).
- `check-build-memory.sh .` — 0 violations.
- Deterministic coverage: `profiles.test.ts` (new — flag bridge + phase counts for every
  sheet workflow), `estimate.test.ts` / `lever-matrix.test.ts` (quick floor 138→188 /
  standard 2174→2524), `run-routes.test.ts` (toggles freeze into inputs; submitted overrides
  win; client `inputs` cannot smuggle a flag), `server.test.ts` (web POST carries the
  sentinel-resolved toggles), `options.test.ts` / `sdk-adapter.test.ts` (`BASE_TOOLS` shipped
  + forwarded), `scrubbed-env.test.ts` / `bootstrap.test.ts` (env vars inside the allowlist).
- Zero-credit probe (loopback mock, `--network none`): per-request body **119.3 KB → 65.1 KB**
  with `BASE_TOOLS`; tool schema block **77.8 KB → 29.7 KB** (24 → 7 tools).

## Evidence report

- The context-driver breakdown above is the ticket's required pre-fix artifact — measured, not
  inferred: fresh envelope ≈ 119 KB/request (~30K tokens) BEFORE the fix; transcript resend is
  unbounded within a phase session (8 Reads → 525 KB next request).
- Fix landed: −45% per-request envelope (measured) + quick reviews run 5/7 phases for real +
  every active phase priced at 50cr churn. Estimated quick floor on the 701-word draft:
  188cr / 282 cap vs the ~211cr the killed run metered — plausible headroom, unproven.
- **Stage B NOT run** (operator-paused): no `pulumi up`, no live run, D-PRB.21-1 stays OPEN.
  The first instrumented run that delivers recalibrates `CONTEXT_CHURN_PER_PHASE_CREDITS` via
  `foldInstrumentedRun`.

## Stage B — live verify (operator run, 2026-09-23)

Deployed to prod via Pulumi update 71 (api `46e36e6f`, web `6b2e3688`, worker `4a510df2`,
run-task `87b6da36`, tag `prb23`). Verify run `01M35Y9BH41HFFFD6VNWN14FEH` — `review`/`quick`
on the 701-word zero-URL draft 6 (`01M35KC9K…`).

**Result: `failed` / `cap_reached` at 01:53Z in `verification`.**

| Metric | Value |
|---|---|
| Derived estimate / cap | 288 / 432 (churn term + research addend; no operator raise) |
| Proxy-metered burn at death | **506** |
| Committed debits | 159 (intake 96 + craft 63) |
| Verification uncommitted burn | ~347cr in one phase; 2 `context.compacted` events |
| fetches / searches (usage_records) | 13 / 3 (fetch_log: 123 rows) |
| cache_read tokens | 5.03M over 44 rows (~60K/request to the editor subagent loop) |

**Reading:** the envelope cut (−45%/request) and the honest cap are real — this run reached
`verification` with 159 committed and the cap actually modeled churn for the first time. But
verification's subagent loop still re-reads ~60K of accumulated transcript per request across
~40 requests; per-request shrinkage does not bound transcript growth, and 2 compactions added
their own burn. The fix direction is confirmed but insufficient: the residual is **per-phase
transcript accumulation**, which needs context resets/isolation, not smaller envelopes.
`CONTEXT_CHURN_PER_PHASE_CREDITS = 50` underpriced verification (measured ≈ 347 burn for that
phase alone). D-PRB.21-1 stays OPEN with this evidence appended; no rerun per stop-on-failure.

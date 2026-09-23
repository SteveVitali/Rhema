# PRB.24 — Intra-phase transcript accumulation: the residual context-churn driver

> Stacked on #52 (PRB.23). **Merge operator-held.** Stage A of the D-PRB.21-1 residual repair:
> PRB.23 cut the per-request envelope ~45% but its Stage B verify run still died `cap_reached` —
> phases already get fresh `query()` sessions (no `resume` is ever forwarded), so the growth is
> **intra-phase**: verification's editor loop made ~40 requests in ONE session, each resending
> the ever-growing transcript (~60K cache-read/request avg → ≈2.4M tokens ≈ ~347 uncommitted
> credits; run died at 506 vs a 432 cap).
> **Stage B (one capped prod `review/quick`) is operator-paused — not run here. $0 spend.**

## Summary

- **Accumulation point located precisely** — the per-request context breakdown is in
  `docs/build/runs/PRB.24.md` (written before the fix): fixed envelope ≈ 65.1 KB/request
  (29.7 KB tool schemas + 31.6 KB skill body + 8.6 KB roster + system) PLUS the monotonically
  growing session transcript resent on every turn — super-linear burn; the run's 2
  `context.compacted` events prove compaction fires only at the default ~200K window, an order
  of magnitude above the observed ~60K/request average.
- **Bound — shape layer:** `buildHarnessRunSpec` injects a server-authored `research_fanout`
  contract input into `allowsSubagents` phases (verification, discourse) — the same mechanism
  as `phase_result_contract`. It steers the seat to delegate research to `researcher`
  subagents in bounded ≤5-item batches, each returning compact verdicts (item → verdict →
  URLs, never pasted page text), with the ledger assembled incrementally from returned
  verdicts — so no session's transcript accumulates past one batch. The `researcher` roster
  description (synthesized into the subagent's own system prompt by `toSdkAgents`) carries the
  same bounded-scope contract.
- **Bound — ceiling layer:** `AgentSdkQueryOptions.settings = { autoCompactWindow: 80_000 }`,
  forwarded verbatim by `toSdkOptions`. `settings` is a REAL vendored-SDK `Options` field
  (flag-tier settings, highest-priority user-controlled layer) and `autoCompactWindow` a real
  `Settings` key — the CLI's own auto-compaction now bounds every request's context near ~80K
  (session-wide, subagents included), sized above one bounded-batch working set (~71K) so
  compliant fan-out never thrashes.
- **Honest recalibration:** `CONTEXT_CHURN_PER_PHASE_CREDITS` 50 → **100** (low end of the
  measured ordinary-phase band ~96–140); new **`RESEARCH_LOOP_CHURN_CREDITS = 140`** folded
  into the `verification`/`discourse` addend intercepts and the `fact_check` base. The
  verification phase now prices ≈ 350 vs its measured 347. Quick review on the 701-word draft:
  **288 → 522 est / 432 → 783 cap** — ≈ the run's actual 506 metered burn. The constants price
  measured reality; `foldInstrumentedRun` re-derives them post-bound from the Stage B run.
- **Not taken** (ruling in the run ledger): per-claim `query()` segmentation (the claim
  inventory is produced inside the session — the harness cannot pre-slice it; restart-per-
  segment risks re-verifying completed claims), `CLAUDE_CODE_MAX_CONTEXT_TOKENS` (trigger not
  exercisable — PRB.23), protocol-text edits (the upstream-pin drift gate stays closed by
  construction).

## Test plan

- [x] `pnpm turbo build lint typecheck` — 111/111
- [x] `pnpm test` — green (2160 pass / 2 skip; the one transient failure was a stale pre-edit
      file mid-run — rerun clean)
- [x] `pnpm check:licenses` + `check:protocol-markers` + `check-upstream-diff.mjs` — clean
- [x] `check-build-memory.sh .` — 0 violations
- [x] Deterministic: `settings.autoCompactWindow` set + forwarded verbatim (options.test.ts,
      sdk-adapter.test.ts); `research_fanout` injected iff `allowsSubagents` (runspec.test.ts);
      bounded-scope contract in the researcher prompt (roster.test.ts); recalibrated figures
      (estimator/estimate/lever-matrix/run-routes); consent-threshold fixture updated
      (server.test.ts — fact_check floor now honest: 600w → 474cr stays under 500)
- [ ] Live: **Stage B operator-paused** — one `review/quick` on draft
      `01M35KC9K6N6R2P6EJD19T30E9` (≤$5); success = `delivered` + per-request editor-loop
      cache-read materially below ~60K → then D-PRB.21-1 closes

Generated with [Devin](https://devin.ai)

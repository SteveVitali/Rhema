# PRB.23 — Context-churn burn: the estimator's missing fixed-overhead term

> Stacked on #51 (PRB.22). **Merge operator-held.** Stage A of the D-PRB.21-1 defect repair:
> the proxy meters every SDK request — including the fixed envelope and the resent transcript —
> while the estimator priced only document/research work. A 701-word `review/quick` burned
> ~5.14M cache-read tokens and died `cap_reached` with zero research calls.
> **Stage B (the single bounded live verify) is operator-paused — not run here.**

## Summary

- **Context-driver measured, not inferred** — a zero-credit loopback mock captured the real
  request bodies the vendored SDK emits under the harness's `toSdkOptions`: fresh-session
  envelope ≈ 119 KB (~30K tokens) per request — 77.8 KB of it tool schemas for **24 tools**
  (`allowedTools` is only a permission gate; it does not filter the schema payload) — plus
  unbounded transcript resend (8 parallel Reads of a ~560 KB corpus → the next request was
  525 KB). Full breakdown in `docs/build/runs/PRB.23.md`.
- **`Options.tools` restriction (measured −45% per request):** `BASE_TOOLS` — the seven real
  built-ins (`Agent Bash Edit Glob Grep Read Write`) — drops the schema block 77.8→29.7 KB and
  the whole envelope 119.3→65.1 KB, and physically removes the WebFetch/WebSearch schemas
  (P0.15i intent now enforced at the payload layer; proxy server-side research tools are
  untouched).
- **Toggle/runtime divergence closed:** the web run POST froze `inputs:{}`, so
  `runspec.isOptedOut` could never fire — a quick review ran all 7 manifest phases while priced
  for 5. The sheet now submits a `toggleKeys` sentinel (an unchecked checkbox submits nothing),
  the api resolves rigor defaults + overrides once, feeds the SAME set to `buildEstimate`, and
  freezes manifest `optOutFlag`s into the run inputs (server-authored — a client cannot smuggle
  a flag through `inputs`).
- **Honest residual priced:** `EstimatorTerms.perPhase` + `inputs.phases` —
  `CONTEXT_CHURN_PER_PHASE_CREDITS = 50` (measured ~151K-token avg context ≈ ~4.2 cr/request;
  ~10–15 requests/phase ⇒ ~40–65 cr mid-band; provisional pending the instrumented run).
  Quick review on the 701-word draft: **138→188 est / 207→282 cap**.
- **Advisory → enforced:** the dropped `cacheControlTtl`/`maxConcurrentSubagents` contract
  fields are realized via the CLI env allowlist (`ENABLE_PROMPT_CACHING_1H`,
  `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION`) inside the scrubbed env.
- Not taken (documented in the run ledger): per-claim subagent isolation, prompt-corpus
  slimming, forced compaction (trigger not deterministically exercisable in the mock).

## Test plan

- [x] `pnpm turbo build lint typecheck` — 111/111
- [x] `pnpm test` — 2156 pass / 2 skip (277 files)
- [x] `pnpm check:licenses` + `check:protocol-markers` — clean
- [x] `check-build-memory.sh .` — 0 violations
- [x] Deterministic: flag-bridge + phase counts (profiles.test.ts), estimator floors
      (estimate/lever-matrix), api freeze + anti-smuggle (run-routes), web POST sentinel
      (server), tools restriction (options/sdk-adapter), scrubbed env (scrubbed-env/bootstrap)
- [ ] Live: **Stage B operator-paused** — no deploy, no run; D-PRB.21-1 stays OPEN

Generated with [Devin](https://devin.ai)

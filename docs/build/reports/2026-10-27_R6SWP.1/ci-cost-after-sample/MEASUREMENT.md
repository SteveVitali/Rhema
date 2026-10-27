# D-R6CI.1-1 — R6CI.1 CI-cost phase-1 measured delta (after-sample)

- **Window:** 2026-10-20T14:25Z → 2026-10-27T14:34Z (the 176a fast-path landing onward),
  `ci.yml`, 203 runs listed; 200 with job data (3 GitHub API 502s — ids
  39494314034 / 39551122784 / 39909655052 excluded).
- **Method:** per-run `actions/runs/{id}/jobs` started/completed → billable minutes summed
  across the seven jobs; head class = `typecheck / lint / unit` job minutes (the long pole):
  fast-path heads run only the docs-reader subset (≤ ~1 min); full heads run the suite.
  Distribution is cleanly bimodal (≤0.8 min vs ≥15 min — zero ambiguity); cancelled and
  in-flight runs reported separately.
- **Baseline (committed, Oct 1–20):** 18,023 billed min over 20 d ≈ 901/day; docs-only
  heads = 44 % of billed minutes.

| class | runs | billed min | share of measured |
|---|---|---|---|
| fast-path successes (docs/neutral heads) | 64 | 199.7 | 4.3 % |
| full runs | 87 | 4 343.1 | 94.3 % |
| cancelled (superseded pushes / concurrency group) | 51 | 369.5 | 8.0 % |
| failed-early (<15 min) | 1 | 0.7 | — |
| in-flight at capture | 7 | ~1.4 | — |
| **total** | **200 measured** | **≈4 604** | |

- **Full-run wall-clock proxy (typecheck/lint/unit job):** p10 24.4 · **p50 40.0** ·
  p90 43.4 · max 47.4 billed-minutes (the job is the run's long pole; the seven legs run
  near-sequentially under `needs:`).
- **Fast-head cost:** avg 3.12 billed min per head (≤0.8 min on the typecheck job +
  fast-path verdict + public-safe + ci-pass anchor legs).
- **Verdict (honest):** the fast path delivers — docs/neutral heads' share of billed
  minutes fell 44 % → ~4 %; per-head cost ~40 → ~3.1 billed min (−92 % on the class).
  Estimated avoided spend this window: 64 fast heads × (40 − 3.12) ≈ **2 362 billed min**.
  Daily burn fell ≈901 → ≈657 min/day (−27 %; different run mix — not purely attributable).
  Residual waste class named, not hidden: 51 cancelled runs burned 369.5 billed min —
  concurrency-group supersession (stacked boundary/amend pushes) is now the largest
  avoidable class.
- Data: `runs-list.json` (run census), `jobs.json` (raw per-job times),
  `per-run.json` (classified rows).

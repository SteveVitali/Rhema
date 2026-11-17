# PR — 300_R6NOTE.6 — post-merge backlog hygiene (BL-114 closure + BL-115-det note)

## Summary

- BL-114 → `closed` — dep-audit gate verified firing: `check:dep-audit` step inside
  `public-safe` succeeded on post-merge main run `44033559515` (`4c8bcbb3`). The
  gate's runtime is CI itself — a green firing is live evidence, not just a merge.
- BL-115-det (delayed arms) — dated deploy-bound note, stays `open`: `298_R6FIX.31`
  merged via #382; drain cadence + migration `0064` land with the next worker deploy
  + provenance (same convention as BL-121/122/123-det).
- Recorded, not fixed: BUILD_INDEX duplicate number 349 (297/298 parallel-branch
  collision — cosmetic, rows keyed by ticket ID).

## Test plan

- [x] `node docs/build/tools/check-append-only.mjs --base origin/main` — clean
- [x] gitleaks on the staged diff — clean
- [x] BL-114 closure verified against actual CI run `44033559515` job/step output,
      not inferred state

Records-only — no code changes. `mergePolicy: OPERATOR`.

# PR — 299_R6NOTE.5 — post-merge backlog hygiene (#380/#381 closures)

## Summary

- BL-116-sum → `closed` — invite over-redemption race fixed by `296_R6FIX.29`
  (PR #380, merged `0e69a1d7`): capacity guard on the UPDATE serializes concurrent
  claimants via row-lock + EPQ re-check; same-user re-consume stays seat-free.
- BL-115-sum → `closed` — `297_R6FIX.30` (PR #381, merged `4c8bcbb3`):
  `scripts/live/identity-key.mjs` wraps `gcloud secrets versions access`; prod refused,
  stdout/`--var` env only, never argv/log/repo.
- BL-115-det (delayed arms) stays `open` — PR #382 (`298_R6FIX.31`) is authored +
  mergeable but unmerged at this pass; its closure rides the merge.

## Test plan

- [x] `node docs/build/tools/check-append-only.mjs --base origin/main` — clean
- [x] gitleaks on the staged diff — clean
- [x] Rows verified against the actual merge commits (`0e69a1d7`, `4c8bcbb3`), not
      inferred state

Records-only — no code changes. `mergePolicy: OPERATOR`.

# 291_R6NOTE.2 — backlog hygiene: dated closures (BL-111 dup, BL-113 live-verified)

## Summary

Records-only: three dated closures — the BL-111 duplicate open row (fixture moved to
package-root `fixtures/` by 259_R6FIX.10; path resolves from `src/` and `dist/` alike) and
BL-113 ×2 (handleProjectPurge fix landed 261_R6FIX.11 and live-verified: deployed purge
succeeded, verify select → 0 rows per BL-112's evidence).

*Backfilled record — PR #375 merged carrying only the BACKLOG.csv diff; per-ticket records
authored retrospectively under 295_R6NOTE.4.*

## Test plan

- [x] Each closure verified against the carrier's landed fix and live evidence.
- [x] Append-only vs `origin/main`, gitleaks — clean.

Generated with [Devin](https://devin.ai)

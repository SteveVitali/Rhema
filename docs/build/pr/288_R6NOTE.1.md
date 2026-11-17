# 288_R6NOTE.1 — backlog hygiene: dated closures for sweep-landed rows

## Summary

Records-only: five BL rows verified already discharged in the 277 sweep landing (`69c62e39`, #357)
but still `open` — BL-125 (SHA-prefix bound), BL-129 (licence pin + relicense fail-closed),
BL-130 (slo.probe cron + error logging), BL-132 (live `boss.work` assertion), BL-133 (LB both-way
pricing + unpriced line). Dated closures only. Remaining open: BL-123/BL-131 (M, retention
enforcer) and BL-128 (docs-drift sweep).

## Test plan

- [x] `git log -S` traces verify each fix landed in `69c62e39`.
- [x] Append-only vs `origin/main`, gitleaks — clean.

Generated with [Devin](https://devin.ai)

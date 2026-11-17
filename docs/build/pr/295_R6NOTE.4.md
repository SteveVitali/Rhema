# 295_R6NOTE.4 — post-merge backlog hygiene + 291_R6NOTE.2 records backfill

## Summary

After the operator merge sweep landed #366–#375: removes two stray `HEAD` lines committed to
`docs/build/BACKLOG.csv` by merge commit `793f7889` (#374) — resolution debris between
complete rows; closes 13 rows whose fixes merged (#363/#364/#365/#366/#367/#370/#374);
adds dated merged-notes to 5 deploy-bound rows kept honestly `open` (#368 :80 redirect,
#369 AR policy, #373 lifecycle drop — pending operator `pulumi up`; #371 HSTS — next deploy +
provenance); and backfills 291_R6NOTE.2's per-ticket records (PR #375 merged BACKLOG-only).

## Test plan

- [x] `grep -c '^HEAD$' BACKLOG.csv` → 0; every touched row still parses as one CSV record.
- [x] Append-only vs `origin/main`, gitleaks — clean.

Generated with [Devin](https://devin.ai)

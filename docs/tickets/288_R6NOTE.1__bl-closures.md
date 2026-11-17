# 288_R6NOTE.1 — backlog hygiene: dated closures for sweep-landed rows

**Status:** done (records-only; PR opened, unmerged — OPERATOR)
**Class:** run-time insert — records hygiene, no code
**Base:** `main` @ `50a4f9d3`
**Branch:** `stevevitali/r6note-1-bl-closures`

## What

Five BL rows verified as already discharged in the 277 sweep's own landing (`69c62e39`, PR #357)
but still carrying `open` — dated closure notes only, no code:

- **BL-125** — `check-deploy-provenance` SHA-prefix bound: `MIN_SHA_PREFIX` landed.
- **BL-129** — licence exceptions pin their granted licence + fail closed on relicense
  (`license-policy.mjs` — renamed/relicensed packages no longer slip).
- **BL-130** — `slo.probe` rides the pg-boss 5-min cron (not `setInterval`) and `error` readings
  log per tick (`main.ts`).
- **BL-132** — retention-backup test asserts live `boss.work(<binding>)` registrations, not the
  drifted manifest (`retention-backup.test.ts` N-A6 #7 comment).
- **BL-133** — `billing-read.mjs` prices LB data both directions + carries the explicit unpriced
  Logging/Monitoring line.

## Remaining open rh-low items after this pass

- **BL-123 / BL-131** — retention classes configured-not-enforced (M): GCS `<class>/` lifecycle
  prefixes vs the real object layout, `admin_actions` prune job, SECURITY.md truth pass.
- **BL-128** — docs-drift systematic sweep (process item).

## Disposition

Records-only, unmerged — `mergePolicy: OPERATOR`.

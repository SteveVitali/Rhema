# 295_R6NOTE.4 — backlog hygiene: post-merge closures, CSV debris, 291 backfill

**Status:** done (records-only; PR opened, unmerged — OPERATOR)
**Class:** run-time insert — records hygiene, no code
**Base:** `main` @ `26ba5bae`
**Branch:** `stevevitali/r6note-4-bl-closures`

## What

Post-merge sweep hygiene after the operator's 2026-11-17 merge run landed #366–#375:

- **CSV debris removal** — two stray `HEAD` lines in `docs/build/BACKLOG.csv` (merge-commit
  resolution debris introduced at `793f7889`, the #374 merge — present on neither parent;
  both sat between complete rows, removed).
- **13 dated closures → `closed`:** BL-117-sum + BL-115-det (#364), BL-118-sum + BL-116-det
  (#363), BL-122-sum + BL-118-det (#365), BL-123-sum + BL-119-det (#366), BL-124-sum +
  BL-120-det (#367), BL-134-sum + BL-124-det (#370), BL-128-sum (#374).
- **5 dated notes staying `open` (deploy-bound — honest posture, no live claim):** BL-121-det
  (:80 redirect, #368 — pulumi-up owed), BL-122-det (AR policy, #369 — pulumi-up + dry-run
  flip owed), BL-123-det + BL-131-sum (retention lifecycle drop, #373 — pulumi-up owed),
  BL-135-sum (HSTS, #371 — posture ships on next deploy + provenance).
- **291_R6NOTE.2 records backfill** — PR #375 merged carrying only its BACKLOG.csv diff;
  ticket/run/pr records and manifest/index rows authored retrospectively here.

## Disposition

Records-only, unmerged — `mergePolicy: OPERATOR`.

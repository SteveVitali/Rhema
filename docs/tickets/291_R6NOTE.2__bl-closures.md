# 291_R6NOTE.2 — backlog hygiene: dated closures (BL-111 dup, BL-113 live-verified)

**Status:** done (records-only; PR #375 merged 2026-11-17T04:05Z @ `26ba5bae`)
**Class:** run-time insert — records hygiene, no code
**Base:** `main` @ `6ed759e8` (authored); merged on `main` @ `26ba5bae`
**Branch:** `stevevitali/r6note-2-bl-closures`
**Note:** backfilled record — PR #375 merged carrying only the `docs/build/BACKLOG.csv`
diff; the per-ticket records (this file + `runs/` + `pr/` + manifest/index rows) were never
authored on that branch. Recorded 2026-11-16 under 295_R6NOTE.4.

## What

Three dated closure notes for rows already discharged by earlier carriers:

- **BL-111 (dup row)** — scheduled-journeys nightly `ENOENT` on
  `dist/u6-stub-turn.fixture.json`: already closed by the primary BL-111 row (259_R6FIX.10
  moved the fixture to package-root `fixtures/`); the duplicate row got its dated note.
- **BL-113 ×2** — `handleProjectPurge` failing on Review-ran projects: fix landed in
  261_R6FIX.11 **and live-verified** — the deployed purge succeeded and the verify select
  returned 0 rows (BL-112's row carries the live evidence).

## Disposition

Merged 2026-11-17T04:05Z (operator merge sweep).

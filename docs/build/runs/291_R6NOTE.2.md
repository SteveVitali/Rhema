# Run record — 291_R6NOTE.2 (BL closures — BL-111 dup, BL-113 live-verified)

- **Base (authored):** `main` @ `6ed759e8` · **branch:** `stevevitali/r6note-2-bl-closures`
- **Merged:** PR #375 → `26ba5bae` on 2026-11-17T04:05Z (operator).
- Records-only — no code; three dated closures: the BL-111 duplicate open row (primary row
  already closed; fixture moved to package-root `fixtures/` by 259_R6FIX.10 so the path resolves
  identically from `src/` and `dist/`) and BL-113 ×2 (fix live-verified — deployed purge
  succeeded, verify select → 0 rows per BL-112's evidence).
- **Backfilled 2026-11-16 under 295_R6NOTE.4:** this PR merged BACKLOG-only — its
  ticket/run/pr/manifest/index records were never authored on the branch. This record is the
  retrospective fill; the original diff is `26ba5bae`'s BACKLOG.csv delta.
- Append-only vs `origin/main` · gitleaks — clean.

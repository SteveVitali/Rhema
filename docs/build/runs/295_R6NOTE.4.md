# Run record — 295_R6NOTE.4 (post-merge backlog hygiene + 291 backfill)

- **Base:** `main` @ `26ba5bae` · **branch:** `stevevitali/r6note-4-bl-closures`
- Records-only — no code. Trigger: the operator's 2026-11-17 merge sweep landed #366–#375;
  this pass reconciles BACKLOG state to the merged reality.
- **Debris:** two stray `HEAD` lines in BACKLOG.csv (lines 142/147 at base) — merge-commit
  resolution debris introduced at `793f7889` (#374 merge; absent from both parents, sitting
  between complete rows). Removed.
- **Closures:** 13 rows → `closed` with dated MERGED notes naming the landing PR.
- **Deploy-bound (`open`, honest):** BL-121-det, BL-122-det, BL-123-det, BL-131-sum, BL-135-sum
  — code merged but live posture owes operator `pulumi up` / next deploy + provenance; no
  live claim recorded.
- **Backfill:** 291_R6NOTE.2's ticket/run/pr records + manifest/index rows (PR #375 merged
  BACKLOG-only — the records were never authored on that branch).
- Append-only vs `origin/main` · gitleaks — clean.

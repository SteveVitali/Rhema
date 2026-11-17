# 300_R6NOTE.6 — backlog hygiene: BL-114 closure + BL-115-det deploy-bound note

**Status:** done (records-only; PR opened, unmerged — OPERATOR)
**Class:** run-time insert — records hygiene, no code
**Base:** `main` @ `583d5aa7`
**Branch:** `stevevitali/r6note-6-bl-closures`

## What

Post-merge sweep hygiene after the operator's merge run landed #382 (`7a97e839`)
and #383 (`583d5aa7`) — the last two open PRs:

- **BL-114 → `closed`** — the dependency-advisory gate's runtime is CI itself, and it
  was verified firing: `check:dep-audit` step inside `public-safe` ran **success** on
  the post-merge main run `44033559515` (`4c8bcbb3`). Closed on real CI evidence, not
  on the merge alone.
- **BL-115-det (delayed arms) → dated deploy-bound note, stays `open`** — `298_R6FIX.31`
  merged via PR #382; the outbox drain becomes live only when the worker deploys and
  migration `0064_outbox` applies. Posture pending deploy + provenance — no live claim,
  consistent with the BL-121/122/123-det deploy-bound convention.

## Cosmetic finding (recorded, not fixed)

- BUILD_INDEX rows 349 duplicate: `297_R6FIX.30` and `298_R6FIX.31` both carry index
  349 — parallel branches assigned the same next number and both landed. Rows are
  keyed by ticket ID; the duplicate is cosmetic drift, left as-is under append-only.

## Disposition

Records-only, unmerged — `mergePolicy: OPERATOR`.

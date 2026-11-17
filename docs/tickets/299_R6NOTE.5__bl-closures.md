# 299_R6NOTE.5 — backlog hygiene: post-merge closures for #380/#381

**Status:** done (records-only; PR opened, unmerged — OPERATOR)
**Class:** run-time insert — records hygiene, no code
**Base:** `main` @ `4c8bcbb3`
**Branch:** `stevevitali/r6note-5-bl-closures`

## What

Post-merge sweep hygiene after the operator's merge run landed #380 and #381
(`0e69a1d7` + `4c8bcbb3`):

- **BL-116-sum → `closed`** — invite over-redemption race; fix merged via `296_R6FIX.29`
  / PR #380 (capacity guard moved onto the UPDATE — row-lock + EPQ re-check serializes
  concurrent claimants; same-user re-consume seat-free via `not exists`).
- **BL-115-sum → `closed`** — non-prod identity-shim key fetch helper; fix merged via
  `297_R6FIX.30` / PR #381 (`scripts/live/identity-key.mjs` — prod refused, stdout or
  `--var` env injection only, never argv/log/repo).

## Stays `open` (honest)

- **BL-115-det (delayed arms)** — `298_R6FIX.31` / PR #382 authored, unmerged at this
  pass; the row's closure rides its merge (drain cadence then lands with the worker
  deploy — deploy-bound, no live claim).

## Disposition

Records-only, unmerged — `mergePolicy: OPERATOR`.

# R6ENG.1 (REQ-ENG-1) — flake-iteration evidence

**Date:** 2026-10-20 · **Command:** `pnpm exec vitest run apps/web/src/spa/outline.dom.test.tsx
apps/web/src/spa/figures.dom.test.tsx` × 25 sequential iterations on the final code.

## Result

**25/25 iterations clean — 50/50 tests every iteration** (all 50 tests passed in each of the
25 logs; zero FAIL/✗/AssertionError lines). Exceeds the ≥20-iteration contract.

## The failure→fix chain this loop closes

| stage | loop | result | reading |
| --- | --- | --- | --- |
| bare/`!` lookups | 20 iters | 18/20 | the original BL-87 class — post-stamp bare reads raced the leaf repaint |
| `settled`+mount gates, 1s waitFor | (single capture) | iter 1 fail | `form[data-propose-form]` — the wait ceiling itself too tight under load → `SETTLE_TIMEOUT` 4s + DOM-excerpt error |
| gates + `settled` + 4s | 25 iters | 24/25 | iter 5 `outline` — DOM excerpt proved the cited arm rendered → `*After`-on-read-count root cause |
| `*After` posts-gated (final code) | 25 iters | **25/25** | both flake mechanisms retired: the settle race (gated waits) and the fixture-order race (`posts.length > 0`) |

## What is NOT claimed

- This is local evidence only. BL-87 / D-R5REC.1-1 flip at PR closeout on exact-head CI
  evidence (the ticket's own sequencing), not on this loop.
- The loop covers the two originally-flaky files; the sibling gate conversions are covered by
  the full-suite CI read, not by per-file local loops.

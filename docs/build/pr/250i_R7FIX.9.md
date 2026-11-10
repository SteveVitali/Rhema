# 250i R7FIX.9 — F-PAIDU6-1: the paid leg's optimistic-turn pin

Fixes the paid-U6 run's leg-side residual: R4's `[data-chat-turn]` `.last()` read R7b's
`<li data-chat-turn="optimistic">` placeholder (`chat-panel.tsx:434`) → polled
`turns/optimistic` → 404 → deadline FAIL, while the funded turn
`01M70QP0XCS5BZ9TPPCYYVA0J8` completed behind it (product path GREEN — metered $0.0922,
`paid-u6-run.md`). Base `stevevitali/r7deploy-tip`. **mergePolicy: OPERATOR** — the
operator merges bottom-up; a run never merges itself.

## Root cause

The pending bubble renders as a transcript row stamped `data-chat-turn="optimistic"`,
appended after the real rows while the send is in flight; the real turn's stamped row (the
run id) lands only when the POST's 201 refetches the twin. `.last()` in that window picks
the marker row verbatim.

## Fix

- `packages/journeys/src/steps.ts` — new exported `resolveChatTurnId(page, posted)`:
  primary arm reads the created turn's `data.runId` off the send POST's own
  `mutationOutcome` envelope (deterministic — immune to the placeholder and to stale older
  rows); fallback for the SSR/form arm (HTML answer, no JSON) waits on the NEWEST
  non-`optimistic` `[data-chat-turn]` row (`order by created_at desc` ⇒ `.first()` is the
  just-created turn). R4 arms `waitForResponse` before the click; an unresolvable turn id
  now throws instead of silently skipping the poll. The product assertion — send, status
  poll, terminal-state verdict — is byte-for-byte unchanged.
- `packages/journeys/src/r4-turn-pin.local.test.ts` — the Stage-A arm (below).

## Verification (fresh `pnpm turbo build` 46/46 first)

- `@rhema/journeys` + `@rhema/web` typecheck/lint clean.
- `r4-turn-pin.local.test.ts` 1/1 — leg-verbatim helper over a local `demoDataSource`
  server with the verbatim placeholder injected: POST-envelope arm resolves the real runId
  while `.last()` still reads `"optimistic"` (defect condition asserted); fallback picks the
  newest stamped row; placeholder-only → `null`, never `"optimistic"`.
- `packages/journeys/src` 232/232 · `apps/web/src` 1669/1669.
- `check:dom-contract` · `check:spa-budget` (entry +33.3 kB cumulative vs `04a4e98b`, ~0 kB
  this ticket; GD-KIT3A-BUDGET/GD-SPA-ENTRY.R7 stand) · `check:spa-env` ·
  `check:protocol-markers` · `check:no-cookies` · `check:licenses` — all green.
- **Deferred:** the leg's green verdict rides the already-authorized Monday `journeys.yml`
  paid cron → `D-R7FIX.9-1` (dated, in DEFERRALS); `D-PAIDU6-1` (row on `paid-u6-run`,
  PR #306) stays OPEN on it — owner-fix disposition recorded.
- Stage A only — no preview, no prod mutation, no paid dispatch. Spend: **$0**.

## Records

`docs/build/runs/250i_R7FIX.9.md` · `D-R7FIX.9-1` in `docs/tickets/DEFERRALS.md` ·
BUILD_INDEX 307 · LEDGER PHASE LOG + ci boundary.

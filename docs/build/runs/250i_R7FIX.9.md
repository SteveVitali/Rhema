# 250i R7FIX.9 — F-PAIDU6-1: the paid leg's optimistic-turn pin (run ledger)

- **Ticket:** `docs/tickets/250i_R7FIX.9__paid-leg-pin.md` (run-time insert — `D-PAIDU6-1`
  records the leg-side defect) · **Branch:** `stevevitali/r7fix-9-paid-leg-pin` ·
  **Base:** `stevevitali/r7deploy-tip` (`68016d1d` — deploy-tip + the 250i insert) ·
  **Date:** 2026-11-09 · **Harness:** devin-desktop/swe-2-high/subagent
- **Scope:** R4's `data-chat-turn` pick resolves the REAL turn id, never the `optimistic`
  placeholder — the product assertion (turn POST → status poll → terminal state) is
  unchanged. Stage A only, **$0**, zero production mutations — the paid re-proof rides the
  already-authorized Monday `journeys.yml` paid cron (`D-R7FIX.9-1`); no paid run dispatched.
- **Evidence:** `docs/build/runs/paid-u6-run.md` + `docs/build/reports/2026-11-09_paid-u6-R4/`
  — product GREEN (funded POST → `chat_turn` `01M70QP0XCS5BZ9TPPCYYVA0J8` completed,
  `predicatesPassed`, debits == metered 14 cr, $0.0922) but the leg arm FAILED
  (`turn-status poll never returned the turn optimistic`, 160 s bounded wait).

## Root cause (reproduced, not inferred)

R7b's chat panel (`packages/ui/src/chat-panel.tsx:434`, landed R7TALK.1a `4ed2f7a3`) renders
the pending bubble as a transcript row `<li class="chat-turn" data-chat-turn="optimistic">`,
appended AFTER the stamped turn rows while the send is in flight. R4's pick
(`packages/journeys/src/steps.ts`) read `page.locator("[data-chat-turn]").last()` — the
placeholder is always the last row in that window — extracted the literal string
`optimistic` as the turn id, and polled `/p/<slug>/chat/turns/optimistic?thread=…` → 404
every cycle → 150 s deadline → fail. The real turn's stamped row (its `data-chat-turn` is
the run id — the api selects `runs.id` for `workflow='chat_turn'`) lands only when the
send's 201 refetches the `/bff` twin; the placeholder sits in its place until then.

The local arm reproduces the exact DOM state: `[data-chat-turn]` `.last()` reads
`optimistic` with a stamped history row present — asserted in-test as the defect condition.

## Fix

`packages/journeys/src/steps.ts` — the leg pins the RESOLVED turn id, never the marker:

- New exported `resolveChatTurnId(page, posted, timeoutMs?)`. Primary arm: the send POST's
  own mutation envelope — `data.runId` (the `{ok,redirect,data:{runId,state}}` answer of
  `mutationOutcome`; the same resolved id the stubbed legs key on —
  `u6-stub-turn`'s `created.data.runId`). Deterministic: immune to the placeholder AND to a
  stale older transcript row. Fallback (the SSR/form arm answers a redirecting HTML document,
  not JSON): wait on the NEWEST non-`optimistic` `[data-chat-turn]` row — transcript rows
  render newest-first (`order by created_at desc`), so `.first()` of the filtered set is the
  just-created turn; a pending placeholder is never a pickable row.
- In R4: `page.waitForResponse` on `POST /p/:slug/chat/turns` is armed BEFORE `send.click()`
  so the envelope can't race past the listener; `pinCogsLevers`'s `route.continue` leaves
  the real response observable. The resolved id feeds the unchanged status poll +
  `data-chat-thread` keying.
- A send that produced no resolvable turn id now THROWS
  (`the chat send's turn id never resolved …`) instead of silently skipping the poll — a
  strengthening, not a weakening: the old `if (turnId)` skip was a latent false-green hole
  that only reported honest red by accident (`turns/optimistic` 404ing).
- Nothing about the leg's product assertion moved: same send, same poll URL shape, same
  queued/running/provisioning wait, same terminal-state fail.

## Verification (fresh `pnpm turbo build` 46/46 first)

- `pnpm turbo build` — 46/46 · `@rhema/journeys` + `@rhema/web` typecheck/lint clean.
- **New local arm — `packages/journeys/src/r4-turn-pin.local.test.ts` (1/1 green):** the
  leg-verbatim `resolveChatTurnId` over a local `demoDataSource` server on a real served
  document with the verbatim placeholder row injected:
  - **POST-envelope arm:** DOM = stamped history row + `data-chat-turn="optimistic"` last
    (the defect condition, asserted present) → returns the envelope's `runId`.
  - **form-post fallback:** a runId-less response → the NEWEST stamped row wins, never the
    trailing placeholder.
  - **negative:** placeholder-only transcript + no `runId` → `null`, never `"optimistic"`.
  - Screenshot: `docs/build/reports/2026-11-09_r7fix-9-r4-pin/r4-turn-pin.png`.
- Full sweeps: `packages/journeys/src` **232/232** (all local arms) · `apps/web/src`
  **1669/1669**.
- `check:dom-contract` · `check:spa-budget` (entry +33.3 kB cumulative vs `04a4e98b` —
  ~0 kB this ticket, journeys-package only; GD-KIT3A-BUDGET/GD-SPA-ENTRY.R7 stand) ·
  `check:spa-env` · `check:protocol-markers` · `check:no-cookies` · `check:licenses` — green.

## Judgement calls

- **Response-id arm over a pure DOM wait.** The ticket allows either ("wait for a
  non-`optimistic` turn id, or assert on the resolved turn id after the send"); the POST
  envelope's `runId` is both — it IS the resolved turn id — and removes the stale-row race a
  filtered `.first()` would have on a thread with prior turns. The DOM fallback stays for
  the SSR/form arm that answers HTML.
- **`.first()`, not `.last()`, on the fallback.** Transcript rows render newest-first; the
  placeholder is appended last. `.last()` on the filtered set would read the OLDEST turn —
  a fresh false-green hole on multi-turn threads.
- **Missing turn id → leg fails.** Preserving `if (turnId)`'s skip would newly false-green a
  broken send (placeholder filtered out, no real row → null → skip → pass). The throw keeps
  the arm honest at least as strongly as the accidental 404-fail it replaces.
- **Paid re-proof not dispatched.** The one manual authority is consumed (`paid-u6-run.md`
  §3); `D-R7FIX.9-1` carries the deployed green verdict to the Monday `journeys.yml` paid
  arm (standing headroom $3 — `actions/checkout` runs the merged leg code; provenance pins
  the deployed SHA). `D-PAIDU6-1`'s row lives on `stevevitali/paid-u6-run` (PR #306): the
  owner-row disposition is recorded inside `D-R7FIX.9-1` + here rather than editing a row
  this branch doesn't carry — `D-PAIDU6-1` stays OPEN until the cron's green report.
- **Cherry-pick state resolved honestly on arrival.** The checkout arrived mid-cherry-pick
  of `8b963e02` (the 250i insert, authored on `r7fix-8`'s tip) onto `r7deploy-tip`.
  Resolution kept only what belongs to deploy-tip: the manifest row + ticket file + the
  paid-U6 PHASE LOG line. BUILD_INDEX row 305 (`#307` cell) and the `250h R7FIX.8 done`
  LEDGER line are PR #307's own diff — adding them to the base would have created a revert
  hunk inside #307. Deploy-tip left local-only (not pushed).
- **Spend: $0.** Local browser legs only; no funded/paid arms, no deploy.

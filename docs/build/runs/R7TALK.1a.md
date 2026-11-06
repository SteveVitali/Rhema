# Run ledger — R7TALK.1a (row 232)

- **Spec:** `docs/tickets/232_R7TALK.1a__chat-panel-thread.md`
- **Base:** `stevevitali/r7reload-1-forms` @ `357a23e4`
- **Branch:** `stevevitali/r7talk-1a-chat-panel`
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** e981ec5
- **Started:** 2026-11-06T00:52Z
- **Closed:** 2026-11-06 (Stage A)
- **Config:** full (ledger/self-review/gap-analysis/tests; live_verification = fixture-verified only — Stage A $0, no preview per GD-PREVIEW.R7)

## Deferrals read

OPEN rows scoped to this ticket's prerequisites: D-R7PANE.1-1 (Stage-B U3.occlusion walk → 250),
D-R7RELOAD.1-1 (Stage-B U2.noreload incl. the chat-send segment → 250). Neither is unblocked by
this ticket — both stay OPEN as owner-250 rows; my new row joins them.

## Requirements

1. REQ-TALK-1 — panel tabs; last tab remembered per project via the 229 codec; default = Timeline
   when a run is active/unread else Chat.
2. REQ-TALK-3 + REQ-RELOAD-1 — Send is a JSON `fetch` (201 + runId), optimistic user bubble,
   abort (pre-201 aborts the request; post-201 the plan-decision cancel stops the turn); empty
   send blocked client-side; `/outline`+`/visualize` resolve to sheets via SPA nav; no document
   reload; chat-send segment appended to the U2 walk; no-JS form stays.
3. REQ-TALK-3 — live phase/progress from the existing run-event SSE; refetch + reply render on
   the terminal event; no new event type/payload/visibility.
4. REQ-TALK-2 — user/assistant bubbles, single sanitized render seam, citations as source chips,
   pins, inline retry on failed turns, status-only rows replaced, memory+pins in a header
   disclosure.
5. REQ-TALK-2 — composer: auto-grow TextArea (⏎ sends, ⇧⏎ newline), model-tier Select, live
   "0 / 40 credits" meter from the strip DTO.
6. REQ-TALK-2/RV-21 — per-turn `debitedCredits` (cap-clamped, ledger under request-scoped db);
   `meteredCredits` kept; COPY label when burn > cap; no money-mode change, no ledger write.
7. U6.chat (`paid:false`, stubbed turn) — real body, typechecks, passes on the committed stub
   fixture, stays `expected:"red"` (250 flips); R4 updated for new selectors (not run);
   U2.noreload chat-send segment appended.
8. `chat-panel.tsx` rebuilt on 225a primitives; REQ-GUARD-1 enabled for it.
9. Demo boot — `ReadOnlyProject{reason:"demo"}`: composer disabled + reason shown; no
   thread/turn fetch; no EventSource; nothing leaves the demo allowlist.

## Acceptance criteria — see ticket file (rows filled in § Gap table)

## Plan

- api: `GET /projects/:id/chat` turns gain `debitedCredits` + per-turn `reply`/`refs` (session
  `*-user.md` + `turn-result.json` `replySummary`, bounded); `GET …/turns/:runId` gains
  `debitedCredits` (net credit_ledger debits, request-scoped db). Two-tenant probe extended.
- contracts/api-client: DTO fields (`debitedCredits`, turn `reply`/`refs`, status `debitedCredits`).
- `packages/ui/src/chat-panel.tsx`: rebuilt on TextArea/Select/Chip/Button — bubbles + render
  seam (`renderAssistantBody`), cost footnote, header disclosure, composer primitives, native
  `<form method="post">` fallback kept; optional `live` props for the SPA arm. GUARD-1 on.
- `apps/web/src/spa/chat-live.tsx` (new): `ChatPanelLive` — optimistic bubble, `bffFetch` POST
  `/p/:slug/chat/turns`, AbortController pre-201 / plan-decision cancel post-201, EventSource on
  `/p/:slug/r/:runId/events` → phase line via `feedLabelsQuery`, terminal → `["bff"]` invalidate.
  Demo → `readOnly:"demo"` posture, zero requests. `chat-pane.tsx` mounts it.
- ide codec: `panelTab` absent ⇒ derive `timeline` when `activeRun||feed` else `chat` (REQ-TALK-1).
- journeys: U6.chat body (route-stubbed turn, committed fixture), U2.noreload chat-send segment,
  R4 selector refresh; rows stay `expected:"red"`; AUTHORED_HELD += U6.chat.
- records: ADR (chat JSON contract, debitedCredits, above-cap copy key, U6 fixture shape,
  REQ-DACC-8 deviation), DEFERRALS rows (Stage-B → 250; markdown seam → 245), PR, BUILD_INDEX,
  LEDGER.

## Test matrix

- api: turn-status `debitedCredits` (ledger debit−refund), chat list per-turn debited/reply,
  two-tenant probe on the new fields, cap-clamped read.
- ui: `chat-panel.test.tsx` — bubbles, seam sanitizer, footnote debited-not-metered, above-cap
  label, inline retry, header disclosure, composer primitives, SSR form fallback intact.
- spa DOM: `chat-live.dom.test.tsx` — JSON send envelope + optimistic reconcile, empty send no
  request, abort pre/post-201, /outline+//visualize sheet nav, SSE fixture progress → reply on
  terminal, demo boot zero-request composer-disabled.
- ide: default-tab rule (timeline-on-active vs chat), remembered tab wins.
- journeys: stub fixture shape test + registry pins; U2 segment typechecks (local walk unchanged).

## Progress

- 2026-11-06T00:52Z — Phase 0/1 done; implementing.

## Gap table

| # | Requirement | Disposition | Evidence |
|---|---|---|---|
| 1 | REQ-TALK-1 tabs + remembered last tab + default rule | met-fixture | `paneTabRemembered`/`parsePaneState` (state.ts), `defaultPanelTab` derive (controller.ts, chrome.tsx) |
| 2 | REQ-TALK-3+RELOAD-1 JSON send, optimistic, abort, empty-guard, verb→sheet, no reload, no-JS fallback | met-fixture | chat-live.tsx + chat-live.dom.test.tsx (3 legs), ChatDesk form fallback |
| 3 | run-event SSE progress → terminal → reply render; no new event shape | met-fixture | openTail/TERMINAL_EVENTS; U6 fixture stream |
| 4 | bubbles + seam + citations + pins + inline retry + header disclosure | met-fixture | chat-panel.tsx + chat-panel.test.tsx (13 tests) |
| 5 | composer TextArea/Select/meter | met-fixture | primitives + meter test |
| 6 | debitedCredits + above-cap label | met-fixture | turnDebited + CostFootnote + api tests |
| 7 | U6 real body (red) + U2 segment + R4 selectors | met-engineered(D-R7TALK.1a-1) | r7legs.ts + fixture + AUTHORED_HELD |
| 8 | chat-panel on primitives + GUARD-1 | met | eslint NO_RAW_CONTROLS_ENABLED + exemption |
| 9 | demo posture: disabled, zero requests/ES | met-fixture | chat-live.dom.test demo leg |
| — | Stage-B walk (U6/U2) | met-engineered(D-R7TALK.1a-1) | DEFERRALS row, owner 250 |
| — | markdown renderer | met-engineered(D-R7TALK.1a-2) | renderAssistantText seam, owner 245 |

## Evidence log

- `pnpm turbo build --filter=@rhema/web` — 13/13 green (SPA bundle compiles).
- `pnpm turbo typecheck` api/web/ui/ide/journeys — green.
- `pnpm turbo lint` — green after fixes.
- vitest: chat-panel.test.tsx 13/13; chat-live.dom.test.tsx 3/3; chat-surfaces 19/19; registry 10/10; ide/write-paths/copy green.
- `pnpm check:dom-contract` — OK (manifest ⊆ emitted+asserted; 33 chat hooks declared+asserted).

## Evidence report

- PR: #270 (base `stevevitali/r7reload-1-forms`), head `6255e859`; unmerged — OPERATOR policy.
- Entry delta: **+13.9 kB gz** vs `apps/web/spa-budget-baseline.json` (baseline `04a4e98b`) — inside the ≤15 kB REQ-KIT-5 allowance; chat lives in leaf chunks.
- AC layers: every in-ticket criterion is met at the fixture-verified/engineered layer (unit + DOM + api tests); the deployed walk is `met-engineered(D-R7TALK.1a-1)` owner 250; markdown rendering `met-engineered(D-R7TALK.1a-2)` owner 245.
- ci: pending at record time — `ci-boundary` JSON at `docs/build/logs/ci-R7TALK.1a.json` (bounded read follows).
- Out of scope honoured: no token deltas, no new event shape, no paid run, no preview/deploy, no ledger write, no money-mode change, demo path stays read-free.

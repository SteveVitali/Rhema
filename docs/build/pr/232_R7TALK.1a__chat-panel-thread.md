# 232_R7TALK.1a — Chat in the right panel: thread, composer, JSON send, run-event progress

Base: `stevevitali/r7reload-1-forms` · Spec: `docs/tickets/232_R7TALK.1a__chat-panel-thread.md` · Stage A, $0 — no preview (GD-PREVIEW.R7); Stage-B walk is `250_R7DEP.2`'s.

## What lands

- **The thread** (`packages/ui/src/chat-panel.tsx`, rebuilt on the 225a primitives — GUARD-1 enabled for it): user/assistant bubbles through the single sanitized seam `renderAssistantText` (plain paragraphs until 245's renderer — D-R7TALK.1a-2), citations as source chips (`refs`), pins + memory in a header disclosure, inline retry on failed turns, and a per-turn cost footnote that shows **debited (cap-clamped) credits** — metered burn above the cap is labelled truthfully via the owned COPY key `aboveCapFmt`, never as the charge (RV-21).
- **The composer**: auto-grow TextArea (⏎ sends, ⇧⏎ newline), the model-tier Select, and the live `"0 / 40 credits"` meter fed by the strip DTO / `usage.tick`. Empty sends are blocked client-side.
- **JSON send** (`apps/web/src/spa/chat-live.tsx`): the composer intercepts submit and posts JSON to the existing envelope arm — 201 + `runId`, optimistic user bubble, abort (pre-201 cancels the fetch; post-201 the plan-decision cancel stops the turn). `/outline`/`/visualize` still resolve to their sheets via `router.navigate`. The no-JS `<form method="post">` fallback stays; chat forms remain outside `SPA_WRITE`.
- **Progress over the existing run-event SSE**: `/p/:slug/r/:runId/events` feeds the phase line + meter; terminal events close the tail and invalidate `["bff"]` so the reply renders — no new event type/payload, no token deltas (GD-UX-STREAM.R7 "progress now, tokens later").
- **API**: `GET /projects/:id/chat` turns gain `debited_credits`, `user_text`, `reply`, `refs`; `GET …/turns/:runId` gains `debitedCredits` — all read under the request-scoped db; `credit_ledger` was already in the rls-catalog census.
- **Panel default tab**: when nothing is remembered, Timeline opens while a run is active/unread, else Chat (REQ-TALK-1).
- **Journeys**: `U6.chat` gets its real stubbed-turn body + committed fixture (`u6-stub-turn.fixture.json` — stays `expected:"red"`, `AUTHORED_HELD`; the REQ-DACC-8 owner-flip deviation is recorded — 250 flips, D-R7TALK.1a-1); the chat-send segment is appended to `U2.noreload`; R4 selectors hold (`[data-chat-composer]`, `[data-chat-turn]`).
- **Demo posture**: under a demo boot the composer renders disabled through `ReadOnlyProject{reason:"demo"}` — zero requests, zero EventSource.
- **ADR-135** records the owned decisions (JSON contract, debited-charge field, above-cap copy key, U6 stub fixture, REQ-DACC-8 deviation).

## Tests

chat-panel 13/13 · chat-live.dom 3/3 (JSON send+optimistic, empty-send zero-request, demo zero-request) · chat-surfaces 19/19 · registry 10/10 · `check:dom-contract` OK · api debitedCredits/enrichment tests added.

## Not in this PR

Stage-B deployed U6/U2 walks and the paid Base-tier leg (250), token-level streaming (BACKLOG), the markdown renderer (245).

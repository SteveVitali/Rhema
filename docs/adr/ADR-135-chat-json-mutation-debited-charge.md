# ADR-135 — The chat panel's JSON mutation contract, the debited-charge field, and the stub-turn fixture

**Status:** accepted — 2026-11-06 (R7TALK.1a)
**Context:** REQ-TALK-1/2/3, REQ-RELOAD-1, REQ-DACC-7, REQ-DACC-8 (deviation recorded), RV-21, GD-UX-STREAM.R7.

## Decisions

1. **Send is a JSON fetch against the existing envelope arm, never `SPA_WRITE`.**
   `POST /p/:slug/chat/turns` already answers `wantsJson` with
   `{ ok, redirect, data: <201 body> }`. The composer's live arm (`apps/web/src/spa/chat-live.tsx`)
   submits the fetch itself and reads `data.runId` — the native `<form method="post">` remains the
   no-JS fallback and chat forms stay outside the delegated `SPA_WRITE` grammar (231's comment).
   The `/outline`/`/visualize` verbs keep resolving to their SHEETS: an envelope with `redirect` and
   no `data` rides `router.navigate` — a consented SPA navigation, never an inline run and never a
   document load. Abort: pre-201 `AbortController` cancels the fetch; post-201 the existing
   `POST /p/:slug/chat/plan-decision {action:"cancel"}` stops the turn.

2. **The turn's charge is `debitedCredits`; burn stays metered and is labelled above cap.**
   `debitedCredits` = net `credit_ledger` debits (debit − refund) for the run — cap-clamped by
   construction — read under the request-scoped db (the `credit_ledger` table was already in the
   rls-catalog census; the chat GETs run under the same scoped client). `spentCredits`
   (usage_records proxy burn) is never presented as the charge; when burn exceeds the cap the
   COPY label (`aboveCapFmt`) says so truthfully. No ledger write, no money-mode change — RV-21.

3. **The reply renders from the turn-result sidecar's `replySummary` + `refs`.**
   The status DTO deliberately carries no model text (REQ-DATA-37); the distilled reply fact is the
   sidecar's ≤600-char `replySummary`, and `refs` render as citation chips. The user's words come
   from the `<turnId>-user.md` session entry the send wrote. No new event type, payload, or
   visibility — progress rides the existing run-event SSE (`usage.tick` feeds the live meter;
   `chat.turn.completed`/`run.state_changed`/`cost.final`/`chat.over_cap` close the tail and
   invalidate `["bff"]`). Token deltas remain BACKLOG (RV-3 / GD-UX-STREAM.R7).

4. **U6.chat stubs at the web route boundary.** The committed fixture
   (`packages/journeys/src/u6-stub-turn.fixture.json`) supplies the 201 envelope, the run-event SSE
   stream, and the reply turn row; the leg `page.route`s `/p/*/chat/turns`, `/p/*/r/*/events`, and
   `/bff/p/*` (patched twin) — paid:false, $0, never a real turn. `expected:"red"` until 250's
   Stage-B walk (D-R7TALK.1a-1); **the REQ-DACC-8 owner-flip deviation is recorded: 250 flips the
   registry under the nightly hazard, not this PR** (`GD-PREVIEW.R7` makes an in-ticket flip
   impossible). Assistant text renders through one seam (`renderAssistantText`) as sanitized plain
   paragraphs until 245's shared markdown renderer (D-R7TALK.1a-2).

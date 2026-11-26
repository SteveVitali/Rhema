# ADR-137 — token-level chat streaming: the `chat.token` event and its replay semantics

- **Status:** Accepted
- **Date:** 2026-11-26
- **Ticket:** 331_R7UX.8
- **Requirement ids:** REQ-ARCH-12, REQ-ARCH-13, REQ-ARCH-14, REQ-ARCH-15, REQ-DATA-37, REQ-DATA-38, REQ-MOBILE-5
- **Spec:** DS §12.5 (run events / SSE), GD-UX-STREAM.R7 ("progress now, tokens later" — the later), review RV-3 (streaming is a pipeline, not a web ticket); tickets `docs/tickets/331_R7UX.8__token-stream-plumbing.md` and `332_R7UX.9__token-stream-render.md`

## Context

A `chat_turn` renders its reply only at completion: the chat pane watches the run's
event SSE for progress events and swaps in the canonical bubble when the turn record
lands. GD-UX-STREAM.R7 parked token-level deltas with "progress now, tokens later";
RV-3 ruled that un-parking it is a pipeline decision needing its own ADR before any
code. Four forces shape the decision:

1. **The SDK's partial stream is opt-in.** `includePartialMessages` (a real vendored-SDK
   `Options` field, deliberately `false` in the §12.2 posture) is what makes the engine
   emit `stream_event` messages carrying Anthropic `MessageStreamEvent` deltas
   (`content_block_delta` with `text_delta` | `thinking_delta` | `input_json_delta`).
   The mapper ignores `stream_event` today (`mapper.ts`, `sdk-types.ts`).
2. **Postgres `run_events` is the sole source of SSE rows; Redis is wakeup-only.**
   `streamRunEvents` reads rows, never the bus — so a "fanout-only" token has no
   delivery path at all under the current machinery.
3. **Tokens are ephemeral but replay exists.** A late subscriber must never replay
   stale tokens (a finished turn's bubble already renders canonical text), yet a
   mid-flight reconnect must be able to resume — UX.9 reconciles replayed deltas by
   `seq` and swaps to the canonical record on completion.
4. **Visibility is graded, not binary.** Only the turn's requester should ever receive
   raw model text; a workspace viewer at Summary density must not. And the §12.5
   privacy boundary stands: no partial chain-of-thought, no private protocol/eval text,
   no tool inputs.

## Decision

1. **A new user-visible event: `chat.token`, payload `{turnId, seq, text}`.**
   `turnId` is the chat turn's id (frozen into the run's `inputs` at turn creation —
   the same `turnId` the completion record keys on); `seq` is the token ordinal within
   the turn (a per-phase counter — the client's dedup/reconciliation key on reconnect);
   `text` is one delta of model output, `boundedText`-capped at 280 chars (REQ-DATA-37).
   Longer SDK deltas split into consecutive `chat.token` events, each its own `seq`, so
   the whitelist validator can never throw inside the agent stream.
   `density: "verbose"` — the SSE route already caps non-requester viewers at Summary
   (REQ-DATA-38), so token text reaches the requester only.
   `visibility: "user"` — it must reach SSE; the privacy boundary is carried by WHAT is
   emitted (text deltas only), not by the internal table (which never streams).

2. **The catalogue gains an `ephemeral` flag; `chat.token` is its first member.**
   `EPHEMERAL_EVENT_TYPES` names the set. "Ephemeral" is a *replay* semantic, not a
   storage semantic: **token rows persist to `run_events` like every user event** (the
   only path that rides the existing seq-monotonic append + the 322_R6FIX.51
   commit-time wakeup — no second wake path, no payload on the bus), and the READ side
   carries the ephemerality: replay-class reads (SSE catch-up, `?poll=1`, the BFF
   `getRunEvents` seed) run `ephemeral: "live-only"` — an ephemeral row is returned only
   while its run is non-terminal — while live-tail reads include everything. In
   consequence: a subscriber attached mid-turn receives every delta; a reconnect
   mid-turn replays deltas for dedup by `seq`; any attach after the run went terminal
   receives none — stale tokens can never replay. (A failed turn's tokens are stale by
   the same rule: terminal is terminal.)

3. **Ordering is structural, not enforced.** The orchestrator stamps `seq` at append
   from `run_event_seq`; engine events — including tokens — can only be committed after
   the phase's `step.started`/`run.started` rows, so a token can never outrun its
   turn's start events on the wire, and every token precedes the run's terminal events.
   `chat_token` carries a per-turn ordinal in the payload (`seq`) because the SSE `seq`
   is shared across all event types and is not a token counter; UX.9 dedups/coalesces
   on it.

4. **`includePartialMessages` is enabled for `chat_turn` phases only** — precisely the
   phases whose frozen `inputs` carry `turnId` (one shared derivation feeds the SDK
   options and the mapper context). Non-chat phases keep the pre-UX.8 byte-for-byte
   options shape; the adapter emits the field only when set. The mapper maps
   `content_block_delta`/`text_delta` stream events to `chat.token` **only when the
   mapper context carries `chatTurnId`** — a stray delta on a non-chat phase is dropped,
   never emitted unbound.

5. **What is NOT exposed:** `thinking_delta` and `input_json_delta` deltas are dropped
   in the mapper — no partial chain-of-thought and no partial tool input ever leaves
   the harness. Token `text` is model output only, for an authorized turn only. No
   protocol/eval text enters the payload (the run-task boundary already keeps private
   material out of events; `check:protocol-markers` asserts it). `chat.token` renders
   nowhere in the live feed — the feed formatter is fail-closed and the coverage
   assertion exempts ephemeral types (the bubble is the only surface, UX.9's).
   No `data-*` hooks are added here; the DOM contract is UX.9's.

6. **Renderer-side coalescing (the contract UX.9 codes against):** deltas append to the
   turn keyed by `turnId`, deduped by `seq` (a replayed delta is idempotent),
   coalesced at frame cadence, and replaced wholesale by the canonical turn record on
   completion — the record wins on any mismatch. A turn with zero token events renders
   exactly as today: the stream is progressive enhancement, never a requirement.

## Consequences

- Token text flows through every run_events read while the run is live — including the
  `?poll=1` replay the web feed seeds from (fail-closed rendering keeps it invisible
  there) and requester-verbose SSE only. Summary viewers are structurally excluded.
- `run_events` grows by O(tokens) rows per chat turn. At ≤280 chars/row and chat-scale
  answers this is bounded (a 4 KB answer ≈ 15 rows); the rows are dead weight after
  completion — `live-only` replay keeps them off the wire but they remain in the table
  (retention/GC is a known follow-up, not this ticket).
- A mid-flight poll/replay CAN return token rows — deliberately (UX.9 dedups by `seq`);
  consumers that treat run_events as a render feed must be fail-closed (they are).
- `FakeEngine`/`ManagedAgentsEngine` share the mapper, so recorded `stream_event`
  fixtures map identically and the conformance suite covers the new path for free.
- A retry/reattempt starts a fresh phase → a fresh `seq` counter; the client reconciles
  on the completion event (documented, acceptable: turn attempts are rare and the
  canonical record wins).
- Backpressure beyond this decision is out of scope: a slow consumer degrades the same
  way it does today (the buffer batches; reconnect + live-only replay bounds the gap).

## Alternatives considered

- **Fanout-only tokens (never persisted).** Rejected: Redis is wakeup-only by design
  — no row means no delivery path. Adding payload-carrying fanout creates a second
  event path the ticket explicitly warns against, breaks "Postgres is the only source
  of rows" (REQ-ARCH-13 replay correctness), and still can't fix mid-flight reconnect.
- **Persist but replay tokens unconditionally.** Rejected: a post-completion attach
  would replay stale text — exactly the failure the ticket forbids.
- **`visibility: "internal"` + a new internal-streaming path.** Rejected: internal rows
  never reach SSE at all; the boundary that needs protecting is text content (solved by
  density + what-is-emitted), not row placement. A parallel stream duplicates the
  wake/batch machinery.
- **`density: "summary"` so all viewers see tokens.** Rejected: model text is the
  requester's turn output; other workspace viewers get the completed bubble, not the
  stream — REQ-DATA-38's requester/viewer split already encodes the intent.
- **A `chat.turn.streamed`/completion-side flag on the run row instead of a per-event
  type.** Rejected: deltas are many-per-turn events; a row flag can't carry them.

## Revisit trigger

Revisit if any of: (a) `run_events` volume from tokens becomes a real cost (⇒ a
post-completion GC sweep or a dedicated `chat_tokens` table behind the same
live-only rule); (b) a consumer needs tokens on non-chat_turn runs (⇒ widen the
`inputs.turnId` gate or mint an explicit capability input); (c) reconnect semantics
need cross-attempt dedup (⇒ `seq` gains an attempt component); (d) the SDK changes
`includePartialMessages` or the `MessageStreamEvent` delta shapes (⇒ `sdk-types.ts`
+ the mapper's narrow-and-drop policy adjusts in one place).

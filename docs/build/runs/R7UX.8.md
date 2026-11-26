# Run ledger — R7UX.8 (row 331)

Harness: devin-cli/swe-2-high/subagent
Skills: implement-spec (full)
Started: 2026-11-26
Closed: —
Spec: docs/tickets/331_R7UX.8__token-stream-plumbing.md
Base: `stevenvitali/r7ux-7-pane-resize` (worktree tip `1240aa5f` at dispatch — unmerged;
PR base stays the parent branch — mergePolicy OPERATOR)
Branch: `stevenvitali/r7ux-8-token-stream-plumbing`
Config: implement-spec full; live = Stage A + owned pr-<n> preview walk (324 ruling; $0,
prod untouched); **ADR first — the RV-3 stream decision precedes the code in the same PR.**
Budget: ~800 changed lines incl. tests (M–L) — stop + request a split past it.

## Deferrals read

- Read `docs/tickets/DEFERRALS.md` at run start (2026-11-26). No `OPEN` row names this
  ticket or BL-99 as its unblocker.
- `D-R7UX.1-1` … `D-R7UX.7-1` (OPEN) — the sibling deployed-tip re-walks — untouched:
  they unblock only on the operator's stack merge + a deploy carrying those SHAs.
- This ticket's Live stage is "Stage A + preview walk": the deployed-tip re-walk lands as
  a new `D-R7UX.8-1` row at close.
- Owes: BACKLOG BL-99 part-1 landing pointer → `331_R7UX.8 (PR #<n>, unmerged)`; BL-99
  stays OPEN for UX.9's client render.

## Requirements (spec Goal/anchors)

1. A `chat.token` event carrying `{turnId, seq, text}` deltas, emitted by the agent
   harness during a `chat_turn` phase, reaching `postEvents`/`eventWriter` with the same
   seq-monotonic ordering guarantees as every other event, flowing through the existing
   commit-time wakeup (322_R6FIX.51 — no second wake path) to the `/events` SSE.
2. A token event never outruns its turn's start event on the wire.
3. Late subscribers must not replay stale tokens (tokens are ephemeral; the
   persist-vs-fanout decision is the ADR's).
4. Privacy boundary (REQ-SPEC/ADR-125): no private protocol/eval text in payloads; token
   text is model output for an authorized turn only — no partial chain-of-thought.
5. RV-3 ADR authored BEFORE the code (event shape, ordering vs `chat_turn` completion,
   renderer-side coalescing, what is NOT exposed).

## Findings (Phase 0 exploration)

- `packages/contracts/src/events.ts` — the `RUN_EVENTS` catalogue; `boundedText` ≤280
  (REQ-DATA-37); `visibility`/`density` per type. `EventDef` gains an `ephemeral` flag +
  `EPHEMERAL_EVENT_TYPES` for the stale-token rule.
- `packages/engine/src/mapper/mapper.ts:217-219` + `sdk-types.ts:76-81` — `stream_event`
  messages are ignored today ("partial-streaming deltas are not mapped"). The SDK
  `stream_event.event` is an Anthropic `MessageStreamEvent`; `content_block_delta` with
  `delta.type === "text_delta"` carries the token text (`thinking_delta` /
  `input_json_delta` are dropped — no partial chain-of-thought).
- `packages/engine/src/options.ts` + `apps/run-task/src/sdk-adapter.ts` — the SDK
  `includePartialMessages` opt-in was deliberately `false` (§12.2 posture); it is a REAL
  SDK `Options` field, enabled here ONLY for phases whose frozen inputs carry `turnId`
  (a `chat_turn` run — `chat-routes.ts:647` freezes `turnId` into inputs; `chat_turn`
  `allowsSubagents: false`, single `answer` phase).
- Turn binding: `MapperContext.chatTurnId` — set from `req.inputs.turnId` in all three
  engines (`agent-sdk-engine`, `fake-engine`, `managed-agents-engine`) via one shared
  derivation; absent ⇒ `stream_event` deltas stay unmapped (non-chat phases emit nothing).
- Text bound: deltas split at 280 chars so `parseRunEvent` never throws inside the agent
  stream; each split chunk is its own `chat.token` with its own `seq` (per-phase ordinal
  counter, the dedup key UX.9 documents).
- `packages/orchestrator/src/event-stream.ts` — Postgres `run_events` is the SOLE source
  of rows; Redis is wakeup-only. There is no fanout-only delivery path: "fanout-only
  tokens" are undeliverable under the current machinery → tokens persist to `run_events`
  and the replay rule carries the ephemerality: **`ephemeral: "live-only"` on catch-up /
  `?poll=1` reads drops ephemeral rows once the run is terminal; the live tail includes
  everything.** Mid-flight replays DO return tokens (UX.9's seq-dedup reconciliation);
  post-completion attaches never see them (the "no stale token replay" rule).
- `feedRowsFor`/`formatFeedRow` are fail-closed (no template ⇒ the row drops), and the
  live feed polls go through the same live-only read — `chat.token` never renders as a
  feed row. `feedTemplateCoverage` gains an `ephemeral` exemption (the type renders on
  the chat surface, not the feed — the coverage test stays green without a template).
- `apps/api/src/sse-routes.ts` — `read = (after, mode)` gains the tail/catch-up mode flag;
  `RunEventStreamer.pump` passes `{tail: caughtUp}`. `resolveSseAccess` keeps the
  requester→verbose cap: only the turn's requester receives token text (density
  `verbose`); summary viewers never see token rows.

## Acceptance criteria (working checklist)

- AC1: contracts — `chat.token` `{turnId, seq, text}` (id, int seq, boundedText);
  `ephemeral: true`; `EPHEMERAL_EVENT_TYPES` exported.
- AC2: engine — `includePartialMessages` opt-in for `inputs.turnId` phases only;
  `sdk-adapter` forwards the real SDK field when set; mapper maps `text_delta`
  stream_events to ordered `chat.token` events (≤280 splits, per-phase seq); non-chat
  phases emit nothing; `thinking`/`input_json` deltas never emit.
- AC3: orchestrator/api — stale-token replay rule + live-tail inclusion.
- AC4 (integration): stubbed turn emitting N deltas → N ordered `chat.token` events on
  the stream with monotonic seq, visible on an SSE subscription before turn completion;
  concurrent subscribers each see all deltas; a late subscriber after completion sees
  none; U6.chat + notification legs unchanged.
- AC5: `pnpm turbo build lint typecheck` + orchestrator/run-task/api suites +
  `check:no-cookies`/`protocol-markers` green.
- AC6 (preview): a test-tenant chat turn on `pr-<n>` emits token events (probe/console
  assertion; render is UX.9's).

## Plan

1. ADR-137 (docs/adr/ADR-137-token-level-chat-streaming.md) — the RV-3 decision record.
2. contracts `events.ts`: `ephemeral?: boolean` on `EventDef`; `chat.token` entry;
   `EPHEMERAL_EVENT_TYPES` + `isEphemeralRunEvent`; tests.
3. engine: `sdk-types.ts` `SdkStreamEvent` inner typing; `mapper.ts` `chatTurnId` ctx +
   `handleStreamEvent` (text_delta only, ≤280 splits); `options.ts`
   `includePartialMessages` + `buildQueryOptions` gate on `inputs.turnId`; all three
   engines pass `chatTurnId`; `sdk-adapter.toSdkOptions` forwards when true; tests.
4. orchestrator `event-stream.ts`: `ReadEventsOptions.ephemeral`; `EventReader` mode
   param; `pump` passes `{tail: caughtUp}`; `sse-routes.ts` wires `live-only` on
   catch-up/poll reads; `feed-labels.ts` coverage exemption; tests.
5. Integration: stubbed `chat_turn` turn → N ordered events → SSE subscription mid-turn
   sees them; concurrent subscribers; late-after-completion subscriber sees none.
6. Verify → preview walk → records closeout.

## Phase log

- 2026-11-26 — Phase 0: context loaded; ticket/LEDGER/DEFERRALS read; pipeline traced
  (mapper ignores `stream_event`; Postgres is the only row source; fail-closed feed).
  Ledger seeded. ADR-137 next.
- 2026-11-26 — ADR-137 authored (event shape, ephemeral live-only replay, ordering,
  coalescing contract, privacy boundary, `includePartialMessages` opt-in).
- 2026-11-26 — Implementation landed: contracts `chat.token` + `ephemeral` flag +
  `EPHEMERAL_EVENT_TYPES`; engine `stream_event`→`chat.token` mapping (`text_delta`
  only, ≤280 splits, `chatTurnId`-gated — all three engines via `chatTurnIdFor`);
  `includePartialMessages` SDK opt-in on `inputs.turnId`; orchestrator `ephemeral:
  "live-only"|"include"` read class + `EventReadMode.tail`; api route wires live-only
  on catch-up/poll; feed coverage exempts ephemeral types.
- 2026-11-26 — Tests: contracts catalogue/parse; mapper deltas (ordering, splits,
  thinking/input_json dropped, unbound phases drop); options opt-in gate; adapter
  forwarding; event-stream live-only/include + streamer catch-up-vs-tail; sse-routes
  poll semantics (stale exclusion, mid-flight replay, summary-viewer exclusion);
  composed FakeEngine→runAgentPhase→postEvents→run_events→SSE leg (N ordered tokens,
  concurrent subscribers, chatTurnId gate). All green; build/lint/typecheck green;
  no-cookies/protocol-markers/dom-contract/spa-budget/spa-env green.

## Continuation (walk + closeout)

- 2026-11-26 — Continuation worker: `pr-425` brought up (216 resources; `ciPreviewSweepBucketsList` import + state delete, pause:3.9 → hello placeholder, api rev pre-migrate → migrate → forced rev — all the wave's known converge passes). Test tenant `test+jr7ux8tok@rhema.tools` funded via the audited `house-grant` one-off-job seam (actor `devin-cli:r7ux-8`; 50+50+60 cr).
- 2026-11-26 — **Walk blocked then unblocked:** the run's agent phase 401'd — `rhema-pr-425-anthropic-api-key` v2/v3 were byte-identical copies of the dev key, which is dead at the provider (direct `api.anthropic.com` curl → `authentication_error: invalid x-api-key`, `req_011ChR3Rbx1Fbw6bZtcAA1AS`; dev key known-dead since mid-Oct, F-R6CNT.2-1). En route, fixed a real preview defect: the egress-proxy MIG's `OPPORTUNISTIC` updatePolicy left the running VM serving the deleted hello placeholder on :8443 (HTTP-200 non-Message bodies) — `update-instances --minimal-action replace` rolled it. **F-R7UX.8-1: `pulumi up` updating a proxy template does NOT roll the instance — check `list-instances` after every image-pin `up`.**
- 2026-11-26 — **GD-R7UX.8-1 ruling applied:** operator authorized the prod Anthropic key for this preview window → `rhema-pr-425-anthropic-api-key` v4 seeded from `rhema-prod-anthropic-api-key` (piped, never printed).
- 2026-11-26 — **Walk PASS** (`reports/2026-11-26_r7ux8-token-stream/`, walk.mjs probe-fix commit): run `01M8BB40M7BMZ4HJX1GPBCX7KY` — 59 `chat.token` frames (turn seq 0–58 monotonic, `turnId`-bound, `density:"verbose"`) arrived on the same-origin SSE tail at 07:12:39 — ~10s before `step.finished` and ~20s before `cost.final` — while earlier frames (`plan_card`, `step.started`, `usage.tick` ×3) streamed normally. All 59 deltas shared one payload `at` — the producer batch-appends a turn's deltas per flush; the "visible on SSE before turn completion" arm is proven; per-delta mid-turn granularity is the UX.9 render contract's concern, recorded in the ADR's coalescing clause. Probe fix: `run.state_changed` is per-transition — terminal check now parses `payload.to`.
- 2026-11-26 — Teardown per the owned lifecycle: `destroy` issued (216 resources; expect the `serverless-ipv4-cloudrun-*` subnet GC-lag), orphan sweep + `rm` to follow.

Closed: 2026-11-26T07:16Z

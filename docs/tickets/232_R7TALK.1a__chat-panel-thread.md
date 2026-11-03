# R7TALK.1a — Chat in the right panel: thread, composer, JSON send, progress over run-event SSE

- **Sequence:** 232 of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:**
  - 229_R7PANE.1: the right panel and its Chat tab, which today holds the Desk chat body moved
    unchanged.
  - 231_R7RELOAD.1: the delegated-submit write allowlist, the stable chat error codes, and the
    GUARD-3 harness this ticket appends the chat-send segment to.
  - 225a_R7KIT.2b: TextArea, Select and Chip for the composer and thread.
  - It also consumes 213_R7COPY.0's `RunSummaryView` (REQ-SYNC-1), which is in the R7b base
    because the stack forks after 213 (P4-16).
  - This row merges after 224 (spec §5.1).
- **Run:** `implement-spec spec=docs/tickets/232_R7TALK.1a__chat-panel-thread.md`
- **Gate status:** none. This ticket makes **no paid run**. The one manual paid U6 run
  (< $10, `GD-UX-PAIDLEG.R7`) belongs to 250_R7DEP.2.
- **Live stage:** Stage A only ($0: unit, DOM and integration tests, the committed run-event
  fixture stream, and a local build). Inference is $0.
  - No owned preview (`GD-PREVIEW.R7`). Stage B is staging-verified at the R7b phase preview
    (250_R7DEP.2) through a DEFERRALS row, and prod Stage B rides 250.
  - The `paid:false` U6.chat leg against a **stubbed turn** is held `ready-to-flip` (nightly
    hazard). 250 walks it with its stubbed free turn and flips it.
  - Any need for a live preview outside 224's and 250's windows → PAUSE for the operator.
- **Production mutations:** none
- **Size budget:** ~800 changed lines excl. generated/fixtures (M, upper bound). Entry-delta
  allowance ≤ 15 kB gz (REQ-KIT-5); chat stays in a leaf chunk. The actual figure is stated in the
  PR. A runtime split clause is pre-declared in Notes (P4-14).

## Goal
Chat feels like a modern assistant, not a form. In the right panel's Chat tab:
- **The thread** shows user and assistant bubbles, citations as source chips, pins, and an honest
  per-turn cost footnote.
- **The composer** is an auto-grow box with a model-tier Select and a live credit meter.
- **Send** is a JSON `fetch`, with an optimistic bubble and abort.
- **Progress** comes from the **existing run-event SSE**, and the reply renders when the turn
  completes, with no document reload.

Per `GD-UX-STREAM.R7`, token-level deltas are out of scope. They are BACKLOG with their own
future ADR (RV-3).

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md`:
  - §3.1 `GD-UX-CHAT.R7`, `GD-UX-STREAM.R7`, `GD-UX-PAIDLEG.R7`;
  - §4.11 REQ-TALK-1, -2 and -3; §4.8 REQ-RELOAD-1;
  - §4.17 REQ-DACC-7 (U6);
  - §7 (token streaming goes to BACKLOG); §8.2 (money); §9.
- REVIEW RV-3 (streaming is a pipeline, not a web ticket) and RV-21 (burn above cap).
- R5 `…/R5-ux-browser-audit.md` B6 and B16. R6 `…/R6-ux-code-audit.md` UXC-1 and §2 T2.
- AGENTS: `apps/api/AGENTS.md`; `packages/orchestrator/AGENTS.md` (read only: a turn is a queued
  run); `packages/journeys/AGENTS.md` (paid guards; no paid leg runs here). Root gotcha 5.
- Anchors (re-confirm at build time):
  - **`packages/ui/src/chat-panel.tsx`:** 9 `<form method="post">`; the status-only row ≈:278
    `spentCredits/capCredits`; the composer ≈:440; the strip ≈:468.
  - **`apps/api/src/chat-routes.ts`:**
    - `POST …/threads/:tid/turns` ≈:446 returns `201 {runId,state,deduped,planCard}`;
    - `GET …/turns/:runId` ≈:596 returns "metered rows, never model text";
    - `turnUsage` ≈:237 sums `usage_records` where `source='proxy'`. That is **burn**, not the
      debit;
    - plan-decision `cancel` ≈:671.
  - **Web chat routes:** `apps/web/src/server.ts` `/p/:project/chat/*` (≈:1660-1880). The
    `/outline` and `/visualize` verbs redirect to their sheets (REQ-CHAT-25).
  - **Run-event SSE:** `apps/api/src/sse-routes.ts` ≈:82 `GET /runs/:id/events`; web
    `/p/:project/r/:runId/events`; `apps/web/src/spa/ide/feed.ts` (the EventSource tail, resumed
    with `?after=`).
  - **Ledger:** `credit_ledger` (the debits) and the cap-clamped debit in `packages/ledger`.
  - **Journey rows:** in `packages/journeys/src/registry.ts`, the existing **paid** row `R4`
    ("a chat turn answers; Send is clickable…", capUsd 0.5) and the U6 row.
- Primitives: 225a's TextArea, Select and Chip; 225's Toast and Badge. Also 229's panel and its
  demo-boot clause, 226's demo-boot variant, 211's ReadOnlyProject, and 231's allowlist and
  harness;
  `docs/tickets/00_MANIFEST.md` § Cross-cutting invariants and § Operating rules;
  `docs/tickets/DEFERRALS.md`.

## In scope — deliverables
1. **Panel tabs** (REQ-TALK-1). The last tab is remembered per project, through 229's pane codec.
   The default is Timeline when a run is active or unread, and Chat otherwise.
2. **Send** (REQ-TALK-3, REQ-RELOAD-1) [UXC-1].
   - The SPA composer posts JSON with `fetch` (201 plus a turn/run id), shows an optimistic user
     bubble, and supports abort:
     - before the 201, abort cancels the request;
     - after it, the existing cancel path stops the turn.
   - An empty send is blocked client-side and makes no request.
   - The `/outline` and `/visualize` verbs still resolve to their sheets by SPA navigation, the
     consent rule.
   - No document reload. The chat-send segment is appended to 231's U2 walk.
   - The no-JS form path stays as the SSR fallback.
3. **Progress and reply** (REQ-TALK-3).
   - Live phase/progress comes from the existing run-event SSE for the turn's run.
   - On the terminal event the transcript is refetched and the reply renders.
   - No new event type, payload or visibility change. Token deltas stay BACKLOG.
4. **Thread** (REQ-TALK-2) [B6, B16].
   - User and assistant bubbles. The assistant body renders through a single **render seam** (see
     Notes, markdown).
   - Citations render as source chips. Pins.
   - A failed turn shows inline retry. The status-only rows are replaced.
   - Memory and pins sit in a header disclosure.
5. **Composer** (REQ-TALK-2): an auto-grow TextArea (⏎ sends, ⇧⏎ inserts a newline), a model-tier
   Select, and a live "0 / 40 credits" meter, with every number from the existing strip DTO.
6. **Cost footnote** (REQ-TALK-2; RV-21; gotcha 5).
   - Each turn shows its **debited (cap-clamped) credits**. The turn DTO gains a `debitedCredits`
     field read from the ledger under the request-scoped db; `meteredCredits` is kept.
   - When metered burn exceeds the cap, a COPY-sourced label says so truthfully. It is never
     hidden and never presented as the charge.
   - No money-mode change and no ledger write.
7. **U6.chat CI/nightly leg** (`paid:false`). Against a stubbed turn it asserts the JSON 201,
   progress events and no reload. The existing paid `R4` step body is updated for the new
   composer selectors but is **not** run here.
   - **The flip is held** (nightly hazard, P4-4; 209's note). Prod serves R7a until 250 deploys,
     so the row stays `expected:"red"`, held `ready-to-flip`, and 250_R7DEP.2 flips it.
8. **Controls.** `chat-panel.tsx` is rebuilt on the primitives, and REQ-GUARD-1 is enabled for it.
   The remaining IDE files are 243's.
9. **Demo boot** (P4-3; 226's demo-boot variant). In a demo boot the composer is disabled through
   `ReadOnlyProject{reason:"demo"}` (211), and its reason is shown:
   - Send, the tier Select and the credit meter make no request;
   - no thread or turn fetch is issued and no `EventSource` is opened;
   - no request leaves 221's demo allowlist.

## Out of scope
- Token-level streaming (BACKLOG; future ADR on engine → run-task → event visibility → SSE).
- Findings/Claims "From Review of vN" (REQ-TALK-4) and the burn-vs-cap investigation
  (REQ-SYNC-6): 233_R7TALK.1b.
- The shared sanitized markdown renderer (REQ-COPY-3): 245_R7COPY.1b.
- The manual paid U6 run: 250. The rest of the IDE control migration: 243.

## Acceptance criteria
- [ ] Send is a `fetch` JSON mutation that adds no navigation entry. A test that restores a native
      form submit fails. *(deterministic · layer: engineered)*
- [ ] An empty send is blocked with no request. The optimistic bubble reconciles with the server
      turn, and a failed turn shows inline retry. *(deterministic · layer: engineered)*
- [ ] Given a committed fixture stream of run events, the bubble shows phase progress and then
      the reply on the terminal event. *(deterministic · layer: fixture-verified)*
- [ ] The footnote shows `debitedCredits`. A fixture with metered > cap shows the above-cap label.
      The test fails if metered burn is rendered as the charge.
      *(deterministic · layer: engineered)*
- [ ] The `debitedCredits` read is tenant-scoped. The deterministic two-tenant probe still passes
      for `GET …/turns/{runId}`; extend it if the new field could carry a foreign row.
      *(deterministic · layer: engineered)*
- [ ] The tab-memory and default-tab rules are tested. COPY/reserved-strings lint is green, and no
      third-party harness name appears. *(deterministic · layer: engineered)*
- [ ] REQ-GUARD-1 is enabled for `chat-panel.tsx` and lint is green. The entry delta is ≤ 15 kB gz
      and reported. *(deterministic · layer: engineered)*
- [ ] A demo-boot DOM test mounts the Chat tab with `boot.demo` set and records every request. The
      composer is disabled with its read-only reason, typing and Send make no request, and no
      thread, turn or SSE request is issued. The test fails if the composer is enabled, or a
      request is issued, in a demo boot. *(deterministic · layer: engineered)*
- [ ] **U6.chat (stubbed) is held `ready-to-flip`.** The steps are implemented and typecheck, and
      they pass against the committed stub-turn fixture. U2.noreload's chat-send segment is
      appended, and 231's Stage-A walk still passes. Both registry rows stay `expected:"red"` in
      this PR (nightly hazard). The run record states that 250_R7DEP.2 flips them.
      *(deterministic · layer: fixture-verified)*
- [ ] **Stage B is staging-verified at the R7b phase preview (250_R7DEP.2)** (`GD-PREVIEW.R7`: no
      per-ticket preview). This ticket opens a dated `DEFERRALS.md` row (`D-R7TALK.1a-n`, owner
      250). The row names what 250 captures:
      - U6.chat (stubbed, $0 inference) green at the preview SHA (`--expect-sha`);
      - U2.noreload green including the chat-send segment;
      - screenshots of the thread, the composer and a turn's cost footnote.

      Unblock: 250's preview walk. Compensating control: the fixture-verified tests above. 250
      closes the row and flips the legs, and the one paid U6 run is also 250's.
      *(agentic · layer: fixture-verified here; staging-verified and live-executed at 250)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-TALK-1, REQ-TALK-2, REQ-TALK-3, REQ-RELOAD-1, REQ-DACC-7 (U6 CI leg; held `ready-to-flip`,
flipped by 250), REQ-KIT-5 (allowance). REQ-DWEB-7 is re-asserted for the demo-boot composer
(owned by 221).

## Cross-cutting invariants
- Manifest § Cross-cutting invariants:
  - 7 (money: the meter of record; Σ debits ≤ cap);
  - 10 (events carry no prompt or model text; no new payload);
  - 11 (the chat verbs route to sheets; the run sheet stays the only run creator);
  - 13, 14 (truthful money), 17.
- Spec §8: 1, 2 (no money-mode change; numbers from the record), 3, 4, 5, 7.

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`; the gap table has one row per clause.

## Notes
- **Decisions this ticket owns:**
  - the chat JSON contract (request/response, abort semantics);
  - the `debitedCredits` DTO field;
  - the above-cap label copy key;
  - the U6 stub-turn fixture shape.
- **Shared decisions consumed:**
  - the panel and codec (229);
  - the allowlist, stable error codes and GUARD-3 harness (231);
  - `RunSummaryView` and one-run-state (213);
  - the primitives (225, 225a);
  - ReadOnlyProject (211) and the demo-boot variant (226), for deliverable 9.
- **Markdown seam (ordering concern).** REQ-TALK-2 asks for rendered markdown, but the one
  sanitized renderer (REQ-COPY-3) is owned by 245, which lands later. Until then, this ticket
  renders assistant text through a seam as sanitized plain paragraphs; there is no ad-hoc markdown
  parser.
  - Open a DEFERRALS row: "chat bubbles render markdown". Unblock: 245 merged. Compensating
    control: the seam's sanitizer test.
  - 245 plugs its renderer into the seam and closes the row.
- **Money.** The investigation of *why* burn exceeds the cap is 233's (REQ-SYNC-6). This ticket
  only displays the truth.
- **REQ-DACC-8 deviation.** DACC-8 has the owner flip U6 in its own PR. Under `GD-PREVIEW.R7` and
  the nightly hazard, 250 flips it instead. Record this in the run record as an accepted
  deviation for 252's list.
- **Runtime split clause** (P4-14; invariant 17). If the run must split, the worker requests it
  at this seam, and orchestrate-build writes the split back to the manifest:
  - **(a)** JSON send, progress and U6 (REQ-TALK-3, REQ-RELOAD-1). That is deliverables 2, 3 and
    7, with deliverable 1's tab rules (REQ-TALK-1);
  - **(b)** the thread, composer and cost footnote (REQ-TALK-2), plus `chat-panel` GUARD-1. That
    is deliverables 4, 5, 6 and 8, with the demo-boot composer clause (deliverable 9).

  (b) stacks on (a).

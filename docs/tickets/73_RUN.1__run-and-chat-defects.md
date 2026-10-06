# RUN.1 — Run and chat defects: chat turns answer, informational gates never block, walkthroughs write

- **Sequence:** 73 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** fix
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** EDIT.1, HOT.1, JOURNEY.1
- **Scope (one line):** fix the chat turn's bare 502 (root cause plus a truthful error path) and the Send button hidden under `footer.ide-statusbar` at 1440×900; render gate labels from the §6.4 defaults-as-data resolution so that an informational Approve-scope never parks the run; and fix the `run.walkthrough` job that fails on delivered runs.
- **Spec §§:** 6.4 (R3 table, REQ-SPEC-17, mechanics 1–6), 6.3 (concurrency: reads never lock), 7.1 (turn anatomy and cost, tier picker), 5.5 (walkthrough), 5.6 (run sheet lines), 12.4 (gate open → park)
- **REQ coverage:** REQ-SPEC-1 (amended; primary), REQ-GATE-1, REQ-CHAT-9 (primary), REQ-CHAT-14; touched REQ-SPEC-17, REQ-IDE-19 (walkthrough) (stamp in the PR)
- **Absorbs (backlog):** BL-55 (PR-J6), BL-59 (PR-R1), BL-52 (b) (PR-J3, walkthrough half; the dossier 500 is HOT.1's)
- **Run:** `implement-spec spec=docs/tickets/73_RUN.1__run-and-chat-defects.md`
- **Gate status:** none beyond the round-3 standing authorization (ADR-013). The chat leg is a plain turn, not a research burst, so it does not wait on the H7 research-burst ruling (BL-20). The journey legs need the H7 test mailbox through JOURNEY.1.
- **Live stage:** Stage A: code + tests ($0). Stage B: deploy, then one live chat turn, one walkthrough regeneration, and one Review observed through its Approve-scope gate (Stopped after the gate, or carried on the weekly paid journey) — ≤ $3 metered.


> **Amended 2026-09-30 (operator — round-3 spend limit: hard ≤ $200, target ≤ $100):** this ticket's Stage B metered spend cap is **≤ $3** (was ≤ $5); aim for ≈ $2. Run legs cheapest-first and stop once the acceptance evidence suffices; where a leg plan below sums past the new cap, drop the lowest-priority legs and record each dropped leg as a `D-RUN.1-<n>` row (never overspend). The orchestrator pauses the chain when round-3 cumulative metered spend reaches $100 and hard-stops at $200 (LEDGER GATE DECISIONS 2026-09-30, D6 revised).

## Goal
Three defects a user hits within minutes of the live review:

1. **Chat fails (PR-J6).** POST `/p/:slug/chat/turns` → HTTP 502, and no app log line matches it. The code
   explains the missing log. The web handler (`apps/web/src/server.ts` ~437–478) calls `postChatTurn(…)
   .catch(() => null)` and then returns `{error:"chat unavailable"}` 502 **without logging**. It collapses every
   api refusal into that bare 502: the api route (`apps/api/src/chat-routes.ts` ~437–576) answers 409
   `run_in_progress` (the turn's `lockSetSpec {projectId}` against a Review holding the project lock), 402
   `insufficient_balance`, 403, 422, and 503 `chat_not_wired`. Find which of these fired on prod, using HOT.1's
   LB request logs, and fix both the cause and the error path. At 1440×900 the Send button is also covered by
   the status bar (Playwright: `footer.ide-statusbar` intercepts the click).
2. **An informational gate blocks (PR-R1).** The run sheet said "Scope approval — informational; the run
   proceeds" and the card said "Informational — the run continues while you read." Yet the run parked in
   "Waiting for you — no deadline" until clicked. In code:
   - the sheet line is hand-written (`packages/run-sheet/src/view.ts` ~395–409; it reads only
     `approvalPolicy`/`scopeBlocking`, never the project's overrides)
   - the card's `informational` flag is `!blocking` (`packages/findings-core/src/gate-card.ts` ~111)
   - the orchestrator parks the run in `waiting_gate` for **every** gate regardless of `blocking`
     (`packages/orchestrator/src/internal-api.ts` ~933–945)
   - `resolveGatePolicy` (`packages/orchestrator/src/gate-policy.ts` ~59–110) turns a project override
     `approve_scope: null` into `onExpiry:"wait"` without touching `blocking`

   REQ-SPEC-1 (amended 2026-09-30) makes the label data: it renders from the same resolution, and an
   informational gate never blocks.
3. **The walkthrough fails (PR-J3 b).** Worker log `run.walkthrough … status:failed` on run
   `01M3SK62YZST272B35CG12K6TW` ("The walkthrough couldn't be written"). A strong lead:
   - `apps/worker/src/main.ts` ~291–297 binds a stub that always rejects "walkthrough unconfigured" unless
     `WALKTHROUGH_MODEL_KEY_SECRET` is set
   - `infra/pulumi/compute.ts` ~436–440 sets only `INGEST_MODEL_KEY_SECRET`
   - the env fallback in `apps/worker/src/env.ts` ~155–163 runs ingest→walkthrough only, never the reverse

   Confirm with `runs.walkthrough.lastError` (a read-only query).

## Load (read these — do not re-read others)
- Spec §6.4 (R3 table row *Confirm scope*; REQ-GATE-1; REQ-SPEC-1 + its 2026-09-30 note in Appendix A.9;
  mechanics 1, 3, 6), §6.3 "Concurrency the user can rely on", §7.1 "Turn anatomy and cost", §5.5 walkthrough
  paragraph (~568), §12.4 step 6 (gateAfter)
- `apps/web/src/server.ts` ~400–480 (chat POST routes), `apps/api/src/chat-routes.ts` ~435–580,
  `packages/api-client/src/index.ts` `postChatTurn` (~4517)
- The Desk/chat composer markup in `apps/web/src/pages.tsx` (~1946, the `turn:` endpoint) and
  `packages/tokens/src/ide-css.ts` ~76–90 (Desk height, status bar), `packages/ui/src/ide-shell.tsx` ~369
- `packages/contracts/src/domain/gates.ts` (`GATE_DEFAULTS` ~40–75), `packages/orchestrator/src/gate-policy.ts`,
  `packages/orchestrator/src/internal-api.ts` ~900–990 (gate open), `packages/orchestrator/src/commit-decision.ts`
- `packages/run-sheet/src/view.ts` ~390–415; `apps/web/src/copy.ts` ~465–490 (gate copy);
  `packages/findings-core/src/gate-card.ts` ~100–120, ~210–220
- `packages/orchestrator/src/walkthrough.ts`, `apps/worker/src/walkthrough-generator.ts`, `apps/worker/src/env.ts`
  ~74–100 / ~150–165, `infra/pulumi/compute.ts` ~420–445

## In scope — deliverables
1. **Chat turn root cause + fix** (REQ-CHAT-9, BL-55). Reproduce on prod read-only, using the LB request log for
   the 502 and the api log for the upstream status. Fix the cause (e.g. a turn refused because a Review holds
   the project lock must say so). §6.3 says "reads … never lock", and a chat turn writes only the assistant
   namespace, so re-check whether `lockSetSpec {projectId}` should take the project lock at all.
2. **Truthful chat error path.** The web chat routes (turns, plan-decision, threads, pins) propagate the api's
   refusal as a status and a user-facing line: "a run is in progress — chat after it finishes", "not enough
   credits — add credits", and a real 5xx for a real fault. Each failure logs one structured line with the
   route, the upstream status and a request id, and **never** the message text (REQ-VIS-11). OBS.1
   generalises this to every route; this ticket fixes chat.
3. **Send is clickable** (REQ-CHAT-14 composer). At 1440×900, and at phone width (the compact chat surface), the
   Send button and the tier picker are visible, enabled and unobscured. The Desk's composer never renders under
   `footer.ide-statusbar` or the Page's fixed sync pill. A layout test pins this at the CSS seam.
4. **Turn anatomy on a live turn** (REQ-CHAT-9/14). A delivered turn shows its credits, the thread shows daily
   spend, and the tier picker sits in the composer (notch only; model name on hover/Advanced).
5. **Gate labels are data** (REQ-SPEC-1 amended, REQ-SPEC-17, REQ-GATE-1).
   - One resolution drives all of: the run sheet's scope line, the gate card's informational/blocking copy, the
     Inbox row, and the orchestrator's park decision. That resolution is `resolveGatePolicy` over
     `GATE_DEFAULTS` + policy + project and run overrides + scope context.
   - The sheet line is computed from the same inputs the run will freeze, including project overrides.
6. **Informational never blocks.** An `approve_scope` with resolved `blocking:false` opens its gate row and
   `gate.opened` event, stays on the run card until the letter phase (§6.4 R3), queues corrections as guidance,
   and **does not** transition the run to `waiting_gate`.
   - Decide what an `approve_scope: null` project override means: blocking-wait, labelled "waits for you", or an
     illegal override refused by `approvalOverridesSchema`. Make sheet, card and behaviour agree.
   - Spend and refusal kinds are untouched (they never auto-proceed).
7. **Walkthrough fixed** (REQ-IDE-19, BL-52 b). Confirm the cause from `lastError`, fix the wiring, and cover the
   stub-vs-live binding with a test. Retry on the card regenerates a walkthrough on the failed run. The
   self-healing re-enqueue stays.
8. **Stage B.** Deploy, then:
   - turn journey steps **R4** (a chat turn answers; Send clickable at 1440×900 and at phone width) and **R7**
     (an informational gate does not block; labels match behaviour) green
   - regenerate the walkthrough on `01M3SK62YZST272B35CG12K6TW`

## Out of scope
- The dossier 500, LB request logging and the `claims` config: **HOT.1**.
- Structured error logging for every route, the api listener leak and 5xx alerting: **OBS.1**.
- Research-burst semantics (zero-fetch plans; D-DEF.1-1): **HUMAN-H7** ruling (BL-20).
- Gate-resume *latency*: **SLO.1**.
- Refund classes for failed phases: **RES.2** / **DEF.4**.
- The pill's phone placement and tap targets: **UX.2**.

## Acceptance criteria
- [ ] The prod chat 502 is root-caused in the run ledger with the LB and api log lines; a regression test
      reproduces the cause and fails pre-fix. *(agentic + deterministic)*
- [ ] Web chat routes map each api refusal (402/403/409/422/503) to its status and a user-facing line; no path
      returns a bare 502 for an upstream 4xx. A test per mapping; the log line carries no message text. *(deterministic)*
- [ ] At 1440×900 and at 390×844 the Send control is visible, enabled and unobscured at click time (a
      hit-test at the CSS seam, plus the journey). *(deterministic + agentic)*
- [ ] For every policy × override × scope-context combination in a table-driven test, the sheet line, the card's
      informational/blocking copy and the orchestrator's park decision derive from one `resolveGatePolicy`
      result, and a label saying "informational"/"the run continues" never co-occurs with a parked run. *(deterministic)*
- [ ] An informational `approve_scope` leaves the run `running` (no `waiting_gate` row); the gate stays open
      on the card until the letter phase; spend/refusal gates still park and never auto-proceed. *(deterministic)*
- [ ] The walkthrough's failure cause is confirmed from `runs.walkthrough.lastError`; a test fails if the
      deployed worker binds the stub while a key secret is configured; Retry on `01M3SK62…` produces a
      `status:'ready'` walkthrough of ≤ 200 words. *(deterministic + agentic)*
- [ ] **Journey steps R4 and R7 green on prod** (JOURNEY.1 harness; expected-red flags cleared). Evidence:
      - R4: a live chat turn answers with its credits shown
      - R7: an informational Approve-scope passes without a click, and the labels match the behaviour
      - screenshots committed
      - metered spend ≤ $3 in total *(agentic — JOURNEY.1)*
- [ ] Deployed provenance equals this ticket's chain-tip SHA (REQ-SPEC-29). *(deterministic)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-SPEC-1 (amended; primary), REQ-CHAT-9 (primary), REQ-GATE-1, REQ-CHAT-14; touched REQ-SPEC-17, REQ-IDE-19;
REQ-SPEC-29 (R4, R7).

## Cross-cutting invariants
- 00_MANIFEST invariant **7**: spend gates never auto-proceed and there is no silent billing. The informational
  change must leave `neverAutoProceed` kinds untouched.
- Invariant **10** and REQ-VIS-11: no chat message text in logs, events or error bodies. Events carry ids and
  counts only.
- Invariant **11**: the run sheet and plan card remain the only run creators. A clearer error must not create a
  run.
- Invariant **12** / **REQ-SPEC-29**: R4 and R7 are verified by walking them.
- Invariant **13** / **REQ-SPEC-30**: gate and chat reads stay on the user-serving role (SEC.1).
- Invariant **14** / **REQ-SPEC-32**: the walkthrough's one model call is platform cost. Keep it visible in
  metering (see Notes).

## Notes
- **Owned decisions (write an ADR):**
  - (1) the meaning of an `approve_scope` project override under informational-by-default (item 6)
  - (2) whether a chat turn takes the project lock (§6.3 "reads … never lock" vs the current
    `lockSetSpec {projectId}`)
  - (3) the walkthrough key wiring. §13.3 / REQ-ARCH-30 (amended) keep provider keys in `egress-proxy`, yet the
    worker already holds the Anthropic key for ingest reconstruction (`INGEST_MODEL_KEY_SECRET`) and calls
    `api.anthropic.com` directly for the walkthrough, unmetered. Either route both package-class calls through
    the proxy (metered, REQ-SPEC-32) or record the existing exception explicitly. Do not widen it silently.
- **Consumed:**
  - HOT.1: LB request logging, the evidence source for the 502
  - JOURNEY.1: harness, sessions, the R4/R7 expected-red flags; R7 may ride JOURNEY.1's weekly paid journey
    (≤ 300-word fixture) instead of a dedicated run
  - SEC.1: the user-serving role
- **Anchors to re-confirm at build time:**
  - `server.ts` ~437–478
  - `chat-routes.ts` ~437–576
  - `internal-api.ts` ~933–945
  - `gate-policy.ts` ~59–110
  - `gates.ts` ~46–75
  - `view.ts` ~395–409
  - `gate-card.ts` ~111
  - `copy.ts` ~468–485
  - `main.ts` ~291–297 and ~445–452
  - `compute.ts` ~436–440
  - `env.ts` ~155–163
- **DEFERRALS:**
  - Annotate **D-P1.11-1**'s chat_turn half with the live turn's plan-card event and `turn-result.json`; its
    research_burst half stays with BL-20.
  - Anything the live legs cannot show within $3 becomes `D-RUN.1-<n>`.

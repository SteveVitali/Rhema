# Run ledger — R7UX.9 (row 332)

Harness: devin-cli/swe-2-high/subagent
Skills: implement-spec (full)
Started: 2026-11-26
Closed: —
Spec: docs/tickets/332_R7UX.9__token-stream-render.md
Base: `stevenvitali/r7ux-8-token-stream-plumbing` (worktree tip `f2420b09` at dispatch — unmerged;
mergePolicy OPERATOR). _2026-11-26 update: PR #425 merged at 07:58Z mid-run — `f2420b09` is an
ancestor of `origin/main`; the PR base is `main`._
Branch: `stevenvitali/r7ux-9-token-stream-render`
Config: implement-spec full; live = Stage A + owned pr-<n> preview walk (324 ruling; $0,
prod untouched)
Budget: ~500 changed lines incl. tests (M) — stop + request a split past it.

## Deferrals read

- Read `docs/tickets/DEFERRALS.md` at run start (2026-11-26). No `OPEN` row names this
  ticket or BL-99 part 2 as its unblocker.
- `D-R7UX.1-1` … `D-R7UX.8-1` (OPEN) — the sibling deployed-tip re-walks — untouched:
  they unblock only on the operator's stack merge + a deploy carrying those SHAs.
- This ticket's Live stage is "Stage A + preview walk": the deployed-tip re-walk lands as
  a new `D-R7UX.9-1` row at close.
- Owes: BACKLOG BL-99 part-2 landing pointer → `332_R7UX.9 (PR #<n>, unmerged)`; BL-99
  closes when the operator merges the pair.

## Requirements (spec Goal/anchors, ADR-137 client contract)

1. `chat.token` deltas render into the pending chat turn's bubble incrementally — no
   per-token markdown parse, plain text while in flight.
2. Dedup by payload `seq` — a mid-flight reconnect replays deltas idempotently.
3. Frame-cadence coalescing — one DOM write per animation frame, never per event.
4. Completion swaps to the canonical turn record — `reply` outranks the stream on any
   mismatch; zero-token turns render exactly as before.
5. The stream binds to ONE bubble — run-id keyed; optimistic → transcript-row hop,
   never rendered twice.

## Findings (Phase 0 exploration)

- **SSE frames are NAMED events** (`event: <type>` per `formatSse`,
  `packages/orchestrator/src/event-stream.ts`) — `EventSource.onmessage` never fires on
  this stream. The existing `chat-live.tsx` tail used `onmessage` (latent dead path);
  the fix binds `addEventListener(type, …)` per `spa/ide/feed.ts`'s pattern.
- `run.state_changed` fires per-TRANSITION — terminality must read `payload.to` in
  `TERMINAL_RUN_STATES` (`completed/completed_partial/failed/cancelled`, plus the legacy
  `error_during_execution`/`aborted` spellings the probe also breaks on).
- `chat.token.turnId` is `inputs.turnId` (`deps.ids("turn")` at
  `apps/api/src/chat-routes.ts:629`), NOT the run id; `ChatTurnWire.id` IS the run id.
  The client binds the stream to the turn through the tail's runId (verified vs UX.8
  walk facts: runId `01M8BB40…`, turnId `01M8BB40GFDH…`).
- `formatFeedRow(type, payload, maps)` throws when `maps.t` is undefined — guarded with
  `maps.data?.t != null`.
- Producer batching caveat (UX.8 walk): tokens may share one `at` and arrive in one
  flush — assertions read accumulation + canonical swap, never inter-token timing.
- IDE CSS is `packages/tokens/src/ide-css.ts`, a hand-authored string builder.

## Implementation

- `packages/ui/src/chat-panel.tsx` — exported `ChatStreamWire {runId, turnId, text}`;
  `ChatLiveWire.streamed?`; `TurnBubbles` renders `[data-chat-stream="<runId>"]` +
  `data-streaming="true"` on the pending bubble when `streamed.runId === t.id` and
  `reply == null` (canonical reply wins unconditionally); the optimistic arm renders
  `data-chat-stream="optimistic"` ONLY until the twin refetch lands the row (never
  both). Stream node is `aria-hidden` — the live region announces the canonical bubble
  once at completion, not per frame. `ChatStreamWire` exported via `packages/ui/src/index.ts`.
- `apps/web/src/spa/chat-live.tsx` — named-event listeners (`chat.token`, `usage.tick`,
  the terminal set, feed-label types); `chat.token` handler validates `{turnId, seq≥0,
  text}` fail-closed, dedups into a `Map<seq,text>` buffer (replayed seqs overwrite
  idempotently, out-of-order deltas concat-order by seq), rAF-cadence flush to one
  `streamed` state write; `clearStream()` on terminal event / abort / new send /
  unmount; `run.state_changed` gates on `payload.to` in `TERMINAL_TO`.
- `apps/web/src/dom-contract.ts` — `data-streaming` + `data-chat-stream` manifest rows.
- `packages/tokens/src/ide-css.ts` — `.chat-bubble-stream` (pre-wrap block) +
  `.chat-bubble-assistant[data-streaming='true']` dashed border.

## Verify (Stage A)

- `packages/ui/src/chat-panel.test.tsx` — 4 streaming legs (accumulate into pending
  bubble, run-id binding, canonical-reply-wins, optimistic→row hop).
- `apps/web/src/spa/chat-live.dom.test.tsx` — `FakeES` (captures named-event listeners,
  `emit(type, data)`) + 5 legs: accumulation, seq-dedup replay + out-of-order ordering,
  non-terminal `state_changed` keeps tail + completion swap, terminal `to:failed`,
  zero-token posture. 25/25 focused legs green.
- Full web+ui suite: 123 files / 1,928 tests green.
- `pnpm turbo build lint typecheck` 138/138 (initial miss: `ChatStreamWire` export —
  fixed).
- `check:dom-contract` / `check:spa-env` / `check:spa-budget` / `check:spa-entry-graph`
  / `check:protocol-markers` / `check:no-cookies` — all OK. spa-budget WARN is the
  standing cumulative +33.8 kB drift vs `04a4e98b` (per-ticket delta ≈ +2 kB client —
  GD-KIT3A-BUDGET/GD-SPA-ENTRY.R7 stand, disclosed on every R7UX row).
- 462+/29− across 7 files vs the ~500 budget.
- Code commit `f70b9742` pushed; PR #426 on `main` (r7ux-8's base landed; head = this
  commit until the records commit lands).

## Continuation (preview + walk)

- 2026-11-26 — `pr-426` bring-up (216 resources): `init` → config (project/region —
  required before first `up` on a fresh stack; gitSha `f70b9742`, protocolsVersion
  `0.4.0+07b1ad37ddaaa6f4`, `placeholderImage` hello — pause:3.9 still gone, oauth id,
  apparmor `Localhost`/`rhema-run-task`) → `resend-pull` (nonprodResendVersion 1 +
  `previews@rhema.tools`) → `pulumi install` → `up` converging passes: the shared
  `ciPreviewSweepBucketsList` project role `pulumi import`ed (F-R7UX.1-1 class — orphan
  survivor from prior previews; `state delete`d + member at teardown); 2 AlertPolicy
  404s on the just-created `slo_violations` metric (≤10-min propagation — next pass
  clean); Cloud Build `a0614afa` all-10 @ `f70b9742` (11m26s, `_ALLOW_PLACEHOLDER_SDK=1`
  initially) → digests pinned (`serviceImages` ×8 + `runTaskImageDigest` + `proxyImage`)
  → api rev `00002-5wz` terminal pre-migrate (`database "rhema" does not exist`,
  R7DEP.2 class) → migrate Job `…-52a0b7a` applied → rev `00003-pp9` forced via
  `gcloud run services update --image` + serving → `appBaseUrl`/`apiPublicUrl` pinned →
  converged → `seed-invite` `prv-426-test`. Provenance `/healthz/` `gitSha f70b9742…`
  = PR head.
- 2026-11-26 — **F-R7UX.8-1 discharged here per its own owed guard:** the image-pin `up`
  replaced the proxy template but did NOT roll the VM (verified via `list-instances` —
  `tmpl-c40dc40` deleted while running) → `update-instances --minimal-action replace`
  → `rhema-pr-426-proxy-2r9c` RUNNING + HEALTHY on `tmpl-8bfe973`, instance metadata
  `proxy-image = egress-proxy@sha256:938a546c…` (real image, not the placeholder).
- 2026-11-26 — **GD-R7UX.8-1 ruling applied:** `rhema-pr-426-anthropic-api-key` v2 seeded
  from `rhema-prod-anthropic-api-key` (piped, never printed; v1 = placeholder).
- 2026-11-26 — Test tenant `test+jr7ux9tok@rhema.tools` provisioned via real magic-link
  sign-in, then funded via the audited `house-grant` one-off in-VPC Job seam (api image,
  worker SA, `SYSTEM_DATABASE_URL` by secret-ref, actor `devin-cli:r7ux-9`): **160 cr →
  billing `01M8BE9YZFW9P8B1WAYESTDZH3`** (ledger `01M8BEN83CKR1WT6N0X7119JGP`, audit
  `01M8BEN83PRJW1BX656C18CD2Y`); the acct-lookup + grant jobs deleted after use.
- 2026-11-26 — **Two failed bring-up legs before the green run (recorded, fixed):**
  (a) run `01M8BEQYKYGTHDXH5NZYNAV91C` — `provisioning → failed (infra)`: the `runs`
  namespace RBAC (`infra/k8s/30-worker-job-rbac.yaml`) was not yet applied — the
  worker SA could not `create secrets` (the documented post-up `infra/k8s/apply.sh`
  step, D-P0.15c-8). Fixed: cluster creds + `apply.sh` (namespace, WI-bound KSA,
  egress NetworkPolicy, worker launcher RBAC, prepull + apparmor-loader DaemonSets —
  the loader image built+pushed locally, `apparmor-loader@sha256:49c50245…`).
  (b) run `01M8BF6BJMSF2NC56ZG5E2ZYDS` — reached `running`/`step.started`, then
  `error_during_execution`: attempt-1 pod `GcsApiError` materializing work (the UX.8
  transient class — reaper re-drove attempt 2) → attempt-2 failed fast: the
  `_ALLOW_PLACEHOLDER_SDK=1` run-task image carries no vendored agent SDK
  (`ERR_MODULE_NOT_FOUND` on `@anthropic-ai/claude-agent-sdk`). Fixed: vendored SDK
  copied from the operator-held `wt-r7ux8` checkout (gitignored state, 212M — never
  committed) → `gcloud builds submit _SERVICES=run-task _ALLOW_PLACEHOLDER_SDK=0` →
  `run-task@sha256:419e1329…` (in-image assert green: SDK executable by uid 10002) →
  `runTaskImageDigest` repin → `up` → `apply.sh` re-run for the prewarm digest.
- 2026-11-26 — **Walk PASS** (`reports/2026-11-26_r7ux9-token-render/`): run
  `01M8BG1RG5ACBCEXPV2QVD0JQN` on scratch project `/p/untitled` —
  **66 `chat.token` frames** (payload seq 0–65 contiguous + monotonic, turnId-bound,
  all before the terminal frame) on the same-origin SSE tail; Node-side DOM sampling
  (~150 ms cadence) observed `[data-chat-stream]` bound to the RUN-ID row key (never
  `"optimistic"` after the row landed, `maxConcurrentStreamNodes: 1`) holding **753
  accumulated chars** mid-turn — screenshot `chat-mid-stream.png` shows the dashed
  `data-streaming` bubble visibly rendering the un-parsed token text while the run
  was non-terminal; then the canonical swap: stream node unmounted, the turn's
  canonical reply ("Wrote a short plain-prose paragraph about rivers…") rendered in
  the same bubble — `chat-after-turn.png`. `verdict: PASS`.
- Producer-batch caveat held: all sampled stream text arrived in one flush
  (`growthLens: [753]` — the documented "tokens share one `at`" shape); the contract
  asserted accumulation + canonical swap, never inter-token timing.
- Live reconnect-resume: not forced (a network flap mid-turn can't be scripted on the
  preview); the seq-dedup replay path is unit-covered by the dom.test `FakeES` replay
  leg — recorded, not claimed live.
- **Observation (pre-existing, not this ticket's):** the optimistic turn pair stays
  rendered alongside the transcript row mid-flight — the mid-stream shot shows the
  row's streaming bubble AND the optimistic pair's "Answer started" pending line
  beneath it (optimistic clears only at terminal). Streaming makes the duplicate more
  visible; noted for the wave, no new defect filed.
- **P-1 note:** the walk's `.state` session cache (live cookie) was NOT committed
  (deleted pre-commit). UX.8's report dir did commit its `.state` file — the cookie
  is dead with `pr-425` but the record stands; flagged in PR body.
- 2026-11-26 — Teardown per the owned lifecycle: `ciPreviewSweepBucketsList` role +
  `ci-preview-sweep-buckets-list` member `state delete`d (preserve the shared project
  resource, F-R7UX.1-1) → `destroy` pass 1 deleted 129 (AlloyDB 358s, Redis 164s,
  nodepool 264s, GKE 316s) → pass 2 `--continue-on-error` deleted 82 →
  `private-app` subnet pinned by Google-owned
  `serverless-ipv4-cloudrun-1795679318002389696` (F-OPS.1-12 GC-lag class — the
  Cloud Run serverless reservation releases on Google's clock, ~50 min–2 h) →
  final destroy pass on release + orphan sweep + `rm` to follow.

Closed: —

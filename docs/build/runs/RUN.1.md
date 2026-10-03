# RUN.1 — Run and chat defects (run ledger, append-only per leg)

- **Ticket:** `docs/tickets/73_RUN.1__run-and-chat-defects.md` — chat turns answer, informational
  gates never block, walkthroughs write.
- **Branch:** `stevevitali/run-1-run-and-chat-defects` · **PR #95** · stacked on the EDIT.1 tip `76e00c5`
  (`stevevitali/edit-1-edit-path`, PR #94 — unmerged, OPERATOR). Tip `0cd943d`.
- **Spend:** **$0** so far — Stage A only; Stage B is operator-gated (deploy + R4/R7 + walkthrough
  regen → D-RUN.1-1/-2).
- **ADRs:** ADR-050 (one gate-policy resolution — informational gates never park),
  ADR-051 (chat turns keep the project lock; truthful web proxy), ADR-052 (worker walkthrough
  model-key exception).

## Stage A — implemented + deterministic-green

### 1. Chat truthful error path (defect: bare 502, no log trail)

Old: every chat write route called `deps.dataSource.postChatTurn?.(...).catch(() => null)` —
upstream `ApiError`s collapsed to `null` → generic 502, zero logging.

New: `chatCall`/`chatFail` (`apps/web/src/server.ts` ~599–638) is the one seam all chat
write/status routes use (`turns`, `plan-decision`, `threads`, `pins`, `pins/:id/remove`,
`corrections`, `suggestions`, `notes`, `attachments`, `turn-status` GET):

- api `ApiError` non-5xx → status + code pass through unchanged (402 `insufficient_balance`,
  403, 409 `run_in_progress`, 422).
- api 5xx → `502 chat_upstream_error`; transport failure → `502 chat_unavailable`; unbound seam →
  `503 chat_not_wired`.
- one structured log line per refusal: `{level, msg, route, requestId, upstreamStatus,
  upstreamCode}` — never the message text / thread content (REQ-VIS-11).
- `suggestion_too_large` keeps its §7.4 form-post redirect; all other codes take the truthful
  JSON path on form posts too.
- **Chat lock decision (ADR-051):** `lockSetSpec {projectId}` stays — a turn is a run-creating
  write into the project workspace, not a §6.3 read; the truthful 409 + "a run is in progress"
  is the fix, not lock removal.

Tests: `apps/web/src/chat-surfaces.test.ts` RUN.1 describe — 402/409/502/503 passthrough, form
post, every-route parametrized case, and a no-message-text-in-logs assertion (17 tests).

### 2. Send occluded by `footer.ide-statusbar` (R4)

- `packages/ui/src/chat-panel.tsx` — transcript/pins/sources now live inside `.chat-body`;
  `.chat-composer` is the final child OUTSIDE the scrollable region.
- `packages/tokens/src/ide-css.ts` — chat panel is a flex column; `.chat-body` scrolls;
  `.chat-composer` is pinned and never underlaps the status bar.
- `packages/ui/src/chat-panel.test.tsx` (9) asserts the composer is last and no chat content
  follows it.
- Journeys R4 rewritten for truth: opens the desk via Ctrl+J (`data-desk` closed unless a run is
  live), uses the real `form[data-chat-composer]` selectors, asserts `assertActionable` at
  1440×900, posts a real turn and polls `GET /p/:slug/chat/turns/:runId?thread=` to a terminal
  state, then repeats Send-actionability in a **real mobile context** (iPhone UA — the compact
  mount is `isPhoneRequest`-driven, not viewport-driven).

### 3. Informational gates never park (defect: PR-R1)

- `packages/contracts/src/domain/gate-policy.ts` (NEW) — `resolveGatePolicy` is THE one
  resolution: GATE_DEFAULTS + policy + project/run overrides + scope context. Exports
  `resolveScopeGate` (the compressed presentation facts) and `isNamedGate`.
  - `approve_scope` default: `blocking:false`, no deadline (informational).
  - `scopeExceedsCap` → blocking, `onExpiry:"wait"`; `scopeBlocking` → blocking, 2 h deadline,
    `proceed_as_proposed`.
  - **`approve_scope: null` override = blocking wait** (ADR-050): `blocking:true`, no deadline,
    `onExpiry:"wait"` — the only legal approve_scope override opts IN to parking.
- `packages/orchestrator/src/commit-decision.ts` — `CommitNext` gates carry `blocking`;
  non-blocking gates also carry `then:"advance"|"finalize"`; blocking gates carry no `then`.
- `packages/orchestrator/src/internal-api.ts` — `commitStep` opens informational gates WITHOUT
  `waiting_gate`: `then:"advance"` keeps `running`; `then:"finalize"` goes `finalizing`. Pause
  requests still honoured at the boundary. Expiry scheduling restricted to blocking deadlines.
- `packages/orchestrator/src/gate-resolution.ts` — `autoResolveOpenInformationalGates` resolves
  unresolved `blocking=false` gates at the finalization boundary
  (`Decision{by:'policy', action:'proceed_as_proposed'}`, idempotent, in-tx); `resolveGate`
  accepts informational resolution while `running`; blocking still requires `waiting_gate`.
- `apps/run-task/src/harness-loop.ts` — blocking gate → `{kind:"gated"}` (pod exits);
  informational gate → advance/finalize per `next.then` (pod continues, no resume hop).
- Surfaces: `triage-routes.ts` Needs-you shows blocking gates / gates on waiting runs only;
  `timeline-routes.ts` loads all unresolved gates on live runs (blocking wins dedup) but
  `waitingGate` stays driven by real `waiting_gate` state; `sheet-context.ts` ships
  `approval_overrides` parsed through `approvalOverridesSchema` (invalid → `{}` fail-safe);
  `run-sheet/src/view.ts` resolves the scope line via `resolveScopeGate` — the four canonical
  strings; `api-client` types carry the overrides.
- Tests: `gate-policy.test.ts` (matrix incl. `null`→blocking-wait), `commit-decision.test.ts`,
  `internal-api.test.ts` (informational advance/finalize, blocking park, auto-resolve at
  finalization), `gate-resolution.test.ts` (19), `triage-routes.test.ts`, `timeline-routes.test.ts`
  (informational on running run; blocking wins), `run-sheet/view.test.ts` (scope line per
  resolution), `harness-loop.test.ts` (blocking exits / informational rides through),
  `pod-loop.test.ts` (e2e: blocking parks under `wait_each`; informational rides to the next
  phase with `gates.blocking=false`, run never `waiting_gate`), `phase-loop.test.ts`,
  `g21.test.ts` (blocking fixture), plus the JOURNEY.1 R7 step rewritten to assert the
  sheet-line canonical strings + the co-occurrence invariant (informational card never on a
  `waiting_gate` run card).

### 4. Walkthrough model-key wiring (defect: every run.walkthrough `unconfigured`)

- `apps/worker/src/walkthrough-generator.ts` — `loadWalkthroughGenerator(secretName, access)`:
  valid non-placeholder key → `AnthropicWalkthroughGenerator` (claude-haiku-4-5, ≤400 output
  tokens, ≤200-word brief); unset/placeholder → failing stub `walkthrough unconfigured` (exposed
  for retry, never silent).
- `apps/worker/src/main.ts` — binds via `env.walkthroughModelKeySecret` + the `access` seam.
- `infra/pulumi/compute.ts` — `WALKTHROUGH_MODEL_KEY_SECRET` →
  `secretVersion(secrets.anthropicApiKey)` inside the worker envs block (name's
  `/versions/latest`, never the value — REQ-ARCH-30).
- `infra/pulumi/iam.ts` — comment names the exception pair (worker reads the provider key for
  `ingest.reconstruct` + `run.walkthrough` only — never web/collab/run-task) — ADR-052.
- Tests: `walkthrough-generator.test.ts` (3 — loader stub-vs-live binding),
  `compute.test.ts` (12 — env inside the worker block + secret-version reference).

## Test fixes folded in (pre-existing red on the base branch)

- `scripts/check-additive-migrations.test.mjs` — expected list lacked migration
  `0053_collab_provenance_maps_update.sql` (EDIT.1 landed the file, snapshot not updated) →
  appended; now green.
- `phase-loop.test.ts` / `harness-loop.test.ts` / `g21.test.ts` / `pod-loop.test.ts` — fixtures
  mechanically carried `blocking:false` where the old park semantics were under test; updated to
  the blocking leg (`wait_each` / `blocking:true`) and new informational-path coverage added.

## Green gate (Stage A)

- `pnpm turbo build lint typecheck` — **135/135**.
- `pnpm test` — **4,172 pass / 6 skip / 0 fail** (424 files, ~219 s).
- `pnpm check:licenses` — 609 packages OK. `pnpm check:protocol-markers` — 48 files clean.
- `check-build-memory.sh` — 0 violations (7 pre-existing warnings).
- `infra/pulumi` — vitest 15/15 (compute.test.ts + proxy.test.ts). NOTE (pre-existing):
  `tsc -b` on `infra/pulumi` fails on `import.meta` in the pre-existing test file — the tsconfig
  is `module: commonjs` for the Pulumi CLI; test files are covered by vitest, not that tsc.

## Stage B — DEFERRED (D-RUN.1-1, D-RUN.1-2)

Operator-gated per merge policy OPERATOR; the ticket's live legs are:

- deploy at the chain-tip SHA (api + web + worker images; `WALKTHROUGH_MODEL_KEY_SECRET` is a
  new env on the worker — preview must show it);
- R4 (chat turn answers; Send actionable 1440×900 + phone) and R7 (informational gate does not
  block; labels match behaviour) on the deployed stage → `registry.ts` `red→green`;
- walkthrough regeneration on `01M3SK62YZST272B35CG12K6TW` (Retry → `run.walkthrough` writes a
  ready record, `lastError` cleared);
- total metered spend ≤ $3.

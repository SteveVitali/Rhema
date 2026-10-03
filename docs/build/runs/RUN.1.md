# RUN.1 — Run and chat defects (run ledger, append-only per leg)

- **Ticket:** `docs/tickets/73_RUN.1__run-and-chat-defects.md` — chat turns answer, informational
  gates never block, walkthroughs write.
- **Branch:** `stevevitali/run-1-run-and-chat-defects` · **PR #95** · stacked on the EDIT.1 tip `76e00c5`
  (`stevevitali/edit-1-edit-path`, PR #94 — unmerged, OPERATOR). Tip `0cd943d`.
- **Spend:** **$0.21** metered (Stage B live legs: 3 chat turns + walkthrough regen) — ≤$3 bound.
  Stage B DONE 2026-10-03 (deploy + provenance + R4/R7 flips + walkthrough regen).
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

## Stage B — DONE (2026-10-03; D-RUN.1-1, D-RUN.1-2 closed)

Harness: operator-driven legs under the standing ADR-013 Stage-B authorization (merge policy
OPERATOR — PR #95 stays open, unmerged).

- **Build.** Cloud Build `8e0392e3-4632-4563-b444-48b9658c1a31` (tag `run1`, chain-tip
  `8ce4038`) — all nine images SUCCESS.
- **Deploy.** `Pulumi.prod.yaml` pins bumped for the diff'd services only (api/web/worker/run-task;
  fetcher/convert/export/collab/egress-proxy keep pins — comment block records the mapping).
  `pulumi preview` → 7 updates, no stateful replace/delete; the only non-template diff was
  pre-existing `-scaling` drift reconciliation on four services. `pulumi up` prod update **123**
  → 7 updated / 148 unchanged, 1m18s.
- **Provenance.** `GET /healthz` on `api.rhema.tools` and `rhema.tools` both report
  `build.gitSha = 8ce4038050d054022a732ee60bd6ccf120d5bc75`; `gcloud run services describe`
  confirms the live images are the `run1` digests (api `3c285362`, web `12bfcfd2`, worker
  `aa610210`) and the worker env now carries
  `WALKTHROUGH_MODEL_KEY_SECRET=projects/rhema-507501/secrets/rhema-prod-anthropic-api-key/versions/latest`.
- **Journeys.** `rhema-journeys --stage prod --steps R4,R7 --paid --expect-sha 8ce4038…` →
  **R4 + R7 both `ready-to-flip`** → `registry.ts` flipped `red→green`. Report + screenshots:
  `docs/build/reports/2026-10-03_RUN.1-journeys/` (R4.png, R7.png, report.json — provenance
  match, zero console errors, zero failed requests).
- **R4 live leg.** The journey's chat turn ran live on prod: run `01M40193G390MZZBP9EVJ0HR4C`
  (`chat_turn`, project `showcase-copy-3`) — queued→completed in ~31 s, 16 credits spent against
  the 40-credit §7.1 cap; Send actionable at 1440×900 and in a real mobile-UA context at
  390×844. Two harness fixes were surfaced by the live leg and shipped in the follow-up
  commit: (a) the turn-status poll must pass the desk's `data-chat-thread` (an empty
  `?thread=` 404'd every poll — the DOM stamps the active thread); (b) the phone probe must
  `scrollIntoViewIfNeeded` before the occlusion assert — the compact composer mounts in-flow
  inside the Page below the fold, so `elementFromPoint` at its center was off-viewport. Both
  were journey-harness bugs, not product defects — the deployed surface behaved correctly.
- **R7 live leg.** The run sheet's scope line resolved to a canonical `resolveScopeGate`
  string on prod, and the co-occurrence invariant held on every mounted run card (no
  `[data-informational]` card on a `waiting_gate` run, no informational card + waiting line).
- **Walkthrough.** `POST /runs/01M3SK62YZST272B35CG12K6TW/walkthrough/retry` → **HTTP 202**
  `{"status":"requeued"}`; `runs.walkthrough` then persisted
  `{status:"ready", model:"claude-haiku-4-5", attempts:1, generatedAt:2026-10-03T04:43:52Z}`
  with a real generated brief — the `walkthrough unconfigured` stub defect is gone under the
  deployed worker. (Bonus: the R4 chat-turn run's own walkthrough also wrote `ready`.)
- **Spend.** Flagged-tenant weekly metered $49.71 → $49.92 = **$0.21** for the whole leg
  (three chat turns @ ~16cr + the walkthrough regen) — far under the $3 bound. The weekly
  spend-guard cap was read first ($49.71 already metered across all prior Stage-B legs this
  week); the leg ran under the no-db attestation path with the operator-measured delta above.

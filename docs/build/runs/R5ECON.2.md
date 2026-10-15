# R5ECON.2 — The `testCheapRoute` intra-tier arm (Haiku-for-Sonnet on `is_test`) (run ledger)

- **Spec:** `docs/tickets/159_R5ECON.2__testcheaproute-arm.md` (manifest row 159, round 5)
- **Normative loads:** `docs/post-spa-disposition-spec.md` §5.2 (REQ-ECON-1/2/3/4/5/10/11/12)
  + §10 rulings (Q-ECON.e ratified — "server default + explicit opt-outs"; Q-ECON.a —
  capCredits re-derivation DEFERRED to the register, out of scope; Q-ECON.b — the
  `model_tier='base'` + `model='haiku'` row shape is acceptable — REQ-ECON-5's join rule covers
  it); `docs/research/r5_b2_tier-routing.md` (the arm shape; opt-out classes)
- **Base:** `stevevitali/r5econ-1-spend-guard-repairs` tip @ `5f3a9e2` (the chain's true head —
  impl `56a1b6d` + closeout `9c2673f` + boundary commit)
- **Branch:** `stevevitali/r5econ-2-testcheaproute-arm` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent
- **Requirement ids stamped:** REQ-ECON-1 · REQ-ECON-2 · REQ-ECON-3 · REQ-ECON-4 · REQ-ECON-5 ·
  REQ-ECON-10 · REQ-ECON-11 · REQ-ECON-12
- **Live stage:** none (deterministic only — no `--paid` leg, no prod write, no deploy; the
  funded-window measurement of the arm is R5ECON.3's window work)
- **Started:** 2026-10-15T18:5xZ · **Closed:** 2026-10-15T19:2xZ
- **PR:** stacked on `stevevitali/r5econ-1-spend-guard-repairs` (opened at close — number below)
- **ci:** pending at closeout (first-read class)
- **Anchor drift noted:** the contract's cited research file `docs/research/r5_b3_cost-regime.md`
  does not exist — the B3 lever/guard design landed as
  `docs/research/r5_b3_lever-guard-design.md` (same drift R5ECON.1 recorded). The contract's
  `packages/model/src/cogs-levers.ts` cite is stale too — the lever module lives at
  `packages/contracts/src/domain/cogs-levers.ts` (the load points, not the code, moved).

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows scoped to this ticket's machinery:
- `D-ECON.2-2..7` (OPEN) — the lever measurement pairs + non-regression legs all need the
  funded window + deployed code; this ticket's arm is exactly what those legs will measure —
  none closeable here (Live stage: none).
- `D-ECON.1-2` (OPEN) — the Quick findings-cap is upstream-input dependent; untouched.
- No new deferral owed: every deliverable is deterministic and lands in-repo.

## Requirements (from the contract)

1. **`CogsLevers.testCheapRoute` (REQ-ECON-1/2/3).** ON ⇒ all four main-context phase classes
   (`research`, `judge`, `generate`, `package`) resolve `claude-haiku-4-5`; honored only on
   `is_test` via `resolveCogsLevers`; frozen into `inputs.cogsLevers` +
   `input_snapshot.cogsLevers`.
2. **Truthful metering (REQ-ECON-4/5).** `usage_records.model` records the SERVED model while
   `model_tier` stays the frozen user-facing tier; tier-grouped rollups join the frozen
   snapshot or read `usage_records.model` — never infer served model from tier label. The
   rollup-read rule lands in code comments + a mixed-row regression test.
3. **Server default (REQ-ECON-10, ratified Q-ECON.e).** `COGS_LEVERS_TEST` env — the
   is_test-scoped default overlay making cheap routing default-on for test-tenant runs incl.
   UI-launched legs; per-leg `testCheapRoute:false` opt-outs override it.
4. **Opt-out pins (REQ-ECON-11).** B19C full-tier `profile_voice` + N6/R4 model-judgment legs
   pin `testCheapRoute:false` in the registry.
5. **Priceability + preflight (REQ-ECON-12).** Every selectable model resolves in
   `MODELS_BY_TIER`, prices under the frozen rate table, and is covered by research-preflight
   pairs.

## Plan

- `packages/contracts/src/domain/cogs-levers.ts` — the sixth lever key; `DEFAULT_COGS_LEVERS`
  carries it OFF; `resolveCogsLevers` gains `testDefaults` (the is_test overlay, layered over
  `defaults` — precedence client → TEST env → main env → DEFAULT) and force-zeros
  `testCheapRoute` off-test regardless of envs; `parseCogsLeversTestEnv` keeps ONLY named keys
  (the overlay never silently re-asserts OFF over adopted main-env arms).
- `packages/engine/src/roster.ts` — `TEST_CHEAP_ROUTE_MODEL = "claude-haiku-4-5"`;
  `buildAgentRoster` gains `cheapRoute` (the four input-scoped judge roles — second-reader,
  fidelity-auditor, gap-analyst, holdout-calibrator — reroute to Haiku; `researcher` keeps its
  per-tier model).
- `packages/engine/src/options.ts` — `buildQueryOptions`: `testCheapRoute` resolves
  `TEST_CHEAP_ROUTE_MODEL` for every phase class, STRICTLY ABOVE the L3 route and the tier
  main; the roster gets `cheapRoute` from the same frozen set.
- `packages/orchestrator/src/internal-api.ts` — `OrchestratorDeps.cogsLeversTest` (the
  `COGS_LEVERS_TEST` binding, documented is_test-only).
- `packages/orchestrator/src/runspec.ts` — the scoped second-reader launch + its
  `subagent_launches.model` row name the SERVED model under the frozen lever (Haiku ON,
  `mainModelForTier` OFF).
- `apps/api/src/cogs-levers.ts` (new) — `resolveRunCogsLevers`: the ONE shared
  resolution site — reads `workspaces.is_test` (fail-closed on error), layers
  `deps.cogsLevers` + `deps.cogsLeversTest`, honors the client payload on is_test only.
- `apps/api/src/env.ts` + `server.ts` — `COGS_LEVERS_TEST` binds `cogsLeversTest` via
  `parseCogsLeversTestEnv`; `run-routes.ts` now delegates to the helper; `chat-routes.ts`,
  `outline-routes.ts`, `editor-routes.ts`, `voice-routes.ts` (build / update / adopt-reseed)
  wire the SAME helper and freeze both `inputs` + `inputSnapshot` — all 7 `createRun` sites.
- `packages/api-client/src/index.ts` — `ChatTurnRequestDto.cogsLevers` +
  `BuildVoiceDto.cogsLevers` (the pin's wire field).
- `apps/web/src/server.ts` — `cogsLeversField` (the posted JSON-string-or-object field) +
  `str("cogsLevers")` reads on the run sheet / chat-turn / voice-build / update-voice posts —
  the BFF forwards verbatim, never resolves (server-side resolution is authoritative).
- `packages/journeys/src/registry.ts` — `JourneyStep.cogsLevers` pin field +
  `cogsLeversFor(stepId)`; N6, R4, B19C pin `{testCheapRoute:false}`.
- `packages/journeys/src/steps.ts` — `pinCogsLevers(page, stepId, pathRe)`: a Playwright
  route intercept that merges the registry pin into the launch POST body (JSON-merge or
  urlencoded-append) — the pin lands at the wire on BOTH renderers; installed on N6's
  `/p/<slug>/run` POST and R4's `/p/<slug>/chat/turns` POST.
- `packages/journeys/src/stb5b.ts` — the B19C leg records the mandatory pin (the leg is a
  pre-registered DROP today; `cogsLeversFor("B19C")` is the read seam whichever driver the
  funded window runs MUST post).
- Served-model truth comments — `apps/egress-proxy/src/metering.ts` (`model` = the
  provider-billed/served id; `model_tier` = the frozen user-facing tier), `handler.ts`'s
  authoritative-response-model-then-requested-model-then-throw chain (pre-existing, now the
  arm's truth source), `packages/db/src/schema/billing.ts`, `packages/ledger/src/usage.ts`,
  `packages/contracts/src/domain/usage.ts`, `apps/api/src/timeline-routes.ts` (group-by keys on
  `u.model` AND `u.model_tier`; the reprice path's `TIER_MODEL` read annotated as the
  tier-priced ESTIMATE basis — never the served-meter read).
- `apps/web/src/dom-contract.ts` — `cogsLevers` declared as a shared `urlparam` hook (the
  journey's wire pin is manifest-declared; the `str("…")` reads are the emitted leg).

## Test matrix

| AC | Test |
|---|---|
| ON reroutes all four phase classes to Haiku, every tier; precedence over L3; judges reroute, researcher stays | `options.test.ts` (per-class × per-tier + L3-precedence rows); `roster.test.ts` (cheapRoute roster variant) |
| honored only on is_test; OFF elsewhere even when envs set it | `cogs-levers.test.ts` (non-test force-off incl. crafted client + env-set ON) |
| frozen into `inputs.cogsLevers` + `input_snapshot.cogsLevers` on every create path | `run-routes.test.ts` + `chat-routes.test.ts` (both columns asserted) |
| `COGS_LEVERS_TEST` defaults ON for test-tenant runs incl. UI-launched; explicit `false` wins | `env.test.ts` (parse arms) · `run-routes.test.ts` + `chat-routes.test.ts` (default-ON / opt-out / non-test refusal) |
| served-model truth: mixed Sonnet/Haiku rows under one frozen tier stay distinct | `usage.test.ts` (L4 read) + `timeline-routes.test.ts` (report `advancedView` buckets) |
| registry pins N6/R4/B19C `{testCheapRoute:false}` | `registry.test.ts` (pin values + the pinned-set census + key allowlist) |
| every arm-reachable model allowlisted + priceable + preflight-covered | `allowlist.test.ts` (per-tier reachable-set + `TEST_CHEAP_ROUTE_MODEL` × both server tools) |
| scoped launches record the SERVED model | `runspec.test.ts` (frozen-ON → scopedLaunch + `subagent_launches.model` = Haiku; frozen-off → tier main) |

## Progress

- 2026-10-15T18:5xZ — ledger seeded; DEFERRALS + spec + anchors loaded; anchor drift recorded
  (`r5_b3_cost-regime.md` → `r5_b3_lever-guard-design.md`; `packages/model` →
  `packages/contracts`).
- 2026-10-15T19:0xZ — implementation landed across contracts / engine / orchestrator / api /
  web / journeys / metering + the regression tests; focused suites green after a stale-`dist`
  rebuild (the workspace imports resolve to built output — `turbo build` first).
- 2026-10-15T19:2xZ — self-review pass clean; full gate green: `turbo build lint typecheck`
  135/135, `pnpm test` 5,732 pass / 4 skip / 0 fail, all six `check:*` gates OK (one
  dom-contract iteration — the journey's wire-level `&cogsLevers=` needed a manifest
  `urlparam` declaration + `str("…")` reads to register the emitted leg).

## Gap table

| Requirement / AC | Verdict | Evidence |
|---|---|---|
| REQ-ECON-1 — ON ⇒ all four phase classes → `claude-haiku-4-5` | met | `packages/engine/src/options.ts:182-189` — `levers?.testCheapRoute ? TEST_CHEAP_ROUTE_MODEL : …` decides the main-context model before the L3 branch and the tier main; `roster.ts:50` the id; `options.test.ts` asserts all four classes on all three tiers. |
| REQ-ECON-1 — the roster's judge-class work routes too | met | `roster.ts:110-120` — `cheapRoute` reroutes the four input-scoped judges (second-reader, fidelity-auditor, gap-analyst, holdout-calibrator); `researcher` keeps its per-tier model (base is already Haiku; the bounded-batch contract is costed separately); `options.ts:209` passes the flag. `runspec.ts:639` — the scoped second-reader launch + its `subagent_launches` row carry the served model (test at `runspec.test.ts` — ON → Haiku, OFF → `claude-opus-5` on the balanced seed). |
| REQ-ECON-1 — cheap route precedes L3 phase routing | met | `options.ts:185-189` — the ternary consults `testCheapRoute` BEFORE `l3PhaseRouting`; `options.test.ts` pins ON+L3 ⇒ Haiku. |
| REQ-ECON-2 — honored only on `is_test` | met | `cogs-levers.ts:104` — `!isTest ⇒ {…defaults, testCheapRoute:false}` (forced OFF even when an env or client sets it); the is_test read in `apps/api/src/cogs-levers.ts:44-47` fails closed (`catch ⇒ false`). Contract test covers crafted-client + env-ON off-test. |
| REQ-ECON-3 — frozen into `inputs.cogsLevers` + `input_snapshot.cogsLevers` | met | All 7 `createRun` call sites resolve via `resolveRunCogsLevers` and write both columns: `run-routes.ts:950,955,982` · `chat-routes.ts:514-515,536` · `outline-routes.ts:437-438,466` · `editor-routes.ts:592,611,618` · `voice-routes.ts:1141,1182,1188` (build) `:1359,1390,1396` (update) `:1816,1838,1840` (adopt/reseed). `runspec.ts:548` strips the key before prompt inputs (pre-existing — frozen controls never reach model-facing text). |
| REQ-ECON-4 — `usage_records.model` records the SERVED model | met | `metering.ts:97` writes the metered `model`; `handler.ts:450-456` — response model authoritative → requested-model fallback → throw-never-silent (I2, pre-existing chain the arm rides); comments at `metering.ts:64-68` + `billing.ts:31-36`. |
| REQ-ECON-5 — `model_tier` stays the frozen user-facing tier | met | `metering.ts:101` `modelTier: ctx.modelTier` — verbatim, never rewritten by routing; `Q-ECON.b` ruled the `tier='base'`+`model='haiku'` shape acceptable. |
| REQ-ECON-5 — tier-grouped rollups join the snapshot or read `usage_records.model` | met | `timeline-routes.ts:686` `group by s.phase, u.role, u.subagent_label, u.model, u.model_tier` (both keys; the comment names the collapse lie each side alone would commit); `usage.ts` L4 selects both columns; the reprice path's `TIER_MODEL[tier]` annotated as the tier-priced-estimate basis (`timeline-routes.ts:900-902`), never a served-meter read; mixed-row regressions in `usage.test.ts` + `timeline-routes.test.ts`. |
| REQ-ECON-10 — `COGS_LEVERS_TEST` is_test-scoped default incl. UI-launched legs | met | `env.ts:304-310` binds via `parseCogsLeversTestEnv` → `server.ts:486` `cogsLeversTest` → `internal-api.ts:153` → `resolveRunCogsLevers` (all 7 create paths incl. the chat-turn + voice-build UI legs). Overlay semantics: only named keys layer (`cogs-levers.ts:133-151`) — a `{"testCheapRoute":true}` deploy never strips the adopted main-env arms. |
| REQ-ECON-10/11 — explicit per-leg `testCheapRoute:false` wins over the default | met | `resolveCogsLevers` precedence: client → `testDefaults` → `defaults` (`cogs-levers.ts:105-106`); `run-routes.test.ts` (default-ON + posted-false + non-test refusal) + `chat-routes.test.ts` (the turn freezes ON under the overlay, OFF under the posted opt-out, OFF off-test even crafted). |
| REQ-ECON-11 — B19C + N6/R4 registry pins | met | `registry.ts` — `JourneyStep.cogsLevers` + `cogsLeversFor`; N6 `:107`, R4 `:177`, B19C `:677` pin `{testCheapRoute:false}`; `steps.ts:1016-1033` `pinCogsLevers` installs the pin at the wire on both renderers (N6 `/p/:slug/run`, R4 `/p/:slug/chat/turns`); B19C is the mandatory opt-out — declared + documented for the funded-window driver (`stb5b.ts:710-713`); `registry.test.ts` asserts the pinned set is exactly {N6, R4, B19C} and every pinned key is a `CogsLeverKey`. |
| REQ-ECON-12 — selectable models allowlisted + priced + preflight-covered | met | `MODELS_BY_TIER` carries `claude-haiku-4-5` on all three tiers (`allowlist.ts:13-15`); `authorResearchPreflight` pairs = `MODELS_BY_TIER[tier]` × enabled tools (`allowlist.ts:332-348`) — the cheap-route id is covered by construction; `allowlist.test.ts` asserts the arm's whole reachable set (main + `cheapRoute` roster) is allowlisted ∧ `isModelPriceable`, and `TEST_CHEAP_ROUTE_MODEL` × `web_search`/`web_fetch` pairs exist per tier. |
| AC — ON reroutes all four phase classes on is_test; ignored/refused elsewhere (deterministic) | met | the options/roster/contract suites above. |
| AC — debits price the served model; tier-grouped rollups read `model` (deterministic, mixed rows) | met | `usage.test.ts` L4 mixed-row case + `timeline-routes.test.ts` report `advancedView` mixed-bucket case — `model='claude-haiku-4-5'` and `claude-sonnet-5` rows under `model_tier='base'` stay distinct with their own credits. |
| AC — `COGS_LEVERS_TEST` defaults ON for is_test UI-launched runs; explicit opt-out wins (deterministic) | met | `chat-routes.test.ts` — the UI-launched leg freezes ON with no client key, OFF with `testCheapRoute:false`, OFF on a crafted non-test post. |
| AC — verification green; BUILD_INDEX row + LEDGER advanced; operating clauses met | met | turbo 135/135 · vitest 494 files / 5,732 pass / 4 skip / 0 fail · 6/6 check gates · build-memory 0 violations · append-only vs `5f3a9e2` OK · BUILD_INDEX row 187 + PHASE LOG `done` land in the closeout commit. |
| Cross-cutting — no paid legs, no prod writes, no deploys, no live provider calls | met | every leg is vitest/deterministic; `git status` carries only the ticket's files. |
| Out of scope — guard fixes (158), window checklist/drivers (160), capCredits re-derivation (Q-ECON.a) | confirmed absent | no guard SQL touched; no funded-window/driver code touched; `capCredits` still sizes on the TIER estimate — the safe over-provisioned direction per the register. |

## Evidence log

- `pnpm turbo build lint typecheck` → **135/135 tasks** (the first `turbo build` pass caught a
  `Partial<CogsLevers>` readonly-assignment in `parseCogsLeversTestEnv` — fixed via a mutable
  `Record<CogsLeverKey, boolean>` build; the earlier focused-run "failures" were stale-`dist`
  resolution, all green after rebuild).
- Focused: `cogs-levers.test.ts` 17 · `options.test.ts` 21 · `roster.test.ts` 20 ·
  `registry.test.ts` 8 · `runspec.test.ts` 36 · `allowlist.test.ts` 45 · `env.test.ts` 11 ·
  `run-routes.test.ts` 61 · `chat-routes.test.ts`+`timeline-routes.test.ts` 58 ·
  `usage.test.ts` 10 → all pass.
- `pnpm test` → **494 files / 5,732 tests pass, 4 skipped, 0 failed** (incl. the 204 s
  `privsep.docker` leg green).
- `pnpm check:licenses` (822 pkgs) · `check:protocol-markers` (248 files) · `check:no-cookies`
  (257) · `check:spa-budget` · `check:spa-env` · `check:dom-contract` → **all OK**
  (dom-contract needed one iteration: `u("cogsLevers", …)` manifest entry + `str("…")` reads).
- `check-build-memory.sh .` → 0 violations (pre-existing warnings only).
- `check-append-only.mjs --base 5f3a9e2` → OK (run at closeout).

## Evidence report

**PR:** stacked on `stevevitali/r5econ-1-spend-guard-repairs` (url recorded at close).

**Gap walk:** every contract clause + AC resolves `met` with file:line/test evidence (gap
table above); zero `partial`/`missed`, zero MET-DIFFERENTLY (no ADR owed); out-of-scope items
(158 guard fixes, 160 window machinery, Q-ECON.a capCredits re-derivation) confirmed absent.
The one judgment call — `usage_records.model='claude-haiku-4-5'` beside `model_tier='base'`
is load-bearing by design (Q-ECON.b's ratified row shape) and is exactly what REQ-ECON-5's
join rule protects: every rollup that touches tier + model now reads the row's own `model`.

**Verification:** `pnpm install` clean · `turbo build lint typecheck` 135/135 · `pnpm test`
494 files / 5,732 pass / 4 skip / 0 fail · all six `check:*` gates OK · build-memory 0
violations · append-only vs `5f3a9e2` OK · deterministic focus ~280 across the touched
suites. **Not run:** a real paid/cheap-routed leg (the arm ships un-armed — it needs
`COGS_LEVERS_TEST` set, which is a deploy-side env, and any live arm run is the funded
window's; R5ECON.3 owns the dispatch machinery).

**Deferrals:** none opened, none closed (D-ECON.2-2..7 stay OPEN for the funded window —
the arm they will measure now exists).

**ci:** pending at closeout (first-read class).

# R5ECON.2 — The `testCheapRoute` intra-tier arm (Haiku-for-Sonnet on `is_test`)

Manifest row 159 · stacks on `stevevitali/r5econ-1-spend-guard-repairs` · merge policy
**OPERATOR** — do not merge from the build environment · contract
`docs/tickets/159_R5ECON.2__testcheaproute-arm.md` · run ledger
`docs/build/runs/R5ECON.2.md`.

## What lands

The round-5 test-economics routing arm: test-tenant runs can now cut the dominant model
spend — cache-read tokens at ~3× — by resolving the cheap model inside the tier's own
allowlist, without changing one user-facing tier semantic.

- **`CogsLevers.testCheapRoute` (REQ-ECON-1/2/3).** The sixth lever. ON ⇒ every phase class's
  main context (`research`/`judge`/`generate`/`package`) resolves
  `TEST_CHEAP_ROUTE_MODEL = "claude-haiku-4-5"` — strictly **above** the L3 phase-routing
  branch and the tier main (`packages/engine/src/options.ts`). The roster arm reroutes the
  four input-scoped judge roles to Haiku while `researcher` keeps its per-tier model
  (`roster.ts` `cheapRoute`). Scoped launches join it: the second-reader's `scopedLaunch` +
  `subagent_launches.model` now name the SERVED model (`runspec.ts`). The lever is
  **is_test-scoped twice over**: `resolveCogsLevers` force-zeros it on any non-test workspace
  regardless of env or client payload, and `COGS_LEVERS_TEST` is never consulted off-test.
  The resolved set freezes into BOTH `inputs.cogsLevers` and `input_snapshot.cogsLevers` on
  **all 7 `createRun` sites** — routed through the new ONE shared resolver,
  `apps/api/src/cogs-levers.ts` (fail-closed on the is_test read).
- **Truthful metering (REQ-ECON-4/5).** `usage_records.model` was already the
  provider-billed/served id (response model authoritative → requested-model fallback → throw
  rather than silently meter). The arm makes `model='claude-haiku-4-5'` beside
  `model_tier='base'` a lawful row shape (Q-ECON.b ratified) — so the read rule is now written
  down and guarded: tier-grouped rollups group on `u.model` AND `u.model_tier` (timeline
  Level-4 SQL) or carry both verbatim (ledger `usageLevel4`, the report's `advancedView`), and
  never derive one from the other. Comments land at the schema, the meter, the L4 reader, the
  contract row, and the reprice path (`TIER_MODEL` is the tier-priced ESTIMATE basis, never a
  served-meter read). Mixed Sonnet/Haiku regression tests at both the ledger L4 and the report
  `advancedView` levels assert the two models stay distinct with their own credits under one
  frozen tier.
- **Ratified server default (REQ-ECON-10, Q-ECON.e).** New `COGS_LEVERS_TEST` env — an
  is_test-scoped **overlay** (`parseCogsLeversTestEnv` keeps ONLY named keys, so
  `{"testCheapRoute":true}` arms cheap routing without disturbing the main `COGS_LEVERS`
  set). On `is_test` workspaces it defaults the arm ON for every create path — including the
  UI-launched legs that carry no lever key (chat turn, voice build, outline, editor revise,
  run sheet). An explicit per-leg `testCheapRoute:false` still wins (client → TEST overlay →
  main env → DEFAULT).
- **Opt-out pins (REQ-ECON-11).** `JourneyStep.cogsLevers` + `cogsLeversFor` on the registry;
  **N6**, **R4**, and **B19C** pin `{testCheapRoute:false}` — model judgment IS their assert,
  so the arm must never reach them (B19C is the mandatory one: a full-tier `profile_voice`
  build). `pinCogsLevers` is a Playwright route intercept that merges the pin into the real
  launch POST at the wire — the verbatim user path on BOTH renderers; the BFF forwards a
  posted `cogsLevers` field verbatim (`cogsLeversField`) through the run-sheet, chat-turn,
  update-voice, voice-new, and `/v/:persona/build` posts, and the api-client DTOs
  (`ChatTurnRequestDto`, `BuildVoiceDto`) carry it. The web layer never makes the trust
  decision — the api resolves is_test-only, always.
- **Priceability + preflight (REQ-ECON-12).** `claude-haiku-4-5` is on `MODELS_BY_TIER` for
  all three tiers and priceable in the frozen rate table; `authorResearchPreflight` pairs are
  `MODELS_BY_TIER[tier]` × enabled server tools, so the arm's reachable set is covered by
  construction — the allowlist test now asserts the cheapRoute roster variant + the
  `TEST_CHEAP_ROUTE_MODEL` × `web_search`/`web_fetch` pairs per tier.

## What changed

- `packages/contracts/src/domain/cogs-levers.ts` — the sixth key, `testDefaults` resolution +
  the off-test force-zero, `parseCogsLeversTestEnv`; `usage.ts` the L4 row's served-model note.
- `packages/engine/src/roster.ts` + `options.ts` — `TEST_CHEAP_ROUTE_MODEL`, `cheapRoute`
  roster input, the phase-class resolution order.
- `packages/orchestrator/src/internal-api.ts` (`cogsLeversTest` dep) + `runspec.ts` (served
  scoped-launch model).
- `apps/api/src/cogs-levers.ts` (new — the shared resolver) · `env.ts`/`server.ts` (env
  binding) · `run-routes.ts` (delegates to the resolver) · `chat-routes.ts` /
  `outline-routes.ts` / `editor-routes.ts` / `voice-routes.ts` (the remaining six create
  sites, both freeze columns).
- `packages/api-client/src/index.ts` — the two DTO fields.
- `apps/web/src/server.ts` — `cogsLeversField` + `str("cogsLevers")` reads on the five launch
  posts; `dom-contract.ts` — the declared `urlparam` hook.
- `packages/journeys/src/registry.ts` + `steps.ts` + `stb5b.ts` — the pin field, the wire
  intercept, the B19C note.
- Served-model comments — `apps/egress-proxy/src/metering.ts`, `packages/db/src/schema/
  billing.ts`, `packages/ledger/src/usage.ts`, `apps/api/src/timeline-routes.ts`.

## Test plan (deterministic only)

| Contract clause | Test |
|---|---|
| ON reroutes all four classes × all tiers; beats L3; judges reroute, researcher stays | `options.test.ts` · `roster.test.ts` |
| is_test-only — forced OFF on non-test even when envs/clients arm it | `cogs-levers.test.ts` |
| `COGS_LEVERS_TEST` defaults ON for test runs incl. UI-launched; `false` wins | `env.test.ts` · `run-routes.test.ts` · `chat-routes.test.ts` |
| Frozen into `inputs.cogsLevers` + `input_snapshot.cogsLevers` on create paths | `run-routes.test.ts` · `chat-routes.test.ts` |
| Served-model truth under mixed rows | `usage.test.ts` (L4) · `timeline-routes.test.ts` (report buckets) |
| Scoped launch + `subagent_launches.model` name the served model | `runspec.test.ts` |
| N6/R4/B19C pins declared + read | `registry.test.ts` |
| Reachable set allowlisted + priced + preflight-covered | `allowlist.test.ts` |
| Verification green; LEDGER/BUILD_INDEX advanced | `turbo build lint typecheck` 135/135 · `pnpm test` 5,732 pass / 4 skip / 0 fail · all six `check:*` gates OK · build-memory 0 violations |

## Boundaries

No `--paid` leg ran; no prod writes, no deploys, no live provider calls, no secrets. The arm
ships un-armed — it takes a `COGS_LEVERS_TEST` deploy env to default ON, and the funded-window
measurement is R5ECON.3's work. Q-ECON.a (capCredits re-derivation at effective model) stays
on the register — caps still size on the tier estimate, the safe over-provisioned direction.

Requirement ids stamped: **REQ-ECON-1 · REQ-ECON-2 · REQ-ECON-3 · REQ-ECON-4 · REQ-ECON-5 ·
REQ-ECON-10 · REQ-ECON-11 · REQ-ECON-12**.

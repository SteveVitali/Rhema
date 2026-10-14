# R5ECON.2 — The `testCheapRoute` intra-tier arm (Haiku-for-Sonnet on is_test)

- **Sequence:** 159 · **Phase:** round 5 · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 158_R5ECON.1
- **Run:** `implement-spec spec=docs/tickets/159_R5ECON.2__testcheaproute-arm.md`
- **Gate status:** none
- **Live stage:** none
- **Production mutations:** none
- **Size budget:** ~400 changed lines

## Goal
Cut the dominant test-tenant spend (cache-read tokens at ~3×) by routing selected phase classes
to `claude-haiku-4-5` inside the Base tier — via the existing `is_test`-gated `cogsLevers` seam —
with truthful metering and the ratified server-default posture.

## Load
- `docs/post-spa-disposition-spec.md` §5.2 (REQ-ECON-1..5/10/11/12 + the ratified Q-ECON.e server-default ruling)
- `docs/research/r5_b2_tier-routing.md` + `r5_b3_cost-regime.md` (the arm shape; opt-out classes)
- `apps/api/src/routes/run-routes.ts:951-959` (is_test gate + `defaults`), `packages/model/src/cogs-levers.ts:69-76`,
  `allowlist.ts:13` (`MODELS_BY_TIER.base` already contains `claude-haiku-4-5`), `roster.ts:63-69`
  (`PHASE_CLASS_MODELS` — Sonnet-5 in every base cell), `metering.ts` (served-model pricing),
  `billing.ts` (`model` vs `model_tier` columns)
- `packages/journeys/src/registry.ts` (the legs pinning `testCheapRoute:false`)

## In scope — deliverables
1. **`CogsLevers.testCheapRoute`** (REQ-ECON-1/2/3): ON ⇒ all four phase classes resolve
   main-context to `claude-haiku-4-5`; honored only on `is_test`; frozen into `inputs.cogsLevers`
   + `input_snapshot.cogsLevers`.
2. **Truthful metering** (REQ-ECON-4/5): `usage_records.model` records the SERVED model while
   `model_tier` stays the frozen user-facing tier; rollups that group by tier MUST join the
   frozen snapshot or read `usage_records.model` — the rollup-read rule lands in code comments +
   a regression test over the mixed rows.
3. **Server default** (REQ-ECON-10, ratified Q-ECON.e): `COGS_LEVERS_TEST` env — an is_test-scoped
   default making cheap routing default-on for test-tenant runs incl. UI-launched legs; per-leg
   `testCheapRoute:false` opt-outs override it.
4. **Opt-out pins** (REQ-ECON-11): B19C full-tier `profile_voice` + N6/R4 model-judgment legs pin
   `testCheapRoute:false` in the registry.
5. **Priceability + preflight** (REQ-ECON-12): every selectable model resolves in
   `MODELS_BY_TIER`, prices under the frozen rate table, and is covered by research-preflight
   pairs.

## Out of scope
- Guard fixes → 158 · window checklist/driver builds → 160 · capCredits re-derivation (deferred — Q-ECON.a)

## Acceptance criteria
- [ ] `testCheapRoute` ON reroutes all four phase classes to Haiku on an is_test tenant and is ignored/refused elsewhere — tested *(deterministic)*
- [ ] Debits price the served model; tier-grouped rollups read `model` — tested over mixed rows *(deterministic)*
- [ ] `COGS_LEVERS_TEST` defaults ON for is_test UI-launched runs; explicit opt-out wins — tested *(deterministic)*
- [ ] verification green; BUILD_INDEX row + LEDGER advanced; operating clauses met. *(agentic — universal AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-ECON-1 REQ-ECON-2 REQ-ECON-3 REQ-ECON-4 REQ-ECON-5 REQ-ECON-10 REQ-ECON-11 REQ-ECON-12

# R5.B2 — Model-tier resolution and the test-tenant cost lever

**Stream:** B (test economics) · **Researched:** 2026-10-14 · **Ledger rows:** B2

## Key established findings

- **Tier vocabulary is 3-valued and shared**: `MODEL_TIERS = base|balanced|frontier` (`contracts/src/vocab.ts:24`); `modelTierAllowed`/`clampModelTierTo` are contract helpers (`pricing.ts:267-298`). Free plans allow Base only.
- **Tier resolution**: explicit → project default → user pref → rigor notch → plan clamp (`run-sheet/src/surface.ts:267-324`; `server.ts:6502-6527`; `api/src/sheet-context.ts:147-156`). Rigor notch maps quick→base, standard→balanced, full_board→frontier.
- **Tier→model routing**: `PHASE_CLASS_MODELS` (`engine/src/roster.ts:63-82`) puts Sonnet-5 in every Base cell; `MODELS_BY_TIER.base = ["claude-sonnet-5","claude-haiku-4-5"]` (`orchestrator/src/allowlist.ts:12-15`) — **Haiku is already priceable + allowed under the Base label**. The cheapest intra-tier arm needs no allowlist/model plumbing, only a phase-model override.
- **`is_test` is provisioning-derived, server-only** (`ledger/src/test-workspaces.ts`; signup flags `TEST_MAILBOX` plus-tag addresses, `api/src/signup.ts:191-196`); excluded from SLO/trial ceilings; auto-purged ~26h.
- **A test-only override seam already exists**: `resolveCogsLevers({client, isTest})` (`run-routes.ts:944-959`, `contracts/src/domain/cogs-levers.ts:64-75`) — client `inputs.cogsLevers` honored only on `is_test`, stripped elsewhere (same precedent as ADR-026 `force_unverified`). **Adding an arm requires only a new lever key + an engine consumer** — transport, freezing, and gating already audited.
- **Debits price the served model, not the tier label**: `meterResponse` costs on the response's actual `model` (`metering.ts:59-110`); `usage_records.model` and `.model_tier` are separate columns (`billing.ts:16-49`). A Base-labelled run routed to Haiku bills at Haiku's rate — REQ-SPEC-32(a) holds by construction.
- **Paid legs already pin `modelTier:"base"` everywhere** (`stb5b-helpers.ts:40,52,64,79,97,108`; contract test `stb5b.test.ts:60-65`). **A blanket test→Base clamp would save $0** — the remaining spend is intra-tier (Sonnet context churn + research fan-out).
- **Five brakes already bound paid legs**: per-leg `STB5B_CAPS` ($1–$15 + $25 total); weekly $5 spend-guard on `usage_records`; ≤300-word fixtures; `inputs.phase` single-phase pins (B16/B17/B18 mechanism); `JOURNEY_FUNDED_STABLE_TAG` one funded tenant.
- **`MAX_USD_PER_RUN` is an inner SDK brake** (`runspec.ts:343-344`); prod's $100/run brake is irrelevant to legs — `capCredits` (1.5×estimate) is the hard ceiling enforced at the proxy.

## Cheap-lever ranking (assessed)

1. Already at floor: quick + base + phase-pin + ≤300-word fixtures + funded tenant.
2. **New `is_test`-gated routing arm** riding the `cogsLevers` seam — e.g. research/package phase-classes → `claude-haiku-4-5` on test runs. Zero user-visible change; meter/debit stay truthful. Needs a lever key + a `PHASE_CLASS_MODELS`-adjacent override in `options.ts`/`roster.ts`.
3. **`inputs.phase` pin** is the biggest existing per-leg lever — promoting more legs to pinned shapes beats any model swap.
4. No canned-provider seam reaches production (`QueryFn` injection is engine-unit-test-only); journey legs drive the deployed api/worker, and a $0 run defeats legs that assert metered rows.

## Caveat

B19C (`registry.ts:619-627`) is a full-tier `profile_voice` pre-registered $15 drop — legs whose assert object *is* the tier must be excluded from any routing arm (opt-in via frozen `inputs.cogsLevers`, never tenant-wide).

## Spec requirements emitted

- **REQ-ECON-1** — Any test-tenant routing arm rides the `is_test`-gated input seam (`resolveCogsLevers` precedent); overrides stripped elsewhere.
- **REQ-ECON-2** — Rerouted runs still freeze user-facing `model_tier` + `rateTableVersion`; `usage_records.model` records the served model — debits equal metered burn.
- **REQ-ECON-3** — Every arm-selectable model id must be on `MODELS_BY_TIER` allowlist + priceable under the frozen rate table.
- **REQ-ECON-4** — Never apply to legs whose assert object is the model/tier itself; opt-in per leg.
- **REQ-ECON-5** — Rollups that group by `model_tier` must join the frozen input snapshot or read `usage_records.model`, never infer served model from tier label.

## Open questions for the Q-register

- Q-ECON.a: Should cheap-routed runs also shrink `capCredits` (re-derive estimate at effective model)? Adds a second estimate path but lets fresh 150-cr test pockets clear paid legs without `JOURNEY_FUNDED_STABLE_TAG`.
- Q-ECON.b: Is `model_tier='base'` + `model='haiku'` an acceptable semantic, or should a `routed` marker column / `cogsLevers` join annotate it? (Honest today; downstream attribution caveat per REQ-ECON-5.)
- Q-ECON.c: Confirm `JOURNEY_FUNDED_STABLE_TAG` mailboxes match the `TEST_MAILBOX` plus-tag rule so `cogsLevers` is reachable from mint bodies.

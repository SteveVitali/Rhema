# R5.B3 — Lever + guard design: the regime the funded window opens under

**Stream:** B (test economics) · **Researched:** 2026-10-14 · **Ledger rows:** B3

## Established findings

- **F1** — Per-leg caps are *declared, never enforced*: `finishLeg` writes `capUsd`/`meteredUsd` to evidence (`stb5b.ts:243`) but no assert compares them; only a construction test checks `caps>0 && Σ≤$25` (`stb5b.test.ts:36-43`). Measured overruns (N11 $5.72 vs $4 nominal; CITE $3.31–$8.45) pass silently today.
- **F2** — Weekly guard fails OPEN without `JOURNEY_DATABASE_URL` (`cli.ts:141-147` → `spend-guard.ts:36-38` "no-db attestation"); correct for scheduled CI, wrong for operator `--paid` runs. `funded-window.mjs:67-71` exits 3 without a DSN — the funded-window posture is right, the weekly path isn't.
- **F3 — new defect** — `seedDeliveredRunReport` (`db/src/seed/showcase.ts:675-725`) writes five `source='proxy'` `usage_records` rows at `list_cost_usd=(credits/1000)*3` → **≈$12.33 fictional spend per seed**; both guards sum `is_test ∧ source='proxy'` unfiltered → one R6F leg exceeds the $5 weekly cap on fiction. Also resolves B1's `model='base'` mystery: `meterResponse` cannot emit a tier label (`rateForModel` throws `UnknownModelError`); those rows are seed writes.
- **F4** — The lever-freeze seam is plumbed end-to-end; a new `CogsLevers` key is ~3 files (`cogs-levers.ts:16-46` field+keys+defaults, one consumer branch).
- **F5** — Haiku-for-main-context prerequisites all green: on every tier's allowlist, priced in `RATE_TABLE_V1` ($1/$5 + 0.1× cache-read), `authorResearchPreflight` already probes it (`allowlist.ts:332-347`). ~3× cut on the dominant cache-read class.
- **F6** — Tripwire inventory: missing/non-bypass DSN → exit 3; cumulative ≥ round cap → exit 3; `--headroom` crossing → exit 3; weekly ≥$5+$3 headroom → exit 3; unpriceable model → `UnknownModelError` mid-meter; per-run 402 at cap; **per-leg cap overrun → NOTHING (recorded, not enforced)**.

## Ranked levers

1. **Seeded artifacts for riders** — order-of-magnitude, but gated by REQ-ECON-6 (seed rows pollute the meter).
2. **Intra-tier Haiku routing arm** via `inputs.cogsLevers.testCheapRoute` — ~3× on cache-read class (~85% of spend); opt-in per leg, opt-out mandatory for B19C (and candidate legs N6/R4 where model judgment IS the assert).
3. **Phase-count reduction** via `inputs.phase` pins — order-of-magnitude where assert permits.
4. **Per-leg caps re-derived + enforced** — marginal as saver, critical as tripwire (REQ-ECON-7).
5. Fixture sizing — marginal (cache-read churn dominates, not doc words).
6. Deterministic providers — unreachable in prod (engine-unit-test-only seam); seeded artifacts are the reachable form.

## The window-opening checklist (REQ-ECON-9)

System-role DSN bound + `pg_roles` probe → cumulative < round cap (re-authorize the number — $145.95 already consumed against the stale $150) → `--headroom <legCap>` REQUIRED per dispatch → per-leg `meteredUsd ≤ capUsd` enforced at leg close → ordering T9 first, launchers, riders, B19C last-and-conditional → funded tenant via `JOURNEY_FUNDED_STABLE_TAG` + purge exemption → REQ-ECON-6 seed-marker exclusion live before any seed leg.

## Re-derived per-leg caps (measured +~40% headroom, floor $0.50)

B16 $0.50 · B17 $1.00 · B18A $1.00 · B18B $1.00 · B19A $3.50 · B19B $1.50 · B19C $15.00 · N5 $9.00 · N6 $6.00 · N11 $6.50 · R4 $0.50 · R6 $4.50 · R9 $0.50 (rides window deliveries) · CITE probes $9.00/probe.

## The Haiku arm's concrete shape

`testCheapRoute: boolean` in `CogsLevers`; ON ⇒ all four phase classes resolve main-context to `claude-haiku-4-5`; consumed at `options.ts:181-183` (+`buildAgentRoster` override for judge-cell subagents; `runspec.ts:636` scoped-launch). Frozen into `inputs.cogsLevers` + `input_snapshot.cogsLevers`. apiFetch-built legs set it directly; **UI-launched legs (N5/N6/R6/R9/N11) need an is_test-scoped server default** — `COGS_LEVERS_TEST` env → `resolveCogsLevers({defaults})` — making cheap-by-default on test tenants with `testCheapRoute:false` opt-outs.

## Spec requirements emitted

REQ-ECON-6 (seed rows carry exclusion marker; guards filter) · REQ-ECON-7 (per-leg cap enforced at close, distinct cap-overrun verdict) · REQ-ECON-8 (`--paid` fails closed without system DSN) · REQ-ECON-9 (window declaration: cap/epoch/caps/headroom; `--headroom` required) · REQ-ECON-10 (arm freezes into inputs+snapshot; rollups read served model) · REQ-ECON-11 (arm models on allowlist + priceable + preflight-covered) · REQ-ECON-12 (tier-assert legs pin arm off) · REQ-ECON-13 (entitlement runs count toward guards pending Q-ECON.d).

## §Q additions

- Q-ECON.d — do `source='proxy'` rows on Included/entitlement runs (N5) count toward guards? (rec: yes)
- Q-ECON.e — Haiku arm posture: per-leg opt-in vs is_test server default (rec: server default + opt-outs)
- Q-ECON.f — round envelope re-authorization (levers estimate ~$20–40/window vs $150 stale bound)
- Q-ECON.g — T16 substrate: seeded `persona_profiles` vs B19C-first ordering
- Q-ECON.h — CITE probe caps: raise to measured or reshape probes

## Parent actions

- REQ-ECON-6 seed-pollution is a live defect: the first week R6F seeds on prod it will silently fire the weekly guard. Manifest row + DEFERRALS cross-ref.
- B1's `model='base'` open question is answered here (F3) — cross-reference amended in r5_b1_spend-audit.md.

# R5ECON.1 — Spend-guard defect repairs: seed exclusion, cap enforcement, fail-closed paid dispatch

Manifest row 158 · stacks on `stevevitali/navc-4-nav-acceptance-legs` · merge policy
**OPERATOR** — do not merge from the build environment · contract
`docs/tickets/158_R5ECON.1__spend-guard-repairs.md` · run ledger
`docs/build/runs/R5ECON.1.md`.

## What lands

Paid-journey economics become trustworthy and fail-safe. Three defects repaired:

- **Seed pollution (REQ-ECON-6 / B3-F3 / O2-F11).** The delivered-report fixture writes five
  `usage_records` rows (~$12.33 of fictional `list_cost_usd` per seed) under
  `source='proxy'` — the meter of record — and both guards summed them as real spend. The
  funded-window cumulative was worse: `sum(list_cost_usd) from usage_records where ts >= $1`
  counted **all** tenants and **all** sources, operator spend included. Now
  `JOURNEY_SEED_USAGE_REQUEST_PREFIX = "req_jrn_"` (`@rhema/db`) is the marker contract, and
  **every** guard query consumes the ONE shared scope fragment
  `FLAGGED_PROXY_SPEND_SCOPE` = flagged test tenants ∧ `source='proxy'` ∧ `provider_request_id
  NOT LIKE 'req_jrn_%'` — the weekly ISO-week guard, the funded-window weekly arm, **and** the
  funded-window cumulative (pinned to the same scope, closing O2-F11), plus the per-leg meter
  that feeds the cap assert. `source='seed'` rows are excluded by construction (the scope
  pins `source='proxy'`). The scope is deliberately bucket-blind (Q-ECON.d, ratified —
  REQ-ECON-13): entitlement/Included proxy spend is real provider spend and counts.
- **Declared caps now enforce (REQ-ECON-7/9 / B3-F1/F6).** `capUsd`/`meteredUsd` were recorded
  in leg evidence but never compared. `finishLeg` now calls `assertLegCapUsd` before the owed
  arm: a leg metering over its declared cap throws `CapOverrunError`, which the runner
  classifies as the distinct **`cap_overrun`** verdict (never `owed`, never `fail`, whatever
  the step's expected color), fails the run, and **pauses the funded window** — every later
  step in the dispatch skips, and `funded-window.mjs` drops
  `<stateDir>/funded-pause.json`, which refuses all further dispatches until the operator
  re-authorizes and removes it. `--headroom <legCapUsd>` is now **required** on every paid
  dispatch (both `rhema-journeys --paid` and `funded-window.mjs`; missing → exit 3, malformed
  → exit 2) and pre-flights `measured + legCap ≤ bound` — the weekly cron passes its standing
  `$3` explicitly via `journeys.yml`.
- **Fail-closed operator posture (REQ-ECON-8/13 / B3-F2).** `rhema-journeys --paid` without a
  bound `JOURNEY_DATABASE_URL` used to run the no-db attestation for any caller. Now
  `paidDispatchPreflight` refuses (exit 3) off the cron path, naming `JOURNEY_DATABASE_URL`,
  the system-role requirement, and the FORCE-RLS $0 blindness (D-STB.5b-1). The **one**
  exception is the scheduled self-bounding cron (`GITHUB_EVENT_NAME=schedule`), which cannot
  reach the private DB and bounds itself to one paid leg/week — a manual `workflow_dispatch`
  paid run is an operator run and now refuses without the DSN (intended).
- **BL-72 docs.** `packages/journeys/README.md` gains the system-DSN convention section: the
  DSN rule and the `pg_roles` probe, the seed-marker scope, the `cap_overrun` pause contract,
  the cron exception, and the $0 read path (`funded-query.mjs`, `begin read only … rollback`).

## What changed

- `packages/db/src/seed/showcase.ts` — `JOURNEY_SEED_USAGE_REQUEST_PREFIX` export; seed insert
  builds request ids from it; re-exported from `@rhema/db`.
- `packages/journeys/src/spend-guard.ts` — `SEED_SPEND_EXCLUSION_SQL`,
  `FLAGGED_PROXY_SPEND_SCOPE`, `CapOverrunError`; weekly query consumes the shared scope.
- `packages/journeys/src/stb5b-helpers.ts` + `stb5b.ts` — `assertLegCapUsd`; `finishLeg` takes
  `meteredUsd` explicitly and enforces before the owed arm; `runSpendUsd` applies the seed
  exclusion.
- `packages/journeys/src/runner.ts` — `cap_overrun` StepOutcome; classification ignores
  expected color; the in-process window pause; `passed` covers the verdict.
- `packages/journeys/src/cli-flags.ts` + `cli.ts` — `parseUsdFlag`, `paidDispatchPreflight`;
  headroom required on paid dispatch; the leg cap pre-flights the weekly bound; `CAP!` print.
- `scripts/live/funded-window.mjs` — `--headroom` required; cumulative query pinned to the
  shared scope; the `funded-pause.json` sentinel (write on overrun, refuse while present).
- `.github/workflows/journeys.yml` — the weekly paid cron passes `--headroom 3`.
- `packages/journeys/README.md` — the BL-72 system-DSN / $0-read-path section.
- Tests: `spend-guard.test.ts`, `stb5b.test.ts`, `runner.test.ts`, `cli-flags.test.ts`,
  `showcase.test.ts` (+marker assertion), and new `scripts/live/funded-window.test.mjs`
  (source-pin contract — the unscoped `from usage_records where ts >=` arm can never return).

## Acceptance criteria → evidence

| AC | Evidence |
|---|---|
| Seeded `req_jrn_*`/`seed` rows excluded from weekly + cumulative; unflagged tenants excluded from cumulative | `spend-guard.test.ts` pins `FLAGGED_PROXY_SPEND_SCOPE` on the weekly SQL; `funded-window.test.mjs` pins BOTH funded queries on the shared scope and bars the unscoped-sum shape; `showcase.test.ts` asserts every seeded row's `provider_request_id` matches `^req_jrn_` |
| Leg exceeding `capUsd` → `cap_overrun` + window pause | `stb5b.test.ts` `assertLegCapUsd` (over/under/unmeasurable/undeclared); `runner.test.ts` — overrun on red and green steps → `cap_overrun`, `passed:false`, all later steps `skipped` with the pause reason |
| `--paid` without the system DSN refuses; cron keeps no-db attestation | `cli-flags.test.ts` `paidDispatchPreflight` table; live smoke: `node dist/cli.js --steps N2 --paid` → exit 3 with the named refusal; schedule + no `--headroom` → exit 3; malformed → exit 2 |
| Verification green; LEDGER/BUILD_INDEX advanced | `turbo build lint typecheck` 135/135 · `pnpm test` 5,711 pass / 4 skip / 0 fail · all six `check:*` gates OK · build-memory 0 violations |

## Boundaries

No `--paid` leg ran (only refusal paths were exercised — they exit before any network work);
no prod writes, no deploys, no secrets. `testCheapRoute` (R5ECON.2) and the window-open
checklist/drivers (R5ECON.3) are out of scope and absent.

Requirement ids stamped: **REQ-ECON-6 · REQ-ECON-7 · REQ-ECON-8 · REQ-ECON-9 · REQ-ECON-13**.

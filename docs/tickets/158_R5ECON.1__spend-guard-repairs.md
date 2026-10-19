# R5ECON.1 — Spend-guard defect repairs (seed pollution, cap enforcement, fail-closed)

- **Sequence:** 158 · **Phase:** round 5 · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 157_NAVC.4
- **Run:** `implement-spec spec=docs/tickets/158_R5ECON.1__spend-guard-repairs.md`
- **Gate status:** none
- **Live stage:** none
- **Production mutations:** none
- **Size budget:** ~400 changed lines

## Goal
Make the spend guards measure real spend: exclude seeded fiction from every guard query, enforce
the declared per-leg caps, and fail closed when an operator `--paid` run lacks the system DSN.

## Load
- `docs/post-spa-disposition-spec.md` §5.1/§5.3/§5.4 (REQ-ECON-6/7/8/9/13) + §1 (the two guard defects)
- `docs/research/r5_b3_cost-regime.md` (seed-pollution mechanics + the guard SQL enumeration)
- `apps/api/src/showcase.ts:709-723` (seeder writing `source='proxy'` `req_jrn_report_*` rows ≈$12.33/seed)
- `packages/journeys/src/spend-guard.ts:36-38,61-67` + `funded-window.mjs:82-91` (weekly — filtered) **and :87-91 (cumulative — UNFILTERED: no `is_test`/`source` — the second defect)** + `cli.ts:141-147` (the no-DSN substitute) + `stb5b.ts:236-243` (capUsd recorded, never asserted)
- `packages/journeys/src/runner.ts` (leg-close ordering)

## In scope — deliverables
1. **Seed exclusion (REQ-ECON-6):** seeder usage rows carry an exclusion marker (the existing
   `req_jrn_` `provider_request_id` prefix or `source='seed'`); EVERY guard SQL excludes them —
   `spend-guard.ts` weekly, `funded-window.mjs` weekly AND cumulative. The cumulative query is
   additionally pinned to flagged-tenant `source='proxy'` scope matching the weekly query —
   closing the O2-F11 unfiltered-sum defect.
2. **Cap enforcement (REQ-ECON-7/9):** `finishLeg` asserts `meteredUsd ≤ capUsd`; overrun is a
   distinct `cap_overrun` verdict that pauses the funded window (not a silent pass).
   `--headroom <legCap>` required on paid dispatch.
3. **Fail-closed operator posture (REQ-ECON-8/13):** `--paid` dispatch without a system-role
   `JOURNEY_DATABASE_URL` exits non-zero with the DSN requirement named; the no-db attestation
   survives ONLY on the scheduled self-bounding cron path.
4. **BL-72:** the system-DSN convention doc lands (journeys README/runbook + $0 read path).

## Out of scope
- The `testCheapRoute` arm → 159_R5ECON.2 · window-open checklist + drivers → 160_R5ECON.3

## Acceptance criteria
- [ ] Unit tests: seeded `req_jrn_*`/`seed` rows excluded from weekly + cumulative sums; unflagged-tenant spend excluded from the cumulative query *(deterministic)*
- [ ] A leg exceeding `capUsd` yields `cap_overrun` + window pause — tested *(deterministic)*
- [ ] `--paid` without the system DSN refuses; the cron path keeps no-db attestation — tested *(deterministic)*
- [ ] verification green; BUILD_INDEX row + LEDGER advanced; operating clauses met. *(agentic — universal AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-ECON-6 REQ-ECON-7 REQ-ECON-8 REQ-ECON-9(enforcement/headroom half) REQ-ECON-13

# R5ECON.3 — Funded-window regime + driver-build prerequisites (run ledger)

- **Spec:** `docs/tickets/160_R5ECON.3__funded-window-regime.md` (manifest row 160, round 5)
- **Normative loads:** `docs/post-spa-disposition-spec.md` §5.3/§5.5/§5.6 (REQ-ECON-9 caps
  verbatim, REQ-FND-6/7/8, the census table) + §10 (Q-ECON.f ratified — ~$60 re-authorization;
  Q-ECON.g ratified — T16 substrate = seed); `docs/research/r5_f1_funded-census.md`;
  `docs/research/r5_b3_lever-guard-design.md` (window checklist + ordering);
  `docs/tickets/166_GATE-R5F__funded-window.md` (the gate's pre-registered thresholds)
- **Base:** `stevevitali/r5econ-2-testcheaproute-arm` tip @ `6dc958b` (the chain's true head —
  impl `5510209` + closeout `791c35f` + boundary commit)
- **Branch:** `stevevitali/r5econ-3-funded-window-regime` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent
- **Requirement ids stamped:** REQ-FND-6 · REQ-FND-7 · REQ-FND-8 · REQ-ECON-9 (caps-in-registry half)
- **Live stage:** none — zero prod writes/deploys/$0: NO paid legs run, NO tenant seeding
  executes, NO real DSNs/keys anywhere. The funded tenant + purge exemption script lands but
  executes under the gate; every new driver is committed, not invoked.
- **Started:** 2026-10-15T20:29Z · **Closed:** TBD
- **PR:** TBD
- **Anchor drift noted (same as R5ECON.1/.2):** the contract cites
  `docs/research/r5_b3_cost-regime.md` — the actual file is
  `docs/research/r5_b3_lever-guard-design.md` (B3's lever/guard design lives there; the window
  checklist + ordering cite reads correctly against it).

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows in this ticket's blast radius:

- `D-P1.11-1` (OPEN) — BL-20 bounded live legs (chat_turn + research_burst, ≤$5). No committed
  driver existed at census time; REQ-FND-7 requires a driver or a named prerequisite. A driver
  (`scripts/live/bl20-legs.mjs`) lands here — execution rides FUNDED.1.
- `D-DEF.1-1` (OPEN) — research_burst `fetch`/`distill` never exercised live; unblock arm (a)
  is a bounded prod rerun with a fetch-decomposable question — the same driver covers it.
- `D-ECON.2-2/-3/-4` (OPEN) — the OFF/ON lever measurement pairs + ON-arm non-regression leg.
  No driver existed; `scripts/live/lever-pair.mjs` lands here — execution rides FUNDED.1.
- `D-ECON.2-6/-7` (OPEN) — cost-card refit/restore: operator-paused, needs admissible
  measurements the lever pairs produce; nothing closeable here.
- `D-RES.3-1` (OPEN) — RES.3 retry-drain is a PRODUCT CHANGE FIRST (protocol checkpointing +
  budget-aware retry gate) before any paid verification leg — the named-prerequisite arm;
  no driver lands, the row names the prerequisite + verification verbatim already.
- `D-RES.1-3` (OPEN), `D-CITE.1-5` (OPEN) — drivers already exist (cite1-leg.mjs /
  citation_completeness read); funded legs, out of scope.
- `D-P1.14-1` (OPEN) — B19C's full profile build: stays owed; the $15.00 cap is declared and
  the leg remains last-and-conditional in the ordering.

## Requirements (from the contract)

1. **Per-leg caps in the registry (REQ-ECON-9).** The §5.3 table verbatim — B16 $0.50 ·
   B17 $1.00 · B18A $1.00 · B18B $1.00 · B19A $3.50 · B19B $1.50 · B19C $15.00 · N5 $9.00 ·
   N6 $6.00 · N11 $6.50 · R4 $0.50 · R6 $4.50 · R9 $0.50 · CITE probes $9.00/probe — basis
   levered-expected with unlevered-measured fallback, floor $0.50. Dispatch validates cap
   presence + headroom.
2. **Round envelope (ratified Q-ECON.f).** ~$60 cumulative cap on the pinned-scope cumulative
   query (`FLAGGED_PROXY_SPEND_SCOPE`, seed exclusions live); `--headroom <legCap>` enforced.
3. **Funded tenant (REQ-FND-8 prep).** `JOURNEY_FUNDED_STABLE_TAG` seeded tenant + purge
   exemption script — lands here, executes under the gate.
4. **REQ-FND-6 consolidations.** T15 rides the window's own waiting_gate (B19A/B hold-arm)
   before seeding; T16 keeps the seeded `persona_profiles` substrate (Q-ECON.g); R9 rides
   window deliveries rather than launching its own pair.
5. **REQ-FND-7 driver builds.** Committed drivers or named prerequisite deferrals for BL-20
   research_burst/chat, the ECON.2 OFF/ON pairs (D-ECON.2-2..4), RES.3 retry-drain (D-RES.3-1).
6. **Window-runner (REQ-FND-8).** `funded-window.mjs` gains checklist ordering + the gate's
   verbatim thresholds as `--dry-run`-checkable assertions.

## Acceptance criteria

- [x] Registry carries the verbatim cap table; dispatch validates headroom + cap presence *(deterministic)*
- [x] Each non-registry paid item has a committed driver or a named prerequisite D-row *(deterministic)*
- [x] `--dry-run` prints the §5.5 checklist as pass/fail rows *(deterministic)*
- [x] verification green; BUILD_INDEX row + LEDGER advanced; operating clauses met

## Plan

- `packages/journeys/src/registry.ts` — `capUsd` on `JourneyStep`; all 21 paid steps declare:
  the 13 §5.3-verbatim figures + the $0.50 floor on the no-own-spend riders (T9, T10–T16).
- `packages/journeys/src/window-plan.ts` (new) — `FUNDED_WINDOW_CAP_USD=60`,
  `CITE_PROBE_CAP_USD=9`, `LEG_CAP_FLOOR_USD=0.5`; census spend classes; `orderWindowSteps`
  (T9 → launchers → riders → B19C last); `planWindowDispatch` (cap presence + required
  headroom = Σ selected paid caps); `windowChecklist` (the §5.5 rows as pure pass/fail
  evaluator).
- `stb5b.ts` — `finishLeg` reads `ctx.step.capUsd` (the registry is the cap authority);
  B19A/B19B gain `JOURNEY_FUNDED_HOLD_GATE` hold + resume so the window can leave a real
  open gate for riders.
- `stb5a.ts` — T15 ride arm: a real open gate on the tenant (the held B19A/B record, then any
  open gate) beats seeding; seed stays the fallback.
- `steps.ts` — R9 ride arm: DB-probe for refundable delivered runs on the tenant (state in
  the refundable set, entitlement_id null, inside REFUND_WINDOW_DAYS, net debits > 0, no
  prior request) before launching; launch covers the shortfall.
- `cli.ts` — paid dispatch refuses when a selected paid step carries no `capUsd`.
- `scripts/live/funded-window.mjs` — `--dry-run` prints the §5.5 checklist; $60 default
  envelope (`FUNDED_WINDOW_CAP_USD`, `FUNDED_ROUND3_CAP_USD` fallback); ordered dispatch;
  funded-tenant + purge-freshness probe.
- `scripts/live/funded-tenant.mjs` — dry-run-first operator script: tenant probe + created_at
  refresh (the purge-exemption arm) + the printed house-grant step; `--execute` required for
  any write.
- `scripts/live/lever-pair.mjs` — ECON.2 OFF/ON pair driver (cite1-leg.mjs seam).
- `scripts/live/bl20-legs.mjs` — BL-20 chat_turn / plan-decision / research_burst driver.
- DEFERRALS.md — dated notes citing the landed drivers on D-P1.11-1 / D-DEF.1-1 /
  D-ECON.2-2..4 and the named prerequisite on D-RES.3-1.

## Test matrix

- `registry.test.ts` — capUsd verbatim table on the 13 named legs; every paid step declares a
  cap ≥ the $0.50 floor.
- `window-plan.test.ts` (new) — ordering classes/order; missing-cap + headroom sums;
  checklist row evaluation incl. fail-closed arms.
- `stb5b.test.ts` — caps read from the registry (not a second table).
- `funded-window.test.mjs` — source pins: --dry-run, $60 default, pinned scope ×2, ordering,
  headroom/DSN/pause semantics, tenant probe.
- `scripts/live/*.test.mjs` — source pins for funded-tenant dry-run-only + driver env seams.

## Progress

- 2026-10-15T20:29Z — run ledger seeded; inspection complete (registry, runner, stb5a/b,
  funded-window.mjs, census, §5.3/5.5/5.6, gate thresholds, DEFERRALS rows).
- 2026-10-15T20:45Z — implementation landed: registry `capUsd` (21 paid rows, §5.3 verbatim +
  the $0.50 floor on the no-own-spend riders); `window-plan.ts` (the $60 envelope, census
  classes, ordering, dispatch plan, the §5.5 checklist evaluator); `finishLeg` reads
  `ctx.step.capUsd` (the registry is the one cap authority; `STB5B_CAPS` is now a derived view);
  B19A/B19B `JOURNEY_FUNDED_HOLD_GATE` hold+resume; T15's real-gate ride arm; T16's seeded
  substrate confirmed (Q-ECON.g); R9's ride-the-deliveries arm; the cli cap-presence pre-flight;
  `funded-window.mjs` rewritten ($60 envelope, `--dry-run` checklist, ordering, summed-cap
  headroom, tenant probe); the three new drivers (`funded-tenant.mjs`, `lever-pair.mjs`,
  `bl20-legs.mjs`); six DEFERRALS notes appended.
- 2026-10-15T20:48Z — verification green: journeys build+lint+typecheck; 242 unit tests pass;
  `--dry-run` captured offline (6/9 checklist rows pass — the DSN-scoped rows fail closed).
- 2026-10-15T20:55Z — repo-wide gate green: `pnpm turbo build lint typecheck` 135/135;
  `pnpm test` 495 files / 5,757 pass / 4 skip / 0 fail; all six `check:*` green; build-memory
  0 violations (three DEFERRALS-table violations self-caught + fixed — a literal `|` inside the
  appended notes broke the row cells; `ARM=off/on` now). Self-review: cap table re-verified
  mechanically against §5.3 (21/21 paid rows, verbatim + floor); ordering re-derived from the
  built artifact (T9 → N5…B19B → R9,T10–T16 → B19C); no secrets in the diff.

## Gap table

| Requirement | Layer needed | Achieved | Status | Evidence |
|---|---|---|---|---|
| §5.3 cap table verbatim on the registry (REQ-ECON-9) | registry rows | `capUsd` on all 21 paid steps: the 13 named figures verbatim + the $0.50 floor on T9/T10–T16; `legCapUsdFor` read seam; `CITE_PROBE_CAP_USD=9` constant for the non-registry probes | met | registry.ts rows; registry.test.ts "§5.3 capUsd verbatim" |
| dispatch validates cap presence | cli + funded-window pre-flight | paid dispatch refuses a selected paid step with no cap ≥ floor (exit 2); funded-window refuses `plan.missingCaps` (exit 3) | met | cli.ts cap block; funded-window.mjs `plan.missingCaps` |
| dispatch validates headroom | funded-window + cli | `--headroom` required (exit 3 absent); must cover Σ selected paid caps (exit 3); weekly cli path unchanged (cron `--headroom 3` for the single-leg weekly is unaffected — presence-only there) | met | funded-window.mjs headroom block; window-plan.test.ts |
| ~$60 cumulative envelope (Q-ECON.f) | funded-window.mjs | `FUNDED_WINDOW_CAP_USD=60` (env-overridable; `FUNDED_ROUND3_CAP_USD` reads as legacy fallback); cumulative < cap + `cum + headroom ≤ cap` refusals retained on the pinned scope | met | funded-window.mjs; funded-window.test.mjs "$60" pin |
| funded tenant + purge exemption script | scripts/live/funded-tenant.mjs | dry-run probe (identity/workspace/is_test/age/balance); `--execute` performs the freshness arm (`workspaces.created_at` refresh — the sweep's real predicate is `is_test ∧ age > TEST_TENANT_PURGE_HOURS`); prints the verbatim `admin-cli house-grant` command | met-engineered — the script lands; execution is gate-pending per the ticket | funded-tenant.mjs (unexecuted — exits 3 without the DSN) |
| T15 rides window gates (REQ-FND-6) | stb5a + stb5b | `ridingOpenGate` probes the tenant for a real open gate (inbox group-1a predicate) — the B19A/B hold substrate — seed only the fallback; B19A/B19B `JOURNEY_FUNDED_HOLD_GATE` hold+resume leaves the gate parked | met-engineered — the mechanism is committed + unit-covered; the live ride is gate-pending | stb5a.ts `ridingOpenGate`; stb5b.ts hold block |
| T16 seeded substrate (REQ-FND-6, Q-ECON.g) | stb5a | already the FIX.1 arm — `seedVoiceProfile` inserts the `persona_profiles` row directly; annotated REQ-FND-6 | met | stb5a.ts T16 comment |
| R9 rides window deliveries (REQ-FND-6) | steps.ts | `ridingRefundTargets` probes for §14.4-eligible delivered runs (refundable state, non-entitlement, inside `REFUND_WINDOW_DAYS`, net debits > 0, no prior request) and launches fresh only for the shortfall | met-engineered — live ride gate-pending | steps.ts R9 block |
| drivers or named deferrals (REQ-FND-7) | scripts + DEFERRALS | `bl20-legs.mjs` (D-P1.11-1 + D-DEF.1-1 fetch/decomposable arm); `lever-pair.mjs` (D-ECON.2-2/-3/-4, is_test fail-closed + frozen-snapshot assert); D-RES.3-1 stays a named prerequisite (product change first — noted) | met | the three scripts; DEFERRALS.md 2026-10-15 notes ×6 |
| `--dry-run` prints §5.5 rows (REQ-FND-8) | funded-window.mjs + window-plan | nine checklist rows (dsn · cumulative · headroom · caps · ordering · tenant · exclusions · optouts · unpaused) printed pass/fail + detail on every run; `--dry-run` exits on the verdict without dispatching | met | `--dry-run` capture below; window-plan.test.ts checklist suite |

No remaining gaps. Live verification is honestly `gate-pending`: no paid leg, tenant seed, or
deploy ran — the regime is mechanically checkable (the deterministic ACs all carry unit/source
pins + the captured dry-run).

## Evidence log

- `pnpm turbo build lint typecheck` — **135/135 green** (journeys tsc -b + eslint included).
- `pnpm test` (repo-wide vitest) — **495 files / 5,757 pass / 4 skip / 0 fail**.
- `pnpm --filter @rhema/journeys build|lint|typecheck` — clean; focused journeys suite
  (15 files / 242 tests) green: registry caps, window-plan 16, stb5b 38, funded-window pins.
- `pnpm check:licenses` · `check:protocol-markers` · `check:no-cookies` · `check:spa-budget` ·
  `check:spa-env` · `check:dom-contract` — **all six green**.
- `check-build-memory.sh` — **0 violations** (8 warnings, all pre-existing legacy rows).
- `node docs/build/tools/check-append-only.mjs --base 791c35f` — (recorded at closeout).
- `node scripts/live/funded-window.mjs --dry-run --headroom 55` (no DSN) — prints the nine §5.5
  rows; 6/9 pass offline (`headroom`/`caps`/`ordering`/`exclusions`/`optouts`/`unpaused`), the
  DSN-scoped rows (`dsn`/`cumulative`/`tenant`) fail closed exactly as the gate requires; the
  run exits 3 — a fail-closed non-dispatch verdict, never a browser launch.
- `node scripts/live/funded-tenant.mjs` (no DSN) → refuses exit 3; `LEVER=bogus`
  `lever-pair.mjs` → exit 2 (`ARM=maybe` likewise 2); `bl20-legs.mjs` without `API_BASE_URL` →
  exit 1 — all fail closed, zero dispatches.

## Evidence report

Deterministic-only run (the ticket declares no live stage): every acceptance criterion carries
a unit test, a source pin, or a captured dry-run transcript. Nothing executed a paid leg,
touched a tenant, or called a provider — the funded-window opens under 166_GATE-R5F with this
machinery reading the live meters.

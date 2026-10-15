# R5ECON.1 — Spend-guard defect repairs: seed exclusion, cap enforcement, fail-closed paid dispatch (run ledger)

- **Spec:** `docs/tickets/158_R5ECON.1__spend-guard-repairs.md` (manifest row 158, round 5)
- **Normative loads:** `docs/post-spa-disposition-spec.md` §1 (the two guard defects) +
  §5.1/§5.3/§5.4/§5.5 (REQ-ECON-6/7/8/9/13) + §10 rulings (Q-ECON.d=yes — entitlement runs
  count; no total-prod-spend ruling ⇒ cumulative pins to flagged-tenant proxy scope);
  `docs/research/r5_b3_lever-guard-design.md` (F1/F2/F3/F6 — the ticket's
  `r5_b3_cost-regime.md` name is stale; recorded as anchor drift)
- **Base:** `stevevitali/navc-4-nav-acceptance-legs` tip @ `4f2d7ee` + orchestrator boundary
  commit `127b64e` (the chain's true head; PR base = navc-4 branch)
- **Branch:** `stevevitali/r5econ-1-spend-guard-repairs` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** implement-spec @ `~/agent-skills` (worktree HEAD recorded at close)
- **Requirement ids stamped:** REQ-ECON-6 · REQ-ECON-7 · REQ-ECON-8 · REQ-ECON-9
  (enforcement/headroom half) · REQ-ECON-13
- **Live stage:** none (deterministic only — no `--paid` leg, no prod write, no deploy; this
  ticket repairs the guard, it does not authorize spend)
- **Started:** 2026-10-15T16:22Z · **Closed:** (pending)
- **Anchor drift noted:** the seeder lives at `packages/db/src/seed/showcase.ts:695-746`
  (`seedDeliveredRunReport`), not `apps/api/src/showcase.ts:709-723` (that file is 640 lines —
  the contract's cite predates the code move); `funded-window.mjs` lives at `scripts/live/`.

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows scoped to this ticket's machinery:
- `D-STB.5b-1` (PARTIAL) — the `pg_roles` fail-closed probe landed under CAP.3; this ticket's
  REQ-ECON-8/13 work extends the same posture to the dispatch surface (no-DSN `--paid`
  refuses off the cron path). Its remaining owed leg — the two-role live re-read on prod —
  needs a live prod DSN read and stays PARTIAL (Live stage: none here).
- `D-CITE.1-2`, `D-ECON.2-2..7`, funded-window rows — all blocked on the operator's funded
  window + deployed code, not on these repairs; none closeable this run.
- No new deferral owed: every deliverable is deterministic and lands in-repo.

## Requirements (from the contract)

1. **Seed exclusion (REQ-ECON-6)** — seeder `usage_records` carry the exclusion marker (the
   existing `provider_request_id` `req_jrn_` prefix; `source='seed'` ruled unnecessary — the
   fixture's rows must read as metered proxy rows for the report's reconciliation arms);
   EVERY guard SQL excludes them: `spend-guard.ts` weekly, `funded-window.mjs` weekly AND
   cumulative; the cumulative query additionally pins to flagged-tenant `source='proxy'`
   scope (closes O2-F11's unfiltered all-prod sum).
2. **Cap enforcement (REQ-ECON-7/9)** — `finishLeg` asserts `meteredUsd ≤ capUsd`; overrun is
   the distinct `cap_overrun` verdict that pauses the funded window (in-process: remaining
   legs skip; cross-invocation: a pause sentinel blocks the next funded dispatch);
   `--headroom <legCap>` required on every paid dispatch (both `rhema-journeys --paid` and
   `funded-window.mjs`; the weekly cron passes its standing $3 explicitly).
3. **Fail-closed operator posture (REQ-ECON-8/13)** — `--paid` without a system-role
   `JOURNEY_DATABASE_URL` exits non-zero naming the requirement; the no-db attestation
   survives ONLY on the scheduled self-bounding cron (`GITHUB_EVENT_NAME=schedule`).
   REQ-ECON-13 (Q-ECON.d=yes): the guard scope counts entitlement/Included spend by
   construction (usage_records rows carry no bucket predicate).
4. **BL-72** — the system-DSN convention doc: journeys README section + the $0 read path.

## Plan

- `packages/db/src/seed/showcase.ts` — export `JOURNEY_SEED_USAGE_REQUEST_PREFIX = "req_jrn_"`
  (the marker contract); the seed insert builds ids from it; comment names REQ-ECON-6.
- `packages/journeys/src/spend-guard.ts` — `FLAGGED_PROXY_SPEND_SCOPE` (the ONE shared SQL
  WHERE fragment: `is_test` + `source='proxy'` + the `req_jrn_` exclusion — REQ-ECON-13's
  bucket-blind scope documented inline); weekly query consumes it; `CapOverrunError` lands
  here (the spend-guard module owns the verdict vocabulary the runner classifies).
- `packages/journeys/src/runner.ts` — `"cap_overrun"` StepOutcome; `CapOverrunError` classifies
  to it regardless of expected color; the run pauses (remaining steps `skipped` with the
  pause reason) and `passed=false`.
- `packages/journeys/src/stb5b-helpers.ts` + `stb5b.ts` — `assertLegCapUsd` (pure, throws
  `CapOverrunError`); `finishLeg` takes `meteredUsd` explicitly and enforces BEFORE the
  owed-class asserts (an overrun is never a silent pass nor a plain owed).
- `packages/journeys/src/cli-flags.ts` + `cli.ts` — `paidDispatchPreflight` (the refusal
  table, unit-tested): `--paid` off the cron path requires a bound `JOURNEY_DATABASE_URL`
  (REQ-ECON-8) AND `--headroom` (REQ-ECON-9); headroom generalizes the standing +$3 preflight;
  `cap_overrun` prints as `CAP!`.
- `scripts/live/funded-window.mjs` — `--headroom` required (exit 3 missing / exit 2 malformed);
  cumulative query pinned to `FLAGGED_PROXY_SPEND_SCOPE` (shared constant from the journeys
  dist — single source for all three guard queries); the funded-pause sentinel
  (`<stateDir>/funded-pause.json`) refuses further dispatches until the operator removes it.
- `scripts/live/funded-window.test.mjs` — source-scan pin (the preview-stack.test.mjs
  pattern): the cumulative query never selects bare `from usage_records` without the join +
  scope; the headroom refusal + sentinel arms exist.
- `packages/journeys/README.md` — the BL-72 system-DSN convention + the $0 read path.
- `.github/workflows/journeys.yml` — the weekly cron passes `--headroom 3` (its standing
  implicit bound, now explicit).

## Test matrix

| AC | Test |
|---|---|
| seeded rows excluded from weekly + cumulative sums | `spend-guard.test.ts`: the weekly SQL carries the `req_jrn_` exclusion inside the shared scope; `funded-window.test.mjs`: both queries consume `FLAGGED_PROXY_SPEND_SCOPE`; `showcase.test.ts`: seed rows write the `req_jrn_` prefix |
| unflagged-tenant spend excluded from cumulative | `funded-window.test.mjs`: the cumulative query joins `workspaces` + carries `is_test`/`source='proxy'` (never bare `usage_records`) |
| leg exceeding capUsd → `cap_overrun` + window pause | `stb5b.test.ts`: `assertLegCapUsd` over/under/non-finite; `runner.test.ts`: impl throwing `CapOverrunError` → outcome `cap_overrun`, `passed:false`, later steps `skipped` with the pause reason |
| `--paid` without system DSN refuses; cron keeps no-db attestation | `cli-flags.test.ts`: the `paidDispatchPreflight` refusal table (operator no-DSN → refuse; schedule → attestation; app-role pool → the existing `pg_roles` refusal in `spend-guard.test.ts`) |
| verification green + closeout | this ledger, the gap table, the evidence report |

## Progress

- 2026-10-15T16:22Z — ledger seeded; spec + anchors loaded; anchor drift recorded
  (`apps/api/src/showcase.ts` → `packages/db/src/seed/showcase.ts`; research filename).
- 2026-10-15T17:0xZ — implementation landed across db/journeys/scripts + workflow + README;
  focused suites green (94 tests); live refusal smokes verified (no paid leg dispatched).
- 2026-10-15T17:4xZ — self-review pass clean; full gate green: `turbo build lint typecheck`
  135/135, `pnpm test` 5,711 pass / 4 skip / 0 fail, all six `check:*` gates OK.
- (closeout pending)

## Gap table

| Requirement / AC | Verdict | Evidence |
|---|---|---|
| REQ-ECON-6 — seeder rows carry an exclusion marker | met | `packages/db/src/seed/showcase.ts:692` exports `JOURNEY_SEED_USAGE_REQUEST_PREFIX="req_jrn_"`; the insert at `:753` builds `provider_request_id` from it (rows keep `source='proxy'` deliberately — the report's reconciliation arms need metered-looking rows; the marker, not the source, is the exclusion key). `source='seed'` is covered by construction: the guard scope pins `u.source='proxy'`, so a seed-sourced row can never enter the sum. |
| REQ-ECON-6 — EVERY guard SQL excludes seeded rows | met | `packages/journeys/src/spend-guard.ts:15` (`SEED_SPEND_EXCLUSION_SQL`) + `:24` (`FLAGGED_PROXY_SPEND_SCOPE`); the weekly query consumes it at `:105`. `scripts/live/funded-window.mjs` consumes the SAME exported fragment in BOTH its queries (iso-week ~:119, cumulative ~:125 — imported from the journeys dist at `:43`). `stb5b.ts:223` `runSpendUsd` (the per-leg meter that feeds the cap assert) applies `SEED_SPEND_EXCLUSION_SQL` too. |
| REQ-ECON-6 — cumulative pinned to flagged-tenant `source='proxy'` scope (O2-F11) | met | `funded-window.mjs` cumulative query now `join workspaces w on w.id = u.workspace_id where ${FLAGGED_PROXY_SPEND_SCOPE} and u.ts >= $1` — identical scope to the weekly arm; the old `from usage_records where ts >= $1` unfiltered sum is gone and pinned against by `funded-window.test.mjs:22-26`. |
| REQ-ECON-7 — `finishLeg` asserts `meteredUsd ≤ capUsd` | met | `stb5b-helpers.ts:38` `assertLegCapUsd` (pure; throws `CapOverrunError`); `stb5b.ts:252` calls it after the evidence write, before the owed arm. Both blind spots fail closed: non-finite metered → owed; undeclared cap → owed. |
| REQ-ECON-7 — overrun is a distinct `cap_overrun` verdict, not a silent pass | met | `spend-guard.ts:32` `CapOverrunError`; `runner.ts:78` adds the outcome; `runner.ts:322-328` classifies it regardless of expected color (never collapses into `owed`/`fail`); `runner.ts:361` fails the run; `cli.ts` prints `CAP!`. |
| REQ-ECON-7 — the overrun pauses the funded window | met | In-process: `runner.ts:180-183` skips every later step with the pause reason (free legs included — the dispatch is dead). Cross-invocation: `funded-window.mjs` writes `<stateDir>/funded-pause.json` on an overrun (:200-215) and refuses at dispatch while the sentinel exists (:91-95) until the operator re-authorizes. |
| REQ-ECON-9 — `--headroom <legCap>` required on paid dispatch | met | `cli-flags.ts` `parseUsdFlag` (malformed → exit 2) + `paidDispatchPreflight` (missing on a paid dispatch → exit 3, REQ-ECON-9 named); `cli.ts:61-69,146-153` wires it; `cli.ts:186` the declared leg cap pre-flights `weeklyMeteredUsd + headroom ≤ capUsd` (replaces the hardcoded +$3). `funded-window.mjs:65-75` requires it identically (missing → 3, malformed → 2) and pre-flights `cumulative + headroom > ROUND3_CAP` (:141). `.github/workflows/journeys.yml:76` passes the cron's standing `$3` explicitly. |
| REQ-ECON-8 — `--paid` without the system-role `JOURNEY_DATABASE_URL` exits non-zero, naming the requirement | met | `cli-flags.ts:104-128` `paidDispatchPreflight` — operator `--paid` with no bound DSN → exit 3; the refusal names `JOURNEY_DATABASE_URL`, `REQ-ECON-8`, `D-STB.5b-1`, and the FORCE-RLS $0 blindness. Live-smoke verified: `node dist/cli.js --steps N2 --paid` → exit 3 with the full refusal (no leg dispatched). |
| REQ-ECON-8 — the no-db attestation survives ONLY on the scheduled cron | met | `cli.ts:149` binds `scheduledCron` to `GITHUB_EVENT_NAME === "schedule"` — a `workflow_dispatch` `paid:true` run is an operator run and now refuses without the DSN (intended fail-closed). The `pg_roles` probe still refuses a bound-but-blind pool (`spend-guard.test.ts`). |
| REQ-ECON-13 — guard scope counts entitlement/Included spend (Q-ECON.d) | met | `FLAGGED_PROXY_SPEND_SCOPE` carries no credit-bucket predicate by construction (documented at `spend-guard.ts:17-23`); `spend-guard.test.ts` pins the fragment contains no `bucket`/`included` term. |
| BL-72 — system-DSN convention doc + $0 read path | met | `packages/journeys/README.md:56-86` — the DSN convention, the RLS $0 blindness, the cron exception, the seed-marker scope, the `cap_overrun` pause, and the read-only `funded-query.mjs` path (verified the script exists and wraps `begin read only … rollback`). |
| AC — seeded `req_jrn_*`/`seed` rows excluded from weekly + cumulative sums; unflagged-tenant spend excluded from cumulative (deterministic) | met | `spend-guard.test.ts` (+2 cases), `funded-window.test.mjs` (+6 source-pin cases incl. the unscoped-sum anti-pattern), `showcase.test.ts` (marker assertion on real seeded rows). |
| AC — a leg exceeding `capUsd` yields `cap_overrun` + window pause (deterministic) | met | `stb5b.test.ts` `assertLegCapUsd` suite; `runner.test.ts` — overrun on red AND green steps → `cap_overrun`, `passed:false`, all later steps `skipped` with the pause reason. |
| AC — `--paid` without the system DSN refuses; the cron path keeps the no-db attestation (deterministic) | met | `cli-flags.test.ts` `paidDispatchPreflight` table (5 cases) + the live exit-3 smoke. |
| AC — verification green; BUILD_INDEX row + LEDGER advanced; operating clauses met | pending closeout | turbo 135/135 · vitest 5,711/5,715 (4 skipped) · 6/6 check gates · build-memory 0 violations. Closeout rows land in the close commit. |
| Cross-cutting — no paid legs, no prod writes, no deploys | met | Only refusal paths were smoke-run (exit 3 before any network work); no DB writes; `git status` carries only the ticket's files. |
| Cross-cutting — append-only / no generated-file edits / no secrets | met | No ADR needed (no MET-DIFFERENTLY verdicts); no secrets anywhere in the diff; protected files untouched. |
| Out of scope — `testCheapRoute` arm (R5ECON.2), window-open checklist/drivers (R5ECON.3) | confirmed absent | No `testCheapRoute` symbol added; the pause sentinel is a stop-sign, not the R5ECON.3 window-open machinery. |

## Evidence log

- `pnpm --filter @rhema/db --filter @rhema/journeys build` → both `Done`.
- Focused: `funded-window.test.mjs` 6 · `cli-flags.test.ts` 17 · `spend-guard.test.ts` 11 ·
  `runner.test.ts` 16 · `stb5b.test.ts` 37 · `showcase.test.ts` 7 → **94/94 pass**.
- Live refusal smokes (built dist; ZERO legs dispatched):
  - `rhema-journeys --steps N2 --paid` (no DSN) → exit 3, refusal names `JOURNEY_DATABASE_URL`,
    the system-role requirement, FORCE-RLS $0 blindness, and the `GITHUB_EVENT_NAME=schedule`
    exception.
  - `GITHUB_EVENT_NAME=schedule … --paid` (no `--headroom`) → exit 3 naming REQ-ECON-9.
  - `… --paid --headroom abc` → exit 2 (misuse).
  - `funded-window.mjs --steps T9` (no `--headroom`) → exit 3; with a staged
    `funded-pause.json` → exit 3 naming the paused window + re-authorization path.
- `pnpm turbo build lint typecheck` → **135/135 tasks**.
- `pnpm test` → **494 files / 5,711 tests pass, 4 skipped, 0 failed** (privsep.docker passed
  clean this run — no flake).
- `pnpm check:licenses` · `check:protocol-markers` · `check:no-cookies` · `check:spa-budget` ·
  `check:spa-env` · `check:dom-contract` → **all OK**.
- `check-build-memory.sh .` → 0 violations (8 pre-existing warnings, none new).

## Evidence report

(pending — completed at Phase 6 with the PR number + head SHA)

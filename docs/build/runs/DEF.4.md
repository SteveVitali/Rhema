# DEF.4 — Ledger integrity closeout + the §14.4 user refund window (run ledger)

- **Status:** STAGE A COMPLETE — Stage B operator-gated (D-DEF.4-1/-2/-3)
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/78_DEF.4__ledger-integrity-refund-window.md` (manifest row 78)
- **Branch:** `stevevitali/def-4-ledger-integrity-refund-window`, stacked on UX.2 `2966dd2`
  (`stevevitali/ux-2-layout-responsive` — `OPERATOR` merge policy, **not merged**).
- **Goal:** money paths conform to §14.4 — the reconcile repair runs under `held >= 0` with no
  manual DDL, fresh environments validate the same constraint prod convalidated, guided-retry
  feedback reaches the scoped second read, and `refundPhases` gains its user-facing caller: a
  7-day refund window, one automatic refund per billing account per UTC calendar quarter, a
  review path for the second request, classes disjoint from `platform_fault:*`, flag-off at
  ship.
- **Spend:** $0 to date (deterministic legs only). Stage B budget: ≤ $3 total (R9 journey on a
  flagged test tenant). Round-3 cumulative entering: **$61.22**.
- **ADRs:** ADR-071 (the §14.4 fairness rule made concrete — eligible states, calendar-quarter
  allowance, terminal-state resume discharge, flag posture), ADR-072 (the reconcile write-order
  mechanism — ledger-append-then-counter-fold), ADR-073 (guidance crosses into the scoped second
  read on the prompt channel only).

## 0 — Context load

- DEFERRALS.md read first (per AGENTS). Rows closed this run: **D-DEF.2-1** (reconcile
  write-ordering — the F4 defect this ticket exists to fix) and **D-P0.15d-2** (`refundPhases`
  live call-site — `requestUserRefund`/`decideRefundReview` are real callers, and `cancelled`
  eligibility covers the cancel-with-partials half). Rows opened: **D-DEF.4-1** (Stage-B deploy
  + R9 journey, operator-gated ≤$3), **D-DEF.4-2** (prod read-only verification — convalidated
  constraint + divergence re-check + leg-G alert wiring), **D-DEF.4-3** (prod go-live ruling —
  flag stays `off`).
- Anchors confirmed at build time:
  - `runs.finished_at` does not exist — the window anchors `runs.ended_at`.
  - Postgres CHECKs cannot be `DEFERRABLE` — the reconcile fix is write-ordering (ADR-072).
  - `resumePausedRun` admits only `waiting_gate` — `completed`/`completed_partial`/`cancelled`
    are terminal, discharging REQ-SPEC-24(6)'s re-debit rule by construction (ADR-071).
  - `refundPhases` (`packages/ledger/src/resume.ts`) is the shared episode: per-phase/bucket net
    refunds keyed on an episode discriminator — the user path and the admin-approve path share
    `user-refund:<runId>`.
  - `admin_actions.action`'s CHECK can't widen under the additive-migration gate — the durable
    `user_refund_requests` table is the audit (RES.2's `trial_restorations` precedent).
  - `systemTxRunner` + `systemExec` are the elevated seams (SEC.1); the user role gets
    SELECT+INSERT on the request table only — review decisions ride the system pool.
- REQ ids stamped: REQ-SPEC-24(1)(6), REQ-SPEC-29/30/31(3)/32, REQ-BILL-3, REQ-BILL-6/9,
  REQ-DATA-17, REQ-DATA-34, REQ-IDE-18, REQ-RUN-14, REQ-ARCH-30/38.

## 1 — Implementation (Stage A)

| # | Change | Files |
|---|---|---|
| D1 | `reconcileBalances` step 1 appends backfill holds as plain ledger inserts (no counter maintenance); step 2 writes each counter ONCE at the post-backfill fold — `held >= 0` on every committed write | `packages/ledger/src/assertion.ts` + `.test.ts` (F4-shape regression under the re-added ACTIVE check) |
| D2 | Migration `0055`: `validate constraint credit_balances_held_nonnegative` (fresh-env parity with prod's convalidated state) + `user_refund_requests` (RLS forced, user role SELECT+INSERT, system/owner holds state transitions, `alerted_at` for send-then-mark, allowance index) + Drizzle `userRefundRequests` | `packages/db/migrations/0055_refund_window.sql`, `src/schema/billing.ts`, `migrate.test.ts`, `rls-catalog.test.ts` |
| D4 | Guided retry reaches the scoped second read: `scopedPromptWithGuidance` appends the predicate-failure text to `query.prompt` in the spec file — never `inputs`, never the mount set, never an event payload | `apps/run-task/src/scoped-phase.ts`, `harness-main.ts`, `scoped-phase.test.ts` |
| D5a | Contracts: `REFUND_WINDOW_MODES` + `parseRefundWindowMode` (fail-closed), `REFUND_WINDOW_DAYS=7`, `USER_REFUND_REASON='user_window'`, request/decision vocabularies, `USER_REFUNDABLE_RUN_STATES`, `refundQuarterKey` (UTC `YYYYQn`), `UserRefundResponseDto`/`RefundWindowBlockDto`, `isUserWindowRefund` | `packages/contracts/src/domain/refund-window.ts` |
| D5b | `requestUserRefund` (tenant tx: lock run → replay verdict → eligibility → serialize the allowance on the account row → `refundPhases` + request row + `cost.refunded`; second-in-quarter → `pending_review`) + `decideRefundReview` (system pool: same episode on approve; deny/nothing-to-refund close honestly; re-decision → `already_decided`) | `packages/ledger/src/refund-window.ts` + `.test.ts` (11 green) |
| D5c | `POST /runs/:id/refund` (flag-gated `refundWindowAdmits`: off ⇒ `refund_closed` 403; `test_tenants` ⇒ `is_test` only; `open` ⇒ all) + report `refundWindow` block present ONLY while admitted — ledger-derived state + credits | `apps/api/src/timeline-routes.ts`, `env.ts` (`REFUND_WINDOW_MODE`), `index.ts`, `server.ts`, `timeline-routes.test.ts` (7 new route tests) |
| D5d | `admin-cli refund-review --request <id> --workspace <id> (--approve|--deny) [--note]` on `SYSTEM_DATABASE_URL` + `RHEMA_OPERATOR_ID` with workspace predicates; stranded-sweep leg G pages ops once per unalerted `pending_review` (send-then-mark on `alerted_at`, system tx, safe-id payload) | `apps/api/src/admin-cli.ts` + `.test.ts`, `packages/orchestrator/src/stranded-sweep.ts` + `.test.ts` (leg G, 17 total) |
| D5e | Web: `requestRefund` client method + `refundWindow` DTO, report CTA on `eligible` only, status lines for `refunded`/`pending_review`/`denied`, plain-form POST at `/p/:slug/r/:runId/refund` (session-scoped, re-reads the report on every outcome — never exposes internals) | `packages/api-client/src/index.ts`, `apps/web/src/{data,pages,server,copy}.ts`, `server.test.ts` |
| D5f | Two-tenant probe: refundable run per tenant, `POST /runs/:id/refund` write leg — own run refunds, foreign run rejected, no marker leaks | `integration/src/two-tenant-probe.ts` + `.test.ts` |
| D6 | Journey **R9** (red, paid, owner DEF.4): two Quick/Base runs on the planted excerpt — leg 1 asserts the control + "Refunded N cr." + exact `/app/usage` spendable movement; leg 2 asserts "sent for review" + no movement | `packages/journeys/src/{registry,steps}.ts`, `registry.test.ts` |

## 2 — Verification (Stage A)

- `pnpm turbo build lint typecheck` — **135/135 green**.
- `pnpm test` — **433 files, 4312 pass / 6 skip** (2 initial failures fixed: Drizzle parity for
  `user_refund_requests`; the additive-lint test's `--newer-than` file list gained 0055).
- `check-additive-migrations.mjs --files 0055_refund_window.sql` — **additive pass**.
- `check-build-memory.sh .` — **0 violations** (8 pre-existing warnings).
- Targeted: `refund-window.test.ts` 11/11; `stranded-sweep.test.ts` 17/17; `server.test.ts`
  103/103 (web); two-tenant probe 1/1 (no findings, incl. the refund-write leg); api refund
  route tests 7/7 (flag-off fail-closed, test_tenants admit/refuse, open refund + ledger rows +
  request row + `cost.refunded` + exact balance move, report block eligibility/day-8 expiry,
  second-request `pending_review` 202 with replay, refunded-replay no-op, 404/401/409 edges);
  admin-cli refund-review tests green (approve/deny/re-decision/missing-flag exits);
  `registry.test.ts` 7/7 with R9 wired.

## 3 — Findings & decisions

- **Probe stderr:** the foreign-ID GET legs log `unlogged_5xx_response` on three detail routes
  (`/responses/:cid/what-changed`, `/review/:runId/dossier`, `/v/:n/diff/:m`) — a `NonErrorThrow`
  500, not a 404/403, on a foreign id. Pre-existing behavior on those routes (unchanged by this
  PR; the probe passed — no marker leak). Candidate hardening for a follow-up, not this ticket.
- **Self-review:** `refundPhases` refunds per-phase/bucket net and only rows that applied count
  toward the episode total; every run-scoped debit carries `phase_id`, so the
  `phase_id is not null` selection is complete for real runs; the `for update of r` lock
  serializes concurrent same-run requests so `unique(run_id)` is belt, not race; the
  billing-account row lock serializes the quarter allowance across different runs on one
  account; the sweep's leg G propagates a throwing sink by design (leg D's pattern — the cron
  logs it and `alerted_at` stays unset for the next pass).
- **Accident recovered mid-run:** `adr-index.sh` was once invoked with `.` and overwrote the
  repo-root `README.md`; restored via `git checkout` and regenerated correctly against
  `docs/adr` (the script's arg is the ADR dir).

## 4 — Deferrals

- **Closed:** D-DEF.2-1 (DONE — ADR-072 + F4 regression), D-P0.15d-2 (DONE — the §14.4 caller,
  covering the cancel-with-partials half via `cancelled` eligibility).
- **Opened:** D-DEF.4-1 (Stage-B deploy + R9 on a flagged tenant, ≤$3), D-DEF.4-2 (prod
  read-only checks — convalidated constraint, divergence re-check, leg-G live wiring),
  D-DEF.4-3 (prod go-live ruling — `REFUND_WINDOW_MODE` stays `off`).

## 5 — Deviations

None beyond the owned decisions — recorded as ADR-071/072/073 (§14.4 fairness rule concrete;
reconcile ordering mechanism; scoped-guidance channel rule).

## 6 — Closeout state

Stage A complete and green. Stage B is operator-gated per the standing ADR-013 path:
deploy + R9 (≤$3) + the prod read-only checks ride D-DEF.4-1/-2; `REFUND_WINDOW_MODE` ships
`off` on prod (the evidence deploy may use `test_tenants`); `open` awaits the product ruling
(D-DEF.4-3). R9 flips `expected: red→green` only on deployed evidence.

# DEF.4 — Ledger integrity closeout + the §14.4 user refund window

- **Sequence:** 78 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** fix
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** UX.2, RES.2, SEC.1, JOURNEY.1
- **Scope (one line):** close the ledger-integrity loose ends (reconcile write ordering under `held>=0`, the 0044 validate parity, the post-repair nightly divergence recheck), pass guided-retry guidance to the scoped second read, and give `refundPhases` a real user-facing caller: the §14.4 completed-run refund window and cancel-with-partials path, built on RES.2's refund plumbing.
- **Spec §§:** 14.4 (the accounting table; REQ-BILL-3; REQ-SPEC-24; fairness rules L10 — "completed-run refunds have a 7-day window, one per quarter without review"), 14.6 (failure states; reconciliation drift), 12.4 (stop / resume), 12.6 (input-scoped subagents; the guided retry), A.9 REQ-SPEC-31 (the platform-fault class)
- **REQ coverage:** REQ-SPEC-24, REQ-BILL-3, REQ-DATA-34, REQ-IDE-18 (cancel-keep-partials half), REQ-DATA-17 (stamp in the PR)
- **Absorbs (backlog):** BL-10 minus the F5 settlement proof (D-DEF.2-1, X-held-check-migration-parity, X-balance-divergence-recheck), BL-11(b) (X-second-read-guidance-ignored), BL-30 (D-P0.15d-2; BILL.2 merged here)
- **Run:** `implement-spec spec=docs/tickets/78_DEF.4__ledger-integrity-refund-window.md`
- **Gate status:** one-off prod data writes (any `recompute-balances --apply` on a still-divergent account) · the refund window going live on prod, which changes what users are charged and needs BL-30's operator product ruling (it ships flag-off, enabled only for JOURNEY.1 test tenants in Stage B) · the validate migration rides the pre-authorized `pulumi up prod` only if it passes the additive-migration lint
- **Live stage:** Stage A: code + tests ($0). Stage B: deploy; the prod checks are read-only ($0); then the refund-window journey on a test tenant, reusing a completed test-tenant run where one exists, else one ≤ 300-word fixture run — ≤$5 metered

## Goal
Money paths do what §14.4 says, including the edge cases. The documented balance repair runs without manual DDL,
fresh environments carry the same `held>=0` constraint state as prod, and the nightly assertion is confirmed clean
after DEF.2's repair (or the remaining divergence is identified). A guided retry of the input-scoped second read
receives its retry guidance without widening its inputs. `refundPhases`, built and unit-tested since P0.11 but with
no caller (D-P0.15d-2, re-confirmed open four times), gets its honest one: a user can refund a completed run within
7 days, once per quarter without review. Platform-fault refunds never count toward that limit, and a refunded
partial that resumes re-debits first.

## Load (read these — do not re-read others)
- Spec §14.4 (the whole section incl. REQ-SPEC-24 (1)(6) and the fairness rules), §14.6 failure-states paragraph, §12.4 stop/resume, §12.6 "Input-scoped subagents" paragraph; A.9 REQ-SPEC-31 row.
- `docs/adr/ADR-015-research-integrity-unverified-delivery.md` (the refund class DEF.4 reuses) + RES.2's ADR / run ledger `docs/build/runs/RES.2.md` (the reason code and helper as landed) + SEC.1's ADR (which pool a route may use).
- `docs/tickets/DEFERRALS.md` rows D-DEF.2-1, D-P0.15d-2; `docs/build/runs/DEF.2.md` §F4 (lines ~176–197: the −897 → 0 repair and the drop/re-add); `docs/build/runs/STB.4.md` C.3 (the standing "1 balance divergence"); `docs/build/runs/DEF.1.md` §6 (the guidance caveat).
- Ledger: `packages/ledger/src/assertion.ts` (`assertBalances` ~36; `reconcileBalances` ~150; backfill append ~245–272; counter upsert ~274–285), `entries.ts` (`applyLedgerEntry` ~48; the counter update ~90–95), `resume.ts` (`refundPhases` ~39, `reDebitRefundedPhases` ~80), `sql-ledger.ts` (`refund` ~247), `assertion.test.ts` ~60–150.
- `packages/db/migrations/0044_ledger_integrity.sql`; `apps/api/src/admin-cli.ts` ~261 (`recompute-balances`); `apps/worker/src/billing-jobs.ts` ~133–141 (nightly assertion → `balance_divergence` alert); `apps/worker/src/ledger-jobs.ts` ~69 + `main.ts` ~433 (`reDebitOnResume`).
- Refund callers today: `packages/orchestrator/src/internal-api.ts` ~1171–1190 and `failRun` ~1600–1625 (failed-run `refund:<runId>` + `cost.refunded`); `apps/api/src/timeline-routes.ts` (`/runs/:id/report` ~529, `/resume` ~694, `/stop` ~763).
- Second read: `apps/run-task/src/harness-loop.ts` ~245–253 (guided retry), `harness-main.ts` ~188–215 (the `scopedLaunch` branch ignores `opts.guidance`), `scoped-phase.ts` `buildScopedPhasePlan` ~86–110; `packages/orchestrator/src/runspec.ts` ~607.

## In scope — deliverables
1. **Reconcile write ordering (D-DEF.2-1; REQ-SPEC-24(1)).** `reconcileBalances({apply:true})` never writes an
   intermediate `credit_balances` row that violates `credit_balances_held_nonnegative`. Today the backfill `hold`
   goes through `applyLedgerEntry`, which increments the counter (−897 + 180 = −717 on prod) before step 2 rewrites
   it. The repair should append the backfill ledger row and land the counter at its post-backfill fold in one write.
   The append-only ledger and the `balance_recompute` audit row are unchanged.
2. **0044 validate parity (X-held-check-migration-parity).** A new migration (the next free number; re-confirm)
   runs `validate constraint credit_balances_held_nonnegative`, so every fresh stage ends with the constraint
   validated, as prod does after DEF.2's manual re-validation. It is a no-op on prod and passes the
   additive-migration lint.
3. **Nightly divergence recheck (X-balance-divergence-recheck).** A read-only prod leg: the worker's nightly
   `balance_divergence` alerts since the DEF.2 repair (2026-09-26), and `assertBalances` read through the system
   pool. If a divergence persists, identify the account and bucket and run the reconcile **dry-run** to get its
   plan. Any `--apply` is operator-paused.
4. **Scoped second-read guidance (BL-11(b); REQ-DATA-17).** On a guided retry, the harness's predicate-failure
   guidance (`harness-loop.ts`, contract-level text) is appended to the scoped query's prompt.
   - The run's `inputs.guidance` (run-scope or standing §6.5 text) never is.
   - The scoped file set stays exactly `[draft]`.
   - The guidance never appears in an event payload, and the protocol prompt never leaves the harness.
5. **The user refund window and cancel-with-partials (BL-30; D-P0.15d-2; REQ-SPEC-24(6); REQ-IDE-18).**
   - **Route.** An authenticated `POST /runs/:id/refund` (beside `/stop`, user pool, RLS-scoped) refunds a
     delivered run's committed phase debits through `refundPhases`, with RES.2's plumbing and a distinct
     user-refund reason code. It emits the whitelisted `cost.refunded` fact.
   - **Eligibility.** Within 7 days of the run's terminal timestamp, with one auto-approved user refund per account
     per quarter.
   - **Over the limit.** A second request lands as a pending review item plus an ops alert. An admin-cli verb
     approves or denies it (system pool, explicit workspace predicate).
   - **What never counts toward the limit:** platform-fault refunds (RES.2's class) and the automatic failed-run
     refunds.
   - **Surface.** The run report gains the affordance: the amount, the rule and the result. It is behind a
     `refundWindow` config flag.
   - **Resume rule.** A refunded partial that later resumes re-debits its refunded phases first, through the
     existing `reDebitOnResume`. Otherwise it can never be resumed, per the ADR.
6. **Deterministic verification.** `turbo build lint typecheck`, `pnpm test`, the licence and protocol-marker
   checks, `check-build-memory.sh .`. SEC.1's two-tenant probe is extended with the new refund read/write route.

## Out of scope
- The F5 settlement live proof, debit mode, cost cards and the admin-key reconcile → **ECON.1**.
- The platform-fault refund class, its reason code, and *Unverified* delivery → **RES.2** (consumed, not redefined).
- Trial-entitlement restore → **ACT.1**. The estimate route's `modelTier` 400 (BL-11(a)) → **EST.1**.
- The run-task image, AppArmor and the scoped runner's hardening → **SEC.3** (it builds on item 4's change).
- The research-burst product ruling (BL-20) → **HUMAN-H7**. Any merge → operator (`mergePolicy: OPERATOR`).

## Acceptance criteria
- [ ] A PGlite fixture plants prod's exact F4 shape: the counter at `held −897` with the constraint `NOT VALID`,
      and the ledger fold at `held −180`. `reconcileBalances({apply:true})` then completes with the constraint
      active, no DDL, counter `held 0`, and `assertBalances` clean. The test fails against the pre-fix ordering.
      *(deterministic)*
- [ ] After all migrations on a fresh database, `pg_constraint.convalidated` is true for
      `credit_balances_held_nonnegative`. Prod's value is read before the deploy and recorded. *(deterministic +
      read-only live)*
- [ ] The nightly-assertion recheck is recorded: either zero divergences since 2026-09-26 with the log evidence, or
      the divergent account/bucket plus a dry-run plan and a `D-DEF.4-n` row awaiting the operator's `--apply`.
      *(agentic, $0)*
- [ ] A second_read guided retry carries the predicate-failure text in the scoped spec's `query.prompt`, while its
      mount set is still exactly `[draft]`. `inputs.guidance` text is absent, and no emitted event contains either
      guidance or prompt text. *(deterministic)*
- [ ] **Refund window.**
  - [ ] Inside 7 days the first request refunds every committed phase: per-phase rows, the user-refund reason code,
        the buckets restored in consumption order, `cost.refunded` emitted. *(deterministic)*
  - [ ] Day 8 → refused. The second request in the quarter → pending review, not refunded. *(deterministic)*
  - [ ] Replaying the request is a no-op (idempotent). *(deterministic)*
  - [ ] Entitlement runs and never-debited runs are ineligible. *(deterministic)*
  - [ ] A platform-fault refund (RES.2's class) and a failed-run refund on the same account leave the user's
        quarterly allowance untouched. *(deterministic)*
- [ ] Refund-then-resume on a stopped partial re-debits the refunded phases **before** any new phase, through the
      cap-clamped debit. Σ debits ≤ cap holds throughout: the REQ-BILL-3 trigger never fires. Alternatively, per the
      ADR, a refunded run is proven non-resumable. *(deterministic — the FakeEngine integration suite)*
- [ ] The refund route and admin verb respect SEC.1's pools: the user route never imports the system pool (the
      lint), and the two-tenant probe returns zero foreign rows for the new route. *(deterministic)*
- [ ] **Stage B (JOURNEY.1 harness; evidence = screenshots + ledger rows):**
  - [ ] A new registry step (proposed `R8 refund`, owner DEF.4) turns green on prod for a flagged test tenant:
        the run report shows the refund control visible, enabled and unobscured, and "refunded N credits"
        afterwards. *(agentic)*
  - [ ] The balance moves by exactly N. The second request reads "sent for review". *(agentic)*
  - [ ] Total spend ≤ $5 metered. *(agentic)*
- [ ] Deployed provenance equals the chain-tip SHA. D-DEF.2-1 and D-P0.15d-2 are flipped with evidence. *(agentic)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-SPEC-24 (primary: (1) reconcile + nightly assertion, (6) refund-then-resume), REQ-BILL-3 (the cap holds across
refund/re-debit), REQ-DATA-34 (partial keeps delivered debits unless the user refunds), REQ-IDE-18
(cancel-keep-partials half; RES.2 is primary), REQ-DATA-17 (the second read's inputs unchanged by guidance).

## Cross-cutting invariants
- Manifest **6** (a refund never mutates or un-delivers an artifact), **7** (proxy meter of record; Σ debits ≤ cap;
  never silent billing), **10** (no prompt or guidance text in events), **3** (`SECOND_READ_PROMPT` stays protocol
  IP), **5** (the second read receives the draft only), **1** (refund copy in canonical vocabulary).
- Round 3: **REQ-SPEC-29** (the refund surface is accepted by walking it), **REQ-SPEC-30** (user route on the
  user-serving pool; the admin verb on the system pool with a workspace predicate; the probe extended),
  **REQ-SPEC-32** (refunds are the only way committed debits drop below metered burn, and each is a named class).

## Notes
- **Owned decisions (write ADRs):**
  - (a) **How the refund window reconciles with REQ-SPEC-24(6)'s "otherwise only on failed runs".** Cover: which
    run states are eligible (`completed`, `completed_partial`, a stopped run with partials); whether a refunded
    run may resume; whether "a quarter" is calendar or rolling, and per billing account; refunds into a bucket that
    has since expired; the review path. Record it as the §14.4 fairness rule made concrete, never as a relaxation
    of REQ-SPEC-24.
  - (b) **The reconcile write-order mechanism.**
  - (c) **The guidance-into-scoped-prompt rule** (what may cross, and what never does).
- **Why each dependency:** UX.2 is the previous chain row; RES.2 supplies the refund class; SEC.1 the pool split;
  JOURNEY.1 the Stage B harness.
- **Shared decisions consumed:**
  - **RES.2:** the platform-fault reason code and helper. Reuse them; never fork a second refund path.
  - **SEC.1:** the pools and lint.
  - **JOURNEY.1:** the registry format and test-tenant flag.
  - **ECON.1:** the debit mode. Refunds return committed debits whatever that mode is.
- **Anchors to re-confirm at build time:**
  - Postgres CHECK constraints cannot be `DEFERRABLE`, so D-DEF.2-1's "`DEFERRABLE INITIALLY DEFERRED`" option is
    not available and the fix must be ordering.
  - The existing `assertion.test.ts` fixture never plants a negative counter, which is why it stayed green.
  - `runs.finished_at` does not exist (PR-O1). Anchor the 7-day window on the real terminal timestamp.
  - The migration number, because earlier round-3 rows may add migrations.
  - Widening a CHECK vocabulary (e.g. `admin_actions.action`) by drop/re-add must pass the additive-migration lint,
    or the deploy pauses.
- **DEFERRALS rule:** anything not verifiable at build time becomes a `D-DEF.4-<n>` row with its compensating
  control. That includes a persisting divergence awaiting `--apply`, and the refund window's prod go-live awaiting
  the ruling.

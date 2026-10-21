# R6MNY.1 — Money-flip readiness (nothing flips here) — run ledger

- **Spec:** `docs/tickets/181_R6MNY.1__money-flip-readiness.md` (manifest row 181, round 6 —
  Kind: ticket) — `implement-spec`; spec §4.2 `REQ-LCH-5` (a, a′, b–f); runbook
  `docs/ops/debit-mode-flip.md`; LEDGER GATE DECISIONS `GD-LAUNCH-MONEY.R6`
  ("Purchase+metered+refund+trial"), `GD-BL13.R6` ("Keep anchors, metered"),
  `GD-TRIAL-CEIL.R6` ("Keep $50/day"), `GD-PREAUTH-ACTS.R6` (the notice send is R6DEP.1's).
- **Base:** `stevevitali/r6lgl-1-legal-trust-pages` at **local** HEAD `b34fac1` (the R6LGL.1
  orchestrator boundary commit, deliberately unpushed — never reset to `origin/`).
- **Branch:** `stevevitali/r6mny-1-money-flip-readiness` (PR base
  `stevevitali/r6lgl-1-legal-trust-pages`; mergePolicy=OPERATOR — never merge).
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills`
- **Requirement ids stamped:** `REQ-LCH-5`
- **Live stage:** prod READ-ONLY over the IAP tunnel (system-role `postgres` DSN, never the
  app login — STB.5b lesson); the notice dry-run + `cap_calibration_reports`/`cost_card_cells`
  reads; $0.
- **Production mutations:** none. `--send` is never run; the send is a `GD-PREAUTH-ACTS.R6`
  item owned by R6DEP.1.
- **Gate status:** none.
- **Started:** 2026-10-21T08:33Z

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol — AGENTS.md). OPEN rows adjacent to this
ticket: `D-ECON.1-3` (no admissible adopted calibration rows at the prior ECON.1/CAP.2 reads —
this ticket performs the fresh read; the row closes only if the read proves it),
`D-ECON.1-4` (unmeasured cells), `D-ACT.1-3` (the everyone flip — operator-owned, executed by
R6LCH.1; this ticket prepares + tests it, never executes), `D-DEF.4-3` (refund-window `open`
awaits BL-30 — same posture). Rows that stay OPEN unless the fresh prod read discharges them.

## Plan (Phase 1)

AC map: (a) notice copy + new-user explanation + prod dry-run count; (a′) calibration
precondition read + gap record; (b) claim-consistency vs `pricing.json`/estimator incl.
what-it-covers recomputed from measured cost cards; (c) refund copy vs §14.4 math; (d)
$50/day kill switch + 1-concurrent cap under `everyone`; (e) `docs/ops/launch-flips.md`;
(f) launch lint over notice + legal pages.

Design decisions:
- **Coverage figures never over-promise (GD-BL13.R6):** `planCoverageLine` divides included
  credits by the RAW estimator figure (not the card-rounded one) and FLOORS the loop count —
  "≈N" can never exceed what the credits buy.
- **Measured recompute:** a committed read-only integration entrypoint
  (`integration/src/money-flip-readiness.ts` + `scripts/live/` runner) boot-loads
  `estimator_cells` (the measured specs the api/worker run), recomputes each gated plan's
  coverage line through `surfacePricer()`, cross-checks against `cost_card_cells`
  p95 per paid-surface cell, and reads `cap_calibration_reports` preconditions 1–2 —
  aggregate figures only, no PII.
- **everyone-audience tests (d):** `run-routes.test.ts` mutates `PRICING.trial.audience` to
  `"everyone"` inside the test (restored in `finally`) — the config never changes; the arms
  proven are: real workspace claim admitted; paused day → `trial_ceiling` 429; one active
  run → `concurrency_limit` 429.
- **Claim-consistency (b/c):** recomputation tests (never literals) + pins tying the refund
  copy to `REFUND_WINDOW_DAYS`/quarter rule and the notice copy to the metered semantics.
- **Launch lint (f):** `metered-notice` sources join `SURFACE_FILES`; the rendered template
  + the five legal routes' rendered HTML are swept with the claim patterns; the draft banner
  + `approved: false` are pinned.

## Requirements (spec §4.2 REQ-LCH-5)

- (a) verify the metered notice copy vs charge-what-we-meter + the one estimator config; add the
  new-user explanation on the pricing page and run sheet; run the notice **dry-run** on prod and
  record the recipient count; if > 0 record the ≥30-day effective-date critical path.
- (a′) read runbook preconditions 1–2 on prod (`cap_calibration_reports` adopted rows for
  paid-surface cells; in-sample `cap_reach_pct ≤ 10%`); record the gap + what REQ-DISC-1's
  funded wave contributes. An unmet precondition is a finding, never flipped past.
- (b) every pricing, run-sheet and trial claim consistent with `pricing.json` + the estimator —
  incl. "what it covers" recomputed per GD-BL13.R6.
- (c) refund-policy copy matches the §14.4 math.
- (d) a test proving the $50/day kill switch + 1-concurrent cap hold under `everyone`.
- (e) `docs/ops/launch-flips.md` — the four ordered one-line stage-fact diffs, each with its
  verify and its rollback (owned shared decision, consumed by R6LCH.1).
- (f) launch-surface lint extended to the notice and the legal pages.
- Out of scope: flipping anything; sending the notice; pricing changes.

## Acceptance criteria

- [x] dry-run recipient count + calibration precondition read committed, counts only
  *(live-executed)* — `reports/2026-10-21_R6MNY.1/` (`readiness.json`, `prod-readiness-reads.md`)
- [x] claim-consistency tests fail on a hand-edited figure *(engineered)* — `pricing-page.test.ts`
  R6MNY.1 block (recompute + adversarial pricer + no-remembered-figure), `legal-pages.test.ts`
  refund-copy pins, `metered-notice.test.ts` shipped-semantic claims
- [x] kill-switch / concurrency test under `everyone` *(engineered)* — `run-routes.test.ts`
  "the trial gate under `everyone`" (3 tests)
- [x] `launch-flips.md` committed with order + verifies + rollbacks *(engineered)*
- [x] universal phase-gate AC — verification green, REQ-LCH-5 stamped, deferral notes dated,
  protected records append-only, harness in header; CI read below.

## Test matrix (Phase 1.4)

| AC | Planned test | Where |
| --- | --- | --- |
| a | notice copy claims = shipped semantics (metered charge, cap ceiling, refund classes, top-up carry-over); no figure literals | `packages/ledger/src/metered-notice.test.ts` |
| a | new-user explanation rendered on pricing page + run sheet (same claim register) | `apps/web/src/copy.ts` `pricing.meteredNote` + `runSheet.meteredNote`; rendered in `marketing.tsx` + `spa/surfaces/run-sheet.tsx`; swept by the launch lint |
| a′ | prod read emits precondition verdicts, never recommends flipping | `integration/src/money-flip-readiness.ts` + `scripts/live/money-flip-readiness.mjs` (executed 08:46Z) |
| b | coverage lines recompute from RAW estimator figures, floored, hidden under one loop; a different pricer → a different line | `packages/contracts/src/domain/pricing-page.test.ts` R6MNY.1 block |
| b | run-sheet figures ride the one pricer (existing suite retained) | `packages/run-sheet/src/surface.test.ts`, `trial-claims.test.ts`, `public-claims.test.ts` |
| c | refund copy pinned to `REFUND_WINDOW_DAYS`, quarterly allowance, hold/debit semantics, refundable classes | `apps/web/src/legal-pages.test.ts` R6MNY.1 block |
| d | `everyone` audience: real workspace admitted; paused day → 429 `trial_ceiling`; 1 live run → 429 `concurrency_limit` (limit = `PRICING.trial.concurrency`) | `apps/api/src/run-routes.test.ts` R6MNY.1 block |
| e | the doc itself is the deliverable (deterministic content, reviewed) | `docs/ops/launch-flips.md` |
| f | notice sources in `SURFACE_FILES`; rendered notice + five legal routes swept; draft banner pinned while `approved:false` | `packages/security-checks/src/launch-surface.test.ts` |

## Progress

- 2026-10-21T08:33Z — run ledger seeded; anchors loaded (notice runner + template, pricing
  derivation, stage facts, trial gates, calibration store, launch lint, refund window).
- 2026-10-21T08:46Z — prod READ-ONLY legs complete over the IAP tunnel `rhema-prod-proxy-3ms6`
  (system-role `postgres` DSN, read-only, $0; tunnel closed ~08:46:35Z): notice **dry-run
  recipients = 2** → the EFFECTIVE_DATE ≥30-day critical path binds for flip 1 (`--send` is
  R6DEP.1's `GD-PREAUTH-ACTS.R6` item, never run here); `cap_calibration_reports` 0 rows,
  `cost_observations` 199 with **admissible = 0**, `estimator_cells` 0, `cost_card_cells` 46,
  `capFor` null on all five paid surfaces → runbook preconditions 1–2 **UNMET** — a finding,
  never flipped past. Evidence: `docs/build/reports/2026-10-21_R6MNY.1/`
  (`prod-readiness-reads.md` + `readiness.json`).
- 2026-10-21T12:49Z — **crash-resume** (previous worker died ~08:47Z after the prod reads,
  mid-DEFERRALS-notes; nothing had been run since the edits). Inherited WIP verified present
  and kept: the four-file diff audit shows AC (a) copy + notice-claim tests, (b) the
  raw-figure/floor recompute in `planCoverageLine` + recomputation tests, (c) refund-copy pins
  vs `REFUND_WINDOW_DAYS`/quarter rule, (d) the `everyone`-audience kill-switch + 1-concurrent
  HTTP tests, (e) `docs/ops/launch-flips.md` four ordered stage-fact diffs with verify +
  rollback, (f) the launch-lint extension over the notice + legal pages. Resuming at: dated
  DEFERRALS notes → green gate → self-review + gap table → PR/CI → closeout.
- 2026-10-21T13:03Z — dated DEFERRALS notes appended (D-ECON.1-3, D-ECON.1-4 stay OPEN on
  admissible=0; D-ACT.1-3, D-DEF.4-3 dated notes, posture unchanged); `launch-flips.md` flip 1
  now carries the dated UNMET-precondition finding inline. Green gate run:
  `pnpm install --frozen-lockfile` clean; `pnpm turbo build lint typecheck` 135/135; scoped
  suites green (pricing-page 23, metered-notice 5, legal-pages 19, launch-surface 118,
  run-routes 64); repo-wide `pnpm test` **507 files / 5,965 pass / 4 skipped / 0 fail**;
  all six `check:*` gates green (licenses, protocol-markers, no-cookies, spa-env, spa-budget,
  dom-contract).

## Gap table (Phase 4 — spec re-read, diff audited)

| item (spec §) | required layer | achieved layer | status | evidence |
| --- | --- | --- | --- | --- |
| (a) notice copy vs charge-what-we-meter + one estimator | engineered | engineered | met | `metered-notice.test.ts` "every claim in the copy is a shipped semantic" — asserts metered-exact charge, cap-as-ceiling, committed→metered honesty (higher OR lower), refund classes, top-up carry-over, zero figure literals |
| (a) new-user explanation on pricing + run sheet | engineered | engineered | met | `COPY.pricing.meteredNote` rendered in `marketing.tsx` PricingPage; `COPY.runSheet.meteredNote` rendered in `spa/surfaces/run-sheet.tsx` — same claim register as the notice, true under both debit modes |
| (a) prod dry-run recipient count recorded; >0 ⇒ ≥30-d critical path | live-executed | live-executed | met | `reports/2026-10-21_R6MNY.1/prod-readiness-reads.md` — recipients = 2 (08:46Z, system-role DSN, read-only, $0); critical path recorded in `launch-flips.md` step 0 |
| (a′) preconditions 1–2 read + gap + funded-wave contribution | live-executed | live-executed | met | `readiness.json` (`precondition1_met:false`, `precondition2_met:false`); `launch-flips.md` flip 1 carries the dated UNMET finding — never flipped past |
| (b) pricing/run-sheet/trial claims consistent incl. "what it covers" | engineered | engineered | met | `planCoverageLine` recomputes from the RAW estimator figure floored (pricing-page.ts); recompute + adversarial-pricer + no-remembered-figure tests; run-sheet/trial consistency retained in `surface.test.ts`/`trial-claims.test.ts`/`public-claims.test.ts`; prod cross-check vs `cost_card_cells` p95 — no measured cell contradicts (finding: none exist yet for the essay 'm' band) |
| (c) refund copy matches §14.4 math | engineered | engineered | met | `legal-pages.test.ts` — `REFUND_WINDOW_DAYS` figure derived (no other day count), quarterly allowance, hold/debit/release semantics, refundable classes vs `USER_REFUNDABLE_RUN_STATES`, credits-restore only |
| (d) $50/day kill switch + 1-concurrent under `everyone` | engineered | engineered | met | `run-routes.test.ts` — in-process `audience:"everyone"` staging (restored in `finally`); 201 admit + `allow` audit; paused day → 429 `trial_ceiling` + `paused` audit; second POST → 429 `concurrency_limit` (`limit=PRICING.trial.concurrency=1`, `active=1`) |
| (e) launch-flips.md — four ordered diffs + verify + rollback | engineered | engineered | met | `docs/ops/launch-flips.md` — step 0 (notice send, R6DEP.1's `GD-PREAUTH-ACTS.R6` item) + flips 1–4 in the ruled order; flip 1 carries the dated unmet-precondition finding; ordering guarantee stated |
| (f) launch lint over the notice + legal pages | engineered | engineered | met | `launch-surface.test.ts` — `SURFACE_FILES` += `metered-notice.ts` (ledger + integration) + `send-metered-notice.mjs`; rendered notice subject/text/html swept (CLAIM_PATTERNS + `lintGrowthCopy` + never "you will be billed"); all five `LEGAL_PAGES` rendered end-to-end and swept; `data-legal-draft` pinned while `approved:false` |
| prod flips / notice send | live-executed (operator) | engineered | met-engineered(D-ACT.1-3, D-DEF.4-3, D-ECON.1-3, D-ECON.1-4) | out of scope here — prepared + tested only; the flip legs are R6LCH.1's after GATE-LAUNCH |
| out-of-scope (flips, notice send, pricing changes) | — | — | met | nothing flipped; `--send` never run; `pricing.json` anchors unchanged (`git diff` on it: none) |

Gaps found vs closed: (1) `launch-flips.md` flip 1 referenced the run ledger for the
precondition read but didn't carry the dated verdict inline — closed by stamping the
2026-10-21 UNMET result on the flip (the consumed artifact must be self-contained for
R6LCH.1). (2) No other gaps — the inherited WIP already covered every AC; the audit
re-derived each AC against the spec text fresh.

**Size honesty:** budget ~400 changed lines. Actual: **~435 changed + ~299 new**
(excluding `pnpm-lock.yaml` and `docs/build/reports/**` evidence) ≈ **734** — over budget;
the excess is almost entirely tests (~330 lines across five suites) plus the read-only
readiness script (192) and the launch-flips runbook (83). Recorded per operating rules.

## Evidence log

- `pnpm install --frozen-lockfile` — clean, lockfile unchanged post-WIP.
- `pnpm turbo build lint typecheck` — **135/135 tasks** green (incl. `@rhema/web` build,
  `@rhema/security-checks` + `@rhema/integration-tests` typecheck with the new deps).
- Scoped: `vitest run pricing-page.test.ts metered-notice.test.ts legal-pages.test.ts
  launch-surface.test.ts` — 4 files / **165 pass**; `run-routes.test.ts` — **64 pass**
  incl. the three `everyone` tests.
- Repo-wide `pnpm test` — **507 files / 5,965 tests pass / 4 skipped / 0 fail** (546 s;
  incl. the privsep docker leg).
- `check:licenses` · `check:protocol-markers` · `check:no-cookies` · `check:spa-env` ·
  `check:spa-budget` · `check:dom-contract` — all OK.
- Prod reads (this run, earlier session — inherited verified): `readiness.json` readAt
  2026-10-21T08:46:32Z — preconditions 1–2 unmet; coverage recompute `overPromises:false`
  on all three gated tiers (modeled estimator; no measured cell contradicts).
- Live- verification note: the only live legs (the prod reads) are complete and recorded;
  no runtime surface changed — the SPA/SSR additions are static copy rendered by already-
  green component paths (`legal-pages.test.ts` renders all five routes; the run-sheet note
  rides `RunSheetSurface`'s existing render). No further live drive applies.

## Evidence report

- **PR:** see `docs/build/pr/R6MNY.1.md` (the submitted body — AC→evidence table there).
- **AC disposition:** (a) met — notice copy verified claim-by-claim, new-user copy on
  pricing + run sheet, dry-run recipients = 2 recorded (critical path binds); (a′) met —
  preconditions 1–2 read UNMET on prod, carried as a dated finding on flip 1; (b) met —
  coverage lines recompute raw+floored, FAQ literal derived, adversarial + no-remembered-
  figure tests; (c) met — refund copy pinned to `REFUND_WINDOW_DAYS`/quarter/hold-debit
  semantics; (d) met — three HTTP tests under `everyone` prove kill switch + 1-concurrent;
  (e) met — `launch-flips.md` four ordered diffs with verify + rollback + the gate;
  (f) met — lint extended over notice sources + rendered notice + rendered legal pages.
  The execution legs (the flips, the notice send) are `met-engineered` at this layer —
  carried by D-ACT.1-3 / D-DEF.4-3 / D-ECON.1-3 / D-ECON.1-4, executed by R6LCH.1/R6DEP.1.
- **Verification:** `turbo build lint typecheck` 135/135; `pnpm test` 507 files / 5,965
  pass / 0 fail; all six `check:*` gates OK; scoped suites green (run-routes 64,
  launch-surface 118, pricing-page 23, legal-pages 19, metered-notice 5).
- **Live legs:** prod read-only complete 2026-10-21T08:46Z (system-role DSN over the IAP
  tunnel, $0, tunnel closed) — counts/aggregates only, no PII, nothing written. No other
  runtime surface applies.
- **Size:** ~435 modified + ~299 new ≈ 734 vs ~400 budget — over; dominated by tests +
  the readiness script + the runbook. Recorded, not hidden.
- **ci:** read at closeout (see PHASE LOG entry).
- **Closed:** 2026-10-21 (set at closeout commit).

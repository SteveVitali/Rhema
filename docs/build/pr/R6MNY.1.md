# R6MNY.1 — Money-flip readiness: notice dry-run, calibration read, claim truth, launch-flips runbook (REQ-LCH-5)

Stacked on `stevevitali/r6lgl-1-legal-trust-pages` · `mergePolicy: OPERATOR` —
**do not merge; the operator merges the chain bottom-up.** Spec:
`docs/tickets/181_R6MNY.1__money-flip-readiness.md` (manifest row 181, round 6;
`docs/round-6-draft-spec.md` §4.2 REQ-LCH-5 a, a′, b–f; `GD-LAUNCH-MONEY.R6`,
`GD-BL13.R6`, `GD-TRIAL-CEIL.R6`). **Nothing flips here** — no
debitMode/audience/refund-window change, no notice send, no deploy, no DB writes.
The only live legs were prod **read-only** (system-role DSN over the IAP tunnel,
counts/aggregates only, $0; tunnel closed after).

**Requirement ids stamped:** REQ-LCH-5

## What

**(a) The metered notice, verified + told to new users.** `metered-notice.test.ts`
asserts every claim in the rendered notice against the shipped semantics
(charge-what-we-meter, cap-as-consent-and-ceiling, committed→metered honesty in
both directions, platform refund classes, top-up carry-over, **zero figure
literals**). The same explanation now greets new users: `COPY.pricing.meteredNote`
on the pricing page and `COPY.runSheet.meteredNote` on the run sheet — worded true
under both debit modes. **Prod dry-run: recipients = 2** → the
`EFFECTIVE_DATE ≥30 days` critical path binds for flip 1 (`--send` stays
R6DEP.1's `GD-PREAUTH-ACTS.R6` item).

**(a′) Calibration preconditions 1–2 — read on prod, UNMET.** The committed
read-only readiness script (`integration/src/money-flip-readiness.ts` +
`scripts/live/money-flip-readiness.mjs`) reports: `cap_calibration_reports` 0
rows, `cost_observations` 199 harvested with **admissible = 0**
(116 `no_proxy_rows` / 65 `not_completed` / 18 `pre_preset_fix`),
`estimator_cells` 0, `cost_card_cells` 46, `capFor` null on all five paid
surfaces. Recorded as a finding on `docs/ops/launch-flips.md` flip 1 — never
flipped past; the funded wave (REQ-DISC-1) supplies the admissible rows.
Evidence: `docs/build/reports/2026-10-21_R6MNY.1/`.

**(b) Claims recompute, never pin literals.** `planCoverageLine` now divides
included credits by the estimator's **raw** figure and **floors** (a true 0.79
prints "≈0.7"; under one honest loop the line hides rather than over-promise —
GD-BL13.R6 "every claim true"). The FAQ's "150-credit trial pocket" literal is
now derived from `PRICING.trial.pocketCredits`. Tests recompute every printed
loop figure against the live pricer, pin the floor on an adversarial rounding
boundary, and prove a changed estimator changes the line.

**(c) Refund copy pinned to the §14.4 math** — `legal-pages.test.ts` asserts the
window figure IS `REFUND_WINDOW_DAYS` (no other day count slips in), the
once-per-quarter allowance, hold/debit/release semantics, the
`USER_REFUNDABLE_RUN_STATES` classes, and credits-restore (no promised card
reversal).

**(d) The launch posture proven under `everyone`** — `run-routes.test.ts` stages
`PRICING.trial.audience="everyone"` in-process (restored in `finally`; the
shipped config never changes) and drives real unflagged workspaces through the
live HTTP gate: claim admitted (201 + `allow` audit), paused day → 429
`trial_ceiling` (+ `paused` audit), second POST → 429 `concurrency_limit` at
`PRICING.trial.concurrency`.

**(e) `docs/ops/launch-flips.md`** — the owned shared decision R6LCH.1 consumes:
step 0 (the notice send) + the four ordered one-line stage-fact diffs
(`debitMode` → metered, `purchaseMode` → open, `refundWindowMode` → open,
trial `audience` → everyone), each with its verify and its rollback, the flip-1
gate carrying the dated unmet-precondition finding, and the ordering guarantee
(metered before purchases; refund window before the audience opens).

**(f) Launch lint extended** — `SURFACE_FILES` += the notice template,
integration driver, and runner; the rendered notice (subject/text/html) and all
five rendered legal routes sweep clean of `CLAIM_PATTERNS` + `lintGrowthCopy`,
and the `data-legal-draft` banner is pinned while `approved:false`.

## Verification

- `pnpm install --frozen-lockfile` clean · `pnpm turbo build lint typecheck`
  **135/135** · `pnpm test` repo-wide **507 files / 5,965 pass / 0 fail**
- Scoped: run-routes 64 · launch-surface 118 · pricing-page 23 · legal-pages 19 ·
  metered-notice 5
- `check:licenses` · `check:protocol-markers` · `check:no-cookies` ·
  `check:spa-env` · `check:spa-budget` · `check:dom-contract` — all OK
- Prod reads (read-only, counts/aggregates only): `readiness.json` +
  `prod-readiness-reads.md` in `docs/build/reports/2026-10-21_R6MNY.1/`

## AC → evidence

| AC | layer | verdict | evidence |
| --- | --- | --- | --- |
| dry-run count + precondition read committed (no PII) | live-executed | met | `reports/2026-10-21_R6MNY.1/` — recipients 2; preconditions 1–2 UNMET recorded |
| claim-consistency tests fail on a hand-edited figure | engineered | met | `pricing-page.test.ts` R6MNY.1 block; `legal-pages.test.ts`; `metered-notice.test.ts` |
| kill-switch / 1-concurrent under `everyone` | engineered | met | `run-routes.test.ts` "the trial gate under `everyone`" (3 tests) |
| `launch-flips.md` with order + verifies + rollbacks | engineered | met | `docs/ops/launch-flips.md` |
| universal phase-gate AC | agentic | met | green verification; REQ-LCH-5 stamped; dated DEFERRALS notes (D-ECON.1-3/-4 stay OPEN on admissible=0; D-ACT.1-3, D-DEF.4-3 notes — posture unchanged); protected records appended only; harness `devin-desktop/swe-2-high/subagent` |

## Deferrals delta

None opened, none closed — four dated notes appended: **D-ECON.1-3** and
**D-ECON.1-4** stay OPEN (admissible = 0; the funded wave supplies the binding
data); **D-ACT.1-3** and **D-DEF.4-3** get dated readiness notes — the flips are
prepared in `launch-flips.md`, execution stays operator-owned (R6LCH.1 after
GATE-LAUNCH).

## Deviations / notes

- `planCoverageLine` semantic: nearest-round → floor + hide-under-one-loop, and
  the divisor is the raw estimator figure not the card-rounded one — a
  correctness fix implementing GD-BL13.R6, not a pricing change (anchors
  unchanged).
- **Size:** budget ~400 changed lines; actual ~435 modified + ~299 new (excl.
  lockfile + evidence) ≈ 734 — over budget, dominated by test lines; recorded.
- Crash-resume: the prod read-only legs completed ~08:46Z before a worker crash;
  they were verified inherited (not re-run) — no second tunnel opened.

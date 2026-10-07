# ECON.1 — Charge what we meter

Proxy usage is the billing meter of record. Every customer-facing usage surface, cost card,
debit path, and calibration input reads `usage_records.source='proxy'` — the `sdk_estimate` and
`sdk_stream` twins remain diagnostics that no billing path sums. `debitMode` ships **dark**
(`DEBIT_MODE=committed` in prod, verified on api + worker): metered settle exists in code —
over-debit refunds `metered_over_debit`, the residue sweep re-settles late proxy arrivals ≤72 h —
but no customer is debited on the meter until the notice window + operator flip run. Root cause
of the 2026-09-30 incident (`01M3SK62YZST272B35CG12K6TW`): the debit was right (634 committed
vs 632 metered, within the +2 pod-claim floor) — the **display** summed all three usage sources
(1,625 cr). Stage B executed on prod at **$16.31** of the ≤$30 cap.

Ticket: `docs/tickets/66_ECON.1__charge-what-we-meter.md` (chain row 66, round 3).
Base: `stevevitali/bill-3-credit-purchase-path` @ `867cabf` (stacks on PR #87).
Merge policy: **OPERATOR — do not merge.**
ADRs: **ADR-031** (metered burn classification), **ADR-032** (durable calibration store),
**ADR-033** (Quick claim-cap mechanism + preset-precedence addendum); ADR-014 amended (metered-mode
semantics), D-PRB.16-5 superseded-note.

## The contract

- **`source='proxy'` is the meter of record.** Usage displays (seat-level L4, beta dashboard),
  cost cards, debits, reconciliation, and calibration harvest all filter to proxy rows;
  `sdk_estimate`/`sdk_stream` are written for diagnosis and never summed into a user-facing or
  billing figure. Pinned by reproducing tests per named divergence path.
- **`debitMode` is a stage fact → env flag.** `committed` (default, today's semantics) vs
  `metered` (settle to `min(proxy Σ, cap)`: completed runs refund over-debit as
  `metered_over_debit`; cancelled runs debit the meter; late-arrival proxy rows ≤72 h re-settle
  via the residue sweep). `metered` is deployed but **operator-paused** — the flip runbook +
  paid-account notice ship in this PR; nothing was sent, nothing flipped.
- **§6.5 rigor presets conform.** Quick's `claim_cap:5` is frozen server-side in `run.inputs`
  (the manifest's sanctioned frozen-input channel — the oracle bound, budgets, and estimate all
  read it; the vendored skill text is untouched). Live finding **F-ECON.1-1**: seeded/stored
  `phase_defaults` could re-enable phases a rigor preset disables (the essay seed's all-true
  defaults silently un-Quick'd N6's run). Rule now: defaults may only *disable* relative to the
  preset; only the explicit sheet toggle turns a preset-off phase back on. Proven live post-fix.
- **Durable calibration store** (migration `0049`, additive): `cost_observations` (tenant-scoped
  RLS — one row per harvested run, admissible OR marked with the inadmissible reason),
  `cost_card_cells`, `cap_calibration_reports`, `estimator_cells` (platform aggregates). The
  weekly `billing.estimator-refit` job harvests → recomputes cards → refits REQ-BILL-7 per-bucket
  cap multipliers (1.5 hold / 1.35 tighten / 1.25 floor; n≥5 floor; ≤10% in-sample cap-reach
  assertion; the 2× breaker stays runtime-only). `costCard`/`capFor` are the published reads for
  EST.1/RPT.1/ACT.1/ECON.2.
- **Notice + flip runbook** (`docs/ops/debit-mode-flip.md`, `metered-notice.ts`): recipient query
  = active paid subscriptions + top-up holders minus `is_test` workspaces (dry-run on prod: **2
  recipients** — operator account + one legacy probe); template uses credits/cap/top-up/plan
  vocabulary with an effective-date placeholder and no "you will be billed" phrasing; send is an
  explicit operator CLI flag. Nothing sent.
- **F5 settlement** — four-number agreement proven live on a completed run and a user-cancelled
  mid-phase run (legs table below).

## Stage B evidence (prod, 2026-10-02; $16.31 list of ≤$30)

- **Deploys:** migration `0049` applied (49 recorded, additive-linted); Cloud Build `6cffe99c`
  → `pulumi up` **update 103** (`prod:13e8b95`); F-ECON.1-1 follow-up Cloud Build `e1fd8bc4` →
  `pulumi up` **update 104** (`prod:e264219`). Both previews: zero stateful replace/delete.
  `/healthz` provenance matches the chain tip on api+web; `deployments` rows recorded;
  `DEBIT_MODE=committed` verified live on api AND worker.
- **Instrumented legs** (test tenant `jrn-a`, 8,000cr house grant, `entitlement_id=null`):

| leg | run | state | proxy meter | list $ | committed |
|---|---|---|---|---|---|
| I1 review/standard/base·xs | `01M3XHQH…` | completed | 919 cr | $6.5992 | 919 (9 debits) — hold 5764→rel 4845; debits=proxy=spent |
| F5b cancel mid-craft | `01M3XM5X…` | cancelled | 150 cr | $1.0825 | 139 debits + 11 absorbed (incl. 1cr late-arrival) — hold 5764→rel 5625 |
| N6 review/quick/base·s (essay, UI) | `01M3XN53…` | completed·unverified | 724 cr | $5.1992 | 438 − 159 PF refund + 445 absorbed — surfaced F-ECON.1-1 |
| I4 review/quick/base·xs (post-fix) | `01M3XRNG…` | completed·unverified | 477 cr | $3.4315 | 477 − 164 PF refund + 164 absorbed — clean §6.5 cell (no discourse/second_read rows) |

- **Calibration harvest:** 97 observations in `cost_observations`; **0 admissible** (every paid
  completed post-metering run is `pre_preset_fix`, `not_completed`, or `platform_fault`) → 43
  `cost_card_cells` recomputed (all observations feed cards by design), **0**
  `cap_calibration_reports` adopted — the n≥5 floor is unmet; deployed caps stay at modeled
  REQ-BILL-7 defaults. → `D-ECON.1-3`; unmeasured cells → `D-ECON.1-4`.
- **Reconcile:** `usage.reconcile` enqueued live — `balances ok`; the Anthropic report/window
  arms skipped on the seeded placeholder admin key → `D-ECON.1-1` (HUMAN-H7).
- **Notice dry-run:** 2 non-test recipients; nothing sent; `debitMode` never flipped.
- **N6 stays owed** (`D-RES.1-2`): both Quick legs delivered `unverified` — every cited source
  failed the cited⇒fetched strip (D-P0.15i-2 class); RES.1's research restore itself is proven
  live (16 searches / 32 fetches metered on N6).

## Verify

- `pnpm turbo build lint typecheck` — 135/135; `pnpm test` — full suite green (ledger
  cost-calibration 30+, metered-notice, reconcile/provider-report, run-routes §6.5, worker
  billing-jobs).
- Migration `0049` additive-lint pass (`--newer-than 0048`); RLS shape verified live.
- `check-build-memory.sh .` — 0 violations.
- Live: `/healthz` gitSha = chain tip; `DEBIT_MODE=committed` on api+worker.

## Deferrals

- `D-ECON.1-1` (OPEN) — admin-key Usage & Cost report arms; H7 pending.
- `D-ECON.1-2` (OPEN) — §6.5 findings-cap 40 (no sanctioned input; ADR-033).
- `D-ECON.1-3` (OPEN) — adopted per-bucket cap multipliers await organic admissible samples.
- `D-ECON.1-4` (OPEN) — unmeasured cells (I2/I2′/I3, balanced/frontier) stay `derived`.

Run ledger: `docs/build/runs/ECON.1.md`.

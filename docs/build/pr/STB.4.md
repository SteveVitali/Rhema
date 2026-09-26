# STB.4 — Real-money + external legs (non-money legs only)

Ticket: `docs/tickets/58_STB.4__real-money-and-external-legs.md` · run ledger:
`docs/build/runs/STB.4.md`
Stacks on `stevevitali/def-3-live-noise-and-polish` (PR #79). **DO NOT MERGE** — Leg A (live Stripe)
is deliberately held for the operator's mode decision (D-P1.16-1); nothing in this PR touches
Stripe.

## Summary

STB.4 is the last manifest row — the legs that cost real money or need external coordination.
This run executes everything that doesn't require an operator procurement/decision and records
the rest honestly.

- **Leg B — pen-test facilitation (D-P1.22-3).** `docs/security/pen-test-scope.md` already held
  the asset inventory, out-of-scope, and controls. What was missing for a vendor-ready package:
  - `docs/security/pen-test-vendor-package.md` — the single index a vendor reads first: package
    contents + links, condensed architecture summary, the six trust boundaries with the specific
    attacks to attempt, test-account provisioning mechanics (two paid tenants + one trial via
    audited `house-grant` promo credits — no Stripe needed), staging-environment notes, and an
    expanded rules-of-engagement checklist (authorization scope, secure-channel critical
    reporting, safe-harbor). Name-free: **no invented vendors, prices, or dates** — procurement
    stays the operator's.
  - `docs/security/pen-test-findings-triage.md` — the tickets-from-findings runbook: `PT-NN`
    finding template, severity rubric, intake → raw readouts under `docs/build/readouts/` →
    dedupe vs the deterministic suite → route to fix ticket / `D-PT-NN` deferral row / backlog
    → launch-gate list → verify + close.
- **Leg C — Anthropic Usage & Cost reconciliation (D-PRB.08-1, leg b).** The stub source had
  guessed the API contract (`group_by[]=request_id` + per-request cost rows). The real Usage &
  Cost API has **no request_id grouping** — it serves aggregate buckets only: `cost_report`
  (USD `amount` in cents, daily granularity, org-wide) and `usage_report/messages` (per-model
  token counts). Rewired:
  - `apps/worker/src/provider-report.ts` — `AnthropicAdminReportSource` fetches both endpoints
    for a window (day granularity, pagination, starts_at/ends_at, group_by model) →
    `ProviderUsageReport.window` (providerUsdCents + model tokens). Any-cost fallback for
    undated reports preserved; `anthropic-admin-key` stays behind Secret Manager + the
    placeholder guard.
  - `packages/ledger/src/reconcile.ts` — `reconcileProviderWindow` compares the provider window
    against Σ `usage_records(source='proxy')` in the same window: divergence detection + `>2%`
    `usage_drift` alert — **zero ledger writes** (aggregates carry no run attribution; the
    user-favourable refund arm stays request-scoped and is unreachable via this path anyway).
  - `apps/worker/src/billing-jobs.ts` — the nightly `handleUsageReconcile` gains a window arm
    (default: yesterday UTC, `--day`/`--days` override); skip-reasons logged, not thrown.
- **Deployed (the DEF pattern).** Worker-only image — `git diff` touches worker + an additive
  `@rhema/ledger` export. Cloud Build `e291b5c3-21cb-4b3e-8251-b2adaa6822ee` (tag `stb4`) →
  digest `sha256:a60b450483ec3decadb0ed3071faa4faef6fd3f7c2a21ce0b863288c3495850b` pinned in
  `Pulumi.prod.yaml`; `pulumi preview` 6 updates/0 destroys/0 replaces → **update 91**;
  provenance `prod:86441d6c38c1901d1ae7d5586638358bed0f2ad2`
  (`protocols_version=0.4.0+ec61156725a895ab`). Boot log clean — the placeholder guard still
  skips provider pull until the operator seeds the key.
- **Reconcile status — metered side verified, provider side blocked.** Read-only prod audit of
  the 2026-09-26 UTC window (the STB.3/DEF run day): **1001** `usage_records` proxy rows,
  metered list **$24.228135**, **3363** credits, `provider_request_id` coverage **100%**
  (sonnet-5 987 rows/$23.92; haiku-5 14 rows/$0.31); `credit_ledger` for the day shows the
  matching run debit/hold/release activity. The provider pull is **blocked**: the
  `rhema-prod-anthropic-admin-key` secret's only version is still the seeded **placeholder**
  (verified — value never printed), and real inference keys 401 on the Admin API ("requires an
  Admin API key or an organization-scoped API key"). **Operator step:** seed the real
  admin/org-scoped key as v2 → next worker boot binds the source → the nightly window reconcile
  produces providerUsd + divergence. D-PRB.08-1 leg (b) stays **PARTIAL** — code+deploy done,
  first provider-verified comparison owed.

## Gates

`turbo build lint typecheck` 132/132 · `pnpm test` 380 files / 3,600 pass (one timing-flaky
`run-sheet` lever-matrix `<100ms` assertion under suite load — 16ms in isolation, unrelated to
this diff) · licenses 607 · protocol-markers 45 · upstream-diff 22 · build-memory 0.

## Deferrals

- **D-PRB.08-1 (leg b) → PARTIAL, amended:** wired to the real contract + deployed + metered
  numbers captured; the provider-verified window remains owed on the real admin key (operator
  secret seed).
- **D-P1.22-3 → OPEN, amended:** the vendor-ready package + triage runbook are committed;
  engagement procurement + findings triage remain the operator's.
- **D-P1.16-1 → unchanged:** Leg A (live Stripe ≤$50) held for the operator's mode decision —
  not touched.

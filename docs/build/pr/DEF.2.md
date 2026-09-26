# DEF.2 — Ledger + metering integrity (F4/F5/F6)

Ticket: `docs/tickets/56_DEF.2__ledger-metering-integrity.md` · run ledger:
`docs/build/runs/DEF.2.md`
Stacks on `stevevitali/def-1-run-pipeline-blockers`. **Stage A ($0) + a read-only prod reconcile
leg** — the balance-repair `--apply` and the live estimate-cache fill are operator-gated (they
need a prod write + the api deploy).

## Summary

STB.3's live legs proved the platform's accounting numbers lie in three places. This PR fixes
each at the root — the accounting-truth findings (§14.5, §14.2, §12.2):

- **F4 — `credit_balances.held` drifted to −897 on `topup`.** The worker's sampling meter wrote
  `credit_ledger` + `credit_balances` by hand — no account lock, no `held` maintenance — and
  nothing enforced the invariant or folded the ledger back. Now the worker meters through the
  canonical `@rhema/ledger` path; migration `0044` adds `CHECK (held >= 0) NOT VALID` +
  `admin_actions 'balance_recompute'`; `reconcileBalances`/`recompute-balances` folds the
  append-only ledger, plans `reconcile`-source backfill holds + a counter rewrite (dry-run
  default; `--apply` writes in one tx/account).
- **F5 — committed debits ≪ proxy-metered usage on cancelled/failed runs** (STB.3: 451 vs
  1,304). `commitStep` now debits the **incremental metered amount** (Σ `usage_records
  (source='proxy')` for the attempt minus what's already debited; `args.credits` fallback).
  Terminal semantics are explicit: success settles the remainder + releases; **cancel is
  release-only** — committed debits stay as the charge, uncommitted metered burn is absorbed as
  platform COGS via `adjustment(absorbed)` rows; **failure refunds net committed debits by
  default** (opt-out via `refundCredits: 0`). `runs.spent_credits` reconciles monotonically at
  every boundary, not just at delivery.
- **F6 — `estimate_cache` could never fill: seams unbound.** `buildApiDeps` now binds
  `SqlEstimateCacheStore` (Postgres `estimate_cache`) + `createProxyClaimPrePass`, which mints a
  short-lived **synthetic proxy credential** per refine and calls the egress proxy
  (`/v1/messages`, `claude-haiku-4-5`) — **no provider key reaches the api** (REQ-ARCH-30); the
  pre-pass COGS lands in `usage_records` under `est_*` + `role='estimate_prepass'`, absorbed per
  §5.6. Bound only when `EGRESS_PROXY_URL` **and** `SYSTEM_DATABASE_URL` are both present.
  Hardening found while wiring: the cache is global but the route never checked the project
  belongs to the caller's workspace — a cross-tenant probe oracle; now 404s. Pulumi feeds the api
  `EGRESS_PROXY_URL` (`rhema:proxyBaseUrl`) and the proxy-ingress firewall admits the
  `private-app` Cloud Run range on 443/8443.

## What changed

- New: `apps/api/src/estimate-cache.ts`, `apps/api/src/claim-prepass.ts`,
  `packages/orchestrator/src/spend.ts`, `packages/db/migrations/0044_ledger_integrity.sql`.
- Edited: `apps/worker/src/ingest-jobs.ts` + `main.ts` (canonical meter path),
  `packages/ledger/src/admin.ts` + `assertion.ts` (reconcile/repair),
  `apps/api/src/admin-cli.ts` (`recompute-balances`), `packages/orchestrator/src/ledger.ts` +
  `internal-api.ts` + `delivery.ts` + `cancel.ts` (metered debit + terminal semantics),
  `apps/api/src/estimate-routes.ts` (principal-carrying pre-pass signature + tenant check),
  `apps/api/src/server.ts` + `env.ts` (bindings), `infra/pulumi/compute.ts` + `network.ts`.
- Tests: `assertion.test.ts` (6), `ingest-jobs.test.ts` (11), `spend.test.ts` (8),
  `cancel.test.ts` (14), `internal-api.test.ts` (37), `estimate-cache.test.ts` (4),
  `claim-prepass.test.ts` (6), `estimate-routes.test.ts` (13 — incl. PGlite e2e:
  refine→`estimate_cache` row→repeat short-circuit, zero `runs` rows, `run.estimated` ×3).

## Gates

`turbo build lint typecheck` 132/132 · `pnpm test` 3,580 pass · licenses 607 · protocol-markers 45 ·
upstream-diff 22 (sanctioned only) · build-memory 0.

## Prod reconcile leg (executed read-only, $0)

`assertBalances` over the IAP tunnel: 1 divergence —
`01M2V3PM1133TPH4M8H0T8CSEE`/topup counter `available 2235 / held −897` vs ledger-derived
`1518 / −180`. `recompute-balances` **dry-run** plans a 180cr `reconcile` backfill + counter
rewrite to `1338 / 0`. Verified zero writes (counters unchanged, no `balance_recompute` audit
rows). The repair + `NOT VALID`→validated + the live estimate-refine fill are the operator-gated
Stage-B remainders (`runs/DEF.2.md` §6).

## Deferrals

- **D-PRB.03-1 → narrowed, still OPEN:** `emitEstimated` proven earlier; cache + pre-pass now
  bound in code — owed is the api deploy + one live refine → `estimate_cache` row → short-circuit.
- No new deferrals.

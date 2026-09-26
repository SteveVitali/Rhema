# DEF.2 — Ledger + metering integrity (F4/F5/F6) (run ledger)

- **Ticket:** `docs/tickets/56_DEF.2__ledger-metering-integrity.md` — the three accounting-truth
  defects: `credit_balances.held` drift (F4), committed-vs-metered divergence on non-completed runs
  (F5), the `estimate_cache` seam that could never fill (F6).
- **Branch:** `stevevitali/def-2-ledger-metering-integrity` · **PR #78** (stacks on
  `stevevitali/def-1-run-pipeline-blockers`, tip `ab3287e`; operator-held — DO NOT MERGE).
- **Gate status:** **Stage A (code + tests) DONE** — all deterministic gates green. **Stage B prod
  reconcile leg EXECUTED 2026-09-26** — read-only `assertBalances` + `recompute-balances` DRY-RUN
  against prod (no writes; evidence §6). The `--apply` repair + the estimate-cache live-fill leg
  stay operator-gated (needs the F6 api deploy + migration 0044).
- **Spend:** $0 (no inference; the reconcile leg is read-only).

## 1. Root-cause diagnoses (AC1)

### F4 — `credit_balances.held` drifted to −897 on `topup`

`credit_balances` is a denormalized counter maintained by the canonical ledger ops. Two defects
composed:

1. **A direct-mutation path bypassed the ledger.** The worker's `sqlSampleMeter` wrote a
   `credit_ledger` row and bumped `credit_balances.available` by hand — no account lock, no hold
   pairing, no `held` maintenance. Any concurrent hold/debit on the account read a stale counter;
   the non-canonical path is where the −897 drift grew (prod fold: hold 9,152 − release 5,670 −
   debit 3,662 = −180 derived, counter −897 — both wrong, neither consistent).
2. **No invariant + no reconcile path.** Nothing stopped `held` going negative and nothing folded
   the ledger back into the counter after drift — `assertBalances` could detect but not repair.

### F5 — committed debits ≪ proxy-metered usage on cancelled/failed runs

The commit path debited `args.credits` per phase while the proxy metered real usage into
`usage_records` — on runs that died mid-phase (cancel, cap-death, failure) the meter ran ahead of
the commits and nothing closed the gap:

- `commitStep` debited the flat estimate, not the incremental metered amount.
- Cancellation released the hold but left the uncommitted metered burn un-modelled (neither charged
  nor absorbed).
- Terminal failure kept committed debits with no refund default.
- `runs.spent_credits` reconciled only at terminal boundaries, so mid-flight surfaces lied.

STB.3 evidence: cancelled runs committed 451 vs 1,304 metered.

### F6 — `estimate_cache` could never fill: seams unbound in `buildApiDeps`

`createEstimateRoutes` is fully DI'd and correct — but `buildApiDeps`
(`apps/api/src/server.ts`) never bound `estimateCache` or `claimPrePass`, so every prod estimate ran
with both seams unset → `provisional:true` forever, zero `estimate_cache` rows after ~10 real calls
(STB.3 §4-F6). `emitEstimated` was already live.

## 2. Fixes

### F4 — canonical ledger path + held invariant + reconcile/repair

- **`apps/worker/src/ingest-jobs.ts` + `main.ts`** — `sqlSampleMeter` now runs through the
  canonical `@rhema/ledger` entry path (`SqlHoldLedger`-style hold/debit accounting), bound in the
  worker's dep wiring. Every worker meter write goes through the same account-locked, idempotent
  ledger ops as the orchestrator.
- **`packages/db/migrations/0044_ledger_integrity.sql`** — `credit_balances.held >= 0` as a
  `NOT VALID` check (existing prod rows violate it; validated after the reconcile repair lands) +
  `admin_actions.action` gains `'balance_recompute'`.
- **`packages/ledger/src/admin.ts` + `apps/api/src/admin-cli.ts`** — `reconcileBalances` and the
  `recompute-balances` CLI verb. DRY-RUN is the default: folds `credit_ledger` via `balanceEffect`,
  diffs every bucket counter, and prints the planned repair — a `reconcile`-sourced backfill hold
  for the unheld-debit residue + the counter rewrite + the `balance_recompute` audit row — one
  tenant transaction per account under `--apply`.

### F5 — metered-incremental debit + explicit terminal semantics

- **`packages/orchestrator/src/spend.ts`** (new) + `ledger.ts`/`internal-api.ts` —
  `commitStep` now debits the **incremental metered amount**: cumulative `usage_records
  (source='proxy')` for the attempt minus credits already debited, falling back to `args.credits`
  when no proxy rows exist. Idempotent by `(run, step, attempt)`.
- **Terminal semantics:**
  - Success — settle any metered remainder, then release the hold.
  - Cancel — release-only: committed debits stay as the customer charge; uncommitted metered burn
    is absorbed as platform COGS via `adjustment(absorbed)` ledger rows.
  - Failure — refund net committed debits by default (explicit `refundCredits: 0` opts out),
    release the hold, absorb residual metered burn as COGS.
- **`runs.spent_credits`** reconciles monotonically from usage rows at each boundary.
- `meteredCoverage` stays a pricing/cap-estimation seam (PRB.25) — deliberately NOT used to hide
  the accounting divergence; G3 repricing remains out of scope per the ticket.

### F6 — the live estimate seams bound (D-PRB.03-1's last leg)

- **`apps/api/src/estimate-cache.ts`** (new) — `SqlEstimateCacheStore` over `estimate_cache`
  (tenantless, `rhema_app`-granted in 0025; upsert on the unique `cache_key`).
- **`apps/api/src/claim-prepass.ts`** (new) — `createProxyClaimPrePass`: the api holds NO provider
  key (REQ-ARCH-30). Per refine it mints a short-lived synthetic proxy credential (scoped to
  `api.anthropic.com /v1/messages` + `claude-haiku-4-5`, ~90 s TTL, 25-cr cap), POSTs to
  `{EGRESS_PROXY_URL}/v1/messages` with `x-rhema-proxy-credential`, parses the claim count, and
  revokes in `finally`. The proxy meters it into `usage_records` under a unique `est_<id>` run id +
  `role='estimate_prepass'` — the §5.6 ~5-credit COGS is metered but never ledger-debited
  ("absorbed by Rhema"). Draft text resolves content-addressed: `draftSha` IS the promoted head's
  `content_sha256` → `contentStore.get`.
- **`apps/api/src/estimate-routes.ts`** — `ClaimPrePass.count` now carries the principal's
  `workspaceId`/`billingAccountId` (the synthetic metering context's real FKs) and returns
  `number | null`. Route hardening: a project outside the caller's workspace 404s (the cache is
  global — without the check the endpoint was a cross-tenant probe oracle).
- **`apps/api/src/server.ts` + `env.ts`** — `estimateCache` binds unconditionally on the app pool;
  `claimPrePass` binds only when `EGRESS_PROXY_URL` AND `SYSTEM_DATABASE_URL` are both present
  (the proxy_* mint needs the elevated exec — `rhema_app` is intentionally ungranted, 0025);
  partial config ⇒ provisional forever, never a half-bound refine.
- **`infra/pulumi/compute.ts` + `network.ts`** — the api service gets `EGRESS_PROXY_URL` from
  `rhema:proxyBaseUrl` (`http://10.8.16.4:8443` on prod); the proxy-ingress firewall admits the
  `private-app` range (the Cloud Run services' Direct-VPC egress source) — transport admission
  only; the credential + allowlist still authorize.

## 3. Regression tests (AC1)

- **F4:** `packages/ledger/src/assertion.test.ts` (6 — clean assertion, planted-drift detection,
  orphan-debit/negative-held rejection, dry-run writes nothing, apply repairs seeded drift),
  `apps/worker/src/ingest-jobs.test.ts` (11 — canonical path + idempotency + post-op assert).
- **F5:** `packages/orchestrator/src/spend.test.ts` (8 — row-level metered debit math),
  `cancel.test.ts` (14 — release-only + COGS absorb), `internal-api.test.ts` (37 — commit/fail
  paths incl. default refund + opt-out). Focused suite: 59 pass.
- **F6:** `apps/api/src/estimate-cache.test.ts` (4 — PGlite round-trip, upsert, null claim count),
  `claim-prepass.test.ts` (6 — mint→proxy-call→revoke lifecycle, no provider key on the wire,
  null paths), `estimate-routes.test.ts` (13 — tenant guard 404/200, principal attribution,
  PGlite e2e: refine writes `estimate_cache`, repeat short-circuits, **zero `runs` rows**,
  `run.estimated` ×3).

## 4. Gates

`pnpm turbo build lint typecheck` — 132/132 · `pnpm test` — 380 files / **3,580 pass** (3 skipped) ·
`check:licenses` — 607 OK · `check:protocol-markers` — 45 clean · `check-upstream-diff` — 22
reconciled · `check-build-memory.sh` — 0 violations.

## 5. Deferrals

- **D-PRB.03-1 → still OPEN, narrowed.** The emit leg landed earlier; the cache + pre-pass are now
  **bound in code** (this ticket). Owed: deploy (api image + `EGRESS_PROXY_URL` env + the
  private-app→proxy firewall rule + migration 0044), then one live refine → `estimate_cache` row →
  short-circuit proof. See `docs/tickets/DEFERRALS.md`.
- **D-P0.15-3-class residual:** the prod `topup` counter remains drifted until an operator runs
  `recompute-balances --apply` (migration 0044 + the read-only plan are in this branch; the
  `--apply` leg is a prod write — operator-gated per the ticket's Stage B).

## 6. Stage B — prod reconcile leg (read-only, $0)

Ran 2026-09-26 over the IAP tunnel (`127.0.0.1:15433`, `apiSystemDatabaseUrl` role):

**`assertBalances` (the F4 fold-check, all accounts):**

```text
ALL: ok=false, 3 accounts — 1 divergence:
  01M2V3PM1133TPH4M8H0T8CSEE/topup   expected available 1518 (actual 2235)
                                   expected held     −180 (actual −897)
01M2R2E1WA5ADKMCFDAZ5FNMC3        ok=true, clean
```

**`recompute-balances` DRY-RUN (`runAdminCli` → `reconcileBalances{apply:false}`):**

```text
  backfill hold 180 cr → topup (planned)
  topup: available 2235→1338, held -897→0
dry-run 01M2V3PM1133TPH4M8H0T8CSEE — 1 divergent bucket(s), 1 backfill(s) planned
```

The plan is internally consistent: the 180-cr `reconcile` hold backfills the reservation the
unheld debits never placed — the fold's expected available 1,518 then nets the new 180 hold to
1,338, and expected held rises −180 → 0; the counter is rewritten to exactly that
(available 1,338, held 0). Post-run verification: `credit_balances` unchanged, `admin_actions` has **zero**
`balance_recompute` rows — the leg wrote nothing (read-only honored). Ledger fold for the account
(topup): grant 5,000 · hold 9,152 · release 5,670 · debit 3,662 → derived held −180, counter −897 —
the −717 counter/ledger gap the F4 repair closes.

**Owed (operator-gated):** apply `recompute-balances --apply` on the divergent account (writes the
backfill hold + counter rewrite + audit row), then `validate` the `held>=0` NOT VALID check; deploy
the F6 api + run a live estimate refine to fill `estimate_cache`.

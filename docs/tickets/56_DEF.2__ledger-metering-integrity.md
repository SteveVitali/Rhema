# DEF.2 — Ledger + metering integrity (F4/F5/F6)

- **Sequence:** 56 · **Phase:** post-P1 defect pass · **Tag:** fix
- **base_branch:** `stevevitali/p1-22-launch-checks` (chain tip).
- **Depends on:** STB.3 findings. Independent of DEF.1 (parallel-safe code areas, but keep branch
  order per chain convention).
- **Scope (one line):** the accounting-truth defects — `credit_balances.held` denormalized drift
  (F4), committed-vs-metered divergence on non-completed runs (F5), and the `estimate_cache`
  seam that can never fill (F6).
- **Spec §§:** 14.5 (usage truthfulness), 14.2 (credit semantics), 12.2 (estimate/cap derivation).
- **REQ coverage:** REQ-BILL-* integrity (the platform's accounting lies at −897 held),
  REQ-SPEC-24 (estimate/cap derivation), REQ-DATA-42 (usage surfaces read truth).
- **Run:** `implement-spec spec=docs/tickets/56_DEF.2__ledger-metering-integrity.md`
- **Gate status:** $0 — code + tests + a DB reconcile. No inference.
- **Live stage:** Stage B = prod verify of the reconcile + a recompute on a throwaway account;
  $0. Operator-gated.

## Goal

The platform's accounting is its product claim — these three findings each make a number wrong:

- **F4 — `credit_balances.held = −897` on the `topup` bucket.** `usageLevel0` reads the
  denormalized column; the append-only `credit_ledger` nets cleanly per run, but the counter
  drifted (ledger-derived held = −180, counter = −897 — neither zero). Find the write path that
  drifts (hold/release/debit ordering, failed-run release path) and fix the invariant; add a
  reconcile job or CHECK if the spec names one.
- **F5 — committed-vs-metered divergence on non-completed runs.** `runs.spent_credits` reconciles
  on delivered runs but diverges on cap-deaths/cancels — the proxy-meters-everything vs
  commit-on-phase-boundary gap. Either document-and-model it (the estimator's `meteredCoverage`
  is the existing seam) or fix the accounting path if the spec says caps must track metered.
- **F6 — `estimate_cache` can never fill: seams unbound.** `buildApiDeps`
  (`apps/api/src/server.ts`) never binds `estimateCache`/`claimPrePass`. Wire them (the seams
  exist; `D-PRB.03-1` residual) — a cache that can never fill is dead code + wrong estimates.

## Load-bearing context

- Findings + the ledger-vs-counter math: `docs/build/runs/STB.3.md` §4 (F4–F6).
- `packages/ledger/src/usage.ts:29` reads `credit_balances.held` (the drifted column).
- The `meteredCoverage` multiplier (PRB.25) is the existing seam for F5 — decide whether the
  divergence belongs in pricing or in accounting truth, and be explicit in the run ledger.

## In scope

- Diagnose + fix each of F4/F5/F6 at the real root.
- A deterministic reconcile path for `held` drift (recompute-from-`credit_ledger` on a schedule
  or on-read, per spec).
- Regression tests per fix.

## Out of scope

- Re-pricing the advertised rates (G3 decision, not a defect).

## Acceptance

- **AC1** — each finding has root-cause + fix + regression test.
- **AC2** — `held` can no longer drift negative without an error (invariant enforced or
  reconciled); `estimate_cache` fills on a real estimate.
- **AC3** — gates green; `runs/DEF.2.md` evidence.

## Verify

- Standard gates + `check-build-memory.sh .`. Stage B: prod reconcile leg ($0).

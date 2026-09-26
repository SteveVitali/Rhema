# PRB.03 — Estimate service and the run sheet (beta form)

Implements `docs/tickets/19_PRB.03__estimator-and-run-sheet.md`. The product's only paywall and consent
gate, in its beta form: the stateless cached estimate service with the claim pre-pass, and the run-sheet
launcher for Review / Revise / Fact-check — rigor, venue+stage scope, dollars-first estimate, the 1.5× cap,
consent thresholds, and the balance/house-credit line.

Stacked on `stevevitali/prb-02-import-fetcher-convert` (base). **Do not merge** (mergePolicy=OPERATOR).

## What changed
- **`@rhema/contracts` `domain/estimate.ts`** (new) — the money contract, protocols-free and reusable: dollars-first `formatUsd`/`estimateLine`/`creditsLine`, `capFromEstimate` (`ceil(1.5×)`, breaker-scaled), `consentDecision` (REQ-BILL-4: >500, or >200 & >25% with the 200-floor; `don't ask under N` ≤1,000; never on entitlement), `resolveInsufficientBalance` (the §14.6 three sentences), and the `EstimateRequest`/`Estimate` read models.
- **`@rhema/run-sheet`** (new package) — the estimator-driven logic on top of `@rhema/contracts` + `@rhema/protocols`: `profiles.ts` (§6.5 rigor→tier/toggle defaults + toggle→estimator mapping for the three verbs), `buildEstimate` (provisional-from-word-count, refined-from-claim-count), `buildLeverMatrix` (every rigor×tier×toggle state + signed toggle deltas, <100 ms), `buildRunSheetView` (the launcher DTO incl. a per-rigor inline-recompute payload).
- **`@rhema/protocols` estimator** — added `enabledAddends` to `EstimateOptions` so an Advanced per-phase toggle produces a signed delta from the SAME estimator (no second formula).
- **migration 0017** — `estimate_cache.claim_count` + `provisional` (the cached pre-pass, per `(draft sha, workflow, rigor, tier)`); Drizzle parity.
- **`apps/api` `estimate-routes.ts`** (new, mounted in `createApp`) — `POST /projects/:id/estimates` → `{estimate, cap, levers, claimCount?}`: immediate provisional, refine via a DI'd `ClaimPrePass` under a ≤5 s budget, cached in `estimate_cache`, emits `run.estimated`, creates NO `runs` row.
- **`@rhema/ui`** — `RunSheet` (the two-tier launcher), `RunButton` (requires `estimate`), `AskButton`, `Paywall` (the single mount), plus an inline progressive-enhancement recompute for the Rigor lever (no client bundle).
- **`tools/eslint-plugin-rhema/require-estimate-prop`** (new rule, enabled) — REQ-GROWTH-16: `<RunButton>` must carry an `estimate` prop.
- **`@rhema/api-client`** — `estimate()` + `createRun()` methods (+ DTOs).
- **`apps/web`** — `GET`/`POST /p/:project/run` (the sheet page + the Run click), COPY, page-data, the project-page run link.

## Design decisions
- **Split contract vs estimator.** The money vocabulary (formatting, consent, insufficiency, cap) lives in `@rhema/contracts` (a leaf, no protocols dep, reusable by the run card / approval card / mobile); the estimator-driven sheet logic lives in `@rhema/run-sheet`. The full-IDE sheet (P1.6) reuses both verbatim.
- **No-bundle recompute (§5.6 item 2).** AC2's ≤100 ms recompute is a pure function (`buildLeverMatrix`, tested `<100 ms`). The beta (no client bundle) ships an inline progressive-enhancement `<script>` that recomputes the estimate box in place on a Rigor change from an embedded per-rigor table; Advanced toggles recompute on submit (under the fold). Formatting in the script is the trivial $0.01/credit peg, not the estimator.
- **Toggle→estimator mapping.** fact-check off zeroes the claim-verification (`perClaim`) term — the dominant Review lever; discourse / second read are the two per-phase addends selected via `enabledAddends`. This makes REQ-BILL-5's golden hold: fact-check off on 8k/45 Base/Standard = 314 credits (∈ 330 ±10%), delta = 45×24.
- **Beta insufficiency copy.** The §14.6 three sentences are verbatim in `full` mode; `beta` mode replaces "/ upgrade" with a house-credit ask (REQ-BETA-14/19 — no plan upsell).

## Verification
- `pnpm turbo build lint typecheck` — 108/108 green (incl. the new `require-estimate-prop` rule and the schema-parity check over 0017).
- `pnpm test` — 1454 passed / 2 skipped (baseline 1394 → +60). New/changed suites: contracts `estimate` (16), run-sheet `estimate`/`lever-matrix`/`view` (20), api `estimate-routes` (9) + `run-routes` insufficient-balance (1), ui `run-sheet` (7), api-client `estimate`/`createRun` (2), web `server` run-sheet (5) + `copy` + `paywall` (1), eslint rule (1).
- All 6 ACs are deterministic and proven as tests (see the table below). No live/paid legs run.

## Acceptance criteria → evidence
| AC | evidence |
|---|---|
| 1 — immediate provisional + refine ≤5 s; run capped from provisional | `run-sheet/src/estimate.test.ts`; `api/src/estimate-routes.test.ts` (provisional / refine / ≤5 s budget-elapsed) |
| 2 — recompute ≤100 ms; signed deltas; fact-check off 8k/45 → ≈330 ±10% | `run-sheet/src/lever-matrix.test.ts` (`<100ms`; delta=45×24; off=314) |
| 3 — consent thresholds incl. 200-floor; don't-ask-under-N ≤1,000 | `contracts/src/domain/estimate.test.ts` `consentDecision`/`clampDontAskUnder` |
| 4 — insufficient balance three sentences; no run row | `contracts` `resolveInsufficientBalance`; `api/src/run-routes.test.ts` (402, PGlite `runs` count unchanged) |
| 5 — `run.estimated` fires from the endpoint; no abandoned `runs` rows | `api/src/estimate-routes.test.ts` (event emitted; endpoint never touches `runs`) |
| 6 — dollars-first everywhere; credits second line; tokens nowhere | `contracts`/`run-sheet`/`ui`/`web` suites all assert no `/token/i`; copy lint green |

Requirement IDs stamped: REQ-SPEC-16, REQ-IDE-13, REQ-CHAT-25, REQ-BILL-1 (amended), REQ-BILL-4 (amended), REQ-BILL-5, REQ-BILL-6, REQ-GROWTH-13, REQ-GROWTH-16, REQ-WF-3, REQ-OBJ-6, ledger L11.

## Deferrals
Opened: **D-PRB.03-1** (live pre-pass/cache/analytics binding), **D-PRB.03-2** (live per-draft estimate inputs in the web sheet), **D-PRB.03-3** (live obligation-scope-line fetch). All three are DI'd seams unit-tested with fakes; the endpoint + sheet render are fully deterministic. D-P0.11-1 stays OPEN — PRB.3 landed the `capFromEstimate(estimate, breakerMultiplier)` primitive; its live refunded-partial/breaker/park assertions still need a live run. No existing OPEN row is fully closable by PRB.3 alone.

## Cross-cutting invariants
- The run sheet is the only run creator + only paywall — `apps/web/src/paywall.test.ts` proves exactly one `<Paywall>` mount; run creation stays `POST /projects/:id/runs`.
- Dollars-first everywhere; tokens nowhere — asserted across every suite; banned-vocabulary lint green (the one sanctioned exception, "Advanced", used only as the §6.5 disclosure label).
- Canonical vocabularies verbatim (Base/Balanced/Frontier, Quick/Standard/Full board) from `@rhema/contracts` displays.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

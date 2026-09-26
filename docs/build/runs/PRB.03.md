# Run ledger — PRB.03 (Estimate service and the run sheet, beta form)

- **Spec:** docs/tickets/19_PRB.03__estimator-and-run-sheet.md (§5.6, §14.1, §14.4, §14.6, §6.4, §6.5, §12.4; REQ-SPEC-16, REQ-IDE-13, REQ-CHAT-25, REQ-BILL-1/4/5/6, REQ-GROWTH-13/16, REQ-WF-3, REQ-OBJ-6, ledger L11)
- **Base:** 2bc8d92a1f1bce55ec195de9c94449b50f97e006 (stevevitali/prb-02-import-fetcher-convert)
- **Branch:** stevevitali/prb-03-estimator-and-run-sheet
- **Config:** implement-spec full (all rigor phases on); autonomous=true; committed build-memory mode; mergePolicy=OPERATOR (stacked, do not merge)

## Deferrals read
Read DEFERRALS.md in full. Rows this ticket touches:
- **D-P0.11-1(b)** — `circuitBreakerState().capMultiplier` consumed when sizing a NEW run's cap. Unblocker is D-P0.08-1 (live worker) **and** PRB.3 (estimator cap sizing). The estimator cap sizing lands here; the CAP arithmetic (`cap = ceil(1.5 × estimate)`) and the circuit-breaker seam are exercised. But full closure needs the live worker (D-P0.08-1) — stays OPEN. Note: run-routes already applies `circuitBreaker` at creation (P0.12 shim). PRB.3 delivers the estimate→cap sizing the sheet passes.
- **D-P0.15-2 / D-P0.15k-1** — instrumented estimator constants: review + fact_check folded live (calibrationScale 1.949 / 1.793); revise/profile_voice stay provisional. The estimator reads `estimatorSpec()` (override-first) so a folded run flips it. No new closure here.
- No existing OPEN row is fully unblocked BY this ticket alone (all remaining are live/H0). New deferrals appended for the live legs of the estimate service (Haiku claim pre-pass live; live balance wiring).

## Requirements (from spec)
- REQ-SPEC-16: stateless cached `POST /projects/:id/estimates` → `{estimate, cap, levers, claimCount?}`; emits `run.estimated`; NO `runs` row; `runs` row only on the sheet's Run click with client-minted idempotency key.
- REQ-IDE-13 (beta): every run launched from the sheet (target, rigor, phase deltas, approval policy, estimate, cap, balance); primary button the only paywall.
- REQ-CHAT-25: the sheet is the only run creator; cap passed as `max_usd`.
- REQ-BILL-1 (amended): dollars-first at the decision moment ("≈ $5.60 · never more than $8.40"); credits second line; tokens nowhere.
- REQ-BILL-4 (amended): consent > 500 cr, OR > 200 cr AND > 25% of spendable; per-user "don't ask under N" ≤ 1,000; never on entitlement run.
- REQ-BILL-5: every Advanced toggle shows a signed delta from the same estimator; fact-check off on 8k/45 golden ≈1,240 → ≈330 ±10%.
- REQ-BILL-6: run record freezes estimate, cap, rigor, model tier, phases, rate-table version, claim + word counts.
- REQ-GROWTH-13: exactly one `<Paywall>` mount = the sheet.
- REQ-GROWTH-16: `AskButton`/`RunButton` the only agent-work triggers; `RunButton` requires an `estimate` prop (lint).
- REQ-OBJ-6: obligation scope lines ("N open obligations will be checked" on Review; "this run addresses N" on Revise).
- REQ-WF-3: the three verbs (Review / Revise / Fact-check) launch from the sheet.
- §14.6: insufficient balance → the three sentences; cheapest-fitting option primary; never silent billing.
- §5.6 items 1–10: sheet anatomy; provisional-then-refine; cap = ceil(1.5×estimate); consent client-side step.

## Acceptance criteria
- AC1: estimate returns immediately with the provisional figure; refines in place ≤5 s (cached claim pre-pass); a run launched pre-refinement is capped from the provisional estimate. *(deterministic)*
- AC2: every lever change recomputes estimate/cap/time ≤100 ms from cached constants; Advanced toggles show signed deltas; fact-check off on 8k/45 ≈1,240 → ≈330 ±10%. *(deterministic)*
- AC3: consent second click appears exactly per the threshold rules incl. the 200-credit floor; "don't ask under N" honored ≤1,000. *(deterministic)*
- AC4: insufficient balance → the three sentences render; no run row created. *(deterministic)*
- AC5: `run.estimated` fires from the estimate endpoint; no abandoned `runs` rows from sheet opens. *(deterministic)*
- AC6: dollars-first formatting everywhere on the sheet; credits second line; tokens nowhere. *(deterministic)*

## Plan
Packages:
1. **@rhema/contracts** — `domain/estimate.ts`: dollars-first formatters (`formatUsd`, `estimateLine`, `creditsLine`), consent thresholds + `consentDecision`, insufficient-balance `resolveInsufficientBalance` (the three sentences), `capFromEstimate` (ceil(1.5×)), read-model types `EstimateRequest`/`Estimate` (design/4 §6.3). No protocols dep (contracts is a leaf).
2. **@rhema/run-sheet** (NEW package) — estimator-driven sheet logic (depends on contracts + protocols): `buildEstimate` (provisional-then-refined; claim-density fallback), `buildLeverMatrix` (per rigor×toggle estimate/cap/time + signed deltas, ≤100ms), `buildRunSheetView` (the full launcher DTO: title line, rigor options, estimate box, collapsed row, advanced toggles, consent, insufficiency panel, obligation scope lines, why-line). Rigor→flag mapping (§6.5). AC1/AC2 here.
3. **apps/api** — `estimate-routes.ts`: `POST /projects/:id/estimates` (stateless, cached in estimate_cache, emits run.estimated, DI'd claim pre-pass + spendable reader + event sink); mount in createApp. AC5.
4. **@rhema/ui** — `<RunSheet>`, `<RunButton>`, `<AskButton>`, `<Paywall>` presentational components (text-agnostic, render a RunSheetView).
5. **apps/web** — run-sheet page/route (`/p/:project/run`) rendering the sheet for the three verbs; COPY additions; data source wiring; inline progressive-enhancement recompute via the embedded lever matrix.
6. **tools/eslint-plugin-rhema** — `require-estimate-prop` rule (RunButton needs an `estimate` prop).
7. **migration 0017** — add `claim_count` + `draft_version_sha`/`workflow`/`rigor`/`tier` provenance to `estimate_cache` (per `(draft sha, workflow, rigor, tier)`), and a `provisional` flag; Drizzle parity.

Order: contracts → run-sheet → migration/db → api estimate-routes → ui components → eslint rule → web page → tests alongside each.

## Test matrix
- AC1 → run-sheet `buildEstimate.test.ts`: provisional (no claims) immediate; refined after pre-pass; cap from provisional; api `estimate-routes.test.ts`: first call provisional + cached, pre-pass refines, ≤5s budget enforced (fake clock/timeout).
- AC2 → run-sheet `lever-matrix.test.ts`: recompute wall-time <100ms; signed deltas per toggle; REQ-BILL-5 golden (fact_check off on 8k/45 review ≈330 ±10%, delta = claim contribution, monotonic).
- AC3 → contracts `estimate.test.ts` `consentDecision`: >500 ⇒ second click; >200 & >25% ⇒ second click; ≤200 no; 200-floor (small balance, ≤200 cr ⇒ no double click); don't-ask-under-N removes below N; N capped at 1000; never on entitlement.
- AC4 → contracts `resolveInsufficientBalance`: three exact sentences; cheapest-fitting primary; api route: cap>spendable ⇒ 402 + no runs row (PGlite: assert `select count(*) from runs` unchanged).
- AC5 → api `estimate-routes.test.ts`: run.estimated emitted via event sink; `select count(*) from runs` = 0 after N estimate calls; estimate_cache row written.
- AC6 → contracts formatter tests (dollars-first "≈ $x · never more than $y", credits second line); `lintCopy` over sheet COPY = []; a `no-tokens-on-sheet` scan test (RunSheetView serialization has no "token"); eslint `require-estimate-prop`; `<Paywall>` single-mount scan test.

## Progress
- Phase 2 impl complete: contracts/domain/estimate.ts (formatters/consent/insufficiency/cap); @rhema/run-sheet pkg (profiles/estimate/lever-matrix/view); protocols estimator `enabledAddends`; migration 0017 + Drizzle; apps/api estimate-routes.ts (mounted); @rhema/ui RunSheet/RunButton/AskButton/Paywall; eslint require-estimate-prop; api-client estimate/createRun; apps/web run-sheet page+routes+COPY. Tests alongside each. All package tests green.

## Gap table
Re-read the spec (§5.6/§14.1/§14.4/§14.6/§6.5/§12.4) fresh; every requirement + AC diffed against the code.

| item (spec §) | status | evidence |
|---|---|---|
| AC1 immediate provisional + refine ≤5 s; run capped from provisional | met | `packages/run-sheet/src/estimate.ts` `buildEstimate` (provisional density fallback; refined on claimCount); `estimate.test.ts` (provisional/refined/cap-from-provisional); `apps/api/src/estimate-routes.ts` (immediate response never blocks; `withBudget` 5 s race on the pre-pass); `estimate-routes.test.ts` (provisional/refine/budget-elapsed) |
| AC2 lever recompute ≤100 ms; signed deltas; REQ-BILL-5 fact-check off 8k/45 → ≈330 ±10% | met | `lever-matrix.ts` `buildLeverMatrix`; `lever-matrix.test.ts` (`<100ms`; signed deltas; golden off=314 ∈ [297,363], delta=45×24); protocols `enabledAddends` (same estimator) |
| AC3 consent thresholds incl. 200-floor; don't-ask-under-N ≤1000 | met | `packages/contracts/src/domain/estimate.ts` `consentDecision`/`clampDontAskUnder`; `estimate.test.ts` (absolute/relative/floor/opt-out/clamp/entitlement) |
| AC4 insufficient balance three sentences; no run row | met | `estimate.ts` `resolveInsufficientBalance` (verbatim §14.6 three sentences); `estimate.test.ts`; `apps/api/src/run-routes.test.ts` "insufficient balance → 402 and no run row" (PGlite count unchanged); UI panel `run-sheet.test.tsx` |
| AC5 run.estimated fires from endpoint; no abandoned runs rows | met | `estimate-routes.ts` `respond` emits; `estimate-routes.test.ts` ("emits run.estimated"; the endpoint touches no `runs` table); the sheet is the only run creator (run-routes) |
| AC6 dollars-first everywhere; credits second line; tokens nowhere | met | `estimate.ts` `estimateLine`/`creditsLine`/`formatUsd`; `estimate.test.ts` + `view.test.ts` + `run-sheet.test.tsx` + web `server.test.ts` all assert no `/token/i`; copy lint green |
| REQ-SPEC-16 stateless cached POST /estimates → {estimate,cap,levers,claimCount?} | met | `estimate-routes.ts` (response shape; `estimate_cache` via 0017; cacheKey `(draft sha, workflow, rigor, tier)`) |
| REQ-CHAT-25 sheet is the only run creator (cap = max_usd) | met | web POST `/p/:project/run` → `createRun`; run-routes `POST /projects/:id/runs` unchanged; `paywall.test.ts` proves the only Paywall mount; cap passed as capCredits (→ max_usd downstream) |
| REQ-GROWTH-13 exactly one `<Paywall>` mount | met | `apps/web/src/paywall.test.ts` (source scan = 1 mount, in run-sheet.tsx) |
| REQ-GROWTH-16 RunButton requires estimate (lint) | met | `tools/eslint-plugin-rhema/rules/require-estimate-prop.js` + test; rule enabled in `eslint.config.js`; `RunButton` type requires `estimate` |
| REQ-BILL-6 freeze estimate/cap/rigor/model/phases/rate-table/claim+word counts | met | sheet form hidden inputs (estimate/cap/modelTier/rigor/rateTableVersion/words/claims); web POST passes them + `inputSnapshot`; run row freeze is P0.08 `createRun` |
| REQ-OBJ-6 obligation scope lines | met (render); live fetch deferred | `RunSheetView.scopeLine` + `<RunSheet data-scope-line>` (tested); `@rhema/obligations runSheetObligations` produces the strings; live web fetch → D-PRB.03-3 |
| §6.5 rigor→flags/tier defaults + Advanced toggles | met | `profiles.ts` (Quick/Standard/Full board defaults + toggle→estimator mapping) |
| Out-of-scope: trial "Included" rendering (P1.16) | not implemented (correct) | no `Included` string; entitlement suppresses consent only (`consentDecision`), no trial pricing UI |
| Out-of-scope: palette/commands, variants, re-priced scope-card GATE CARD | not implemented (correct) | none present; scope card shows venue+stage only |
| Beta: no plan upsells / no pricing-plans-signup page | met | `routes.test.ts` (no pricing/plans/signup); insufficiency beta mode drops "upgrade" for house credits |

Live legs deferred (new rows): D-PRB.03-1 (live pre-pass/cache/analytics binding), D-PRB.03-2 (live per-draft inputs), D-PRB.03-3 (live obligation-scope fetch). D-P0.11-1 remains OPEN — PRB.3 landed the `capFromEstimate(estimate, breakerMultiplier)` estimator-cap-sizing primitive; its live refunded-partial/breaker/park assertions still need a live run.

## Adversarial review (fresh-context, Phase 3/4) — findings + closure
A fresh-context subagent (spec + diff only) confirmed all 6 ACs met + no scope-creep + single Paywall mount + banned-vocab clean. It surfaced 3 real gaps a spec-familiar reviewer would flag; all closed:
1. **[serious] cap/estimate trusted from the client on the Run path.** `run-routes.ts` + web POST froze client-sent money figures. CLOSED: run creation now re-derives `estimate` + `cap = ceil(1.5×)` server-side from the frozen levers via `@rhema/run-sheet buildEstimate` (test: crafted cap 1 → row cap 2091). This is the "estimator cap sizing (PRB.3)" the run-routes comment expected.
2. **[correctness] rigor→tier coupling not applied on a lever change (§6.5).** `byRigor` used the current tier for all rigors; the inline script + no-JS submit could launch Full board on the Balanced tier. CLOSED: `byRigor` now computes each rigor at its default tier + carries `modelTier`; the inline script swaps the hidden `modelTier`; the web GET/POST derive tier from rigor (test: byRigor tiers base/balanced/frontier; Full/Quick ratio >3×).
3. **[edge] web insufficient-balance path unhandled.** A 402 from `createRun` threw. CLOSED: the web POST catches `ApiError 402` → re-renders the sheet with the §14.6 resolution notice, no run created (test added).

Observations accepted (documented, not blocking): the beta uses house credits (200k) so the in-app insufficiency panel is exercised by tests, not the live sheet; the live pre-pass/per-draft-inputs/obligation-scope fetch are D-PRB.03-1/-2/-3; the modeled 8k/45 "on" figure (1394) diverges +12% from §14.3's ≈1240 anchor (provisional modeled constants; the AC pins only the OFF figure + delta).

## Evidence log
- `pnpm turbo build lint typecheck` → 108/108 tasks green (incl. `require-estimate-prop` rule + schema-parity over migration 0017).
- `pnpm test` → 1458 passed / 2 skipped (baseline 1394 → +64).
- Server cap re-derivation: `run-routes.test.ts` "re-derives estimate + cap server-side" → estimate 1394, cap 2091 (crafted cap 1 ignored).
- AC4 no-row: `run-routes.test.ts` insufficient → 402, `select count(*) from runs` unchanged.
- REQ-BILL-5 golden: `lever-matrix.test.ts` off=314 ∈ [297,363], delta=1080=45×24.
- Single Paywall mount: `paywall.test.ts` source scan = 1 (run-sheet.tsx).

## Evidence report
- (Phase 6)

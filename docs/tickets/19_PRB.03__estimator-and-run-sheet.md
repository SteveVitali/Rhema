# PRB.03 — Estimate service and the run sheet (beta form)

- **Sequence:** 19 of 50
- **Phase:** RB — Review beta
- **base_branch:** current checkout (stacked PR chain)
- **Depends on:** P0.08 (run creation), P0.11 (holds/balances), P0.15 (instrumented estimator constants), PRB.01/PRB.02
- **Run:** `implement-spec spec=docs/tickets/19_PRB.03__estimator-and-run-sheet.md`

## Goal
The product's only paywall and consent gate, in its beta form: the stateless cached estimate
service with the claim pre-pass, and the run sheet (launcher shape) for Review / Revise /
Fact-check with rigor, venue + stage scope inputs, dollars-first estimate, the 1.5× cap, consent
thresholds, and the balance/house-credit line.

## Load
- Spec §5.6 end-to-end (sheet anatomy items 1–10; REQ-SPEC-16 creation model; REQ-IDE-13,
  REQ-CHAT-25, REQ-GROWTH-16), §14.4 (REQ-BILL-4 amended consent; REQ-BILL-5 signed deltas;
  REQ-BILL-6 freeze; the three insufficient-balance sentences §14.6), §14.1 (dollars-first,
  REQ-BILL-1 amended), §6.5 (rigor → flags; Advanced disclosure with per-phase toggles), §6.4
  (Confirm scope's re-priced estimate interaction — data from P0.10), ledger L11.
- Beta deltas: no plan upsells, no trial entitlement (house credits instead — REQ-BETA-14); scope
  card shows venue + stage (the beta's step-2 "scope" screen is this sheet + the informational
  scope card).

## In scope — deliverables
1. **Estimate service:** `POST /projects/:id/estimates` → `{estimate, cap, levers, claimCount?}`;
   immediate word-count-based figure refined ≤5 s by the cached Haiku-class claim pre-pass (cost
   absorbed, cached per draft version in `estimate_cache`); no `runs` row; emits `run.estimated`
   (REQ-SPEC-16); estimator constants from P0.15's instrumented data, versioned.
2. **Run sheet (launcher, not control panel):** top tier = title line, Rigor (Quick/Standard/Full
   board), estimate box ("≈ $5.60 · never more than $8.40" dollars-first; credits/cap/balance-after
   second line), Run button; collapsed row expands to Protocol (Essay only at beta) · Venue · Stage ·
   Model tier (small type) · Advanced per-phase toggles with signed deltas · Budget cap · Approvals
   policy; "Why this estimate?" line.
3. **Consent + insufficiency:** the >500 / >200-and-25% double-click rule with the per-user
   "don't ask under N" (max 1,000); insufficient balance → the three-sentence resolution panel,
   cheapest-fitting option primary; never silent billing (REQ-BILL-4; §14.6).
4. **Run click:** `POST /runs` with sheet-minted idempotency key; hold placed; sheet closes; run
   card appears with "spent 0 / cap"; frozen row per REQ-BILL-6; scoped-run estimate display
   deferred (no `@section` scoping in the beta UI; `scope` stays a run input).
5. **`AskButton`/`RunButton`** components with the estimate-prop lint (REQ-GROWTH-16); the sheet as
   the only `<Paywall>` mount (REQ-GROWTH-13 — trivially true at beta, asserted anyway).
6. **Obligation scope lines** (REQ-OBJ-6): "N open obligations will be checked" on Review; "this
   run addresses N open obligations" on Revise (data from P0.12).

## Out of scope
- Trial entitlement rendering ("Included") — P1.16. Palette/commands — P1.6. Variants — 1.x.
- The estimate's re-priced-at-scope-card blocking flow's UI card (PRB.05 renders gate cards).

## Acceptance criteria
- [ ] Estimate returns immediately with the provisional figure and refines in place ≤5 s; a run
      launched pre-refinement is capped from the provisional estimate (§5.6.1). *(deterministic)*
- [ ] Every lever change recomputes estimate/cap/time ≤100 ms from cached constants; Advanced
      toggles show signed deltas; REQ-BILL-5 AC: fact-check off on the 8k/45 golden draft moves
      ≈1,240 → ≈330 ± 10% (with measured constants, the analogous measured assertion).
      *(deterministic)*
- [ ] Consent second click appears exactly per the threshold rules incl. the 200-credit floor;
      "don't ask under N" honored ≤1,000 (REQ-BILL-4). *(deterministic)*
- [ ] Insufficient balance: the three sentences render; no run row is created. *(deterministic)*
- [ ] `run.estimated` fires from the estimate endpoint; no abandoned `runs` rows from sheet opens
      (REQ-SPEC-16). *(deterministic)*
- [ ] Dollars-first formatting everywhere on the sheet; credits second line; tokens nowhere
      (REQ-BILL-1). *(deterministic)*

## Requirement IDs to satisfy and stamp in the PR
REQ-SPEC-16 (service + sheet halves), REQ-IDE-13 (beta form), REQ-CHAT-25, REQ-BILL-1 (amended),
REQ-BILL-4 (amended), REQ-BILL-5, REQ-BILL-6, REQ-GROWTH-13, REQ-GROWTH-16, REQ-WF-3, REQ-OBJ-6
(sheet lines), ledger L11.

## Cross-cutting invariants — re-check before opening the PR
- The sheet is the only way a run is created and the only paywall (REQ-CHAT-25/REQ-GROWTH-13).
- Never surprise on money (principle 6); banned billing vocabulary lint (REQ-BILL-18).
- See 00_MANIFEST.md § Cross-cutting invariants.

## Notes
The full-IDE sheet (P1.6) restyles this component inside the pane system and adds palette entry
points, trial "Included", and scoped estimates — same contracts, no re-derivation.

# ADR-014: Charge what we meter; keep the free trial on derived interim terms; let users choose the tier

- **Status:** Accepted
- **Date:** 2026-09-30
- **Ticket:** ECON.1 (debit + calibration), EST.1 (tier + one estimator), ACT.1 (trial), ECON.2 (COGS + trial restore)
- **Requirement ids:** REQ-SPEC-32 (new); REQ-SPEC-8, REQ-IDE-13 (amended 2026-09-30); REQ-BILL-2, REQ-BILL-3, REQ-BILL-7, REQ-GROWTH-4, REQ-GROWTH-10, REQ-GROWTH-15
- **Spec:** §14.1, §14.3, §14.4, §5.6, §6.5, §15.2 (2026-09-30 notes); supersedes the D-PRB.16-5 practice for committed debits

## Context

§14.1 defines usage as proxy-metered provider list cost × the 1.4 platform rate, and §14.4 debits each phase's
actual cost against the hold. Prod does not do that:
- **A 1,003-word Quick/Base Review (2026-09-30)** was debited 632 cr, while its `usage_records` metered 1,625 cr.
- **STB.3's ten legs** committed $4.51 against $13.04 metered.
- **The 2026-09-22 D-PRB.16-5 ruling** ("cap-meter-only: uncommitted burn does not debit") normalized the gap. The
  platform absorbs roughly 60–70% of every run.

> **Correction note (2026-10-02, ECON.1 ground truth):** the 1,625 figure was NOT the meter of record. The
> seat-level L4 query summed `usage_records` across **all** sources — `proxy` 632 + `sdk_estimate` 553 +
> `sdk_stream` 440 = 1,625 — triple-counting the same tokens (divergence path D-A; fixed with `source='proxy'`
> filters). The run was debited **634** against a proxy meter of **632** — already metered within the
> pod-claim-floor's +2. The premise's direction stands (the committed-vs-metered divergence is real — D-B/C/D/E
> in the run ledger: completed-run under-debit `01M36663…` −134cr pre-DEF.2; cancelled/failed unbooked burn;
> late-arriving rows; the floor over-debit) but the specific "charged 632 against a 1,625 meter" framing was
> wrong — the gap on *completed* runs is the display defect handed to RPT.1, not a missing debit. STB.3's
> cancelled-run residue and the non-completed classes remain real absorbed burn this ADR governs.
> See `docs/build/runs/ECON.1.md` § Deliverable 1 and ADR-031 for the burn classification.

That same Quick run executed discourse and the second read, which §6.5's Quick preset turns off. Its cost therefore
overstates Quick and misstates the preset (PR-E6).

User-facing figures come from hand-modelled constants that disagree by 10–20×:
- **The pricing page:** "a ≤3,000-word piece on Base: Quick ≈ 170 cr".
- **The new-project card:** "≈ 5,231".
- **The run sheet:** "$37.21" at Standard/Balanced, "$10.15" at Quick/Base.

The sheet cannot set a model tier: `normalizeTier("")` always takes the rigor preset.

§14.3's trial is a free Standard Review of ≤6,000 words on Base, with a design COGS bound of ≈$5.70 list. The
measured cost of a much shorter run already exceeds that bound. The operator decided the free trial review stays and
delegated pricing.

## Decision

1. **Charge what we meter (REQ-SPEC-32(a)).** A run's committed debits equal its proxy-metered burn at the published
   rate, clamped at the cap.
   - Only three kinds of burn are absorbed: the above-cap overrun (§14.4), platform-fault refunds (REQ-SPEC-31;
     pipeline defects), and the trial entitlement.
   - ECON.1 finds and fixes the divergence path.
   - **Sequencing guard:** the metered debit ships behind a `debitMode` flag, **in the same deploy as** the
     calibrated caps (the next point), so that switching cannot turn every run into a cap death and trip the
     REQ-SPEC-24 circuit breaker.
   - The flip is an operator-paused change to what users are charged, preceded by notice to paid accounts. The
     spirit of REQ-BILL-2's 30 days applies unless the operator rules otherwise; there are few paying accounts
     today.
2. **Calibrate before charging (ECON.1; REQ-BILL-7).** ECON.1 owns the chain from instrumented cost cards
   (workflow × rigor × tier × size, measured after RES.1 restores research and with the §6.5 presets corrected) to
   the estimator refit to the caps, held in a durable calibration store. The targets (REQ-SPEC-32(c)): ≤10% of
   completed runs reach their cap, and the printed range contains the actual for ≥80%.
3. **One estimator for every surface (EST.1; REQ-SPEC-32(b)).** Protocol cards, the Timeline chip, the run sheet,
   the palette, pricing cost cards and landing figures all read it.
   - "What it covers" is recomputed from the cost cards (REQ-GROWTH-4), and will read smaller until COGS falls.
   - Until then, HOT.1 hides the false claims through a `claims` config, and their owners re-enable them.
4. **Plan anchors unchanged.** Free / Writer $20 / Studio $100 / Studio Max $200 / Team $40, the $0.01 credit, and
   the 1.4 rate.
5. **Interim trial terms (REQ-SPEC-8 amended; ACT.1).** The entitlement stays a **Standard** Review on **Base**.
   Quick is not a first review "in full" (§6.5: no second read, no discourse, 5-claim fact-check).
   - **Word cap:** derived from ECON.1's post-RES.1 cost cards. It is the largest cap whose p90 metered list COGS
     fits a **provisional $15 absorbed ceiling** per entitlement, verified to produce zero cap deaths at that cap.
     Below 1,500 words, the operator sets the ceiling.
   - **Daily kill switch:** $50/day (REQ-GROWTH-15).
   - **Unchanged:** the first-spend unlock checks (REQ-GROWTH-10), Base-only, 1 concurrent, and the 150-credit pocket.
   - **Restore on failure:** an entitlement consumed by an *Unverified* Review is restored.
   - **Copy:** it renders from the entitlement config, and ACT.1 owns the claim render model.
   - **Go-live and the return to §14.3:** going live is operator-paused. ECON.2 restores the §14.3 terms by config
     (operator-paused) when the p90 list COGS of a Standard/Base 6,000-word Review is ≤ $6.
6. **Tier choice (REQ-IDE-13 amended; EST.1).** The sheet shows and changes the model tier within plan rules
   (Free/trial: Base only), with defaults resolving project → account → plan. The chosen tier is frozen on the run
   (REQ-BILL-6).
7. **COGS reduction is ECON.2's.** It uses named levers, never cuts research below RES.1's floor, and has
   non-regression ACs. Prices fall because measured COGS falls, never the reverse.

## Consequences

- **Prices rise.** After the flip, users see honest per-run prices, roughly 2.5× today's effective price for the
  same run. That is the truthful state; the alternative is a loss per paid run that grows with success. The notice
  and the operator pause make it a conscious act.
- **The trial may shrink.** Its word cap may land below §14.3's 6,000 until ECON.2 succeeds. Each trial's cost is
  bounded, and so is each day's.
- **Cap deaths.** They are prevented by calibrating before charging, and monitored against the ≤10% target.
- **The ±2% proxy-vs-SDK SLO** stays a cross-check. The authoritative figure is the proxy meter (REQ-SPEC-11).

## Alternatives considered

- **Keep charging the modelled figure.** Hides a negative margin and violates §14.1 as written.
- **Switch debits without calibrated caps.** Near-universal cap deaths, and a circuit-breaker trip.
- **Raise plan prices now.** Treats the symptom, and the anchors are positioning (R6).
- **Drop the trial.** The operator kept it.
- **A Quick-rigor trial.** Not "in full" (§6.5).
- **Keep §14.3's terms unchanged.** Unbounded acquisition cost on open signup.
- **Raise the 1.4 rate.** Needs 30 days' notice (REQ-BILL-2), and is the wrong lever while COGS is ~3× design.

## Revisit trigger

- ECON.2 meets the REQ-SPEC-8 restore condition.
- Trial absorbed COGS exceeds $50/day on 3 days in a week.
- Paid conversion collapses after the flip.
- The calibration misses REQ-SPEC-32(c) for two consecutive weeks.
- A provider price change arrives (a new rate-table version).

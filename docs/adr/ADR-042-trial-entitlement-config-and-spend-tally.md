# ADR-042: The trial entitlement's numbers live in typed config — the word cap is DERIVED, the claim reads config at claim time, and the daily kill switch is projected + reconciled

- **Status:** Accepted
- **Date:** 2026-10-02
- **Ticket:** ACT.1
- **Requirement ids:** REQ-SPEC-8 (amended), REQ-GROWTH-15 (amended), REQ-SPEC-30, REQ-SPEC-32(b), REQ-BILL-4, REQ-POS-4/5
- **Spec:** §14.3, §14.2, §15.2, Appendix A.9
- **Consumes:** ADR-014 §5 (interim trial terms), ADR-015 §3 (the Unverified restore), ADR-016

## Context

The pre-ACT.1 trial had three correctness defects that compound:

1. **Hand-typed figures drifted from mechanics.** `pricing.json`'s `includedNote`,
   `eligibilityLine`, and the pricing page's "one included Review" copy were literals; the
   enforced cap (`trial_entitlements.word_cap`, frozen at provisioning) and the copy's 6,000-word
   claim were independent strings that could silently disagree — REQ-SPEC-32(b)'s "every claim
   rendered from the entitlement" was unmet.
2. **The word cap was asserted, never derived.** `wordCap: 6000` was pinned by a `pricing.ts`
   assertion, not computed from ECON.1's measured `cost_card_cells`. At measured post-RES.1
   Review·Standard·Base COGS the published 6,000-word promise breaches the provisional absorbed
   ceiling ($15) — the number had to be *derived* or honestly paused, not hand-waved.
3. **The $50/day kill switch measured the wrong figure.** `recordTrialSpend` charged the run's
   user-selected *cap* (a worst-case bound inflated by the circuit breaker) rather than its
   projected metered cost, and the counter had no reconciled arm — metered overage beyond the
   estimate could never lift the day. The migration's `credits` column was also calibrated in the
   wrong unit (250,000 ≈ $2,500/day of chargeable credits vs ADR-014's $50/day of list COGS).

## Decision

- **`pricing.json` is the single entitlement spec** (ADR-042 owns `trial.*`):
  `entitlement.{kind,wordCap,rigor,modelTier}`, `capCeilingUsd: 15`, `dailyCeilingUsd: 50`,
  `pocketCredits`, `projects`, `concurrency`, `audience`, `interim`, plus the note TEMPLATES
  (`includedNoteFmt`/`postTrialNoteFmt`/`eligibilityLine`) carrying `{cap}`/`{pocket}`/
  `{chatCredits}` placeholders — **no literal figures**. `trial-claims.ts` renders the shipped
  strings (`trialIncludedNote`, `trialPostTrialNote`, `sheetEntitlementLine`), so no surface can
  type a number the mechanics don't enforce.
- **`deriveTrialWordCap(costPoints, ceilingUsd)` is a pure derivation** over `{words,p90Usd}`
  cost-card points: the largest candidate whose high-percentile metered list COGS fits the
  ceiling. Under the 1,500-word floor it returns a named `below_floor` result (operator pause) —
  never a silent clamp. The published `wordCap` is the derivation's output on the ECON.1 curve
  (2,800 words at $14.95 p90 vs the $15 ceiling); a contracts test asserts the config value equals
  the derivation so the JSON number is provably derived.
- **The claim gate reads config at claim time.** `run-routes` enforces
  `PRICING.trial.entitlement.wordCap` — never the entitlement row's frozen-at-signup `word_cap` —
  so an existing `locked` row follows config with no data backfill. Same for the shape check
  (Review · Standard · Base).
- **The daily tally is projected + reconciled** (`trial_spend_daily` + migration 0051):
  - `credits` — claim-time PROJECTIONS: each entitlement hold books the run's *estimate*
    (`HoldArgs.projectedCredits`, set from `createRun`'s `estimateCredits`) inside the hold
    transaction; a refused hold rolls it back.
  - `reconciled_credits` — the system-pool sweep (`sweepTrialSpend` on `billing.period-tick`)
    recomputes `Σ greatest(runs.spent_credits, runs.estimate_credits)` over today's non-test
    entitlement runs. The aggregate never serves a user request (REQ-SPEC-30) — user paths touch
    only the compact counter row.
  - `paused_at` — the sticky trip marker. Set by the sweep (or persisted alongside a crossing
    projection); refuses new unlocks/holds until UTC rollover. `recordTrialSpend`/`gateTrialUnlock`
    read `max(credits, reconciled_credits)` + `paused_at`.
  - `dailySpendCeilingCredits` derives at config load as `ceil(dailyCeilingUsd × platformRate ×
    100)` = 7,000 proxy credits for $50 — the counter is in proxy-metered list-COGS units, the
    same units the reconciliation writes.
- **Flagged test tenants (`workspaces.is_test`, operator-set, JOURNEY.1) are exempt** from the
  daily ceiling and from the fingerprint one-trial-per-device accounting: the harness must never
  trip (or be blocked by) the real-user kill switch. The fingerprint exemption is scoped to
  bindings held by *flagged* workspaces only — an ordinary second account reusing a fingerprint
  still trips `fingerprint_seen`.
- **Entitlement-run absorbed burn leaves the platform circuit breaker** — trial COGS is a priced
  subsidy bounded by the $50/day switch, not the absorbed-overrun drift signal
  (`circuit-breaker.ts` excludes `hold_bucket='trial_pocket'`/entitlement-marked rows).

## Consequences

- Every user-visible trial figure is regenerated from config; a hand-edit to a number in
  `pricing.json` (cap, pocket, ceilings) flows to every surface and to the gates — and a copy
  string can no longer drift from the enforced value.
- Restoring the original §14.3 terms is a config change alone (the everyone-flip + cap restore are
  pure `pricing.json` diffs recorded in the ledger — no code deploy).
- A below-floor derivation surfaces as a named pause for the operator (the ceiling is the input,
  never a clamp).
- The reconciled arm closes the metered-overage gap: a run that burns past its estimate lifts the
  day total at the next period tick even if the projection under-booked it.
- The entitlement row's `word_cap` column is now provenance (what the row was provisioned under),
  not enforcement — enforcement is config. Documented; no backfill needed.
- `below_floor`/`paused` are honest states, not crashes — the sheet/billing renders name them.

## Alternatives considered

- **Keep the row-frozen `word_cap` as the enforced cap** — rejected: an interim-cap change would
  need a data backfill mid-window and the row can't follow config for entitlements provisioned
  under older terms.
- **Charge the cap, not the estimate** — rejected: the cap is user-inflated (and breaker-doubled);
  charging it would trip the $50/day switch on handfuls of runs and starve the trial on day one.
- **Recompute the day total inside the hold's tenant tx** — rejected (REQ-SPEC-30): the aggregate
  over `runs` must never serve a user request; the sweep rides the worker's system-pool tick and
  user paths read only the counter row.
- **Hard-deny on ceiling breach instead of `paused`** — rejected: a daily budget is transient by
  construction; `paused` + tomorrow's fresh row is the honest semantic (and the phone challenge
  path stays distinct).

## Revisit trigger

ECON.2's restore of the full §14.3 terms (6,000-word Review entitlement, real-user audience), or
any measured cost-card curve that pushes the derivation under the 1,500-word floor at the $15
ceiling — at which point the operator re-sets `capCeilingUsd`/`dailyCeilingUsd` rather than
accepting a below-floor ship.

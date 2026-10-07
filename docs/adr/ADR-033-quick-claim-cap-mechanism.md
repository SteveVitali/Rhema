# ADR-033: Quick Review's 5-claim cap — server-frozen input, oracle-bound; findings cap deferred

- **Status:** Accepted
- **Date:** 2026-10-02
- **Ticket:** ECON.1
- **Requirement ids:** REQ-SPEC-2, REQ-BILL-6; §6.5 conformance (PR-E6)
- **Spec:** §6.5 (rigor table + the named Quick profile: "claim cap 5, findings cap 40"; ledger C22)
- **Related:** ADR-031 (metered charging), invariant #8 (presets change only through sanctioned
  inputs; no skill-text edits)

## Context

§6.5 limits a Quick Review's fact-check to "the 5 most load-bearing claims" and its findings to 40,
both implemented nowhere (PR-E6). The ticket's constraint: land them through the manifest's
*sanctioned inputs* only — the vendored `editorial-review` skill is pinned upstream
(`upstream-pin/`) and its text is a drift-gated artifact (invariant #8). Its declared inputs are
`verification`, `discourse`, `second_read`, `phase`, `scope`, `changed_since`, `prior_review`,
`resume_from`, `sidecar`, `phase_output` — **no `claim_cap`, no `findings_cap`**. Editing the skill
to add one is exactly what the constraint forbids.

## Decision

**The 5-claim cap is enforced server-side through the frozen-inputs channel, with the pod's copy
advisory only.** `RigorDefault.claimCap = 5` for Quick Review (`QUICK_REVIEW_CLAIM_CAP`), and:

1. `buildEstimate` prices `min(claims, claimCap)` — a 23-claim Quick review prices five claims of
   verification (the same clamped `claimCount` rides `input_snapshot` → the claim-scaled egress
   budgets in `authorWebToolPolicy` bound on five claims of fetch/search).
2. `run-routes` freezes `inputs.claim_cap = 5` **server-authored** at creation — a client-supplied
   `claim_cap` is stripped for uncapped rigors (otherwise a crafted input could make a Standard
   run's oracle pass on one checked claim). The `fact_check`-off toggle drops it.
3. The completion oracle's `claim_rows_gte_inventory` passes at
   `rows ≥ min(inventory, claimCap)` — a Quick review is *complete* once its five load-bearing
   claims are checked, not when all 23 inventoried are.
4. The frozen input rides the phase prompt's `key=value` lines like every declared input, so the
   skill *sees* `claim_cap=5` — but enforcement never depends on the model reading it: the oracle
   is the bound, the budgets are the bound, the estimate prices the bound.

**The findings cap 40 is deferred** (`D-ECON.1-2`): the skill has no findings-cap input and no
server-side mechanism can truncate findings without editing delivered artifacts — a user-facing
correctness risk no invariant permits here. Compensating control: the cap's *purpose* (bound Quick
burn) is already served — the claim cap + dropped phases bound the review's cost; the finding count
is a letter-shape nicety, not a billing lever. ECON.2 owns revisiting it if the skill gains a
sanctioned input upstream.

**Tier routing** (the third §6.5 assertion): the roster's one-notch-down research mapping already
implements the table — Base tier → Haiku research subs, Balanced → Sonnet (= Base's main), Frontier
→ Opus (= Balanced's main) — matching "Standard: Balanced (Base for research phases)" and
"Full board: Frontier (Balanced for research)". Asserted in `roster.test.ts` against
`roster.ts` live.

## Consequences

- A Quick run's frozen inputs now opt out discourse + the second read (the stale-`toggleKeys` path
  is severed by the `toggleRigor` sentinel) AND cap its fact-check — the sheet, the estimate, the
  oracle, and the egress budgets all read the same five.
- The cap is honest to the user *because* the letter labels Quick reviews ("says what the full
  board adds" — §6.5); claims beyond five are inventoried, not verified, and the letter says so.
- No skill text changed — `check-upstream-diff` stays green.

## Alternatives considered

- **Edit the vendored skill to add `claim_cap`/`findings_cap` inputs.** Forbidden (invariant #8);
  the drift gate exists to keep the port auditable. Rejected.
- **Post-process the claim ledger down to five rows.** Edits a delivered artifact (a lie about what
  was checked) — rejected; the oracle bound is the honest mechanism.
- **Findings cap via a post-delivery trim.** Same artifact-editing problem, plus it can strand
  obligation links into trimmed findings. Deferred instead.
- **A new manifest `optOutFlag` for claims.** The flags are phase-granular on/off; a *count* is a
  different shape — the frozen-input channel is the right seam.

## Revisit trigger

- Upstream `editorial-review` gains a claim-limit input — land it through the sanctioned channel
  and drop the oracle-side clamp.
- Findings > 40 appears on a Quick letter and the operator rules it user-visible noise —
  `D-ECON.1-2` reopens.
- A Quick review's metered burn exceeds its card's p95 with the cap on — the cap isn't binding the
  phases that matter.

## Addendum — 2026-10-02 (preset precedence, found live by the N6 walk)

The §6.5 preset must bind against **defaults**, not just the user. Live evidence (run
`01M3XN53DEJY0NRJTTK2QDH8Z6`): the essay protocol seed pins `phase_defaults {discourse:true,
second_read:true, …}`, and the launch layering (`rigor < protocol < stored < sheet`) let those
seeded `true`s re-enable both phases on a `rigor=quick` run — priced as Quick's five-phase shape's
conformance was broken exactly where a user could not see it. The rule is now:

> A seeded protocol's `phase_defaults` and a project's stored phase-defaults may only ever
> **disable** a phase the rigor preset runs. A `true` that contradicts the preset's `false` is
> dropped — defaults never outrank a preset. The sheet's explicit per-run toggle is the only
> layer that may turn a preset-disabled phase back on.

Rationale for the asymmetry: a protocol declaring `discourse:false` (Memo) is a constraint the
essay shape may not lift; a protocol declaring `discourse:true` (Essay) is already the Standard
default — the only thing it could ever do is silently un-Quick a Quick run. Pinned in
`run-routes.test.ts` ("ECON.1 — §6.5 …"); recorded as run-ledger finding F-ECON.1-1.

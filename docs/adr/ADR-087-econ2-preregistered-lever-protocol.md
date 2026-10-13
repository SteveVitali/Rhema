# ADR-087: ECON.2 pre-registered lever-measurement protocol — fixtures, arms, adoption rule, offline ceilings

- **Status:** Proposed
- **Date:** 2026-10-04
- **Ticket:** ECON.2
- **Requirement ids:** REQ-SPEC-32(c), REQ-SPEC-8, REQ-BILL-7, REQ-GROWTH-4, REQ-ARCH-9
- **Spec:** §14.1, §14.3, §14.4, §15.2, §6.5, §12.3, §12.2, §12.8/§8.4; ADR-013/014/015/016/033/085

## Context

ECON.2 turns five structural COGS drivers into named levers (L1–L5), each with a server-side on/off
flag frozen on the run, measured ON vs OFF on the pipeline CITE.1 landed, and adopted only when the
measured saving beats noise **and** every non-regression AC holds. The ticket requires the protocol
to be committed BEFORE any spend, the offline ceilings computed at $0 first (a lever whose offline
ceiling cannot beat run noise is not spent on), and every skipped leg recorded as a deferral.

Two environmental constraints bound this registration (measured 2026-10-04, run ledger §
Environmental state): the Pulumi Cloud credential is expired (`PULUMI_ACCESS_TOKEN` refuses
non-interactively; `pulumi login` is an operator act — same block as D-CITE.1-1), and the weekly
paid-journey guard measured **$58.08 ≥ the $5 ISO-week cap**, refusing flagged-tenant legs until
the 2026-10-05 00:00 UTC reset. Every metered leg below is therefore expected-deferred at commit
time; the protocol exists so the legs execute verbatim when the blocks clear.

## Decision — the lever mechanism

Each lever is a boolean on a `CogsLevers` set resolved **server-side at run creation** and frozen
verbatim onto the run (`runs.inputs.cogsLevers` for consumption + `input_snapshot.cogsLevers` for
the REQ-BILL-6 measurement record). Resolution:

- the deploy's `COGS_LEVERS` env JSON supplies the server default set (unset ⇒ all off —
  byte-for-byte today's behavior);
- on `workspaces.is_test` tenants a client-supplied `inputs.cogsLevers` may override per key —
  the measurement ON/OFF arms (same gating precedent as `force_unverified`);
- on every non-test tenant a client-supplied value is discarded and the server default freezes.

`runspec` reads the frozen set, strips it from the model-facing prompt inputs, and applies the
resolved per-phase values; the worker reads it at provisioning for the L5 web-tools policy. Every
consumer treats an absent/malformed value as all-off — pre-ECON.2 runs are indistinguishable.

## Decision — the five levers and their pre-registered arms

| lever | flag key | OFF arm (today) | ON arm (candidate, pre-registered) | where it acts |
|---|---|---|---|---|
| L1 — per-phase transcript bound | `l1PerPhaseWindow` | `autoCompactWindow = 80_000` every phase | per-class table `{research: 80_000, judge: 48_000, generate: 120_000, package: 64_000}` | `settings.autoCompactWindow` per phase session |
| L2 — fan-out shape | `l2FanoutShape` | batch ≤ 5 items, ≤ 5 concurrent | batch ≤ **8** items, ≤ **3** concurrent (fewer, larger) | `research_fanout` input text + `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION` |
| L3 — per-phase routing | `l3PhaseRouting` | `mainModelForTier(tier)` every phase | §12.3 cell per `(tier, phaseClass)` (Balanced/Frontier research+package → Sonnet/Opus) | `options.model` per phase |
| L4 — cache TTL | `l4CacheTtl5m` | `ENABLE_PROMPT_CACHING_1H` set (1-h TTL) | key omitted (CLI default ≈5-m TTL) | agent env per phase |
| L5 — research above floor | `l5ResearchEnvelope` | `authorWebToolPolicy` current constants | floors held at the UNTUNED absolute counts; above-floor headroom halved; `fetchMaxContentTokens` 8,000 → 4,000 | provisioning `webTools` policy |

L1's `research` cell stays 80 000 on purpose: the auto-compaction setting applies session-wide
**including researcher subagent sessions**, and one bounded batch's working set was measured ≈ 71 K
(16 K envelope + 5×8 K pages + ~15 K notes) — tightening research below the subagent working set
would thrash the L2 contract it protects. The per-phase spread is where the lever is exercised
(judge tighter, generate wider).

L2's ON arm is the "fewer, larger" candidate: 8-item batches at ≤3 concurrent repays the ~18 K
subagent seed fewer times in parallel, at the cost of deeper in-session growth per researcher. The
opposite direction ({3,5}) is a legal second measurement if the first is inconclusive.

L3 encodes §12.3 verbatim — Base resolves every class to Sonnet (no in-table cheaper route, as the
ticket predicts), so L3's measured arm runs at **Balanced** where research+package phases move
Opus→Sonnet (2.5× input/2.5× output cheaper); Frontier's move is Fable→Opus (2×). Scoped queries
(second-reader and audit agents) keep `mainModelForTier` — independence contexts are invariant.

L4 is **TTL-only by construction**: prefix order is assembled inside the vendored CLI's system-prompt
path, not by the harness — the ticket's own escape hatch applies and this ADR records the deviation.
The offline check (below) verified every lever-relevant request field is already phase-invariant, so
the prefix is already stable; the lever is purely the write-premium-vs-reuse-window choice.

L5 never touches the floor: `authorResearchFloor`'s outputs are recomputed from the UNTUNED budgets
and frozen absolute; only the non-reserved headroom (`budget − floor`) and the per-page context cap
are tuned. RES.1's floor tests stay green unmodified; CITE.1's `backfillFetchBudget` is unchanged.

## Decision — the measurement protocol (pre-registered before spend)

**Meter of record:** proxy `usage_records.list_cost_usd` (`source='proxy'` only — the ECON.1 D-A
ruling). For L4, `cache_write_tokens` are reported at the table's flat 1.25× but the TRUE 1-h write
price is 2× — the measurement script reports the TTL-adjusted figure alongside (see caveats).

**Fixtures.** Phase-pinned lever legs run on `packages/journeys/fixtures/planted-error-excerpt.md`
(267 words — RES.1's probe fixture). The ON-arm non-regression Review runs the full
`planted-error-essay.md` (1 029 words, Standard/Base, jrn-a test tenant). The restore-evaluation
fixture is a NEW committed synthetic essay, `packages/journeys/fixtures/restore-eval-essay.md`
(≈6 000 words, authored at Stage A — ADR-016 rules: synthetic, no real user content, same
public-library domain as the planted-error fixtures for comparability, factual claims a
verification phase can actually check).

**Arms and n.** Cheapest-first, one OFF/ON pair per lever (n = 1 per arm) — the ≤ $19 lever-leg
envelope cannot afford more without crowding out the ON-arm Review. A pair is two runs on the same
fixture + phase pin + rigor + tier, differing ONLY in the one lever flag. Ordering per the ticket:
L5 (≤$3) → L4 (≤$3) → L1 (≤$4) → L2 (≤$4) on phase-pinned runs of the excerpt; L3 (≤$5) at
**Balanced** on the same pin; ON-arm Review ≤ $12; restore confirm ≤ $9 only if the refit predicts
p90 ≤ $6.

**Phase pin.** Lever legs pin `inputs.phase` (REQ-SPEC-13) to the phase the lever moves: L1 → a
generate-class phase (`letter`); L2/L5 → `verification`; L4 → `verification` (the heaviest-cache
phase); L3 → `verification` at Balanced (the class where the route moves).

**Spread benchmark.** The measured matched-pair noise floor is the RES.1 probe pair on the same
fixture class: **$3.31 vs $4.17 — a ~23 % spread**. A lever adopts only when its ON arm meters
below `OFF × (1 − 0.25)` — the saving must exceed the observed pair noise with margin. Where the
measured delta is smaller or ambiguous, the lever is rejected (not re-run to fish for a pass) and
the candidate is recorded.

**Stop/skip rules.** (a) `journeySpendThisIsoWeek` is re-measured before every flagged leg — a
refusal skips the leg with its reason recorded. (b) A leg whose derived cap exceeds its remaining
budget is skipped, never cap-raised. (c) Round-3 cumulative ≈ $100 pauses the chain; $200
hard-stops. (d) A lever whose offline ceiling cannot beat the noise floor is not spent on — per
the offline table below, **L4's 5-m arm is predicted to lose** and its live leg is recorded as
skipped-on-offline-ceiling (the deferral carries the math; if the L1/L2 legs reveal cross-phase
cache gaps the ceiling math missed, the leg may still run).

**Non-regression gates (any miss reverts the implicated lever to OFF):** planted error *Contradicted*
with a fetched source (N6); verification coverage ≥ RES.1's baseline and no *Unverified*; citation
completeness ≥ CITE.1's measured baseline class (the pre-deploy canonical 1.0 aggregate stands as
the bound — the Stage-B probe aggregate rides D-CITE.1-5); second read + discourse ran (Standard);
Σ debits ≤ cap; §6.5 toggles/second-read rule unchanged (the deterministic snapshot test).

## Decision — offline ceilings (computed at $0 before spend; ADR-013 rules — no paid leg yet)

Inputs: the PRB.23-measured fixed envelope ≈ **65.1 KB ≈ 16.3 K tokens** (tool schemas + system +
roster); v1 rates Sonnet $2/$10, Opus $5/$25, Fable $10/$50; cache read 0.1× input, write 1.25×
(1-h true price 2×); the subagent seed ≈ envelope + batch prompt ≈ **18 K tokens**.

| lever | offline ceiling per Standard run (7 phases) | verdict vs ~23 % noise |
|---|---|---|
| L1 | envelope unchanged; the window only bounds transcript resend. On the 267-word fixture a judge phase's transcript rarely reaches 48 K — the measurable effect concentrates on `generate` (120 K avoids a mid-write compaction ≈ one ~70 K summary request ≈ $0.10–0.14 saved per avoided compaction) and on any phase whose session exceeds the OFF window. Ceiling ≈ **≤ $0.30/run** — inside noise | leg runs only as the cheapest confirmation; likely adopted-or-rejected on the full-review read rather than the pin |
| L2 | seed saving {8,3} vs {5,5}: at 4 researchers ≈ 2×18 K vs 4×18 K tokens ≈ 36 K read-priced ≈ **$0.007** — negligible; the real variable is in-session resend growth, unmeasurable offline | leg justified (cheap); adoption decided by measured in-session cost, not the seed math |
| L3 | Balanced verification phase, Opus→Sonnet: 2.5× cheaper per token. If research-class spend is ≥ 50 % of a ~$4 leg, ceiling ≈ **$1.2–1.5/leg** — the largest lever | leg justified; expected to pass |
| L4 | 1-h arm: 1 write (16 K×2×$2/M ≈ $0.064) + 6 cross-phase re-reads ≈ $0.083/run. 5-m arm: ~7 per-phase writes (16 K×1.25×$2/M ≈ $0.040) ≈ $0.28/run — phases run minutes apart so a 5-m entry expires between sessions. **5-m predicted ≈ $0.20/run WORSE** | **skip the paid leg** — offline ceiling cannot beat noise in the ON direction; lever ships OFF (1-h stays) unless later evidence reopens |
| L5 | fetchMaxContentTokens 8 K→4 K: per page worst-case −4 K tokens ≈ −$0.008 at Sonnet input, amplified by resend; the probe's ~16–26 fetches ⇒ ceiling ≈ **$0.15–0.40/run** + the halved non-research headroom (a bound, not a saving) | leg justified (cheapest); coverage AC guards the per-page cut |

## Decision — restore evaluation (REQ-SPEC-8, emit-only)

The condition — p90 metered list COGS of a Standard/Base 6 000-word Review ≤ $6 — is evaluated on
the refit store (the `cost_card_cells` of record; ECON.1's `econ1@2026-10-02` fit, 97 observations /
43 cells, zero admissible for cap refit) plus the live estimator. The $0 read at commit time:
`buildEstimate` prices review/standard/base at 6 000 w at **2 835 cr ≈ $20.25 list** — the bound
needs ~70 % COGS reduction across every measured surface, far beyond any single-lever outcome.
**Verdict recorded at Stage A: NOT MET on current evidence; the interim 2 800-word terms stand;
no `wordCap: 6000` config change is staged.** The confirm leg stays conditional — it runs (≤ $9)
only if a post-leg refit brings the prediction under $6. Measured gap + next lever candidates are
in the run ledger; candidates recorded: per-request envelope shrink beyond PRB.23's BASE_TOOLS cut,
research-loop restructuring (fewer per-claim round-trips), Haiku-class research main contexts inside
the §12.3 research row, the 1-h cache-write metering correction (rate-table amendment), and
multi-week organic admissible samples for a real p90 rather than an extrapolation.

## Consequences

- Every leg's shape, cap, fixture, and adoption threshold exists before any dollar moves; a refused
  or skipped leg is evidence-shaped, not silently dropped.
- The lever mechanism is fully reversible per run (frozen flags) and per deploy (env default) —
  a lever that fails live reverts by flipping the frozen flag to OFF.
- L4's TTL-only form is recorded; the drift gate (`check-upstream-diff`) stays green because no
  skill text moves.
- The restore evaluation is honest-negative at commit time — interim terms stand — and becomes a
  mechanical re-check the moment the refit store moves.

## Alternatives considered

- **Per-request lever values instead of per-run flags** — rejected: the ticket names the run-frozen
  flag (`REQ-BILL-6` spirit); finer control adds a second resolution surface for no measured need.
- **n ≥ 2 per arm everywhere** — rejected: the ≤ $19 lever envelope cannot fund it; one clean pair
  per lever plus the 23 % measured spread benchmark is the honest bound the budget allows.
- **Shrinking the RES.1 floor itself for L5** — rejected outright: the ticket and REQ-SPEC-31 both
  forbid it; only the above-floor portion tunes.
- **Editing rate-table v1 so 1-h cache writes price at 2×** — rejected: a version is never edited in
  place (REQ-BILL-2); the gap is logged as a candidate amendment instead.

## Revisit trigger

Reopen when (a) the deploy + weekly-guard blocks clear and the legs run — each lever's adopt/reject
verdict lands as an amendment dated to the measured pair; (b) the refit store gains admissible
Standard/Base observations — the restore evaluation re-runs mechanically; (c) the CLI's prompt
assembly becomes harness-visible — L4's ordering half becomes implementable; or (d) an operator
approves the rate-table amendment pricing 1-h cache writes at 2×.

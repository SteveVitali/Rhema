# ECON.2 — COGS reduction: named levers, measured on/off, with non-regression ACs

- **Sequence:** 83 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** money
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** CITE.1, ECON.1, RES.1, EST.1, ACT.1
- **Scope (one line):** an instrumented COGS-reduction program over five named levers (transcript bounds, the verification fan-out, per-phase routing within the tier, skill-text/prompt caching, research above RES.1's floor), each measured on and off. The work is guarded by non-regression ACs, then the cost cards and `pricing.json` are re-derived through ECON.1's store, and the REQ-SPEC-8 restore flip is prepared (operator-paused).
- **Spec §§:** 14.1, 14.3, 14.4, 15.2 (the 2026-09-30 notes), 6.5 (rigor presets), 12.3 (model routing by phase class), 12.2 (subagents, cache TTL), 12.8 / 8.4 (REQ-SPEC-31 non-regression)
- **REQ coverage:** REQ-SPEC-32(c) (primary), REQ-SPEC-8 (the restore flip), REQ-BILL-7, REQ-GROWTH-4 (re-derived "what it covers"), REQ-ARCH-9 (routing within the capability table) (stamp in the PR)
- **Absorbs (backlog):** BL-13 (churn half: PR-E5, OF-prb21-review-cap-uncompletable, D-PRB.21-1's pricing residual, X-unit-economics)
- **Run:** `implement-spec spec=docs/tickets/83_ECON.2__cogs-reduction.md`
- **Gate status:** the REQ-SPEC-8 restore flip is operator-paused (it returns the trial word cap to 6,000 and changes what the trial covers). Any lever that routes outside §12.3's table, changes a §6.5 preset, or relaxes a spec target is an operator-paused spec amendment and is not in this ticket. A new test-tenant credit grant is a one-off prod data write (conditional pause). Everything else sits within the round-3 standing authorization (ADR-013).
- **Live stage:** Stage A is code, flags, tests and offline token accounting ($0). Stage B is lever legs plus the
  non-regression Review plus the restore confirm, ≤ $30 metered (per-leg caps below).


> **Amended 2026-09-30 (operator — round-3 spend limit: hard ≤ $200, target ≤ $100):** this ticket's Stage B metered spend cap is **≤ $30** (was ≤ $40); aim for ≈ $15. Run legs cheapest-first and stop once the acceptance evidence suffices; where a leg plan below sums past the new cap, drop the lowest-priority legs and record each dropped leg as a `D-ECON.2-<n>` row (never overspend). The orchestrator pauses the chain when round-3 cumulative metered spend reaches $100 and hard-stops at $200 (LEDGER GATE DECISIONS 2026-09-30, D6 revised).

## Goal
Under charge-what-we-meter (ADR-014), prices fall only when measured COGS falls. The 2026-09-30 Quick/Base Review
of 1,003 words was debited 632 cr against 1,625 cr metered (≈ $11.60 list); the STB.3 memo review, 447 against 1,339.
The design bound for a 6,000-word Standard/Base trial Review is ≈ $5.70 list (§14.3). PRB.22–25 bounded research and
the per-request envelope; what remains is structural:
- per-phase transcript accumulation (PRB.24)
- verification's research fan-out: 4 parallel `researcher` subagents on the 2026-09-30 run, each re-paying its seed
  context
- one model per run for every phase class, while §12.3 routes by phase class
- a ≈ 65 KB stable prompt re-sent on every request (PRB.23), under a 1 h cache TTL whose write premium may not pay back

This ticket turns each of these into a **named lever with an on/off flag**. Each is measured on the pipeline CITE.1
left, and shipped ON only when it saves money beyond noise **and** every non-regression AC holds. Cost cards and
`pricing.json` are then re-derived through ECON.1's calibration store. If the restore condition is met (p90 list COGS of
a Standard/Base 6,000-word Review ≤ $6), the §14.3 trial terms are prepared behind the operator's pause.

## Load (read these — do not re-read others)
- `docs/adr/ADR-014` (§7: COGS is ECON.2's; the restore condition), `ADR-015` (the floor), the spec A.9 note (REQ-SPEC-8,
  REQ-SPEC-32), §6.5 table, §12.3 table, §14.3 COGS-bound row.
- ECON.1's ADR and its calibration-store module (cost cards; fold; cap derivation; the calibration report).
  `packages/protocols/src/estimator.ts` (~472 `foldInstrumentedRun`). `packages/contracts/src/domain/pricing.json` +
  `pricing-page.ts` (cost-card terms). EST.1's one-estimator API; ACT.1's entitlement config + claim render model.
- **L1:** `packages/engine/src/options.ts` ~85 `TRANSCRIPT_COMPACTION_WINDOW_TOKENS = 80_000`, ~190 `autoCompactWindow`.
  **L2:** `packages/orchestrator/src/runspec.ts` ~462–477 `research_fanout` (≤ 5 items/batch);
  `packages/engine/src/scrubbed-env.ts` ~72 `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION`; `options.ts` ~195.
  **L3:** `packages/engine/src/roster.ts` ~27–45 `MAIN_MODEL`/`RESEARCH_SUB_MODEL`; `options.ts` ~179
  `model: mainModelForTier(tier)` (one model per run today); the manifests' `phaseClass`.
  **L4:** `scrubbed-env.ts` ~71 `ENABLE_PROMPT_CACHING_1H`; `options.ts` ~139 `cacheControlTtl`.
  **L5:** `packages/orchestrator/src/allowlist.ts` ~83–111 `RESEARCH_*`, `FETCH_MAX_CONTENT_TOKENS`;
  `apps/egress-proxy/src/url-policy.ts` ~23–36; RES.1's floor.
- `docs/build/runs/PRB.23.md`, `PRB.24.md` (envelope and accumulation measurements); `docs/build/runs/CITE.1.md`
  (the OFF-arm pipeline, completeness figures); `usage_records` columns (`step_id`, `subagent_label`, `model`,
  `cache_write_tokens`, `cache_read_tokens`, `searches`, `fetches`, `list_cost_usd` — `0002_schema.sql` ~215).

## In scope — deliverables
1. **Lever flags + a measurement harness (REQ-SPEC-32(c)).** Each lever L1–L5 is a server-side config flag frozen on the
   run (REQ-BILL-6 spirit — the run records which levers were on). A measurement script reads `usage_records` by
   `step_id`/`subagent_label` and reports, per phase, requests, input/cache-write/cache-read/output tokens, fetches,
   searches and list $. It compares an ON run against its OFF pair on the same fixture, rigor and tier.
2. **The five levers.** Each has its own flag and tests. Each stays within §6.5 and §12.3.
   - **L1 — per-phase transcript bound.** A per-phase `autoCompactWindow` in place of one run-wide 80K. It is tighter
     for research-class seats and wider for synthesis (letter) phases. Measure compactions (`context.compacted`), and
     measure cache-read per request against the compaction summaries' own cost.
   - **L2 — verification fan-out shape.** Batch size and concurrency for `researcher` subagents: fewer, larger batches
     against more, smaller ones. Measure seed-context tokens × subagent count against in-session growth.
   - **L3 — per-phase model routing within the tier (REQ-ARCH-9).** Route by the manifest's `phaseClass` per
     §12.3's table in place of `mainModelForTier` for every phase (for example, Balanced research phases go to
     Sonnet 5, and package phases to Sonnet 5 at Base/Balanced). On Base the table leaves no cheaper in-table route
     beyond the Haiku research subagents, so the effect is expected on the Balanced and Frontier cards. The proxy
     allowlist and the rate table stay aligned; the roster-allowlist test extends to per-phase ids.
   - **L4 — skill-text/prompt caching.** Order the stable prefix (skill text, schemas, roster) before phase-variable
     input lines so that phases and subagents hit one cache entry. Choose the 5 min or the 1 h TTL by measured re-use
     (cache-write premium against read savings). The skill text stays byte-identical (invariant 8; the drift gate
     stays green).
   - **L5 — research above the floor only.** Tune `RESEARCH_*` and `fetchMaxContentTokens` **only in the portion above
     RES.1's reserved verification floor**. RES.1's floor test stays green unmodified.
3. **Offline accounting first ($0).** L4 (prefix bytes, cache-eligible share) and L2/L1 (seed-envelope size per
   subagent/phase) are sized from token accounting before any spend. A lever whose offline ceiling cannot beat run
   noise is not spent on.
4. **Adopt and re-derive (REQ-SPEC-32(c), REQ-BILL-7, REQ-GROWTH-4).** Levers that pass ship ON by default. The cost
   cards (workflow × rigor × tier × size) are refit through **ECON.1's store** — its fold, and its cap derivation under
   the REQ-BILL-7 multiplier rules. `pricing.json`'s derived terms are regenerated, "what it covers" re-renders
   through ACT.1's claim model, EST.1's estimator reads the result, and the contract tests over every price surface
   stay green. The plan anchors, the $0.01 credit and the 1.4 rate are **unchanged** (ADR-014 §4). ECON.1's
   calibration report is regenerated on the new cards.
5. **The REQ-SPEC-8 restore evaluation (operator-paused flip).** Evaluate the condition on the refit card's p90 for
   Standard/Base at 6,000 words. If that predicts ≤ $6, run one confirm Review on a 6,000-word fixture with its cap at
   1.5 × $6 = $9 list; a cap death is itself evidence the condition is not met. If the condition is met, stage the
   entitlement-config change back to `wordCap: 6000` and record the evidence in LEDGER GATE DECISIONS for the operator
   to flip. If not, record the measured gap: the interim terms stand, and that is not a failure.

## Out of scope
- **ECON.1:** debit mode, the metered-debit flip, the calibration-store design and the cap-derivation rules. They are
  consumed here.
- **CITE.1:** the citation mechanism. ECON.2 may not weaken it.
- **RES.1:** the research floor. It is never cut.
- **ACT.1 / EST.1:** the trial's interim-term derivation and the one-estimator surfaces.
- **Operator-paused spec amendments:** any change to §6.5 presets, §12.3's routing table, the plan anchors or the 1.4
  rate. A lever that needs one stops and is recorded as a `D-ECON.2-n` row plus a proposal.

## Acceptance criteria
- [ ] Each lever L1–L5 has an on/off flag frozen on the run and a unit test that fails if the flag is ignored. L3's
      test proves every phase class resolves to its §12.3 cell for every tier, with no resolved id off the proxy
      allowlist or unpriceable. L4's proves the staged skill text is byte-identical with the lever on
      (`check-upstream-diff` green). L5's proves RES.1's verification floor is unchanged with it on. *(deterministic)*
- [ ] **Non-regression — presets.** A snapshot test over the §6.5 table fails if any lever flips a phase toggle or
      the second-read model rule for any rigor: Standard keeps discourse and the same-tier second read, Full board
      keeps the different-family second read, and Quick runs neither. *(deterministic)*
- [ ] Before any spend, the ADR pre-registers the measurement protocol: the fixture per lever, n per arm, and the
      adoption rule (for example, the saving exceeds the OFF arm's observed spread). Offline accounting (item 3) is
      in the run ledger. *(agentic)*
- [ ] **Stage B, ≤ $30 metered, cheapest-first:** lever legs ≤ $19 in total (L5 ≤ $3, L4 ≤ $3, L1 ≤ $4 and L2 ≤ $4
      on phase-pinned runs of the ≤ 300-word fixture; L3 ≤ $5 at Balanced); the ON-arm Review ≤ $12 (a full
      Standard/Base Review of the planted-error essay on a JOURNEY.1 test tenant); the restore confirm ≤ $9, only if
      the refit predicts p90 ≤ $6. A leg whose derived cap exceeds its remaining budget is skipped with a reason, never
      cap-raised. Per-lever on/off deltas, with n and spread, are in `docs/build/runs/ECON.2.md`. *(agentic)*
- [ ] **Non-regression — live**, on the ON-arm Review with every adopted lever on: the planted error comes back
      *Contradicted* with a fetched source (N6 stays green); REQ-SPEC-31 verification coverage is ≥ RES.1's baseline
      and the run is not *Unverified*; the run's citation-completeness rate is ≥ CITE.1's Stage B aggregate; the second
      read and discourse both ran; Σ debits ≤ cap. Any miss reverts the implicated lever to OFF. *(agentic)*
- [ ] Cost cards and `pricing.json` are re-derived through ECON.1's store, not by hand. The REQ-SPEC-32(b) contract
      tests are green. Journey steps N4 (estimates agree) and C1 (claims equal the config) stay green on the deployed
      stage, with screenshots. Deployed provenance equals the chain tip. The calibration report is regenerated; a
      bucket that misses REQ-SPEC-32(c) is a `D-ECON.2-n` row. *(agentic)*
- [ ] The restore evaluation is recorded: either the condition is met, with the evidence in LEDGER GATE DECISIONS and
      the config change staged but not applied (operator-paused), or the measured gap to $6 is recorded with the next
      lever candidates. *(agentic)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-SPEC-32(c) (primary per the manifest index: "(c)→ECON.2"), REQ-SPEC-8 (restore flip, per "restore flip ECON.2"),
REQ-BILL-7, REQ-GROWTH-4 (re-derived half), REQ-ARCH-9. REQ-SPEC-31 and REQ-VIS-9 are non-regression consumers.

## Cross-cutting invariants
- Manifest **#7**: the proxy is the meter of record, all measurements are proxy-metered list cost, and Σ debits ≤ cap.
  **#8**: skills stay verbatim (L4 reorders harness-assembled context only). **#5**: independence contexts are
  untouched; the second-read and audit scoped queries keep their inputs. **#9**: no "cheaper/better" claim on any
  surface. **#10**: telemetry carries counts only.
- **#14 / REQ-SPEC-32**: every surfaced price comes from the refit store and the one estimator; prices move only
  because measured COGS moved; the restore flip, a change to what users get, is operator-paused.
- **#14 / REQ-SPEC-31**: research is never cut below RES.1's floor, and coverage and *Unverified* semantics are
  unchanged. **#12 / REQ-SPEC-29**: price surfaces are accepted via journey steps N4 and C1. **#13 / REQ-SPEC-30**:
  cross-tenant measurement reads run on the system pool's allowlist.

## Notes
- **Owned decisions, one ADR:** the pre-registered measurement protocol and adoption rule; each lever's adopted
  setting, or its rejection, with its numbers; the 6,000-word fixture — a committed synthetic essay, never a real
  user's draft (ADR-016 fixtures), authored at Stage A if none exists.
- **Consumed:** ECON.1 (store, fold, caps, report); CITE.1 (the OFF-arm pipeline, its completeness figures and
  target); RES.1 (floor, probe fixture); EST.1 (estimator); ACT.1 (entitlement config, claim render model);
  JOURNEY.1 (test tenants, funding).
- **For STB.5a:** run the ON-arm Review on a JOURNEY.1 test tenant, and hold it from auto-purge until STB.5a's dossier
  legs run. STB.5a reuses it at $0 and needs ≥ 1 suggestion-bearing finding.
- **Anchors to re-confirm at build time:** all file:line anchors above. Whether the vendored CLI honours a per-phase
  `autoCompactWindow` (fresh `query()` per phase, `sdk-adapter.ts`). Whether prefix ordering is under harness control
  or fixed by the CLI's system-prompt assembly: if fixed, L4 is TTL-only and the ADR says so.
- **DEFERRALS:** open a `D-ECON.2-n` row for a lever blocked on a spec amendment, a skipped leg, a missed
  REQ-SPEC-32(c) bucket, or the restore flip awaiting the operator. BL-13 closes only when its churn half has
  measured evidence; the debit half is ECON.1's.
- **Sizing:** this is the tightest round-3 fit (five levers plus a refit). If the plan shows it cannot fit one
  context, split at item 4 (levers + measurement / refit + restore) through the manifest's insert protocol; never
  drop a lever silently.

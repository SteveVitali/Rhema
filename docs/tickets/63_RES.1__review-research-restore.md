# RES.1 — Review research restore: root cause, research floor, preflight

- **Sequence:** 63 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** fix
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** MAINT.2, JOURNEY.1
- **Scope (one line):** diagnose and fix `web_search` never reaching the model on the 2026-09-30 Quick/Base Review (PR-Q1), own the research floor (verification is never starved), preflight every model × server-tool pair before any debit, and ship a ≤ $1 single-phase probe on the planted-error essay.
- **Spec §§:** 12.7, 12.8 (+ the 2026-09-30 banner), 8.4, 6.5 (research at Quick/Standard), 12.3 (research subagent row), Appendix A.9 (REQ-SPEC-31 + the 2026-09-30 note)
- **REQ coverage:** REQ-SPEC-31 (primary — items (1) preflight and (2) floor), REQ-VIS-9, REQ-SPEC-11, REQ-ARCH-31, REQ-SPEC-29 (step N6) (stamp in the PR)
- **Absorbs (backlog):** BL-56 (PR-Q1) — the diagnosis / fix / preflight / floor half
- **Run:** `implement-spec spec=docs/tickets/63_RES.1__review-research-restore.md`
- **Gate status:** none beyond the round-3 standing authorization (ADR-013). N6 runs on the JOURNEY.1 harness and inherits its test-mailbox dependency (HUMAN-H7 item 1); if that is unprovisioned, N6 stays expected-red under a `D-RES.1-n` row.
- **Live stage:** Stage A: code + tests ($0). Stage B: deploy, then ≤ 3 probes plus two bounded Reviews on the planted-error fixture through the JOURNEY.1 harness, ≤ $15 metered (list $, proxy rows)

## Goal
On 2026-09-30 a paid Quick/Base Review on prod (run `01M3SK62YZST272B35CG12K6TW`, the planted-error essay) ran every
phase and delivered `completed`. Its dossier says: "no `web_search` tool existed, and every `web_fetch` call was refused
because no search result had ever seeded a URL."
- The dossier was 16/16 claims Unverifiable, 0 verified.
- The planted error ("Library of Congress founded 1850"; it was 1800) was caught only as recollection.
- Four parallel Haiku research subagents and a fresh Phase-2 subagent all confirmed that no tool was present.
- A 2026-09-26 STB.3 Memo Review verified 2/5, so this is a regression, or a failure specific to a tier or a phase.

RES.1 finds and fixes the real root cause. It also makes the whole failure class impossible to repeat silently:
- a **research floor** that earlier phases and subagents cannot exhaust (REQ-SPEC-31(2))
- a **preflight** of every model × server-tool pair the run will use, through the run's own proxy, before any debit
  (REQ-SPEC-31(1))
- a **≤ $1 probe** that shows on demand that research reaches the model

It owns journey step **N6**.

## Load (read these — do not re-read others)
- `docs/tickets/DEFERRALS.md` (the AGENTS.md start-of-run rule); `docs/build/planning/2026-09-30_planning-ledger.md` (row 63, shared decisions, step N6).
- `docs/build/reports/2026-09-30_prod-design-review.md` PR-Q1 (+ shot `2026-09-30_prod-review/10-dossier-no-web-research.jpg`); `docs/build/BACKLOG.csv` BL-56.
- `docs/adr/ADR-015…`, `ADR-006…` (Path B stands for partial gaps); spec §12.7, §12.8(a)(c)(d), §6.5 table, Appendix A.9 REQ-SPEC-31.
- Proxy: `apps/egress-proxy/src/handler.ts`:
  - ~347–378: step 6. `used` is the max of the request's history and the tracker; then `ensureServerWebTools` → `injectUrlPolicyIntoBody`.
  - ~420–427: the tracker `record`.
  - ~160–200: the credential context and `meterOnly`.
- Proxy: `apps/egress-proxy/src/url-policy.ts`:
  - ~95–110: `resolveServerWebToolConfig`, whose defaults are search/fetch ON with budgets 24/48.
  - ~122–205: `ensureServerWebTools`. The drop-at-zero branch is at ~155–175.
- Proxy: `apps/egress-proxy/src/outbound-limits.ts` ~307. `ResearchUsageTracker` is a process-local `Map`.
- Authoring: `packages/orchestrator/src/allowlist.ts`:
  - ~76–110: the `RESEARCH_*` constants and `authorWebToolPolicy`. At claims=0 it gives search 8 and fetch 16.
  - `MODELS_BY_TIER` sets base = sonnet-5 + haiku-4-5.
- Authoring: `apps/worker/src/run-jobs.ts` ~116–150 (`claimCount` or the provisional count → `webTools` → `provisionRun`).
- Engine: `packages/engine/src/roster.ts` ~27–37 (`RESEARCH_SUB_MODEL.base = claude-haiku-4-5`) and `options.ts` (PRB.23's tool-schema restriction).
- Harness: `apps/run-task/src/harness-main.ts` and `harness-loop.ts` ~194 (`runCommitLoop`). This is where a pre-phase step goes.
- Run ledgers `docs/build/runs/PRB.22.md`, `PRB.23.md`, `DEF.1.md`, `DEF.3.md`, `STB.3.md`: what shipped between the 09-26 success and the 09-30 failure.

## In scope — deliverables
1. **Root-cause diagnosis — read-only prod evidence first ($0)** (BL-56; REQ-SPEC-31, REQ-ARCH-31).
   - **Evidence to pull**, for `01M3SK62…` and for the STB.3 Memo Review that verified 2/5:
     - `fetch_log` rows (kind, decision, deny reason, agent label, attempt)
     - `usage_records` `searches`/`fetches` by agent, model and attempt
     - the credential context's `webTools` as provisioned
     - proxy stderr for the run window
     - the proxy / run-task / worker image digests deployed at each date
   - **Hypotheses to confirm or refute** (record the verdict on each):
     - **(a) PRB.22's run-wide budget** exhausted or dropped (the planning ledger's suspect). PRB.22 (`7029db5`,
       09-22) predates the 09-26 success, so on its own it can explain the regression only through a Quick/Base
       specific: a small provisional claim count, four parallel subagents, or a counting defect (e.g. refused fetch
       attempts or history counted into `used`).
     - **(b) What deployed between 09-26 and 09-30:**
       - DEF.1's scoped runner (`6a36dde`, `82179e1`, …)
       - DEF.3 F10 stream-withholding and the allowlist/provision changes (`7dd1ef3`)
       - DEF.2 `meterOnly` (`47d1ecc`)
     - **(c) A tier-specific failure:** Haiku 4.5 and `web_search_20250305`, or subagent requests that bypass the
       `isMessagesCreate` path.
     - **(d) `webTools` missing** from a retried attempt's credential context. The report shows "Some steps needed a
       retry."
   - **Write-up:** the verdict goes in `docs/build/runs/RES.1.md` with the evidence, plus a regression test built from
     the observed request shape that fails on the pre-fix code.
2. **The fix at the root** — not a symptom patch — with that regression test (REQ-SPEC-31, REQ-VIS-9).
3. **The research floor** (REQ-SPEC-31(2)).
   - Verification's share of the run's search/fetch budget is reserved, and no earlier phase or subagent can spend
     it.
   - It is one pure, exported function sized from the claims verification will actually check and the rigor.
     ECON.1's Quick 5-claim cap feeds it later without changing RES.1's code.
   - The proxy enforces it.
   - A named guard test fails if the floor is lowered. ECON.2 may cut research only above it.
   - Decide whether the process-local tracker survives multi-instance or restarted proxies. The failure direction
     matters: a reset must never starve verification.
   - **Owned decision → write an ADR:** the floor mechanism. Options include a harness-set phase identity carried
     beside the credential (never agent-settable) or a reserved share for non-verification traffic.
4. **The preflight** (REQ-SPEC-31(1)).
   - **When:** at harness start of a research-bearing run (Review and Fact-check — re-confirm which manifest phases
     are research-bearing), before `runCommitLoop`'s first commit, so a failure precedes any debit. Every resume
     attempt re-preflights.
   - **What:** every model from `rosterModelIds(tier)` (main + research subagent) × every server tool the run's
     policy enables (`web_search`; `web_fetch` when on), through the run's own proxy credential.
   - **Pass rule:** a pair passes only when the response carries a real `web_search_tool_result` /
     `web_fetch_tool_result` block, never an error block or a missing tool.
   - **Failure:** the run is failed with reason `research_preflight_failed` (a platform fault). The hold is
     released with zero debit rows, the probe's metered burn is absorbed, and one ops alert fires through the
     existing alert path (re-confirm which process fails the run and how it reaches `alertSink`,
     `apps/worker/src/main.ts` ~253).
   - **Cost:** each probe is tiny (`max_uses: 1`, a fixed prompt, never draft text, so the §12.8(d) n-gram guard
     stays quiet) and metered (REQ-SPEC-11).
   - **Owned decision → write an ADR:** placement, pair set, resume behaviour.
5. **The ≤ $1 single-phase probe fixture.**
   - Commit the planted-error essay as a fixture (see Notes for its source).
   - The probe runs verification of the planted claim through the real proxy path (`ensureServerWebTools` + URL
     policy + budget + floor) on both models of the tier. It asserts ≥ 1 search result, ≥ 1 `fetch_log` fetch row,
     and a *Contradicted* verdict with a fetched source.
   - A recorded-response deterministic twin runs in CI at $0.
   - **Owned decision → write an ADR:** the probe's shape — a `meterOnly`-style synthetic credential like DEF.2's
     `est_` pre-pass, or a one-claim `fact_check` run.
6. **Stage B** (≤ $15 metered, list $ = Σ proxy `usage_records.credits` × $0.01 ÷ 1.4 — re-confirm in `apps/egress-proxy/src/rates.ts`).
   - Deploy under the standing authorization.
   - Run ≤ 3 probes (≤ $3).
   - Run one Quick/Base Review of the full planted-error essay through the JOURNEY.1 harness. This is the
     before/after against `01M3SK62…` (≤ $7).
   - Run one Standard/Base Review of a ≤ 300-word planted-error excerpt, the trial cell (≤ $5).
   - Stop at $15. Record spend per leg.

## Out of scope
- *Unverified* delivery, the platform-fault refund class, the label on card/dossier/email, the ops alert for zero coverage, the D.2 vocabulary, trial restore → **RES.2**.
- Citation completeness / how often Path B strips → **CITE.1**. Cutting research cost → **ECON.2** (above this floor only).
- Quick's 5-claim fact-check cap and the rest of §6.5 preset conformance (PR-E6) → **ECON.1**.
- The run report's research counts and phase durations → **RPT.1**. The dossier 500 on older `evidence` shapes → **HOT.1** (N7).

## Acceptance criteria
- [ ] The root cause is named in `docs/build/runs/RES.1.md` with its prod evidence. Every hypothesis (a)–(d) is marked confirmed or refuted. A regression test built from the observed request shape fails on the pre-fix code and passes after. *(deterministic + agentic)*
- [ ] Matrix test: for every rigor × tier, and for the main-context model and the research subagent on every attempt, the proxy-prepared `/v1/messages` body carries `web_search` (and `web_fetch` when enabled) until verification's floor is spent. *(deterministic)*
- [ ] Floor: a fixture in which earlier phases and subagents burn the entire non-floor budget still leaves verification ≥ floor searches and fetches. The guard test fails when the floor constant or function is lowered. *(deterministic)*
- [ ] Preflight, pass case: every pair returns a real tool result and the run proceeds. *(deterministic)*
- [ ] Preflight, fail case: one pair returns an error block or no tool. The run ends `failed/research_preflight_failed` with **zero** debit rows, the hold is released, the probe burn is absorbed, and exactly one alert fires carrying ids only. *(deterministic)*
- [ ] The preflight precedes the first phase commit, and a resume re-preflights. *(deterministic)*
- [ ] The probe's recorded-response twin is green in CI. The planted-error essay fixture is committed with no user-identifying content. *(deterministic)*
- [ ] Stage B: `pulumi preview` shows zero replace/delete on stateful resources and migrations pass the additive lint. Deployed provenance = the chain-tip SHA. *(agentic)*
- [ ] Stage B: a live probe (≤ $1) returns *Contradicted* for the planted claim with a fetched source. `usage_records`/`fetch_log` show ≥ 1 search for both the Sonnet and the Haiku pair. *(agentic)*
- [ ] **Journey step N6 green** (JOURNEY.1 harness, screenshots committed): the Quick/Base Review of the planted-error essay delivers a dossier with ≥ 1 fetched-✓ claim, and the planted error is *Contradicted* with its source. Its `fetch_log` has verification-phase search rows. *(agentic)*
- [ ] Stage B: the Standard/Base excerpt Review also shows fetched coverage, or a `D-RES.1-n` row records why not. Total Stage B metered spend ≤ $15, recorded per leg. *(agentic)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-SPEC-31 (primary: (1) the preflight, (2) the research floor), REQ-VIS-9, REQ-SPEC-11, REQ-ARCH-31,
REQ-SPEC-29 (journey step N6).

## Cross-cutting invariants
- `00_MANIFEST.md` #7 (the proxy is the meter of record, and preflight burn is metered; Σ debits ≤ cap).
- #8: fix orchestration, the proxy or sanctioned inputs. Never edit ported skill text (a drift is a fork, REQ-SPEC-22).
- #10: preflight and probe logs carry ids and counts, never draft or prompt text.
- #12 / REQ-SPEC-29: N6 is proven by walking it.
- #13 / REQ-SPEC-30: any new read uses SEC.1's user-serving pool. A cross-run tracker scan is an allowlisted system-pool query with explicit predicates.
- #14 / REQ-SPEC-31 and REQ-SPEC-32: research is truthful, and the probe's cost appears in the run's metering.
- §12.8(d): the outbound-channel limits and the `user_source` deny are unchanged. The fix must not widen `allowed_domains` or the novel-domain cap.

## Notes
- **Owned decisions → write an ADR each:** (1) the floor mechanism and tracker durability; (2) the preflight's
  placement, pair set and resume rule; (3) the probe fixture's shape.
- **Shared decisions:**
  - *Owned here:* the research floor and the preflight. RES.2, CITE.1 and ECON.2 consume them.
  - *Consumed:*
    - SEC.1's DB-role split
    - JOURNEY.1's harness, step registry, test identities and paid-fixture format
    - HOT.1's dossier fix (N7 must render for N6 to be observable)
  - SEC.1 and HOT.1 are earlier in the chain; they are not listed in Depends on.
- **Fixture source.** Candidates, in order:
  1. The review's essay, "The Library After Dark", 1,029 words, at
     `/private/tmp/claude-501/-Users-stevenvitali-Rh-ma/2e8a4e75-02be-48b0-954e-c2906de5b90b/scratchpad/review/test-essay.md`.
     This is session scratch and may be gone.
  2. The operator's prod project "The Library After Dark (review test)", read-only.
  3. A freshly written original essay of ~1,000 words with the same single planted error and otherwise checkable
     true claims.

  Place it where JOURNEY.1 keeps its fixtures, with the ≤ 300-word excerpt beside it. If JOURNEY.1's paid fixture
  already carries the planted error, reuse it.
- **Anchors to re-confirm at build time.** Every line number above. Also:
  - the research-bearing phase set per manifest
  - whether the prod proxy runs more than one instance
  - the rate-table rating (credits = list × 1.4)
- **DEFERRALS rule:** anything not verifiable at build time (e.g. N6 blocked on the H7 mailbox, or the Standard leg
  cut by the cap) becomes a `D-RES.1-n` row with a compensating control. Never a fabricated pass.

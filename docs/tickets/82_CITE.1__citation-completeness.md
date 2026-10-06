# CITE.1 — Citation completeness: fetch-then-cite reliability and a measured completeness rate

- **Sequence:** 82 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** feature
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** OPS.2, RES.1, RES.2, JOURNEY.1
- **Scope (one line):** make Path B's strip rare (fetch-then-cite reliability and/or an in-run pre-delivery backfill), fix the guard↔log↔chip URL-parity defects, and persist a citation-completeness rate per run and in aggregate, before ECON.2 measures COGS on this pipeline. Never cut below RES.1's research floor.
- **Spec §§:** 8.4 (REQ-VIS-9, reconciled, plus the Appendix A.9 note), 12.8(c) (verdict source check), 5.7 (REQ-IDE-25 fetched chip), 18.3 (scoring, the §18 scorer reused)
- **REQ coverage:** REQ-VIS-9 (primary), REQ-IDE-25, REQ-OBJ-18 (stamp in the PR)
- **Absorbs (backlog):** BL-15 (X-citation-completeness; ADR-006 revisit trigger (b); G1 readout "§16.4 claims await the citation-completeness follow-up")
- **Run:** `implement-spec spec=docs/tickets/82_CITE.1__citation-completeness.md`
- **Gate status:** covered by the round-3 standing authorization (ADR-013). Two conditional pauses: a new credit grant to fund the test tenant (a one-off prod data write) if RES.1's funding path does not cover it, and any new third-party credential a backfill design would need (the preferred designs need none).
- **Live stage:** Stage A is code and tests ($0), plus a read-only baseline over prod's delivered Reviews ($0). Stage B is deploy plus bounded probe runs ≤ $10 metered (per-leg caps below).


> **Amended 2026-09-30 (operator — round-3 spend limit: hard ≤ $200, target ≤ $100):** this ticket's Stage B metered spend cap is **≤ $10** (was ≤ $15); aim for ≈ $5. Run legs cheapest-first and stop once the acceptance evidence suffices; where a leg plan below sums past the new cap, drop the lowest-priority legs and record each dropped leg as a `D-CITE.1-<n>` row (never overspend). The orchestrator pauses the chain when round-3 cumulative metered spend reaches $100 and hard-stops at $200 (LEDGER GATE DECISIONS 2026-09-30, D6 revised).

## Goal
ADR-006 (Path B) delivers a Review even when the fact-check cites URLs it never retrieved: the citation is stripped
and the claim is downgraded to `unverifiable`. That keeps the dossier honest, but it costs the dossier completeness,
and nobody measures how much.

- `strippedCitations` is computed in `runDeliveryTransaction` and then dropped by the orchestrator. It is never
  persisted or reported, even though ADR-006 says readouts must state it.
- Some strips may not be model behaviour at all. The guard normalizes cited URLs with `@rhema/mirror` `normalizeUrl`
  (drops query and trailing slash), but `fetchedNormalizedUrls` prefers the stored `fetch_log.normalized_url`, which
  the proxy's own `normalizeUrl` wrote (keeps both). A fetched `…/2020/05/title/` or `…?id=7` never matches and is
  stripped anyway.
- The dossier's fetched ✓ chip counts only `kind='fetch'` rows, while the guard also accepts `search` rows, so a
  search-result citation the guard accepted ships with no chip.

This ticket measures the truth, fixes the parity defects, lands the evidence-chosen mechanism that makes strips rare,
and persists a completeness rate, so ECON.2 measures COGS on the final pipeline and cannot quietly regress it.

## Load (read these — do not re-read others)
- `docs/adr/ADR-006-cited-fetched-delivery-downgrade.md` (whole), `ADR-015` (floor, coverage, *Unverified*); the spec
  REQ-VIS-9 row, the A.9 note after the REQ-SPEC table (REQ-VIS-9 reconciled), and REQ-IDE-25 and REQ-OBJ-18 rows.
- `packages/benchmark/src/scorers/citation-fetch.ts` + test (P0.15j scorer: `citationFetchCompliance`,
  `claimLedgerCompliance`, `assertCitationComplianceFloor`, `normalizeCitedUrl` = mirror parity copy).
- `packages/mirror/src/validation.ts` (~24 `normalizeUrl`, ~93 `validateCitedFetched`); `packages/mirror/src/delivery.ts`
  (~208–220 `fetchedNormalizedUrls` — prefers stored `normalized_url`; ~249–265 downgrade; ~350–360 strip; ~877
  `strippedCitations` in the result). `packages/orchestrator/src/delivery.ts` (~95–149: result keeps only
  `correspondenceId` + `downgradedClaimOrdinals`).
- `apps/egress-proxy/src/fetch-log.ts` (~26 proxy `normalizeUrl`: keeps path + query); `handler.ts` (~349–375 server
  web tools + the PRB.22 run budget); `url-policy.ts` (~95–175 `resolveServerWebToolConfig`, `ensureServerWebTools`).
- `apps/api/src/dossier-routes.ts` (~454–461: chip set = `kind='fetch'` only); `packages/findings-core/src/ledger.ts`
  (~55–63 a third normalizer; ~70–130 `claimUrlViews`/`summarizeClaims`).
- `packages/orchestrator/src/runspec.ts` (~466–477 `research_fanout`); `packages/engine/src/roster.ts` (`researcher`
  contract); `packages/protocols/manifests/review.ts` (~55–70 verification predicates);
  `packages/protocols/skills/editorial-review/references/verification-protocol.md` §6 (~117; its "fails the entire
  review" sentence predates ADR-006).
- RES.1's ADR (the research floor + probe fixture) and RES.2's coverage definition, as landed on the chain tip.

## In scope — deliverables
1. **Baseline, $0 (BL-15; REQ-VIS-9).** Score every delivered prod Review with the P0.15j scorer, reading each run's
   **pre-strip** committed `01-claim-ledger.json` (via `steps.produced_version_ids`) against its `fetch_log`. Report
   distinct-URL completeness per run and in aggregate, with misses split into (i) normalization-only (fetched, but in
   a different normalized form), (ii) search-result-only and (iii) truly unretrieved. It is a read-only cross-tenant
   scan: SEC.1's system pool, allowlisted, never a user route. Record the numbers in the run ledger before any fix.
2. **One URL identity (REQ-VIS-9, REQ-IDE-25, REQ-OBJ-18).**
   - The guard's `normalizeUrl` stays the definition (ADR-006: `validateCitedFetched` unchanged). Apply it to
     **both** sides: the fetched set re-normalizes the stored `normalized_url`/`url`, with no migration.
   - The benchmark scorer, the delivery guard and the dossier chip share it, plus a single "what counts as
     retrieved" set (fetch ∪ search-result rows, per the skill's §6 rule). The ADR records whether the chip labels
     search-result-only sources distinctly.
   - A three-way parity test (scorer ↔ guard ↔ chip) over trailing-slash, query, case, fragment and search-row
     cases fails if any side drifts.
3. **Persist the rate (BL-15).** Every delivery records, as ids and counts only (invariant 10): distinct cited URLs,
   fetched-cited before any backfill (the model's own completeness), backfilled, stripped, and downgraded ordinals.
   It is stored through an additive migration or an internal-visibility run event (owned decision). The
   orchestrator stops discarding `strippedCitations`. A trailing-window aggregate metric is computed by the worker
   (system pool, allowlisted scan) and surfaced where §13.5 ops metrics live. It is a **reported signal, not a new
   SLO target**, because adding a target is a spec amendment.
4. **The reliability mechanism (BL-15; ADR-006 revisit).** Choose it on item 1's evidence and record the choice in
   an ADR. Candidates:
   - **(A) In-phase citation check.** When verification's ledger sidecar lands, the harness asks the server
     (run token, internal API) for the run's retrieved set and computes misses with the guard's function. It
     re-enters the phase at most once, with a bounded instruction naming the unretrieved URLs: "`web_fetch` each
     now, or drop the URL and mark the claim Unverifiable". This follows the REQ-DATA-20 iteration-cap discipline.
   - **(B) In-run pre-delivery backfill.** The harness uid, through the run's proxy credential, fetches each
     cited-but-unfetched URL with the server `web_fetch`, plus a cheap support check that keeps a citation only if
     the fetched page supports the claim's verdict. It is never api-side (ADR-006: the api is not a sandbox client).
   - **(C) Discipline only.** An engine-side `runspec` input line: researchers return only retrieved URLs, and the
     seat cites only those. The ported skill text stays verbatim (invariant 8). A §6 edit goes only through the
     upstream pin, with `check-upstream-diff.mjs` and a `PROTOCOLS_VERSION` re-freeze.

   Binding on every option: every fetch goes through the proxy under the run's URL policy and is metered to the run;
   the mechanism's allowance is **separate from, and never drawn from, RES.1's verification floor**; a kept citation
   still passes the §12.8(c) source check; Path B stays for the residual (never re-tighten to hard-fail — ADR-006
   trigger (a) is not met).
5. **Measured cost of the mechanism.** Record the per-run metered delta (requests, tokens, fetches) in the run ledger
   and the instrumented rows ECON.1's store reads, so ECON.2's OFF arm is this pipeline.

## Out of scope
- The zero-coverage *Unverified* delivery, its refund and its alert: **RES.2**. This ticket may only raise coverage.
- The research floor, the preflight and the regression that starved `web_search`: **RES.1**. CITE.1 consumes the floor
  and never lowers it.
- Research-budget cuts above the floor, and any COGS lever: **ECON.2**.
- The run report's layout: **RPT.1**. Surfacing the rate on user surfaces beyond the chip is not in this ticket.
- Any §16.4 marketing or superiority claim: G2 stays deferred (D5, invariant 9).

## Acceptance criteria
- [ ] Item 1's baseline is in `docs/build/runs/CITE.1.md`: per-run and aggregate completeness, the three miss classes
      with counts, the run ids, and the query used, run read-only through the system pool's allowlist. *(agentic)*
- [ ] A run that fetched `https://x.test/a/` and cites that exact URL (and the `?id=7` variant) **fails on the
      pre-fix code** (stripped) and passes after. The three-way scorer↔guard↔chip parity test covers
      trailing-slash, query, case, fragment and search-row cases. `validateCitedFetched`'s signature and semantics
      are unchanged; its existing 12 tests stay green. *(deterministic)*
- [ ] A delivery persists cited, fetched-before-backfill, backfilled, stripped and downgraded counts. The orchestrator
      result carries `strippedCitations`. A PGlite test asserts the persisted figures for a fixture with one
      normalization-only miss and one true miss. The aggregate job's query runs only on the system pool (SEC.1's
      lint stays green). *(deterministic)*
- [ ] The chosen mechanism has a test that fails if it is removed. On a fixture ledger with N unretrieved citations,
      the run either fetches them through the proxy (fetch rows logged, run metered) or strips them, bounded by its
      allowance. A test proves the allowance is never taken from RES.1's floor: verification's reserved budget is
      intact after the mechanism runs. *(deterministic)*
- [ ] Before any Stage B spend, the ADR pre-registers the completeness target. The proposed default is aggregate
      completeness after backfill ≥ 0.95 over the Stage B probe runs, with no run below 0.80, and a stated
      improvement over item 1's baseline. The target is not chosen after seeing results. *(agentic)*
- [ ] **Stage B, ≤ $10 metered, cheapest-first**, after deploying the chain-tip SHA under the standing authorization:
      Leg 1, RES.1's single-phase verification probe on the planted-error essay ×3 (≤ $1.50 each); Leg 2, the same
      probe on `packages/protocols/fixtures/_evals/golden-op-ed.md` ×2 (≤ $2 each); Leg 3, one Quick/Base Review of
      `golden-op-ed.md` delivered end to end on a JOURNEY.1 test tenant (≤ $4). A leg whose derived cap exceeds the
      remaining budget is skipped with a reason, never cap-raised. The measured rate meets the pre-registered target,
      **or** the shortfall and its miss classes are recorded as a `D-CITE.1-n` row. *(agentic)*
- [ ] Non-regression on the Stage B runs: the planted error is still *Contradicted* with a fetched source (N6 stays
      green); verification coverage is not lower than RES.1's probe baseline; no run delivers *Unverified* because of
      this change. *(agentic)*
- [ ] Journey evidence (REQ-SPEC-29), as a journey step owned by CITE.1 with a committed screenshot: on Leg 3's
      delivered dossier every cited URL shows its fetched ✓ chip (or the ADR's search-result label), and no cited URL
      is chip-less. The run ledger's strip count equals the persisted figure, and deployed provenance equals the
      chain-tip SHA. *(agentic)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-VIS-9 (reconciled; primary per the manifest REQ index), REQ-IDE-25 (the chip reads the same retrieved set),
REQ-OBJ-18 (every `claim.sources[].url` in the rate and the strip). REQ-SPEC-31 is a non-regression consumer only,
not stamped.

## Cross-cutting invariants
- Manifest **#7**: the proxy is the meter of record, and every backfill fetch is metered to the run. **#8**: skills
  stay verbatim, and any skill edit goes through the upstream pin. **#10**: the persisted figures and events are
  counts and ids, never page text. **#3**: no protocol text is in any event or report.
- **#12 / REQ-SPEC-29**: the dossier-chip change is accepted by a journey step with a screenshot, and the deploy
  provenance equals the chain tip.
- **#13 / REQ-SPEC-30**: the baseline and the aggregate are cross-tenant scans on the system pool's allowlist, never on
  a user route.
- **#14 / REQ-SPEC-31, REQ-SPEC-32**: research is never cut below RES.1's floor; the mechanism's cost is metered and
  recorded for ECON.1's store, so COGS stays truthful; *Unverified* semantics (RES.2) are unchanged.

## Notes
- **Owned decisions, one ADR each:** (a) the mechanism (A/B/C or a combination), chosen from item 1's evidence;
  (b) whether search-result-only citations count as retrieved for the chip, and how they are labelled; (c) the
  persistence shape (a table or an internal event); (d) the pre-registered target. If (a) is a backfill, the ADR
  amends ADR-006 by reference (its revisit trigger (b) is met). ADR-006 itself is never rewritten.
- **Consumed:** RES.1 — the floor, the probe fixture and the preflight (if RES.1 delivered no probe fixture, Legs 1–2
  become phase-pinned Reviews under the same caps); RES.2 — the coverage definition; JOURNEY.1 — the harness, test
  tenants and funding; SEC.1 — the system-pool allowlist and lint; ECON.1 — the instrumented-row shape.
- **For ECON.2:** leave the mechanism's per-run cost and the Stage B completeness figures in the run ledger. ECON.2's
  non-regression AC reads them.
- **Anchors to re-confirm at build time:** every file:line above. Check whether the proxy writes `search` rows with the
  result URL or with the query URL, since that decides the retrieved set. Check whether `fetch_log` is readable by the
  harness through an existing internal endpoint.
- **DEFERRALS:** open a `D-CITE.1-n` row for a target shortfall, a leg skipped on budget, or a funding pause. No source
  `D-` row is closed here (D-P0.15i-2 is DONE). Record the rate against X-citation-completeness in LEDGER OPEN
  FINDINGS.

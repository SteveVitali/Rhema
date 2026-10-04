# CITE.1 — Citation completeness: fetch-then-cite reliability + a measured completeness rate (run ledger)

- **Status:** IN PROGRESS — Stage A (code + tests + $0 read-only baseline)
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Skills:** agent-skills (implement-spec, full rigor)
- **Started:** 2026-10-04T00:52:43Z
- **Ticket:** `docs/tickets/82_CITE.1__citation-completeness.md` (manifest row 82)
- **Branch:** `stevevitali/cite-1-citation-completeness` — base `stevevitali/ops-2-iac-drift-cost-cache`
  at `b070d6011a1e31249eac300767f854e00137c70f` (OPS.2 / PR #103, unmerged, OPERATOR policy; tree clean at fork)
- **Spec:** `docs/rhema-design-spec.md` §8.4 (REQ-VIS-9 reconciled + A.9), §12.8(c), §5.7 (REQ-IDE-25), §18.3
- **REQ:** REQ-VIS-9 (primary), REQ-IDE-25, REQ-OBJ-18 — stamped in the PR
- **Spend:** Stage A $0 (code + read-only prod baseline over the IAP tunnel). Stage B ≤ $10 metered,
  cheapest-first: Leg 1 RES.1 probe ×3 (≤$1.50 ea), Leg 2 golden-op-ed probe ×2 (≤$2 ea), Leg 3 one
  Quick/Base Review end-to-end (≤$4). A leg whose cap exceeds remaining budget is SKIPPED → `D-CITE.1-<n>`.
- **Round-3 cumulative entering:** ~$71 (contract) — per-leg list $ recorded below.
- **Amendment:** 2026-09-30 cap applied — Stage B ≤ $10 (was $15), aim ≈$5.

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (2026-10-04). No source `D-` row closes here (D-P0.15i-2 is
DONE). Rows that intersect this run:

- **D-RES.1-2/-3** (OPEN) — RES.1's N6 planted-error leg + Standard/Base excerpt probe were cut by
  RES.1's remaining budget. CITE.1's Legs 1–2 re-run the same probe under CITE.1's caps (this does
  NOT close D-RES.1-* — different ticket's ACs; their rows stay OPEN under their owner).
- **D-P0.03-2** (OPEN — `sidecar` absent leg) — not exercised here; stays OPEN.
- **GD-RES.2-1** (awaiting operator ruling) — historical Unverified refund/relabel; not this ticket.
- **X-citation-completeness** (BACKLOG row → BL-15) — this ticket owns it; the measured rate is
  recorded below and in LEDGER OPEN FINDINGS at close.
- Journey test tenant: `test+jrn-a@rhema.tools` (workspace `01M3V0VJ74HQXDPWPW2V8125S4`, user
  `01M3V0VJ…`), flagged `is_test`, holds the JOURNEY.1-approved 2000-cr house grant (unspent).
  Leg 3 funding: the grant covers it — no new credit grant needed (checked below).

## Requirements (extracted 2026-10-04)

1. **Baseline, $0 (BL-15; REQ-VIS-9).** Score every delivered prod Review with the P0.15j scorer on
   each run's PRE-STRIP committed `01-claim-ledger.json` (via `steps.produced_version_ids`) vs its
   `fetch_log`. Distinct-URL completeness per run + aggregate; misses split (i) normalization-only,
   (ii) search-result-only, (iii) truly unretrieved. Read-only cross-tenant scan on SEC.1's system
   pool allowlist — never a user route. Numbers recorded here before any fix.
2. **One URL identity (REQ-VIS-9, REQ-IDE-25, REQ-OBJ-18).** The guard's `normalizeUrl` stays the
   definition; apply it to BOTH sides (fetched set re-normalizes stored `normalized_url`/`url`, no
   migration). Scorer ↔ guard ↔ chip share it + one "retrieved" set (fetch ∪ search-result rows per
   the skill's §6 rule). Three-way parity test over trailing-slash, query, case, fragment, search-row
   cases. `validateCitedFetched` signature/semantics unchanged; its 12 tests stay green.
3. **Persist the rate (BL-15).** Every delivery records (ids + counts only): distinct cited URLs,
   fetched-cited before any backfill, backfilled, stripped, downgraded ordinals. Additive migration or
   internal-visibility run event (owned decision). Orchestrator stops discarding `strippedCitations`.
   Trailing-window aggregate computed by the worker on the system pool, surfaced where §13.5 ops
   metrics live — a REPORTED signal, never a new SLO target.
4. **Reliability mechanism (BL-15; ADR-006 revisit trigger (b)).** Choose on item 1's evidence → ADR.
   A = in-phase re-entry (bounded instruction, ≤1 re-entry); B = in-run pre-delivery backfill via the
   run's proxy credential (never api-side) + cheap support check; C = discipline only (runspec input;
   skill text only via upstream pin). Binding: every fetch through the proxy under the run's URL policy
   + metered to the run; the allowance is SEPARATE from RES.1's floor; a kept citation still passes
   §12.8(c); Path B stays for residuals (never re-tighten).
5. **Measured cost.** Per-run metered delta (requests, tokens, fetches) in this ledger + the
   instrumented rows ECON.1's store reads — ECON.2's OFF arm is this pipeline.

## Acceptance criteria (working checklist)

- [ ] AC1 baseline in this file: per-run + aggregate completeness, 3 miss classes, run ids, the query
      used, run read-only through the system pool. *(agentic)*
- [ ] AC2 normalization fix: `x.test/a/` + `?id=7` cited-vs-fetched fails pre-fix, passes post; parity
      test 3-way over trailing-slash/query/case/fragment/search-row; `validateCitedFetched` unchanged,
      12 tests green. *(deterministic)*
- [ ] AC3 persistence: cited/fetched-before-backfill/backfilled/stripped/downgraded counts persisted;
      orchestrator result carries `strippedCitations`; PGlite test on a 1-normalization-only + 1-true-miss
      fixture; aggregate query system-pool only (SEC.1 lint green). *(deterministic)*
- [ ] AC4 mechanism test that fails if removed; N unretrieved citations → fetched through proxy or
      stripped, bounded by its allowance; allowance never drawn from RES.1's floor (test). *(deterministic)*
- [ ] AC5 pre-registered target BEFORE any Stage B spend: aggregate ≥0.95 after backfill, no run <0.80,
      stated improvement vs baseline — in the ADR. *(agentic)*
- [ ] AC6 Stage B ≤$10 cheapest-first per leg caps; measured rate meets target or `D-CITE.1-n`. *(agentic)*
- [ ] AC7 non-regression: planted error still Contradicted w/ fetched source (N6); coverage ≥ RES.1
      baseline; no run delivers *Unverified* from this change. *(agentic)*
- [ ] AC8 journey evidence: CITE.1-owned step on Leg 3's dossier — every cited URL chipped (or search
      label), strip count == persisted, screenshot committed, provenance == chain-tip SHA. *(agentic)*
- [ ] AC9 universal phase-gate: verification green; every new behaviour has a removal-fails test; REQ ids
      stamped; unverifiable → DEFERRALS row + compensating control; ADRs per owned decision; BUILD_INDEX
      row + LEDGER advanced. *(agentic)*

## Out of scope (never implemented here)

RES.2's Unverified delivery/refund/alert (may only raise coverage) · RES.1's floor/preflight (consume,
never lower) · ECON.2's research-budget cuts/COGS levers · RPT.1's run-report layout / chip beyond
§5.7 · any §16.4 marketing claim (G2 stays deferred).

## Anchor re-confirmation (2026-10-04)

- `packages/mirror/src/validation.ts:24` — guard `normalizeUrl` (lower scheme+host, strip trailing
  slashes, drop query+fragment). `validateCitedFetched` :93 — signature/semantics UNCHANGED (12 tests).
- `packages/mirror/src/delivery.ts:222` — `fetchedNormalizedUrls` PREFERS stored
  `fetch_log.normalized_url` (the PROXY's form: keeps query + trailing slash) → the parity defect.
  CONFIRMED. Also persists `claim_sources.normalized_url` verbatim from the sidecar (:413) and
  `claims.normalized_url` as `c.normalizedUrl ?? normalizeUrl(claimUrl)` (:398) — a model-written
  normalization can also drift.
- `apps/egress-proxy/src/fetch-log.ts:26` — proxy `normalizeUrl` (lower host+proto, keeps path AS-IS +
  query, drops fragment). `apps/egress-proxy/src/outbound-limits.ts:159 collectResultUrls` — a
  `web_search_tool_result`'s result URLs land as **kind='fetch'** rows (a search-result citation is
  indistinguishable from a true fetch on historical rows — affects miss class (ii) measurement; noted
  in the baseline).
- `packages/hooks/src/url-policy.ts:22` — a FOURTH normalizer (harness-side hook): lower host, keeps
  query, strips ONE trailing slash when no query. Audit-uploaded fetch rows carry this form — same fix
  (re-normalize at read time) covers it.
- `apps/api/src/dossier-routes.ts:469-476` — the chip's fetch set: `kind='fetch'` only, proxy-form
  `normalized_url` — the SECOND parity defect (drifted to :469; spec said ~454).
- `packages/findings-core/src/ledger.ts:56` — the THIRD normalizer (keeps case, drops query, strips one
  trailing slash) used by `claimUrlViews`/`summarizeClaims`/`evidenceUrlViews`.
- `packages/orchestrator/src/delivery.ts:53-56` — `DeliverRunResult` keeps only `correspondenceId` +
  `downgradedClaimOrdinals`; `strippedCitations` DROPPED (:206). CONFIRMED.
- `integration/src/harness.ts:286-295` — the exit assessor duplicates the fetched-set defect (same fix).
- No internal endpoint exposes `fetch_log` to the harness (checked internal-api.ts) — mechanism A
  would need one.
- `verification-protocol.md` §6: retrieved = "a URL that came back in one of your own `web_search`
  result blocks, or a URL you passed to `web_fetch`" — the retrieved set = fetch ∪ search-result URLs.

## Plan

1. **Canonical URL identity (ADR-083).** `normalizeUrl` moved to `@rhema/contracts`; the guard,
   scorer, findings-core ledger, dossier query, `/internal` retrieved-urls endpoint, and the scan
   all canonicalize the stored `normalized_url`/`url` ON READ (no migration of the log of record).
   Search hits log as `kind='search'` rows carrying `url`/`normalized_url`; the retrieved set is
   fetch ∪ search-url rows; search-only coverage renders the "Search result" chip.
2. **Persist the rate (ADR-084).** `runs.citation_completeness` (0057) written atomically with
   delivery; `run.citation_completeness` internal event; `citation_completeness_daily` system-pool
   rollup on `cite.completeness.daily` — reported signal, not an SLO row.
3. **Mechanism A (ADR-085)** — chosen on the baseline evidence below: the entire observed miss class
   was normalization-only, so the parity fix retires it; a bounded, separately-metered pre-delivery
   backfill re-entry (`backfill` phase class, `backfillFetchBudget=min(fetchBudget,24)`, fetch-only,
   one re-entry, server-computed cited∖retrieved) covers the `trulyUnretrieved` residual the baseline
   could not observe at n=2 citing runs — bounded insurance, never the RES.1 floor.
4. **Pre-registered target (ADR-086):** aggregate ≥0.95 post-backfill, no run <0.80 — committed
   BEFORE Stage B spend.

## Baseline (item 1) — LIVE prod, read-only, 2026-10-04T01:38Z

`scripts/live/cite1-citation-scan.mjs` over the IAP tunnel (`gcloud compute ssh
rhema-prod-proxy-c519 --tunnel-through-iap -- -L 15432:10.46.0.3:5432`), system-pool DSN,
`OBJECTS_BUCKET=rhema-prod-artifacts`. Read-only — nothing written. Two scan-runner bugs found and
fixed in-flight (tenant-prefixed object keys `tenants/<ws>/objects/<sha>` — the store must bind each
row's own workspace; `.json` filter so the `.md` twin can't win the distinct-on).

```text
[cite-scan] scanned 53 completed review/fact_check runs; scored 7 pre-strip claim ledgers (0 unreadable)
[cite-scan] aggregate (test tenants excluded): {"citedUrls":40,"legacyCovered":27,"canonicalCovered":40,
  "legacyCompleteness":0.675,"canonicalCompleteness":1,
  "missClasses":{"normalizationOnly":13,"searchOnly":0,"trulyUnretrieved":0},
  "searchRowsWithoutUrl":154}
```

- **legacyCompleteness 0.675** — the rate the pre-CITE.1 byte-join measured (what Path B stripped
  against): 13 of 40 cited urls would-strip.
- **canonicalCompleteness 1.0** — under the canonical join every cited url WAS retrieved.
- **All 13 misses are `normalizationOnly`** — trailing-slash/query/host-case parity defects on the
  two citing runs (`01M2RE04RRN6TZYSBED1WFHTVY`: 6/22, `01M2RGNK9PWKN5M34343GXZC16`: 7/18 — the
  PubMed/TechCrunch/Vice urls). **Zero `searchOnly`, zero `trulyUnretrieved`.**
- **`searchRowsWithoutUrl` 154** — pre-CITE.1 search rows carried no url column; historical search
  evidence was invisible to the join (the parity gap the search-row logging closes).
- 46/53 completed runs produced no claim-ledger sidecar (claim-ledger phases not on their manifest);
  the 7 scored include 2 test-tenant runs classified but excluded.

**Honest consequence (ADR-085/086 recorded):** the measured baseline contains NO genuine unretrieved
citations — Path B's apparent miss rate was wholly the parity defect. The mechanism is therefore
bounded insurance for the residual class the baseline cannot rule out (n=2 citing runs), sized at
min(fetchBudget, 24); its metering makes the insurance cost separately visible to ECON.2.

## Test matrix

- `mirror/delivery.test.ts` (22): parity rescue vs true miss, search-row coverage, backfill-phase
  rows, completeness record shape, search-domain verdict source check, no-ledger → no record.
- `orchestrator/delivery.test.ts` (12): `runs.citation_completeness` persisted atomically,
  `run.citation_completeness` event, `strippedCitations` returned, RES.2 Unverified preserved.
- `benchmark/citation-fetch.test.ts` (17): scorer↔guard↔chip 3-way parity, dedup, empty ledger.
- `run-task/harness-loop.test.ts` (28): mechanism-A re-entry stamped `backfill` with missed-url
  guidance, skip-on-full-coverage, seam-unbound/failure → deliver anyway, crashed re-entry →
  deliver, canonical-variant non-miss.
- `egress-proxy/url-policy.test.ts` (33): dedicated allowance on exhausted research budget, no
  search grant, per-call clamp + exhaustion drop, `fetch:false` honored, default budgets.
- `egress-proxy/handler.test.ts` (41): `backfill` stamp end-to-end — dedicated counter, floor
  intact, `phase_class` on the fetch_log row, reservation window.
- `api/run-routes.test.ts` (59): `/internal/runs/:id/retrieved-urls` canonical fetch∪search set,
  deny/inference rows excluded, 401 unauth.
- `api/dossier-routes.test.ts`: `searchResultLog` in the dossier DTO.
- `findings-core/ledger.test.ts`: `retrievedBy:'search'` chip stamp, `'fetch'`, unretrieved → none.
- `ledger/citation-scan.test.ts` (6): the three miss classes, test-tenant exclusion, unreadable.
- `worker/run-jobs.test.ts` (11): `force_unverified` zeroes `backfillFetchBudget` too.
- `db/schema-parity`, `security-checks/rls-catalog`, `contracts/events` visibility pin,
  `check-additive-migrations`: census pins updated for 0056/0057 + the daily table.

## Progress

- 2026-10-04T00:52Z — forked at `b070d60`; context map built (anchors above); branch clean.
- 2026-10-04T01:38Z — **baseline landed** (above): 0.675 legacy / 1.0 canonical, all misses
  normalizationOnly.
- 2026-10-04 — Stage A implementation: ADR-083/084/085/086 written + index regenerated;
  `pnpm turbo typecheck lint` 135/135; full `pnpm test` green after census/parity fixes.

## Test matrix

(from the ACs; filled in Phase 1.4 — see Progress)

## Progress

- 2026-10-04T00:52Z — forked at `b070d60`; context map built (anchors above); branch clean.

## Stage B ledger (per-leg list $; cap ≤ $10 total)

_(pending)_

## Gap table

_(Phase 4)_

## Evidence log

_(Phase 5)_

## Evidence report

_(Phase 6)_

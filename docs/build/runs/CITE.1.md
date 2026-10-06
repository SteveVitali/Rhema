# CITE.1 — Citation completeness: fetch-then-cite reliability + a measured completeness rate (run ledger)

- **Status:** Stage A DONE + Stage B PARTIAL — migrations applied + images built/pinned at `5baa666`;
  **`pulumi up` blocked on an expired Pulumi Cloud credential** (operator login required — D-CITE.1-1);
  all three paid legs deferred (D-CITE.1-2/-3/-4: deploy prerequisite + weekly spend guard over cap
  + per-leg caps below measured probe cost). $0 metered this Stage B.
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

Executed 2026-10-04 (chain tip `a2b86ce`; built SHA `5baa666` — the tip's only deltas after the build
are the image pins + this ledger, which ship in no image).

### Deploy half

| Step | Result |
|---|---|
| Migrations `0056`+`0057` via `prod-migrate-seed.mjs` over the IAP tunnel (`rhema-prod-proxy-c519` → `127.0.0.1:15432`) | **APPLIED** — additive-lint passed; `_migrations` = 57; `runs.citation_completeness` + `citation_completeness_daily` verified live (0 rows — nothing delivered since the migration) |
| Journey step **N11** (CITE.1-owned, AC8) added | commit `5baa666` — registry row (`new-visitor`, paid, `expected:"red"`), `launchQuickReviewToDelivery` doc-param refactor, `fixtures/golden-op-ed.md` committed copy; registry tests 7/7 green |
| Cloud Build `a1a25956-f419-41ae-b532-f388941fe6e5` (image-set.yaml, `_SERVICES=api,web,worker,run-task,egress-proxy,collab`, `_GIT_SHA=5baa666`, tag `prod`) | **SUCCESS** — api `0df7b7e1`, web `dc619a51`, worker `da8ac0cf`, run-task `53cca280`, egress-proxy `9767f907`, collab `fd026a24` (sha256 prefixes). fetcher/convert/export/turbo-cache carry no diff'd runtime code — pins kept |
| `Pulumi.prod.yaml` pins | committed `a2b86ce` (deploy comment block records the owed `pulumi up`) |
| `pulumi preview` / `pulumi up prod` | **BLOCKED — expired Pulumi Cloud credential.** The stored token (`~/.pulumi/credentials.json`, `pul-e8e4…`, validated 2026-10-03T21:35-04:00) returns HTTP 401 on `api.pulumi.com/api/user`; `pulumi stack select/preview` refuse "requires logging in". Fresh `pulumi login` is an operator act — no token source exists on this machine. → **D-CITE.1-1** |
| `record-deployment.mjs` + `check-deploy-provenance` | owed with the apply (GIT_SHA `5baa666`; tip `a2b86ce` = pins-only delta) |

### Paid legs — all deferred, $0 metered

Weekly spend guard re-measured live over the tunnel 2026-10-04T02:2xZ:
`select coalesce(sum(u.list_cost_usd),0) from usage_records u join workspaces w on w.id=u.workspace_id
 where w.is_test and u.ts >= '2026-09-28' and u.source='proxy'` → **$58.07792** (ISO week
2026-09-28 → cap $5 → `checkWeeklySpendCap` refuses; reset Mon 2026-10-05 00:00 UTC, ~21.6 h out).
Test tenant funding verified prior session: 7,472 promo credits available, `is_test` flagged — no grant
needed. Under the operator's "check `journeySpendThisIsoWeek` before dispatching flagged legs"
instruction, flagged legs refuse while the week reads ≥ $5.

| Leg | Plan | Cap | Outcome |
|---|---|---|---|
| 1 | RES.1 probe ×3 on the planted-error essay | ≤$1.50 ea | **DEFERRED → D-CITE.1-2** — deploy prerequisite (D-CITE.1-1); weekly guard over cap; and the measured completing-probe cost ($3.31/$4.17, RES.1 2026-10-01) already exceeds $1.50 — a cap-vs-measure reconciliation is owed even after the reset (caps never raised) |
| 2 | same probe ×2 on `golden-op-ed.md` | ≤$2 ea | **DEFERRED → D-CITE.1-3** — same three reasons at $2 |
| 3 | N11 Quick/Base Review e2e on jrn-a + dossier chip evidence + committed screenshot | ≤$4 | **DEFERRED → D-CITE.1-4** — deploy prerequisite + weekly guard over cap; N11 stays `expected:"red"` until it runs |
| ADR-086 target read (aggregate ≥0.95, per-run ≥0.80) on the Stage-B probe runs | — | **DEFERRED → D-CITE.1-5** — rides the legs; the pre-deploy baseline stands at canonical 1.0 aggregate (40 cited URLs, 0 trulyUnretrieved) but is NOT the Stage-B evidence |

### What was actually verified live (read-only, $0)

- `_migrations` = 57, newest `0057_cite1_citation_completeness.sql`.
- `runs.citation_completeness` jsonb column present; `citation_completeness_daily` present with the
  ADR-084 column shape (day/runs/cited/covered/missed/stripped/backfill_ran_runs/backfill_resolved/
  search_covered/rate/computed_at) — both empty: nothing has delivered since the migration.
- Weekly flagged-tenant metered spend $58.07792 — the guard's own query, re-run for this ledger.

### Non-regression status (AC7)

Not verifiable live — the legs that would re-prove N6 (planted error Contradicted + fetched source)
and produce `citation_completeness` rows are deferred. Deterministic evidence stands: the parity fix
keeps `validateCitedFetched` unchanged (12 tests), the strip path is un-tightened (Path B residual
preserved by construction), `force_unverified` zeroes the backfill allowance (never an
Unverified-causing write), and RES.1's floor is untouched (`backfillFetchBudget` is additive). The
remaining live reads are recorded on the D-rows.

## Gap table

| Item | Expected | Actual | Disposition |
|---|---|---|---|
| AC1 baseline | measured + recorded | canonical 1.0 vs legacy 0.675 on 53 runs (§ Baseline) | **met** |
| AC2 one URL identity | 3-way parity + pre-fix failure | `citation-fetch.test.ts`, `delivery.test.ts`, guard 12 green; `validateCitedFetched` unchanged | **met** (deterministic) |
| AC3 persistence | counts persisted + system-pool aggregate | `runs.citation_completeness` + `run.citation_completeness` event + `citation_completeness_daily`; PGlite tests green; SEC.1 system-pool lint green | **met** (deterministic); live write owed by any post-deploy delivery |
| AC4 mechanism | bounded backfill, never the floor | ADR-085 mechanism A; 28 harness-loop + 41 handler + 33 url-policy tests; floor intact | **met** (deterministic) |
| AC5 pre-registered target | ADR before spend | ADR-086 committed pre-spend (agg ≥0.95 / run ≥0.80) | **met** |
| AC6 Stage-B legs | ≤$10, cheapest-first, measured vs target | **no legs ran** — deploy credential + weekly guard + cap infeasibility | **D-CITE.1-2..5** |
| AC7 non-regression | N6 stays Contradicted; coverage ≥ baseline; no CITE.1-caused Unverified | deterministic suite green; live re-proof owed | **D-CITE.1-2/-3/-4** carry it |
| AC8 journey evidence | CITE.1-owned step + committed screenshot | **N11 wired red** (5baa666); screenshot owed with Leg 3 | **D-CITE.1-4** |
| deploy | `pulumi up` + provenance + deployments row | images built+pinned; apply blocked on expired Pulumi token | **D-CITE.1-1** |

## Evidence log

- 2026-10-04T02:0xZ — migrations 0056/0057 applied through the IAP tunnel (`prod-migrate-seed.mjs`,
  additive-lint clean); `_migrations` count verified 57.
- 2026-10-04 — N11 step + golden-op-ed fixture + registry/test pins (`5baa666`); journeys vitest 7/7,
  turbo typecheck+lint green.
- 2026-10-04T02:1xZ — Cloud Build `a1a25956` SUCCESS: six images at `5baa666` (digests in the Stage-B
  table above); pins committed `a2b86ce`.
- 2026-10-04T02:2xZ — Pulumi Cloud token verified dead (HTTP 401 `api.pulumi.com/api/user`); deploy
  recorded as owed (D-CITE.1-1). Weekly spend guard re-measured $58.07792 ≥ $5 (ISO week
  2026-09-28; reset 2026-10-05T00:00Z).
- 2026-10-04 — `runs.citation_completeness` / `citation_completeness_daily` verified live-empty
  (expected — no deliveries since migration).

## Evidence report

Stage A is complete and committed (`4986752` + `5baa666` + `a2b86ce`): canonical cited⇒retrieved URL
identity shared by guard/scorer/ledger/dossier/scan, search-row retrieval parity with the "Search
result" label, persisted per-run + daily completeness (0056/0057 applied live), and the ADR-085
bounded pre-delivery backfill — all deterministic-green (135/135 turbo; full vitest; additive-lint).
Stage B produced the deployable artifact set and honest deferrals: images built+pinned at `5baa666`
(Cloud Build `a1a25956`), `pulumi up` blocked on an expired Pulumi Cloud credential (D-CITE.1-1), and
all three paid legs deferred on the deploy prerequisite + the measured weekly spend guard
($58.08 ≥ $5 until 2026-10-05 UTC) + per-leg caps below the measured probe cost (D-CITE.1-2..5).
$0 metered spend this Stage B. The measured completeness owed (ADR-086) rides D-CITE.1-5; the
pre-deploy baseline (canonical 1.0 aggregate, 0 trulyUnretrieved) is recorded above and in LEDGER
OPEN FINDINGS (X-citation-completeness).

## Evidence log — 2026-10-06 (funded window A)

- Deploy leg discharged at the later chain tip `fcbbc66` (update 144; D-CITE.1-1 DONE, recorded in
  `runs/DEPLOY-2026-10-06.md`).
- Paid legs attempted: weekly guard **clear** ($0.00 system-role, ISO week 2026-10-05) but **test-tenant
  funding empty** — the ~26 h purge reaped the grant-bearing tenants (promo residuals 7,472/8,000/3,743 cr
  stranded on memberless workspaces); live jrn-a holds 10 `daily` cr; `POST /projects/…/runs` refuses
  `402 insufficient_balance required=1493`; the locked trial covers only Standard/Base Reviews (never the
  probe's fact_check cell, off-contract for the Quick/Base Leg 3). **$0 metered; legs stay deferred on an
  operator `house-grant`** — detail + ask in `runs/FUNDED-2026-10-06-A.md` §2–4.

## Evidence log — 2026-10-06 (funded window B)

Operator-authorized `house-grant` (8,000 promo cr) + purge exemption landed on the live jrn-a
tenant; funded legs executed on prod `fcbbc66`. Full ledger: `runs/FUNDED-2026-10-06-A.md` §B.

- **Leg 1a** `01M48VNKY6F263TCQRVBJ8JRQA` — completed at **$8.45** but failed functionally (9/9
  `unverifiable`, 0 `claim_sources`, null completeness; auto-refund `platform_fault:zero_coverage`
  165 cr). Not a pass; legs 1b/1c + 2a/2b skipped on the cumulative-spend pause ($125.31 round-3).
- **Leg 3** `01M48YYS50Z6CNX517RJQXRCJ2` — Quick/Base Review delivered, **$5.72**,
  `citation_completeness` = 7 cited / 7 covered / 0 missed / 0 stripped (`searchCovered=7`), rate 1.00.
- **ADR-086 interim read:** aggregate **1.00** over the completed funded legs (n=1 with a record) —
  meets ≥0.95 / no run <0.80 on the measured sample; definitive read rides the remaining legs.
- **N11 FAILED live — real parity defect found + fixed in-tree:** 2/7 cited sources (trailing-slash
  `claim_sources.normalized_url`) rendered chip-less because `claimUrlViews` passed the stored
  `normalizedUrl` raw into `fetchLog.has()`. Fix: canonical fold on read (`findings-core/ledger.ts`)
  + canonical persist on write (`mirror/delivery.ts`) + regression test. Deployed re-verify owed
  (D-CITE.1-4 stays OPEN; N11 stays `expected:"red"`).
- **R9 PASS** → D-DEF.4-1 DONE; R9 flips red→green. Refund 504 cr auto + second request
  `pending_review` with `alerted_at` stamped by the live sweep (§B.6 of the funded ledger).

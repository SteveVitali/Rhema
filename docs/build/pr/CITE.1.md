# CITE.1 — Citation completeness: fetch-then-cite reliability + a measured completeness rate

Ticket: `docs/tickets/82_CITE.1__citation-completeness.md` · run ledger: `docs/build/runs/CITE.1.md`
Stacks on `stevevitali/ops-2-iac-drift-cost-cache` (PR #103, `OPERATOR` merge policy).
**DO NOT MERGE.**

## Summary

> Path B's citation strip is now **measured and nearly retired**: one canonical
> URL identity (`@rhema/contracts normalizeUrl`, ADR-083) joins cited URLs to the
> run's retrieval evidence everywhere — the delivery guard, the §18 scorer, the
> dossier chip, the findings ledger, the internal retrieved-URL endpoint, and
> the cross-tenant scan. URL-bearing `kind='search'` rows count as retrieved and
> render a distinct **"Search result"** chip instead of an unfounded "Fetched ✓".
> Every delivery persists `runs.citation_completeness` atomically (migration
> 0057) with a `run.citation_completeness` internal event and a
> `citation_completeness_daily` rollup (ADR-084) — a **reported signal, not an
> SLO**. ADR-085's bounded mechanism (one fetch-only pre-delivery backfill
> re-entry, `phase_class='backfill'`, `backfillFetchBudget=min(fetchBudget,24)`,
> separately metered, **never** drawn from the RES.1 floor, disabled for
> `force_unverified`) insures the residual `trulyUnretrieved` class the baseline
> couldn't observe. The ADR-086 target (aggregate ≥0.95, per-run ≥0.80) was
> **pre-registered before any spend**.

## What landed

- **Canonical URL identity (ADR-083).** `normalizeUrl` lives in
  `@rhema/contracts` (lower scheme+host, strip trailing slashes, drop
  query+fragment — the guard's definition). Every read path re-normalizes the
  stored `fetch_log.normalized_url`/`url` instead of trusting one of the three
  drifted historical forms. `validateCitedFetched`'s signature + semantics are
  unchanged (its 12 tests stay green).
- **Search-result retrieval parity.** A `web_search` hit's URL is retrieval
  evidence (the skill's §6 rule). `searchResultLog` joins `fetch_log` in the
  dossier DTO; search-only sources render `data-fetched="search"` + the
  "Search result" label — never "Fetched ✓".
- **Persistence (ADR-084).** `runs.citation_completeness` `{cited,
  coveredBeforeBackfill, backfilled, stripped, downgradedOrdinals, missed[]}`
  written in the delivery transaction; the orchestrator stops dropping
  `strippedCitations`; `citation_completeness_daily` rolls up on the worker's
  `cite.completeness.daily` system-pool job (SEC.1 allowlisted).
- **Bounded backfill (ADR-085).** The harness, on the verification ledger's
  commit, asks the server for the run's retrieved set
  (`/internal/runs/:id/retrieved-urls` — fetch ∪ URL-bearing search rows),
  computes `cited ∖ retrieved`, and re-enters verification **once**, fetch-only,
  with the named misses ("`web_fetch` each now, or drop the URL and mark the
  claim Unverifiable"). `phase_class='backfill'` stamps the fetch_log rows;
  `backfillFetchBudget` is a dedicated egress-proxy allowance that leaves
  RES.1's floor intact; every fetch meters to the run.
- **Journey step N11 (AC8, wired red).** CITE.1-owned paid step: golden-op-ed
  Quick/Base Review end-to-end, then the dossier invariant — zero
  `data-url-in-log="false"` claim rows; every cited URL carries a retrieval
  chip (`fetched ✓` or `Search result`), claims table and findings evidence
  alike. It flips green on its Stage-B run with the committed screenshot.

## Live evidence (2026-10-04, read-only where applicable)

- **Baseline (pre-deploy scan, $0):** 53 completed runs scanned, 7 pre-strip
  ledgers scored, 40 distinct cited URLs — **legacy completeness 0.675**
  (what the byte-join would have stripped) vs **canonical 1.0**. All 13
  misses were `normalizationOnly` (trailing-slash/query parity defects on the
  two citing runs); **0 `searchOnly`, 0 `trulyUnretrieved`**. 154 historical
  search rows carried no URL — the parity gap the new search-row logging closes.
- **Migrations applied to prod** (IAP tunnel, additive-lint clean): 0056
  (`phase_class`) + 0057 (completeness columns/table) → `_migrations` = 57.
- **Images built** — Cloud Build `a1a25956` at `5baa666` (tag `prod`):
  api `0df7b7e1`, web `dc619a51`, worker `da8ac0cf`, run-task `53cca280`,
  egress-proxy `9767f907`, collab `fd026a24` — pinned in `Pulumi.prod.yaml`.
- **`pulumi up` owed** — the Pulumi Cloud access token on the build machine
  returned 401 at deploy time; a fresh `pulumi login` is an operator act
  (D-CITE.1-1). The pins are committed, so the apply deploys exactly this set.
- **Paid legs deferred at $0** — the weekly spend guard measured **$58.08 ≥ $5**
  (ISO week 2026-09-28; reset 2026-10-05 00:00 UTC), the deploy is a
  prerequisite, and Legs 1–2's per-probe caps ($1.50/$2) sit below the measured
  completing-probe cost ($3.31–$4.17). D-CITE.1-2/-3/-4 carry the legs;
  D-CITE.1-5 carries the ADR-086 measured rate.

## Evidence (deterministic)

- `pnpm turbo build lint typecheck` — 135/135 green at `5baa666`.
- `pnpm test` — full suite green incl. the CITE.1 additions:
  `benchmark/citation-fetch` 17 (3-way scorer↔guard↔chip parity, trailing-slash/
  query/case/fragment/search-row), `mirror/delivery` 22, `orchestrator/delivery`
  12 (atomic persist + event + `strippedCitations` + RES.2 preserved),
  `run-task/harness-loop` 28 (one re-entry, named misses, skip-on-full,
  seam-failure → deliver anyway), `egress-proxy` 74 (dedicated allowance,
  floor intact, `fetch:false` honored), `api` run/dossier routes,
  `findings-core/ledger`, `ledger/citation-scan` 6, `worker/run-jobs`
  (`force_unverified` → 0 allowance), journeys `registry.test` 7.
- `check-additive-migrations` clean on 0056/0057; `check:licenses` +
  `check:protocol-markers` green; `check-build-memory.sh` 0 violations.

## Non-regression

`validateCitedFetched` unchanged · Path B strip stays for residuals (never
re-tightened) · RES.1 floor untouched (backfill budget is additive + separately
metered) · `force_unverified`/non-verification runs get zero backfill allowance
· persisted figures are counts/ids only (invariant 10) · no protocol text in
events or reports (invariant 3).

## Deferrals

D-CITE.1-1 deploy+provenance (Pulumi credential — operator) · D-CITE.1-2/-3
probe legs (deploy + weekly guard + cap-vs-measure) · D-CITE.1-4 N11 journey +
screenshot (deploy + weekly guard) · D-CITE.1-5 ADR-086 measured rate (rides
the legs). All OPEN; $0 metered spent this Stage B.

## Requirement IDs

REQ-VIS-9 (primary) · REQ-IDE-25 · REQ-OBJ-18

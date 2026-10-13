# ADR-084: Citation-completeness persistence — a separate `runs.citation_completeness` column + a system-pool daily rollup; a reported signal, not an SLO

- **Status:** Proposed
- **Date:** 2026-10-04
- **Ticket:** CITE.1
- **Requirement ids:** REQ-VIS-9
- **Spec:** §8.4, §12.7, §13.5; ADR-006; ADR-026 (RES.2 write-once `runs.delivery`)

## Context

CITE.1 must persist a per-run citation-completeness record and a cross-tenant aggregate. Two forces
shaped where it lands:

- `runs.delivery` is RES.2's **write-once** label (`{label:'unverified', checkableClaims,
  coveredClaims}` + settlement markers, migration 0047). Its shape is a landed contract — folding
  completeness into it would either mutate a sealed shape or conflate a measured rate with a
  classification.
- The completeness record exists whether or not a run is Unverified (a 100%-covered run still
  records its rate); it must persist atomically with delivery/finalization so the measured rate can
  never be orphaned from the dossier it describes.
- The aggregate must be cross-tenant (SEC.1 system pool only — never a user route), must carry
  counts and rates only (invariant 10: no URLs, no tenant data), and must exclude flagged test
  tenants (JOURNEY.1).

## Decision

1. **`runs.citation_completeness` jsonb (migration 0057).** The mirror's delivery transaction writes
   the record in the SAME commit as the delivered dossier, on its own column — `runs.delivery`
   stays RES.2's untouched write-once shape. The record holds counts + canonical URL identifiers:
   `cited`, `covered`, `missed`, `stripped`, `missedUrls`, `backfillRan`, `backfillResolved`,
   `searchCovered` (post-backfill, measured on the identical cited⇒retrieved join the guard
   enforces — ADR-083).
2. **`run.citation_completeness` event** (internal visibility, verbose density): counts + missed-url
   identifiers only — durable telemetry, never a card the run UI renders.
3. **The orchestrator stops discarding the strip.** `DeliverRunResult` now carries
   `strippedCitations` + `citationCompleteness`; the harness's delivered payload surfaces them.
4. **`citation_completeness_daily` (migration 0057) + `cite.completeness.daily` worker sweep** on the
   system executor: a trailing-7d aggregate over test-tenant-excluded completed runs, upserted one
   row per UTC day (the durable time series) plus one `[cite]` JSON log line (the metric seam). The
   user role holds no grant on the table (RLS census pin).
5. **A reported signal, deliberately not a §13.5 SLO row.** CITE.1 measures the rate so the
   threshold-setting decision waits on baseline + Stage-B evidence rather than inventing a number.
6. **Read-only historical scans stay read-only.** `packages/ledger`'s citation scan recomputes from
   the pre-strip committed claim-ledger artifact + `fetch_log`; it never retroactively relabels or
   refunds (GD-RES.2-1 stays with its owner).

## Consequences

- The measured rate is durable per run and in aggregate before ECON.2 costs this pipeline — its OFF
  arm can now read `phase_class='backfill'` rows for the mechanism delta.
- RES.2's label contract is untouched; the two facts (classification vs measured completeness) are
  independently auditable.
- The daily table is a system aggregate — the tenancy census and grant census pin it as non-tenant,
  user-role-denied.
- A partial deploy (column ahead of code) fails safe: the sweep logs and retries next tick.

## Alternatives considered

- **Fold into `runs.delivery`** — rejected: mutates RES.2's write-once landed shape and couples a
  measured rate to a classification contract.
- **Event-only persistence** — rejected: events are an append log; querying a per-run record or a
  window aggregate from them is fragile and loses the atomic-with-delivery guarantee a column gives.
- **A user-route aggregate endpoint** — rejected: cross-tenant aggregates are system-pool reads by
  SEC.1; the boundary test + lint enforce it.

## Revisit trigger

Reopen when the completeness rate needs a §13.5 SLO row (the baseline/Stage-B evidence that would
justify a threshold), or when consumers need finer granularity than one row per UTC day.

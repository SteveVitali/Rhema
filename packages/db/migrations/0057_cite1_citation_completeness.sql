-- CITE.1 (REQ-VIS-9; ADR-084) — the measured citation-completeness record, persisted per run.
-- `runs.citation_completeness` carries the jsonb the mirror's delivery transaction computed on the
-- SAME cited⇒retrieved join `validateCitedFetched` enforces (post-backfill): counts, the stripped
-- url identifiers, and the mechanism-A backfill outcome. Kept OUT of `runs.delivery` so RES.2's
-- write-once unverified-label shape (migration 0047) stays untouched.

alter table runs add column if not exists citation_completeness jsonb;

-- the aggregate scan: completeness-bearing completed runs by end time.
create index if not exists idx_runs_citation_completeness
  on runs (ended_at)
  where citation_completeness is not null;

-- The cross-tenant reporting surface (worker system-pool rollup, ADR-084): one row per UTC day the
-- `cite.completeness.daily` sweep ran. Counts and rates only — flagged test tenants are excluded at
-- write time (JOURNEY.1), never tenant data and never urls (invariant 10: the per-run missed-url
-- identifiers stay on `runs.citation_completeness`, not on this aggregate).
create table if not exists citation_completeness_daily (
  day date not null,
  runs int not null,
  cited int not null,
  covered int not null,
  missed int not null,
  stripped int not null,
  backfill_ran_runs int not null,
  backfill_resolved int not null,
  search_covered int not null,
  rate double precision,
  computed_at timestamptz not null default now(),
  primary key (day)
);

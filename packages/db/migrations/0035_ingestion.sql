-- 0035_ingestion.sql — P1.15 (§9.5 ingestion full: Connection→DiscoveredItem→Sample(version)).
--
-- The P1.10 schema already carries connections / discovered_items / sample_versions; this adds the
-- deltas the full ingestion pass needs — all additive, forward-only, nullable-safe:
--
--   1. personas.deleted_at — the voice-delete marker (REQ-INGEST-16). Delete stamps it, the voice
--      vanishes from every read, and the `voice.purge` worker job hard-cascades samples, raw bytes,
--      and profile data inside the retention window. Forked house-style samples are REFERENCES to
--      the same artifact rows — the cascade deletes only rows the persona owns, so a forked corpus
--      survives its source's deletion.
--
--   2. discovered_items.subtitle / byline — the listing fields a provider discovery reports (the
--      Substack archive carries both; the review pane shows them). Nullable; no consumer depends.
--
--   3. sample_versions.original_key — where the RAW source bytes live (the content store key the
--      original_sha256 addresses). The quality drawer's side-by-side preview + any re-convert read
--      the raw bytes back through this pointer; `original_sha256` stays the integrity hash.
--
--   4. connections.removed_at — the Sources pane's Remove is a soft detach: items + every sample
--      version RETAIN (an unlinked source's corpus is still the user's data); the row drops out of
--      the sources list and out of sync scheduling.

alter table personas
  add column if not exists deleted_at timestamptz;

alter table discovered_items
  add column if not exists subtitle text,
  add column if not exists byline text;

alter table sample_versions
  add column if not exists original_key text;

alter table connections
  add column if not exists removed_at timestamptz;

-- 5. The diff key (REQ-INGEST-6): one row per (connection, external_id) — the sync engine's upserts
--    and dedup rely on it. Partial (external_id is null only for legacy/manual rows).
create unique index if not exists discovered_items_conn_external
  on discovered_items (connection_id, external_id) where external_id is not null;

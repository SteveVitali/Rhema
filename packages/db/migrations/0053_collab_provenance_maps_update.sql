-- 0053_collab_provenance_maps_update.sql — EDIT.1 (REQ-IDE-32): the collab role needs UPDATE on
-- provenance_maps.
--
-- 0028 granted `rhema_collab` select+insert on `provenance_maps` for the debounced materialization's
-- block-level provenance capture. But saveManualRevision writes the map as an UPSERT —
-- `insert … on conflict (draft_version_id) do update` (manual-revision.ts) — and Postgres requires
-- the UPDATE privilege for the conflict-update path even when no conflict ever lands. The live
-- N8 walk caught it: the first keystroke's fork died inside storeDocumentHooks with
-- `permission denied for table provenance_maps` (42501), the working child was rolled back, and the
-- Page's fork banner never flipped. Deterministic coverage masked it — PGlite runs as superuser, so
-- no ACL check ever fired in tests (the same blind spot the chain already documents for FORCE RLS).
--
-- Purely additive: a grant only. The update the collab role may perform is exactly the conflict
-- branch of the same insert — the map row for a materialized version, spans replaced wholesale.

grant update on provenance_maps to rhema_collab;

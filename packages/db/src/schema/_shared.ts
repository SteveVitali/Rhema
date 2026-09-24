import { customType } from "drizzle-orm/pg-core";

// Shared column helpers for the Drizzle schema (the typed query layer over migrations/0002_schema.sql).

/** Postgres `bytea` (CRDT y_state / state_vector). */
export const bytea = customType<{ data: Uint8Array; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
});

/** Postgres `tsvector` (the generated full-text column on project_search_docs — read-only). */
export const tsvector = customType<{ data: string; notNull: false; default: false }>({
  dataType() {
    return "tsvector";
  },
});

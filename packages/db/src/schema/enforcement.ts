import { pgTable, text, integer, timestamp, jsonb, primaryKey } from "drizzle-orm/pg-core";

// Enforcement & provenance (§12.6) — mirrors migrations/0002_schema.sql (+ 0006 fetch_log.attempt,
// 0009 run_mounts / subagent_launches).

export const accessLog = pgTable("access_log", {
  runId: text("run_id").notNull(),
  ts: timestamp("ts").notNull(),
  agentLabel: text("agent_label").notNull(),
  tool: text("tool").notNull(),
  path: text("path").notNull(),
  namespace: text("namespace"),
  decision: text("decision").notNull(),
});

export const fetchLog = pgTable("fetch_log", {
  runId: text("run_id").notNull(),
  ts: timestamp("ts").notNull(),
  agentLabel: text("agent_label").notNull(),
  // The run attempt this request belongs to (added 0006; the proxy tags run_id/attempt/agent_id — §12.7).
  attempt: integer("attempt").notNull().default(1),
  kind: text("kind").notNull(),
  query: text("query"),
  url: text("url"),
  normalizedUrl: text("normalized_url"),
  status: integer("status"),
  bytes: integer("bytes"),
  decision: text("decision").notNull(),
  denyReason: text("deny_reason"),
});

export const provenanceMaps = pgTable("provenance_maps", {
  draftVersionId: text("draft_version_id").primaryKey(),
  granularity: text("granularity").notNull().default("block"),
  spans: jsonb("spans").notNull(),
});

// The persisted hydration manifest, one row per (run, attempt) — the server-side fact the boundary
// attestation rests on (§12.6; REQ-DATA-19/20; migration 0009). `manifest` is the array of mounted paths
// with their artifact_version_id / sha256 / mode.
export const runMounts = pgTable(
  "run_mounts",
  {
    runId: text("run_id").notNull(),
    attempt: integer("attempt").notNull(),
    seat: text("seat").notNull(),
    manifest: jsonb("manifest").notNull(),
    materializedAt: timestamp("materialized_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.attempt] })],
);

// The orchestrator's input-scoped subagent launch records (§12.6; REQ-DATA-17/18; migration 0009): the
// enumerated input files + the producer_query_id the delivery producer check verifies.
export const subagentLaunches = pgTable("subagent_launches", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  attempt: integer("attempt").notNull(),
  label: text("label").notNull(),
  model: text("model"),
  inputsKind: text("inputs_kind").notNull(),
  inputPaths: text("input_paths").array().notNull().default([]),
  fileCount: integer("file_count").notNull().default(0),
  producerQueryId: text("producer_query_id"),
  launchedAt: timestamp("launched_at").notNull().defaultNow(),
});

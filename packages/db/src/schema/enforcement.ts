import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

// Enforcement & provenance (§12.6) — mirrors migrations/0002_schema.sql.

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

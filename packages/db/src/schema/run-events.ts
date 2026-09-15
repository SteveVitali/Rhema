import { pgTable, text, integer, timestamp, jsonb, date, primaryKey } from "drizzle-orm/pg-core";

// The run-event store (§12.5) — mirrors migrations/0008_run_events.sql. `run_events` is a daily RANGE-partitioned
// table in the migration; Drizzle models the parent's column shape (it does not express partitioning — the
// parity test only asserts the columns exist). The delivery LOGIC (writer, seq, SSE replay/tail, retention)
// lives in @rhema/orchestrator (P0.08b); this is the table shape only.

export const runEvents = pgTable(
  "run_events",
  {
    runId: text("run_id").notNull(),
    seq: integer("seq").notNull(),
    workspaceId: text("workspace_id").notNull(), // denormalized tenant key (RLS)
    day: date("day").notNull(), // partition key: UTC date of `at`
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    density: text("density").notNull(), // summary | normal | verbose
    agentLabel: text("agent_label"),
    visibility: text("visibility").notNull().default("user"), // CHECK visibility='user' in the migration
    at: timestamp("at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.seq, t.day] })],
);

export const runEventsInternal = pgTable(
  "run_events_internal",
  {
    runId: text("run_id").notNull(),
    seq: integer("seq").notNull(),
    workspaceId: text("workspace_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    agentLabel: text("agent_label"),
    at: timestamp("at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.seq] })],
);

export const runEventSeq = pgTable("run_event_seq", {
  runId: text("run_id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  seq: integer("seq").notNull().default(0),
});

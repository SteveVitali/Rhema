import { pgTable, text, integer, bigint, doublePrecision, timestamp, jsonb, date, primaryKey } from "drizzle-orm/pg-core";

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

// The pause-signal transport (migration 0041; P1.22; REQ-ARCH-32) — the proxy INSERTs, the worker's pause
// sweep claims + processes. NOT under RLS (system-scoped like run_events_internal): written cross-tenant,
// never served on a tenant route. `claimed_at`/`attempts`/`processed_at` are the drain's lease machinery.
export const pauseSignals = pgTable("pause_signals", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  runId: text("run_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  reason: text("reason").notNull(), // CHECK reason IN (suspicious_query|egress_denied_spike|user_source_fetch)
  detail: jsonb("detail").notNull().default({}),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

// The §13.5 telemetry sample store (migration 0042; STB.2 / D-P1.22-1 + D-P0.08b-3): platform signals
// (`event_delivery_ms`, `autosave_save_ms`) written inside the api's tenant transaction, probed
// cross-tenant by the worker's system-scoped SLO sweep. NOT under RLS — same posture as
// `run_events_internal`/`pause_signals`: workspace_id is recorded for hygiene, never for filtering;
// the worker's daily sweep expires rows at 7 days.
export const sloSamples = pgTable("slo_samples", {
  signal: text("signal").notNull(),
  valueMs: doublePrecision("value_ms").notNull(),
  workspaceId: text("workspace_id"),
  runId: text("run_id"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

// The project-scoped, non-run half of the §5.5 timeline (migration 0019; PRB.07): human-revision events
// (`draft.forked`, the manual `revision.move_traced`) carry no runs FK target, so they land here instead of
// `run_events`. Payloads are the same RUN_EVENTS catalogue shapes — `parseRunEvent` gates every write.
export const timelineEvents = pgTable("timeline_events", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  workspaceId: text("workspace_id").notNull(), // denormalized tenant key (RLS)
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull(),
});

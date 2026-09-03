import { pgTable, text, integer, timestamp, jsonb, primaryKey } from "drizzle-orm/pg-core";

// Revision obligations (v0.3, §11.7) — mirrors migrations/0002_schema.sql. The row's `state` is a cache of the
// last obligation_transitions row (a trigger keeps them equal); the transitions are the append-only truth.

export const revisionObligations = pgTable("revision_obligations", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  source: text("source").notNull(),
  findingId: text("finding_id"),
  severity: text("severity").notNull(),
  kind: text("kind"),
  title: text("title").notNull(),
  state: text("state").notNull().default("open"),
  stateSince: timestamp("state_since").notNull().defaultNow(),
  openedOnDraftId: text("opened_on_draft_id"),
  rationale: text("rationale"),
  deferHorizon: jsonb("defer_horizon"),
  roundsOpen: integer("rounds_open").notNull().default(0),
  dischargedBy: jsonb("discharged_by"),
  createdBy: jsonb("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
});

export const obligationFindings = pgTable(
  "obligation_findings",
  {
    obligationId: text("obligation_id").notNull(),
    findingId: text("finding_id").notNull(),
    correspondenceId: text("correspondence_id").notNull(),
    relation: text("relation").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.obligationId, t.findingId] }) }),
);

export const obligationTransitions = pgTable("obligation_transitions", {
  id: text("id").primaryKey(),
  obligationId: text("obligation_id").notNull(),
  fromState: text("from_state"),
  toState: text("to_state").notNull(),
  cause: text("cause").notNull(),
  byActor: jsonb("by_actor").notNull(),
  runId: text("run_id"),
  dispositionId: text("disposition_id"),
  findingId: text("finding_id"),
  at: timestamp("at").notNull().defaultNow(),
});

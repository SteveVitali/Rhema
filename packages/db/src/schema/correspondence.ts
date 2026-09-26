import { pgTable, text, integer, smallint, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";

// Correspondence, claims, claim sources, findings, dispositions — mirrors migrations/0002_schema.sql.

export const correspondenceItems = pgTable("correspondence_items", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  kind: text("kind").notNull(),
  draftId: text("draft_id").notNull(),
  runId: text("run_id").notNull(),
  ordinal: integer("ordinal").notNull().default(1),
  deliveredAt: timestamp("delivered_at").notNull(),
  artifactIds: text("artifact_ids").array().notNull(),
  rubric: jsonb("rubric"),
  verdict: text("verdict"),
  protocolId: text("protocol_id"),
  protocolVersion: integer("protocol_version"),
  scope: jsonb("scope"),
  optedOut: text("opted_out").array().notNull().default([]),
  priorReviewId: text("prior_review_id"),
  // PRB.10 — the voice facts stamped at delivery (REQ-PERSONA-17/20): the pinned profile snapshot +
  // its build date the note was written against, and 'linked' | 'ad_hoc' (a no-voice piece's label).
  personaProfileSnapshotId: text("persona_profile_snapshot_id"),
  personaSnapshotAt: timestamp("persona_snapshot_at"),
  voiceMode: text("voice_mode"),
});

export const claims = pgTable("claims", {
  id: text("id").primaryKey(),
  correspondenceId: text("correspondence_id").notNull(),
  draftId: text("draft_id").notNull(),
  ordinal: integer("ordinal").notNull(),
  text: text("text").notNull(),
  tier: smallint("tier"),
  verdict: text("verdict").notNull(),
  kind: text("kind"),
  url: text("url"),
  normalizedUrl: text("normalized_url"),
  accessedAt: timestamp("accessed_at"),
  note: text("note"),
  sourceCheck: text("source_check"),
  anchor: jsonb("anchor"),
  humanAdded: boolean("human_added").notNull().default(false),
  figureId: text("figure_id"),
  extra: jsonb("extra"),
});

export const claimSources = pgTable("claim_sources", {
  claimId: text("claim_id").notNull(),
  ordinal: integer("ordinal").notNull(),
  url: text("url").notNull(),
  normalizedUrl: text("normalized_url").notNull(),
  accessedAt: timestamp("accessed_at").notNull(),
  stance: text("stance").notNull(),
  note: text("note"),
});

export const findings = pgTable("findings", {
  id: text("id").primaryKey(),
  correspondenceId: text("correspondence_id").notNull(),
  draftId: text("draft_id").notNull(),
  ordinal: integer("ordinal").notNull(),
  kind: text("kind").notNull(),
  severity: text("severity").notNull(),
  origin: text("origin").notNull(),
  reconciliation: text("reconciliation"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  evidence: jsonb("evidence"),
  suggestion: jsonb("suggestion"),
  rubricDims: text("rubric_dims").array().notNull().default([]),
  letterSection: text("letter_section"),
  anchor: jsonb("anchor"),
  projections: jsonb("projections").notNull().default([]),
});

export const dispositions = pgTable("dispositions", {
  id: text("id").primaryKey(),
  findingId: text("finding_id").notNull(),
  responseId: text("response_id"),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("proposed"),
  rationale: text("rationale"),
  adaptedText: text("adapted_text"),
  reasonCode: text("reason_code"), // PRB.05 — REQ-BETA-6 one-tap chip (optional)
  moveOrdinal: integer("move_ordinal"),
  applied: boolean("applied"),
  byActor: jsonb("by_actor").notNull(),
  frozenAt: timestamp("frozen_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const decisionRequests = pgTable("decision_requests", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  sourceRunId: text("source_run_id"),
  obligationId: text("obligation_id"), // escalation link (§11.7; added in migration 0012)
  text: text("text").notNull(),
  options: text("options").array().notNull(),
  state: text("state").notNull().default("open"),
  answer: text("answer"),
});

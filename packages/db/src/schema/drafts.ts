import { pgTable, text, integer, bigint, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { bytea } from "./_shared.js";

// Drafts (three tiers) — mirrors migrations/0002_schema.sql.

export const drafts = pgTable("drafts", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  n: integer("n").notNull(),
  origin: text("origin").notNull(),
  state: text("state").notNull().default("working"),
  promotedVersionId: text("promoted_version_id"),
  liveDocId: text("live_doc_id"),
  frozenAt: timestamp("frozen_at"),
  frozenBy: jsonb("frozen_by"),
  baseDraftId: text("base_draft_id"),
  claimsPendingVerification: boolean("claims_pending_verification").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const liveDocs = pgTable("live_docs", {
  id: text("id").primaryKey(),
  draftId: text("draft_id"),
  yState: bytea("y_state").notNull(),
  stateVector: bytea("state_vector").notNull(),
  mdSha256: text("md_sha256"),
  materializedAt: timestamp("materialized_at"),
  // 0059 (F-R6H11-1) — out-of-band y_state replacement generation; the collab runtime
  // converges on a newer epoch instead of flushing its stale in-memory doc over it.
  yEpoch: bigint("y_epoch", { mode: "number" }).notNull().default(0),
});

export const restorePoints = pgTable("restore_points", {
  id: text("id").primaryKey(),
  liveDocId: text("live_doc_id"),
  s3Key: text("s3_key").notNull(),
  kind: text("kind").notNull(),
  cause: text("cause").notNull(),
  label: text("label"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const workingCopies = pgTable("working_copies", {
  id: text("id").primaryKey(),
  baseDraftId: text("base_draft_id"),
  liveDocId: text("live_doc_id"),
  reconciledInto: text("reconciled_into"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

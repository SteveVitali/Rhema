import { pgTable, text, integer, timestamp, jsonb, primaryKey } from "drizzle-orm/pg-core";

// Projects & sharing — mirrors migrations/0002_schema.sql.

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  protocolId: text("protocol_id"),
  protocolVersion: integer("protocol_version").notNull().default(1),
  venue: text("venue"),
  personaId: text("persona_id"),
  personaProfileSnapshotId: text("persona_profile_snapshot_id"),
  register: text("register"),
  personaLockedAt: timestamp("persona_locked_at"),
  approvalPolicy: text("approval_policy").notNull().default("named"),
  approvalOverrides: jsonb("approval_overrides"),
  rigorDefault: text("rigor_default").notNull().default("standard"),
  modelTierDefault: text("model_tier_default"),
  paperTheme: text("paper_theme").notNull().default("light"),
  tags: text("tags").array(),
  monthlyCreditCap: integer("monthly_credit_cap"),
  acceptedDraftId: text("accepted_draft_id"),
  activeWriterRunId: text("active_writer_run_id"), // per-project writer lock (§12.4; 0007)
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: text("project_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").notNull(),
    invitedBy: text("invited_by"),
    runCreditCap: integer("run_credit_cap"),
  },
  (t) => ({ pk: primaryKey({ columns: [t.projectId, t.userId] }) }),
);

import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// PRB.11 (0023) — the author's append-only AI-use statement additions (§8.4 REQ-VIS-10). Generated
// sentences are recomputed from run rows on every read (never stored); only user additions persist, and
// the table grants select+insert only — append-only below the API.
export const aiUseAdditions = pgTable("ai_use_additions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  projectId: text("project_id").notNull(),
  sentence: text("sentence").notNull(),
  byActor: jsonb("by_actor").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

// Agent types & instances — mirrors migrations/0002_schema.sql. Seeded from code (seed/code-seed.ts).

export const agentTypes = pgTable("agent_types", {
  key: text("key").primaryKey(),
  displayName: text("display_name").notNull(),
  readable: text("readable").array().notNull(),
  writable: text("writable").array().notNull(),
  personaView: text("persona_view").array().notNull(),
  tools: text("tools").array().notNull(),
  skills: text("skills").array().notNull(),
  defaultModelProfile: text("default_model_profile").notNull(),
  subagents: jsonb("subagents").notNull(),
});

export const agentInstances = pgTable("agent_instances", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  personaId: text("persona_id"),
  typeKey: text("type_key").notNull(),
  namespace: text("namespace").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

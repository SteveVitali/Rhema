import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

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
  // P1.11 (0033; §7.1): the assistant-shaped fields — the read-deny globs, the thread default
  // tier, and the hard per-turn budgets (40 cr / 5 searches / 10 fetches on the assistant row).
  denies: text("denies").array().notNull().default([]),
  defaultThreadTier: text("default_thread_tier"),
  perTurnCredits: integer("per_turn_credits"),
  perTurnSearches: integer("per_turn_searches"),
  perTurnFetches: integer("per_turn_fetches"),
});

export const agentInstances = pgTable("agent_instances", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  personaId: text("persona_id"),
  typeKey: text("type_key").notNull(),
  namespace: text("namespace").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

import { pgTable, text, integer, timestamp, boolean, jsonb, unique } from "drizzle-orm/pg-core";

// Guidance, threads, protocols, notifications, figures — mirrors migrations/0002_schema.sql.

export const guidance = pgTable("guidance", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  runId: text("run_id"), // run-scope guidance (0010); null = project-scope standing guidance
  source: text("source"),
  anchors: jsonb("anchors"),
  body: text("body").notNull(),
  standing: boolean("standing").notNull().default(false), // true = project-scope standing guidance
  workflows: text("workflows").array(), // narrows which workflows the guidance applies to (0010)
  consumedBy: jsonb("consumed_by").notNull().default([]), // {runId, phase}[] delivery records (0010)
  active: boolean("active").notNull().default(true), // standing guidance is retirable, never deleted (0010)
  createdBy: jsonb("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const threads = pgTable("threads", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  name: text("name"),
  sessionStoreKey: text("session_store_key"),
  briefKey: text("brief_key"),
  // P1.11 (0033): pins.json blob key, the undeletable-default flag, and the list ordering.
  pinsKey: text("pins_key"),
  isDefault: boolean("is_default").notNull().default(false),
  createdBy: text("created_by"),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const protocols = pgTable(
  "protocols",
  {
    id: text("id").notNull(),
    version: integer("version").notNull(),
    body: jsonb("body").notNull(),
    seededAt: timestamp("seeded_at").notNull().defaultNow(),
    venueTableVerifiedAt: timestamp("venue_table_verified_at"),
  },
  (t) => ({ idVersion: unique().on(t.id, t.version) }),
);

export const inboxItems = pgTable("inbox_items", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  projectId: text("project_id"),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const notificationDevices = pgTable("notification_devices", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  token: text("token").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const notificationPrefs = pgTable("notification_prefs", {
  userId: text("user_id").primaryKey(),
  prefs: jsonb("prefs").notNull().default({}),
});

// PRB.09 — signed one-click action state + the per-(user, channel, event) delivery ledger (0021).

export const emailActionTokens = pgTable("email_action_tokens", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  gateId: text("gate_id").notNull(),
  runId: text("run_id").notNull(),
  userId: text("user_id").notNull(),
  action: text("action").notNull(), // 'open' | 'hold' — never an approve action
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    userId: text("user_id").notNull(),
    channel: text("channel").notNull().default("email"),
    eventType: text("event_type").notNull(),
    dedupKey: text("dedup_key").notNull(),
    runId: text("run_id"),
    subject: text("subject"),
    status: text("status").notNull().default("claimed"), // 'claimed' | 'sent'
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({ dedup: unique().on(t.userId, t.channel, t.dedupKey) }),
);

export const figures = pgTable("figures", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  artifactId: text("artifact_id"),
  specKind: text("spec_kind").notNull(),
  specVersionId: text("spec_version_id"),
  dataVersionId: text("data_version_id"),
  renderedVersionId: text("rendered_version_id"),
  caption: text("caption"),
  alt: text("alt"),
  sourceLine: text("source_line"),
  provenance: jsonb("provenance"),
  insertedInDraftId: text("inserted_in_draft_id"),
});

export const figureVersions = pgTable("figure_versions", {
  id: text("id").primaryKey(),
  figureId: text("figure_id").notNull(),
  ordinal: integer("ordinal").notNull(),
  specVersionId: text("spec_version_id"),
  renderedVersionId: text("rendered_version_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

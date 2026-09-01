import { pgTable, text, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";

// Artifacts — mirrors migrations/0002_schema.sql. `artifact` is the one typed-document table (§11.1).

export const artifacts = pgTable("artifacts", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  projectId: text("project_id"),
  personaId: text("persona_id"),
  kind: text("kind").notNull(),
  namespace: text("namespace").notNull(),
  mirrorPath: text("mirror_path").notNull(),
  headVersionId: text("head_version_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const artifactVersions = pgTable("artifact_versions", {
  id: text("id").primaryKey(),
  artifactId: text("artifact_id").notNull(),
  ordinal: integer("ordinal").notNull(),
  contentSha256: text("content_sha256").notNull(),
  s3Key: text("s3_key").notNull(),
  bytes: integer("bytes").notNull(),
  wordCount: integer("word_count"),
  mediaType: text("media_type").notNull(),
  createdBy: jsonb("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  immutable: boolean("immutable").notNull().default(false),
  parseStatus: text("parse_status"),
  producerQueryId: text("producer_query_id"),
  blockIdMap: jsonb("block_id_map"),
});

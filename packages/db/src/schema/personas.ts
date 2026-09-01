import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  date,
  primaryKey,
} from "drizzle-orm/pg-core";

// Voices / personas (§9) — mirrors migrations/0002_schema.sql.

export const personas = pgTable("personas", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  slug: text("slug"),
  displayName: text("display_name"),
  byline: text("byline"),
  mode: text("mode").notNull(),
  kind: text("kind").notNull(),
  provenance: text("provenance"),
  seedArtifactId: text("seed_artifact_id"),
  seedSha256: text("seed_sha256"),
  seedAuthoredBy: text("seed_authored_by"),
  registers: text("registers").array(),
  seedUpdatedAt: timestamp("seed_updated_at"),
  currentProfileId: text("current_profile_id"),
  activeRunId: text("active_run_id"),
});

export const personaMembers = pgTable(
  "persona_members",
  {
    compositeId: text("composite_id").notNull(),
    memberId: text("member_id").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.compositeId, t.memberId] }) }),
);

export const connections = pgTable("connections", {
  id: text("id").primaryKey(),
  personaId: text("persona_id").notNull(),
  provider: text("provider").notNull(),
  handle: text("handle"),
  authRef: text("auth_ref"),
  status: text("status"),
  lastSyncAt: timestamp("last_sync_at"),
  schedule: text("schedule"),
  autoIncludeNew: boolean("auto_include_new"),
  error: text("error"),
});

export const discoveredItems = pgTable("discovered_items", {
  id: text("id").primaryKey(),
  connectionId: text("connection_id").notNull(),
  externalId: text("external_id"),
  title: text("title"),
  url: text("url"),
  date: date("date"),
  wordCount: integer("word_count"),
  access: text("access"),
  remoteChangeKey: text("remote_change_key"),
  state: text("state").notNull(),
  currentSampleId: text("current_sample_id"),
});

export const sampleVersions = pgTable("sample_versions", {
  id: text("id").primaryKey(),
  discoveredItemId: text("discovered_item_id").notNull(),
  n: integer("n").notNull(),
  contentSha256: text("content_sha256").notNull(),
  originalSha256: text("original_sha256"),
  artifactVersionId: text("artifact_version_id"),
  quality: text("quality"),
  qualityNotes: text("quality_notes").array(),
  wordCount: integer("word_count"),
});

export const personaProfiles = pgTable("persona_profiles", {
  id: text("id").primaryKey(),
  personaId: text("persona_id").notNull(),
  builtByRunId: text("built_by_run_id"),
  builtAt: timestamp("built_at").notNull(),
  tier: text("tier"),
  seedSha256: text("seed_sha256"),
  sampleSetHash: text("sample_set_hash"),
  sampleSet: jsonb("sample_set").notNull(),
  corpusSizeAtBuild: integer("corpus_size_at_build"),
  calibrationStatus: text("calibration_status"),
  artifactIds: text("artifact_ids").array().notNull(),
  memberProfileIds: text("member_profile_ids").array(),
  buildNote: jsonb("build_note"),
});

export const personaBuildNotes = pgTable("persona_build_notes", {
  id: text("id").primaryKey(),
  personaId: text("persona_id").notNull(),
  profileId: text("profile_id"),
  body: text("body"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const profileCorrections = pgTable("profile_corrections", {
  id: text("id").primaryKey(),
  personaId: text("persona_id").notNull(),
  profileId: text("profile_id"),
  targetArtifactId: text("target_artifact_id"),
  statementRef: text("statement_ref"),
  text: text("text").notNull(),
  source: text("source").notNull(),
  consumedByProfileId: text("consumed_by_profile_id"),
  at: timestamp("at").notNull().defaultNow(),
});

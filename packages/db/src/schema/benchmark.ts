import {
  pgTable,
  text,
  integer,
  bigint,
  numeric,
  boolean,
  timestamp,
  jsonb,
  date,
  primaryKey,
} from "drizzle-orm/pg-core";

// §18 evaluation program (comparative benchmark) — mirrors migrations/0013_benchmark_enclave.sql. These tables
// are the benchmark data layer, deliberately SEPARATE from every tenant table (no workspace_id, not RLS-forced;
// reached only by the dedicated rhema_benchmark role — REQ-EVAL-3). Table shape only; the enclave/gold/wave/scorer
// LOGIC is @rhema/benchmark (P0.13).

export const benchmarkCorpusDrafts = pgTable("benchmark_corpus_drafts", {
  id: text("id").primaryKey(),
  protocol: text("protocol").notNull(),
  lengthBand: text("length_band").notNull(),
  wordCount: integer("word_count").notNull(),
  createdAt: timestamp("created_at").notNull(),
  licenseRef: text("license_ref").notNull(),
  contentSha256: text("content_sha256").notNull(),
  enclaveKey: text("enclave_key").notNull(),
  canaryId: text("canary_id").notNull(),
  isDevSet: boolean("is_dev_set").notNull().default(false),
  sourceProjectId: text("source_project_id"),
  rotationYear: integer("rotation_year"),
  retiredAt: timestamp("retired_at"),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

export const benchmarkContaminationRecords = pgTable("benchmark_contamination_records", {
  draftId: text("draft_id").primaryKey(),
  createdAfterCutoff: boolean("created_after_cutoff").notNull(),
  neverPublished: boolean("never_published").notNull().default(false),
  newestModelCutoff: date("newest_model_cutoff").notNull(),
  authorAttestationRef: text("author_attestation_ref").notNull(),
  nearDuplicateClean: boolean("near_duplicate_clean").notNull(),
  nearDuplicateSearchRef: text("near_duplicate_search_ref").notNull(),
  canaryId: text("canary_id").notNull(),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

export const benchmarkWaves = pgTable("benchmark_waves", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  kind: text("kind").notNull().default("scored"),
  isDevSet: boolean("is_dev_set").notNull().default(false),
  agreementFloor: numeric("agreement_floor").notNull(),
  preregistrationHash: text("preregistration_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const benchmarkWaveDrafts = pgTable(
  "benchmark_wave_drafts",
  {
    waveId: text("wave_id").notNull(),
    draftId: text("draft_id").notNull(),
    admittedAt: timestamp("admitted_at").notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.waveId, t.draftId] }) }),
);

export const benchmarkMemorizationProbes = pgTable("benchmark_memorization_probes", {
  id: text("id").primaryKey(),
  waveId: text("wave_id").notNull(),
  draftId: text("draft_id").notNull(),
  arm: text("arm").notNull(),
  model: text("model").notNull(),
  passed: boolean("passed").notNull(),
  probedAt: timestamp("probed_at").notNull().defaultNow(),
});

export const benchmarkGoldAnnotations = pgTable("benchmark_gold_annotations", {
  id: text("id").primaryKey(),
  draftId: text("draft_id").notNull(),
  editorId: text("editor_id").notNull(),
  role: text("role").notNull(),
  finding: jsonb("finding").notNull(),
  material: boolean("material").notNull(),
  isGold: boolean("is_gold").notNull().default(false),
  adjudicatedFrom: text("adjudicated_from").array().notNull().default([]),
  annotatedAt: timestamp("annotated_at").notNull().defaultNow(),
});

export const benchmarkArmRuns = pgTable("benchmark_arm_runs", {
  id: text("id").primaryKey(),
  waveId: text("wave_id").notNull(),
  draftId: text("draft_id").notNull(),
  arm: text("arm").notNull(),
  runId: text("run_id"),
  configHash: text("config_hash").notNull(),
  model: text("model"),
  latencyMs: bigint("latency_ms", { mode: "number" }),
  excluded: boolean("excluded").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const benchmarkProviderVerifications = pgTable("benchmark_provider_verifications", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  termsRef: text("terms_ref").notNull(),
  verifiedAt: timestamp("verified_at").notNull(),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

export const benchmarkEnclaveAccessLog = pgTable("benchmark_enclave_access_log", {
  id: text("id").primaryKey(),
  at: timestamp("at").notNull().defaultNow(),
  actor: text("actor").notNull(),
  action: text("action").notNull().default("read"),
  draftId: text("draft_id"),
  annotationId: text("annotation_id"),
  waveId: text("wave_id"),
  runId: text("run_id"),
  purpose: text("purpose"),
});

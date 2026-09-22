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
  // Phase-0 pilot power record (0015; REQ-EVAL-5): σ_d + the fixed n the pilot wave estimated for the scored waves.
  pilotSigmaD: numeric("pilot_sigma_d"),
  pilotFixedN: integer("pilot_fixed_n"),
  pilotRecordedAt: timestamp("pilot_recorded_at"),
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

// §18 evaluation-program EXECUTION layer — mirrors migrations/0014_benchmark_runner.sql. Same access model as the
// P0.13 tables above (no workspace_id, not RLS-forced; reached only by rhema_benchmark). Table shape only; the arms/
// normalization/matching/judge/pre-registration/report LOGIC is @rhema/benchmark-runner (P0.14).

export const benchmarkArmConfigs = pgTable(
  "benchmark_arm_configs",
  {
    waveId: text("wave_id").notNull(),
    arm: text("arm").notNull(),
    config: jsonb("config").notNull(),
    configHash: text("config_hash").notNull(),
    modelFamily: text("model_family"),
    engineBuild: text("engine_build"),
    protocolVersion: text("protocol_version"),
    steelmanOwner: text("steelman_owner"),
    published: boolean("published").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.waveId, t.arm] }) }),
);

export const benchmarkNormalizedFindings = pgTable("benchmark_normalized_findings", {
  id: text("id").primaryKey(),
  armRunId: text("arm_run_id").notNull(),
  finding: jsonb("finding").notNull(),
  extractor: text("extractor").notNull(),
  blind: boolean("blind").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const benchmarkExtractionAudits = pgTable("benchmark_extraction_audits", {
  id: text("id").primaryKey(),
  waveId: text("wave_id").notNull(),
  normalizedFindingId: text("normalized_finding_id").notNull(),
  auditor: text("auditor").notNull(),
  verdict: text("verdict").notNull(),
  note: text("note"),
  auditedAt: timestamp("audited_at").notNull().defaultNow(),
});

export const benchmarkMatchRecords = pgTable("benchmark_match_records", {
  id: text("id").primaryKey(),
  waveId: text("wave_id").notNull(),
  draftId: text("draft_id").notNull(),
  arm: text("arm").notNull(),
  armFindingId: text("arm_finding_id").notNull().unique(),
  goldFindingId: text("gold_finding_id"),
  suggestedVerdict: text("suggested_verdict"),
  suggestedBy: text("suggested_by"),
  verdict: text("verdict"),
  decidedBy: text("decided_by"),
  blindToArm: boolean("blind_to_arm").notNull().default(true),
  noveltyConfirmed: boolean("novelty_confirmed"),
  adjudicator: text("adjudicator"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  decidedAt: timestamp("decided_at"),
});

export const benchmarkPairwisePreferences = pgTable("benchmark_pairwise_preferences", {
  id: text("id").primaryKey(),
  waveId: text("wave_id").notNull(),
  draftId: text("draft_id").notNull(),
  armA: text("arm_a").notNull(),
  armB: text("arm_b").notNull(),
  presentation: text("presentation").notNull(),
  preferred: text("preferred").notNull(),
  judgeKind: text("judge_kind").notNull(),
  judgeId: text("judge_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const benchmarkJudgeCalibrations = pgTable("benchmark_judge_calibrations", {
  id: text("id").primaryKey(),
  waveId: text("wave_id").notNull(),
  judgeId: text("judge_id").notNull(),
  model: text("model").notNull(),
  family: text("family").notNull(),
  weightedKappa: numeric("weighted_kappa").notNull(),
  kappaFloor: numeric("kappa_floor").notNull().default("0.6"),
  disqualified: boolean("disqualified").notNull(),
  positionConsistency: numeric("position_consistency"),
  calibratedAt: timestamp("calibrated_at").notNull().defaultNow(),
});

export const benchmarkJudgeScores = pgTable("benchmark_judge_scores", {
  id: text("id").primaryKey(),
  waveId: text("wave_id").notNull(),
  draftId: text("draft_id").notNull(),
  arm: text("arm").notNull(),
  judgeId: text("judge_id").notNull(),
  metric: text("metric").notNull(),
  score: numeric("score").notNull(),
  lengthUnits: integer("length_units"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const benchmarkPreregistrations = pgTable("benchmark_preregistrations", {
  waveId: text("wave_id").primaryKey(),
  hash: text("hash").notNull(),
  bundle: jsonb("bundle").notNull(),
  publicRegistrationRef: text("public_registration_ref"),
  frozenAt: timestamp("frozen_at").notNull().defaultNow(),
});

export const benchmarkDeviations = pgTable("benchmark_deviations", {
  id: text("id").primaryKey(),
  waveId: text("wave_id").notNull(),
  kind: text("kind").notNull(),
  detail: text("detail").notNull(),
  loggedAt: timestamp("logged_at").notNull().defaultNow(),
});

export const benchmarkWaveReports = pgTable("benchmark_wave_reports", {
  waveId: text("wave_id").primaryKey(),
  publicReport: jsonb("public_report").notNull(),
  privateReport: jsonb("private_report").notNull(),
  lift: jsonb("lift").notNull(),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
});

export const benchmarkConsequenceLog = pgTable("benchmark_consequence_log", {
  id: text("id").primaryKey(),
  waveId: text("wave_id").notNull(),
  outcome: text("outcome").notNull(),
  disposition: text("disposition").notNull(),
  note: text("note"),
  loggedAt: timestamp("logged_at").notNull().defaultNow(),
});

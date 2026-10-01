import { z } from "zod";

// The closed domain enums (§11.3). P0.02 owns every value; later tickets extend a set by spec amendment,
// never rename in place (REQ-IDE-50). Vocabulary enums (plan/model tier/rigor/seat) live in ./vocab; this
// file holds the structural enums the data model and events key on.

// ---------- artifacts (§8.2, §11.3) ----------
/**
 * The closed 63-value ArtifactKind enum (REQ-SPEC-14). Order and grouping mirror §11.3 verbatim:
 * 12 shared-record + 10 Drafter-namespace + 17 voice-library + 10 Rhema-addition + 14 workflow = 63.
 * `keys(artifactPolicy) ≡ ArtifactKind ≡ the §8.2 row set` is asserted by the REQ-SPEC-14 contract test.
 * Obligations add NO kind; `preference_profile` is the 63rd, pre-registered at §8.2 row R9 (REQ-OBJ-7/9).
 */
export const ARTIFACT_KINDS = [
  // shared record (§8.2 rows 2–11)
  "draft",
  "figure",
  "companion_doc",
  "drafting_note",
  "editors_letter",
  "piece_brief",
  "claim_ledger",
  "discourse_report",
  "argument_notes",
  "craft_notes",
  "second_read",
  "response_letter",
  // Drafter namespace (§8.2 rows 12–22)
  "outline",
  "commissioning_brief",
  "voice_brief",
  "structure_plan",
  "draft_ledger",
  "consolidation_notes",
  "fidelity_audit",
  "source_note",
  "response_ledger",
  "voice_charter",
  // voice library (§8.2 rows 25–38)
  "persona_seed",
  "persona_builder_note",
  "sample",
  "profile_index",
  "voice_print",
  "structure_repertoire",
  "lexicon",
  "exemplars",
  "positions",
  "continuity",
  "audience_venue",
  "calibration_report",
  "profile_provenance",
  "corpus_note",
  "holdout_note",
  "register_map",
  "shared_lexicon",
  // Rhema additions (§8.2 rows R1–R9)
  "run_transcript",
  "access_report",
  "fetch_log",
  "run_report",
  "walkthrough",
  "chat_session",
  "provenance_map",
  "ai_use_statement",
  "research_note",
  "preference_profile",
  // workflow additions (§8.2 rows W1–W15)
  "cut_list",
  "field_map",
  "open_ground",
  "steelman_essay",
  "vulnerability_map",
  "adjudication",
  "convergence_report",
  "title_candidates",
  "abstract_keywords",
  "reverse_outline",
  "suggestion_set",
  "pattern_note",
  "guidance_record",
  "sidecar",
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];
export const artifactKindSchema = z.enum(ARTIFACT_KINDS);

/** Visibility levels (§8.1). */
export const VISIBILITY_LEVELS = ["SE", "SR", "I", "H"] as const;
export type Visibility = (typeof VISIBILITY_LEVELS)[number];
export const visibilitySchema = z.enum(VISIBILITY_LEVELS);

/** Reason classes for a visibility decision (§8.1). */
export const REASON_CLASSES = ["ux", "integrity_boundary", "secret_sauce", "immutability"] as const;
export type ReasonClass = (typeof REASON_CLASSES)[number];
export const reasonClassSchema = z.enum(REASON_CLASSES);

/** Edit mechanism for an artifact kind (§8.2). */
export const EDIT_MODES = ["live_doc", "form", "guidance_only", "none"] as const;
export type EditMode = (typeof EDIT_MODES)[number];
export const editModeSchema = z.enum(EDIT_MODES);

// ---------- projects & lifecycle (§6.3, §11.3) ----------
export const PROJECT_STATE_KEYS = [
  "empty",
  "researching",
  "outlined",
  "draft",
  "reviewed",
  "edited_by_you",
  "accepted",
  "exported",
  "archived",
] as const;
export type ProjectStateKey = (typeof PROJECT_STATE_KEYS)[number];
export const projectStateKeySchema = z.enum(PROJECT_STATE_KEYS);

export const WORKSPACE_ROLES = ["member", "admin"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
export const PROJECT_ROLES = ["viewer", "editor", "admin"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

// ---------- drafts (§11.3) ----------
export const DRAFT_ORIGINS = [
  "drafted_from_outline",
  "response_to_review",
  "human_upload",
  "human_revision",
  "duplicate",
  "imported",
  "cut",
] as const;
export type DraftOrigin = (typeof DRAFT_ORIGINS)[number];
export const draftOriginSchema = z.enum(DRAFT_ORIGINS);
export const DRAFT_STATES = ["working", "frozen"] as const;
export type DraftState = (typeof DRAFT_STATES)[number];

// ---------- ingestion / conversion quality (§9.5; REQ-INGEST-7/8) ----------
// The import quality verdict for a converted document. PDF LLM-reconstruction tiers are P1.15; PRB.02 keeps
// the plumbing (the enum + the conversion-preview surface it feeds).
export const QUALITY_VERDICTS = ["clean", "reconstructed", "partial", "unreadable", "empty"] as const;
export type QualityVerdict = (typeof QUALITY_VERDICTS)[number];
export const qualityVerdictSchema = z.enum(QUALITY_VERDICTS);

// ---------- correspondence, claims, findings, dispositions (§5.7, §11.3) ----------
export const CORRESPONDENCE_KINDS = [
  "drafting_note",
  "review",
  "response",
  "walkthrough",
  "research_note",
  "cut_list",
  "field_map",
  "steelman",
  "convergence_report",
] as const;
export type CorrespondenceKind = (typeof CORRESPONDENCE_KINDS)[number];
export const correspondenceKindSchema = z.enum(CORRESPONDENCE_KINDS);

/**
 * The frozen seven-value ClaimVerdict enum (REQ-OBJ-17). Six values + `verified_against_user_source`
 * (the seventh, under the Memo protocol, REQ-GENRE-6). Any change is a protocol version bump, never a
 * rename-in-place; a pinned golden test breaks on drift.
 */
export const CLAIM_VERDICTS = [
  "verified",
  "substantially_accurate",
  "misleading_in_context",
  "unsupported",
  "contradicted",
  "unverifiable",
  "verified_against_user_source",
] as const;
export type ClaimVerdict = (typeof CLAIM_VERDICTS)[number];
export const claimVerdictSchema = z.enum(CLAIM_VERDICTS);

/** Claim kind — makes the fact-check checkability decision a field (REQ-OBJ-19). */
export const CLAIM_KINDS = [
  "factual",
  "statistical",
  "quotation",
  "interpretive",
  "normative",
  "predictive",
] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];
/** The kinds Quick's cap spends on (REQ-OBJ-19). */
export const CHECKABLE_CLAIM_KINDS: readonly ClaimKind[] = ["factual", "statistical", "quotation"];

/** Per-source stance edge (REQ-OBJ-18). */
export const CLAIM_SOURCE_STANCES = ["supports", "contradicts", "contextualizes"] as const;
export type ClaimSourceStance = (typeof CLAIM_SOURCE_STANCES)[number];

export const CLAIM_SOURCE_CHECKS = [
  "matches_citation",
  "reputable_list",
  "from_search",
  "suspicious_source",
] as const;
export type ClaimSourceCheck = (typeof CLAIM_SOURCE_CHECKS)[number];

export const SEVERITIES = ["blocking", "major", "minor", "note"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const severitySchema = z.enum(SEVERITIES);

/** Finding kinds (§5.7). */
export const FINDING_KINDS = [
  "claim",
  "discourse",
  "argument",
  "structure",
  "craft",
  "voice",
  "continuity",
] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];
export const findingKindSchema = z.enum(FINDING_KINDS);

export const FINDING_ORIGINS = ["editor", "second_read", "both"] as const;
export type Origin = (typeof FINDING_ORIGINS)[number];

export const DISPOSITION_KINDS = ["accept", "adapt", "rebut", "defer", "escalate"] as const;
export type DispositionKind = (typeof DISPOSITION_KINDS)[number];
export const dispositionKindSchema = z.enum(DISPOSITION_KINDS);

export const DISPOSITION_STATUSES = [
  "proposed",
  "open",
  "done",
  "verified",
  "mooted",
  "deferred",
  "escalated",
  "honored",
] as const;
export type DispositionStatus = (typeof DISPOSITION_STATUSES)[number];
export const dispositionStatusSchema = z.enum(DISPOSITION_STATUSES);

/** The eight rubric dimensions (§5.7); scored 1–5, never aggregated (REQ-IDE-30). */
export const RUBRIC_DIMENSIONS = [
  "thesis_contribution",
  "argument_rigor",
  "evidence_accuracy",
  "originality_situatedness",
  "structure",
  "prose",
  "voice_audience_fit",
  "intellectual_honesty",
] as const;
export type RubricDimension = (typeof RUBRIC_DIMENSIONS)[number];
export const rubricDimensionSchema = z.enum(RUBRIC_DIMENSIONS);

// ---------- revision obligations (§11.7) ----------
export const OBLIGATION_STATES = [
  "open",
  "addressed",
  "discharged",
  "rebutted",
  "deferred",
  "mooted",
  "reopened",
] as const;
export type ObligationState = (typeof OBLIGATION_STATES)[number];
export const obligationStateSchema = z.enum(OBLIGATION_STATES);

export const OBLIGATION_SOURCES = ["finding", "escalation_decision", "agenda", "user"] as const;
export type ObligationSource = (typeof OBLIGATION_SOURCES)[number];
export const obligationSourceSchema = z.enum(OBLIGATION_SOURCES);

export const OBLIGATION_RELATIONS = ["root", "carried", "regression"] as const;
export type ObligationRelation = (typeof OBLIGATION_RELATIONS)[number];

// ---------- runs, steps, gates (§11.3, §12) ----------
/** Every workflow key (§6.2, §11.3). */
export const WORKFLOW_KEYS = [
  "draft",
  "review",
  "revise",
  "profile_voice",
  "refresh_voice",
  "compose_voice",
  "calibrate_voice",
  "reseed_charter",
  "outline",
  "fact_check",
  "cut_to_length",
  "figure",
  "line_edit",
  "titles",
  "abstract",
  "reverse_outline",
  "interview",
  "steelman",
  "map_the_field",
  "run_rounds",
  "research_burst",
  "chat_turn",
] as const;
export type WorkflowKey = (typeof WORKFLOW_KEYS)[number];
export const workflowKeySchema = z.enum(WORKFLOW_KEYS);

export const RUN_STATES = [
  "created",
  "awaiting_consent",
  "queued",
  "provisioning",
  "running",
  "waiting_gate",
  "cancelling",
  "orphaned",
  "finalizing",
  "completed",
  "completed_partial",
  "failed",
  "cancelled",
] as const;
export type RunState = (typeof RUN_STATES)[number];
export const runStateSchema = z.enum(RUN_STATES);

export const STEP_STATES = ["pending", "running", "done", "skipped", "failed"] as const;
export type StepState = (typeof STEP_STATES)[number];

/** The twelve gate kinds (§6.4, §11.3; REQ-IDE-50 renamed from design/2 §14). */
export const GATE_KINDS = [
  "confirm_cost",
  "approve_plan",
  "approve_scope",
  "approve_triage",
  "approve_outline",
  "approve_sample",
  "approve_cutlist",
  "choose_thesis",
  "continue_rounds",
  "spend_overrun",
  "resume_partial",
  "refusal",
] as const;
export type GateKind = (typeof GATE_KINDS)[number];
export const gateKindSchema = z.enum(GATE_KINDS);
/** The spend/refusal kinds that always wait and never auto-proceed (Appendix D.1; REQ-SPEC-1). */
export const NEVER_AUTOPROCEED_GATES: readonly GateKind[] = [
  "confirm_cost",
  "spend_overrun",
  "resume_partial",
  "refusal",
];

export const GATE_ON_EXPIRY = [
  "proceed_conservative",
  "proceed_as_proposed",
  "cancel",
  "accept_partial",
  "wait",
] as const;
export type GateOnExpiry = (typeof GATE_ON_EXPIRY)[number];

// ---------- usage & billing (§14, §11.3) ----------
export const LEDGER_ENTRY_KINDS = [
  "grant",
  "hold",
  "debit",
  "release",
  "expire",
  "refund",
  "adjustment",
] as const;
export type LedgerEntryKind = (typeof LEDGER_ENTRY_KINDS)[number];
export const ledgerEntryKindSchema = z.enum(LEDGER_ENTRY_KINDS);

export const CREDIT_BUCKETS = ["included", "topup", "trial_pocket", "daily", "promo"] as const;
export type CreditBucket = (typeof CREDIT_BUCKETS)[number];
export const creditBucketSchema = z.enum(CREDIT_BUCKETS);

export const USAGE_SOURCES = ["proxy", "sdk_stream", "sdk_estimate", "provider_report"] as const;
export type UsageSource = (typeof USAGE_SOURCES)[number];
export const usageSourceSchema = z.enum(USAGE_SOURCES);

export const PROVIDERS = ["anthropic", "openai", "google"] as const;
export type Provider = (typeof PROVIDERS)[number];

// ---------- personas (§9, §11.3) ----------
export const PERSONA_MODES = ["self", "consented", "house", "study"] as const;
export type PersonaMode = (typeof PERSONA_MODES)[number];
export const personaModeSchema = z.enum(PERSONA_MODES);

export const PERSONA_KINDS = ["leaf", "composite"] as const;
export type PersonaKind = (typeof PERSONA_KINDS)[number];

// ---------- provenance (§11.3) ----------
export const PROVENANCE_SOURCE_KINDS = [
  "human",
  "human_mobile",
  "agent",
  "pasted",
  "chat",
  "suggestion_applied",
  // REQ-POS-9 (P1.02): a human edit inside a captured agent span degrades the block to `mixed`.
  "mixed",
] as const;
export type ProvenanceSourceKind = (typeof PROVENANCE_SOURCE_KINDS)[number];

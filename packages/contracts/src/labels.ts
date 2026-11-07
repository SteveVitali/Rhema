// R7COPY.1a (REQ-COPY-1; R5 B6/C12/G6, R6 UXC-30) — the ONE label table every internal key that
// reaches the UI resolves through: workflows, phases, artifact kinds, run states, gate/decision
// kinds, and every other contracts enum a surface renders. Each map is exhaustive BY TYPE
// (`Record<EnumKey, string>`), so a new enum value fails typecheck until it is labelled; the
// exhaustiveness test seeds a fake key under `@ts-expect-error`. One case rule (C12): every label
// is sentence-cased ("Second read (independent)", "Substack export") — lowercase keys never render.
// Participial interpolation words (decisionAction/decisionActor/dispositionPast/feedPassed) keep
// their sentence position's case — they are words inside a sentence, not standalone labels.

import type {
  ArtifactKind,
  ClaimKind,
  ClaimSourceStance,
  ClaimVerdict,
  CreditBucket,
  DispositionKind,
  DraftOrigin,
  FindingKind,
  GateKind,
  GateOnExpiry,
  ObligationState,
  PersonaMode,
  PhaseKey,
  QualityVerdict,
  RubricDimension,
  RunState,
  Severity,
  SourceProviderKey,
  WorkflowKey,
} from "./enums.js";
import type { ApprovalPolicy } from "./vocab.js";
import {
  MODEL_TIER_DISPLAY,
  PLAN_DISPLAY,
  RIGOR_DISPLAY,
  SEAT_DISPLAY,
} from "./vocab.js";

// ---------- run/step vocabulary ----------

/** Every workflow key → its UI label (a raw `chat_turn` / `research_burst` never reaches text). */
const workflow: Record<WorkflowKey, string> = {
  draft: "Draft",
  review: "Review",
  revise: "Revise",
  profile_voice: "Voice profile",
  refresh_voice: "Voice refresh",
  compose_voice: "Voice compose",
  calibrate_voice: "Voice calibration",
  reseed_charter: "Voice reseed",
  outline: "Outline",
  fact_check: "Fact-check",
  cut_to_length: "Cut to length",
  figure: "Figure",
  line_edit: "Line edit",
  titles: "Titles",
  abstract: "Abstract",
  reverse_outline: "Reverse outline",
  interview: "Interview",
  steelman: "Steelman",
  map_the_field: "Map the field",
  run_rounds: "Run rounds",
  research_burst: "Research",
  chat_turn: "Chat",
};

/** Every phase key (`steps.phase`, manifest keys) → its UI label. */
const phase: Record<PhaseKey, string> = {
  answer: "Answer",
  argument: "Argument",
  audit: "Fidelity audit",
  bootstrap: "Setup",
  calibration: "Calibration",
  caption: "Caption",
  census: "Census",
  classify: "Classify",
  close_reading: "Close reading",
  consolidation: "Consolidation",
  craft: "Craft",
  data: "Data",
  deliver: "Deliver",
  delivery: "Delivery",
  discourse: "Discourse",
  distill: "Distill",
  draft: "Draft",
  fetch: "Fetch",
  gap_analysis: "Gap analysis",
  gaps: "Gaps",
  grounding: "Grounding",
  harvest: "Harvest",
  intake: "Intake",
  inventory: "Inventory",
  letter: "Letter",
  package: "Packaging",
  plan: "Plan",
  render: "Render",
  research: "Research",
  reseed: "Reseed",
  revise: "Revise",
  second_read: "Second read (independent)",
  spec: "Spec",
  spine: "Spine",
  substance: "Substance",
  triage: "Triage",
  verification: "Verification",
  verify: "Verify",
  voice: "Voice",
  // retired step-vocab keys still present in older fixtures/records
  reading_the_piece: "Reading the piece",
  checking_claims: "Checking claims",
  mapping_the_field: "Mapping the field",
  weighing_the_argument: "Weighing the argument",
  editors_letter: "Editor's letter",
};

/** Every run state → its UI label; `delivered` rides the union (the usage DTO's terminal word). */
const runState: Record<RunState | "delivered", string> = {
  created: "Created",
  awaiting_consent: "Waiting for you",
  queued: "Queued",
  provisioning: "Starting",
  running: "Running",
  waiting_gate: "Waiting for you",
  cancelling: "Cancelling",
  orphaned: "Orphaned",
  finalizing: "Finishing",
  completed: "Completed",
  completed_partial: "Completed in part",
  failed: "Failed",
  cancelled: "Cancelled",
  delivered: "Delivered",
};

/** Every artifact kind → its UI label (the chip text — "sidecar" reads as notes, never raw). */
const artifactKind: Record<ArtifactKind | "private", string> = {
  draft: "Draft",
  figure: "Figure",
  companion_doc: "Companion document",
  drafting_note: "Drafting note",
  editors_letter: "Editor's letter",
  piece_brief: "Piece brief",
  claim_ledger: "Claim ledger",
  discourse_report: "Discourse report",
  argument_notes: "Argument notes",
  craft_notes: "Craft notes",
  second_read: "Second read",
  response_letter: "Response letter",
  outline: "Outline",
  commissioning_brief: "Commissioning brief",
  voice_brief: "Voice brief",
  structure_plan: "Structure plan",
  draft_ledger: "Draft ledger",
  consolidation_notes: "Consolidation notes",
  fidelity_audit: "Fidelity audit",
  source_note: "Source note",
  response_ledger: "Response ledger",
  voice_charter: "Voice charter",
  persona_seed: "Voice seed",
  persona_builder_note: "Voice builder note",
  sample: "Sample",
  profile_index: "Profile index",
  voice_print: "Voice print",
  structure_repertoire: "Structure repertoire",
  lexicon: "Lexicon",
  exemplars: "Exemplars",
  positions: "Positions",
  continuity: "Continuity",
  audience_venue: "Audience and venue",
  calibration_report: "Calibration report",
  profile_provenance: "Profile provenance",
  corpus_note: "Corpus note",
  holdout_note: "Held-out note",
  register_map: "Register map",
  shared_lexicon: "Shared lexicon",
  run_transcript: "Run transcript",
  access_report: "Access report",
  fetch_log: "Fetch log",
  run_report: "Run report",
  walkthrough: "Walkthrough",
  chat_session: "Chat session",
  provenance_map: "Provenance map",
  ai_use_statement: "AI-use statement",
  research_note: "Research note",
  preference_profile: "Preference profile",
  cut_list: "Cut list",
  field_map: "Field map",
  open_ground: "Open ground",
  steelman_essay: "Steelman essay",
  vulnerability_map: "Vulnerability map",
  adjudication: "Adjudication",
  convergence_report: "Convergence report",
  title_candidates: "Title candidates",
  abstract_keywords: "Abstract and keywords",
  reverse_outline: "Reverse outline",
  suggestion_set: "Suggestion set",
  pattern_note: "Pattern note",
  guidance_record: "Guidance record",
  sidecar: "Structured notes",
  // feed payloads also carry the bucket word "private" for withheld artifacts
  private: "Private working notes",
};

/** Gate kinds → the card's title (the feed's three retired kind keys ride the union). */
const gateKind: Record<GateKind | "scope_confirm" | "spend_cap" | "publish_ready", string> = {
  approve_triage: "Approve triage",
  approve_scope: "Approve scope",
  approve_sample: "Approve the sample",
  confirm_cost: "Confirm the cost",
  spend_overrun: "Spend overrun",
  resume_partial: "Resume from the partial",
  refusal: "The run refused",
  approve_plan: "Approve the plan",
  approve_outline: "Approve the outline",
  approve_cutlist: "Approve the cut list",
  choose_thesis: "Choose a thesis",
  continue_rounds: "Continue?",
  scope_confirm: "Scope check",
  spend_cap: "Spend cap",
  publish_ready: "Ready to publish",
};

/** Approval-expiry outcomes → the "if you do nothing" sentence (whole sentences, not bare labels). */
const gateOnExpiry: Record<GateOnExpiry, string> = {
  proceed_as_proposed: "If you do nothing: it proceeds with the proposals.",
  proceed_conservative: "If you do nothing: it proceeds conservatively.",
  cancel: "If you do nothing: the run is cancelled.",
  accept_partial: "If you do nothing: the partial is accepted.",
  wait: "If you do nothing: it waits for you.",
};

/** The recorded decision's action word (sentence interpolation — stays lowercase). */
const decisionAction: Record<string, string> = {
  approve: "approved",
  approve_autonomous: "approved — the rest of this run runs autonomously",
  keep_planning: "kept planning",
  edit: "approved with edits",
  wait: "left waiting",
  stop: "stopped",
  proceed_conservative: "proceeded conservatively",
  proceed_as_proposed: "auto-continued",
  cancel: "cancelled",
  accept_partial: "accepted the partial",
  skipped: "skipped",
  expired: "expired",
};

/** The recorded decision's actor (sentence interpolation — stays lowercase). */
const decisionActor: Record<string, string> = {
  user: "you",
  timeout: "the deadline",
  policy: "your Run-to-completion policy",
  trial: "the trial",
};

/** Ingestion/source provider keys → their UI label (never `substack_export` raw). */
const sourceProvider: Record<SourceProviderKey, string> = {
  substack: "Substack",
  substack_export: "Substack export",
  medium: "Medium",
  gdrive: "Google Drive",
  url: "URL",
  upload: "Upload",
  paste: "Paste",
};

// ---------- review/dossier vocabulary ----------

const verdict: Record<ClaimVerdict, string> = {
  verified: "Verified",
  substantially_accurate: "Substantially accurate",
  misleading_in_context: "Misleading in context",
  unsupported: "Unsupported",
  contradicted: "Contradicted",
  unverifiable: "Unverifiable",
  verified_against_user_source: "Verified against your source",
};

const claimKind: Record<ClaimKind, string> = {
  factual: "Factual",
  statistical: "Statistical",
  quotation: "Quotation",
  interpretive: "Interpretive",
  normative: "Normative",
  predictive: "Predictive",
};

const severity: Record<Severity, string> = {
  blocking: "Blocking",
  major: "Major",
  minor: "Minor",
  note: "Note",
};

const findingKind: Record<FindingKind, string> = {
  claim: "Claim",
  discourse: "Discourse",
  argument: "Argument",
  structure: "Structure",
  craft: "Craft",
  voice: "Voice",
  continuity: "Continuity",
};

const stance: Record<ClaimSourceStance, string> = {
  supports: "Supports",
  contradicts: "Contradicts",
  contextualizes: "Contextualizes",
};

const rubricDimension: Record<RubricDimension, string> = {
  thesis_contribution: "Thesis and contribution",
  argument_rigor: "Argument rigor",
  evidence_accuracy: "Evidence and accuracy",
  originality_situatedness: "Originality and situatedness",
  structure: "Structure",
  prose: "Prose",
  voice_audience_fit: "Voice and audience fit",
  intellectual_honesty: "Intellectual honesty",
  timeliness: "Timeliness",
  decision_readiness: "Decision readiness",
  scope_discipline: "Scope discipline",
};

const obligationState: Record<ObligationState, string> = {
  open: "Open",
  addressed: "Addressed",
  discharged: "Discharged",
  rebutted: "Rebutted",
  deferred: "Deferred",
  mooted: "Discharged (pending)",
  reopened: "Reopened",
};

const disposition: Record<DispositionKind, string> = {
  accept: "Accept",
  adapt: "Adapt",
  rebut: "Rebut",
  defer: "Defer",
  escalate: "Escalate",
};

/** The disposition's past participle for "You {verb} this" sentences — words, not labels. */
const dispositionPast: Record<DispositionKind, string> = {
  accept: "accepted",
  adapt: "adapted",
  rebut: "rebutted",
  defer: "deferred",
  escalate: "escalated",
};

/** The triage reason chips (REQ-BETA-6's `wrong` code renders "Incorrect" — banned word rule). */
const triageReason: Record<string, string> = {
  wrong: "Incorrect",
  stylistic_disagreement: "Stylistic disagreement",
  already_knew: "Already knew",
  too_costly: "Too costly",
  not_this_round: "Not this round",
  other: "Other",
};

const hunkKind: Record<string, string> = {
  edited: "Edited",
  added: "Added",
  removed: "Removed",
  mixed: "Changed",
};

const verifiedBy: Record<string, string> = {
  gap_check: "Gap check",
  re_review: "Re-review",
  user: "you (unverified)",
};

// ---------- versions / origins ----------

/** Draft origins → the chip caption; `agent`/`seeded` ride the union for legacy rows. */
const draftOrigin: Record<DraftOrigin | "agent" | "seeded", string> = {
  drafted_from_outline: "Drafter",
  response_to_review: "Drafter",
  human_revision: "Edited by you",
  human_upload: "You",
  duplicate: "Duplicated",
  imported: "Imported",
  cut: "Cut",
  agent: "Drafter",
  seeded: "Seeded",
};

const restoreGroup: Record<string, string> = {
  earlier_today: "Earlier today",
  yesterday: "Yesterday",
  before_review: "Before Review of v{n}",
  named: "Named",
  earlier: "Earlier",
};

const compareLayout: Record<string, string> = {
  side: "Side-by-side",
  inline: "Inline",
  moves: "What changed and why",
};

const provenanceKind: Record<"thread" | "source" | "user_typed" | "generated", string> = {
  thread: "from thread",
  source: "from source",
  user_typed: "you typed",
  generated: "generated",
};

// ---------- approval / settings vocabulary ----------

const approvalPolicy: Record<ApprovalPolicy, string> = {
  named: "Named approvals",
  wait_each: "Wait for me at each",
  run_to_completion: "Run to completion",
};

const gateFactField: Record<string, string> = {
  workflow: "Workflow",
  estimateCredits: "Estimate",
  capCredits: "Cap",
  spentCredits: "Spent",
  modelTier: "Model tier",
  attempt: "Attempt",
  reason: "Reason",
  round: "Round",
};

const scopeField: Record<string, string> = {
  stage: "Stage",
  venue: "Venue",
  audience: "Audience",
  concerns: "Concerns",
  narrow: "Narrow the scope",
};

const decisionOption: Record<string, string> = {
  decide: "Decide",
  dismiss: "Dismiss",
  "re-defer": "Re-defer",
  drop: "Drop",
};

const notificationEvent: Record<string, string> = {
  approval_waiting: "An approval is waiting on you",
  spend_gate: "Spend limit",
  gate_reminder: "Approval deadline reminders",
  auto_proceeded: "A deadline auto-proceeded",
  run_finished: "A run finished",
  run_failed: "A run failed",
  credits_threshold: "Credit thresholds (50 / 80 / 100 %)",
  trial_payment: "Trial ending / payment",
  run_cancelled_recovered: "A run was cancelled or recovered",
  voice_stale: "A voice went stale (weekly digest)",
  chat_reply: "The Assistant replied",
  run_progress: "Run progress (per project)",
  product_update: "Product updates",
};

const integrationStatus: Record<string, string> = {
  connected: "Connected",
  pending: "Connecting",
  degraded: "Needs attention",
  removed: "Disconnected",
};

const supportAccessAction: Record<string, string> = {
  granted: "You granted access",
  revoked: "You revoked access",
  accessed: "Staff viewed your projects",
  expired: "A grant expired",
};

const settingsSection: Record<string, string> = {
  account: "Account",
  preferences: "Preferences",
  notifications: "Notifications",
  integrations: "Integrations",
  billing: "Billing",
  data: "Data",
};

const projectStage: Record<string, string> = {
  early: "Early draft",
  near_final: "Near final",
  infer: "Infer",
};

/** Project-settings phase toggles (camelCase keys — surface labels, not step keys). */
const phaseDefault: Record<string, string> = {
  verification: "Verification",
  discourse: "Discourse",
  secondRead: "Second read",
  grounding: "Grounding",
  audit: "Fidelity audit",
};

// ---------- voice vocabulary ----------

const personaMode: Record<PersonaMode, string> = {
  self: "My own writing",
  house: "A house style",
  consented: "Another writer, with permission",
  study: "For study",
};

const voiceItemState: Record<string, string> = {
  new: "New",
  included: "Included",
  omitted: "Omitted",
  removed_remote: "Removed at source",
  unreadable: "Unreadable",
};

const qualityVerdict: Record<QualityVerdict, string> = {
  clean: "Clean",
  partial: "Partial",
  empty: "Empty",
  unreadable: "Unreadable",
  reconstructed: "Reconstructed",
};

const calibrationVerdict: Record<string, string> = {
  tested: "Tested",
  untested: "Untested",
  "tested-badly-off": "Tested — badly off",
  pending: "Pending",
};

const voiceCardTier: Record<string, string> = {
  quick: "Quick",
  full: "Full",
};

const voiceTab: Record<string, string> = {
  overview: "Overview",
  description: "Description",
  samples: "Samples",
  profile: "Profile",
  runs: "Runs",
};

// ---------- usage / billing vocabulary ----------

const creditBucket: Record<CreditBucket, string> = {
  included: "Plan credits",
  topup: "Top-ups",
  trial_pocket: "Trial pocket",
  daily: "Daily",
  promo: "Promo",
};

/** The expiry line's bucket labels — each carries the "credits" noun exactly once. */
const creditBucketExpiry: Record<CreditBucket, string> = {
  included: "Plan credits",
  topup: "Top-up credits",
  trial_pocket: "Trial credits",
  daily: "Daily credits",
  promo: "Promo credits",
};

// ---------- run-sheet / steer vocabulary ----------

const runToggle: Record<string, string> = {
  fact_check: "Fact-check every claim",
  discourse: "Map the field",
  second_read: "Second read",
  repair_research: "Repair research",
  gap_check: "Gap check",
};

const resolutionAction: Record<string, string> = {
  turn_off_fact_check: "Turn off fact-check",
  use_base: "Switch to Base",
  lower_rigor: "Lower the rigor",
  add_credits: "Add credits",
};

const timelineNextStep: Record<string, string> = {
  draft: "Draft v{n}",
  review: "Review v{n}",
  revise: "Revise",
  read_letter: "Read the letter",
  outline: "Make an outline",
  export: "Export",
  archive: "Archive",
  run: "The run in progress",
  approval: "A decision is waiting",
  start: "Start a project",
  none: "",
};

const timelineOrigin: Record<"outline" | "imported_draft", string> = {
  outline: "Outline",
  imported_draft: "Imported draft",
};

const deliveredLink: Record<string, string> = {
  dossier: "Dossier",
  letter: "Letter",
  ledger: "Claims ledger",
};

// ---------- files / feed vocabulary ----------

const filesSection: Record<string, string> = {
  outline: "Outline",
  drafts: "Drafts",
  rounds: "Rounds",
  research: "Research",
  voice: "Voice",
  assets: "Assets",
  advanced: "Advanced",
};

const lockTitle: Record<string, string> = {
  editable: "Editable",
  immutable: "Immutable",
  inspect: "Inspect only",
};

const lockBadge: Record<string, string> = {
  editable: "Working",
  immutable: "Frozen",
  inspect: "Inspect only",
};

const feedDensity: Record<string, string> = {
  summary: "Summary",
  details: "Details",
  verbose: "Verbose",
};

/** The check-result word inside "Check {name} — {passed}" — sentence position, stays lowercase. */
const feedPassed: Record<string, string> = {
  true: "passed",
  false: "failed",
};

const promoteScope: Record<string, string> = {
  thread: "this thread",
  turn: "this turn",
  research: "all Assistant research",
};

const paletteSection: Record<"run" | "goto" | "recent" | "threads" | "settings", string> = {
  run: "Run",
  goto: "Go to",
  recent: "Recent runs",
  threads: "Threads",
  settings: "Settings",
};

const viewName: Record<string, string> = {
  write: "Write",
  read: "Read",
  focus: "Focus",
};

const rowIndicator: Record<string, string> = {
  running: "A run is in progress",
  needs_you: "Waiting on you — a decision needs your input",
  ready: "Ready to read — a delivered review you have not opened",
  quiet: "No open attention",
  failed: "The last run failed",
};

// ---------- run report vocabulary ----------

const refundReason: Record<string, string> = {
  metered_over_debit: "the committed figure ran ahead of the meter",
  reconcile_drift: "a reconciliation correction",
  platform_fault: "a platform fault",
  operator: "an operator adjustment",
  user_window: "requested within your refund window",
};

const reportFlag: Record<string, string> = {
  fact_check_dominated: "Fact-checking carried {pct}% of the spend ({n} claims verified).",
  fact_check_dominated_noClaims: "Fact-checking carried {pct}% of the spend.",
  long_draft: "Drafting carried {pct}% of the spend — a long or heavy piece.",
  discourse_map: "The discourse map ran in {phase} (a Standard-tier phase).",
  second_read_model: "The second read in {phase} ran on a different model tier.",
  over_estimate: "The run came in at {ratio}× its estimate — well under.",
  under_estimate: "The run ran {ratio}× its estimate — over.",
  retries: "{n} step(s) needed a retry ({phase}).",
};

const reportGuidance: Record<string, string> = {
  "guidance.fact_check_dominated": "Consider narrowing the claims scope before the next run.",
  "guidance.long_draft": "Consider a shorter draft or a staged review.",
  "guidance.discourse_map": "No action needed — the field map already ran.",
  "guidance.second_read_model": "Check whether the second read needs the heavier tier.",
  "guidance.over_estimate": "A lighter estimate would fit this workflow.",
  "guidance.under_estimate": "Raise the estimate or narrow the run's scope.",
  "guidance.retries": "Retries added cost — check the flagged phase's inputs.",
};

// ---------- the table ----------

/**
 * The ONE label table (REQ-COPY-1). Every internal key reaching the UI resolves here; a former
 * parallel map is a `as Record<string,string>`-rebound member of `COPY` or a direct reference —
 * never a second authored map. `plan`/`modelTier`/`rigor`/`seat` re-export the canonical
 * vocab.ts display maps (the reserved-strings authority) rather than re-spelling them.
 */
export const UI_LABELS = {
  workflow,
  phase,
  runState,
  artifactKind,
  gateKind,
  gateOnExpiry,
  decisionAction,
  decisionActor,
  sourceProvider,
  verdict,
  claimKind,
  severity,
  findingKind,
  stance,
  rubricDimension,
  obligationState,
  disposition,
  dispositionPast,
  triageReason,
  hunkKind,
  verifiedBy,
  draftOrigin,
  restoreGroup,
  compareLayout,
  provenanceKind,
  approvalPolicy,
  gateFactField,
  scopeField,
  decisionOption,
  notificationEvent,
  integrationStatus,
  supportAccessAction,
  settingsSection,
  projectStage,
  phaseDefault,
  personaMode,
  voiceItemState,
  qualityVerdict,
  calibrationVerdict,
  voiceCardTier,
  voiceTab,
  creditBucket,
  creditBucketExpiry,
  runToggle,
  resolutionAction,
  timelineNextStep,
  timelineOrigin,
  deliveredLink,
  filesSection,
  lockTitle,
  lockBadge,
  feedDensity,
  feedPassed,
  promoteScope,
  paletteSection,
  viewName,
  rowIndicator,
  refundReason,
  reportFlag,
  reportGuidance,
  plan: PLAN_DISPLAY,
  modelTier: MODEL_TIER_DISPLAY,
  rigor: RIGOR_DISPLAY,
  seat: SEAT_DISPLAY,
} as const;

export type UiLabelDomain = keyof typeof UI_LABELS;

/**
 * Widen a domain-keyed map for `table[key] ?? fallback` lookup sites: the caller indexes by an
 * arbitrary payload string, so the returned view is `Record<string, string>` (absent keys stay
 * `undefined` under `noUncheckedIndexedAccess` — the call site's `?? key` fallback decides).
 */
export function labelLookup<K extends string>(
  map: Record<K, string> | Readonly<Record<string, string>>,
): Record<string, string> {
  return map as Record<string, string>;
}

import { pgTable, text, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";

// Runs, steps, gates, decisions — mirrors migrations/0002_schema.sql. Run orchestration LOGIC is P0.08; this
// is the table shape only.

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  projectId: text("project_id"),
  personaId: text("persona_id"),
  workflow: text("workflow").notNull(),
  agentInstanceId: text("agent_instance_id"),
  state: text("state").notNull(),
  stateSince: timestamp("state_since").notNull().defaultNow(),
  currentStepId: text("current_step_id"),
  currentAttempt: integer("current_attempt").notNull().default(1),
  inputs: jsonb("inputs").notNull(),
  inputSnapshot: jsonb("input_snapshot"),
  modelProfile: text("model_profile").notNull(),
  modelTier: text("model_tier").notNull(),
  rigor: text("rigor").notNull(),
  variantGroupId: text("variant_group_id"),
  parentRunId: text("parent_run_id"),
  scope: jsonb("scope"),
  estimateCredits: integer("estimate_credits").notNull(),
  capCredits: integer("cap_credits").notNull(),
  holdLedgerId: text("hold_ledger_id"),
  holdBucket: text("hold_bucket"),
  spentCredits: integer("spent_credits").notNull().default(0),
  rateTableVersion: integer("rate_table_version").notNull(),
  proxyCredentialId: text("proxy_credential_id"),
  proxyAllowlistId: text("proxy_allowlist_id"),
  entitlementId: text("entitlement_id"),
  lockSet: text("lock_set").array().notNull().default([]),
  requestedBy: text("requested_by"),
  imageDigest: text("image_digest"),
  protocolsVersion: text("protocols_version"),
  replans: integer("replans").notNull().default(0),
  resumeCount: integer("resume_count").notNull().default(0), // reaper re-enqueue budget per step (0007)
  gatesOff: boolean("gates_off").notNull().default(false), // "Approve and run autonomously" (0010; REQ-GATE-3)
  // P1.09 (0032; §6.4): the per-run deadline override — same validated shape as projects.approval_overrides;
  // layered over it at gate-open time ("this run only").
  gateOverrides: jsonb("gate_overrides"),
  failure: jsonb("failure"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  parkedUntil: timestamp("parked_until"),
  // PRB.08 chargeback withhold (0020; REQ-SPEC-24.7): a finalizing run whose account is suspended keeps its
  // stashed deliver payload until the balance is non-negative (the run.deliver job re-drives it).
  deliveryWithheldAt: timestamp("delivery_withheld_at"),
  pendingDelivery: jsonb("pending_delivery"),
  // P1.05 (0030; §6.5): the steering park — `pause_requested_at` is set by "Pause after this phase" and
  // honored at the next committed phase boundary; `paused_at` marks a waiting_gate steering pause (no gate
  // row — the card shows Resume/Stop, not an approval).
  pauseRequestedAt: timestamp("pause_requested_at"),
  pausedAt: timestamp("paused_at"),
  // P1.05 (0030; §5.5 D20): the lazily-generated ≤200-word walkthrough {status,text?,model?,inputDigest?,
  // attempts,generatedAt?,lastAttemptAt?,lastError?} — one package-class call over delivered artifacts.
  walkthrough: jsonb("walkthrough"),
  // P1.16 (0036; §14.6): the parked-resume re-price marker — set when a rate-table change mid-park
  // re-priced the run; `repriced_from_version` records the frozen table version it moved from.
  repricedAt: timestamp("repriced_at"),
  repricedFromVersion: integer("repriced_from_version"),
  // RES.2 (0047; REQ-SPEC-31(3)): the write-once delivery classification — {label:'unverified',
  // checkableClaims, coveredClaims} + platform-fault settlement markers. Read, never recomputed.
  delivery: jsonb("delivery"),
});

export const steps = pgTable("steps", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  phase: text("phase").notNull(),
  ordinal: integer("ordinal").notNull(),
  state: text("state").notNull(),
  attempt: integer("attempt").notNull().default(1),
  expectedArtifacts: text("expected_artifacts").array().notNull().default([]),
  producedVersionIds: text("produced_version_ids").array().notNull().default([]),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  credits: integer("credits").notNull().default(0),
  checks: jsonb("checks"),
  result: jsonb("result"),
});

export const gates = pgTable("gates", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  stepId: text("step_id"),
  kind: text("kind").notNull(),
  artifactVersionId: text("artifact_version_id"),
  openedAt: timestamp("opened_at").notNull(),
  deadlineAt: timestamp("deadline_at"),
  blocking: boolean("blocking").notNull().default(true),
  onExpiry: text("on_expiry").notNull(),
  held: boolean("held").notNull().default(false),
  pausedWhileReading: boolean("paused_while_reading").notNull().default(false),
  presenceDeadlineAt: timestamp("presence_deadline_at"),
  resolvedAt: timestamp("resolved_at"),
});

export const decisions = pgTable("decisions", {
  gateId: text("gate_id").primaryKey(),
  byActor: text("by_actor").notNull(),
  presence: boolean("presence"),
  action: text("action").notNull(),
  guidance: text("guidance"),
  standingRule: boolean("standing_rule"),
  changes: integer("changes"),
  overlayVersionIds: text("overlay_version_ids").array(),
  at: timestamp("at").notNull().defaultNow(),
});

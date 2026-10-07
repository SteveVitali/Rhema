import {
  pgTable,
  text,
  integer,
  bigint,
  numeric,
  timestamp,
  boolean,
  jsonb,
  date,
  primaryKey,
} from "drizzle-orm/pg-core";

// Usage & billing (§14) — mirrors migrations/0002_schema.sql. Ledger/hold/cap LOGIC is P0.11; table shape only.

export const usageRecords = pgTable("usage_records", {
  id: text("id").primaryKey(),
  ts: timestamp("ts").notNull(),
  workspaceId: text("workspace_id").notNull(),
  billingAccountId: text("billing_account_id").notNull(),
  userId: text("user_id"),
  projectId: text("project_id"),
  personaId: text("persona_id"),
  runId: text("run_id").notNull(),
  attempt: integer("attempt").notNull().default(1),
  stepId: text("step_id"),
  role: text("role").notNull(),
  agentInstanceId: text("agent_instance_id"),
  subagentLabel: text("subagent_label"),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  modelTier: text("model_tier").notNull(),
  rateTableVersion: integer("rate_table_version").notNull(),
  inputTokens: bigint("input_tokens", { mode: "number" }),
  cacheWriteTokens: bigint("cache_write_tokens", { mode: "number" }),
  cacheReadTokens: bigint("cache_read_tokens", { mode: "number" }),
  outputTokens: bigint("output_tokens", { mode: "number" }),
  searches: integer("searches"),
  fetches: integer("fetches"),
  listCostUsd: numeric("list_cost_usd", { precision: 12, scale: 6 }).notNull(),
  credits: integer("credits").notNull(),
  source: text("source").notNull(),
  reconciled: boolean("reconciled").default(false),
  // PRB.08 (0020; REQ-BILL-13): the provider's per-request id — the usage.reconcile join key.
  providerRequestId: text("provider_request_id"),
});

export const creditLedger = pgTable("credit_ledger", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  billingAccountId: text("billing_account_id").notNull(),
  kind: text("kind").notNull(),
  credits: integer("credits").notNull(),
  bucket: text("bucket").notNull(),
  runId: text("run_id"),
  phaseId: text("phase_id"),
  source: text("source").notNull(),
  reason: text("reason"),
  expiresAt: timestamp("expires_at"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  stripeRef: text("stripe_ref"),
  at: timestamp("at").notNull().defaultNow(),
});

export const creditBalances = pgTable(
  "credit_balances",
  {
    billingAccountId: text("billing_account_id").notNull(),
    bucket: text("bucket").notNull(),
    available: bigint("available", { mode: "number" }).notNull().default(0),
    held: bigint("held", { mode: "number" }).notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.billingAccountId, t.bucket] }) }),
);

export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey(),
  billingAccountId: text("billing_account_id").notNull(),
  tier: text("tier").notNull(),
  trialEndsAt: timestamp("trial_ends_at"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  includedCredits: integer("included_credits"),
  concurrency: integer("concurrency"),
  status: text("status"),
  // P1.16 (0036; §14.2/14.6): Stripe Billing lifecycle — cycle, scheduled downgrade, the Smart-Retries
  // renewal-failure window, and the 7-day downgrade-warning marker.
  stripeCustomerId: text("stripe_customer_id"),
  billingCycle: text("billing_cycle"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  scheduledTier: text("scheduled_tier"),
  renewalFailedAt: timestamp("renewal_failed_at"),
  downgradeWarnedAt: timestamp("downgrade_warned_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const trialEntitlements = pgTable("trial_entitlements", {
  id: text("id").primaryKey(),
  billingAccountId: text("billing_account_id").notNull(),
  kind: text("kind").notNull().default("review"),
  wordCap: integer("word_cap").notNull().default(6000),
  rigor: text("rigor").notNull().default("standard"),
  modelTier: text("model_tier").notNull().default("base"),
  // P1.16 (0036): 'locked' | 'revoked' | 'converted' join 'unused' | 'consumed' | 'expired'.
  state: text("state").notNull().default("unused"),
  consumedByRunId: text("consumed_by_run_id"),
  expiresAt: timestamp("expires_at"),
  // P1.16 (0036): the unlock/consumption/conversion audit columns.
  activatedAt: timestamp("activated_at"),
  consumedAt: timestamp("consumed_at"),
  convertedAt: timestamp("converted_at"),
  revokedAt: timestamp("revoked_at"),
  pocketLedgerId: text("pocket_ledger_id"),
  promoLedgerId: text("promo_ledger_id"),
});

// P1.16 (0036; REQ-GROWTH-10) — every first-spend unlock decision is an auditable row.
export const trialUnlockChecks = pgTable("trial_unlock_checks", {
  id: text("id").primaryKey(),
  billingAccountId: text("billing_account_id").notNull(),
  userId: text("user_id"),
  at: timestamp("at").notNull().defaultNow(),
  emailDomain: text("email_domain"),
  disposableDomain: boolean("disposable_domain").notNull().default(false),
  fingerprintHash: text("fingerprint_hash"),
  fingerprintSeen: integer("fingerprint_seen").notNull().default(0),
  asnRisk: numeric("asn_risk"),
  decision: text("decision").notNull(),
  reason: text("reason").notNull(),
});

// P1.16 (0036; REQ-GROWTH-15 amended) — the global daily trial-spend ceiling, one row per UTC day.
export const trialSpendDaily = pgTable("trial_spend_daily", {
  day: date("day").primaryKey(),
  credits: bigint("credits", { mode: "number" }).notNull().default(0),
});

// RES.2 (0047; REQ-SPEC-31(3)) — the platform-fault trial-restore audit row: exactly one per
// (entitlement, run) restored by `settleUnverifiedDelivery`; append-only (grant select, insert).
export const trialRestorations = pgTable("trial_restorations", {
  id: text("id").primaryKey(),
  entitlementId: text("entitlement_id").notNull(),
  runId: text("run_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  billingAccountId: text("billing_account_id").notNull(),
  restoredAt: timestamp("restored_at").notNull().defaultNow(),
});

// P1.16 (0036; REQ-BILL-14) — Checkout sessions: return-to-context + grant-path discrimination.
export const checkoutSessions = pgTable("checkout_sessions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  billingAccountId: text("billing_account_id").notNull(),
  userId: text("user_id"),
  kind: text("kind").notNull(),
  plan: text("plan"),
  cycle: text("cycle"),
  packId: text("pack_id"),
  stripeSessionId: text("stripe_session_id"),
  returnTo: text("return_to"),
  state: text("state").notNull().default("open"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  // BILL.3 (0048) — first tenant-scoped observation of the open return page; the pending-email trigger.
  returnViewedAt: timestamp("return_viewed_at"),
  // …and the post-enqueue marker that keeps a redriven webhook from enqueueing a second pending mail.
  pendingEmailQueuedAt: timestamp("pending_email_queued_at"),
});

// P1.16 (0036; REQ-BILL-17) — every unattended charge (or skip/failure) is auditable.
export const autoReloadEvents = pgTable("auto_reload_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  billingAccountId: text("billing_account_id").notNull(),
  at: timestamp("at").notNull().defaultNow(),
  packId: text("pack_id"),
  credits: integer("credits"),
  cents: integer("cents"),
  stripeRef: text("stripe_ref"),
  reason: text("reason").notNull(),
  outcome: text("outcome").notNull(),
});

// P1.16 (0036; REQ-BILL-7 amended) — the weekly re-fit's evidence rows + the live cap multiplier singleton.
export const estimatorFits = pgTable("estimator_fits", {
  id: text("id").primaryKey(),
  computedAt: timestamp("computed_at").notNull().defaultNow(),
  sampleRuns: integer("sample_runs").notNull(),
  medianRatio: numeric("median_ratio"),
  capMultiplier: numeric("cap_multiplier").notNull(),
  note: text("note"),
});

export const estimatorConfig = pgTable("estimator_config", {
  id: text("id").primaryKey(),
  capMultiplier: numeric("cap_multiplier").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// P1.16 (0036; §14.2) — the Team tier is listed but waitlisted; mechanics are out of scope.
export const teamWaitlist = pgTable("team_waitlist", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  seats: integer("seats"),
  workspaceId: text("workspace_id"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const proxyCredentials = pgTable("proxy_credentials", {
  id: text("id").primaryKey(),
  runId: text("run_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  revokedAt: timestamp("revoked_at"),
  // richer resolution shape (0007; D-P0.07-3): the credential secret is never stored, only its hash.
  credentialHash: text("credential_hash"),
  attempt: integer("attempt").notNull().default(1),
  allowlistId: text("allowlist_id"),
  expiresAt: timestamp("expires_at"),
  context: jsonb("context"), // denormalized RunContext attribution (proxy resolver, RLS-free)
});

export const proxyAllowlists = pgTable("proxy_allowlists", {
  id: text("id").primaryKey(),
  runId: text("run_id"),
  hosts: text("hosts").array().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // richer allowlist (0007; D-P0.07-3): endpoints/models/URL policy/cap the proxy RunContext consumes.
  endpoints: jsonb("endpoints").notNull().default([]),
  models: text("models").array().notNull().default([]),
  urlPolicy: jsonb("url_policy").notNull().default({}),
  capCredits: integer("cap_credits"),
});

export const runIdempotency = pgTable(
  "run_idempotency",
  {
    billingAccountId: text("billing_account_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    runId: text("run_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.billingAccountId, t.idempotencyKey] }) }),
);

export const estimateCache = pgTable("estimate_cache", {
  id: text("id").primaryKey(),
  cacheKey: text("cache_key").notNull().unique(),
  estimateCredits: integer("estimate_credits").notNull(),
  capCredits: integer("cap_credits").notNull(),
  rateTableVersion: integer("rate_table_version").notNull(),
  // The Haiku-class claim pre-pass (PRB.03; 0017): the refined claim count, and whether the figure is still
  // provisional (word-count only) vs refined (§5.6 item 1).
  claimCount: integer("claim_count"),
  provisional: boolean("provisional").notNull().default(true),
  computedAt: timestamp("computed_at").notNull().defaultNow(),
});

export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
  // PRB.08 (0020): set when the queued stripe.event job finished processing (§14.6 discipline audit).
  processedAt: timestamp("processed_at"),
});

// PRB.08 (0020) — the operator CLI's audit trail (REQ-BETA-14: every grant/void recorded). Not tenant-scoped:
// written only by the operator role, never on a user request.
export const adminActions = pgTable("admin_actions", {
  id: text("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  billingAccountId: text("billing_account_id"),
  workspaceId: text("workspace_id"),
  credits: integer("credits"),
  note: text("note"),
  ledgerId: text("ledger_id"),
  at: timestamp("at").notNull().defaultNow(),
});

// PRB.08 (0020) — the beta's persisted analytics sink (REQ-BETA-12). Envelope columns lifted for queries;
// props is the catalogue-validated payload (`parseAnalyticsEvent` at the write boundary). PRB.12 (0024):
// `dedupe_key` — the materializer's idempotency key; a partial unique index makes a replayed projection
// insert a no-op.
export const analyticsEvents = pgTable("analytics_events", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  workspaceId: text("workspace_id").notNull(),
  projectId: text("project_id"),
  runId: text("run_id"),
  event: text("event").notNull(),
  props: jsonb("props").notNull(),
  dedupeKey: text("dedupe_key"),
  at: timestamp("at").notNull().defaultNow(),
});

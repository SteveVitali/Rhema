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
  // P1.19 — the §5.11 collapse key + quiet-hours visibility + the run link (0039).
  collapseKey: text("collapse_key"),
  runId: text("run_id"),
  visibleAt: timestamp("visible_at").notNull().defaultNow(),
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

// P1.17 (0037; §3.5) — the PRE-AUTH acquisition funnel: landing.viewed / landing.dropzone_used minted
// before a session exists, so the analytics_events envelope (user/workspace identity) cannot apply.
// Append-only, no PII (ip_hash for coarse dedupe); the api whitelists the two names at the route.
export const acquisitionEvents = pgTable("acquisition_events", {
  id: text("id").primaryKey(),
  event: text("event").notNull(),
  props: jsonb("props").notNull().default({}),
  surface: text("surface").notNull().default("web"),
  ipHash: text("ip_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 223 R7DEM.6b (0061; REQ-TOUR-9; ADR-126) — the anonymous demo funnel: the ONE sanctioned
// demo write. No identity columns of any kind (no user/workspace/ip/ua) — the envelope differs
// from `analyticsEvents` by design. Reachable only through the SECURITY DEFINER
// `rhema_demo_event_insert`; the user-serving role holds no table privilege (rls-catalog `-`).
export const demoEvents = pgTable("demo_events", {
  id: text("id").primaryKey(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  event: text("event").notNull(),
  essay: text("essay"),
  step: integer("step"),
  src: text("src"),
});

export const figures = pgTable("figures", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  artifactId: text("artifact_id"),
  specKind: text("spec_kind").notNull(),
  specVersionId: text("spec_version_id"),
  dataVersionId: text("data_version_id"),
  renderedVersionId: text("rendered_version_id"),
  /** P1.13 — the card's headline (the figure.json twin's title). */
  title: text("title"),
  caption: text("caption"),
  alt: text("alt"),
  sourceLine: text("source_line"),
  provenance: jsonb("provenance"),
  insertedInDraftId: text("inserted_in_draft_id"),
  /** P1.13 — the open insert-proposal's state (anchor + block markdown + pinned version). */
  pendingProposal: jsonb("pending_proposal"),
  /** P1.13 — the run that last produced the figure (the render job's + the card's run link). */
  latestRunId: text("latest_run_id"),
  /** P1.13 — the draft artifact version the Accept splice produced (the insertion's pin). */
  insertedAtVersionId: text("inserted_at_version_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const figureVersions = pgTable("figure_versions", {
  id: text("id").primaryKey(),
  figureId: text("figure_id").notNull(),
  ordinal: integer("ordinal").notNull(),
  specVersionId: text("spec_version_id"),
  renderedVersionId: text("rendered_version_id"),
  /** P1.13 — the restore pin (the data.csv version this iteration carried). */
  dataVersionId: text("data_version_id"),
  /** P1.13 — the Versions strip's request text ("initial", "chip:bar", "restore:2"). */
  request: text("request"),
  /** P1.13 — the render-state the card shows while `figure.render` is in flight. */
  renderStatus: text("render_status").notNull().default("pending"),
  renderError: text("render_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

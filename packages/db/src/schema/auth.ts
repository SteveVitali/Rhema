import { pgTable, text, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";

// Better Auth tables, self-hosted in our Postgres (§13.1; R4). Google OAuth + email magic link +
// sessions at launch; the device list is a schema stub for step-up/biometric on mobile (§10.5).
// Field names follow Better Auth's expected schema so the library's Drizzle adapter binds cleanly.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // PRB.08 (0020; REQ-PROD-15): "Exclude my usage from product analytics" — recordAnalyticsEvent honors it;
  // the §14.7 settings toggle that flips it lands with the account settings surface.
  analyticsOptOut: boolean("analytics_opt_out").notNull().default(false),
  // P1.01 (0027; REQ-IDE-38): the app theme preference — 'dark' | 'light' | 'auto', dark default.
  appTheme: text("app_theme").notNull().default("dark"),
  // P1.04 (0029; §5.2): the /app grouping preference — 'attention' (default) | 'voice'.
  projectGroupBy: text("project_group_by").notNull().default("attention"),
  // P1.06 (0031; §5.6; REQ-BILL-4): "don't ask me to confirm runs under N credits" — the per-user consent
  // threshold, 0 = always ask per the base rule; capped at 1,000 by the API write so >500 consent still bites.
  consentDontAskUnder: integer("consent_dont_ask_under").notNull().default(0),
  // P1.09 (0032; §6.4/§5.11): the dismissed one-time inline explainers (e.g. 'approval' on the first
  // gate card) — once per user, never a modal tour.
  dismissedExplainers: text("dismissed_explainers").array().notNull().default([]),
  // P1.17 (0037; §15.3): the /signup funnel's recorded intent {entry, src} — written once at account
  // creation; `GET /app`'s precedence redirect reads it (a carried draft beats the Showcase-first
  // default). Never overwritten for a returning account.
  signupIntent: jsonb("signup_intent"),
  // P1.20 (0040; §14.7): the account-level Preferences blob — validated `userPrefsSchema`
  // (@rhema/contracts): model-tier / rigor / approval-policy defaults, editor prefs, the Q-26
  // preference-profile opt-out. Project overrides win over these.
  prefs: jsonb("prefs").notNull().default({}),
  // P1.20 (0040; REQ-ACCT-4): the Delete-account grace clock — set ⇒ the 14-day grace is running
  // (the `account.hard-delete` job fires at its end); NULL ⇒ no pending deletion.
  deletionRequestedAt: timestamp("deletion_requested_at"),
  // P1.20 (0040; §14.7): the account byline (the default voice byline the Account section edits).
  byline: text("byline"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(), // 0025 — the Kysely adapter writes it
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull(), // "google" | "credential" | …
  accountId: text("account_id").notNull(),
  // 0025 — better-auth 1.7.2's account key is {issuer, accountId}; `issuer` backfilled 'local:oauth:<provider>'.
  issuer: text("issuer").notNull(),
  scope: text("scope"),
  password: text("password"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Magic-link / email verification tokens. */
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Device list stub (§13.1) — populated when Apple sign-in + mobile step-up land. */
export const device = pgTable("device", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  label: text("label"),
  platform: text("platform"), // "web" | "ios" | "android"
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// P1.20 (0040; REQ-VIS-11; §14.7) — the support-access toggle: the user mints a 72-h-expiring grant
// (one active at a time); every grant event AND every staff access appends a `support_access_log`
// row (the user-visible audit mirror of the operator's `admin_actions` 'support_access' row).
export const supportAccessGrants = pgTable("support_access_grants", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull(),
  grantedAt: timestamp("granted_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
});

export const supportAccessLog = pgTable("support_access_log", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull(),
  grantId: text("grant_id"),
  actor: text("actor").notNull(), // 'user' for grant/revoke; the operator id for access
  action: text("action").notNull(), // 'granted' | 'revoked' | 'accessed' | 'expired'
  detail: text("detail"),
  at: timestamp("at").notNull().defaultNow(),
});

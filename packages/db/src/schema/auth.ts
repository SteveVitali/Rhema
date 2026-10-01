import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

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

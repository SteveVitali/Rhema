import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// P1.18 (0038) — whole-account export zip job + link state (REQ-ACCT-3). The worker updates the row
// building → ready|failed; the download token persists as sha256 only (the secret rides the email).
export const accountExports = pgTable("account_exports", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull().default("account_zip"),
  status: text("status").notNull().default("building"),
  sha256: text("sha256"),
  bytes: integer("bytes"),
  s3Key: text("s3_key"),
  tokenSha256: text("token_sha256"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  readyAt: timestamp("ready_at"),
  expiresAt: timestamp("expires_at"),
  downloadedAt: timestamp("downloaded_at"),
});

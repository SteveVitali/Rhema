import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.js";

// Beta invite gating (PRB.01; REQ-BETA-19) — mirrors migrations/0016_invites.sql. System-level, pre-account
// tables (not under RLS): the auth/api layer consults them before a user has a workspace.

export const invites = pgTable("invites", {
  code: text("code").primaryKey(),
  email: text("email"),
  note: text("note"),
  maxUses: integer("max_uses").notNull().default(1),
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const inviteRedemptions = pgTable("invite_redemptions", {
  id: text("id").primaryKey(),
  code: text("code")
    .notNull()
    .references(() => invites.code, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  redeemedAt: timestamp("redeemed_at").notNull().defaultNow(),
});

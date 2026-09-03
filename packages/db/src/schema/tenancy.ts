import { pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core";

// Tenancy tables — mirrors migrations/0002_schema.sql. The typed query layer only; the SQL migration owns FKs,
// checks, triggers, and RLS.

export const billingAccounts = pgTable("billing_accounts", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  billingAccountId: text("billing_account_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.workspaceId, t.userId] }) }),
);

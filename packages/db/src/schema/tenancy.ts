import { pgTable, text, timestamp, bigint, integer, boolean, date, primaryKey } from "drizzle-orm/pg-core";

// Tenancy tables — mirrors migrations/0002_schema.sql. The typed query layer only; the SQL migration owns FKs,
// checks, triggers, and RLS.

export const billingAccounts = pgTable("billing_accounts", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // PRB.08 chargeback state (0020; REQ-SPEC-24.7): suspended ⇒ new holds refuse; the debt is the clawed
  // shortfall the account must clear before deliveries resume.
  suspendedAt: timestamp("suspended_at"),
  clawbackDebt: bigint("clawback_debt", { mode: "number" }).notNull().default(0),
  // P1.16 (0036; §14.3): the account-level trial machine + abuse controls.
  trialState: text("trial_state"),
  trialKilledAt: timestamp("trial_killed_at"),
  fingerprintHash: text("fingerprint_hash"),
  phoneVerified: boolean("phone_verified").notNull().default(false),
  // P1.16 (0036): the Stripe customer + Tax-ready billing address.
  stripeCustomerId: text("stripe_customer_id"),
  billingCountry: text("billing_country"),
  billingPostalCode: text("billing_postal_code"),
  // P1.16 (0036; REQ-BILL-17): opt-in auto-reload — user-typed threshold, pack, and monthly cap.
  autoReloadEnabled: boolean("auto_reload_enabled").notNull().default(false),
  autoReloadThresholdCredits: integer("auto_reload_threshold_credits"),
  autoReloadPackId: text("auto_reload_pack_id"),
  autoReloadMonthCapCents: integer("auto_reload_month_cap_cents"),
  autoReloadSpendCents: integer("auto_reload_spend_cents").notNull().default(0),
  autoReloadMonth: text("auto_reload_month"),
  // §14.2 top-up fraud bounds: first-month $100 cap + the >$200/day 3-D Secure trigger counters.
  firstMonthTopupCents: integer("first_month_topup_cents").notNull().default(0),
  dailyTopupDate: date("daily_topup_date"),
  dailyTopupCents: integer("daily_topup_cents").notNull().default(0),
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

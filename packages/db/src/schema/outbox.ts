import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// The outbox transport (migration 0064; BL-115 / 298_R6FIX.31) — the delayed arms' marker write and
// this row commit in ONE tenant tx; the worker's `outbox.drain` cron replays pending rows onto
// pg-boss with `send_options` verbatim. NOT under RLS (system-scoped like pause_signals): written
// inside the request tx, drained cross-tenant, never served on a tenant route. `claimed_at`/
// `attempts`/`sent_at` are the drain's lease machinery.
export const outbox = pgTable("outbox", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  queue: text("queue").notNull(),
  payload: jsonb("payload").notNull().default({}),
  sendOptions: jsonb("send_options").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  lastError: text("last_error"),
});

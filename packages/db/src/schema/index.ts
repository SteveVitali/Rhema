// The Drizzle schema barrel — the typed query layer over migrations/*.sql (which are the authoritative DDL).
// A parity test (schema-parity.test.ts) reflects the migrated database and asserts every Drizzle table and
// column exists in it, so the two never drift. Tables owned by later tickets (run_events, P0.08b) are absent;
// `backlog_items` is absent because migration 0005 drops it.

export * from "./auth.js"; // P0.01: Better Auth tables (user, session, account, verification, device)
export * from "./invites.js"; // PRB.01: beta invite gating (invites, invite_redemptions)
export * from "./deployments.js"; // P0.01: deploy provenance (REQ-ARCH-39)
export * from "./tenancy.js";
export * from "./projects.js";
export * from "./artifacts.js";
export * from "./drafts.js";
export * from "./correspondence.js";
export * from "./obligations.js";
export * from "./agents.js";
export * from "./runs.js";
export * from "./run-events.js"; // P0.08b: run_events (partitioned) + run_events_internal + run_event_seq
export * from "./billing.js";
export * from "./enforcement.js";
export * from "./misc.js";
export * from "./personas.js";
export * from "./benchmark.js"; // P0.13: §18 benchmark enclave, corpus, gold set, waves, run-ledger join
export * from "./ai-use.js"; // PRB.11: append-only AI-use statement additions (§8.4 REQ-VIS-10)

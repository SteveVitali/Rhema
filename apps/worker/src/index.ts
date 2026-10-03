// worker — pg-boss consumers. P0.08 adds the run-lifecycle handlers (run-jobs.ts) over @rhema/orchestrator;
// P0.01's deletion/retention pipeline stays. The live pg-boss registration (a PgBoss instance + `.work`) is
// wired at deploy; the handlers are the payload → orchestrator mapping and are unit-tested directly.

export * from "./deletion.js";
export * from "./jobs.js";
export * from "./run-jobs.js";
export * from "./run-events-jobs.js";
export * from "./ledger-jobs.js";
export * from "./ingest-jobs.js";

/** Queue names this worker owns (§12.1). Handlers are stubbed until P0.08. */
export const WORKER_QUEUES = [
  "run.start",
  "run.resume",
  "run.cancel",
  "run.reap",
  "export.job",
  "ingest.job", // legacy name kept for compat; P1.15 drives "ingest.sync" below
  "sync.job",
  "ingest.sync", // §9.5: one connection through discover→diff→fetch→version
  "ingest.sync.sweep", // daily auto-sync scheduler (schedule='daily' connections)
  "ingest.reconstruct", // the priced text/visual PDF reconstruction pass
  "voice.purge", // REQ-INGEST-16 voice-delete cascade
  "mail.send",
  "notify",
  "usage.reconcile",
  "figure.render",
  // Run-event store maintenance (§12.5, P0.08b):
  "run_events.retention", // daily: expire internal rows at 30 days (user rows survive)
  "run_events.partition", // daily: pre-create the upcoming daily run_events partitions
  // Deletion / retention pipeline (REQ-ARCH-28/29):
  "project.purge", // tombstone -> 30-day purge -> lifecycle delete
  "account.hard-delete", // 14-day grace -> hard delete (retain anonymized ledger + Stripe customer)
] as const;

export type WorkerQueue = (typeof WORKER_QUEUES)[number];

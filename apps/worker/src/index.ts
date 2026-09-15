// worker — pg-boss consumers. P0.08 adds the run-lifecycle handlers (run-jobs.ts) over @rhema/orchestrator;
// P0.01's deletion/retention pipeline stays. The live pg-boss registration (a PgBoss instance + `.work`) is
// wired at deploy; the handlers are the payload → orchestrator mapping and are unit-tested directly.

export * from "./deletion.js";
export * from "./jobs.js";
export * from "./run-jobs.js";

/** Queue names this worker owns (§12.1). Handlers are stubbed until P0.08. */
export const WORKER_QUEUES = [
  "run.start",
  "run.resume",
  "run.cancel",
  "run.reap",
  "export.job",
  "ingest.job",
  "sync.job",
  "mail.send",
  "notify",
  "usage.reconcile",
  "figure.render",
  // Deletion / retention pipeline (REQ-ARCH-28/29):
  "project.purge", // tombstone -> 30-day purge -> lifecycle delete
  "account.hard-delete", // 14-day grace -> hard delete (retain anonymized ledger + Stripe customer)
] as const;

export type WorkerQueue = (typeof WORKER_QUEUES)[number];

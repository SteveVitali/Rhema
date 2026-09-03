// worker — pg-boss consumers (skeleton service, P0.01). Real consumers land in P0.08+. P0.01 fixes
// the deletion/retention job identities (R8) and the pure policy they call, so `images` + deploy
// provenance run before any job has logic.

export * from "./deletion.js";
export * from "./jobs.js";

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

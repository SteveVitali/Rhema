// worker — pg-boss consumers. P0.08 adds the run-lifecycle handlers (run-jobs.ts) over @rhema/orchestrator;
// P0.01's deletion/retention pipeline stays. The live pg-boss registration (a PgBoss instance + `.work`) is
// wired at deploy; the handlers are the payload → orchestrator mapping and are unit-tested directly.

export * from "./deletion.js";
export * from "./jobs.js";
export * from "./run-jobs.js";
export * from "./run-events-jobs.js";
export * from "./ledger-jobs.js";
export * from "./ingest-jobs.js";

/** Queue names this worker owns (§12.1). Manifest mirror of main.ts's createQueue list — R6LOW.1
 *  re-synced it after it drifted (20 names vs ~32 live registrations; N-A6 #7). The retention test
 *  asserts the live `boss.work` bindings in main.ts, not this list — a name here is not a consumer. */
export const WORKER_QUEUES = [
  "run.start",
  "run.resume",
  "run.cancel",
  "run.reap",
  "run.deliver", // PRB.08 — the withheld-delivery re-drive
  "run.finalize", // P1.12 — gate-last delivery completion
  "export.job", // legacy name kept for compat
  "ingest.job", // legacy name kept for compat; P1.15 drives "ingest.sync" below
  "sync.job",
  "ingest.sync", // §9.5: one connection through discover→diff→fetch→version
  "ingest.sync.sweep", // daily auto-sync scheduler (schedule='daily' connections)
  "ingest.reconstruct", // the priced text/visual PDF reconstruction pass
  "voice.purge", // REQ-INGEST-16 voice-delete cascade
  "mail.send",
  "notify",
  "notify.sweep.weekly", // P1.19 — the notification digest sweeps
  "notify.sweep.daily",
  "notify.sweep.hourly",
  "auth.mail", // PRB.16 — the Better Auth magic-link transport
  "usage.reconcile",
  "figure.render",
  "gate.expiry", // PRB.16b — one queue for every gate's deadline
  "run.sweep_parked", // the parked-run sweep
  "stripe.event", // the webhook consumer
  "billing.period-tick", // P1.16 — period grants + lapse + daily Free allowance
  "billing.auto-reload", // P1.16 — the opt-in auto-reload sweep
  "billing.estimator-refit", // P1.16 — the weekly REQ-BILL-7 re-fit
  "test-tenant.purge", // JOURNEY.1 — hourly flagged-tenant sweep
  "slo.probe", // P1.22 — the 5-minute §13.5 signal sweep (was setInterval; R6LOW.1)
  "slo.review.weekly", // SLO.1 — the REQ-ARCH-34 weekly review readout
  "cite.completeness.daily", // CITE.1 — the cross-tenant completeness rollup
  // Run-event store maintenance (§12.5, P0.08b):
  "run_events.retention", // daily: expire internal rows at 30 days (user rows survive)
  "run_events.partition", // daily: pre-create the upcoming daily run_events partitions
  "admin_actions.retention", // BL-123 — daily: the audit class's declared 90-day expiry
  // Deletion / retention pipeline (REQ-ARCH-28/29):
  "project.purge", // tombstone -> 30-day purge -> lifecycle delete
  "account.export", // P1.18 — the whole-account zip build + emailed link (REQ-ACCT-3)
  "account.hard-delete", // 14-day grace -> hard delete (retain anonymized ledger + Stripe customer)
] as const;

export type WorkerQueue = (typeof WORKER_QUEUES)[number];

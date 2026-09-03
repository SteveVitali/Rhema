// Deletion/retention worker job handlers (skeleton, P0.01). These are the consumers for the
// `project.purge` and `account.hard-delete` queues (see WORKER_QUEUES). They apply the pure policy
// from deletion.ts and return the decided action; the actual S3 lifecycle-delete and row destruction
// land in P1.20 (deletion UI) / later tickets. Wiring them now makes deliverable R8 real "as worker
// jobs" rather than nominal queue names, and keeps the policy exercised end-to-end.

import { shouldPurgeProject, accountDeletionPlan, type AccountDeletionPlan } from "./deletion.js";

export interface ProjectPurgeJob {
  tenantId: string;
  projectId: string;
  /** ISO-8601 timestamp the project was tombstoned. */
  tombstonedAt: string;
}

export interface AccountHardDeleteJob {
  tenantId: string;
  userId: string;
  /** ISO-8601 timestamp deletion was requested. */
  deletionRequestedAt: string;
}

export interface ProjectPurgeResult {
  projectId: string;
  purged: boolean;
}

/** `project.purge` consumer: purge a tombstoned project once past the 30-day grace (REQ-ARCH-28). */
export async function handleProjectPurge(
  job: ProjectPurgeJob,
  now: Date = new Date(),
): Promise<ProjectPurgeResult> {
  const purged = shouldPurgeProject(new Date(job.tombstonedAt), now);
  // TODO(P1.20): when `purged`, S3 lifecycle-delete the project prefix and hard-delete its rows.
  return { projectId: job.projectId, purged };
}

export interface AccountHardDeleteResult extends AccountDeletionPlan {
  userId: string;
}

/** `account.hard-delete` consumer: hard-delete after the 14-day grace, retaining tax-required data. */
export async function handleAccountHardDelete(
  job: AccountHardDeleteJob,
  now: Date = new Date(),
): Promise<AccountHardDeleteResult> {
  const plan = accountDeletionPlan(new Date(job.deletionRequestedAt), now);
  // TODO(P1.20): when phase === "hard-delete", destroy content + PII, retaining `plan.retain`.
  return { userId: job.userId, ...plan };
}

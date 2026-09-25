// Deletion/retention worker job handlers. P0.01 landed the pure policy (deletion.ts); P1.20 lands
// the `account.hard-delete` destruction half (REQ-ACCT-4; §13.3): past the 14-day grace the handler
// hard-deletes the account's content + PII while retaining exactly what tax/audit law requires —
// anonymized ledger rows (credit_ledger/usage_records scrubbed of user linkage) and the billing
// account (the Stripe customer mapping). `project.purge` stays policy-only (object-prefix lifecycle
// is the storage leg's job).

import type { Queue, SqlClient } from "@rhema/orchestrator";
import {
  shouldPurgeProject,
  accountDeletionPlan,
  PROJECT_PURGE_AFTER_DAYS,
  type AccountDeletionPlan,
} from "./deletion.js";

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

export interface ProjectPurgeDeps {
  /**
   * system-scoped client — the worker is untenanted; the re-read keys on the job's
   * tenantId/projectId explicitly. Unset ⇒ pure-policy result over the job payload (tests).
   */
  readonly systemExec?: SqlClient;
  /** re-enqueue when the CURRENT tombstone's grace has not yet elapsed (delete → restore → delete). */
  readonly queue?: Queue;
  /**
   * The objects-bucket byte seam (GCS `file(key).delete`): past grace, the project's
   * `artifact_versions.s3_key`s that no remaining workspace row still references are deleted.
   * Unset ⇒ the row purge still runs; object cleanup is skipped.
   */
  readonly blobs?: { delete(key: string): Promise<void> };
  readonly now?: Date;
}

export interface ProjectPurgeResult {
  projectId: string;
  purged: boolean;
  /** the project was restored inside the window (deleted_at cleared) — the job no-ops. */
  restored?: boolean;
  /** the row is still inside a LATER grace (re-deleted after this job was enqueued) — re-scheduled. */
  rescheduled?: boolean;
  /** table → deleted-row counts when destruction ran. */
  deleted?: Readonly<Record<string, number>>;
  /** object keys removed from the workspace's object store. */
  objectsDeleted?: number;
}

/** `project.purge` consumer (REQ-ARCH-28; D-P1.04-2 — the api enqueues at the tombstone's +30d).
 *  Re-reads `projects.deleted_at` like `account.hard-delete` re-reads its marker: a restore inside
 *  the window no-ops; a delete → restore → delete lands a NEWER tombstone than the job carries, so
 *  the remaining grace is re-scheduled rather than purging early. */
export async function handleProjectPurge(
  job: ProjectPurgeJob,
  deps: ProjectPurgeDeps = {},
): Promise<ProjectPurgeResult> {
  const now = deps.now ?? new Date();
  let tombstonedAt = new Date(job.tombstonedAt);
  if (deps.systemExec) {
    const row = (
      await deps.systemExec.query(
        `select deleted_at from projects where id = $1 and workspace_id = $2`,
        [job.projectId, job.tenantId],
      )
    ).rows[0] as { deleted_at: string | Date | null } | undefined;
    if (!row || row.deleted_at == null) return { projectId: job.projectId, purged: false, restored: true };
    tombstonedAt = new Date(row.deleted_at);
    if (!shouldPurgeProject(tombstonedAt, now)) {
      // still inside grace — either the job fired early or the row was re-tombstoned after this
      // job was enqueued (delete → restore → delete); re-arm at the CURRENT grace end.
      const remaining = tombstonedAt.getTime() + PROJECT_PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000 - now.getTime();
      if (deps.queue) {
        await deps.queue
          .send(
            "project.purge",
            { tenantId: job.tenantId, projectId: job.projectId, tombstonedAt: tombstonedAt.toISOString() },
            { startAfterMs: Math.max(0, remaining), singletonKey: `project.purge:${job.projectId}` },
          )
          .catch(() => undefined);
      }
      return { projectId: job.projectId, purged: false, rescheduled: true };
    }
  }
  const purged = shouldPurgeProject(tombstonedAt, now);
  if (!purged || !deps.systemExec) return { projectId: job.projectId, purged };

  // Past grace — destroy. `delete from projects` cascades the whole project tree (drafts →
  // artifacts/versions, runs → steps/gates/events/findings/claims/obligations …) EXCEPT the
  // NO-ACTION leaves that must die first: working_copies (drafts/live_docs), provenance_maps
  // (artifact_versions), analytics_events (no project FK — hygiene).
  const db = deps.systemExec;
  const deleted: Record<string, number> = {};
  const del = async (table: string, sql: string, params: unknown[]): Promise<void> => {
    const res = await db.query(sql, params);
    deleted[table] = (deleted[table] ?? 0) + res.rows.length;
  };
  const draftIds = `(select id from drafts where project_id = $1)`;
  // The object keys BEFORE the cascade — after the row delete the refs are gone.
  const keys = (
    await db.query(
      `select av.s3_key from artifact_versions av join artifacts a on a.id = av.artifact_id
        where a.project_id = $1`,
      [job.projectId],
    )
  ).rows as { s3_key: string | null }[];
  await del(
    "working_copies",
    `delete from working_copies where base_draft_id in ${draftIds} or reconciled_into in ${draftIds} returning id`,
    [job.projectId],
  );
  await del(
    "provenance_maps",
    `delete from provenance_maps where draft_version_id in
       (select av.id from artifact_versions av join artifacts a on a.id = av.artifact_id
         where a.project_id = $1) returning draft_version_id`,
    [job.projectId],
  );
  await del("analytics_events", `delete from analytics_events where project_id = $1 returning id`, [
    job.projectId,
  ]);
  // The keyed delete on BOTH columns — a hijacked/renamed id can never purge another tenant's row.
  await del("projects", `delete from projects where id = $1 and workspace_id = $2 returning id`, [
    job.projectId,
    job.tenantId,
  ]);

  // Object cleanup: delete each collected key only when NO remaining artifact_version in the
  // workspace still references it (content-addressed keys can be shared by a sibling project).
  let objectsDeleted = 0;
  if (deps.blobs) {
    for (const { s3_key } of keys) {
      if (!s3_key) continue;
      const still = (
        await db.query(
          `select 1 from artifact_versions av join artifacts a on a.id = av.artifact_id
            where a.workspace_id = $1 and av.s3_key = $2 limit 1`,
          [job.tenantId, s3_key],
        )
      ).rows[0];
      if (still) continue;
      await deps.blobs.delete(s3_key).catch(() => undefined); // best-effort; logged via count
      objectsDeleted++;
    }
  }
  return {
    projectId: job.projectId,
    purged: true,
    deleted,
    ...(deps.blobs ? { objectsDeleted } : {}),
  };
}

export interface AccountHardDeleteDeps {
  /**
   * system-scoped client — the worker is untenanted; every statement keys on the job's
   * userId/tenantId explicitly. Unset ⇒ decision-only (the pure-policy result, for tests that
   * exercise the plan without a database).
   */
  readonly systemExec?: SqlClient;
  readonly now?: Date;
}

export interface AccountHardDeleteResult extends AccountDeletionPlan {
  userId: string;
  /** set ⇒ the request was cancelled during grace (deletion_requested_at cleared) — a no-op. */
  cancelled?: boolean;
  /** the table → deleted-row counts when the destruction ran (undefined pre-grace/cancelled). */
  deleted?: Readonly<Record<string, number>>;
}

/**
 * `account.hard-delete` consumer (REQ-ACCT-4; §13.3). Past the 14-day grace the account's content +
 * PII are destroyed; the billing account (Stripe customer), credit_ledger, credit_balances, and
 * usage_records SURVIVE — usage rows are anonymized in place (user/project/persona ids nulled; the
 * metering facts tax law needs are not PII). A cancel inside grace cleared `deletion_requested_at`
 * — the job re-reads it and no-ops. A still-pending request inside grace answers `phase: "grace"`
 * without deleting (the caller re-enqueues for the grace end).
 */
export async function handleAccountHardDelete(
  job: AccountHardDeleteJob,
  deps: AccountHardDeleteDeps = {},
): Promise<AccountHardDeleteResult> {
  const now = deps.now ?? new Date();
  const plan = accountDeletionPlan(new Date(job.deletionRequestedAt), now);
  if (plan.phase !== "hard-delete" || !deps.systemExec) {
    return { userId: job.userId, ...plan };
  }
  const db = deps.systemExec;

  // Re-check the marker: a cancel inside the window cleared it — the delayed job no-ops.
  const user = (
    await db.query(`select id, email, deletion_requested_at from "user" where id = $1`, [job.userId])
  ).rows[0] as { id: string; email: string; deletion_requested_at: string | Date | null } | undefined;
  if (!user || user.deletion_requested_at == null) {
    return { userId: job.userId, ...plan, cancelled: true, deleted: {} };
  }

  const deleted: Record<string, number> = {};
  const del = async (table: string, sql: string, params: unknown[]): Promise<void> => {
    const res = await db.query(sql, params);
    deleted[table] = (deleted[table] ?? 0) + res.rows.length;
  };
  // Deletes return `rowCount`-less resultsets on this client shape — count via `returning id`.
  const tenant = job.tenantId;

  // 1 — anonymize the retained usage rows (7-year metering retention): strip the person/project/
  //     persona linkage; the credits/tokens facts survive unattributed.
  await del(
    "usage_records",
    `update usage_records set user_id = null, project_id = null, persona_id = null
      where workspace_id = $1 returning id`,
    [tenant],
  );
  // 2 — workspace strays the project cascade never reaches: the export rows reference "user"
  //     without cascade, and the leaf tables that reference the content tree without `on delete
  //     cascade` must die before their parents.
  await del("account_exports", `delete from account_exports where workspace_id = $1 returning id`, [tenant]);
  await del("analytics_events", `delete from analytics_events where workspace_id = $1 returning id`, [tenant]);
  await del(
    "provenance_maps",
    `delete from provenance_maps where draft_version_id in
       (select av.id from artifact_versions av join artifacts a on a.id = av.artifact_id
         where a.workspace_id = $1) returning draft_version_id`,
    [tenant],
  );
  await del(
    "working_copies",
    `delete from working_copies where base_draft_id in
       (select d.id from drafts d join projects p on p.id = d.project_id where p.workspace_id = $1)
       or reconciled_into in
       (select d.id from drafts d join projects p on p.id = d.project_id where p.workspace_id = $1)
      returning id`,
    [tenant],
  );
  await del(
    "persona_members",
    `delete from persona_members where member_id in
       (select id from personas where workspace_id = $1) returning composite_id`,
    [tenant],
  );
  // 3 — the content roots: projects cascade drafts/artifacts/runs/gates/findings/guidance/threads/
  //     files/obligations/figures/versions; personas cascade connections + samples + profiles.
  await del("projects", `delete from projects where workspace_id = $1 returning id`, [tenant]);
  await del("personas", `delete from personas where workspace_id = $1 returning id`, [tenant]);
  await del("artifacts", `delete from artifacts where workspace_id = $1 returning id`, [tenant]);
  // 4 — the user row cascades session/account/device/workspace_members/notification_*/inbox/
  //     decision_requests/invite_redemptions/support_access_*/email_action_tokens.
  await del(
    "verification",
    `delete from verification where identifier = $1 or identifier = $2 returning id`,
    [`email-change:${job.userId}`, user.email],
  );
  await del("user", `delete from "user" where id = $1 returning id`, [job.userId]);
  // Retained by law: workspaces + billing_accounts (the Stripe customer), credit_ledger,
  // credit_balances, usage_records (scrubbed), subscriptions, stripe_events, checkout_sessions,
  // trial_*, admin_actions, auto_reload_events.

  return { userId: job.userId, ...plan, deleted };
}

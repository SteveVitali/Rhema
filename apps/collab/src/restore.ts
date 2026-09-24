// Restore-point retention sweeper (P1.03; §11.4). The storage primitives (blob seam, key, write,
// reconstruction, the retention table) moved to @rhema/mirror in P1.08 so the api's
// browse/preview/restore routes reuse the same code — this module re-exports them for collab
// callers and keeps `sweepRestorePoints` (it owns the hourly cron seam + the workspace-iterate
// scoped delete).

import type { CollabDb } from "./sql.js";
import {
  DEFAULT_RESTORE_RETENTION_DAYS,
  RESTORE_RETENTION,
  type RestoreBlobStore,
} from "@rhema/mirror";

export {
  DEFAULT_RESTORE_RETENTION_DAYS,
  InMemoryRestoreBlobStore,
  reconstructDocState,
  RESTORE_ACTIVITY_MS,
  RESTORE_RETENTION,
  RESTORE_SNAPSHOT_MS,
  restoreKey,
  writeRestorePoint,
} from "@rhema/mirror";
export type {
  RestoreBlobStore,
  RestoreCause,
  RestoreKind,
  WriteRestorePointArgs,
} from "@rhema/mirror";

export interface SweepResult {
  readonly workspacesSwept: number;
  readonly pointsDeleted: number;
}

/**
 * The retention sweeper (ledger F12): per workspace, expire `restore_points` older than the plan's
 * window — `named` points and each live doc's LATEST snapshot are exempt (the chain needs one base).
 * Blobs are deleted best-effort (a GCS 404 is already-clean). Iterates workspaces so every delete
 * runs under that tenant's scope — no unscoped cross-tenant sweep.
 */
export async function sweepRestorePoints(
  db: CollabDb,
  blobs: RestoreBlobStore,
  now: Date,
): Promise<SweepResult> {
  const workspaces = (
    await db.query("select id, billing_account_id from workspaces order by id")
  ).rows as { id: string; billing_account_id: string }[];

  let deleted = 0;
  for (const ws of workspaces) {
    deleted += await db.scoped(ws.id, async (tx) => {
      const tier =
        (
          (
            await tx.query(
              `select tier from subscriptions where billing_account_id = $1 order by period_start desc limit 1`,
              [ws.billing_account_id],
            )
          ).rows[0] as { tier: string } | undefined
        )?.tier ?? "free";
      const days = RESTORE_RETENTION[tier]?.days ?? DEFAULT_RESTORE_RETENTION_DAYS;
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

      // The live docs of this workspace's drafts.
      const liveDocs = (
        await tx.query(
          `select ld.id from live_docs ld
             join drafts d on d.id = ld.draft_id
             join projects p on p.id = d.project_id
            where p.workspace_id = $1`,
          [ws.id],
        )
      ).rows as { id: string }[];

      let n = 0;
      for (const { id: liveDocId } of liveDocs) {
        const keepSnapshot = (
          await tx.query(
            `select id from restore_points where live_doc_id = $1 and kind = 'snapshot'
             order by created_at desc limit 1`,
            [liveDocId],
          )
        ).rows[0] as { id: string } | undefined;
        const doomed = (
          await tx.query(
            `delete from restore_points
              where live_doc_id = $1 and created_at < $2
                and (cause is null or cause <> 'named')
                and id <> $3
              returning id, s3_key`,
            [liveDocId, cutoff, keepSnapshot?.id ?? ""],
          )
        ).rows as { id: string; s3_key: string }[];
        n += doomed.length;
        for (const d of doomed) await blobs.delete(d.s3_key).catch(() => undefined);
      }
      return n;
    });
  }
  return { workspacesSwept: workspaces.length, pointsDeleted: deleted };
}

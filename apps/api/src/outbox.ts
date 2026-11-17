// BL-115 (298_R6FIX.31) — the durable outbox seam (migration 0064). The delayed arms
// (`account.hard-delete`, `project.purge`, `account.export`) write their marker and this row in
// ONE tenant transaction (`txRunner`), so an armed intent can never commit without its delivery
// intent persisted. The worker's `outbox.drain` cron replays the row onto pg-boss verbatim —
// `options` is the pg-boss send-options blob (`startAfterMs`, `singletonKey`), stored so the
// delay and dedupe contracts travel with the intent.
import type { SqlClient } from "@rhema/orchestrator";

export interface OutboxSendOptions {
  readonly startAfterMs?: number;
  readonly singletonKey?: string;
}

export async function insertOutbox(
  tx: SqlClient,
  row: {
    id: string;
    workspaceId: string;
    queue: string;
    payload: Record<string, unknown>;
    options?: OutboxSendOptions;
  },
): Promise<void> {
  await tx.query(
    `insert into outbox (id, workspace_id, queue, payload, send_options) values ($1, $2, $3, $4, $5)`,
    [
      row.id,
      row.workspaceId,
      row.queue,
      JSON.stringify(row.payload),
      JSON.stringify(row.options ?? {}),
    ],
  );
}

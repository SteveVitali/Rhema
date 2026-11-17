// BL-115 (298_R6FIX.31) — the outbox drain. The delayed arms write their marker + an `outbox`
// row in ONE tenant tx (migration 0064); this cron claims pending rows on the system exec
// (60-second claim lease + bounded attempts + FOR UPDATE SKIP LOCKED — the canonical
// pause_signals drain shape) and replays each onto the queue with the stored send options
// verbatim (`startAfterMs` keeps the original delay; `singletonKey` keeps the dedupe).
//
// Failure semantics: a failed send leaves the row claimed — the lease expiry re-arms it for the
// next drain; `last_error` records the cause. A row that reaches OUTBOX_MAX_ATTEMPTS stops being
// claimed (stays `sent_at is null` — visible to the operator, never marked sent it wasn't).

import type { Queue, SendOptions, SqlClient } from "@rhema/orchestrator";

export const OUTBOX_CLAIM_LEASE_SECONDS = 60;
export const OUTBOX_MAX_ATTEMPTS = 25;
export const OUTBOX_DRAIN_QUEUE = "outbox.drain";

interface OutboxRow {
  id: string;
  queue: string;
  payload: Record<string, unknown>;
  send_options: Record<string, unknown>;
  attempts: number;
}

export interface OutboxDrainResult {
  readonly claimed: number;
  readonly sent: string[];
  readonly deadLettered: string[];
  readonly errors: string[];
}

export async function drainOutbox(
  deps: { queue: Queue },
  args: { system: SqlClient; limit?: number },
): Promise<OutboxDrainResult> {
  const limit = args.limit ?? 50;
  const claimed = await args.system.query(
    `with c as (
       select id from outbox
        where sent_at is null
          and attempts < $3
          and (claimed_at is null or claimed_at < now() - ($2 * interval '1 second'))
        order by created_at
        limit $1
        for update skip locked
     )
     update outbox o
        set claimed_at = now(), attempts = o.attempts + 1
       from c
      where o.id = c.id
      returning o.id, o.queue, o.payload, o.send_options, o.attempts`,
    [limit, OUTBOX_CLAIM_LEASE_SECONDS, OUTBOX_MAX_ATTEMPTS],
  );

  const out: OutboxDrainResult = {
    claimed: claimed.rows.length,
    sent: [],
    deadLettered: [],
    errors: [],
  };

  for (const row of claimed.rows as OutboxRow[]) {
    try {
      await deps.queue.send(row.queue, row.payload ?? {}, (row.send_options ?? {}) as SendOptions);
      await args.system.query(`update outbox set sent_at = now(), last_error = null where id = $1`, [
        row.id,
      ]);
      out.sent.push(row.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await args.system
        .query(`update outbox set last_error = $2 where id = $1`, [row.id, message.slice(0, 500)])
        .catch(() => undefined);
      if (row.attempts >= OUTBOX_MAX_ATTEMPTS) {
        out.deadLettered.push(row.id);
        console.error(
          `[worker] outbox.drain dead-lettered ${row.id} (queue ${row.queue}) after ${row.attempts} attempts:`,
          message,
        );
      } else {
        out.errors.push(row.id);
        console.error(
          `[worker] outbox.drain send failed for ${row.id} (queue ${row.queue}, attempt ${row.attempts}):`,
          message,
        );
      }
    }
  }
  return out;
}

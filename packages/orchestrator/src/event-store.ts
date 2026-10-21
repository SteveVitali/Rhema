// The production run-event store (§12.5) — the durable backing for the `EventWriter` seam P0.08 defined.
//
// `SqlEventWriter.append` runs inside the caller's tenant transaction (REQ-DATA-33), so a state change and its
// event commit or roll back together. It:
//   1. validates the payload against the type's whitelist schema at the write boundary (REQ-DATA-37 — throws on
//      an unknown type, a bad payload, or a free-text field over its bound);
//   2. assigns the run's next `seq` from `run_event_seq` (atomic upsert `returning` — gap-free, serialized on
//      the run row even under concurrent appenders, shared across the user/internal split);
//   3. routes the row: `visibility=user` → the daily-partitioned `run_events` (streamed over SSE); `internal`
//      → `run_events_internal` (30-day retention, never streamed);
//   4. best-effort PUBLISHes the seq to the fan-out bus for the SSE tail (user rows only).
//
// The workspace_id written is `current_tenant()` — guaranteed set on the append path (the caller's tenant tx) —
// so the RLS WITH CHECK on `run_events` / `run_event_seq` always passes and the row is pinned to the run's
// tenant. Redis is a wakeup only and is never a source of truth: the SSE tail always reads the actual rows from
// Postgres, so a lost/early/duplicate publish is at most a no-op (see event-stream.ts).

import { parseRunEvent, RUN_EVENTS } from "@rhema/contracts";
import type { EventInput, AppendedEvent, EventWriter } from "./event-writer.js";
import type { SqlClient, TxRunner } from "./tx.js";

/** The largest event batch the internal `POST events` endpoint accepts in one call (§12.5: ≤250 or 2 s). */
export const MAX_EVENT_BATCH = 250;

/** Days internal-visibility rows are retained before the retention job deletes them (§12.5). */
export const INTERNAL_EVENT_RETENTION_DAYS = 30;

/**
 * The fan-out seam (§12.5): after a user event is appended, its seq is published on `run:<id>` so every SSE
 * task tailing that run wakes and reads the new rows from Postgres. Live Redis binding is deferred (see
 * DEFERRALS P0.08b); tests use `InMemoryRunEventBus`.
 */
export interface RunEventPublisher {
  /** Signal that the run has events up to `seq`. Best-effort — must never throw into the append path. */
  publish(runId: string, seq: number): void | Promise<void>;
}

/** The subscribe half of the fan-out seam, consumed by the SSE tail. */
export interface RunEventSubscriber {
  /** Call `onSeq` on each published high-water seq for `runId`; returns an unsubscribe function. */
  subscribe(runId: string, onSeq: (seq: number) => void): () => void;
}

/**
 * REQ-ENG-2 (D-SLO.1-6) — the post-commit wakeup for a run's terminal batch. `append` publishes the
 * seq inside the still-uncommitted transaction; a woken SSE tail pumps immediately, reads only
 * committed rows, sees nothing, and — when that batch was the run's LAST — has no next publish to
 * re-wake it, so the terminal events ride the 10 s safety poll (the six ~2.2 s outliers that pushed
 * event-delivery p95 to 2,238 ms). Call this AFTER a run-end commit resolves: it re-reads the
 * committed `run_event_seq` high-water in a fresh tenant transaction and re-publishes it, so the
 * wakeup lands after the rows are visible and the tail delivers the terminal batch at publish speed.
 * Best-effort like every wakeup: a lost republish is recovered by the same safety re-poll it
 * replaces (§12.5 — Redis is a wakeup only, never a source of truth).
 */
export async function publishCommittedEventHighWater(
  deps: { readonly txRunner: TxRunner; readonly eventPublisher?: RunEventPublisher },
  workspaceId: string,
  runId: string,
): Promise<void> {
  if (!deps.eventPublisher) return;
  try {
    const res = await deps.txRunner.run(workspaceId, (tx) =>
      tx.query("select seq from run_event_seq where run_id = $1", [runId]),
    );
    const seq = (res.rows[0] as { seq: number } | undefined)?.seq;
    if (typeof seq === "number" && seq > 0) await deps.eventPublisher.publish(runId, seq);
  } catch {
    /* a lost wakeup is recovered by the tail's safety re-poll — never throw into a run-end path. */
  }
}

/** The UTC calendar day of an instant — the `run_events` partition key. */
export function eventDay(at: Date): string {
  return at.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Assign the run's next seq atomically inside `tx` (gap-free; serialized on the run row). */
async function nextSeq(tx: SqlClient, runId: string): Promise<number> {
  const res = await tx.query(
    `insert into run_event_seq(run_id, workspace_id, seq) values ($1, current_tenant(), 1)
       on conflict (run_id) do update set seq = run_event_seq.seq + 1
     returning seq`,
    [runId],
  );
  return (res.rows[0] as { seq: number }).seq;
}

/** SQL-backed event writer: the durable `run_events` store, seq assignment, the visibility split, fan-out. */
export class SqlEventWriter implements EventWriter {
  constructor(private readonly publisher?: RunEventPublisher) {}

  async append(tx: SqlClient, event: EventInput): Promise<AppendedEvent> {
    // (1) whitelist validation at the write boundary (REQ-DATA-37): unknown type / bad payload / >280-char
    // free text throws here, before anything is written.
    parseRunEvent(event.type, event.payload);
    const def = RUN_EVENTS[event.type];

    // (2) next seq (shared across user + internal).
    const seq = await nextSeq(tx, event.runId);
    const payloadJson = JSON.stringify(event.payload);

    // (3) route by visibility. workspace_id = current_tenant() keeps the row on the run's tenant (RLS WITH CHECK).
    if (def.visibility === "user") {
      await tx.query(
        `insert into run_events(run_id, seq, workspace_id, day, type, payload, density, agent_label,
           visibility, at)
         values ($1,$2, current_tenant(), $3,$4,$5,$6,$7,'user',$8)`,
        [event.runId, seq, eventDay(event.at), event.type, payloadJson, def.density, event.agentLabel ?? null, event.at],
      );
      // (4) best-effort fan-out (user rows only). Never let a publish failure abort the append. NOTE: this
      // in-tx publish is a wakeup, not a delivery — the tail always reads committed rows from Postgres, so a
      // publish for a not-yet-committed / rolled-back seq is at most a no-op. The LIVE Redis binding publishes
      // the POST-COMMIT high-water seq so p95 delivery does not hinge on in-tx timing (DEFERRALS D-P0.08b-2);
      // the SSE tail's safety re-poll + Last-Event-ID reconnect keep it correct regardless.
      if (this.publisher) {
        try {
          await this.publisher.publish(event.runId, seq);
        } catch {
          /* Redis is not a source of truth; the tail recovers via Postgres replay + reconnect. */
        }
      }
    } else {
      await tx.query(
        `insert into run_events_internal(run_id, seq, workspace_id, type, payload, agent_label, at)
         values ($1,$2, current_tenant(), $3,$4,$5,$6)`,
        [event.runId, seq, event.type, payloadJson, event.agentLabel ?? null, event.at],
      );
    }

    return { ...event, seq, visibility: def.visibility, density: def.density };
  }
}

// --------------------------------------------------------------------------- partition + retention maintenance

/**
 * Ensure the daily `run_events` partition covering `day` (a UTC `YYYY-MM-DD`) exists. Idempotent (`if not
 * exists`). The maintenance job (apps/worker) pre-creates today's + tomorrow's; the DEFAULT partition is the
 * safety net so an append never fails if this lags. DDL — runs as the owner/system, not under a tenant.
 */
export async function ensureRunEventsPartition(db: SqlClient, day: string): Promise<string> {
  const start = day; // inclusive
  const end = nextDay(day); // exclusive
  const suffix = day.replace(/-/g, "");
  const name = `run_events_${suffix}`;
  await db.query(
    `create table if not exists ${name} partition of run_events for values from ('${start}') to ('${end}')`,
  );
  return name;
}

/** The UTC calendar day after `day` (`YYYY-MM-DD` → `YYYY-MM-DD`). */
export function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Delete internal-visibility rows older than the retention window (§12.5: internal rows live 30 days; user
 * rows survive for the project's lifetime and are untouched here). System-scoped — `run_events_internal` is
 * not under RLS. Returns the number of rows deleted.
 */
export async function deleteExpiredInternalEvents(
  db: SqlClient,
  now: Date,
  retentionDays: number = INTERNAL_EVENT_RETENTION_DAYS,
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const res = await db.query("delete from run_events_internal where at < $1", [cutoff]);
  // node-postgres exposes rowCount; PGlite exposes affectedRows — read whichever is present.
  const r = res as unknown as { rowCount?: number; affectedRows?: number };
  return r.rowCount ?? r.affectedRows ?? 0;
}

// --------------------------------------------------------------------------- in-memory bus (tests / single node)

/**
 * An in-process publish/subscribe bus implementing both halves of the fan-out seam — for deterministic tests
 * and single-node dev. Production swaps in a Redis-backed publisher + subscriber (DEFERRALS P0.08b).
 */
export class InMemoryRunEventBus implements RunEventPublisher, RunEventSubscriber {
  private readonly subs = new Map<string, Set<(seq: number) => void>>();
  /** Every (runId, seq) published — a test helper / degradation flag. */
  readonly published: { runId: string; seq: number }[] = [];
  /** When true, publishes are dropped (simulates a Redis outage — the tail must still serve via Postgres). */
  degraded = false;

  publish(runId: string, seq: number): void {
    this.published.push({ runId, seq });
    if (this.degraded) return;
    for (const fn of this.subs.get(runId) ?? []) fn(seq);
  }

  subscribe(runId: string, onSeq: (seq: number) => void): () => void {
    let set = this.subs.get(runId);
    if (!set) this.subs.set(runId, (set = new Set()));
    set.add(onSeq);
    return () => {
      set!.delete(onSeq);
      if (set!.size === 0) this.subs.delete(runId);
    };
  }
}

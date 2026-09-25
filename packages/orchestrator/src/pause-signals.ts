// The pause-signal drain (P1.22; REQ-ARCH-32; §12.8) — the orchestrator-side half of the egress-proxy's
// pause transport. The proxy's `SqlSignalSink` writes a `pause_signals` row on a `suspicious_query`, an
// `egress.denied` spike, or a `user_source_fetch`; the worker calls `drainPauseSignals` on a short
// interval, which CLAIMS pending rows (a `claimed_at` lease so two workers never double-fire) and applies
// `pauseRun` — `running → waiting_gate` + a blocking `refusal` gate.
//
// Idempotent by construction: a signal for a run that is no longer `running` (already paused, gated,
// finished) is marked processed as a no-op — a retried or stale signal can never resurrect a pause.
// A row that keeps throwing past MAX_ATTEMPTS is dead-lettered (`processed_at` set, `attempts` recorded)
// so one poisoned signal can never wedge the sweep; the pause_signals row itself is the audit trail.
//
// `pause_signals` is NOT under RLS (0041 — like `run_events_internal`): the proxy writes cross-tenant and
// the sweep claims cross-tenant, so the claim scan + the processed-mark run on `system` — the worker's
// system-scoped executor (BYPASSRLS), never a tenant-scoped tx.

import type { SqlClient } from "./tx.js";
import type { EventWriter } from "./event-writer.js";
import type { Clock } from "./clock.js";
import type { TxRunner } from "./tx.js";
import type { Queue } from "./queue.js";
import { pauseRun, type PauseReason } from "./reactions.js";
import type { OrchestratorDeps } from "./internal-api.js";

/** How long a claimed row stays reserved before another drain may re-claim it (crash recovery). */
export const PAUSE_CLAIM_LEASE_MS = 60_000;
/** A row that keeps failing past this many attempts is dead-lettered (marked processed, un-actioned). */
export const PAUSE_MAX_ATTEMPTS = 6;

export type DrainDeps = {
  txRunner: TxRunner;
  eventWriter: EventWriter;
  clock: Clock;
  ids: OrchestratorDeps["ids"];
  queue?: Queue;
};

interface SignalRow {
  id: string | number;
  run_id: string;
  workspace_id: string;
  reason: PauseReason;
}

export interface DrainResult {
  readonly claimed: number;
  /** runIds paused this drain (the refusal gate opened). */
  readonly paused: string[];
  /** ids marked processed without pausing (run already out of `running`). */
  readonly skipped: (string | number)[];
  /** ids dead-lettered after exhausting attempts. */
  readonly deadLettered: (string | number)[];
  readonly errors: (string | number)[];
}

/**
 * Claim up to `limit` pending pause signals on `system` and apply `pauseRun` to each live run.
 * Called by the worker on a short interval (see apps/worker `PAUSE_SWEEP_INTERVAL_MS`) — a pause lands
 * within seconds of the proxy's signal, and a parked run's sandbox exits (no compute burn).
 */
export async function drainPauseSignals(
  deps: DrainDeps,
  args: { system: SqlClient; limit?: number },
): Promise<DrainResult> {
  const limit = args.limit ?? 50;
  const leaseSeconds = Math.ceil(PAUSE_CLAIM_LEASE_MS / 1000);

  // Atomically claim a batch (the canonical CTE + FOR UPDATE SKIP LOCKED pattern): lease it + bump
  // attempts; two concurrent drains can never take the same row.
  const claimed = await args.system.query(
    `with c as (
       select id from pause_signals
        where processed_at is null
          and (claimed_at is null or claimed_at < now() - ($2 * interval '1 second'))
        order by id
        limit $1
        for update skip locked
     )
     update pause_signals s
        set claimed_at = now(), attempts = s.attempts + 1
       from c
      where s.id = c.id
      returning s.id, s.run_id, s.workspace_id, s.reason, s.attempts`,
    [limit, leaseSeconds],
  );

  const out: DrainResult = { claimed: claimed.rows.length, paused: [], skipped: [], deadLettered: [], errors: [] };

  for (const row of claimed.rows as (SignalRow & { attempts: number })[]) {
    const markProcessed = () =>
      args.system.query("update pause_signals set processed_at = now() where id = $1", [row.id]);
    try {
      // A signal is meaningful only against a still-running run — anything else is a no-op that
      // MUST be marked processed (the run already parked/failed/completed; re-pausing is nonsense).
      const run = await args.system.query("select state from runs where id = $1", [row.run_id]);
      const state = (run.rows[0] as { state?: string } | undefined)?.state;
      if (state !== "running") {
        await markProcessed();
        out.skipped.push(row.id);
        continue;
      }
      await pauseRun(deps, { runId: row.run_id, workspaceId: row.workspace_id, reason: row.reason });
      await markProcessed();
      out.paused.push(row.run_id);
    } catch (err) {
      // Dead-letter a poisoned row rather than retry it forever; leave a live row claimed (the
      // lease expiry re-arms it for the next drain).
      if (row.attempts >= PAUSE_MAX_ATTEMPTS) {
        await markProcessed().catch(() => undefined);
        out.deadLettered.push(row.id);
      } else {
        out.errors.push(row.id);
      }
      console.error(
        `[orchestrator] pause drain: signal ${row.id} (run ${row.run_id}, ${row.reason}) failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return out;
}

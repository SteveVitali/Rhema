// @rhema/egress-proxy — the DURABLE signal sink (P1.22; REQ-ARCH-32; §12.8).
//
// `InMemoryEventSink` was the live wiring's gap: emitted `egress.denied` events and `PauseSignal`s
// evaporated in-process — the run never paused. `SqlSignalSink` is the production sink:
//
//   • `emitEgressDenied` → `run_events_internal` (the internal-visibility store, 30-day retention,
//     never streamed — 0008). The row shares the run's `seq` space via the `run_event_seq` upsert.
//     The proxy connects as a non-tenant role (`postgres`, BYPASSRLS — 0026), so `current_tenant()`
//     is unusable: `workspace_id` is resolved from `runs` and written explicitly.
//   • `emitPauseSignal` → `pause_signals` (0041) — the durable transport the worker's pause sweep
//     (`drainPauseSignals` in @rhema/orchestrator) claims and applies `pauseRun` to. Bounded poll ⇒
//     the run parks at its refusal-class card within seconds of the signal.
//
// The §12.5 discipline holds: payloads carry ids/domains/reasons only — never query text, never
// bodies. An unattributable denial (no runId — a missing/invalid credential) has no run_events row
// to land in; it stays a request-log line only.

import { parseRunEvent } from "@rhema/contracts";
import type { SqlExecutor } from "./sinks.js";
import type { EventSink, EgressDeniedPayload, PauseSignal } from "./signals.js";

export class SqlSignalSink implements EventSink {
  constructor(private readonly db: SqlExecutor) {}

  async emitEgressDenied(payload: EgressDeniedPayload): Promise<void> {
    // Same write-boundary validation the orchestrator's SqlEventWriter applies (REQ-DATA-37).
    parseRunEvent("egress.denied", { ...payload });
    if (!payload.runId) return; // no run to attribute — the request log is the only record
    const ws = await this.db.query("select workspace_id from runs where id = $1", [payload.runId]);
    const workspaceId = (ws.rows[0] as { workspace_id?: string } | undefined)?.workspace_id;
    if (!workspaceId) return; // stale/unknown run id — refuse to write an orphaned row
    const seqRes = await this.db.query(
      `insert into run_event_seq(run_id, workspace_id, seq) values ($1, $2, 1)
         on conflict (run_id) do update set seq = run_event_seq.seq + 1
       returning seq`,
      [payload.runId, workspaceId],
    );
    const seq = (seqRes.rows[0] as { seq: number }).seq;
    await this.db.query(
      `insert into run_events_internal(run_id, seq, workspace_id, type, payload, agent_label, at)
       values ($1,$2,$3,'egress.denied',$4,$5,$6)`,
      [
        payload.runId,
        seq,
        workspaceId,
        JSON.stringify(payload),
        payload.agentId ?? null,
        new Date().toISOString(),
      ],
    );
  }

  async emitPauseSignal(signal: PauseSignal): Promise<void> {
    const ws = await this.db.query("select workspace_id from runs where id = $1", [signal.runId]);
    const workspaceId = (ws.rows[0] as { workspace_id?: string } | undefined)?.workspace_id;
    if (!workspaceId) return; // unknown run — a pause for a run that does not exist is a no-op
    await this.db.query(
      `insert into pause_signals(run_id, workspace_id, reason, detail) values ($1,$2,$3,$4)`,
      [signal.runId, workspaceId, signal.reason, JSON.stringify(signal.detail)],
    );
  }
}

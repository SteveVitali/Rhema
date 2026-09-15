// The event-writer seam (§12.5). State transitions and the run-task's batched `POST events` append events
// through this interface INSIDE the same transaction as the state change (REQ-DATA-33) — so the UI never
// infers state from events alone and an event can never exist without its transition (or vice versa). P0.08b
// backs it with the partitioned `run_events` store, seq assignment, the visibility split and SSE fan-out; this
// ticket defines the interface it calls and ships an in-memory writer for the orchestrator's own tests.

import { parseRunEvent, RUN_EVENTS, type RunEventType } from "@rhema/contracts";
import type { SqlClient } from "./tx.js";

export interface EventInput {
  readonly runId: string;
  readonly type: RunEventType;
  readonly payload: unknown;
  readonly at: Date;
  /** attribution for requester-only routing (search/source events). */
  readonly agentLabel?: string;
}

export interface AppendedEvent extends EventInput {
  readonly seq: number;
  readonly visibility: (typeof RUN_EVENTS)[RunEventType]["visibility"];
  readonly density: (typeof RUN_EVENTS)[RunEventType]["density"];
}

export interface EventWriter {
  /**
   * Append one event within the caller's transaction; returns its per-run seq. Validates the payload against
   * the type's whitelist schema (REQ-DATA-37) and stamps visibility/density from the catalogue.
   */
  append(tx: SqlClient, event: EventInput): Promise<AppendedEvent>;
}

/** In-memory event writer for tests: validates + records appends, assigning a per-run monotonic seq. */
export class InMemoryEventWriter implements EventWriter {
  readonly events: AppendedEvent[] = [];
  private readonly seqByRun = new Map<string, number>();

  append(_tx: SqlClient, event: EventInput): Promise<AppendedEvent> {
    // whitelist validation at the write boundary (throws on unknown type / bad payload / >280-char free text).
    parseRunEvent(event.type, event.payload);
    const def = RUN_EVENTS[event.type];
    const seq = (this.seqByRun.get(event.runId) ?? 0) + 1;
    this.seqByRun.set(event.runId, seq);
    const appended: AppendedEvent = {
      ...event,
      seq,
      visibility: def.visibility,
      density: def.density,
    };
    this.events.push(appended);
    return Promise.resolve(appended);
  }

  /** All appended events for a run, in order (test helper). */
  forRun(runId: string): AppendedEvent[] {
    return this.events.filter((e) => e.runId === runId);
  }
  typesForRun(runId: string): RunEventType[] {
    return this.forRun(runId).map((e) => e.type);
  }
}

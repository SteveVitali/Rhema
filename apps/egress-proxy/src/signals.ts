// @rhema/egress-proxy — the internal signals the proxy emits (REQ-ARCH-32; §12.5, §12.8).
//
// The proxy emits two internal signals; this ticket owns EMISSION, P0.08 owns the REACTION (REQ-ARCH-32):
//  - `egress.denied` — the internal run event (contract-validated) for every refused request; a spike of these
//    for one run pauses it (§12.8), tracked by `DenialSpikeTracker`.
//  - a `PauseSignal` — the run-pause request the proxy raises on a `suspicious_query` (§12.8d n-gram hit) or an
//    egress-denied spike. There is no contract event type for it (adding one is P0.02's), so it is a typed
//    signal the orchestrator wires a reaction to.
// Internal signals NEVER carry prompt text, page text or bodies — only identifiers, URLs/domains and reasons.

import { parseRunEvent } from "@rhema/contracts";

/** Why the proxy is asking the orchestrator to pause the run. P1.21 adds `user_source_fetch` — a Memo
 *  run's attempt to web-fetch one of its own `user_sources[]` domains (§16.4; REQ-WF-8). */
export type PauseReason = "suspicious_query" | "egress_denied_spike" | "user_source_fetch";

/** A request to pause a run (REQ-ARCH-32). The orchestrator (P0.08) reacts; the proxy only emits. */
export interface PauseSignal {
  readonly runId: string;
  readonly reason: PauseReason;
  readonly detail: Record<string, unknown>;
}

/** The `egress.denied` internal-event payload (never bodies; §12.5 visibility rule). */
export interface EgressDeniedPayload {
  readonly runId?: string;
  readonly attempt?: number;
  readonly agentId?: string;
  readonly host?: string;
  readonly url?: string;
  readonly status: number;
  readonly reason: string;
}

/** Where the proxy sends its internal signals. P0.08 wires these to the run event stream + the pause reaction. */
export interface EventSink {
  emitEgressDenied(payload: EgressDeniedPayload): Promise<void> | void;
  emitPauseSignal(signal: PauseSignal): Promise<void> | void;
}

/** Collects emitted signals in memory (tests). Validates every `egress.denied` against the contract schema. */
export class InMemoryEventSink implements EventSink {
  readonly egressDenied: EgressDeniedPayload[] = [];
  readonly pauseSignals: PauseSignal[] = [];

  emitEgressDenied(payload: EgressDeniedPayload): void {
    // Prove the payload is a valid `egress.denied` event (internal; open record) — never a body leaks in.
    parseRunEvent("egress.denied", { ...payload });
    this.egressDenied.push(payload);
  }

  emitPauseSignal(signal: PauseSignal): void {
    this.pauseSignals.push(signal);
  }
}

/** §12.8: a spike of egress denials for one run pauses it. */
export const DEFAULT_DENIAL_SPIKE_THRESHOLD = 5 as const;

/**
 * Counts egress denials per run and reports when the count reaches the spike threshold (REQ-ARCH-32). The
 * spike fires once, on the crossing denial, so the orchestrator gets exactly one pause signal per run.
 */
export class DenialSpikeTracker {
  private readonly counts = new Map<string, number>();
  private readonly fired = new Set<string>();

  constructor(private readonly threshold: number = DEFAULT_DENIAL_SPIKE_THRESHOLD) {}

  /** Record one denial for a run; returns whether this denial constitutes the spike (first crossing only). */
  record(runId: string): { count: number; spike: boolean } {
    const count = (this.counts.get(runId) ?? 0) + 1;
    this.counts.set(runId, count);
    if (count >= this.threshold && !this.fired.has(runId)) {
      this.fired.add(runId);
      return { count, spike: true };
    }
    return { count, spike: false };
  }
}

// The pg-boss job queue seam (§12.4 step 3). The orchestrator enqueues run-lifecycle jobs with a per-run
// singleton key so a duplicate send is a no-op (pg-boss singleton keys prevent duplicate jobs). Live pg-boss
// wiring is the worker's (apps/worker); this is the interface + an in-memory queue for tests.

/** The run-lifecycle queues the orchestrator sends to (mirrors apps/worker WORKER_QUEUES). */
export const RUN_JOBS = {
  start: "run.start",
  resume: "run.resume",
  cancel: "run.cancel",
  reap: "run.reap",
  /** PRB.08 — re-drives a delivery a chargeback withheld (the stashed `runs.pending_delivery`). */
  deliver: "run.deliver",
} as const;
export type RunJobName = (typeof RUN_JOBS)[keyof typeof RUN_JOBS];

/**
 * The `gate:<id>` expiry job TYPE name. This ticket only REGISTERS the type (so a caller can name it); the
 * scheduling and handler semantics — deadline re-read, conditional resolve — are owned by P0.10.
 */
export function gateExpiryJob(gateId: string): string {
  return `gate:${gateId}`;
}

/**
 * Schedule (or reschedule) the `gate:<id>` expiry job for a deadline (P0.10; §6.4 item 6). The singleton key
 * includes the deadline instant, so scheduling the SAME deadline twice dedupes, but a MOVED deadline schedules a
 * fresh job (the stale job's fire is a harmless no-op — the handler re-reads the deadline). `null` (a *wait*
 * gate) schedules nothing.
 */
export async function scheduleGateExpiry(
  deps: { queue: Queue },
  args: { gateId: string; workspaceId: string; deadlineAt: Date | null; now: Date },
): Promise<void> {
  if (args.deadlineAt == null) return;
  const startAfterMs = Math.max(0, args.deadlineAt.getTime() - args.now.getTime());
  await deps.queue.send(
    gateExpiryJob(args.gateId),
    { gateId: args.gateId, workspaceId: args.workspaceId },
    { singletonKey: `${gateExpiryJob(args.gateId)}:${args.deadlineAt.getTime()}`, startAfterMs },
  );
}

export interface SendOptions {
  /** pg-boss singleton key: at most one active job per key (dedupes run.start / re-enqueues). */
  readonly singletonKey?: string;
  /** delay before the job becomes visible (backoff, StopTask grace). */
  readonly startAfterMs?: number;
}

export interface Queue {
  send(name: string, payload: Record<string, unknown>, opts?: SendOptions): Promise<void>;
}

export interface SentJob {
  readonly name: string;
  readonly payload: Record<string, unknown>;
  readonly singletonKey?: string;
  readonly startAfterMs?: number;
}

/** An in-memory queue that records sends and enforces singleton-key dedup, for deterministic tests. */
export class InMemoryQueue implements Queue {
  readonly sent: SentJob[] = [];

  send(name: string, payload: Record<string, unknown>, opts: SendOptions = {}): Promise<void> {
    if (opts.singletonKey != null) {
      const active = this.sent.some((j) => j.name === name && j.singletonKey === opts.singletonKey);
      if (active) return Promise.resolve(); // singleton: a duplicate active job is a no-op
    }
    this.sent.push({ name, payload, singletonKey: opts.singletonKey, startAfterMs: opts.startAfterMs });
    return Promise.resolve();
  }

  /** All jobs sent for a given queue name (test helper). */
  ofName(name: string): SentJob[] {
    return this.sent.filter((j) => j.name === name);
  }
}

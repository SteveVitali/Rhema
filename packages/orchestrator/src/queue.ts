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
  /** P1.05 — the one package-class model call that writes a delivered run's walkthrough (§5.6). */
  walkthrough: "run.walkthrough",
} as const;
export type RunJobName = (typeof RUN_JOBS)[keyof typeof RUN_JOBS];

/**
 * The gate-expiry QUEUE name (§12.4; §6.4 item 6). ONE pg-boss queue for every gate — the gate id rides
 * the job payload + singleton key. The original design name was `gate:<id>` per gate, but `:` is ILLEGAL
 * in a pg-boss queue name (`assertObjectName` throws `Name can only contain alphanumeric characters,
 * underscores, hyphens, periods, or forward slashes`): every deadline-bearing gate's post-commit send
 * 500'd AFTER the commit tx had already opened the gate — the pod marked the committed step failed and
 * the expiry job never armed (PRB.16b F25, live: `approve_sample`'s 24h deadline, run
 * 01M2T65W5PZ3174FPVFNQRVKZS). A single constant name is legal, needs one createQueue + one consumer.
 */
export const GATE_EXPIRY_QUEUE = "gate.expiry";

/**
 * The gate-expiry job TYPE name. Kept for callers that name the type; the queue is constant and the gate
 * id travels in the payload + singleton key (F25 — the `gate:<id>` form is an illegal pg-boss name).
 */
export function gateExpiryJob(_gateId: string): string {
  return GATE_EXPIRY_QUEUE;
}

/**
 * Schedule (or reschedule) the gate-expiry job for a deadline (P0.10; §6.4 item 6). The singleton key
 * carries the gate id + deadline instant, so scheduling the SAME deadline twice dedupes, but a MOVED
 * deadline schedules a fresh job (the stale job's fire is a harmless no-op — the handler re-reads the
 * deadline). `null` (a *wait* gate) schedules nothing.
 */
export async function scheduleGateExpiry(
  deps: { queue: Queue },
  args: { gateId: string; workspaceId: string; deadlineAt: Date | null; now: Date },
): Promise<void> {
  if (args.deadlineAt == null) return;
  const startAfterMs = Math.max(0, args.deadlineAt.getTime() - args.now.getTime());
  await deps.queue.send(
    GATE_EXPIRY_QUEUE,
    { gateId: args.gateId, workspaceId: args.workspaceId },
    { singletonKey: `${GATE_EXPIRY_QUEUE}:${args.gateId}:${args.deadlineAt.getTime()}`, startAfterMs },
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

// The live `Queue` binding (D-P0.08-1): the orchestrator's run-lifecycle sends over pg-boss (§12.4 step 3).
// pg-boss is a Postgres-backed job queue, so a `run.start` enqueue commits with the same AlloyDB the run rows
// live in. The orchestrator's `SendOptions` map onto pg-boss send options: `singletonKey` (at most one active
// job per key — dedupes a duplicate `run.start`) and `startAfterMs` → pg-boss `startAfter` in seconds (backoff /
// StopTask grace). This wrapper is send-only (the seam is); consumer registration (`.work`) is the worker's
// `main`. The mapping is unit-tested against a fake boss.

import type { Queue, SendOptions } from "@rhema/orchestrator";

/** The minimal pg-boss surface the send wrapper uses (the real `PgBoss` instance satisfies it). */
export interface PgBossLike {
  send(name: string, data: Record<string, unknown>, options?: PgBossSendOptions): Promise<string | null>;
}

/** The subset of pg-boss send options we set. */
export interface PgBossSendOptions {
  readonly singletonKey?: string;
  /** delay before the job is visible, in whole seconds (pg-boss `startAfter`). */
  readonly startAfter?: number;
}

/** Translate the orchestrator's `SendOptions` to pg-boss's (ms → whole seconds; drop empties). */
export function toPgBossSendOptions(opts: SendOptions | undefined): PgBossSendOptions {
  const out: { singletonKey?: string; startAfter?: number } = {};
  if (opts?.singletonKey != null) out.singletonKey = opts.singletonKey;
  if (opts?.startAfterMs != null && opts.startAfterMs > 0) out.startAfter = Math.ceil(opts.startAfterMs / 1000);
  return out;
}

/** `Queue` over a pg-boss instance — the deploy binding behind the orchestrator's queue seam. */
export class PgBossQueue implements Queue {
  constructor(private readonly boss: PgBossLike) {}

  async send(name: string, payload: Record<string, unknown>, opts: SendOptions = {}): Promise<void> {
    await this.boss.send(name, payload, toPgBossSendOptions(opts));
  }
}

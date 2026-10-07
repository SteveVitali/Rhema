// Transactional state transitions (REQ-DATA-33; REQ-RUN-10). Every transition is made ONLY here, inside a
// transaction that also appends the `run.state_changed` event — so state and its event commit or roll back
// together and the UI never infers state from events alone. `applyTransition` runs against a caller-provided
// transaction (the commit path bundles a transition with artifact/step writes into one atomic tx); `transition`
// opens its own tenant-scoped transaction for standalone edges.

import type { EventWriter } from "./event-writer.js";
import type { Clock } from "./clock.js";
import type { SqlClient, TxRunner } from "./tx.js";
import { assertTransition, type RunState, isTerminal, isParked } from "./state-machine.js";

export interface TransitionDeps {
  readonly eventWriter: EventWriter;
  readonly clock: Clock;
}

/** Extra `runs` columns a transition may set atomically (attempt bump on resume, timestamps, failure, …). */
export interface RunFields {
  readonly currentAttempt?: number;
  readonly currentStepId?: string | null;
  readonly startedAt?: Date;
  readonly endedAt?: Date;
  readonly parkedUntil?: Date | null;
  readonly failure?: unknown;
  readonly spentCredits?: number;
  /** RES.2 — `runs.delivery` (migration 0047): the write-once run-level delivery label + its counts,
   *  stamped atomically with `finalizing → completed`. */
  readonly delivery?: unknown;
}

const FIELD_COLUMNS: Record<keyof RunFields, string> = {
  currentAttempt: "current_attempt",
  currentStepId: "current_step_id",
  startedAt: "started_at",
  endedAt: "ended_at",
  parkedUntil: "parked_until",
  failure: "failure",
  spentCredits: "spent_credits",
  delivery: "delivery",
};

export async function readRunState(tx: SqlClient, runId: string): Promise<RunState | null> {
  const res = await tx.query("select state from runs where id = $1", [runId]);
  const row = res.rows[0] as { state: RunState } | undefined;
  return row ? row.state : null;
}

export interface ApplyTransitionArgs {
  readonly runId: string;
  /** the current state; if omitted it is read `for update` inside the tx. */
  readonly from?: RunState;
  readonly to: RunState;
  readonly reason?: string;
  readonly fields?: RunFields;
}

/**
 * Apply one transition inside `tx`: guard it, UPDATE the run row (state + state_since + any extra fields, and
 * ended_at automatically on a terminal state), and append the paired `run.state_changed` event. Returns the
 * `from`/`to` pair. Throws IllegalTransitionError on a disallowed edge (the whole tx then rolls back).
 */
export async function applyTransition(
  tx: SqlClient,
  deps: TransitionDeps,
  args: ApplyTransitionArgs,
): Promise<{ from: RunState; to: RunState }> {
  const now = deps.clock.now();
  const from = args.from ?? (await readRunStateForUpdate(tx, args.runId));
  if (from == null) throw new Error(`run ${args.runId} not found`);
  assertTransition(from, args.to);

  const sets: string[] = ["state = $2", "state_since = $3"];
  const params: unknown[] = [args.runId, args.to, now];
  const fields: { -readonly [K in keyof RunFields]: RunFields[K] } = { ...args.fields };
  // a terminal state stamps ended_at automatically unless the caller set it.
  if (isTerminal(args.to) && fields.endedAt == null) fields.endedAt = now;
  for (const [k, col] of Object.entries(FIELD_COLUMNS)) {
    const v = (fields as Record<string, unknown>)[k];
    if (v !== undefined) {
      params.push(k === "failure" || k === "delivery" ? JSON.stringify(v) : (v as unknown));
      sets.push(`${col} = $${params.length}`);
    }
  }
  // Guarded compare-and-swap (REQ-RUN-10): the UPDATE only fires if the row is STILL in `from`, so two
  // concurrent workers can never both make the same edge (e.g. a double `queued → provisioning` launch). Paths
  // that already hold `for update` are safe too; this makes the from-supplied paths safe without a lock.
  params.push(from);
  const res = await tx.query(
    `update runs set ${sets.join(", ")} where id = $1 and state = $${params.length} returning id`,
    params,
  );
  if ((res.rows as unknown[]).length !== 1) throw new ConcurrentTransitionError(args.runId, from, args.to);

  // release the per-project writer lock at any terminal state (§12.4; REQ-RUN-8/17) — a no-op for readers/persona.
  if (isTerminal(args.to)) {
    await tx.query("update projects set active_writer_run_id = null where active_writer_run_id = $1", [args.runId]);
  }

  await deps.eventWriter.append(tx, {
    runId: args.runId,
    type: "run.state_changed",
    payload: { from, to: args.to, ...(args.reason ? { reason: args.reason } : {}) },
    at: now,
  });
  return { from, to: args.to };
}

/** A guarded transition whose CAS found the row no longer in the expected `from` state (lost update / race). */
export class ConcurrentTransitionError extends Error {
  constructor(
    readonly runId: string,
    readonly from: RunState,
    readonly to: RunState,
  ) {
    super(`concurrent transition: run ${runId} was not in ${from} for ${from}→${to}`);
    this.name = "ConcurrentTransitionError";
  }
}

async function readRunStateForUpdate(tx: SqlClient, runId: string): Promise<RunState | null> {
  const res = await tx.query("select state from runs where id = $1 for update", [runId]);
  const row = res.rows[0] as { state: RunState } | undefined;
  return row ? row.state : null;
}

/** Standalone transition: open a tenant-scoped transaction and apply the edge (+ paired event) atomically. */
export function transition(
  deps: TransitionDeps & { txRunner: TxRunner },
  tenantId: string,
  args: ApplyTransitionArgs,
): Promise<{ from: RunState; to: RunState }> {
  return deps.txRunner.run(tenantId, (tx) => applyTransition(tx, deps, args));
}

export { isTerminal, isParked };

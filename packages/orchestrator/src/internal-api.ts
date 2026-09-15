// The internal run API (§12.4 steps 5–8; REQ-ARCH-11 amended; REQ-RUN-2/15; REQ-DATA-33). Authenticated by
// the run token held by the `harness` uid, single-run, EVERY call carries `attempt` and is rejected with
// `409 stale_task` when `attempt < runs.current_attempt` (fencing — AC2). There is no `POST fetch`: the fetch
// log of record is the proxy's. State transitions are made only here, in a transaction that also appends the
// event (REQ-DATA-33). Artifact materialization/harvest (P0.09), gate resolution (P0.10) and ledger internals
// (P0.11) live behind the interfaces this module calls; this ticket owns the durable lifecycle.

import type { GateKind } from "@rhema/contracts";
import type { Clock } from "./clock.js";
import type { IdFactory } from "./ids.js";
import type { EventWriter } from "./event-writer.js";
import type { HeartbeatStore } from "./heartbeat.js";
import type { HoldLedger } from "./ledger.js";
import type { RunTokenService } from "./token.js";
import type { Queue } from "./queue.js";
import type { SqlClient, TxRunner } from "./tx.js";
import { applyTransition, readRunState, type RunFields } from "./transition.js";
import { isTerminal, type RunState } from "./state-machine.js";
import { revokeRunCredentials } from "./credentials.js";

/** The full DI bundle the internal API + provisioning + reaper + phase loop share. */
export interface OrchestratorDeps {
  readonly txRunner: TxRunner;
  readonly eventWriter: EventWriter;
  readonly clock: Clock;
  readonly ids: IdFactory;
  readonly heartbeats: HeartbeatStore;
  readonly tokens: RunTokenService;
  readonly ledger: HoldLedger;
  readonly queue: Queue;
}

/** A subset sufficient for the transition/gate helpers. */
type MinDeps = Pick<OrchestratorDeps, "eventWriter" | "clock" | "ids">;

/** Rejected internal call from a superseded attempt → `409 stale_task`; the task self-terminates (AC2). */
export class StaleTaskError extends Error {
  readonly httpStatus = 409;
  readonly code = "stale_task";
  constructor(
    readonly runId: string,
    readonly attempt: number,
    readonly currentAttempt: number,
  ) {
    super(`stale_task: attempt ${attempt} < current ${currentAttempt} for run ${runId}`);
    this.name = "StaleTaskError";
  }
}

/** Call carries a token/attempt for a run that has already reached a terminal state (token revoked). */
export class RevokedTokenError extends Error {
  readonly httpStatus = 401;
  readonly code = "revoked";
  constructor(readonly runId: string) {
    super(`token revoked: run ${runId} is terminal`);
    this.name = "RevokedTokenError";
  }
}

interface RunFenceRow {
  readonly state: RunState;
  readonly current_attempt: number;
}

/**
 * Fence a call by attempt (REQ-RUN-15): reject `attempt < current_attempt` with 409, and reject any call once
 * the run is terminal (revocation). Locks the run row `for update` so a concurrent re-enqueue can't slip past.
 */
async function fence(tx: SqlClient, runId: string, attempt: number): Promise<RunFenceRow> {
  const res = await tx.query("select state, current_attempt from runs where id = $1 for update", [runId]);
  const row = res.rows[0] as RunFenceRow | undefined;
  if (!row) throw new Error(`run ${runId} not found`);
  if (isTerminal(row.state)) throw new RevokedTokenError(runId);
  if (attempt < row.current_attempt) throw new StaleTaskError(runId, attempt, row.current_attempt);
  return row;
}

// ---------------------------------------------------------------------------- gates

export interface OpenGateArgs {
  readonly runId: string;
  readonly kind: GateKind;
  readonly blocking: boolean;
  readonly onExpiry: string;
  readonly stepId?: string;
  readonly artifactVersionId?: string;
  readonly deadlineAt?: Date | null;
}

/**
 * Open a gate (§6.4; REQ-GATE-1) inside `tx`: insert the durable gate row and append the paired `gate.opened`
 * event. This ticket OPENS gates and exits the task; gate RESOLUTION (decision write, overlay serialization,
 * expiry scheduling) is P0.10 — only the `gate:<id>` job TYPE is registered (queue.ts). Returns the gate id.
 */
export async function openGate(tx: SqlClient, deps: MinDeps, args: OpenGateArgs): Promise<string> {
  const now = deps.clock.now();
  const gateId = deps.ids("gate");
  await tx.query(
    `insert into gates(id, run_id, step_id, kind, opened_at, deadline_at, blocking, on_expiry, held,
       paused_while_reading)
     values ($1,$2,$3,$4,$5,$6,$7,$8,false,false)`,
    [gateId, args.runId, args.stepId ?? null, args.kind, now, args.deadlineAt ?? null, args.blocking, args.onExpiry],
  );
  await deps.eventWriter.append(tx, {
    runId: args.runId,
    type: "gate.opened",
    payload: {
      kind: args.kind,
      ...(args.artifactVersionId ? { artifactVersionId: args.artifactVersionId } : {}),
      deadlineAt: args.deadlineAt ? args.deadlineAt.toISOString() : null,
    },
    at: now,
  });
  return gateId;
}

// ---------------------------------------------------------------------------- heartbeat

export interface HeartbeatArgs {
  readonly runId: string;
  readonly attempt: number;
  readonly workspaceId: string;
}
export interface HeartbeatResponse {
  readonly ok: true;
  readonly cancelRequested: boolean;
  /** a freshly-minted token (refresh on heartbeat, §12.4). */
  readonly token: string;
  readonly state: RunState;
}

/**
 * `PUT /internal/runs/:id/heartbeat` — fence, take `provisioning → running` on the first beat, SETEX the
 * heartbeat, return `cancelRequested` and a refreshed token (§12.4 steps 4–5).
 */
export async function heartbeat(deps: OrchestratorDeps, args: HeartbeatArgs): Promise<HeartbeatResponse> {
  const { state } = await deps.txRunner.run(args.workspaceId, async (tx) => {
    const row = await fence(tx, args.runId, args.attempt);
    if (row.state === "provisioning") {
      await applyTransition(tx, deps, {
        runId: args.runId,
        from: "provisioning",
        to: "running",
        fields: { startedAt: deps.clock.now() },
      });
      return { state: "running" as RunState };
    }
    return { state: row.state };
  });

  const prior = await deps.heartbeats.get(args.runId);
  await deps.heartbeats.beat({
    runId: args.runId,
    attempt: args.attempt,
    workspaceId: args.workspaceId,
    at: deps.clock.now(),
  });
  const cancelRequested = prior?.cancelRequested ?? state === "cancelling";
  const token = deps.tokens.mint({ runId: args.runId, attempt: args.attempt, workspaceId: args.workspaceId, seat: "harness" });
  return { ok: true, cancelRequested, token, state };
}

// ---------------------------------------------------------------------------- events

export interface EventBatchItem {
  readonly type: Parameters<EventWriter["append"]>[1]["type"];
  readonly payload: unknown;
  readonly agentLabel?: string;
}

/**
 * `POST /internal/runs/:id/events` — fence, then append the batch (≤250) atomically. Every event pairs with
 * the run's durable history; payloads are validated at the write boundary (event-writer). Returns the last seq.
 */
export async function postEvents(
  deps: OrchestratorDeps,
  args: { runId: string; attempt: number; workspaceId: string; events: readonly EventBatchItem[] },
): Promise<{ ok: true; lastSeq: number }> {
  return deps.txRunner.run(args.workspaceId, async (tx) => {
    await fence(tx, args.runId, args.attempt);
    let lastSeq = 0;
    const now = deps.clock.now();
    for (const ev of args.events) {
      const appended = await deps.eventWriter.append(tx, {
        runId: args.runId,
        type: ev.type,
        payload: ev.payload,
        at: now,
        agentLabel: ev.agentLabel,
      });
      lastSeq = appended.seq;
    }
    return { ok: true, lastSeq };
  });
}

// ---------------------------------------------------------------------------- audit

export interface AuditRows {
  readonly access?: ReadonlyArray<{ ts: Date; agentLabel: string; tool: string; path: string; namespace?: string; decision: string }>;
  readonly fetch?: ReadonlyArray<{
    ts: Date;
    agentLabel: string;
    kind: string;
    query?: string;
    url?: string;
    normalizedUrl?: string;
    status?: number;
    bytes?: number;
    decision: string;
    denyReason?: string;
  }>;
}

/**
 * `POST /internal/runs/:id/audit` — the buffered `access_log` / `fetch_log` rows the harness ships (the
 * SECONDARY "attempts" record; the trust chip rests on server-side facts, §12.6). Fenced; append-only.
 */
export async function audit(
  deps: OrchestratorDeps,
  args: { runId: string; attempt: number; workspaceId: string; rows: AuditRows },
): Promise<{ ok: true; written: number }> {
  return deps.txRunner.run(args.workspaceId, async (tx) => {
    await fence(tx, args.runId, args.attempt);
    let written = 0;
    for (const r of args.rows.access ?? []) {
      await tx.query(
        `insert into access_log(run_id, ts, agent_label, tool, path, namespace, decision)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [args.runId, r.ts, r.agentLabel, r.tool, r.path, r.namespace ?? null, r.decision],
      );
      written++;
    }
    for (const r of args.rows.fetch ?? []) {
      await tx.query(
        `insert into fetch_log(run_id, ts, agent_label, kind, query, url, normalized_url, status, bytes,
           decision, deny_reason, attempt)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          args.runId,
          r.ts,
          r.agentLabel,
          r.kind,
          r.query ?? null,
          r.url ?? null,
          r.normalizedUrl ?? null,
          r.status ?? null,
          r.bytes ?? null,
          r.decision,
          r.denyReason ?? null,
          args.attempt,
        ],
      );
      written++;
    }
    return { ok: true, written };
  });
}

// ---------------------------------------------------------------------------- hydration

export interface HydrationResponse {
  readonly runId: string;
  readonly attempt: number;
  readonly seat: string;
  readonly workflow: string;
  readonly projectId: string | null;
  readonly personaId: string | null;
  readonly inputs: Record<string, unknown>;
  /** overlay versions serialized from gate decisions (P0.10 populates on resume); [] on the first attempt. */
  readonly overlays: string[];
}

/**
 * `GET /internal/runs/:id/hydration` — the descriptor the harness materializes `/work` from (§11.5). Fenced.
 * The S3 materialization of paths is P0.09's harvest/mirror; this returns the run's frozen inputs + seat so the
 * harness knows what to hydrate. `overlays[]` is filled by P0.10 on resume from gate decisions.
 */
export async function hydration(
  deps: OrchestratorDeps,
  args: { runId: string; attempt: number; workspaceId: string },
): Promise<HydrationResponse> {
  return deps.txRunner.run(args.workspaceId, async (tx) => {
    await fence(tx, args.runId, args.attempt);
    const res = await tx.query(
      `select r.workflow, r.project_id, r.persona_id, r.inputs, ai.type_key as seat
         from runs r left join agent_instances ai on ai.id = r.agent_instance_id
        where r.id = $1`,
      [args.runId],
    );
    const row = res.rows[0] as {
      workflow: string;
      project_id: string | null;
      persona_id: string | null;
      inputs: Record<string, unknown> | string;
      seat: string | null;
    };
    const inputs = typeof row.inputs === "string" ? (JSON.parse(row.inputs) as Record<string, unknown>) : row.inputs;
    return {
      runId: args.runId,
      attempt: args.attempt,
      seat: row.seat ?? "editor",
      workflow: row.workflow,
      projectId: row.project_id,
      personaId: row.persona_id,
      inputs,
      overlays: [],
    };
  });
}

// ---------------------------------------------------------------------------- commit / fail / finalize

/** Where the run goes after a committed step (decided by the phase loop's completion oracle). */
export type CommitNext =
  | { readonly kind: "advance" } //    running → running (self-edge); the task runs the next phase
  | { readonly kind: "gate"; readonly gateKind: GateKind; readonly blocking: boolean; readonly onExpiry: string; readonly deadlineAt?: Date | null; readonly artifactVersionId?: string }
  | { readonly kind: "finalize" }; //  final phase committed → finalizing

export interface CommitStepArgs {
  readonly runId: string;
  readonly attempt: number;
  readonly workspaceId: string;
  readonly stepKey: string;
  readonly ordinal: number;
  readonly of: number;
  readonly producedVersionIds?: readonly string[];
  readonly credits: number;
  readonly durationMs?: number;
  readonly result: { status: "done"; sdkSubtype: string; predicatesPassed: boolean; compactions: number };
  readonly next: CommitNext;
}

export type CommitStepResult =
  | { readonly ok: true; readonly idempotent: boolean; readonly state: RunState; readonly gateId?: string }
  | { readonly ok: false; readonly code: "stale_task"; readonly currentAttempt: number };

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * `POST /internal/runs/:id/steps/:key/commit` (REQ-RUN-2). Idempotent on `(run_id, step_key, attempt)`. In one
 * atomic transaction: upsert the step row, append `step.finished`, and take the next transition — advance
 * (self-edge, current_step_id set), open a gate + `running → waiting_gate` (task exits, writer lock held,
 * parked ≤30 days), or `running → finalizing`. Reconciliation-against-metered-rows and artifact materialization
 * are the ledger's / P0.09's; this owns the durable step + state write.
 */
export async function commitStep(deps: OrchestratorDeps, args: CommitStepArgs): Promise<CommitStepResult> {
  try {
    return await deps.txRunner.run(args.workspaceId, async (tx) => {
      await fence(tx, args.runId, args.attempt);

      // idempotency on (run_id, step_key, attempt): a replay of an already-committed step is a no-op.
      const prior = await tx.query(
        "select state from steps where run_id = $1 and phase = $2 and attempt = $3",
        [args.runId, args.stepKey, args.attempt],
      );
      const priorRow = prior.rows[0] as { state: string } | undefined;
      if (priorRow?.state === "done") {
        const state = (await readRunState(tx, args.runId))!;
        return { ok: true, idempotent: true, state };
      }

      const now = deps.clock.now();
      const stepId = deps.ids("step");
      await tx.query(
        `insert into steps(id, run_id, phase, ordinal, state, attempt, produced_version_ids, started_at,
           ended_at, credits, result)
         values ($1,$2,$3,$4,'done',$5,$6,$7,$7,$8,$9)
         on conflict (run_id, ordinal) do update set
           state='done', attempt=excluded.attempt, produced_version_ids=excluded.produced_version_ids,
           ended_at=excluded.ended_at, credits=excluded.credits, result=excluded.result`,
        [
          stepId,
          args.runId,
          args.stepKey,
          args.ordinal,
          args.attempt,
          (args.producedVersionIds ?? []) as string[],
          now,
          args.credits,
          JSON.stringify(args.result),
        ],
      );

      await deps.eventWriter.append(tx, {
        runId: args.runId,
        type: "step.finished",
        payload: {
          phase: args.stepKey,
          ordinal: args.ordinal,
          of: args.of,
          credits: args.credits,
          ...(args.durationMs != null ? { durationMs: args.durationMs } : {}),
        },
        at: now,
      });

      // accumulate the step's credits into the run's running spend; a committed phase resets the reaper's
      // re-enqueue budget (≤2 re-enqueues are PER STEP).
      await tx.query(
        "update runs set spent_credits = spent_credits + $2, current_step_id = $3, resume_count = 0 where id = $1",
        [args.runId, args.credits, stepId],
      );

      // debit per committed step (REQ-DATA-34), coupling into the ledger inside the commit tx. `args.credits`
      // is the step's reconciled cost (from the proxy's metered rows); P0.11's `debit` enforces min(actual,
      // cap − Σ) under the run-row lock. idempotent on (run, step, attempt) via the ledger's idempotency key.
      if (args.credits > 0) {
        const ba = (
          await tx.query("select w.billing_account_id from runs r join workspaces w on w.id=r.workspace_id where r.id=$1", [
            args.runId,
          ])
        ).rows[0] as { billing_account_id: string };
        await deps.ledger.debit(tx, {
          billingAccountId: ba.billing_account_id,
          workspaceId: args.workspaceId,
          runId: args.runId,
          phaseId: stepId,
          credits: args.credits,
          idempotencyKey: `debit:${args.runId}:${args.stepKey}:${args.attempt}`,
        });
      }

      if (args.next.kind === "advance") {
        const state = (await readRunState(tx, args.runId))!; // stays running (self-edge, no state row change)
        return { ok: true, idempotent: false, state };
      }
      if (args.next.kind === "finalize") {
        await applyTransition(tx, deps, { runId: args.runId, from: "running", to: "finalizing" });
        return { ok: true, idempotent: false, state: "finalizing" };
      }
      // gate: open it inside the commit tx, transition to waiting_gate, park ≤30 days; the task then exits.
      const parkFields: RunFields = { parkedUntil: new Date(now.getTime() + THIRTY_DAYS_MS) };
      await applyTransition(tx, deps, { runId: args.runId, from: "running", to: "waiting_gate", fields: parkFields });
      const gateId = await openGate(tx, deps, {
        runId: args.runId,
        kind: args.next.gateKind,
        blocking: args.next.blocking,
        onExpiry: args.next.onExpiry,
        stepId,
        artifactVersionId: args.next.artifactVersionId,
        deadlineAt: args.next.deadlineAt,
      });
      return { ok: true, idempotent: false, state: "waiting_gate", gateId };
    });
  } catch (e) {
    if (e instanceof StaleTaskError) return { ok: false, code: "stale_task", currentAttempt: e.currentAttempt };
    throw e;
  }
}

/**
 * `POST /internal/runs/:id/steps/:key/fail` — record a step failure. The error-class decision (retry / gate /
 * quarantine) is the phase loop's; this endpoint marks the step failed and fences by attempt.
 */
export async function failStep(
  deps: OrchestratorDeps,
  args: { runId: string; attempt: number; workspaceId: string; stepKey: string; ordinal: number; errorClass: string; reason?: string },
): Promise<{ ok: true } | { ok: false; code: "stale_task"; currentAttempt: number }> {
  try {
    return await deps.txRunner.run(args.workspaceId, async (tx) => {
      await fence(tx, args.runId, args.attempt);
      const now = deps.clock.now();
      const stepId = deps.ids("step");
      await tx.query(
        `insert into steps(id, run_id, phase, ordinal, state, attempt, started_at, ended_at, result)
         values ($1,$2,$3,$4,'failed',$5,$6,$6,$7)
         on conflict (run_id, ordinal) do update set state='failed', attempt=excluded.attempt,
           ended_at=excluded.ended_at, result=excluded.result`,
        [stepId, args.runId, args.stepKey, args.ordinal, args.attempt, now, JSON.stringify({ errorClass: args.errorClass, reason: args.reason })],
      );
      return { ok: true };
    });
  } catch (e) {
    if (e instanceof StaleTaskError) return { ok: false, code: "stale_task", currentAttempt: e.currentAttempt };
    throw e;
  }
}

/**
 * Finalize a run (§12.4 step 8): `finalizing → completed`, release the unused hold, clear the heartbeat and
 * emit `cost.final`. The delivery transaction's artifact promotion is P0.09's; a delivery-validation failure is
 * `finalizing → failed` via `failRun`. Debit is a separate retried ledger transaction (P0.11) — coupled here.
 */
export async function finalizeRun(
  deps: OrchestratorDeps,
  args: { runId: string; workspaceId: string; billingAccountId: string; holdLedgerId?: string; spentCredits: number; capCredits: number; byPhase?: Record<string, number> },
): Promise<{ ok: true; state: RunState }> {
  await deps.txRunner.run(args.workspaceId, async (tx) => {
    await applyTransition(tx, deps, { runId: args.runId, from: "finalizing", to: "completed" });
    if (args.holdLedgerId) {
      await deps.ledger.release(tx, {
        billingAccountId: args.billingAccountId,
        workspaceId: args.workspaceId,
        runId: args.runId,
        holdLedgerId: args.holdLedgerId,
        idempotencyKey: `release:${args.runId}`,
      });
    }
    await deps.eventWriter.append(tx, {
      runId: args.runId,
      type: "cost.final",
      payload: {
        spentCredits: args.spentCredits,
        capCredits: args.capCredits,
        ...(args.byPhase ? { byPhase: args.byPhase } : {}),
      },
      at: deps.clock.now(),
    });
    await revokeRunCredentials(tx, args.runId, deps.clock.now()); // terminal revocation (REQ-SPEC-11)
  });
  await deps.heartbeats.clear(args.runId);
  // the run token is revoked implicitly: a terminal state rejects every further internal call (see `fence`).
  return { ok: true, state: "completed" };
}

/** Terminal failure with a refund of debits (§12.4 step 9): from `running`/`provisioning`/`finalizing` → failed. */
export async function failRun(
  deps: OrchestratorDeps,
  args: { runId: string; workspaceId: string; billingAccountId: string; from: RunState; failure: { code: string; message: string; retryable: boolean }; refundCredits?: number; holdLedgerId?: string },
): Promise<{ ok: true; state: RunState }> {
  await deps.txRunner.run(args.workspaceId, async (tx) => {
    await applyTransition(tx, deps, {
      runId: args.runId,
      from: args.from,
      to: "failed",
      reason: args.failure.code,
      fields: { failure: args.failure },
    });
    // refund debits before any delivery (REQ-DATA-34); release the unused hold.
    if (args.refundCredits && args.refundCredits > 0) {
      await deps.ledger.refund(tx, {
        billingAccountId: args.billingAccountId,
        workspaceId: args.workspaceId,
        runId: args.runId,
        credits: args.refundCredits,
        idempotencyKey: `refund:${args.runId}`,
      });
    }
    if (args.holdLedgerId) {
      await deps.ledger.release(tx, {
        billingAccountId: args.billingAccountId,
        workspaceId: args.workspaceId,
        runId: args.runId,
        holdLedgerId: args.holdLedgerId,
        idempotencyKey: `release:${args.runId}`,
      });
    }
    await revokeRunCredentials(tx, args.runId, deps.clock.now()); // terminal revocation (REQ-SPEC-11)
  });
  await deps.heartbeats.clear(args.runId);
  return { ok: true, state: "failed" };
}

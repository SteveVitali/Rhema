// The run-lifecycle pg-boss consumers (§12.1 "worker owns run.start/resume/cancel/reap"; §12.4). Thin handlers
// over @rhema/orchestrator: they load the run row, author its allowlist, and delegate provisioning / reaping /
// cancellation to the tested package. Live pg-boss registration (a PgBoss instance + `.work(queue, handler)`)
// is wired at deploy; these handlers are the payload → orchestrator mapping, deterministically testable.

import type { ModelTier } from "@rhema/contracts";
import {
  provisionRun,
  reap,
  authorRunAllowlist,
  seatForWorkflow,
  applyTransition,
  revokeRunCredentials,
  gateExpiryJob,
  type OrchestratorDeps,
  type JobLauncher,
  type ProvisionResult,
  type ReapOutcome,
  type RunState,
  type SqlClient,
} from "@rhema/orchestrator";
import type { WorkflowKey } from "@rhema/contracts";

/** Static config a deploy supplies (the pinned image, the run service account, the provider). */
export interface WorkerRunConfig {
  readonly imageDigest: string;
  readonly serviceAccount: string;
  readonly provider: string;
  /** the account's plan-concurrency limit (from its subscription tier). */
  concurrencyFor(billingAccountId: string): number | Promise<number>;
}

export interface WorkerRunDeps extends OrchestratorDeps {
  readonly launcher: JobLauncher;
  readonly config: WorkerRunConfig;
}

export interface RunJobPayload {
  readonly runId: string;
  readonly workspaceId: string;
}

interface RunRow {
  workflow: string;
  project_id: string | null;
  persona_id: string | null;
  model_tier: string;
  rate_table_version: number;
  cap_credits: number;
  hold_ledger_id: string | null;
  state: string;
  seat: string | null;
  billing_account_id: string;
}

async function loadRun(deps: WorkerRunDeps, workspaceId: string, runId: string): Promise<RunRow> {
  return deps.txRunner.run(workspaceId, async (tx: SqlClient) => {
    const res = await tx.query(
      `select r.workflow, r.project_id, r.persona_id, r.model_tier, r.rate_table_version, r.cap_credits,
              r.hold_ledger_id, r.state, ai.type_key as seat, w.billing_account_id
         from runs r
         join workspaces w on w.id = r.workspace_id
         left join agent_instances ai on ai.id = r.agent_instance_id
        where r.id = $1`,
      [runId],
    );
    if (res.rows.length === 0) throw new Error(`run ${runId} not found`);
    return res.rows[0] as RunRow;
  });
}

/** `run.start` — provision a queued run (mint token/credential/allowlist, launch the Job). */
export async function handleRunStart(deps: WorkerRunDeps, job: RunJobPayload): Promise<ProvisionResult> {
  const run = await loadRun(deps, job.workspaceId, job.runId);
  const workflow = run.workflow as WorkflowKey;
  const seat = run.seat ?? seatForWorkflow(workflow);
  const allowlist = authorRunAllowlist({ modelTier: run.model_tier as ModelTier });
  return provisionRun(deps, deps.launcher, {
    runId: job.runId,
    workspaceId: job.workspaceId,
    billingAccountId: run.billing_account_id,
    workflow,
    projectId: run.project_id ?? undefined,
    personaId: run.persona_id ?? undefined,
    concurrencyLimit: await deps.config.concurrencyFor(run.billing_account_id),
    seat,
    role: seat,
    imageDigest: deps.config.imageDigest,
    serviceAccount: deps.config.serviceAccount,
    modelTier: run.model_tier,
    provider: deps.config.provider,
    rateTableVersion: run.rate_table_version,
    capCredits: run.cap_credits,
    allowlist,
  });
}

/** `run.resume` — a resume launches a fresh task with the bumped attempt; identical provisioning path. */
export function handleRunResume(deps: WorkerRunDeps, job: RunJobPayload): Promise<ProvisionResult> {
  return handleRunStart(deps, job);
}

/** `run.reap` (cron, 1 min) — orphan stale runs and re-enqueue / open resume_partial. */
export function handleRunReap(deps: WorkerRunDeps): Promise<ReapOutcome[]> {
  return reap(deps);
}

export interface CancelResult {
  readonly runId: string;
  readonly state: string;
}

interface CancelRow {
  state: string;
  hold_ledger_id: string | null;
  billing_account_id: string;
}

/** Release the unused hold + revoke the credential inside a terminal (cancelled) transaction. */
async function settleTerminal(
  deps: WorkerRunDeps,
  tx: SqlClient,
  args: { runId: string; workspaceId: string; billingAccountId: string; holdLedgerId: string | null },
): Promise<void> {
  if (args.holdLedgerId) {
    await deps.ledger.release(tx, {
      billingAccountId: args.billingAccountId,
      workspaceId: args.workspaceId,
      runId: args.runId,
      holdLedgerId: args.holdLedgerId,
      idempotencyKey: `release:${args.runId}`,
    });
  }
  await revokeRunCredentials(tx, args.runId, deps.clock.now());
}

/**
 * `run.cancel` — Stop. A running run is quiesced (`running → cancelling`; the next heartbeat returns the flag
 * and the task aborts; `cancelling → cancelled` is then completed by the task's ack or the reaper via
 * `completeCancellation`). A parked/queued run cancels DIRECTLY, releasing the hold + credential. The writer
 * lock is cleared automatically at the terminal transition (transition.ts). Gate expiry is P0.10's.
 */
export async function handleRunCancel(deps: WorkerRunDeps, job: RunJobPayload): Promise<CancelResult> {
  const state = await deps.txRunner.run(job.workspaceId, async (tx) => {
    const res = await tx.query(
      `select r.state, r.hold_ledger_id, w.billing_account_id
         from runs r join workspaces w on w.id = r.workspace_id where r.id = $1 for update`,
      [job.runId],
    );
    const row = res.rows[0] as CancelRow | undefined;
    if (!row) throw new Error(`run ${job.runId} not found`);
    const cur = row.state as RunState;

    if (cur === "running") {
      await applyTransition(tx, deps, { runId: job.runId, from: "running", to: "cancelling", reason: "stop" });
      return "cancelling";
    }
    // a parked/queued/provisioning run has no in-flight phase: cancel directly + settle.
    if (cur === "queued" || cur === "provisioning" || cur === "waiting_gate" || cur === "awaiting_consent") {
      const reason = cur === "awaiting_consent" ? "declined" : "stop";
      await applyTransition(tx, deps, { runId: job.runId, from: cur, to: "cancelled", reason });
      await settleTerminal(deps, tx, { runId: job.runId, workspaceId: job.workspaceId, billingAccountId: row.billing_account_id, holdLedgerId: row.hold_ledger_id });
      return "cancelled";
    }
    return cur; // terminal or already cancelling — idempotent no-op
  });

  if (state === "cancelling") {
    await deps.heartbeats.requestCancel(job.runId); // the next heartbeat returns cancel_requested (§12.4)
  }
  if (state === "cancelled") await deps.heartbeats.clear(job.runId);
  return { runId: job.runId, state };
}

/**
 * Complete a cancellation: `cancelling → cancelled`, keeping partials, releasing the hold + credential + writer
 * lock. Called when the task acknowledges the cancel (a reduced commit — P0.09) or by the reaper when a
 * cancelling run's heartbeat has stopped. Idempotent: a run already cancelled is a no-op.
 */
export async function completeCancellation(deps: WorkerRunDeps, job: RunJobPayload): Promise<CancelResult> {
  const state = await deps.txRunner.run(job.workspaceId, async (tx) => {
    const res = await tx.query(
      `select r.state, r.hold_ledger_id, w.billing_account_id
         from runs r join workspaces w on w.id = r.workspace_id where r.id = $1 for update`,
      [job.runId],
    );
    const row = res.rows[0] as CancelRow | undefined;
    if (!row) throw new Error(`run ${job.runId} not found`);
    if (row.state !== "cancelling") return row.state; // already settled / not cancelling
    await applyTransition(tx, deps, { runId: job.runId, from: "cancelling", to: "cancelled", reason: "stop" });
    await settleTerminal(deps, tx, { runId: job.runId, workspaceId: job.workspaceId, billingAccountId: row.billing_account_id, holdLedgerId: row.hold_ledger_id });
    return "cancelled";
  });
  if (state === "cancelled") await deps.heartbeats.clear(job.runId);
  return { runId: job.runId, state };
}

/** The `gate:<id>` expiry job TYPE name (this ticket registers the type only; P0.10 owns the handler). */
export { gateExpiryJob };

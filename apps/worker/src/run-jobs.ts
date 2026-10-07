// The run-lifecycle pg-boss consumers (§12.1 "worker owns run.start/resume/cancel/reap"; §12.4). Thin handlers
// over @rhema/orchestrator: they load the run row, author its allowlist, and delegate provisioning / reaping /
// cancellation to the tested package. Live pg-boss registration (a PgBoss instance + `.work(queue, handler)`)
// is wired at deploy; these handlers are the payload → orchestrator mapping, deterministically testable.

import type { ModelTier } from "@rhema/contracts";
import {
  provisionRun,
  reap,
  authorRunAllowlist,
  authorWebToolPolicy,
  authorAssistantWebToolPolicy,
  urlPolicyFromInputs,
  userSourceGuardText,
  seatForWorkflow,
  applyTransition,
  revokeRunCredentials,
  reconcileRunSpend,
  gateExpiryJob,
  handleGateExpiry,
  sweepStrandedRuns,
  generateWalkthrough,
  finalizeRun,
  figureRenderJob,
  type FigureRenderOutcome,
  type GenerateWalkthroughResult,
  type WalkthroughGenerator,
  type OrchestratorDeps,
  type JobLauncher,
  type ProvisionResult,
  type ReapOutcome,
  type StrandedSweepOutcome,
  type GateExpiryOutcome,
  type RunState,
  type SqlClient,
} from "@rhema/orchestrator";
import type { WorkflowKey } from "@rhema/contracts";
import type { ContentStore } from "@rhema/mirror";
import { provisionalClaimCount } from "@rhema/run-sheet";

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
  /**
   * A system-scoped SqlClient for the stranded-run sweep's cross-tenant `runs`/`gates` scan (PRB.14 —
   * D-P0.08-4/D-P0.10-2), bound like the parked sweep's (`systemDatabaseUrl` when set, else the main
   * pool — see main.ts).
   */
  readonly systemExec: SqlClient;
  /**
   * P1.12 — the workspace-bound content store `run.finalize` needs for the Approve-outline
   * consequences (the assistant→author research-note copies read version bytes). Same seam shape
   * as `WorkerBillingDeps.contentStoreFor`.
   */
  readonly contentStoreFor?: (workspaceId: string) => Promise<ContentStore>;
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
  /** RES.2 — the JOURNEY.1 test-tenant flag; the ONLY thing `inputs.force_unverified` may key on. */
  is_test: boolean;
  /** the frozen input snapshot ({wordCount, claimCount?, …}) — drives the research bound (PRB.22). */
  input_snapshot: { wordCount?: number; claimCount?: number } | null;
  /** the run's FROZEN inputs — the assistant workflows' consented budget/sources + URL policy (P1.11). */
  inputs: Record<string, unknown> | null;
}

async function loadRun(deps: WorkerRunDeps, workspaceId: string, runId: string): Promise<RunRow> {
  return deps.txRunner.run(workspaceId, async (tx: SqlClient) => {
    const res = await tx.query(
      `select r.workflow, r.project_id, r.persona_id, r.model_tier, r.rate_table_version, r.cap_credits,
              r.hold_ledger_id, r.state, r.input_snapshot, r.inputs, ai.type_key as seat,
              w.billing_account_id, w.is_test
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
  // P1.11 — the run's URL policy rides its FROZEN inputs (the plan card's consented policy, frozen at
  // creation); provision maps it into the proxy allowlist so every fetch honors it (§7.1/§12.8d).
  const allowlist = authorRunAllowlist({
    modelTier: run.model_tier as ModelTier,
    ...urlPolicyFromInputs(run.inputs),
  });
  // PRB.22 — the run's web-research bound: the snapshot's refined claimCount, else the same
  // density-derived provisional count the estimate used, so the bound and the price agree.
  // P1.11 — the Assistant workflows bound on their own contract instead: chat_turn carries the §7.1
  // per-turn caps (consented-shrunk via inputs.budget); research_burst caps fetches at the plan card's
  // source count. Neither has a claim count to scale on.
  const snap = run.input_snapshot ?? {};
  const rawClaims =
    typeof snap.claimCount === "number" ? snap.claimCount : provisionalClaimCount(workflow, snap.wordCount);
  // ECON.1 (§6.5; ADR-033) — the rigor's frozen claim cap bounds the claim-scaled web budgets even if a
  // client-supplied snapshot out-counts it (Quick Review: five load-bearing claims ⇒ five claims' budgets).
  const claims =
    typeof run.inputs?.claim_cap === "number" && rawClaims != null
      ? Math.min(rawClaims, run.inputs.claim_cap)
      : rawClaims;
  // RES.2 (REQ-SPEC-31(3); ADR-026) — `inputs.force_unverified` forces a zero-coverage Review for the
  // JOURNEY.1 Stage-B walk. It is honored ONLY on a flagged test workspace (`workspaces.is_test`,
  // migration 0046): a production run's frozen input can never reach this branch, and even there the
  // flag only zeroes the research budgets — RES.1's preflight still runs first (the proxy admits a
  // `preflight`-stamped probe past the bound), so the run must genuinely reach verification before the
  // delivered coverage reads zero. Unreachable for non-test tenants by construction.
  const forceUnverified = run.is_test === true && run.inputs?.force_unverified === true;
  const webTools = forceUnverified
    ? { search: true, fetch: true, searchBudget: 0, fetchBudget: 0, searchFloor: 0, fetchFloor: 0 }
    : authorAssistantWebToolPolicy({ workflow, inputs: run.inputs ?? {} }) ??
      authorWebToolPolicy({ ...(claims != null ? { claims } : {}) });
  // P1.21 (REQ-WF-8/§16.4) — a Memo run's `user_sources[]` text rides the credential context as
  // `draftText`: the proxy's n-gram guard diffs every search query against it, so internal figures
  // cannot leak inside a query (the fetch-side deny is the frozen `urlPolicy.userSourceDomains`).
  const draftText = userSourceGuardText(run.inputs?.user_sources);
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
    webTools,
    ...(draftText ? { draftText } : {}),
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

/**
 * The stranded-run sweep (PRB.14 — D-P0.08-4/D-P0.10-2), run on the same 1-min `run.reap` cron: fails
 * `provisioning` runs past the launch SLO (hold + credential + writer lock released on the terminal edge),
 * re-sends the launch job for `queued` runs whose post-commit send was lost (singleton-keyed — a still-live
 * job dedupes), and re-arms a parked run's unresolved gate expiry (a stranded confirm_cost then cancels and
 * releases its hold). See `stranded-sweep.ts` in @rhema/orchestrator for the scan semantics.
 */
export function handleStrandedSweep(deps: WorkerRunDeps): Promise<StrandedSweepOutcome[]> {
  return sweepStrandedRuns(deps);
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
  // PRB.16b: reconcile spent_credits from the usage rows of record — a mid-phase cancel committed
  // no step, so the accumulated figure misses the in-flight spend the proxy already metered.
  await reconcileRunSpend(tx, args.runId);
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

/**
 * `run.walkthrough` (P1.05; §5.5 D20) — the lazy one-call walkthrough generator. `deps.walkthrough` is the
 * deploy-bound model seam (a preview stage without the key marks attempts `failed`; the card's Retry and
 * the self-healing next-render enqueue cover it).
 */
export function handleRunWalkthrough(
  deps: OrchestratorDeps & { readonly walkthrough: WalkthroughGenerator },
  job: RunJobPayload,
): Promise<GenerateWalkthroughResult> {
  return generateWalkthrough(deps, job);
}

/**
 * `run.finalize` (P1.12) — the last-phase-gate finalize: `approve_outline` resolves on the Outline
 * workflow's LAST phase, which enters `finalizing` and enqueues this job (no pod ever resumes). The
 * handler settles the run exactly like the pod's bare `/finalize` call — money facts from the run row,
 * then `finalizeRun` — with the workspace content store bound so the Approve-outline consequences
 * (assistant→author research-note copies + `outline.approved`) apply inside the same transaction.
 * Idempotent: a run no longer `finalizing` (a retried delivery after a completed settle) no-ops.
 */
export async function handleRunFinalize(
  deps: WorkerRunDeps,
  job: RunJobPayload,
): Promise<{ ok: boolean; state?: string; reason?: string }> {
  const row = await deps.txRunner.run(job.workspaceId, async (tx) => {
    const res = await tx.query(
      `select r.state, r.spent_credits, r.cap_credits, r.hold_ledger_id, w.billing_account_id
         from runs r join workspaces w on w.id = r.workspace_id where r.id = $1`,
      [job.runId],
    );
    return res.rows[0] as
      | {
          state: string;
          spent_credits: number;
          cap_credits: number;
          hold_ledger_id: string | null;
          billing_account_id: string;
        }
      | undefined;
  });
  if (!row) return { ok: false, reason: "run not found" };
  if (row.state !== "finalizing") return { ok: true, state: row.state, reason: "not_finalizing" };
  const store = deps.contentStoreFor ? await deps.contentStoreFor(job.workspaceId) : undefined;
  const res = await finalizeRun(deps, {
    runId: job.runId,
    workspaceId: job.workspaceId,
    billingAccountId: row.billing_account_id,
    spentCredits: row.spent_credits,
    capCredits: row.cap_credits,
    ...(row.hold_ledger_id ? { holdLedgerId: row.hold_ledger_id } : {}),
    ...(store ? { store } : {}),
  });
  return { ok: true, state: res.state };
}

/**
 * `figure.render` (P1.13; §12.1; REQ-VIZ-6/7/8) — the deterministic server-side render the render
 * step's commit enqueued. The workspace-bound content store rides `contentStoreFor` (same seam as
 * `run.finalize`); an unconfigured store skips rather than throws — a render job retrying forever
 * on a deploy that can't render would burn the queue for nothing.
 */
export async function handleFigureRender(
  deps: WorkerRunDeps,
  job: { figureId: string; runId: string; workspaceId: string },
): Promise<FigureRenderOutcome> {
  const store = deps.contentStoreFor ? await deps.contentStoreFor(job.workspaceId) : undefined;
  if (!store) return { ok: false, reason: "no content store bound" };
  return figureRenderJob({ ...deps, store }, job);
}

/**
 * Gate-expiry job handler (§6.4 item 6/7; P0.10). The live worker's `gate.expiry` consumer maps the job
 * payload → this handler; the deadline re-read, conditional resolve, reschedule, and onExpiry transition
 * all live in @rhema/orchestrator. The payload carries the gate id + workspace.
 */
export function handleGateExpiryJob(deps: OrchestratorDeps, job: { gateId: string; workspaceId: string }): Promise<GateExpiryOutcome> {
  return handleGateExpiry(deps, job);
}

/** The gate-expiry job TYPE name (P0.08 registered the type; P0.10 owns the handler above). */
export { gateExpiryJob };

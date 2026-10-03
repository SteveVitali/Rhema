// Provisioning (§12.4 steps 3–4; REQ-SPEC-10/11; REQ-ARCH-11; REQ-RUN-17). At `queued → provisioning` the
// orchestrator: admits the run against the lock set + the per-project writer lock + plan concurrency; mints a
// run token (carrying `attempt`) and a per-run proxy credential bound to an orchestrator-authored allowlist
// (endpoints/models/URL policy/cap — D-P0.07-3); and launches one GKE Job per run with the pinned image
// digest (3 attempts with backoff). Live k8s/JWT wiring is deferred to the deploy; the JobLauncher and token
// service are injected seams.

import { createHash } from "node:crypto";
import type { WorkflowKey } from "@rhema/contracts";
import type { OrchestratorDeps } from "./internal-api.js";
import { applyTransition } from "./transition.js";
import { firstConflict, isWriterWorkflow, lockKeys, HOLDING_STATES, type LockKey } from "./locks.js";
import { revokeRunCredentials } from "./credentials.js";
import { reconcileRunSpend } from "./spend.js";
import type { SqlClient } from "./tx.js";
import type { RunAllowlistData, RunContextData, WebToolPolicyData } from "./resolver.js";

/** GKE Job launch (§12.4 step 4). Live k8s client is the deploy's; this is the seam. */
export interface JobLauncher {
  launch(spec: JobSpec): Promise<{ jobId: string }>;
}
export interface JobSpec {
  readonly runId: string;
  readonly attempt: number;
  readonly imageDigest: string;
  readonly workspaceId: string;
  readonly projectId?: string;
  /** Workload-Identity service account scoped to project/voice prefixes. */
  readonly serviceAccount: string;
  /**
   * The per-run run token (2 h JWT) and proxy credential secret, delivered to the HARNESS uid only (a 0600
   * projected file — never the agent's env; REQ-SPEC-10/11). Optional: the in-process fake launcher ignores
   * them; the live GKE launcher (D-P0.08-1) injects them so the harness can call the internal API + present the
   * credential to the proxy. Rotated per attempt with the launch (revoked at terminal state).
   */
  readonly runToken?: string;
  readonly proxyCredential?: string;
}

export const MAX_LAUNCH_ATTEMPTS = 3; // 3 launch attempts with backoff (§12.4 step 4)
/** A credential outlives its attempt's run token by a small margin, then expires even if revoke is missed. */
export const CREDENTIAL_TTL_MS = 3 * 60 * 60 * 1000; // 3 h (> the 2-h run token)

export type AdmitResult =
  | { readonly admitted: true; readonly lockSet: LockKey[] }
  | { readonly admitted: false; readonly reason: "lock_conflict"; readonly blockingRunId: string; readonly key: LockKey }
  | { readonly admitted: false; readonly reason: "writer_locked"; readonly blockingRunId: string }
  | { readonly admitted: false; readonly reason: "concurrency"; readonly queuePosition: number };

export interface AdmitArgs {
  readonly runId: string;
  readonly workspaceId: string;
  readonly billingAccountId: string;
  readonly workflow: WorkflowKey;
  readonly projectId?: string;
  readonly personaId?: string;
  /** the account's plan concurrency limit (Free 0 / trial 1 / Writer 2 / Studio 5 / Studio Max 8 / Team 3·seat). */
  readonly concurrencyLimit: number;
}

/**
 * Admit a queued run (REQ-RUN-17; REQ-DATA-39/40). In one tenant transaction: check the lock set against every
 * lock-holding run (returning the blocking run id on conflict), acquire the per-project writer lock for writer
 * workflows (conditional update), and enforce plan concurrency (queued variants count as N runs). On success
 * the writer lock is held; the caller then transitions to `provisioning`. FIFO by created_at for the position.
 */
export async function admitRun(deps: OrchestratorDeps, args: AdmitArgs): Promise<AdmitResult> {
  return deps.txRunner.run(args.workspaceId, async (tx) => {
    // Serialize concurrent admissions on the same resource so the lock-set scan is not TOCTOU (two persona or
    // reader runs both passing the check before either commits its holding state). The transaction-scoped
    // advisory lock releases at commit/rollback. Writers are additionally serialized by active_writer_run_id.
    const scope = args.projectId ?? args.personaId ?? args.runId;
    await tx.query("select pg_advisory_xact_lock(hashtext($1))", [`admit:${scope}`]);

    const mine = await lockSetOf(tx, args.runId);

    // lock-set conflict against every holding run.
    const holding = (
      await tx.query(
        `select id, lock_set from runs where id <> $1 and state = any($2::text[])`,
        [args.runId, HOLDING_STATES],
      )
    ).rows as { id: string; lock_set: LockKey[] }[];
    for (const other of holding) {
      const key = firstConflict(mine, other.lock_set);
      if (key) return { admitted: false, reason: "lock_conflict", blockingRunId: other.id, key } as const;
    }

    // plan concurrency: active (non-terminal, non-created) runs for the billing account (queued variants count).
    // NOTE (MVP): this runs inside the current workspace's RLS scope, which equals the billing account under the
    // MVP 1:1 workspace↔billing-account mapping. A multi-workspace Team account (1.x) needs a system-scoped
    // count across all the billing account's workspaces (Team tier is out of MVP scope — see 00_MANIFEST).
    const active = (
      await tx.query(
        `select count(*)::int as n from runs r
           join workspaces w on w.id = r.workspace_id
          where w.billing_account_id = $1
            and r.id <> $2
            and r.state in ('queued','provisioning','running','waiting_gate','orphaned','cancelling','finalizing')`,
        [args.billingAccountId, args.runId],
      )
    ).rows[0] as { n: number };
    if (active.n >= args.concurrencyLimit) {
      return { admitted: false, reason: "concurrency", queuePosition: active.n - args.concurrencyLimit + 1 } as const;
    }

    // per-project writer lock (conditional update; held across gates). Redundant with ns:write in the lock set,
    // but it is the column §6.3/§12.4 read for the writer overlay + the "Cancel run to edit" release.
    if (isWriterWorkflow(args.workflow) && args.projectId) {
      // RETURNING lets us detect whether the conditional update took effect (PGlite reports no rowCount). The
      // lock is held across gates, so re-acquiring it as the SAME run (on resume) is allowed.
      const res = await tx.query(
        `update projects set active_writer_run_id = $1
           where id = $2 and (active_writer_run_id is null or active_writer_run_id = $1) returning id`,
        [args.runId, args.projectId],
      );
      const affected = (res.rows as unknown[]).length;
      if (affected === 0) {
        const holder = (
          await tx.query("select active_writer_run_id from projects where id = $1", [args.projectId])
        ).rows[0] as { active_writer_run_id: string | null };
        return { admitted: false, reason: "writer_locked", blockingRunId: holder.active_writer_run_id ?? "unknown" } as const;
      }
    }

    return { admitted: true, lockSet: mine } as const;
  });
}

export interface ProvisionArgs extends AdmitArgs {
  readonly seat: string;
  readonly imageDigest: string;
  readonly serviceAccount: string;
  readonly modelTier: string;
  readonly provider: string;
  readonly rateTableVersion: number;
  readonly capCredits: number;
  readonly allowlist: RunAllowlistData;
  /** the run's server web-research policy (PRB.22); the proxy applies its bounded defaults when absent. */
  readonly webTools?: WebToolPolicyData;
  /**
   * P1.21 — text the proxy's n-gram guard diffs search queries against (§12.8d). A Memo run passes its
   * `user_sources[]` text so a query quoting internal figures trips `suspicious_query`.
   */
  readonly draftText?: string;
  readonly agentId?: string;
  readonly role?: string;
}

export type ProvisionResult =
  | { readonly ok: true; readonly runId: string; readonly attempt: number; readonly token: string; readonly credential: string; readonly jobId: string }
  | { readonly ok: false; readonly reason: "not_admitted"; readonly admit: AdmitResult }
  | { readonly ok: false; readonly reason: "launch_failed"; readonly attempts: number };

/**
 * Provision a queued run. Admit → transition `queued → provisioning` → mint token + proxy credential/allowlist
 * → launch the GKE Job (≤3 attempts, backoff). A launch that fails 3× ends the run `provisioning → failed`.
 */
export async function provisionRun(
  deps: OrchestratorDeps,
  launcher: JobLauncher,
  args: ProvisionArgs,
): Promise<ProvisionResult> {
  // SLO.1 — stage attribution for the §13.5 run-start budget (queued→running): `slo_samples`
  // `run_start_stage_ms` rows decompose the worker-side slice into `admit_mint` (lock-set admission +
  // the queued→provisioning transition + token/credential mint) and `job_launch` (the GKE Secret+Job
  // create loop). The remaining stage — pod schedule + image pull + runtime boot → first heartbeat —
  // is `to='running'.at − to='provisioning'.at − job_launch` (event-derivable; see slo.ts comments).
  // Awaited-but-caught on success only: telemetry never fails a launch.
  const provisionStartedAt = deps.clock.now().getTime();
  const admit = await admitRun(deps, args);
  if (!admit.admitted) return { ok: false, reason: "not_admitted", admit };

  const attempt = await currentAttempt(deps, args.workspaceId, args.runId);

  // transition to provisioning (paired event) before we spend on a launch.
  await deps.txRunner.run(args.workspaceId, (tx) =>
    applyTransition(tx, deps, { runId: args.runId, from: "queued", to: "provisioning" }),
  );

  // mint the run token (carries attempt) and the per-run proxy credential + allowlist.
  const token = deps.tokens.mint({
    runId: args.runId,
    attempt,
    workspaceId: args.workspaceId,
    projectId: args.projectId,
    seat: "harness",
  });
  // rotation per attempt (REQ-SPEC-11): revoke any prior-attempt credential before minting this attempt's.
  await revokeCredentials(deps, args.runId);
  const credential = await mintProxyCredential(deps, {
    runId: args.runId,
    attempt,
    workspaceId: args.workspaceId,
    billingAccountId: args.billingAccountId,
    projectId: args.projectId,
    role: args.role ?? args.seat,
    agentId: args.agentId ?? args.seat,
    provider: args.provider,
    modelTier: args.modelTier,
    rateTableVersion: args.rateTableVersion,
    capCredits: args.capCredits,
    allowlist: args.allowlist,
    ...(args.webTools ? { webTools: args.webTools } : {}),
    ...(args.draftText ? { draftText: args.draftText } : {}),
  });

  // launch the GKE Job with backoff.
  const launchStartedAt = deps.clock.now().getTime();
  let lastErr: unknown;
  for (let i = 1; i <= MAX_LAUNCH_ATTEMPTS; i++) {
    try {
      const { jobId } = await launcher.launch({
        runId: args.runId,
        attempt,
        imageDigest: args.imageDigest,
        workspaceId: args.workspaceId,
        projectId: args.projectId,
        serviceAccount: args.serviceAccount,
        runToken: token,
        proxyCredential: credential,
      });
      // SLO.1 — both stage samples land on success (a failed launch's spans are diagnostic noise;
      // the stranded sweep + failure path already carry that signal). Awaited-but-caught: a ~ms
      // indexed insert is noise against the pod-boot budget, keeps the write ordered before the
      // caller's next tx (the PGlite single-wire tests serialize on it), and a telemetry failure
      // still never fails a launch.
      const nowMs = deps.clock.now().getTime();
      await deps.txRunner
        .run(args.workspaceId, (tx) =>
          tx.query(
            `insert into slo_samples (signal, value_ms, workspace_id, run_id, detail) values
               ('run_start_stage_ms', $1, $3, $4, 'admit_mint'),
               ('run_start_stage_ms', $2, $3, $4, 'job_launch')`,
            [launchStartedAt - provisionStartedAt, nowMs - launchStartedAt, args.workspaceId, args.runId],
          ),
        )
        .catch(() => undefined);
      return { ok: true, runId: args.runId, attempt, token, credential, jobId };
    } catch (e) {
      lastErr = e;
    }
  }
  // launch failed 3× → provisioning → failed (§12.4). Release the credential.
  await revokeCredentials(deps, args.runId);
  await deps.txRunner.run(args.workspaceId, async (tx) => {
    await applyTransition(tx, deps, {
      runId: args.runId,
      from: "provisioning",
      to: "failed",
      reason: "infra",
      fields: { failure: { code: "infra", message: `launch failed ${MAX_LAUNCH_ATTEMPTS}×: ${String(lastErr)}`, retryable: false } },
    });
    await reconcileRunSpend(tx, args.runId); // PRB.16b — the terminal settle owns the spend figure
  });
  return { ok: false, reason: "launch_failed", attempts: MAX_LAUNCH_ATTEMPTS };
}

// -------------------------------------------------------------------- proxy credential minting (D-P0.07-3)

export interface MintCredentialArgs {
  readonly runId: string;
  readonly attempt: number;
  readonly workspaceId: string;
  readonly billingAccountId: string;
  readonly projectId?: string;
  readonly personaId?: string;
  readonly agentInstanceId?: string;
  readonly role: string;
  readonly agentId: string;
  readonly provider: string;
  readonly modelTier: string;
  readonly rateTableVersion: number;
  readonly capCredits: number;
  readonly allowlist: RunAllowlistData;
  readonly webTools?: WebToolPolicyData;
  /** P1.21 — the memo run's user-source text (the n-gram query guard's corpus). */
  readonly draftText?: string;
}

/** The credential secret is hashed for storage; the resolver looks it up by hash. */
export function hashCredential(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/**
 * Mint a per-run proxy credential + persist the richer allowlist (D-P0.07-3). Writes the non-RLS proxy tables
 * (so the proxy resolves any run's credential without a tenant-scoped read) and denormalizes the RunContext
 * attribution the proxy needs. Returns the credential SECRET (given to the harness; never stored in the clear).
 */
export async function mintProxyCredential(deps: OrchestratorDeps, args: MintCredentialArgs): Promise<string> {
  const allowlistId = deps.ids("pal");
  const credId = deps.ids("pcr");
  const secret = `${args.runId}.${args.attempt}.${deps.ids("sec")}`;
  const hash = hashCredential(secret);
  const now = deps.clock.now();
  const context: RunContextData = {
    runId: args.runId,
    attempt: args.attempt,
    agentId: args.agentId,
    role: args.role,
    workspaceId: args.workspaceId,
    billingAccountId: args.billingAccountId,
    projectId: args.projectId,
    personaId: args.personaId,
    agentInstanceId: args.agentInstanceId,
    provider: args.provider,
    modelTier: args.modelTier,
    rateTableVersion: args.rateTableVersion,
    capCredits: args.capCredits,
    ...(args.webTools ? { webTools: args.webTools } : {}),
    ...(args.draftText ? { draftText: args.draftText } : {}),
  };

  // one tenant-scoped transaction: the non-RLS proxy rows + the RLS `runs` link commit together.
  // SEC.1: this is a SYSTEM-pool transaction (`deps.systemTxRunner`) — the user-serving role holds
  // no grant on proxy_allowlists/proxy_credentials, so the mint MUST ride the elevated pool. No
  // fallback to `deps.txRunner`: silently running an elevated write under the user-serving role is
  // exactly the failure mode the split removes — absent wiring is a config error, fail closed.
  const systemTxRunner = deps.systemTxRunner;
  if (!systemTxRunner) {
    throw new Error(
      "provisionRunCredentials requires deps.systemTxRunner (the system pool) — the proxy_* mint must not run on the user-serving role (SEC.1)",
    );
  }
  await systemTxRunner.run(args.workspaceId, async (tx) => {
    await tx.query(
      `insert into proxy_allowlists(id, run_id, hosts, endpoints, models, url_policy, cap_credits, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        allowlistId,
        args.runId,
        [...new Set(args.allowlist.endpoints.map((e) => e.host))], // probe + API share the provider host
        JSON.stringify(args.allowlist.endpoints),
        args.allowlist.models,
        JSON.stringify(args.allowlist.urlPolicy),
        args.capCredits,
        now,
      ],
    );
    await tx.query(
      `insert into proxy_credentials(id, run_id, attempt, allowlist_id, credential_hash, context, created_at, expires_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [credId, args.runId, args.attempt, allowlistId, hash, JSON.stringify(context), now, new Date(now.getTime() + CREDENTIAL_TTL_MS)],
    );
    await tx.query("update runs set proxy_credential_id = $2, proxy_allowlist_id = $3 where id = $1", [
      args.runId,
      credId,
      allowlistId,
    ]);
  });
  return secret;
}

/** Revoke a run's proxy credentials (rotation per attempt; revocation at terminal — REQ-SPEC-11).
 * SEC.1: rides the system pool (`deps.systemTxRunner`) — the revoke itself crosses the grant boundary
 * via the 0045 definer function, so the '__system__' tenant scope here is the system runner's marker
 * for unconditional revocation. */
export async function revokeCredentials(deps: OrchestratorDeps, runId: string): Promise<void> {
  // proxy_credentials is not under RLS; any tenant scope works — the definer function requires the
  // '__system__' (or unset) scope to skip its workspace check. SEC.1: fail closed — the revoke rides
  // the system pool only; a missing `systemTxRunner` is a wiring error, never a user-pool fallback.
  if (!deps.systemTxRunner) {
    throw new Error(
      "revokeCredentials requires deps.systemTxRunner (the system pool) — refusing the user-serving role (SEC.1)",
    );
  }
  await deps.systemTxRunner.run("__system__", (tx) => revokeRunCredentials(tx, runId, deps.clock.now()));
}

async function lockSetOf(tx: SqlClient, runId: string): Promise<LockKey[]> {
  const res = await tx.query("select lock_set from runs where id = $1", [runId]);
  return ((res.rows[0] as { lock_set: LockKey[] } | undefined)?.lock_set ?? []) as LockKey[];
}

async function currentAttempt(deps: OrchestratorDeps, workspaceId: string, runId: string): Promise<number> {
  return deps.txRunner.run(workspaceId, async (tx) => {
    const res = await tx.query("select current_attempt from runs where id = $1", [runId]);
    return (res.rows[0] as { current_attempt: number }).current_attempt;
  });
}

// re-export the lock helpers a caller may want alongside provisioning.
export { lockKeys };

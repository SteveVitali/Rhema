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
import { firstConflict, isWriterWorkflow, lockKeys, type LockKey } from "./locks.js";
import { revokeRunCredentials } from "./credentials.js";
import type { SqlClient } from "./tx.js";
import type { RunAllowlistData, RunContextData } from "./resolver.js";

/** Run states that HOLD their lock set (a queued run has not acquired locks yet). */
const HOLDING_STATES = ["provisioning", "running", "waiting_gate", "orphaned", "cancelling", "finalizing"];

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
  });

  // launch the GKE Job with backoff.
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
      return { ok: true, runId: args.runId, attempt, token, credential, jobId };
    } catch (e) {
      lastErr = e;
    }
  }
  // launch failed 3× → provisioning → failed (§12.4). Release the credential.
  await revokeCredentials(deps, args.runId);
  await deps.txRunner.run(args.workspaceId, (tx) =>
    applyTransition(tx, deps, {
      runId: args.runId,
      from: "provisioning",
      to: "failed",
      reason: "infra",
      fields: { failure: { code: "infra", message: `launch failed ${MAX_LAUNCH_ATTEMPTS}×: ${String(lastErr)}`, retryable: false } },
    }),
  );
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
  };

  // one tenant-scoped transaction: the non-RLS proxy rows + the RLS `runs` link commit together.
  await deps.txRunner.run(args.workspaceId, async (tx) => {
    await tx.query(
      `insert into proxy_allowlists(id, run_id, hosts, endpoints, models, url_policy, cap_credits, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        allowlistId,
        args.runId,
        args.allowlist.endpoints.map((e) => e.host),
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

/** Revoke a run's proxy credentials (rotation per attempt; revocation at terminal — REQ-SPEC-11). */
export async function revokeCredentials(deps: OrchestratorDeps, runId: string): Promise<void> {
  // proxy_credentials is not under RLS; any tenant scope works.
  await deps.txRunner.run("__system__", (tx) => revokeRunCredentials(tx, runId, deps.clock.now()));
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

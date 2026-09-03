// The LIVE worker entrypoint (D-P0.08-1 / D-P0.11-1). Constructs the orchestrator DI seams against real
// infrastructure and registers the pg-boss run-lifecycle consumers + crons (§12.1 "worker owns
// run.start/resume/cancel/reap"). This is deploy wiring only — the handlers + every seam are unit-tested
// in-process; this file is not exercised offline (it needs a live deploy).

import pg from "pg";
import { Redis } from "ioredis";
import { PgBoss } from "pg-boss";
import {
  SqlEventWriter,
  Rs256RunTokenService,
  systemClock,
  randomUlids,
  RUN_JOBS,
  type SqlClient,
} from "@rhema/orchestrator";
import { SqlHoldLedger } from "@rhema/ledger";
import {
  PgPoolTxRunner,
  RedisHeartbeatStore,
  RedisRunEventBus,
  PgBossQueue,
  createGkeJobLauncher,
  loadRs256KeysFromSecretManager,
  createSecretAccessor,
} from "@rhema/live-clients";
import {
  handleRunStart,
  handleRunResume,
  handleRunCancel,
  handleRunReap,
  type WorkerRunDeps,
  type WorkerRunConfig,
  type RunJobPayload,
} from "./run-jobs.js";
import { handleRunEventsRetention, handleRunEventsPartition, RUN_EVENT_JOBS } from "./run-events-jobs.js";
import { handleParkedSweep, reDebitOnResume, type WorkerLedgerDeps } from "./ledger-jobs.js";
import { readWorkerEnv } from "./env.js";

/** The parked-run auto-cancel sweep queue (REQ-SPEC-24.4; D-P0.11-1). */
export const LEDGER_JOBS = { sweepParked: "run.sweep_parked" } as const;

/** Start the live worker: construct deps, register consumers + crons. */
export async function startWorker(): Promise<void> {
  const env = readWorkerEnv();

  const pool = new pg.Pool({ connectionString: env.databaseUrl });
  const redis = new Redis(env.redisUrl);
  const subscriber = redis.duplicate();
  const boss = new PgBoss(env.databaseUrl);

  const clock = systemClock;
  const ids = randomUlids();
  const access = await createSecretAccessor();
  const keys = await loadRs256KeysFromSecretManager(access, {
    privateKeyName: env.runTokenPrivateKeySecret,
    publicKeyName: env.runTokenPublicKeySecret,
    ...(env.runTokenKeyId ? { keyId: env.runTokenKeyId } : {}),
  });
  const ledger = new SqlHoldLedger({ ids, clock });
  const bus = new RedisRunEventBus(redis, subscriber);
  const launcher = await createGkeJobLauncher({
    namespace: env.k8sNamespace,
    sandboxNodePool: env.sandboxNodePool,
    imageRepo: env.runTaskImageRepo,
    internalApiUrl: env.internalApiUrl,
    proxyBaseUrl: env.proxyBaseUrl,
    kubeServiceAccount: env.kubeServiceAccount,
  });
  const config: WorkerRunConfig = {
    imageDigest: env.runTaskImageDigest,
    serviceAccount: env.runServiceAccount,
    provider: env.provider,
    // the real per-account plan concurrency is the subscription tier (PRB.8/P1.16); a flat default for now.
    concurrencyFor: () => env.defaultConcurrency,
  };

  // A system-scoped client for the parked sweep + run-event maintenance (cross-tenant / system-table reads).
  // Uses a SEPARATE elevated connection when `systemDatabaseUrl` is set, so the tenant `pool` above can stay a
  // restricted RLS-enforced role (defense-in-depth); falls back to the main pool otherwise.
  const systemPool = env.systemDatabaseUrl ? new pg.Pool({ connectionString: env.systemDatabaseUrl }) : pool;
  const systemExec: SqlClient = {
    query: (sql, params) => systemPool.query(sql, params ? [...params] : undefined).then((r) => ({ rows: r.rows as unknown[] })),
  };

  const deps: WorkerRunDeps & WorkerLedgerDeps = {
    txRunner: new PgPoolTxRunner(pool),
    eventWriter: new SqlEventWriter(bus),
    clock,
    ids,
    heartbeats: new RedisHeartbeatStore(redis),
    tokens: new Rs256RunTokenService(keys, clock),
    ledger,
    queue: new PgBossQueue(boss),
    launcher,
    config,
    systemExec,
  };

  await boss.start();
  for (const name of [...Object.values(RUN_JOBS), ...Object.values(RUN_EVENT_JOBS), LEDGER_JOBS.sweepParked]) {
    await boss.createQueue(name);
  }

  // run.start / resume / cancel consumers (the payload → orchestrator mapping). pg-boss delivers a batch.
  await boss.work<RunJobPayload>(RUN_JOBS.start, async (jobs) => {
    for (const job of jobs) await handleRunStart(deps, job.data);
  });
  await boss.work<RunJobPayload>(RUN_JOBS.resume, async (jobs) => {
    for (const job of jobs) {
      const res = await handleRunResume(deps, job.data);
      // re-debit the refunded phases FIRST at resume (REQ-SPEC-24.6), keyed per episode (resume:<run>:<attempt>).
      if (res.ok) await reDebitOnResume(deps, { runId: res.runId, workspaceId: job.data.workspaceId, attempt: res.attempt });
    }
  });
  await boss.work<RunJobPayload>(RUN_JOBS.cancel, async (jobs) => {
    for (const job of jobs) await handleRunCancel(deps, job.data);
  });

  // crons: the reaper (1 min), the parked sweep (hourly), run-event retention + partition maintenance (daily).
  await boss.work(RUN_JOBS.reap, async () => {
    await handleRunReap(deps);
  });
  await boss.schedule(RUN_JOBS.reap, "* * * * *");

  await boss.work(LEDGER_JOBS.sweepParked, async () => {
    await handleParkedSweep(deps);
  });
  await boss.schedule(LEDGER_JOBS.sweepParked, "0 * * * *");

  await boss.work(RUN_EVENT_JOBS.retention, async () => {
    await handleRunEventsRetention({ db: systemExec, clock });
  });
  await boss.schedule(RUN_EVENT_JOBS.retention, "30 3 * * *");
  await boss.work(RUN_EVENT_JOBS.partition, async () => {
    await handleRunEventsPartition({ db: systemExec, clock });
  });
  await boss.schedule(RUN_EVENT_JOBS.partition, "0 3 * * *");

  console.log("[worker] run-lifecycle consumers + crons registered");
}

// Run when invoked as the container entrypoint (`node dist/main.js`), not when imported.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  startWorker().catch((err: unknown) => {
    console.error("[worker] failed to start:", err);
    process.exit(1);
  });
}

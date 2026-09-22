// The LIVE worker entrypoint (D-P0.08-1 / D-P0.11-1). Constructs the orchestrator DI seams against real
// infrastructure and registers the pg-boss run-lifecycle consumers + crons (§12.1 "worker owns
// run.start/resume/cancel/reap"). This is deploy wiring only — the handlers + every seam are unit-tested
// in-process; this file is not exercised offline (it needs a live deploy).

import http from "node:http";
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

  // Cloud Run runs this worker as an always-on service (min-instances=1) and health-probes $PORT at startup;
  // a pg-boss consumer otherwise opens no port and the deploy's startup probe fails. A tiny always-200 server
  // answers the probe (the worker serves no HTTP of its own). Opened before the slower secret/DB/pg-boss init
  // so the port is listening well within the probe window.
  const health = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
  });
  health.listen(Number(process.env.PORT ?? 8080));

  console.log("[worker] startup: health server listening; constructing deps");
  // Long-lived DB connections over Cloud Run Direct-VPC egress → the AlloyDB PSA path get SILENTLY DROPPED when
  // idle (a NAT/idle connection lifetime), surfacing as pg-boss "Connection terminated due to connection timeout"
  // on every poll and starving run provisioning (diagnosed live — the api's short per-request queries are
  // unaffected). TCP keepalive holds the connections open; bounded pools + a real connect timeout keep the
  // footprint sane and fail fast rather than hanging.
  const pgOpts = { keepAlive: true, keepAliveInitialDelayMillis: 10_000, connectionTimeoutMillis: 15_000, idleTimeoutMillis: 30_000 };
  const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 6, ...pgOpts });
  const redis = new Redis(env.redisUrl, { maxRetriesPerRequest: 3, enableOfflineQueue: true, lazyConnect: false });
  const subscriber = redis.duplicate();
  const boss = new PgBoss({ connectionString: env.databaseUrl, max: 5, ...pgOpts });

  // A background service must never let a transient infra blip become an UNHANDLED error that exits the process
  // (a single pg-boss connection timeout on the reaper cron was crashing the whole worker → EventEmitter
  // 'error' with no listener → ERR_UNHANDLED_ERROR → exit(1), losing the run consumers). Attach listeners so a
  // blip is logged and pg-boss/pg recover on their own retry cadence instead of killing the run lifecycle.
  boss.on("error", (err: unknown) => console.error("[worker] pg-boss error (non-fatal, will retry):", err));
  pool.on("error", (err: unknown) => console.error("[worker] pg pool error (non-fatal):", err));
  redis.on("error", (err: unknown) => console.error("[worker] redis error (non-fatal):", err));

  const clock = systemClock;
  const ids = randomUlids();
  console.log("[worker] startup: loading run-token keys from Secret Manager");
  const access = await createSecretAccessor();
  const keys = await loadRs256KeysFromSecretManager(access, {
    privateKeyName: env.runTokenPrivateKeySecret,
    publicKeyName: env.runTokenPublicKeySecret,
    ...(env.runTokenKeyId ? { keyId: env.runTokenKeyId } : {}),
  });
  console.log("[worker] startup: keys loaded; GKE launcher is lazy (built on first launch)");
  const ledger = new SqlHoldLedger({ ids, clock });
  const bus = new RedisRunEventBus(redis, subscriber);
  // LAZY GKE launcher: `createGkeJobLauncher` dynamically imports `@kubernetes/client-node`, a very heavy module
  // whose cold import over Cloud Run's gVisor filesystem can take MINUTES — long enough to stall startup past the
  // point where pg-boss's own DB connection times out and crashes the worker before its run consumers register
  // (diagnosed live). Deferring the import to the first actual launch lets the worker register its consumers +
  // become stable immediately; the one-time import cost is paid on the first run's provisioning instead.
  const launcherConfig = {
    namespace: env.k8sNamespace,
    sandboxNodePool: env.sandboxNodePool,
    imageRepo: env.runTaskImageRepo,
    internalApiUrl: env.internalApiUrl,
    proxyBaseUrl: env.proxyBaseUrl,
    objectsBucket: env.objectsBucket,
    kubeServiceAccount: env.kubeServiceAccount,
    // Cloud Run → GKE auth (D-P0.15e-3): endpoint + CA present ⇒ metadata-token KubeConfig; absent ⇒ loadFromDefault.
    ...(env.gkeEndpoint ? { gkeEndpoint: env.gkeEndpoint } : {}),
    ...(env.gkeCaData ? { gkeCaData: env.gkeCaData } : {}),
  };
  // Cold-launch robustness (D-P0.15e-3 / live P0.15h): the FIRST launch on a fresh Cloud Run instance builds the
  // GKE launcher (dynamic `@kubernetes/client-node` import + a metadata-token KubeConfig) and makes its first
  // Direct-VPC egress calls (metadata token, GKE API). Cold, that first path can HANG with no timeout, wedging
  // the run in `provisioning` forever (a warm instance launches fine). Fix: bound the build AND the launch with
  // timeouts + a few retries (a hung attempt is abandoned; Node caches the in-flight import so a retry resolves
  // once it lands), and EAGER-WARM the build at startup so the first real job is not the cold path.
  let realLauncher: Awaited<ReturnType<typeof createGkeJobLauncher>> | undefined;
  let launcherInit: Promise<Awaited<ReturnType<typeof createGkeJobLauncher>>> | undefined;
  const withTimeout = <T>(pr: Promise<T>, ms: number, label: string): Promise<T> => {
    let t: ReturnType<typeof setTimeout>;
    return Promise.race([
      pr.finally(() => clearTimeout(t)),
      new Promise<T>((_, rej) => (t = setTimeout(() => rej(new Error(`timeout after ${ms}ms: ${label}`)), ms))),
    ]);
  };
  const ensureLauncher = async (): Promise<Awaited<ReturnType<typeof createGkeJobLauncher>>> => {
    if (realLauncher) return realLauncher;
    if (!launcherInit) {
      console.log("[worker] building GKE launcher (import @kubernetes/client-node + KubeConfig)");
      launcherInit = createGkeJobLauncher(launcherConfig);
    }
    try {
      realLauncher = await withTimeout(launcherInit, 60_000, "createGkeJobLauncher");
      return realLauncher;
    } catch (err) {
      launcherInit = undefined; // let the next attempt rebuild
      throw err;
    }
  };
  const launcher = {
    launch: async (spec: Parameters<Awaited<ReturnType<typeof createGkeJobLauncher>>["launch"]>[0]) => {
      let lastErr: unknown;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const l = await ensureLauncher();
          return await withTimeout(l.launch(spec), 90_000, "launch");
        } catch (err) {
          lastErr = err;
          console.error(`[worker] launch attempt ${attempt}/3 failed (will retry):`, err instanceof Error ? err.message : err);
          await new Promise((r) => setTimeout(r, 2000 * attempt));
        }
      }
      throw lastErr;
    },
  };
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
  const systemPool = env.systemDatabaseUrl ? new pg.Pool({ connectionString: env.systemDatabaseUrl, max: 4, ...pgOpts }) : pool;
  systemPool.on("error", (err: unknown) => console.error("[worker] system pg pool error (non-fatal):", err));
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

  // The pg-boss connection BURST at startup (start + createQueue×N) can hit a transient AlloyDB connect timeout
  // over Cloud Run Direct-VPC egress — and unlike steady-state polling (covered by boss.on('error')), a throw
  // here escapes startWorker → exit(1) → a slow restart loop that can outlive the run.start job (live). Retry the
  // idempotent init a few times with backoff so one slow connect does not crash the worker before it registers.
  const retryStartup = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        await fn();
        return;
      } catch (err) {
        lastErr = err;
        console.error(`[worker] startup ${label} attempt ${attempt} failed (will retry):`, err instanceof Error ? err.message : err);
        await new Promise((r) => setTimeout(r, Math.min(1000 * attempt, 5000)));
      }
    }
    throw lastErr;
  };

  console.log("[worker] startup: launcher built; starting pg-boss");
  await retryStartup("boss.start", () => boss.start());
  console.log("[worker] startup: pg-boss started; creating queues");
  for (const name of [...Object.values(RUN_JOBS), ...Object.values(RUN_EVENT_JOBS), LEDGER_JOBS.sweepParked]) {
    await retryStartup(`createQueue ${name}`, () => boss.createQueue(name));
  }
  console.log("[worker] startup: queues created; registering consumers");

  // NOTE: the GKE launcher is built LAZILY on the first run.start (below), NOT eagerly here. The
  // `@kubernetes/client-node` import is event-loop-BLOCKING and, on a cold Cloud Run instance, can take minutes
  // (live P0.15h). Doing it eagerly at startup starved pg-boss's job poller during the block, so a queued run
  // was never delivered. Lazily inside the handler, pg-boss delivers the job first (the run enters
  // `provisioning`), then the blocking import runs, then the Job launches — slow on the first launch, reliable.
  // The timeout+retry around the build/launch (see `ensureLauncher`/`launcher.launch`) still bounds a true hang.

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

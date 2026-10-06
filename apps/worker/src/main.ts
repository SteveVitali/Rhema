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
  GATE_EXPIRY_QUEUE,
  FIGURE_RENDER_QUEUE,
  drainPauseSignals,
  probeSlos,
  type SqlClient,
} from "@rhema/orchestrator";
import { SqlHoldLedger, STRIPE_EVENT_JOB, FetchStripePort } from "@rhema/ledger";
import { SqlObligationHook } from "@rhema/obligations";
import { recordInstrumentedFold, type InstrumentedMeasurement } from "@rhema/protocols";
import { createGcsContentStore } from "@rhema/mirror";
import {
  PgPoolTxRunner,
  RedisHeartbeatStore,
  RedisRunEventBus,
  PgBossQueue,
  createGkeJobLauncher,
  loadRs256KeysFromSecretManager,
  createSecretAccessor,
  fetchGceMetadataIdToken,
  createGcsObjects,
  createGcsBlobStore,
  createConvertJobPreview,
  createFetcherServicePort,
} from "@rhema/live-clients";
import {
  handleRunStart,
  handleRunResume,
  handleRunCancel,
  handleRunFinalize,
  handleFigureRender,
  handleRunReap,
  handleStrandedSweep,
  handleGateExpiryJob,
  handleRunWalkthrough,
  type WorkerRunDeps,
  type WorkerRunConfig,
  type RunJobPayload,
} from "./run-jobs.js";
import { AnthropicWalkthroughGenerator } from "./walkthrough-generator.js";
import { handleRunEventsRetention, handleRunEventsPartition, RUN_EVENT_JOBS } from "./run-events-jobs.js";
import { handleParkedSweep, reDebitOnResume, type WorkerLedgerDeps } from "./ledger-jobs.js";
import {
  handleStripeEvent,
  handleUsageReconcile,
  handleRunDeliver,
  handleBillingPeriodTick,
  handleAutoReloadSweep,
  handleEstimatorRefit,
  BILLING_PERIOD_TICK_JOB,
  BILLING_AUTO_RELOAD_JOB,
  BILLING_REFIT_JOB,
  type WorkerFullBillingDeps,
  type StripeEventJobPayload,
  type RunDeliverJobPayload,
} from "./billing-jobs.js";
import { AnthropicAdminReportSource } from "./provider-report.js";
import {
  ResendMailSender,
  handleMailSendJobPayload,
  handleNotifyJobPayload,
  type WorkerNotificationDeps,
} from "./notification-jobs.js";
import { readWorkerEnv } from "./env.js";
import {
  INGEST_JOB_NAMES,
  handleIngestSync,
  handleIngestReconstruct,
  handleIngestSyncSweep,
  handleVoicePurge,
  sqlSampleMeter,
  AnthropicReconstructor,
  type WorkerIngestDeps,
  type IngestSyncJobPayload,
  type IngestReconstructJobPayload,
  type VoicePurgeJobPayload,
} from "./ingest-jobs.js";
import {
  ACCOUNT_EXPORT_QUEUE,
  handleAccountExport,
  type AccountExportJobPayload,
  type WorkerAccountExportDeps,
} from "./export-jobs.js";
import {
  handleAccountHardDelete,
  handleProjectPurge,
  type AccountHardDeleteJob,
  type ProjectPurgeJob,
} from "./jobs.js";

/** P1.20 — the `account.hard-delete` queue name (the api enqueues at the grace end). */
const ACCOUNT_HARD_DELETE_JOB = "account.hard-delete";
/** STB.2 / D-P1.04-2 — the `project.purge` queue name (the api enqueues at the tombstone's +30d). */
const PROJECT_PURGE_JOB = "project.purge";

/** The parked-run auto-cancel sweep queue (REQ-SPEC-24.4; D-P0.11-1). */
export const LEDGER_JOBS = { sweepParked: "run.sweep_parked" } as const;
/** PRB.08 — the nightly provider-report reconciliation (REQ-BILL-13; the balance assertion rides it). */
export const USAGE_RECONCILE_JOB = "usage.reconcile" as const;

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

  // PRB.08 billing bindings: the provider Usage & Cost report source (admin key from Secret Manager — unset
  // on preview stages, where usage.reconcile then skips the report pull and still runs the balance
  // assertion), the ops alert sink, and the estimator-recalibration fold (@rhema/protocols — server-side
  // only; nothing protocol reaches a payload).
  // PRB.17 — a seeded PLACEHOLDER value (the secret NAME is provisioned before the real admin key exists,
  // as on prod 2026-09-18) must not construct a source whose 401s crash every nightly `usage.reconcile`
  // before it reaches the balance assertion. Same guard shape as the Resend placeholder below: a value
  // self-marked `placeholder` is "not configured" → the report pull skips, the assertion still runs.
  const adminSecret = env.anthropicAdminKeySecret ? await access(env.anthropicAdminKeySecret) : undefined;
  const adminKey = adminSecret && !/placeholder/i.test(adminSecret) ? adminSecret : undefined;
  if (adminSecret && !adminKey) {
    console.log("[worker] ANTHROPIC admin key is a placeholder — Usage & Cost report pull unconfigured");
  }
  const alertSink = env.opsAlertWebhookUrl
    ? async (a: unknown) => {
        await fetch(env.opsAlertWebhookUrl!, {
          method: "post",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(a),
        });
      }
    : undefined;

  // PRB.09 — the notification config (signed-action secret + link origins) and the Resend transport. Both
  // are optional seams: a preview stage without the secrets runs the queues as no-ops and stays green.
  const actionSecret = env.emailActionSecretName ? await access(env.emailActionSecretName) : undefined;
  // PRB.16 — a seeded PLACEHOLDER value (the secret NAME is provisioned before the real key exists, as
  // on prod 2026-09-17) must not construct a client that fails every send and burns pg-boss retries.
  // Resend keys carry the `re_` prefix — and the seeded stand-ins MIMIC it (`re_placeholder_…`), so the
  // guard checks the prefix AND refuses any value self-marked as a placeholder; anything else is
  // "not configured" → the mail legs no-op cleanly.
  const resendSecret = env.resendApiKeySecret ? await access(env.resendApiKeySecret) : undefined;
  const resendKey =
    resendSecret?.startsWith("re_") && !/placeholder/i.test(resendSecret) ? resendSecret : undefined;
  if (resendSecret && !resendKey) {
    console.log("[worker] RESEND key is a placeholder/malformed — mail transport unconfigured");
  }
  const notificationConfig =
    actionSecret && env.apiPublicUrl && env.appBaseUrl
      ? { actionSecret, apiBaseUrl: env.apiPublicUrl, appBaseUrl: env.appBaseUrl }
      : undefined;

  // P1.16 — the Stripe Billing key (Secret-Manager NAME; placeholder counts as unconfigured — the
  // PRB.17 pattern). Bound into `deps.stripe` for the auto-reload sweep's off-session charge — the ONLY
  // unattended charge path (REQ-BILL-17). Unset ⇒ the sweep logs `no_stripe_port` and skips.
  const stripeKeySecret = env.stripeSecretKeyName ? await access(env.stripeSecretKeyName) : undefined;
  const stripeKey = stripeKeySecret && !/placeholder/i.test(stripeKeySecret) ? stripeKeySecret : undefined;
  if (stripeKeySecret && !stripeKey) {
    console.log("[worker] STRIPE key is a placeholder — auto-reload sweep stays no_stripe_port");
  }

  // P1.05 — the walkthrough's package-class call. Unconfigured (no key secret) ⇒ a stub that fails the
  // attempt cleanly (recorded `failed`; the card's Retry covers it once the secret lands).
  const walkthroughKeySecret = env.walkthroughModelKeySecret ? await access(env.walkthroughModelKeySecret) : undefined;
  const walkthroughKey = walkthroughKeySecret && !/placeholder/i.test(walkthroughKeySecret) ? walkthroughKeySecret : undefined;
  const walkthrough = walkthroughKey
    ? new AnthropicWalkthroughGenerator({ apiKey: walkthroughKey })
    : { generate: () => Promise.reject(new Error("walkthrough unconfigured")) };

  const deps: WorkerRunDeps & WorkerLedgerDeps & WorkerFullBillingDeps & WorkerNotificationDeps & { walkthrough: typeof walkthrough } = {
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
    // PRB.19 (live F35): the `run.deliver` withheld-delivery re-drive folds a `response` ledger into
    // obligation routing exactly like the api's inline POST path — without the hook wired here, a
    // re-driven response delivered with its obligations unrouted (prod run 01M2VDHN… routed post-hoc).
    obligationHook: new SqlObligationHook({ ids, clock, appendEvent: new SqlEventWriter(bus) }),
    ...(adminKey ? { reportSource: new AnthropicAdminReportSource({ adminKey }) } : {}),
    // P1.16 — the Stripe port for the auto-reload sweep (unset ⇒ logged no_stripe_port skip).
    ...(stripeKey ? { stripe: new FetchStripePort(stripeKey) } : {}),
    ...(alertSink ? { alert: alertSink } : {}),
    // REQ-BILL-13: reconciled measured-vs-modeled facts fold into the estimator spec (the recorded override
    // flips the workflow's `provisional` once real reports land).
    recalibrate: (m) => {
      recordInstrumentedFold(m.workflow, m as InstrumentedMeasurement);
    },
    contentStoreFor: (workspaceId: string) => createGcsContentStore({ bucketName: env.objectsBucket, workspaceId }),
    ...(notificationConfig ? { notifications: notificationConfig } : {}),
    ...(resendKey && env.emailFrom ? { mailer: new ResendMailSender(resendKey, env.emailFrom) } : {}),
    ...(env.emailFrom ? { emailFrom: env.emailFrom } : {}),
    walkthrough,
  };

  // P1.15 — the ingestion deps (§9.5): every seam is optional and fails closed with a named reason.
  // The fetcher rides the invoker-gated fetcher service (OIDC per hop — LIVE FINDING 11); the
  // reconstructor spends the same Secret-Manager anthropic key the walkthrough generator uses
  // (operator-gated spend — D-P1.15-1 caps the first live visual pass at ≤$5).
  const ingestKeySecret = env.ingestModelKeySecret ? await access(env.ingestModelKeySecret) : undefined;
  const ingestKey = ingestKeySecret && !/placeholder/i.test(ingestKeySecret) ? ingestKeySecret : undefined;
  const ingestDeps: WorkerIngestDeps = {
    txRunner: deps.txRunner,
    ids,
    clock,
    queue: deps.queue,
    contentStoreFor: deps.contentStoreFor,
    meter: sqlSampleMeter({ ids, clock }),
    ...(env.fetcherServiceUrl
      ? { fetcher: createFetcherServicePort(env.fetcherServiceUrl, fetch, fetchGceMetadataIdToken) }
      : {}),
    ...(env.userContentBucket ? { ingestBlobs: await createGcsBlobStore(env.userContentBucket) } : {}),
    ...(env.userContentBucket && env.convertJob
      ? {
          converter: createConvertJobPreview({
            job: env.convertJob,
            bucket: env.userContentBucket,
            objects: await createGcsObjects(env.userContentBucket),
            ...(env.convertJobRoot ? { mountPath: env.convertJobRoot } : {}),
          }),
        }
      : {}),
    ...(ingestKey ? { reconstructor: new AnthropicReconstructor({ apiKey: ingestKey }) } : {}),
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
  for (const name of [
    ...Object.values(RUN_JOBS),
    ...Object.values(RUN_EVENT_JOBS),
    GATE_EXPIRY_QUEUE, // PRB.16b F25 — one queue for every gate's expiry job (the gate id rides the payload).
    LEDGER_JOBS.sweepParked,
    STRIPE_EVENT_JOB,
    USAGE_RECONCILE_JOB,
    BILLING_PERIOD_TICK_JOB, // P1.16 — period grants + renewal-failure grace + trial expiry + daily Free allowance
    BILLING_AUTO_RELOAD_JOB, // P1.16 — the opt-in auto-reload sweep (REQ-BILL-17)
    BILLING_REFIT_JOB, //       P1.16 — the weekly REQ-BILL-7 estimator re-fit
    FIGURE_RENDER_QUEUE, // P1.13 — the deterministic server-side figure render (§12.1)
    ...Object.values(INGEST_JOB_NAMES), // P1.15 — ingest.sync / reconstruct / sweep + voice.purge (§9.5)
    "notify",
    "mail.send",
    // P1.19 — the sweep fan-outs (the §5.11 deferred rows): each enqueues a tenant-scoped `notify` job
    // per workspace; the notify consumer's handlers own the per-workspace work.
    "notify.sweep.weekly",
    "notify.sweep.daily",
    "notify.sweep.hourly",
    "auth.mail", // PRB.16 — the Better Auth magic-link transport (the api enqueues; this sends)
    ACCOUNT_EXPORT_QUEUE, // P1.18 — the whole-account zip build + emailed 7-day link (REQ-ACCT-3)
    ACCOUNT_HARD_DELETE_JOB, // the api enqueues at the deletion grace end (P1.20)
    PROJECT_PURGE_JOB, // the api enqueues at the tombstone's +30d (D-P1.04-2)
  ]) {
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
  // P1.12 — the last-phase-gate finalize (`approve_outline` resolves → `finalizing` → this job
  // settles the run + applies the Approve-outline consequences; no pod resumes).
  await boss.work<RunJobPayload>(RUN_JOBS.finalize, async (jobs) => {
    for (const job of jobs) await handleRunFinalize(deps, job.data);
  });

  // P1.05 — the lazy walkthrough generator (one package-class call per job; failures land as
  // {status:'failed'} on runs.walkthrough and never throw — a throw would burn pg-boss retries for a
  // terminal-state nicety).
  await boss.work<RunJobPayload>(RUN_JOBS.walkthrough, async (jobs) => {
    for (const job of jobs) {
      const r = await handleRunWalkthrough(deps, job.data);
      console.log(`[worker] run.walkthrough ${job.data.runId} → ${JSON.stringify(r)}`);
    }
  });

  // PRB.16b F25 — the gate-expiry consumer: P0.10's `gate:<id>` design was never registered here AND was an
  // illegal pg-boss name (`:`), so deadline-bearing gates' expiry jobs were never scheduled or consumed.
  // One queue, one consumer; the handler re-reads the deadline + resolves per the gate's on_expiry.
  await boss.work<{ gateId: string; workspaceId: string }>(GATE_EXPIRY_QUEUE, async (jobs) => {
    for (const job of jobs) {
      const outcome = await handleGateExpiryJob(deps, job.data);
      console.log(`[worker] gate.expiry ${job.data.gateId} → ${JSON.stringify(outcome)}`);
    }
  });

  // crons: the reaper (1 min — heartbeat-orphans + the stranded-run sweep, PRB.14), the parked sweep
  // (hourly), run-event retention + partition maintenance (daily).
  await boss.work(RUN_JOBS.reap, async () => {
    await handleRunReap(deps);
    const swept = await handleStrandedSweep(deps);
    for (const s of swept) console.log("[worker] stranded-sweep:", JSON.stringify(s));
  });
  await boss.schedule(RUN_JOBS.reap, "* * * * *");

  // P1.22 (REQ-ARCH-32; §12.8) — the pause-signal drain. The egress proxy's `SqlSignalSink` lands a
  // `pause_signals` row on a `suspicious_query` / `egress.denied` spike / `user_source_fetch`; this
  // sweep claims it (a `claimed_at` lease + bounded attempts — `drainPauseSignals`) and applies
  // `pauseRun`: the run parks `running → waiting_gate` at a refusal-class card and the sandbox exits.
  // A short setInterval — NOT a pg-boss cron (1-minute granularity is too slow for a security pause) —
  // keeps the pause latency ≈ the interval. A failed tick logs and the next tick retries; the drain
  // dead-letters a poisoned row after `PAUSE_MAX_ATTEMPTS` so the sweep can never wedge.
  const PAUSE_SWEEP_INTERVAL_MS = 5_000;
  const drainPause = () =>
    drainPauseSignals(deps, { system: systemExec })
      .then((r) => {
        if (r.claimed > 0) console.log(`[worker] pause-drain: ${JSON.stringify(r)}`);
      })
      .catch((err: unknown) => console.error("[worker] pause-drain failed:", err));
  void drainPause();
  setInterval(drainPause, PAUSE_SWEEP_INTERVAL_MS);

  // P1.22 W9 (§13.5; REQ-ARCH-34) — the SLO probe. Every 5 minutes `probeSlos` reads the DB-backed §13.5
  // signals on the system executor; each breach logs one structured `[slo]` line (the
  // `rhema_slo_violations` log-based metric + alert policies in infra/pulumi/monitoring.ts key on it) and
  // pages the ops webhook. Unmeasured signals are logged once at startup, not per tick.
  const SLO_SWEEP_INTERVAL_MS = 5 * 60_000;
  const probeTick = () =>
    probeSlos(systemExec)
      .then((readings) => {
        for (const r of readings) {
          if (r.status === "breach") {
            const line = JSON.stringify({ signal: r.key, value: r.value, threshold: r.threshold, target: r.target });
            console.error(`[slo] violation ${line}`);
            void alertSink?.({ kind: "slo_violation", signal: r.key, value: r.value, threshold: r.threshold, target: r.target });
          }
        }
      })
      .catch((err: unknown) => console.error("[worker] slo-probe failed:", err));
  void probeSlos(systemExec).then((readings) => {
    for (const r of readings.filter((x) => x.status === "unmeasured")) {
      console.log(`[slo] unmeasured ${r.key}: ${r.unmeasuredReason ?? "no probe"}`);
    }
  });
  void probeTick();
  setInterval(probeTick, SLO_SWEEP_INTERVAL_MS);

  await boss.work(LEDGER_JOBS.sweepParked, async () => {
    await handleParkedSweep(deps);
  });
  await boss.schedule(LEDGER_JOBS.sweepParked, "0 * * * *");

  // PRB.08 — the §14.6 processing half: `stripe.event` consumes the parked stripe_events rows (top-up grant,
  // chargeback, dispute-won). A failed process throws → pg-boss retries; every arm is idempotent.
  await boss.work<StripeEventJobPayload>(STRIPE_EVENT_JOB, async (jobs) => {
    for (const job of jobs) {
      const outcome = await handleStripeEvent(deps, job.data);
      if (outcome.kind === "unresolved") throw new Error(`stripe event unresolved: ${outcome.reason}`);
      console.log(`[worker] stripe.event ${job.data.eventId} → ${outcome.kind}`);
    }
  });
  // the withheld-delivery re-drive (a chargeback's stash; enqueued by the dispute-won / reinstate path).
  await boss.work<RunDeliverJobPayload>(RUN_JOBS.deliver, async (jobs) => {
    for (const job of jobs) await handleRunDeliver(deps, job.data);
  });

  // P1.13 — the deterministic figure render (the render step's commit enqueues; the job renders the
  // committed spec server-side and emits figure.rendered). A render fault throws → pg-boss retries.
  await boss.work<{ figureId: string; runId: string; workspaceId: string }>(FIGURE_RENDER_QUEUE, async (jobs) => {
    for (const job of jobs) {
      const outcome = await handleFigureRender(deps, job.data);
      console.log(`[worker] figure.render ${job.data.figureId} → ${JSON.stringify(outcome)}`);
    }
  });
  // REQ-BILL-13 — nightly provider-report reconciliation + the REQ-SPEC-24.1 balance assertion (3:15 UTC).
  await boss.work(USAGE_RECONCILE_JOB, async () => {
    const r = await handleUsageReconcile(deps);
    console.log(
      `[worker] usage.reconcile: report=${r.report ? `${r.report.matched} matched, drift ${(r.report.driftPct * 100).toFixed(2)}%` : "skipped"}, balances ${r.balances.ok ? "ok" : `${r.balances.divergences} divergences`}`,
    );
  });
  await boss.schedule(USAGE_RECONCILE_JOB, "15 3 * * *");

  // P1.16 — the billing crons (§14.2/14.3): hourly period tick (boundary grants, scheduled downgrades,
  // renewal-failure 7d-warning → +14d downgrade, trial expiry, daily Free allowance), hourly auto-reload
  // sweep (no `deps.stripe` ⇒ a logged `no_stripe_port` skip — never a fabricated charge), weekly
  // estimator re-fit (Sunday 04:30 UTC).
  await boss.work(BILLING_PERIOD_TICK_JOB, async () => {
    const r = await handleBillingPeriodTick(deps);
    console.log(`[worker] billing.period-tick → ${JSON.stringify(r)}`);
  });
  await boss.schedule(BILLING_PERIOD_TICK_JOB, "5 * * * *");
  await boss.work(BILLING_AUTO_RELOAD_JOB, async () => {
    const r = await handleAutoReloadSweep(deps);
    console.log(`[worker] billing.auto-reload → ${JSON.stringify(r)}`);
  });
  await boss.schedule(BILLING_AUTO_RELOAD_JOB, "20 * * * *");
  await boss.work(BILLING_REFIT_JOB, async () => {
    const r = await handleEstimatorRefit(deps);
    console.log(`[worker] billing.estimator-refit → ${JSON.stringify(r)}`);
  });
  await boss.schedule(BILLING_REFIT_JOB, "30 4 * * 0");

  // P1.15 — the ingestion consumers (§9.5). Provider faults land on the connection row verbatim
  // (handler never throws on a provider error); a thrown job is a transient infra fault → pg-boss
  // retries. The daily sweep enqueues a `ingest.sync` per auto_schedule'd connection.
  await boss.work<IngestSyncJobPayload>(INGEST_JOB_NAMES.sync, async (jobs) => {
    for (const job of jobs) {
      const r = await handleIngestSync(ingestDeps, job.data);
      console.log(`[worker] ingest.sync ${job.data.connectionId} → ${JSON.stringify(r)}`);
    }
  });
  await boss.work<IngestReconstructJobPayload>(INGEST_JOB_NAMES.reconstruct, async (jobs) => {
    for (const job of jobs) {
      const r = await handleIngestReconstruct(ingestDeps, job.data);
      console.log(`[worker] ingest.reconstruct ${job.data.itemId} (${job.data.tier}) → ${JSON.stringify(r)}`);
    }
  });
  await boss.work<VoicePurgeJobPayload>(INGEST_JOB_NAMES.voicePurge, async (jobs) => {
    for (const job of jobs) {
      const r = await handleVoicePurge({ ...ingestDeps, systemExec }, job.data);
      console.log(`[worker] voice.purge ${job.data.personaId} → ${JSON.stringify(r)}`);
    }
  });
  await boss.work(INGEST_JOB_NAMES.syncSweep, async () => {
    const { queued } = await handleIngestSyncSweep({ ...ingestDeps, systemExec });
    if (queued > 0) console.log(`[worker] ingest.sync.sweep enqueued ${queued}`);
  });
  await boss.schedule(INGEST_JOB_NAMES.syncSweep, "40 3 * * *"); // daily, offset from the reconcile/retention crons

  await boss.work(RUN_EVENT_JOBS.retention, async () => {
    await handleRunEventsRetention({ db: systemExec, clock });
  });
  await boss.schedule(RUN_EVENT_JOBS.retention, "30 3 * * *");
  await boss.work(RUN_EVENT_JOBS.partition, async () => {
    await handleRunEventsPartition({ db: systemExec, clock });
  });
  await boss.schedule(RUN_EVENT_JOBS.partition, "0 3 * * *");

  // PRB.09 — the notification consumers: `notify` (domain jobs — re-read state, claim, mint links, enqueue
  // mail) and `mail.send` (the Resend transport leg). Payloads are the NotificationJobPayload shapes.
  await boss.work("notify", async (jobs) => {
    for (const job of jobs) await handleNotifyJobPayload(deps, job.data as Parameters<typeof handleNotifyJobPayload>[1]);
  });
  await boss.work("mail.send", async (jobs) => {
    for (const job of jobs) await handleMailSendJobPayload(deps, job.data as Parameters<typeof handleMailSendJobPayload>[1]);
  });
  // P1.19 — the deferred §5.11 rows' sweeps. Each fans out one `notify` job per WORKSPACE through the
  // system client (cross-tenant enumeration must never ride the RLS-scoped tenant pool); the tenant-
  // scoped notify handler does the per-workspace work with its own dedup claims, so a re-fired sweep
  // is idempotent.
  const sweepWorkspaces = async (type: "voice_digest" | "trial_ending" | "run_digest", grainKey: string) => {
    const res = await systemExec.query(`select id from workspaces order by id`, []);
    for (const w of res.rows as { id: string }[]) {
      await deps.queue.send(
        "notify",
        { type, workspaceId: w.id },
        { singletonKey: `notify:${type}:${w.id}:${grainKey}` },
      );
    }
  };
  await boss.work("notify.sweep.weekly", async () => {
    await sweepWorkspaces("voice_digest", new Date().toISOString().slice(0, 10));
  });
  await boss.schedule("notify.sweep.weekly", "45 4 * * 1"); // Mondays 04:45 UTC — the voice-stale digest
  await boss.work("notify.sweep.daily", async () => {
    await sweepWorkspaces("trial_ending", new Date().toISOString().slice(0, 10));
  });
  await boss.schedule("notify.sweep.daily", "50 4 * * *"); // daily — the day-12 trial + payment-failed scan
  await boss.work("notify.sweep.hourly", async () => {
    await sweepWorkspaces("run_digest", new Date().toISOString().slice(0, 13));
  });
  await boss.schedule("notify.sweep.hourly", "55 * * * *"); // hourly — the optional run-finished digest

  // PRB.16 — the auth-mail transport (magic links). A plain `to/subject/text/html` send — no notification
  // delivery row (pre-auth mail has no workspace). Unconfigured mailer ⇒ drop (the api's enqueue remains
  // as a dead-letter-visible claim; Resend is PRB.16's deferred live leg).
  await boss.work("auth.mail", async (jobs) => {
    for (const job of jobs) {
      const p = job.data as { to: string; subject: string; text: string; html: string };
      if (!deps.mailer) {
        console.log(`[worker] auth.mail dropped (no mailer configured): to=${p.to}`);
        continue;
      }
      await deps.mailer.send({ to: p.to, subject: p.subject, text: p.text, html: p.html });
    }
  });

  // P1.18 — the account-export build (REQ-ACCT-3): re-reads the account_exports row, builds the zip
  // via @rhema/archive, stores it content-addressed, mints the 7-day token, emails the link. The
  // handler never throws on a deterministic failure (the row lands `failed`; a fresh request
  // starts a new build) — a throw would burn retries on a build that cannot succeed.
  const accountExportDeps: WorkerAccountExportDeps = {
    systemExec,
    contentStoreFor: deps.contentStoreFor,
    clock,
    ...(deps.mailer ? { mailer: deps.mailer } : {}),
    ...(deps.emailFrom ? { emailFrom: deps.emailFrom } : {}),
    // the emailed link hits the API's token-gated /export/download (the web app proxies it).
    ...(env.apiPublicUrl ? { linkBaseUrl: env.apiPublicUrl } : env.appBaseUrl ? { linkBaseUrl: env.appBaseUrl } : {}),
  };
  await boss.work<AccountExportJobPayload>(ACCOUNT_EXPORT_QUEUE, async (jobs) => {
    for (const job of jobs) {
      const r = await handleAccountExport(accountExportDeps, job.data);
      console.log(`[worker] account.export ${job.data.exportId} → ${JSON.stringify(r)}`);
    }
  });

  // P1.20 — the account hard-delete (REQ-ACCT-4; §13.3): the api enqueues it at the grace end when
  // the user confirms; the handler re-checks the marker (a cancel inside grace no-ops), then past
  // grace destroys content + PII while retaining anonymized ledger/usage rows + the billing account.
  await boss.work<AccountHardDeleteJob>(ACCOUNT_HARD_DELETE_JOB, async (jobs) => {
    for (const job of jobs) {
      const r = await handleAccountHardDelete(job.data, { systemExec });
      console.log(`[worker] account.hard-delete ${job.data.userId} → ${JSON.stringify(r)}`);
    }
  });

  // STB.2 / D-P1.04-2 — the project tombstone's purge sweep (REQ-ARCH-28): the api enqueues at
  // delete + 30d; the handler re-reads `projects.deleted_at` (a restore no-ops; a re-delete
  // re-schedules off the CURRENT tombstone) and past grace hard-deletes the project tree (the
  // `projects` cascade) + the now-unreferenced content-addressed object keys.
  const purgeBlobs = await createGcsBlobStore(env.objectsBucket);
  await boss.work<ProjectPurgeJob>(PROJECT_PURGE_JOB, async (jobs) => {
    for (const job of jobs) {
      const r = await handleProjectPurge(job.data, { systemExec, queue: deps.queue, blobs: purgeBlobs });
      console.log(`[worker] project.purge ${job.data.projectId} → ${JSON.stringify(r)}`);
    }
  });

  console.log("[worker] run-lifecycle consumers + crons registered");
}

// Run when invoked as the container entrypoint (`node dist/main.js`), not when imported.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  startWorker().catch((err: unknown) => {
    console.error("[worker] failed to start:", err);
    process.exit(1);
  });
}

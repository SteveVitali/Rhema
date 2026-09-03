// The LIVE api entrypoint (D-P0.08-1 / D-P0.08b-1): construct every orchestrator DI seam against real
// infrastructure and serve `createApp(deps)`. This is the "constructed at deploy" call-site — a thin composition
// over @rhema/live-clients (the pg/Redis/pg-boss/Secret-Manager bindings) + @rhema/ledger + @rhema/mirror +
// @rhema/obligations. It runs in the Cloud Run `api` service; the route layer + every seam are fully
// unit-tested in-process, so this file is wiring only (it is not exercised offline — it needs a live deploy).

import { serve } from "@hono/node-server";
import pg from "pg";
import { Redis } from "ioredis";
import { PgBoss } from "pg-boss";
import {
  SqlEventWriter,
  Rs256RunTokenService,
  systemClock,
  randomUlids,
  RUN_JOBS,
} from "@rhema/orchestrator";
import { SqlHoldLedger, circuitBreakerState } from "@rhema/ledger";
import { createGcsContentStore } from "@rhema/mirror";
import { createObligationMountProvider, SqlObligationHook } from "@rhema/obligations";
import {
  PgPoolTxRunner,
  RedisHeartbeatStore,
  RedisRunEventBus,
  PgBossQueue,
  loadRs256KeysFromSecretManager,
  createSecretAccessor,
} from "@rhema/live-clients";
import { createApp, type ApiDeps } from "./index.js";
import { readApiEnv, type ApiEnv } from "./env.js";
import type { Principal } from "./run-routes.js";

/**
 * Resolve the run-creation principal from the request. The DEPLOY shim reads the identity headers the gateway
 * (IAP / the auth service) injects after a verified session; the full Better Auth session → workspace/billing
 * resolution is D-P0.01-3. Returns null (401) when the identity is absent.
 */
function headerPrincipal(c: { req: { header(name: string): string | undefined } }): Principal | null {
  const userId = c.req.header("x-rhema-user-id");
  const workspaceId = c.req.header("x-rhema-workspace-id");
  const billingAccountId = c.req.header("x-rhema-billing-account-id");
  if (!userId || !workspaceId || !billingAccountId) return null;
  return { userId, workspaceId, billingAccountId };
}

/** Build the live api deps from the environment (constructs the heavy clients). */
export async function buildApiDeps(env: ApiEnv): Promise<{ deps: ApiDeps; boss: PgBoss; pool: pg.Pool }> {
  const pool = new pg.Pool({ connectionString: env.databaseUrl });
  const redis = new Redis(env.redisUrl);
  const subscriber = redis.duplicate(); // a subscriber connection cannot issue other commands (§12.5)
  const boss = new PgBoss(env.databaseUrl);

  const clock = systemClock;
  const ids = randomUlids();

  const access = await createSecretAccessor();
  const keys = await loadRs256KeysFromSecretManager(access, {
    privateKeyName: env.runTokenPrivateKeySecret,
    publicKeyName: env.runTokenPublicKeySecret,
    ...(env.runTokenKeyId ? { keyId: env.runTokenKeyId } : {}),
  });

  const bus = new RedisRunEventBus(redis, subscriber);
  // A system-scoped SqlClient for the platform-wide circuit-breaker read (credit_ledger across accounts). The
  // deploy connects the api's pool as a role able to read it (the breaker is platform-wide, not tenant-scoped).
  const systemExec = {
    query: (sql: string, params?: readonly unknown[]) =>
      pool.query(sql, params ? [...params] : undefined).then((r) => ({ rows: r.rows as unknown[] })),
  };
  const deps: ApiDeps = {
    txRunner: new PgPoolTxRunner(pool),
    eventWriter: new SqlEventWriter(bus), // post-commit user-event fan-out over Redis
    clock,
    ids,
    heartbeats: new RedisHeartbeatStore(redis),
    tokens: new Rs256RunTokenService(keys, clock),
    ledger: new SqlHoldLedger({ ids, clock }),
    queue: new PgBossQueue(boss),
    obligationMount: createObligationMountProvider(),
    // the obligation spawn/join hook, constructed into the delivery transaction (D-P0.12-1).
    obligationHook: new SqlObligationHook({ ids, clock, appendEvent: new SqlEventWriter(bus) }),
    // the SSE tail subscribes to the same Redis bus for the post-commit wakeup (replay-then-tail from Postgres).
    eventSubscriber: bus,
    // write-only content store: gate write-back overlays put versioned bytes (tenant-explicit; REQ-SPEC-9).
    store: await createGcsContentStore({ bucketName: env.objectsBucket }),
    // a per-run workspace-bound store for delivery reads (a run is single-tenant; D-P0.09-1).
    contentStoreFor: (workspaceId: string) => createGcsContentStore({ bucketName: env.objectsBucket, workspaceId }),
    circuitBreaker: (now: Date) => circuitBreakerState(systemExec, now).then((s) => ({ capMultiplier: s.capMultiplier })),
    principal: headerPrincipal,
  };
  return { deps, boss, pool };
}

/** Start the live api server. */
export async function startApiServer(): Promise<void> {
  const env = readApiEnv();
  const { deps, boss } = await buildApiDeps(env);

  // pg-boss requires each queue to exist before a send; the api sends to the run.* queues (the worker also
  // creates them — createQueue is idempotent).
  await boss.start();
  for (const name of Object.values(RUN_JOBS)) await boss.createQueue(name);

  const app = createApp(deps);
  const server = serve({ fetch: app.fetch, port: env.port }) as unknown as {
    keepAliveTimeout: number;
    headersTimeout: number;
    requestTimeout: number;
  };
  // SSE runs are long-lived: no request timeout, and a keep-alive above the ping cadence so the LB holds the
  // connection open (§12.5; D-P0.08b-1).
  server.requestTimeout = 0;
  server.keepAliveTimeout = env.sseIdleTimeoutMs;
  server.headersTimeout = env.sseIdleTimeoutMs + 5_000;
  console.log(`[api] listening on :${env.port}`);
}

// Run when invoked as the container entrypoint (`node dist/server.js`), not when imported.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  startApiServer().catch((err: unknown) => {
    console.error("[api] failed to start:", err);
    process.exit(1);
  });
}

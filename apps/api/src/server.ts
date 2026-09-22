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
import { SqlHoldLedger, circuitBreakerState, recordAnalyticsEvent, STRIPE_EVENT_JOB } from "@rhema/ledger";
import { createGcsContentStore } from "@rhema/mirror";
import { createObligationMountProvider, SqlObligationHook } from "@rhema/obligations";
import {
  PgPoolTxRunner,
  RedisHeartbeatStore,
  RedisRunEventBus,
  PgBossQueue,
  loadRs256KeysFromSecretManager,
  createSecretAccessor,
  fetchGceMetadataIdToken,
  createStorageV4SignedUrlProvider,
  createGcsObjects,
  createConvertJobPreview,
} from "@rhema/live-clients";
import {
  createApp,
  createAuth,
  createServiceExportRunner,
  createScopedDb,
  resolveSessionPrincipal,
  sessionScopedPrincipal,
  sessionTokenFromCookieHeader,
  type ApiDeps,
  type BetaApiDeps,
} from "./index.js";
import { provisionPersonalAccount } from "./signup.js";
import { readApiEnv, type ApiEnv } from "./env.js";
import type { SqlClient } from "./invite.js";

/** Build the live api deps from the environment (constructs the heavy clients). */
export async function buildApiDeps(env: ApiEnv): Promise<{ deps: ApiDeps; boss: PgBoss; pool: pg.Pool }> {
  const pool = new pg.Pool({ connectionString: env.databaseUrl });
  const redis = new Redis(env.redisUrl);
  const subscriber = redis.duplicate(); // a subscriber connection cannot issue other commands (§12.5)
  const boss = new PgBoss(env.databaseUrl);

  // Crash-resilience (diagnosed live P0.15h — the api exited 1 on a transient AlloyDB connect timeout over
  // Cloud Run Direct-VPC egress, which pg-boss/pg surface as an EMITTED 'error' event; an unhandled emitter
  // 'error' throws and kills the process). Handle them non-fatally, exactly as the worker does — a transient
  // pool/boss/redis error must not take the api down; the next query/poll reconnects.
  pool.on("error", (err: unknown) => console.error("[api] pg pool error (non-fatal):", err instanceof Error ? err.message : err));
  boss.on("error", (err: unknown) => console.error("[api] pg-boss error (non-fatal):", err instanceof Error ? err.message : err));
  redis.on("error", (err: unknown) => console.error("[api] redis error (non-fatal):", err instanceof Error ? err.message : err));
  subscriber.on("error", (err: unknown) => console.error("[api] redis subscriber error (non-fatal):", err instanceof Error ? err.message : err));

  const clock = systemClock;
  const ids = randomUlids();

  const access = await createSecretAccessor();
  const keys = await loadRs256KeysFromSecretManager(access, {
    privateKeyName: env.runTokenPrivateKeySecret,
    publicKeyName: env.runTokenPublicKeySecret,
    ...(env.runTokenKeyId ? { keyId: env.runTokenKeyId } : {}),
  });
  // PRB.08: the Stripe webhook signing secret lives in Secret Manager like the run-token keys — the api loads
  // it at boot; it never appears as a plaintext env var. Unset ⇒ the webhook route 404s (beta off).
  const stripeWebhookSecret = env.stripeWebhookSecretName
    ? await access(env.stripeWebhookSecretName)
    : undefined;
  // PRB.09: the one-click email-action HMAC key is a Secret Manager secret like the run-token keys — the api
  // verifies at /api/action/<token>; unset ⇒ the route 404s (notification emails are not minted either — the
  // worker holds the same seam).
  const emailActionSecret = env.emailActionSecretName ? await access(env.emailActionSecretName) : undefined;
  const notificationConfig =
    emailActionSecret && env.apiPublicUrl && env.appBaseUrl
      ? { actionSecret: emailActionSecret, apiBaseUrl: env.apiPublicUrl, appBaseUrl: env.appBaseUrl }
      : undefined;

  // PRB.16 — the live auth binding (D-P0.01-3). The account-side client is the RAW pool: `user`/`session`/
  // `account`/`verification`/`workspaces`/`workspace_members`/`billing_accounts`/`invites` are account
  // tables — NOT workspace-keyed, so FORCE RLS never applies to them and no tenant context is needed.
  // (Tenant-keyed tables on the same unscoped client answer EMPTY under FORCE RLS — deny by default.)
  const rawDb: SqlClient = {
    query: (sql, params) => pool.query(sql, params ? [...params] : undefined),
  };
  const queue = new PgBossQueue(boss);

  // PRB.16 — Better Auth mounts only when all three secrets are configured (Secret-Manager NAMES, values
  // loaded at boot). `baseURL` is the APP origin: the web service proxies `/api/auth/*` server-side, so
  // the OAuth callback (`<app>/api/auth/callback/google`) and every auth cookie live on `rhema.tools`.
  // A partial config leaves the surface 404 — a half-mounted auth is worse than none.
  const authSecretsReady =
    env.betterAuthSecretName && env.googleOauthClientId && env.googleOauthClientSecretName && env.appBaseUrl;
  const auth = authSecretsReady
    ? createAuth(
        {
          baseURL: env.appBaseUrl!,
          betterAuthSecret: await access(env.betterAuthSecretName!),
          googleClientId: env.googleOauthClientId!,
          googleClientSecret: await access(env.googleOauthClientSecretName!),
          // the api's own origin stays trusted for direct hits (runbook smoke, health probes of the auth
          // surface); the app origin is baseURL-implied but listed for clarity.
          trustedOrigins: [env.appBaseUrl!, ...(env.apiPublicUrl ? [env.apiPublicUrl] : [])],
        },
        pool, // Better Auth's Kysely adapter accepts a pg.Pool directly.
        // magic-link send → the worker's `auth.mail` queue (Resend is PRB.16's deferred leg — the
        // enqueue still runs so the transport claim exists for a later re-drive).
        async ({ email, url }) => {
          await queue.send("auth.mail", {
            to: email,
            subject: "Sign in to Rhema",
            text: `Sign in to Rhema: ${url}`,
            html: `<p><a href="${url}">Sign in to Rhema</a></p>`,
          });
        },
        {
          // self-serve paths that never pass through POST /signup provision the same account rows here
          // (a session principal needs the personal-workspace membership row to resolve).
          onUserCreate: async (u) => {
            await provisionPersonalAccount(rawDb, ids, u.id);
          },
        },
      )
    : undefined;

  const bus = new RedisRunEventBus(redis, subscriber);
  // The platform-wide circuit-breaker read (credit_ledger across accounts) must NOT run on the user-facing
  // `pool` if that role bypasses RLS — that would disable tenant isolation on user requests. Use a SEPARATE
  // elevated connection when `systemDatabaseUrl` is set (so `pool` can stay a restricted RLS-enforced role); if
  // it is unset the breaker is disabled and caps are left unscaled (a safe default, not a tenant hole).
  const systemPool = env.systemDatabaseUrl ? new pg.Pool({ connectionString: env.systemDatabaseUrl }) : null;
  const systemExec = systemPool
    ? {
        query: (sql: string, params?: readonly unknown[]) =>
          systemPool.query(sql, params ? [...params] : undefined).then((r) => ({ rows: r.rows as unknown[] })),
      }
    : null;
  const txRunner = new PgPoolTxRunner(pool);
  // PRB.20 — the artifacts-bucket content store doubles as the imported-draft byte store (the draft create
  // path writes content-addressed markdown there); hoist so `store` (write-back overlays) and `contentStore`
  // (import) share one binding.
  const artifactsStore = await createGcsContentStore({ bucketName: env.objectsBucket });
  const deps: ApiDeps & BetaApiDeps = {
    txRunner,
    eventWriter: new SqlEventWriter(bus), // post-commit user-event fan-out over Redis
    clock,
    ids,
    heartbeats: new RedisHeartbeatStore(redis),
    tokens: new Rs256RunTokenService(keys, clock),
    ledger: new SqlHoldLedger({ ids, clock }),
    queue,
    obligationMount: createObligationMountProvider(),
    // the obligation spawn/join hook, constructed into the delivery transaction (D-P0.12-1).
    obligationHook: new SqlObligationHook({ ids, clock, appendEvent: new SqlEventWriter(bus) }),
    // the SSE tail subscribes to the same Redis bus for the post-commit wakeup (replay-then-tail from Postgres).
    eventSubscriber: bus,
    // write-only content store: gate write-back overlays put versioned bytes (tenant-explicit; REQ-SPEC-9).
    store: artifactsStore,
    // a per-run workspace-bound store for delivery reads (a run is single-tenant; D-P0.09-1).
    contentStoreFor: (workspaceId: string) => createGcsContentStore({ bucketName: env.objectsBucket, workspaceId }),
    // PRB.20 — the live ingestion bindings (D-PRB.02-1). `contentStore` is the imported-draft byte sink;
    // `importUploads` + `importConverter` are the presign/convert legs — BOTH env vars gate the mount, so a
    // partial deploy config leaves import unmounted rather than half-wired (fail-closed).
    contentStore: artifactsStore,
    ...(env.userContentBucket
      ? {
          importUploads: {
            provider: await createStorageV4SignedUrlProvider(),
            bucket: env.userContentBucket,
          },
        }
      : {}),
    ...(env.userContentBucket && env.convertJob
      ? {
          importConverter: createConvertJobPreview({
            job: env.convertJob,
            bucket: env.userContentBucket,
            objects: await createGcsObjects(env.userContentBucket),
            ...(env.convertJobRoot ? { mountPath: env.convertJobRoot } : {}),
          }),
        }
      : {}),
    ...(systemExec ? { circuitBreaker: (now: Date) => circuitBreakerState(systemExec, now).then((s) => ({ capMultiplier: s.capMultiplier })) } : {}),
    // PRB.08 billing: the system-scoped exec for the `stripe_events` intake (a system table — the restricted
    // user pool must not own it), the webhook secret, and the beta Payment Link.
    ...(systemExec ? { systemExec } : {}),
    ...(stripeWebhookSecret ? { stripeWebhookSecret } : {}),
    ...(env.stripePaymentLinkUrl ? { paymentLinkUrl: env.stripePaymentLinkUrl } : {}),
    // PRB.09 — the signed-action config the notification routes consume (+ the OrchestratorDeps field the
    // notify path uses when the api process itself schedules/emits).
    ...(notificationConfig ? { notifications: notificationConfig } : {}),
    // PRB.11 — the export seam: markdown+format → the isolated export container → bytes. Unset ⇒ POST
    // /export answers 503 `export_not_wired` (dialog + statement reads still work).
    ...(env.exportServiceUrl
      ? // The export service is invoker-gated — mint an OIDC ID token per hop (metadata server,
        // audience = the service root). LIVE FINDING 11.
        { exportRunner: createServiceExportRunner(env.exportServiceUrl, fetch, fetchGceMetadataIdToken) }
      : {}),
    // PRB.13 — `signup.mode` (REQ-BETA-19 amended): stage-config-driven; the routes it gates (POST
    // /signup, the verified-email run gate) mount when `db` is bound — the live tenant binding itself
    // stays D-PRB.01-3's leg (PRB.16).
    signupMode: env.signupMode,
    // PRB.08 — the analytics sink exists now (analytics_events, 0020): bind the api's two deferred
    // telemetry emitters to the same validated + opt-out-honoring writer the billing telemetry uses.
    // finding.disposed (D-PRB.05-1 leg b) + run.estimated (D-PRB.03-1's emit leg). A telemetry write is
    // fire-and-forget after the response work — a failure is logged, never fatal to the request.
    emitDisposed: (e) => {
      void txRunner
        .run(e.workspaceId, (tx) =>
          recordAnalyticsEvent(tx, { ids, clock }, {
            userId: e.userId,
            workspaceId: e.workspaceId,
            projectId: e.projectId,
            event: "finding.disposed",
            props: {
              disposition: e.disposition,
              ...(e.reason_code !== undefined ? { reason_code: e.reason_code } : {}),
            },
          }),
        )
        .catch((err: unknown) =>
          console.error("[api] finding.disposed analytics failed:", err instanceof Error ? err.message : err),
        );
    },
    emitEstimated: (ctx, event) => {
      void txRunner
        .run(ctx.principal.workspaceId, (tx) =>
          recordAnalyticsEvent(tx, { ids, clock }, {
            userId: ctx.principal.userId,
            workspaceId: ctx.principal.workspaceId,
            projectId: ctx.projectId,
            event: "run.estimated",
            props: { ...event },
          }),
        )
        .catch((err: unknown) =>
          console.error("[api] run.estimated analytics failed:", err instanceof Error ? err.message : err),
        );
    },
    // the harness run-spec sizing config (residue 2 / D-P0.15c-6): the per-run USD ceiling the per-phase SDK
    // budget brake is taken against, and the skills image path. Unset ⇒ the runspec defaults ($10, /app/skills);
    // the outer `capCredits` hold is the hard ceiling regardless.
    ...(env.maxUsdPerRun !== undefined || env.skillsDir !== undefined
      ? {
          runSpecConfig: {
            ...(env.maxUsdPerRun !== undefined ? { maxUsdPerRun: env.maxUsdPerRun } : {}),
            ...(env.skillsDir !== undefined ? { skillsDir: env.skillsDir } : {}),
          },
        }
      : {}),
    // PRB.16 — the live session binding (D-P0.01-3): `principal` reads the request-scoped principal the
    // session middleware resolved (cookie → session row → personal-workspace membership); `db` is the
    // tenant-scoped client the account routes consume (signup/invite/userEmailVerified); `auth` mounts
    // the Better Auth surface at /api/auth/*.
    principal: sessionScopedPrincipal,
    db: createScopedDb(pool),
    sessionResolver: async (req) => {
      const token = sessionTokenFromCookieHeader(req.headers.get("cookie") ?? undefined);
      return token ? resolveSessionPrincipal(rawDb, token) : null;
    },
    ...(auth ? { auth: { handler: (req: Request) => auth.handler(req) } } : {}),
    // dev/preview ONLY (never prod — env guard): trust the forgeable x-rhema-* identity headers.
    ...(env.identityHeaders ? { identityHeaders: true } : {}),
    // the CSRF origin allowlist for mutations (single-zone: usercontent.* is same-site; SameSite=Lax
    // alone can't stop a user-content page from POSTing to the api with credentials).
    allowedOrigins: [env.appBaseUrl, env.apiPublicUrl].filter((o): o is string => !!o),
  };
  return { deps, boss, pool };
}

/** Start the live api server. */
export async function startApiServer(): Promise<void> {
  const env = readApiEnv();
  const { deps, boss } = await buildApiDeps(env);

  // pg-boss requires each queue to exist before a send; the api sends to the run.* queues (the worker also
  // creates them — createQueue is idempotent). The startup connection BURST can hit a transient AlloyDB connect
  // timeout over Cloud Run Direct-VPC egress (a throw here escapes → exit(1) → a slow restart loop, live
  // P0.15h); retry the idempotent init a few times with backoff so one slow connect does not crash the api
  // before it listens (mirrors the worker).
  const retryStartup = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        await fn();
        return;
      } catch (err) {
        lastErr = err;
        console.error(`[api] startup ${label} attempt ${attempt} failed (will retry):`, err instanceof Error ? err.message : err);
        await new Promise((r) => setTimeout(r, Math.min(1000 * attempt, 5000)));
      }
    }
    throw lastErr;
  };
  await retryStartup("boss.start", () => boss.start());
  for (const name of [...Object.values(RUN_JOBS), STRIPE_EVENT_JOB, "notify", "mail.send", "auth.mail"]) {
    await retryStartup(`createQueue ${name}`, () => boss.createQueue(name));
  }

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

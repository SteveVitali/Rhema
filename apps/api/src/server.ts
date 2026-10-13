// The LIVE api entrypoint (D-P0.08-1 / D-P0.08b-1): construct every orchestrator DI seam against real
// infrastructure and serve `createApp(deps)`. This is the "constructed at deploy" call-site — a thin composition
// over @rhema/live-clients (the pg/Redis/pg-boss/Secret-Manager bindings) + @rhema/ledger + @rhema/mirror +
// @rhema/obligations. It runs in the Cloud Run `api` service; the route layer + every seam are fully
// unit-tested in-process, so this file is wiring only (it is not exercised offline — it needs a live deploy).

import { serve } from "@hono/node-server";
import { randomUUID } from "node:crypto";
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
import { USER_SERVING_ROLE } from "@rhema/db";
import { SqlHoldLedger, circuitBreakerState, recordAnalyticsEvent, STRIPE_EVENT_JOB, FetchStripePort, settleUnverifiedDelivery, loadEstimatorCells } from "@rhema/ledger";
import { setInstrumentedOverride, type EstimatorSpec } from "@rhema/protocols";
import { createGcsContentStore, createGcsRestoreBlobStore } from "@rhema/mirror";
import { createObligationMountProvider, SqlObligationHook } from "@rhema/obligations";
import {
  PgPoolTxRunner,
  RedisHeartbeatStore,
  RedisRunEventBus,
  PgBossQueue,
  loadRs256KeysFromSecretManager,
  createSecretAccessor,
  fetchGceMetadataIdToken,
  fetchGceMetadataInstanceId,
  createStorageV4SignedUrlProvider,
  createGcsV4GetPresigner,
  createGcsObjects,
  createGcsBlobStore,
  createConvertJobPreview,
  createConvertServicePreview,
  createFetcherServicePort,
  createImportPreviewTracker,
} from "@rhema/live-clients";
import {
  createApp,
  createAuth,
  createServiceExportRunner,
  createScopedDb,
  resolveSessionPrincipal,
  sessionScopedPrincipal,
  sessionTokenFromCookieHeader,
  createInviteGate,
  type ApiDeps,
  type BetaApiDeps,
} from "./index.js";
import {
  createFallbackIpEmailThrottle,
  createIpEmailThrottle,
  createRedisThrottleStore,
  createSharedIpEmailThrottle,
} from "@rhema/contracts";
import { provisionPersonalAccount, SIGNUP_THROTTLE_DEFAULTS } from "./signup.js";
import { MAGIC_LINK_THROTTLE_DEFAULTS } from "./auth.js";
import { magicLinkSender } from "./magic-link-email.js";
import { createGcpOidcVerifier } from "./gcp-oidc.js";
import { createShowcaseSeeder } from "./showcase.js";
import { readApiEnv, type ApiEnv } from "./env.js";
import type { SqlClient } from "./invite.js";
import { SqlEstimateCacheStore } from "./estimate-cache.js";
import { createProxyClaimPrePass } from "./claim-prepass.js";

/** Build the live api deps from the environment (constructs the heavy clients). */
export async function buildApiDeps(env: ApiEnv): Promise<{ deps: ApiDeps; boss: PgBoss; pool: pg.Pool }> {
  const pool = new pg.Pool({ connectionString: env.databaseUrl });
  const redis = new Redis(env.redisUrl);
  const subscriber = redis.duplicate(); // a subscriber connection cannot issue other commands (§12.5)
  // SEC.1 — pg-boss owns its `pgboss` schema (CREATE/migrate on start); the user-serving role holds
  // no grant there, so the api's queue transport rides the SYSTEM DSN like the worker's. Falling
  // back to `databaseUrl` fails closed: under `rhema_app_login` the schema-touching start() throws
  // instead of silently bypassing.
  const boss = new PgBoss(env.systemDatabaseUrl ?? env.databaseUrl);

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
  // SEC.2 — the serving-instance id stamped on `x-rhema-instance` (Stage-B evidence: the cross-instance
  // throttle leg records WHICH instances served the 400→429 sequence). The metadata `instance/id` when
  // the runtime has it; a per-boot UUID otherwise (off-GCP the header still discriminates processes).
  const instanceId = (await fetchGceMetadataInstanceId()) ?? `boot-${randomUUID()}`;

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
  // P1.16: the Stripe Billing key is a Secret-Manager secret the same way — loaded at boot into the thin
  // REST port (no SDK). A seeded PLACEHOLDER value counts as unconfigured (PRB.17 pattern); unset ⇒ the
  // Checkout/Portal routes answer 503 `stripe_unconfigured` — never a session that pretends a charge exists.
  const stripeKeySecret = env.stripeSecretKeyName ? await access(env.stripeSecretKeyName) : undefined;
  const stripeKey = stripeKeySecret && !/placeholder/i.test(stripeKeySecret) ? stripeKeySecret : undefined;
  if (stripeKeySecret && !stripeKey) {
    console.log("[api] STRIPE secret is a placeholder — Checkout/Portal stay 503 stripe_unconfigured");
  }
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

  // SEC.2 (D-PRB.13-1 closed; ADR-039/040) — the signup + magic-link throttles share the Redis store:
  // one bucket per (ip|email) across ALL api instances (an atomic INCR+PEXPIRE Lua — no check-then-set
  // race). ADR-039's outage posture is `createFallbackIpEmailThrottle`: a store failure degrades to the
  // per-instance map for the rest of the process — never unlimited, never fail-closed on signup — and
  // logs ONCE per instance with the error KIND only (no emails/IPs in the log line, invariant #10).
  const throttleStore = createRedisThrottleStore(redis);
  const degraded = (label: string) => (err: unknown) =>
    console.error(
      `[api] ${label} throttle degraded to per-instance limits (store unavailable):`,
      err instanceof Error ? err.message : err,
    );
  const signupThrottle = createFallbackIpEmailThrottle(
    createSharedIpEmailThrottle(throttleStore, { ...SIGNUP_THROTTLE_DEFAULTS, keyPrefix: "rl:signup" }),
    createIpEmailThrottle({ ...SIGNUP_THROTTLE_DEFAULTS }),
    { onDegraded: degraded("signup") },
  );
  const magicLinkThrottle = createFallbackIpEmailThrottle(
    createSharedIpEmailThrottle(throttleStore, { ...MAGIC_LINK_THROTTLE_DEFAULTS, keyPrefix: "rl:magiclink" }),
    createIpEmailThrottle({ ...MAGIC_LINK_THROTTLE_DEFAULTS }),
    { onDegraded: degraded("magic-link") },
  );
  // SEC.2 (ADR-040) — the trusted client-IP channel: the web stamps `x-rhema-client-ip` and proves it
  // with its runtime SA's OIDC token (`x-rhema-internal-token`). The verifier checks the signature
  // against Google's JWKS + iss/aud/exp/the caller SA — unset ⇒ the stamp is never honored.
  const verifyInternalToken = env.internalAuthAudience
    ? createGcpOidcVerifier({
        audience: env.internalAuthAudience,
        ...(env.internalCallerSa ? { email: env.internalCallerSa } : {}),
      })
    : undefined;

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
        // enqueue still runs so the transport claim exists for a later re-drive). UX.1: the branded
        // template — macron'd Rhēma, a real button + text fallback, the configured expiry, the
        // ignore-it safety line, and a per-send nonce subject (distinct per send; never the token).
        magicLinkSender(queue),
        {
          // SEC.2 (REQ-BETA-19 amended) — the SAME admission boundary POST /signup enforces, on every
          // Better Auth creation path: `user.create.before` throttles + mode/invite-checks (throwing a
          // named APIError — no rows left behind), `create.after` consumes the invite at creation, and
          // `hooks.before` throttles + pre-gates the magic-link SEND so a direct /api/auth call cannot
          // bypass the /login limit or enqueue mail for an unadmitted email.
          admission: {
            mode: env.signupMode,
            inviteGate: createInviteGate(rawDb),
            knownUser: async (email) => {
              const r = await rawDb.query(`select id from "user" where email = $1`, [email.toLowerCase()]);
              return r.rows.length > 0;
            },
            accountThrottle: signupThrottle,
            magicLinkThrottle,
            ...(verifyInternalToken ? { verifyInternalToken } : {}),
          },
          // self-serve paths that never pass through POST /signup provision the same account rows here
          // (a session principal needs the personal-workspace membership row to resolve) — and P1.17's
          // Showcase seed rides the same provision (§15.4, the $0 fixture dossier).
          onUserCreate: async (u) => {
            await provisionPersonalAccount(rawDb, ids, u.id, {
              seedShowcase: createShowcaseSeeder({
                txRunner,
                ids,
                store: artifactsStore,
              }),
              // JOURNEY.1 — test-mailbox flagging on the self-serve paths (OAuth/magic-link) too.
              ...(env.testMailbox ? { testMailbox: env.testMailbox } : {}),
            });
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
  // SEC.1 (REQ-SPEC-30) — belt-and-suspenders: the api's tenant transactions pin `rhema_app_login`
  // transaction-locally, so a `DATABASE_URL` mistakenly pointed at a BYPASSRLS role still runs the
  // user surface under the non-bypass role. (`DATABASE_URL` itself is repointed by the deploy —
  // infra/pulumi — this pin is the second layer.)
  const txRunner = new PgPoolTxRunner(pool, { role: USER_SERVING_ROLE });
  // ECON.1 — boot-load the durable estimator cells into the override map: the API is the estimating
  // process, so a folded spec the worker wrote must govern ITS prices too. The estimator_cells table is
  // user-role SELECTable (0049); read it on the ordinary pool so the cells load even where no
  // SYSTEM_DATABASE_URL exists (a preview stage). Non-fatal — the modeled base still prices.
  try {
    const bootExec: SqlClient = systemExec ?? {
      query: (sql: string, params?: readonly unknown[]) =>
        pool.query(sql, params ? [...params] : undefined).then((r) => ({ rows: r.rows as unknown[] })),
    };
    for (const cell of await loadEstimatorCells(bootExec)) {
      setInstrumentedOverride(cell.workflow, cell.spec as EstimatorSpec);
    }
  } catch (err) {
    console.warn("[api] estimator_cells load failed — modeled estimators govern:", err);
  }
  // Hoisted so RES.2's `settleUnverified` closure binds the same ledger + writer the run paths use.
  const holdLedger = new SqlHoldLedger({ ids, clock });
  const runEventWriter = new SqlEventWriter(bus);
  // PRB.20 — the artifacts-bucket content store doubles as the imported-draft byte store (the draft create
  // path writes content-addressed markdown there); hoist so `store` (write-back overlays) and `contentStore`
  // (import) share one binding.
  const artifactsStore = await createGcsContentStore({ bucketName: env.objectsBucket });
  // P1.08 — the restore/ blob store for the version-rail's preview/restore routes (the same objects
  // bucket the collab service writes its update chains into).
  const restoreBlobs = await createGcsRestoreBlobStore(env.objectsBucket);
  const deps: ApiDeps & BetaApiDeps = {
    txRunner,
    eventWriter: runEventWriter, // post-commit user-event fan-out over Redis
    clock,
    ids,
    heartbeats: new RedisHeartbeatStore(redis),
    tokens: new Rs256RunTokenService(keys, clock),
    ledger: holdLedger,
    // RES.2 (REQ-SPEC-31(3)) — the Unverified platform-fault settle for the pod's POST /deliver path:
    // refund + absorb + trial restore commit in their own tx; the ops page stays unbound here (the api
    // owns no alert webhook) — the worker's stranded sweep leg E sends + marks it (`alerted` unset ⇒
    // retried until the worker's bound sink takes it).
    settleUnverified: (a) =>
      settleUnverifiedDelivery({ txRunner, ledger: holdLedger, eventWriter: runEventWriter, ids, clock }, a),
    queue,
    // ECON.1 — `DEBIT_MODE` (default `committed`); the metered-debit flag rides the run paths.
    debitMode: env.debitMode,
    obligationMount: createObligationMountProvider(),
    // the obligation spawn/join hook, constructed into the delivery transaction (D-P0.12-1).
    obligationHook: new SqlObligationHook({ ids, clock, appendEvent: new SqlEventWriter(bus) }),
    // the SSE tail subscribes to the same Redis bus for the post-commit wakeup (replay-then-tail from Postgres).
    eventSubscriber: bus,
    // write-only content store: gate write-back overlays put versioned bytes (tenant-explicit; REQ-SPEC-9).
    store: artifactsStore,
    // a per-run workspace-bound store for delivery reads (a run is single-tenant; D-P0.09-1).
    contentStoreFor: (workspaceId: string) => createGcsContentStore({ bucketName: env.objectsBucket, workspaceId }),
    // P1.08 — the restore-blob store for `restore/`-keyed points (the undo snapshot + Yjs chains).
    restoreBlobs,
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
          importConverter: await (async () => {
            const objects = await createGcsObjects(env.userContentBucket!);
            const job = createConvertJobPreview({
              job: env.convertJob!,
              bucket: env.userContentBucket!,
              objects,
              ...(env.convertJobRoot ? { mountPath: env.convertJobRoot } : {}),
            });
            // ONB.1 (ADR-044) — the warm convert-svc is the interactive preview path (≤20 s for the
            // text formats); the Job is the fallback + the batch leg. Unset ⇒ the pre-ONB.1
            // Job-only posture. The OIDC hop mints per request like the fetcher/export calls.
            return env.convertServiceUrl
              ? createConvertServicePreview({
                  serviceUrl: env.convertServiceUrl,
                  objects,
                  fallback: job,
                  tokenFor: (aud) => fetchGceMetadataIdToken(aud),
                })
              : job;
          })(),
        }
      : {}),
    // P1.15 — the ingestion seams: the fetcher service is the ONLY remote-egress path (invoker-gated;
    // an OIDC token per hop like the export service — LIVE FINDING 11). `ingestBlobs` reads the
    // quarantined export zips. Both unset ⇒ remote providers fail closed; upload/paste/export still
    // work (they carry their own bytes).
    ...(env.fetcherServiceUrl
      ? { ingestFetcher: createFetcherServicePort(env.fetcherServiceUrl, fetch, fetchGceMetadataIdToken) }
      : {}),
    ...(env.userContentBucket
      ? { ingestBlobs: await createGcsBlobStore(env.userContentBucket) }
      : {}),
    // ONB.1 — the presign→preview-ready clock for `import_preview_p95_s` (REQ-ARCH-34): the first-seen
    // stamp lives in Redis so it survives multi-instance polling; telemetry failures degrade to the
    // call's own elapsed, never to a 500.
    importPreviewTiming: createImportPreviewTracker(redis),
    ...(systemExec ? { circuitBreaker: (now: Date) => circuitBreakerState(systemExec, now).then((s) => ({ capMultiplier: s.capMultiplier })) } : {}),
    // PRB.08 billing: the system-scoped exec for the `stripe_events` intake (a system table — the restricted
    // user pool must not own it), the webhook secret, and the beta Payment Link.
    ...(systemExec ? { systemExec } : {}),
    ...(stripeWebhookSecret ? { stripeWebhookSecret } : {}),
    ...(env.stripePaymentLinkUrl ? { paymentLinkUrl: env.stripePaymentLinkUrl } : {}),
    // P1.16 — the Billing port + the app origin Checkout success/cancel URLs bounce through.
    // STB.4 — `stripeApiBaseUrl` points the port at a test-mode edge when configured (default api.stripe.com).
    ...(stripeKey
      ? {
          // BILL.3 — `automatic_tax` stays off until the operator activates a Tax registration
          // (STRIPE_AUTOMATIC_TAX=true on the api); the port never presumes it.
          stripe: env.stripeApiBaseUrl
            ? new FetchStripePort(stripeKey, env.stripeApiBaseUrl, {
                ...(env.stripeAutomaticTax ? { automaticTax: true } : {}),
              })
            : new FetchStripePort(stripeKey, undefined, {
                ...(env.stripeAutomaticTax ? { automaticTax: true } : {}),
              }),
        }
      : {}),
    ...(env.appBaseUrl ? { appBaseUrl: env.appBaseUrl } : {}),
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
    // STB.2 — the account-zip download's presign (P1.18 seam was declared but never bound — the live
    // `/account/export/download` answered 503 `download_unavailable`). v4 GET over the objects bucket
    // (where `handleAccountExport` stores the zip), same signBlob path as the PUT presigner.
    exportPresign: await createGcsV4GetPresigner(env.objectsBucket),
    // PRB.13 — `signup.mode` (REQ-BETA-19 amended): stage-config-driven; the routes it gates (POST
    // /signup, the verified-email run gate) mount when `db` is bound — the live tenant binding itself
    // stays D-PRB.01-3's leg (PRB.16).
    signupMode: env.signupMode,
    // SEC.2 — the SHARED account-creation throttle (Redis; D-PRB.13-1) + the trusted web→api
    // client-IP channel verifier (ADR-040).
    signupThrottle,
    ...(verifyInternalToken ? { verifyInternalToken } : {}),
    // BILL.3 — `purchase.mode` (ADR-028): stage-config-driven, default closed; the is_test allowlist is
    // evaluated per request inside the billing routes.
    purchaseMode: env.purchaseMode,
    // JOURNEY.1 — test-mailbox flagging + the healthz provenance field.
    ...(env.testMailbox ? { testMailbox: env.testMailbox } : {}),
    ...(env.buildGitSha ? { buildGitSha: env.buildGitSha } : {}),
    // OBS.1 — the Cloud Logging trace join field (`projects/<p>/traces/<t>` on every error line).
    ...(process.env.GOOGLE_CLOUD_PROJECT ? { gcpProject: process.env.GOOGLE_CLOUD_PROJECT } : {}),
    // SEC.2 — the `x-rhema-instance` marker (Stage-B cross-instance evidence).
    instanceId,
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
    // DEF.2 (F6; closes D-PRB.03-1) — the estimate service's live seams. `estimate_cache` is
    // tenantless + granted to `rhema_app` (0025), so the store binds unconditionally on the app
    // pool. The claim pre-pass needs BOTH the proxy URL and the elevated exec — the synthetic
    // credential mint writes proxy_* tables the restricted role is intentionally ungranted
    // (0025); a partial config leaves every estimate provisional (the designed degraded posture).
    estimateCache: new SqlEstimateCacheStore(rawDb, ids),
    ...(env.egressProxyUrl && systemExec
      ? {
          claimPrePass: createProxyClaimPrePass({
            proxyBaseUrl: env.egressProxyUrl,
            db: systemExec,
            contentStore: artifactsStore,
            // Stage-B fix: get() needs a workspace-bound store — resolve it per call with the
            // principal's workspace (the unbound `artifactsStore` would throw on every get).
            contentStoreFor: (workspaceId) =>
              createGcsContentStore({ bucketName: env.objectsBucket, workspaceId }),
            ids,
            clock,
          }),
        }
      : {}),
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
    db: createScopedDb(pool, { role: USER_SERVING_ROLE }),
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
  for (const name of [
    ...Object.values(RUN_JOBS),
    STRIPE_EVENT_JOB,
    "notify",
    "mail.send",
    "auth.mail",
    "account.export", // P1.18 — the account-zip build (the worker consumes; both sides createQueue).
    "project.purge", // D-P1.04-2 — the tombstone +30d sweep (the worker consumes; both createQueue).
  ]) {
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

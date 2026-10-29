import { Hono, type Context } from "hono";
import {
  buildRatesPublication,
  createIpEmailThrottle,
  type SignupMode,
  type IpEmailThrottle,
} from "@rhema/contracts";
import {
  createSessionMiddleware,
  createOriginGuard,
  sessionScopedPrincipal,
} from "./auth-context.js";
import { createRunRoutes, type RunApiDeps, type Principal } from "./run-routes.js";
import { createEstimateRoutes, type EstimateApiDeps } from "./estimate-routes.js";
import { createSseRoutes, type SseApiDeps } from "./sse-routes.js";
import { createShellRoutes } from "./project-list.js";
import { createTriageRoutes, type TriageApiDeps } from "./triage-routes.js";
import { createFindingRoutes, type FindingApiDeps } from "./finding-routes.js";
import { createRevisionRoutes, type RevisionApiDeps } from "./revision-routes.js";
import { createVersionRoutes, type VersionApiDeps } from "./version-routes.js";
import { createDossierRoutes, type DossierApiDeps } from "./dossier-routes.js";
import { createEditorRoutes, type EditorApiDeps } from "./editor-routes.js";
import { createBillingRoutes } from "./billing-routes.js";
import { createNotificationRoutes } from "./notification-routes.js";
import { createInviteGate, type SqlClient } from "./invite.js";
import { createSignupRoutes, SIGNUP_THROTTLE_DEFAULTS } from "./signup.js";
import { createImportRoutes, type Converter, type ImportUploadDeps } from "./import.js";
import { createProjectRoutes } from "./project-routes.js";
import { createSearchRoutes } from "./search.js";
import { createSheetContextRoutes } from "./sheet-context.js";
import { createSettingsRoutes } from "./settings-routes.js";
import { createVoiceRoutes } from "./voice-routes.js";
import { createIngestRoutes, type IngestApiDeps, type IngestBlobs } from "./ingest-routes.js";
import { createUserContentRoutes } from "./usercontent-routes.js";
import { createExportRoutes, type ExportRunner } from "./export-routes.js";
import { createAccountExportRoutes } from "./account-export-routes.js";
import { createAnalyticsRoutes } from "./analytics-routes.js";
import { createShowcaseSeeder } from "./showcase.js";
import { createThemeRoutes } from "./theme-routes.js";
import { createTimelineRoutes } from "./timeline-routes.js";
import { createApprovalRoutes, type ApprovalApiDeps } from "./approval-routes.js";
import { createChatRoutes, type ChatApiDeps } from "./chat-routes.js";
import { createOutlineRoutes, type OutlineApiDeps } from "./outline-routes.js";
import { createFigureRoutes, type FigureApiDeps } from "./figure-routes.js";
import { apiOnError, instrumentReads, instrumentStoreFactory, requestContext } from "./observability.js";
import { randomUUID } from "node:crypto";
import type { ContentStore, RestoreBlobStore } from "@rhema/mirror";

// api — Hono REST + SSE. P0.08 adds run creation + the internal run API (run-routes.ts); P0.08b adds the
// viewer-facing run-event SSE route (sse-routes.ts). Both mount when the orchestrator deps are supplied. The
// live deps (a pg pool, Redis heartbeats/subscriber, the pg-boss queue, the JWT service) are constructed at
// deploy; the route layer is fully unit-testable with injected deps.

export { createAuth } from "./auth.js";
export type { AuthSecrets, SendMagicLink } from "./auth.js";
export {
  createSessionMiddleware,
  createOriginGuard,
  createScopedDb,
  sessionTokenFromCookieHeader,
  resolveSessionPrincipal,
  sessionScopedPrincipal,
  headerIdentityPrincipal,
  runWithPrincipal,
  currentPrincipal,
  currentTenant,
  SESSION_COOKIE_NAMES,
} from "./auth-context.js";
export type { SessionMiddlewareOptions, TenantPool } from "./auth-context.js";
export { createRunRoutes } from "./run-routes.js";
export type { RunApiDeps, Principal } from "./run-routes.js";
export { createEstimateRoutes, estimateCacheKey } from "./estimate-routes.js";
export type {
  EstimateApiDeps,
  ClaimPrePass,
  EstimateCacheStore,
  CachedEstimate,
  RunEstimatedEvent,
} from "./estimate-routes.js";
export { createSseRoutes, resolveSseAccess, parseAfterSeq } from "./sse-routes.js";
export type { SseApiDeps } from "./sse-routes.js";
export { createInviteGate } from "./invite.js";
export type { InviteGate, InviteCheck, InviteRejectReason, SqlClient } from "./invite.js";
export { createSignupRoutes, admitSignup, SIGNUP_THROTTLE_DEFAULTS } from "./signup.js";
export type { SignupApiDeps, SignupPolicyDeps, SignupAdmission, SignupRejectReason } from "./signup.js";
export {
  createShellRoutes,
  listProjectStates,
  assembleProjectStateInput,
  projectGroupKey,
  buildStatusLine,
  clampStatusLine,
  type ProjectListRow,
  type ProjectGroupKey,
  type ShellApiDeps,
} from "./project-list.js";
export { createProjectRoutes, slugify } from "./project-routes.js";
export type { ProjectApiDeps } from "./project-routes.js";
export { createSearchRoutes, upsertProjectSearchDoc, indexProjectDoc } from "./search.js";
export type { SearchApiDeps, ProjectSearchHit } from "./search.js";
export {
  createImportRoutes,
  createImportedDraft,
  createOutlineArtifact,
  writeMarkdownArtifact,
  type Converter,
  type ImportApiDeps,
  type ImportUploadDeps,
  type CreatedDraft,
} from "./import.js";
export { createTriageRoutes, loadPretriage } from "./triage-routes.js";
export type { TriageApiDeps } from "./triage-routes.js";
export { createFindingRoutes } from "./finding-routes.js";
export type { FindingApiDeps } from "./finding-routes.js";
export { createRevisionRoutes } from "./revision-routes.js";
export type { RevisionApiDeps } from "./revision-routes.js";
export { createEditorRoutes } from "./editor-routes.js";
export type { EditorApiDeps, EditorFindingDto } from "./editor-routes.js";
export { loadWhatChanged, loadVersionDiff, computeReReviewSeed } from "./what-changed.js";
export type { WhatChangedResult, WhatChangedOutcome, ReReviewSeed, VersionDiffOutcome, VersionDiffResult } from "./what-changed.js";
export { createVersionRoutes } from "./version-routes.js";
export type { VersionApiDeps } from "./version-routes.js";
export { createNotificationRoutes } from "./notification-routes.js";
export type { NotificationApiDeps } from "./notification-routes.js";
export { createVoiceRoutes } from "./voice-routes.js";
export type { VoiceApiDeps } from "./voice-routes.js";
export { createIngestRoutes, INGEST_JOBS, RECONSTRUCT_PRICING } from "./ingest-routes.js";
export type { IngestApiDeps, IngestBlobs } from "./ingest-routes.js";
export { createUserContentRoutes } from "./usercontent-routes.js";
export type { UserContentApiDeps } from "./usercontent-routes.js";
export { loadVoiceStatus, loadPersona, parseSampleSet, personaPhaseCount } from "./voice-status.js";
export { createExportRoutes, createServiceExportRunner } from "./export-routes.js";
export type { ExportApiDeps, ExportRunner } from "./export-routes.js";
export {
  createAccountExportRoutes,
  ACCOUNT_EXPORT_QUEUE,
  ACCOUNT_EXPORT_LINK_TTL_MS,
} from "./account-export-routes.js";
export type { AccountExportApiDeps, AccountExportRow } from "./account-export-routes.js";
export { createDossierRoutes, parseLetterSections } from "./dossier-routes.js";
export type { DossierApiDeps } from "./dossier-routes.js";
export { createTimelineRoutes } from "./timeline-routes.js";
export type { TimelineApiDeps } from "./timeline-routes.js";
export { createApprovalRoutes } from "./approval-routes.js";
export { createChatRoutes } from "./chat-routes.js";
export type { ChatApiDeps } from "./chat-routes.js";
export { createOutlineRoutes } from "./outline-routes.js";
export type { OutlineApiDeps } from "./outline-routes.js";
export type { ApprovalApiDeps } from "./approval-routes.js";
export { createAnalyticsRoutes } from "./analytics-routes.js";
export { createThemeRoutes } from "./theme-routes.js";
// P1.20 — the §14.7 settings routes (account/preferences/data/support-access/deletion/integrations/
// project settings). `logSupportAccess` is the REQ-VIS-11 shared logger the admin CLI calls.
export { createSettingsRoutes, logSupportAccess, ACCOUNT_HARD_DELETE_QUEUE } from "./settings-routes.js";
export type { AnalyticsApiDeps } from "./analytics-routes.js";

/** The deps for the full api app: run creation + internal run API (P0.08) + the run-event SSE route (P0.08b)
 *  + the stateless estimate endpoint (PRB.03). `principal` is shared; the estimate seams are optional. */
export type ApiDeps = RunApiDeps & SseApiDeps & Omit<EstimateApiDeps, "principal">;

/** Extra deps for the beta shell (PRB.01) + draft import (PRB.02) routes. */
export interface BetaApiDeps {
  db?: SqlClient;
  importConverter?: Converter;
  /** PRB.20 — the live presign binding (GCS v4 over the user-content bucket); mounts POST /import/presign. */
  importUploads?: ImportUploadDeps;
  contentStore?: ContentStore;
  ids?: () => string;
  /**
   * PRB.08 billing: a system-scoped client for the `stripe_events` intake (a system table — never the
   * RLS-restricted user pool). Required for the webhook mount; the balance/telemetry routes run on txRunner.
   */
  systemExec?: SqlClient;
  /** the Stripe webhook signing secret (loaded from Secret Manager at boot; never an env on web/collab). */
  stripeWebhookSecret?: string;
  /** the beta Payment Link the exhaustion panel links to (returned by GET /billing/balance). */
  paymentLinkUrl?: string;
  /**
   * P1.16 — the Stripe Billing port (Checkout/Portal/off-session charge). Bound to `FetchStripePort` when
   * `STRIPE_SECRET_KEY` is configured; unset ⇒ `/billing/checkout` + `/billing/portal` answer 503
   * `stripe_unconfigured` (never a fake session that pretends a real charge exists).
   */
  stripe?: import("@rhema/ledger").StripePort;
  /** P1.16 — the app origin Checkout success/cancel URLs bounce through (e.g. `https://rhema.tools`). */
  appBaseUrl?: string;
  /**
   * BILL.3 — `purchase.mode` (ADR-028; REQ-BILL-16): `closed` (default/unset ⇒ fail-closed) ⇒
   * `/billing/checkout` refuses `purchase_closed` for real users; JOURNEY.1 `is_test` workspaces are
   * allowlisted. `open` re-opens purchase to real users (the operator's switch).
   */
  purchaseMode?: import("@rhema/contracts").PurchaseMode;
  /**
   * DEF.4 — `refundWindow.mode` (REQ-SPEC-29): `off` (default/unset ⇒ fail-closed) ⇒
   * `POST /runs/:id/refund` refuses `refund_closed` and the report renders no refund block;
   * `test_tenants` admits JOURNEY.1 `is_test` workspaces only; `open` admits everyone.
   */
  refundWindowMode?: import("@rhema/contracts").RefundWindowMode;
  /**
   * PRB.08 — the `finding.disposed` analytics emitter (REQ-BETA-6). Now that the beta has a real analytics
   * sink (`analytics_events`, 0020), the live deploy binds this to `recordAnalyticsEvent`; unset ⇒ no row.
   */
  emitDisposed?: TriageApiDeps["emitDisposed"];
  /**
   * PRB.11 — the export conversion seam (§13.4): POSTs markdown+format to the isolated `export` container.
   * The api NEVER runs pandoc — unset ⇒ POST /export answers 503 `export_not_wired` (the dialog + statement
   * reads still work).
   */
  exportRunner?: ExportRunner;
  /**
   * PRB.13 — `signup.mode` (REQ-BETA-19 amended 2026-09-16): `invite` keeps the PRB.01 gate (no valid code
   * ⇒ no account); `open` permits self-serve creation with the code optional (still validated+consumed when
   * supplied). Unset ⇒ `invite` — the flag fails closed. Read by `POST /signup` AND exported via
   * `admitSignup` for the live `user.create` binding (D-PRB.01-1).
   */
  signupMode?: SignupMode;
  /**
   * PRB.13 — the account-creation throttle (per source IP + per email). Unset ⇒ the beta-grade default
   * (`SIGNUP_THROTTLE_DEFAULTS`); injected in tests for a deterministic window.
   */
  signupThrottle?: IpEmailThrottle;
  /**
   * F-R6SWP.1-5 — the dedicated higher-ceiling bucket `test[+<tag>]@<testMailbox>` identities count
   * against on the unauthenticated admission paths (`POST /signup` + the Better Auth send/create
   * gates). Unset ⇒ test identities count on the production buckets — no exemption.
   */
  testIdentityThrottle?: IpEmailThrottle;
  /**
   * SEC.2 (ADR-040) — verify the web service's OIDC token so its stamped `x-rhema-client-ip` is trusted
   * as the throttle bucket key. Unset ⇒ the stamp is never honored (the penultimate XFF hop governs).
   */
  verifyInternalToken?: (token: string) => Promise<boolean>;
  /**
   * JOURNEY.1 (REQ-SPEC-29; ADR-020) — the configured test mailbox (`TEST_MAILBOX`). Accounts created for
   * a matching address (`test@…`/`test+<tag>@…`) get a flagged `workspaces.is_test` at provisioning.
   */
  testMailbox?: string;
  /** JOURNEY.1 — the image-baked deploy SHA surfaced on `/healthz` (`RHEMA_BUILD_GIT_SHA`). */
  buildGitSha?: string;
  /**
   * SEC.2 (Stage-B evidence) — the serving instance's id, stamped as `x-rhema-instance` on every
   * response so a write-free cross-instance throttle leg can prove ≥2 Cloud Run instances served it
   * (the live deploy binds the metadata `instance/id`, falling back to a per-boot UUID). Unset ⇒ no
   * header — never a fabricated id.
   */
  instanceId?: string;
  /**
   * OBS.1 — the GCP project id for the `logging.googleapis.com/trace` join field (deploy binds
   * `GOOGLE_CLOUD_PROJECT`). Unset ⇒ the trace field is omitted; requestId still propagates.
   */
  gcpProject?: string;
  /**
   * PRB.16 — the Better Auth handler mounted at `/api/auth/*`. The deploy's `baseURL` is the APP origin
   * (the SSR web service proxies `/api/auth/*` server-side, so auth cookies plant host-only on
   * `rhema.tools`). Unset ⇒ the auth surface 404s (pre-PRB.16 prod posture).
   */
  auth?: { handler(req: Request): Promise<Response> };
  /**
   * PRB.16 — resolve the request's session cookie to the principal (live: the `session` table lookup).
   * Mounted as request middleware; the route-level `deps.principal` reads the resolved value.
   */
  sessionResolver?: (req: Request) => Promise<Principal | null>;
  /**
   * PRB.16 — dev/preview ONLY: trust `x-rhema-*` identity headers when no session resolves. Never set
   * on prod (client-forgeable); the stage wiring sets it for non-prod.
   */
  identityHeaders?: boolean;
  /**
   * PRB.16 — the CSRF origin allowlist for state-changing requests (single-zone amendment means the
   * user-content host is same-site, so SameSite=Lax alone is insufficient). Unset ⇒ no guard.
   */
  allowedOrigins?: readonly string[];
  /**
   * P1.08 — the restore-blob store for `restore/`-keyed points (GCS live; in-memory in tests). Unset ⇒
   * those points answer `restore_unavailable` on preview/restore; content-addressed points still work.
   */
  restoreBlobs?: RestoreBlobStore;
  /**
   * P1.15 — the ingestion seams (§9.5). `fetcher` is the operator-owned fetcher service port (prod:
   * the fetcher Cloud Run service; the ONLY egress ingestion rides). `ingestBlobs` is the quarantine
   * byte seam (export-zip reads + fetched-original writes). Unset ⇒ the routes fail closed (503).
   */
  ingestFetcher?: IngestApiDeps["fetcher"];
  ingestBlobs?: IngestBlobs;
  /**
   * ONB.1 (REQ-ARCH-34) — the presign→preview-ready clock for `import_preview_p95_s`. `claim(key)`
   * is called at presign AND at the first preview call (idempotent first-seen wins); `release(key)`
   * clears the stamp once the ready sample is written. Unset ⇒ the sample uses the call's own elapsed.
   */
  importPreviewTiming?: {
    claim(quarantineKey: string): Promise<number | null>;
    release(quarantineKey: string): Promise<void>;
  };
  /** Test/dev binding — run sync inline in the request rather than queueing `ingest.sync`. */
  inlineSync?: boolean;
  /**
   * P1.18 — presign a download URL for the account-export zip's `s3_key` (GCS v4 over the
   * user-content bucket; the same presign seam /import/presign uses). Unset ⇒ the token and
   * session download routes answer 503 `download_unavailable`.
   */
  exportPresign?: (objectKey: string) => Promise<string> | string;
  /**
   * R6UCD.1 (REQ-POST-7, ADR-113) — the user-content mint seam (GCS v4 GET presigner over the
   * user-content bucket). Mounts `GET /usercontent/sign` and re-points `/voices/…/raw`'s
   * `original_key` leg to a 302. Unset ⇒ the mint route answers 503 `usercontent_unavailable`.
   */
  userContentSigner?: import("@rhema/contracts").UserContentSigner;
}

/** Build the api app. Pass `deps` to mount the run-creation, internal run API, and run-event SSE routes; pass
 *  `deps.db` (a SqlClient) to also mount the beta shell's project-list route (PRB.01) and — with a converter +
 *  content store — the draft-import routes (PRB.02). */
export function createApp(deps?: ApiDeps & BetaApiDeps): Hono {
  // OBS.1 — funnel-level degraded-read instrumentation (ADR-053): db.query, the content/blob stores
  // and txRunner.run bump the request-scoped counter on ANY rejection, so a `.catch(() => null)`
  // that degrades a <500 answer still leaves its `degraded_reads` trail. A failure the route lets
  // throw lands in onError instead — the bump is simply never emitted.
  if (deps) {
    // `innerStoreFor` binds the ORIGINAL factory — referencing `deps.contentStoreFor` inside the
    // closure below would self-recurse once `deps` is rebound.
    const innerStoreFor = deps.contentStoreFor;
    deps = {
      ...deps,
      ...(deps.db ? { db: instrumentReads(deps.db, ["query"]) } : {}),
      ...(deps.contentStore ? { contentStore: instrumentReads(deps.contentStore, ["get", "put"]) } : {}),
      ...(deps.restoreBlobs ? { restoreBlobs: instrumentReads(deps.restoreBlobs, ["get", "put", "delete"]) } : {}),
      ...(deps.ingestBlobs ? { ingestBlobs: instrumentReads(deps.ingestBlobs, ["read", "write"]) } : {}),
      ...(deps.txRunner ? { txRunner: instrumentReads(deps.txRunner, ["run"]) } : {}),
      ...(innerStoreFor
        ? {
            // `contentStoreFor` is a FACTORY: the resolved store gets instrumented, never the
            // factory's Promise (proxying it broke `await` — `Promise.prototype.then` ran through
            // the trap with `this` = the proxy → TypeError; the prod dossier 500).
            contentStoreFor: instrumentStoreFactory(innerStoreFor, ["get", "put"]),
          }
        : {}),
    };
  }
  const app = new Hono();
  // OBS.1 (ADR-053) — request correlation FIRST: every later middleware/route/onError line joins the
  // same requestId + the LB's trace when the hop carried one, and every response echoes the id.
  app.use("*", requestContext(deps?.gcpProject ?? process.env.GOOGLE_CLOUD_PROJECT));
  // OBS.1 — every unhandled route error produces exactly ONE structured line (allowlisted fields,
  // route TEMPLATE not path, message-stripped stack) and a bare 500 carrying only the requestId.
  app.onError(apiOnError);
  // P1.22 (§13.3 audit) — the api is a JSON surface, never a browsing context: pin the strictest CSP
  // (`default-src 'none'; frame-ancestors 'none'`) + nosniff on EVERY response so any route that ever
  // returns renderable content (an export, an error page) still cannot execute script or be framed.
  app.use("*", async (c, next) => {
    await next();
    // mutate in place — auth responses carry Set-Cookie, which a Headers clone could collapse.
    c.res.headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    c.res.headers.set("X-Content-Type-Options", "nosniff");
    // D-R6SECR.1-2 — the deferral names both origins: HSTS (1y + includeSubDomains, no preload)
    // only when the request arrived over TLS — `x-forwarded-proto` is the GFE's signal behind the
    // LB (the container socket is plaintext); the `https://` URL arm covers direct serving/tests.
    if (c.req.header("x-forwarded-proto") === "https" || c.req.url.startsWith("https://")) {
      c.res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
  });
  // SEC.2 — the serving-instance marker (see ApiDeps.instanceId): a random/opaque id, no topology leak.
  if (deps?.instanceId) {
    const instanceId = deps.instanceId;
    app.use("*", async (c, next) => {
      await next();
      c.res.headers.set("x-rhema-instance", instanceId);
    });
  }
  // PRB.16 — request middleware FIRST (before every route): resolve the session principal into the ALS
  // context the `principal` seams + scoped `db` read, then apply the mutation Origin allowlist.
  if (deps?.sessionResolver || deps?.identityHeaders) {
    app.use(
      "*",
      createSessionMiddleware({
        resolve: deps.sessionResolver ?? (async () => null),
        ...(deps.identityHeaders ? { identityHeaders: true } : {}),
      }),
    );
  }
  if (deps?.allowedOrigins) app.use("*", createOriginGuard(deps.allowedOrigins));
  // JOURNEY.1 (REQ-ARCH-39) — `build.gitSha` is the image-baked deploy SHA (`RHEMA_BUILD_GIT_SHA` env,
  // set from the Dockerfile `ARG GIT_SHA`): the network-reachable half of the deploy-provenance check
  // (scripts/check-deploy-provenance.mjs). Absent ⇒ `build.gitSha` is null — the check fails closed.
  // VERIF.2 (F-OPS.1-10) — Cloud Run's GFE intercepts bare `/healthz` on `*.run.app`; the
  // trailing-slash alias reaches the app, so preview provenance probes it as the fallback path.
  const healthz = (c: Context) =>
    c.json({ ok: true, service: "api", build: { gitSha: deps?.buildGitSha ?? null } });
  app.get("/healthz", healthz);
  app.get("/healthz/", healthz);
  // Public rate publication (REQ-BILL-19; §14.6): current + previous rate tables with effective dates and the
  // 1.4 platform rate. No auth — every run report links to its version. The full pricing page is PRB.8/P1.16.
  app.get("/pricing/rates", (c) => c.json(buildRatesPublication()));
  if (deps) {
    // PRB.16 — the Better Auth surface (Google OAuth + magic link). baseURL is the APP origin and the
    // web service proxies `/api/auth/*` server-side, so the OAuth callback + every auth cookie plant
    // host-only on rhema.tools (the browser never talks to api.rhema.tools).
    if (deps.auth) {
      const auth = deps.auth;
      app.on(["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"], "/api/auth/*", (c) =>
        auth.handler(c.req.raw),
      );
    }
    // PRB.16 — the resolved session principal, for the driver/operator's "am I signed in" assert.
    // ACT.1 — `isTest` rides the session so the web's marketing surfaces can serve the
    // JOURNEY.1 test-audience preview (`?audience=test` renders the gated trial claims to a flagged
    // tenant, never to anyone else). Fails closed: no db read ⇒ false.
    app.get("/session", async (c) => {
      const principal = sessionScopedPrincipal(c);
      if (!principal) return c.json({ error: "unauthenticated" }, 401);
      const isTest = deps.db
        ? await deps.db
            .query("select is_test from workspaces where id = $1", [principal.workspaceId])
            .then((r) => (r.rows[0] as { is_test: boolean } | undefined)?.is_test === true)
            .catch(() => false)
        : false;
      return c.json({ ...principal, isTest });
    });
    // PRB.13 — the verified-email run-creation gate (REQ-BETA-19 amended) binds whenever a user lookup
    // exists (`deps.db`): a missing row or `email_verified=false` refuses `POST /projects/:id/runs` 403.
    // Unbound ⇒ the gate is inert (fixture/deploys without a user table read).
    const userEmailVerified = deps.db
      ? async (userId: string): Promise<boolean> => {
          const db = deps.db!;
          const r = await db.query(`select email_verified from "user" where id = $1`, [userId]);
          return (r.rows[0] as { email_verified: boolean } | undefined)?.email_verified === true;
        }
      : undefined;
    app.route("/", createRunRoutes({ ...deps, ...(userEmailVerified ? { userEmailVerified } : {}) }));
    app.route("/", createEstimateRoutes(deps));
    app.route("/", createSseRoutes(deps));
    // PRB.08 — the billing surface: the §14.6 Stripe webhook (Payment Links are the only money channel),
    // the spendable-balance read, and the exhaustion-prompt telemetry write.
    app.route(
      "/",
      createBillingRoutes({
        principal: deps.principal,
        txRunner: deps.txRunner,
        ...(deps.systemExec ? { systemExec: deps.systemExec } : {}),
        queue: deps.queue,
        clock: deps.clock,
        ids: deps.ids,
        ...(deps.stripeWebhookSecret ? { stripeWebhookSecret: deps.stripeWebhookSecret } : {}),
        ...(deps.paymentLinkUrl ? { paymentLinkUrl: deps.paymentLinkUrl } : {}),
        ...(deps.stripe ? { stripe: deps.stripe } : {}),
        ...(deps.appBaseUrl ? { appBaseUrl: deps.appBaseUrl } : {}),
        // BILL.3 — the purchase switch (ADR-028; unset ⇒ fail-closed in the route deps too).
        ...(deps.purchaseMode ? { purchaseMode: deps.purchaseMode } : {}),
      }),
    );
    // PRB.06 — What-changed + hunk-comment routes (session-authed; the readable store seam is optional).
    app.route("/", createRevisionRoutes(deps as RevisionApiDeps));
    // PRB.16 — the delivered-review dossier read (PRB.04's deferred live binding, finding 7): the whole
    // dossier assembled from delivered rows — correspondence/rubric, findings+dispositions, claims+
    // claim_sources joined to the proxy fetch_log, the letter markdown → sections, the re-derived
    // access_report, the run's own event stream, and the obligation counts.
    app.route("/", createDossierRoutes(deps as DossierApiDeps));
    // P1.05 — the Timeline round log, the Level-3/4 run report, and the §6.5 steering endpoints
    // (pause-after-phase / resume / queue-note / stop / walkthrough retry). Session-authed like the
    // gate routes; all state changes ride the canonical orchestrator seams.
    app.route("/", createTimelineRoutes(deps));
    // PRB.10 — the voice surface (§9.2–§9.6): personas, samples, the seed editor, the build run, the
    // project voice pin, and the derived-artifact write gate (405 for editMode:"none").
    app.route(
      "/",
      createVoiceRoutes({
        ...deps,
        principal: deps.principal,
        ...(deps.contentStore ? { contentStore: deps.contentStore } : {}),
        ...(deps.contentStoreFor ? { contentStoreFor: deps.contentStoreFor } : {}),
        ...(deps.importConverter ? { converter: deps.importConverter } : {}),
      }),
    );
    // P1.15 — the ingestion surface (§9.5): connections/sources, discover→confirm→sync, item preview
    // + versions + raw bytes, the priced reconstruction enqueues, and the voice delete.
    app.route(
      "/",
      createIngestRoutes({
        principal: deps.principal,
        txRunner: deps.txRunner,
        ids: deps.ids,
        clock: () => deps.clock.now(),
        ...(deps.queue ? { queue: deps.queue } : {}),
        ...(deps.ingestFetcher ? { fetcher: deps.ingestFetcher } : {}),
        ...(deps.ingestBlobs ? { ingestBlobs: deps.ingestBlobs } : {}),
        ...(deps.importConverter ? { converter: deps.importConverter } : {}),
        ...(deps.contentStoreFor ? { contentStoreFor: deps.contentStoreFor } : {}),
        ...(deps.userContentSigner ? { userContentSigner: deps.userContentSigner } : {}),
        ...(deps.inlineSync ? { inlineSync: true } : {}),
      }),
    );
    // R6UCD.1 — the user-content mint route (`GET /usercontent/sign` — ADR-113, REQ-POST-7).
    app.route(
      "/",
      createUserContentRoutes({
        principal: deps.principal,
        ...(deps.userContentSigner ? { userContentSigner: deps.userContentSigner } : {}),
      }),
    );
    // PRB.12 — the analytics client mint (CLIENT_ANALYTICS_EVENTS only — server-owned facts are never
    // client-forgeable) + the settings privacy toggle that binds "user".analytics_opt_out.
    app.route(
      "/",
      createAnalyticsRoutes({
        principal: deps.principal,
        txRunner: deps.txRunner,
        clock: deps.clock,
        ids: deps.ids,
        // P1.17 — the pre-auth funnel write (acquisition_events) needs the raw client.
        ...(deps.db ? { db: deps.db } : {}),
      }),
    );
    // P1.01 — the theme endpoints (REQ-IDE-38 amended): the per-user app theme + the per-project paper pin.
    app.route(
      "/",
      createThemeRoutes({
        principal: deps.principal,
        txRunner: deps.txRunner,
        clock: deps.clock,
      }),
    );
    // PRB.09 — notification prefs (session-authed) + the signed one-click action consume (unauthenticated;
    // the token is the credential). `deps.notifications` is the signed-action config.
    app.route(
      "/",
      createNotificationRoutes({
        principal: deps.principal,
        txRunner: deps.txRunner,
        clock: deps.clock,
        ...(deps.notifications ? { notifications: deps.notifications } : {}),
      }),
    );
    if (deps.db) {
      const db = deps.db;
      const inviteGate = createInviteGate(db);
      // PRB.13 — signup admission + self-serve provisioning (REQ-BETA-19 amended 2026-09-16): POST
      // /signup reads `signup.mode` (default invite — fail closed), throttles account creation per
      // IP + email, and consumes a supplied invite at creation. The invite machinery is retained.
      app.route(
        "/",
        createSignupRoutes({
          db,
          mode: deps.signupMode ?? "invite",
          inviteGate,
          throttle: deps.signupThrottle ?? createIpEmailThrottle({ ...SIGNUP_THROTTLE_DEFAULTS }),
          ids: deps.ids,
          clock: deps.clock,
          txRunner: deps.txRunner,
          // P1.17 — every provision seeds the workspace's Showcase dossier (§15.4): the deterministic
          // fixture at $0. The content store binds when the deploy has one so the letter bytes render.
          showcaseSeed: createShowcaseSeeder({
            txRunner: deps.txRunner,
            ids: deps.ids,
            clock: deps.clock,
            ...(deps.contentStore ? { store: deps.contentStore } : {}),
          }),
          // JOURNEY.1 — test-mailbox flagging at provisioning.
          ...(deps.testMailbox ? { testMailbox: deps.testMailbox } : {}),
          // F-R6SWP.1-5 — test-mailbox identities count on the dedicated higher-ceiling bucket.
          ...(deps.testIdentityThrottle ? { testIdentityThrottle: deps.testIdentityThrottle } : {}),
          // SEC.2 (ADR-040) — trust the web-stamped client IP only behind a verified OIDC token.
          ...(deps.verifyInternalToken ? { verifyInternalToken: deps.verifyInternalToken } : {}),
        }),
      );
      // PRB.05 — the disposition write + the decision surfaces (decisions, gates, pretriage) mount on the
      // same deps the run API uses (txRunner for the atomic write + obligation routing).
      app.route("/", createTriageRoutes({ ...(deps as TriageApiDeps), db }));
      // P1.09 — the approval-policy settings surface (§6.4 item 3), standing-guidance management
      // (§6.5), the per-run gate override, and the dismissed-explainer prefs (§5.11).
      app.route("/", createApprovalRoutes({ ...(deps as ApprovalApiDeps), db }));
      // P1.11 — the Assistant chat surface (§7.1): threads CRUD, turns → `chat_turn` runs (the plan
      // card is the consent), pins + remembers/corrections, attachments → source notes, the §7.4
      // suggestion shaping, and the §7.6 empty state. Session-authed like the gate routes.
      app.route(
        "/",
        createChatRoutes({
          ...(deps as unknown as ChatApiDeps),
          db,
          ids: deps.ids ?? (() => `id_${randomUUID()}`),
          ...(deps.contentStore ? { contentStore: deps.contentStore } : {}),
          ...(deps.importConverter ? { converter: deps.importConverter } : {}),
        }),
      );
      // P1.12 — the Outline surface (§7.3): the promotion sheet's facts, the `outline` run create,
      // the editor DTO + autosave PATCH, deletion protection, and the gap-answer write. Session-authed
      // like the chat routes; the content store binds when present (reads + saves need it).
      app.route(
        "/",
        createOutlineRoutes({
          ...(deps as unknown as OutlineApiDeps),
          db,
          ...(deps.contentStore ? { contentStore: deps.contentStore } : {}),
        }),
      );
      // P1.07 — the findings surface (§5.7): Apply (REQ-SPEC-6), promote, "Add to obligations" (REQ-OBJ-9),
      // the deep-link resolve, and the one-preview bulk actions — all through the same shared write path.
      app.route("/", createFindingRoutes({ ...(deps as FindingApiDeps), db }));
      // PRB.07 — the source editor (document read, autosave, note→Guidance, cancel-run, revise-with-edits).
      app.route("/", createEditorRoutes({ ...(deps as EditorApiDeps), db }));
      // P1.08 — the version rail, the §5.13 Files pane, and the restore-point browse/preview/apply.
      app.route("/", createVersionRoutes({ ...(deps as unknown as VersionApiDeps), db }));
      // P1.13 — the Figures surface (§7.5): pane list + card DTO, the propose/accept/reject
      // insert-as-proposal lifecycle, the 0-cr type-chip + restore iterate verbs, and the lazy
      // render.png endpoint. Session-authed like the editor routes; the content store binds when
      // present (card preview + saves + renders all need it).
      app.route(
        "/",
        createFigureRoutes({
          ...(deps as unknown as FigureApiDeps),
          db,
          ...(deps.contentStore ? { store: deps.contentStore } : {}),
          ...(deps.contentStoreFor ? { contentStoreFor: deps.contentStoreFor } : {}),
        }),
      );
      // PRB.11 — export (md/txt/docx via the ExportRunner seam — pandoc stays in the export image) + the
      // AI-use statement read/standalone-download/append-only-addition routes.
      app.route(
        "/",
        createExportRoutes({
          principal: deps.principal,
          db,
          txRunner: deps.txRunner,
          ids: deps.ids,
          clock: deps.clock,
          ...(deps.contentStore ? { store: deps.contentStore } : {}),
          ...(deps.contentStoreFor ? { contentStoreFor: deps.contentStoreFor } : {}),
          ...(deps.exportRunner ? { exportRunner: deps.exportRunner } : {}),
        }),
      );
      // P1.18 — the whole-account zip (REQ-ACCT-3): "Export everything" enqueues `account.export`
      // (the worker builds the archive + emails the 7-day link), the token-gated download route
      // resolves it, and /account/import replays a zip into a fresh account (idempotent).
      app.route(
        "/",
        createAccountExportRoutes({
          principal: deps.principal,
          db,
          txRunner: deps.txRunner,
          ids: deps.ids,
          clock: deps.clock,
          // CAP.3 (D-STB.5a-1) — the emailed token link's cross-tenant lookup rides the BYPASSRLS
          // system pool; the user pool is FORCE-RLS'd empty without a tenant GUC.
          ...(deps.systemExec ? { systemExec: deps.systemExec } : {}),
          ...(deps.queue ? { queue: deps.queue } : {}),
          ...(deps.exportPresign ? { presignGet: deps.exportPresign } : {}),
          ...(deps.contentStore ? { store: deps.contentStore } : {}),
          ...(deps.contentStoreFor ? { contentStoreFor: deps.contentStoreFor } : {}),
        }),
      );
      app.route(
        "/",
        createShellRoutes({
          principal: deps.principal,
          db,
          txRunner: deps.txRunner,
          inviteGate,
        }),
      );
      // P1.04 — the workspace home (§5.2/§5.3): the three-entry create, the row actions, the per-user
      // grouping preference, the protocol cards, and the server-side search over project_search_docs.
      app.route(
        "/",
        createProjectRoutes({
          principal: deps.principal,
          db,
          txRunner: deps.txRunner,
          ids: deps.ids,
          clock: deps.clock,
          ...(deps.importConverter ? { converter: deps.importConverter } : {}),
          ...(deps.contentStore ? { contentStore: deps.contentStore } : {}),
          ...(deps.queue ? { queue: deps.queue } : {}),
        }),
      );
      app.route("/", createSearchRoutes({ principal: deps.principal, db, ids: deps.ids }));
      // P1.20 — the §14.7 settings tree's api half: account/profile/sessions/email change, the
      // user.prefs blob, support access (REQ-VIS-11), account deletion (REQ-ACCT-4), the uniform
      // integrations read (REQ-ACCT-2), and the /p/:project/settings safe-field patch (REQ-GENRE-2).
      app.route(
        "/",
        createSettingsRoutes({
          principal: deps.principal,
          db,
          txRunner: deps.txRunner,
          ids: deps.ids,
          clock: deps.clock,
          ...(deps.queue ? { queue: deps.queue } : {}),
          ...(deps.appBaseUrl ? { appBaseUrl: deps.appBaseUrl } : {}),
        }),
      );
      // P1.06 — the run sheet's single context read (§5.6; REQ-IDE-13): head-draft facts + sections +
      // obligation counts + the trial entitlement + the user's consent pref + `blockedBy` (the per-lock
      // conflict under the P1.06 concurrency ruling).
      app.route(
        "/",
        createSheetContextRoutes({
          principal: deps.principal,
          db,
          ...(deps.contentStoreFor ? { contentStoreFor: deps.contentStoreFor } : {}),
          ...(deps.contentStore ? { store: deps.contentStore } : {}),
        }),
      );
      if (deps.importConverter && deps.contentStore) {
        app.route(
          "/",
          createImportRoutes({
            principal: deps.principal,
            db,
            contentStore: deps.contentStore,
            converter: deps.importConverter,
            ids: deps.ids ?? (() => `id_${randomUUID()}`),
            ...(deps.importUploads ? { uploads: deps.importUploads } : {}),
            ...(deps.importPreviewTiming ? { timing: deps.importPreviewTiming } : {}),
          }),
        );
      }
    }
  }
  return app;
}

export const app = createApp();

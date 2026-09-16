import { Hono } from "hono";
import { buildRatesPublication } from "@rhema/contracts";
import { createRunRoutes, type RunApiDeps } from "./run-routes.js";
import { createEstimateRoutes, type EstimateApiDeps } from "./estimate-routes.js";
import { createSseRoutes, type SseApiDeps } from "./sse-routes.js";
import { createShellRoutes } from "./project-list.js";
import { createTriageRoutes, type TriageApiDeps } from "./triage-routes.js";
import { createRevisionRoutes, type RevisionApiDeps } from "./revision-routes.js";
import { createEditorRoutes, type EditorApiDeps } from "./editor-routes.js";
import { createBillingRoutes } from "./billing-routes.js";
import { createNotificationRoutes } from "./notification-routes.js";
import { createInviteGate, type SqlClient } from "./invite.js";
import { createImportRoutes, type Converter } from "./import.js";
import { createVoiceRoutes } from "./voice-routes.js";
import { createExportRoutes, type ExportRunner } from "./export-routes.js";
import { createAnalyticsRoutes } from "./analytics-routes.js";
import { randomUUID } from "node:crypto";
import type { ContentStore } from "@rhema/mirror";

// api — Hono REST + SSE. P0.08 adds run creation + the internal run API (run-routes.ts); P0.08b adds the
// viewer-facing run-event SSE route (sse-routes.ts). Both mount when the orchestrator deps are supplied. The
// live deps (a pg pool, Redis heartbeats/subscriber, the pg-boss queue, the JWT service) are constructed at
// deploy; the route layer is fully unit-testable with injected deps.

export { createAuth } from "./auth.js";
export type { AuthSecrets, SendMagicLink } from "./auth.js";
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
export {
  createShellRoutes,
  listProjectStates,
  assembleProjectStateInput,
  type ProjectListRow,
  type ShellApiDeps,
} from "./project-list.js";
export {
  createImportRoutes,
  createImportedDraft,
  type Converter,
  type ImportApiDeps,
  type CreatedDraft,
} from "./import.js";
export { createTriageRoutes, loadPretriage } from "./triage-routes.js";
export type { TriageApiDeps } from "./triage-routes.js";
export { createRevisionRoutes } from "./revision-routes.js";
export type { RevisionApiDeps } from "./revision-routes.js";
export { createEditorRoutes } from "./editor-routes.js";
export type { EditorApiDeps, EditorFindingDto } from "./editor-routes.js";
export { loadWhatChanged, computeReReviewSeed } from "./what-changed.js";
export type { WhatChangedResult, WhatChangedOutcome, ReReviewSeed } from "./what-changed.js";
export { createNotificationRoutes } from "./notification-routes.js";
export type { NotificationApiDeps } from "./notification-routes.js";
export { createVoiceRoutes } from "./voice-routes.js";
export type { VoiceApiDeps } from "./voice-routes.js";
export { loadVoiceStatus, loadPersona, parseSampleSet, personaPhaseCount } from "./voice-status.js";
export { createExportRoutes, createServiceExportRunner } from "./export-routes.js";
export type { ExportApiDeps, ExportRunner } from "./export-routes.js";
export { createAnalyticsRoutes } from "./analytics-routes.js";
export type { AnalyticsApiDeps } from "./analytics-routes.js";

/** The deps for the full api app: run creation + internal run API (P0.08) + the run-event SSE route (P0.08b)
 *  + the stateless estimate endpoint (PRB.03). `principal` is shared; the estimate seams are optional. */
export type ApiDeps = RunApiDeps & SseApiDeps & Omit<EstimateApiDeps, "principal">;

/** Extra deps for the beta shell (PRB.01) + draft import (PRB.02) routes. */
export interface BetaApiDeps {
  db?: SqlClient;
  importConverter?: Converter;
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
}

/** Build the api app. Pass `deps` to mount the run-creation, internal run API, and run-event SSE routes; pass
 *  `deps.db` (a SqlClient) to also mount the beta shell's project-list route (PRB.01) and — with a converter +
 *  content store — the draft-import routes (PRB.02). */
export function createApp(deps?: ApiDeps & BetaApiDeps): Hono {
  const app = new Hono();
  app.get("/healthz", (c) => c.json({ ok: true, service: "api" }));
  // Public rate publication (REQ-BILL-19; §14.6): current + previous rate tables with effective dates and the
  // 1.4 platform rate. No auth — every run report links to its version. The full pricing page is PRB.8/P1.16.
  app.get("/pricing/rates", (c) => c.json(buildRatesPublication()));
  if (deps) {
    app.route("/", createRunRoutes(deps));
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
      }),
    );
    // PRB.06 — What-changed + hunk-comment routes (session-authed; the readable store seam is optional).
    app.route("/", createRevisionRoutes(deps as RevisionApiDeps));
    // PRB.10 — the voice surface (§9.2–§9.6): personas, samples, the seed editor, the build run, the
    // project voice pin, and the derived-artifact write gate (405 for editMode:"none").
    app.route(
      "/",
      createVoiceRoutes({
        ...deps,
        principal: deps.principal,
        ...(deps.contentStore ? { contentStore: deps.contentStore } : {}),
        ...(deps.importConverter ? { converter: deps.importConverter } : {}),
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
      // PRB.05 — the disposition write + the decision surfaces (decisions, gates, pretriage) mount on the
      // same deps the run API uses (txRunner for the atomic write + obligation routing).
      app.route("/", createTriageRoutes({ ...(deps as TriageApiDeps), db }));
      // PRB.07 — the source editor (document read, autosave, note→Guidance, cancel-run, revise-with-edits).
      app.route("/", createEditorRoutes({ ...(deps as EditorApiDeps), db }));
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
      app.route(
        "/",
        createShellRoutes({
          principal: deps.principal,
          db,
          inviteGate: createInviteGate(db),
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
          }),
        );
      }
    }
  }
  return app;
}

export const app = createApp();

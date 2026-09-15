import { Hono } from "hono";
import { buildRatesPublication } from "@rhema/contracts";
import { createRunRoutes, type RunApiDeps } from "./run-routes.js";
import { createEstimateRoutes, type EstimateApiDeps } from "./estimate-routes.js";
import { createSseRoutes, type SseApiDeps } from "./sse-routes.js";
import { createShellRoutes } from "./project-list.js";
import { createTriageRoutes, type TriageApiDeps } from "./triage-routes.js";
import { createInviteGate, type SqlClient } from "./invite.js";
import { createImportRoutes, type Converter } from "./import.js";
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

/** The deps for the full api app: run creation + internal run API (P0.08) + the run-event SSE route (P0.08b)
 *  + the stateless estimate endpoint (PRB.03). `principal` is shared; the estimate seams are optional. */
export type ApiDeps = RunApiDeps & SseApiDeps & Omit<EstimateApiDeps, "principal">;

/** Extra deps for the beta shell (PRB.01) + draft import (PRB.02) routes. */
export interface BetaApiDeps {
  db?: SqlClient;
  importConverter?: Converter;
  contentStore?: ContentStore;
  ids?: () => string;
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
    if (deps.db) {
      const db = deps.db;
      // PRB.05 — the disposition write + the decision surfaces (decisions, gates, pretriage) mount on the
      // same deps the run API uses (txRunner for the atomic write + obligation routing).
      app.route("/", createTriageRoutes({ ...(deps as TriageApiDeps), db }));
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

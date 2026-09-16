// PRB.12 — the analytics intake + the privacy toggle (REQ-PROD-15, REQ-BETA-12; design/9 §7.2).
//
//   POST /analytics/events   the session-authed client mint. Only CLIENT_ANALYTICS_EVENTS pass —
//                            view/dwell/timer signals the server cannot observe itself. Server-owned
//                            facts (run lifecycle, billing, ledger, imports) are emitted api-side or
//                            materialized by the pipeline; a client that posts one gets 403 — spend
//                            events must stay forgery-proof.
//   GET  /settings/privacy   the account's analytics flag.
//   POST /settings/privacy   {analyticsOptOut} — flips "user".analytics_opt_out (the Settings toggle
//                            the ticket requires to exist and bind). Opting out stops future writes
//                            AND hides existing rows from every read (`listAnalyticsEvents` re-joins
//                            the flag) — the two-sided honor REQ-PROD-15 asks for.
//
// Every write goes through `recordAnalyticsEvent` — the ONE validated sink (catalogue schema +
// opt-out check + 0024 dedupe). A malformed payload is a 422; an opted-out user is a 200 with
// `recorded: false` (the honor is silence, not an error).

import { Hono } from "hono";
import { CLIENT_ANALYTICS_EVENT_NAMES, type AnalyticsEventName } from "@rhema/contracts";
import type { IdFactory, SqlClient } from "@rhema/orchestrator";
import { recordAnalyticsEvent } from "@rhema/ledger";
import type { Principal } from "./run-routes.js";

export interface AnalyticsApiDeps {
  /** session principal (same seam run-routes uses). */
  principal(c: { req: { header(name: string): string | undefined } }): Principal | null;
  /** tenant-scoped transactions (the analytics write + the "user" flag update are tenant-keyed). */
  readonly txRunner: { run<T>(workspaceId: string, fn: (tx: SqlClient) => Promise<T>): Promise<T> };
  readonly clock: { now(): Date };
  readonly ids: IdFactory;
}

export function createAnalyticsRoutes(deps: AnalyticsApiDeps): Hono {
  const app = new Hono();
  const entryDeps = { ids: deps.ids, clock: deps.clock };

  // ---- the client mint -------------------------------------------------------------
  app.post("/analytics/events", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => null)) as {
      event?: unknown;
      props?: unknown;
      projectId?: unknown;
      runId?: unknown;
      dedupeKey?: unknown;
    } | null;
    if (typeof body?.event !== "string") return c.json({ error: "event required" }, 400);
    // Only the client-whitelisted names mint here — server-owned facts can never be forged by a session.
    if (!CLIENT_ANALYTICS_EVENT_NAMES.has(body.event)) {
      return c.json({ error: "not a client-mintable event" }, 403);
    }
    if (body.props !== undefined && (typeof body.props !== "object" || body.props === null || Array.isArray(body.props))) {
      return c.json({ error: "props must be an object" }, 422);
    }
    let invalid: string | null = null;
    const id = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      try {
        return await recordAnalyticsEvent(tx, entryDeps, {
          userId: principal.userId,
          workspaceId: principal.workspaceId,
          ...(typeof body.projectId === "string" ? { projectId: body.projectId } : {}),
          ...(typeof body.runId === "string" ? { runId: body.runId } : {}),
          event: body.event as AnalyticsEventName,
          props: (body.props ?? {}) as Record<string, unknown>,
          ...(typeof body.dedupeKey === "string" && body.dedupeKey.length > 0
            ? { dedupeKey: `cli:${body.dedupeKey}` }
            : {}),
        });
      } catch (e) {
        // parseAnalyticsEvent's throw IS the catalogue refusal — map it to 422, not a 500.
        invalid = e instanceof Error ? e.message : String(e);
        return null;
      }
    });
    if (invalid != null) {
      return c.json({ error: "invalid event payload", detail: invalid }, 422);
    }
    return c.json({ ok: true, recorded: id != null });
  });

  // ---- the privacy flag (the Settings toggle's bind) ---------------------------------
  app.get("/settings/privacy", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const flag = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const row = (
        await tx.query('select analytics_opt_out from "user" where id = $1', [principal.userId])
      ).rows[0] as { analytics_opt_out: boolean } | undefined;
      return row?.analytics_opt_out ?? false;
    });
    return c.json({ analyticsOptOut: flag });
  });

  app.post("/settings/privacy", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => null)) as { analyticsOptOut?: unknown } | null;
    if (typeof body?.analyticsOptOut !== "boolean") {
      return c.json({ error: "analyticsOptOut must be a boolean" }, 422);
    }
    await deps.txRunner.run(principal.workspaceId, async (tx) => {
      await tx.query('update "user" set analytics_opt_out = $2, updated_at = $3 where id = $1', [
        principal.userId,
        body.analyticsOptOut,
        deps.clock.now(),
      ]);
    });
    return c.json({ ok: true, analyticsOptOut: body.analyticsOptOut });
  });

  return app;
}

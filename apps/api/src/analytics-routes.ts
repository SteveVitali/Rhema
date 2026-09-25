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

import { createHash } from "node:crypto";
import { Hono } from "hono";
import { CLIENT_ANALYTICS_EVENT_NAMES, type AnalyticsEventName } from "@rhema/contracts";

/** P1.17 (§3.5) — the small acquisition funnel allowed on `POST /analytics/acquisition`.
 *  Identity is always bound server-side from the session; this channel only reports the
 *  event name + ids the client legitimately knows (the funnel milestones + view signals). */
const ACQUISITION_EVENT_NAMES = new Set<string>([
  "entry.chosen",
  "outline.approved",
  "paywall.shown",
  "showcase.opened",
  "showcase.finding_anchor_viewed",
  "email.verified",
  "landing.viewed",
  "landing.dropzone_used",
]);
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
  /**
   * P1.17 — the raw client for the PRE-AUTH funnel table (`acquisition_events` — no workspace
   * tenancy, so it writes outside txRunner). Unset ⇒ `POST /analytics/landing` is not mounted.
   */
  readonly db?: SqlClient;
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

  // ---- the acquisition funnel channel (P1.17) ----------------------------------------
  // The same validated sink as /analytics/events, scoped to the §3.5 funnel names — the web
  // funnel emits here (identity is session-bound; server-owned facts still mint api-side).
  app.post("/analytics/acquisition", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => null)) as {
      event?: unknown;
      props?: unknown;
      projectId?: unknown;
      runId?: unknown;
      dedupeKey?: unknown;
    } | null;
    if (typeof body?.event !== "string" || !ACQUISITION_EVENT_NAMES.has(body.event)) {
      return c.json({ error: "not an acquisition event" }, 403);
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
            ? { dedupeKey: `acq:${body.dedupeKey}` }
            : {}),
        });
      } catch (e) {
        invalid = e instanceof Error ? e.message : String(e);
        return null;
      }
    });
    if (invalid != null) return c.json({ error: "invalid event payload", detail: invalid }, 422);
    return c.json({ ok: true, recorded: id != null });
  });

  // ---- the PRE-AUTH funnel (P1.17, §3.5) --------------------------------------------------
  // `POST /analytics/landing` records landing.viewed / landing.dropzone_used before a session exists —
  // the acquisition_events table (0037), append-only, no PII (the IP is hashed for coarse dedupe).
  if (deps.db) {
    const db = deps.db;
    app.post("/analytics/landing", async (c) => {
      const body = (await c.req.json().catch(() => null)) as {
        event?: unknown;
        props?: unknown;
        token?: unknown;
      } | null;
      if (
        typeof body?.event !== "string" ||
        (body.event !== "landing.viewed" && body.event !== "landing.dropzone_used")
      ) {
        return c.json({ error: "not a landing event" }, 403);
      }
      const props =
        body.props && typeof body.props === "object" && !Array.isArray(body.props)
          ? (body.props as Record<string, unknown>)
          : {};
      // Never carry file bytes or names into analytics — the drop-zone token + coarse labels only.
      const safeProps: Record<string, unknown> = {};
      if (typeof props.src === "string" && props.src.length <= 80) safeProps.src = props.src;
      if (typeof props.kind === "string" && props.kind.length <= 40) safeProps.kind = props.kind;
      if (typeof body.token === "string" && body.token.length <= 80) safeProps.token = body.token;
      const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
      const ipHash = ip ? createHash("sha256").update(ip).digest("hex").slice(0, 24) : null;
      await db
        .query(
          `insert into acquisition_events (id, event, props, ip_hash, created_at) values ($1,$2,$3,$4,$5)`,
          [deps.ids("acq"), body.event, JSON.stringify(safeProps), ipHash, deps.clock.now().toISOString()],
        )
        .catch(() => undefined); // analytics never 500s the funnel
      return c.json({ ok: true });
    });
  }

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

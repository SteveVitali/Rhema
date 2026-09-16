// PRB.09 notification routes (§5.11; REQ-ACCT-1/REQ-SPEC-20; REQ-IDE-47's email half):
//
//   GET  /notifications/prefs   — the effective per-event-type email matrix + quiet hours (session-authed).
//   PUT  /notifications/prefs   — write toggles; the two NON-CONFIGURABLE rows (spend_gate, trial_payment)
//                                 reject with 400 — the server is the authority (REQ-ACCT-1), and the
//                                 delivery path ignores a stored false for them regardless (defense in depth).
//   GET  /action/:token         — the signed one-click link the email renders. UNAUTHENTICATED: the signed
//                                 token IS the credential. Consumption is atomic (single-use, expiry, HMAC);
//                                 `hold` pauses the countdown ("Wait for me"), `open` redirects to the deep
//                                 link. There is no Approve action anywhere in this surface.

import { Hono } from "hono";
import {
  isNonConfigurableEvent,
  notificationEventTypeSchema,
  notificationPrefsSchema,
  quietHoursSchema,
  type NotificationPrefs,
} from "@rhema/contracts";
import {
  consumeEmailAction,
  gateDeepLink,
  holdGate,
  readNotificationPrefs,
  type EmailActionConfig,
  type TxRunner,
} from "@rhema/orchestrator";
import type { Clock } from "@rhema/orchestrator";
import type { Principal } from "./run-routes.js";

export interface NotificationApiDeps {
  principal(c: { req: { header(name: string): string | undefined } }): Principal | null;
  readonly txRunner: TxRunner;
  readonly clock: Clock;
  /** signed-action config — unset ⇒ the prefs routes still mount; /action returns 404. */
  readonly notifications?: EmailActionConfig;
}

export function createNotificationRoutes(deps: NotificationApiDeps): Hono {
  const app = new Hono();

  // ---- the effective matrix (REQ-ACCT-1) ------------------------------------------------------------
  app.get("/notifications/prefs", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const out = await readNotificationPrefs(deps.txRunner, {
      userId: principal.userId,
      workspaceId: principal.workspaceId,
    });
    return c.json(out);
  });

  // ---- the write (server-side enforcement of the non-configurable rows) -------------------------------
  app.put("/notifications/prefs", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => null)) as {
      email?: unknown;
      quietHours?: unknown;
    } | null;
    if (!body || typeof body !== "object") return c.json({ error: "invalid payload" }, 400);

    // validate each toggled key against the event-type enum; reject a write to a non-configurable row.
    const emailToggles: Partial<Record<string, boolean>> = {};
    if (body.email != null) {
      if (typeof body.email !== "object") return c.json({ error: "email must be an object" }, 400);
      for (const [key, value] of Object.entries(body.email as Record<string, unknown>)) {
        const parsed = notificationEventTypeSchema.safeParse(key);
        if (!parsed.success) return c.json({ error: `unknown event type: ${key}` }, 400);
        if (typeof value !== "boolean") return c.json({ error: `${key} must be a boolean` }, 400);
        if (isNonConfigurableEvent(parsed.data)) {
          return c.json({ error: `${key} is not configurable` }, 400);
        }
        emailToggles[parsed.data] = value;
      }
    }
    let quiet: NotificationPrefs["quietHours"];
    if (body.quietHours !== undefined) {
      const q = quietHoursSchema.nullable().safeParse(body.quietHours);
      if (!q.success) return c.json({ error: "invalid quietHours" }, 400);
      quiet = q.data;
    }

    const out = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const prior = (
        await tx.query("select prefs from notification_prefs where user_id = $1", [principal.userId])
      ).rows[0] as { prefs: unknown } | undefined;
      const prefs: NotificationPrefs = prior ? notificationPrefsSchema.parse(prior.prefs) : {};
      const next: NotificationPrefs = {
        email: { ...(prefs.email ?? {}), ...emailToggles },
        ...(body.quietHours !== undefined ? { quietHours: quiet } : { quietHours: prefs.quietHours }),
      };
      await tx.query(
        `insert into notification_prefs(user_id, prefs) values ($1,$2)
         on conflict (user_id) do update set prefs = excluded.prefs`,
        [principal.userId, JSON.stringify(next)],
      );
      return next;
    });
    return c.json({ ok: true, prefs: out });
  });

  // ---- the signed one-click action (unauthenticated — the token is the credential) ---------------------
  app.get("/action/:token", async (c) => {
    const config = deps.notifications;
    if (!config) return c.json({ error: "email actions are not configured" }, 404);
    const res = await consumeEmailAction(
      { txRunner: deps.txRunner, clock: deps.clock, config },
      c.req.param("token"),
    );
    if (!res.ok) {
      const status = res.reason === "bad_signature" || res.reason === "malformed" ? 400 : 410;
      return c.html(`<p>This link ${res.reason === "expired_or_consumed" ? "has already been used or expired" : "is not valid"}. Open Rhema to decide.</p>`, status);
    }
    if (res.action === "hold") {
      // "Wait for me" — pause the countdown without resolving (§6.4 item 1). Stale jobs no-op on fire.
      await holdGate(deps, { gateId: res.gateId, workspaceId: res.workspaceId });
    }
    // resolve the run's project for the deep link, then redirect (both actions land in-app).
    const link = await deps.txRunner.run(res.workspaceId, async (tx) => {
      const row = (
        await tx.query("select project_id from runs where id = $1", [res.runId])
      ).rows[0] as { project_id: string | null } | undefined;
      return gateDeepLink(config.appBaseUrl, {
        projectId: row?.project_id ?? null,
        runId: res.runId,
        gateId: res.gateId,
      });
    });
    return c.redirect(link, 303);
  });

  return app;
}

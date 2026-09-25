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
  listInbox,
  markInboxItemRead,
  markInboxRead,
  markInboxRunRead,
  readInboxBadge,
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
  // P1.19 — the body may toggle `email`, `inApp`, the `digest.run_finished` opt, the per-PROJECT
  // `run_progress` opt-in, and quiet hours. Non-configurable rows reject on EVERY channel — the server
  // is the authority (REQ-ACCT-1) and the delivery path ignores a stored false for them regardless.
  app.put("/notifications/prefs", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => null)) as {
      email?: unknown;
      inApp?: unknown;
      digest?: unknown;
      project?: unknown;
      quietHours?: unknown;
    } | null;
    if (!body || typeof body !== "object") return c.json({ error: "invalid payload" }, 400);

    // validate each toggled key against the event-type enum; reject a write to a non-configurable row.
    const toggles = (chan: "email" | "inApp"): Partial<Record<string, boolean>> | Response => {
      const raw = body[chan];
      const out: Partial<Record<string, boolean>> = {};
      if (raw == null) return out;
      if (typeof raw !== "object" || Array.isArray(raw)) {
        return c.json({ error: `${chan} must be an object` }, 400);
      }
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        const parsed = notificationEventTypeSchema.safeParse(key);
        if (!parsed.success) return c.json({ error: `unknown event type: ${key}` }, 400);
        if (typeof value !== "boolean") return c.json({ error: `${key} must be a boolean` }, 400);
        if (isNonConfigurableEvent(parsed.data)) {
          return c.json({ error: `${key} is not configurable` }, 400);
        }
        // the §5.11 matrix has channels some rows can't use (product_update has no in-app arm;
        // run_progress is per-PROJECT opt-in only — a global inApp toggle for it is meaningless).
        if (chan === "inApp" && parsed.data === "run_progress") {
          return c.json({ error: "run_progress is a per-project opt-in — use project.<id>.run_progress" }, 400);
        }
        out[parsed.data] = value;
      }
      return out;
    };
    const emailToggles = toggles("email");
    if (emailToggles instanceof Response) return emailToggles;
    const inAppToggles = toggles("inApp");
    if (inAppToggles instanceof Response) return inAppToggles;

    let digestToggle: "hourly" | "off" | undefined;
    if (body.digest !== undefined) {
      if (typeof body.digest !== "object" || body.digest === null) {
        return c.json({ error: "digest must be an object" }, 400);
      }
      const d = (body.digest as Record<string, unknown>).run_finished;
      if (d !== undefined && d !== "hourly" && d !== "off") {
        return c.json({ error: "digest.run_finished must be 'hourly' or 'off'" }, 400);
      }
      digestToggle = d as "hourly" | "off" | undefined;
    }

    let projectOpt: { projectId: string; enabled: boolean } | undefined;
    if (body.project !== undefined) {
      if (typeof body.project !== "object" || body.project === null) {
        return c.json({ error: "project must be an object" }, 400);
      }
      const entries = Object.entries(body.project as Record<string, unknown>);
      if (entries.length !== 1) return c.json({ error: "project writes one opt-in at a time" }, 400);
      const [projectId, val] = entries[0]!;
      const rp = (val as Record<string, unknown> | null)?.run_progress;
      if (typeof rp !== "boolean") return c.json({ error: "project.<id>.run_progress must be a boolean" }, 400);
      projectOpt = { projectId, enabled: rp };
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
      const digest = { ...(prefs.digest ?? {}) };
      if (digestToggle === "hourly") digest.run_finished = "hourly";
      else if (digestToggle === "off") delete digest.run_finished;
      const project = { ...(prefs.project ?? {}) };
      if (projectOpt) {
        project[projectOpt.projectId] = { ...(project[projectOpt.projectId] ?? {}), run_progress: projectOpt.enabled };
      }
      const next: NotificationPrefs = {
        ...prefs,
        email: { ...(prefs.email ?? {}), ...emailToggles },
        inApp: { ...(prefs.inApp ?? {}), ...inAppToggles },
        digest,
        project,
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
    // resolve the run's project SLUG for the §4.2 deep link, then redirect (both actions land in-app).
    const link = await deps.txRunner.run(res.workspaceId, async (tx) => {
      const row = (
        await tx.query(
          `select p.slug from runs r left join projects p on p.id = r.project_id where r.id = $1`,
          [res.runId],
        )
      ).rows[0] as { slug: string | null } | undefined;
      return gateDeepLink(config.appBaseUrl, {
        projectSlug: row?.slug ?? null,
        runId: res.runId,
        gateId: res.gateId,
      });
    });
    return c.redirect(link, 303);
  });

  // ---- the Inbox (P1.19; REQ-IDE-2 amended / REQ-MOBILE-19) --------------------------------------------
  //   GET  /inbox            — the §5.11 ordered item list (blocked-on-you → unread events → stale voices).
  //   POST /inbox/:item/read — mark one row read (event/voice rows only; blocked rows close by deciding).
  //   POST /inbox/read-all   — mark every visible event/voice row read.
  //   GET  /inbox/badge      — the rail badge count: open approvals + open decisions ONLY (§5.11).

  app.get("/inbox", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const items = await listInbox(deps, { userId: principal.userId, workspaceId: principal.workspaceId });
    return c.json({ items });
  });

  app.get("/inbox/badge", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const badge = await readInboxBadge(deps, {
      userId: principal.userId,
      workspaceId: principal.workspaceId,
    });
    return c.json(badge);
  });

  app.post("/inbox/read-all", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const n = await markInboxRead(deps, { userId: principal.userId, workspaceId: principal.workspaceId });
    return c.json({ ok: true, marked: n });
  });

  /** The §4.2 deep-link landing's read receipt: the run-collapsed row marks read when its surface opens. */
  app.post("/inbox/read-run/:run", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const n = await markInboxRunRead(deps, {
      userId: principal.userId,
      workspaceId: principal.workspaceId,
      runId: c.req.param("run"),
    });
    return c.json({ ok: true, marked: n });
  });

  app.post("/inbox/:item/read", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const ok = await markInboxItemRead(deps, {
      userId: principal.userId,
      workspaceId: principal.workspaceId,
      itemId: c.req.param("item"),
    });
    if (!ok) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  return app;
}

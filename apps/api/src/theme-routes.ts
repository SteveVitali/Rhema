// P1.01 — the theme endpoints (REQ-IDE-38 amended; §5.9 theme policy).
//
//   GET /settings/theme              → {appTheme} — the account's app theme (dark | light | auto).
//   PUT /settings/theme              {appTheme}  — sets "user".app_theme (the Settings control + the
//                                      IDE shell's theme cycle persist here; localStorage stays the
//                                      offline boot mirror).
//   PUT /projects/:id/paper-theme    {paperTheme} — sets projects.paper_theme ('light'|'follow'|'dark';
//                                      ⌘⇧L posts here). Per user × project — the workspace guard is the
//                                      membership check, and the value is read back on the SSR stamp.
//
// Both writes are tenant-scoped through txRunner like the privacy toggle (PRB.12).

import { Hono } from "hono";
import type { SqlClient } from "@rhema/orchestrator";
import type { Principal } from "./run-routes.js";

const APP_THEMES = new Set(["dark", "light", "auto"]);
const PAPER_THEMES = new Set(["light", "follow", "dark"]);

export interface ThemeApiDeps {
  /** session principal (same seam the other session-authed routes use). */
  principal(c: { req: { header(name: string): string | undefined } }): Principal | null;
  /** tenant-scoped transactions. */
  readonly txRunner: { run<T>(workspaceId: string, fn: (tx: SqlClient) => Promise<T>): Promise<T> };
  readonly clock: { now(): Date };
}

export function createThemeRoutes(deps: ThemeApiDeps): Hono {
  const app = new Hono();

  app.get("/settings/theme", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const appTheme = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const row = (
        await tx.query('select app_theme from "user" where id = $1', [principal.userId])
      ).rows[0] as { app_theme: string } | undefined;
      return APP_THEMES.has(row?.app_theme ?? "") ? row!.app_theme : "dark";
    });
    return c.json({ appTheme });
  });

  app.put("/settings/theme", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => null)) as { appTheme?: unknown } | null;
    if (typeof body?.appTheme !== "string" || !APP_THEMES.has(body.appTheme)) {
      return c.json({ error: "appTheme must be 'dark' | 'light' | 'auto'" }, 422);
    }
    await deps.txRunner.run(principal.workspaceId, async (tx) => {
      await tx.query('update "user" set app_theme = $2, updated_at = $3 where id = $1', [
        principal.userId,
        body.appTheme,
        deps.clock.now(),
      ]);
    });
    return c.json({ ok: true, appTheme: body.appTheme });
  });

  app.put("/projects/:id/paper-theme", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const body = (await c.req.json().catch(() => null)) as { paperTheme?: unknown } | null;
    if (typeof body?.paperTheme !== "string" || !PAPER_THEMES.has(body.paperTheme)) {
      return c.json({ error: "paperTheme must be 'light' | 'follow' | 'dark'" }, 422);
    }
    const updated = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      // RETURNING detects whether the workspace-scoped update took (PGlite reports no rowCount).
      const res = await tx.query(
        `update projects set paper_theme = $3 where id = $1 and workspace_id = $2 returning id`,
        [projectId, principal.workspaceId, body.paperTheme],
      );
      return res.rows.length;
    });
    if (!updated) return c.json({ error: "project not found" }, 404);
    return c.json({ ok: true, paperTheme: body.paperTheme });
  });

  return app;
}

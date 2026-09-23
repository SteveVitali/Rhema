import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, makeDeps, type OrchestratorTestDb, type TestDeps } from "@rhema/orchestrator/testing";
import { createThemeRoutes } from "./theme-routes.js";
import type { Principal } from "./index.js";

// P1.01 — the theme endpoints (REQ-IDE-38 amended; §5.9 theme policy) over PGlite via Hono's app.request:
//  • GET|PUT /settings/theme — the per-user app theme (dark|light|auto; dark default) round-trips through
//    "user".app_theme; a bad value 422s; no principal 401s.
//  • PUT /projects/:id/paper-theme — the per-project pin ('light'|'follow'|'dark'); a cross-workspace id
//    writes nothing and 404s (the workspace predicate IS the tenant guard).

let db: OrchestratorTestDb;
let deps: TestDeps;
const NOW = new Date("2026-09-20T12:00:00Z");

const USER = "01JQ0000000000000000000MB1";
const WS = "01JQ0000000000000000000WS1";
const BA = "ba_seed";
const PROJ = "01JQ0000000000000000PROJ1";

const principal = (): Principal => ({ userId: USER, workspaceId: WS, billingAccountId: BA });

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db, { now: NOW });
  await seedProject(db, { userId: USER, workspaceId: WS, billingAccountId: BA, projectId: PROJ, draftN: 1 });
  await db.pg.query("insert into workspace_members(workspace_id, user_id, role) values ($1,$2,'admin')", [WS, USER]);
});
afterEach(() => db.close());

function app(p: Principal | null = principal()) {
  return createThemeRoutes({ principal: () => p, txRunner: db.txRunner, clock: deps.clock });
}

const putTheme = (body: unknown) =>
  app().request("/settings/theme", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const putPaper = (id: string, body: unknown) =>
  app().request(`/projects/${id}/paper-theme`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("GET|PUT /settings/theme — the per-user app theme (P1.01)", () => {
  it("defaults dark, then round-trips light → auto", async () => {
    expect(((await (await app().request("/settings/theme")).json()) as { appTheme: string }).appTheme).toBe("dark");

    const put = await putTheme({ appTheme: "light" });
    expect(put.status).toBe(200);
    expect(((await (await app().request("/settings/theme")).json()) as { appTheme: string }).appTheme).toBe("light");

    await putTheme({ appTheme: "auto" });
    expect(((await (await app().request("/settings/theme")).json()) as { appTheme: string }).appTheme).toBe("auto");
    const row = (await db.pg.query('select app_theme from "user" where id = $1', [USER])).rows[0] as { app_theme: string };
    expect(row.app_theme).toBe("auto");
  });

  it("422s a value outside the enum; 401s without a principal", async () => {
    expect((await putTheme({ appTheme: "sepia" })).status).toBe(422);
    expect((await putTheme({})).status).toBe(422);
    expect((await app(null).request("/settings/theme")).status).toBe(401);
    expect(
      (
        await app(null).request("/settings/theme", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ appTheme: "light" }),
        })
      ).status,
    ).toBe(401);
  });
});

describe("PUT /projects/:id/paper-theme — the per-project paper pin (P1.01)", () => {
  it("writes light|follow|dark and the row reflects it", async () => {
    const res = await putPaper(PROJ, { paperTheme: "follow" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { paperTheme: string }).paperTheme).toBe("follow");
    const row = (await db.pg.query("select paper_theme from projects where id = $1", [PROJ])).rows[0] as {
      paper_theme: string;
    };
    expect(row.paper_theme).toBe("follow");
  });

  it("422s a bad value; 404s an unknown or cross-workspace project", async () => {
    expect((await putPaper(PROJ, { paperTheme: "sepia" })).status).toBe(422);
    expect((await putPaper("01JQ0000000000000000OTHER", { paperTheme: "dark" })).status).toBe(404);
    // a project in a DIFFERENT workspace: the update's workspace predicate matches nothing → 404, no write.
    await db.pg.query("insert into billing_accounts(id) values ('ba_ext') on conflict (id) do nothing");
    await db.pg.query(
      "insert into workspaces(id, kind, name, billing_account_id) values ($1,'personal','Ext','ba_ext')",
      ["01JQ0000000000000000EXTWS"],
    );
    await db.pg.query(
      "insert into projects(id, workspace_id, owner_id, title, slug) values ($1,$2,$3,'Other','slug-other')",
      ["01JQ0000000000000000EXT01", "01JQ0000000000000000EXTWS", USER],
    );
    expect((await putPaper("01JQ0000000000000000EXT01", { paperTheme: "dark" })).status).toBe(404);
    const row = (await db.pg.query("select paper_theme from projects where id = $1", ["01JQ0000000000000000EXT01"]))
      .rows[0] as { paper_theme: string };
    expect(row.paper_theme).toBe("light"); // the 0002 default stands untouched
  });
});

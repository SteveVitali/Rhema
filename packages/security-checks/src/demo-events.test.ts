import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "@rhema/db";

// 223 R7DEM.6b (REQ-TOUR-9; ADR-126) — the anonymous demo-metrics carve-out, proven on
// PGlite (the same migrator prod's 224 deploy job runs):
//
//   * the migration is additive per check-additive-migrations (the exact committed file is
//     lint-clean, and the rule the design avoids is LIVE — a `GRANT rhema_demo_writer TO
//     rhema_app` variant reads `role_change`);
//   * the user-serving role `rhema_app_login` holds NO table privilege on `demo_events`
//     (select/insert/update/delete all denied) yet CAN insert through the
//     `rhema_demo_event_insert` SECURITY DEFINER channel — one row per valid call, nothing
//     on an out-of-enum or oversize argument;
//   * the function is `prosecdef` and owned by `rhema_demo_writer` (the insert-only NOLOGIN
//     role, granted INSERT only);
//   * the table carries no PII column — no ip/ip-hash/user/cookie/ua of any kind.
//
// Stage-B residue (D-R7DEM.6b-1): the same file applied by the real Cloud SQL migration role
// (PGlite runs superuser; PG16 `createrole_self_grant` makes OWNER TO legal since the role is
// created in this file) plus one deployed `POST /a/demo` → `demo_events` row.

let pg: PGlite;
beforeEach(async () => {
  pg = new PGlite();
  await pg.exec("select 1");
  await applyMigrations({
    exec: (sql: string) => pg.exec(sql),
    query: (sql: string, params?: unknown[]) => pg.query(sql, params as unknown[]),
  });
});
afterEach(() => pg.close());

const rows = async (sql: string, params: unknown[] = []) =>
  (await pg.query(sql, params)).rows as Record<string, unknown>[];

describe("the insert-only channel (AC2)", () => {
  it("the user-serving role holds NO table privilege on demo_events", async () => {
    await pg.exec("set role rhema_app_login");
    try {
      for (const verb of ["select", "insert", "update", "delete"] as const) {
        const stmt =
          verb === "select"
            ? "select * from public.demo_events"
            : verb === "insert"
              ? "insert into public.demo_events (event) values ('demo.hub_viewed')"
              : verb === "update"
                ? "update public.demo_events set src = 'x'"
                : "delete from public.demo_events";
        await expect(pg.query(stmt)).rejects.toThrow();
      }
    } finally {
      await pg.exec("reset role");
    }
  });

  it("rhema_demo_event_insert is SECURITY DEFINER, owned by rhema_demo_writer", async () => {
    const [fn] = await rows(
      `select p.prosecdef, r.rolname as owner
         from pg_proc p join pg_roles r on r.oid = p.proowner
        where p.proname = 'rhema_demo_event_insert'`,
    );
    expect(fn).toBeDefined();
    expect(fn!.prosecdef).toBe(true);
    expect(fn!.owner).toBe("rhema_demo_writer");
    const [role] = await rows(
      `select rolsuper, rolbypassrls, rolcanlogin, rolcreatedb, rolcreaterole
         from pg_roles where rolname = 'rhema_demo_writer'`,
    );
    expect(role).toMatchObject({
      rolsuper: false,
      rolbypassrls: false,
      rolcanlogin: false,
      rolcreatedb: false,
      rolcreaterole: false,
    });
    // rhema_demo_writer is a member of NOTHING — no membership grant shipped.
    const memberships = await rows(
      `select p.rolname from pg_auth_members am
         join pg_roles m on m.oid = am.member join pg_roles p on p.oid = am.roleid
        where m.rolname = 'rhema_demo_writer'`,
    );
    expect(memberships).toEqual([]);
  });

  it("the user-serving role inserts exactly one row per valid call — nothing else it tries lands", async () => {
    await pg.exec("set role rhema_app_login");
    try {
      await pg.query(
        `select public.rhema_demo_event_insert('demo.hub_viewed', 'the-governable-mind', null, 'jrn')`,
      );
      // out-of-enum rejected.
      await expect(
        pg.query(`select public.rhema_demo_event_insert('demo.evil', null, null, null)`),
      ).rejects.toThrow();
      // oversize essay rejected.
      await expect(
        pg.query(
          `select public.rhema_demo_event_insert('demo.hub_viewed', repeat('x', 81), null, null)`,
        ),
      ).rejects.toThrow();
      // out-of-range step rejected.
      await expect(
        pg.query(`select public.rhema_demo_event_insert('demo.tour_started', 'e', 100, null)`),
      ).rejects.toThrow();
    } finally {
      await pg.exec("reset role");
    }
    // asserted as the migration owner (the table is unreadable to the user role — that IS the pin).
    const [n] = await rows("select count(*)::int c from public.demo_events");
    expect(n!.c).toBe(1);
    const [row] = await rows("select event, essay, step, src from public.demo_events");
    expect(row).toMatchObject({
      event: "demo.hub_viewed",
      essay: "the-governable-mind",
      step: null,
      src: "jrn",
    });
  });

  it("PUBLIC cannot call the function; rhema_app can", async () => {
    const [pub] = await rows(
      `select has_function_privilege('public', 'public.rhema_demo_event_insert(text,text,integer,text)', 'execute') ok`,
    );
    expect(pub!.ok).toBe(false);
    const [app] = await rows(
      `select has_function_privilege('rhema_app', 'public.rhema_demo_event_insert(text,text,integer,text)', 'execute') ok`,
    );
    expect(app!.ok).toBe(true);
  });
});

describe("the no-PII schema pin (deliverable 7)", () => {
  it("demo_events has exactly the six anonymous columns — no ip/user/cookie/ua of any kind", async () => {
    const cols = await rows(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'demo_events' order by 1`,
    );
    expect(cols.map((c) => c.column_name)).toEqual(["at", "essay", "event", "id", "src", "step"]);
    for (const banned of [
      "ip", "ip_hash", "user_id", "user", "workspace_id", "cookie", "ua", "user_agent",
      "session", "session_id", "principal", "email", "referer", "referrer",
    ]) {
      expect(
        cols.some((c) => String(c.column_name).includes(banned)),
        `PII-shaped column ${banned} present`,
      ).toBe(false);
    }
  });
});

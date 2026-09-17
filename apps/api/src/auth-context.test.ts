// PRB.16 — the live session principal + tenant-scoped `db` binding (D-P0.01-3 / D-PRB.01-3 legs).
// Deterministic on PGlite: the session→principal join, the cookie-token parse, the CSRF origin guard,
// the session middleware's skip paths, and the scoped-db tenant behavior — all asserted on the real
// migrated schema, never on fakes of the SQL itself.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { createOrchestratorTestDb, type OrchestratorTestDb } from "@rhema/orchestrator/testing";
import {
  SESSION_COOKIE_NAMES,
  createOriginGuard,
  createScopedDb,
  createSessionMiddleware,
  currentPrincipal,
  currentTenant,
  headerIdentityPrincipal,
  resolveSessionPrincipal,
  runWithPrincipal,
  sessionScopedPrincipal,
  sessionTokenFromCookieHeader,
  type TenantPool,
} from "./auth-context.js";

let db: OrchestratorTestDb;
beforeEach(async () => {
  db = await createOrchestratorTestDb();
});
afterEach(() => db.close());

// ---- sessionTokenFromCookieHeader -------------------------------------------------------------------------

describe("sessionTokenFromCookieHeader", () => {
  it("extracts the raw token from the prod __Host- cookie and strips the .signature suffix", () => {
    expect(
      sessionTokenFromCookieHeader(
        "__Host-rhema.session_token=tok_abc123.deadsignature; other=1",
      ),
    ).toBe("tok_abc123");
  });

  it("accepts the http-dev cookie name too", () => {
    expect(sessionTokenFromCookieHeader("rhema-dev.session_token=tok_dev")).toBe("tok_dev");
  });

  it("ignores unknown cookie names, empty values, and missing headers", () => {
    expect(sessionTokenFromCookieHeader("session_token=nope")).toBeNull();
    expect(sessionTokenFromCookieHeader("__Host-rhema.session_token=")).toBeNull();
    expect(sessionTokenFromCookieHeader(undefined)).toBeNull();
    expect(sessionTokenFromCookieHeader("")).toBeNull();
  });
});

// ---- resolveSessionPrincipal -------------------------------------------------------------------------------

async function seedAccount(opts: { withSession?: boolean; withMembership?: boolean } = {}) {
  const { withSession = true, withMembership = true } = opts;
  await db.client.query(`insert into "user"(id, email) values ('u1','a@b.com')`);
  await db.client.query(`insert into billing_accounts(id) values ('ba1')`);
  await db.client.query(
    `insert into workspaces(id, kind, name, billing_account_id) values ('ws1','personal','Personal','ba1')`,
  );
  if (withMembership) {
    await db.client.query(
      `insert into workspace_members(workspace_id, user_id, role) values ('ws1','u1','admin')`,
    );
  }
  if (withSession) {
    await db.client.query(
      `insert into session(id, user_id, token, expires_at) values ('s1','u1','tok_live', now() + interval '1 hour')`,
    );
  }
}

describe("resolveSessionPrincipal", () => {
  it("resolves a live session token to user + personal workspace + billing account", async () => {
    await seedAccount();
    const p = await resolveSessionPrincipal(db.client, "tok_live");
    expect(p).toEqual({ userId: "u1", workspaceId: "ws1", billingAccountId: "ba1" });
  });

  it("returns null for an unknown token, an expired session, and an unprovisioned user", async () => {
    await seedAccount();
    expect(await resolveSessionPrincipal(db.client, "nope")).toBeNull();
    await db.client.query(
      `insert into session(id, user_id, token, expires_at) values ('s2','u1','tok_old', now() - interval '1 hour')`,
    );
    expect(await resolveSessionPrincipal(db.client, "tok_old")).toBeNull();
    await seedAccount({ withSession: true, withMembership: false }).catch(() => undefined);
    await db.client.query(`insert into "user"(id, email) values ('u2','b@b.com')`);
    await db.client.query(
      `insert into session(id, user_id, token, expires_at) values ('s3','u2','tok_orphan', now() + interval '1 hour')`,
    );
    expect(await resolveSessionPrincipal(db.client, "tok_orphan")).toBeNull();
  });
});

// ---- session middleware + principal seam --------------------------------------------------------------------

function appWith(opts: { resolve?: (req: Request) => Promise<{ userId: string; workspaceId: string; billingAccountId: string } | null>; identityHeaders?: boolean }) {
  const app = new Hono();
  app.use(
    "*",
    createSessionMiddleware({
      resolve: opts.resolve ?? (async () => null),
      ...(opts.identityHeaders ? { identityHeaders: true } : {}),
    }),
  );
  app.get("/whoami", (c) => c.json(currentPrincipal()));
  app.get("/api/auth/session", (c) => c.json({ skipped: currentPrincipal() === null }));
  return app;
}

describe("createSessionMiddleware", () => {
  const PRINCIPAL = { userId: "u1", workspaceId: "ws1", billingAccountId: "ba1" };

  it("resolves the request's session into the ALS principal the routes read", async () => {
    const app = appWith({ resolve: async () => PRINCIPAL });
    const res = await app.request("/whoami");
    expect(await res.json()).toEqual(PRINCIPAL);
  });

  it("never resolves for /api/auth/* (Better Auth serves those) nor Bearer-token internal calls", async () => {
    const seen: string[] = [];
    const app = appWith({
      resolve: async () => {
        seen.push("resolve");
        return PRINCIPAL;
      },
    });
    await app.request("/api/auth/session");
    const res = await app.request("/whoami", { headers: { authorization: "Bearer tok" } });
    expect(await res.json()).toBeNull();
    expect(seen).toHaveLength(0); // the resolver never ran for either skipped path
  });

  it("identityHeaders fallback only applies when opted in (dev/preview) and no session resolved", async () => {
    const headers = {
      "x-rhema-user-id": "uh",
      "x-rhema-workspace-id": "wh",
      "x-rhema-billing-account-id": "bh",
    };
    const off = appWith({});
    expect(await (await off.request("/whoami", { headers })).json()).toBeNull();
    const on = appWith({ identityHeaders: true });
    expect(await (await on.request("/whoami", { headers })).json()).toEqual({
      userId: "uh",
      workspaceId: "wh",
      billingAccountId: "bh",
    });
    // a resolved session always wins over the shim
    const both = appWith({ resolve: async () => PRINCIPAL, identityHeaders: true });
    expect(await (await both.request("/whoami", { headers })).json()).toEqual(PRINCIPAL);
  });

  it("sessionScopedPrincipal reads the ALS (and never the headers)", async () => {
    await runWithPrincipal(PRINCIPAL, async () => {
      expect(sessionScopedPrincipal({ req: { header: () => undefined } })).toEqual(PRINCIPAL);
      expect(currentTenant()).toBe("ws1");
    });
    expect(sessionScopedPrincipal({ req: { header: () => "uh" } })).toBeNull();
    expect(currentPrincipal()).toBeNull();
    expect(currentTenant()).toBeNull();
  });
});

// ---- origin guard --------------------------------------------------------------------------------------------

describe("createOriginGuard (CSRF)", () => {
  const app = new Hono();
  app.use("*", createOriginGuard(["https://rhema.tools"]));
  app.get("/r", (c) => c.json({ ok: true }));
  app.post("/w", (c) => c.json({ ok: true }));

  it("passes GET regardless of Origin; passes mutations with no Origin or an allowlisted one", async () => {
    expect((await app.request("/r", { headers: { origin: "https://evil.example" } })).status).toBe(200);
    expect((await app.request("/w", { method: "POST" })).status).toBe(200);
    expect(
      (await app.request("/w", { method: "POST", headers: { origin: "https://rhema.tools" } })).status,
    ).toBe(200);
  });

  it("rejects a mutation carrying a non-allowlisted Origin (usercontent.* is same-site ⇒ SameSite is not enough)", async () => {
    const res = await app.request("/w", {
      method: "POST",
      headers: { origin: "https://usercontent.rhema.tools" },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden_origin" });
  });
});

// ---- scoped db (D-PRB.01-3) -----------------------------------------------------------------------------------

describe("createScopedDb", () => {
  /** A TenantPool over the PGlite handle that records which path a query took + the tenant in scope. */
  function fakePool() {
    const calls: { sql: string; tenant: string | null; via: "pool" | "client" }[] = [];
    const q = (via: "pool" | "client") => async (sql: string, params?: unknown[]) => {
      const tenant =
        via === "client"
          ? ((await db.client.query("select current_setting('app.tenant_id', true) t")).rows[0] as {
              t: string | null;
            }).t
          : null;
      calls.push({ sql, tenant, via });
      return db.client.query(sql, params ?? []);
    };
    const pool: TenantPool = {
      query: (sql, params) => q("pool")(sql, params),
      connect: async () => ({ query: (sql, params) => q("client")(sql, params), release: () => {} }),
    };
    return { pool, calls };
  }

  it("unscoped requests run on the raw pool (no tenant — FORCE-RLS tables answer empty)", async () => {
    const { pool, calls } = fakePool();
    const scoped = createScopedDb(pool);
    await scoped.query("select 1");
    expect(calls[0]).toMatchObject({ via: "pool", tenant: null });
  });

  it("a request tenant wraps the query in withTenant (set_config'd, then released)", async () => {
    const { pool, calls } = fakePool();
    const scoped = createScopedDb(pool);
    await runWithPrincipal(
      { userId: "u1", workspaceId: "ws_tenant", billingAccountId: "ba1" },
      async () => {
        await scoped.query("select 1");
      },
    );
    // withTenant wraps: begin → set_config(app.tenant_id) → the query → commit — all on the client.
    const userQuery = calls.find((x) => x.sql === "select 1");
    expect(userQuery).toMatchObject({ via: "client", tenant: "ws_tenant" });
    expect(calls.every((x) => x.via === "client")).toBe(true);
  });
});

// ---- headerIdentityPrincipal ----------------------------------------------------------------------------------

describe("headerIdentityPrincipal", () => {
  it("requires all three x-rhema-* headers (any missing ⇒ null)", () => {
    const c = (h: Record<string, string>) => ({ req: { header: (n: string) => h[n] } });
    expect(
      headerIdentityPrincipal(c({
        "x-rhema-user-id": "u",
        "x-rhema-workspace-id": "w",
        "x-rhema-billing-account-id": "b",
      }) as never),
    ).toEqual({ userId: "u", workspaceId: "w", billingAccountId: "b" });
    expect(headerIdentityPrincipal(c({ "x-rhema-user-id": "u" }) as never)).toBeNull();
  });
});

// ---- surface shape --------------------------------------------------------------------------------------------

describe("session cookie names", () => {
  it("the prod name is the __Host- literal (browser-enforced Secure+Path=/+no-Domain)", () => {
    expect(SESSION_COOKIE_NAMES[0]).toBe("__Host-rhema.session_token");
  });
});

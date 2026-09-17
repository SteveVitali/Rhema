// PRB.16 — the live session principal + tenant-scoped `db` binding (D-P0.01-3 / D-PRB.01-3 legs).
//
// The prod auth topology (single-zone amendment, 2026-09-17): the app lives on `rhema.tools`, the api on
// `api.rhema.tools`, user content on `usercontent.rhema.tools`. The browser NEVER calls the api directly —
// the SSR web service is the api's only client, so Better Auth's `baseURL` is the APP origin
// (`https://rhema.tools`) and web proxies `/api/auth/*` server-side. Every auth cookie — OAuth `state`,
// `session_token` — therefore plants host-only on the app host with no cross-host bridge, and the OAuth
// callback is `https://rhema.tools/api/auth/callback/google` (proxied to the api). Web then forwards the
// browser's Cookie header on every api data call and `resolveSessionPrincipal` resolves it here.
//
// Security notes:
//  • A `__Host-` cookie lives only on `rhema.tools` — it can never ride to `usercontent.*` (the whole
//    point of the host-only contract) nor to `api.rhema.tools`. The api still refuses non-allowlisted
//    `Origin`s on mutations (`createOriginGuard`): the user-content host is same-site, so SameSite=Lax
//    alone cannot stop a `usercontent.*` page from POSTing to api.rhema.tools with any api-host cookie
//    an operator ever planted there.
//  • `resolveSessionPrincipal` reads the session table directly: a session token is a bearer credential
//    (the better-auth cookie value is `token.signature`; the raw token is the part before the first `.`).
//  • `createScopedDb` runs every query inside `withTenant` when a request tenant is in scope, so RLS is
//    the backstop for the routes that consume `deps.db` (D-PRB.01-3); unscoped requests get a raw client
//    under which FORCE-RLS tables answer empty (deny by default).

import { AsyncLocalStorage } from "node:async_hooks";
import type { Context, MiddlewareHandler, Next } from "hono";
import { withTenant } from "@rhema/db";
import type { SqlClient } from "./invite.js";
import type { Principal } from "./run-routes.js";

// ---- request-scoped context (principal + tenant) ---------------------------------------------------------

interface RequestAuthContext {
  readonly principal: Principal | null;
}

const requestContext = new AsyncLocalStorage<RequestAuthContext>();

/** Run `fn` with the request's resolved principal in scope (session middleware calls this). */
export function runWithPrincipal<T>(principal: Principal | null, fn: () => Promise<T>): Promise<T> {
  return requestContext.run({ principal }, fn);
}

/** The resolved principal for the in-flight request, or null (unauthenticated / outside middleware). */
export function currentPrincipal(): Principal | null {
  return requestContext.getStore()?.principal ?? null;
}

/** The request's RLS tenant (the principal's workspace), or null for unauthenticated/system requests. */
export function currentTenant(): string | null {
  return requestContext.getStore()?.principal?.workspaceId ?? null;
}

// ---- session cookie → principal ---------------------------------------------------------------------------

/** The session-cookie names this deploy can emit (prod `__Host-` name; dev http fallback name). */
export const SESSION_COOKIE_NAMES = [
  "__Host-rhema.session_token",
  "rhema-dev.session_token",
] as const;

/** Extract the raw session token from a `Cookie` header value (strips the `token.signature` suffix). */
export function sessionTokenFromCookieHeader(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (!(SESSION_COOKIE_NAMES as readonly string[]).includes(name)) continue;
    const value = part.slice(eq + 1).trim();
    const token = value.split(".")[0] ?? "";
    return token || null;
  }
  return null;
}

interface SessionRow {
  user_id: string;
  workspace_id: string;
  billing_account_id: string;
}

/**
 * Resolve a session token to the app principal (user + personal workspace + billing account). The session
 * row must be unexpired; the principal is the user's PERSONAL workspace (the beta's single-workspace model).
 * Returns null for an unknown/expired token or an unprovisioned user (no membership).
 */
export async function resolveSessionPrincipal(
  db: SqlClient,
  token: string,
): Promise<Principal | null> {
  const row = (
    await db.query(
      `select s.user_id, m.workspace_id, w.billing_account_id
         from session s
         join workspace_members m on m.user_id = s.user_id
         join workspaces w on w.id = m.workspace_id and w.kind = 'personal'
        where s.token = $1 and s.expires_at > now()
        order by s.created_at desc
        limit 1`,
      [token],
    )
  ).rows[0] as SessionRow | undefined;
  if (!row) return null;
  return {
    userId: row.user_id,
    workspaceId: row.workspace_id,
    billingAccountId: row.billing_account_id,
  };
}

// ---- middleware ---------------------------------------------------------------------------------------------

export interface SessionMiddlewareOptions {
  /** resolve the session cookie on the request to a principal (live: DB lookup). */
  readonly resolve: (req: Request) => Promise<Principal | null>;
  /**
   * Dev/preview fallback: trust the gateway-injected `x-rhema-*` identity headers when no session
   * resolves. NEVER enabled on prod (a client could forge identity); the deploy sets it per-stage.
   */
  readonly identityHeaders?: boolean;
}

/** The header-identity fallback (dev/preview stages only — see `identityHeaders`). */
export function headerIdentityPrincipal(c: Context): Principal | null {
  const userId = c.req.header("x-rhema-user-id");
  const workspaceId = c.req.header("x-rhema-workspace-id");
  const billingAccountId = c.req.header("x-rhema-billing-account-id");
  if (!userId || !workspaceId || !billingAccountId) return null;
  return { userId, workspaceId, billingAccountId };
}

/**
 * Resolve the session principal once per request and carry it (+ its tenant) in the ALS context the
 * `deps.principal` seam and the scoped `deps.db` read. Skips resolution for `/api/auth/*` (Better Auth
 * serves those itself) and Bearer-token internal calls (the run-token middleware authenticates those).
 */
export function createSessionMiddleware(opts: SessionMiddlewareOptions): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const path = new URL(c.req.url).pathname;
    const bearer = c.req.header("authorization")?.startsWith("Bearer ");
    if (path.startsWith("/api/auth/") || bearer) {
      await runWithPrincipal(null, next);
      return;
    }
    let principal = await opts.resolve(c.req.raw);
    if (!principal && opts.identityHeaders) principal = headerIdentityPrincipal(c);
    await runWithPrincipal(principal, next);
  };
}

/** A `deps.principal` seam that returns the middleware-resolved principal (sync — the ALS holds it). */
export function sessionScopedPrincipal(c: {
  req: { header(name: string): string | undefined };
}): Principal | null {
  const p = currentPrincipal();
  if (p) return p;
  // Outside the middleware's ALS (e.g. unit tests that call the app without it) — null, never headers.
  void c;
  return null;
}

// ---- CSRF origin guard --------------------------------------------------------------------------------------

/**
 * Refuse state-changing requests carrying a non-allowlisted `Origin` (the single-zone user-content host is
 * same-site, so SameSite=Lax alone cannot stop a `usercontent.*` page from POSTing with credentials). A
 * request with NO Origin (curl, server-side) is unaffected; browsers always send Origin on cross-origin
 * mutations, and the header cannot be forged by a page.
 */
export function createOriginGuard(allowedOrigins: readonly string[]): MiddlewareHandler {
  const allowed = new Set(allowedOrigins);
  return async (c: Context, next: Next) => {
    const method = c.req.method;
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      await next();
      return;
    }
    const origin = c.req.header("origin");
    if (origin && !allowed.has(origin)) {
      return c.json({ error: "forbidden_origin" }, 403);
    }
    await next();
  };
}

// ---- tenant-scoped `db` (D-PRB.01-3) ------------------------------------------------------------------------

/** The minimal pool surface the scoped client needs (a `pg.Pool` satisfies it). */
export interface TenantPool {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  connect(): Promise<{ query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>; release(): void }>;
}

/**
 * The live `deps.db` binding: every query runs inside `withTenant` on a dedicated checked-out connection
 * when the request carries a principal (RLS backstop + the code-level filters), or on the raw pool when
 * unauthenticated — under FORCE RLS an unscoped query sees zero rows on tenant tables (deny by default),
 * while the non-RLS account tables (`user`, `workspaces`, `session`, …) stay reachable for signup/auth.
 */
export function createScopedDb(pool: TenantPool): SqlClient {
  return {
    async query(sql: string, params?: readonly unknown[]): Promise<{ rows: unknown[] }> {
      const tenant = currentTenant();
      if (!tenant) {
        const res = await pool.query(sql, params ? [...params] : undefined);
        return { rows: res.rows };
      }
      const client = await pool.connect();
      try {
        return await withTenant(client, tenant, () =>
          client.query(sql, params ? [...params] : undefined).then((r) => ({ rows: r.rows })),
        );
      } finally {
        client.release();
      }
    },
  };
}



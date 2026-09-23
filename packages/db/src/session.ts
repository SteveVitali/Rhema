// Session-token → principal resolution, shared by every service that authenticates a browser session
// (the api's HTTP middleware AND the collab service's WebSocket auth hook — P1.03). The session row is
// read directly: a session token is a bearer credential (the better-auth cookie value is
// `token.signature`; the raw token is the part before the first `.`). These tables are NOT tenant-RLS'd
// (the auth path runs before a tenant exists), so this resolution is deliberately unscoped — every
// caller must scope all SUBSEQUENT queries with `withTenant`.
//
// Moved here from apps/api/src/auth-context.ts in P1.03 so `apps/collab` resolves the same session →
// principal join verbatim instead of duplicating the auth path (REQ-DATA-44's auth-hook half).

/** The resolved session principal: the user + their PERSONAL workspace + billing account. */
export interface SessionPrincipal {
  readonly userId: string;
  readonly workspaceId: string;
  readonly billingAccountId: string;
}

/** The minimal SQL surface `resolveSessionPrincipal` needs (pg.Pool/Client and PGlite satisfy it). */
export interface SessionSqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

/** The session-cookie names this deploy can emit (prod `__Host-` name; dev http fallback name). */
export const SESSION_COOKIE_NAMES = [
  "__Host-rhema.session_token",
  "rhema-dev.session_token",
] as const;

/** Extract the raw session token from a `Cookie` header value (strips the `token.signature` suffix). */
export function sessionTokenFromCookieHeader(cookieHeader: string | undefined | null): string | null {
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
  db: SessionSqlClient,
  token: string,
): Promise<SessionPrincipal | null> {
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

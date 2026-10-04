import { Hono } from "hono";
import { ArchiveImportError, importAccountZip } from "@rhema/archive";
import type { ContentStore } from "@rhema/mirror";
import { sha256Hex } from "@rhema/mirror";
import type { Queue, SqlClient, TxRunner } from "@rhema/orchestrator";
import type { Principal } from "./run-routes.js";

// Account export/import routes (P1.18; REQ-ACCT-3; §13.4). "Export everything" inserts an
// account_exports row and enqueues `account.export` — the worker builds the zip through
// @rhema/archive, stores it content-addressed under the workspace's object bucket, mints the
// emailed link token (hash only on the row — the secret rides the email) and sends it. The
// download route is TOKEN-gated (the link is the credential, REQ-ARCH-30's discipline: no session
// needed, the token never persists). Idempotency: a `building` row or an unexpired `ready` row
// answers a repeat request instead of starting a second build; the import half dedupes on
// deterministic derived ids (packages/archive).

/** The pg-boss queue the account-export worker consumes (created in apps/api + apps/worker). */
export const ACCOUNT_EXPORT_QUEUE = "account.export";
/** §13.4 — the emailed zip link lives seven days from mint. */
export const ACCOUNT_EXPORT_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** The import body cap — an account zip is draft bytes; 256 MB is far beyond any sane account. */
const MAX_IMPORT_BYTES = 256 * 1024 * 1024;

export interface AccountExportRow {
  id: string;
  status: "building" | "ready" | "failed";
  sha256: string | null;
  bytes: number | null;
  s3_key: string | null;
  error: string | null;
  created_at: Date;
  ready_at: Date | null;
  expires_at: Date | null;
  downloaded_at: Date | null;
}

export interface AccountExportApiDeps {
  readonly principal: (c: { req: { header(name: string): string | undefined } }) => Principal | null;
  readonly db: SqlClient;
  /**
   * CAP.3 (D-STB.5a-1) — the system-scoped executor (BYPASSRLS) for the emailed token link's
   * lookup. `account_exports` is FORCE-RLS and the token route is anonymous — the token IS the
   * credential, so the cross-tenant `token_sha256 → row` resolve cannot run on the user-serving
   * pool (it would read zero rows → a 404 on every valid link, forever). Unset ⇒ the public
   * route fails closed with 503 `download_unavailable`; the session-authed routes never touch it.
   */
  readonly systemExec?: SqlClient;
  readonly txRunner: TxRunner;
  readonly ids: (prefix?: string) => string;
  readonly clock: { now(): Date };
  /** the queue the build job rides — unset ⇒ POST /account/export answers 503 `queue_unavailable`. */
  readonly queue?: Queue;
  /** presign a download URL for the zip's `s3_key` (GCS v4 live; injected in tests). */
  readonly presignGet?: (objectKey: string) => Promise<string> | string;
  /** content store the import re-stores bytes under (unset ⇒ import 503s). */
  readonly store?: ContentStore;
  readonly contentStoreFor?: (workspaceId: string) => Promise<ContentStore | null>;
}

function rowDto(r: AccountExportRow, now: Date, downloadPath: string | null) {
  const expired = r.expires_at != null && r.expires_at.getTime() <= now.getTime();
  return {
    id: r.id,
    status: r.status,
    bytes: r.bytes,
    sha256: r.sha256,
    error: r.error,
    createdAt: r.created_at.toISOString(),
    readyAt: r.ready_at?.toISOString() ?? null,
    expiresAt: r.expires_at?.toISOString() ?? null,
    expired,
    downloadedAt: r.downloaded_at?.toISOString() ?? null,
    ...(r.status === "ready" && !expired && downloadPath ? { downloadPath } : {}),
  };
}

export function createAccountExportRoutes(deps: AccountExportApiDeps): Hono {
  const app = new Hono();

  const storeFor = async (workspaceId: string): Promise<ContentStore | null> =>
    (deps.contentStoreFor ? await deps.contentStoreFor(workspaceId) : deps.store) ?? null;

  // ---- the state read the export page polls: the workspace's latest account_exports row. ----
  app.get("/account/export", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const row = (
      await deps.db.query(
        `select id, status, sha256, bytes, s3_key, error, created_at, ready_at, expires_at, downloaded_at
           from account_exports where workspace_id = $1 order by created_at desc limit 1`,
        [principal.workspaceId],
      )
    ).rows[0] as AccountExportRow | undefined;
    if (!row) return c.json({ export: null });
    const downloadPath =
      row.status === "ready" ? `/account/export/download?id=${encodeURIComponent(row.id)}` : null;
    return c.json({ export: rowDto(row, deps.clock.now(), downloadPath) });
  });

  // ---- "Export everything" — enqueue the build. A `building` row answers a repeat click; an
  //      unexpired `ready` row answers it too (the same link still lives). ----
  app.post("/account/export", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!deps.queue) return c.json({ error: "queue_unavailable" }, 503);
    const now = deps.clock.now();
    const existing = (
      await deps.db.query(
        `select id, status, sha256, bytes, s3_key, error, created_at, ready_at, expires_at, downloaded_at
           from account_exports where workspace_id = $1 order by created_at desc limit 1`,
        [principal.workspaceId],
      )
    ).rows[0] as AccountExportRow | undefined;
    if (
      existing &&
      (existing.status === "building" ||
        (existing.status === "ready" &&
          existing.expires_at != null &&
          existing.expires_at.getTime() > now.getTime()))
    ) {
      return c.json({ export: rowDto(existing, now, null), deduped: true });
    }
    const id = deps.ids("aexp");
    await deps.db.query(
      `insert into account_exports (id, workspace_id, user_id, kind, status) values ($1,$2,$3,'account_zip','building')`,
      [id, principal.workspaceId, principal.userId],
    );
    // singletonKey dedupes a double-click racing the insert read above.
    await deps.queue.send(
      ACCOUNT_EXPORT_QUEUE,
      { exportId: id, workspaceId: principal.workspaceId, userId: principal.userId },
      { singletonKey: `${ACCOUNT_EXPORT_QUEUE}:${id}` },
    );
    const row = (
      await deps.db.query(
        `select id, status, sha256, bytes, s3_key, error, created_at, ready_at, expires_at, downloaded_at
           from account_exports where id = $1`,
        [id],
      )
    ).rows[0] as AccountExportRow;
    return c.json({ export: rowDto(row, now, null), deduped: false }, 202);
  });

  // ---- the session-authed in-app download (latest ready zip). The emailed link's public
  //      token route is /export/download below. ----
  app.get("/account/export/download", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const id = c.req.query("id");
    const row = id
      ? ((
          await deps.db.query(
            `select id, status, sha256, bytes, s3_key, error, created_at, ready_at, expires_at, downloaded_at
               from account_exports where id = $1 and workspace_id = $2`,
            [id, principal.workspaceId],
          )
        ).rows[0] as AccountExportRow | undefined)
      : ((
          await deps.db.query(
            `select id, status, sha256, bytes, s3_key, error, created_at, ready_at, expires_at, downloaded_at
               from account_exports where workspace_id = $1 order by created_at desc limit 1`,
            [principal.workspaceId],
          )
        ).rows[0] as AccountExportRow | undefined);
    if (!row || row.status !== "ready" || !row.s3_key) return c.json({ error: "not_found" }, 404);
    const now = deps.clock.now();
    if (row.expires_at != null && row.expires_at.getTime() <= now.getTime()) {
      return c.json({ error: "export_link_expired" }, 410);
    }
    if (!deps.presignGet) return c.json({ error: "download_unavailable" }, 503);
    await deps.db.query(`update account_exports set downloaded_at = now() where id = $1`, [row.id]);
    return c.json({ downloadUrl: await deps.presignGet(row.s3_key) });
  });

  // ---- the emailed link — token-gated, no session. The token is the credential; the row stores
  //      only its hash. Expired ⇒ 410 (the link lived its seven days). The resolve + the
  //      downloaded_at stamp run on `systemExec`: the lookup is cross-tenant by design (no session
  //      ⇒ no tenant GUC ⇒ the FORCE-RLS table reads empty on the user pool — D-STB.5a-1). ----
  app.get("/export/download", async (c) => {
    const token = c.req.query("token") ?? "";
    if (!token) return c.json({ error: "not_found" }, 404);
    const sys = deps.systemExec;
    if (!sys) return c.json({ error: "download_unavailable" }, 503);
    const tokenSha = sha256Hex(token);
    const row = (
      await sys.query(
        `select id, status, sha256, bytes, s3_key, error, created_at, ready_at, expires_at, downloaded_at
           from account_exports where token_sha256 = $1`,
        [tokenSha],
      )
    ).rows[0] as AccountExportRow | undefined;
    if (!row || row.status !== "ready" || !row.s3_key) return c.json({ error: "not_found" }, 404);
    const now = deps.clock.now();
    if (row.expires_at != null && row.expires_at.getTime() <= now.getTime()) {
      return c.json({ error: "export_link_expired" }, 410);
    }
    if (!deps.presignGet) return c.json({ error: "download_unavailable" }, 503);
    await sys.query(`update account_exports set downloaded_at = now() where id = $1`, [row.id]);
    // A 302 sends the mail client straight to the object URL — the token leaves no trace on it.
    return c.redirect(await deps.presignGet(row.s3_key), 302);
  });

  // ---- the fresh-account half (REQ-ACCT-3): raw zip bytes → the deterministic importer. The
  //      importer's derived ids make a re-import a no-op (deduped: true). ----
  app.post("/account/import", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const store = await storeFor(principal.workspaceId);
    if (!store) return c.json({ error: "content_store_unavailable" }, 503);
    const buf = Buffer.from(await c.req.arrayBuffer());
    if (buf.byteLength === 0) return c.json({ error: "empty_body" }, 400);
    if (buf.byteLength > MAX_IMPORT_BYTES) return c.json({ error: "import_too_large" }, 413);
    try {
      const result = await deps.txRunner.run(principal.workspaceId, async (tx) =>
        importAccountZip({
          exec: tx,
          store,
          workspaceId: principal.workspaceId,
          userId: principal.userId,
          zipBytes: new Uint8Array(buf),
        }),
      );
      return c.json(result);
    } catch (e) {
      if (e instanceof ArchiveImportError) {
        const status = e.reason === "not_a_rhema_export" ? 422 : e.reason === "unsupported_version" ? 422 : 422;
        return c.json({ error: e.reason, message: e.message }, status);
      }
      throw e;
    }
  });

  return app;
}

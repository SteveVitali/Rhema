// The collab service composition root (P1.03; REQ-IDE-45; §12.1's collab row). One Node process
// serves both surfaces: the Hono HTTP half (`/healthz` for Cloud Run's probe + the M17
// `/documents/:id/blocks` routes) and the Hocuspocus WebSocket half (`/collab` upgrades, though the
// path is just the LB's route — the upgrade handler accepts any path). The DB connects as the
// `rhema_collab` role; every statement after session resolution runs inside `db.scoped` (RLS).
// `maxScale=1` in Pulumi is the honest MVP constraint — without Redis, two instances would split a
// document's live state, so the service runs single-process.

import http from "node:http";
import type { IncomingMessage } from "node:http";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { Hocuspocus, type Extension } from "@hocuspocus/server";
import { WebSocketServer, type WebSocket } from "ws";
import { Storage } from "@google-cloud/storage";
import pg from "pg";
import { resolveSessionPrincipal, sessionTokenFromCookieHeader } from "@rhema/db";
import {
  GcsContentStore,
  GcsRestoreBlobStore,
  type ContentStore,
  type GcsRestoreBucketLike,
} from "@rhema/mirror";
import { blockPatchRequestSchema } from "@rhema/contracts";
import { randomUlids } from "@rhema/orchestrator";
import { createCollabDb, type CollabDb } from "./sql.js";
import { createCollabExtension, type CollabExtensionDeps } from "./extension.js";
import { sweepRestorePoints, type RestoreBlobStore } from "./restore.js";
import { applyBlockPatchToDoc, blockPatchGuards, blocksForDocument } from "./blocks.js";
import type { DocRuntime } from "./doc-state.js";
import { readCollabEnv } from "./env.js";

/** The deps a test (or the live entrypoint) injects — every seam the extension + routes ride. */
export type CollabServiceDeps = CollabExtensionDeps;

/** The block routes' session resolution — same cookie/token surface the WSS auth hook resolves. */
async function routePrincipal(
  db: CollabDb,
  cookieHeader: string | undefined,
): Promise<{ userId: string; workspaceId: string } | null> {
  const token = sessionTokenFromCookieHeader(cookieHeader);
  if (!token) return null;
  return resolveSessionPrincipal(db, token);
}

export interface CollabService {
  readonly app: Hono;
  readonly hocuspocus: Hocuspocus<Record<string, unknown>>;
  /** the mounted extension — a test seam (drive onStoreDocument to observe the fork/readonly broadcasts). */
  readonly extension: Extension<Record<string, unknown>>;
  readonly runtimes: Map<string, DocRuntime>;
  /** ws.WebSocket → handleConnection — the http server's upgrade hook calls this. */
  readonly handleUpgrade: (ws: WebSocket, req: IncomingMessage) => void;
  /** the hourly restore-retention sweep (§F12) — start it once in the live entrypoint. */
  readonly sweepOnce: () => Promise<void>;
}

/** Node's IncomingMessage → the fetch Request Hocuspocus's handleConnection expects. */
function toFetchRequest(req: IncomingMessage): Request {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(", "));
  }
  return new Request(`http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`, {
    method: req.method,
    headers,
  });
}

export function createCollabService(deps: CollabServiceDeps): CollabService {
  const { extension, runtimes } = createCollabExtension(deps);
  const hocuspocus = new Hocuspocus<Record<string, unknown>>({
    name: "rhema-collab",
    quiet: true,
    extensions: [extension],
    // §5.10: autosave is debounced (2s quiet / 10s max) — every keystroke never reaches the store.
    debounce: 2_000,
    maxDebounce: 10_000,
    // A document may outlive its last connection's debounce window — never drop pending stores.
    unloadImmediately: false,
  });

  const app = new Hono();
  app.get("/healthz", (c) => c.json({ ok: true, service: "collab" }));

  // The M17 block view + patch routes (§10.2 — the mobile client is 1.x; the service lands now).
  // They live under `/collab/` so the LB's single `/collab*` path rule fronts WSS + HTTP alike.
  app.get("/collab/documents/:draftId/blocks", async (c) => {
    const principal = await routePrincipal(deps.db, c.req.header("cookie"));
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const draftId = c.req.param("draftId");
    const guard = await blockPatchGuards(deps.db, principal.workspaceId, draftId);
    if (!guard.ok && guard.error === "block_not_found") return c.json({ error: guard.error }, 404);
    if (!guard.ok) return c.json({ error: guard.error }, 409);
    const conn = await hocuspocus.openDirectConnection(`draft:${draftId}`, {
      userId: principal.userId,
      workspaceId: principal.workspaceId,
      projectId: guard.binding.projectId,
      draftId,
    });
    try {
      const blocks = blocksForDocument(conn.document!);
      return c.json({ draftId, draftN: guard.binding.draftN, blocks });
    } finally {
      await conn.disconnect();
    }
  });

  app.patch("/collab/documents/:draftId/blocks/:blockId", async (c) => {
    const principal = await routePrincipal(deps.db, c.req.header("cookie"));
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const parsed = blockPatchRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    const draftId = c.req.param("draftId");
    const blockId = c.req.param("blockId");

    const guard = await blockPatchGuards(deps.db, principal.workspaceId, draftId);
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);

    const conn = await hocuspocus.openDirectConnection(`draft:${draftId}`, {
      userId: principal.userId,
      workspaceId: principal.workspaceId,
      projectId: guard.binding.projectId,
      draftId,
    });
    try {
      // applyBlockPatchToDoc wraps its own doc.transact('human_mobile') — no extra wrapper needed.
      const outcome = await applyBlockPatchToDoc(conn.document!, {
        blockId,
        baseHash: parsed.data.baseHash,
        markdown: parsed.data.markdown,
      });
      if (!outcome.ok) return c.json({ error: outcome.error }, outcome.status);
      // Tag the patched block so the next materialization stamps `human_mobile` (§10.2).
      runtimes.get(`draft:${draftId}`)?.mobileBlocks.add(blockId);
      return c.json({ draftId, blockId: outcome.blockId, hash: outcome.hash });
    } finally {
      await conn.disconnect(); // flushes the store hooks → the patch materializes
    }
  });

  return {
    app,
    hocuspocus,
    extension,
    runtimes,
    handleUpgrade: (ws, req) => {
      // handleConnection returns the ClientConnection — the integration owns the ws event wiring
      // (the official Server wrapper does this through crossws; we use `ws` directly).
      const conn = hocuspocus.handleConnection(ws, toFetchRequest(req));
      ws.on("message", (data: Buffer) => conn.handleMessage(new Uint8Array(data)));
      ws.on("close", (code: number, reason: Buffer) =>
        conn.handleClose({ code, reason: reason.toString("utf8") } as never),
      );
      ws.on("error", (err: Error) => console.error("[collab] socket error", err));
    },
    sweepOnce: async () => {
      await sweepRestorePoints(deps.db, deps.blobs, deps.clock.now());
    },
  };
}

/** The live wiring (Cloud Run): pg.Pool as `rhema_collab`, GCS bucket for artifacts + restore blobs. */
function liveDeps(env: ReturnType<typeof readCollabEnv>): CollabServiceDeps {
  if (!env.databaseUrl) throw new Error("DATABASE_URL is required (the rhema_collab role's connection)");
  if (!env.objectsBucket) throw new Error("OBJECTS_BUCKET is required (artifact + restore objects)");
  const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 4 });
  const db = createCollabDb(pool);
  const storage = new Storage();
  const bucket = storage.bucket(env.objectsBucket);
  const blobs: RestoreBlobStore = new GcsRestoreBlobStore(
    bucket as unknown as GcsRestoreBucketLike,
  );
  const storeFor = (workspaceId: string): ContentStore =>
    new GcsContentStore(bucket, workspaceId);
  return {
    db,
    storeFor,
    blobs,
    // EDIT.1 — real ULIDs, never `${p}_${uuid}`: saveManualRevision's draft.forked event validates
    // the minted child id against idSchema (26-char Crockford ULID) and a non-ULID id throws the
    // whole storeDocument hook — the keystroke's fork silently dies server-side (the N8 prod walk
    // caught it: ZodError in the collab logs, the banner never flipped).
    ids: randomUlids(),
    clock: { now: () => new Date() },
    eventWriter: {
      // collab materializations carry no runId — saveManualRevision routes every event to the
      // project-scoped timeline sink; this appender is the contract's required-but-unused half.
      async append() {},
    },
  };
}

export function startCollabServer(): void {
  const env = readCollabEnv();
  const service = createCollabService(liveDeps(env));

  const server = serve({ fetch: service.app.fetch, port: env.port }, (info) => {
    console.log(`[collab] listening on :${info.port} (hocuspocus + blocks)`);
  });
  const wss = new WebSocketServer({ noServer: true });
  (server as http.Server).on("upgrade", (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => service.handleUpgrade(ws, req));
  });

  // The hourly restore-retention sweep (F12) — in-process at maxScale=1.
  const sweepTimer = setInterval(() => {
    service.sweepOnce().catch((err) => console.error("[collab] sweep failed", err));
  }, 60 * 60 * 1000);
  sweepTimer.unref?.();

  const shutdown = async () => {
    clearInterval(sweepTimer);
    service.hocuspocus.flushPendingStores();
    service.hocuspocus.closeConnections();
    (server as http.Server).close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  startCollabServer();
}

// P1.03 deterministic acceptance tests (REQ-IDE-34/45/46; §5.10/§10.2/§11.4). PGlite runs the REAL
// migrations; the CollabDb `scoped` adapter bypasses RLS in-process (the chain's established harness
// honesty — PGlite's superuser can't exercise FORCE policies), while `resolveDraftBinding`'s belt
// workspace check still proves the cross-tenant refusal. The WS convergence test runs the real
// HocuspocusProvider over a real socket (provider is a devDep for exactly this).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import * as Y from "yjs";
import { PGlite } from "@electric-sql/pglite";
import { HocuspocusProvider } from "@hocuspocus/provider";
import WebSocket, { WebSocketServer } from "ws";
import { serve } from "@hono/node-server";
import { applyMigrations } from "@rhema/db";
import { InMemoryContentStore, sha256Hex, type SqlExecutor } from "@rhema/mirror";
import { markdownToDoc } from "@rhema/editor";
import { updateYFragment } from "y-prosemirror";
import { blockContentHash, splitMarkdownBlocks } from "@rhema/findings-core";
import { HOLDING_STATES, lockKeys, randomUlids } from "@rhema/orchestrator";
import { idSchema } from "@rhema/contracts";
import { createCollabService, type CollabService } from "./server.js";
import { authenticateConnection, AuthRefusal, FORK_REASON_CODE, resolveDraftBinding } from "./auth.js";
import { storeDocument, markRestorePoint } from "./materialize.js";
import {
  InMemoryRestoreBlobStore,
  reconstructDocState,
  sweepRestorePoints,
  writeRestorePoint,
} from "./restore.js";
import { applyBlockPatchToDoc, blockPatchGuards } from "./blocks.js";
import { docToCanonicalMarkdown, markdownToUpdate, pageFragment } from "@rhema/editor";
import type { CollabDb } from "./sql.js";

// ---------------------------------------------------------------------------------------------------------------------
// fixture — one personal workspace, one session, one project, one working `human_revision` head with a
// promoted version + live doc. ids are fixed strings (determinism over ULID shape here — none of these
// ids cross a contract boundary in the collab path).
// ---------------------------------------------------------------------------------------------------------------------

// ids must be valid ULIDs — `draft.forked`/`revision.move_traced` payloads validate `idSchema` at the
// boundary (the same constraint the mirror tests' testDeps satisfies).
const uid = (n: number) => String(n).padStart(26, "0");

const WS = uid(1);
const WS2 = uid(2);
const USER = uid(3);
const TOKEN = "tok_collab";
const PROJ = uid(4);
const DRAFT = uid(5);
const ART = uid(6);
const AV = uid(7);
const RUN = uid(8);
const BASE_MD = "# Title\n\nThe first block.\n\nThe second block.\n";

interface Fixture {
  pg: PGlite;
  exec: SqlExecutor;
  db: CollabDb;
  store: InMemoryContentStore;
  blobs: InMemoryRestoreBlobStore;
  service: CollabService;
  liveDocId: string;
}

let seq = 1000;
const ids = (_p: string) => uid(seq++);
const clock = { now: () => new Date("2026-10-01T12:00:00.000Z") };

async function seed(exec: SqlExecutor): Promise<string> {
  await exec.query(`insert into "user"(id, email) values ($1,$2)`, [USER, "c@example.test"]);
  await exec.query(`insert into billing_accounts(id) values ($1), ($2)`, [uid(11), uid(12)]);
  await exec.query(
    `insert into workspaces(id, kind, name, billing_account_id) values ($1,'personal','W',$3),($2,'personal','W2',$4)`,
    [WS, WS2, uid(11), uid(12)],
  );
  await exec.query(`insert into workspace_members(workspace_id, user_id, role) values ($1,$2,'member')`, [WS, USER]);
  await exec.query(
    `insert into session(id, user_id, token, expires_at) values ($3,$1,$2, now() + interval '1 day')`,
    [USER, TOKEN, uid(10)],
  );
  await exec.query(
    `insert into projects(id, workspace_id, owner_id, title, slug) values ($1,$2,$3,'P','p')`,
    [PROJ, WS, USER],
  );
  const sha = sha256Hex(BASE_MD);
  await exec.query(
    `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
     values ($3,$1,$2,'draft','shared','drafts/v1.md',$4)`,
    [WS, PROJ, ART, AV],
  );
  await exec.query(
    `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, word_count, media_type, created_by)
     values ($3,$4,1,$1,'k1',$2,6,'text/markdown',$5::jsonb)`,
    [sha, Buffer.byteLength(BASE_MD), AV, ART, JSON.stringify({ kind: "user", userId: USER })],
  );
  const liveDocId = uid(9);
  await exec.query(
    `insert into drafts(id, project_id, n, origin, state, promoted_version_id, live_doc_id)
     values ($1,$2,1,'human_revision','working',$4,$3)`,
    [DRAFT, PROJ, liveDocId, AV],
  );
  await exec.query(
    `insert into live_docs(id, draft_id, y_state, state_vector) values ($1,$2,$3,$4)`,
    [liveDocId, DRAFT, Buffer.from(markdownToUpdate(BASE_MD)), Buffer.alloc(0)],
  );
  return liveDocId;
}

async function boot(): Promise<Fixture> {
  const pg = new PGlite();
  await applyMigrations({
    exec: (sql: string) => pg.exec(sql),
    query: (sql: string, params?: unknown[]) => pg.query(sql, params),
  });
  const exec: SqlExecutor = { query: (sql, params) => pg.query(sql, params as never[]) };
  const db: CollabDb = { query: exec.query, scoped: (_ws, fn) => fn(exec) };
  const store = new InMemoryContentStore();
  const blobs = new InMemoryRestoreBlobStore();
  const liveDocId = await seed(exec);
  // The fixture's artifact bytes must exist in the content store (real sha addressing).
  await store.put(WS, sha256Hex(BASE_MD), Buffer.from(BASE_MD, "utf8"));
  const service = createCollabService({
    db,
    storeFor: () => store,
    blobs,
    ids,
    clock,
    eventWriter: { async append() {} },
  });
  return { pg, exec, db, store, blobs, service, liveDocId };
}

const ctx = { userId: USER, workspaceId: WS, projectId: PROJ, draftId: DRAFT };

/** Open the doc through the real extension hooks (direct connections skip auth — auth is tested separately). */
async function openDoc(fx: Fixture, context = ctx) {
  const conn = await fx.service.hocuspocus.openDirectConnection(`draft:${DRAFT}`, context);
  return conn;
}

/** Apply a whole-doc replacement inside a `human` transaction (the test's "typing"). */
function typeAll(doc: Y.Doc, markdown: string): void {
  const pm = markdownToDoc(markdown);
  const meta = { mapping: new Map(), isOMark: new Map() };
  doc.transact(() => updateYFragment(doc, pageFragment(doc), pm, meta), "human");
}

async function storeNow(fx: Fixture, doc: Y.Doc) {
  const rt = fx.service.runtimes.get(`draft:${DRAFT}`);
  return storeDocument(
    { db: fx.db, storeFor: () => fx.store, blobs: fx.blobs, ids, clock, eventWriter: { async append() {} } },
    rt!,
    doc,
    { userId: USER },
  );
}

describe("collab service (P1.03)", () => {
  // EDIT.1 — the prod composition root minted `dft_${uuid}` ids: saveManualRevision's draft.forked
  // payload validates `idSchema` and a non-ULID child id threw the whole storeDocument hook (N8 prod
  // walk caught it in the collab logs). The fixture's ULID-shaped stub masked it; pin the prod
  // factory to the schema it must satisfy.
  it("the prod ids factory mints 26-char ULIDs the event schemas accept", () => {
    const minted = randomUlids()("dft");
    expect(idSchema.safeParse(minted).success).toBe(true);
  });

  let fx: Fixture;
  beforeEach(async () => {
    fx = await boot();
  });
  afterEach(async () => {
    fx.service.hocuspocus.closeConnections();
    await fx.pg.close();
  });

  it("loads the live doc's y_state (or seeds it from the promoted version)", async () => {
    const conn = await openDoc(fx);
    try {
      expect(docToCanonicalMarkdown(conn.document!)).toBe(BASE_MD);
      expect(fx.service.runtimes.get(`draft:${DRAFT}`)?.liveDocId).toBe(fx.liveDocId);
    } finally {
      await conn.disconnect();
    }
  });

  it("materializes the debounced store into canonical markdown + sha256", async () => {
    const conn = await openDoc(fx);
    try {
      const md = "# Title\n\nThe first block, edited.\n\nThe second block.\n";
      typeAll(conn.document!, md);
      const outcome = await storeNow(fx, conn.document!);
      expect(outcome.locked).toBe(false);
      expect(outcome.changed).toBe(true);
      expect(outcome.sha256).toBe(sha256Hex(md));
      const live = (
        await fx.exec.query("select md_sha256, materialized_at, y_state from live_docs where id = $1", [fx.liveDocId])
      ).rows[0] as { md_sha256: string; materialized_at: Date | null; y_state: Buffer };
      expect(live.md_sha256).toBe(sha256Hex(md));
      expect(live.materialized_at).not.toBeNull();
      expect(live.y_state.byteLength).toBeGreaterThan(0);
      // the artifact version row lands content-addressed, immutable-bytes semantics unchanged
      const v = (
        await fx.exec.query(
          "select content_sha256 from artifact_versions where content_sha256 = $1",
          [sha256Hex(md)],
        )
      ).rows[0] as { content_sha256: string } | undefined;
      expect(v?.content_sha256).toBe(sha256Hex(md));
    } finally {
      await conn.disconnect();
    }
  });

  it("authenticates: unauthenticated + cross-workspace refusals", async () => {
    await expect(
      authenticateConnection({ db: fx.db, ids, clock }, {
        documentName: `draft:${DRAFT}`,
        cookieHeader: null,
        token: null,
        intent: null,
      }),
    ).rejects.toBeInstanceOf(AuthRefusal);
    await expect(
      authenticateConnection({ db: fx.db, ids, clock }, {
        documentName: `draft:${DRAFT}`,
        cookieHeader: null,
        token: "tok_bogus",
        intent: null,
      }),
    ).rejects.toMatchObject({ reason: "unauthenticated" });
    // another workspace's document name resolves not-found under that tenant's scope
    const other = await fx.db.scoped(WS2, (tx) => resolveDraftBinding(tx, WS2, DRAFT));
    expect(other).toBeUndefined();
    // the session cookie path resolves (cookie wins over the in-band token)
    const c = await authenticateConnection({ db: fx.db, ids, clock }, {
      documentName: `draft:${DRAFT}`,
      cookieHeader: `__Host-rhema.session_token=${TOKEN}.sig`,
      token: null,
      intent: null,
    });
    expect(c.readOnly).toBe(false);
    expect(c.workspaceId).toBe(WS);
  });

  it("attaches read-only while a run holds the head, and the store skips materialization", async () => {
    await fx.exec.query(
      `insert into runs(id, workspace_id, project_id, workflow, state, inputs, model_profile, model_tier, rigor,
         estimate_credits, cap_credits, rate_table_version, lock_set)
       values ($5,$1,$2,'review',$3,'{}'::jsonb,'p','base','standard',0,0,1,$4)`,
      [WS, PROJ, HOLDING_STATES[1] /* running */, [lockKeys.draftWrite(DRAFT)], RUN],
    );
    const c = await authenticateConnection({ db: fx.db, ids, clock }, {
      documentName: `draft:${DRAFT}`,
      cookieHeader: null,
      token: TOKEN,
      intent: null,
    });
    expect(c.readOnly).toBe(true);

    const conn = await openDoc(fx);
    try {
      typeAll(conn.document!, "# Title\n\nTampered.\n");
      const outcome = await storeNow(fx, conn.document!);
      expect(outcome.locked).toBe(true);
      const live = (
        await fx.exec.query("select md_sha256 from live_docs where id = $1", [fx.liveDocId])
      ).rows[0] as { md_sha256: string | null };
      expect(live.md_sha256).not.toBe(sha256Hex("# Title\n\nTampered.\n"));
    } finally {
      await conn.disconnect();
    }
  });

  it("forks a frozen head at the first store and refuses the next write-intent connect", async () => {
    // freeze the head (simulating a review landing between connect and edit)
    await fx.exec.query("update drafts set state = 'frozen' where id = $1", [DRAFT]);

    const conn = await openDoc(fx); // no child yet → writable attach (the lazy fork)
    try {
      const md = BASE_MD + "\nOffline edit while frozen.\n";
      typeAll(conn.document!, md);
      const outcome = await storeNow(fx, conn.document!);
      expect(outcome.locked).toBe(false);
      expect(outcome.forked).toBe(true);
      expect(outcome.draftId).not.toBe(DRAFT);

      // v(N+1) exists as a working human_revision child; the frozen version's bytes are untouched
      const child = (
        await fx.exec.query(
          "select id, n, origin, state from drafts where base_draft_id = $1", [DRAFT],
        )
      ).rows[0] as { id: string; n: number; origin: string; state: string };
      expect(child.origin).toBe("human_revision");
      expect(child.state).toBe("working");
      expect(child.n).toBe(2);
      const frozen = (
        await fx.exec.query("select content_sha256 from artifact_versions where id = $1", [AV])
      ).rows[0] as { content_sha256: string };
      expect(frozen.content_sha256).toBe(sha256Hex(BASE_MD));
    } finally {
      await conn.disconnect();
    }

    // the NEXT write-intent connect to the frozen head refuses with the rebind payload
    await expect(
      authenticateConnection({ db: fx.db, ids, clock }, {
        documentName: `draft:${DRAFT}`,
        cookieHeader: null,
        token: TOKEN,
        intent: null,
      }),
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof AuthRefusal && JSON.parse(e.reason).code === FORK_REASON_CODE,
    );
    // …while intent=ro still attaches read-only
    const ro = await authenticateConnection({ db: fx.db, ids, clock }, {
      documentName: `draft:${DRAFT}`,
      cookieHeader: null,
      token: TOKEN,
      intent: "ro",
    });
    expect(ro.readOnly).toBe(true);
  });

  // EDIT.1 — the N8 prod walk: the store-side fork LANDED (v2 in the DB) yet the client's §5.4
  // banner never flipped. hocuspocus's closeConnections sends an in-band CLOSE but leaves the
  // socket open, so the provider never re-auths — the frozen_fork refusal it re-points on never
  // arrives. The store must therefore broadcast `rhema.fork` (the child id + n) out-of-band BEFORE
  // the close. Drive the real extension hook and capture the broadcast.
  it("onStoreDocument broadcasts rhema.fork (child id + n) before closing the frozen head's connections", async () => {
    await fx.exec.query("update drafts set state = 'frozen' where id = $1", [DRAFT]);
    const conn = await openDoc(fx);
    const broadcasts: string[] = [];
    const doc = conn.document!;
    const realBroadcast = (doc as { broadcastStateless?: (p: string) => void }).broadcastStateless?.bind(doc);
    (doc as { broadcastStateless: (p: string) => void }).broadcastStateless = (p) => {
      broadcasts.push(p);
      realBroadcast?.(p);
    };
    const closed: string[] = [];
    try {
      typeAll(doc, BASE_MD + "\nFirst write forks.\n");
      await fx.service.extension.onStoreDocument!({
        documentName: `draft:${DRAFT}`,
        document: doc,
        lastContext: ctx,
        instance: { closeConnections: (name: string) => closed.push(name) } as never,
      } as never);

      const child = (
        await fx.exec.query("select id, n from drafts where base_draft_id = $1", [DRAFT])
      ).rows[0] as { id: string; n: number };
      const forkMsg = broadcasts
        .map((b) => JSON.parse(b) as { type?: string; draftId?: string; draftN?: number })
        .find((m) => m.type === "rhema.fork");
      expect(forkMsg, "a rhema.fork stateless reaches the live connection").toMatchObject({
        type: "rhema.fork",
        draftId: child.id,
        draftN: child.n,
      });
      expect(closed).toEqual([`draft:${DRAFT}`]);
      expect(fx.service.runtimes.get(`draft:${DRAFT}`)?.draftId).toBe(child.id);
    } finally {
      await conn.disconnect();
    }
  });

  it("the Showcase attaches read-only at auth and never materializes — no fork, no y_state write (§15.4)", async () => {
    // the real showcase shape: a frozen seeded head on a showcase-flagged project
    await fx.exec.query("update projects set showcase = true where id = $1", [PROJ]);
    await fx.exec.query("update drafts set state = 'frozen' where id = $1", [DRAFT]);
    const yBefore = (
      await fx.exec.query("select y_state from live_docs where id = $1", [fx.liveDocId])
    ).rows[0] as { y_state: Buffer };

    // write intent on the worked example ⇒ a read-only attach (NOT the frozen_fork refusal —
    // a showcase draft must never reach the fork path at all)
    const c = await authenticateConnection({ db: fx.db, ids, clock }, {
      documentName: `draft:${DRAFT}`,
      cookieHeader: null,
      token: TOKEN,
      intent: null,
    });
    expect(c.readOnly).toBe(true);

    // the store belt: even if updates somehow reach materialization, nothing is written
    const conn = await openDoc(fx);
    try {
      typeAll(conn.document!, "# Title\n\nTampered showcase.\n");
      const outcome = await storeNow(fx, conn.document!);
      expect(outcome).toMatchObject({ locked: true, forked: false, changed: false });
      const children = (
        await fx.exec.query("select count(*)::int n from drafts where base_draft_id = $1", [DRAFT])
      ).rows[0] as { n: number };
      expect(children.n).toBe(0);
      const yAfter = (
        await fx.exec.query("select y_state from live_docs where id = $1", [fx.liveDocId])
      ).rows[0] as { y_state: Buffer };
      expect(Buffer.compare(yBefore.y_state, yAfter.y_state)).toBe(0);
    } finally {
      await conn.disconnect();
    }
  });

  it("a read-only attach reaches the client as the rhema.readonly stateless at connect", async () => {
    // hold the head so auth attaches read-only
    await fx.exec.query(
      `insert into runs(id, workspace_id, project_id, workflow, state, inputs, model_profile, model_tier, rigor,
         estimate_credits, cap_credits, rate_table_version, lock_set)
       values ($5,$1,$2,'review',$3,'{}'::jsonb,'p','base','standard',0,0,1,$4)`,
      [WS, PROJ, HOLDING_STATES[1] /* running */, [lockKeys.draftWrite(DRAFT)], RUN],
    );
    const nodeServer = serve({ fetch: fx.service.app.fetch, port: 0 });
    const wss = new WebSocketServer({ noServer: true });
    (nodeServer as http.Server).on("upgrade", (req, socket, head) =>
      wss.handleUpgrade(req, socket, head, (ws) => fx.service.handleUpgrade(ws, req)),
    );
    await new Promise<void>((resolve) => {
      if ((nodeServer as http.Server).listening) resolve();
      else nodeServer.once("listening", () => resolve());
    });
    const port = (nodeServer.address() as AddressInfo).port;

    const provider = new HocuspocusProvider({
      url: `ws://127.0.0.1:${port}/collab`,
      name: `draft:${DRAFT}`,
      token: TOKEN,
      WebSocketPolyfill: WebSocket,
    });
    const readonlyMsg = new Promise<string>((resolve, reject) => {
      provider.on("stateless", ({ payload }: { payload: string }) => {
        if (payload.includes("rhema.readonly")) resolve(payload);
      });
      provider.on("authenticationFailed", (e: { reason: string }) => reject(new Error(e.reason)));
      setTimeout(() => reject(new Error("rhema.readonly never arrived")), 8000);
    });
    try {
      expect(JSON.parse(await readonlyMsg) as { type: string }).toMatchObject({
        type: "rhema.readonly",
      });
    } finally {
      provider.destroy();
      wss.close();
      (nodeServer as http.Server).close();
    }
  });

  it("reconstructs a document from the daily snapshot + update deltas (byte-identical)", async () => {
    const conn = await openDoc(fx);
    try {
      const doc = conn.document!;
      const rt = fx.service.runtimes.get(`draft:${DRAFT}`)!;
      const t0 = new Date("2026-10-01T00:00:00Z");
      await writeRestorePoint(fx.exec, fx.blobs, ids, rt.liveDocId, {
        kind: "snapshot", cause: "auto", bytes: Y.encodeStateAsUpdate(doc), at: t0,
      });
      // deltas are encoded against the SNAPSHOT's state vector (the reconstruct base)
      const sv0 = Y.encodeStateVector(doc);
      const v1 = "v1\n\nIntermediate.\n";
      typeAll(doc, v1);
      await writeRestorePoint(fx.exec, fx.blobs, ids, rt.liveDocId, {
        kind: "delta", cause: "timer", bytes: Y.encodeStateAsUpdate(doc, sv0), at: new Date(t0.getTime() + 60_000),
      });
      const v2 = "v2\n\nFinal state.\n";
      typeAll(doc, v2);
      await writeRestorePoint(fx.exec, fx.blobs, ids, rt.liveDocId, {
        kind: "delta", cause: "timer",
        bytes: Y.encodeStateAsUpdate(doc), at: new Date(t0.getTime() + 120_000),
      });

      const latest = await reconstructDocState(fx.exec, fx.blobs, rt.liveDocId);
      expect(latest).not.toBeNull();
      expect(docToCanonicalMarkdown(latest!)).toBe(docToCanonicalMarkdown(doc));
      const atT1 = await reconstructDocState(fx.exec, fx.blobs, rt.liveDocId, new Date(t0.getTime() + 90_000));
      expect(docToCanonicalMarkdown(atT1!)).toBe(v1);
      latest!.destroy();
      atT1!.destroy();
    } finally {
      await conn.disconnect();
    }
  });

  it("writes a named restore point (⌘S) as a full snapshot with its label", async () => {
    const conn = await openDoc(fx);
    try {
      const rt = fx.service.runtimes.get(`draft:${DRAFT}`)!;
      const { restorePointId } = await markRestorePoint(
        { db: fx.db, storeFor: () => fx.store, blobs: fx.blobs, ids, clock, eventWriter: { async append() {} } },
        rt,
        conn.document!,
        { cause: "named", label: "before rewrite", userId: USER },
      );
      const row = (
        await fx.exec.query("select kind, cause, label from restore_points where id = $1", [restorePointId])
      ).rows[0] as { kind: string; cause: string; label: string };
      expect(row).toMatchObject({ kind: "snapshot", cause: "named", label: "before rewrite" });
      expect(fx.blobs.blobs.size).toBeGreaterThan(0);
    } finally {
      await conn.disconnect();
    }
  });

  it("sweeps expired restore points by plan tier (named + latest snapshot exempt)", async () => {
    const conn = await openDoc(fx);
    try {
      const doc = conn.document!;
      const rt = fx.service.runtimes.get(`draft:${DRAFT}`)!;
      const old = new Date("2026-08-01T00:00:00Z"); // > free tier's 7d window vs clock.now (2026-10-01)
      const full = Y.encodeStateAsUpdate(doc);
      const snapOld = await writeRestorePoint(fx.exec, fx.blobs, ids, rt.liveDocId, {
        kind: "snapshot", cause: "auto", bytes: full, at: old,
      });
      await writeRestorePoint(fx.exec, fx.blobs, ids, rt.liveDocId, {
        kind: "delta", cause: "timer", bytes: full, at: old,
      });
      const namedOld = await writeRestorePoint(fx.exec, fx.blobs, ids, rt.liveDocId, {
        kind: "snapshot", cause: "named", label: "keep me", bytes: full, at: old,
      });
      // a NEWER snapshot stays regardless (the chain's base)
      const snapNew = await writeRestorePoint(fx.exec, fx.blobs, ids, rt.liveDocId, {
        kind: "snapshot", cause: "auto", bytes: full, at: new Date("2026-09-30T00:00:00Z"),
      });
      const res = await sweepRestorePoints(fx.db, fx.blobs, clock.now());
      expect(res.pointsDeleted).toBe(2); // the old auto snapshot + the old delta
      const remaining = (
        await fx.exec.query("select id from restore_points where live_doc_id = $1 order by id", [rt.liveDocId])
      ).rows as { id: string }[];
      const idsLeft = remaining.map((r) => r.id).sort();
      expect(idsLeft).toEqual([namedOld, snapNew].sort());
      expect(idsLeft).not.toContain(snapOld);
    } finally {
      await conn.disconnect();
    }
  });

  it("applies a block patch (M17): 409 on hash mismatch + frozen-head refusal", async () => {
    const conn = await openDoc(fx);
    try {
      const doc = conn.document!;
      const blocks = splitMarkdownBlocks(BASE_MD);
      const target = blocks[1]!;

      const mismatch = await applyBlockPatchToDoc(doc, {
        blockId: target.blockId, baseHash: "deadbeef", markdown: "Replacement.",
      });
      expect(mismatch).toMatchObject({ ok: false, error: "hash_mismatch", status: 409 });

      const applied = await applyBlockPatchToDoc(doc, {
        blockId: target.blockId,
        baseHash: blockContentHash(target.text),
        markdown: "The second block, patched from mobile.",
      });
      expect(applied.ok).toBe(true);
      expect(docToCanonicalMarkdown(doc)).toContain("patched from mobile");
      expect(blockContentHash("The second block, patched from mobile.")).toBe(applied.ok ? applied.hash : "");
    } finally {
      await conn.disconnect();
    }

    // frozen head ⇒ the guard path refuses before the doc is ever touched
    await fx.exec.query("update drafts set state = 'frozen' where id = $1", [DRAFT]);
    const guard = await blockPatchGuards(fx.db, WS, DRAFT);
    expect(guard).toMatchObject({ ok: false, error: "frozen_head", status: 409 });
    const missing = await blockPatchGuards(fx.db, WS, "dft_nope");
    expect(missing).toMatchObject({ ok: false, status: 404 });
  });

  it("converges two real HocuspocusProviders over a WebSocket", async () => {
    const app = fx.service.app;
    const nodeServer = serve({ fetch: app.fetch, port: 0 });
    const wss = new WebSocketServer({ noServer: true });
    (nodeServer as http.Server).on("upgrade", (req, socket, head) =>
      wss.handleUpgrade(req, socket, head, (ws) => fx.service.handleUpgrade(ws, req)),
    );
    // port 0 binds asynchronously — address() is null until 'listening' fires
    await new Promise<void>((resolve) => {
      if ((nodeServer as http.Server).listening) resolve();
      else nodeServer.once("listening", () => resolve());
    });
    const port = (nodeServer.address() as AddressInfo).port;
    const url = `ws://127.0.0.1:${port}/collab`;

    const open = (name: string) =>
      new HocuspocusProvider({
        url,
        name,
        token: TOKEN,
        WebSocketPolyfill: WebSocket,
      });
    const waitSynced = (p: HocuspocusProvider) =>
      new Promise<void>((resolve, reject) => {
        p.on("synced", () => resolve());
        p.on("authenticationFailed", (e: { reason: string }) => reject(new Error(e.reason)));
        setTimeout(() => reject(new Error("sync timeout")), 8000);
      });

    const a = open(`draft:${DRAFT}`);
    const b = open(`draft:${DRAFT}`);
    try {
      await Promise.all([waitSynced(a), waitSynced(b)]);
      expect(docToCanonicalMarkdown(a.document)).toBe(BASE_MD);
      expect(docToCanonicalMarkdown(b.document)).toBe(BASE_MD);

      // A types; B converges to the same canonical markdown (the CRDT merge, not a last-write clobber)
      const mdA = BASE_MD + "\nTyped by A.\n";
      typeAll(a.document, mdA);
      await new Promise((r) => setTimeout(r, 800));
      expect(docToCanonicalMarkdown(b.document)).toBe(mdA);
    } finally {
      a.destroy();
      b.destroy();
      (nodeServer as http.Server).close();
    }
  }, 15_000);

  it("resumes a reconnected provider from the persisted y_state (kill/reconnect)", async () => {
    // persist a post-edit state directly (the y-indexeddb half is client-runtime; this proves the
    // server-side resume leg of the kill/reconnect AC).
    const conn = await openDoc(fx);
    await conn.disconnect();
    const md = BASE_MD + "\nSurvived the kill.\n";
    const doc2 = new Y.Doc();
    Y.applyUpdate(doc2, markdownToUpdate(md));
    await fx.exec.query("update live_docs set y_state = $2 where id = $1", [
      fx.liveDocId,
      Buffer.from(Y.encodeStateAsUpdate(doc2)),
    ]);
    doc2.destroy();
    const conn2 = await openDoc(fx);
    try {
      expect(docToCanonicalMarkdown(conn2.document!)).toBe(md);
    } finally {
      await conn2.disconnect();
    }
  });
});

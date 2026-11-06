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
import { docToCanonicalMarkdown, markdownToUpdate, pageFragment, replaceDocContent } from "@rhema/editor";
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

  // EDIT.1 — the N8 frozen-dup leg: duplicating the Showcase lands a `duplicate`/`working` head
  // (draft state copies verbatim). It is a HUMAN-authored open head — the old
  // `origin === 'human_revision'` gate attached it read-only and the pill never reached synced.
  it("a working 'duplicate' head (a project copy) attaches writable and materializes in place", async () => {
    await fx.exec.query("update drafts set origin = 'duplicate' where id = $1", [DRAFT]);
    const c = await authenticateConnection({ db: fx.db, ids, clock }, {
      documentName: `draft:${DRAFT}`,
      cookieHeader: null,
      token: TOKEN,
      intent: null,
    });
    expect(c.readOnly).toBe(false);

    const conn = await openDoc(fx);
    try {
      const md = BASE_MD + "\nTyped on the copy.\n";
      typeAll(conn.document!, md);
      const outcome = await storeNow(fx, conn.document!);
      expect(outcome).toMatchObject({ locked: false, forked: false, changed: true, draftId: DRAFT, draftN: 1 });
      const live = (
        await fx.exec.query("select md_sha256 from live_docs where id = $1", [fx.liveDocId])
      ).rows[0] as { md_sha256: string };
      expect(live.md_sha256).toBe(sha256Hex(md));
    } finally {
      await conn.disconnect();
    }
  });

  it("a frozen base while a 'duplicate' working head stands refuses write intent with frozen_fork", async () => {
    // the showcase copy's rail: v1 frozen + v2 `duplicate` working — typing on v1's doc rebinds to
    // v2 (a fork would mint a second working draft; `one_working_head_per_project` forbids it).
    const DUP2 = uid(30);
    await fx.exec.query("update drafts set state = 'frozen', origin = 'duplicate' where id = $1", [DRAFT]);
    await fx.exec.query(
      `insert into drafts(id, project_id, n, origin, state, promoted_version_id, base_draft_id)
       values ($1,$2,2,'duplicate','working',$3,$4)`,
      [DUP2, PROJ, AV, DRAFT],
    );
    await expect(
      authenticateConnection({ db: fx.db, ids, clock }, {
        documentName: `draft:${DRAFT}`,
        cookieHeader: null,
        token: TOKEN,
        intent: null,
      }),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof AuthRefusal &&
        (JSON.parse(e.reason) as { code: string; draftId: string }).code === FORK_REASON_CODE &&
        (JSON.parse(e.reason) as { draftId: string }).draftId === DUP2,
    );
    // the working dup head itself attaches writable — the rebind lands on the editable surface.
    const c = await authenticateConnection({ db: fx.db, ids, clock }, {
      documentName: `draft:${DUP2}`,
      cookieHeader: null,
      token: TOKEN,
      intent: null,
    });
    expect(c.readOnly).toBe(false);
  });

  it("a working agent-origin head (in-flight work) still attaches read-only", async () => {
    await fx.exec.query("update drafts set origin = 'drafted_from_outline' where id = $1", [DRAFT]);
    const c = await authenticateConnection({ db: fx.db, ids, clock }, {
      documentName: `draft:${DRAFT}`,
      cookieHeader: null,
      token: TOKEN,
      intent: null,
    });
    expect(c.readOnly).toBe(true);
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

  // EDIT.1 — the full N8 loop at the protocol level: a real provider types on a frozen head, the
  // debounced store forks, `rhema.fork` reaches the open connection (the CLOSE message alone never
  // re-auths — the prod walk proved it), and a rebind provider to the child syncs the same Y.Doc.
  it("the frozen→v(N+1) loop lands end-to-end: rhema.fork stateless → rebind provider syncs", async () => {
    await fx.exec.query("update drafts set state = 'frozen' where id = $1", [DRAFT]);
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
    const url = `ws://127.0.0.1:${port}/collab`;

    const doc = new Y.Doc();
    const parent = new HocuspocusProvider({
      url,
      name: `draft:${DRAFT}`,
      token: TOKEN,
      WebSocketPolyfill: WebSocket,
      document: doc,
    });
    const forkMsg = new Promise<{ draftId: string; draftN: number }>((resolve, reject) => {
      parent.on("stateless", ({ payload }: { payload: string }) => {
        try {
          const m = JSON.parse(payload) as { type?: string; draftId?: string; draftN?: number };
          if (m.type === "rhema.fork" && m.draftId) resolve({ draftId: m.draftId, draftN: m.draftN ?? 0 });
        } catch { /* foreign stateless */ }
      });
      parent.on("authenticationFailed", (e: { reason: string }) => reject(new Error(e.reason)));
      setTimeout(() => reject(new Error("rhema.fork never arrived")), 12_000);
    });
    const child = new Promise<HocuspocusProvider>((resolve) => {
      void forkMsg.then(({ draftId }) => {
        parent.destroy();
        resolve(
          new HocuspocusProvider({
            url,
            name: `draft:${draftId}`,
            token: TOKEN,
            WebSocketPolyfill: WebSocket,
            document: doc,
          }),
        );
      });
    });
    let childProvider: HocuspocusProvider | null = null;
    try {
      // wait for the initial attach, then the keystroke IS the fork trigger (2 s debounced store)
      await new Promise<void>((resolve, reject) => {
        parent.on("synced", () => resolve());
        setTimeout(() => reject(new Error("initial sync timeout")), 8000);
      });
      doc.getXmlFragment("prosemirror");
      typeAll(doc, BASE_MD + "\nFirst write forks.\n");

      const { draftId, draftN } = await forkMsg;
      expect(draftId).not.toBe(DRAFT);
      expect(draftN).toBe(2);

      childProvider = await child;
      await new Promise<void>((resolve, reject) => {
        childProvider!.on("synced", () => resolve());
        childProvider!.on("authenticationFailed", (e: { reason: string }) =>
          reject(new Error(e.reason)),
        );
        setTimeout(() => reject(new Error("rebound provider never synced")), 8000);
      });
      expect(docToCanonicalMarkdown(childProvider.document)).toContain("First write forks.");
    } finally {
      parent.destroy();
      childProvider?.destroy();
      doc.destroy();
      (nodeServer as http.Server).close();
    }
  }, 30_000);

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

  // R6FIX.2 (F-R6H11-1) — the R6H11 prod regression: the api's restore route rewrites the STORED
  // y_state out-of-band, but a loaded runtime's in-memory doc stayed stale and its next
  // onStoreDocument flush rewrote the stale bytes over the restored state (resurrection). The fix is
  // the `y_epoch` marker on live_docs: out-of-band replaces bump it; every persistence seam
  // (store / restore-point mark / SS1 reply) reconciles the loaded doc against storage FIRST.
  it("an out-of-band restore converges the loaded doc — store flushes restored bytes, a stale replica merges tombstoned (F-R6H11-1)", async () => {
    const conn = await openDoc(fx);
    try {
      // the client typed a marker paragraph and it persisted — this IS the pre-restore state the
      // loaded runtime will hold when the restore lands out-of-band.
      const edited = BASE_MD + "\nMARKER-XYZ paragraph.\n";
      typeAll(conn.document!, edited);
      await storeNow(fx, conn.document!);
      expect(
        (await fx.exec.query(`select y_epoch from live_docs where id = $1`, [fx.liveDocId]))
          .rows[0]!.y_epoch,
      ).toBe(0);

      // A stale replica — the doc a client that synced pre-restore would still hold offline.
      const staleReplica = new Y.Doc();
      Y.applyUpdate(staleReplica, Y.encodeStateAsUpdate(conn.document!));

      // THE OUT-OF-BAND RESTORE — the api route's contract: a CONVERGENT replace over the stored
      // state (old items tombstone so stale replicas can't resurrect them) + the epoch bump that
      // tells every loaded runtime its in-memory doc is behind.
      const stored = (
        await fx.exec.query(`select y_state from live_docs where id = $1`, [fx.liveDocId])
      ).rows[0]!.y_state as Uint8Array;
      const tmp = new Y.Doc();
      Y.applyUpdate(tmp, new Uint8Array(stored));
      replaceDocContent(tmp, BASE_MD); // restored content = BASE_MD (the marker is removed)
      await fx.exec.query(
        `update live_docs set y_state = $2, state_vector = $3, y_epoch = y_epoch + 1
         where id = $1`,
        [
          fx.liveDocId,
          Buffer.from(Y.encodeStateAsUpdate(tmp)),
          Buffer.from(Y.encodeStateVector(tmp)),
        ],
      );
      tmp.destroy();

      // the in-memory doc is still stale — the pre-fix bug would flush THESE bytes next.
      expect(docToCanonicalMarkdown(conn.document!)).toContain("MARKER-XYZ");

      // the next store converges FIRST — persisted state stays restored, the loaded doc heals.
      const outcome = await storeNow(fx, conn.document!);
      expect(outcome.forked).toBe(false);
      expect(docToCanonicalMarkdown(conn.document!)).toBe(BASE_MD);
      const live = (
        await fx.exec.query(`select y_state, y_epoch from live_docs where id = $1`, [fx.liveDocId])
      ).rows[0]! as { y_state: Uint8Array; y_epoch: number };
      expect(live.y_epoch).toBe(1);
      const persisted = new Y.Doc();
      Y.applyUpdate(persisted, new Uint8Array(live.y_state));
      expect(docToCanonicalMarkdown(persisted)).toBe(BASE_MD);
      persisted.destroy();

      // a reconnecting client whose doc predates the restore merges the stored update — the
      // removed items tombstone; nothing resurrects (this is why the restore writes a convergent
      // update instead of a fresh doc's bytes).
      const serverDoc = new Y.Doc();
      Y.applyUpdate(serverDoc, new Uint8Array(live.y_state));
      const missing = Y.encodeStateAsUpdate(serverDoc, Y.encodeStateVector(staleReplica));
      serverDoc.destroy();
      Y.applyUpdate(staleReplica, missing);
      expect(docToCanonicalMarkdown(staleReplica)).toBe(BASE_MD);
      staleReplica.destroy();

      // THE NO-SHARED-HISTORY EDGE: even a stored update built from a FRESH doc (the pre-fix
      // writer's shape — no tombstones for the doc's items) converges on canonical markdown:
      // the merge check detects the divergence and the fragment-diff replace tombstones the
      // stale items anyway.
      typeAll(conn.document!, edited);
      await storeNow(fx, conn.document!); // epoch stays 1 — the doc carries the marker again
      await fx.exec.query(
        `update live_docs set y_state = $2, state_vector = $3, y_epoch = y_epoch + 1
         where id = $1`,
        [fx.liveDocId, Buffer.from(markdownToUpdate(BASE_MD)), Buffer.alloc(0)],
      );
      await storeNow(fx, conn.document!);
      expect(docToCanonicalMarkdown(conn.document!)).toBe(BASE_MD);
      const live2 = (
        await fx.exec.query(`select y_state from live_docs where id = $1`, [fx.liveDocId])
      ).rows[0]!.y_state as Uint8Array;
      const persisted2 = new Y.Doc();
      Y.applyUpdate(persisted2, new Uint8Array(live2));
      expect(docToCanonicalMarkdown(persisted2)).toBe(BASE_MD);
      persisted2.destroy();
    } finally {
      await conn.disconnect();
    }
  });

  it("beforeSync converges the loaded doc on the SS1 reply (type 0) and leaves SS2 alone (type 2)", async () => {
    const conn = await openDoc(fx);
    try {
      typeAll(conn.document!, BASE_MD + "\nMARKER-XYZ paragraph.\n");
      await storeNow(fx, conn.document!);

      // a second out-of-band restore bumps the epoch while the runtime stays loaded.
      const stored = (
        await fx.exec.query(`select y_state from live_docs where id = $1`, [fx.liveDocId])
      ).rows[0]!.y_state as Uint8Array;
      const tmp = new Y.Doc();
      Y.applyUpdate(tmp, new Uint8Array(stored));
      replaceDocContent(tmp, BASE_MD);
      await fx.exec.query(
        `update live_docs set y_state = $2, state_vector = $3, y_epoch = y_epoch + 1
         where id = $1`,
        [
          fx.liveDocId,
          Buffer.from(Y.encodeStateAsUpdate(tmp)),
          Buffer.from(Y.encodeStateVector(tmp)),
        ],
      );
      tmp.destroy();
      expect(docToCanonicalMarkdown(conn.document!)).toContain("MARKER-XYZ");

      // SS2 (an incremental update broadcast) is NOT a convergence point — the throttle contract.
      await fx.service.extension.beforeSync!({
        documentName: `draft:${DRAFT}`,
        document: conn.document!,
        type: 2,
      } as never);
      expect(docToCanonicalMarkdown(conn.document!)).toContain("MARKER-XYZ");

      // SS1 (the reply that seeds a reconnecting client) MUST converge first — otherwise the
      // reply is computed from stale in-memory items and the resurrected text ships on the wire.
      await fx.service.extension.beforeSync!({
        documentName: `draft:${DRAFT}`,
        document: conn.document!,
        type: 0,
      } as never);
      expect(docToCanonicalMarkdown(conn.document!)).toBe(BASE_MD);
    } finally {
      await conn.disconnect();
    }
  });

  it("a real provider holding pre-restore state reconnects and converges to the restored content", async () => {
    const conn = await openDoc(fx);
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
    const url = `ws://127.0.0.1:${port}/collab`;

    let provider: HocuspocusProvider | null = null;
    try {
      // the loaded doc takes a client edit that the restore then removes.
      typeAll(conn.document!, BASE_MD + "\nMARKER-XYZ paragraph.\n");
      await storeNow(fx, conn.document!);

      // the out-of-band restore — convergent write + epoch bump while the doc stays LOADED.
      const stored = (
        await fx.exec.query(`select y_state from live_docs where id = $1`, [fx.liveDocId])
      ).rows[0]!.y_state as Uint8Array;
      const tmp = new Y.Doc();
      Y.applyUpdate(tmp, new Uint8Array(stored));
      replaceDocContent(tmp, BASE_MD);
      await fx.exec.query(
        `update live_docs set y_state = $2, state_vector = $3, y_epoch = y_epoch + 1
         where id = $1`,
        [
          fx.liveDocId,
          Buffer.from(Y.encodeStateAsUpdate(tmp)),
          Buffer.from(Y.encodeStateVector(tmp)),
        ],
      );
      tmp.destroy();

      // a client that had synced the pre-restore doc reconnects — its SS1 triggers the converge
      // BEFORE the reply, so the diff it receives tombstones the removed paragraph. The replica
      // holds the SERVER's items (synced state, not an independently-generated doc — divergent
      // items would be legitimate concurrent inserts, not resurrectable deletions).
      const staleDoc = new Y.Doc();
      Y.applyUpdate(staleDoc, Y.encodeStateAsUpdate(conn.document!));
      provider = new HocuspocusProvider({
        url,
        name: `draft:${DRAFT}`,
        token: TOKEN,
        WebSocketPolyfill: WebSocket,
        document: staleDoc,
      });
      await new Promise<void>((resolve, reject) => {
        provider!.on("synced", () => resolve());
        provider!.on("authenticationFailed", (e: { reason: string }) =>
          reject(new Error(e.reason)),
        );
        setTimeout(() => reject(new Error("reconnect never synced")), 8000);
      });
      // the wire state — not a db read — is the restored content.
      expect(docToCanonicalMarkdown(provider.document)).toBe(BASE_MD);
      staleDoc.destroy();
    } finally {
      provider?.destroy();
      await conn.disconnect();
      (nodeServer as http.Server).close();
    }
  }, 15_000);

  // SLO.1 — the §13.5 autosave signal's collab leg: the Page saves through `onStoreDocument`, so a real
  // (unlocked) store lands one `autosave_save_ms` sample labelled `detail='collab'` — the grant the
  // api's HTTP save path already held is added for `rhema_collab` in migration 0054. A locked refusal
  // is not a save and never samples.
  it("SLO.1 — onStoreDocument lands an autosave_save_ms 'collab' sample; a locked store never samples", async () => {
    const conn = await openDoc(fx);
    try {
      typeAll(conn.document!, BASE_MD + "\nA sampled save.\n");
      await fx.service.extension.onStoreDocument!({
        documentName: `draft:${DRAFT}`,
        document: conn.document!,
        lastContext: ctx,
        instance: { closeConnections: () => {} } as never,
      } as never);
      // the sample write is fire-and-forget — yield the loop so the scoped insert lands.
      await new Promise((r) => setTimeout(r, 20));
      const rows = (
        await fx.exec.query(
          `select value_ms, workspace_id, detail from slo_samples where signal = 'autosave_save_ms'`,
          [],
        )
      ).rows as { value_ms: number; workspace_id: string; detail: string }[];
      expect(rows.length).toBe(1);
      expect(rows[0]).toMatchObject({ workspace_id: WS, detail: "collab" });
      expect(rows[0].value_ms).toBeGreaterThanOrEqual(0);
    } finally {
      // disconnect ALSO triggers a store pass (hocuspocus flushes on unload) — a legitimate sample
      // either way; the locked leg below measures a DELTA so that count is irrelevant.
      await conn.disconnect();
    }

    // a run holding the head → the store refuses (locked) → NO sample row lands for that pass
    await fx.exec.query(
      `insert into runs(id, workspace_id, project_id, workflow, state, inputs, model_profile, model_tier, rigor,
         estimate_credits, cap_credits, rate_table_version, lock_set)
       values ($5,$1,$2,'review',$3,'{}'::jsonb,'p','base','standard',0,0,1,$4)`,
      [WS, PROJ, HOLDING_STATES[1] /* running */, [lockKeys.draftWrite(DRAFT)], RUN],
    );
    const conn2 = await openDoc(fx);
    try {
      const before = (
        await fx.exec.query(`select count(*)::int n from slo_samples where signal = 'autosave_save_ms'`, [])
      ).rows[0] as { n: number };
      typeAll(conn2.document!, BASE_MD + "\nLocked save.\n");
      await fx.service.extension.onStoreDocument!({
        documentName: `draft:${DRAFT}`,
        document: conn2.document!,
        lastContext: ctx,
        instance: { closeConnections: () => {} } as never,
      } as never);
      await new Promise((r) => setTimeout(r, 20));
      const after = (
        await fx.exec.query(`select count(*)::int n from slo_samples where signal = 'autosave_save_ms'`, [])
      ).rows[0] as { n: number };
      expect(after.n).toBe(before.n); // the locked pass wrote no sample
    } finally {
      await conn2.disconnect();
    }
  });

  // R7WRITE.1b (REQ-WRITE-7) — a discarded head refuses EVERY attach with the frozen_fork payload
  // back to the resolved head: a second open session rekeys to the parent and no write lands on
  // the discarded row (the mirror's not_editable refusal is the write-side proof).
  it("write intent on a discarded draft refuses with frozen_fork → the resolved head (the parent)", async () => {
    // v2 was forked then discarded: the resolved head is the seeded working v1 (its base).
    const D2 = uid(30);
    await fx.exec.query(
      `insert into drafts(id, project_id, n, origin, state, promoted_version_id, base_draft_id,
         discarded_at, discarded_by, frozen_at, frozen_by)
       values ($1,$2,2,'human_revision','frozen',$3,$4,now(),'{"kind":"user","userId":"u"}',now(),
         '{"cause":"discard"}')`,
      [D2, PROJ, AV, DRAFT],
    );
    await expect(
      authenticateConnection({ db: fx.db, ids, clock }, {
        documentName: `draft:${D2}`,
        cookieHeader: null,
        token: TOKEN,
        intent: null,
      }),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof AuthRefusal &&
        (JSON.parse(e.reason) as { code: string; draftId: string; draftN: number }).code ===
          FORK_REASON_CODE &&
        (JSON.parse(e.reason) as { draftId: string }).draftId === DRAFT &&
        (JSON.parse(e.reason) as { draftN: number }).draftN === 1,
    );
    // a second open session on the discarded head thus rekeys to the parent — no write lands.
    // (The mirror's not_editable refusal is the write-side proof; this is the attach-side.)
    await expect(
      authenticateConnection({ db: fx.db, ids, clock }, {
        documentName: `draft:${D2}`,
        cookieHeader: null,
        token: TOKEN,
        intent: "ro",
      }),
    ).rejects.toBeInstanceOf(AuthRefusal);
  });
});

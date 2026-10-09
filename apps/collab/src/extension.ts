// The Rhema Hocuspocus extension (P1.03; §5.10/§11.4; REQ-IDE-45/46). One `draft:<id>` document per
// working head, four hooks + stateless side-channels:
//
//   onAuthenticate  — session → tenant → binding (frozen forks refuse with the rebind payload;
//                     run-locked/non-editable heads attach read-only via connectionConfig)
//   connected       — EDIT.1: the read-only verdict rides to the client as `rhema.readonly`
//                     stateless (connectionConfig is server-side only — without this the pill
//                     says "synced" while the framework silently refuses its updates)
//   onLoadDocument  — live_docs.y_state, or the promoted version's markdown seeded as the initial
//                     Yjs state (the doc's canonical floor — never an empty page for a saved draft)
//   onChange        — append the update to the pending restore delta + mark the doc dirty
//   onStoreDocument — the debounced materialization (y_state + saveManualRevision + restore cadence)
//   onStateless     — 'rhema.provenance' (stash the Page's live capture for the next store) and
//                     'rhema.restore' (⌘S 'named' / pagehide 'blur' trigger points)
//
// The runtime row per loaded document lives in `runtimes` (documentName → DocRuntime); the
// MaterializeDeps carry the tenant-scoped db + content-store seams.

import type { Extension } from "@hocuspocus/server";
import { authenticateConnection, resolveDraftBinding, AuthRefusal } from "./auth.js";
import { createDocRuntime, type DocRuntime, type ProvenanceStash } from "./doc-state.js";
import { markdownToUpdate } from "@rhema/editor";
import { markRestorePoint, storeDocument, type MaterializeDeps } from "./materialize.js";
import type { CollabDb } from "./sql.js";

export interface CollabExtensionDeps extends MaterializeDeps {
  readonly db: CollabDb;
  /** injectable session resolver (tests); defaults inside authenticateConnection. */
  readonly resolvePrincipal?: (token: string) => Promise<{
    userId: string;
    workspaceId: string;
    billingAccountId: string;
  } | null>;
}

/** The stateless messages the Page's transport emits (kept in sync with apps/web's transport). */
interface StatelessMessage {
  readonly type?: string;
  readonly spans?: ProvenanceStash["spans"];
  readonly agentSpans?: ProvenanceStash["agentSpans"];
  readonly cause?: string;
  readonly label?: string;
}

/** Load the document's persisted state: the live doc's y_state, else the promoted version seeded as
 *  the initial Yjs update (the canonical-markdown floor). Creates the live_docs row when absent so
 *  the runtime + store always have a live_doc to write. */
async function loadPersistedState(
  deps: CollabExtensionDeps,
  workspaceId: string,
  draftId: string,
): Promise<{ update: Uint8Array; liveDocId: string; lastPointAt: number | null; lastSnapshotAt: number | null }> {
  return deps.db.scoped(workspaceId, async (tx) => {
    const binding = await resolveDraftBinding(tx, workspaceId, draftId);
    if (!binding) throw new AuthRefusal("not_found");

    let liveDocId = binding.liveDocId;
    if (liveDocId) {
      const live = (
        await tx.query("select y_state from live_docs where id = $1", [liveDocId])
      ).rows[0] as { y_state: Uint8Array } | undefined;
      if (live && live.y_state && live.y_state.byteLength > 0) {
        const points = await pointMarkers(tx, liveDocId);
        return { update: live.y_state, liveDocId, ...points };
      }
    }

    // No live doc (or an empty one — the pre-collab HTTP saves never wrote y_state): seed the Yjs
    // state from the promoted version's canonical markdown.
    const version = (
      await tx.query(
        `select av.content_sha256 from drafts d
           join artifact_versions av on av.id = d.promoted_version_id
          where d.id = $1`,
        [draftId],
      )
    ).rows[0] as { content_sha256: string } | undefined;
    let markdown = "";
    if (version) {
      const bytes = await deps.storeFor(workspaceId).get(version.content_sha256);
      if (bytes) markdown = Buffer.from(bytes).toString("utf8");
    }
    const update = markdownToUpdate(markdown);

    if (!liveDocId) {
      liveDocId = deps.ids("doc");
      await tx.query(
        `insert into live_docs(id, draft_id, y_state, state_vector) values ($1,$2,'\\x'::bytea,'\\x'::bytea)`,
        [liveDocId, draftId],
      );
      await tx.query("update drafts set live_doc_id = $2 where id = $1", [draftId, liveDocId]);
    }
    const points = await pointMarkers(tx, liveDocId);
    return { update, liveDocId, ...points };
  });
}

/** The cadence markers the runtime resumes with (restore_points is the durable record). */
async function pointMarkers(
  tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  liveDocId: string,
): Promise<{ lastPointAt: number | null; lastSnapshotAt: number | null }> {
  const last = (
    await tx.query(
      `select max(created_at) as at from restore_points where live_doc_id = $1`,
      [liveDocId],
    )
  ).rows[0] as { at: Date | null } | undefined;
  const snap = (
    await tx.query(
      `select max(created_at) as at from restore_points where live_doc_id = $1 and kind = 'snapshot'`,
      [liveDocId],
    )
  ).rows[0] as { at: Date | null } | undefined;
  return {
    lastPointAt: last?.at ? new Date(last.at).getTime() : null,
    lastSnapshotAt: snap?.at ? new Date(snap.at).getTime() : null,
  };
}

export interface CollabExtension {
  /** the Hocuspocus extension — mount in the Server's `extensions`. */
  readonly extension: Extension<Record<string, unknown>>;
  /** documentName → runtime (the test seam + the store's state). */
  readonly runtimes: Map<string, DocRuntime>;
}

/**
 * Build the extension. `deps` are the seams (db, content store, blob store, ids, clock); every db
 * statement runs through `db.scoped(workspaceId)` — the auth hook is the only unscoped read.
 */
export function createCollabExtension(deps: CollabExtensionDeps): CollabExtension {
  const runtimes = new Map<string, DocRuntime>();

  const extension: Extension<Record<string, unknown>> = {
    extensionName: "rhema",

    async onAuthenticate({ documentName, requestHeaders, requestParameters, token, connectionConfig }) {
      const ctx = await authenticateConnection(deps, {
        documentName,
        cookieHeader: requestHeaders.get("cookie"),
        token: token || null,
        intent: requestParameters.get("intent"),
      });
      connectionConfig.readOnly = ctx.readOnly;
      // The context every later hook sees; the doc's runtime adopts this user as its author.
      return { ...ctx };
    },

    async connected({ context, connection }) {
      // EDIT.1 — a read-only attach (run lock, Showcase draft, non-editable working head) tells
      // the client immediately: the pill flips to read-only instead of claiming "synced" while
      // the framework silently drops its updates until the 10 s doc poll catches up.
      if ((context as { readOnly?: boolean }).readOnly === true) {
        connection.sendStateless(JSON.stringify({ type: "rhema.readonly" }));
      }
    },

    async onLoadDocument({ documentName, context }) {
      const ctx = context as unknown as { workspaceId: string; draftId: string; userId: string };
      const persisted = await loadPersistedState(deps, ctx.workspaceId, ctx.draftId);
      runtimes.set(
        documentName,
        createDocRuntime({
          workspaceId: ctx.workspaceId,
          projectId: (context as unknown as { projectId: string }).projectId,
          draftId: ctx.draftId,
          liveDocId: persisted.liveDocId,
          lastPointAt: persisted.lastPointAt,
          lastSnapshotAt: persisted.lastSnapshotAt,
          userId: ctx.userId,
        }),
      );
      // Returning an update applies it to the fresh Document (the provider then merges over it).
      return persisted.update;
    },

    async onChange({ documentName, update, context }) {
      const rt = runtimes.get(documentName);
      if (!rt) return;
      rt.pendingDelta.push(update);
      const userId = (context as unknown as { userId?: string }).userId;
      if (userId && !rt.userId) rt.userId = userId;
    },

    async onStoreDocument({ documentName, document, lastContext, instance }) {
      const rt = runtimes.get(documentName);
      if (!rt) return;
      const userId = rt.userId || (lastContext as unknown as { userId?: string }).userId || "unknown";
      // SLO.1 — the §13.5 autosave round-trip's server half on the REAL save path: the Page persists
      // through this hook, so `storeDocument`'s duration is the signal `autosave_save_ms` was missing
      // (the pre-SLO.1 writer only sampled the legacy HTTP save route). `detail='collab'` labels the
      // path; a locked/skipped store is a refusal, not a save, and never samples. Telemetry is
      // swallowed — a pre-0054 grant or a dropped row never fails the store itself.
      const storeStartedAt = deps.clock.now().getTime();
      const outcome = await storeDocument(deps, rt, document, { userId });
      const saveMs = deps.clock.now().getTime() - storeStartedAt;
      if (!outcome.locked) {
        // awaited-but-caught: a ~ms indexed insert orders before the next hook's scoped tx (the
        // PGlite single-wire tests serialize on it) and a telemetry failure still never fails a store.
        await deps.db
          .scoped(rt.workspaceId, (tx) =>
            tx.query(
              `insert into slo_samples (signal, value_ms, workspace_id, detail)
                 values ('autosave_save_ms', $1, $2, 'collab')`,
              [saveMs, rt.workspaceId],
            ),
          )
          .catch(() => undefined);
      }
      const headMoved = outcome.draftId !== rt.draftId;
      if (headMoved) rt.draftId = outcome.draftId;
      if (outcome.locked || headMoved) {
        // EDIT.1 — the clients must be TOLD, not just dropped: hocuspocus's closeConnections sends
        // an in-band CLOSE message but leaves the WebSocket OPEN, so the provider marks itself
        // unauthenticated yet never re-connects — no re-auth means no frozen_fork refusal and the
        // frozen→v(N+1) banner never flipped on the live N8 walk (the fork had already landed in
        // the DB). A stateless carry the head move/lock truthfully BEFORE the close: `rhema.fork`
        // hands the client its child (id + n — the same payload the auth refusal carries), and a
        // locked/skipped store reads as the read-only signal. The close still runs for clients that
        // predate the stateless vocabulary.
        if (headMoved && outcome.draftN != null) {
          document.broadcastStateless(
            JSON.stringify({ type: "rhema.fork", draftId: outcome.draftId, draftN: outcome.draftN }),
          );
        } else if (outcome.locked) {
          document.broadcastStateless(JSON.stringify({ type: "rhema.readonly" }));
        }
        instance.closeConnections(documentName);
      }
    },

    async afterUnloadDocument({ documentName }) {
      // The runtime's pending deltas/markers are durable (y_state + restore_points) — drop the
      // in-memory row so a later load re-derives from the persisted state.
      runtimes.delete(documentName);
    },

    async onStateless({ documentName, document, payload }) {
      const rt = runtimes.get(documentName);
      if (!rt) return;
      let msg: StatelessMessage;
      try {
        msg = JSON.parse(payload) as StatelessMessage;
      } catch {
        return;
      }
      if (msg.type === "rhema.provenance") {
        rt.provenance = { spans: msg.spans ?? [], ...(msg.agentSpans ? { agentSpans: msg.agentSpans } : {}) };
        return;
      }
      if (msg.type === "rhema.restore" && (msg.cause === "named" || msg.cause === "blur")) {
        const { restorePointId } = await markRestorePoint(deps, rt, document, {
          cause: msg.cause,
          label: msg.label ?? null,
          userId: rt.userId,
        });
        // The named-point ack the client awaits for its pill flash (⌘S feedback without a Save button).
        document.broadcastStateless(
          JSON.stringify({ type: "rhema.restore_point", restorePointId, cause: msg.cause }),
        );
      }
    },
  };

  return { extension, runtimes };
}

// The debounced persistence pipeline (P1.03; §5.10/§11.4) — the store half of the collab extension.
// Every store writes `live_docs.y_state` + `state_vector` first (the CRDT is the source of truth for
// the working head), then — unless a run holds the §6.3 lock — materializes the Y.Doc through the
// SAME `saveManualRevision` the HTTP save path used: canonical markdown → content-addressed artifact
// version → `md_sha256` + `materialized_at` → projected findings + provenance + the move trace. A
// frozen head still forks v(N+1) `human_revision` inside that call (the offline-edit path), and the
// frozen version's bytes are never touched (artifact immutability is unchanged).
//
// While a run holds the head the store persists the CRDT state + a `pre_run` checkpoint but skips
// materialization — a locked doc's mutations are refused at the connection layer (read-only auth),
// and anything already applied never reaches the canonical head until the lock clears.

import * as Y from "yjs";
import type { ContentStore, DeliveryEventAppender, SqlExecutor } from "@rhema/mirror";
import { saveManualRevision } from "@rhema/mirror";
import { docToCanonicalMarkdown } from "@rhema/editor";
import { draftLock } from "./auth.js";
import type { CollabDb } from "./sql.js";
import type { DocRuntime, ProvenanceStash } from "./doc-state.js";
import {
  RESTORE_ACTIVITY_MS,
  RESTORE_SNAPSHOT_MS,
  writeRestorePoint,
  type RestoreBlobStore,
  type RestoreCause,
} from "./restore.js";

export interface MaterializeDeps {
  readonly db: CollabDb;
  /** the workspace-bound content store (artifact bytes; GcsContentStore(bucket, ws) live). */
  readonly storeFor: (workspaceId: string) => ContentStore;
  readonly blobs: RestoreBlobStore;
  readonly ids: (prefix: string) => string;
  readonly clock: { now(): Date };
  /** required by saveManualRevision; never invoked here (collab saves carry no runId). */
  readonly eventWriter: DeliveryEventAppender;
}

export interface StoreOutcome {
  readonly stored: true;
  /** true ⇒ a run lock was observed — state persisted, materialization skipped, callers close conns. */
  readonly locked: boolean;
  /** the head the markdown landed on — differs from rt.draftId when the store itself forked. */
  readonly draftId: string;
  readonly sha256: string | null;
  readonly forked: boolean;
  readonly changed: boolean;
  readonly restorePointId: string | null;
}

/** The provenance the next materialization writes: the Page's live capture, with the block-patch
 *  path's blocks re-stamped `human_mobile` (the Yjs channel carries no per-transaction origins). */
function mergedProvenance(rt: DocRuntime): ProvenanceStash | undefined {
  const stashed = rt.provenance;
  const mobile = rt.mobileBlocks;
  if (!stashed && mobile.size === 0) return undefined;
  const spans = (stashed?.spans ?? []).map((s) =>
    mobile.has(s.blockId) ? { blockId: s.blockId, source: { kind: "human_mobile" as const } } : s,
  );
  for (const b of mobile) if (!spans.some((s) => s.blockId === b)) {
    spans.push({ blockId: b, source: { kind: "human_mobile" as const } });
  }
  return { spans, ...(stashed?.agentSpans ? { agentSpans: stashed.agentSpans } : {}) };
}

/** The pending-delta flush shared by the cadence point and the named/blur/pre_run triggers. */
async function flushRestorePoint(
  exec: SqlExecutor,
  deps: MaterializeDeps,
  rt: DocRuntime,
  doc: Y.Doc,
  args: { cause: RestoreCause; label?: string | null; forceSnapshot?: boolean },
): Promise<string | null> {
  const now = deps.clock.now();
  const snapshotDue =
    rt.snapshotSv == null ||
    rt.lastSnapshotAt == null ||
    now.getTime() - rt.lastSnapshotAt >= RESTORE_SNAPSHOT_MS;
  const kind = args.forceSnapshot || snapshotDue ? "snapshot" : "delta";
  const bytes =
    kind === "snapshot"
      ? Y.encodeStateAsUpdate(doc)
      : Y.encodeStateAsUpdate(doc, rt.snapshotSv ?? undefined);
  const id = await writeRestorePoint(exec, deps.blobs, deps.ids, rt.liveDocId, {
    kind,
    cause: args.cause,
    label: args.label ?? null,
    bytes,
    at: now,
  });
  if (kind === "snapshot") {
    rt.snapshotSv = Y.encodeStateVector(doc);
    rt.lastSnapshotAt = now.getTime();
  }
  rt.lastPointAt = now.getTime();
  rt.pendingDelta = [];
  return id;
}

/**
 * One persistence pass over the live document: y_state + state_vector always; the restore cadence
 * (5-minute activity deltas over the daily snapshot base); and the materialization — skipped while a
 * run holds the head (the `pre_run` checkpoint still lands first, so the pre-run state is captured).
 */
export async function storeDocument(
  deps: MaterializeDeps,
  rt: DocRuntime,
  doc: Y.Doc,
  args: { userId: string },
): Promise<StoreOutcome> {
  const now = deps.clock.now();
  const yState = Y.encodeStateAsUpdate(doc);
  const sv = Y.encodeStateVector(doc);

  return deps.db.scoped(rt.workspaceId, async (tx) => {
    const lock = await draftLock(tx, rt.projectId, rt.draftId);

    if (lock) {
      // §6.3: locked — persist the CRDT state + the pre-run checkpoint, never the canonical head.
      await tx.query("update live_docs set y_state = $2, state_vector = $3 where id = $1", [
        rt.liveDocId,
        yState,
        sv,
      ]);
      if (rt.pendingDelta.length > 0) {
        await flushRestorePoint(tx, deps, rt, doc, { cause: "pre_run" });
      }
      return { stored: true, locked: true, draftId: rt.draftId, sha256: null, forked: false, changed: false, restorePointId: null };
    }

    // Materialize through the PRB.07 seam — same canonical serialization, same fork rule.
    const store = deps.storeFor(rt.workspaceId);
    const res = await saveManualRevision(
      tx,
      { store, ids: deps.ids, clock: deps.clock, eventWriter: deps.eventWriter },
      {
        workspaceId: rt.workspaceId,
        projectId: rt.projectId,
        draftId: rt.draftId,
        markdown: docToCanonicalMarkdown(doc),
        userId: args.userId,
        ...(mergedProvenance(rt) ? { provenance: mergedProvenance(rt)! } : {}),
        restorePoint: "ydoc",
      },
    );
    if (!res.ok) {
      // draft_not_found / not_editable — the binding went stale or the head isn't a human revision.
      // Persist the CRDT state regardless (it survives a later rebind) and report as locked-ish:
      // callers close the connections so a fresh auth re-resolves the head.
      await tx.query("update live_docs set y_state = $2, state_vector = $3 where id = $1", [
        rt.liveDocId,
        yState,
        sv,
      ]);
      return {
        stored: true,
        locked: true,
        draftId: rt.draftId,
        sha256: null,
        forked: false,
        changed: false,
        restorePointId: null,
      };
    }
    rt.provenance = null;
    rt.mobileBlocks.clear();

    // The live doc to stamp is the RESOLVED head's (res.draftId may be the freshly forked child).
    // openHumanRevision never creates one, and saveManualRevision only does inside `changed` — a
    // fork whose markdown nets out to the base would otherwise write the diverged y_state into the
    // FROZEN parent's live doc. Create + link the child's row instead.
    const liveRow = (
      await tx.query("select live_doc_id from drafts where id = $1", [res.draftId])
    ).rows[0] as { live_doc_id: string | null } | undefined;
    let liveDocId = liveRow?.live_doc_id ?? null;
    if (!liveDocId) {
      liveDocId = deps.ids("doc");
      await tx.query(
        `insert into live_docs(id, draft_id, y_state, state_vector) values ($1,$2,'\\x'::bytea,'\\x'::bytea)`,
        [liveDocId, res.draftId],
      );
      await tx.query("update drafts set live_doc_id = $2 where id = $1", [res.draftId, liveDocId]);
    }
    await tx.query(
      "update live_docs set y_state = $2, state_vector = $3 where id = $1",
      [liveDocId, yState, sv],
    );
    // A fork re-homes this runtime: subsequent restore points + state writes target the CHILD's
    // live doc (the frozen base's y_state and restore chain stay frozen-clean).
    if (liveDocId !== rt.liveDocId) rt.liveDocId = liveDocId;

    // The 5-minute-activity cadence: owed only when edits actually landed (the debounce stores an
    // unchanged doc silently — no restore churn for a read-only session).
    let restorePointId: string | null = null;
    const activityDue =
      rt.pendingDelta.length > 0 &&
      (rt.lastPointAt == null || now.getTime() - rt.lastPointAt >= RESTORE_ACTIVITY_MS);
    if (res.changed && activityDue) {
      restorePointId = await flushRestorePoint(tx, deps, rt, doc, { cause: "timer" });
    } else if (res.changed) {
      rt.pendingDelta = []; // a materialized change clears the pending delta either way
    }

    return {
      stored: true,
      locked: false,
      draftId: res.draftId,
      sha256: res.sha256,
      forked: res.forked,
      changed: res.changed,
      restorePointId,
    };
  });
}

/**
 * A trigger restore point (⌘S named / blur / external flush): persists the current state + writes the
 * point immediately (a named point is always a full snapshot — it must reconstruct without a chain).
 */
export async function markRestorePoint(
  deps: MaterializeDeps,
  rt: DocRuntime,
  doc: Y.Doc,
  args: { cause: "named" | "blur"; label?: string | null; userId: string },
): Promise<{ restorePointId: string }> {
  const yState = Y.encodeStateAsUpdate(doc);
  const sv = Y.encodeStateVector(doc);
  return deps.db.scoped(rt.workspaceId, async (tx) => {
    await tx.query("update live_docs set y_state = $2, state_vector = $3 where id = $1", [
      rt.liveDocId,
      yState,
      sv,
    ]);
    const restorePointId = await flushRestorePoint(tx, deps, rt, doc, {
      cause: args.cause,
      label: args.label ?? null,
      forceSnapshot: args.cause === "named",
    });
    return { restorePointId: restorePointId! };
  });
}

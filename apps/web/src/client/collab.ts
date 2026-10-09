// The Page's Yjs collab session (P1.03; §5.10/§13.1 — the transport half of the EditorTransport swap).
// Four layers, in order of durability: the in-memory `Y.Doc` the ySyncPlugin binds →
// `IndexeddbPersistence` (offline survival; the doc name is `rhema-page/<draft>`) → the
// `HocuspocusProvider` WebSocket to `apps/collab` → the server's debounced materialization into
// canonical markdown. The session cookie rides the WS upgrade (the LB path-routes `/collab` onto the
// app host) so no credential ever enters the bundle (REQ-ARCH-30).
//
// Pill mapping (§5.10's verbatim vocabulary): provider synced → `synced`; connected with pending
// updates → `syncing`; socket down → `offline` + the queued count; a `read-only` attach (run lock,
// non-editable head) → `readonly`. There is NO Save button and NO beforeunload prompt — ⌘S sends the
// `rhema.restore` stateless (a named restore point), pagehide sends the `blur` point.

import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { HocuspocusProvider, WebSocketStatus } from "@hocuspocus/provider";

/** The shared-fragment key — must match the server's (y-prosemirror's `prosemirror` convention). */
export const PAGE_FRAGMENT = "prosemirror";

export type CollabPill = "synced" | "syncing" | "offline" | "readonly";

export interface CollabSyncEvent {
  readonly state: CollabPill;
  /** pending update count (the `offline · n changes queued` number). */
  readonly queued: number;
}

/** The fork payload the server's auth refusal carries (offline edits on a frozen head → v(N+1)). */
export interface FrozenFork {
  readonly draftId: string;
  readonly draftN: number;
}

export interface CollabSessionOptions {
  /** the WSS base — `wss://<host>/collab` (server-injected COLLAB_WS_URL). */
  readonly wsUrl: string;
  /** the working head's draft id — the document name is `draft:<id>`. */
  readonly draftId: string;
  /** 'ro' attaches read-only (the /v/:n frozen read view — never mints a working head). */
  readonly intent?: "ro";
  readonly onSync?: (ev: CollabSyncEvent) => void;
  /** the auth refusal carried a frozen_fork — the caller rebinds the session to the new head. */
  readonly onFork?: (fork: FrozenFork) => void;
  /** the server's named-restore ack (⌘S pill feedback). */
  readonly onRestorePoint?: (restorePointId: string) => void;
  /** the socket attached read-only (a run lock or a non-editable head) — the banner's cue. */
  readonly onReadOnly?: () => void;
}

export interface CollabSession {
  readonly doc: Y.Doc;
  readonly fragment: Y.XmlFragment;
  readonly provider: HocuspocusProvider;
  /** the current pill state. */
  readonly sync: CollabSyncEvent;
  /** push the Page's live provenance capture (stashed server-side for the next materialization). */
  sendProvenance(meta: { spans?: unknown; agentSpans?: unknown }): void;
  /** ⌘S — a named restore point (the ONLY manual save verb; the server acks via broadcastStateless). */
  markRestorePoint(label?: string): void;
  /** pagehide/hidden — the `blur` trigger point + the provider's own pagehide flush. */
  flushOnHide(): void;
  /** rebind to a forked head's document name (the frozen_fork flow — same Y.Doc, new name). */
  rebind(draftId: string): void;
  destroy(): void;
}

function documentName(draftId: string): string {
  return `draft:${draftId}`;
}

export function createCollabSession(opts: CollabSessionOptions): CollabSession {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment(PAGE_FRAGMENT);
  let docName = documentName(opts.draftId);

  // Layer 2: local persistence — the offline-queued edits' home (before the socket exists at all).
  let idb = new IndexeddbPersistence(`rhema-page/${docName}`, doc);

  let readOnly = false;
  let connected = false;
  let queued = 0;

  const emit = () => {
    const state: CollabPill = readOnly
      ? "readonly"
      : !connected
        ? "offline"
        : queued > 0
          ? "syncing"
          : "synced";
    opts.onSync?.({ state, queued });
  };

  const wsUrl = (() => {
    const u = new URL(opts.wsUrl, location.href);
    if (opts.intent) u.searchParams.set("intent", opts.intent);
    return u.toString();
  })();

  // A provider is bound to ONE document name — the Auth handshake rides the socket-open keyed by
  // effectiveName and the websocketProvider's routing map keeps the original key. Rebinding to a
  // forked head therefore builds a FRESH provider on the same Y.Doc rather than renaming.
  const connect = (name: string): HocuspocusProvider =>
    new HocuspocusProvider({
      url: wsUrl,
      name,
      document: doc,
      // The session cookie authenticates the upgrade; the token field is only the non-browser path.
      token: "",
      onStatus: ({ status }) => {
        connected = status === WebSocketStatus.Connected;
        emit();
      },
      onSynced: ({ state }) => {
        if (state) {
          queued = provider.unsyncedChanges;
          emit();
        }
      },
      onUnsyncedChanges: ({ number }) => {
        queued = number;
        emit();
      },
      onAuthenticationFailed: ({ reason }) => {
        // The frozen-head fork refusal carries `{code:'frozen_fork', draftId, draftN}` — rebind.
        try {
          const parsed = JSON.parse(reason) as { code?: string; draftId?: string; draftN?: number };
          if (parsed.code === "frozen_fork" && parsed.draftId) {
            opts.onFork?.({ draftId: parsed.draftId, draftN: parsed.draftN ?? 0 });
            return;
          }
        } catch {
          /* a plain-token reason falls through to the read-only/offline handling */
        }
        readOnly = true;
        emit();
      },
      onStateless: ({ payload }) => {
        try {
          const msg = JSON.parse(payload) as {
            type?: string;
            restorePointId?: string;
            draftId?: string;
            draftN?: number;
          };
          // The store-side fork lands out-of-band: the server's CLOSE message never drops the
          // socket (the provider would sit half-open forever — the N8 prod walk caught the banner
          // staying "v1 — frozen"), so the store broadcasts `rhema.fork` and we rebind directly.
          if (msg.type === "rhema.fork" && msg.draftId) {
            opts.onFork?.({ draftId: msg.draftId, draftN: msg.draftN ?? 0 });
            return;
          }
          if (msg.type === "rhema.readonly") {
            readOnly = true;
            emit();
            opts.onReadOnly?.();
          }
          if (msg.type === "rhema.restore_point" && msg.restorePointId) {
            opts.onRestorePoint?.(msg.restorePointId);
          }
        } catch {
          /* foreign stateless messages are ignored */
        }
      },
    });

  let provider = connect(docName);

  return {
    doc,
    fragment,
    get provider(): HocuspocusProvider {
      return provider;
    },
    get sync(): CollabSyncEvent {
      const state: CollabPill = readOnly
        ? "readonly"
        : !connected
          ? "offline"
          : queued > 0
            ? "syncing"
            : "synced";
      return { state, queued };
    },
    sendProvenance(meta) {
      if (!provider.isAuthenticated) return;
      provider.sendStateless(JSON.stringify({ type: "rhema.provenance", ...meta }));
    },
    markRestorePoint(label) {
      if (!provider.isAuthenticated) return;
      provider.sendStateless(
        JSON.stringify({ type: "rhema.restore", cause: "named", label: label ?? null }),
      );
    },
    flushOnHide() {
      if (provider.isAuthenticated) {
        provider.sendStateless(JSON.stringify({ type: "rhema.restore", cause: "blur" }));
      }
      provider.pageHide(); // the provider's own best-effort final flush
    },
    rebind(draftId) {
      const nextName = documentName(draftId);
      if (nextName === docName) return;
      docName = nextName;
      readOnly = false;
      queued = 0;
      // Re-point the offline store at the child's name FIRST so its queued updates persist under the
      // head they'll actually sync to; the parent's stale store is cleared (its edits live in the
      // shared Y.Doc and just rode the fork).
      const oldIdb = idb;
      idb = new IndexeddbPersistence(`rhema-page/${docName}`, doc);
      void oldIdb.clearData().catch(() => {});
      // A fresh provider re-runs Auth + SyncStepOne for the new document name; the shared Y.Doc's
      // diverged updates merge onto the child's seeded state.
      provider.destroy();
      provider = connect(docName);
      emit();
    },
    destroy() {
      provider.destroy();
      idb.destroy();
      doc.destroy();
    },
  };
}

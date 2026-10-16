// SPA.24 — the editor's collab wire bound into `PageSessionRegistry` (design/23 §3/§6 rows 2-4,
// 11-26; REQ-ED-3/4/5/10, REQ-ISL-1..8). `client/collab.ts`'s `createCollabSession` is already
// framework-free — Y.Doc → `IndexeddbPersistence("rhema-page/draft:<id>")` → the cookie-authed
// `HocuspocusProvider` (`draft:<id>` document name) with the `rhema.*` stateless vocabulary —
// so this module WRAPS it, never re-implements it: one wire implementation serves the SSR island
// and the SPA verbatim (REQ-ISL-4).
//
// The seam this adds: the session lives in the registry across mounts, but its callbacks
// (`onSync`/`onFork`/`onReadOnly`/`onRestorePoint`) must reach the CURRENTLY mounted PageMount's
// chrome (pill, banners, rail). `setChrome` binds a per-mount delegate — cleared on unmount so a
// remount re-arms the wire without rebuilding the session (the Y.Doc, IDB store, provider, and
// the registry-held EditorState all persist).
//
// This module is DOM-free — page-mount.tsx owns every DOM write.

import type { HocuspocusProvider } from "@hocuspocus/provider";
import type * as Y from "yjs";
import {
  createCollabSession,
  type CollabSession,
  type CollabSyncEvent,
  type FrozenFork,
} from "../client/collab.js";
import type { PageSessionWire } from "./page-sessions.js";

/** The mount-mounted chrome callbacks — the island's `onSync/onFork/onReadOnly/onRestorePoint`
 *  closures verbatim, rebound per mount (a registry-held session outlives any one view). */
export interface PageCollabChrome {
  readonly onSync: (ev: CollabSyncEvent) => void;
  readonly onFork: (fork: FrozenFork) => void;
  readonly onReadOnly: () => void;
  readonly onRestorePoint: (restorePointId: string) => void;
}

/** `PageSessionWire` plus the collab internals the mount's chrome legitimately reads — the pill's
 *  queued count (`provider.unsyncedChanges`) and the current `sync` snapshot. */
export interface CollabPageWire extends PageSessionWire {
  readonly doc: Y.Doc;
  readonly fragment: Y.XmlFragment;
  readonly provider: HocuspocusProvider;
  readonly sync: CollabSyncEvent;
  /** install/clear the mounted chrome delegate (null on unmount — events degrade to no-ops). */
  setChrome(chrome: PageCollabChrome | null): void;
}

/**
 * Test seam — the mounted-router specs can't reach `PageMount`'s props, so they rebind the
 * session factory module-wide (the `spaRuntime.assign` precedent). Production keeps
 * `createCollabSession`.
 */
export const pageCollabRuntime: { createSession: typeof createCollabSession } = {
  createSession: createCollabSession,
};

/**
 * Wrap `createCollabSession` in the registry-held wire: the session's callbacks dispatch through
 * a mutable chrome slot the mounted PageMount owns. `rebind` keeps the SAME Y.Doc (the
 * frozen-fork flow — `collab.ts` re-homes the IDB store and rebuilds the provider on the child's
 * `draft:<id>` name).
 */
export function createCollabWire(opts: {
  readonly wsUrl: string;
  readonly draftId: string;
}): CollabPageWire {
  const chrome: { current: PageCollabChrome | null } = { current: null };
  const session: CollabSession = pageCollabRuntime.createSession({
    wsUrl: opts.wsUrl,
    draftId: opts.draftId,
    onSync: (ev) => chrome.current?.onSync(ev),
    onFork: (fork) => chrome.current?.onFork(fork),
    onReadOnly: () => chrome.current?.onReadOnly(),
    onRestorePoint: (id) => chrome.current?.onRestorePoint(id),
  });
  return {
    doc: session.doc,
    fragment: session.fragment,
    get provider(): HocuspocusProvider {
      return session.provider;
    },
    get sync(): CollabSyncEvent {
      return session.sync;
    },
    sendProvenance: (meta) => session.sendProvenance(meta),
    markRestorePoint: () => session.markRestorePoint(),
    flushOnHide: () => session.flushOnHide(),
    rebind: (draftId) => session.rebind(draftId),
    destroy: () => session.destroy(),
    setChrome: (next) => {
      chrome.current = next;
    },
  };
}

/** Narrow a registry-held session to the collab wire (the collab-less mount's `null`/plain wire
 *  degrades verbatim — every call site is optional-seamed). */
export function isCollabWire(session: PageSessionWire | null): session is CollabPageWire {
  return session != null && typeof (session as CollabPageWire).setChrome === "function";
}

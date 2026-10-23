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
import { createPageUndoManager } from "@rhema/editor";
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
 *  queued count (`provider.unsyncedChanges`), the current `sync` snapshot, and the session-owned
 *  `Y.UndoManager` (R6FIX.1: the wire owns it so ⌘Z survives view teardowns; `destroy()` kills it). */
export interface CollabPageWire extends PageSessionWire {
  readonly doc: Y.Doc;
  readonly fragment: Y.XmlFragment;
  /** the session-scoped undo manager — pass to `createCollabPageState`'s third arg. */
  readonly undoManager: Y.UndoManager;
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
  // R6FIX.1 (F-R6POST.2-2) — the UndoManager is session-scoped like the Y.Doc it tracks: the
  // stock `yUndoPlugin` view-destroy would kill it on every keep-alive unmount (permanently dead
  // capture — the live ⌘Z-does-nothing symptom). The wire owns it; the mount hands it to
  // `createCollabPageState`, and `destroy()` runs its teardown on session end (`doc.destroy()`
  // would run it anyway — explicit here so the ownership reads plainly).
  const undoManager = createPageUndoManager(session.fragment);
  return {
    doc: session.doc,
    fragment: session.fragment,
    undoManager,
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
    destroy: () => {
      undoManager.destroy();
      session.destroy();
    },
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

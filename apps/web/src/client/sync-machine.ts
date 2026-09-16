// The editor's autosave state machine (PRB.07; §5.4; REQ-BETA-21 stopgap #1). Pure and DOM-free so it is
// unit-testable offline — editor.ts wires it to CodeMirror's update listener, fetch, and the sync pill.
//
// States:
//   synced          — the server head holds the latest doc.
//   syncing         — a save POST is in flight (or the debounce timer is running with a dirty doc).
//   offline-queued  — the last save failed (network/5xx); the doc is kept and retried (online event,
//                     next change, or the poll tick). NOT a conflict state — saves are last-write-wins
//                     head replacements guarded by the run lock.
//   locked          — the api answered 409 (a run holds the draft); autosave stops until unlock().
//
// There is no Save button and no unsaved-changes dialog: the debounce window (default 800 ms) is the only
// exposure — a refresh mid-edit loses at most the pending window's keystrokes (the pagehide beacon flushes
// a best-effort final copy through the same endpoint, REQ-IDE-43's spirit at beta fidelity).

export type SyncState = "synced" | "syncing" | "queued" | "locked";

export type SaveOutcome = "ok" | "locked" | "error";

export interface SyncMachineOptions {
  /** The debounce window in ms — the documented exposure for a mid-edit refresh. */
  readonly debounceMs: number;
  /** The save call (POST markdown → the web route → the api). */
  readonly save: (markdown: string) => Promise<SaveOutcome>;
  /** Observed on every transition. */
  readonly onState?: (state: SyncState) => void;
  /** Injectable timers for tests. */
  readonly setTimeout?: (fn: () => void, ms: number) => unknown;
  readonly clearTimeout?: (h: unknown) => void;
}

export interface SyncMachine {
  readonly state: SyncState;
  /** The doc the last save attempt carried (the queued doc while offline-queued). */
  readonly pendingDoc: string | null;
  /** The editor's doc changed — schedule the debounced save. */
  changed(markdown: string): void;
  /** Retry a queued save (online event / poll tick); a no-op unless `queued`. */
  retry(): void;
  /** Best-effort immediate flush for pagehide — returns the pending doc if one is owed (the caller beacons
   *  it; the in-flight/debounced save is abandoned by the unload anyway). */
  pendingFlush(): string | null;
  /** Mark the draft unlocked after a Cancel-run or a doc poll shows the lock released. */
  unlock(): void;
  dispose(): void;
}

export function createSyncMachine(opts: SyncMachineOptions): SyncMachine {
  const setT = opts.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearT = opts.clearTimeout ?? ((h: unknown) => clearTimeout(h as Parameters<typeof clearTimeout>[0]));

  let state: SyncState = "synced";
  let pending: string | null = null; // the newest unsaved doc
  let inFlight = false;
  let timer: unknown = null;

  const emit = (s: SyncState) => {
    if (state === s) return; // transitions only — the pill rewrites on change, not per keystroke
    state = s;
    opts.onState?.(s);
  };

  const clearTimer = () => {
    if (timer != null) {
      clearT(timer);
      timer = null;
    }
  };

  const send = () => {
    if (pending == null || inFlight || state === "locked") return;
    const doc = pending;
    inFlight = true;
    emit("syncing");
    void opts
      .save(doc)
      .then((outcome) => {
        inFlight = false;
        if (outcome === "locked") {
          pending = doc; // keep the doc — unlock() + the next change re-saves it
          emit("locked");
          return;
        }
        if (outcome === "error") {
          emit("queued"); // pending keeps `doc` unless a newer changed() overwrote it
          return;
        }
        // ok — `doc` is on the server. If a newer edit arrived mid-flight, save again.
        if (pending === doc) {
          pending = null;
          emit("synced");
        } else {
          schedule();
        }
      })
      .catch(() => {
        inFlight = false;
        emit("queued");
      });
  };

  const schedule = () => {
    if (state === "locked") return;
    clearTimer();
    // "syncing" covers the debounce window too — the pill reads "syncing" from the first keystroke.
    if (state !== "queued") emit("syncing");
    timer = setT(() => {
      timer = null;
      send();
    }, opts.debounceMs);
  };

  return {
    get state() {
      return state;
    },
    get pendingDoc() {
      return pending;
    },
    changed(markdown: string) {
      if (state === "locked") {
        pending = markdown; // keep it — unlock() re-saves it (belt; the editor is readonly anyway)
        return;
      }
      pending = markdown;
      schedule();
    },
    retry() {
      if (state !== "queued" || pending == null) return;
      send();
    },
    pendingFlush() {
      return pending;
    },
    unlock() {
      if (state !== "locked") return;
      emit(pending == null ? "synced" : "queued");
      if (pending != null) send();
    },
    dispose() {
      clearTimer();
    },
  };
}

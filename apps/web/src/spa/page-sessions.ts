// SPA.23 — the module-scope `PageSessionRegistry` (design/23 §3; REQ-ED-4, REQ-NAV-6). The Page's
// ProseMirror `EditorState` (doc + undo stack + plugin state) and — from SPA.24 — the collab
// session live OUTSIDE React so an unmount/remount (leaf nav, StrictMode double-mount) preserves
// the editing session instead of re-seeding a fresh state over the same draft.
//
//   • Identity: entries key on `draft:<draftId>` — draft ids are globally unique, so the
//     keep-alive key REQ-NAV-6 names `(projectId, draftId)` is the same session (§6's note:
//     `draft:<id>` is the canonical form).
//   • Custody: `acquire` bumps a refcount and creates the entry on a miss (the `init` callback
//     builds the `EditorState` — `createPageState` for a collab-less mount, SPA.24's
//     `createCollabPageState` bound to the wire's `Y.XmlFragment` when one binds); `release`
//     drops it — at zero the entry runs its route-leave flush (the
//     pagehide-equivalent, REQ-ED-5's `session.flushOnHide`) and schedules an idle destroy.
//   • Lifetime: an entry surviving `IDLE_TTL_MS` at zero refs is destroyed (session teardown +
//     map drop); an LRU cap (`MAX_ENTRIES`) evicts the oldest idle entry first. `rekey` moves a
//     session between draft ids — the fork/rebind seam (the same Y.Doc/state follows the child
//     draft, REQ-ISL-4).
//   • Determinism: `now` + `schedule` are injected for tests (no wall-clock, no real timers);
//     `sweepIdle()` runs the same destroy pass the timer fires.
//
// This module is DOM-free and framework-free — `page-mount.tsx` owns the `EditorView` half.

import type { EditorState } from "prosemirror-state";

/** SPA.24's collab wire, held by the registry across remounts. The mount calls into it through
 *  optional seams only — absent members degrade exactly like today's collab-less island. */
export interface PageSessionWire {
  /** the live provenance capture's piggyback onto the stateless channel (600 ms cadence, mount-owned). */
  readonly sendProvenance?: (payload: {
    readonly spans: readonly { blockId: string; source: unknown }[];
    readonly agentSpans: readonly { blockId: string; from: number; to: number }[];
  }) => void;
  /** the pagehide-equivalent flush — fires at refcount 0 (route leave) and at entry destroy. */
  readonly flushOnHide?: () => void;
  /** ⌘S — the named restore point (the only manual save verb). */
  readonly markRestorePoint?: () => void;
  /** point the SAME session at a rebound draft (frozen-head fork keeps the Y.Doc/state). */
  readonly rebind?: (draftId: string) => void;
  /** full teardown — provider disconnect + IDB handle close (entry destroy). */
  readonly destroy?: () => void;
}

/** One registry slot — `refs > 0` means a mounted `PageMount` owns it. */
export interface PageSessionEntry {
  /** the map key verbatim — `draft:<draftId>` (renamed by `rekey`). */
  readonly key: string;
  /**
   * NAVC.3 / REQ-NAVT-5 — the entry's `<bootNonce>.<seq>` page-session identity, minted once at
   * `acquire` and carried verbatim across `rekey` (the SESSION survives the fork; a
   * destroy+recreate mints a fresh seq, a new document boot a fresh nonce). `page-mount.tsx`
   * stamps it on `[data-page-root]` as `data-page-session`.
   */
  readonly sessionId: string;
  draftId: string;
  readonly state: EditorState;
  session: PageSessionWire | null;
  refs: number;
  /** `now()` when `refs` last reached zero; null while held. */
  idleSince: number | null;
  /** the pending idle-destroy handle (cancelled on re-acquire). */
  destroyHandle: unknown;
}

export interface PageSessionInit {
  readonly state: EditorState;
  readonly session?: PageSessionWire | null;
}

export interface PageSessionRegistryOptions {
  /** ms an unreferenced entry survives before destroy (design/23's keep-alive window). */
  readonly idleTtlMs?: number;
  /** LRU ceiling — a new acquire evicts the oldest idle entry past it. */
  readonly maxEntries?: number;
  readonly now?: () => number;
  /** `setTimeout`-shaped scheduler — tests inject a manual queue. Returns a cancel token. */
  readonly schedule?: (fn: () => void, ms: number) => unknown;
  readonly cancel?: (handle: unknown) => void;
  /**
   * NAVC.3 / REQ-NAVT-5 — the `<bootNonce>` leg of every `sessionId` this registry mints. One
   * nonce per document boot (the registry is per-boot — the module singleton's nonce is minted
   * at module init); tests inject a fixed value for deterministic assertions.
   */
  readonly bootNonce?: string;
}

export const PAGE_SESSION_IDLE_TTL_MS = 120_000;
export const PAGE_SESSION_MAX_ENTRIES = 4;

export class PageSessionRegistry {
  private readonly entries = new Map<string, PageSessionEntry>();
  private readonly idleTtlMs: number;
  private readonly maxEntries: number;
  /** the `<bootNonce>` leg of minted sessionIds — one per registry (= per document boot). */
  readonly bootNonce: string;
  /** the monotonic `<seq>` leg — incremented once per minted entry. */
  private seq = 0;
  private readonly now: () => number;
  private readonly schedule: (fn: () => void, ms: number) => unknown;
  private readonly cancel: (handle: unknown) => void;

  constructor(opts: PageSessionRegistryOptions = {}) {
    this.idleTtlMs = opts.idleTtlMs ?? PAGE_SESSION_IDLE_TTL_MS;
    this.maxEntries = opts.maxEntries ?? PAGE_SESSION_MAX_ENTRIES;
    this.bootNonce = opts.bootNonce ?? globalThis.crypto.randomUUID();
    this.now = opts.now ?? (() => Date.now());
    this.schedule =
      opts.schedule ??
      ((fn, ms) => setTimeout(fn, ms) as unknown);
    this.cancel = opts.cancel ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  static keyFor(draftId: string): string {
    return `draft:${draftId}`;
  }

  get size(): number {
    return this.entries.size;
  }

  entry(draftId: string): PageSessionEntry | null {
    return this.entries.get(PageSessionRegistry.keyFor(draftId)) ?? null;
  }

  /**
   * Hold the session for `draftId` — creates it via `init` on a miss, cancels a pending idle
   * destroy on a hit. `init` runs ONCE per entry lifetime: on a remount the stored `EditorState`
   * returns verbatim (doc, undo stack, plugin state preserved).
   */
  acquire(draftId: string, init: () => PageSessionInit): PageSessionEntry {
    const key = PageSessionRegistry.keyFor(draftId);
    const existing = this.entries.get(key);
    if (existing) {
      existing.refs += 1;
      existing.idleSince = null;
      if (existing.destroyHandle != null) {
        this.cancel(existing.destroyHandle);
        existing.destroyHandle = null;
      }
      return existing;
    }
    // the LRU half: a new entry past the cap evicts the longest-idle UNREFERENCED slot.
    this.evictOverflow(1);
    const made = init();
    const entry: PageSessionEntry = {
      key,
      sessionId: `${this.bootNonce}.${++this.seq}`,
      draftId,
      state: made.state,
      session: made.session ?? null,
      refs: 1,
      idleSince: null,
      destroyHandle: null,
    };
    this.entries.set(key, entry);
    return entry;
  }

  /**
   * Drop a hold. At zero refs the route-leave flush runs (the pagehide-equivalent —
   * `session.flushOnHide`) and the idle-destroy timer arms. Extra releases are a no-op, never a
   * negative refcount.
   *
   * REQ-NAVC-17 — a map miss is a no-op, and `expected` (the caller's held entry) adds an
   * identity check: a release that arrives after the map slot changed hands (the held entry
   * was rekeyed away and the key re-acquired) must NOT decrement the new occupant's refs.
   * The armed timer callback closes over the entry itself and re-checks identity at fire time
   * (`entries.get(entry.key) === entry` inside `destroyEntry`), so a stale timer can never
   * destroy a re-acquired entry at the same key. `entry.key` is read lazily inside the
   * callback so an idle entry that was `rekey`ed still dies under its NEW key at TTL.
   */
  release(draftId: string, expected?: PageSessionEntry): void {
    const key = PageSessionRegistry.keyFor(draftId);
    const entry = this.entries.get(key);
    if (!entry || (expected != null && entry !== expected) || entry.refs <= 0) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;
    entry.idleSince = this.now();
    try {
      entry.session?.flushOnHide?.();
    } catch {
      /* the flush is best-effort — a broken wire never blocks unmount */
    }
    if (entry.destroyHandle == null) {
      entry.destroyHandle = this.schedule(() => {
        // REQ-NAVC-17 — two kills this callback can never commit: a re-acquired key (the
        // generation check inside `destroyEntry`) and a re-HELD entry (a cancelled-but-
        // already-dispatched timer must not destroy a live mount's session).
        if (entry.refs === 0) this.destroyEntry(entry.key, entry);
      }, this.idleTtlMs);
    }
  }

  /**
   * Move the session to a rebound draft id (the frozen-head fork: the SAME `EditorState`/Y.Doc
   * follows the child). The wire's own `rebind` runs first so a throw leaves the map untouched.
   */
  rekey(fromDraftId: string, toDraftId: string): PageSessionEntry | null {
    const fromKey = PageSessionRegistry.keyFor(fromDraftId);
    const toKey = PageSessionRegistry.keyFor(toDraftId);
    if (fromKey === toKey) return this.entries.get(fromKey) ?? null;
    const entry = this.entries.get(fromKey);
    if (!entry) return null;
    // REQ-NAVC-17 — a HELD entry at the target refuses the rekey outright (the check runs
    // BEFORE `rebind` so a refused rekey never repoints the source's wire). A mounted session
    // may legitimately hold the target draft (a second leaf open on the child); destroying it
    // would tear down a live mount's state — the caller treats null as "leave it".
    const target = this.entries.get(toKey);
    if (target != null && target.refs > 0) return null;
    entry.session?.rebind?.(toDraftId);
    // a live IDLE entry at the target loses — the rebound session wins (the fork IS the doc's
    // future). `destroyEntry` re-checks identity so a slot that changed hands is never touched.
    const evicted = this.entries.get(toKey);
    if (evicted) this.destroyEntry(toKey, evicted);
    this.entries.delete(fromKey);
    entry.draftId = toDraftId;
    (entry as { key: string }).key = toKey;
    this.entries.set(toKey, entry);
    return entry;
  }

  /**
   * The idle pass — destroys every zero-ref entry past the TTL. The scheduled destroy calls this
   * per entry; tests call it directly after stepping `now`.
   */
  sweepIdle(): void {
    const t = this.now();
    for (const [key, entry] of [...this.entries]) {
      if (entry.refs === 0 && entry.idleSince != null && t - entry.idleSince >= this.idleTtlMs) {
        this.destroyEntry(key, entry);
      }
    }
  }

  /** Full teardown — boot-session boundary or test reset. Held entries destroy too. */
  destroyAll(): void {
    for (const key of [...this.entries.keys()]) this.destroyEntry(key);
  }

  /** Evict the oldest idle unreferenced entries until `size + incoming <= maxEntries`. */
  private evictOverflow(incoming: number): void {
    while (this.entries.size + incoming > this.maxEntries) {
      let oldest: PageSessionEntry | null = null;
      for (const entry of this.entries.values()) {
        if (entry.refs !== 0 || entry.idleSince == null) continue;
        if (!oldest || (oldest.idleSince != null && entry.idleSince < oldest.idleSince)) oldest = entry;
      }
      if (!oldest) return; // every slot is held — the cap yields to live mounts
      this.destroyEntry(oldest.key, oldest);
    }
  }

  /**
   * REQ-NAVC-17 — the generation check: when `expected` is given (every internal caller passes
   * the entry it decided to destroy), a slot that now holds a DIFFERENT entry is left alone —
   * a timer/eviction decided against the OLD occupant can never kill the entry that
   * re-acquired the key since.
   */
  private destroyEntry(key: string, expected?: PageSessionEntry): void {
    const entry = this.entries.get(key);
    if (!entry || (expected != null && entry !== expected)) return;
    this.entries.delete(key);
    if (entry.destroyHandle != null) {
      this.cancel(entry.destroyHandle);
      entry.destroyHandle = null;
    }
    try {
      entry.session?.destroy?.();
    } catch {
      /* teardown is best-effort — the map drop already happened */
    }
  }
}

/**
 * The boot-session singleton (REQ-BFF-10's per-document lifetime — module scope lives exactly as
 * long as the document boot; a new boot builds a new module graph). `page-mount.tsx` reads it;
 * tests construct their own `PageSessionRegistry` instances.
 */
export const pageSessionRegistry = new PageSessionRegistry();

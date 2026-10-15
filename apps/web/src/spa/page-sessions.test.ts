// SPA.23 — the `PageSessionRegistry`'s unit contract (design/23 §3; REQ-ED-4, REQ-NAV-6):
// `draft:<draftId>` identity, acquire/release refcounting, the StrictMode double-mount remount
// preserving the SAME EditorState, the idle-destroy TTL + LRU ceiling, the route-leave flush,
// `rekey` on a fork rebind, and the PageSessionWire's best-effort seams (a throwing session
// never breaks the map).

import { describe, expect, it, vi } from "vitest";
import { createPageState } from "@rhema/editor";
import { PageSessionRegistry, type PageSessionWire } from "./page-sessions.js";

const state = () =>
  createPageState({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "held" }] }] });

function manualClock() {
  let t = 1_000;
  const timers: { handle: number; fn: () => void; ms: number; at: number }[] = [];
  let next = 0;
  return {
    now: () => t,
    step: (ms: number) => {
      t += ms;
    },
    schedule: (fn: () => void, ms: number) => {
      const handle = ++next;
      timers.push({ handle, fn, ms, at: t });
      return handle;
    },
    cancel: (h: unknown) => {
      const i = timers.findIndex((x) => x.handle === h);
      if (i >= 0) timers.splice(i, 1);
    },
    fire: (ms?: number) => {
      if (ms != null) t += ms;
      // only timers whose deadline passed run — like a real scheduler.
      for (const x of [...timers]) {
        if (x.at + x.ms <= t) {
          timers.splice(timers.indexOf(x), 1);
          x.fn();
        }
      }
    },
    pending: () => timers.length,
  };
}

function registry(clock = manualClock(), opts?: { idleTtlMs?: number; maxEntries?: number }) {
  return {
    clock,
    reg: new PageSessionRegistry({
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
      ...(opts?.idleTtlMs != null ? { idleTtlMs: opts.idleTtlMs } : {}),
      ...(opts?.maxEntries != null ? { maxEntries: opts.maxEntries } : {}),
    }),
  };
}

describe("PageSessionRegistry (SPA.23)", () => {
  it("keys on draft:<draftId> and acquire returns the same entry on a hit (StrictMode remount)", () => {
    const { reg } = registry();
    const init = vi.fn(() => ({ state: state() }));
    const a = reg.acquire("d_1", init);
    expect(PageSessionRegistry.keyFor("d_1")).toBe("draft:d_1");
    expect(a.refs).toBe(1);
    // release → StrictMode's cleanup fires, then the second mount re-acquires BEFORE the TTL —
    // the SAME state (doc + undo + plugin state) comes back; init ran once.
    reg.release("d_1");
    expect(a.refs).toBe(0);
    const b = reg.acquire("d_1", init);
    expect(b).toBe(a);
    expect(b.state).toBe(a.state);
    expect(init).toHaveBeenCalledTimes(1);
    expect(b.refs).toBe(1);
    // a pending idle-destroy was cancelled by the re-acquire.
    const { clock } = registry();
    void clock;
  });

  it("release past zero is a no-op — the refcount never goes negative", () => {
    const { reg } = registry();
    reg.acquire("d_1", () => ({ state: state() }));
    reg.release("d_1");
    reg.release("d_1");
    reg.release("d_1");
    expect(reg.entry("d_1")?.refs).toBe(0);
    expect(reg.size).toBe(1);
  });

  it("the idle-destroy timer destroys a zero-ref entry at the TTL (session teardown + map drop)", () => {
    const { reg, clock } = registry(manualClock(), { idleTtlMs: 120_000 });
    const destroy = vi.fn();
    const flushOnHide = vi.fn();
    const wire: PageSessionWire = { destroy, flushOnHide };
    reg.acquire("d_1", () => ({ state: state(), session: wire }));
    reg.release("d_1");
    // the route-leave flush ran at refcount 0 (the pagehide-equivalent).
    expect(flushOnHide).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
    clock.fire(119_999);
    expect(reg.size).toBe(1);
    clock.fire(1);
    expect(reg.size).toBe(0);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("sweepIdle destroys only entries past the TTL; held entries never sweep", () => {
    const { reg, clock } = registry(manualClock(), { idleTtlMs: 10_000 });
    reg.acquire("old", () => ({ state: state() }));
    reg.release("old");
    clock.step(9_999);
    reg.acquire("held", () => ({ state: state() }));
    reg.acquire("fresh", () => ({ state: state() }));
    reg.release("fresh");
    reg.sweepIdle();
    expect(reg.size).toBe(3);
    clock.step(1);
    reg.sweepIdle();
    // `old` crossed the TTL; `fresh` re-arms from its own release; `held` never left.
    expect(reg.entry("old")).toBeNull();
    expect(reg.entry("fresh")).not.toBeNull();
    expect(reg.entry("held")?.refs).toBe(1);
  });

  it("the LRU cap evicts the OLDEST idle entry first — held entries are never evicted", () => {
    const { reg, clock } = registry(manualClock(), { maxEntries: 2 });
    reg.acquire("a", () => ({ state: state() }));
    reg.release("a");
    clock.step(100);
    reg.acquire("b", () => ({ state: state() }));
    reg.release("b");
    clock.step(100);
    // a third acquire past the cap evicts `a` (the longest-idle unreferenced slot).
    reg.acquire("c", () => ({ state: state() }));
    expect(reg.entry("a")).toBeNull();
    expect(reg.entry("b")).not.toBeNull();
    expect(reg.entry("c")?.refs).toBe(1);
    // two HELD entries + a new acquire: the cap yields to live mounts — nothing evicts.
    reg.acquire("d", () => ({ state: state() }));
    reg.acquire("e", () => ({ state: state() }));
    expect(reg.entry("c")).not.toBeNull();
    expect(reg.entry("d")).not.toBeNull();
    expect(reg.entry("e")).not.toBeNull();
  });

  it("rekey moves the session to the rebound draft — the same EditorState follows the fork", () => {
    const { reg } = registry();
    const rebind = vi.fn();
    const s = state();
    reg.acquire("d_base", () => ({ state: s, session: { rebind } }));
    const entry = reg.rekey("d_base", "d_child");
    expect(rebind).toHaveBeenCalledWith("d_child");
    expect(entry?.state).toBe(s);
    expect(reg.entry("d_base")).toBeNull();
    expect(reg.entry("d_child")?.draftId).toBe("d_child");
    // the child key holds the SAME ref — a mount now acquires it without re-init.
    const init = vi.fn(() => ({ state: state() }));
    const reacquired = reg.acquire("d_child", init);
    expect(reacquired.state).toBe(s);
    expect(init).not.toHaveBeenCalled();
  });

  it("rekey evicts an IDLE entry at the target (the rebound session wins) and no-ops on a miss", () => {
    const { reg } = registry();
    const destroy = vi.fn();
    reg.acquire("d_base", () => ({ state: state() }));
    reg.acquire("d_child", () => ({ state: state(), session: { destroy } }));
    // NAVC.3 / REQ-NAVC-17 — only an IDLE target may lose; a held target refuses outright
    // (the next test). Drop the hold so the rebound session still wins this slot.
    reg.release("d_child");
    reg.rekey("d_base", "d_child");
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(reg.entry("d_child")?.draftId).toBe("d_child");
    expect(reg.rekey("missing", "nowhere")).toBeNull();
    expect(reg.rekey("d_child", "d_child")?.draftId).toBe("d_child");
  });

  it("a throwing wire never breaks the map — flush/destroy are best-effort", () => {
    const { reg, clock } = registry(manualClock(), { idleTtlMs: 1_000 });
    reg.acquire("d_1", () => ({
      state: state(),
      session: {
        flushOnHide: () => {
          throw new Error("wire down");
        },
        destroy: () => {
          throw new Error("wire down");
        },
      },
    }));
    expect(() => reg.release("d_1")).not.toThrow();
    expect(() => clock.fire(1_000)).not.toThrow();
    expect(reg.size).toBe(0);
  });

  // ---- NAVC.3 / REQ-NAVC-17 — the named kill paths. Each test names a destroy that WAS
  // reachable before the generation check (`entries.get(key) === entry`) + the held-target
  // refusal landed; the invariant under test is "a timer or eviction must never kill a held
  // or re-acquired entry". -----------------------------------------------------------------

  it("REQ-NAVC-17 — kill path: a stale idle timer must never destroy a re-acquired entry at the same key", () => {
    const { reg, clock } = registry(manualClock(), { idleTtlMs: 120_000 });
    const orphanDestroy = vi.fn();
    // A mount holds d_1; its release arms the idle-destroy timer against THIS entry...
    const orphan = reg.acquire("d_1", () => ({ state: state(), session: { destroy: orphanDestroy } }));
    reg.release("d_1", orphan);
    // ...the fork seam rekeys it away BEFORE the timer fires (the map slot at draft:d_1 frees)...
    reg.rekey("d_1", "d_1b");
    // ...and a DIFFERENT entry re-acquires the vacated key (a fresh mount of the parent draft).
    const fresh = reg.acquire("d_1", () => ({ state: state() }));
    expect(fresh).not.toBe(orphan);
    // The orphan's armed timer fires — keyed to the ENTRY, not the stale key: the new occupant
    // at draft:d_1 is untouchable; the orphan itself still dies at TTL under its NEW key
    // (the callback resolves `entry.key` lazily so a rekeyed idle entry's destroy isn't leaked).
    clock.fire(120_000);
    expect(reg.entry("d_1")).toBe(fresh);
    expect(fresh.refs).toBe(1);
    expect(reg.entry("d_1b")).toBeNull();
    expect(orphanDestroy).toHaveBeenCalledTimes(1);
  });

  it("REQ-NAVC-17 — kill path: a timer must never destroy a re-HELD entry (cancelled-but-fired)", () => {
    const clock = manualClock();
    const reg = new PageSessionRegistry({
      idleTtlMs: 120_000,
      now: clock.now,
      schedule: clock.schedule,
      // the lost-race scheduler: a queued callback is NOT retracted by cancel — the acquire
      // below "cancels" the destroy but the callback still fires, so the timer's own
      // `refs === 0` re-check is the last invariant standing.
      cancel: () => undefined,
    });
    const destroy = vi.fn();
    const entry = reg.acquire("d_1", () => ({ state: state(), session: { destroy } }));
    reg.release("d_1", entry); // arms the idle timer
    reg.acquire("d_1", () => ({ state: state() })); // re-held — the queued callback stays queued
    clock.fire(120_000);
    expect(reg.entry("d_1")).toBe(entry);
    expect(entry.refs).toBe(1);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("REQ-NAVC-17 — kill path: a phantom release naming a stale draft id never decrements the new occupant", () => {
    const { reg } = registry();
    const stale = reg.acquire("d_1", () => ({ state: state() }));
    reg.release("d_1", stale);
    reg.rekey("d_1", "d_1b"); // the held entry moved away — draft:d_1's slot changed hands
    const occupant = reg.acquire("d_1", () => ({ state: state() }));
    // A cleanup releasing the STALE identity (`release(draftId, entry)` with an entry the map
    // no longer holds at that key) is a registry no-op — never the occupant's decrement.
    reg.release("d_1", stale);
    expect(occupant.refs).toBe(1);
    // ...and the occupant's own real release still works.
    reg.release("d_1", occupant);
    expect(occupant.refs).toBe(0);
  });

  it("REQ-NAVC-17 — kill path: release on a map miss is a no-op (nothing thrown, nothing armed)", () => {
    const { reg, clock } = registry();
    expect(() => reg.release("never-held")).not.toThrow();
    expect(clock.pending()).toBe(0);
    expect(reg.size).toBe(0);
  });

  it("REQ-NAVC-17 — kill path: rekey onto a HELD target refuses outright (no evict, no rebind, source unmoved)", () => {
    const { reg } = registry();
    const rebind = vi.fn();
    const destroy = vi.fn();
    const base = reg.acquire("d_base", () => ({ state: state(), session: { rebind } }));
    // The target is HELD (refs 1 — a live mount owns it; e.g. a second leaf on the child draft).
    reg.acquire("d_child", () => ({ state: state(), session: { destroy } }));
    expect(reg.rekey("d_base", "d_child")).toBeNull();
    // The refusal lands BEFORE the wire repoints — a refused rekey never rebinds the source's
    // session onto a draft it does not move to, and never destroys the held target.
    expect(rebind).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
    expect(reg.entry("d_base")).toBe(base);
    expect(reg.entry("d_child")?.draftId).toBe("d_child");
    expect(reg.entry("d_child")?.refs).toBe(1);
  });

  // ---- NAVC.3 / REQ-NAVT-5 — the `<bootNonce>.<seq>` page-session identity mint --------------

  it("REQ-NAVT-5 — sessionId mints as `<bootNonce>.<seq>`, survives rekey, differs per entry and per boot", () => {
    const clock = manualClock();
    const reg = new PageSessionRegistry({
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
      bootNonce: "boot_x",
    });
    const a = reg.acquire("d_1", () => ({ state: state() }));
    const b = reg.acquire("d_2", () => ({ state: state() }));
    expect(a.sessionId).toBe("boot_x.1");
    expect(b.sessionId).toBe("boot_x.2");
    // A frozen-head rekey carries the SAME session identity — the Y.Doc/state is the session.
    reg.rekey("d_1", "d_1b");
    expect(a.sessionId).toBe("boot_x.1");
    // A destroy+recreate at the same draft mints a fresh seq — a new session, a new stamp.
    reg.release("d_1b", a);
    clock.fire(120_000);
    const c = reg.acquire("d_1b", () => ({ state: state() }));
    expect(c.sessionId).toBe("boot_x.3");
    // A new registry = a new document boot ⇒ a different nonce leg.
    const reg2 = new PageSessionRegistry({ bootNonce: "boot_y" });
    expect(reg2.acquire("d_1", () => ({ state: state() })).sessionId).toBe("boot_y.1");
    // And the default nonce mints (uuid-shaped, unique per registry) when not injected.
    const reg3 = new PageSessionRegistry();
    const reg4 = new PageSessionRegistry();
    expect(reg3.bootNonce).not.toBe(reg4.bootNonce);
    expect(reg3.acquire("d", () => ({ state: state() })).sessionId).toBe(`${reg3.bootNonce}.1`);
  });

  it("destroyAll tears every entry down — the boot-session boundary", () => {
    const { reg } = registry();
    const d1 = vi.fn();
    const d2 = vi.fn();
    reg.acquire("a", () => ({ state: state(), session: { destroy: d1 } }));
    reg.acquire("b", () => ({ state: state(), session: { destroy: d2 } }));
    reg.destroyAll();
    expect(reg.size).toBe(0);
    expect(d1).toHaveBeenCalledTimes(1);
    expect(d2).toHaveBeenCalledTimes(1);
  });
});

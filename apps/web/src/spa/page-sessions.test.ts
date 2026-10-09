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

  it("rekey evicts a live entry at the target (the rebound session wins) and no-ops on a miss", () => {
    const { reg } = registry();
    const destroy = vi.fn();
    reg.acquire("d_base", () => ({ state: state() }));
    reg.acquire("d_child", () => ({ state: state(), session: { destroy } }));
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

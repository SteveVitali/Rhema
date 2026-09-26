import { describe, it, expect, vi } from "vitest";
import { createSyncMachine, type SaveOutcome, type SyncState } from "./sync-machine";

// The autosave state machine (PRB.07): debounced saves, in-flight coalescing, offline queueing, lock stops.

function rig(save: (md: string) => Promise<SaveOutcome>) {
  const states: SyncState[] = [];
  const timers = new Map<number, () => void>();
  let next = 1;
  const machine = createSyncMachine({
    debounceMs: 800,
    save,
    onState: (s) => states.push(s),
    setTimeout: (fn) => {
      const id = next++;
      timers.set(id, fn);
      return id;
    },
    clearTimeout: (h) => {
      timers.delete(h as number);
    },
  });
  return {
    machine,
    states,
    /** fire the pending debounce timer (if any). */
    tick() {
      const fns = [...timers.values()];
      timers.clear();
      for (const fn of fns) fn();
    },
    timerCount: () => timers.size,
  };
}

describe("sync machine — the debounced autosave (PRB.07)", () => {
  it("saves once after the debounce window and lands on synced", async () => {
    const saves: string[] = [];
    const { machine, states, tick } = rig(async (md) => {
      saves.push(md);
      return "ok";
    });
    machine.changed("a");
    machine.changed("ab");
    machine.changed("abc");
    expect(machine.state).toBe("syncing"); // the debounce window reads "syncing"
    tick();
    await vi.waitFor(() => expect(machine.state).toBe("synced"));
    expect(saves).toEqual(["abc"]);
    expect(states).toEqual(["syncing", "synced"]);
  });

  it("coalesces an edit that lands mid-flight into a follow-up save", async () => {
    const saves: string[] = [];
    let release!: (o: SaveOutcome) => void;
    const { machine, tick } = rig(
      (md) =>
        new Promise<SaveOutcome>((res) => {
          saves.push(md);
          release = res;
        }),
    );
    machine.changed("v1");
    tick(); // save("v1") in flight
    machine.changed("v2"); // queued behind the flight
    release("ok");
    await vi.waitFor(() => expect(saves).toEqual(["v1"]));
    tick();
    release("ok");
    await vi.waitFor(() => expect(machine.state).toBe("synced"));
    expect(saves).toEqual(["v1", "v2"]);
  });

  it("a failed save queues the doc; retry() sends the newest copy", async () => {
    const saves: string[] = [];
    const outcomes: SaveOutcome[] = ["error", "ok"];
    const { machine, tick } = rig(async (md) => {
      saves.push(md);
      return outcomes.shift() ?? "ok";
    });
    machine.changed("offline draft");
    tick();
    await vi.waitFor(() => expect(machine.state).toBe("queued"));
    expect(machine.pendingDoc).toBe("offline draft");
    machine.retry();
    await vi.waitFor(() => expect(machine.state).toBe("synced"));
    expect(saves).toEqual(["offline draft", "offline draft"]);
  });

  it("a 409 lock stops autosave; unlock() re-saves the held doc", async () => {
    const saves: string[] = [];
    const outcomes: SaveOutcome[] = ["locked", "ok"];
    const { machine, tick } = rig(async (md) => {
      saves.push(md);
      return outcomes.shift() ?? "ok";
    });
    machine.changed("blocked edit");
    tick();
    await vi.waitFor(() => expect(machine.state).toBe("locked"));
    machine.changed("more while locked");
    tick();
    expect(saves).toEqual(["blocked edit"]); // no save attempted while locked
    machine.unlock();
    await vi.waitFor(() => expect(machine.state).toBe("synced"));
    expect(saves).toEqual(["blocked edit", "more while locked"]);
  });

  it("pendingFlush() exposes the owed doc for the pagehide beacon", () => {
    const { machine } = rig(async () => "ok");
    expect(machine.pendingFlush()).toBeNull();
    machine.changed("unsaved");
    expect(machine.pendingFlush()).toBe("unsaved");
  });

  it("never schedules a save while locked (pendingFlush still returns the held doc)", () => {
    const { machine, tick, timerCount } = rig(async () => "locked");
    machine.changed("x");
    tick();
    // the locked outcome arrives async; force another change after it resolves
    return vi
      .waitFor(() => expect(machine.state).toBe("locked"))
      .then(() => {
        machine.changed("y");
        expect(timerCount()).toBe(0);
        expect(machine.pendingFlush()).toBe("y");
      });
  });
});

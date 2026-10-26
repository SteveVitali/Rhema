import { describe, it, expect } from "vitest";
import { ReloadableAnthropicSecretProvider, type SecretAccessor } from "./secret-manager.js";

describe("ReloadableAnthropicSecretProvider", () => {
  it("reads the key at boot and refreshes a rotated value on SIGHUP", async () => {
    let current = "sk-old";
    let calls = 0;
    const accessor: SecretAccessor = (name) => {
      calls++;
      expect(name).toBe("projects/p/secrets/anthropic-api-key/versions/latest");
      return Promise.resolve(current);
    };
    const provider = await ReloadableAnthropicSecretProvider.create("projects/p/secrets/anthropic-api-key/versions/latest", accessor);
    expect(provider.anthropicApiKey()).toBe("sk-old");
    expect(calls).toBe(1); // one fetch at boot

    current = "sk-new"; // operator rotates the secret
    await provider.refresh(); // the SIGHUP handler calls this
    expect(provider.anthropicApiKey()).toBe("sk-new");
    expect(calls).toBe(2);
  });

  it("keeps the old key if a refresh throws", async () => {
    let fail = false;
    const accessor: SecretAccessor = () => (fail ? Promise.reject(new Error("SM unavailable")) : Promise.resolve("sk-good"));
    const provider = await ReloadableAnthropicSecretProvider.create("n", accessor);
    fail = true;
    await expect(provider.refresh()).rejects.toThrow(/unavailable/);
    expect(provider.anthropicApiKey()).toBe("sk-good"); // unchanged
  });
});

// F-R6GLD.1-1 — the SIGHUP-only design gap: a dead upstream key must propagate to running
// instances on a bounded interval, without an operator recycle. Deterministic injected scheduler
// (the page-sessions pattern — no real timers in the unit test).
describe("ReloadableAnthropicSecretProvider.startPeriodicRefresh", () => {
  /** A manual scheduler: queued ticks fire on demand; unref/stop are observable. */
  const manualScheduler = () => {
    const ticks: (() => void)[] = [];
    const handle = { unrefCalls: 0, unref() { this.unrefCalls++; } };
    const cleared: unknown[] = [];
    return {
      ticks,
      handle,
      cleared,
      setInterval: (fn: () => void) => {
        ticks.push(fn);
        return handle;
      },
      clearInterval: (h: unknown) => {
        cleared.push(h);
      },
    };
  };
  /** Flush the async refresh the tick kicked off (refresh → catch → finally microtasks). */
  const flush = () => new Promise<void>((r) => setTimeout(r, 0));

  it("re-fetches on the interval and swaps the key — timer is unref'd, stop clears it", async () => {
    let current = "sk-v3";
    let calls = 0;
    const accessor: SecretAccessor = () => {
      calls++;
      return Promise.resolve(current);
    };
    const sched = manualScheduler();
    const provider = await ReloadableAnthropicSecretProvider.create("n", accessor);
    expect(calls).toBe(1);
    const stop = provider.startPeriodicRefresh(300_000, sched);
    expect(sched.handle.unrefCalls).toBe(1); // never holds the event loop

    current = "sk-v4"; // the secret version advances upstream
    sched.ticks[0]!();
    await flush();
    expect(provider.anthropicApiKey()).toBe("sk-v4");
    expect(calls).toBe(2);

    stop();
    expect(sched.cleared).toEqual([sched.handle]);
  });

  it("a failed fetch keeps serving the last good key — the loop survives and reports", async () => {
    let current = "sk-good";
    let failOnce = false;
    const accessor: SecretAccessor = () =>
      failOnce ? Promise.reject(new Error("SM unavailable")) : Promise.resolve(current);
    const sched = manualScheduler();
    const errors: unknown[] = [];
    const provider = await ReloadableAnthropicSecretProvider.create("n", accessor);
    provider.startPeriodicRefresh(300_000, { ...sched, onError: (e) => errors.push(e) });

    failOnce = true;
    sched.ticks[0]!();
    await flush(); // the rejection is caught — no unhandled rejection, key unchanged
    expect(provider.anthropicApiKey()).toBe("sk-good");
    expect(errors).toHaveLength(1);

    failOnce = false;
    current = "sk-newer";
    sched.ticks[0]!(); // the loop survives its own failure and refreshes on the next tick
    await flush();
    expect(provider.anthropicApiKey()).toBe("sk-newer");
  });

  it("a slow fetch never stacks up — one refresh in flight at a time", async () => {
    let calls = 0;
    let resolveFetch: ((v: string) => void) | null = null;
    const accessor: SecretAccessor = () => {
      calls++;
      if (calls === 1) return Promise.resolve("sk-boot"); // the boot fetch
      return new Promise<string>((res) => {
        resolveFetch = res;
      });
    };
    const sched = manualScheduler();
    const provider = await ReloadableAnthropicSecretProvider.create("n", accessor);
    provider.startPeriodicRefresh(300_000, sched);

    sched.ticks[0]!(); // calls=2 — in flight
    sched.ticks[0]!(); // dropped — the slow fetch is still running
    expect(calls).toBe(2);
    resolveFetch!("sk-later");
    await flush();
    expect(provider.anthropicApiKey()).toBe("sk-later");
    sched.ticks[0]!(); // calls=3 — free to run again once the flight landed
    expect(calls).toBe(3);
    resolveFetch!("sk-latest");
    await flush();
    expect(provider.anthropicApiKey()).toBe("sk-latest");
  });
});

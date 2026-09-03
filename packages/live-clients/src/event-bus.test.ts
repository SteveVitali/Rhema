import { describe, it, expect } from "vitest";
import { RedisRunEventBus, runChannel, runIdFromChannel, type RedisPubLike, type RedisSubLike } from "./event-bus.js";

class FakePub implements RedisPubLike {
  readonly published: Array<{ channel: string; message: string }> = [];
  publish(channel: string, message: string): Promise<unknown> {
    this.published.push({ channel, message });
    return Promise.resolve(1);
  }
}

class FakeSub implements RedisSubLike {
  readonly subscribed = new Set<string>();
  private handler: ((channel: string, message: string) => void) | undefined;
  subscribe(...channels: string[]): Promise<unknown> {
    for (const c of channels) this.subscribed.add(c);
    return Promise.resolve(channels.length);
  }
  unsubscribe(...channels: string[]): Promise<unknown> {
    for (const c of channels) this.subscribed.delete(c);
    return Promise.resolve(channels.length);
  }
  on(_event: "message", listener: (channel: string, message: string) => void): void {
    this.handler = listener;
  }
  /** test helper: simulate a redis pub/sub message arriving. */
  emit(channel: string, message: string): void {
    this.handler?.(channel, message);
  }
}

describe("run channel helpers", () => {
  it("encodes and decodes the run channel", () => {
    expect(runChannel("run_9")).toBe("run:run_9");
    expect(runIdFromChannel("run:run_9")).toBe("run_9");
    expect(runIdFromChannel("other:x")).toBeNull();
  });
});

describe("RedisRunEventBus", () => {
  it("publishes the high-water seq on the run channel", async () => {
    const pub = new FakePub();
    const bus = new RedisRunEventBus(pub, new FakeSub());
    await bus.publish("run_1", 7);
    expect(pub.published).toEqual([{ channel: "run:run_1", message: "7" }]);
  });

  it("SUBSCRIBEs on first listener and delivers parsed seqs", () => {
    const sub = new FakeSub();
    const bus = new RedisRunEventBus(new FakePub(), sub);
    const seqs: number[] = [];
    bus.subscribe("run_1", (s) => seqs.push(s));
    expect(sub.subscribed.has("run:run_1")).toBe(true);
    sub.emit("run:run_1", "3");
    sub.emit("run:run_1", "5");
    expect(seqs).toEqual([3, 5]);
  });

  it("fans out to multiple listeners and refcounts UNSUBSCRIBE", () => {
    const sub = new FakeSub();
    const bus = new RedisRunEventBus(new FakePub(), sub);
    const a: number[] = [];
    const b: number[] = [];
    const offA = bus.subscribe("run_1", (s) => a.push(s));
    const offB = bus.subscribe("run_1", (s) => b.push(s));
    sub.emit("run:run_1", "1");
    expect([a, b]).toEqual([[1], [1]]);
    offA();
    expect(sub.subscribed.has("run:run_1")).toBe(true); // b still listening
    sub.emit("run:run_1", "2");
    expect([a, b]).toEqual([[1], [1, 2]]);
    offB();
    expect(sub.subscribed.has("run:run_1")).toBe(false); // last listener gone
  });

  it("ignores messages for unknown channels and non-numeric payloads", () => {
    const sub = new FakeSub();
    const bus = new RedisRunEventBus(new FakePub(), sub);
    const seqs: number[] = [];
    bus.subscribe("run_1", (s) => seqs.push(s));
    sub.emit("run:run_1", "nan");
    sub.emit("garbage", "1");
    sub.emit("run:other", "1");
    expect(seqs).toEqual([]);
  });
});

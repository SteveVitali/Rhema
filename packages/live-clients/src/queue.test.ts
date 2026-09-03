import { describe, it, expect } from "vitest";
import { PgBossQueue, toPgBossSendOptions, type PgBossLike, type PgBossSendOptions } from "./queue.js";

class FakeBoss implements PgBossLike {
  readonly sends: Array<{ name: string; data: Record<string, unknown>; options?: PgBossSendOptions }> = [];
  send(name: string, data: Record<string, unknown>, options?: PgBossSendOptions): Promise<string | null> {
    this.sends.push({ name, data, options });
    return Promise.resolve("job_1");
  }
}

describe("toPgBossSendOptions", () => {
  it("passes the singleton key through", () => {
    expect(toPgBossSendOptions({ singletonKey: "run.start:r1" })).toEqual({ singletonKey: "run.start:r1" });
  });
  it("converts startAfterMs to whole seconds (ceil)", () => {
    expect(toPgBossSendOptions({ startAfterMs: 1500 })).toEqual({ startAfter: 2 });
    expect(toPgBossSendOptions({ startAfterMs: 60_000 })).toEqual({ startAfter: 60 });
  });
  it("drops a zero/absent delay and undefined options", () => {
    expect(toPgBossSendOptions({ startAfterMs: 0 })).toEqual({});
    expect(toPgBossSendOptions(undefined)).toEqual({});
  });
});

describe("PgBossQueue", () => {
  it("sends the mapped job to pg-boss", async () => {
    const boss = new FakeBoss();
    const queue = new PgBossQueue(boss);
    await queue.send("run.start", { runId: "r1" }, { singletonKey: "run.start:r1", startAfterMs: 3000 });
    expect(boss.sends).toEqual([
      { name: "run.start", data: { runId: "r1" }, options: { singletonKey: "run.start:r1", startAfter: 3 } },
    ]);
  });
});

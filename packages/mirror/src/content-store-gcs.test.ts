import { describe, it, expect } from "vitest";
import { GcsContentStore, type GcsBucketLike, type GcsFileLike } from "./content-store-gcs.js";
import { s3KeyFor, sha256Hex } from "./content-store.js";

/** A fake GCS bucket over a Map keyed by object name, with a 404-throwing download for missing objects. */
class FakeBucket implements GcsBucketLike {
  readonly objects = new Map<string, Buffer>();
  file(name: string): GcsFileLike {
    return {
      download: () => {
        const buf = this.objects.get(name);
        if (!buf) return Promise.reject(Object.assign(new Error("Not Found"), { code: 404 }));
        return Promise.resolve([buf]);
      },
      save: (data: Buffer) => {
        this.objects.set(name, data);
        return Promise.resolve();
      },
    };
  }
}

describe("GcsContentStore", () => {
  it("puts bytes at the tenant-prefixed content key and gets them back", async () => {
    const bucket = new FakeBucket();
    const store = new GcsContentStore(bucket, "ws_1");
    const bytes = Buffer.from("hello", "utf8");
    const sha = sha256Hex(bytes);
    const { key } = await store.put("ws_1", sha, bytes);
    expect(key).toBe(s3KeyFor("ws_1", sha));
    expect(bucket.objects.has(key)).toBe(true);
    const got = await store.get(sha);
    expect(got && Buffer.from(got).toString("utf8")).toBe("hello");
  });

  it("returns null for a missing object (a 404), not a throw", async () => {
    const store = new GcsContentStore(new FakeBucket(), "ws_1");
    expect(await store.get(sha256Hex("absent"))).toBeNull();
  });

  it("an unbound (write-only) store rejects get but still puts (tenant-explicit)", async () => {
    const bucket = new FakeBucket();
    const store = new GcsContentStore(bucket); // no workspace binding — the api's gate-overlay write path
    const bytes = Buffer.from("plan", "utf8");
    const sha = sha256Hex(bytes);
    const { key } = await store.put("ws_7", sha, bytes);
    expect(bucket.objects.has(key)).toBe(true);
    await expect(store.get(sha)).rejects.toThrow(/workspace-bound/);
  });

  it("is tenant-scoped: a store bound to ws_1 reads only ws_1's key prefix", async () => {
    const bucket = new FakeBucket();
    const bytes = Buffer.from("secret", "utf8");
    const sha = sha256Hex(bytes);
    // another tenant wrote this sha under ITS prefix
    bucket.objects.set(s3KeyFor("ws_2", sha), bytes);
    const store = new GcsContentStore(bucket, "ws_1");
    expect(await store.get(sha)).toBeNull(); // ws_1's store never reaches ws_2's object
  });
});

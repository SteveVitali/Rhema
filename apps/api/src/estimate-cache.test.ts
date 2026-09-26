// DEF.2 (F6) — `SqlEstimateCacheStore` over PGlite: the real `estimate_cache` table (0002 + 0017),
// not a map-shaped double. Covers put/get round-trip, the upsert on the unique `cache_key`, and the
// provisional flag semantics the route's refined-vs-provisional short-circuit depends on.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createOrchestratorTestDb, type OrchestratorTestDb } from "@rhema/orchestrator/testing";
import { SqlEstimateCacheStore } from "./estimate-cache.js";

let db: OrchestratorTestDb;
let n = 0;
const ids = () => `ec_${++n}`;

beforeEach(async () => {
  db = await createOrchestratorTestDb();
});
afterEach(() => db.close());

describe("SqlEstimateCacheStore (F6; estimate_cache round-trip)", () => {
  it("returns null for an unknown key", async () => {
    const store = new SqlEstimateCacheStore(db.client, ids);
    expect(await store.get("missing")).toBeNull();
  });

  it("put→get round-trips a refined row (claim_count + provisional=false)", async () => {
    const store = new SqlEstimateCacheStore(db.client, ids);
    await store.put("sha1|review|standard|base||", {
      estimateCredits: 640,
      capCredits: 960,
      rateTableVersion: 1,
      claimCount: 45,
      provisional: false,
    });
    const got = await store.get("sha1|review|standard|base||");
    expect(got).toEqual({
      estimateCredits: 640,
      capCredits: 960,
      rateTableVersion: 1,
      claimCount: 45,
      provisional: false,
    });
  });

  it("round-trips a null claim count (claim-free workflows)", async () => {
    const store = new SqlEstimateCacheStore(db.client, ids);
    await store.put("k", {
      estimateCredits: 100,
      capCredits: 150,
      rateTableVersion: 1,
      claimCount: null,
      provisional: true,
    });
    const got = await store.get("k");
    expect(got?.claimCount).toBeNull();
    expect(got?.provisional).toBe(true);
  });

  it("re-put under the same cache_key upserts (a refine race collapses to one row)", async () => {
    const store = new SqlEstimateCacheStore(db.client, ids);
    await store.put("k", {
      estimateCredits: 100,
      capCredits: 150,
      rateTableVersion: 1,
      claimCount: 20,
      provisional: false,
    });
    await store.put("k", {
      estimateCredits: 200,
      capCredits: 300,
      rateTableVersion: 1,
      claimCount: 30,
      provisional: false,
    });
    expect(await store.get("k")).toMatchObject({ estimateCredits: 200, claimCount: 30 });
    const count = (await db.client.query("select count(*)::int n from estimate_cache where cache_key = 'k'"))
      .rows[0] as { n: number };
    expect(count.n).toBe(1);
  });
});

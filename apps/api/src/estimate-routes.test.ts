import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import {
  createEstimateRoutes,
  estimateCacheKey,
  type CachedEstimate,
  type EstimateCacheStore,
  type ClaimPrePass,
  type RunEstimatedEvent,
} from "./estimate-routes.js";
import type { Principal } from "./run-routes.js";

const principal: Principal = { userId: "u1", workspaceId: "w1", billingAccountId: "b1" };

class MemCache implements EstimateCacheStore {
  readonly rows = new Map<string, CachedEstimate>();
  async get(k: string): Promise<CachedEstimate | null> {
    return this.rows.get(k) ?? null;
  }
  async put(k: string, row: CachedEstimate): Promise<void> {
    this.rows.set(k, row);
  }
}

function makeApp(over: Parameters<typeof createEstimateRoutes>[0] = { principal: () => principal }): {
  app: Hono;
  events: { ctx: unknown; event: RunEstimatedEvent }[];
  cache: MemCache;
} {
  const events: { ctx: unknown; event: RunEstimatedEvent }[] = [];
  const cache = new MemCache();
  const app = createEstimateRoutes({
    principal: () => principal,
    estimateCache: cache,
    emitEstimated: (ctx, event) => events.push({ ctx, event }),
    ...over,
  });
  return { app, events, cache };
}

function post(app: Hono, projectId: string, body: unknown) {
  return app.request(`/projects/${projectId}/estimates`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const REVIEW = { workflow: "review", rigor: "standard", modelTier: "base", inputs: { words: 5180 }, draftSha: "sha1" } as const;

describe("POST /projects/:id/estimates (REQ-SPEC-16)", () => {
  let harness: ReturnType<typeof makeApp>;
  beforeEach(() => {
    harness = makeApp();
  });

  it("401 without a principal", async () => {
    const { app } = makeApp({ principal: () => null });
    const r = await post(app, "p1", REVIEW);
    expect(r.status).toBe(401);
  });

  // AC1 — returns immediately with the provisional figure (no pre-pass wait, Run button never blocked).
  it("returns the provisional figure immediately (no cache, no pre-pass)", async () => {
    const r = await post(harness.app, "p1", REVIEW);
    expect(r.status).toBe(200);
    const b = (await r.json()) as { estimateCredits: number; capCredits: number; provisional: boolean; claimCount?: number; levers: unknown };
    expect(b.provisional).toBe(true);
    expect(b.claimCount).toBe(21); // density-derived
    expect(b.capCredits).toBe(Math.ceil(b.estimateCredits * 1.5));
    expect(b.levers).toBeTruthy();
  });

  // AC5 — run.estimated fires from the estimate endpoint.
  it("emits run.estimated from the endpoint (never a runs row)", async () => {
    await post(harness.app, "p1", REVIEW);
    expect(harness.events).toHaveLength(1);
    expect(harness.events[0]!.event.kind).toBe("review");
    expect(harness.events[0]!.event.rigor).toBe("standard");
    expect(harness.events[0]!.event.estimate).toBeGreaterThan(0);
    expect(harness.events[0]!.event.cap).toBeGreaterThan(harness.events[0]!.event.estimate);
    expect(harness.events[0]!.event.levers_shown).toBe(true);
  });

  // AC1 — the pre-pass refines in place and is cached per (draft sha, workflow, rigor, tier).
  it("refines via the pre-pass and caches the refined figure", async () => {
    const prePass: ClaimPrePass = { count: async () => 45 };
    const { app, cache } = makeApp({ principal: () => principal, claimPrePass: prePass });
    // provisional first
    const p = (await (await post(app, "p1", REVIEW)).json()) as { estimateCredits: number; provisional: boolean };
    expect(p.provisional).toBe(true);
    // refine
    const r = (await (await post(app, "p1", { ...REVIEW, refine: true })).json()) as {
      estimateCredits: number;
      provisional: boolean;
      claimCount?: number;
    };
    expect(r.provisional).toBe(false);
    expect(r.claimCount).toBe(45);
    expect(r.estimateCredits).toBeGreaterThan(p.estimateCredits); // more claims found
    // cached under the tuple key
    const key = estimateCacheKey(REVIEW);
    const cached = await cache.get(key);
    expect(cached?.provisional).toBe(false);
    expect(cached?.claimCount).toBe(45);
  });

  it("a cached refined row short-circuits a later provisional call (COGS paid once per draft version)", async () => {
    const key = estimateCacheKey(REVIEW);
    await harness.cache.put(key, { estimateCredits: 999, capCredits: 1499, rateTableVersion: 1, claimCount: 77, provisional: false });
    const b = (await (await post(harness.app, "p1", REVIEW)).json()) as { estimateCredits: number; provisional: boolean; claimCount?: number };
    expect(b.provisional).toBe(false);
    expect(b.estimateCredits).toBe(999);
    expect(b.claimCount).toBe(77);
  });

  it("falls back to the provisional figure when the pre-pass exceeds the ≤5 s budget", async () => {
    const slow: ClaimPrePass = { count: () => new Promise<number>((res) => setTimeout(() => res(45), 50)) };
    const { app } = makeApp({ principal: () => principal, claimPrePass: slow, prePassBudgetMs: 5 });
    const b = (await (await post(app, "p1", { ...REVIEW, refine: true })).json()) as { provisional: boolean };
    expect(b.provisional).toBe(true); // budget elapsed → provisional, Run button never blocked
  });

  // AC6 — no wire field carries "tokens".
  it("no response field exposes 'tokens' (REQ-BILL-1)", async () => {
    const r = await post(harness.app, "p1", { ...REVIEW, rigor: "full_board", modelTier: "frontier", inputs: { words: 8000 } });
    const text = await r.text();
    expect(text).not.toMatch(/token/i);
  });

  it("400 on a missing workflow/rigor/tier", async () => {
    const r = await post(harness.app, "p1", { workflow: "review" });
    expect(r.status).toBe(400);
  });

  it("cacheKey encodes (draft sha, workflow, rigor, tier, variant)", () => {
    expect(estimateCacheKey({ draftSha: "s", workflow: "review", rigor: "quick", modelTier: "base" })).toBe("s|review|quick|base|");
    expect(estimateCacheKey({ workflow: "review", rigor: "quick", modelTier: "base", variant: "v" })).toBe("nosha|review|quick|base|v");
  });
});

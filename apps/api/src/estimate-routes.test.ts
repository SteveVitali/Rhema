import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { createOrchestratorTestDb, seedProject, type OrchestratorTestDb } from "@rhema/orchestrator/testing";
import {
  createEstimateRoutes,
  estimateCacheKey,
  type CachedEstimate,
  type EstimateCacheStore,
  type ClaimPrePass,
  type RunEstimatedEvent,
} from "./estimate-routes.js";
import { SqlEstimateCacheStore } from "./estimate-cache.js";
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

  it("cacheKey encodes (draft sha, workflow, rigor, tier, variant[, scope])", () => {
    expect(estimateCacheKey({ draftSha: "s", workflow: "review", rigor: "quick", modelTier: "base" })).toBe("s|review|quick|base||");
    expect(estimateCacheKey({ workflow: "review", rigor: "quick", modelTier: "base", variant: "v" })).toBe("nosha|review|quick|base|v|");
    // P1.06 — the scope is part of the key: a section-scoped estimate never reuses the whole-draft figure.
    expect(estimateCacheKey({ draftSha: "s", workflow: "review", rigor: "quick", modelTier: "base", scope: "section:III" })).toBe(
      "s|review|quick|base||section:III",
    );
  });
});

// ---- DEF.2 (F6) — live-binding surface + route hardening ------------------------------------------------

describe("F6 — principal attribution + the tenant guard", () => {
  it("passes the principal's workspace + billing account to the pre-pass (COGS attribution)", async () => {
    let seen: Parameters<ClaimPrePass["count"]>[0] | undefined;
    const prePass: ClaimPrePass = {
      count: async (a) => {
        seen = a;
        return 10;
      },
    };
    const { app } = makeApp({ claimPrePass: prePass });
    await post(app, "p1", { ...REVIEW, refine: true });
    expect(seen).toMatchObject({ projectId: "p1", workspaceId: "w1", billingAccountId: "b1", workflow: "review" });
  });

  it("404s a project outside the caller's workspace when db is bound (global-cache probe guard)", async () => {
    const db = { query: async () => ({ rows: [] }) }; // no row ⇒ not this tenant's project
    const { app } = makeApp({ db });
    const r = await post(app, "foreign_proj", REVIEW);
    expect(r.status).toBe(404);
    expect(((await r.json()) as { error: string }).error).toBe("not_found");
  });

  it("serves when the project belongs to the caller's workspace (the db-bound check passes)", async () => {
    const db = {
      query: async (_sql: string, params?: unknown[]) => ({
        rows: params?.[0] === "p1" && params?.[1] === "w1" ? [{ id: "p1" }] : [],
      }),
    };
    const { app } = makeApp({ db });
    const r = await post(app, "p1", REVIEW);
    expect(r.status).toBe(200);
  });
});

describe("F6 — the live estimate path over PGlite (refine → estimate_cache → short-circuit)", () => {
  let db: OrchestratorTestDb;
  const WS = "ws_est";
  const BA = "ba_est";
  const PROJ = "prj_est";
  const P = (): Principal => ({ userId: "u_est", workspaceId: WS, billingAccountId: BA });

  beforeEach(async () => {
    db = await createOrchestratorTestDb();
    await seedProject(db, { userId: "u_est", workspaceId: WS, billingAccountId: BA, projectId: PROJ });
  });
  afterEach(() => db.close());

  it("refine persists estimate_cache (provisional=false, claim_count set); repeats short-circuit; no runs row", async () => {
    const cache = new SqlEstimateCacheStore(db.client, () => `ec_${Math.random().toString(36).slice(2, 10)}`);
    let prePassCalls = 0;
    const events: RunEstimatedEvent[] = [];
    const app = createEstimateRoutes({
      principal: P,
      db: db.client,
      estimateCache: cache,
      claimPrePass: {
        count: async () => {
          prePassCalls += 1;
          return 45;
        },
      },
      emitEstimated: (_ctx, e) => events.push(e),
    });

    // 1. immediate → provisional, no pre-pass.
    const p = (await (await post(app, PROJ, REVIEW)).json()) as { provisional: boolean };
    expect(p.provisional).toBe(true);
    expect(prePassCalls).toBe(0);

    // 2. refine → refined figure persisted to the real estimate_cache row.
    const r = (await (await post(app, PROJ, { ...REVIEW, refine: true })).json()) as {
      provisional: boolean;
      claimCount?: number;
      estimateCredits: number;
      capCredits: number;
      rateTableVersion: number;
    };
    expect(r.provisional).toBe(false);
    expect(r.claimCount).toBe(45);
    expect(prePassCalls).toBe(1);
    const row = (
      await db.client.query(
        "select estimate_credits, cap_credits, rate_table_version, claim_count, provisional from estimate_cache where cache_key = $1",
        [estimateCacheKey(REVIEW)],
      )
    ).rows[0] as
      | { estimate_credits: number; cap_credits: number; rate_table_version: number; claim_count: number; provisional: boolean }
      | undefined;
    expect(row).toMatchObject({ claim_count: 45, provisional: false, estimate_credits: r.estimateCredits, cap_credits: r.capCredits });

    // 3. a repeat request short-circuits on the cached row — the pre-pass runs ONCE per draft version.
    const r2 = (await (await post(app, PROJ, { ...REVIEW, refine: true })).json()) as {
      provisional: boolean;
      claimCount?: number;
      estimateCredits: number;
    };
    expect(r2.provisional).toBe(false);
    expect(r2.claimCount).toBe(45);
    expect(r2.estimateCredits).toBe(r.estimateCredits);
    expect(prePassCalls).toBe(1);

    // 4. REQ-SPEC-16 — the estimate endpoint never creates a runs row; telemetry is the only record.
    const runs = (await db.client.query("select count(*)::int n from runs")).rows[0] as { n: number };
    expect(runs.n).toBe(0);
    expect(events).toHaveLength(3);
    expect(events.every((e) => e.kind === "review" && e.levers_shown)).toBe(true);
  });
});

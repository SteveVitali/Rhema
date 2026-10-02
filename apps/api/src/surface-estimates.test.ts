// EST.1 (REQ-SPEC-32(b); ADR-034) — the ONE-estimate contract, over the real app + PGlite: the
// protocol cards, the Timeline next-step chip, and the estimate route all serve the SAME
// `surfaceEstimate` figure for the same shape at the caller's resolved rigor/tier — the parity the
// 2026-09-30 design review found broken (PR-E1/E2/E3, the 10–20× cross-surface drift). The pricing
// page's figures come through the same `surfacePricer()` — asserted here against the estimate route,
// and at the composition level in `run-sheet/surface.test.ts`.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrchestratorTestDb,
  seedProject,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "@rhema/orchestrator/testing";
import { InMemoryContentStore } from "@rhema/mirror";
import { allowedModelTiers, buildPricingPageData } from "@rhema/contracts";
import { resolveSheetConfig, surfaceEstimate, surfacePricer } from "@rhema/run-sheet";
import { createApp, type Principal } from "./index.js";
import type { SqlClient } from "./invite.js";

let db: OrchestratorTestDb;
let deps: TestDeps;
let sql: SqlClient;
let seed: Awaited<ReturnType<typeof seedProject>>;
let app: ReturnType<typeof createApp>;

const principal = (): Principal => ({
  userId: seed.userId,
  workspaceId: seed.workspaceId,
  billingAccountId: seed.billingAccountId,
});

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  sql = { query: (q, p) => db.pg.query(q, p as unknown[]) as Promise<{ rows: unknown[] }> };
  // a draft-only project → the Timeline's suggested next step is a Review.
  seed = await seedProject(db, { draftN: 1 });
  app = createApp({ ...deps, principal: () => principal(), db: sql, store: new InMemoryContentStore() });
});
afterEach(() => db.close());

/** The caller's resolved config for the seeded fixture (studio_max: every tier; no prefs/defaults →
 *  Standard rigor, the §6.5 notch tier). Pinned literally so a resolution change is LOUD here. */
function resolvedFor(workflow: "review" | "revise" | "draft" = "review") {
  const r = resolveSheetConfig({ workflow, allowedModelTiers: allowedModelTiers("studio_max") });
  expect(r.rigor).toBe("standard");
  expect(r.modelTier).toBe("balanced"); // the §6.5 Standard notch — never rigor-derived post-EST.1
  expect(r.tierSource).toBe("notch");
  return r;
}

const cardRound = (n: number) => Math.round(n / 10) * 10;

describe("EST.1 — one estimate everywhere, over the wire (REQ-SPEC-32(b))", () => {
  it("GET /protocols: every card's figure IS surfaceEstimate at the caller's resolved rigor/tier", async () => {
    const res = await app.request("/protocols");
    expect(res.status).toBe(200);
    const { protocols } = (await res.json()) as {
      protocols: {
        id: string;
        typicalWords: number;
        typicalReviewCredits?: number;
        typicalReviewDuration?: { lowMinutes: number; highMinutes: number };
      }[];
    };
    expect(protocols.length).toBeGreaterThanOrEqual(4);
    const resolved = resolvedFor();
    for (const card of protocols) {
      const expected = surfaceEstimate({
        workflow: "review",
        rigor: resolved.rigor,
        modelTier: resolved.modelTier,
        inputs: { words: card.typicalWords },
      });
      expect(card.typicalReviewCredits, `card ${card.id} credits`).toBe(expected.estimateCredits);
      expect(card.typicalReviewDuration, `card ${card.id} duration`).toEqual(expected.duration);
    }
  });

  it("GET /projects/:id/timeline: the next-step chip IS the sheet's figure + duration", async () => {
    const res = await app.request(`/projects/${seed.projectId}/timeline`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      nextStep: {
        verb: string;
        estimateCredits: number | null;
        duration?: { lowMinutes: number; highMinutes: number };
      };
    };
    expect(body.nextStep.verb).toBe("review");
    // the seeded draft has no promoted version — the chip prices words=0 at the resolved config.
    const expected = surfaceEstimate({
      workflow: "review",
      rigor: resolvedFor().rigor,
      modelTier: resolvedFor().modelTier,
      inputs: { words: 0 },
    });
    expect(body.nextStep.estimateCredits).toBe(expected.estimateCredits);
    expect(body.nextStep.duration).toEqual(expected.duration);
  });

  it("POST /projects/:id/estimates: the route's figure + duration + why come from the same call", async () => {
    const res = await app.request(`/projects/${seed.projectId}/estimates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workflow: "review",
        rigor: "standard",
        modelTier: "balanced",
        inputs: { words: 1003 },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      estimateCredits: number;
      duration?: { lowMinutes: number; highMinutes: number };
      why?: { totalCredits: number; subtotalCredits: number };
    };
    const expected = surfaceEstimate({
      workflow: "review",
      rigor: "standard",
      modelTier: "balanced",
      inputs: { words: 1003 },
    });
    expect(body.estimateCredits).toBe(expected.estimateCredits);
    expect(body.duration).toEqual(expected.duration);
    expect(body.why?.totalCredits).toBe(body.estimateCredits); // "Why?" prints the SAME figure
  });

  it("protocol card ≡ estimate route ≡ pricing card, for the card's labelled shape", async () => {
    // the contract that closes PR-E1: pick a protocol card's typical size and drive it through all
    // three surfaces — the numbers must agree exactly (route/card) or to the card's 10-cr rounding
    // (pricing range).
    const res = await app.request("/protocols");
    const { protocols } = (await res.json()) as { protocols: { typicalWords: number }[] };
    const words = protocols[0]!.typicalWords;
    const resolved = resolvedFor();

    const route = await app.request(`/projects/${seed.projectId}/estimates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workflow: "review",
        rigor: "standard",
        modelTier: resolved.modelTier,
        inputs: { words },
      }),
    });
    const routeBody = (await route.json()) as { estimateCredits: number };
    const cardBody = (await (await app.request("/protocols")).json()) as {
      protocols: { typicalReviewCredits?: number }[];
    };
    expect(cardBody.protocols[0]!.typicalReviewCredits).toBe(routeBody.estimateCredits);

    // the pricing page's Review range brackets the route figure at BOTH ends of the tier sweep.
    const data = buildPricingPageData(undefined, surfacePricer());
    const essay = data.cards[0]!;
    const lo = await app.request(`/projects/${seed.projectId}/estimates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workflow: "review",
        rigor: "standard",
        modelTier: "base",
        inputs: { words: essay.words, claims: essay.claims },
      }),
    });
    const loBody = (await lo.json()) as { estimateCredits: number };
    const reviewRow = essay.rows.find((r) => r.key === "review")!;
    expect(reviewRow.range!.low).toBe(cardRound(loBody.estimateCredits));
  });
});

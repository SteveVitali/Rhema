// EST.1 (REQ-SPEC-32(b); ADR-034/035/036) — the ONE-estimate contract tests. These pin the shape the
// 2026-09-30 design review found broken (PR-E1/E2/E3): every pre-run surface derives from
// `surfaceEstimate`, the "Why this estimate?" block is arithmetically true, the rigor/tier default
// chain + plan clamp resolve in one place, and no surface carries a second price source.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  allowedModelTiers,
  durationPriorForPhases,
  MODEL_TIERS,
  RIGORS,
  buildPricingPageData,
  type WorkflowKey,
} from "@rhema/contracts";
import { buildEstimate } from "./estimate.js";
import { buildLeverMatrix, leverKey } from "./lever-matrix.js";
import {
  durationBandFor,
  durationCellKey,
  resolveSheetConfig,
  surfaceCreditRange,
  surfaceEstimate,
  surfacePricer,
} from "./surface.js";
import { activePhaseCount } from "./profiles.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");

// ---- fixture matrix (the incident's 1,003-word essay plus a small + a large shape) ---------------

const FIXTURES: { workflow: WorkflowKey; words: number }[] = [
  { workflow: "review", words: 1003 }, // the 2026-09-30 incident shape
  { workflow: "review", words: 300 }, // JOURNEY.1's paid-run fixture size
  { workflow: "review", words: 8000 }, // a book-chapter-scale review
  { workflow: "fact_check", words: 2500 },
  { workflow: "revise", words: 4000 },
];

describe("surfaceEstimate — one figure, every surface (REQ-SPEC-32(b))", () => {
  it("equals buildEstimate at every fixture × rigor × tier (the sheet IS the API)", () => {
    for (const f of FIXTURES) {
      for (const rigor of RIGORS) {
        for (const tier of MODEL_TIERS) {
          const args = { workflow: f.workflow, rigor, modelTier: tier, inputs: { words: f.words } } as const;
          const surface = surfaceEstimate(args);
          const direct = buildEstimate(args);
          expect(surface.estimateCredits).toBe(direct.estimateCredits);
          expect(surface.capCredits).toBe(direct.capCredits);
          expect(surface.rateTableVersion).toBe(direct.rateTableVersion);
        }
      }
    }
  });

  it("the lever matrix's cell for a state IS the surface figure for that state", () => {
    const m = buildLeverMatrix({
      workflow: "review",
      inputs: { words: 1003 },
      rigor: "standard",
      modelTier: "base",
    });
    for (const rigor of RIGORS) {
      for (const tier of MODEL_TIERS) {
        const cell = m.states[leverKey(rigor, tier, { fact_check: true, discourse: true, second_read: true })];
        expect(cell).toBeDefined();
        const surface = surfaceEstimate({
          workflow: "review",
          rigor,
          modelTier: tier,
          inputs: { words: 1003 },
          toggles: { fact_check: true, discourse: true, second_read: true },
        });
        expect(cell!.estimateCredits).toBe(surface.estimateCredits);
        expect(cell!.capCredits).toBe(surface.capCredits);
        expect(cell!.time).toEqual(surface.duration);
      }
    }
  });
});

describe('"Why this estimate?" — the decomposition adds up (REQ-BILL-5)', () => {
  it("Σ terms × Π factors ceils to the printed estimate at every rigor × tier", () => {
    for (const f of FIXTURES) {
      for (const rigor of RIGORS) {
        for (const tier of MODEL_TIERS) {
          const s = surfaceEstimate({ workflow: f.workflow, rigor, modelTier: tier, inputs: { words: f.words } });
          // every term's credits IS quantity × rate — the incident's "4 × 40 ≈ 440" shape is impossible.
          for (const t of s.why.terms) {
            if (t.quantity != null) expect(t.credits).toBeCloseTo(t.quantity * t.rateCredits, 9);
          }
          const termSum = s.why.terms.reduce((a, t) => a + t.credits, 0);
          expect(termSum).toBeCloseTo(s.why.subtotalCredits, 9);
          const exact = s.why.factors.reduce((v, fac) => v * fac.multiplier, s.why.subtotalCredits);
          expect(exact).toBeCloseTo(s.why.exactCredits, 9);
          expect(Math.ceil(s.why.exactCredits)).toBe(s.why.totalCredits);
          expect(s.why.totalCredits).toBe(s.estimateCredits);
        }
      }
    }
  });
});

describe("durations — one band vocabulary (PR-E3; REQ-SPEC-32(b))", () => {
  it("a calibrated cell covers its bucket; an uncovered bucket takes the shared per-phase prior", () => {
    const durations = { [durationCellKey("standard", "base")]: { lowMinutes: 9, highMinutes: 15 } };
    expect(
      durationBandFor({ workflow: "review", rigor: "standard", modelTier: "base", durations }),
    ).toEqual({ lowMinutes: 9, highMinutes: 15 });
    expect(
      durationBandFor({ workflow: "review", rigor: "standard", modelTier: "frontier", durations }),
    ).toEqual(
      durationPriorForPhases(
        activePhaseCount("review", { fact_check: true, discourse: true, second_read: true })!,
      ),
    );
  });

  it("the band is a well-formed range at every rigor × tier (low ≥ 1, high > low)", () => {
    for (const rigor of RIGORS) {
      for (const tier of MODEL_TIERS) {
        const d = durationBandFor({ workflow: "review", rigor, modelTier: tier });
        expect(d.lowMinutes).toBeGreaterThanOrEqual(1);
        expect(d.highMinutes).toBeGreaterThan(d.lowMinutes);
      }
    }
  });
});

describe("resolveSheetConfig — the tier default chain + plan clamp (ADR-035; REQ-IDE-13, BL-58)", () => {
  it("explicit → project → account → notch, in that order", () => {
    const r = resolveSheetConfig({
      workflow: "review",
      modelTier: "frontier",
      projectModelTierDefault: "balanced",
      prefs: { defaultModelTier: "base" },
    });
    expect(r.modelTier).toBe("frontier");
    expect(r.tierSource).toBe("explicit");

    const p = resolveSheetConfig({
      workflow: "review",
      projectModelTierDefault: "balanced",
      prefs: { defaultModelTier: "base" },
    });
    expect(p.modelTier).toBe("balanced");
    expect(p.tierSource).toBe("project");

    const a = resolveSheetConfig({ workflow: "review", prefs: { defaultModelTier: "base" } });
    expect(a.modelTier).toBe("base");
    expect(a.tierSource).toBe("account");

    const n = resolveSheetConfig({ workflow: "review", rigor: "quick" });
    expect(n.tierSource).toBe("notch");
    expect(n.modelTier).toBe("base"); // §6.5's quick column is Base
  });

  it("clamps a disallowed tier and records the requested value for the notice", () => {
    const r = resolveSheetConfig({
      workflow: "review",
      modelTier: "frontier",
      allowedModelTiers: allowedModelTiers("free"),
    });
    expect(r.modelTier).toBe("base");
    expect(r.requestedModelTier).toBe("frontier");
    expect(r.allowedModelTiers).toEqual(["base"]);
  });

  it("a mid-tier allowlist clamps Frontier to the nearest permitted tier", () => {
    const r = resolveSheetConfig({
      workflow: "review",
      modelTier: "frontier",
      allowedModelTiers: ["base", "balanced"],
    });
    expect(r.modelTier).toBe("balanced");
    expect(r.requestedModelTier).toBe("frontier");
  });
});

describe("marketing figures — the pricing page rides the same pricer (REQ-GROWTH-4/6/9)", () => {
  it("surfacePricer returns surfaceEstimate's figure for the same shape", () => {
    const pricer = surfacePricer();
    const direct = surfaceEstimate({
      workflow: "review",
      rigor: "standard",
      modelTier: "balanced",
      inputs: { words: 1003 },
    }).estimateCredits;
    expect(
      pricer.estimate({ workflow: "review", rigor: "standard", modelTier: "balanced", inputs: { words: 1003 } }),
    ).toBe(direct);
  });

  it("a cost card's Base..Frontier range brackets the surface estimate at its labelled size", () => {
    const data = buildPricingPageData(undefined, surfacePricer());
    for (const card of data.cards) {
      const range = surfaceCreditRange({
        workflow: "review",
        rigor: "standard",
        inputs: { words: card.words, claims: card.claims },
      });
      const reviewRow = card.rows.find((r) => r.key === "review");
      if (reviewRow?.range != null && range != null) {
        expect(reviewRow.range.low).toBeLessThanOrEqual(range.high);
        expect(reviewRow.range.high).toBeGreaterThanOrEqual(range.low);
      }
    }
  });
});

// ---- static drift guards — a surface that bypasses the API or re-derives a duration fails CI ------

describe("static drift guard (REQ-SPEC-32(b), REQ-GROWTH-4)", () => {
  // Surfaces that render a pre-run figure MUST go through the surface API — never a raw
  // `buildEstimate(` call and never the retired `costCardTerms` modelled pricer.
  const SURFACE_FILES = [
    "apps/web/src/server.ts",
    "apps/web/src/marketing.tsx",
    "apps/web/src/pages.tsx",
    "apps/api/src/timeline-routes.ts",
    "apps/api/src/project-routes.ts",
    "apps/api/src/sheet-context.ts",
    "packages/ide/src/palette.ts",
    "packages/ui/src/run-sheet.tsx",
    "packages/ui/src/timeline.tsx",
  ];
  for (const rel of SURFACE_FILES) {
    it(`${rel} carries no direct buildEstimate( / costCardTerms( call`, () => {
      const src = readFileSync(resolve(REPO, rel), "utf8");
      expect(src, `${rel} calls buildEstimate directly`).not.toMatch(/buildEstimate\s*\(/);
      expect(src, `${rel} carries the retired modelled pricer`).not.toMatch(/costCardTerms/);
    });
  }

  it("no surface still derives duration from credits (the credits/25 derivation is gone)", () => {
    for (const rel of ["apps/web/src/server.ts", "packages/ui/src/run-sheet.tsx", "packages/ui/src/timeline.tsx"]) {
      const src = readFileSync(resolve(REPO, rel), "utf8");
      expect(src, `${rel} derives minutes from credits`).not.toMatch(/credits\s*\/\s*(25|15|2[0-9])/);
    }
  });

  it("the §5.6 mock figure is gone from the sheet path (no 5180 fallback)", () => {
    const src = readFileSync(resolve(REPO, "apps/web/src/server.ts"), "utf8");
    expect(src).not.toMatch(/\|\|\s*5180/);
  });
});

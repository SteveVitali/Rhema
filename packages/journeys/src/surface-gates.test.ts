import { describe, expect, it } from "vitest";
import { SPA_SURFACES } from "@rhema/contracts";
import { STEP_REGISTRY, stepById } from "./registry.js";
import { ALL_IMPLS } from "./impls.js";
import { SURFACE_GATES, stepsForSurfaces } from "./surface-gates.js";

// SPA.6 — the flip-gate schema (REQ-VFY-8/10, REQ-SEQ-7; design/27 F9; design/29 §flip-order).
// These are the removal-catching tests: drop a step from a gate, point a gate at a paid step or
// a nonexistent id, add a surface key the vocabulary doesn't know — one of these fails.

describe("SURFACE_GATES — the surface ⇄ step-set bijection (REQ-VFY-8)", () => {
  it("covers every canonical surface key — the map is total over SPA_SURFACES", () => {
    expect(Object.keys(SURFACE_GATES).sort()).toEqual([...SPA_SURFACES].sort());
    for (const key of SPA_SURFACES) {
      expect(SURFACE_GATES[key].flag, key).toBe(key); // flag key === map key, verbatim
    }
  });

  it("names no surface outside the canonical vocabulary (the Record type enforces; belt)", () => {
    for (const key of Object.keys(SURFACE_GATES)) {
      expect(SPA_SURFACES as readonly string[], key).toContain(key);
    }
  });

  it("every gated step exists in STEP_REGISTRY with a wired implementation", () => {
    for (const [key, g] of Object.entries(SURFACE_GATES)) {
      for (const id of g.steps) {
        expect(stepById(id), `${key} → ${id}`).toBeDefined();
        expect(ALL_IMPLS[id], `impl for ${key} → ${id}`).toBeTypeOf("function");
      }
      for (const id of g.weeklyHolds) {
        expect(stepById(id), `${key} weeklyHold ${id}`).toBeDefined();
      }
    }
  });

  it("no gated step is paid — REQ-VFY-10 forbids spend inside a flip gate (weeklyHolds carry them)", () => {
    for (const [key, g] of Object.entries(SURFACE_GATES)) {
      for (const id of g.steps) {
        expect(stepById(id)?.paid, `${key} → ${id} is paid`).toBe(false);
      }
      for (const id of g.weeklyHolds) {
        expect(stepById(id)?.paid, `${key} weeklyHold ${id} should be the PAID leg`).toBe(true);
      }
    }
  });

  it("every legNotes key names a gated step (a leg note on an ungated step is a schema bug)", () => {
    for (const [key, g] of Object.entries(SURFACE_GATES)) {
      for (const noteKey of Object.keys(g.legNotes)) {
        expect(g.steps, `${key}.legNotes.${noteKey}`).toContain(noteKey);
      }
    }
  });

  it("a gate's step list never duplicates an id (a dupe would double-run the leg)", () => {
    for (const [key, g] of Object.entries(SURFACE_GATES)) {
      expect(new Set(g.steps).size, key).toBe(g.steps.length);
    }
  });

  it("an `owed`-annotated surface still names free gated steps or refuses in stepsForSurfaces", () => {
    for (const [key, g] of Object.entries(SURFACE_GATES)) {
      if (g.steps.length === 0) {
        expect(g.owed.length, `${key} gate is empty without an owed note`).toBeGreaterThan(0);
      }
    }
  });
});

describe("stepsForSurfaces — the --surface selector", () => {
  it("returns the union in registry order, deduplicated", () => {
    const ids = stepsForSurfaces(["inbox", "settings"]);
    const order = STEP_REGISTRY.map((s) => s.id);
    expect([...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual([...ids]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [...SURFACE_GATES.inbox.steps, ...SURFACE_GATES.settings.steps]) {
      expect(ids).toContain(id);
    }
  });

  it("selects only the surface's subset — --surface usage yields exactly X1.usage", () => {
    expect(stepsForSurfaces(["usage"])).toEqual(["X1.usage"]);
  });

  it("refuses a surface whose gate is still empty — a vacuous run is never a gate", () => {
    expect(() => stepsForSurfaces(["outline"])).toThrow(/--surface: no gated steps/);
    expect(() => stepsForSurfaces(["run-report"])).toThrow(/--surface: no gated steps/);
    // …and the refusal names the owed coverage so the operator sees what unblocks it.
    expect(() => stepsForSurfaces(["outline"])).toThrow(/owed:/);
  });

  it("the union of every non-empty gate is a paid:false subset of the registry", () => {
    const nonEmpty = SPA_SURFACES.filter((k) => SURFACE_GATES[k].steps.length > 0);
    const ids = stepsForSurfaces(nonEmpty);
    for (const id of ids) {
      expect(stepById(id)?.paid, id).toBe(false);
    }
  });
});

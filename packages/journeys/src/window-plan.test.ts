// R5ECON.3 (REQ-FND-6/8, REQ-ECON-9) — the funded-window regime's pure surface: the census
// classes, the §5.5 checklist ordering, the dispatch plan (cap presence + summed headroom),
// and the checklist evaluator the `--dry-run` prints.

import { describe, expect, it } from "vitest";
import { STEP_REGISTRY, stepById, type JourneyStep } from "./registry.js";
import {
  CITE_PROBE_CAP_USD,
  FUNDED_WINDOW_CAP_USD,
  LEG_CAP_FLOOR_USD,
  WINDOW_CONDITIONAL_ID,
  WINDOW_PRESTEP_ID,
  WINDOW_RIDER_IDS,
  optOutPinsHonored,
  orderWindowSteps,
  planWindowDispatch,
  windowChecklist,
  windowClassOf,
  type WindowChecklistInput,
} from "./window-plan.js";

const step = (id: string) => stepById(id)!;

describe("the window regime constants", () => {
  it("carry the ratified figures verbatim", () => {
    expect(FUNDED_WINDOW_CAP_USD).toBe(60); // ratified Q-ECON.f — the re-authorized envelope
    expect(CITE_PROBE_CAP_USD).toBe(9); // §5.3 — the non-registry probe legs
    expect(LEG_CAP_FLOOR_USD).toBe(0.5); // §5.3 — the declared-cap floor
    expect(WINDOW_PRESTEP_ID).toBe("T9");
    expect(WINDOW_CONDITIONAL_ID).toBe("B19C");
    expect(WINDOW_RIDER_IDS).toEqual(["T10", "T11", "T12", "T13", "T14", "T15", "T16", "R9"]);
  });
});

describe("windowClassOf — the census spend classes", () => {
  it("classifies the 21 paid steps into prestep/launcher/rider/conditional", () => {
    expect(windowClassOf(step("T9"))).toBe("prestep");
    for (const id of ["N5", "N6", "N11", "R4", "R6", "B16", "B17", "B18A", "B18B", "B19A", "B19B"]) {
      expect(windowClassOf(step(id)), id).toBe("launcher");
    }
    for (const id of WINDOW_RIDER_IDS) {
      expect(windowClassOf(step(id)), id).toBe("rider");
    }
    expect(windowClassOf(step("B19C"))).toBe("conditional");
    expect(windowClassOf(step("N2"))).toBe("free"); // paid:false ⇒ the ordering never touches it
  });
});

describe("orderWindowSteps — §5.5 ordering", () => {
  it("orders a scrambled selection T9 → launchers → riders → B19C last", () => {
    const ordered = orderWindowSteps([
      step("B19C"), step("R9"), step("B19A"), step("T15"), step("N5"), step("T9"), step("N2"),
    ]);
    // riders keep registry order within their class (R9 sits in the R-block ahead of the T-rows).
    expect(ordered.map((s) => s.id)).toEqual(["N2", "T9", "N5", "B19A", "R9", "T15", "B19C"]);
  });
  it("the full registry orders every launcher before every rider and B19C dead last", () => {
    const ids = orderWindowSteps(STEP_REGISTRY).map((s) => s.id);
    expect(ids.indexOf("T9")).toBeLessThan(ids.indexOf("N5"));
    expect(ids.indexOf("B19C")).toBeGreaterThan(ids.indexOf("R9"));
    expect(ids.indexOf("B19C")).toBeGreaterThan(ids.indexOf("T16"));
    expect(ids.at(-1)).toBe("B19C"); // dead last — launchers AND riders precede it
  });
});

describe("planWindowDispatch — cap presence + headroom", () => {
  it("sums the selected paid legs' declared caps as the required headroom", () => {
    const plan = planWindowDispatch([step("N5"), step("R9"), step("T9")]);
    expect(plan.missingCaps).toEqual([]);
    expect(plan.requiredHeadroomUsd).toBeCloseTo(9 + 0.5 + 0.5);
    expect(plan.paid.map((s) => s.id)).toEqual(["T9", "N5", "R9"]);
  });
  it("names every selected paid step carrying no cap — the dispatch refusal set", () => {
    const uncapped = { ...step("N5"), capUsd: undefined } as JourneyStep;
    const plan = planWindowDispatch([uncapped, step("R9")]);
    expect(plan.missingCaps).toEqual(["N5"]);
  });
  it("the full paid registry asks ≈$54.5 — inside the $60 envelope", () => {
    const plan = planWindowDispatch(STEP_REGISTRY);
    expect(plan.missingCaps).toEqual([]);
    expect(plan.requiredHeadroomUsd).toBeCloseTo(54.5);
    expect(plan.requiredHeadroomUsd).toBeLessThanOrEqual(FUNDED_WINDOW_CAP_USD);
  });
});

describe("windowChecklist — the §5.5 rows, fail-closed", () => {
  const plan = planWindowDispatch(STEP_REGISTRY);
  const base: WindowChecklistInput = {
    dsnBound: true,
    systemRoleBypass: true,
    cumulativeUsd: 12.34,
    cumulativeRows: 400,
    roundCapUsd: FUNDED_WINDOW_CAP_USD,
    roundSince: "2026-10-01",
    headroomUsd: 60,
    plan,
    capEnforcementLive: true,
    fundedStableTag: "a",
    fundedTenant: { exists: true, isTest: true, ageHours: 4, purgeHours: 26 },
    seedExclusionsLive: true,
    optOutPinsHonored: optOutPinsHonored(),
    paused: { paused: false },
  };
  const ids = (rows: ReturnType<typeof windowChecklist>) => rows.map((r) => r.id);

  it("a fully-openable window prints nine pass rows in the §5.5 order", () => {
    const rows = windowChecklist(base);
    expect(ids(rows)).toEqual([
      "dsn", "cumulative", "headroom", "caps", "ordering", "tenant", "exclusions", "optouts", "unpaused",
    ]);
    expect(rows.every((r) => r.status === "pass"), JSON.stringify(rows)).toBe(true);
  });
  it("an unmeasurable meter fails closed — never a silent pass", () => {
    const rows = windowChecklist({ ...base, dsnBound: false, systemRoleBypass: null, cumulativeUsd: null });
    expect(rows.find((r) => r.id === "dsn")?.status).toBe("fail");
    expect(rows.find((r) => r.id === "cumulative")?.status).toBe("fail");
  });
  it("cumulative ≥ the round cap fails the envelope row", () => {
    const rows = windowChecklist({ ...base, cumulativeUsd: 61 });
    expect(rows.find((r) => r.id === "cumulative")?.status).toBe("fail");
  });
  it("absent or insufficient headroom fails the headroom row against the summed caps", () => {
    expect(windowChecklist({ ...base, headroomUsd: null }).find((r) => r.id === "headroom")?.status).toBe("fail");
    expect(windowChecklist({ ...base, headroomUsd: 10 }).find((r) => r.id === "headroom")?.status).toBe("fail");
    expect(windowChecklist({ ...base, headroomUsd: 55 }).find((r) => r.id === "headroom")?.status).toBe("pass");
  });
  it("an uncapped selected leg fails the caps row", () => {
    const bad = planWindowDispatch([{ ...step("N5"), capUsd: undefined } as JourneyStep]);
    const rows = windowChecklist({ ...base, plan: bad, headroomUsd: 10 });
    expect(rows.find((r) => r.id === "caps")?.status).toBe("fail");
  });
  it("the ordering row fails on an out-of-order plan and reports the sequence", () => {
    const bad = { ...plan, ordered: [step("R9"), step("T9"), step("N5")] };
    const rows = windowChecklist({ ...base, plan: bad });
    const row = rows.find((r) => r.id === "ordering");
    expect(row?.status).toBe("fail");
    expect(row?.detail).toContain("R9 → T9 → N5");
  });
  it("the tenant row fails on a missing, unflagged, or purge-stale tenant", () => {
    expect(
      windowChecklist({ ...base, fundedStableTag: null }).find((r) => r.id === "tenant")?.status,
    ).toBe("fail");
    for (const t of [
      { exists: false, isTest: false, ageHours: null, purgeHours: 26 },
      { exists: true, isTest: false, ageHours: 4, purgeHours: 26 },
      { exists: true, isTest: true, ageHours: 30, purgeHours: 26 },
    ]) {
      expect(
        windowChecklist({ ...base, fundedTenant: t }).find((r) => r.id === "tenant")?.status,
        JSON.stringify(t),
      ).toBe("fail");
    }
  });
  it("the exclusions, opt-outs, and pause rows carry their own verdicts", () => {
    expect(
      windowChecklist({ ...base, seedExclusionsLive: false }).find((r) => r.id === "exclusions")?.status,
    ).toBe("fail");
    expect(
      windowChecklist({ ...base, optOutPinsHonored: false }).find((r) => r.id === "optouts")?.status,
    ).toBe("fail");
    const paused = windowChecklist({ ...base, paused: { paused: true, detail: "B18A over" } });
    expect(paused.find((r) => r.id === "unpaused")?.status).toBe("fail");
  });
});

describe("optOutPinsHonored (REQ-ECON-11 on the registry)", () => {
  it("is true iff B19C/N6/R4 all pin testCheapRoute:false", () => {
    expect(optOutPinsHonored()).toBe(true); // the registry pins are asserted in registry.test.ts
  });
});

import { describe, expect, it } from "vitest";
import { SPA_SURFACES } from "@rhema/contracts";
import { STEP_REGISTRY } from "./registry.js";
import { SURFACE_GATES } from "./surface-gates.js";
import {
  gateEcho,
  gatedStepIds,
  paidDispatchPreflight,
  parseRendererFlag,
  parseSurfaces,
  parseUsdFlag,
} from "./cli-flags.js";

// SPA.6 — the leg-contract flag validation (REQ-VFY-7/8/10, REQ-SEQ-4). Removal-catching: every
// refusal is an asserted error string, not a silent default. SPA.28 — `--pin-renderer` +
// `isProdTarget` retired with `x-rhema-renderer`: the CLI refuses the retired flag in cli.ts
// outright, so nothing here may parse or prod-gate a pin any more.

describe("parseRendererFlag (--expect-renderer)", () => {
  it("accepts only ssr|spa; anything else is an error naming the flag", () => {
    expect(parseRendererFlag("ssr", "--expect-renderer")).toEqual({ value: "ssr" });
    expect(parseRendererFlag("spa", "--expect-renderer")).toEqual({ value: "spa" });
    expect(parseRendererFlag(undefined, "--expect-renderer")).toEqual({});
    for (const bad of ["SSR", "both", "", "server", "1"]) {
      const r = parseRendererFlag(bad, "--expect-renderer");
      expect(r.error, bad).toContain("--expect-renderer must be ssr|spa");
    }
  });
});

describe("the retired flag machinery (SPA.28 removal-detecting)", () => {
  it("isProdTarget is gone from the flag module — nothing gates a pin on prod anymore", async () => {
    const mod = await import("./cli-flags.js");
    expect("isProdTarget" in mod).toBe(false);
  });
});

describe("parseSurfaces (--surface)", () => {
  it("accepts canonical keys and CSV lists", () => {
    expect(parseSurfaces("usage")).toEqual({ surfaces: ["usage"] });
    expect(parseSurfaces("usage, inbox ,editor")).toEqual({ surfaces: ["usage", "inbox", "editor"] });
    expect(parseSurfaces(undefined)).toEqual({});
  });
  it("rejects unknown keys with the known-vocabulary list", () => {
    const r = parseSurfaces("usage,bogus-surface");
    expect(r.error).toContain('unknown key "bogus-surface"');
    expect(r.error).toContain(SPA_SURFACES[0]!);
    expect(parseSurfaces(" PROJECT-HOME ").error).toContain("PROJECT-HOME"); // case-sensitive
  });
});

describe("gatedStepIds — the surface gate resolution", () => {
  const paid = (id: string) => STEP_REGISTRY.find((s) => s.id === id)?.paid;

  it("resolves the gate subset (usage → exactly X1.usage)", () => {
    expect(gatedStepIds(["usage"], paid)).toEqual({ ids: new Set(["X1.usage"]) });
  });
  it("resolves the run-report gate to its SPA.22 subset (R6F)", () => {
    expect(gatedStepIds(["run-report"], paid)).toEqual({ ids: new Set(["R6F"]) });
  });
  it("refuses a surface whose gate resolves to zero steps — vacuous is never a gate", () => {
    // SPA.22's R6F filled the manifest's last empty gate, so no real `SpaSurface` key can reach
    // the refusal arm anymore — stub `run-report`'s steps empty to prove the belt still refuses
    // loudly (surface-gates.test.ts guards any future owed-only row structurally).
    const gate = SURFACE_GATES["run-report"] as { steps: readonly string[] };
    const orig = gate.steps;
    gate.steps = [];
    try {
      const r = gatedStepIds(["run-report"], paid);
      expect(r.error).toContain("no gated steps");
      expect(r.error).toContain("owed:");
    } finally {
      gate.steps = orig;
    }
  });
  it("resolves the outline gate to its SPA.18 subset (P1.outline)", () => {
    expect(gatedStepIds(["outline"], paid)).toEqual({ ids: new Set(["P1.outline"]) });
  });
  it("resolves the figures gate to its SPA.19 subset (P1.figures)", () => {
    expect(gatedStepIds(["figures"], paid)).toEqual({ ids: new Set(["P1.figures"]) });
  });
  it("refuses when a gate resolves a paid step — REQ-VFY-10's runtime belt", () => {
    // the schema test keeps this unreachable with the real registry; inject one to prove the gate.
    const r = gatedStepIds(["usage"], () => true);
    expect(r.error).toContain("REQ-VFY-10");
  });
  it("gateEcho names the steps and the owed coverage", () => {
    expect(gateEcho("usage")).toContain("gate X1.usage");
    expect(gateEcho("outline")).toContain("owed:");
    expect(gateEcho("dossier")).toContain("weekly-holds: T10,T11,T12,T13");
  });
});

// ---------------------------------------------------------------------------
// R5ECON.1 (REQ-ECON-8/9) — the paid-dispatch posture: fail closed for operator runs; the
// scheduled self-bounding cron alone keeps the no-db attestation.

describe("parseUsdFlag (--headroom)", () => {
  it("accepts a positive USD figure; unset stays unset; non-positive is a misuse", () => {
    expect(parseUsdFlag(undefined, "--headroom")).toEqual({});
    expect(parseUsdFlag("3", "--headroom")).toEqual({ value: 3 });
    expect(parseUsdFlag("0.5", "--headroom")).toEqual({ value: 0.5 });
    for (const bad of ["0", "-1", "abc", ""]) {
      expect(parseUsdFlag(bad, "--headroom").error, bad).toContain("--headroom must be a positive USD figure");
    }
  });
});

describe("paidDispatchPreflight (REQ-ECON-8/9)", () => {
  const bound = { paid: true, systemDsnBound: true, scheduledCron: false, headroomUsd: 4 };

  it("operator --paid without the system DSN refuses, naming REQ-ECON-8 + the cron exception", () => {
    const r = paidDispatchPreflight({ ...bound, systemDsnBound: false });
    expect(r.exitCode).toBe(3);
    expect(r.error).toContain("JOURNEY_DATABASE_URL");
    expect(r.error).toContain("REQ-ECON-8");
    expect(r.error).toContain("schedule");
  });
  it("--paid without --headroom refuses, naming REQ-ECON-9 — on the cron too (it passes --headroom explicitly)", () => {
    const operator = paidDispatchPreflight({ ...bound, headroomUsd: undefined });
    expect(operator.exitCode).toBe(3);
    expect(operator.error).toContain("--headroom");
    expect(operator.error).toContain("REQ-ECON-9");
    const cron = paidDispatchPreflight({ paid: true, systemDsnBound: false, scheduledCron: true, headroomUsd: undefined });
    expect(cron.exitCode).toBe(3);
    expect(cron.error).toContain("REQ-ECON-9");
  });
  it("the scheduled cron keeps the no-db attestation (DSN absent is fine when the headroom is declared)", () => {
    expect(
      paidDispatchPreflight({ paid: true, systemDsnBound: false, scheduledCron: true, headroomUsd: 3 }),
    ).toEqual({});
  });
  it("a fully-bound operator dispatch passes", () => {
    expect(paidDispatchPreflight(bound)).toEqual({});
  });
  it("a $0 run carries no posture requirement", () => {
    expect(
      paidDispatchPreflight({ paid: false, systemDsnBound: false, scheduledCron: false, headroomUsd: undefined }),
    ).toEqual({});
  });
});

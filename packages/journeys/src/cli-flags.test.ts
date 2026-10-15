import { describe, expect, it } from "vitest";
import { SPA_SURFACES } from "@rhema/contracts";
import { STEP_REGISTRY } from "./registry.js";
import {
  gateEcho,
  gatedStepIds,
  isProdTarget,
  parseRendererFlag,
  parseSurfaces,
} from "./cli-flags.js";

// SPA.6 — the leg-contract flag validation (REQ-VFY-7/8/10, REQ-SEQ-4). Removal-catching: every
// refusal is an asserted error string, not a silent default.

describe("parseRendererFlag (--expect-renderer / --pin-renderer)", () => {
  it("accepts only ssr|spa; anything else is an error naming the flag", () => {
    expect(parseRendererFlag("ssr", "--expect-renderer")).toEqual({ value: "ssr" });
    expect(parseRendererFlag("spa", "--expect-renderer")).toEqual({ value: "spa" });
    expect(parseRendererFlag(undefined, "--expect-renderer")).toEqual({});
    for (const bad of ["SSR", "both", "", "server", "1"]) {
      const r = parseRendererFlag(bad, "--pin-renderer");
      expect(r.error, bad).toContain("--pin-renderer must be ssr|spa");
    }
  });
});

describe("isProdTarget (the force-SPA refusal)", () => {
  it("is true for --stage prod and any *.rhema.tools host", () => {
    expect(isProdTarget("prod", "https://rhema.tools")).toBe(true);
    expect(isProdTarget(undefined, "https://rhema.tools")).toBe(true);
    expect(isProdTarget(undefined, "https://www.rhema.tools")).toBe(true);
  });
  it("is false for previews, dev, and localhost", () => {
    expect(isProdTarget("pr-123", "https://pr-123.rhema.example.dev")).toBe(false);
    expect(isProdTarget("dev", "https://dev.example.dev")).toBe(false);
    expect(isProdTarget(undefined, "http://localhost:3000")).toBe(false);
    expect(isProdTarget(undefined, "not a url")).toBe(false);
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
  it("refuses a surface whose gate is still empty (vacuous is never a gate)", () => {
    const r = gatedStepIds(["figures"], paid);
    expect(r.error).toContain("no gated steps");
    expect(r.error).toContain("owed:");
  });
  it("resolves the outline gate to its SPA.18 subset (P1.outline)", () => {
    expect(gatedStepIds(["outline"], paid)).toEqual({ ids: new Set(["P1.outline"]) });
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

import { describe, it, expect } from "vitest";
import { ESSAY_PROTOCOL } from "./protocols.js";
import {
  validateInputSources,
  assertClosedInputSources,
  enumerateProtocolInputSources,
  ALLOWED_INPUT_SOURCES,
} from "./input-sources.js";

// P0.03 AC8 — a planted disposition-derived parameter in a protocol config fails the input-source
// enumeration (REQ-OBJ-11). The Editor→config feedback loop is the firewall.

describe("closed input-source schema (REQ-OBJ-11)", () => {
  it("the Essay protocol declares only allowed sources", () => {
    const { ok, violations } = validateInputSources(enumerateProtocolInputSources(ESSAY_PROTOCOL));
    expect(ok).toBe(true);
    expect(violations).toEqual([]);
    expect(() => assertClosedInputSources(ESSAY_PROTOCOL)).not.toThrow();
    for (const s of ESSAY_PROTOCOL.inputSources) expect(ALLOWED_INPUT_SOURCES).toContain(s);
  });

  it("AC8 — a planted disposition-derived parameter fails the enumeration", () => {
    const planted = { ...ESSAY_PROTOCOL, inputSources: [...ESSAY_PROTOCOL.inputSources, "disposition"] };
    const { ok, violations } = validateInputSources(planted.inputSources);
    expect(ok).toBe(false);
    expect(violations.map((v) => v.source)).toContain("disposition");
    expect(violations.find((v) => v.source === "disposition")!.reason).toMatch(/disposition/i);
    expect(() => assertClosedInputSources(planted)).toThrow(/disposition/);
  });

  it("rejects every Editor-output → config feedback source, and any unknown source", () => {
    for (const bad of ["editor_output", "review_finding", "severity_feedback", "rubric_reception", "made_up_source"]) {
      expect(validateInputSources([bad]).ok).toBe(false);
    }
  });
});

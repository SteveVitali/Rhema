import { describe, it, expect } from "vitest";
import { findMarkers, DEFAULT_MARKERS } from "./protocol-markers.mjs";

describe("findMarkers", () => {
  it("finds protocol markers in a leaked bundle (AC/public-safe)", () => {
    const leaked = `window.__x = "prelude RHEMA-PROTOCOL-SECRET rubric";`;
    expect(findMarkers(leaked)).toContain("RHEMA-PROTOCOL-SECRET");
  });

  it("returns nothing for a clean public bundle", () => {
    expect(findMarkers(`export const x = 1; // ordinary client code`)).toEqual([]);
  });

  it("detects each default marker", () => {
    for (const m of DEFAULT_MARKERS) {
      expect(findMarkers(`a ${m} b`)).toContain(m);
    }
  });

  it("handles empty/non-string input", () => {
    expect(findMarkers("")).toEqual([]);
    expect(findMarkers(undefined)).toEqual([]);
  });
});

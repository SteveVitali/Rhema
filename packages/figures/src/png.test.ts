import { describe, it, expect } from "vitest";
import { renderPng2x, PNG_SCALE } from "./png.js";
import { renderFigure } from "./render.js";

const VL = {
  data: { values: [{ a: "x", b: 1 }, { a: "y", b: 3 }] },
  mark: "bar",
  encoding: { x: { field: "a", type: "nominal" }, y: { field: "b", type: "quantitative" } },
};

describe("renderPng2x (§7.5 lazy PNG@2x; §16.3 #8 — resvg, no canvas)", () => {
  it("is the 2× scale factor the spec names", () => {
    expect(PNG_SCALE).toBe(2);
  });

  it("rasterizes the LIGHT svg to PNG bytes (resvg binding present)", async () => {
    const res = await renderFigure({ specKind: "vega_lite", spec: VL });
    if (res.kind !== "rendered") throw new Error("expected rendered");
    const png = await renderPng2x(res.svg);
    // When the optional binding is absent the contract returns null — the §7.5 floor (SVG-only).
    if (png === null) return;
    expect(png.length).toBeGreaterThan(100);
    // PNG magic bytes.
    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it("is deterministic for identical input", async () => {
    const res = await renderFigure({ specKind: "vega_lite", spec: VL });
    if (res.kind !== "rendered") throw new Error("expected rendered");
    const [a, b] = [await renderPng2x(res.svg), await renderPng2x(res.svg)];
    if (a === null || b === null) return;
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});

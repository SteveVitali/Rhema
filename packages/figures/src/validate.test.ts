import { describe, it, expect } from "vitest";
import { validateVegaLiteSpec, MAX_SPEC_ATTEMPTS } from "./validate.js";

describe("validateVegaLiteSpec (§7.5; REQ-VIZ-6 — schema-validated, ≤3 retries)", () => {
  it("bounds spec retries at 3", () => {
    expect(MAX_SPEC_ATTEMPTS).toBe(3);
  });

  it("accepts a well-formed unit spec", () => {
    const res = validateVegaLiteSpec({
      data: { values: [{ a: "x", b: 1 }] },
      mark: "bar",
      encoding: { x: { field: "a", type: "nominal" }, y: { field: "b", type: "quantitative" } },
    });
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it("rejects a non-object spec", () => {
    expect(validateVegaLiteSpec("not json").ok).toBe(false);
    expect(validateVegaLiteSpec(null).ok).toBe(false);
    expect(validateVegaLiteSpec(42).ok).toBe(false);
  });

  it("names the missing mark for retry feedback", () => {
    const res = validateVegaLiteSpec({ data: { values: [] }, encoding: {} });
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toMatch(/mark/i);
  });

  it("names the missing data binding", () => {
    const res = validateVegaLiteSpec({ mark: "bar", encoding: { x: { field: "a", type: "nominal" } } });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => /data/i.test(e))).toBe(true);
  });

  it("names a missing encoding on a unit spec", () => {
    const res = validateVegaLiteSpec({ data: { values: [] }, mark: "point" });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => /encoding/i.test(e))).toBe(true);
  });

  it("surfaces the library's own message on a schema-invalid spec", () => {
    const res = validateVegaLiteSpec({
      data: { values: [] },
      mark: "not-a-real-mark",
      encoding: { x: { field: "a", type: "nominal" } },
    });
    expect(res.ok).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("accepts a layered/composed spec without a top-level mark", () => {
    const res = validateVegaLiteSpec({
      data: { values: [{ a: "x", b: 1 }] },
      layer: [
        { mark: "bar", encoding: { x: { field: "a", type: "nominal" }, y: { field: "b", type: "quantitative" } } },
      ],
    });
    expect(res.ok).toBe(true);
  });

  it("never mutates the input spec", () => {
    const spec = { data: { values: [] }, mark: "bar", encoding: { x: { field: "a", type: "nominal" } } };
    const frozen = JSON.stringify(spec);
    validateVegaLiteSpec(spec);
    expect(JSON.stringify(spec)).toBe(frozen);
  });
});

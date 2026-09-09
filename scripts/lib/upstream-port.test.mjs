import { describe, it, expect } from "vitest";
import { applyOp, applyOps, SANCTIONED_CATEGORIES, PortError } from "./upstream-port.mjs";

// Deterministic public coverage of the upstream-diff MECHANISM (P0.03 AC1; REQ-ARCH-5). The private
// manifest + real skills are diffed by scripts/check-upstream-diff.mjs in the private job; here we prove
// the applier only makes sanctioned, uniquely-anchored edits and rejects everything else.

const base = "line one\nline two\nline three\n";

describe("upstream-port applier (REQ-ARCH-5 sanctioned deltas)", () => {
  it("insertAfter inserts at the unique anchor", () => {
    const out = applyOp(base, {
      op: "insertAfter",
      anchor: "line two\n",
      insert: "INSERTED\n",
      category: "inputs",
    });
    expect(out).toBe("line one\nline two\nINSERTED\nline three\n");
  });

  it("replace swaps the unique block", () => {
    const out = applyOp(base, {
      op: "replace",
      find: "line two",
      replace: "LINE 2",
      category: "q11",
    });
    expect(out).toBe("line one\nLINE 2\nline three\n");
  });

  it("delete removes the unique block", () => {
    const out = applyOp("a\nDROP ME\nb\n", { op: "delete", find: "DROP ME\n", category: "q11" });
    expect(out).toBe("a\nb\n");
  });

  it("rejects an op whose category is not sanctioned", () => {
    expect(() =>
      applyOp(base, { op: "replace", find: "line one", replace: "x", category: "rewrite" }),
    ).toThrow(PortError);
  });

  it("fails when the anchor is not unique (would land ambiguously)", () => {
    expect(() =>
      applyOp("dup\ndup\n", { op: "insertAfter", anchor: "dup", insert: "x", category: "sidecar" }),
    ).toThrow(/found 2×/);
  });

  it("fails when the anchor is missing (would match nothing)", () => {
    expect(() => applyOp(base, { op: "delete", find: "nope", category: "q11" })).toThrow(
      /found 0×/,
    );
  });

  it("applies an ordered op list left to right", () => {
    const out = applyOps(base, [
      { op: "insertAfter", anchor: "line one\n", insert: "A\n", category: "inputs" },
      { op: "replace", find: "line three", replace: "LAST", category: "sidecar" },
    ]);
    expect(out).toBe("line one\nA\nline two\nLAST\n");
  });

  it("exposes exactly the five sanctioned categories", () => {
    expect([...SANCTIONED_CATEGORIES].sort()).toEqual(
      ["inputs", "persona-resolution", "phase-result", "q11", "sidecar"].sort(),
    );
  });
});

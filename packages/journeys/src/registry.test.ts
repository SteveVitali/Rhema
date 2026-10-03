import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STEP_REGISTRY, stepById } from "./registry.js";
import { STEP_IMPLS } from "./steps.js";

// JOURNEY.1 — the registry is THE deliverable-2 artifact: every planning-ledger step, an owner,
// an expected flag, and a wired implementation.

describe("the journey step registry", () => {
  it("carries every planning-ledger step id", () => {
    const ids = STEP_REGISTRY.map((s) => s.id).sort();
    expect(ids).toEqual(
      [
        // UX.1 added N10 (public copy/meta/showcase) + R8 (signed-in showcase/prefs/inbox).
        "C1", "N1", "N2", "N2.invite", "N3", "N4", "N5", "N6", "N7", "N8", "N9", "N10",
        // DEF.4 added R9 (the §14.4 refund-window leg — red until Stage B flips the flag).
        "P1", "R1", "R4", "R5", "R6", "R7", "R8", "R9", "X1",
      ].sort(),
    );
  });
  it("every step has an owner, an assertion, and an expected flag", () => {
    for (const s of STEP_REGISTRY) {
      expect(s.owner, s.id).toMatch(/^[A-Z0-9]+\.\d+$/);
      expect(s.asserts.length, s.id).toBeGreaterThan(10);
      expect(["red", "green"]).toContain(s.expected);
    }
  });
  it("the green baseline is {N2, R5} + carried greens {N7, R1, X1} + owner-flipped {N9 (BILL.3), N4 (EST.1), R6 (RPT.1), N5 + C1 (ACT.1), N1 + N3 (ONB.1), N8 (EDIT.1), R4 + R7 (RUN.1)} + UX.1's {N10, R8} + UX.2's {P1}", () => {
    const green = STEP_REGISTRY.filter((s) => s.expected === "green").map((s) => s.id).sort();
    expect(green).toEqual(
      // P1 flipped red→green on prod proof (UX.2 Stage B, nonce 4ff89a27d950 @6723784).
      ["C1", "N1", "N2", "N2.invite", "N3", "N4", "N5", "N7", "N8", "N9", "N10", "P1", "R1", "R4", "R5", "R6", "R7", "R8", "X1"].sort(),
    );
  });
  it("every registry row has a wired implementation", () => {
    for (const s of STEP_REGISTRY) {
      expect(STEP_IMPLS[s.id], s.id).toBeTypeOf("function");
    }
  });
  it("paid steps are exactly the paid legs (run/chat spend)", () => {
    const paid = STEP_REGISTRY.filter((s) => s.paid).map((s) => s.id).sort();
    // R9 is paid (two Quick/Base runs on the planted excerpt — the Stage-B evidence leg).
    expect(paid).toEqual(["N5", "N6", "R4", "R6", "R9"]);
  });
  it("stepById resolves", () => {
    expect(stepById("N7")?.owner).toBe("HOT.1");
    expect(stepById("nope")).toBeUndefined();
  });

  // Deliverable 2: "a test asserts every planning-ledger step id exists here with the same owner
  // (superset allowed)" — parse the ledger table itself so a ledger/registry drift fails here.
  it("every planning-ledger step id exists with the same owner", () => {
    const ledger = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../docs/build/planning/2026-09-30_planning-ledger.md",
      ),
      "utf8",
    );
    const section = ledger.split("## Journey step registry")[1] ?? "";
    const rows = [...section.matchAll(/^\|\s*([A-Z]\d+)\s*\|[^|]+\|[^|]+\|\s*([^|]+?)\s*\|$/gm)];
    expect(rows.length).toBeGreaterThanOrEqual(16); // N1–N9, R1/R4–R7, P1, C1, X1
    for (const [, id, ownerCell] of rows) {
      const owner = ownerCell.match(/[A-Z0-9]+\.\d+/)?.[0];
      const step = stepById(id);
      expect(step, `ledger step ${id} missing from the registry`).toBeDefined();
      expect(step!.owner, `ledger owner for ${id}`).toBe(owner);
    }
  });
});

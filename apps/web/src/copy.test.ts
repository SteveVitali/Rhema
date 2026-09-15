import { describe, it, expect } from "vitest";
import { lintCopy } from "@rhema/contracts";
import { collectCopyStrings } from "./copy.js";

// AC4 — the i18n string table lints green against Appendix D.2 (REQ-PROD-6 / REQ-BILL-18). This consumes
// P0.02's reserved-strings data via @rhema/contracts `lintCopy`, so the canonical vocabulary is enforced over
// the beta's copy from the first screen.

describe("copy vocabulary lint (Appendix D.2)", () => {
  it("the entire UI copy table is free of banned strings", () => {
    const violations = lintCopy(collectCopyStrings());
    expect(violations).toEqual([]);
  });

  it("collectCopyStrings walks every string leaf", () => {
    const pairs = collectCopyStrings();
    const keys = pairs.map(([k]) => k);
    expect(keys).toContain("brand");
    expect(keys).toContain("login.errorInvalid");
    expect(keys).toContain("dossier.contradictedTierOneLabel");
    // sanity: the lint would catch a banned word if one were introduced
    expect(lintCopy({ bad: "billed on-demand" }).length).toBeGreaterThan(0);
  });
});

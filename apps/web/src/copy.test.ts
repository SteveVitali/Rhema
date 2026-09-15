import { describe, it, expect } from "vitest";
import { lintCopy } from "@rhema/contracts";
import { collectCopyStrings } from "./copy.js";

// AC4 — the i18n string table lints green against Appendix D.2 (REQ-PROD-6 / REQ-BILL-18). This consumes
// P0.02's reserved-strings data via @rhema/contracts `lintCopy`, so the canonical vocabulary is enforced over
// the beta's copy from the first screen.

describe("copy vocabulary lint (Appendix D.2)", () => {
  it("the entire UI copy table is free of banned strings", () => {
    // "Advanced" is the ONE sanctioned Appendix D.2 exception the beta copy uses — the run sheet's
    // progressive-disclosure label (§6.5), used in exactly its permitted role. Every other banned/excepted
    // term (incl. "tokens") must still be absent.
    const violations = lintCopy(collectCopyStrings(), { allow: ["Advanced"] });
    expect(violations).toEqual([]);
    // and the sanctioned term is genuinely only the disclosure label (nowhere else, and never "tokens").
    expect(lintCopy(collectCopyStrings()).map((v) => v.term)).toEqual(["Advanced"]);
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

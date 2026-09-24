import { describe, it, expect } from "vitest";
import { lintCopy } from "@rhema/contracts";
import { collectCopyStrings } from "./copy.js";

// AC4 — the i18n string table lints green against Appendix D.2 (REQ-PROD-6 / REQ-BILL-18). This consumes
// P0.02's reserved-strings data via @rhema/contracts `lintCopy`, so the canonical vocabulary is enforced over
// the beta's copy from the first screen.

describe("copy vocabulary lint (Appendix D.2)", () => {
  it("the entire UI copy table is free of banned strings", () => {
    // Two sanctioned Appendix D.2 exceptions the beta copy uses: "Advanced" as the progressive-disclosure
    // label (§6.5; P1.05's report heading reuses the same role) and "tokens" ONLY under that disclosure
    // (§14.5's Level-4 drill-down columns). Every other banned/excepted term must still be absent.
    const violations = lintCopy(collectCopyStrings(), { allow: ["Advanced", "tokens"] });
    expect(violations).toEqual([]);
    // and each excepted term stays inside its sanctioned role — nowhere else in the table.
    for (const v of lintCopy(collectCopyStrings())) {
      if (v.term === "tokens") {
        expect(v.key.startsWith("report.advancedColumns.")).toBe(true);
      } else {
        expect(v.term).toBe("Advanced");
        // the §5.13 Files pane's Advanced disclosure (section label + the per-section "Show working"
        // disclosure) is the same sanctioned role as the run sheet's.
        expect([
          "runSheet.advanced",
          "report.advancedHeading",
          "files.sectionLabel.advanced",
          "files.advanced",
        ]).toContain(v.key);
      }
    }
  });

  it("PRB.13 — the open-mode signup copy is factual and lint-clean (REQ-POS-4/5/13)", () => {
    const keys = collectCopyStrings().map(([k]) => k);
    for (const k of [
      "invite.accessNoteOpen",
      "invite.signInCtaOpen",
      "login.noteOpen",
      "login.codeLabelOptional",
      "login.emailRequiredSelfServe",
      "login.errorRateLimited",
      "login.errorSignupUnavailable",
      "runSheet.emailUnverified",
    ]) {
      expect(keys).toContain(k);
    }
    // the §16.4 gate is still closed — efficacy/superiority phrasing is caught if introduced.
    expect(lintCopy({ bad: "writes like you — unlimited, better than Pro" }).length).toBeGreaterThan(0);
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
